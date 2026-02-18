#!/usr/bin/env node
/**
 * backfill-history.js
 *
 * Continuum Intelligence — 60-Day Narrative History Backfill
 * Per NARRATIVE_TIMELINE_SPEC.md Option B (limited backfill from price data)
 *
 * Uses existing priceHistory arrays to retroactively calculate what
 * hypothesis survival scores WOULD have been if the engine had been running.
 * All backfilled entries are marked with "reconstructed": true.
 *
 * The price-as-evidence classification rules from NARRATIVE_FRAMEWORK_V3.md
 * are applied to generate synthetic daily snapshots.
 *
 * Usage:
 *   node scripts/backfill-history.js [--days 60] [--dry-run]
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const daysIdx = args.indexOf('--days');
const backfillDays = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1]) : 60;

// ── v3 framework: normalise with floor/ceiling ──────────────────────────────

function normaliseWithFloorCeiling(rawScores) {
  const FLOOR = 5;
  const CEILING = 80;
  if (!rawScores || rawScores.length === 0) return [];

  let clamped = rawScores.map(s => Math.max(FLOOR, Math.min(CEILING, s)));
  let sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return clamped.map(() => Math.round(100 / clamped.length));

  let normalised = clamped.map(s => (s / sum) * 100);
  let rounded = normalised.map(s => Math.round(s));
  let roundedSum = rounded.reduce((a, b) => a + b, 0);
  if (roundedSum !== 100) {
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[maxIdx]) maxIdx = i;
    }
    rounded[maxIdx] += (100 - roundedSum);
  }
  return rounded;
}

// ── Price-as-evidence classification (v3 framework) ─────────────────────────

function classifyDailyMove(pct) {
  const abs = Math.abs(pct);
  if (abs < 2) return { classification: 'NOISE', adjustment: 0 };
  if (abs < 5) return { classification: 'NOTABLE', adjustment: 2 };
  if (abs < 10) return { classification: 'SIGNIFICANT', adjustment: 5 };
  return { classification: 'MATERIAL', adjustment: 10 };
}

// ── Compute thesis skew ─────────────────────────────────────────────────────

function computeThesisSkew(hypotheses) {
  let bull = 0, bear = 0;
  for (const h of hypotheses) {
    if (h.sentiment === 'BULLISH') bull += h.survival_score;
    else if (h.sentiment === 'BEARISH') bear += h.survival_score;
    else { bull += h.survival_score / 2; bear += h.survival_score / 2; }
  }
  bull = Math.round(bull);
  bear = Math.round(bear);
  const score = bull - bear;
  return { score, label: score > 5 ? 'UPSIDE' : score < -5 ? 'DOWNSIDE' : 'NEUTRAL' };
}

// ── Map direction field to sentiment ────────────────────────────────────────

function mapDirection(dir) {
  if (dir === 'upside') return 'BULLISH';
  if (dir === 'downside') return 'BEARISH';
  return 'NEUTRAL';
}

// ── Generate trading dates (weekdays) counting back from a reference ────────

function generateTradingDates(refDate, count) {
  const dates = [];
  const d = new Date(refDate);
  // Start one day before refDate (refDate itself is the "live" entry)
  d.setDate(d.getDate() - 1);

  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) { // Skip weekends
      dates.unshift(d.toISOString().split('T')[0]);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

// ── Backfill one stock ──────────────────────────────────────────────────────

function backfillStock(ticker, researchData, backfillDays) {
  const priceHistory = researchData.priceHistory;
  if (!priceHistory || priceHistory.length < 10) {
    console.log('  [SKIP]', ticker, '— insufficient priceHistory (' + (priceHistory ? priceHistory.length : 0) + ')');
    return null;
  }

  // Get base hypothesis data
  const hyps = researchData.hypotheses;
  if (!hyps || hyps.length !== 4) {
    console.log('  [SKIP]', ticker, '— missing or incomplete hypotheses');
    return null;
  }

  // Base scores from research data (these are the "current" scores)
  const baseRawScores = hyps.map(h => parseInt(h.score) || 0);
  const baseNormScores = normaliseWithFloorCeiling(baseRawScores);
  const baseSentiments = hyps.map(h => mapDirection(h.direction));
  const baseNames = hyps.map(h => (h.title || '').replace(/^T\d:\s*/, ''));
  const baseIds = hyps.map(h => h.tier ? h.tier.toUpperCase() : 'H' + hyps.indexOf(h));

  // How many days can we actually backfill? Limited by priceHistory length.
  const availableDays = Math.min(backfillDays, priceHistory.length - 1);
  const tradingDates = generateTradingDates('2026-02-19', availableDays);

  // The priceHistory array's last entry corresponds to the most recent price.
  // We work backwards: priceHistory[len-1] = today, priceHistory[len-2] = yesterday, etc.
  const history = [];
  let prevFlipId = null;

  for (let i = 0; i < tradingDates.length; i++) {
    const date = tradingDates[i];
    // Price index: map backfill day to priceHistory position
    // tradingDates[0] is the oldest, tradingDates[length-1] is most recent
    // priceHistory offset: (length - availableDays - 1) + i
    const priceIdx = (priceHistory.length - availableDays - 1) + i;
    if (priceIdx < 0 || priceIdx >= priceHistory.length) continue;

    const price = priceHistory[priceIdx];
    const priorPrice = priceIdx > 0 ? priceHistory[priceIdx - 1] : price;
    const dailyChangePct = priorPrice !== 0
      ? Math.round(((price - priorPrice) / priorPrice) * 10000) / 100
      : 0;

    // Classify the move
    const moveClass = classifyDailyMove(dailyChangePct);

    // Apply price-as-evidence adjustments to base scores
    // Negative moves increase bearish, decrease bullish; positive moves do reverse
    const adjustedScores = [...baseNormScores];
    if (moveClass.adjustment > 0) {
      const direction = dailyChangePct > 0 ? 1 : -1; // +1 = positive move, -1 = negative move
      for (let j = 0; j < adjustedScores.length; j++) {
        if (baseSentiments[j] === 'BULLISH') {
          adjustedScores[j] += direction * moveClass.adjustment;
        } else if (baseSentiments[j] === 'BEARISH') {
          adjustedScores[j] -= direction * moveClass.adjustment;
        }
        // NEUTRAL: no adjustment unless material
        if (baseSentiments[j] === 'NEUTRAL' && moveClass.classification === 'MATERIAL') {
          adjustedScores[j] -= direction * Math.round(moveClass.adjustment / 2);
        }
      }
    }

    // Also apply cumulative trend evidence
    // 5-day rolling
    if (priceIdx >= 5) {
      const fiveDayPrice = priceHistory[priceIdx - 5];
      const fiveDayChange = fiveDayPrice !== 0 ? ((price - fiveDayPrice) / fiveDayPrice) * 100 : 0;
      if (Math.abs(fiveDayChange) > 10) {
        const dir5 = fiveDayChange > 0 ? 1 : -1;
        for (let j = 0; j < adjustedScores.length; j++) {
          if (baseSentiments[j] === 'BULLISH') adjustedScores[j] += dir5 * 3;
          else if (baseSentiments[j] === 'BEARISH') adjustedScores[j] -= dir5 * 3;
        }
      }
    }

    // 20-day rolling
    if (priceIdx >= 20) {
      const twentyDayPrice = priceHistory[priceIdx - 20];
      const twentyDayChange = twentyDayPrice !== 0 ? ((price - twentyDayPrice) / twentyDayPrice) * 100 : 0;
      if (Math.abs(twentyDayChange) > 15) {
        const dir20 = twentyDayChange > 0 ? 1 : -1;
        for (let j = 0; j < adjustedScores.length; j++) {
          if (baseSentiments[j] === 'BULLISH') adjustedScores[j] += dir20 * 5;
          else if (baseSentiments[j] === 'BEARISH') adjustedScores[j] -= dir20 * 5;
        }
      }
    }

    // Re-normalise with floor/ceiling
    const normScores = normaliseWithFloorCeiling(adjustedScores);

    // Build hypothesis array and sort by score
    const hypotheses = [];
    for (let j = 0; j < normScores.length; j++) {
      hypotheses.push({
        id: baseIds[j],
        name: baseNames[j],
        sentiment: baseSentiments[j],
        survival_score: normScores[j],
        rank: 0,
        inconsistency_count: 0
      });
    }
    hypotheses.sort((a, b) => b.survival_score - a.survival_score);
    for (let j = 0; j < hypotheses.length; j++) hypotheses[j].rank = j + 1;

    const dominant = hypotheses[0].id;
    const skew = computeThesisSkew(hypotheses);

    // Detect narrative flip vs prior entry
    let narrativeFlip = false;
    let flipDetail = null;
    if (prevFlipId !== null && prevFlipId !== dominant) {
      narrativeFlip = true;
      const oldH = hypotheses.find(h => h.id === prevFlipId);
      const newH = hypotheses[0];
      flipDetail = {
        from: { id: prevFlipId, name: oldH ? oldH.name : prevFlipId, score_at_flip: oldH ? oldH.survival_score : null },
        to: { id: dominant, name: newH.name, score_at_flip: newH.survival_score },
        trigger: 'Reconstructed from price-as-evidence (' + dailyChangePct + '% move)'
      };
    }
    prevFlipId = dominant;

    history.push({
      date: date,
      price: price,
      daily_change_pct: dailyChangePct,
      volume_ratio: 1.0, // No historical volume data available
      price_classification: moveClass.classification,
      hypotheses: hypotheses,
      thesis_skew: skew.score,
      thesis_skew_label: skew.label,
      dominant_narrative: dominant,
      narrative_flip: narrativeFlip,
      flip_detail: flipDetail,
      events: [],
      overcorrection_active: false,
      reconstructed: true
    });
  }

  // Build flips array
  const flips = history
    .filter(h => h.narrative_flip && h.flip_detail)
    .map(h => ({
      date: h.date,
      from: h.flip_detail.from,
      to: h.flip_detail.to,
      trigger: h.flip_detail.trigger,
      price_on_day: h.price,
      price_change_pct: h.daily_change_pct
    }));

  return { ticker: ticker, history: history, flips: flips };
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — 60-Day Narrative History Backfill');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Backfill days:', backfillDays);
  console.log('  Mode:', dryRun ? 'DRY RUN' : 'LIVE');

  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers).filter(t => tickerConfig.tickers[t].status === 'active');
  console.log('  Active tickers:', tickers.length);
  console.log('');

  let backfilled = 0;
  let totalFlips = 0;

  for (const ticker of tickers) {
    const researchPath = path.join(RESEARCH_DIR, ticker + '.json');
    if (!fs.existsSync(researchPath)) {
      console.log('  [SKIP]', ticker, '— no research data');
      continue;
    }

    const researchData = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
    const result = backfillStock(ticker, researchData, backfillDays);
    if (!result) continue;

    // Merge with existing history file (prepend backfill, keep live entries)
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');
    let existing = { ticker: ticker, history: [], flips: [] };
    if (fs.existsSync(historyPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      } catch (e) { /* use empty */ }
    }

    // Remove any existing reconstructed entries (re-backfill)
    const liveEntries = existing.history.filter(h => !h.reconstructed);
    const liveFlips = existing.flips.filter(f => {
      // Keep flips from live entries only
      return liveEntries.some(h => h.date === f.date);
    });

    // Merge: backfilled first, then live entries
    const merged = {
      ticker: ticker,
      history: [...result.history, ...liveEntries],
      flips: [...result.flips, ...liveFlips]
    };

    if (!dryRun) {
      fs.writeFileSync(historyPath, JSON.stringify(merged, null, 2), 'utf8');
    }

    backfilled++;
    totalFlips += result.flips.length;
    console.log('  [BACKFILL]', ticker, ':', result.history.length, 'days,', result.flips.length, 'flips');
  }

  console.log('');
  console.log('  Backfilled:', backfilled, 'stocks');
  console.log('  Total reconstructed flips:', totalFlips);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

main();
