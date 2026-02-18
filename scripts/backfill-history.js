#!/usr/bin/env node
/**
 * Continuum Intelligence — Backfill Hypothesis History
 *
 * Fetches 90 days of historical price data from Yahoo Finance, then
 * retroactively calculates what V2 engine scores would have been for
 * each trading day. Writes entries with reconstructed: true to
 * data/stocks/{TICKER}-history.json.
 *
 * Limitations of reconstructed data:
 *   - Volume ratio defaults to 1.0 (no historical volume ratios stored)
 *   - Technical levels use current TA data (support/resistance may have shifted)
 *   - Hypothesis base scores are held constant at current values
 *   - Overcorrection detection is simulated but has no prior state
 *   - Earnings events are not back-detected
 *
 * Usage:
 *   node scripts/backfill-history.js
 *   node scripts/backfill-history.js --dry-run
 *   node scripts/backfill-history.js --ticker WOW
 *   node scripts/backfill-history.js --days 90
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const TA_CONFIG_PATH = path.join(__dirname, '..', 'data', 'config', 'ta-config.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;
const BACKFILL_DAYS = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 60;

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Load ta-config ──────────────────────────────────────────────────
let taConfig;
try {
  taConfig = JSON.parse(fs.readFileSync(TA_CONFIG_PATH, 'utf8'));
} catch (err) {
  console.error(`Failed to load ta-config.json: ${err.message}`);
  process.exit(1);
}

// ── Yahoo Finance API ───────────────────────────────────────────────

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': USER_AGENT, ...options.headers },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getYahooSession() {
  const consentRes = await httpGet('https://fc.yahoo.com/');
  const setCookies = consentRes.headers['set-cookie'];
  const cookies = (Array.isArray(setCookies) ? setCookies : [setCookies || ''])
    .map(c => c.split(';')[0]).join('; ');
  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'Cookie': cookies }
  });
  return { cookies, crumb: crumbRes.body.trim() };
}

async function fetchDatedHistory(ticker, session) {
  const symbol = ticker + '.AX';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=6mo&interval=1d&includePrePost=false&crumb=${encodeURIComponent(session.crumb)}`;
  const res = await httpGet(url, { headers: { 'Cookie': session.cookies } });

  try {
    const json = JSON.parse(res.body);
    const result = json.chart.result[0];
    const timestamps = result.timestamp;
    const closes = result.indicators.quote[0].close;
    const volumes = result.indicators.quote[0].volume;

    const days = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] == null) continue;
      const date = new Date(timestamps[i] * 1000);
      days.push({
        date: date.toISOString().slice(0, 10),
        close: Math.round(closes[i] * 100) / 100,
        volume: volumes[i] || 0
      });
    }
    return days;
  } catch (e) {
    return null;
  }
}

// ── V2 Engine simulation (simplified for backfill) ──────────────────

function buildDirectionMap(stock) {
  const map = {};
  if (stock.presentation && Array.isArray(stock.presentation.hypotheses)) {
    for (const h of stock.presentation.hypotheses) {
      const key = h.tier ? h.tier.toUpperCase() : null;
      if (key && h.direction) map[key] = h.direction.toLowerCase();
    }
  }
  // Fallback for any missing tiers
  if (stock.hypotheses) {
    for (const key of Object.keys(stock.hypotheses)) {
      if (!map[key]) map[key] = 'neutral';
    }
  }
  return map;
}

function classifyDailyMove(pctChange) {
  const abs = Math.abs(pctChange);
  const c = taConfig.price_classification;
  if (abs >= c.significant_threshold_pct) return { category: 'MATERIAL', points: c.material_points, mandatoryReview: true };
  if (abs >= c.notable_threshold_pct) return { category: 'SIGNIFICANT', points: c.significant_points, mandatoryReview: false };
  if (abs >= c.noise_threshold_pct) return { category: 'NOTABLE', points: c.notable_points, mandatoryReview: false };
  return { category: 'NOISE', points: 0, mandatoryReview: false };
}

function applyDirectionalAdjustment(directionMap, pctChange, classification) {
  const adjustments = {};
  const points = classification.points;
  if (points === 0) {
    for (const tier of Object.keys(directionMap)) adjustments[tier] = 0;
    return adjustments;
  }
  const isPositive = pctChange > 0;
  for (const [tier, direction] of Object.entries(directionMap)) {
    if (direction === 'upside') {
      adjustments[tier] = isPositive ? points : -points;
    } else if (direction === 'downside') {
      adjustments[tier] = isPositive ? -points : points;
    } else {
      if (classification.category === 'MATERIAL') {
        adjustments[tier] = isPositive ? Math.round(points / 2) : -Math.round(points / 2);
      } else {
        adjustments[tier] = 0;
      }
    }
  }
  return adjustments;
}

function detectCumulativeMoves(priceSlice) {
  const len = priceSlice.length;
  const c = taConfig.cumulative_moves;
  const result = {};

  if (len >= 6) {
    const pct = ((priceSlice[len - 1] - priceSlice[len - 6]) / priceSlice[len - 6]) * 100;
    result.fiveDay = { pctChange: Math.round(pct * 10) / 10, triggered: Math.abs(pct) >= c.five_day_threshold_pct, amplifier: Math.abs(pct) >= c.five_day_threshold_pct ? c.five_day_amplifier : 1.0 };
  } else {
    result.fiveDay = { pctChange: 0, triggered: false, amplifier: 1.0 };
  }

  if (len >= 21) {
    const pct = ((priceSlice[len - 1] - priceSlice[len - 21]) / priceSlice[len - 21]) * 100;
    result.twentyDay = { pctChange: Math.round(pct * 10) / 10, triggered: Math.abs(pct) >= c.twenty_day_threshold_pct, flag: Math.abs(pct) >= c.twenty_day_threshold_pct ? c.twenty_day_flag : null };
  } else {
    result.twentyDay = { pctChange: 0, triggered: false, flag: null };
  }

  if (len >= 61) {
    const pct = ((priceSlice[len - 1] - priceSlice[len - 61]) / priceSlice[len - 61]) * 100;
    result.sixtyDay = { pctChange: Math.round(pct * 10) / 10, triggered: Math.abs(pct) >= c.sixty_day_threshold_pct, flag: Math.abs(pct) >= c.sixty_day_threshold_pct ? c.sixty_day_flag : null };
  } else {
    result.sixtyDay = { pctChange: 0, triggered: false, flag: null };
  }

  return result;
}

function normaliseScores(rawScores) {
  const c = taConfig.normalisation;
  const floor = c.floor * 100;
  const ceiling = c.ceiling * 100;

  const clamped = {};
  for (const [key, score] of Object.entries(rawScores)) {
    clamped[key] = Math.max(floor, Math.min(ceiling, score));
  }

  let total = 0;
  for (const score of Object.values(clamped)) total += score;

  const normalised = {};
  if (total > 0) {
    for (const [key, score] of Object.entries(clamped)) normalised[key] = (score / total) * 100;
  } else {
    const count = Object.keys(clamped).length;
    for (const key of Object.keys(clamped)) normalised[key] = 100 / count;
  }

  let needsPass = true;
  let passes = 0;
  const result = { ...normalised };
  while (needsPass && passes < 5) {
    needsPass = false;
    passes++;
    for (const key of Object.keys(result)) {
      if (result[key] < floor) { result[key] = floor; needsPass = true; }
      if (result[key] > ceiling) { result[key] = ceiling; needsPass = true; }
    }
    let total2 = 0;
    for (const score of Object.values(result)) total2 += score;
    if (total2 > 0 && Math.abs(total2 - 100) > 0.1) {
      for (const key of Object.keys(result)) result[key] = (result[key] / total2) * 100;
    }
  }

  const output = {};
  for (const [key, score] of Object.entries(result)) {
    output[key] = Math.round(score) / 100;
  }
  return output;
}

/**
 * Simulate the V2 engine for one day.
 * Uses current base scores + daily price move to produce reconstructed scores.
 */
