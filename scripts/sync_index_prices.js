/**
 * sync_index_prices.js
 * Syncs stale _index.json prices to match stocks/*.json current_price
 * (which is fresher, sourced from the same live-prices pipeline run)
 */
const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

const idxPath = 'data/research/_index.json';
const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));

var changed = 0;

for (var ti = 0; ti < TICKERS.length; ti++) {
  var t = TICKERS[ti];
  var s = JSON.parse(fs.readFileSync('data/stocks/' + t + '.json', 'utf8'));
  var idxPrice = idx[t] && idx[t].price;
  var stockPrice = s.current_price;

  if (!idxPrice || !stockPrice) continue;

  var diff = Math.abs(idxPrice - stockPrice);
  var pct = diff / idxPrice * 100;

  if (pct > 1) {
    console.log(t + ': _index=' + idxPrice + ' → ' + stockPrice + ' (' + (pct).toFixed(1) + '% delta)');
    idx[t].price = stockPrice;
    changed++;
  }
}

if (changed > 0) {
  fs.writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  console.log('\nUpdated ' + changed + ' prices in _index.json');
} else {
  console.log('All prices already in sync.');
}
