#!/usr/bin/env node
/**
 * validate-coverage.js — Coverage Universe Consistency Checker
 *
 * Verifies all active tickers in the central registry are properly registered
 * across all data sources: data/research/*.json, data/stocks/*.json,
 * data/freshness.json, and data/reference.json.
 *
 * Usage: node scripts/validate-coverage.js
 */

const fs = require('fs');
const path = require('path');
const { loadRegistry, getActiveTickers } = require('./lib/registry');

const ROOT = path.join(__dirname, '..');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const FRESHNESS_PATH = path.join(ROOT, 'data', 'freshness.json');
const REFERENCE_PATH = path.join(ROOT, 'data', 'reference.json');

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function main() {
  console.log('=== Continuum Intelligence -- Coverage Validation ===\n');

  const registry = loadRegistry();
  const activeTickers = getActiveTickers();

  // Load JSON data files
  const freshness = readJson(FRESHNESS_PATH) || {};
  const reference = readJson(REFERENCE_PATH) || {};

  let errors = 0;
  let warnings = 0;

  console.log(`Registry: ${activeTickers.length} active tickers\n`);

  for (const ticker of activeTickers) {
    const checks = [];

    // 1. Freshness data
    const hasFreshness = freshness[ticker] != null;
    checks.push({ name: 'data/freshness.json', ok: hasFreshness });

    // 2. Reference data
    const hasReference = reference[ticker] != null;
    checks.push({ name: 'data/reference.json', ok: hasReference });

    // 3. Research JSON file
    const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
    const hasResearch = fs.existsSync(researchPath);
    checks.push({ name: 'data/research/*.json', ok: hasResearch });

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
      console.log(`  [FAIL] ${ticker} -- missing: ${failedChecks.join(', ')}`);
      errors += failedChecks.length;
    }
  }

  // Cross-check: find research JSON entries not in registry
  console.log('\nCross-checking data/research/ for unregistered stocks...');
  try {
    const researchFiles = fs.readdirSync(RESEARCH_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'));
    const researchTickers = researchFiles.map(f => f.replace('.json', ''));

    for (const ticker of researchTickers) {
      if (!registry.tickers[ticker]) {
        console.log(`  [WARN] data/research/${ticker}.json exists but ${ticker} not in registry`);
        warnings++;
      }
    }
  } catch (e) {
    console.log(`  [WARN] Could not read research directory: ${e.message}`);
  }

  // Summary
  console.log(`\n=== Results ===`);
  console.log(`  Active tickers: ${activeTickers.length}`);
  try {
    const researchCount = fs.readdirSync(RESEARCH_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_')).length;
    console.log(`  Research JSON files: ${researchCount}`);
  } catch (e) {
    // ignore
  }
  console.log(`  Errors: ${errors}`);
  console.log(`  Warnings: ${warnings}`);

  if (errors > 0) {
    console.log('\nValidation FAILED -- fix missing registrations above.');
    process.exit(1);
  } else {
    console.log('\nValidation PASSED.');
  }
}

main();
