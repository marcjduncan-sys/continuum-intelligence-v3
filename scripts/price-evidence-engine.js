#!/usr/bin/env node
/**
 * price-evidence-engine.js
 *
 * Continuum Intelligence — Daily Price-as-Evidence Engine
 * Per NARRATIVE_FRAMEWORK_V3.md Principle 3
 *
 * Runs after prices are updated. For each stock:
 *   1. Classifies daily price move (NOISE/NOTABLE/SIGNIFICANT/MATERIAL)
 *   2. Applies volume confirmation multiplier (when data available)
 *   3. Evaluates price evidence against each hypothesis
 *   4. Detects cumulative multi-day moves (5-day, 20-day)
 *   5. Detects results-day amplification
 *   6. Updates survival scores in stocks/*.json
 *
 * Usage:
 *   node scripts/price-evidence-engine.js [--dry-run] [--verbose]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const LIVE_PRICES_PATH = path.join(ROOT, 'data', 'live-prices.json');
const EVENTS_DIR = path.join(ROOT, 'data', 'events');

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ── v3 Framework: Price-as-Evidence Classification ──────────────────────────
// From NARRATIVE_FRAMEWORK_V3.md:
//   <2%  = NOISE       (no adjustment)
//   2-5% = NOTABLE     (minor adjustment)
//   5-10%= SIGNIFICANT (meaningful adjustment)
//   >10% = MATERIAL    (large adjustment)

function classifyDailyMove(pct) {
  const abs = Math.abs(pct);
  if (abs < 2) return { classification: 'NOISE', baseAdjustment: 0, weight: 0 };
  if (abs < 5) return { classification: 'NOTABLE', baseAdjustment: 2, weight: 1 };
  if (abs < 10) return { classification: 'SIGNIFICANT', baseAdjustment: 5, weight: 2 };
  return { classification: 'MATERIAL', baseAdjustment: 10, weight: 3 };
}

// ── Volume Confirmation Multiplier ──────────────────────────────────────────
// From NARRATIVE_FRAMEWORK_V3.md:
//   >200% avg vol = 2.0x
//   150-200%      = 1.5x
//   80-150%       = 1.0x
//   50-80%        = 0.7x
//   <50%          = 0.3x

function volumeMultiplier(volumeRatio) {
  if (!volumeRatio || volumeRatio <= 0) return 1.0; // No data = neutral
  if (volumeRatio > 2.0) return 2.0;
  if (volumeRatio > 1.5) return 1.5;
  if (volumeRatio > 0.8) return 1.0;
  if (volumeRatio > 0.5) return 0.7;
  return 0.3;
}

// ── Results-Day Amplifier ───────────────────────────────────────────────────
// If a stock has a results/earnings event within 2 trading days,
// price evidence weight is amplified 1.5x

function isResultsDay(ticker, eventsDir) {
  try {
    const eventsFile = path.join(eventsDir, ticker + '.json');
    if (!fs.existsSync(eventsFile)) return false;
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    const now = new Date();
    const twoDays = 2 * 24 * 60 * 60 * 1000;
    for (const ev of (events.events || events || [])) {
      const evDate = new Date(ev.date || ev.datetime);
      if (Math.abs(evDate - now) < twoDays) {
        const type = (ev.type || ev.category || '').toLowerCase();
        if (type.includes('result') || type.includes('earning') || type.includes('report') || type.includes('guidance')) {
          return true;
        }
      }
    }
  } catch (e) {
    // No events data — not a results day
  }
  return false;
}

// ── Cumulative Move Detection ───────────────────────────────────────────────
// 5-day cumulative >10% = additional adjustment
// 20-day cumulative >15% = additional adjustment

function detectCumulativeMoves(priceHistory) {
  if (!priceHistory || priceHistory.length < 2) return { fiveDay: 0, twentyDay: 0 };

  const current = priceHistory[priceHistory.length - 1];
  let fiveDayPct = 0;
  let twentyDayPct = 0;

  if (priceHistory.length >= 6) {
    const fiveDayPrice = priceHistory[priceHistory.length - 6];
    fiveDayPct = fiveDayPrice !== 0 ? ((current - fiveDayPrice) / fiveDayPrice) * 100 : 0;
  }
  if (priceHistory.length >= 21) {
    const twentyDayPrice = priceHistory[priceHistory.length - 21];
    twentyDayPct = twentyDayPrice !== 0 ? ((current - twentyDayPrice) / twentyDayPrice) * 100 : 0;
  }

  return {
    fiveDay: Math.round(fiveDayPct * 100) / 100,
    twentyDay: Math.round(twentyDayPct * 100) / 100
  };
}

// ── Overcorrection Detection (v3 Framework) ────────────────────────────────
// Triggers:
//   Single-day move >10% OR 5-day cumulative >15%
// When triggered:
//   - Set overcorrection_active = true on stock data
//   - Create amber evidence item
//   - Record trigger date for 5-day review
// After 5 trading days:
//   - If price reversed >50% of move: overcorrection confirmed
//   - If price held/extended: not an overcorrection, clear flag

function checkOvercorrection(dailyChangePct, cumulative, stockData) {
  const result = {
    triggered: false,
    triggerType: null,
    message: null,
    reviewDate: null
  };

  const absDailyPct = Math.abs(dailyChangePct);
  const absFiveDayPct = Math.abs(cumulative.fiveDay);

  // Check trigger conditions
  if (absDailyPct > 10) {
    result.triggered = true;
    result.triggerType = 'SINGLE_DAY';
    result.message = `Single-day move of ${dailyChangePct > 0 ? '+' : ''}${dailyChangePct.toFixed(1)}% exceeds 10% threshold — possible overcorrection`;
  } else if (absFiveDayPct > 15) {
    result.triggered = true;
    result.triggerType = 'FIVE_DAY_CUMULATIVE';
    result.message = `5-day cumulative move of ${cumulative.fiveDay > 0 ? '+' : ''}${cumulative.fiveDay.toFixed(1)}% exceeds 15% threshold — possible overcorrection`;
  }

  // If triggered, compute review date (5 trading days from now)
  if (result.triggered) {
    const reviewDate = new Date();
    let tradingDaysAdded = 0;
    while (tradingDaysAdded < 5) {
      reviewDate.setDate(reviewDate.getDate() + 1);
      const dow = reviewDate.getDay();
      if (dow !== 0 && dow !== 6) tradingDaysAdded++;
    }
    result.reviewDate = reviewDate.toISOString().split('T')[0];
  }

  // Check if an existing overcorrection is due for review
  if (stockData._overcorrection && stockData._overcorrection.active) {
    const review = stockData._overcorrection;
    const today = new Date().toISOString().split('T')[0];
    if (today >= review.reviewDate) {
      // 5-day review period elapsed — assess if overcorrection confirmed
      const triggerPrice = review.triggerPrice;
      const currentPrice = stockData.current_price;
      const triggerDirection = review.direction; // 'up' or 'down'
      const triggerMovePct = review.movePct;

      // Calculate recovery
      const priceSinceTrigger = currentPrice - triggerPrice;
      const moveDirection = triggerDirection === 'down' ? -1 : 1;
      const originalMove = triggerPrice * (triggerMovePct / 100) * moveDirection;
      const reversal = originalMove !== 0 ? (priceSinceTrigger / originalMove) * -100 : 0;

      result.reviewResult = {
        reversal_pct: Math.round(reversal * 10) / 10,
        confirmed: Math.abs(reversal) > 50,
        message: Math.abs(reversal) > 50
          ? `Overcorrection CONFIRMED — ${Math.abs(reversal).toFixed(0)}% reversal since trigger`
          : `Overcorrection NOT confirmed — price ${Math.abs(reversal) < 10 ? 'held' : 'only partially reversed'}`
      };
    }
  }

  return result;
}

// ── Map hypothesis sentiment ────────────────────────────────────────────────

function getSentiment(hypothesis) {
  // Stocks data format: check labels and descriptions for sentiment cues
  const label = (hypothesis.label || '').toLowerCase();
  const desc = (hypothesis.description || '').toLowerCase();

  // Explicit bearish indicators
  if (label.includes('downside') || label.includes('risk') || label.includes('downturn') ||
      label.includes('pressure') || label.includes('slowdown') || label.includes('disruption') ||
      label.includes('cyclical downturn') || label.includes('margin pressure')) {
    return 'BEARISH';
  }
  // Explicit bullish indicators
  if (label.includes('growth') || label.includes('recovery') || label.includes('winner') ||
      label.includes('cash generation') || label.includes('transition') || label.includes('upside') ||
      label.includes('base case') || label.includes('managed')) {
    return 'BULLISH';
  }
  // Check description for upside/risk cues
  if (hypothesis.upside && !hypothesis.risk_plain) return 'BULLISH';
  if (!hypothesis.upside && hypothesis.risk_plain) return 'BEARISH';

  return 'NEUTRAL';
}

// ── Normalise with floor/ceiling (v3 framework) ────────────────────────────

function normaliseWithFloorCeiling(rawScores) {
  const FLOOR = 5;
  const CEILING = 80;
  if (!rawScores || rawScores.length === 0) return [];

  let clamped = rawScores.map(s => Math.max(FLOOR, Math.min(CEILING, s)));
  let sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return clamped.map(() => Math.round(100 / clamped.length));

  let result = clamped.map(s => Math.round((s / sum) * 100));

  // Post-normalisation clamp iterations
  for (let iter = 0; iter < 20; iter++) {
    let overflow = 0, underflow = 0;
    const freeIndices = [];
    for (let i = 0; i < result.length; i++) {
      if (result[i] > CEILING) { overflow += result[i] - CEILING; result[i] = CEILING; }
      else if (result[i] < FLOOR) { underflow += FLOOR - result[i]; result[i] = FLOOR; }
      else freeIndices.push(i);
    }
    if (overflow === 0 && underflow === 0) break;
    const net = overflow - underflow;
    if (net === 0 || freeIndices.length === 0) break;

    if (net > 0) {
      freeIndices.sort((a, b) => result[a] - result[b]);
      let remaining = net;
      for (const idx of freeIndices) {
        if (remaining <= 0) break;
        const room = CEILING - result[idx];
        const give = Math.min(remaining, room);
        result[idx] += give;
        remaining -= give;
      }
    } else {
      freeIndices.sort((a, b) => result[b] - result[a]);
      let remaining = -net;
      for (const idx of freeIndices) {
        if (remaining <= 0) break;
        const room = result[idx] - FLOOR;
        const take = Math.min(remaining, room);
        result[idx] -= take;
        remaining -= take;
      }
    }
  }

  // Fix rounding residual
  const roundedSum = result.reduce((a, b) => a + b, 0);
  if (roundedSum !== 100) {
    let bestIdx = -1;
    const diff = 100 - roundedSum;
    for (let i = 0; i < result.length; i++) {
      const candidate = result[i] + diff;
      if (candidate >= FLOOR && candidate <= CEILING) {
        if (bestIdx === -1 || result[i] > result[bestIdx]) bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      bestIdx = 0;
      for (let i = 1; i < result.length; i++) if (result[i] > result[bestIdx]) bestIdx = i;
    }
    result[bestIdx] += diff;
  }

  return result;
}

// ── Process one stock ───────────────────────────────────────────────────────

function processStock(ticker, stockData, livePrice) {
  const hyps = stockData.hypotheses;
  if (!hyps) return null;

  const tiers = Object.keys(hyps); // N1, N2, N3, N4
  if (tiers.length === 0) return null;

  const priceHistory = stockData.price_history || [];
  const currentPrice = livePrice || stockData.current_price || 0;
  const previousPrice = priceHistory.length >= 2 ? priceHistory[priceHistory.length - 2] : currentPrice;

  if (previousPrice === 0 || currentPrice === 0) return null;

  // 1. Daily move classification
  const dailyChangePct = Math.round(((currentPrice - previousPrice) / previousPrice) * 10000) / 100;
  const moveClass = classifyDailyMove(dailyChangePct);

  // 2. Volume confirmation (use live price data if available)
  const volRatio = stockData._volumeRatio || 1.0;
  const volMult = volumeMultiplier(volRatio);

  // 3. Results-day amplification
  const resultsDay = isResultsDay(ticker, EVENTS_DIR);
  const resultsMult = resultsDay ? 1.5 : 1.0;

  // 4. Cumulative move detection
  const cumulative = detectCumulativeMoves(priceHistory);

  // 5. Calculate adjusted scores
  const direction = dailyChangePct > 0 ? 1 : -1; // +1 = positive move, -1 = negative
  const effectiveAdj = moveClass.baseAdjustment * volMult * resultsMult;

  const rawScores = {};
  const adjustments = {};

  for (const tier of tiers) {
    const h = hyps[tier];
    const currentScore = (h.survival_score || 0) * 100; // Convert from 0-1 to 0-100
    const sentiment = getSentiment(h);
    let adj = 0;

    // Daily move adjustment
    if (effectiveAdj > 0) {
      if (sentiment === 'BULLISH') {
        adj += direction * effectiveAdj;
      } else if (sentiment === 'BEARISH') {
        adj -= direction * effectiveAdj;
      }
      // NEUTRAL: only adjust for MATERIAL moves
      if (sentiment === 'NEUTRAL' && moveClass.classification === 'MATERIAL') {
        adj -= direction * Math.round(effectiveAdj / 2);
      }
    }

    // 5-day cumulative adjustment
    if (Math.abs(cumulative.fiveDay) > 10) {
      const dir5 = cumulative.fiveDay > 0 ? 1 : -1;
      if (sentiment === 'BULLISH') adj += dir5 * 3 * resultsMult;
      else if (sentiment === 'BEARISH') adj -= dir5 * 3 * resultsMult;
    }

    // 20-day cumulative adjustment
    if (Math.abs(cumulative.twentyDay) > 15) {
      const dir20 = cumulative.twentyDay > 0 ? 1 : -1;
      if (sentiment === 'BULLISH') adj += dir20 * 5 * resultsMult;
      else if (sentiment === 'BEARISH') adj -= dir20 * 5 * resultsMult;
    }

    rawScores[tier] = currentScore + adj;
    adjustments[tier] = Math.round(adj * 100) / 100;
  }

  // 6. Normalise with floor/ceiling
  const rawArray = tiers.map(t => rawScores[t]);
  const normArray = normaliseWithFloorCeiling(rawArray);

  // 7. Build result
  const updates = {};
  for (let i = 0; i < tiers.length; i++) {
    updates[tiers[i]] = {
      survival_score: Math.round(normArray[i]) / 100, // Back to 0-1 format
      adjustment: adjustments[tiers[i]]
    };
  }

  // 8. Overcorrection detection
  const overcorrection = checkOvercorrection(dailyChangePct, cumulative, stockData);

  return {
    ticker,
    current_price: currentPrice,
    daily_change_pct: dailyChangePct,
    classification: moveClass.classification,
    volume_multiplier: volMult,
    results_day: resultsDay,
    cumulative: cumulative,
    updates,
    overcorrection,
    price_signal: {
      date: new Date().toISOString().split('T')[0],
      classification: moveClass.classification,
      daily_change_pct: dailyChangePct,
      volume_multiplier: volMult,
      cumulative_5d: cumulative.fiveDay,
      cumulative_20d: cumulative.twentyDay,
      results_day: resultsDay,
      overcorrection_active: overcorrection.triggered
    }
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Price-as-Evidence Engine');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  // Load ticker config
  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers).filter(t => tickerConfig.tickers[t].status === 'active');
  console.log('  Active tickers:', tickers.length);

  // Load live prices
  let livePrices = {};
  if (fs.existsSync(LIVE_PRICES_PATH)) {
    try {
      livePrices = JSON.parse(fs.readFileSync(LIVE_PRICES_PATH, 'utf8'));
    } catch (e) { /* use empty */ }
  }

  let updated = 0;
  let skipped = 0;
  let noiseCount = 0;
  let notableCount = 0;
  let significantCount = 0;
  let materialCount = 0;

  for (const ticker of tickers) {
    const stockPath = path.join(STOCKS_DIR, ticker + '.json');
    if (!fs.existsSync(stockPath)) {
      if (verbose) console.log('  [SKIP]', ticker, '— no stock data');
      skipped++;
      continue;
    }

    const stockData = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    const livePrice = livePrices[ticker] ? livePrices[ticker].price : null;

    const result = processStock(ticker, stockData, livePrice);
    if (!result) {
      if (verbose) console.log('  [SKIP]', ticker, '— insufficient data');
      skipped++;
      continue;
    }

    // Track classification stats
    switch (result.classification) {
      case 'NOISE': noiseCount++; break;
      case 'NOTABLE': notableCount++; break;
      case 'SIGNIFICANT': significantCount++; break;
      case 'MATERIAL': materialCount++; break;
    }

    if (result.classification === 'NOISE' && !result.results_day) {
      if (verbose) console.log('  [NOISE]', ticker, dailyStr(result));
      // Still update price_signals for audit trail, but don't change scores
      if (!dryRun) {
        // Append to price_signals array
        if (!stockData.price_signals) stockData.price_signals = [];
        stockData.price_signals.push(result.price_signal);
        // Keep only last 60 signals
        if (stockData.price_signals.length > 60) {
          stockData.price_signals = stockData.price_signals.slice(-60);
        }
        fs.writeFileSync(stockPath, JSON.stringify(stockData, null, 2), 'utf8');
      }
      continue;
    }

    // Apply updates to stock data
    for (const [tier, upd] of Object.entries(result.updates)) {
      if (stockData.hypotheses[tier]) {
        stockData.hypotheses[tier].survival_score = upd.survival_score;
        stockData.hypotheses[tier].last_updated = new Date().toISOString();
      }
    }

    // Append price signal
    if (!stockData.price_signals) stockData.price_signals = [];
    stockData.price_signals.push(result.price_signal);
    if (stockData.price_signals.length > 60) {
      stockData.price_signals = stockData.price_signals.slice(-60);
    }

    // Update current price and maintain price_history
    stockData.current_price = result.current_price;
    if (!stockData.price_history) stockData.price_history = [];
    stockData.price_history.push(result.current_price);
    if (stockData.price_history.length > 60) {
      stockData.price_history = stockData.price_history.slice(-60);
    }

    // Handle overcorrection state
    if (result.overcorrection.triggered) {
      stockData._overcorrection = {
        active: true,
        triggerType: result.overcorrection.triggerType,
        triggerDate: new Date().toISOString().split('T')[0],
        triggerPrice: result.current_price,
        direction: result.daily_change_pct > 0 ? 'up' : 'down',
        movePct: result.daily_change_pct,
        reviewDate: result.overcorrection.reviewDate,
        message: result.overcorrection.message
      };
      stockData.alert_state = 'OVERCORRECTION';
      // Add amber evidence item
      if (!stockData.evidence_items) stockData.evidence_items = [];
      stockData.evidence_items.push({
        date: new Date().toISOString().split('T')[0],
        type: 'OVERCORRECTION_TRIGGER',
        severity: 'AMBER',
        message: result.overcorrection.message,
        auto_generated: true
      });
    }
    // Handle overcorrection review result
    if (result.overcorrection.reviewResult) {
      const rr = result.overcorrection.reviewResult;
      if (rr.confirmed) {
        // Overcorrection confirmed — scores have already self-corrected
        stockData.alert_state = 'OVERCORRECTION_CONFIRMED';
      } else {
        // Not an overcorrection — clear the flag
        stockData.alert_state = 'NORMAL';
      }
      stockData._overcorrection = { ...stockData._overcorrection, active: false, reviewResult: rr };
      // Add evidence item with review result
      if (!stockData.evidence_items) stockData.evidence_items = [];
      stockData.evidence_items.push({
        date: new Date().toISOString().split('T')[0],
        type: 'OVERCORRECTION_REVIEW',
        severity: rr.confirmed ? 'GREEN' : 'AMBER',
        message: rr.message,
        auto_generated: true
      });
    }

    if (!dryRun) {
      fs.writeFileSync(stockPath, JSON.stringify(stockData, null, 2), 'utf8');

      // Also inject overcorrection state into research file for front-end display
      const researchPath = path.join(ROOT, 'data', 'research', ticker + '.json');
      if (fs.existsSync(researchPath)) {
        try {
          const researchData = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
          researchData._overcorrection = stockData._overcorrection || null;
          researchData._alertState = stockData.alert_state || 'NORMAL';
          fs.writeFileSync(researchPath, JSON.stringify(researchData, null, 2), 'utf8');
        } catch (e) {
          if (verbose) console.log('    [WARN] Could not update research file:', e.message);
        }
      }
    }

    updated++;
    const tag = result.results_day ? ' [RESULTS DAY]' : '';
    const ocTag = result.overcorrection.triggered ? ' ⚠ OVERCORRECTION' : '';
    console.log('  [' + result.classification + ']', ticker,
      dailyStr(result) + tag + ocTag);
    if (verbose) {
      for (const [tier, upd] of Object.entries(result.updates)) {
        console.log('    ', tier, '→', (upd.survival_score * 100).toFixed(0) + '%',
          '(adj:', upd.adjustment > 0 ? '+' : '', upd.adjustment + ')');
      }
    }
  }

  console.log('');
  console.log('  ── Summary ──');
  console.log('  Updated:', updated, '| Skipped:', skipped);
  console.log('  NOISE:', noiseCount, '| NOTABLE:', notableCount,
    '| SIGNIFICANT:', significantCount, '| MATERIAL:', materialCount);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

function dailyStr(result) {
  return (result.daily_change_pct >= 0 ? '+' : '') +
    result.daily_change_pct.toFixed(2) + '% | 5d:' +
    (result.cumulative.fiveDay >= 0 ? '+' : '') +
    result.cumulative.fiveDay.toFixed(1) + '% | 20d:' +
    (result.cumulative.twentyDay >= 0 ? '+' : '') +
    result.cumulative.twentyDay.toFixed(1) + '%';
}

// Only run main when executed directly (not when require'd)
if (require.main === module) main();

module.exports = { processStock };