function simulateDay(baseScores, directionMap, pctChange, priceSlice) {
  // Start from base scores scaled to 0-100
  const scores = {};
  for (const [key, score] of Object.entries(baseScores)) {
    scores[key] = score * 100;
  }

  // Layer 2: Price classification + directional adjustment
  const classification = classifyDailyMove(pctChange);
  const adjustments = applyDirectionalAdjustment(directionMap, pctChange, classification);

  // Layer 3: Volume — default 1.0 for backfill (no historical volume ratios)
  const volumeMultiplier = 1.0;

  // Layer 4: Cumulative moves
  const cumulativeMoves = detectCumulativeMoves(priceSlice);
  const cumAmplifier = cumulativeMoves.fiveDay.amplifier;

  // Apply: adjustments * volume * cumulative amplifier
  for (const [key, adj] of Object.entries(adjustments)) {
    scores[key] += adj * volumeMultiplier * cumAmplifier;
  }

  // Layer 9: Normalise
  const normScores = normaliseScores(scores);

  // Flags
  const flags = [];
  if (cumulativeMoves.twentyDay && cumulativeMoves.twentyDay.triggered) flags.push(cumulativeMoves.twentyDay.flag);
  if (cumulativeMoves.sixtyDay && cumulativeMoves.sixtyDay.triggered) flags.push(cumulativeMoves.sixtyDay.flag);
  if (classification.mandatoryReview) flags.push('mandatory_review');

  return { scores: normScores, classification, cumulativeMoves, flags };
}

