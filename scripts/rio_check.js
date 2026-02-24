const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('data/research/_index.json','utf8'));
const s = JSON.parse(fs.readFileSync('data/stocks/RIO.json','utf8'));
const r = JSON.parse(fs.readFileSync('data/research/RIO.json','utf8'));

console.log('=== RIO PRICE AUDIT ===');
console.log('_index.json price:', idx.RIO.price, '| date:', idx.RIO.date);
console.log('stocks current_price:', s.current_price, '| last_updated:', s.last_updated || 'n/a');
console.log('research price:', r.price || 'n/a');

// Check identity rows for share price
if (r.identity && r.identity.rows) {
  r.identity.rows.forEach(function(row) {
    row.forEach(function(cell) {
      if (cell[0] && cell[0].indexOf('Price') !== -1) {
        console.log('  identity row:', cell[0], ':', cell[1]);
      }
    });
  });
}

// heroMetrics
console.log('heroMetrics[0]:', r.heroMetrics && r.heroMetrics[0]);

// priceHistory last 5
const idxPH = idx.RIO.priceHistory;
const resPH = r.priceHistory;
console.log('index priceHistory (last 5):', idxPH && idxPH.slice(-5));
console.log('research priceHistory (last 5):', resPH && resPH.slice(-5));

console.log('\n=== CROSS-LAYER PRICE COMPARISON (all stocks) ===');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
for (var i = 0; i < TICKERS.length; i++) {
  var t = TICKERS[i];
  var idxPrice = idx[t] && idx[t].price;
  var stockPrice = JSON.parse(fs.readFileSync('data/stocks/'+t+'.json','utf8')).current_price;
  if (idxPrice && stockPrice) {
    var diff = Math.abs(idxPrice - stockPrice);
    var pct = (diff / idxPrice * 100).toFixed(1);
    if (parseFloat(pct) > 5) {
      console.log(t+': INDEX='+idxPrice+' STOCKS='+stockPrice+' DIFF='+diff.toFixed(2)+'('+pct+'%) ***');
    }
  }
}
console.log('(Only showing >5% divergence)');
