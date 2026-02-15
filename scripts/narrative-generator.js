/**
 * Continuum Intelligence - Narrative Generator
 * Auto-generates research narrative updates based on events
 * Uses template system for common events, with structured output
 */

const fs = require('fs');
const path = require('path');
const { findLatestPrices } = require('./find-latest-prices');

// Load existing data
function loadStockData() {
  const dataPath = path.join(__dirname, '..', 'index.html');
  const html = fs.readFileSync(dataPath, 'utf8');
  
  // Extract STOCK_DATA from HTML
  const match = html.match(/const STOCK_DATA = \{([\s\S]*?)\};/);
  if (!match) return {};
  
  // This is a simplified version - in practice, you'd parse the JS properly
  // For now, we'll work with the events data
  return {};
}

// Template generators for different event types
const NARRATIVE_TEMPLATES = {
  EARNINGS: {
    beat: (ticker, price, metrics) => ({
      headline: `${ticker} earnings exceeded consensus`,
      verdictAddendum: `Recent 1H FY26 results showed ${metrics.epsGrowth > 0 ? 'improving' : 'declining'} earnings trajectory.`,
      evidenceUpdate: `Corporate Communications (Updated): Recent earnings release showed EPS of $${metrics.eps}, ${metrics.vsConsensus > 0 ? '+' : ''}${metrics.vsConsensus}% vs consensus.`,
      scoreAdjustment: metrics.vsConsensus > 10 ? 5 : metrics.vsConsensus > 0 ? 2 : 0
    }),
    miss: (ticker, price, metrics) => ({
      headline: `${ticker} earnings missed consensus`,
      verdictAddendum: `Recent 1H FY26 results showed pressure on margins and earnings trajectory.`,
      evidenceUpdate: `Corporate Communications (Updated): Recent earnings release showed EPS of $${metrics.eps}, ${metrics.vsConsensus}% vs consensus, indicating operational challenges.`,
      scoreAdjustment: metrics.vsConsensus < -10 ? -5 : metrics.vsConsensus < 0 ? -2 : 0
    }),
    guidanceCut: (ticker, price, metrics) => ({
      headline: `${ticker} guidance reduced`,
      verdictAddendum: `Management has reduced FY26 guidance, indicating a more challenging operating environment than previously anticipated.`,
      evidenceUpdate: `Corporate Communications (Updated): Management reduced FY26 guidance, citing ${metrics.reason || 'challenging market conditions'}. This supports the structural margin erosion thesis (T2).`,
      scoreAdjustment: -8
    }),
    guidanceRaise: (ticker, price, metrics) => ({
      headline: `${ticker} guidance increased`,
      verdictAddendum: `Management raised FY26 guidance, suggesting the turnaround narrative is gaining traction.`,
      evidenceUpdate: `Corporate Communications (Updated): Management raised FY26 guidance, citing ${metrics.reason || 'improved trading conditions'}. This supports the turnaround thesis (T1).`,
      scoreAdjustment: 8
    })
  },
  
  MANAGEMENT: {
    ceoChange: (ticker, price, details) => ({
      headline: `${ticker} announces CEO transition`,
      verdictAddendum: `Leadership transition introduces execution risk. New CEO inherits the current strategic challenges.`,
      evidenceUpdate: `Leadership & Governance (Updated): CEO transition announced. New CEO ${details.newCEO} takes over from ${details.oldCEO}. Turnaround thesis (T1) now rests on unproven leadership.`,
      scoreAdjustment: -5,
      hypothesisImpact: { t1: -10, t2: 5 }
    }),
    cfoChange: (ticker, price, details) => ({
      headline: `${ticker} announces CFO change`,
      verdictAddendum: `CFO transition during a turnaround phase adds financial reporting risk.`,
      evidenceUpdate: `Leadership & Governance (Updated): CFO transition announced. Financial stewardship continuity risk elevated.`,
      scoreAdjustment: -3
    }),
    directorChange: (ticker, price, details) => ({
      headline: `${ticker} board changes`,
      verdictAddendum: `Board composition changes may signal evolving governance approach.`,
      evidenceUpdate: `Leadership & Governance (Updated): Board changes announced. Governance assessment pending new director track record.`,
      scoreAdjustment: -2
    })
  },
  
  MA: {
    acquisition: (ticker, price, details) => ({
      headline: `${ticker} announces acquisition`,
      verdictAddendum: `Acquisition of ${details.target} for $${details.value}M introduces integration execution risk and capital allocation questions.`,
      evidenceUpdate: `Corporate Communications (Updated): Acquisition announced - ${details.target} for $${details.value}M. Strategic rationale: ${details.rationale}. Integration risk added to T4 considerations.`,
      scoreAdjustment: details.value > 500 ? -5 : -2
    }),
    divestment: (ticker, price, details) => ({
      headline: `${ticker} announces divestment`,
      verdictAddendum: `Divestment of ${details.business} simplifies operations and improves focus on core business.`,
      evidenceUpdate: `Corporate Communications (Updated): Divestment announced - ${details.business} for $${details.value}M. Supports portfolio simplification thesis.`,
      scoreAdjustment: 3
    }),
    capitalRaising: (ticker, price, details) => ({
      headline: `${ticker} announces capital raising`,
      verdictAddendum: `Capital raising of $${details.amount}M dilutes existing shareholders and signals balance sheet pressure.`,
      evidenceUpdate: `Corporate Communications (Updated): Capital raising announced - $${details.amount}M via ${details.method}. Dilution impact: ${details.dilution}%. Balance sheet pressure supports T2 thesis.`,
      scoreAdjustment: -5
    })
  },
  
  REGULATORY: {
    investigation: (ticker, price, details) => ({
      headline: `${ticker} faces regulatory scrutiny`,
      verdictAddendum: `Regulatory investigation escalates compliance risk and potential for material penalties.`,
      evidenceUpdate: `Regulatory Filings (Updated): ${details.regulator} investigation announced. Focus: ${details.focus}. Penalty risk elevated. T3 (Regulatory Squeeze) strengthened.`,
      scoreAdjustment: -7,
      hypothesisImpact: { t3: 15 }
    }),
    fine: (ticker, price, details) => ({
      headline: `${ticker} receives regulatory penalty`,
      verdictAddendum: `$${details.amount}M penalty confirms regulatory risk materialization.`,
      evidenceUpdate: `Regulatory Filings (Updated): $${details.amount}M penalty imposed by ${details.regulator}. Precedent set for enforcement approach.`,
      scoreAdjustment: -4
    }),
    settlement: (ticker, price, details) => ({
      headline: `${ticker} reaches regulatory settlement`,
      verdictAddendum: `Settlement provides certainty but confirms historical compliance failures.`,
      evidenceUpdate: `Regulatory Filings (Updated): Settlement reached with ${details.regulator} for $${details.amount}M. Overhang removed but compliance costs persist.`,
      scoreAdjustment: 2
    })
  },
  
  ANALYST: {
    upgrade: (ticker, price, details) => ({
      headline: `${ticker} upgraded by ${details.broker}`,
      verdictAddendum: `Analyst upgrade reflects improving sentiment, though price action will depend on execution.`,
      evidenceUpdate: `Broker Research (Updated): ${details.broker} upgraded to ${details.rating}, target $${details.target}. Consensus view shifting.`,
      scoreAdjustment: 2
    }),
    downgrade: (ticker, price, details) => ({
      headline: `${ticker} downgraded by ${details.broker}`,
      verdictAddendum: `Analyst downgrade reflects execution concerns and stretched valuation.`,
      evidenceUpdate: `Broker Research (Updated): ${details.broker} downgraded to ${details.rating}, target $${details.target}. Risk skew concerns spreading to sell-side.`,
      scoreAdjustment: -3
    }),
    targetCut: (ticker, price, details) => ({
      headline: `${ticker} price target reduced`,
      verdictAddendum: `Reduced price target reflects lower earnings expectations and multiple compression risk.`,
      evidenceUpdate: `Broker Research (Updated): ${details.broker} cut target to $${details.target} (was $${details.oldTarget}). Consensus downside risk increasing.`,
      scoreAdjustment: -2
    })
  },
  
  MACRO: {
    rateCut: (ticker, price, details) => ({
      headline: `RBA cuts rates`,
      verdictAddendum: `Rate cut improves consumer sentiment and discretionary spending capacity.`,
      evidenceUpdate: `Economic Data (Updated): RBA cut cash rate by ${details.bp}bp to ${details.newRate}%. Supports consumer discretionary recovery thesis.`,
      scoreAdjustment: 3
    }),
    rateHike: (ticker, price, details) => ({
      headline: `RBA hikes rates`,
      verdictAddendum: `Rate hike pressures consumer discretionary spending and debt servicing costs.`,
      evidenceUpdate: `Economic Data (Updated): RBA hiked cash rate by ${details.bp}bp to ${details.newRate}%. Consumer pressure intensifies.`,
      scoreAdjustment: -3
    }),
    commodity: (ticker, price, details) => ({
      headline: `Commodity price movement`,
      verdictAddendum: `${details.commodity} price ${details.direction} impacts input costs and margins.`,
      evidenceUpdate: `Economic Data (Updated): ${details.commodity} price ${details.direction} by ${details.change}%. Cost structure impact: ${details.impact}.`,
      scoreAdjustment: details.impact === 'negative' ? -2 : 2
    })
  }
};

