/**
 * fix_stocks.js — Automated fixer for stocks JSON issues
 * Fixes: risk_skew, market_cap, dominant, NAB placeholders
 * Run from: continuum-intelligence-v2/
 */
const fs = require('fs');

const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

// sentiment_label → risk_skew: map "STRONG UPSIDE" → "UPSIDE"
function toRiskSkew(label) {
  if (!label) return 'NEUTRAL';
  const l = label.toUpperCase();
  if (l.indexOf('UPSIDE') !== -1) return 'UPSIDE';
  if (l.indexOf('DOWNSIDE') !== -1) return 'DOWNSIDE';
  return 'NEUTRAL';
}

// Strip "A$" prefix from heroMetrics value
function stripAud(val) {
  if (!val) return null;
  return String(val).replace(/^A\$/, '');
}

let changeCount = 0;

for (const t of TICKERS) {
  const stocksPath = 'data/stocks/' + t + '.json';
  const d = JSON.parse(fs.readFileSync(stocksPath, 'utf8'));
  let changed = false;
  const changes = [];

  // ---- 1. Fix risk_skew ----
  if (!d.risk_skew) {
    const sentLabel = d.three_layer_signal && d.three_layer_signal.sentiment_label;
    const skew = toRiskSkew(sentLabel);
    d.risk_skew = skew;
    changed = true;
    changes.push('risk_skew=' + skew + ' (from sentiment_label=' + sentLabel + ')');
  }

  // ---- 2. Fix market_cap ----
  if (!d.market_cap && d.market_cap !== 0) {
    // Pull from research JSON heroMetrics[0].value
    const resPath = 'data/research/' + t + '.json';
    if (fs.existsSync(resPath)) {
      const r = JSON.parse(fs.readFileSync(resPath, 'utf8'));
      if (r.heroMetrics && r.heroMetrics[0] && r.heroMetrics[0].value) {
        const rawVal = r.heroMetrics[0].value;
        const cleaned = stripAud(rawVal);
        d.market_cap = cleaned;
        changed = true;
        changes.push('market_cap=' + cleaned + ' (from heroMetrics[0].value=' + rawVal + ')');
      }
    }
  }

  // ---- 3. Fix dominant (use tier with highest survival_score) ----
  if (d.hypotheses && !Array.isArray(d.hypotheses)) {
    const TIERS = ['T1','T2','T3','T4'];
    const scores = TIERS.map(function(tier) {
      return d.hypotheses[tier] ? d.hypotheses[tier].survival_score : 0;
    });
    const maxScore = Math.max.apply(null, scores);
    const maxTier = TIERS[scores.indexOf(maxScore)];
    if (d.dominant && d.dominant !== maxTier) {
      const old = d.dominant;
      d.dominant = maxTier;
      changed = true;
      changes.push('dominant: ' + old + ' → ' + maxTier + ' (max score ' + maxScore + ')');
    }
  }

  // ---- 4. Fix NAB placeholder plain_english ----
  if (t === 'NAB' && d.hypotheses && !Array.isArray(d.hypotheses)) {
    const resPath = 'data/research/NAB.json';
    const r = JSON.parse(fs.readFileSync(resPath, 'utf8'));
    // Build a map from tier (lowercase/uppercase) to description
    const descMap = {};
    if (r.hypotheses && Array.isArray(r.hypotheses)) {
      r.hypotheses.forEach(function(h) {
        if (h.tier && h.description) {
          descMap[h.tier.toUpperCase()] = h.description;
        }
      });
    }
    const TIERS = ['T1','T2','T3','T4'];
    for (const tier of TIERS) {
      const h = d.hypotheses[tier];
      if (h && h.plain_english && h.plain_english.indexOf('Placeholder') !== -1) {
        const newText = descMap[tier] || ('Narrative analysis for ' + tier + ' pending analyst review.');
        d.hypotheses[tier].plain_english = newText;
        changed = true;
        changes.push(tier + ' plain_english replaced (was placeholder)');
      }
    }
    // Also fix big_picture if placeholder
    if (d.big_picture && d.big_picture.indexOf('pending') !== -1) {
      // Use verdict from research JSON
      if (r.verdict && r.verdict.text) {
        d.big_picture = r.verdict.text;
        changed = true;
        changes.push('big_picture replaced from research verdict');
      }
    }
  }

  if (changed) {
    fs.writeFileSync(stocksPath, JSON.stringify(d, null, 2));
    changeCount++;
    console.log('FIXED ' + t + ':');
    changes.forEach(function(c) { console.log('  ' + c); });
  } else {
    console.log('OK    ' + t + ' (no changes needed)');
  }
}

console.log('\nTotal files modified: ' + changeCount + '/' + TICKERS.length);
