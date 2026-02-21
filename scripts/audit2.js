const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];

console.log('=== STOCKS JSON REAL ISSUES ===\n');
for (const t of TICKERS) {
  const d = JSON.parse(fs.readFileSync('data/stocks/'+t+'.json','utf8'));
  const issues = [];

  // risk_skew
  if (!d.risk_skew) {
    const sl = (d.three_layer_signal && d.three_layer_signal.sentiment_label) || 'N/A';
    issues.push('MISSING risk_skew [sentiment_label='+sl+']');
  }

  // market_cap
  if (!d.market_cap && d.market_cap !== 0) issues.push('MISSING market_cap');
  else if (typeof d.market_cap === 'number') issues.push('market_cap is NUMBER: '+d.market_cap);

  // dominant vs highest survival_score
  if (d.hypotheses && !Array.isArray(d.hypotheses)) {
    const scores = ['T1','T2','T3','T4'].map(tier => d.hypotheses[tier] ? d.hypotheses[tier].survival_score : 0);
    const maxScore = Math.max.apply(null, scores);
    const maxTier = ['T1','T2','T3','T4'][scores.indexOf(maxScore)];
    if (d.dominant && d.dominant !== maxTier) {
      issues.push('dominant='+d.dominant+' but max_score='+maxTier+'('+maxScore+') [scores: T1='+scores[0]+' T2='+scores[1]+' T3='+scores[2]+' T4='+scores[3]+']');
    }
  }

  // NAB placeholder check
  if (d.hypotheses && !Array.isArray(d.hypotheses)) {
    for (const tier of ['T1','T2','T3','T4']) {
      if (d.hypotheses[tier] && d.hypotheses[tier].plain_english && d.hypotheses[tier].plain_english.includes('Placeholder')) {
        issues.push(tier+' plain_english is PLACEHOLDER');
      }
    }
  }

  if (issues.length > 0) {
    console.log(t+':');
    issues.forEach(function(i) { console.log('  '+i); });
  }
}

console.log('\n=== RESEARCH JSON STRUCTURAL ISSUES ===\n');
for (const t of TICKERS) {
  const d = JSON.parse(fs.readFileSync('data/research/'+t+'.json','utf8'));
  const issues = [];

  if (d.evidence && d.evidence.cards && d.evidence.cards.length !== 10) issues.push('evidence.cards='+d.evidence.cards.length+' (need 10)');
  if (d.discriminators && d.discriminators.rows && d.discriminators.rows.length !== 4) issues.push('discriminators.rows='+d.discriminators.rows.length+' (need 4)');
  if (d.tripwires && d.tripwires.cards && d.tripwires.cards.length !== 3) issues.push('tripwires.cards='+d.tripwires.cards.length+' (need 3)');
  if (d.gaps && d.gaps.coverageRows && d.gaps.coverageRows.length !== 10) issues.push('gaps.coverageRows='+d.gaps.coverageRows.length+' (need 10)');
  if (d.heroMetrics && Array.isArray(d.heroMetrics) && d.heroMetrics.length < 3) issues.push('heroMetrics='+d.heroMetrics.length);

  if (issues.length > 0) {
    console.log(t+': '+issues.join(' | '));
  }
}

console.log('\n=== STOCKS market_cap SOURCES (from research heroMetrics) ===\n');
for (const t of TICKERS) {
  const s = JSON.parse(fs.readFileSync('data/stocks/'+t+'.json','utf8'));
  if (!s.market_cap) {
    const r = JSON.parse(fs.readFileSync('data/research/'+t+'.json','utf8'));
    const mktCap = r.heroMetrics && r.heroMetrics[0] ? r.heroMetrics[0].value : 'NOT FOUND';
    console.log(t+': market_cap null -> heroMetrics[0].value='+mktCap);
  }
}