// Generate narrative update based on event
function generateNarrativeUpdate(event, priceData) {
  const template = NARRATIVE_TEMPLATES[event.type];
  if (!template) return null;
  
  // Determine sub-type based on event details
  let subType = 'default';
  const title = event.title.toLowerCase();
  
  if (event.type === 'EARNINGS') {
    if (title.includes('beat') || title.includes('exceed')) subType = 'beat';
    else if (title.includes('miss') || title.includes('below')) subType = 'miss';
    else if (title.includes('guidance') && title.includes('cut')) subType = 'guidanceCut';
    else if (title.includes('guidance') && title.includes('raise')) subType = 'guidanceRaise';
    else subType = 'beat'; // default
  } else if (event.type === 'MANAGEMENT') {
    if (title.includes('ceo')) subType = 'ceoChange';
    else if (title.includes('cfo')) subType = 'cfoChange';
    else subType = 'directorChange';
  } else if (event.type === 'MA') {
    if (title.includes('acquisition') || title.includes('acquire')) subType = 'acquisition';
    else if (title.includes('divest') || title.includes('sale')) subType = 'divestment';
    else if (title.includes('capital') || title.includes('raising')) subType = 'capitalRaising';
    else subType = 'acquisition';
  } else if (event.type === 'REGULATORY') {
    if (title.includes('investigation') || title.includes('probe')) subType = 'investigation';
    else if (title.includes('fine') || title.includes('penalty')) subType = 'fine';
    else if (title.includes('settlement')) subType = 'settlement';
    else subType = 'investigation';
  } else if (event.type === 'ANALYST') {
    if (title.includes('upgrade')) subType = 'upgrade';
    else if (title.includes('downgrade')) subType = 'downgrade';
    else if (title.includes('target')) subType = 'targetCut';
    else subType = 'downgrade';
  } else if (event.type === 'MACRO') {
    if (title.includes('rate') && title.includes('cut')) subType = 'rateCut';
    else if (title.includes('rate') && title.includes('hike')) subType = 'rateHike';
    else subType = 'commodity';
  }
  
  const generator = template[subType];
  if (!generator) return null;
  
  // Extract metrics from event (in reality, you'd parse the announcement)
  const metrics = {
    eps: 'TBD',
    epsGrowth: 0,
    vsConsensus: 0,
    newCEO: 'TBD',
    oldCEO: 'TBD',
    target: 'TBD',
    value: 'TBD',
    amount: 'TBD',
    broker: 'TBD',
    regulator: 'ACCC',
    ...event.extractedMetrics
  };
  
  return generator(event.ticker, priceData?.price, metrics);
}

