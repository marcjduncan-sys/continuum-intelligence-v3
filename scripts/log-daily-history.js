#!/usr/bin/env node
/**
 * log-daily-history.js
 *
 * Continuum Intelligence — Daily Narrative History Logger
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md (Phase 1.3)
 *
 * For each stock in coverage, appends a daily snapshot to
 * data/stocks/{TICKER}-history.json containing:
 *   - date, price, daily_change_pct, volume_ratio
 *   - three-layer signals: macro_signal, sector_signal, idio_signal, overall_sentiment
 *     (null until Phase 2 calculators are built; slots preserved in schema)
 *   - all hypothesis scores and ranks
 *   - dominant narrative ID, narrative_flip flag
 *   - any events from the events pipeline
 *   - reconstructed: false (true only for backfilled historical entries)
 *
 * Usage:
 *   node scripts/log-daily-history.js [--date YYYY-MM-DD] [--dry-run]
 *
 * Called by the daily GitHub Action after prices and scores are updated.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const LIVE_PRICES_PATH = path.join(ROOT, 'data', 'live-prices.json');

// ── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const dateIdx = args.indexOf('--date');
const dateOverride = dateIdx !== -1 && args[dateIdx + 1] ? args[dateIdx + 1] : null;

// ── v3 framework: normalise with floor/ceiling ──────────────────────────────

function normaliseWithFloorCeiling(rawScores) {
  // rawScores: array of numbers (raw survival scores)
  // Returns: array of normalised scores summing to 100, floor 5, ceiling 80
  const FLOOR = 5;
  const CEILING = 80;

  if (!rawScores || rawScores.length === 0) return [];

  // Clamp to floor/ceiling
  let clamped = rawScores.map(s => Math.max(FLOOR, Math.min(CEILING, s)));

  // Normalise to sum to 100
  let sum = clamped.reduce((a, b) => a + b, 0);
  if (sum === 0) return clamped.map(() => Math.round(100 / clamped.length));

  let normalised = clamped.map(s => (s / sum) * 100);

  // Round and ensure sum = 100
  let rounded = normalised.map(s => Math.round(s));
  let roundedSum = rounded.reduce((a, b) => a + b, 0);
  if (roundedSum !== 100) {
    // Adjust largest value to compensate
    let maxIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      if (rounded[i] > rounded[maxIdx]) maxIdx = i;
    }
    rounded[maxIdx] += (100 - roundedSum);
  }

  return rounded;
}

// ── Compute thesis skew per v3 Principle 5 ──────────────────────────────────

function computeThesisSkew(hypotheses) {
  // hypotheses: array of { sentiment, survival_score }
  let bull = 0, bear = 0;
  for (const h of hypotheses) {
    const s = h.survival_score;
    if (h.sentiment === 'BULLISH') {
      bull += s;
    } else if (h.sentiment === 'BEARISH') {
      bear += s;
    } else {
      // NEUTRAL: split 50/50
      bull += s / 2;
      bear += s / 2;
    }
  }
  bull = Math.round(bull);
  bear = Math.round(bear);
  const score = bull - bear;
  const label = score > 5 ? 'UPSIDE' : score < -5 ? 'DOWNSIDE' : 'NEUTRAL';
  return { score, label, bull, bear };
}

// ── Determine sentiment from research data direction field ──────────────────

function mapDirection(dir) {
  if (dir === 'upside') return 'BULLISH';
  if (dir === 'downside') return 'BEARISH';
  return 'NEUTRAL';
}

// ── Price evidence classification per v3 ────────────────────────────────────

function classifyDailyMove(pct) {
  const abs = Math.abs(pct);
  if (abs < 2) return 'NOISE';
  if (abs < 5) return 'NOTABLE';
  if (abs < 10) return 'SIGNIFICANT';
  return 'MATERIAL';
}

// ── Build a daily snapshot for one stock ─────────────────────────────────────

function buildSnapshot(ticker, date, researchData, stocksData, livePrices) {
  // Merge data from both sources
  const research = researchData;
  const stocks = stocksData;

  // Current price: prefer live-prices, fall back to research, then stocks
  let price = null;
  if (livePrices && livePrices[ticker + '.AX']) {
    price = livePrices[ticker + '.AX'].price || livePrices[ticker + '.AX'];
  }
  if (price === null && research) price = research.price;
  if (price === null && stocks) price = stocks.current_price;

  // Prior price from priceHistory
  const priceHistory = research ? research.priceHistory : (stocks ? stocks.price_history : []);
  const priorPrice = priceHistory && priceHistory.length >= 2
    ? priceHistory[priceHistory.length - 2]
    : null;
  const dailyChangePct = (price !== null && priorPrice !== null && priorPrice !== 0)
    ? Math.round(((price - priorPrice) / priorPrice) * 10000) / 100
    : 0;

  // Volume ratio (from live prices if available)
  let volumeRatio = 1.0;
  if (livePrices && livePrices[ticker + '.AX'] && livePrices[ticker + '.AX'].volumeRatio) {
    volumeRatio = livePrices[ticker + '.AX'].volumeRatio;
  }

  // Build hypothesis array from research data (primary) and stocks data (secondary)
  const hypotheses = [];

  if (research && research.hypotheses && research.hypotheses.length > 0) {
    // Use research data hypotheses with raw scores
    const rawScores = research.hypotheses.map(h => parseInt(h.score) || 0);
    const normScores = normaliseWithFloorCeiling(rawScores);

    for (let i = 0; i < research.hypotheses.length; i++) {
      const rh = research.hypotheses[i];
      const id = rh.tier ? rh.tier.toUpperCase() : 'H' + (i + 1);
      const name = (rh.title || '').replace(/^T\d:\s*/, '');
      const sentiment = mapDirection(rh.direction);
      hypotheses.push({
        id: id,
        name: name,
        sentiment: sentiment,
        survival_score: normScores[i],
        rank: 0, // assigned after sorting
        inconsistency_count: 0 // populated when evidence matrix is built (Phase 3)
      });
    }
  } else if (stocks && stocks.hypotheses) {
    // Fall back to stocks data
    const keys = Object.keys(stocks.hypotheses);
    const rawScores = keys.map(k => Math.round((stocks.hypotheses[k].survival_score || 0) * 100));
    const normScores = normaliseWithFloorCeiling(rawScores);

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const sh = stocks.hypotheses[k];
      hypotheses.push({
        id: k,
        name: sh.label || k,
        sentiment: inferSentiment(k, sh),
        survival_score: normScores[i],
        rank: 0,
        inconsistency_count: Math.round(sh.weighted_inconsistency || 0)
      });
    }
  }

  // Sort by survival_score descending and assign ranks
  hypotheses.sort((a, b) => b.survival_score - a.survival_score);
  for (let i = 0; i < hypotheses.length; i++) {
    hypotheses[i].rank = i + 1;
  }

  // Determine dominant narrative (T1 = rank 1)
  const dominant = hypotheses.length > 0 ? hypotheses[0].id : null;

  // Compute thesis skew
  const skew = computeThesisSkew(hypotheses);

  // Collect events for today from the events directory
  const events = loadEventsForDate(date);

  // Price move classification
  const priceClassification = classifyDailyMove(dailyChangePct);

  return {
    date: date,
    price: price,
    daily_change_pct: dailyChangePct,
    volume_ratio: Math.round(volumeRatio * 100) / 100,
    // Three-layer signals — null until Phase 2 calculators populate these fields.
    // Schema is locked here; downstream writers merge by key without touching others.
    macro_signal:      null,
    sector_signal:     null,
    idio_signal:       null,
    overall_sentiment: null,
    price_classification: priceClassification,
    hypotheses: hypotheses,
    thesis_skew: skew.score,
    thesis_skew_label: skew.label,
    dominant_narrative: dominant,
    narrative_flip: false, // set by flip detection below
    flip_detail: null,
    events: events,
    overcorrection_active: false,
    reconstructed: false
  };
}

