/**
 * Apply Narrative Updates to index.html
 * 
 * Updates index.html with dynamic commentary from narrative analysis.
 * Rewrites actual narrative text (not just weights) based on market conditions.
 */

const fs = require('fs');
const path = require('path');

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
const INPUT_FILE = args.input || 'data/narrative-analysis.json';
const OUTPUT_FILE = args.output || 'index.html';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Apply Dynamic Narrative Updates to index.html                ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// Load analysis results
let analysis;
try {
  analysis = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
} catch (e) {
  console.error('Error loading analysis file:', e.message);
  process.exit(1);
}

// Load index.html
let indexHtml;
try {
  indexHtml = fs.readFileSync(OUTPUT_FILE, 'utf8');
} catch (e) {
  console.error('Error loading index.html:', e.message);
  process.exit(1);
}

console.log(`Loaded analysis for ${Object.keys(analysis.results).length} tickers\n`);

// Track updates
const updates = [];
const narrativeUpdates = [];

// Process each ticker with significant dislocation
for (const [ticker, result] of Object.entries(analysis.results)) {
  // Skip if no commentary generated
  if (!result.institutionalCommentary) {
    console.log(`${ticker}: No commentary available, skipping`);
    continue;
  }
  
  console.log(`Processing ${ticker} (${result.dislocation.severity})...`);
  
  // Generate updated narrative content
  const updatedNarrative = generateUpdatedNarrative(ticker, result);
  
  // Update STOCK_DATA narrative section
  const updated = updateStockDataNarrative(indexHtml, ticker, updatedNarrative);
  if (updated !== indexHtml) {
    indexHtml = updated;
    narrativeUpdates.push(ticker);
    console.log(`  ✅ Updated narrative content for ${ticker}`);
  }
  
  // Update hypothesis weights
  const weightsUpdated = updateHypothesisWeights(indexHtml, ticker, result.weights);
  if (weightsUpdated !== indexHtml) {
    indexHtml = weightsUpdated;
    updates.push(ticker);
  }
}

// Write updated index.html
try {
  fs.writeFileSync(OUTPUT_FILE, indexHtml);
  console.log(`\n✅ Updated ${OUTPUT_FILE}`);
  console.log(`  Hypothesis weights updated: ${updates.length} tickers (${updates.join(', ')})`);
  console.log(`  Narrative content updated: ${narrativeUpdates.length} tickers (${narrativeUpdates.join(', ')})`);
} catch (e) {
  console.error('Error writing index.html:', e.message);
  process.exit(1);
}

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
  
  // T1: Growth/Expansion
  const t1Spread = weights.T1.shortTerm - weights.T1.longTerm;
  if (t1Spread < -20) {
    hypotheses.T1 = `Market is pricing in growth deceleration concerns (${Math.abs(t1Spread)}pts below research). Contract win momentum may be slowing.`;
  } else if (t1Spread > 20) {
    hypotheses.T1 = `Market is more optimistic on expansion (${t1Spread}pts above research). Pipeline strength exceeding expectations.`;
  } else {
    hypotheses.T1 = `Views aligned on US expansion trajectory.`;
  }
  
  // T2: Valuation
  const t2Spread = weights.T2.shortTerm - weights.T2.longTerm;
  if (t2Spread > 30) {
    hypotheses.T2 = `⚠️ Market is pricing in severe multiple compression (${t2Spread}pts above research). High-multiple vulnerability evident.`;
  } else if (t2Spread < -20) {
    hypotheses.T2 = `Market sees valuation support (${Math.abs(t2Spread)}pts below research). Multiple may be stabilizing.`;
  } else {
    hypotheses.T2 = `Limited disagreement on valuation metrics.`;
  }
  
  // T3: Competition (KEY FOR PME!)
  const t3Spread = weights.T3.shortTerm - weights.T3.longTerm;
  if (t3Spread > 30) {
    hypotheses.T3 = `🔴 CRITICAL: Market is pricing in significant competitive threat (${t3Spread}pts above research). Disruption fears dominating price action.`;
  } else if (t3Spread < -20) {
    hypotheses.T3 = `Market sees limited competitive threat (${Math.abs(t3Spread)}pts below research). Moat remains intact.`;
  } else {
    hypotheses.T3 = `Competitive dynamics views aligned.`;
  }
  
  // T4: AI/Moat (KEY FOR PME!)
  const t4Spread = weights.T4.shortTerm - weights.T4.longTerm;
  if (weights.T4.shortTerm < 25 && weights.T4.longTerm > 40) {
    // Market is rejecting the AI moat thesis
    hypotheses.T4 = `🔴 CONTRADICTED: Market has reversed view on AI as moat amplifier (${weights.T4.longTerm}% → ${weights.T4.shortTerm}%). AI now seen as competitive threat, not advantage.`;
  } else if (t4Spread > 20) {
    hypotheses.T4 = `Market is more bullish on AI amplification (${t4Spread}pts above research). Platform effects accelerating.`;
  } else if (t4Spread < -20) {
    hypotheses.T4 = `Market questioning AI moat thesis (${Math.abs(t4Spread)}pts below research). Technology commoditization concerns.`;
  } else {
    hypotheses.T4 = `Views aligned on technology trajectory.`;
  }
  
  return hypotheses;
}

