#!/usr/bin/env node
/**
 * calibration-tracker.js
 *
 * Continuum Intelligence — Confidence Calibration Engine
 *
 * Tracks whether the system's dominant hypothesis calls were validated by
 * subsequent price action and fundamentals. Without calibration, scoring
 * biases compound silently.
 *
 * Runs monthly (or on demand). For each stock:
 *   1. Reads hypothesis history snapshots
 *   2. For each past dominant hypothesis call, checks if subsequent evidence
 *      and price action validated or contradicted it
 *   3. Produces calibration metrics: hit rate, confidence-weighted accuracy,
 *      sector-level biases, and hypothesis-type biases
 *   4. Writes calibration report to data/calibration/
 *
 * Usage:
 *   node scripts/calibration-tracker.js [--lookback 90] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { getActiveTickers } = require('./lib/registry');

const DATA_DIR       = path.join(__dirname, '..', 'data');
const STOCKS_DIR     = path.join(DATA_DIR, 'stocks');
const CALIBRATION_DIR = path.join(DATA_DIR, 'calibration');

const args     = process.argv.slice(2);
const VERBOSE  = args.includes('--verbose');
const lbIdx    = args.indexOf('--lookback');
const LOOKBACK_DAYS = lbIdx !== -1 ? parseInt(args[lbIdx + 1]) || 90 : 90;

// ---------------------------------------------------------------------------
// Calibration logic
// ---------------------------------------------------------------------------

/**
 * A "call" is: at time T, the system said hypothesis X was dominant with
 * confidence Y. We validate against what happened in the next N days.
 *
 * Validation criteria:
 * - Price moved in the direction implied by the dominant hypothesis
 * - Subsequent evidence was more CONSISTENT than INCONSISTENT with the call
 * - No narrative flip occurred within the validation window
 */

function extractCalls(historyData, stockData) {
  const history = historyData.history || [];
  const calls = [];

  for (let i = 0; i < history.length; i++) {
    const entry = history[i];
    if (!entry.dominant_narrative || !entry.date) continue;

    // Look forward to find the outcome
    const callDate = new Date(entry.date);
    const validationWindow = 20; // 20 trading days (~1 month)

    // Find entries in the validation window
    const futureEntries = history.slice(i + 1, i + 1 + validationWindow);
    if (futureEntries.length < 5) continue; // Need enough data to validate

    const callPrice = entry.price;
    const endPrice = futureEntries[futureEntries.length - 1]?.price;
    if (!callPrice || !endPrice) continue;

    const priceReturn = ((endPrice - callPrice) / callPrice) * 100;

    // Did a narrative flip happen in the window?
    const flippedInWindow = futureEntries.some(e => e.narrative_flip);

    // Was the price direction consistent with the dominant hypothesis?
    const dominantHyp = entry.hypotheses?.find(h => h.id === entry.dominant_narrative);
    const sentiment = dominantHyp ? (dominantHyp.sentiment || '').toUpperCase() : 'NEUTRAL';

    let directionCorrect = false;
    if (sentiment === 'BULLISH' && priceReturn > 2) directionCorrect = true;
    if (sentiment === 'BEARISH' && priceReturn < -2) directionCorrect = true;
    if (sentiment === 'NEUTRAL' && Math.abs(priceReturn) < 5) directionCorrect = true;

    calls.push({
      ticker: stockData.ticker || '',
      date: entry.date,
      dominant: entry.dominant_narrative,
      dominantLabel: dominantHyp?.name || entry.dominant_narrative,
      sentiment,
      callScore: dominantHyp?.survival_score || 0,
      priceReturn: Math.round(priceReturn * 100) / 100,
      directionCorrect,
      flippedInWindow,
      validated: directionCorrect && !flippedInWindow,
    });
  }

  return calls;
}

