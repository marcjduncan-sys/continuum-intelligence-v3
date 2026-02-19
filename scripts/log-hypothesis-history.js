#!/usr/bin/env node
/**
 * Continuum Intelligence — Log Hypothesis History
 *
 * Appends one snapshot per stock per day to data/stocks/{TICKER}-history.json.
 * Each entry captures: price, scores, ranks, skew, dominant, flip, events.
 * Designed to run after update-research.js in the daily GitHub Action.
 *
 * If an entry for today already exists, it is replaced (last run wins).
 *
 * Usage:
 *   node scripts/log-hypothesis-history.js
 *   node scripts/log-hypothesis-history.js --dry-run
 *   node scripts/log-hypothesis-history.js --ticker WOW
 */

const fs = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;

const SCHEMA_VERSION = 1;

/**
 * Build a direction map from presentation.hypotheses.
 * Returns { T1: "upside", T2: "downside", ... }
 */
function getDirectionMap(stock) {
  const map = {};
  if (stock.presentation && Array.isArray(stock.presentation.hypotheses)) {
    for (const h of stock.presentation.hypotheses) {
      const key = h.tier ? h.tier.toUpperCase() : null;
      if (key && h.direction) {
        map[key] = h.direction;
      }
    }
  }
  return map;
}

/**
 * Calculate thesis skew: sum(upside scores) - sum(downside scores), as integer (-80 to +80 range).
 */
function calculateSkew(scores, directionMap) {
  let upsideSum = 0;
  let downsideSum = 0;
  for (const [key, score] of Object.entries(scores)) {
    const dir = directionMap[key];
    if (dir === 'upside') upsideSum += score;
    else if (dir === 'downside') downsideSum += score;
    // neutral contributes to neither
  }
  return Math.round((upsideSum - downsideSum) * 100);
}

/**
 * Detect events for today's snapshot.
 * Returns array of { type, label } objects.
 */
function detectEvents(stock, flip, previousDominant) {
  const events = [];

  // E — Earnings event (catalyst passed or imminent)
  if (stock.freshness && stock.freshness.nearestCatalyst && stock.freshness.nearestCatalystDays !== undefined) {
    const catalyst = stock.freshness.nearestCatalyst;
    const days = stock.freshness.nearestCatalystDays;
    if (days <= 0 && /result|earning/i.test(catalyst)) {
      events.push({ type: 'E', label: catalyst });
    }
  }

  // P — Material price move (SIGNIFICANT or MATERIAL classification)
  if (stock.price_evidence && stock.price_evidence.classification) {
    const cat = stock.price_evidence.classification.category;
    if (cat === 'SIGNIFICANT' || cat === 'MATERIAL') {
      const changePct = stock.freshness ? stock.freshness.pricePctChange : null;
      const label = changePct !== null ? `${changePct > 0 ? '+' : ''}${changePct}% ${cat.toLowerCase()} move` : `${cat.toLowerCase()} price move`;
      events.push({ type: 'P', label });
    }
  }

  // O — Overcorrection detected
  if (stock.overcorrection && stock.overcorrection.triggered && stock.overcorrection.status === 'monitoring') {
    events.push({ type: 'O', label: 'Overcorrection detected' });
  }

  // F — Narrative flip
  if (flip && previousDominant) {
    events.push({ type: 'F', label: `${previousDominant} \u2192 ${stock.dominant}` });
  }

  return events;
}

/**
 * Build a single history entry for a stock.
 */
