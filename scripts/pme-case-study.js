/**
 * PME Case Study — Price-Narrative Engine Demonstration
 * 
 * Shows how the framework responds to PME's dramatic price decline
 * and correctly adjusts hypothesis weights based on market-implied narrative.
 */

// Run this in browser console or Node.js

const PME_CASE_STUDY = {
  // Stock data as it exists in the framework
  stockData: {
    ticker: 'PME',
    company: 'Pro Medicus',
    characteristics: {
      highMultiple: true,      // 163x P/E
      growthStock: true,       // 30%+ revenue growth
      hasAIExposure: true,     // AI imaging platform
      sector: 'Healthcare IT',
      marketCap: '13.2B'
    },
    hypotheses: [
      {
        tier: 't1',
        title: 'T1: US Expansion Accelerates',
        score: '60%',
        description: 'Pro Medicus continues winning major US health system contracts...'
      },
      {
        tier: 't2',
        title: 'T2: Valuation Mean-Reversion',
        score: '35%',
        description: 'The 163x P/E contracts to a more conventional 50-80x...'
      },
      {
        tier: 't3',
        title: 'T3: Competitive Disruption',
        score: '20%',
        description: 'A competitor develops a platform that matches Visage 7...'
      },
      {
        tier: 't4',
        title: 'T4: AI Amplifies the Moat',
        score: '50%',
        description: 'Pro Medicus becomes the platform on which AI radiology tools run...'
      }
    ],
    narrative: {
      theNarrative: 'The market narrative is dominated by a single tension: extraordinary business quality vs extreme valuation...',
      priceImplication: 'Embedded Assumptions at A$118.22...'
    }
  },

  // Price data as of Feb 13, 2026
  priceData: {
    currentPrice: 118.22,
    previousPrice: 129.00,      // Previous close
    priceAtReview: 162.64,      // From Feb 10 review
    peakPrice: 336.00,          // 52-week high
    low52Week: 118.22,          // Now at new low
    high52Week: 336.00,
    todayVolume: 1455798,
    avgVolume20d: 691333,       // Approximate
    historicalReturns: [        // Last 20 daily returns (approximate)
      -0.012, -0.008, 0.005, -0.003, 0.015, -0.037, -0.001, -0.009, 0.001, -0.036,
      -0.037, -0.037, 0.032, -0.008, 0.012, -0.051, -0.068, -0.073, 0.064, 0.001,
      -0.084, 0.002, 0.007, 0.011, 0.003, -0.007, -0.027, 0.028, 0.000, -0.009
    ],
    consecutiveDownDays: 3
  },

  // News context
  newsContext: [
    { title: 'Tech sell-off accelerates on AI fears', summary: 'High multiple stocks under pressure as DeepSeek concerns mount' },
    { title: 'Healthcare IT sector under pressure', summary: 'Valuation compression across sector' }
  ]
};

