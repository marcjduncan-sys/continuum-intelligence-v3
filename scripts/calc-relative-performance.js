#!/usr/bin/env node
/**
 * calc-relative-performance.js
 *
 * Recalculates technicalAnalysis.relativePerformance for every stock in
 * data/research/*.json using a FIXED lookback from the most recent price.
 *
 * Benchmark returns are read from data/macro-factors.json (benchmark_returns
 * section) — identical for every stock on any given day. The stock's own
 * return is calculated from its priceHistory array using the same lookback.
 *
 * Run daily in the pipeline, after fetch-macro-factors.js.
 *
 * Usage:
 *   node scripts/calc-relative-performance.js
 *   node scripts/calc-relative-performance.js --dry-run
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const MACRO_PATH   = path.join(ROOT, 'data', 'macro-factors.json');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');

const DRY_RUN = process.argv.includes('--dry-run');

// Trading-day lookbacks
const LOOKBACK_12M = 252;

// Maps vsSector.name (normalised lowercase, S&P/ prefix stripped) → benchmark key
const SECTOR_NAME_MAP = {
  'asx 200 materials':          'asx_materials_12m',
  'asx materials':              'asx_materials_12m',
  'asx 200 financials':         'asx_financials_12m',
  'asx financials':             'asx_financials_12m',
  'asx 200 healthcare':         'asx_healthcare_12m',
  'asx healthcare':             'asx_healthcare_12m',
  'asx 200 consumer staples':   'asx_consumer_staples_12m',
  'asx consumer staples':       'asx_consumer_staples_12m',
  'asx consumer discretionary': 'asx_consumer_disc_12m',
  'asx consumer disc.':         'asx_consumer_disc_12m',
  'asx a-reit':                 'asx_areit_12m',
  'asx real estate':            'asx_areit_12m',
  'asx 200 energy':             'asx_energy_12m',
  'asx energy':                 'asx_energy_12m',
  'asx industrials':            'asx_industrials_12m',
  'asx it index':               'asx_technology_12m',
  'asx technology':             'asx_technology_12m',
  'asx 200 it':                 'asx_technology_12m',
  'asx gold index':             'asx_gold_12m',
  'asx small ords':             'asx_small_ords_12m',
};

// Fallback: map stock sector field → benchmark key when vsSector.name doesn't match
const SECTOR_FIELD_MAP = {
  'Materials':              'asx_materials_12m',
  'Financials':             'asx_financials_12m',
  'Healthcare':             'asx_healthcare_12m',
  'Healthcare IT':          'asx_healthcare_12m',
  'Consumer Staples':       'asx_consumer_staples_12m',
  'Consumer Discretionary': 'asx_consumer_disc_12m',
  'Real Estate':            'asx_areit_12m',
  'Energy':                 'asx_energy_12m',
  'Industrials':            'asx_industrials_12m',
  'Information Technology': 'asx_technology_12m',
  'Technology':             'asx_technology_12m',
  'Defence Technology':     'asx_small_ords_12m',
};

/**
 * Calculate percentage return over a fixed lookback from end of priceHistory.
 * Returns null if insufficient data. Result is rounded to 1dp.
 */
function calcReturn(prices, lookbackDays) {
  if (!prices || prices.length < 2) return null;
  const n       = prices.length;
  const baseIdx = Math.max(0, n - lookbackDays - 1);
  const base    = prices[baseIdx];
  const today   = prices[n - 1];
  if (!base || base === 0) return null;
  return Math.round((today / base - 1) * 1000) / 10; // percentage, 1dp
}

/**
 * Normalise a vsSector.name string to a lookup key.
 * Strips HTML entities, "S&P/" prefix, and lowercases.
 */
function normSectorName(name) {
  return (name || '')
    .replace(/&amp;/g, '&')
    .replace(/S&P\/|S&P/g, '')
    .trim()
    .toLowerCase();
}

