#!/usr/bin/env node
/**
 * Continuum Intelligence -- Extract Stock Data
 *
 * DEPRECATED: This was a one-time migration tool that extracted STOCK_DATA blocks
 * from index.html into individual JSON files in data/stocks/.
 *
 * Stock data now lives in:
 *   - data/research/{ticker}.json  -- full research + presentation data
 *   - data/stocks/{ticker}.json    -- per-stock hypothesis framework
 *   - data/reference.json          -- reference/anchor data
 *   - data/freshness.json          -- freshness metadata
 *
 * The migration from index.html to JSON files is complete.
 * This script is retained for reference only.
 *
 * If needed, it can now read from data/research/*.json and re-export
 * to data/stocks/*.json format.
 *
 * Usage:  node scripts/extract-stock-data.js [--dry-run] [--ticker XRO]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const TICKER_FILTER = args.includes('--ticker') ? args[args.indexOf('--ticker') + 1] : null;

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// -- Convert research JSON to stocks JSON format ---

function researchToStockFormat(research) {
  if (!research) return null;

  const ticker = research.ticker || research.tickerFull?.replace('.AX', '') || 'UNKNOWN';

  // Build hypotheses in the stocks format from either the array or object form
  const hypotheses = {};
  if (Array.isArray(research.hypotheses)) {
    research.hypotheses.forEach((h, i) => {
      const key = `N${i + 1}`;
      const scoreNum = parseInt(h.score) || 0;
      hypotheses[key] = {
        label: h.title?.replace(/^N\d:\s*/, '') || `Hypothesis ${i + 1}`,
        description: h.description || '',
        plain_english: h.description || 'Extracted from research JSON.',
        what_to_watch: null,
        upside: h.direction === 'upside' ? h.description : null,
        risk_plain: h.direction === 'downside' ? h.description : null,
        survival_score: scoreNum / 100,
        status: scoreNum >= 60 ? 'HIGH' : scoreNum >= 40 ? 'MODERATE' : 'LOW',
        weighted_inconsistency: null,
        last_updated: new Date().toISOString(),
      };
    });
  } else if (research.hypotheses && typeof research.hypotheses === 'object') {
    // Already in N1/N2/N3/N4 format -- pass through
    Object.assign(hypotheses, research.hypotheses);
  }

  return {
    ticker: research.tickerFull || `${ticker}.AX`,
    company: research.company || ticker,
    sector: research.sector || 'Unknown',
    market_cap: null,
    hypotheses,
    dominant: research.dominant || 'N1',
    confidence: research.confidence || 'LOW',
    alert_state: research.alert_state || 'NORMAL',
    current_price: research.price || null,
    big_picture: research.heroCompanyDescription || null,
    last_flip: null,
    narrative_history: [],
    evidence_items: [],
    price_signals: [],
    editorial_override: null,
    price_history: (research.priceHistory || []).slice(-60),
    weighting: null
  };
}

// ======================================================================
// MAIN
// ======================================================================
function main() {
  console.log('=== Continuum Intelligence -- Stock Data Extraction ===\n');
  console.log('  NOTE: This script is DEPRECATED. Data now lives in JSON files.');
  console.log('  Running in compatibility mode: reading from data/research/*.json\n');

  if (DRY_RUN) console.log('  DRY RUN -- no files will be written\n');

  // Read research JSON files
  let files;
  try {
    files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch (e) {
    console.error(`  Could not read research directory: ${e.message}`);
    process.exit(1);
  }

  console.log(`  Found ${files.length} research JSON files\n`);

  // Ensure output directory exists
  if (!DRY_RUN) {
    fs.mkdirSync(STOCKS_DIR, { recursive: true });
  }

  let extracted = 0;
  let failed = 0;

  for (const file of files) {
    const ticker = file.replace('.json', '');
    if (TICKER_FILTER && ticker !== TICKER_FILTER) continue;

    console.log(`  Processing ${ticker}...`);

    const research = readJson(path.join(RESEARCH_DIR, file));
    if (!research) {
      console.error(`    Failed to read data/research/${file}`);
      failed++;
      continue;
    }

    const stockData = researchToStockFormat(research);
    if (!stockData) {
      failed++;
      continue;
    }

    const outPath = path.join(STOCKS_DIR, `${ticker}.json`);
    if (!DRY_RUN) {
      writeJson(outPath, stockData);
    }

    console.log(`    -> data/stocks/${ticker}.json`);
    extracted++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Extracted: ${extracted}`);
  console.log(`  Failed: ${failed}`);
  if (DRY_RUN) console.log(`  (Dry run -- no files written)`);
  console.log('');
}

main();
