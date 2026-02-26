/**
 * Apply Narrative Updates to per-ticker research JSON files
 *
 * Updates data/research/{ticker}.json with dynamic commentary from narrative analysis.
 * Rewrites actual narrative text (not just weights) based on market conditions.
 *
 * Reads analysis from data/narrative-analysis.json, updates each ticker's
 * research JSON in data/research/.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Parse arguments
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    const [key, value] = arg.split('=');
    if (key && value) {
      args[key.replace(/^--/, '')] = value;
    }
  });
  return args;
}

const args = parseArgs();
const INPUT_FILE = args.input || path.join(ROOT, 'data', 'narrative-analysis.json');

console.log('='.repeat(64));
console.log('  Apply Dynamic Narrative Updates to research JSON files');
console.log('='.repeat(64) + '\n');

// Load analysis results
let analysis;
try {
  analysis = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
} catch (e) {
  console.error('Error loading analysis file:', e.message);
  process.exit(1);
}

console.log(`Loaded analysis for ${Object.keys(analysis.results).length} tickers\n`);

// Track updates
const weightUpdates = [];
const narrativeUpdates = [];

// Process each ticker with significant dislocation
for (const [ticker, result] of Object.entries(analysis.results)) {
  // Skip if no commentary generated
  if (!result.institutionalCommentary) {
    console.log(`${ticker}: No commentary available, skipping`);
    continue;
  }

  console.log(`Processing ${ticker} (${result.dislocation.severity})...`);

  // Load per-ticker research JSON
  const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
  const stockData = readJson(researchPath);
  if (!stockData) {
    console.log(`  [SKIP] Could not read data/research/${ticker}.json`);
    continue;
  }

  // Generate updated narrative content
  const updatedNarrative = generateUpdatedNarrative(ticker, result);

  // Update narrative fields within the JSON
  let narrativeChanged = false;
  if (stockData.narrative && typeof stockData.narrative === 'object') {
    if (updatedNarrative.theNarrative) {
      stockData.narrative.theNarrative = updatedNarrative.theNarrative;
      narrativeChanged = true;
    }
    if (updatedNarrative.priceImplication) {
      // priceImplication can be a string or object with label/content
      if (typeof stockData.narrative.priceImplication === 'object') {
        stockData.narrative.priceImplication.content = updatedNarrative.priceImplication;
      } else {
        stockData.narrative.priceImplication = updatedNarrative.priceImplication;
      }
      narrativeChanged = true;
    }
    if (updatedNarrative.evidenceCheck) {
      stockData.narrative.evidenceCheck = updatedNarrative.evidenceCheck;
      narrativeChanged = true;
    }
    if (updatedNarrative.narrativeStability) {
      stockData.narrative.narrativeStability = updatedNarrative.narrativeStability;
      narrativeChanged = true;
    }
    if (updatedNarrative.catalysts) {
      stockData.narrative.catalysts = updatedNarrative.catalysts;
      narrativeChanged = true;
    }
    // Store dynamic hypotheses commentary
    if (updatedNarrative.dynamicHypotheses) {
      stockData.narrative._dynamicCommentary = updatedNarrative.dynamicHypotheses;
      narrativeChanged = true;
    }
    // Store metadata
    stockData.narrative._lastNarrativeUpdate = updatedNarrative._meta.lastUpdated;
    stockData.narrative._maxDivergence = Math.max(...Object.values(updatedNarrative._meta.weights).map(w => Math.abs(w.longTerm - w.shortTerm)));
    stockData.narrative._urgency = updatedNarrative._meta.urgency;
  }

  if (narrativeChanged) {
    narrativeUpdates.push(ticker);
    console.log(`  [OK] Updated narrative content for ${ticker}`);
  }

  // Update hypothesis weights in verdict scores and hypotheses array
  let weightsChanged = false;
  if (result.weights && stockData.verdict && stockData.verdict.scores) {
    for (const [tier, weight] of Object.entries(result.weights)) {
      // Find matching score entry (e.g., tier 'N1' matches index 0)
      const tierIdx = parseInt(tier.replace('N', '')) - 1;
      if (tierIdx >= 0 && tierIdx < stockData.verdict.scores.length) {
        const scoreEntry = stockData.verdict.scores[tierIdx];
        if (weight.blended != null) {
          scoreEntry.score = weight.blended + '%';
          scoreEntry.scoreWidth = weight.blended + '%';
          weightsChanged = true;
        }
      }
    }
  }

  // Also update hypotheses array scores if present
  if (result.weights && Array.isArray(stockData.hypotheses)) {
    for (const [tier, weight] of Object.entries(result.weights)) {
      const tierLower = tier.toLowerCase();
      const hyp = stockData.hypotheses.find(h => h.tier === tierLower);
      if (hyp && weight.blended != null) {
        hyp.score = weight.blended + '%';
        hyp.scoreWidth = weight.blended + '%';
        weightsChanged = true;
      }
    }
  }

  if (weightsChanged) {
    weightUpdates.push(ticker);
  }

  // Write updated research JSON
  if (narrativeChanged || weightsChanged) {
    try {
      writeJson(researchPath, stockData);
    } catch (e) {
      console.error(`  [ERROR] Failed to write ${researchPath}: ${e.message}`);
    }
  }
}

// Summary
console.log(`\n[DONE] Updated research JSON files`);
console.log(`  Hypothesis weights updated: ${weightUpdates.length} tickers (${weightUpdates.join(', ')})`);
console.log(`  Narrative content updated: ${narrativeUpdates.length} tickers (${narrativeUpdates.join(', ')})`);

// Helper functions

function generateUpdatedNarrative(ticker, result) {
  const c = result.institutionalCommentary;
  const weights = result.weights;
  const inference = result.inference;

  // Generate dynamic hypothesis descriptions based on market conditions
  const dynamicHypotheses = generateDynamicHypotheses(ticker, weights, inference);

  return {
    theNarrative: generateExecutiveSummary(c, weights, inference, result.dislocation),
    priceImplication: generatePriceImplication(c, weights, result.dislocation),
    evidenceCheck: generateEvidenceCheck(c, weights, inference),
    narrativeStability: generateStabilityAssessment(weights, result.dislocation),
    catalysts: c.catalysts || 'Monitor for significant developments.',
    dynamicHypotheses: dynamicHypotheses,
    _meta: {
      lastUpdated: new Date().toISOString(),
      dislocationSeverity: result.dislocation.severity,
      primaryHypothesis: inference.primaryHypothesis,
      weights: weights,
      urgency: c.summary?.urgency || 'LOW',
      action: c.summary?.keyAction || 'Continue monitoring'
    }
  };
}

function generateDynamicHypotheses(ticker, weights, inference) {
  // Generate revised hypothesis descriptions based on market-implied weights
  const hypotheses = {};

  // N1: Growth/Expansion
  const n1Spread = weights.N1.shortTerm - weights.N1.longTerm;
  if (n1Spread < -20) {
    hypotheses.N1 = `Market is pricing in growth deceleration concerns (${Math.abs(n1Spread)}pts below research). Contract win momentum may be slowing.`;
  } else if (n1Spread > 20) {
    hypotheses.N1 = `Market is more optimistic on expansion (${n1Spread}pts above research). Pipeline strength exceeding expectations.`;
  } else {
    hypotheses.N1 = `Views aligned on US expansion trajectory.`;
  }

  // N2: Valuation
  const n2Spread = weights.N2.shortTerm - weights.N2.longTerm;
  if (n2Spread > 30) {
    hypotheses.N2 = `Market is pricing in severe multiple compression (${n2Spread}pts above research). High-multiple vulnerability evident.`;
  } else if (n2Spread < -20) {
    hypotheses.N2 = `Market sees valuation support (${Math.abs(n2Spread)}pts below research). Multiple may be stabilizing.`;
  } else {
    hypotheses.N2 = `Limited disagreement on valuation metrics.`;
  }

  // N3: Competition
  const n3Spread = weights.N3.shortTerm - weights.N3.longTerm;
  if (n3Spread > 30) {
    hypotheses.N3 = `CRITICAL: Market is pricing in significant competitive threat (${n3Spread}pts above research). Disruption fears dominating price action.`;
  } else if (n3Spread < -20) {
    hypotheses.N3 = `Market sees limited competitive threat (${Math.abs(n3Spread)}pts below research). Moat remains intact.`;
  } else {
    hypotheses.N3 = `Competitive dynamics views aligned.`;
  }

  // N4: AI/Moat
  const n4Spread = weights.N4.shortTerm - weights.N4.longTerm;
  if (weights.N4.shortTerm < 25 && weights.N4.longTerm > 40) {
    hypotheses.N4 = `CONTRADICTED: Market has reversed view on AI as moat amplifier (${weights.N4.longTerm}% -> ${weights.N4.shortTerm}%). AI now seen as competitive threat, not advantage.`;
  } else if (n4Spread > 20) {
    hypotheses.N4 = `Market is more bullish on AI amplification (${n4Spread}pts above research). Platform effects accelerating.`;
  } else if (n4Spread < -20) {
    hypotheses.N4 = `Market questioning AI moat thesis (${Math.abs(n4Spread)}pts below research). Technology commoditization concerns.`;
  } else {
    hypotheses.N4 = `Views aligned on technology trajectory.`;
  }

  return hypotheses;
}

function generateExecutiveSummary(commentary, weights, inference, dislocation) {
  const lines = [];

  // Opening alert
  lines.push(`<div style="background: ${dislocation.severity === 'CRITICAL' ? 'rgba(220,38,38,0.2)' : dislocation.severity === 'HIGH' ? 'rgba(234,179,8,0.2)' : 'rgba(59,130,246,0.2)'}; border-left: 4px solid ${dislocation.severity === 'CRITICAL' ? '#dc2626' : dislocation.severity === 'HIGH' ? '#eab308' : '#3b82f6'}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">`);
  lines.push(`<strong style="color: ${dislocation.severity === 'CRITICAL' ? '#fca5a5' : '#fff'};">`);
  lines.push(`PRICE DISLOCATION -- ${dislocation.severity}</strong><br>`);
  lines.push(`<span style="font-size: 0.85rem; color: #9ca3af;">`);
  lines.push(`Move: ${dislocation.metrics.todayReturn}% | Z-Score: ${dislocation.metrics.zScore} | Vol: ${dislocation.metrics.volumeRatio}x | Pattern: ${dislocation.pattern}</span>`);
  lines.push(`</div>`);

  // Market narrative
  lines.push(`<p><strong>Market-Implied Narrative (${(inference.confidence * 100).toFixed(0)}% confidence):</strong> `);
  lines.push(`The price action is pricing in <strong>${inference.primaryHypothesis}</strong> as the dominant thesis.</p>`);

  // Hypothesis divergences
  const majorDivergences = Object.entries(weights)
    .filter(([, w]) => Math.abs(w.longTerm - w.shortTerm) > 25)
    .sort(([, a], [, b]) => Math.abs(b.longTerm - b.shortTerm) - Math.abs(a.longTerm - a.shortTerm));

  if (majorDivergences.length > 0) {
    lines.push(`<p><strong>Research-Market Divergences:</strong></p>`);
    lines.push(`<ul style="margin: 8px 0; padding-left: 20px;">`);
    majorDivergences.forEach(([tier, w]) => {
      const gap = Math.abs(w.longTerm - w.shortTerm);
      const color = gap > 40 ? '#ef4444' : gap > 25 ? '#f59e0b' : '#9ca3af';
      lines.push(`<li style="color: ${color};"><strong>${tier}:</strong> Research ${w.longTerm}% -> Market ${w.shortTerm}% (${gap}pt ${w.shortTerm > w.longTerm ? 'above' : 'below'})</li>`);
    });
    lines.push(`</ul>`);
  }

  // Contradictions
  if (inference.contradictedHypothesis) {
    const contradictedWeight = weights[inference.contradictedHypothesis];
    lines.push(`<p style="color: #ef4444;"><strong>Thesis Contradiction:</strong> `);
    lines.push(`${inference.contradictedHypothesis} has collapsed from ${contradictedWeight.longTerm}% to ${contradictedWeight.shortTerm}% market-implied weight.</p>`);
  }

  // Action
  const maxGap = Math.max(...Object.values(weights).map(w => Math.abs(w.longTerm - w.shortTerm)));
  lines.push(`<p><strong>Action Required:</strong> `);
  if (dislocation.severity === 'CRITICAL' || maxGap > 50) {
    lines.push(`<span style="color: #ef4444;">Initiate deep-dive review within 48 hours. Thesis validation urgent.</span>`);
  } else if (dislocation.severity === 'HIGH' || maxGap > 30) {
    lines.push(`<span style="color: #f59e0b;">Accelerate review cycle. Update hypothesis evidence within one week.</span>`);
  } else {
    lines.push(`Continue standard monitoring.`);
  }
  lines.push(`</p>`);

  return lines.join('\n');
}

function generatePriceImplication(commentary, weights, dislocation) {
  const t2 = weights.N2;
  const fromPeak = dislocation.metrics.drawdownFromPeak;

  return `Current price embeds ${t2.shortTerm > 50 ? 'significant multiple compression' : t2.shortTerm < t2.longTerm - 20 ? 'multiple expansion recovery' : 'stable valuation assumptions'}. ` +
         `The ${Math.abs(fromPeak).toFixed(1)}% drawdown from peak suggests ${dislocation.metrics.rangePosition < 0.2 ? 'sustained' : 'transient'} ` +
         `${dislocation.pattern === 'DISTRIBUTION' ? 'institutional distribution' : 'price discovery'}. ` +
         `Research view (${t2.longTerm}%) vs Market-implied (${t2.shortTerm}%) on valuation represents a ${Math.abs(t2.shortTerm - t2.longTerm)}pt spread.`;
}

function generateEvidenceCheck(commentary, weights, inference) {
  const lines = [];

  Object.entries(weights).forEach(([tier, w]) => {
    const gap = Math.abs(w.longTerm - w.shortTerm);
    if (gap > 40) {
      lines.push(`<span style="color: #ef4444;">${tier}: Major disconnect (${gap}pts). ${w.shortTerm > w.longTerm ? 'Market significantly more bearish' : 'Market significantly more bullish'} than research.</span>`);
    } else if (gap > 25) {
      lines.push(`<span style="color: #f59e0b;">${tier}: Moderate divergence (${gap}pts). Views diverging.</span>`);
    } else {
      lines.push(`<span style="color: #22c55e;">${tier}: Aligned (gap ${gap}pts).</span>`);
    }
  });

  return lines.join('<br>');
}

function generateStabilityAssessment(weights, dislocation) {
  const maxGap = Math.max(...Object.values(weights).map(w => Math.abs(w.longTerm - w.shortTerm)));

  if (dislocation.severity === 'CRITICAL' || maxGap > 50) {
    return `<span style="color: #ef4444; font-weight: bold;">UNSTABLE -- NARRATIVE REGIME CHANGE RISK:</span> ` +
           `Material divergence (${maxGap}pts) combined with ${dislocation.severity.toLowerCase()} price dislocation suggests potential thesis regime change. ` +
           `Immediate review required.`;
  } else if (dislocation.severity === 'HIGH' || maxGap > 30) {
    return `<span style="color: #f59e0b; font-weight: bold;">TENSION ELEVATED:</span> ` +
           `Significant spread (${maxGap}pts) between research and market views indicates narrative tension. ` +
           `Monitoring required for resolution direction.`;
  } else {
    return `<span style="color: #22c55e;">STABLE:</span> Research and market views aligned.`;
  }
}
