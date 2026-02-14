/**
 * Apply Narrative Updates to index.html
 * 
 * Updates index.html with dynamic commentary from narrative analysis.
 * Called by GitHub Actions after analysis detects significant dislocations.
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
console.log('║  Apply Narrative Updates to index.html                        ║');
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

// Process each ticker with significant dislocation
for (const [ticker, result] of Object.entries(analysis.results)) {
  if (result.dislocation.severity === 'NORMAL') continue;
  
  console.log(`Processing ${ticker} (${result.dislocation.severity})...`);
  
  // Generate new narrative content
  const commentary = result.institutionalCommentary;
  if (!commentary) {
    console.log(`  ⚠️ No commentary available, skipping`);
    continue;
  }
  
  // Update STOCK_DATA narrative section
  const narrativeUpdate = generateNarrativeUpdate(ticker, result);
  
  // Find and replace narrative section in index.html
  const updated = updateStockDataNarrative(indexHtml, ticker, narrativeUpdate);
  if (updated !== indexHtml) {
    indexHtml = updated;
    updates.push(ticker);
    console.log(`  ✅ Updated narrative section`);
  } else {
    console.log(`  ⚠️ Could not find narrative section to update`);
  }
  
  // Update hypothesis weights
  const weightsUpdated = updateHypothesisWeights(indexHtml, ticker, result.weights);
  if (weightsUpdated !== indexHtml) {
    indexHtml = weightsUpdated;
    console.log(`  ✅ Updated hypothesis weights`);
  }
}

// Write updated index.html
try {
  fs.writeFileSync(OUTPUT_FILE, indexHtml);
  console.log(`\n✅ Updated ${OUTPUT_FILE} with ${updates.length} ticker narratives`);
  console.log(`Updated tickers: ${updates.join(', ')}`);
} catch (e) {
  console.error('Error writing index.html:', e.message);
  process.exit(1);
}

// Helper functions

function generateNarrativeUpdate(ticker, result) {
  const c = result.institutionalCommentary;
  
  return {
    theNarrative: c.executiveSummary,
    priceImplication: c.valuation,
    evidenceCheck: c.evidenceCheck,
    narrativeStability: c.investmentThesis,
    catalysts: c.catalysts,
    _dynamic: {
      lastUpdated: new Date().toISOString(),
      dislocationSeverity: result.dislocation.severity,
      primaryHypothesis: result.inference.primaryHypothesis,
      weights: result.weights,
      urgency: c.summary.urgency,
      action: c.summary.keyAction
    }
  };
}

function updateStockDataNarrative(html, ticker, narrativeUpdate) {
  // Find STOCK_DATA.TICKER.narrative section
  const pattern = new RegExp(
    `(STOCK_DATA\.${ticker} = \{[\\s\\S]*?narrative: \\{)[\\s\\S]*?(\\},?[\\s\\S]*?\\};?)`,
    'i'
  );
  
  // Create new narrative content
  const newNarrativeContent = formatNarrativeForJs(narrativeUpdate);
  
  // Replace in HTML
  return html.replace(pattern, (match, prefix, suffix) => {
    // Check if this is actually the narrative section
    if (!match.includes('theNarrative') && !match.includes('narrative:')) {
      return match;
    }
    return prefix + '\n    ' + newNarrativeContent + '\n  ' + suffix;
  });
}

function formatNarrativeForJs(narrative) {
  const lines = [];
  
  lines.push('theNarrative: `' + escapeTemplateLiteral(narrative.theNarrative) + '`,');
  lines.push('priceImplication: `' + escapeTemplateLiteral(narrative.priceImplication) + '`,');
  lines.push('evidenceCheck: `' + escapeTemplateLiteral(narrative.evidenceCheck) + '`,');
  lines.push('narrativeStability: `' + escapeTemplateLiteral(narrative.narrativeStability) + '`,');
  lines.push('catalysts: `' + escapeTemplateLiteral(narrative.catalysts) + '`,');
  lines.push('_dynamic: ' + JSON.stringify(narrative._dynamic));
  
  return lines.join('\n    ');
}

function escapeTemplateLiteral(str) {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
}

function updateHypothesisWeights(html, ticker, weights) {
  // Find and update each hypothesis score
  let updated = html;
  
  for (const [tier, weight] of Object.entries(weights)) {
    // Pattern to find hypothesis tier in STOCK_DATA
    const pattern = new RegExp(
      `(STOCK_DATA\.${ticker}[^}]*?hypotheses:[^\\]]*?tier:\\s*['"]?${tier.toLowerCase()}['"]?[^}]*?score:\\s*['"])[^'"]+(['"])`,
      'i'
    );
    
    updated = updated.replace(pattern, (match, prefix, suffix) => {
      return prefix + weight.blended + '%' + suffix;
    });
    
    // Also update scoreWidth if present
    const widthPattern = new RegExp(
      `(STOCK_DATA\.${ticker}[^}]*?hypotheses:[^\\]]*?tier:\\s*['"]?${tier.toLowerCase()}['"]?[^}]*?scoreWidth:\\s*['"])[^'"]+(['"])`,
      'i'
    );
    
    updated = updated.replace(widthPattern, (match, prefix, suffix) => {
      return prefix + weight.blended + '%' + suffix;
    });
  }
  
  return updated;
}