function main() {
  console.log('=== Continuum Intelligence — Relative Performance Update ===\n');
  if (DRY_RUN) console.log('  DRY RUN — no files written\n');

  // ── Load macro-factors ────────────────────────────────────────────────────
  if (!fs.existsSync(MACRO_PATH)) {
    console.error('  [ERROR] data/macro-factors.json not found. Run fetch-macro-factors.js first.');
    process.exit(1);
  }

  let macro;
  try {
    macro = JSON.parse(fs.readFileSync(MACRO_PATH, 'utf8'));
  } catch (e) {
    console.error(`  [ERROR] Could not parse macro-factors.json: ${e.message}`);
    process.exit(1);
  }

  const br = macro.benchmark_returns;
  if (!br || br.asx200_12m == null) {
    console.error('  [ERROR] benchmark_returns.asx200_12m missing from macro-factors.json.');
    console.error('  Run fetch-macro-factors.js first to populate benchmark_returns.');
    process.exit(1);
  }

  // Benchmark values are decimal fractions — convert to % (1dp) for display
  const idx12m = Math.round(br.asx200_12m * 1000) / 10;

  console.log(`  ASX 200 12m benchmark: ${idx12m}%  (source: ${br.calculated_date})`);
  console.log('  This value will be applied identically to every stock.\n');

  // ── Process each research JSON ────────────────────────────────────────────
  const files = fs.readdirSync(RESEARCH_DIR)
    .filter(f => f.endsWith('.json') && f !== '_index.json');

  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const ticker = file.replace('.json', '');
    const fpath  = path.join(RESEARCH_DIR, file);

    let data;
    try {
      data = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    } catch (e) {
      console.error(`  [ERROR] ${ticker}: could not parse — ${e.message}`);
      skipped++;
      continue;
    }

    const ta = data.technicalAnalysis;
    if (!ta || !ta.relativePerformance) {
      console.log(`  [SKIP] ${ticker}: no relativePerformance section`);
      skipped++;
      continue;
    }

    const rp     = ta.relativePerformance;
    const prices = data.priceHistory;

    // ── Stock return (from own priceHistory) ─────────────────────────────────
    const stockReturn12m = calcReturn(prices, LOOKBACK_12M);
    if (stockReturn12m == null) {
      console.log(`  [SKIP] ${ticker}: insufficient priceHistory (${prices ? prices.length : 0} points)`);
      skipped++;
      continue;
    }

    // ── vsIndex (always ASX 200) ──────────────────────────────────────────────
    rp.vsIndex        = rp.vsIndex || {};
    rp.vsIndex.name   = rp.vsIndex.name || 'S&P/ASX 200';
    rp.vsIndex.period = '12 months';
    rp.vsIndex.stockReturn    = stockReturn12m;
    rp.vsIndex.indexReturn    = idx12m;
    rp.vsIndex.relativeReturn = Math.round((stockReturn12m - idx12m) * 10) / 10;

    // ── vsSector ─────────────────────────────────────────────────────────────
    rp.vsSector        = rp.vsSector || {};
    rp.vsSector.period = '12 months';

    // Resolve sector benchmark key: try vsSector.name match first, then sector field
    const normName    = normSectorName(rp.vsSector.name || '');
    const sectorKey   = SECTOR_NAME_MAP[normName] || SECTOR_FIELD_MAP[data.sector || ''];
    const sectorRetRaw = (sectorKey && br[sectorKey] != null) ? br[sectorKey] : null;
    const sectorReturn12m = sectorRetRaw != null
      ? Math.round(sectorRetRaw * 1000) / 10
      : idx12m; // fall back to ASX 200 if no sector benchmark available

    rp.vsSector.stockReturn    = stockReturn12m;
    rp.vsSector.sectorReturn   = sectorReturn12m;
    rp.vsSector.relativeReturn = Math.round((stockReturn12m - sectorReturn12m) * 10) / 10;

    // ── Write ─────────────────────────────────────────────────────────────────
    if (!DRY_RUN) {
      fs.writeFileSync(fpath, JSON.stringify(data, null, 2), 'utf8');
    }

    const sectorLabel = sectorKey ? sectorKey.replace('_12m', '') : 'asx200 (fallback)';
    console.log(
      `  [OK]  ${ticker.padEnd(5)}  stock=${stockReturn12m}%  vsIdx=${idx12m}%` +
      `  rel=${rp.vsIndex.relativeReturn}%  vsSector(${sectorLabel})=${sectorReturn12m}%`
    );
    updated++;
  }

  console.log(`\n  Done — ${updated} updated, ${skipped} skipped.`);
  if (DRY_RUN) console.log('  (Dry run — no files written)');
}

main();
