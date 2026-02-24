#!/usr/bin/env node
/**
 * Continuum Intelligence — Calculate Valuation Range
 *
 * Uses the overall_sentiment from three_layer_signal to shift the
 * valuation centre estimate for each stock.
 *
 * MAGNITUDE NOTE (v3 simplification):
 *   Old sqrt formula produced signals in the ±0 to ±80 range.
 *   New net-hypothesis-weight formula produces signals in ±0 to ±100.
 *   Shift percentages below are calibrated for the ±100 range.
 *   If the shift feels too aggressive, scale by 0.8 (= 80/100).
 *
 * This script reads:
 *   - data/stocks/[TICKER].json  (three_layer_signal.overall_sentiment, current_price)
 *
 * And writes:
 *   - data/stocks/[TICKER].json  (valuation_range: { low, mid, high, shift_pct })
 *
 * Usage:
 *   node scripts/calc-valuation-range.js
 *   node scripts/calc-valuation-range.js --verbose
 *   node scripts/calc-valuation-range.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { getActiveTickers } = require('./lib/registry');

// ── Paths ────────────────────────────────────────────────────────────
const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');

// ── CLI flags ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');

// ── Configuration ────────────────────────────────────────────────────
// Maximum shift percentage (applies at score = ±100)
const MAX_SHIFT_PCT = 0.15;  // ±15% max shift from current price
// Range spread around the shifted midpoint
const RANGE_SPREAD = 0.10;   // ±10% around mid for low/high

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  console.log('=== Continuum Intelligence — Calc Valuation Range ===\n');
  if (DRY_RUN) console.log('  DRY RUN — no files will be written\n');

  const tickers = getActiveTickers();
  console.log(`  Active tickers: ${tickers.length}\n`);

  let updated = 0;
  let skipped = 0;
  let errors  = 0;

  for (const ticker of tickers) {
    try {
      const result = processStock(ticker);
      if (result) {
        updated++;
      } else {
        skipped++;
      }
    } catch (err) {
      console.error(`  [ERROR] ${ticker}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\n  Summary: ${updated} updated, ${skipped} skipped, ${errors} errors\n`);
}

/**
 * Process a single stock: compute valuation range from sentiment and price.
 */
function processStock(ticker) {
  const stockPath = path.join(STOCKS_DIR, `${ticker}.json`);
  if (!fs.existsSync(stockPath)) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no stock JSON`);
    return false;
  }

  const stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));

  const sentiment = stock.three_layer_signal && stock.three_layer_signal.overall_sentiment;
  const price = parseFloat(stock.current_price);

  if (sentiment === undefined || sentiment === null) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no overall_sentiment — run calc-composite-sentiment.js first`);
    return false;
  }

  if (!price || price <= 0) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no valid current_price`);
    return false;
  }

  // ── Compute shift ──
  // Signal range is ±100. Convert to a ±MAX_SHIFT_PCT proportional shift.
  // Clamp signal to ±100 for safety (theoretical max of new formula).
  const clampedSignal = Math.max(-100, Math.min(100, sentiment));
  const shiftPct = (clampedSignal / 100) * MAX_SHIFT_PCT;

  const mid  = price * (1 + shiftPct);
  const low  = mid * (1 - RANGE_SPREAD);
  const high = mid * (1 + RANGE_SPREAD);

  if (VERBOSE) {
    console.log(`  ${ticker}: price=$${price.toFixed(2)}, sentiment=${sentiment}, shift=${(shiftPct * 100).toFixed(1)}%`);
    console.log(`    => range: $${low.toFixed(2)} — $${mid.toFixed(2)} — $${high.toFixed(2)}`);
  }

  // ── Write valuation range ──
  stock.valuation_range = {
    low:  Math.round(low * 100) / 100,
    mid:  Math.round(mid * 100) / 100,
    high: Math.round(high * 100) / 100,
    shift_pct: Math.round(shiftPct * 10000) / 10000,
    signal_used: sentiment,
    method: 'sentiment_shift_v3',
    computed_at: new Date().toISOString()
  };

  if (!DRY_RUN) {
    fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2) + '\n', 'utf8');
    if (VERBOSE) console.log(`    => wrote ${stockPath}`);
  }

  return true;
}

// ── Run ──────────────────────────────────────────────────────────────
main();
