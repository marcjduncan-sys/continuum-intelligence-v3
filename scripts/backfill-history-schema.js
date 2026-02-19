#!/usr/bin/env node
/**
 * backfill-history-schema.js
 *
 * Continuum Intelligence — Phase 1.4 one-time migration
 *
 * Patches all existing entries in data/stocks/*-history.json that are
 * missing the three-layer signal slots added in Phase 1.3.
 *
 * For each entry lacking 'macro_signal':
 *   - Inserts macro_signal, sector_signal, idio_signal, overall_sentiment
 *     immediately after volume_ratio (preserving key order for readability)
 *   - Sets reconstructed: true  (all pre-Phase-1.3 entries are historical)
 *
 * The 2026-02-20 entry written by Phase 1.3 already has these fields —
 * it is skipped (idempotent).
 *
 * Usage:
 *   node scripts/backfill-history-schema.js [--dry-run]
 *
 * Safe to re-run: already-patched entries are skipped.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

// ── Patch a single entry object in-place ─────────────────────────────────────

function patchEntry(entry) {
  // Already patched — idempotent guard
  if ('macro_signal' in entry) return false;

  // Reconstruct the entry with signal slots inserted after volume_ratio,
  // preserving all existing keys in their original order.
  const patched = {};
  let inserted = false;

  for (const key of Object.keys(entry)) {
    patched[key] = entry[key];

    // Insert signal slots immediately after volume_ratio
    if (key === 'volume_ratio' && !inserted) {
      patched.macro_signal      = null;
      patched.sector_signal     = null;
      patched.idio_signal       = null;
      patched.overall_sentiment = null;
      inserted = true;
    }
  }

  // If volume_ratio wasn't present, append signals before price_classification
  if (!inserted) {
    const keys = Object.keys(patched);
    const pcIdx = keys.indexOf('price_classification');
    const rebuilt = {};
    keys.forEach((k, i) => {
      if (i === pcIdx) {
        rebuilt.macro_signal      = null;
        rebuilt.sector_signal     = null;
        rebuilt.idio_signal       = null;
        rebuilt.overall_sentiment = null;
      }
      rebuilt[k] = patched[k];
    });
    Object.assign(patched, rebuilt);
  }

  // Ensure reconstructed is set (all pre-Phase-1.3 entries are historical)
  patched.reconstructed = true;

  // Replace all keys on original entry object
  for (const k of Object.keys(entry)) delete entry[k];
  Object.assign(entry, patched);

  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  CONTINUUM INTELLIGENCE — Phase 1.4 History Schema Backfill');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Mode:', dryRun ? 'DRY RUN' : 'LIVE');
  console.log('');

  const historyFiles = fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('-history.json'))
    .sort();

  let totalFiles    = 0;
  let totalPatched  = 0;
  let totalSkipped  = 0;

  for (const file of historyFiles) {
    const filePath = path.join(STOCKS_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.warn('  [WARN] Could not parse', file, '—', e.message);
      continue;
    }

    if (!Array.isArray(data.history)) {
      console.warn('  [WARN]', file, '— no history array, skipping');
      continue;
    }

    let patchedCount  = 0;
    let skippedCount  = 0;

    for (const entry of data.history) {
      if (patchEntry(entry)) {
        patchedCount++;
      } else {
        skippedCount++;
      }
    }

    if (patchedCount > 0 && !dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    }

    const ticker = file.replace('-history.json', '');
    console.log(`  [${patchedCount > 0 ? 'PATCH' : 'OK   '}] ${ticker.padEnd(12)} patched: ${patchedCount}  already-ok: ${skippedCount}`);

    totalFiles++;
    totalPatched  += patchedCount;
    totalSkipped  += skippedCount;
  }

  console.log('');
  console.log(`  Files processed : ${totalFiles}`);
  console.log(`  Entries patched : ${totalPatched}`);
  console.log(`  Entries ok      : ${totalSkipped}`);
  if (dryRun) console.log('  (DRY RUN — no files written)');
  console.log('══════════════════════════════════════════════════════════════');
}

main();
