#!/usr/bin/env node
/**
 * Continuum Intelligence — Extract Stock Data from index.html
 *
 * One-time migration script: extracts all STOCK_DATA.TICKER blocks from the
 * monolith index.html and writes them as individual JSON files into data/stocks/.
 *
 * If a data/stocks/TICKER.json already exists with rich research data (hypotheses
 * with plain_english, evidence_items, narrative_history), that research content
 * is preserved and the extracted presentation data is merged alongside it.
 *
 * Usage:  node scripts/extract-stock-data.js [--dry-run] [--ticker XRO]
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');
const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;

// ── Parse STOCK_DATA blocks from index.html ──────────────────────────
function extractStockBlocks(html) {
  // Find each STOCK_DATA.TICKER = { ... }; assignment
  const blocks = {};
  const regex = /^STOCK_DATA\.(\w+)\s*=\s*\{/gm;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const ticker = match[1];
    const startIdx = match.index;

    // Find the closing }; by tracking brace depth
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let escaped = false;
    let endIdx = -1;

    for (let i = startIdx + match[0].length - 1; i < html.length; i++) {
      const ch = html[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === '\\' && inString) {
        escaped = true;
        continue;
      }

      if (inString) {
        if (ch === stringChar) inString = false;
        continue;
      }

      if (ch === "'" || ch === '"' || ch === '`') {
        inString = true;
        stringChar = ch;
        continue;
      }

      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          endIdx = i + 1;
          break;
        }
      }
    }

    if (endIdx === -1) {
      console.error(`  ✗ Could not find closing brace for STOCK_DATA.${ticker}`);
      continue;
    }

    // Extract the full assignment block
    const blockText = html.substring(startIdx, endIdx);
    blocks[ticker] = blockText;
  }

  return blocks;
}

// ── Evaluate a STOCK_DATA block safely using vm ──────────────────────
function evaluateBlock(ticker, blockText) {
  try {
    // Create a sandbox with STOCK_DATA object
    const sandbox = { STOCK_DATA: {} };
    const context = vm.createContext(sandbox);

    // Execute the assignment
    vm.runInContext(blockText, context, { timeout: 5000 });

    return sandbox.STOCK_DATA[ticker];
  } catch (err) {
    console.error(`  ✗ Failed to evaluate STOCK_DATA.${ticker}: ${err.message}`);
    return null;
  }
}

// ── Extract a top-level JS object by brace-matching ─────────────────
function extractJsObject(html, varName) {
  const startMatch = html.match(new RegExp(`(?:const|var|let)\\s+${varName}\\s*=\\s*\\{`));
  if (!startMatch) return {};

  const openBrace = startMatch.index + startMatch[0].length - 1;
  let depth = 0;
  let endIdx = -1;
  for (let i = openBrace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  }
  if (endIdx === -1) return {};

  const objStr = html.substring(openBrace, endIdx);
  // FRESHNESS_DATA is valid JSON; REFERENCE_DATA uses JS syntax (comments, trailing commas)
  try {
    return JSON.parse(objStr);
  } catch {
    // Fall back to vm evaluation for JS-syntax objects
    try {
      const sandbox = {};
      const ctx = vm.createContext(sandbox);
      vm.runInContext(`var __result = ${objStr}`, ctx, { timeout: 5000 });
      return ctx.__result || {};
    } catch (err) {
      console.error(`  ✗ Failed to parse ${varName}: ${err.message}`);
      return {};
    }
  }
}

// ── Extract FRESHNESS_DATA ───────────────────────────────────────────
function extractFreshnessData(html) {
  return extractJsObject(html, 'FRESHNESS_DATA');
}

// ── Extract REFERENCE_DATA ───────────────────────────────────────────
function extractReferenceData(html) {
  return extractJsObject(html, 'REFERENCE_DATA');
}

// ── Merge extracted presentation data with existing research JSON ────
function mergeWithExisting(ticker, extracted, freshness, reference) {
  const existingPath = path.join(STOCKS_DIR, `${ticker}.json`);
  let existing = null;

  if (fs.existsSync(existingPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(existingPath, 'utf8'));
      console.log(`  ℹ Found existing ${ticker}.json — merging`);
    } catch (err) {
      console.error(`  ✗ Failed to parse existing ${ticker}.json: ${err.message}`);
    }
  }

  // Build the unified JSON structure
  const unified = {
    // ── Identity ──
    ticker: extracted.tickerFull || `${ticker}.AX`,
    tickerShort: ticker,
    company: extracted.company || existing?.company || ticker,
    sector: extracted.sector || existing?.sector || 'Unknown',
    sectorSub: extracted.sectorSub || null,
    exchange: extracted.exchange || 'ASX',
    currency: extracted.currency || 'A$',
    reportId: extracted.reportId || null,

    // ── Price data ──
    current_price: extracted.price || existing?.current_price || null,
    priceHistory: extracted.priceHistory || existing?.price_history || [],

    // ── Reference data (for hydrate-content.js) ──
    reference: reference[ticker] || null,

    // ── Freshness data ──
    freshness: freshness[ticker] || null,

    // ── Research: Hypotheses ──
    // Prefer existing research-quality data if it has rich content
    hypotheses: buildHypotheses(ticker, extracted, existing),
    dominant: determineDominant(extracted, existing),
    confidence: existing?.confidence || determineConfidence(extracted),
    alert_state: existing?.alert_state || 'NORMAL',
    alert_started: existing?.alert_started || null,

    // ── Narrative content (presentation layer) ──
    presentation: {
      heroDescription: extracted.heroDescription || null,
      heroCompanyDescription: extracted.heroCompanyDescription || null,
      heroMetrics: extracted.heroMetrics || [],
      skew: extracted.skew || null,
      verdict: extracted.verdict || null,
      featuredMetrics: extracted.featuredMetrics || [],
      featuredPriceColor: extracted.featuredPriceColor || null,
      featuredRationale: extracted.featuredRationale || null,
      identity: extracted.identity || null,
      hypotheses: extracted.hypotheses || [],
      narrative: extracted.narrative || null,
      evidence: extracted.evidence || null,
      discriminators: extracted.discriminators || null,
      tripwires: extracted.tripwires || null,
      gaps: extracted.gaps || null,
      technicalAnalysis: extracted.technicalAnalysis || null,
      footer: extracted.footer || null,
    },

    // ── Research data (from existing JSONs) ──
    big_picture: existing?.big_picture || extracted.heroCompanyDescription || null,
    last_flip: existing?.last_flip || null,
    narrative_history: existing?.narrative_history || [],
    evidence_items: existing?.evidence_items || [],
    price_signals: existing?.price_signals || [],
    editorial_override: existing?.editorial_override || null,
    weighting: existing?.weighting || null,

    // ── Metadata ──
    last_extracted: new Date().toISOString(),
    last_updated: existing?.hypotheses?.T1?.last_updated || freshness[ticker]?.reviewDate || new Date().toISOString(),
  };

  return unified;
}

// ── Build hypotheses from both sources ───────────────────────────────
function buildHypotheses(ticker, extracted, existing) {
  // If existing JSON has rich research hypotheses (with plain_english), use those
  if (existing?.hypotheses?.T1?.plain_english &&
      existing.hypotheses.T1.plain_english !== 'Placeholder — requires analyst research to populate.') {
    return existing.hypotheses;
  }

  // Otherwise, build from extracted presentation data
  const hyps = {};
  if (extracted.hypotheses && Array.isArray(extracted.hypotheses)) {
    extracted.hypotheses.forEach((h, i) => {
      const key = `T${i + 1}`;
      const scoreNum = parseInt(h.score) || 0;
      hyps[key] = {
        label: h.title?.replace(/^T\d:\s*/, '') || h.direction || `Hypothesis ${i + 1}`,
        description: h.description || '',
        plain_english: h.description || 'Extracted from presentation — requires analyst enrichment.',
        what_to_watch: h.requires ? h.requires[0] : null,
        upside: h.direction === 'upside' ? h.description : null,
        risk_plain: h.direction === 'downside' ? h.description : null,
        survival_score: scoreNum / 100,
        status: scoreNum >= 60 ? 'HIGH' : scoreNum >= 40 ? 'MODERATE' : scoreNum >= 20 ? 'LOW' : 'VERY_LOW',
        weighted_inconsistency: null,
        last_updated: new Date().toISOString(),
      };
    });
  }
  return hyps;
}

