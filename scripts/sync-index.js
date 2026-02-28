#!/usr/bin/env node
/**
 * sync-index.js
 *
 * Rebuilds data/research/_index.json from individual data/research/TICKER.json files.
 * Ensures the homepage coverage cards always reflect the latest research data
 * (date, price, verdict, skew, metrics, etc.) without requiring a separate update path.
 *
 * Usage: node scripts/sync-index.js
 * Called by: update-daily.yml (after orchestrator + analysis steps)
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
const INDEX_PATH = path.join(RESEARCH_DIR, '_index.json');

// Fields to extract from each full research JSON into the index entry.
// This must match what the frontend expects in STOCK_DATA for home page rendering.
const INDEX_FIELDS = [
  'ticker', 'tickerFull', 'exchange', 'company', 'sector', 'sectorSub',
  'price', 'currency', 'date', 'reportId', 'priceHistory',
  'heroDescription', 'heroCompanyDescription', 'heroMetrics',
  'skew', 'verdict', 'featuredMetrics', 'featuredPriceColor', 'featuredRationale',
  'hypotheses', 'identity', 'footer'
];

function main() {
  // Read existing index to preserve any tickers whose full JSON might be missing
  let existingIndex = {};
  try {
    existingIndex = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
  } catch (e) {
    console.warn('[sync-index] Could not read existing _index.json, starting fresh');
  }

  const files = fs.readdirSync(RESEARCH_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'));

  let updated = 0;
  let errors = 0;

  for (const file of files) {
    const ticker = file.replace('.json', '');
    try {
      const fullData = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf-8'));

      // Build index entry by extracting only the fields the frontend needs
      const entry = {};
      for (const field of INDEX_FIELDS) {
        if (fullData[field] !== undefined) {
          entry[field] = fullData[field];
        }
      }

      // Only update if we got at least ticker and date
      if (entry.ticker && entry.date) {
        existingIndex[ticker] = entry;
        updated++;
      } else {
        console.warn(`[sync-index] Skipping ${ticker}: missing ticker or date field`);
      }
    } catch (e) {
      console.error(`[sync-index] Error reading ${file}: ${e.message}`);
      errors++;
    }
  }

  // Write the rebuilt index
  fs.writeFileSync(INDEX_PATH, JSON.stringify(existingIndex, null, 2), 'utf-8');
  console.log(`[sync-index] Rebuilt _index.json: ${updated} tickers updated, ${errors} errors`);

  process.exit(errors > 0 ? 1 : 0);
}

main();