// Apply updates to HTML content
function applyNarrativeUpdates(html, updates) {
  let modified = html;
  
  for (const update of updates) {
    // This is a simplified example - real implementation would need
    // proper DOM manipulation or structured data files
    
    // Add to verdict section
    if (update.verdictAddendum) {
      // Find verdict section and append
      const verdictRegex = /(verdict:\s*\{[^}]*text:['"])([^'"]*)/;
      if (verdictRegex.test(modified)) {
        modified = modified.replace(verdictRegex, `$1$2 ${update.verdictAddendum}`);
      }
    }
  }
  
  return modified;
}

// Generate freshness update
function generateFreshnessUpdate(ticker, priceData, events) {
  const now = new Date();
  const lastReview = new Date(); // Would come from existing data
  const daysSince = 0;
  
  // Check for recent events that would trigger urgency
  const recentHighImpact = events.filter(e => 
    e.ticker === ticker && 
    e.severity === 'HIGH' &&
    new Date(e.timestamp) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  );
  
  const urgency = recentHighImpact.length > 0 ? 35 : 
                  events.filter(e => e.ticker === ticker).length > 0 ? 20 : 0;
  
  const status = urgency >= 35 ? 'CRITICAL' : 
                 urgency >= 20 ? 'MODERATE' : 
                 daysSince > 14 ? 'HIGH' : 'OK';
  
  return {
    reviewDate: now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }),
    daysSinceReview: daysSince,
    priceAtReview: priceData?.price || 0,
    pricePctChange: priceData?.changePercent || 0,
    nearestCatalyst: recentHighImpact[0]?.title || null,
    nearestCatalystDate: recentHighImpact[0]?.timestamp || null,
    nearestCatalystDays: recentHighImpact[0] ? 0 : null,
    urgency,
    status,
    badge: status.toLowerCase(),
    eventsDetected: events.filter(e => e.ticker === ticker).length
  };
}

