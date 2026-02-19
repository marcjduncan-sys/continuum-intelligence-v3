#!/usr/bin/env node
/**
 * price-evidence-engine.js
 *
 * Continuum Intelligence — Phase 3: Price-as-Evidence Engine
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md §Phase 3
 * Per NARRATIVE_FRAMEWORK_V3.md Principle 3
 *
 * Runs daily after prices are fetched. For each stock:
 *   3.1  Classify daily price move (NOISE / NOTABLE / SIGNIFICANT / MATERIAL)
 *   3.2  Apply volume confirmation multiplier
 *   3.3  Detect cumulative multi-day moves (5d, 20d, 60d)
 *   3.4  Apply results-day amplifier
 *   3.5  Evaluate evidence against each hypothesis (rows-before-columns ACH)
 *   3.6  Normalise scores: floor 5, ceiling 80, sum to 100; re-rank; detect flips
 *
 * Data sources:
 *   data/live-prices.json  — today's price, prev-close, volume
 *   data/stocks/{T}-history.json — history with hypotheses (integer scores, sentiment)
 *   data/stocks/{T}.json   — stock config + hypotheses keyed object (decimal scores)
 *   data/events/{T}.json   — optional earnings/results events calendar
 *
 * Writes:
 *   - Updated hypothesis survival_scores to stock JSON (for next pipeline run)
 *   - price_classification, price_signals, overcorrection state to stock JSON
 *   - Appends/updates TODAY's entry in history JSON (hypotheses, dominant, flip)
 *
 * Usage:
 *   node scripts/price-evidence-engine.js [--dry-run] [--verbose] [--date YYYY-MM-DD]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT             = path.join(__dirname, '..');
const TICKERS_PATH     = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR       = path.join(ROOT, 'data', 'stocks');
const LIVE_PRICES_PATH = path.join(ROOT, 'data', 'live-prices.json');
const EVENTS_DIR       = path.join(ROOT, 'data', 'events');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const dateIdx = args.indexOf('--date');
const today   = (dateIdx !== -1 && args[dateIdx + 1]) ? args[dateIdx + 1]
              : new Date().toISOString().split('T')[0];

// ── §3.1: Daily price move classification ────────────────────────────────────
//   <2%   NOISE       (no adjustment)
//   2-5%  NOTABLE     (+/-2)
//   5-10% SIGNIFICANT (+/-5)
//   >10%  MATERIAL    (+/-10, mandatory review flag)

function classifyMove(absPct) {
  if (absPct <  2) return { label: 'NOISE',       base: 0  };
  if (absPct <  5) return { label: 'NOTABLE',      base: 2  };
  if (absPct < 10) return { label: 'SIGNIFICANT',  base: 5  };
  return               { label: 'MATERIAL',      base: 10 };
}

// ── §3.2: Volume confirmation multiplier ─────────────────────────────────────
//   >200% → 2.0x   150-200% → 1.5x   80-150% → 1.0x   50-80% → 0.7x   <50% → 0.3x

function volumeMultiplier(ratio) {
  if (!ratio || ratio <= 0) return 1.0;
  if (ratio > 2.00) return 2.0;
  if (ratio > 1.50) return 1.5;
  if (ratio > 0.80) return 1.0;
  if (ratio > 0.50) return 0.7;
  return 0.3;
}

// ── §3.3: Compute volume ratio from history (today volume / 20d avg) ─────────

function computeVolumeRatio(historyEntries, todayVolume) {
  if (!todayVolume || todayVolume <= 0) return 1.0;
  const vols = historyEntries
    .slice(-20)
    .map(e => e.volume || 0)
    .filter(v => v > 0);
  if (vols.length === 0) return 1.0;
  const avg = vols.reduce((a, b) => a + b, 0) / vols.length;
  return avg > 0 ? todayVolume / avg : 1.0;
}

// ── §3.3: Cumulative move detection from history price entries ────────────────
//   5d  >+/-10%  → short-term dislocation, amplify daily by 1.5x
//   20d >+/-20%  → structural shift, flag for re-evaluation
//   60d >+/-30%  → secular trend change, full recalibration

function computeCumulativeMoves(historyEntries, currentPrice) {
  const prices = historyEntries
    .map(e => e.price || e.close || null)
    .filter(p => p !== null && p > 0);

  function pctChange(lookback) {
    if (prices.length < lookback + 1) return null;
    const prior = prices[prices.length - 1 - lookback];
    return prior > 0 ? ((currentPrice - prior) / prior) * 100 : null;
  }

  return {
    fiveDay:    pctChange(5),
    twentyDay:  pctChange(20),
    sixtyDay:   pctChange(60)
  };
}

// ── §3.4: Results-day detection ───────────────────────────────────────────────

function isResultsDay(ticker) {
  try {
    const eventsFile = path.join(EVENTS_DIR, ticker + '.json');
    if (!fs.existsSync(eventsFile)) return false;
    const events = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    const nowMs  = Date.now();
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    for (const ev of (events.events || events || [])) {
      const evDate = new Date(ev.date || ev.datetime);
      if (Math.abs(evDate.getTime() - nowMs) < TWO_DAYS_MS) {
        const type = (ev.type || ev.category || '').toLowerCase();
        if (type.includes('result') || type.includes('earn') ||
            type.includes('report') || type.includes('guidance')) return true;
      }
    }
  } catch (_) { /* no events data */ }
  return false;
}