// ── Infer sentiment from stocks data ────────────────────────────────────────

function inferSentiment(key, hyp) {
  const label = (hyp.label || '').toLowerCase();
  if (label.includes('growth') || label.includes('recovery') || label.includes('upside')) return 'BULLISH';
  if (label.includes('risk') || label.includes('downside') || label.includes('disruption') || label.includes('compression')) return 'BEARISH';
  if (key === 'T1' || key === 'T2') return 'BULLISH'; // T1/T2 in stocks data tend to be positive
  return 'BEARISH';
}

// ── Load events for a specific date ─────────────────────────────────────────

function loadEventsForDate(date) {
  const eventsPath = path.join(ROOT, 'data', 'events', date + '.json');
  if (fs.existsSync(eventsPath)) {
    try {
      return JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
}

// ── Detect narrative flips ──────────────────────────────────────────────────

function detectFlip(ticker, snapshot, historyData) {
  if (!historyData || !historyData.history || historyData.history.length === 0) return;

  const prior = historyData.history[historyData.history.length - 1];
  if (prior.dominant_narrative !== snapshot.dominant_narrative) {
    snapshot.narrative_flip = true;

    // Find the old and new T1 details
    const oldT1 = prior.hypotheses.find(h => h.rank === 1);
    const newT1 = snapshot.hypotheses.find(h => h.rank === 1);

    snapshot.flip_detail = {
      from: { id: prior.dominant_narrative, name: oldT1 ? oldT1.name : prior.dominant_narrative, score_at_flip: oldT1 ? oldT1.survival_score : null },
      to: { id: snapshot.dominant_narrative, name: newT1 ? newT1.name : snapshot.dominant_narrative, score_at_flip: newT1 ? newT1.survival_score : null },
      trigger: determineTrigger(snapshot)
    };

    // Also append to flips array
    if (!historyData.flips) historyData.flips = [];
    historyData.flips.push({
      date: snapshot.date,
      from: snapshot.flip_detail.from,
      to: snapshot.flip_detail.to,
      trigger: snapshot.flip_detail.trigger,
      price_on_day: snapshot.price,
      price_change_pct: snapshot.daily_change_pct
    });
  }
}

function determineTrigger(snapshot) {
  // Best effort: use events if available, otherwise use price classification
  if (snapshot.events && snapshot.events.length > 0) {
    const first = snapshot.events[0];
    return first.summary || first.description || first.type || 'Event-driven';
  }
  if (snapshot.price_classification === 'MATERIAL') {
    return 'Material price move of ' + snapshot.daily_change_pct + '%';
  }
  if (snapshot.price_classification === 'SIGNIFICANT') {
    return 'Significant price move of ' + snapshot.daily_change_pct + '%';
  }
  return 'Score recalculation';
}

// ── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Daily History Logger');
  console.log('══════════════════════════════════════════════════════════════');

  // Determine date
  const today = dateOverride || new Date().toISOString().split('T')[0];
  console.log('  Date:', today);
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
    } catch (e) { /* skip */ }
  }

  let logged = 0;
  let flips = 0;

  for (const ticker of tickers) {
    // Load research data
    let researchData = null;
    const researchPath = path.join(RESEARCH_DIR, ticker + '.json');
    if (fs.existsSync(researchPath)) {
      try {
        researchData = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
      } catch (e) {
        console.warn('  [WARN] Failed to parse research data for', ticker);
      }
    }

    // Load stocks data
    let stocksData = null;
    const stocksPath = path.join(STOCKS_DIR, ticker + '.json');
    if (fs.existsSync(stocksPath)) {
      try {
        stocksData = JSON.parse(fs.readFileSync(stocksPath, 'utf8'));
      } catch (e) {
        console.warn('  [WARN] Failed to parse stocks data for', ticker);
      }
    }

    if (!researchData && !stocksData) {
      console.warn('  [SKIP]', ticker, '— no research or stocks data');
      continue;
    }

    // Load or initialise history file
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');
    let historyData;
    if (fs.existsSync(historyPath)) {
      try {
        historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      } catch (e) {
        historyData = { ticker: ticker, history: [], flips: [] };
      }
    } else {
      historyData = { ticker: ticker, history: [], flips: [] };
    }

    // Check for duplicate date — skip if already logged today
    const alreadyLogged = historyData.history.some(h => h.date === today);
    if (alreadyLogged) {
      console.log('  [SKIP]', ticker, '— already logged for', today);
      continue;
    }

    // Build snapshot
    const snapshot = buildSnapshot(ticker, today, researchData, stocksData, livePrices);

    // Detect narrative flips
    detectFlip(ticker, snapshot, historyData);

    if (snapshot.narrative_flip) {
      flips++;
      console.log('  [FLIP]', ticker, ':', snapshot.flip_detail.from.id, '→', snapshot.flip_detail.to.id);
    }

    // Append snapshot
    historyData.history.push(snapshot);

    // Write history file
    if (!dryRun) {
      fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
    }

    logged++;
    const arrow = snapshot.daily_change_pct > 0 ? '↑' : snapshot.daily_change_pct < 0 ? '↓' : '→';
    const sentStr = snapshot.overall_sentiment !== null
      ? '| Sentiment: ' + snapshot.overall_sentiment
      : '| Sentiment: (pending Ph2)';
    console.log('  [LOG]', ticker, ':', snapshot.price, arrow, snapshot.daily_change_pct + '%',
      '| T1:', snapshot.dominant_narrative, sentStr);
  }

  console.log('');
  console.log('  Logged:', logged, 'stocks');
  console.log('  Narrative flips:', flips);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

main();