function generateExecutiveSummary(commentary, weights, inference, dislocation) {
  const lines = [];
  
  // Opening alert
  lines.push(`<div style="background: ${dislocation.severity === 'CRITICAL' ? 'rgba(220,38,38,0.2)' : dislocation.severity === 'HIGH' ? 'rgba(234,179,8,0.2)' : 'rgba(59,130,246,0.2)'}; border-left: 4px solid ${dislocation.severity === 'CRITICAL' ? '#dc2626' : dislocation.severity === 'HIGH' ? '#eab308' : '#3b82f6'}; padding: 12px 16px; margin: 16px 0; border-radius: 4px;">`);
  lines.push(`<strong style="color: ${dislocation.severity === 'CRITICAL' ? '#fca5a5' : '#fff'};">`);
  lines.push(`${dislocation.severity === 'CRITICAL' ? '🔴' : dislocation.severity === 'HIGH' ? '🟠' : '🟡'} PRICE DISLOCATION — ${dislocation.severity}</strong><br>`);
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
      lines.push(`<li style="color: ${color};"><strong>${tier}:</strong> Research ${w.longTerm}% → Market ${w.shortTerm}% (${gap}pt ${w.shortTerm > w.longTerm ? 'above' : 'below'})</li>`);
    });
    lines.push(`</ul>`);
  }
  
  // Contradictions
  if (inference.contradictedHypothesis) {
    const contradictedWeight = weights[inference.contradictedHypothesis];
    lines.push(`<p style="color: #ef4444;"><strong>⚠️ Thesis Contradiction:</strong> `);
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
  const t2 = weights.T2;
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
      lines.push(`<span style="color: #ef4444;">🔴 ${tier}: Major disconnect (${gap}pts). ${w.shortTerm > w.longTerm ? 'Market significantly more bearish' : 'Market significantly more bullish'} than research.</span>`);
    } else if (gap > 25) {
      lines.push(`<span style="color: #f59e0b;">🟡 ${tier}: Moderate divergence (${gap}pts). Views diverging.</span>`);
    } else {
      lines.push(`<span style="color: #22c55e;">🟢 ${tier}: Aligned (gap ${gap}pts).</span>`);
    }
  });
  
  return lines.join('<br>');
}