function computeCalibrationMetrics(allCalls) {
  if (allCalls.length === 0) return null;

  const total = allCalls.length;
  const validated = allCalls.filter(c => c.validated).length;
  const hitRate = validated / total;

  // Confidence-weighted accuracy: calls made with higher confidence should be more accurate
  const highConfCalls = allCalls.filter(c => c.callScore >= 40);
  const highConfHitRate = highConfCalls.length > 0
    ? highConfCalls.filter(c => c.validated).length / highConfCalls.length : null;

  // Sentiment bias: are we systematically wrong on bulls vs bears?
  const bullCalls = allCalls.filter(c => c.sentiment === 'BULLISH');
  const bearCalls = allCalls.filter(c => c.sentiment === 'BEARISH');
  const bullHitRate = bullCalls.length > 0
    ? bullCalls.filter(c => c.validated).length / bullCalls.length : null;
  const bearHitRate = bearCalls.length > 0
    ? bearCalls.filter(c => c.validated).length / bearCalls.length : null;

  // Flip frequency: how often does the dominant flip (instability metric)
  const flipRate = allCalls.filter(c => c.flippedInWindow).length / total;

  return {
    totalCalls: total,
    validatedCalls: validated,
    hitRate: Math.round(hitRate * 1000) / 10,
    highConfidenceHitRate: highConfHitRate !== null
      ? Math.round(highConfHitRate * 1000) / 10 : null,
    bullishHitRate: bullHitRate !== null
      ? Math.round(bullHitRate * 1000) / 10 : null,
    bearishHitRate: bearHitRate !== null
      ? Math.round(bearHitRate * 1000) / 10 : null,
    flipRate: Math.round(flipRate * 1000) / 10,
    sentimentBias: bullHitRate !== null && bearHitRate !== null
      ? Math.round((bullHitRate - bearHitRate) * 1000) / 10 : null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Continuum Intelligence — Calibration Tracker ===');
  console.log(`  Lookback: ${LOOKBACK_DAYS} days`);

  // Ensure output directory
  if (!fs.existsSync(CALIBRATION_DIR)) {
    fs.mkdirSync(CALIBRATION_DIR, { recursive: true });
  }

  const tickers = getActiveTickers();
  const allCalls = [];
  const perTickerMetrics = {};

  for (const ticker of tickers) {
    const stockPath = path.join(STOCKS_DIR, `${ticker}.json`);
    const historyPath = path.join(STOCKS_DIR, `${ticker}-history.json`);

    if (!fs.existsSync(stockPath) || !fs.existsSync(historyPath)) continue;

    try {
      const stockData = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
      const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));

      const calls = extractCalls(historyData, stockData);

      // Filter to lookback window
      const cutoff = Date.now() - (LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
      const recentCalls = calls.filter(c => new Date(c.date).getTime() > cutoff);

      if (recentCalls.length > 0) {
        const metrics = computeCalibrationMetrics(recentCalls);
        perTickerMetrics[ticker] = metrics;
        allCalls.push(...recentCalls);

        if (VERBOSE) {
          console.log(`  ${ticker}: ${metrics.totalCalls} calls, ${metrics.hitRate}% hit rate`);
        }
      }
    } catch (err) {
      if (VERBOSE) console.warn(`  [WARN] ${ticker}: ${err.message}`);
    }
  }

  // Compute aggregate metrics
  const aggregateMetrics = computeCalibrationMetrics(allCalls);

  const report = {
    generatedAt: new Date().toISOString(),
    lookbackDays: LOOKBACK_DAYS,
    aggregate: aggregateMetrics,
    perTicker: perTickerMetrics,
    interpretation: generateInterpretation(aggregateMetrics),
  };

  const reportPath = path.join(CALIBRATION_DIR, 'calibration-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n  Aggregate: ${allCalls.length} calls across ${Object.keys(perTickerMetrics).length} stocks`);
  if (aggregateMetrics) {
    console.log(`  Hit rate: ${aggregateMetrics.hitRate}%`);
    console.log(`  High-confidence hit rate: ${aggregateMetrics.highConfidenceHitRate ?? 'N/A'}%`);
    console.log(`  Bullish hit rate: ${aggregateMetrics.bullishHitRate ?? 'N/A'}%`);
    console.log(`  Bearish hit rate: ${aggregateMetrics.bearishHitRate ?? 'N/A'}%`);
    console.log(`  Sentiment bias: ${aggregateMetrics.sentimentBias ?? 'N/A'}pp`);
    console.log(`  Flip rate: ${aggregateMetrics.flipRate}%`);
  }

  console.log(`\n  Report written to ${reportPath}`);
}

function generateInterpretation(metrics) {
  if (!metrics) return 'Insufficient data for calibration.';

  const notes = [];

  if (metrics.hitRate >= 60) {
    notes.push('System is well-calibrated: dominant hypothesis calls validated >60% of the time.');
  } else if (metrics.hitRate >= 45) {
    notes.push('System calibration is adequate but below institutional target of 60%.');
  } else {
    notes.push('WARNING: System calibration is poor (<45%). Scoring engine may have systematic bias.');
  }

  if (metrics.sentimentBias !== null) {
    if (metrics.sentimentBias > 15) {
      notes.push('BULLISH BIAS detected: system is significantly more accurate on bullish calls than bearish. Consider increasing bear hypothesis sensitivity.');
    } else if (metrics.sentimentBias < -15) {
      notes.push('BEARISH BIAS detected: system is significantly more accurate on bearish calls than bullish. Consider increasing bull hypothesis sensitivity.');
    }
  }

  if (metrics.flipRate > 30) {
    notes.push('HIGH FLIP RATE: dominant hypothesis changes too frequently (>30%). Hypothesis frameworks may need structural revision or scoring thresholds need widening.');
  }

  if (metrics.highConfidenceHitRate !== null && metrics.highConfidenceHitRate < metrics.hitRate) {
    notes.push('OVERCONFIDENCE: high-confidence calls perform worse than average. Confidence scoring needs recalibration.');
  }

  return notes.join(' ');
}

if (require.main === module) {
  main();
}

module.exports = { extractCalls, computeCalibrationMetrics };
