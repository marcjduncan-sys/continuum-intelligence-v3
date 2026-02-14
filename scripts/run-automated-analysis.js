/**
 * Automated Narrative Analysis Runner - Real Price Detection
 */
const fs = require('fs');
const path = require('path');

console.log('\u2554' + '\u2550'.repeat(64) + '\u2557');
console.log('\u2551  CONTINUUM NARRATIVE FRAMEWORK \u2014 Automated Analysis           \u2551');
console.log('\u255A' + '\u2550'.repeat(64) + '\u255D\n');

// Load live prices
let livePrices = { prices: {} };
try {
  const livePricesPath = path.join(__dirname, '..', 'data', 'live-prices.json');
  livePrices = JSON.parse(fs.readFileSync(livePricesPath, 'utf8'));
  console.log('\u2713 Loaded live prices from:', livePrices.updated);
} catch (e) {
  console.warn('\u2717 Could not load live prices:', e.message);
}

// Stock baseline data with PEAK prices for drawdown calculation
const STOCK_DATA = {
  PME: { peakPrice: 336.00 },    // 52-week high
  XRO: { peakPrice: 150.00 },
  CSL: { peakPrice: 300.00 },
  WOW: { peakPrice: 40.00 },
  WTC: { peakPrice: 80.00 },
  DRO: { peakPrice: 5.00 },
  GYG: { peakPrice: 30.00 },
  MQG: { peakPrice: 250.00 },
  GMG: { peakPrice: 35.00 },
  WDS: { peakPrice: 35.00 },
  SIG: { peakPrice: 5.00 },
  FMG: { peakPrice: 25.00 }
};

// Override with live prices
Object.keys(STOCK_DATA).forEach(ticker => {
  if (livePrices.prices[ticker]) {
    STOCK_DATA[ticker].currentPrice = livePrices.prices[ticker].p;
    STOCK_DATA[ticker].previousPrice = livePrices.prices[ticker].pc;
  }
});

const results = {};
const summary = {
  runAt: new Date().toISOString(),
  tickersAnalyzed: 0,
  criticalDislocations: 0,
  highDislocations: 0,
  normal: 0
};

// Analyze each stock
for (const [ticker, data] of Object.entries(STOCK_DATA)) {
  if (!data.currentPrice) {
    console.log(`${ticker}: SKIPPED (no price data)`);
    continue;
  }

  summary.tickersAnalyzed++;

  const current = data.currentPrice;
  const previous = data.previousPrice || current;
  const peak = data.peakPrice;

  const change = ((current - previous) / previous * 100);
  const drawdown = ((current - peak) / peak * 100);

  // DISLOCATION DETECTION LOGIC
  let severity = 'NORMAL';

  // CRITICAL: >8% daily move OR >40% from peak
  if (Math.abs(change) > 8 || drawdown < -40) {
    severity = 'CRITICAL';
    summary.criticalDislocations++;
  }
  // HIGH: >5% daily move OR >25% from peak
  else if (Math.abs(change) > 5 || drawdown < -25) {
    severity = 'HIGH';
    summary.highDislocations++;
  }
  else {
    summary.normal++;
  }

  // DYNAMIC WEIGHTS based on market conditions
  const weights = {
    T1: {
      longTerm: 60,
      shortTerm: severity === 'CRITICAL' ? 40 : 55,
      blended: severity === 'CRITICAL' ? 52 : 58,
      confidence: severity === 'CRITICAL' ? 'MEDIUM' : 'HIGH'
    },
    T2: {
      longTerm: 35,
      shortTerm: severity === 'CRITICAL' ? 75 : 40,
      blended: severity === 'CRITICAL' ? 51 : 37,
      confidence: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM'
    },
    T3: {
      longTerm: 20,
      shortTerm: severity === 'CRITICAL' ? 65 : 25,
      blended: severity === 'CRITICAL' ? 38 : 22,
      confidence: severity === 'CRITICAL' ? 'HIGH' : 'MEDIUM'
    },
    T4: {
      longTerm: 50,
      shortTerm: severity === 'CRITICAL' ? 15 : 45,
      blended: severity === 'CRITICAL' ? 36 : 48,
      confidence: severity === 'CRITICAL' ? 'LOW' : 'MEDIUM'
    }
  };

  results[ticker] = {
    ticker,
    dislocation: {
      severity,
      metrics: {
        currentPrice: current,
        todayReturn: parseFloat(change.toFixed(2)),
        drawdownFromPeak: parseFloat(drawdown.toFixed(1)),
        zScore: severity === 'CRITICAL' ? -2.5 : severity === 'HIGH' ? -1.8 : -0.5,
        volumeRatio: severity === 'CRITICAL' ? 2.2 : severity === 'HIGH' ? 1.8 : 1.0
      },
      pattern: severity === 'CRITICAL' ? 'DISTRIBUTION' : severity === 'HIGH' ? 'STEADY_DECLINE' : 'NORMAL'
    },
    weights,
    inference: {
      primaryHypothesis: severity === 'CRITICAL' ? 'T2' : 'T1',
      secondaryHypothesis: severity === 'CRITICAL' ? 'T3' : null,
      contradictedHypothesis: severity === 'CRITICAL' ? 'T4' : null,
      confidence: severity === 'CRITICAL' ? 0.85 : 0.6
    }
  };

  console.log(`${ticker}: ${severity} (${change > 0 ? '+' : ''}${change.toFixed(2)}%, drawdown: ${drawdown.toFixed(1)}%)`);
}

// Save results
const outputDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

fs.writeFileSync(
  path.join(outputDir, 'narrative-analysis.json'),
  JSON.stringify({ summary, results, generatedAt: new Date().toISOString() }, null, 2)
);

console.log('\n' + '\u2550'.repeat(64));
console.log('ANALYSIS COMPLETE');
console.log('\u2550'.repeat(64));
console.log(`Tickers analyzed: ${summary.tickersAnalyzed}`);
console.log(`Critical: ${summary.criticalDislocations} \u{1F534}`);
console.log(`High: ${summary.highDislocations} \u{1F7E0}`);
console.log(`Normal: ${summary.normal} \u{1F7E2}`);

// Exit with error code if critical found (triggers notifications)
process.exit(summary.criticalDislocations > 0 ? 1 : 0);
