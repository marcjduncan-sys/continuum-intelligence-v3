const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'data', 'research');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));

files.sort().forEach(f => {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(dir, f)));
    const ph = d.priceHistory;
    if (!ph || !ph.length) { console.log(f.replace('.json','').padEnd(6) + ' NO_DATA'); return; }
    const max = Math.max.apply(null, ph).toFixed(2);
    const min = Math.min.apply(null, ph).toFixed(2);
    const first = ph[0].toFixed(2);
    const last = ph[ph.length-1].toFixed(2);
    const cur = d.price || 'N/A';
    const priceDiff = d.price ? Math.abs(last - d.price) / d.price * 100 : 0;
    const flag = priceDiff > 25 ? ' <<< STALE' : '';
    console.log(f.replace('.json','').padEnd(6) + ' len:' + String(ph.length).padStart(4) + ' first:' + String(first).padStart(7) + ' last:' + String(last).padStart(7) + ' min:' + String(min).padStart(7) + ' max:' + String(max).padStart(7) + ' cur:' + String(cur).padStart(7) + flag);
  } catch(e) { console.log(f, 'ERROR:', e.message); }
});