// ── §3.5: Evidence matrix evaluation (rows-before-columns ACH) ────────────────
// Positive move → BULLISH hypotheses increase, BEARISH decrease
// Negative move → BEARISH hypotheses increase, BULLISH decrease
// NEUTRAL hypotheses: no change unless MATERIAL (then ½ adjustment)

function applyEvidenceToHypotheses(hypotheses, direction, effectiveAdj, classification) {
  return hypotheses.map(h => {
    const sentiment = (h.sentiment || '').toUpperCase();
    let adj = 0;
    if (effectiveAdj > 0) {
      if (sentiment === 'BULLISH') {
        adj = direction * effectiveAdj;
      } else if (sentiment === 'BEARISH') {
        adj = -direction * effectiveAdj;
      } else if (sentiment === 'NEUTRAL' && classification === 'MATERIAL') {
        adj = -direction * Math.round(effectiveAdj / 2);
      }
    }
    return { ...h, _rawScore: (h.survival_score || 0) + adj };
  });
}

// ── §3.6: Score normalisation ─────────────────────────────────────────────────
// 1. Clamp to [FLOOR=5, CEILING=80]
// 2. Normalise: score_i = (score_i / sum) × 100
// 3. Iterate to resolve post-normalisation violations
// 4. Fix rounding residual

function normaliseScores(rawScores) {
  const FLOOR   = 5;
  const CEILING = 80;
  const n       = rawScores.length;
  if (n === 0) return [];

  let clamped = rawScores.map(s => Math.max(FLOOR, Math.min(CEILING, s)));
  const sum = clamped.reduce((a, b) => a + b, 0);
  let result = sum > 0
    ? clamped.map(s => Math.round((s / sum) * 100))
    : clamped.map(() => Math.round(100 / n));

  // Post-normalisation iteration: redistribute over/underflows among free slots
  for (let iter = 0; iter < 20; iter++) {
    let overflow = 0, underflow = 0;
    const free = [];
    for (let i = 0; i < n; i++) {
      if      (result[i] > CEILING) { overflow  += result[i] - CEILING; result[i] = CEILING; }
      else if (result[i] < FLOOR)   { underflow += FLOOR - result[i];   result[i] = FLOOR; }
      else    free.push(i);
    }
    if ((overflow === 0 && underflow === 0) || free.length === 0) break;
    const net = overflow - underflow;
    if (net === 0) break;
    if (net > 0) {
      free.sort((a, b) => result[a] - result[b]);
      let rem = net;
      for (const idx of free) {
        if (rem <= 0) break;
        const give = Math.min(rem, CEILING - result[idx]);
        result[idx] += give;
        rem -= give;
      }
    } else {
      free.sort((a, b) => result[b] - result[a]);
      let rem = -net;
      for (const idx of free) {
        if (rem <= 0) break;
        const take = Math.min(rem, result[idx] - FLOOR);
        result[idx] -= take;
        rem -= take;
      }
    }
  }

  // Fix rounding residual on largest-score hypothesis
  const roundedSum = result.reduce((a, b) => a + b, 0);
  if (roundedSum !== 100) {
    const diff = 100 - roundedSum;
    let bestIdx = 0;
    for (let i = 1; i < n; i++) if (result[i] > result[bestIdx]) bestIdx = i;
    const candidate = result[bestIdx] + diff;
    result[bestIdx] = Math.max(FLOOR, Math.min(CEILING, candidate));
  }

  return result;
}

