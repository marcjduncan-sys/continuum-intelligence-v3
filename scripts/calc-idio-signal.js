#!/usr/bin/env node
/**
 * calc-idio-signal.js
 *
 * Continuum Intelligence — Phase 2.3: Idiosyncratic Signal Calculator
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md
 *
 * Reads each stock's most recent history entry (hypothesis scores and
 * sentiments). Computes Idio_Signal via T1-vs-T2 dominance method.
 * Writes per-stock results to data/idio-signals.json.
 *
 * T1-vs-T2 dominance with square-root amplification (ERRATA_002).
 * sqrt scaling gives small leads meaningful voice without over-convicting.
 * Example: WDS T1 BULLISH 29, T2 25 → lead=4 → sqrt(4/75)x80 = +18.5→+19
 *
 * Usage:
 *   node scripts/calc-idio-signal.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR   = path.join(ROOT, 'data', 'stocks');
const OUTPUT_PATH  = path.join(ROOT, 'data', 'idio-signals.json');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');

const MAX_POSSIBLE_LEAD = 75; // ceiling(80) - floor(5)
const CAP               = 80; // spec: cap Idio_Signal at ±80

// ── Core formula (ERRATA_002: square-root amplification) ─────────────────────
//
// Idio_Signal = sign(T1.sentiment) × sqrt(T1_lead / MAX_POSSIBLE_LEAD) × 80
//
// Why sqrt: typical T1-T2 leads are 3-15 points. Linear mapping compresses
// these into ±4 to ±20 — crushed by even modest sector signals.
// Sqrt amplifies small leads (where differentiation matters most) and
// flattens at high leads (diminishing returns on conviction).
//
// Lead →  3: ±16.0   Lead →  8: ±26.1   Lead → 15: ±35.8
// Lead →  5: ±20.7   Lead → 12: ±32.0   Lead → 25: ±46.2

function calcIdioSignal(hypotheses) {
  if (!hypotheses || hypotheses.length === 0) {
    return { signal: 0, detail: 'no_hypotheses' };
  }

  // Sort by survival_score descending — T1 is highest, T2 is second
  const sorted = [...hypotheses].sort((a, b) => b.survival_score - a.survival_score);
  const T1 = sorted[0];
  const T2 = sorted[1];

  if (!T2) {
    // Single hypothesis — full conviction
    const signal = T1.sentiment === 'BULLISH' ?  CAP
                 : T1.sentiment === 'BEARISH' ? -CAP
                 : 0;
    return { signal, detail: 'single_hypothesis', T1: T1.id, T1_sentiment: T1.sentiment };
  }

  const lead    = T1.survival_score - T2.survival_score;
  const sqrtRaw = Math.sqrt(lead / MAX_POSSIBLE_LEAD) * 80;

  let signal;
  if (T1.sentiment === 'BULLISH')      signal =  sqrtRaw;
  else if (T1.sentiment === 'BEARISH') signal = -sqrtRaw;
  else                                 signal =  0;

  signal = Math.max(-CAP, Math.min(CAP, Math.round(signal)));

  return {
    signal,
    detail:       'dominance_sqrt',
    T1:           T1.id,
    T1_score:     T1.survival_score,
    T1_sentiment: T1.sentiment,
    T2:           T2.id,
    T2_score:     T2.survival_score,
    lead,
    raw_signal:   Math.round(sqrtRaw * 10) / 10
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers)
    .filter(t => tickerConfig.tickers[t].status === 'active');

  const results = {};
  const date = new Date().toISOString().split('T')[0];

  for (const ticker of tickers) {
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');
    if (!fs.existsSync(historyPath)) continue;

    let historyData;
    try {
      historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      console.warn('[calc-idio-signal] Cannot read', ticker, 'history:', e.message);
      continue;
    }

    const history = historyData.history;
    if (!history || history.length === 0) continue;

    // Use today's entry if it has hypotheses, otherwise walk back to find
    // the most recent entry with a non-empty hypothesis array.
    // (Today's entry may have been logged before hypotheses were populated.)
    const todayEntry = history.find(e => e.date === date);
    const entryWithHyps = (todayEntry && (todayEntry.hypotheses || []).length > 0)
      ? todayEntry
      : [...history].reverse().find(e => (e.hypotheses || []).length > 0)
        || history[history.length - 1];

    const hypotheses = entryWithHyps.hypotheses || [];
    const result     = calcIdioSignal(hypotheses);

    results[ticker] = {
      idio_signal: result.signal,
      date:        todayEntry.date,
      detail:      result
    };

    if (verbose) {
      console.log(' ', ticker.padEnd(6),
        '| T1:', (result.T1 || '-').padEnd(3), (result.T1_sentiment || '').padEnd(7),
        '| lead:', String(result.lead ?? '-').padStart(4),
        '| Idio_Signal:', String(result.signal).padStart(4));
    }
  }

  const output = {
    date:        date,
    computed_at: new Date().toISOString(),
    signals:     results
  };

  if (!dryRun) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  }

  const count = Object.keys(results).length;
  console.log('[calc-idio-signal] Idio signals computed for', count, 'stocks',
    dryRun ? '(dry-run)' : '→ data/idio-signals.json');

  return results;
}

module.exports = { main, calcIdioSignal };
main();
