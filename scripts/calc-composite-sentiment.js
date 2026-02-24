#!/usr/bin/env node
/**
 * Continuum Intelligence — Calculate Composite Sentiment
 *
 * Sets overall_sentiment = company_signal (raw idio net score).
 * External signals (macro, sector, tech) are excluded for now and
 * will be re-added later as a separate layer.
 *
 * Reads `three_layer_signal.company_signal` written by calc-idio-signal.js,
 * then writes:
 *   - three_layer_signal.overall_sentiment  (= company_signal)
 *   - three_layer_signal.sentiment_label    (UPSIDE / DOWNSIDE / BALANCED)
 *   - three_layer_signal.method             ('company_only')
 *
 * Label thresholds aligned with front-end:
 *   > +5  => UPSIDE
 *   < -5  => DOWNSIDE
 *   else  => BALANCED
 *
 * Usage:
 *   node scripts/calc-composite-sentiment.js
 *   node scripts/calc-composite-sentiment.js --verbose
 *   node scripts/calc-composite-sentiment.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { getActiveTickers } = require('./lib/registry');
const { sentimentLabel } = require('../js/dne/normalise');

// ── Paths ────────────────────────────────────────────────────────────
const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');

// ── CLI flags ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  console.log('=== Continuum Intelligence — Calc Composite Sentiment (Company Only) ===\n');
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
 * Process a single stock: read company signal, write overall sentiment.
 */
function processStock(ticker) {
  const stockPath = path.join(STOCKS_DIR, `${ticker}.json`);
  if (!fs.existsSync(stockPath)) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no stock JSON`);
    return false;
  }

  const stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));

  if (!stock.three_layer_signal || stock.three_layer_signal.company_signal === undefined) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no company_signal — run calc-idio-signal.js first`);
    return false;
  }

  const companySignal = stock.three_layer_signal.company_signal;

  // Stock research score only. External signals excluded for now.
  // When external signals are re-added, this is the function to update
  // (mirrors _computeOverallSentiment on the front-end).
  const raw = companySignal;

  const label = sentimentLabel(raw);

  if (VERBOSE) {
    console.log(`  ${ticker}: company_signal=${companySignal} => overall_sentiment=${raw} (${label})`);
  }

  // ── Write composite sentiment ──
  stock.three_layer_signal.overall_sentiment = raw;
  stock.three_layer_signal.sentiment_label = label;
  stock.three_layer_signal.method = 'company_only';
  stock.three_layer_signal.composite_computed_at = new Date().toISOString();

  // Legacy field: external signal components (zeroed out for now)
  stock.three_layer_signal.macro_signal = 0;
  stock.three_layer_signal.sector_signal = 0;
  stock.three_layer_signal.tech_signal = 0;
  stock.three_layer_signal.external_weight = 0;

  if (!DRY_RUN) {
    fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2) + '\n', 'utf8');
    if (VERBOSE) console.log(`    => wrote ${stockPath}`);
  }

  return true;
}

// ── Run ──────────────────────────────────────────────────────────────
main();
