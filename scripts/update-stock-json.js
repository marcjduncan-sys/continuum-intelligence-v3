#!/usr/bin/env node
/**
 * Continuum Intelligence – Update Stock JSON Files
 *
 * Reads live prices from find-latest-prices.js and updates each
 * data/stocks/TICKER.json with:
 *   - current_price
 *   - priceHistory (appends latest if different from last entry)
 *   - freshness.reviewDate / daysSinceReview / pricePctChange
 *   - last_updated timestamp
 *
 * This makes data/stocks/*.json the single source of truth for prices.
 * Downstream scripts (hydrate-content.js, research-monitor.js) will
 * eventually read from these JSONs instead of parsing index.html.
 *
 * Usage:
 *   node scripts/update-stock-json.js
 *   node scripts/update-stock-json.js --dry-run
 */

const fs = require('fs');
const path = require('path');
const { findLatestPrices } = require('./find-latest-prices');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function main() {
  console.log('=== Continuum Intelligence – Update Stock JSONs ===\n');
  if (DRY_RUN) console.log('  🏃 DRY RUN – no files will be written\n');

  // ── Get latest prices ──────────────────────────────────────────────
  const priceResult = findLatestPrices('newest');
  if (!priceResult) {
    console.error('  ✗ No price data found. Run fetch-live-prices.js first.');
    process.exit(1);
  }

  console.log(`  Price source: ${priceResult.source} (${priceResult.file})`);
  console.log(`  Updated: ${priceResult.updated}`);
  console.log(`  Tickers with prices: ${Object.keys(priceResult.prices).length}\n`);

  // ── Find all stock JSONs ───────────────────────────────────────────
  if (!fs.existsSync(STOCKS_DIR)) {
    console.error(`  ✗ ${STOCKS_DIR} does not exist. Run extract-stock-data.js first.`);
    process.exit(1);
  }

  const jsonFiles = fs.readdirSync(STOCKS_DIR).filter(f => f.endsWith('.json'));
  console.log(`  Stock JSONs found: ${jsonFiles.length}\n`);

  let updated = 0;
  let skipped = 0;
  let noPrice = 0;

  for (const file of jsonFiles) {
    const ticker = file.replace('.json', '');
    const filePath = path.join(STOCKS_DIR, file);

    // Read existing JSON
    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      console.error(`  ✗ Failed to read ${file}: ${err.message}`);
      continue;
    }

    // Find matching price data
    const priceData = priceResult.prices[ticker];
    if (!priceData) {
      console.log(`  ⊘ ${ticker}: no price data available`);
      noPrice++;
      continue;
    }

    const newPrice = priceData.price;
    const oldPrice = stock.current_price;
    const FORCE = args.includes('--force');
    const priceChanged = Math.abs(newPrice - (oldPrice || 0)) > 0.001;

    // Technical Analysis Sync check
    const researchPath = path.join(__dirname, '..', 'data', 'research', `${ticker}.json`);
    let needsTASync = false;
    if (fs.existsSync(researchPath)) {
      try {
        const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
        if (research.technicalAnalysis && !stock.technicalAnalysis) {
          needsTASync = true;
        }
      } catch (err) { }
    }

    if (!priceChanged && !FORCE && !needsTASync) {
      console.log(`  ─ ${ticker}: A$${newPrice} (unchanged)`);
      skipped++;
      continue;
    }

    // ── Update price ─────────────────────────────────────────────
    stock.current_price = newPrice;

    // ── Update price history ─────────────────────────────────────
    // Append new price if it differs from the last entry
    if (!stock.priceHistory) stock.priceHistory = [];
    const lastHistoryPrice = stock.priceHistory[stock.priceHistory.length - 1];
    if (Math.abs(newPrice - (lastHistoryPrice || 0)) > 0.001) {
      stock.priceHistory.push(newPrice);

      // Keep max 252 trading days (1 year)
      if (stock.priceHistory.length > 252) {
        stock.priceHistory = stock.priceHistory.slice(-252);
      }
    }

    // ── Update freshness ─────────────────────────────────────────
    if (!stock.freshness) stock.freshness = {};
    const now = new Date();
    const reviewPrice = stock.freshness.priceAtReview || oldPrice || newPrice;
    const pctChange = reviewPrice ? ((newPrice - reviewPrice) / reviewPrice * 100) : 0;

    stock.freshness.pricePctChange = Math.round(pctChange * 10) / 10;

    // Calculate days since last review
    if (stock.freshness.reviewDate) {
      const reviewDate = new Date(stock.freshness.reviewDate);
      if (!isNaN(reviewDate.getTime())) {
        const daysSince = Math.floor((now - reviewDate) / (1000 * 60 * 60 * 24));
        stock.freshness.daysSinceReview = daysSince;
      }
    }

    // ── Update urgency based on price movement + age ─────────────
    const absPctChange = Math.abs(pctChange);
    const daysSince = stock.freshness.daysSinceReview || 0;
    let urgency = 0;

    // Price movement contribution
    if (absPctChange > 15) urgency += 40;
    else if (absPctChange > 10) urgency += 30;
    else if (absPctChange > 5) urgency += 20;
    else if (absPctChange > 3) urgency += 10;

    // Age contribution
    if (daysSince > 30) urgency += 30;
    else if (daysSince > 14) urgency += 20;
    else if (daysSince > 7) urgency += 10;

    // Catalyst proximity (if catalyst date exists)
    if (stock.freshness.nearestCatalystDays !== null && stock.freshness.nearestCatalystDays !== undefined) {
      const catalystDays = stock.freshness.nearestCatalystDays;
      if (catalystDays <= 0) urgency += 25; // catalyst has passed
      else if (catalystDays <= 3) urgency += 20;
      else if (catalystDays <= 7) urgency += 10;
    }

    stock.freshness.urgency = Math.min(urgency, 100);
    stock.freshness.status = urgency >= 50 ? 'CRITICAL' :
      urgency >= 35 ? 'HIGH' :
        urgency >= 20 ? 'MODERATE' : 'OK';
    stock.freshness.badge = stock.freshness.status.toLowerCase();

    // ── Update timestamp ─────────────────────────────────────────
    stock.last_price_update = now.toISOString();

    // ── Sync technicalAnalysis from research (Expert Source) ──────
    if (fs.existsSync(researchPath)) {
      try {
        const research = JSON.parse(fs.readFileSync(researchPath, 'utf8'));
        if (research.technicalAnalysis) {
          stock.technicalAnalysis = research.technicalAnalysis;
          // Ensure technicalAnalysis object has the most recent price if available
          if (stock.technicalAnalysis.price) {
            stock.technicalAnalysis.price.current = newPrice;
          }
        }
      } catch (err) { }
    }

    // ── Log ──────────────────────────────────────────────────────
    const changeStr = priceData.changePercent !== undefined
      ? ` (${priceData.changePercent >= 0 ? '+' : ''}${priceData.changePercent.toFixed(2)}%)`
      : '';
    const freshStr = stock.freshness.status !== 'OK' ? ` [${stock.freshness.status}]` : '';
    const taStr = (fs.existsSync(researchPath) && JSON.parse(fs.readFileSync(researchPath, 'utf8')).technicalAnalysis) ? ' [TA-Synced]' : '';
    console.log(`  ✓ ${ticker}: A$${oldPrice || 0} → A$${newPrice}${changeStr}${freshStr}${taStr}`);

    // ── Write ────────────────────────────────────────────────────
    if (!DRY_RUN) {
      fs.writeFileSync(filePath, JSON.stringify(stock, null, 2));
    }

    updated++;
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Unchanged: ${skipped}`);
  console.log(`  No price data: ${noPrice}`);
  if (DRY_RUN) console.log(`  (Dry run – no files written)`);
  console.log('');

  // Exit with informative code for CI
  process.exit(updated > 0 ? 0 : 0);
}

main();
