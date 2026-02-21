/**
 * audit_deep.js — Deep audit for all field types, null values, and rendering issues
 * Checks: evidence cards, verdict, heroMetrics, identity, priceHistory, hypotheses
 */
const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

console.log('=== DEEP RESEARCH JSON AUDIT ===\n');

var totalIssues = 0;

for (var ti = 0; ti < TICKERS.length; ti++) {
  var t = TICKERS[ti];
  var d = JSON.parse(fs.readFileSync('data/research/' + t + '.json', 'utf8'));
  var issues = [];

  // verdict
  if (!d.verdict) issues.push('MISSING verdict');
  else if (!d.verdict.text || d.verdict.text.length < 20) issues.push('verdict.text too short or missing');

  // heroMetrics (need at least 3)
  if (!d.heroMetrics || d.heroMetrics.length < 3) {
    issues.push('heroMetrics count=' + (d.heroMetrics ? d.heroMetrics.length : 0) + ' (need >=3)');
  } else {
    for (var i = 0; i < d.heroMetrics.length; i++) {
      var hm = d.heroMetrics[i];
      if (!hm.label || !hm.value) issues.push('heroMetrics['+i+'] missing label or value');
    }
  }

  // hypotheses (array, need at least 4)
  if (!d.hypotheses || !Array.isArray(d.hypotheses)) {
    issues.push('hypotheses missing or not array');
  } else if (d.hypotheses.length < 4) {
    issues.push('hypotheses count=' + d.hypotheses.length + ' (need >=4)');
  } else {
    for (var j = 0; j < d.hypotheses.length; j++) {
      var h = d.hypotheses[j];
      if (!h.tier) issues.push('hypotheses['+j+'] missing tier');
      if (!h.title || h.title.length < 5) issues.push('hypotheses['+j+'] missing/short title');
      if (!h.description || h.description.length < 20) issues.push('hypotheses['+j+'] missing/short description');
      if (!h.score) issues.push('hypotheses['+j+'] missing score');
    }
  }

  // evidence.cards
  if (!d.evidence || !d.evidence.cards) {
    issues.push('evidence.cards missing');
  } else if (d.evidence.cards.length < 8) {
    issues.push('evidence.cards=' + d.evidence.cards.length + ' (need >=8)');
  } else {
    for (var k = 0; k < d.evidence.cards.length; k++) {
      var c = d.evidence.cards[k];
      if (!c.title || !c.body) issues.push('evidence.cards['+k+'] missing title or body');
    }
  }

  // discriminators
  if (!d.discriminators || !d.discriminators.rows || d.discriminators.rows.length < 1) {
    issues.push('discriminators.rows missing or empty');
  }

  // tripwires
  if (!d.tripwires || !d.tripwires.cards || d.tripwires.cards.length < 1) {
    issues.push('tripwires.cards missing or empty');
  } else {
    for (var m = 0; m < d.tripwires.cards.length; m++) {
      var tw = d.tripwires.cards[m];
      if (!tw.name || tw.name.length < 5) issues.push('tripwires.cards['+m+'] missing/short name');
      if (!tw.date) issues.push('tripwires.cards['+m+'] missing date');
      if (!tw.conditions || tw.conditions.length < 1) issues.push('tripwires.cards['+m+'] missing conditions');
    }
  }

  // gaps
  if (!d.gaps || !d.gaps.coverageRows || d.gaps.coverageRows.length < 1) {
    issues.push('gaps.coverageRows missing or empty');
  }

  // priceHistory (need at least 12 months)
  if (!d.priceHistory || d.priceHistory.length < 12) {
    issues.push('priceHistory=' + (d.priceHistory ? d.priceHistory.length : 0) + ' points (need >=12)');
  }

  // identity.rows
  if (!d.identity || !d.identity.rows || d.identity.rows.length < 2) {
    issues.push('identity.rows missing or too short');
  }

  if (issues.length > 0) {
    totalIssues += issues.length;
    console.log(t + ':');
    issues.forEach(function(x) { console.log('  ' + x); });
  }
}

if (totalIssues === 0) {
  console.log('ALL CLEAN — no deep issues found');
} else {
  console.log('\nTotal issues: ' + totalIssues);
}

console.log('\n=== STOCKS JSON DEEP AUDIT ===\n');
var stockIssues = 0;
for (var si = 0; si < TICKERS.length; si++) {
  var st = TICKERS[si];
  var s = JSON.parse(fs.readFileSync('data/stocks/' + st + '.json', 'utf8'));
  var sIssues = [];

  if (!s.current_price) sIssues.push('current_price missing or zero');
  if (!s.market_cap) sIssues.push('market_cap missing');
  if (!s.risk_skew) sIssues.push('risk_skew missing');
  if (!s.dominant) sIssues.push('dominant missing');
  if (!s.big_picture || s.big_picture.length < 30) sIssues.push('big_picture missing or too short');

  if (s.hypotheses && !Array.isArray(s.hypotheses)) {
    ['T1','T2','T3','T4'].forEach(function(tier) {
      var h = s.hypotheses[tier];
      if (!h) { sIssues.push(tier + ' missing'); return; }
      if (!h.plain_english || h.plain_english.length < 30) sIssues.push(tier + ' plain_english too short');
      if (h.survival_score === undefined || h.survival_score === null) sIssues.push(tier + ' survival_score missing');
    });
  }

  if (!s.three_layer_signal) sIssues.push('three_layer_signal missing');
  if (!s.priceHistory || s.priceHistory.length < 12) sIssues.push('priceHistory too short');

  if (sIssues.length > 0) {
    stockIssues += sIssues.length;
    console.log(st + ':');
    sIssues.forEach(function(x) { console.log('  ' + x); });
  }
}

if (stockIssues === 0) {
  console.log('ALL CLEAN — no deep stocks issues found');
} else {
  console.log('\nTotal stocks issues: ' + stockIssues);
}
