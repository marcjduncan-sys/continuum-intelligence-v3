var fs = require('fs');
var BASE = 'C:/Users/User/continuum-intelligence-v2';
var TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
var issues = {};
function addIssue(t,l,m){if(!issues[t])issues[t]=[];issues[t].push('['+l+'] '+m);}
for(var i=0;i<TICKERS.length;i++){
  var t=TICKERS[i];
  var fp=BASE+'/data/research/'+t+'.json';
  if(!fs.existsSync(fp)){addIssue(t,'RESEARCH','FILE MISSING');continue;}
  var d;try{d=JSON.parse(fs.readFileSync(fp,'utf8'));}catch(e){addIssue(t,'RESEARCH','JSON PARSE ERROR: '+e.message);continue;}
  var reqF=['identity','verdict','skew','priceHistory','hypotheses','narrative','evidence','discriminators','tripwires','gaps','technicalAnalysis','heroMetrics','footer'];
  for(var j=0;j<reqF.length;j++){if(!d[reqF[j]])addIssue(t,'RESEARCH','MISSING field: '+reqF[j]);}
  if(d.hypotheses){
    if(!Array.isArray(d.hypotheses))addIssue(t,'RESEARCH','hypotheses is not an array');
    else{
      if(d.hypotheses.length!==4)addIssue(t,'RESEARCH','hypotheses has '+d.hypotheses.length+' items (expected 4)');
      var tiers=d.hypotheses.map(function(h){return h.tier;});
      ['T1','T2','T3','T4'].forEach(function(tier){if(!tiers.includes(tier))addIssue(t,'RESEARCH','hypotheses missing tier '+tier);});
      d.hypotheses.forEach(function(h){
        if(!h.tier)addIssue(t,'RESEARCH','hypothesis missing tier field');
        if(!h.title)addIssue(t,'RESEARCH','hypothesis '+h.tier+' missing title');
        if(typeof h.score!=='number')addIssue(t,'RESEARCH','hypothesis '+h.tier+' score not a number: '+h.score);
        if(!h.description)addIssue(t,'RESEARCH','hypothesis '+h.tier+' missing description');
      });
    }
  }
  if(d.evidence){if(!d.evidence.cards||!Array.isArray(d.evidence.cards))addIssue(t,'RESEARCH','evidence.cards missing or not array');else if(d.evidence.cards.length!==10)addIssue(t,'RESEARCH','evidence.cards has '+d.evidence.cards.length+' items (expected 10)');}
  if(d.discriminators){if(!d.discriminators.rows||!Array.isArray(d.discriminators.rows))addIssue(t,'RESEARCH','discriminators.rows missing or not array');else if(d.discriminators.rows.length!==4)addIssue(t,'RESEARCH','discriminators.rows has '+d.discriminators.rows.length+' items (expected 4)');}
  if(d.tripwires){if(!d.tripwires.cards||!Array.isArray(d.tripwires.cards))addIssue(t,'RESEARCH','tripwires.cards missing or not array');else if(d.tripwires.cards.length!==3)addIssue(t,'RESEARCH','tripwires.cards has '+d.tripwires.cards.length+' items (expected 3)');}
  if(d.gaps){if(!d.gaps.coverageRows||!Array.isArray(d.gaps.coverageRows))addIssue(t,'RESEARCH','gaps.coverageRows missing or not array');else if(d.gaps.coverageRows.length!==10)addIssue(t,'RESEARCH','gaps.coverageRows has '+d.gaps.coverageRows.length+' items (expected 10)');}
  if(d.priceHistory){if(!Array.isArray(d.priceHistory))addIssue(t,'RESEARCH','priceHistory is not an array');else if(d.priceHistory.length<10)addIssue(t,'RESEARCH','priceHistory has only '+d.priceHistory.length+' entries');}
  if(d.heroMetrics){if(!Array.isArray(d.heroMetrics))addIssue(t,'RESEARCH','heroMetrics is not an array');else if(d.heroMetrics.length<3)addIssue(t,'RESEARCH','heroMetrics has only '+d.heroMetrics.length+' items');}
  if(d.narrative&&!d.narrative.theNarrative)addIssue(t,'RESEARCH','narrative.theNarrative missing');
  if(d.footer){if(!d.footer.disclaimer)addIssue(t,'RESEARCH','footer.disclaimer missing');if(typeof d.footer.domainCount!=='number')addIssue(t,'RESEARCH','footer.domainCount not a number');if(typeof d.footer.hypothesesCount!=='number')addIssue(t,'RESEARCH','footer.hypothesesCount not a number');}
  if(!d.price&&!(d.identity&&d.identity.currentPrice)&&!(d.identity&&d.identity.price))addIssue(t,'RESEARCH','no price field found');
}
for(var ii=0;ii<TICKERS.length;ii++){
  var t=TICKERS[ii];
  var fp=BASE+'/data/stocks/'+t+'.json';
  if(!fs.existsSync(fp)){addIssue(t,'STOCKS','FILE MISSING');continue;}
  var d;try{d=JSON.parse(fs.readFileSync(fp,'utf8'));}catch(e){addIssue(t,'STOCKS','JSON PARSE ERROR: '+e.message);continue;}
  if(!d.ticker)addIssue(t,'STOCKS','MISSING ticker');else if(!d.ticker.match(/.AX$/i))addIssue(t,'STOCKS','ticker not in .AX format: '+d.ticker);
  if(!d.company)addIssue(t,'STOCKS','MISSING company');
  if(!d.sector)addIssue(t,'STOCKS','MISSING sector');
  if(!d.market_cap)addIssue(t,'STOCKS','MISSING market_cap');else if(typeof d.market_cap==='number')addIssue(t,'STOCKS','market_cap is a number: '+d.market_cap);
  if(!d.current_price&&d.current_price!==0)addIssue(t,'STOCKS','MISSING current_price');else if(typeof d.current_price!=='number')addIssue(t,'STOCKS','current_price is not a number: '+d.current_price);
  if(!d.dominant)addIssue(t,'STOCKS','MISSING dominant');else if(['T1','T2','T3','T4'].indexOf(d.dominant)===-1)addIssue(t,'STOCKS','dominant invalid value: '+d.dominant);
  if(!d.risk_skew)addIssue(t,'STOCKS','MISSING risk_skew');else if(['UPSIDE','DOWNSIDE','NEUTRAL'].indexOf(d.risk_skew)===-1)addIssue(t,'STOCKS','risk_skew invalid value: '+d.risk_skew);
  if(!d.big_picture)addIssue(t,'STOCKS','MISSING big_picture');else if(d.big_picture.length<50)addIssue(t,'STOCKS','big_picture too short ('+d.big_picture.length+' chars)');
  if(!d.hypotheses)addIssue(t,'STOCKS','MISSING hypotheses');
  else if(Array.isArray(d.hypotheses))addIssue(t,'STOCKS','hypotheses is an ARRAY (should be dict with T1-T4 keys)');
  else{
    ['T1','T2','T3','T4'].forEach(function(tier){
      if(!d.hypotheses[tier])addIssue(t,'STOCKS','hypotheses missing key '+tier);
      else{var h=d.hypotheses[tier];
        if(!h.label)addIssue(t,'STOCKS','hypotheses.'+tier+' missing label');
        if(typeof h.survival_score!=='number')addIssue(t,'STOCKS','hypotheses.'+tier+' survival_score not a number');
        if(!h.plain_english)addIssue(t,'STOCKS','hypotheses.'+tier+' missing plain_english');
        else if(h.plain_english.length<50)addIssue(t,'STOCKS','hypotheses.'+tier+'.plain_english too short');
      }
    });
    var scores=['T1','T2','T3','T4'].map(function(tier){return(d.hypotheses[tier]&&d.hypotheses[tier].survival_score)||0;});
    var sum=scores.reduce(function(a,b){return a+b;},0);
    if(sum<0.9||sum>1.15)addIssue(t,'STOCKS','survival_scores sum to '+sum.toFixed(3)+' (expected ~1.0)');
    var maxScore=Math.max.apply(null,scores);
    var maxTier=['T1','T2','T3','T4'][scores.indexOf(maxScore)];
    if(d.dominant&&d.dominant!==maxTier)addIssue(t,'STOCKS','dominant is '+d.dominant+' but highest score is '+maxTier+' ('+maxScore+')');
  }
  if(!d.narrative_weights)addIssue(t,'STOCKS','MISSING narrative_weights');
  if(!d.three_layer_signal)addIssue(t,'STOCKS','MISSING three_layer_signal');
}
var totalIssues=0;var criticalTickers=[];
console.log('=== CONTINUUM INTELLIGENCE AUDIT REPORT ===');
console.log('Date: 2026-02-21');
console.log('');
TICKERS.forEach(function(t){
  var ti=issues[t]||[];var count=ti.length;totalIssues+=count;
  if(count>0){criticalTickers.push(t);
    console.log('TICKER: '+t+' - '+count+' issue(s)');
    ti.forEach(function(iss){console.log('  '+iss);});
    console.log('');
  }
});
console.log('=== SUMMARY ===');
console.log('Total issues: '+totalIssues);
console.log('Clean tickers: '+(TICKERS.length-criticalTickers.length)+'/'+TICKERS.length);
console.log('Tickers with issues: '+criticalTickers.join(', '));