// ── Overcorrection detection (§4) ────────────────────────────────────────────

function detectOvercorrection(dailyChangePct, cumulativeMoves, stockData) {
  const absDailyPct = Math.abs(dailyChangePct);
  const abs5d       = cumulativeMoves.fiveDay !== null ? Math.abs(cumulativeMoves.fiveDay) : 0;

  const triggered   = absDailyPct > 10 || abs5d > 15;
  const triggerType = absDailyPct > 10 ? 'SINGLE_DAY' : 'FIVE_DAY_CUMULATIVE';
  const message     = triggered
    ? absDailyPct > 10
      ? `Single-day move of ${dailyChangePct > 0 ? '+' : ''}${dailyChangePct.toFixed(1)}% exceeds 10% threshold — possible overcorrection`
      : `5-day cumulative move of ${cumulativeMoves.fiveDay > 0 ? '+' : ''}${cumulativeMoves.fiveDay.toFixed(1)}% exceeds 15% threshold — possible overcorrection`
    : null;

  let reviewDate = null;
  if (triggered) {
    const rd = new Date();
    let added = 0;
    while (added < 5) {
      rd.setDate(rd.getDate() + 1);
      const dow = rd.getDay();
      if (dow !== 0 && dow !== 6) added++;
    }
    reviewDate = rd.toISOString().split('T')[0];
  }

  // Check if existing overcorrection is due for review
  let reviewResult = null;
  const oc = stockData._overcorrection;
  if (oc && oc.active && today >= oc.reviewDate) {
    const triggerPrice   = oc.triggerPrice;
    const currentPrice   = stockData.current_price;
    const moveDir        = oc.direction === 'up' ? 1 : -1;
    const originalMove   = triggerPrice * (oc.movePct / 100) * moveDir;
    const priceSince     = currentPrice - triggerPrice;
    const reversal       = originalMove !== 0 ? (priceSince / originalMove) * -100 : 0;
    const confirmed      = Math.abs(reversal) > 50;
    reviewResult = {
      reversal_pct: Math.round(reversal * 10) / 10,
      confirmed,
      message: confirmed
        ? `Overcorrection CONFIRMED — ${Math.abs(reversal).toFixed(0)}% reversal since trigger`
        : `Overcorrection NOT confirmed — price ${Math.abs(reversal) < 10 ? 'held' : 'only partially reversed'}`
    };
  }

  return { triggered, triggerType, message, reviewDate, reviewResult };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Phase 3: Price-as-Evidence Engine');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Date:', today, '| Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  // Load ticker config
  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers)
    .filter(t => tickerConfig.tickers[t].status === 'active');
  console.log('  Active tickers:', tickers.length);

  // Load live prices — file is { updated, market, count, prices: { WOW: {...}, ... } }
  let prices = {};
  try {
    const raw = JSON.parse(fs.readFileSync(LIVE_PRICES_PATH, 'utf8'));
    prices = (raw && raw.prices && typeof raw.prices === 'object') ? raw.prices : raw;
  } catch (e) {
    console.warn('  [WARN] Cannot read live-prices.json:', e.message);
  }

  let processed = 0, skipped = 0;
  const classCounts = { NOISE: 0, NOTABLE: 0, SIGNIFICANT: 0, MATERIAL: 0 };

  for (const ticker of tickers) {
    const stockPath   = path.join(STOCKS_DIR, ticker + '.json');
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');

    if (!fs.existsSync(stockPath) || !fs.existsSync(historyPath)) {
      skipped++;
      continue;
    }

    let stockData, historyData;
    try {
      stockData   = JSON.parse(fs.readFileSync(stockPath,   'utf8'));
      historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      console.warn('  [WARN]', ticker, '— cannot read files:', e.message);
      skipped++;
      continue;
    }

    const history = historyData.history || [];

    // ── Price data ───────────────────────────────────────────────────────────
    const priceEntry    = prices[ticker] || {};
    const currentPrice  = priceEntry.p || stockData.current_price || 0;
    const prevClose     = priceEntry.pc || 0;
    const todayVolume   = priceEntry.v || 0;

    if (currentPrice === 0) {
      if (verbose) console.log('  [SKIP]', ticker, '— no price data');
      skipped++;
      continue;
    }

    // ── §3.1: Classify daily move ────────────────────────────────────────────
    let dailyChangePct;
    if (prevClose > 0) {
      dailyChangePct = ((currentPrice - prevClose) / prevClose) * 100;
    } else {
      // Fall back to history
      const recentPrices = history.filter(e => e.price).map(e => e.price);
      const lastPrice = recentPrices[recentPrices.length - 2] || currentPrice;
      dailyChangePct = lastPrice > 0 ? ((currentPrice - lastPrice) / lastPrice) * 100 : 0;
    }
    dailyChangePct = Math.round(dailyChangePct * 100) / 100;

    const direction = dailyChangePct > 0 ? 1 : dailyChangePct < 0 ? -1 : 0;
    const moveClass = classifyMove(Math.abs(dailyChangePct));

    // ── §3.2: Volume multiplier ──────────────────────────────────────────────
    const pastEntries  = history.filter(e => e.date < today);
    const volumeRatio  = computeVolumeRatio(pastEntries, todayVolume);
    const volMult      = volumeMultiplier(volumeRatio);

    // ── §3.4: Results day amplifier ──────────────────────────────────────────
    const resultsDay   = isResultsDay(ticker);
    const resultsMult  = resultsDay ? 2.0 : 1.0;  // spec: results-day evidence gets 2x weight

    // ── §3.3: Cumulative moves ───────────────────────────────────────────────
    // Exclude reconstructed entries — backfilled prices may be synthetic
    const pricesForCumul = pastEntries
      .filter(e => !e.reconstructed)
      .map(e => e.price || 0)
      .filter(p => p > 0);
    const cumulativeMoves = pricesForCumul.length >= 2
      ? (() => {
          const cur = currentPrice;
          const p5  = pricesForCumul.length >= 5  ? pricesForCumul[pricesForCumul.length - 5]  : null;
          const p20 = pricesForCumul.length >= 20 ? pricesForCumul[pricesForCumul.length - 20] : null;
          const p60 = pricesForCumul.length >= 60 ? pricesForCumul[pricesForCumul.length - 60] : null;
          return {
            fiveDay:   p5  ? Math.round(((cur - p5 ) / p5  * 100) * 100) / 100 : null,
            twentyDay: p20 ? Math.round(((cur - p20) / p20 * 100) * 100) / 100 : null,
            sixtyDay:  p60 ? Math.round(((cur - p60) / p60 * 100) * 100) / 100 : null
          };
        })()
      : { fiveDay: null, twentyDay: null, sixtyDay: null };

    // 5-day dislocation amplifier: if 5d >10%, amplify daily by 1.5x
    const fiveDayAmplifier = (cumulativeMoves.fiveDay !== null && Math.abs(cumulativeMoves.fiveDay) > 10) ? 1.5 : 1.0;

    // Effective adjustment
    const effectiveAdj = moveClass.base * volMult * resultsMult * fiveDayAmplifier;

    classCounts[moveClass.label]++;

    // ── Get hypotheses from most-recent history entry with data ──────────────
    // If NOISE and no results day → skip score update, just log price signal
    if (moveClass.label === 'NOISE' && !resultsDay) {
      if (verbose) {
        console.log('  [NOISE]', ticker, priceSummary(dailyChangePct, cumulativeMoves));
      }
      // Still record price signal for audit trail
      const priceSignal = buildPriceSignal(today, dailyChangePct, moveClass.label,
        volumeRatio, volMult, cumulativeMoves, resultsDay, false);
      if (!dryRun) {
        if (!stockData.price_signals) stockData.price_signals = [];
        stockData.price_signals.push(priceSignal);
        if (stockData.price_signals.length > 60) stockData.price_signals = stockData.price_signals.slice(-60);
        stockData.current_price = currentPrice;
        fs.writeFileSync(stockPath, JSON.stringify(stockData, null, 2), 'utf8');
      }
      continue;
    }

    // Get hypothesis array from most recent history entry with non-empty hypotheses
    const entryWithHyps = [...history].reverse().find(e => (e.hypotheses || []).length > 0)
      || history[history.length - 1];

    if (!entryWithHyps || !(entryWithHyps.hypotheses || []).length) {
      if (verbose) console.log('  [SKIP]', ticker, '— no hypothesis data in history');
      skipped++;
      continue;
    }

    // ── §3.5: Evaluate evidence against each hypothesis ──────────────────────
    const hypsBefore = entryWithHyps.hypotheses;
    const hypsAfter  = applyEvidenceToHypotheses(hypsBefore, direction, effectiveAdj, moveClass.label);

    // ── §3.6: Normalise scores ───────────────────────────────────────────────
    const rawArray  = hypsAfter.map(h => h._rawScore);
    const normArray = normaliseScores(rawArray);

    const updatedHyps = hypsAfter.map((h, i) => ({
      id:                h.id,
      name:              h.name,
      sentiment:         h.sentiment,
      survival_score:    normArray[i],
      inconsistency_count: h.inconsistency_count || 0
    }));

    // Re-rank by score descending
    const ranked = [...updatedHyps].sort((a, b) => b.survival_score - a.survival_score);
    ranked.forEach((h, i) => { h.rank = i + 1; });
    // Re-sort to original order (by id) for consistent storage
    const rankMap = {};
    ranked.forEach(h => { rankMap[h.id] = h.rank; });
    updatedHyps.forEach(h => { h.rank = rankMap[h.id]; });

    const newDominant = ranked[0].id;
    const oldDominant = entryWithHyps.dominant_narrative
      || (hypsBefore[0] && hypsBefore[0].id);
    const narrativeFlip = newDominant !== oldDominant;

    // ── Overcorrection detection ─────────────────────────────────────────────
    stockData.current_price = currentPrice;  // needed by checkOvercorrection
    const overcorrection = detectOvercorrection(dailyChangePct, cumulativeMoves, stockData);

    // ── Build price signal record ────────────────────────────────────────────
    const priceSignal = buildPriceSignal(today, dailyChangePct, moveClass.label,
      volumeRatio, volMult, cumulativeMoves, resultsDay, overcorrection.triggered);

    // ── Update stock JSON ────────────────────────────────────────────────────
    // Mirror updated scores back into stock JSON hypotheses (keyed object, decimal)
    if (stockData.hypotheses) {
      for (const h of updatedHyps) {
        if (stockData.hypotheses[h.id]) {
          stockData.hypotheses[h.id].survival_score = h.survival_score / 100;
          stockData.hypotheses[h.id].last_updated   = new Date().toISOString();
        }
      }
    }
    stockData.dominant = newDominant;
    if (!stockData.price_signals) stockData.price_signals = [];
    stockData.price_signals.push(priceSignal);
    if (stockData.price_signals.length > 60) stockData.price_signals = stockData.price_signals.slice(-60);

    // Overcorrection state
    if (overcorrection.triggered) {
      stockData._overcorrection = {
        active: true, triggerType: overcorrection.triggerType,
        triggerDate: today, triggerPrice: currentPrice,
        direction: dailyChangePct > 0 ? 'up' : 'down',
        movePct: dailyChangePct,
        reviewDate: overcorrection.reviewDate,
        message: overcorrection.message
      };
      stockData.alert_state = 'OVERCORRECTION';
      if (!stockData.evidence_items) stockData.evidence_items = [];
      stockData.evidence_items.push({
        date: today, type: 'OVERCORRECTION_TRIGGER', severity: 'AMBER',
        message: overcorrection.message, auto_generated: true
      });
    }
    if (overcorrection.reviewResult) {
      const rr = overcorrection.reviewResult;
      stockData.alert_state = rr.confirmed ? 'OVERCORRECTION_CONFIRMED' : 'NORMAL';
      if (stockData._overcorrection) stockData._overcorrection.active = false;
      if (!stockData.evidence_items) stockData.evidence_items = [];
      stockData.evidence_items.push({
        date: today, type: 'OVERCORRECTION_REVIEW',
        severity: rr.confirmed ? 'GREEN' : 'AMBER', message: rr.message, auto_generated: true
      });
    }
    if (narrativeFlip && oldDominant) {
      if (!stockData.narrative_history) stockData.narrative_history = [];
      stockData.narrative_history.push({
        date: today, from: oldDominant, to: newDominant, trigger: 'price_evidence'
      });
    }

    // ── Update or create today's history entry ───────────────────────────────
    let todayEntry = history.find(e => e.date === today);
    if (!todayEntry) {
      todayEntry = { date: today, price: currentPrice, reconstructed: false };
      history.push(todayEntry);
    }
    todayEntry.price              = currentPrice;
    todayEntry.daily_change_pct   = dailyChangePct;
    todayEntry.volume             = todayVolume || todayEntry.volume || null;
    todayEntry.volume_ratio       = Math.round(volumeRatio * 100) / 100;
    todayEntry.price_classification = moveClass.label;
    todayEntry.hypotheses         = updatedHyps;
    todayEntry.dominant_narrative = newDominant;
    todayEntry.narrative_flip     = narrativeFlip;
    if (narrativeFlip && oldDominant) {
      todayEntry.flip_detail = { from: oldDominant, to: newDominant, trigger: 'price_evidence' };
    }
    todayEntry.overcorrection_active = overcorrection.triggered;

    if (!dryRun) {
      fs.writeFileSync(stockPath,   JSON.stringify(stockData,   null, 2), 'utf8');
      fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
    }

    processed++;
    const tag  = resultsDay       ? ' [RESULTS DAY]'   : '';
    const ocTag = overcorrection.triggered ? ' ⚠ OVERCORRECTION' : '';
    const flipTag = narrativeFlip ? ` [FLIP: ${oldDominant}→${newDominant}]` : '';

    console.log(' ', moveClass.label.padEnd(11), ticker.padEnd(6),
      priceSummary(dailyChangePct, cumulativeMoves) + tag + ocTag + flipTag);

    if (verbose) {
      hypsBefore.forEach((hb, i) => {
        const ha = updatedHyps.find(h => h.id === hb.id);
        if (!ha) return;
        const delta = ha.survival_score - (hb.survival_score || 0);
        const deltaStr = delta === 0 ? '±0' : (delta > 0 ? '+' : '') + delta;
        console.log(`    ${ha.id} ${ha.sentiment.padEnd(7)} ${String(hb.survival_score).padStart(2)} → ${String(ha.survival_score).padStart(2)} (${deltaStr})`);
      });
    }
  }

  console.log('');
  console.log('  ── Summary ──');
  console.log('  Processed:', processed, '| Skipped:', skipped);
  console.log('  NOISE:', classCounts.NOISE,
    '| NOTABLE:', classCounts.NOTABLE,
    '| SIGNIFICANT:', classCounts.SIGNIFICANT,
    '| MATERIAL:', classCounts.MATERIAL);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

