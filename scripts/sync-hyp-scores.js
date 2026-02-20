#!/usr/bin/env node
/**
 * sync-hyp-scores.js
 *
 * Continuum Intelligence — Hypothesis Score Sync
 *
 * Syncs hypothesis survival_score, label, and upside direction from the
 * authoritative data/research/TICKER.json into data/stocks/TICKER.json.
 *
 * Root cause this prevents:
 *   Auto-generated stocks files have placeholder survival_scores
 *   (T2=0.60 dominant, T2.upside=null) that cause calc-idio-signal.js to
 *   compute a bearish dominant hypothesis for stocks that are actually bullish.
 *   The browser shows the correct signal from research data; the pipeline
 *   produces the wrong stored signal — a split-brain problem.
 *
 * What this syncs:
 *   survival_score — derived from research hypothesis score ("55%" → 0.55)
 *   label          — derived from research hypothesis title (strips "T1: " prefix)
 *   upside         — set non-null for "upside" direction; null for "downside"/"neutral"
 *
 * What this does NOT change:
 *   description, plain_english, what_to_watch, risk_plain, status,
 *   weighted_inconsistency, last_updated — those are managed separately
 *
 * Run AFTER run-automated-analysis.js, BEFORE calc-idio-signal.js.
 *
 * Usage: node scripts/sync-hyp-scores.js [--dry-run] [--verbose]
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const STOCKS_DIR   = path.join(ROOT, 'data', 'stocks');

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// Parse "55%" → 0.55
function parseScore(scoreStr) {
  if (typeof scoreStr !== 'string') return null;
  const n = parseFloat(scoreStr);
  return isNaN(n) ? null : Math.round(n) / 100;
}

// "T1: Copper Supercycle" → "Copper Supercycle"
function extractLabel(title) {
  if (!title) return null;
  return title.replace(/^T\d+:\s*/i, '').trim();
}

function main() {
  console.log('=== Continuum Intelligence — Hypothesis Score Sync ===\n');

  const researchFiles = fs.readdirSync(RESEARCH_DIR)
    .filter(f => f.endsWith('.json') && f !== '_index.json');

  let updated = 0, unchanged = 0, skipped = 0, errors = 0;

  for (const fname of researchFiles) {
    const ticker     = fname.replace('.json', '');
    const resPath    = path.join(RESEARCH_DIR, fname);
    const stockPath  = path.join(STOCKS_DIR, ticker + '.json');

    // Need both files
    if (!fs.existsSync(stockPath)) {
      if (verbose) console.log(`  [SKIP] ${ticker} — no stocks file`);
      skipped++;
      continue;
    }

    let research, stock;
    try {
      research = JSON.parse(fs.readFileSync(resPath,   'utf8'));
      stock    = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (e) {
      console.error(`  [ERROR] ${ticker} — ${e.message}`);
      errors++;
      continue;
    }

    const hyps = research.hypotheses;
    if (!Array.isArray(hyps) || hyps.length === 0) {
      if (verbose) console.log(`  [SKIP] ${ticker} — no hypotheses in research file`);
      skipped++;
      continue;
    }

    if (!stock.hypotheses || Array.isArray(stock.hypotheses)) {
      if (verbose) console.log(`  [SKIP] ${ticker} — stocks hypotheses missing or wrong format`);
      skipped++;
      continue;
    }

    const changes = [];

    for (const h of hyps) {
      // Normalise tier: "t1" → "T1"
      const key = (h.tier || '').toUpperCase();
      const stockHyp = stock.hypotheses[key];
      if (!stockHyp) continue;

      // ── survival_score ───────────────────────────────────────────────────
      const newScore = parseScore(h.score);
      if (newScore !== null && Math.abs((stockHyp.survival_score || 0) - newScore) > 0.001) {
        changes.push(`${key} score: ${stockHyp.survival_score} → ${newScore}`);
        stockHyp.survival_score = newScore;
      }

      // ── label ────────────────────────────────────────────────────────────
      const newLabel = extractLabel(h.title);
      if (newLabel && stockHyp.label !== newLabel) {
        changes.push(`${key} label: "${stockHyp.label}" → "${newLabel}"`);
        stockHyp.label = newLabel;
      }

      // ── upside ───────────────────────────────────────────────────────────
      // direction="upside" → upside must be non-null (bull case)
      // direction="downside" or "neutral" → upside must be null (not a bull case)
      const shouldHaveUpside = (h.direction === 'upside');
      const hasUpside        = (stockHyp.upside != null);

      if (shouldHaveUpside && !hasUpside) {
        stockHyp.upside = 'See research report for upside scenario detail.';
        changes.push(`${key} upside: null → set (direction=upside)`);
      } else if (!shouldHaveUpside && hasUpside) {
        stockHyp.upside = null;
        changes.push(`${key} upside: cleared (direction=${h.direction})`);
      }
    }

    if (changes.length > 0) {
      updated++;
      console.log(`  [UPDATE] ${ticker}:`);
      changes.forEach(c => console.log(`           ${c}`));
      if (!dryRun) {
        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2), 'utf8');
      }
    } else {
      unchanged++;
      if (verbose) console.log(`  [OK]     ${ticker} — no changes needed`);
    }
  }

  console.log(`\n=== Results ===`);
  console.log(`  Updated   : ${updated}`);
  console.log(`  Unchanged : ${unchanged}`);
  console.log(`  Skipped   : ${skipped}`);
  console.log(`  Errors    : ${errors}`);
  if (dryRun) console.log('\n  (dry-run — no files written)');

  if (errors > 0) process.exit(1);
}

main();