// Run the analysis
function runPMECaseStudy() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PME CASE STUDY — Price-Narrative Engine Demonstration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Import the engine (in browser, it's already loaded)
  const engine = typeof PriceNarrativeEngine !== 'undefined' 
    ? PriceNarrativeEngine 
    : require('./price-narrative-engine.js').PriceNarrativeEngine;

  const { stockData, priceData, newsContext } = PME_CASE_STUDY;

  console.log('INPUT DATA:');
  console.log('───────────');
  console.log(`Ticker: ${stockData.ticker} — ${stockData.company}`);
  console.log(`Current Price: A$${priceData.currentPrice}`);
  console.log(`Price at Review: A$${priceData.priceAtReview} (${((priceData.currentPrice - priceData.priceAtReview) / priceData.priceAtReview * 100).toFixed(1)}%)`);
  console.log(`Peak Price: A$${priceData.peakPrice} (${((priceData.currentPrice - priceData.peakPrice) / priceData.peakPrice * 100).toFixed(1)}%)`);
  console.log(`Daily Move: ${((priceData.currentPrice - priceData.previousPrice) / priceData.previousPrice * 100).toFixed(2)}%`);
  console.log(`Volume Ratio: ${(priceData.todayVolume / priceData.avgVolume20d).toFixed(1)}x average\n`);

  console.log('ORIGINAL HYPOTHESIS WEIGHTS:');
  console.log('────────────────────────────');
  stockData.hypotheses.forEach(h => {
    console.log(`${h.title}: ${h.score}`);
  });
  console.log('');

  // Run analysis
  console.log('RUNNING ANALYSIS...\n');
  const analysis = engine.analyze('PME', stockData, priceData, newsContext);

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('1. PRICE DISLOCATION DETECTION');
  console.log('───────────────────────────────');
  console.log(`Severity: ${analysis.dislocation.severity}`);
  console.log(`Z-Score: ${analysis.dislocation.metrics.zScore}`);
  console.log(`Pattern: ${analysis.dislocation.metrics.consecutiveDownDays} consecutive down days → ${analysis.dislocation.pattern}`);
  console.log(`Range Position: ${(analysis.dislocation.metrics.rangePosition * 100).toFixed(1)}% (0% = 52wk low)\n`);

  console.log('2. NARRATIVE INFERENCE');
  console.log('──────────────────────');
  console.log(`Primary Hypothesis: ${analysis.inference.primaryHypothesis}`);
  console.log(`Secondary Hypothesis: ${analysis.inference.secondaryHypothesis || 'None'}`);
  console.log(`Contradicted Hypothesis: ${analysis.inference.contradictedHypothesis || 'None'}`);
  console.log(`Confidence: ${(analysis.inference.confidence * 100).toFixed(0)}%`);
  console.log(`Reasoning: ${analysis.inference.reasoning}\n`);

  console.log('3. DYNAMIC HYPOTHESIS WEIGHTS');
  console.log('──────────────────────────────');
  console.log('Tier │ Research │ Market │ Blended │ Change │ Confidence');
  console.log('─────┼──────────┼────────┼─────────┼────────┼───────────');
  
  const tierNames = {
    'T1': 'US Expansion    ',
    'T2': 'Valuation Mean  ',
    'T3': 'Competitive     ',
    'T4': 'AI Moat         '
  };

  Object.entries(analysis.weights).forEach(([tier, w]) => {
    const name = tierNames[tier] || tier;
    const change = (w.adjustment > 0 ? `+${w.adjustment}` : String(w.adjustment));
    console.log(`${tier}   │ ${w.longTerm.toString().padStart(4)}%    │ ${w.shortTerm.toString().padStart(4)}%  │ ${w.blended.toString().padStart(4)}%    │ ${change.padStart(4)}   │ ${w.confidence}`);
  });
  console.log('');

  console.log('4. KEY DIVERGENCES');
  console.log('──────────────────');
  Object.entries(analysis.weights).forEach(([tier, w]) => {
    const gap = Math.abs(w.longTerm - w.shortTerm);
    if (gap > 20) {
      const direction = w.shortTerm > w.longTerm ? 'market sees MORE likely' : 'market sees LESS likely';
      console.log(`• ${tier}: ${gap} point gap — ${direction}`);
    }
  });
  console.log('');

  console.log('5. MARKET-RESPONSIVE COMMENTARY');
  console.log('────────────────────────────────');
  console.log(analysis.commentary.summary);
  console.log('');

  console.log('6. URGENCY & ACTIONS');
  console.log('────────────────────');
  console.log(`Urgency: ${analysis.commentary.urgency}`);
  console.log(`Should Update Website: ${analysis.shouldUpdate ? 'YES' : 'NO'}`);

  return analysis;
}

// Demonstration of what the old vs new commentary looks like
function compareCommentary() {
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('  COMMENTARY COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('BEFORE (Static Framework):');
  console.log('──────────────────────────');
  console.log(`"The market narrative is dominated by a single tension: extraordinary 
business quality vs extreme valuation. At 163x trailing P/E, the stock 
prices in years of flawless execution. Morningstar's fair value estimate 
of A$36 (implying 78% downside) represents the "valuation sceptic" camp. 
The stock has already corrected 51% from its A$336 peak."`);
  console.log('\n❌ PROBLEM: Doesn\'t explain WHY it dropped 8% today\n');

  console.log('AFTER (Price-Narrative Engine):');
  console.log('────────────────────────────────');
  console.log(`🔴 PRICE DISLOCATION ALERT — HIGH
Price: -8.36% | Z-Score: 2.8 | Volume: 2.1x avg | Pattern: STEADY_DECLINE

Market-Implied Narrative (75% confidence):
The market is pricing in Competitive Disruption as the dominant thesis. 
Secondary concern: Valuation Mean-Reversion. AI Amplifies Moat is being 
contradicted by price action.

Research vs. Market Divergence:
• T2: Research 35% → Market 55% (20pt gap)
• T3: Research 20% → Market 60% (40pt gap) ⚠️ MAJOR
• T4: Research 50% → Market 15% (35pt gap) ⚠️ MAJOR

Implication: Either (a) the market is overreacting to near-term noise 
and creating entry opportunity, or (b) the research thesis is missing 
a factor the market has identified. Given the high magnitude of price 
dislocation, this warrants immediate review.

Recommended Action: [🔍 Deep Dive Review] [📊 Competitive Analysis]`);
  console.log('\n✅ IMPROVED: Explains market narrative, shows divergences, recommends action');
}

// Run if executed directly
if (typeof window !== 'undefined') {
  // Browser
  console.log('PME Case Study loaded. Run PME_CASE_STUDY.run() to execute.');
  PME_CASE_STUDY.run = runPMECaseStudy;
  PME_CASE_STUDY.compare = compareCommentary;
} else if (typeof module !== 'undefined') {
  // Node.js
  module.exports = { PME_CASE_STUDY, runPMECaseStudy, compareCommentary };
  
  // Auto-run if called directly
  if (require.main === module) {
    runPMECaseStudy();
    compareCommentary();
  }
}
