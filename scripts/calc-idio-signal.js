#!/usr/bin/env node
/**
 * Continuum Intelligence — Calculate Idiosyncratic (Company) Signal
 *
 * Reads hypothesis data from data/research/*.json, applies the v3
 * normalisation (floor 5, ceiling 80, scale to 100%), then computes:
 *
 *   idio_signal = sum(upside normalised weights) - sum(downside normalised weights)
 *
 * Neutral hypotheses contribute zero. No sqrt amplification.
 *
 * Writes results to data/stocks/*.json under `three_layer_signal.company_signal`
 * and `risk_skew`.
 *
 * Usage:
 *   node scripts/calc-idio-signal.js
 *   node scripts/calc-idio-signal.js --verbose
 *   node scripts/calc-idio-signal.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { getActiveTickers } = require('./lib/registry');
const { computeSkewScore, sentimentLabel } = require('../js/dne/normalise');

// ── Paths ────────────────────────────────────────────────────────────
const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
const STOCKS_DIR   = path.join(__dirname, '..', 'data', 'stocks');

// ── CLI flags ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const DRY_RUN = args.includes('--dry-run');

// ── Main ─────────────────────────────────────────────────────────────
function main() {
  console.log('=== Continuum Intelligence — Calc Idio Signal (v3 Net Formula) ===\n');
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
 * Process a single stock: read research hypotheses, compute signal, write to stock JSON.
 */
function processStock(ticker) {
  // ── Read research JSON (has hypotheses as array with direction + score) ──
  const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
  if (!fs.existsSync(researchPath)) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no research JSON`);
    return false;
  }

  const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));

  // Research JSON stores hypotheses under .report.hypotheses (array) or .hypotheses (array)
  let hypotheses = null;
  if (research.report && Array.isArray(research.report.hypotheses)) {
    hypotheses = research.report.hypotheses;
  } else if (Array.isArray(research.hypotheses)) {
    hypotheses = research.hypotheses;
  }

  if (!hypotheses || hypotheses.length === 0) {
    if (VERBOSE) console.log(`  [SKIP] ${ticker}: no hypothesis data in research JSON`);
    return false;
  }

  // ── Compute skew score using shared normalisation ──
  const skewResult = computeSkewScore({ hypotheses });
  const label = sentimentLabel(skewResult.score);

  if (VERBOSE) {
    console.log(`  ${ticker}: score=${skewResult.score} (bull=${skewResult.bull}, bear=${skewResult.bear}) => ${label}`);
    for (const h of skewResult.hypotheses) {
      const sign = h.direction === 'upside' ? '+' : h.direction === 'downside' ? '-' : ' ';
      console.log(`    ${h.title}: ${sign}${h.weight}% (${h.direction})`);
    }
  }

  // ── Read existing stock JSON ──
  const stockPath = path.join(STOCKS_DIR, `${ticker}.json`);
  let stock = {};
  if (fs.existsSync(stockPath)) {
    stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
  }

  // ── Write signal data ──
  if (!stock.three_layer_signal) {
    stock.three_layer_signal = {};
  }

  stock.three_layer_signal.company_signal = skewResult.score;
  stock.three_layer_signal.company_detail = {
    method: 'net_hypothesis_weights',
    bull: skewResult.bull,
    bear: skewResult.bear,
    direction: skewResult.direction,
    hypotheses: skewResult.hypotheses,
    computed_at: new Date().toISOString()
  };

  // Write risk_skew label for PDF and other consumers
  stock.risk_skew = label;

  if (!DRY_RUN) {
    fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2) + '\n', 'utf8');
    if (VERBOSE) console.log(`    => wrote ${stockPath}`);
  }

  return true;
}

// ── Run ──────────────────────────────────────────────────────────────
main();
