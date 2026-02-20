const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'data', 'stocks');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f.indexOf('-history') === -1);
let problems = 0;

files.forEach(f => {
  const ticker = f.replace('.json', '');
  const raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const hasHyp = raw.hypotheses && Object.keys(raw.hypotheses).length > 0;
  if (!hasHyp) {
    console.log('NO HYPS: ' + f + ' keys=' + Object.keys(raw.hypotheses || {}).join(','));
    return;
  }

  const hPath = path.join(dir, ticker + '-history.json');
  if (!fs.existsSync(hPath)) {
    console.log('NO HISTORY FILE: ' + ticker);
    problems++;
    return;
  }

  const h = JSON.parse(fs.readFileSync(hPath, 'utf8'));
  // Simulate normalisation
  let entries;
  if (Array.isArray(h.entries)) {
    entries = h.entries;
  } else if (Array.isArray(h.history)) {
    entries = h.history;
  } else {
    entries = null;
  }

  if (entries === null) {
    console.log('PROBLEM AFTER NORM: ' + ticker + ' keys=' + Object.keys(h).join(','));
    problems++;
  }
});

if (problems === 0) console.log('All ' + files.length + ' stocks OK locally');