function buildEntry(stock, today) {
  const scores = {};
  const scoreEntries = [];

  for (const [key, hyp] of Object.entries(stock.hypotheses || {})) {
    const score = Math.round(hyp.survival_score * 100) / 100;
    scores[key] = score;
    scoreEntries.push([key, score]);
  }

  // Ranks: sorted descending by score, ties broken by key order
  scoreEntries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const ranks = scoreEntries.map(e => e[0]);

  const directionMap = getDirectionMap(stock);
  const skew = calculateSkew(scores, directionMap);

  // Daily change % from price_evidence or freshness
  let changePct = null;
  if (stock.price_evidence && stock.price_evidence.classification) {
    // The classification is based on the daily move — get it from priceHistory
    const ph = stock.priceHistory;
    if (ph && ph.length >= 2) {
      const prev = ph[ph.length - 2];
      const curr = ph[ph.length - 1];
      if (prev > 0) changePct = Math.round(((curr - prev) / prev) * 10000) / 100;
    }
  }

  // Volume ratio from TA data
  let volumeRatio = null;
  if (stock.presentation && stock.presentation.technicalAnalysis && stock.presentation.technicalAnalysis.volume) {
    const vr = stock.presentation.technicalAnalysis.volume.latestVs20DayAvg;
    if (typeof vr === 'number') volumeRatio = Math.round(vr * 100) / 100;
    else if (typeof vr === 'string') {
      const parsed = parseFloat(vr);
      if (!isNaN(parsed)) volumeRatio = Math.round(parsed * 100) / 100;
    }
  }

  const classification = stock.price_evidence && stock.price_evidence.classification
    ? stock.price_evidence.classification.category
    : null;

  const flags = stock.price_evidence && Array.isArray(stock.price_evidence.flags)
    ? stock.price_evidence.flags
    : [];

  return {
    date: today,
    price: stock.current_price,
    change_pct: changePct,
    volume_ratio: volumeRatio,
    scores,
    ranks,
    skew,
    dominant: stock.dominant || null,
    flip: false,       // set by caller after comparing with previous entry
    classification,
    flags,
    events: [],        // set by caller after flip detection
    reconstructed: false
  };
}

function main() {
  console.log('=== Continuum Intelligence — Log Hypothesis History ===\n');
  if (DRY_RUN) console.log('  DRY RUN — no files will be written\n');

  const today = new Date().toISOString().slice(0, 10);
  console.log(`  Date: ${today}\n`);

  const jsonFiles = fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-history'));

  let logged = 0;
  let skipped = 0;

  for (const file of jsonFiles) {
    const ticker = file.replace('.json', '');
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    const stockPath = path.join(STOCKS_DIR, file);
    const historyPath = path.join(STOCKS_DIR, `${ticker}-history.json`);

    // Read stock JSON
    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (err) {
      console.error(`  x ${ticker}: failed to read — ${err.message}`);
      continue;
    }

    if (!stock.hypotheses || Object.keys(stock.hypotheses).length === 0) {
      console.log(`  - ${ticker}: no hypotheses, skipping`);
      skipped++;
      continue;
    }

    // Read or initialise history file
    let history;
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
      // Normalise: log-daily-history.js uses key 'history', this script uses 'entries'.
      // If the file was written by log-daily-history.js, alias history.history → entries.
      if (!history.entries && Array.isArray(history.history)) {
        history.entries = history.history;
      }
      if (!history.entries) history.entries = [];
    } catch {
      history = { ticker, schema_version: SCHEMA_VERSION, entries: [] };
    }

    // Build today's entry
    const entry = buildEntry(stock, today);

    // Detect flip by comparing with previous entry
    const prevEntry = history.entries.length > 0 ? history.entries[history.entries.length - 1] : null;
    if (prevEntry && prevEntry.dominant && entry.dominant && prevEntry.dominant !== entry.dominant) {
      entry.flip = true;
    }

    // Detect events
    const previousDominant = prevEntry ? prevEntry.dominant : null;
    entry.events = detectEvents(stock, entry.flip, previousDominant);

    // Deduplicate: replace existing entry for today, or append
    const existingIdx = history.entries.findIndex(e => e.date === today);
    if (existingIdx >= 0) {
      history.entries[existingIdx] = entry;
      console.log(`  ~ ${ticker}: replaced entry for ${today}`);
    } else {
      history.entries.push(entry);
      console.log(`  + ${ticker}: logged ${today} — ${entry.dominant} skew:${entry.skew} ${entry.classification || 'n/a'}`);
    }

    // Write
    if (!DRY_RUN) {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    }

    logged++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Logged: ${logged}`);
  console.log(`  Skipped: ${skipped}`);
  if (DRY_RUN) console.log(`  (Dry run — no files written)`);
  console.log('');
}

main();
