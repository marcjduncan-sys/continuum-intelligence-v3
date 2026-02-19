#!/usr/bin/env node
/**
 * errata003-migrate-history.js
 *
 * Continuum Intelligence — ERRATA_003 History Schema Migration
 *
 * For each stock history file:
 *   1. Removes `thesis_skew` from all history entries
 *   2. Adds `external_signal` = macro_contribution + sector_contribution + tech_contribution
 *      (if those fields are present in the entry)
 *   3. Adds `company_signal` alias = company_contribution (if present)
 *
 * Usage:
 *   node scripts/errata003-migrate-history.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');

const historyFiles = fs.readdirSync(STOCKS_DIR)
  .filter(f => f.endsWith('-history.json'))
  .map(f => path.join(STOCKS_DIR, f));

let filesUpdated = 0;
let entriesPatched = 0;

for (const filePath of historyFiles) {
  const ticker = path.basename(filePath).replace('-history.json', '');
  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error('[errata003] Cannot read', ticker, ':', e.message);
    continue;
  }

  const history = data.history;
  if (!Array.isArray(history)) continue;

  // Some history files also have a top-level `entries` array that mirrors `history`
  const allArrays = [history];
  if (Array.isArray(data.entries)) allArrays.push(data.entries);

  let changed = false;
  for (const arr of allArrays) {
  for (const entry of arr) {
    // 1. Remove thesis_skew and thesis_skew_label
    if ('thesis_skew' in entry) {
      delete entry.thesis_skew;
      changed = true;
    }
    if ('thesis_skew_label' in entry) {
      delete entry.thesis_skew_label;
      changed = true;
    }

    // 2. Add external_signal (macro + sector + tech contributions)
    // tech_contribution may be missing in older entries — treat as 0
    if (entry.macro_contribution !== undefined && entry.sector_contribution !== undefined) {
      const tC = entry.tech_contribution || 0;
      const newExternal = entry.macro_contribution + entry.sector_contribution + tC;
      if (entry.external_signal !== newExternal) {
        entry.external_signal = newExternal;
        changed = true;
      }
    }

    // 3. Add company_signal (= company_contribution, with idio_contribution as legacy fallback)
    const compVal = entry.company_contribution !== undefined
      ? entry.company_contribution
      : entry.idio_contribution;
    if (compVal !== undefined && entry.company_signal === undefined) {
      entry.company_signal = compVal;
      changed = true;
    }

    if (changed && verbose) {
      console.log('  ', ticker, entry.date, '→ patched');
    }
    if (changed) entriesPatched++;
  }
  } // end for allArrays

  if (changed) {
    if (!dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }
    filesUpdated++;
    console.log('[errata003]', ticker.padEnd(6), '— updated', dryRun ? '(dry-run)' : '');
  } else {
    if (verbose) console.log('[errata003]', ticker.padEnd(6), '— no changes');
  }
}

console.log('[errata003] Done.', filesUpdated, 'files updated,', entriesPatched, 'entries patched',
  dryRun ? '(dry-run)' : '');
