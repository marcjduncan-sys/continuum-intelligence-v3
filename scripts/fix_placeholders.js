/**
 * fix_placeholders.js
 * Replaces generic placeholder plain_english and big_picture fields
 * with real content from data/research/TICKER.json
 */
const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

// Patterns that indicate generic/template content
const GENERIC_PLAINS = [
  'delivers on its key initiatives and the market rewards it.',
  'something goes wrong and the stock de-rates.',
  'Placeholder — requires analyst research to populate.',
  'See research report for upside scenario detail.',
  'Narrative analysis for',
  'continues on its current trajectory — neither surprising positively nor negatively.',
  'An external force — technology, regulation, or competition — fundamentally alters the business.',
];
const GENERIC_BIGPICTURE = [
  'coverage initiated. Full analysis pending.',
  'Narrative analysis pending.',
];

function isGeneric(text, patterns) {
  if (!text) return false;
  for (var i = 0; i < patterns.length; i++) {
    if (text.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

var totalFixed = 0;

for (var ti = 0; ti < TICKERS.length; ti++) {
  var t = TICKERS[ti];
  var stocksPath = 'data/stocks/' + t + '.json';
  var resPath = 'data/research/' + t + '.json';

  var d = JSON.parse(fs.readFileSync(stocksPath, 'utf8'));
  var r = JSON.parse(fs.readFileSync(resPath, 'utf8'));

  // Build map from UPPERCASE tier → description from research JSON
  var descMap = {};
  var verdictText = null;
  if (r.verdict && r.verdict.text) verdictText = r.verdict.text;

  if (r.hypotheses && Array.isArray(r.hypotheses)) {
    for (var hi = 0; hi < r.hypotheses.length; hi++) {
      var h = r.hypotheses[hi];
      if (h.tier && h.description) {
        descMap[h.tier.toUpperCase()] = h.description;
      }
    }
  }

  var changed = false;
  var changes = [];

  // Fix plain_english for each tier
  var tiers = ['T1','T2','T3','T4'];
  for (var ki = 0; ki < tiers.length; ki++) {
    var tier = tiers[ki];
    var hyp = d.hypotheses && d.hypotheses[tier];
    if (hyp && isGeneric(hyp.plain_english, GENERIC_PLAINS)) {
      var newText = descMap[tier] || null;
      if (newText) {
        var isDominant = d.dominant === tier ? ' [DOMINANT]' : '';
        d.hypotheses[tier].plain_english = newText;
        changed = true;
        changes.push(tier + isDominant + ': plain_english replaced from research description');
      } else {
        changes.push(tier + ': COULD NOT replace (no research description found)');
      }
    }
  }

  // Fix big_picture
  if (isGeneric(d.big_picture, GENERIC_BIGPICTURE)) {
    if (verdictText) {
      d.big_picture = verdictText;
      changed = true;
      changes.push('big_picture replaced from research verdict');
    } else {
      changes.push('big_picture: COULD NOT replace (no verdict.text in research)');
    }
  }

  if (changed) {
    fs.writeFileSync(stocksPath, JSON.stringify(d, null, 2));
    totalFixed++;
    console.log('FIXED ' + t + ':');
    changes.forEach(function(c) { console.log('  ' + c); });
  } else {
    // Check if any unresolvable issues remain
    var unresolved = changes.filter(function(c) { return c.indexOf('COULD NOT') !== -1; });
    if (unresolved.length > 0) {
      console.log('WARN  ' + t + ':');
      unresolved.forEach(function(c) { console.log('  ' + c); });
    } else {
      console.log('OK    ' + t);
    }
  }
}

console.log('\nTotal files modified: ' + totalFixed);
