/**
 * Continuum Intelligence - Data Updater
 * Applies price data and narrative updates to per-ticker JSON files.
 *
 * Target files:
 *   data/research/{TICKER}.json  - per-ticker research data
 *   data/stocks/{TICKER}.json    - per-ticker stock data (price, priceHistory)
 *   data/freshness.json          - freshness metadata for all tickers
 *   data/reference.json          - reference / identity data for all tickers
 *   data/last-update-report.json - run report (unchanged)
 */

const fs = require('fs');
const path = require('path');
const { findLatestPrices } = require('./find-latest-prices');

const DATA_DIR = path.join(__dirname, '..', 'data');

// ---------------------------------------------------------------------------
// Helper: read JSON, apply updater, write back
// ---------------------------------------------------------------------------
function updateJsonFile(filePath, updater) {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { /* start fresh */ }
  updater(data);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// Load input data (prices + pending updates + events)
// ---------------------------------------------------------------------------
function loadData() {
  const priceResult = findLatestPrices('newest');
  if (!priceResult) {
    throw new Error('No price data found. Run event-scraper or fetch-live-prices first.');
  }
  console.log(`Using prices from ${priceResult.source} (${priceResult.file}), updated ${priceResult.updated}`);

  const updatesPath = path.join(DATA_DIR, 'pending-updates.json');
  const eventsPath  = path.join(DATA_DIR, 'events-log.json');

  return {
    prices: priceResult.prices,
    updates: fs.existsSync(updatesPath)
      ? JSON.parse(fs.readFileSync(updatesPath, 'utf8'))
      : { updates: {}, freshnessUpdates: {} },
    events: fs.existsSync(eventsPath)
      ? JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
      : []
  };
}

// ---------------------------------------------------------------------------
// Format helpers (business logic preserved)
// ---------------------------------------------------------------------------
function formatCurrency(value, currency = 'A$') {
  if (!value) return '--';
  return `${currency}${value.toFixed(2)}`;
}

function formatMarketCap(value) {
  if (!value) return '--';
  if (value >= 1e12) return `A$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9)  return `A$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6)  return `A$${(value / 1e6).toFixed(1)}M`;
  return `A$${value.toFixed(0)}`;
}

// ---------------------------------------------------------------------------
// Update price fields in research JSON and stocks JSON
// ---------------------------------------------------------------------------
function updatePrice(ticker, priceData) {
  const dateStr = new Date().toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  // Update research/{TICKER}.json — price + date
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  updateJsonFile(researchPath, (research) => {
    research.price = parseFloat(priceData.price.toFixed(2));
    research.date  = dateStr;
    research.current_price = parseFloat(priceData.price.toFixed(2));
    research.last_price_update = new Date().toISOString();
  });

  // Update stocks/{TICKER}.json — price + date
  const stocksPath = path.join(DATA_DIR, 'stocks', `${ticker}.json`);
  if (fs.existsSync(stocksPath)) {
    updateJsonFile(stocksPath, (stock) => {
      stock.price = parseFloat(priceData.price.toFixed(2));
      stock.date  = dateStr;
    });
  }
}

// ---------------------------------------------------------------------------
// Update hero metrics (market cap, drawdown) in research JSON
// ---------------------------------------------------------------------------
function updateHeroMetrics(ticker, priceData) {
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  if (!fs.existsSync(researchPath)) return;

  updateJsonFile(researchPath, (research) => {
    research.current_price = parseFloat(priceData.price.toFixed(2));

    if (priceData.marketCap) {
      research.market_cap = formatMarketCap(priceData.marketCap);
    }

    if (priceData.drawdown !== undefined) {
      if (!research.technicalAnalysis) research.technicalAnalysis = {};
      if (!research.technicalAnalysis.trend) research.technicalAnalysis.trend = {};
      research.technicalAnalysis.trend.drawdown = parseFloat(priceData.drawdown.toFixed(1));
    }
  });
}

