const fs = require('fs');
const TICKERS = ['ASB','BHP','BRG','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','QBE','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
const issues = {};
function add(t, layer, msg) { if (!issues[t]) issues[t]=[]; issues[t].push('['+layer+'] '+msg); }

// --- RESEARCH JSON AUDIT ---
for (const t of TICKERS) {
  const fp = 'data/research/'+t+'.json';
  if (!fs.existsSync(fp)) { add(t,'RESEARCH','FILE MISSING'); continue; }
  let d; try { d=JSON.parse(fs.readFileSync(fp,'utf8')); } catch(e) { add(t,'RESEARCH','PARSE ERROR: '+e.message); continue; }
  for (const f of ['identity','verdict','skew','priceHistory','hypotheses','narrative','evidence','discriminators','tripwires','gaps','technicalAnalysis','heroMetrics','footer'])
    if (!d[f]) add(t,'RESEARCH','MISSING field: '+f);
  if (d.hypotheses) {
    if (!Array.isArray(d.hypotheses)) add(t,'RESEARCH','hypotheses not array');
    else {
      if (d.hypotheses.length!==4) add(t,'RESEARCH','hypotheses count='+d.hypotheses.length+' (need 4)');
      const tiers=d.hypotheses.map(h=>h.tier);
      for (const tier of ['T1','T2','T3','T4']) if (!tiers.includes(tier)) add(t,'RESEARCH','missing tier '+tier);
      for (const h of d.hypotheses) {
        if (typeof h.score!=='number') add(t,'RESEARCH',(h.tier||'?')+' score not number: '+h.score);
        if (!h.title) add(t,'RESEARCH',(h.tier||'?')+' missing title');
        if (!h.description) add(t,'RESEARCH',(h.tier||'?')+' missing description');
      }
    }
  }
  if (d.evidence && d.evidence.cards) {
    if (!Array.isArray(d.evidence.cards)) add(t,'RESEARCH','evidence.cards not array');
    else if (d.evidence.cards.length!==10) add(t,'RESEARCH','evidence.cards='+d.evidence.cards.length+' (need 10)');
  }
  if (d.discriminators && d.discriminators.rows) {
    if (!Array.isArray(d.discriminators.rows)) add(t,'RESEARCH','discriminators.rows not array');
    else if (d.discriminators.rows.length!==4) add(t,'RESEARCH','discriminators.rows='+d.discriminators.rows.length+' (need 4)');
  }
  if (d.tripwires && d.tripwires.cards) {
    if (!Array.isArray(d.tripwires.cards)) add(t,'RESEARCH','tripwires.cards not array');
    else if (d.tripwires.cards.length!==3) add(t,'RESEARCH','tripwires.cards='+d.tripwires.cards.length+' (need 3)');
  }
  if (d.gaps && d.gaps.coverageRows) {
    if (!Array.isArray(d.gaps.coverageRows)) add(t,'RESEARCH','gaps.coverageRows not array');
    else if (d.gaps.coverageRows.length!==10) add(t,'RESEARCH','gaps.coverageRows='+d.gaps.coverageRows.length+' (need 10)');
  }
  if (d.priceHistory && Array.isArray(d.priceHistory) && d.priceHistory.length<10) add(t,'RESEARCH','priceHistory len='+d.priceHistory.length+' (need >=10)');
  if (d.heroMetrics && Array.isArray(d.heroMetrics) && d.heroMetrics.length<3) add(t,'RESEARCH','heroMetrics len='+d.heroMetrics.length+' (need >=3)');
  if (d.narrative && !d.narrative.theNarrative) add(t,'RESEARCH','narrative.theNarrative missing');
  if (d.footer && !d.footer.disclaimer) add(t,'RESEARCH','footer.disclaimer missing');
}

// --- STOCKS JSON AUDIT ---
for (const t of TICKERS) {
  const fp = 'data/stocks/'+t+'.json';
  if (!fs.existsSync(fp)) { add(t,'STOCKS','FILE MISSING'); continue; }
  let d; try { d=JSON.parse(fs.readFileSync(fp,'utf8')); } catch(e) { add(t,'STOCKS','PARSE ERROR: '+e.message); continue; }
  if (!d.ticker) add(t,'STOCKS','MISSING ticker');
  if (!d.company) add(t,'STOCKS','MISSING company');
  if (!d.sector) add(t,'STOCKS','MISSING sector');
  if (!d.market_cap) add(t,'STOCKS','MISSING market_cap');
  else if (typeof d.market_cap==='number') add(t,'STOCKS','market_cap is NUMBER not string: '+d.market_cap);
  if (!d.current_price && d.current_price!==0) add(t,'STOCKS','MISSING current_price');
  if (!d.dominant) add(t,'STOCKS','MISSING dominant');
  if (!d.risk_skew) add(t,'STOCKS','MISSING risk_skew');
  if (!d.big_picture) add(t,'STOCKS','MISSING big_picture');
  else if (d.big_picture.length<50) add(t,'STOCKS','big_picture too short ('+d.big_picture.length+' chars)');
  if (!d.hypotheses) add(t,'STOCKS','MISSING hypotheses');
  else if (Array.isArray(d.hypotheses)) add(t,'STOCKS','hypotheses is ARRAY not dict (T1/T2/T3/T4 keys)');
  else {
    for (const tier of ['T1','T2','T3','T4']) {
      if (!d.hypotheses[tier]) { add(t,'STOCKS','hypotheses missing key '+tier); continue; }
      const h=d.hypotheses[tier];
      if (!h.label) add(t,'STOCKS',tier+' missing label');
      if (typeof h.survival_score!=='number') add(t,'STOCKS',tier+' survival_score not number: '+h.survival_score);
      if (!h.plain_english) add(t,'STOCKS',tier+' missing plain_english');
      else if (h.plain_english.length<50) add(t,'STOCKS',tier+' plain_english too short: "'+h.plain_english.substring(0,60)+'"');
    }
    const scores=['T1','T2','T3','T4'].map(tier=>d.hypotheses[tier]&&typeof d.hypotheses[tier].survival_score==='number'?d.hypotheses[tier].survival_score:0);
    const maxScore=Math.max(...scores);
    const maxTier=['T1','T2','T3','T4'][scores.indexOf(maxScore)];
    if (d.dominant && d.dominant!==maxTier) add(t,'STOCKS','dominant='+d.dominant+' but highest score tier='+maxTier+'('+maxScore+')');
  }
  if (!d.narrative_weights) add(t,'STOCKS','MISSING narrative_weights');
  if (!d.three_layer_signal) add(t,'STOCKS','MISSING three_layer_signal');
}

// --- _index.json AUDIT ---
{
  const idx = JSON.parse(fs.readFileSync('data/research/_index.json','utf8'));
  const idxTickers = Object.keys(idx);
  console.log('_index.json tickers ('+idxTickers.length+'): '+idxTickers.sort().join(', '));
  for (const t of TICKERS) {
    if (!idx[t]) { add(t,'INDEX','NOT IN _index.json'); continue; }
    const e = idx[t];
    if (!e.price && e.price!==0) add(t,'INDEX','price missing/null');
    if (!e.score && e.score!==0) add(t,'INDEX','score missing/null');
    if (!e.skew) add(t,'INDEX','skew missing');
    if (!e.marketCap) add(t,'INDEX','marketCap missing');
    if (!e.lastUpdated) add(t,'INDEX','lastUpdated missing');
    else {
      const d=new Date(e.lastUpdated);
      const cutoff=new Date('2026-02-14');
      if (d<cutoff) add(t,'INDEX','STALE lastUpdated: '+e.lastUpdated);
    }
  }
}

// --- PRINT ---
let total=0, clean=0; const bad=[];
for (const t of TICKERS) {
  const list=issues[t]||[];
  total+=list.length;
  if (list.length===0) clean++;
  else { bad.push(t); console.log('\nTICKER: '+t+' ('+list.length+' issues)'); for (const i of list) console.log('  '+i); }
}
console.log('\n=== SUMMARY ===');
console.log('Total issues: '+total);
console.log('Clean tickers: '+clean+'/'+TICKERS.length);
console.log('Tickers with issues: '+bad.join(', '));
