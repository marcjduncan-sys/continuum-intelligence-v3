#!/usr/bin/env node
/**
 * calc-valuation-range.js
 *
 * Daily pipeline step — computes and stores valuation ranges for all stocks.
 * Run after calc-composite-sentiment.js so three_layer_signal is current.
 *
 * Outputs written to data/stocks/TICKER.json:
 *   - valuation_range        (Components 2–6 composite)
 *   - forecast_valuation     (Component 5 — Claude API forecast agent)
 *
 * Usage:
 *   node scripts/calc-valuation-range.js [--ticker WOW] [--skip-agent]
 *
 * Env:
 *   ANTHROPIC_API_KEY  — required for forecast agent (--skip-agent bypasses it)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

const STOCKS_DIR   = path.join(__dirname, '..', 'data', 'stocks');
const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');

const args = process.argv.slice(2);
const SINGLE_TICKER = (() => {
  const i = args.indexOf('--ticker');
  return i !== -1 ? args[i + 1] : null;
})();
const SKIP_AGENT = args.includes('--skip-agent');

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!SKIP_AGENT && !API_KEY) {
  console.warn('[WARN] ANTHROPIC_API_KEY not set — running with --skip-agent mode');
}

// ─── Percentile helper ────────────────────────────────────────────────────────
function pct(sorted, p) {
  if (!sorted || sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

// ─── Component 2: Historical multiple range ───────────────────────────────────
function calculateHistoricalRange(prices, anchors) {
  if (!prices || prices.length < 20) return null;

  const primary = anchors.primary_multiple;

  // Derive implied multiple for each price point
  const multiples = [];
  for (let i = 0; i < prices.length; i++) {
    const p = typeof prices[i] === 'object' ? prices[i].price : prices[i];
    if (!p || p <= 0) continue;

    let m = null;
    if (primary === 'pe_forward' && anchors.eps_forward) {
      m = p / anchors.eps_forward.value;
    } else if (primary === 'pe_trailing' && anchors.eps_trailing) {
      m = p / anchors.eps_trailing.value;
    } else if (primary === 'pb' && anchors.book_value_per_share) {
      m = p / anchors.book_value_per_share.value;
    } else if (primary === 'ev_ebitda' && anchors.ebitda_forward && anchors.shares_outstanding) {
      const ev = (p * anchors.shares_outstanding) + (anchors.net_debt || 0);
      m = ev / anchors.ebitda_forward.value;
    } else if (primary === 'ev_revenue' && anchors.revenue_forward && anchors.shares_outstanding) {
      const ev = (p * anchors.shares_outstanding) + (anchors.net_debt || 0);
      m = ev / anchors.revenue_forward.value;
    }

    if (m !== null && isFinite(m) && m > 0) multiples.push(m);
  }

  if (multiples.length < 10) return null;

  const sorted = [...multiples].sort((a, b) => a - b);

  return {
    p10: pct(sorted, 0.10),
    p25: pct(sorted, 0.25),
    p50: pct(sorted, 0.50),
    p75: pct(sorted, 0.75),
    p90: pct(sorted, 0.90),
    current: multiples[multiples.length - 1],
    multiple_type: primary,
    sample_size: multiples.length
  };
}

// ─── Component 2b: Multiple → price conversion ────────────────────────────────
function multipleToPrice(multiple, anchors) {
  const primary = anchors.primary_multiple;
  if (primary === 'pe_forward' && anchors.eps_forward) {
    return multiple * anchors.eps_forward.value;
  }
  if (primary === 'pe_trailing' && anchors.eps_trailing) {
    return multiple * anchors.eps_trailing.value;
  }
  if (primary === 'pb' && anchors.book_value_per_share) {
    return multiple * anchors.book_value_per_share.value;
  }
  if (primary === 'ev_ebitda' && anchors.ebitda_forward && anchors.shares_outstanding) {
    const ev = multiple * anchors.ebitda_forward.value;
    return (ev - (anchors.net_debt || 0)) / anchors.shares_outstanding;
  }
  if (primary === 'ev_revenue' && anchors.revenue_forward && anchors.shares_outstanding) {
    const ev = multiple * anchors.revenue_forward.value;
    return (ev - (anchors.net_debt || 0)) / anchors.shares_outstanding;
  }
  return null;
}

function multiplesToPriceRange(multipleRange, anchors) {
  if (!multipleRange) return null;
  const low     = multipleToPrice(multipleRange.p10, anchors);
  const lowMid  = multipleToPrice(multipleRange.p25, anchors);
  const mid     = multipleToPrice(multipleRange.p50, anchors);
  const highMid = multipleToPrice(multipleRange.p75, anchors);
  const high    = multipleToPrice(multipleRange.p90, anchors);
  if (!low || !mid || !high) return null;
  return { low, low_mid: lowMid, mid, high_mid: highMid, high };
}

// ─── Component 3: Relative benchmark ─────────────────────────────────────────
function calculateRelativeBenchmark(currentMultiple, anchors) {
  const primary = anchors.primary_multiple;
  const sectorM  = anchors.sector_multiples  && anchors.sector_multiples[primary];
  const marketM  = anchors.market_multiples  && anchors.market_multiples[primary];
  if (!sectorM || !marketM || !currentMultiple) return null;

  const blendedMedian = (sectorM.median * 0.80) + (marketM.median * 0.20);
  const blendedP25    = (sectorM.p25    * 0.80) + (marketM.p25    * 0.20);
  const blendedP75    = (sectorM.p75    * 0.80) + (marketM.p75    * 0.20);
  const premiumDiscount = ((currentMultiple / blendedMedian) - 1) * 100;

  return {
    blended_median:        round2(blendedMedian),
    blended_p25:           round2(blendedP25),
    blended_p75:           round2(blendedP75),
    current_multiple:      round2(currentMultiple),
    premium_discount_pct:  round2(premiumDiscount),
    mean_reversion_force:  round2(-premiumDiscount),
    multiple_type:         primary
  };
}

// ─── Component 4: Hypothesis-driven re-rating ────────────────────────────────
function calculateHypothesisAdjustment(companySignal, historicalPriceRange) {
  if (!historicalPriceRange || companySignal === null || companySignal === undefined) return null;

  const mid            = historicalPriceRange.mid;
  const reRatingPct    = (companySignal / 80) * 0.30;
  const centreShift    = mid * reRatingPct;
  const absSignal      = Math.abs(companySignal);
  const widthMultiplier = 1.0 - (absSignal / 80) * 0.30;
  const historicalWidth = historicalPriceRange.high - historicalPriceRange.low;
  const adjustedWidth   = historicalWidth * widthMultiplier;
  const adjustedMid     = mid + centreShift;

  return {
    centre_shift:       round2(centreShift),
    centre_shift_pct:   round2(reRatingPct * 100),
    width_multiplier:   round2(widthMultiplier),
    adjusted_low:       round2(adjustedMid - adjustedWidth / 2),
    adjusted_mid:       round2(adjustedMid),
    adjusted_high:      round2(adjustedMid + adjustedWidth / 2),
    company_signal:     companySignal
  };
}

// ─── Component 6: Composite range assembly ────────────────────────────────────
function assembleValuationRange(hypothesisAdj, forecastData, historicalPriceRange, currentPrice) {
  // Use forecast agent output as primary (if available); fall back to hypothesis-adjusted range
  let low, fairLow, fairHigh, high;

  if (forecastData && forecastData.bear_case && forecastData.base_case && forecastData.bull_case) {
    low      = forecastData.bear_case.implied_price;
    fairLow  = forecastData.base_case.implied_price_low;
    fairHigh = forecastData.base_case.implied_price_high;
    high     = forecastData.bull_case.implied_price;
  } else if (hypothesisAdj) {
    // Symmetrical fair band around adjusted mid (±15% of adjusted range width)
    const halfBand = (hypothesisAdj.adjusted_high - hypothesisAdj.adjusted_low) * 0.20;
    low      = hypothesisAdj.adjusted_low;
    fairLow  = hypothesisAdj.adjusted_mid - halfBand;
    fairHigh = hypothesisAdj.adjusted_mid + halfBand;
    high     = hypothesisAdj.adjusted_high;
  } else if (historicalPriceRange) {
    // Last resort: raw historical price percentiles
    low      = historicalPriceRange.low;
    fairLow  = historicalPriceRange.low_mid;
    fairHigh = historicalPriceRange.high_mid;
    high     = historicalPriceRange.high;
  } else {
    return null;
  }

  // Determine zone
  let zone, zoneLabel;
  if (currentPrice > high) {
    zone = 'DEEP_RED'; zoneLabel = 'Significantly above valuation range';
  } else if (currentPrice > fairHigh) {
    zone = 'RED';      zoneLabel = 'Above fair value – downside skew';
  } else if (currentPrice < low) {
    zone = 'DEEP_GREEN'; zoneLabel = 'Significantly below valuation range';
  } else if (currentPrice < fairLow) {
    zone = 'GREEN';    zoneLabel = 'Below fair value – upside skew';
  } else {
    zone = 'AMBER';    zoneLabel = 'Within fair value range';
  }

  const midpoint   = (fairLow + fairHigh) / 2;
  const rangeWidth = high - low;
  const skewPct    = rangeWidth > 0 ? ((currentPrice - midpoint) / rangeWidth) * 100 : 0;

  return {
    low:      round2(low),
    fair_low: round2(fairLow),
    fair_high: round2(fairHigh),
    high:     round2(high),
    current_price:             round2(currentPrice),
    zone,
    zone_label:                zoneLabel,
    skew_pct:                  round2(skewPct),
    upside_to_fair_high:       round2(((fairHigh / currentPrice) - 1) * 100),
    downside_to_fair_low:      round2(((fairLow  / currentPrice) - 1) * 100),
    upside_to_bull:            round2(((high     / currentPrice) - 1) * 100),
    downside_to_bear:          round2(((low      / currentPrice) - 1) * 100),
    source: forecastData ? 'forecast_agent' : (hypothesisAdj ? 'hypothesis_adjusted' : 'historical_only'),
    generated_at: new Date().toISOString()
  };
}

// ─── Component 5: Forecast agent (Claude API) ─────────────────────────────────
function buildForecastPrompt(ticker, stockData, anchors, multipleRange, relativeBenchmark, hypAdj, currentPrice) {
  const primary = anchors.primary_multiple;
  const sectorM = anchors.sector_multiples && anchors.sector_multiples[primary];
  const sectorMedian = sectorM ? sectorM.median : 'n/a';
  const premDisc = relativeBenchmark ? relativeBenchmark.premium_discount_pct.toFixed(1) + '%' : 'n/a';

  const tls = stockData.three_layer_signal || {};
  const companySignal = tls.company_signal !== undefined ? tls.company_signal : 0;
  const dominantKey = Object.keys(stockData.hypotheses || {}).sort((a, b) => {
    const ha = stockData.hypotheses[a];
    const hb = stockData.hypotheses[b];
    return (hb.survival_score || 0) - (ha.survival_score || 0);
  })[0];
  const dominant = dominantKey && stockData.hypotheses[dominantKey];
  const dominantName      = dominant ? dominant.label : 'Unknown';
  const dominantSentiment = stockData.risk_skew || 'NEUTRAL';
  const dominantScore     = dominant ? Math.round((dominant.survival_score || 0) * 100) : 0;

  let anchorLines = '';
  if (anchors.eps_forward)   anchorLines += `EPS fwd A$${anchors.eps_forward.value} (${anchors.eps_forward.period})\n`;
  if (anchors.eps_trailing)  anchorLines += `EPS trailing A$${anchors.eps_trailing.value} (${anchors.eps_trailing.period})\n`;
  if (anchors.ebitda_forward) anchorLines += `EBITDA fwd A$${anchors.ebitda_forward.value}M (${anchors.ebitda_forward.period})\n`;
  if (anchors.book_value_per_share) anchorLines += `BVPS A$${anchors.book_value_per_share.value}\n`;
  if (anchors.revenue_forward) anchorLines += `Revenue fwd A$${anchors.revenue_forward.value}M (${anchors.revenue_forward.period})\n`;

  const rangeLines = multipleRange
    ? `${primary} P10=${multipleRange.p10.toFixed(1)} / P25=${multipleRange.p25.toFixed(1)} / P50=${multipleRange.p50.toFixed(1)} / P75=${multipleRange.p75.toFixed(1)} / P90=${multipleRange.p90.toFixed(1)}`
    : 'Insufficient price history for historical range';

  const adjLines = hypAdj
    ? `Bear A$${hypAdj.adjusted_low} / Mid A$${hypAdj.adjusted_mid} / Bull A$${hypAdj.adjusted_high}`
    : 'n/a';

  return `You are a quantitative equity analyst producing a forward valuation range for ${ticker}.AX.

INPUTS:
- Current price: A$${currentPrice}
- Primary valuation multiple: ${primary}
- 3-year historical ${primary} range: ${rangeLines}
- Current ${primary}: ${multipleRange ? multipleRange.current.toFixed(1) : 'n/a'}
- Sector median ${primary}: ${sectorMedian}x (80% sector / 20% ASX 200)
- Premium/discount to sector: ${premDisc}
- Hypothesis-adjusted price range: ${adjLines}
- Dominant hypothesis: ${dominantName} (${dominantSentiment}, ${dominantScore}% survival)
- Company Signal: ${companySignal} (${companySignal > 0 ? 'net bullish' : companySignal < 0 ? 'net bearish' : 'neutral'})
- Financial anchors:
${anchorLines || '  (limited data available)\n'}
TASK:
Produce a 12-month forward valuation range with three scenarios:

1. BEAR CASE: Dominant bearish hypothesis plays out. What multiple? What price?
2. BASE CASE: Current hypothesis balance holds. Probability-weighted fair value range.
3. BULL CASE: Dominant bullish hypothesis plays out. What multiple re-rating? What price?

CONSTRAINTS:
- Use the primary multiple (${primary}) for all scenarios
- Bear case multiple not below 3yr P10 unless structural de-rating is clearly justified
- Bull case multiple not above 1.5x 3yr P90 unless structural re-rating is justified
- If historical range is unavailable, use sector median range as the anchor
- Base case probability-weighted by hypothesis survival scores, not simple average
- All prices in AUD
- Probability of bear + base + bull must sum to 100

RESPOND IN EXACTLY THIS JSON FORMAT — no markdown, no explanation, JSON only:
{
  "bear_case": {
    "multiple": 0.0,
    "implied_price": 0.00,
    "probability": 0,
    "conviction": "HIGH",
    "rationale": "One sentence."
  },
  "base_case": {
    "multiple_low": 0.0,
    "multiple_high": 0.0,
    "implied_price_low": 0.00,
    "implied_price_high": 0.00,
    "probability": 0,
    "conviction": "MEDIUM",
    "rationale": "One sentence."
  },
  "bull_case": {
    "multiple": 0.0,
    "implied_price": 0.00,
    "probability": 0,
    "conviction": "LOW",
    "rationale": "One sentence."
  },
  "range_width_interpretation": "MODERATE",
  "key_catalyst": "One sentence on the single most diagnostic upcoming event."
}`;
}

function callAnthropicAPI(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path:     '/v1/messages',
      method:   'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length':    Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', d => { data += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          return reject(new Error(`API ${res.statusCode}: ${data.slice(0, 200)}`));
        }
        try {
          const parsed = JSON.parse(data);
          const text = (parsed.content || []).map(c => c.text || '').join('');
          const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
          resolve(JSON.parse(clean));
        } catch (e) {
          reject(new Error('Failed to parse API response: ' + e.message));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ─── Main processing per ticker ───────────────────────────────────────────────
async function processStock(tickerBase) {
  const stockFile    = path.join(STOCKS_DIR,   tickerBase + '.json');
  const researchFile = path.join(RESEARCH_DIR, tickerBase + '.json');

  if (!fs.existsSync(stockFile)) {
    console.log(`[SKIP] ${tickerBase}: no stock file`);
    return;
  }

  let stockData;
  try {
    stockData = JSON.parse(fs.readFileSync(stockFile, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] ${tickerBase}: cannot read stock file — ${e.message}`);
    return;
  }

  const anchors = stockData.valuation_anchors;
  if (!anchors) {
    console.log(`[SKIP] ${tickerBase}: no valuation_anchors — run seed-valuation-anchors.js first`);
    return;
  }

  // ── Load price history (research file preferred; fall back to stock file)
  let prices = [];
  if (fs.existsSync(researchFile)) {
    try {
      const rData = JSON.parse(fs.readFileSync(researchFile, 'utf8'));
      if (Array.isArray(rData.priceHistory) && rData.priceHistory.length > 0) {
        prices = rData.priceHistory;
      }
    } catch (_) { /* ignore */ }
  }
  // Fall back to stock file priceHistory
  if (prices.length < 20 && Array.isArray(stockData.priceHistory) && stockData.priceHistory.length > 0) {
    prices = stockData.priceHistory;
  }
  // Also use price_history (older format, short array of recent daily prices)
  if (prices.length < 20 && Array.isArray(stockData.price_history) && stockData.price_history.length > 0) {
    prices = prices.length > 0 ? prices : stockData.price_history;
  }

  // ── Current price
  const currentPrice = stockData._livePrice || stockData.current_price || (prices.length > 0 ? prices[prices.length - 1] : null);
  if (!currentPrice) {
    console.log(`[SKIP] ${tickerBase}: no current price`);
    return;
  }

  const tls           = stockData.three_layer_signal || {};
  const companySignal = tls.company_signal !== undefined ? tls.company_signal : 0;

  // ── Component 2: historical multiple range
  const multipleRange = calculateHistoricalRange(prices, anchors);
  const historicalPriceRange = multiplesToPriceRange(multipleRange, anchors);

  // ── Component 3: relative benchmark
  const relativeBenchmark = multipleRange
    ? calculateRelativeBenchmark(multipleRange.current, anchors)
    : null;

  // ── Component 4: hypothesis adjustment
  const hypAdj = calculateHypothesisAdjustment(companySignal, historicalPriceRange);

  // ── Component 5: forecast agent
  let forecastData = null;
  const canCallAgent = !SKIP_AGENT && API_KEY;
  if (canCallAgent) {
    try {
      const prompt = buildForecastPrompt(
        tickerBase, stockData, anchors,
        multipleRange, relativeBenchmark, hypAdj, currentPrice
      );
      forecastData = await callAnthropicAPI(prompt);
      console.log(`[AGENT] ${tickerBase}: forecast generated (base: A$${forecastData.base_case.implied_price_low}–A$${forecastData.base_case.implied_price_high})`);
      await sleep(1200); // rate limit buffer
    } catch (e) {
      console.warn(`[WARN] ${tickerBase}: forecast agent failed — ${e.message.slice(0, 80)}`);
    }
  }

  // ── Component 6: assemble composite range
  const compositeRange = assembleValuationRange(hypAdj, forecastData, historicalPriceRange, currentPrice);

  if (!compositeRange) {
    console.log(`[SKIP] ${tickerBase}: insufficient data to produce valuation range`);
    return;
  }

  // ── Attach diagnostics
  compositeRange.diagnostics = {
    price_history_points:   prices.length,
    multiple_range:         multipleRange,
    historical_price_range: historicalPriceRange,
    relative_benchmark:     relativeBenchmark,
    hypothesis_adjustment:  hypAdj
  };

  // ── Write back to stock JSON
  stockData.valuation_range = compositeRange;
  if (forecastData) {
    stockData.forecast_valuation = Object.assign({
      generated_at:    new Date().toISOString(),
      primary_multiple: anchors.primary_multiple
    }, forecastData);
  }

  fs.writeFileSync(stockFile, JSON.stringify(stockData, null, 2), 'utf8');
  console.log(`[OK] ${tickerBase}: zone=${compositeRange.zone} price=A$${currentPrice} fair=A$${compositeRange.fair_low}–A$${compositeRange.fair_high}`);
}

// ─── Discover tickers ─────────────────────────────────────────────────────────
async function main() {
  let tickers;
  if (SINGLE_TICKER) {
    tickers = [SINGLE_TICKER.replace(/\.AX$/i, '')];
  } else {
    tickers = fs.readdirSync(STOCKS_DIR)
      .filter(f => /^[A-Z]+\.json$/.test(f) && !f.includes('-history'))
      .map(f => f.replace('.json', ''));
  }

  console.log(`Processing ${tickers.length} stocks...`);
  for (const ticker of tickers) {
    try {
      await processStock(ticker);
    } catch (e) {
      console.error(`[ERROR] ${ticker}: ${e.message}`);
    }
  }
  console.log('\nValuation range calculation complete.');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