function priceSummary(dailyChangePct, cum) {
  const d = (dailyChangePct >= 0 ? '+' : '') + dailyChangePct.toFixed(2) + '%';
  const f = cum.fiveDay   !== null ? ((cum.fiveDay   >= 0 ? '+' : '') + cum.fiveDay.toFixed(1))   : 'n/a';
  const t = cum.twentyDay !== null ? ((cum.twentyDay >= 0 ? '+' : '') + cum.twentyDay.toFixed(1)) : 'n/a';
  return `${d} | 5d:${f}% 20d:${t}%`;
}

function buildPriceSignal(date, dailyChangePct, classification, volumeRatio, volMult,
                          cumulativeMoves, resultsDay, overcorrectionActive) {
  return {
    date, classification, daily_change_pct: dailyChangePct,
    volume_ratio: Math.round(volumeRatio * 100) / 100,
    volume_multiplier: volMult,
    cumulative_5d:  cumulativeMoves.fiveDay,
    cumulative_20d: cumulativeMoves.twentyDay,
    cumulative_60d: cumulativeMoves.sixtyDay,
    results_day: resultsDay,
    overcorrection_active: overcorrectionActive
  };
}

if (require.main === module) {
  main();
}

// ── Module export (adapter for update-research.js / update-orchestrator.js) ──
module.exports = {
  classifyMove,
  volumeMultiplier,
  normaliseScores,
  applyEvidenceToHypotheses,
  main,
  // Legacy adapter for callers that pass (stock, priceData, taConfig)
  processStock: function adapterProcessStock(stock, priceData) {
    const ticker  = stock.ticker || '';
    const livePx  = priceData ? (priceData.price || priceData.p || 0) : 0;
    const prevPx  = priceData ? (priceData.prevClose || priceData.pc || 0) : 0;
    if (!livePx || !prevPx) return null;

    const dailyChangePct = ((livePx - prevPx) / prevPx) * 100;
    const direction      = dailyChangePct > 0 ? 1 : dailyChangePct < 0 ? -1 : 0;
    const moveClass      = classifyMove(Math.abs(dailyChangePct));
    const volMult        = 1.0;
    const effectiveAdj   = moveClass.base * volMult;

    const hyps = stock.hypotheses || {};
    const tiers = Object.keys(hyps);
    if (!tiers.length) return null;

    const hypsArray = tiers.map(t => ({
      id: t, sentiment: hyps[t].label ? getSentimentFromLabel(hyps[t].label) : 'NEUTRAL',
      survival_score: Math.round((hyps[t].survival_score || 0) * 100)
    }));

    const updated = applyEvidenceToHypotheses(hypsArray, direction, effectiveAdj, moveClass.label);
    const norm    = normaliseScores(updated.map(h => h._rawScore));
    const scores  = {};
    tiers.forEach((t, i) => { scores[t] = norm[i] / 100; });

    return {
      scores,
      classification: moveClass.label,
      volumeMultiplier: volMult,
      flags: [],
      cumulativeMoves: { fiveDay: null, twentyDay: null, sixtyDay: null }
    };
  }
};

function getSentimentFromLabel(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('growth') || l.includes('upside') || l.includes('recovery')) return 'BULLISH';
  if (l.includes('risk') || l.includes('downside') || l.includes('disruption')) return 'BEARISH';
  return 'NEUTRAL';
}