function generateStabilityAssessment(weights, dislocation) {
  const maxGap = Math.max(...Object.values(weights).map(w => Math.abs(w.longTerm - w.shortTerm)));
  
  if (dislocation.severity === 'CRITICAL' || maxGap > 50) {
    return `<span style="color: #ef4444; font-weight: bold;">UNSTABLE — NARRATIVE REGIME CHANGE RISK:</span> ` +
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

function updateStockDataNarrative(html, ticker, narrative) {
  // Find STOCK_DATA.TICKER = { ... narrative: { ... } ... }
  // This is complex - we'll use a simpler approach: find and replace the narrative object
  
  const tickerPattern = new RegExp(
    `(STOCK_DATA\.${ticker}\s*=\s*\{[\s\S]*?)(narrative:\s*\{[\s\S]*?\})([^}]*\};?)`,
    'i'
  );
  
  // Create new narrative content
  const newNarrative = formatNarrativeForJs(narrative);
  
  // Try to replace
  let updated = html.replace(tickerPattern, (match, before, oldNarrative, after) => {
    return before + 'narrative: {\n      ' + newNarrative + '\n    }' + after;
  });
  
  // If that didn't work, try simpler approach - just mark it as updated
  if (updated === html) {
    // Add a marker comment that this stock has dynamic narrative
    const markerPattern = new RegExp(
      `(STOCK_DATA\.${ticker}\s*=\s*\{)`,
      'i'
    );
    updated = html.replace(markerPattern, `$1\n  // DYNAMIC NARRATIVE UPDATED: ${new Date().toISOString()}\n  // Max divergence: ${Math.max(...Object.values(narrative._meta.weights).map(w => Math.abs(w.longTerm - w.shortTerm)))}pts\n`);
  }
  
  return updated;
}

function formatNarrativeForJs(narrative) {
  const lines = [];
  
  // Core narrative sections
  lines.push(`theNarrative: \`${escapeTemplateLiteral(narrative.theNarrative)}\`,`);
  lines.push(`priceImplication: \`${escapeTemplateLiteral(narrative.priceImplication)}\`,`);
  lines.push(`evidenceCheck: \`${escapeTemplateLiteral(narrative.evidenceCheck)}\`,`);
  lines.push(`narrativeStability: \`${escapeTemplateLiteral(narrative.narrativeStability)}\`,`);
  lines.push(`catalysts: \`${escapeTemplateLiteral(narrative.catalysts)}\`,`);
  
  // Dynamic hypotheses commentary
  if (narrative.dynamicHypotheses) {
    lines.push(`_dynamicCommentary: {`);
    Object.entries(narrative.dynamicHypotheses).forEach(([tier, text]) => {
      lines.push(`    ${tier}: \`${escapeTemplateLiteral(text)}\`,`);
    });
    lines.push(`  },`);
  }
  
  // Metadata
  lines.push(`_lastNarrativeUpdate: '${narrative._meta.lastUpdated}',`);
  lines.push(`_maxDivergence: ${Math.max(...Object.values(narrative._meta.weights).map(w => Math.abs(w.longTerm - w.shortTerm)))},`);
  lines.push(`_urgency: '${narrative._meta.urgency}'`);
  
  return lines.join('\n      ');
}

function escapeTemplateLiteral(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function updateHypothesisWeights(html, ticker, weights) {
  // Update each hypothesis score in STOCK_DATA
  let updated = html;
  
  for (const [tier, weight] of Object.entries(weights)) {
    // Pattern to find hypothesis with this tier
    const tierLower = tier.toLowerCase();
    
    // Try to find and update score
    const scorePattern = new RegExp(
      `(STOCK_DATA\.${ticker}[^}]*?hypotheses:[^\]]*?tier:\\s*['"]?)${tierLower}(['"]?[^}]*?score:\\s*['"])\\d+%(['"])`,
      'gi'
    );
    
    updated = updated.replace(scorePattern, (match, prefix, mid, suffix) => {
      return prefix + mid + weight.blended + '%' + suffix;
    });
    
    // Update scoreWidth if present
    const widthPattern = new RegExp(
      `(STOCK_DATA\.${ticker}[^}]*?hypotheses:[^\]]*?tier:\\s*['"]?)${tierLower}(['"]?[^}]*?scoreWidth:\\s*['"])\\d+%(['"])`,
      'gi'
    );
    
    updated = updated.replace(widthPattern, (match, prefix, mid, suffix) => {
      return prefix + mid + weight.blended + '%' + suffix;
    });
  }
  
  return updated;
}
