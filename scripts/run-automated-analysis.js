#!/usr/bin/env node
/**
 * run-automated-analysis.js
 *
 * Automated Narrative Framework analysis for GitHub Actions.
 *
 * Reads stock data from data/stocks/, fetches live prices from Yahoo Finance,
 * runs the Dynamic Narrative Engine pipeline (price signals → survival scores →
 * narrative weighting → dislocation quantification), and writes
 * data/narrative-analysis.json for the frontend integration layer.
 *
 * Called by .github/workflows/narrative-analysis.yml on schedule (7am/7pm AEST)
 * and via manual workflow_dispatch.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// ─── Resolve paths relative to repo root ─────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const RULES_PATH = path.join(ROOT, 'data', 'config', 'price_rules.json');
const OUTPUT_PATH = path.join(ROOT, 'data', 'narrative-analysis.json');
const DNE_DIR = path.join(ROOT, 'js', 'dne');

// ─── Load DNE modules ────────────────────────────────────────────────────────
// The browser-side DNE modules use global variables to reference each other.
// We wire them together by placing exports on the Node.js global object
// before requiring dependent modules (JS resolves free vars at call time).

const evidence = require(path.join(DNE_DIR, 'evidence.js'));
Object.assign(global, evidence);

const engine = require(path.join(DNE_DIR, 'engine.js'));
Object.assign(global, engine);

const weightingModule = require(path.join(DNE_DIR, 'weighting.js'));
Object.assign(global, weightingModule);

const priceSignalsModule = require(path.join(DNE_DIR, 'price-signals.js'));
const { evaluatePriceSignals } = priceSignalsModule;

// ─── Yahoo Finance price fetch (Node.js native https) ───────────────────────

function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('JSON parse error: ' + data.slice(0, 200)));
        }
      });
    }).on('error', reject);
  });
}

async function fetchPriceData(ticker) {
  var yahooTicker = ticker.includes('.AX') ? ticker : ticker + '.AX';
  var url = 'https://query1.finance.yahoo.com/v8/finance/chart/' +
    encodeURIComponent(yahooTicker) + '?interval=1d&range=1mo';

  try {
    var data = await httpGet(url);
    var result = data.chart.result[0];
    var meta = result.meta;
    var quotes = result.indicators.quote[0];
    var closes = quotes.close.filter(function (c) { return c !== null; });
    var lastIdx = closes.length - 1;

    var prevClose = meta.chartPreviousClose || meta.previousClose || closes[lastIdx - 1];
    var currentPrice = meta.regularMarketPrice;
    var todayReturn = ((currentPrice - prevClose) / prevClose) * 100;

    // 5-day cumulative return
    var fiveDayIdx = Math.max(0, lastIdx - 5);
    var cumulative5day = (closes[lastIdx] - closes[fiveDayIdx]) / closes[fiveDayIdx];

    // Drawdown from 52-week high
    var high52w = meta.fiftyTwoWeekHigh;
    var drawdown = high52w ? ((currentPrice - high52w) / high52w) * 100 : 0;

    // Z-score over the available price window
    var mean = closes.reduce(function (a, b) { return a + b; }, 0) / closes.length;
    var variance = closes.reduce(function (sum, p) {
      return sum + Math.pow(p - mean, 2);
    }, 0) / closes.length;
    var stdDev = Math.sqrt(variance);
    var zScore = stdDev > 0 ? (currentPrice - mean) / stdDev : 0;

    return {
      current: currentPrice,
      previous_close: prevClose,
      open: quotes.open[quotes.open.length - 1],
      high_52w: meta.fiftyTwoWeekHigh,
      low_52w: meta.fiftyTwoWeekLow,
      volume: quotes.volume[quotes.volume.length - 1],
      avg_30day_volume: meta.averageDailyVolume10Day || 0,
      cumulative_5day_return: cumulative5day,
      earnings_surprise: null,
      // Extra fields for analysis output
      todayReturn: todayReturn,
      drawdownFromPeak: drawdown,
      zScore: zScore,
      closes: closes
    };
  } catch (err) {
    console.error('[Analysis] Price fetch failed for ' + ticker + ':', err.message);
    return null;
  }
}

// ─── Severity classification ─────────────────────────────────────────────────

function classifySeverity(dislocation, priceData) {
  if (!priceData) return 'NORMAL';

  var absZ = Math.abs(priceData.zScore);
  var absReturn = Math.abs(priceData.todayReturn);
  var maxDisBps = dislocation ? Math.abs(dislocation.max_dislocation_bps) : 0;

  if (absZ > 2.5 || absReturn > 8 || maxDisBps > 2000) return 'CRITICAL';
  if (absZ > 1.5 || absReturn > 4 || maxDisBps > 1000) return 'HIGH';
  if (absZ > 1.0 || absReturn > 2 || maxDisBps > 500) return 'MODERATE';
  return 'NORMAL';
}

// ─── Generate narrative shift commentary ─────────────────────────────────────

function generateNarrativeShift(stock, weightResult, priceData) {
  if (!weightResult || !weightResult.top_narrative) return { hasShift: false };

  var topNarr = weightResult.top_narrative;
  var dominant = stock.dominant;
  var hasInflection = topNarr.inflection;

  if (!hasInflection && stock.alert_state === 'NORMAL') {
    return { hasShift: false };
  }

  var dominantLabel = stock.hypotheses[dominant].label;
  var priceImpliedId = topNarr.top_narrative;
  var priceImpliedLabel = stock.hypotheses[priceImpliedId].label;

  return {
    hasShift: true,
    shortTermView:
      'Market price action (' +
      (priceData.todayReturn >= 0 ? '+' : '') + priceData.todayReturn.toFixed(1) +
      '% today, Z-score ' + priceData.zScore.toFixed(1) +
      ') implies ' + priceImpliedLabel + ' narrative is gaining traction. ' +
      'Signal strength: ' + topNarr.signal_strength +
      '% over ' + topNarr.dominant_window + '-day window.',
    longTermView:
      'Research-based evidence continues to support ' + dominantLabel +
      ' as the dominant thesis (survival score: ' +
      (stock.hypotheses[dominant].survival_score * 100).toFixed(0) + '%). ' +
      'The evidence matrix from ' + (stock.evidence_items || []).length +
      ' editorial items has not materially changed.',
    commentary: hasInflection
      ? 'Narrative inflection detected: price correlation has shifted from ' +
        topNarr.previous_top + ' to ' + topNarr.top_narrative + '. ' +
        'This may represent an early signal of changing market consensus ' +
        'that has not yet been confirmed by fundamental evidence.'
      : 'Elevated dislocation between price-implied and evidence-based narratives. ' +
        'Monitor for potential narrative flip if price action persists.'
  };
}

// ─── Compute blended weights for output ──────────────────────────────────────

function computeOutputWeights(stock, weightResult) {
  var weights = {};
  var ids = ['T1', 'T2', 'T3', 'T4'];

  var totalSurvival = ids.reduce(function (s, id) {
    return s + stock.hypotheses[id].survival_score;
  }, 0);

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var hyp = stock.hypotheses[id];
    var longTerm = totalSurvival > 0
      ? Math.round((hyp.survival_score / totalSurvival) * 100)
      : 25;

    var shortTerm = 25;
    if (weightResult && weightResult.hypothesis_weights &&
        weightResult.hypothesis_weights[id]) {
      shortTerm = weightResult.hypothesis_weights[id].signal_strength_pct || 25;
    }

    // Blended: 60% long-term research, 40% short-term market
    var blended = Math.round(longTerm * 0.6 + shortTerm * 0.4);

    weights[id] = {
      longTerm: longTerm,
      shortTerm: shortTerm,
      blended: blended,
      confidence: hyp.status
    };
  }

  return weights;
}

// ─── Find contradicted hypothesis ────────────────────────────────────────────

function findContradictedHypothesis(stock, weightResult) {
  if (!weightResult || !weightResult.hypothesis_weights) return null;

  var ids = ['T1', 'T2', 'T3', 'T4'];
  var totalSurvival = ids.reduce(function (s, id) {
    return s + stock.hypotheses[id].survival_score;
  }, 0);

  var maxDivergence = 0;
  var contradicted = null;

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var longTermPct = totalSurvival > 0
      ? (stock.hypotheses[id].survival_score / totalSurvival) * 100
      : 25;
    var shortTermPct = (weightResult.hypothesis_weights[id] &&
      weightResult.hypothesis_weights[id].signal_strength_pct) || 25;

    // Contradicted if research says strong but market says weak
    if (longTermPct > 30 && shortTermPct < 15) {
      var divergence = longTermPct - shortTermPct;
      if (divergence > maxDivergence) {
        maxDivergence = divergence;
        contradicted = id;
      }
    }
  }

  return contradicted;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[Analysis] Narrative Framework Analysis starting...');
  console.log('[Analysis] Time: ' + new Date().toISOString());

  // Read price rules
  var priceRules = [];
  try {
    priceRules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8')).price_evidence_rules;
    console.log('[Analysis] Loaded ' + priceRules.length + ' price evidence rules');
  } catch (e) {
    console.warn('[Analysis] Could not load price rules: ' + e.message);
  }

  // Read all stock files
  var stockFiles = fs.readdirSync(STOCKS_DIR).filter(function (f) {
    return f.endsWith('.json');
  });
  console.log('[Analysis] Found ' + stockFiles.length + ' stocks: ' +
    stockFiles.map(function (f) { return f.replace('.json', ''); }).join(', '));

  var results = {};
  var criticalCount = 0;
  var highCount = 0;

  for (var fi = 0; fi < stockFiles.length; fi++) {
    var file = stockFiles[fi];
    var ticker = file.replace('.json', '');
    console.log('\n[Analysis] Processing ' + ticker + '...');

    var stock = JSON.parse(fs.readFileSync(path.join(STOCKS_DIR, file), 'utf8'));

    // Ensure price_signals array exists
    if (!stock.price_signals) stock.price_signals = [];

    // Fetch live prices
    var priceData = await fetchPriceData(stock.ticker);
    if (!priceData) {
      console.warn('[Analysis] Skipping ' + ticker + ' — no price data');
      continue;
    }

    console.log('[Analysis] ' + ticker +
      ' — Price: A$' + priceData.current.toFixed(2) +
      ' | Today: ' + (priceData.todayReturn >= 0 ? '+' : '') +
      priceData.todayReturn.toFixed(2) + '%' +
      ' | Z-score: ' + priceData.zScore.toFixed(2));

    // Update price history
    if (!stock.price_history) stock.price_history = [];
    stock.price_history.push(priceData.current);
    if (stock.price_history.length > 25) {
      stock.price_history = stock.price_history.slice(-25);
    }

    // 1. Evaluate price signals → recalculate survival scores
    var signalData = {
      current: priceData.current,
      previous_close: priceData.previous_close,
      open: priceData.open,
      high_52w: priceData.high_52w,
      low_52w: priceData.low_52w,
      volume: priceData.volume,
      avg_30day_volume: priceData.avg_30day_volume,
      cumulative_5day_return: priceData.cumulative_5day_return,
      earnings_surprise: null
    };

    evaluatePriceSignals(stock, signalData, priceRules);

    // 2. Compute narrative weighting (price correlation analysis)
    var weightResult = null;
    if (stock.price_history.length > 3) {
      var prevTop = stock.weighting
        ? stock.weighting.top_narrative.top_narrative
        : null;
      weightResult = computeNarrativeWeighting(stock, stock.price_history, prevTop);
    }

    // 3. Classify dislocation severity
    var dislocation = weightResult ? weightResult.dislocation : null;
    var severity = classifySeverity(dislocation, priceData);

    if (severity === 'CRITICAL') criticalCount++;
    if (severity === 'HIGH') highCount++;

    // 4. Build output for this ticker
    var outputWeights = computeOutputWeights(stock, weightResult);
    var narrativeShift = generateNarrativeShift(stock, weightResult, priceData);
    var contradicted = findContradictedHypothesis(stock, weightResult);

    results[ticker] = {
      dislocation: {
        severity: severity,
        metrics: {
          currentPrice: priceData.current,
          todayReturn: priceData.todayReturn,
          drawdownFromPeak: priceData.drawdownFromPeak,
          zScore: priceData.zScore
        }
      },
      narrativeShift: narrativeShift,
      weights: outputWeights,
      hypothesisNames: {
        T1: stock.hypotheses.T1.label,
        T2: stock.hypotheses.T2.label,
        T3: stock.hypotheses.T3.label,
        T4: stock.hypotheses.T4.label
      },
      inference: {
        contradictedHypothesis: contradicted,
        dominantNarrative: stock.dominant,
        alertState: stock.alert_state
      }
    };

    console.log('[Analysis] ' + ticker +
      ' — Severity: ' + severity +
      ' | Dominant: ' + stock.dominant +
      ' | Alert: ' + stock.alert_state);

    // Save updated stock data back (with new price signals and history)
    fs.writeFileSync(
      path.join(STOCKS_DIR, file),
      JSON.stringify(stock, null, 2)
    );
  }

  // Write narrative-analysis.json
  var output = {
    generated: new Date().toISOString(),
    summary: {
      totalStocks: Object.keys(results).length,
      criticalDislocations: criticalCount,
      highDislocations: highCount
    },
    results: results
  };

  var outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log('\n[Analysis] Written: ' + OUTPUT_PATH);
  console.log('[Analysis] Summary: ' + criticalCount + ' critical, ' +
    highCount + ' high dislocations out of ' +
    Object.keys(results).length + ' stocks');

  // Commit and push results (for GitHub Actions CI)
  if (process.env.GITHUB_ACTIONS) {
    try {
      execSync('git config user.name "Narrative Analysis Bot"');
      execSync('git config user.email "analysis@continuum-intelligence.dev"');
      execSync('git add data/narrative-analysis.json data/stocks/');

      var diffOutput = '';
      try {
        execSync('git diff --cached --quiet');
      } catch (_e) {
        diffOutput = 'changes';
      }

      if (diffOutput === 'changes') {
        var commitMsg = 'Narrative analysis: ' + criticalCount + ' critical, ' +
          highCount + ' high [' + new Date().toISOString() + ']';
        execSync('git commit -m "' + commitMsg + '"');
        execSync('git push');
        console.log('[Analysis] Results committed and pushed.');
      } else {
        console.log('[Analysis] No changes to commit.');
      }
    } catch (e) {
      console.error('[Analysis] Git commit/push failed: ' + e.message);
      process.exit(1);
    }
  } else {
    console.log('[Analysis] Not in CI — skipping git commit.');
  }
}

main().catch(function (err) {
  console.error('[Analysis] Fatal error:', err);
  process.exit(1);
});
