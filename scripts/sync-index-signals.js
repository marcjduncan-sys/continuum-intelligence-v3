#!/usr/bin/env node
/**
 * sync-index-signals.js
 *
 * Continuum Intelligence — Data Consistency
 *
 * Syncs narrative_weights and three_layer_signal from data/stocks/*.json
 * into data/research/_index.json so tile scores always match report pages.
 *
 * Root cause this prevents: _index.json entries missing narrative_weights
 * cause _computeCompanyContrib() to fall back to w=0.80, inflating tile
 * scores vs the report page (which loads data/stocks/TICKER.json with
 * the correct weight).
 *
 * Run AFTER calc-composite-sentiment.js in the daily pipeline.
 *
 * Usage: node scripts/sync-index-signals.js [--dry-run] [--verbose]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'data', 'research', '_index.json');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');

function main() {
  let index;
  try {
    index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch (e) {
    console.error('[sync-index-signals] Cannot read _index.json:', e.message);
    process.exit(1);
  }

  const tickers = Object.keys(index);
  let updated = 0, missing = 0, errors = 0;

  for (const ticker of tickers) {
    const stockPath = path.join(STOCKS_DIR, ticker + '.json');

    if (!fs.existsSync(stockPath)) {
      if (verbose) console.log(' ', ticker, '— no stock file, skipping');
      missing++;
      continue;
    }

    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (e) {
      console.error('[sync-index-signals] Cannot read', ticker + '.json:', e.message);
      errors++;
      continue;
    }

    let changed = false;

    // Sync narrative_weights (required for correct tile company weight)
    if (stock.narrative_weights && stock.narrative_weights.company != null) {
      index[ticker].narrative_weights = stock.narrative_weights;
      changed = true;
    }

    // Sync three_layer_signal (keeps macro/sector/tech contributions current)
    if (stock.three_layer_signal) {
      index[ticker].three_layer_signal = stock.three_layer_signal;
      changed = true;
    }

    if (changed) {
      updated++;
      if (verbose) {
        const s = stock.three_layer_signal || {};
        console.log(' ', ticker.padEnd(6),
          '| weights.company:', (stock.narrative_weights || {}).company,
          '| overall_sentiment:', s.overall_sentiment,
          '| label:', s.sentiment_label);
      }
    }
  }

  if (!dryRun) {
    try {
      fs.writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), 'utf8');
    } catch (e) {
      console.error('[sync-index-signals] Cannot write _index.json:', e.message);
      process.exit(1);
    }
  }

  console.log('[sync-index-signals]',
    updated, 'synced |', missing, 'no stock file |', errors, 'errors',
    dryRun ? '(dry-run)' : '→ data/research/_index.json');
}

main();
