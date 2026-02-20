const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data', 'stocks');
const files = fs.readdirSync(dir).filter(function(f) {
  return f.endsWith('.json') && f.indexOf('-history') === -1;
});
var ok = [], bad = [];
files.forEach(function(f) {
  var s;
  try { s = JSON.parse(fs.readFileSync(path.join(dir, f))); } catch(e) { return; }
  var hyps = s.hypotheses;
  if (!hyps || typeof hyps !== 'object' || Array.isArray(hyps)) return;
  var t1up = hyps.T1 && hyps.T1.upside != null;
  var t2up = hyps.T2 && hyps.T2.upside != null;
  var keys = ['T1','T2','T3','T4'];
  var allPresent = keys.every(function(k){ return !!hyps[k]; });
  if (!allPresent) { bad.push(f + ': missing T1-T4'); return; }
  var scores = keys.map(function(k){return {k:k, sc: hyps[k].survival_score};}).sort(function(a,b){return b.sc-a.sc;});
  var dominant = scores[0];
  var ticker = f.replace('.json','');
  // Placeholder pattern: T2 dominates but has no upside, or neither T1 nor T2 have upside
  var t2dom = dominant.k === 'T2' && !t2up;
  var noUpside = !t1up && !t2up;
  if (t2dom || noUpside) {
    bad.push(ticker + ': T1_up=' + t1up + ' T2_up=' + t2up + ' dominant=' + dominant.k + '(' + dominant.sc + ') T1_label=' + (hyps.T1.label||'?') + ' T2_label=' + (hyps.T2.label||'?'));
  } else {
    ok.push(ticker);
  }
});
console.log('CLEAN (' + ok.length + '):', ok.join(', '));
console.log('');
console.log('SUSPECT (' + bad.length + '):');
bad.forEach(function(b){ console.log('  ' + b); });
