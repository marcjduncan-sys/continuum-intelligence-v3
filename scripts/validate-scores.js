#!/usr/bin/env node
/**
 * validate-scores.js
 *
 * Continuum Intelligence — Score Consistency Validator
 *
 * Ensures that home page tile scores match research report page scores by
 * verifying that data/research/_index.json and data/stocks/TICKER.json
 * have the same narrative_weights and three_layer_signal contributions.
 *
 * Why this matters:
 *   - Home page tiles use _index.json (loaded synchronously at startup)
 *   - Report pages merge data/stocks/TICKER.json over _index.json data
 *   - Both use _computeOverallSentiment() dynamically:
 *       overall = mC + sC + tC + round(narrative_weights.company × skewScore)
 *   - If narrative_weights or contributions differ between the two sources,
 *     the tile will show a different score than the report page
 *
 * Checks per ticker:
 *   1. narrative_weights.company present in _index.json
 *   2. narrative_weights matches data/stocks/TICKER.json
 *   3. macro/sector/tech contributions match data/stocks/TICKER.json
 *
 * Exits 0 if all pass, 1 if any fail. Run AFTER sync-index-signals.js.
 *
 * Usage: node scripts/validate-scores.js [--verbose]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'data', 'research', '_index.json');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');

function main() {
  console.log('=== Continuum Intelligence — Score Consistency Validation ===\n');

  let index;
  try {
    index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    console.error('[validate-scores] Cannot read _index.json:', e.message);
    process.exit(1);
  }

  const tickers = Object.keys(index);
  let passed = 0, failed = 0, noStockFile = 0;

  for (const ticker of tickers) {
    const data     = index[ticker];
    const idxTls   = data.three_layer_signal || {};
    const idxWeights = data.narrative_weights || {};
    const issues   = [];

    // ── Check 1: narrative_weights.company must be present ──────────────────
    // Missing → tile falls back to w=0.80 (wrong default), inflating the score
    if (idxWeights.company == null) {
      issues.push('_index.json missing narrative_weights.company — tile will use wrong default w=0.80');
    }

    // ── Cross-file checks (requires data/stocks/TICKER.json) ────────────────
    const stockPath = path.join(STOCKS_DIR, ticker + '.json');
    if (!fs.existsSync(stockPath)) {
      // Can't cross-check without the stock file; warn but don't fail
      noStockFile++;
      if (verbose) console.log(`  [SKIP] ${ticker} — no data/stocks/${ticker}.json`);
      continue;
    }

    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (e) {
      issues.push(`Cannot read data/stocks/${ticker}.json: ${e.message}`);
    }

    if (stock) {
      const stWeights = stock.narrative_weights || {};
      const stTls     = stock.three_layer_signal || {};

      // ── Check 2: narrative_weights.company must match ───────────────────
      // Mismatch → tile and report use different weights → different company contribution
      if (idxWeights.company !== stWeights.company) {
        issues.push(
          `narrative_weights.company mismatch: _index=${idxWeights.company} stocks=${stWeights.company}`
        );
      }

      // ── Check 3: external signal contributions must match ───────────────
      // Mismatch → mC/sC/tC differ between tile and report → different overall
      const CONTRIB_FIELDS = ['macro_contribution', 'sector_contribution', 'tech_contribution'];
      for (const field of CONTRIB_FIELDS) {
        if (idxTls[field] !== stTls[field]) {
          issues.push(
            `${field} mismatch: _index=${idxTls[field]} stocks=${stTls[field]}`
          );
        }
      }
    }

    if (issues.length > 0) {
      failed++;
      console.log(`  [FAIL] ${ticker}`);
      issues.forEach(issue => console.log(`         → ${issue}`));
    } else {
      passed++;
      if (verbose) {
        const w   = idxWeights.company;
        const mC  = idxTls.macro_contribution  || 0;
        const sC  = idxTls.sector_contribution || 0;
        const tC  = idxTls.tech_contribution   || 0;
        console.log(`  [OK] ${ticker.padEnd(6)} w=${w} contributions=(${mC}+${sC}+${tC})`);
      } else {
        console.log(`  [OK] ${ticker}`);
      }
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Tickers checked  : ${tickers.length}`);
  console.log(`  Passed           : ${passed}`);
  console.log(`  Failed           : ${failed}`);
  if (noStockFile > 0) console.log(`  Skipped (no stock file) : ${noStockFile}`);

  if (failed > 0) {
    console.log('\nValidation FAILED — tile and report will show different scores.');
    console.log('Run: node scripts/sync-index-signals.js');
    process.exit(1);
  } else {
    console.log('\nValidation PASSED — tile scores will match report page scores.');
  }
}

main();