function calculateSkew(scores, directionMap) {
  let upsideSum = 0;
  let downsideSum = 0;
  for (const [key, score] of Object.entries(scores)) {
    const dir = directionMap[key];
    if (dir === 'upside') upsideSum += score;
    else if (dir === 'downside') downsideSum += score;
  }
  return Math.round((upsideSum - downsideSum) * 100);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Continuum Intelligence — Backfill Hypothesis History ===\n');
  if (DRY_RUN) console.log('  DRY RUN — no files will be written\n');
  console.log(`  Backfill target: ${BACKFILL_DAYS} trading days\n`);

  // Get Yahoo session
  console.log('  Authenticating with Yahoo Finance...');
  let session;
  try {
    session = await getYahooSession();
    console.log('  Session obtained.\n');
  } catch (err) {
    console.error(`  Failed to get Yahoo session: ${err.message}`);
    process.exit(1);
  }

  // Find all stock JSONs
  const jsonFiles = fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-history'));

  let backfilled = 0;
  let failed = 0;

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
      console.error(`  x ${ticker}: failed to read stock JSON — ${err.message}`);
      failed++;
      continue;
    }

    if (!stock.hypotheses || Object.keys(stock.hypotheses).length === 0) {
      console.log(`  - ${ticker}: no hypotheses, skipping`);
      continue;
    }

    // Fetch dated price history from Yahoo
    console.log(`  ${ticker}: fetching price history...`);
    let yahooData;
    try {
      yahooData = await fetchDatedHistory(ticker, session);
    } catch (err) {
      console.error(`  x ${ticker}: Yahoo fetch failed — ${err.message}`);
      failed++;
      continue;
    }

    if (!yahooData || yahooData.length < 10) {
      console.error(`  x ${ticker}: insufficient price data (${yahooData ? yahooData.length : 0} days)`);
      failed++;
      continue;
    }

    console.log(`  ${ticker}: got ${yahooData.length} trading days`);

    // Read or initialise history
    let history;
    try {
      history = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch {
      history = { ticker, schema_version: 1, entries: [] };
    }

    // Collect existing dates to avoid overwriting live entries
    const existingDates = new Set(
      history.entries.filter(e => !e.reconstructed).map(e => e.date)
    );

    // Base scores from current stock JSON (held constant for backfill)
    const baseScores = {};
    for (const [key, hyp] of Object.entries(stock.hypotheses)) {
      baseScores[key] = hyp.survival_score;
    }

    const directionMap = buildDirectionMap(stock);

    // Walk through trading days — we need enough lead-in for cumulative windows
    // Use the last (BACKFILL_DAYS + lead-in) days from Yahoo data
    const totalDays = yahooData.length;
    const startIdx = Math.max(1, totalDays - BACKFILL_DAYS - 60); // 60-day lead-in for cumulative
    const backfillStartIdx = Math.max(1, totalDays - BACKFILL_DAYS);

    let entriesAdded = 0;
    let prevDominant = null;

    for (let i = backfillStartIdx; i < totalDays; i++) {
      const day = yahooData[i];
      const prevDay = yahooData[i - 1];

      // Skip if live entry already exists for this date
      if (existingDates.has(day.date)) continue;

      // Daily change %
      const changePct = prevDay.close > 0
        ? Math.round(((day.close - prevDay.close) / prevDay.close) * 10000) / 100
        : 0;

      // Build price slice up to this day (for cumulative moves)
      const sliceStart = Math.max(0, i - 60);
      const priceSlice = yahooData.slice(sliceStart, i + 1).map(d => d.close);

      // Simulate V2 engine
      const result = simulateDay(baseScores, directionMap, changePct, priceSlice);

      // Rank by score
      const scoreEntries = Object.entries(result.scores).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      const ranks = scoreEntries.map(e => e[0]);
      const dominant = ranks[0];

      // Flip detection
      const flip = prevDominant !== null && prevDominant !== dominant;

      // Skew
      const skew = calculateSkew(result.scores, directionMap);

      // Events (limited for backfill — only P and F)
      const events = [];
      if (result.classification.category === 'SIGNIFICANT' || result.classification.category === 'MATERIAL') {
        events.push({ type: 'P', label: `${changePct > 0 ? '+' : ''}${changePct}% ${result.classification.category.toLowerCase()} move` });
      }
      if (flip) {
        events.push({ type: 'F', label: `${prevDominant} \u2192 ${dominant}` });
      }

      const entry = {
        date: day.date,
        price: day.close,
        change_pct: changePct,
        volume_ratio: null,
        scores: result.scores,
        ranks,
        skew,
        dominant,
        flip,
        classification: result.classification.category,
        flags: result.flags,
        events,
        reconstructed: true
      };

      // Insert in date order — find position or replace existing reconstructed entry
      const existingReconIdx = history.entries.findIndex(e => e.date === day.date && e.reconstructed);
      if (existingReconIdx >= 0) {
        history.entries[existingReconIdx] = entry;
      } else {
        history.entries.push(entry);
      }

      prevDominant = dominant;
      entriesAdded++;
    }

    // Sort entries by date
    history.entries.sort((a, b) => a.date.localeCompare(b.date));

    // Write
    if (!DRY_RUN) {
      fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
    }

    console.log(`  ${ticker}: +${entriesAdded} reconstructed entries (${history.entries.length} total)\n`);
    backfilled++;

    // Rate limit — Yahoo doesn't like rapid fire
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('=== Summary ===');
  console.log(`  Backfilled: ${backfilled} stocks`);
  console.log(`  Failed: ${failed}`);
  if (DRY_RUN) console.log('  (Dry run — no files written)');
  console.log('');
}

main();