// ── Determine dominant hypothesis ────────────────────────────────────
function determineDominant(extracted, existing) {
  if (existing?.dominant) return existing.dominant;

  // Use verdict scores from presentation data
  if (extracted.verdict?.scores) {
    let maxScore = 0;
    let dominant = 'T1';
    extracted.verdict.scores.forEach((s, i) => {
      const score = parseInt(s.score) || 0;
      if (score > maxScore) {
        maxScore = score;
        dominant = `T${i + 1}`;
      }
    });
    return dominant;
  }
  return 'T1';
}

// ── Determine confidence ─────────────────────────────────────────────
function determineConfidence(extracted) {
  if (!extracted.verdict?.scores) return 'LOW';
  const scores = extracted.verdict.scores.map(s => parseInt(s.score) || 0);
  const max = Math.max(...scores);
  const second = scores.sort((a, b) => b - a)[1] || 0;
  const gap = max - second;
  if (gap >= 20) return 'HIGH';
  if (gap >= 10) return 'MODERATE';
  return 'LOW';
}


// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
function main() {
  console.log('=== Continuum Intelligence — Stock Data Extraction ===\n');

  if (DRY_RUN) console.log('  🏃 DRY RUN — no files will be written\n');

  // Read index.html
  const html = fs.readFileSync(INDEX_PATH, 'utf8');
  console.log(`  Read index.html (${(html.length / 1024).toFixed(0)} KB)\n`);

  // Extract data structures
  const freshnessData = extractFreshnessData(html);
  const referenceData = extractReferenceData(html);
  console.log(`  Extracted FRESHNESS_DATA: ${Object.keys(freshnessData).length} tickers`);
  console.log(`  Extracted REFERENCE_DATA: ${Object.keys(referenceData).length} tickers\n`);

  // Extract STOCK_DATA blocks
  const blocks = extractStockBlocks(html);
  const tickers = Object.keys(blocks);
  console.log(`  Found ${tickers.length} STOCK_DATA blocks: ${tickers.join(', ')}\n`);

  // Ensure output directory exists
  if (!DRY_RUN) {
    fs.mkdirSync(STOCKS_DIR, { recursive: true });
  }

  // Process each ticker
  let extracted = 0;
  let merged = 0;
  let failed = 0;

  for (const ticker of tickers) {
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    console.log(`  Processing ${ticker}...`);

    // Evaluate the JS block
    const data = evaluateBlock(ticker, blocks[ticker]);
    if (!data) {
      failed++;
      continue;
    }

    // Merge with existing research data
    const unified = mergeWithExisting(ticker, data, freshnessData, referenceData);

    // Write output
    const outPath = path.join(STOCKS_DIR, `${ticker}.json`);
    if (!DRY_RUN) {
      fs.writeFileSync(outPath, JSON.stringify(unified, null, 2));
    }

    const hasExisting = fs.existsSync(outPath) && !DRY_RUN;
    console.log(`  ✓ ${ticker} → data/stocks/${ticker}.json (${Object.keys(unified.presentation).length} presentation fields)`);

    if (hasExisting) merged++;
    extracted++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Extracted: ${extracted}`);
  console.log(`  Merged with existing: ${merged}`);
  console.log(`  Failed: ${failed}`);
  if (DRY_RUN) console.log(`  (Dry run — no files written)`);
  console.log('');
}

main();
