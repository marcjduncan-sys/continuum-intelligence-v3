/**
 * Test script for institutional commentary engine
 */

const { InstitutionalCommentaryEngine, TextGenerator } = require('./institutional-commentary-engine.js');

console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  CONTINUUM INTELLIGENCE — INSTITUTIONAL RESEARCH COMMENTARY              ║');
console.log('║  Quality Tier: Top 0.1%  |  Engine: v2.0  |  Output: 100% Dynamic        ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

// PME data
const stockData = {
  ticker: 'PME',
  company: 'Pro Medicus Limited',
  sector: 'Healthcare IT',
  marketCap: '13.2B',
  price: 118.22,
  characteristics: {
    highMultiple: true,
    growthStock: true,
    hasAIExposure: true
  }
};

const priceData = {
  currentPrice: 118.22,
  previousPrice: 129.00,
  priceAtReview: 162.64,
  peakPrice: 336.00,
  low52Week: 118.22,
  high52Week: 336.00,
  todayVolume: 1455798,
  avgVolume20d: 691333
};

const weights = {
  T1: { longTerm: 60, shortTerm: 45, blended: 54, confidence: 'MEDIUM' },
  T2: { longTerm: 35, shortTerm: 75, blended: 51, confidence: 'HIGH' },
  T3: { longTerm: 20, shortTerm: 65, blended: 38, confidence: 'HIGH' },
  T4: { longTerm: 50, shortTerm: 20, blended: 38, confidence: 'LOW' }
};

const dislocation = {
  severity: 'CRITICAL',
  pattern: 'DISTRIBUTION',
  metrics: {
    zScore: -2.33,
    todayReturn: -8.36,
    drawdownFromPeak: -64.8,
    drawdownFromReview: -27.3,
    volumeRatio: 2.11,
    rangePosition: 0.0
  }
};

const inference = {
  primaryHypothesis: 'T2',
  secondaryHypothesis: 'T3',
  contradictedHypothesis: 'T4',
  confidence: 0.80,
  reasoning: 'Severe drawdown with high volume indicates valuation and competitive concerns'
};

// Generate report
const report = InstitutionalCommentaryEngine.generateReport(
  'PME', stockData, priceData, weights, dislocation, inference
);

console.log(report.fullReport);

console.log('\n');
console.log('╔══════════════════════════════════════════════════════════════════════════╗');
console.log('║  SUMMARY METRICS                                                         ║');
console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');
console.log(`Severity:           ${report.summary.severity}`);
console.log(`Primary Narrative:  ${report.summary.primaryNarrative}`);
console.log(`Max Divergence:     ${report.summary.maxDivergence} points`);
console.log(`Urgency:            ${report.summary.urgency}`);
console.log(`Key Action:         ${report.summary.keyAction}`);
console.log(`\nEngine Version:     ${report.engineVersion}`);
console.log(`Quality Tier:       Top ${report.qualityTier}`);
