/**
 * Continuum Intelligence - HTML Updater
 * Applies price data and narrative updates to index.html
 * Generates updated HTML with fresh data
 */

const fs = require('fs');
const path = require('path');
const { findLatestPrices } = require('./find-latest-prices');

// Load data files
function loadData() {
  const dataDir = path.join(__dirname, '..', 'data');

  // Prices: use find-latest-prices to pick freshest available source
  const priceResult = findLatestPrices('newest');
  if (!priceResult) {
    throw new Error('No price data found. Run event-scraper or fetch-live-prices first.');
  }
  console.log(`Using prices from ${priceResult.source} (${priceResult.file}), updated ${priceResult.updated}`);

  const updatesPath = path.join(dataDir, 'pending-updates.json');
  const eventsPath = path.join(dataDir, 'events-log.json');

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

// Format currency
function formatCurrency(value, currency = 'A$') {
  if (!value) return '--';
  return `${currency}${value.toFixed(2)}`;
}

// Format market cap
function formatMarketCap(value) {
  if (!value) return '--';
  if (value >= 1e12) return `A$${(value / 1e12).toFixed(1)}T`;
  if (value >= 1e9) return `A$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `A$${(value / 1e6).toFixed(1)}M`;
  return `A$${value.toFixed(0)}`;
}

// Update price in HTML
function updatePrice(html, ticker, priceData) {
  let modified = html;
  
  // Update price in STOCK_DATA object
  const priceRegex = new RegExp(`(${ticker}:[\\s\\S]*?price:\\s*)([0-9.]+)`, 'i');
  if (priceRegex.test(modified)) {
    modified = modified.replace(priceRegex, `$1${priceData.price.toFixed(2)}`);
  }
  
  // Update date
  const dateStr = new Date().toLocaleDateString('en-AU', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  const dateRegex = new RegExp(`(${ticker}:[\\s\\S]*?date:\\s*['"])([^'"]+)`);
  if (dateRegex.test(modified)) {
    modified = modified.replace(dateRegex, `$1${dateStr}`);
  }
  
  // Update price history array (append latest, keep last 252 trading days)
  // This is a simplified version - real implementation would be more careful
  
  return modified;
}

// Update hero metrics based on price data
function updateHeroMetrics(html, ticker, priceData) {
  let modified = html;
  
  // Update hero price display
  const heroPriceRegex = new RegExp(`(${ticker}[\\s\\S]*?price:\\s*)([0-9.]+)`, 'i');
  if (heroPriceRegex.test(modified)) {
    modified = modified.replace(heroPriceRegex, `$1${priceData.price.toFixed(2)}`);
  }
  
  // Update market cap if available
  if (priceData.marketCap) {
    const mktCapFormatted = formatMarketCap(priceData.marketCap);
    const mktCapRegex = new RegExp(`(${ticker}[\\s\\S]*?Mkt Cap['"]*\\s*value:\\s*['"])([^'"]+)`);
    if (mktCapRegex.test(modified)) {
      modified = modified.replace(mktCapRegex, `$1${mktCapFormatted}`);
    }
  }
  
  // Update drawdown calculation
  if (priceData.drawdown !== undefined) {
    const drawdownRegex = new RegExp(`(${ticker}[\\s\\S]*?drawdown['"]*\\s*value:\\s*)([0-9.]+)`);
    if (drawdownRegex.test(modified)) {
      modified = modified.replace(drawdownRegex, `$1${priceData.drawdown.toFixed(1)}`);
    }
  }
  
  return modified;
}

// Update freshness data
function updateFreshness(html, ticker, freshnessData) {
  let modified = html;
  
  // Find and update FRESHNESS_DATA entry for this ticker
  const freshnessStart = modified.indexOf('const FRESHNESS_DATA = {');
  if (freshnessStart === -1) return modified;
  
  const tickerPattern = new RegExp(`"${ticker}":\\s*\\{[^}]+\\}`, 's');
  const match = modified.match(tickerPattern);
  
  if (match) {
    const oldEntry = match[0];
    const newEntry = `"${ticker}": {
    "reviewDate": "${freshnessData.reviewDate}",
    "daysSinceReview": ${freshnessData.daysSinceReview},
    "priceAtReview": ${freshnessData.priceAtReview.toFixed(2)},
    "pricePctChange": ${freshnessData.pricePctChange.toFixed(1)},
    "nearestCatalyst": ${freshnessData.nearestCatalyst ? `"${freshnessData.nearestCatalyst}"` : 'null'},
    "nearestCatalystDate": ${freshnessData.nearestCatalystDate ? `"${freshnessData.nearestCatalystDate}"` : 'null'},
    "nearestCatalystDays": ${freshnessData.nearestCatalystDays || 'null'},
    "urgency": ${freshnessData.urgency},
    "status": "${freshnessData.status}",
    "badge": "${freshnessData.badge}"${freshnessData.eventsDetected ? `,
    "eventsDetected": ${freshnessData.eventsDetected}` : ''}
  }`;
    
    modified = modified.replace(oldEntry, newEntry);
  }
  
  return modified;
}

// Update narrative text based on events
function updateNarrative(html, ticker, updates) {
  let modified = html;
  
  for (const update of updates) {
    // Update verdict text if provided
    if (update.verdictAddendum) {
      // Find the verdict section for this ticker
      const tickerStart = modified.indexOf(`ticker: '${ticker}'`);
      if (tickerStart === -1) continue;
      
      const tickerEnd = modified.indexOf('};\n\n// ===', tickerStart + 1000);
      const tickerSection = modified.slice(tickerStart, tickerEnd);
      
      // Find verdict text and append addendum
      const verdictMatch = tickerSection.match(/(verdict:\s*\{[\s\S]*?text:['"])([^'"]+)/);
      if (verdictMatch && !tickerSection.includes(update.verdictAddendum)) {
        const newVerdict = verdictMatch[1] + verdictMatch[2] + ' ' + update.verdictAddendum;
        modified = modified.replace(verdictMatch[0], newVerdict);
      }
    }
    
    // Update evidence cards if provided
    if (update.evidenceUpdate) {
      // This would add or update evidence domain cards
      // Simplified implementation
    }
    
    // Update hypothesis scores if provided
    if (update.scoreAdjustment) {
      // This would adjust hypothesis survival scores
      // Simplified implementation
    }
  }
  
  return modified;
}

// Update featured card metrics
function updateFeaturedCard(html, ticker, priceData) {
  let modified = html;
  
  // Update featured card price
  const featuredPriceRegex = new RegExp(
    `(featuredPriceColor:[^}]+)(price:[^,]+)`,
    'i'
  );
  // This is a simplified pattern - real implementation would be more specific
  
  return modified;
}

// Update identity table
function updateIdentityTable(html, ticker, priceData) {
  let modified = html;
  
  // Update share price in identity table
  const priceRowPattern = new RegExp(
    `(${ticker}[\\s\\S]*?Share Price['"]*\\s*,\\s*['"])([^'"]+)`,
    'i'
  );
  if (priceRowPattern.test(modified)) {
    modified = modified.replace(priceRowPattern, `$1${formatCurrency(priceData.price)}`);
  }
  
  // Update 52-week range if we have the data
  if (priceData.yearHigh && priceData.yearLow) {
    const rangePattern = new RegExp(
      `(${ticker}[\\s\\S]*?52-Week Range['"]*\\s*,\\s*['"])([^'"]+)`,
      'i'
    );
    if (rangePattern.test(modified)) {
      const newRange = `${formatCurrency(priceData.yearLow)} – ${formatCurrency(priceData.yearHigh)}`;
      modified = modified.replace(rangePattern, `$1${newRange}`);
    }
  }
  
  // Update market cap
  if (priceData.marketCap) {
    const mktCapPattern = new RegExp(
      `(${ticker}[\\s\\S]*?Market Cap['"]*\\s*,\\s*['"])([^'"]+)`,
      'i'
    );
    if (mktCapPattern.test(modified)) {
      modified = modified.replace(mktCapPattern, `$1${formatMarketCap(priceData.marketCap)}`);
    }
  }
  
  return modified;
}

// Main update function
function main() {
  console.log('=== Continuum HTML Updater ===\n');
  
  const data = loadData();
  const htmlPath = path.join(__dirname, '..', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');
  
  console.log(`Loaded ${Object.keys(data.prices).length} price updates`);
  console.log(`Loaded updates for ${Object.keys(data.updates.updates || {}).length} tickers`);
  
  let modifiedCount = 0;
  
  // Apply price updates
  for (const [ticker, priceData] of Object.entries(data.prices)) {
    const originalHtml = html;
    
    html = updatePrice(html, ticker, priceData);
    html = updateHeroMetrics(html, ticker, priceData);
    html = updateIdentityTable(html, ticker, priceData);
    html = updateFeaturedCard(html, ticker, priceData);
    
    if (html !== originalHtml) {
      modifiedCount++;
      console.log(`✓ ${ticker}: Price $${priceData.price.toFixed(2)}`);
    }
  }
  
  // Apply freshness updates
  for (const [ticker, freshnessData] of Object.entries(data.updates.freshnessUpdates || {})) {
    const originalHtml = html;
    html = updateFreshness(html, ticker, freshnessData);
    
    if (html !== originalHtml) {
      console.log(`✓ ${ticker}: Freshness ${freshnessData.status}`);
    }
  }
  
  // Apply narrative updates
  for (const [ticker, updates] of Object.entries(data.updates.updates || {})) {
    if (updates.length > 0) {
      const originalHtml = html;
      html = updateNarrative(html, ticker, updates);
      
      if (html !== originalHtml) {
        console.log(`✓ ${ticker}: ${updates.length} narrative updates`);
      }
    }
  }
  
  // Write updated HTML
  fs.writeFileSync(htmlPath, html);
  
  console.log(`\n=== Complete ===`);
  console.log(`Updated ${modifiedCount} tickers`);
  console.log('index.html refreshed');
  
  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    tickersUpdated: modifiedCount,
    pricesUpdated: Object.keys(data.prices).length,
    narrativesUpdated: Object.values(data.updates.updates || {}).filter(u => u.length > 0).length
  };
  
  fs.writeFileSync(
    path.join(__dirname, '..', 'data', 'last-update-report.json'),
    JSON.stringify(report, null, 2)
  );
}

main();
