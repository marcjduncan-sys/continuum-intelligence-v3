/**
 * fix_css_classes.js
 * Normalises all CSS class fields in research JSONs to valid classes used by index.html.
 *
 * discriminators.rows[].diagnosticityClass: diag-high → disc-high, diag-medium → disc-med
 * discriminators.rows[].readingClass: reading-* → td-*
 * gaps.coverageRows[].coverageLevel: moderate/covered/numeric → full/good/partial/limited
 * gaps.coverageRows[].coverageLabel: percentage/covered → Full/Good/Partial/Limited
 * gaps.coverageRows[].confidenceClass: conf-* → td-*
 */
const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

function fixDiscClass(cls) {
  if (cls === 'diag-high') return 'disc-high';
  if (cls === 'diag-medium') return 'disc-med';
  return cls;
}

function fixReadingClass(cls) {
  if (cls === 'reading-positive') return 'td-green';
  if (cls === 'reading-negative') return 'td-red';
  if (cls === 'reading-neutral') return 'td-amber';
  return cls;
}

function fixCoverageLevel(level) {
  if (level === 'moderate' || level === 'covered') return 'good';
  if (typeof level === 'number') {
    if (level >= 70) return 'good';
    if (level >= 45) return 'partial';
    return 'limited';
  }
  return level;
}

function fixCoverageLabel(label, newLevel) {
  if (label === 'covered' || /^\d+%$/.test(String(label))) {
    var map = { full: 'Full', good: 'Good', partial: 'Partial', limited: 'Limited' };
    return map[newLevel] || label;
  }
  return label;
}

function fixConfClass(cls) {
  if (cls === 'conf-high') return 'td-green';
  if (cls === 'conf-medium') return 'td-amber';
  if (cls === 'conf-low') return 'td-red';
  return cls;
}

var totalFixed = 0;

for (var ti = 0; ti < TICKERS.length; ti++) {
  var t = TICKERS[ti];
  var path = 'data/research/' + t + '.json';
  var d = JSON.parse(fs.readFileSync(path, 'utf8'));
  var changes = [];

  // Fix discriminators
  if (d.discriminators && d.discriminators.rows) {
    for (var i = 0; i < d.discriminators.rows.length; i++) {
      var r = d.discriminators.rows[i];
      var origDisc = r.diagnosticityClass;
      var origRead = r.readingClass;
      r.diagnosticityClass = fixDiscClass(r.diagnosticityClass);
      r.readingClass = fixReadingClass(r.readingClass);
      if (r.diagnosticityClass !== origDisc || r.readingClass !== origRead) {
        changes.push('disc row' + i + ': ' + origDisc + '->' + r.diagnosticityClass + ' | ' + origRead + '->' + r.readingClass);
      }
    }
  }

  // Fix gaps.coverageRows
  if (d.gaps && d.gaps.coverageRows) {
    for (var j = 0; j < d.gaps.coverageRows.length; j++) {
      var g = d.gaps.coverageRows[j];
      var origLevel = g.coverageLevel;
      var origLabel = g.coverageLabel;
      var origConf = g.confidenceClass;
      g.coverageLevel = fixCoverageLevel(g.coverageLevel);
      g.coverageLabel = fixCoverageLabel(g.coverageLabel, g.coverageLevel);
      g.confidenceClass = fixConfClass(g.confidenceClass);
      if (g.coverageLevel !== origLevel || g.coverageLabel !== origLabel || g.confidenceClass !== origConf) {
        changes.push('gap row' + j + ': level=' + origLevel + '->' + g.coverageLevel + ' label=' + origLabel + '->' + g.coverageLabel + ' conf=' + origConf + '->' + g.confidenceClass);
      }
    }
  }

  if (changes.length > 0) {
    fs.writeFileSync(path, JSON.stringify(d, null, 2));
    totalFixed++;
    console.log('FIXED ' + t + ' (' + changes.length + ' rows):');
    var show = Math.min(changes.length, 4);
    for (var k = 0; k < show; k++) console.log('  ' + changes[k]);
    if (changes.length > 4) console.log('  ... and ' + (changes.length - 4) + ' more');
  } else {
    console.log('OK    ' + t);
  }
}

console.log('\nTotal files modified: ' + totalFixed + '/' + TICKERS.length);
