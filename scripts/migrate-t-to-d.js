#!/usr/bin/env node
// migrate-t-to-d.js
// Renames T1-T4 → D1-D4 across all stock and research JSON data files.
// Run once. Non-destructive in the sense that it writes JSON back in-place
// with the same formatting. Idempotent: running twice is safe.
// Usage: node scripts/migrate-t-to-d.js

'use strict';

const fs = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');

// Mapping uppercase T1-T4 → D1-D4 and lowercase t1-t4 → d1-d4
const UP_MAP = { T1: 'D1', T2: 'D2', T3: 'D3', T4: 'D4' };
const LO_MAP = { t1: 'd1', t2: 'd2', t3: 'd3', t4: 'd4' };

function renameKeys(obj, map) {
  const result = {};
  for (const key of Object.keys(obj)) {
    const newKey = map[key] || key;
    result[newKey] = obj[key];
  }
  return result;
}

function replaceUpperRefs(value) {
  // Replace T1/T2/T3/T4 strings inside values
  if (typeof value !== 'string') return value;
  return value.replace(/\bT([1234])\b/g, (_, n) => 'D' + n);
}

function replaceLowerRefs(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/\bt([1234])\b/g, (_, n) => 'd' + n);
}

// ─── Process data/stocks/*.json ─────────────────────────────────────────────

function migrateStocksFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  let changed = false;

  // 1. hypotheses object keys: T1→D1 etc.
  if (data.hypotheses && !Array.isArray(data.hypotheses)) {
    const hasOldKeys = Object.keys(data.hypotheses).some(k => k in UP_MAP);
    if (hasOldKeys) {
      data.hypotheses = renameKeys(data.hypotheses, UP_MAP);
      changed = true;
    }
  }

  // 2. dominant field
  if (data.dominant && data.dominant in UP_MAP) {
    data.dominant = UP_MAP[data.dominant];
    changed = true;
  }

  // 3. three_layer_signal.idio_detail T1/T2 keys and values
  const idio = data.three_layer_signal?.idio_detail;
  if (idio) {
    const hasOldKeys = ['T1', 'T1_score', 'T1_sentiment', 'T2', 'T2_score'].some(k => k in idio);
    if (hasOldKeys) {
      const updated = {};
      for (const [k, v] of Object.entries(idio)) {
        // rename key suffixes e.g. T1_score → D1_score
        const newKey = k.replace(/^T([1234])/, (_, n) => 'D' + n);
        // rename string values like "T1" → "D1"
        const newVal = replaceUpperRefs(v);
        updated[newKey] = newVal;
      }
      data.three_layer_signal.idio_detail = updated;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

// ─── Process data/research/*.json ───────────────────────────────────────────

function migrateHypothesesArray(hypotheses) {
  let changed = false;
  for (const h of hypotheses) {
    // tier: "t1" → "d1"
    if (h.tier && h.tier in LO_MAP) {
      h.tier = LO_MAP[h.tier];
      changed = true;
    }
    // title: "T1: ..." → "D1: ..."
    if (typeof h.title === 'string' && /^T[1234]:/.test(h.title)) {
      h.title = h.title.replace(/^T([1234]):/, (_, n) => 'D' + n + ':');
      changed = true;
    }
  }
  return changed;
}

function migrateResearchData(data) {
  let changed = false;

  // hypotheses array
  if (Array.isArray(data.hypotheses)) {
    if (migrateHypothesesArray(data.hypotheses)) changed = true;
  }

  // alignmentSummary text — replace T1/T2/T3/T4 references
  if (typeof data.alignmentSummary === 'string') {
    const updated = replaceUpperRefs(data.alignmentSummary);
    if (updated !== data.alignmentSummary) {
      data.alignmentSummary = updated;
      changed = true;
    }
  }

  // verdict.scores[].label — e.g. "T1" display labels in verdict chips
  if (Array.isArray(data.verdict?.scores)) {
    for (const s of data.verdict.scores) {
      if (typeof s.label === 'string' && /^T[1234]$/.test(s.label)) {
        s.label = replaceUpperRefs(s.label);
        changed = true;
      }
    }
  }

  return changed;
}

function migrateResearchFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);

  if (migrateResearchData(data)) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

function migrateIndexFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  let anyChanged = false;

  for (const ticker of Object.keys(data)) {
    if (migrateResearchData(data[ticker])) anyChanged = true;
  }

  if (anyChanged) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  }
  return false;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  let totalChanged = 0;

  // stocks/*.json (skip -history files)
  console.log('=== data/stocks/*.json ===');
  const stockFiles = fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-history'))
    .map(f => path.join(STOCKS_DIR, f));

  for (const filePath of stockFiles) {
    try {
      const changed = migrateStocksFile(filePath);
      console.log(`  ${changed ? 'UPDATED' : 'no-op '} ${path.basename(filePath)}`);
      if (changed) totalChanged++;
    } catch (e) {
      console.error(`  ERROR  ${path.basename(filePath)}: ${e.message}`);
    }
  }

  // research/*.json (excluding _index.json)
  console.log('\n=== data/research/*.json ===');
  const researchFiles = fs.readdirSync(RESEARCH_DIR)
    .filter(f => f.endsWith('.json') && f !== '_index.json')
    .map(f => path.join(RESEARCH_DIR, f));

  for (const filePath of researchFiles) {
    try {
      const changed = migrateResearchFile(filePath);
      console.log(`  ${changed ? 'UPDATED' : 'no-op '} ${path.basename(filePath)}`);
      if (changed) totalChanged++;
    } catch (e) {
      console.error(`  ERROR  ${path.basename(filePath)}: ${e.message}`);
    }
  }

  // research/_index.json
  console.log('\n=== data/research/_index.json ===');
  const indexPath = path.join(RESEARCH_DIR, '_index.json');
  try {
    const changed = migrateIndexFile(indexPath);
    console.log(`  ${changed ? 'UPDATED' : 'no-op '} _index.json`);
    if (changed) totalChanged++;
  } catch (e) {
    console.error(`  ERROR  _index.json: ${e.message}`);
  }

  console.log(`\nMigration complete. ${totalChanged} file(s) updated.`);
}

main();