// Main function
async function main() {
  console.log('=== Continuum Narrative Generator ===\n');
  
  // Load data — use find-latest-prices to pick the freshest source
  const dataDir = path.join(__dirname, '..', 'data');
  const eventsPath = path.join(dataDir, 'events-log.json');

  const priceResult = findLatestPrices('newest');
  if (!priceResult) {
    console.error('No price data found. Run event-scraper or fetch-live-prices first.');
    process.exit(1);
  }

  console.log(`Using prices from ${priceResult.source} (${priceResult.file}), updated ${priceResult.updated}`);
  const prices = priceResult.prices;

  const events = fs.existsSync(eventsPath)
    ? JSON.parse(fs.readFileSync(eventsPath, 'utf8'))
    : [];

  console.log(`Loaded ${Object.keys(prices).length} prices, ${events.length} events`);
  
  // Generate updates for each ticker with events
  const tickersWithEvents = [...new Set(events.map(e => e.ticker))];
  const updates = {};
  const freshnessUpdates = {};
  
  for (const ticker of tickersWithEvents) {
    const tickerEvents = events.filter(e => e.ticker === ticker && e.requiresNarrativeUpdate);
    const priceData = prices[ticker];
    
    updates[ticker] = [];
    
    for (const event of tickerEvents) {
      const update = generateNarrativeUpdate(event, priceData);
      if (update) {
        updates[ticker].push(update);
        console.log(`✓ ${ticker}: ${update.headline}`);
      }
    }
    
    // Generate freshness update
    freshnessUpdates[ticker] = generateFreshnessUpdate(ticker, priceData, events);
  }
  
  // Save updates
  fs.writeFileSync(
    path.join(dataDir, 'pending-updates.json'),
    JSON.stringify({ updates, freshnessUpdates, generatedAt: new Date().toISOString() }, null, 2)
  );
  
  console.log(`\nGenerated updates for ${Object.keys(updates).length} tickers`);
  console.log('Updates saved to data/pending-updates.json');
  
  // Summary for GitHub Actions
  const totalUpdates = Object.values(updates).flat().length;
  process.exit(totalUpdates > 0 ? 100 : 0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

module.exports = { generateNarrativeUpdate, generateFreshnessUpdate };
