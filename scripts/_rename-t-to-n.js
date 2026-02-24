#!/usr/bin/env node
/**
 * One-time migration script: Rename T1-T4 → N1-N4 across all JSON data files.
 * Handles:
 *   - Object keys: "T1" → "N1"
 *   - Tier values: "t1" → "n1"
 *   - Title prefixes: "T1: Label" → "N1: Label"
 *   - Evidence impact keys: { "T1": "CONSISTENT" } → { "N1": "CONSISTENT" }
 *   - Dominant field: "T2" → "N2"
 *   - Flip from/to fields: "T1" → "N1"
 *   - String references within text (e.g. "T2 strengthens" → "N2 strengthens")
 */

const fs = require('fs');
const path = require('path');

const RESEARCH_DIR = path.join(__dirname, '..', 'data', 'research');
const STOCKS_DIR   = path.join(__dirname, '..', 'data', 'stocks');

// Rename T→N in any string value
function renameInString(str) {
  if (typeof str !== 'string') return str;
  // Replace T1-T4 with N1-N4 (word boundary aware for common patterns)
  return str
    .replace(/\bT1\b/g, 'N1')
    .replace(/\bT2\b/g, 'N2')
    .replace(/\bT3\b/g, 'N3')
    .replace(/\bT4\b/g, 'N4')
    .replace(/\bt1\b/g, 'n1')
    .replace(/\bt2\b/g, 'n2')
    .replace(/\bt3\b/g, 'n3')
    .replace(/\bt4\b/g, 'n4');
}

// Recursively walk a JSON value and rename all T→N references
function renameDeep(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'string') return renameInString(val);
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val)) return val.map(renameDeep);
  if (typeof val === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(val)) {
      const newKey = renameInString(key);
      out[newKey] = renameDeep(v);
    }
    return out;
  }
  return val;
}

function processFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const data = JSON.parse(raw);
  const renamed = renameDeep(data);
  fs.writeFileSync(filePath, JSON.stringify(renamed, null, 2) + '\n', 'utf8');
}

// Process research JSONs
console.log('=== Renaming T→N in research JSONs ===');
const researchFiles = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'));
for (const f of researchFiles) {
  const fp = path.join(RESEARCH_DIR, f);
  processFile(fp);
  console.log('  ' + f);
}

// Process stock JSONs (skip history files)
console.log('\n=== Renaming T→N in stock JSONs ===');
const stockFiles = fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json') && !f.includes('-history'));
for (const f of stockFiles) {
  const fp = path.join(STOCKS_DIR, f);
  processFile(fp);
  console.log('  ' + f);
}

console.log('\nDone.');
