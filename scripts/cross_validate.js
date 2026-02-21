/**
 * cross_validate.js — Cross-layer consistency check
 * Validates: sentiment_label, overall_sentiment, and price between _index.json and stocks JSONs
 */
const fs = require('fs');
const T = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
const idx = JSON.parse(fs.readFileSync('data/research/_index.json','utf8'));
var issues = [];

for (var ti = 0; ti < T.length; ti++) {
  var t = T[ti];
  var s = JSON.parse(fs.readFileSync('data/stocks/'+t+'.json','utf8'));
  var idxTls = idx[t].three_layer_signal;
  var stTls = s.three_layer_signal;

  if (idxTls && stTls) {
    if (idxTls.sentiment_label !== stTls.sentiment_label) {
      issues.push(t+': sentiment_label MISMATCH — _index='+idxTls.sentiment_label+' stocks='+stTls.sentiment_label);
    }
    if (idxTls.overall_sentiment !== stTls.overall_sentiment) {
      issues.push(t+': overall_sentiment MISMATCH — _index='+idxTls.overall_sentiment+' stocks='+stTls.overall_sentiment);
    }
  }

  // Price cross-check
  var idxPrice = idx[t].price;
  var stPrice = s.current_price;
  if (idxPrice && stPrice) {
    var diff = Math.abs(idxPrice - stPrice);
    var pct = (diff / idxPrice * 100);
    if (pct > 2) issues.push(t+': price MISMATCH — _index='+idxPrice+' stocks='+stPrice+' ('+pct.toFixed(1)+'%)');
  }

  // dominant cross-check: stocks dominant vs stocks hypothesis survival scores
  if (s.hypotheses && !Array.isArray(s.hypotheses)) {
    var tiers = ['T1','T2','T3','T4'];
    var scores = tiers.map(function(tier) {
      return s.hypotheses[tier] ? s.hypotheses[tier].survival_score : 0;
    });
    var maxScore = Math.max.apply(null, scores);
    var maxTier = tiers[scores.indexOf(maxScore)];
    if (s.dominant && s.dominant !== maxTier) {
      issues.push(t+': dominant='+s.dominant+' but max survival_score is '+maxTier+'('+maxScore+')');
    }
  }
}

if (issues.length === 0) {
  console.log('ALL CLEAN — no cross-layer inconsistencies found');
} else {
  console.log('CROSS-LAYER ISSUES ('+issues.length+'):');
  issues.forEach(function(x) { console.log('  '+x); });
}