// ---------------------------------------------------------------------------
// Update freshness metadata in data/freshness.json
// ---------------------------------------------------------------------------
function updateFreshness(ticker, freshnessData) {
  const freshnessPath = path.join(DATA_DIR, 'freshness.json');

  updateJsonFile(freshnessPath, (freshness) => {
    const entry = {};
    if (freshnessData.reviewDate !== undefined)        entry.reviewDate        = freshnessData.reviewDate;
    if (freshnessData.daysSinceReview !== undefined)    entry.daysSinceReview   = freshnessData.daysSinceReview;
    if (freshnessData.priceAtReview !== undefined)      entry.priceAtReview     = parseFloat(freshnessData.priceAtReview.toFixed(2));
    if (freshnessData.pricePctChange !== undefined)     entry.pricePctChange    = parseFloat(freshnessData.pricePctChange.toFixed(1));
    entry.nearestCatalyst     = freshnessData.nearestCatalyst     || null;
    entry.nearestCatalystDate = freshnessData.nearestCatalystDate || null;
    entry.nearestCatalystDays = freshnessData.nearestCatalystDays || null;
    if (freshnessData.urgency !== undefined)            entry.urgency           = freshnessData.urgency;
    if (freshnessData.status)                           entry.status            = freshnessData.status;
    if (freshnessData.badge)                            entry.badge             = freshnessData.badge;
    if (freshnessData.eventsDetected)                   entry.eventsDetected    = freshnessData.eventsDetected;

    freshness[ticker] = Object.assign(freshness[ticker] || {}, entry);
  });

  // Also mirror freshness into the research JSON for co-location
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  if (fs.existsSync(researchPath)) {
    updateJsonFile(researchPath, (research) => {
      if (!research.freshness) research.freshness = {};
      Object.assign(research.freshness, {
        pricePctChange: freshnessData.pricePctChange !== undefined
          ? parseFloat(freshnessData.pricePctChange.toFixed(1))
          : research.freshness.pricePctChange,
        urgency: freshnessData.urgency !== undefined ? freshnessData.urgency : research.freshness.urgency,
        status:  freshnessData.status  || research.freshness.status,
        badge:   freshnessData.badge   || research.freshness.badge
      });
    });
  }
}

// ---------------------------------------------------------------------------
// Update narrative text (verdict addendum, evidence, hypothesis scores)
// ---------------------------------------------------------------------------
function updateNarrative(ticker, updates) {
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  if (!fs.existsSync(researchPath)) return;

  updateJsonFile(researchPath, (research) => {
    for (const update of updates) {
      // Append verdict addendum
      if (update.verdictAddendum) {
        if (!research.big_picture) research.big_picture = '';
        if (!research.big_picture.includes(update.verdictAddendum)) {
          research.big_picture = (research.big_picture + ' ' + update.verdictAddendum).trim();
        }
      }

      // Update evidence items
      if (update.evidenceUpdate) {
        if (!research.evidence_items) research.evidence_items = [];
        research.evidence_items.push(update.evidenceUpdate);
      }

      // Adjust hypothesis scores
      if (update.scoreAdjustment && research.hypotheses) {
        for (const [hypoKey, adjustment] of Object.entries(update.scoreAdjustment)) {
          if (research.hypotheses[hypoKey]) {
            if (typeof adjustment === 'number') {
              research.hypotheses[hypoKey].survival_score = adjustment;
            } else if (adjustment.delta) {
              research.hypotheses[hypoKey].survival_score =
                Math.max(0, Math.min(1,
                  (research.hypotheses[hypoKey].survival_score || 0) + adjustment.delta
                ));
            }
            research.hypotheses[hypoKey].last_updated = new Date().toISOString();
          }
        }
      }
    }

    research.last_research_update = new Date().toISOString();
  });
}

