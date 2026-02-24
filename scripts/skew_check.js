const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('data/research/_index.json','utf8'));

// Verify RIO fix
const rioS = JSON.parse(fs.readFileSync('data/stocks/RIO.json','utf8'));
console.log('RIO current_price:', rioS.current_price, '(index:', idx.RIO.price, ')');

// Skew contradiction analysis
console.log('\n=== SKEW CONTRADICTIONS ===');
console.log('skew.direction = analyst qualitative judgment (research report)');
console.log('sentiment_label = automated pipeline signal (three_layer_signal)\n');
var TICKERS = ['CBA','CSL','NAB','OCL','WOW','XRO'];
TICKERS.forEach(function(t) {
  var e = idx[t];
  var skewDir = e.skew && e.skew.direction;
  var sentLabel = e.three_layer_signal && e.three_layer_signal.sentiment_label;
  console.log(t+': analyst='+skewDir+' | pipeline='+sentLabel);
});
console.log('\nThese show in DIFFERENT places:');
console.log('- skew.direction -> shown in research report skew badge');
console.log('- sentiment_label -> shown in three-layer signal widget');
console.log('Contradiction is INTENTIONAL by design (analyst vs quant can disagree)');
