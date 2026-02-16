#!/usr/bin/env node
/**
 * validate-coverage.js — Coverage Universe Consistency Checker
 *
 * Verifies all active tickers in the central registry are properly registered
 * across all data sources: index.html (FRESHNESS_DATA, REFERENCE_DATA, STOCK_DATA),
 * data/stocks/*.json, and data files.
 *
 * Usage: node scripts/validate-coverage.js
 */

const fs = require('fs');
const path = require('path');
const { loadRegistry, getActiveTickers } = require('./lib/registry');

const ROOT = path.join(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'index.html');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

function main() {
  console.log('=== Continuum Intelligence — Coverage Validation ===\n');

  const registry = loadRegistry();
  const activeTickers = getActiveTickers();
  const html = fs.readFileSync(INDEX_PATH, 'utf8');

  let errors = 0;
  let warnings = 0;

  console.log(`Registry: ${activeTickers.length} active tickers\n`);

  for (const ticker of activeTickers) {
    const checks = [];

    // 1. FRESHNESS_DATA
    const hasFreshness = html.includes(`"${ticker}"`) && html.indexOf(`"${ticker}"`) < html.indexOf('END FRESHNESS_DATA');
    checks.push({ name: 'FRESHNESS_DATA', ok: hasFreshness });

    // 2. REFERENCE_DATA
    const hasReference = html.includes(`${ticker}: {`) && html.indexOf(`${ticker}: {`) < html.indexOf('END REFERENCE_DATA');
    checks.push({ name: 'REFERENCE_DATA', ok: hasReference });

    // 3. STOCK_DATA
    const hasStockData = html.includes(`STOCK_DATA.${ticker} =`);
    checks.push({ name: 'STOCK_DATA', ok: hasStockData });

    // 4. Stock JSON file
    const jsonPath = path.join(STOCKS_DIR, `${ticker}.json`);
    const hasJSON = fs.existsSync(jsonPath);
    checks.push({ name: 'data/stocks/*.json', ok: hasJSON });

    // Report
    const allOk = checks.every(c => c.ok);
    const failedChecks = checks.filter(c => !c.ok).map(c => c.name);

    if (allOk) {
      console.log(`  [OK] ${ticker} (${registry.tickers[ticker].company})`);
    } else {
      console.log(`  [FAIL] ${ticker} — missing: ${failedChecks.join(', ')}`);
      errors += failedChecks.length;
    }
  }

  // Cross-check: find STOCK_DATA entries not in registry
  console.log('\nCross-checking index.html for unregistered stocks...');
  const stockDataMatches = html.match(/STOCK_DATA\.([A-Z]+)\s*=/g) || [];
  const stockDataTickers = stockDataMatches.map(m => m.match(/STOCK_DATA\.([A-Z]+)/)[1]);
  const uniqueStockTickers = [...new Set(stockDataTickers)];

  for (const ticker of uniqueStockTickers) {
    if (!registry.tickers[ticker]) {
      console.log(`  [WARN] STOCK_DATA.${ticker} exists in index.html but not in registry`);
      warnings++;
    }
  }

  // Summary
  console.log(`\n=== Results ===`);
  console.log(`  Active tickers: ${activeTickers.length}`);
  console.log(`  STOCK_DATA entries in index.html: ${uniqueStockTickers.length}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Warnings: ${warnings}`);

  if (errors > 0) {
    console.log('\nValidation FAILED — fix missing registrations above.');
    process.exit(1);
  } else {
    console.log('\nValidation PASSED.');
  }
}

main();