// ---------------------------------------------------------------------------
// Update featured card data in research JSON
// ---------------------------------------------------------------------------
function updateFeaturedCard(ticker, priceData) {
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  if (!fs.existsSync(researchPath)) return;

  updateJsonFile(researchPath, (research) => {
    research.current_price = parseFloat(priceData.price.toFixed(2));
    // Append latest price to priceHistory (short recent window) if it differs
    if (Array.isArray(research.priceHistory)) {
      const last = research.priceHistory[research.priceHistory.length - 1];
      if (last !== research.current_price) {
        research.priceHistory.push(research.current_price);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Update identity / reference table data
// ---------------------------------------------------------------------------
function updateIdentityTable(ticker, priceData) {
  // Update research JSON with current share price
  const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
  if (fs.existsSync(researchPath)) {
    updateJsonFile(researchPath, (research) => {
      research.current_price = parseFloat(priceData.price.toFixed(2));

      if (priceData.yearHigh && priceData.yearLow) {
        if (!research.technicalAnalysis) research.technicalAnalysis = {};
        if (!research.technicalAnalysis.keyLevels) research.technicalAnalysis.keyLevels = {};
        if (!research.technicalAnalysis.keyLevels.fiftyTwoWeekHigh) research.technicalAnalysis.keyLevels.fiftyTwoWeekHigh = {};
        if (!research.technicalAnalysis.keyLevels.fiftyTwoWeekLow) research.technicalAnalysis.keyLevels.fiftyTwoWeekLow = {};
        research.technicalAnalysis.keyLevels.fiftyTwoWeekHigh.price = priceData.yearHigh;
        research.technicalAnalysis.keyLevels.fiftyTwoWeekLow.price  = priceData.yearLow;
      }

      if (priceData.marketCap) {
        research.market_cap = formatMarketCap(priceData.marketCap);
      }
    });
  }

  // Update reference.json with identity-table fields
  const referencePath = path.join(DATA_DIR, 'reference.json');
  updateJsonFile(referencePath, (ref) => {
    if (!ref[ticker]) ref[ticker] = {};
    const entry = ref[ticker];

    if (!entry._anchors) entry._anchors = {};
    entry._anchors.price = parseFloat(priceData.price.toFixed(2));

    if (priceData.yearHigh && priceData.yearLow) {
      entry._anchors.yearHigh = priceData.yearHigh;
      entry._anchors.yearLow  = priceData.yearLow;
    }

    if (priceData.marketCap) {
      entry._anchors.marketCapStr = formatMarketCap(priceData.marketCap).replace('A$', '');
    }

    if (priceData.drawdown !== undefined) {
      entry._anchors.drawdown = parseFloat(priceData.drawdown.toFixed(1));
    }
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  console.log('=== Continuum Data Updater ===\n');

  const data = loadData();

  console.log(`Loaded ${Object.keys(data.prices).length} price updates`);
  console.log(`Loaded updates for ${Object.keys(data.updates.updates || {}).length} tickers`);

  let modifiedCount = 0;

  // Apply price updates
  for (const [ticker, priceData] of Object.entries(data.prices)) {
    const researchPath = path.join(DATA_DIR, 'research', `${ticker}.json`);
    const beforeJson = fs.existsSync(researchPath)
      ? fs.readFileSync(researchPath, 'utf8') : '{}';

    updatePrice(ticker, priceData);
    updateHeroMetrics(ticker, priceData);
    updateIdentityTable(ticker, priceData);
    updateFeaturedCard(ticker, priceData);

    const afterJson = fs.existsSync(researchPath)
      ? fs.readFileSync(researchPath, 'utf8') : '{}';

    if (afterJson !== beforeJson) {
      modifiedCount++;
      console.log(`  ${ticker}: Price $${priceData.price.toFixed(2)}`);
    }
  }

  // Apply freshness updates
  for (const [ticker, freshnessData] of Object.entries(data.updates.freshnessUpdates || {})) {
    updateFreshness(ticker, freshnessData);
    console.log(`  ${ticker}: Freshness ${freshnessData.status}`);
  }

  // Apply narrative updates
  for (const [ticker, updates] of Object.entries(data.updates.updates || {})) {
    if (updates.length > 0) {
      updateNarrative(ticker, updates);
      console.log(`  ${ticker}: ${updates.length} narrative updates`);
    }
  }

  console.log(`\n=== Complete ===`);
  console.log(`Updated ${modifiedCount} tickers`);
  console.log('JSON data files refreshed');

  // Generate report (unchanged)
  const report = {
    timestamp: new Date().toISOString(),
    tickersUpdated: modifiedCount,
    pricesUpdated: Object.keys(data.prices).length,
    narrativesUpdated: Object.values(data.updates.updates || {}).filter(u => u.length > 0).length
  };

  fs.writeFileSync(
    path.join(DATA_DIR, 'last-update-report.json'),
    JSON.stringify(report, null, 2)
  );
}

main();
