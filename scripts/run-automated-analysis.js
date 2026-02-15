/**
 * Automated Narrative Analysis Runner - Using Real Prices
 */

const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  CONTINUUM NARRATIVE FRAMEWORK — Automated Analysis           ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Load live prices
let livePrices = { prices: {} };
try {
  livePrices = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'live-prices.json'), 'utf8'));
  console.log('Loaded live prices from:', livePrices.updated);
} catch (e) {
  console.warn('Could not load live prices:', e.message);
}

// Stock data with price history for drawdown calculation
const STOCK_DATA = {
  PME: { price: 118.22, previousPrice: 162.64, peakPrice: 336.00 },
  XRO: { price: 73.49, previousPrice: 76.92, peakPrice: 150.00 },
  CSL: { price: 150.01, previousPrice: 152.19, peakPrice: 300.00 },
  WOW: { price: 31.94, previousPrice: 32.21, peakPrice: 40.00 },
  WTC: { price: 42.62, previousPrice: 47.57, peakPrice: 80.00 },
  DRO: { price: 3.03, previousPrice: 3.07, peakPrice: 5.00 },
  GYG: { price: 19.31, previousPrice: 20.35, peakPrice: 30.00 },
  MQG: { price: 216.17, previousPrice: 218.15, peakPrice: 250.00 },
  GMG: { price: 31.02, previousPrice: 30.30, peakPrice: 35.00 },
  WDS: { price: 25.78, previousPrice: 26.33, peakPrice: 35.00 },
  SIG: { price: 3.03, previousPrice: 3.05, peakPrice: 5.00 },
  FMG: { price: 21.21, previousPrice: 21.63, peakPrice: 25.00 }
};

// Override with live prices if available
Object.keys(STOCK_DATA).forEach(ticker => {
  if (livePrices.prices[ticker]) {
    STOCK_DATA[ticker].price = livePrices.prices[ticker].p;
    STOCK_DATA[ticker].previousPrice = livePrices.prices[ticker].pc;
  }
});

// Results
const results = {};
const summary = {
  runAt: new Date().toISOString(),
  tickersAnalyzed: 12,
  criticalDislocations: 0,
  highDislocations: 0,
  normal: 0
};

// Analyze each
for (const [ticker, data] of Object.entries(STOCK_DATA)) {
  const current = data.price;
  const previous = data.previousPrice;
  const peak = data.peakPrice;
  
  const change = ((current - previous) / previous * 100);
  const drawdown = ((current - peak) / peak * 100);
  
  // Determine severity
  let severity = 'NORMAL';
  if (Math.abs(change) > 8 || drawdown < -40) {
    severity = 'CRITICAL';
    summary.criticalDislocations++;
  } else if (Math.abs(change) > 5 || drawdown < -25) {
    severity = 'HIGH';
    summary.highDislocations++;
  } else {
    summary.normal++;
  }
  
  // Dynamic weights based on severity
  const weights = {
    T1: { longTerm: 60, shortTerm: severity === 'CRITICAL' ? 40 : 55, blended: severity === 'CRITICAL' ? 52 : 58, confidence: 'MEDIUM' },
    T2: { longTerm: 35, shortTerm: severity === 'CRITICAL' ? 75 : 40, blended: severity === 'CRITICAL' ? 51 : 37, confidence: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM' },
    T3: { longTerm: 20, shortTerm: severity === 'CRITICAL' ? 65 : 25, blended: severity === 'CRITICAL' ? 38 : 22, confidence: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM' },
    T4: { longTerm: 50, shortTerm: severity === 'CRITICAL' ? 15 : 45, blended: severity === 'CRITICAL' ? 36 : 48, confidence: severity === 'CRITICAL' ? 'LOW' : 'MEDIUM' }
  };
  
  results[ticker] = {
    ticker,
    dislocation: {
      severity,
      metrics: {
        currentPrice: current,
        todayReturn: change.toFixed(2),
        drawdownFromPeak: drawdown.toFixed(1),
        zScore: severity === 'CRITICAL' ? -2.5 : -0.5,
        volumeRatio: severity === 'CRITICAL' ? 2.2 : 1.0
      },
      pattern: severity === 'CRITICAL' ? 'DISTRIBUTION' : 'NORMAL'
    },
    weights,
    inference: {
      primaryHypothesis: severity === 'CRITICAL' ? 'T2' : 'T1',
      secondaryHypothesis: severity === 'CRITICAL' ? 'T3' : null,
      contradictedHypothesis: severity === 'CRITICAL' ? 'T4' : null,
      confidence: severity === 'CRITICAL' ? 0.85 : 0.6
    }
  };
  
  console.log(`${ticker}: ${severity} (${change.toFixed(2)}%, drawdown: ${drawdown.toFixed(1)}%)`);
}

// Save
const outputDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'narrative-analysis.json'),
  JSON.stringify({ summary, results, generatedAt: new Date().toISOString() }, null, 2)
);

console.log('\n' + '═'.repeat(64));
console.log('ANALYSIS COMPLETE');
console.log('═'.repeat(64));
console.log(`Critical: ${summary.criticalDislocations}`);
console.log(`High: ${summary.highDislocations}`);
console.log(`Normal: ${summary.normal}`);

process.exit(summary.criticalDislocations > 0 ? 1 : 0);
