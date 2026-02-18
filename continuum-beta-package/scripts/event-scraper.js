/**
 * Continuum Intelligence - Event Scraper
 * Detects ASX announcements, earnings, and market events for coverage universe
 * Runs twice daily via GitHub Actions
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// Coverage universe - must match your tickers
const COVERAGE_TICKERS = [
  'WOW', 'XRO', 'WTC', 'DRO', 'PME', 'GYG', 
  'CSL', 'MQG', 'GMG', 'WDS', 'SIG', 'FMG'
];

// Event type patterns for classification
const EVENT_PATTERNS = {
  EARNINGS: [
    /annual report|half.year|quarterly|financial results|profit|loss|revenue|earnings/i,
    /dividend|distribution|payment|franked/i,
    /guidance|outlook|forecast/i
  ],
  MANAGEMENT: [
    /appointment|resignation|retirement|departure|chief executive|managing director|ceo|cfo|chairman/i,
    /board|director|executive|leadership/i
  ],
  MA: [
    /acquisition|merger|takeover|scheme of arrangement|buyback|capital raising|placement|rights issue/i,
    /divestment|sale of|acquire|purchase/i
  ],
  MACRO: [
    /rba|reserve bank|interest rate|inflation|gdp|economic|monetary policy/i,
    /covid|pandemic|supply chain|commodity|oil|iron ore/i
  ],
  ANALYST: [
    /broker|analyst|rating|target|upgrade|downgrade|consensus/i
  ],
  REGULATORY: [
    /accc|asic|regulatory|investigation|inquiry|court|litigation|fine|penalty/i,
    /compliance|governance|code of conduct/i
  ]
};

// Yahoo Finance for price data (free, delayed 15-20 min)
async function fetchYahooData(ticker) {
  const yahooTicker = ticker + '.AX';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooTicker}?interval=1d&range=1y`;
  
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.chart?.error) {
            reject(new Error(json.chart.error.description));
          } else {
            resolve(json.chart?.result?.[0]);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

// Parse Yahoo data into usable format
function parseYahooData(rawData, ticker) {
  if (!rawData || !rawData.meta) return null;
  
  const meta = rawData.meta;
  const timestamps = rawData.timestamp || [];
  const closes = rawData.indicators?.quote?.[0]?.close || [];
  
  const currentPrice = meta.regularMarketPrice || closes[closes.length - 1];
  const previousClose = meta.previousClose || closes[closes.length - 2];
  const yearHigh = meta.fiftyTwoWeekHigh || Math.max(...closes.filter(c => c));
  const yearLow = meta.fiftyTwoWeekLow || Math.min(...closes.filter(c => c));
  
  return {
    ticker,
    price: currentPrice,
    previousClose,
    change: currentPrice - previousClose,
    changePercent: ((currentPrice - previousClose) / previousClose) * 100,
    yearHigh,
    yearLow,
    drawdown: ((yearHigh - currentPrice) / yearHigh) * 100,
    marketCap: meta.marketCap,
    volume: meta.regularMarketVolume,
    timestamp: new Date().toISOString()
  };
}

// Fetch ASX announcements via RSS (asxannouncements.com)
async function fetchASXAnnouncements(ticker) {
  // Note: This is a public RSS feed. For production, consider ASX's official API
  const url = `https://www.asx.com.au/asxweb/rss/news/${ticker}.rss`;
  
  return new Promise((resolve, reject) => {
    https.get(url, { 
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject).on('timeout', () => reject(new Error('Timeout')));
  });
}

// Simple RSS parser (no external deps)
function parseRSS(xml) {
  const items = [];
  const itemRegex = /<item>(.*?)<\/item>/gs;
  const titleRegex = /<title>(.*?)<\/title>/;
  const linkRegex = /<link>(.*?)<\/link>/;
  const dateRegex = /<pubDate>(.*?)<\/pubDate>/;
  const descRegex = /<description>(.*?)<\/description>/;
  
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    items.push({
      title: (item.match(titleRegex)?.[1] || '').replace(/<\!\[CDATA\[(.*?)\]\]>/, '$1').trim(),
      link: (item.match(linkRegex)?.[1] || '').trim(),
      pubDate: (item.match(dateRegex)?.[1] || '').trim(),
      description: (item.match(descRegex)?.[1] || '').replace(/<\!\[CDATA\[(.*?)\]\]>/, '$1').trim()
    });
  }
  
  return items;
}

// Classify event type based on title/description
function classifyEvent(title, description = '') {
  const text = `${title} ${description}`.toLowerCase();
  
  for (const [type, patterns] of Object.entries(EVENT_PATTERNS)) {
    if (patterns.some(pattern => pattern.test(text))) {
      return type;
    }
  }
  
  return 'OTHER';
}

// Determine severity based on keywords
function assessSeverity(title, description = '', eventType) {
  const text = `${title} ${description}`.toLowerCase();
  
  const highImpact = /profit warning|material|significant|substantial|acquisition|merger|ceo|cfo|chairman|resign|depart/i;
  const mediumImpact = /update|trading|guidance|dividend|annual report|half.year/i;
  
  if (highImpact.test(text)) return 'HIGH';
  if (mediumImpact.test(text)) return 'MEDIUM';
  
  // Default based on type
  if (eventType === 'EARNINGS' || eventType === 'MANAGEMENT' || eventType === 'MA') return 'MEDIUM';
  return 'LOW';
}

// Process all tickers
async function processAllTickers() {
  const results = {
    timestamp: new Date().toISOString(),
    prices: {},
    events: []
  };
  
  console.log(`Processing ${COVERAGE_TICKERS.length} tickers...`);
  
  for (const ticker of COVERAGE_TICKERS) {
    try {
      // Fetch price data
      const rawData = await fetchYahooData(ticker);
      const priceData = parseYahooData(rawData, ticker);
      
      if (priceData) {
        results.prices[ticker] = priceData;
        console.log(`✓ ${ticker}: $${priceData.price.toFixed(2)} (${priceData.changePercent.toFixed(1)}%)`);
      }
      
      // Fetch announcements (with delay to avoid rate limiting)
      await new Promise(r => setTimeout(r, 1000));
      
      try {
        const rssXml = await fetchASXAnnouncements(ticker);
        const announcements = parseRSS(rssXml);
        
        // Filter announcements from last 24 hours
        const cutoff = new Date();
        cutoff.setHours(cutoff.getHours() - 24);
        
        for (const ann of announcements.slice(0, 5)) { // Check last 5 announcements
          const annDate = new Date(ann.pubDate);
          if (annDate > cutoff) {
            const eventType = classifyEvent(ann.title, ann.description);
            const severity = assessSeverity(ann.title, ann.description, eventType);
            
            results.events.push({
              ticker,
              timestamp: annDate.toISOString(),
              type: eventType,
              severity,
              title: ann.title,
              link: ann.link,
              requiresNarrativeUpdate: severity === 'HIGH' || (severity === 'MEDIUM' && ['EARNINGS', 'MANAGEMENT', 'MA'].includes(eventType))
            });
          }
        }
      } catch (e) {
        console.warn(`⚠ ${ticker} announcements failed: ${e.message}`);
      }
      
    } catch (e) {
      console.error(`✗ ${ticker} failed: ${e.message}`);
    }
    
    // Rate limiting
    await new Promise(r => setTimeout(r, 500));
  }
  
  return results;
}

// Save results
function saveResults(results) {
  const dataDir = path.join(__dirname, '..', 'data');
  const eventsDir = path.join(dataDir, 'events');
  
  // Ensure directories exist
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(eventsDir)) fs.mkdirSync(eventsDir, { recursive: true });
  
  // Save latest prices
  fs.writeFileSync(
    path.join(dataDir, 'latest-prices.json'),
    JSON.stringify(results.prices, null, 2)
  );
  
  // Save events with timestamp
  const dateStr = new Date().toISOString().split('T')[0];
  fs.writeFileSync(
    path.join(eventsDir, `events-${dateStr}.json`),
    JSON.stringify(results.events, null, 2)
  );
  
  // Save master events log
  const eventsLogPath = path.join(dataDir, 'events-log.json');
  let eventsLog = [];
  if (fs.existsSync(eventsLogPath)) {
    eventsLog = JSON.parse(fs.readFileSync(eventsLogPath, 'utf8'));
  }
  eventsLog.push(...results.events);
  // Keep only last 30 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  eventsLog = eventsLog.filter(e => new Date(e.timestamp) > cutoff);
  fs.writeFileSync(eventsLogPath, JSON.stringify(eventsLog, null, 2));
  
  console.log(`\nSaved ${Object.keys(results.prices).length} prices, ${results.events.length} events`);
}

// Main execution
async function main() {
  console.log('=== Continuum Event Scraper ===');
  console.log(`Run started: ${new Date().toISOString()}\n`);
  
  try {
    const results = await processAllTickers();
    saveResults(results);
    
    // Summary
    const highImpact = results.events.filter(e => e.severity === 'HIGH');
    const narrativeTriggers = results.events.filter(e => e.requiresNarrativeUpdate);
    
    console.log('\n=== Summary ===');
    console.log(`Events detected: ${results.events.length}`);
    console.log(`High impact: ${highImpact.length}`);
    console.log(`Narrative updates needed: ${narrativeTriggers.length}`);
    
    if (narrativeTriggers.length > 0) {
      console.log('\nTickers requiring narrative update:');
      const tickers = [...new Set(narrativeTriggers.map(e => e.ticker))];
      tickers.forEach(t => console.log(`  - ${t}`));
    }
    
    // Exit code for GitHub Actions
    process.exit(narrativeTriggers.length > 0 ? 100 : 0);
    
  } catch (e) {
    console.error('Fatal error:', e);
    process.exit(1);
  }
}

main();
