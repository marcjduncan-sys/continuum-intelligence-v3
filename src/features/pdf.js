/**
 * pdf.js -- PDF Report Generation (Institutional + Investor Briefing)
 *
 * Goldman Sachs-standard layout. Dense, print-optimised, institutional-grade.
 *
 * Two formats:
 *   - Institutional: Comprehensive, all sections, multi-page, running headers,
 *     sidebar key data on page 1, two-column evidence grids.
 *   - Investor Briefing: Exactly 2 A4 pages. Dense summary of all key sections.
 *
 * Both read from STOCK_DATA[ticker] directly (no DOM scraping).
 * Uses browser print-to-PDF (window.open + window.print).
 *
 * Depends on:
 *   - STOCK_DATA from ../lib/state.js
 *   - normaliseScores from ../lib/dom.js
 */

import { STOCK_DATA } from '../lib/state.js';
import { normaliseScores } from '../lib/dom.js';

// ============================================================
// SHARED UTILITIES
// ============================================================

function esc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function strip(str) {
  if (!str) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || '';
}

function trunc(str, maxLen) {
  if (!str) return '';
  var s = strip(str);
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '\u2026' : s;
}

function normHypScores(hyps) {
  if (!hyps || !hyps.length) return [];
  var items = hyps.map(function(h) {
    var raw = String(h.score || h.scoreWidth || '0').replace('%', '');
    return { score: parseFloat(raw) || 0 };
  });
  return normaliseScores(items);
}

function sparkSVG(prices, w, h) {
  if (!prices || prices.length < 2) return '';
  w = w || 680; h = h || 56;
  var pad = 2;
  var min = prices[0], max = prices[0];
  for (var i = 1; i < prices.length; i++) {
    if (prices[i] < min) min = prices[i];
    if (prices[i] > max) max = prices[i];
  }
  var range = max - min || 1;
  var stepX = (w - pad * 2) / (prices.length - 1);
  var pts = '', fill = pad + ',' + (h - pad);
  for (var j = 0; j < prices.length; j++) {
    var x = pad + j * stepX;
    var y = h - pad - ((prices[j] - min) / range) * (h - pad * 2);
    pts += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    fill += ' ' + x.toFixed(1) + ',' + y.toFixed(1);
  }
  fill += ' ' + (pad + (prices.length - 1) * stepX).toFixed(1) + ',' + (h - pad);
  var last = prices[prices.length - 1], first = prices[0];
  var color = last > first * 1.02 ? '#0B6623' : last < first * 0.98 ? '#B22234' : '#996515';
  var gid = 'sg' + Math.floor(Math.random() * 99999);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" preserveAspectRatio="none" style="display:block">' +
    '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.18"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.01"/>' +
    '</linearGradient></defs>' +
    '<polygon points="' + esc(fill) + '" fill="url(#' + gid + ')"/>' +
    '<polyline points="' + esc(pts) + '" fill="none" stroke="' + color + '" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>' +
  '</svg>';
}

function dirIcon(dir) {
  return dir === 'upside' ? '&#9650;' : dir === 'downside' ? '&#9660;' : '&#9670;';
}
function dirColor(dir) {
  return dir === 'upside' ? '#0B6623' : dir === 'downside' ? '#B22234' : '#996515';
}

function timestamp() {
  return new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ============================================================
// ENTRY POINT
// ============================================================

export function generatePDFReport(ticker, type) {
  var btn = (typeof event !== 'undefined' && event) ? event.currentTarget : null;
  if (btn) btn.classList.add('generating');

  var stock = null;
  if (typeof STOCK_DATA !== 'undefined' && STOCK_DATA[ticker]) {
    stock = STOCK_DATA[ticker];
  }

  if (!stock || stock._indexOnly) {
    alert('Full research data not yet loaded for ' + ticker + '. Please wait for the report to finish loading, then try again.');
    if (btn) btn.classList.remove('generating');
    return;
  }

  var html = '';
  if (type === 'institutional') {
    console.log('[PDF] Institutional report for', ticker);
    html = buildInstitutional(stock);
  } else {
    console.log('[PDF] Investor Briefing for', ticker);
    html = buildBriefing(stock);
  }

  var win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site.');
    if (btn) btn.classList.remove('generating');
    return;
  }
  win.document.write(html);
  win.document.close();
  if (btn) btn.classList.remove('generating');
  setTimeout(function() { win.print(); }, 900);
}


// ============================================================
// SHARED CSS FOUNDATION
// ============================================================

function baseCSS() {
  return [
'*{margin:0;padding:0;box-sizing:border-box;}',
'body{',
'  font-family:"Inter","Helvetica Neue",Arial,sans-serif;',
'  color:#1B2A3D;font-size:7.8pt;line-height:1.42;',
'  background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;',
'}',

'/* -- Colour tokens -- */',
':root{',
'  --navy:#003A70;--navy-dk:#00274D;--navy-lt:#EBF0F7;',
'  --rule:#C8D1DC;--rule-lt:#E4E9F0;',
'  --tx:#1B2A3D;--tx2:#5A6B7F;--tx3:#8A96A6;',
'  --grn:#0B6623;--grn-bg:#E6F2EB;',
'  --red:#B22234;--red-bg:#FCEDEF;',
'  --amb:#996515;--amb-bg:#FEF6E6;',
'  --alt:#F5F7FA;',
'}',

'/* -- Running header -- */',
'.rh{display:flex;justify-content:space-between;align-items:baseline;padding:0 0 4px;margin:0 0 8px;border-bottom:2px solid var(--navy);font-size:6pt;color:var(--tx2);letter-spacing:.5px;}',
'.rh-brand{font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:1.5px;}',
'.rh-right{text-align:right;}',
'.rh-ticker{font-weight:700;color:var(--navy);}',

'/* -- Section headers -- */',
'.sh{display:flex;align-items:baseline;gap:6px;margin:10px 0 5px;padding:0 0 3px;border-bottom:1.5px solid var(--navy);page-break-after:avoid;}',
'.sh-num{font-size:5.5pt;font-weight:700;color:var(--tx3);letter-spacing:1px;}',
'.sh-title{font-size:9pt;font-weight:800;color:var(--navy);letter-spacing:.15px;}',
'.sh2{font-size:7.2pt;font-weight:700;color:var(--navy-dk);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 2px;}',

'/* -- Body text -- */',
'.bt{font-size:7.5pt;color:var(--tx);line-height:1.46;margin:2px 0 5px;}',
'.bt-em{font-style:italic;color:var(--tx2);}',
'.bt strong{font-weight:700;color:var(--navy-dk);}',

'/* -- Label -- */',
'.lbl{font-size:5.5pt;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--tx3);}',

'/* -- Tables -- */',
'table.dt{width:100%;border-collapse:collapse;font-size:7pt;margin:2px 0 6px;}',
'.dt th{background:var(--navy-lt);color:var(--navy-dk);text-align:left;padding:2.5px 5px;border-bottom:1px solid var(--rule);font-size:5.8pt;font-weight:700;text-transform:uppercase;letter-spacing:.3px;}',
'.dt td{padding:2.5px 5px;border-bottom:1px solid var(--rule-lt);vertical-align:top;line-height:1.32;}',
'.dt tbody tr:nth-child(even){background:var(--alt);}',
'.dt-lbl{font-weight:600;color:var(--tx2);white-space:nowrap;width:105px;}',
'.dt-val{color:var(--tx);}',

'/* -- Badges -- */',
'.badge{display:inline-block;font-size:6.5pt;font-weight:800;padding:1.5px 6px;border-radius:2px;letter-spacing:.3px;}',
'.badge-up{background:var(--grn-bg);color:var(--grn);}',
'.badge-dn{background:var(--red-bg);color:var(--red);}',
'.badge-bal{background:var(--amb-bg);color:var(--amb);}',
'.diag{font-size:6pt;font-weight:700;padding:1px 4px;border-radius:2px;background:var(--alt);color:var(--tx2);}',
'.diag-high{background:var(--amb-bg);color:var(--amb);}',
'.diag-crit{background:var(--red-bg);color:var(--red);}',

'/* -- Evidence lists -- */',
'ul.el{font-size:7pt;color:var(--tx2);margin:1px 0 4px 12px;line-height:1.38;}',
'ul.el li{margin-bottom:1.5px;}',
'ul.el-s li::marker{color:var(--grn);}',
'ul.el-c li::marker{color:var(--red);}',

'/* -- Callout -- */',
'.callout{background:var(--alt);border-left:3px solid var(--navy);padding:4px 8px;font-size:7pt;color:var(--tx2);line-height:1.38;margin:3px 0 6px;}',

'/* -- Grids -- */',
'.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:2px 0 6px;}',
'.grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin:2px 0 6px;}',

'/* -- Sparkline -- */',
'.spark{margin:4px 0 8px;padding:4px 0;border-top:1px solid var(--rule-lt);border-bottom:1px solid var(--rule-lt);}',
'.spark-meta{display:flex;justify-content:space-between;align-items:baseline;font-size:6pt;color:var(--tx3);margin-bottom:2px;}',
'.spark-chg{font-weight:700;}',
'.chg-pos{color:var(--grn);}.chg-neg{color:var(--red);}',

'/* -- Source -- */',
'.ev-src{font-size:5.5pt;color:var(--tx3);margin-top:1px;}',

'/* -- Disclaimer -- */',
'.disc{margin-top:10px;padding:6px 8px;background:var(--alt);border-top:1px solid var(--rule);font-size:6.2pt;color:var(--tx3);line-height:1.45;page-break-inside:avoid;}',
'.disc-title{font-size:6.5pt;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;}',
'.disc p{margin:0 0 2px;}',

'/* -- Print base -- */',
'@media print{',
'  body{margin:0;padding:0;}',
'  @page{size:A4 portrait;margin:8mm 10mm 10mm 10mm;}',
'  .no-break{page-break-inside:avoid;}',
'  .sh{page-break-after:avoid;}',
'  .page-break{page-break-before:always;}',
'}'
  ].join('\n');
}


// ============================================================
// INSTITUTIONAL REPORT
// ============================================================

function buildInstitutional(stock) {
  var ts = timestamp();
  var hyps = stock.hypotheses || [];
  var normScores = normHypScores(hyps);

  function rh(extra) {
    return '<div class="rh">' +
      '<span class="rh-brand">Continuum Intelligence</span>' +
      '<span class="rh-right"><span class="rh-ticker">' + esc(stock.ticker) + '.AX</span>' +
        ' &nbsp;|&nbsp; ' + esc(stock.company) +
        ' &nbsp;|&nbsp; ' + esc(ts) + ' AEST' +
        (extra ? ' &nbsp;|&nbsp; ' + extra : '') +
      '</span></div>';
  }

  function sh(num, title) {
    return '<div class="sh"><span class="sh-num">' + num + '</span><span class="sh-title">' + esc(title) + '</span></div>';
  }
  function sh2(label) { return '<div class="sh2">' + esc(label) + '</div>'; }
  function bt(text) { return text ? '<p class="bt">' + esc(strip(text)) + '</p>' : ''; }
  function btHtml(text) { return text ? '<p class="bt">' + strip(text) + '</p>' : ''; }

  // ── Skew
  var skewDir = (stock.hero && stock.hero.skew) || (stock.skew && stock.skew.direction ? String(stock.skew.direction).toUpperCase() : '');
  var skewRat = (stock.hero && stock.hero.skew_description) || (stock.skew && stock.skew.rationale) || '';
  var skewCls = skewDir === 'UPSIDE' ? 'badge-up' : skewDir === 'DOWNSIDE' ? 'badge-dn' : 'badge-bal';
  var embThesis = (stock.hero && stock.hero.embedded_thesis) || '';

  // ── COVER
  var coverHTML =
    '<div class="cover">' +
      '<div class="cover-brand">CONTINUUM INTELLIGENCE &ndash; INDEPENDENT EQUITY RESEARCH</div>' +
      '<div class="cover-rule"></div>' +
      '<div class="cover-grid">' +
        '<div class="cover-main">' +
          '<div class="cover-co">' + esc(stock.company) + '</div>' +
          '<div class="cover-sub">' +
            esc(stock.tickerFull || stock.ticker + '.AX') +
            ' &nbsp;&bull;&nbsp; ' + esc(stock.sector || '') +
            (stock.sectorSub ? ' &bull; ' + esc(stock.sectorSub) : '') +
          '</div>' +
          (stock.heroDescription ? '<div class="cover-tag">' + esc(strip(stock.heroDescription)) + '</div>' : '') +
          (skewDir ? '<div style="margin:6px 0"><span class="badge ' + skewCls + '">RISK SKEW: ' + esc(skewDir) + '</span></div>' : '') +
          (skewRat ? '<p class="bt-em" style="margin:2px 0 6px;font-size:7pt">' + esc(strip(skewRat)) + '</p>' : '') +
          (embThesis ? '<div class="callout" style="margin-top:4px"><span class="lbl" style="display:block;margin-bottom:2px">WHAT THE PRICE EMBEDS</span>' + esc(strip(embThesis)) + '</div>' : '') +
        '</div>' +
        '<div class="sidebar">' + buildSidebar(stock, ts) + '</div>' +
      '</div>' +
    '</div>';

  // ── SPARKLINE
  var sparkHTML = buildSparkSection(stock);

  // ── 01: IDENTITY
  var s01 = sh('01', 'Identity & Snapshot');
  if (stock.identity) {
    if (stock.identity.overview) s01 += bt(stock.identity.overview);
    if (stock.identity.rows && stock.identity.rows.length) {
      s01 += '<table class="dt"><tbody>';
      for (var ir = 0; ir < stock.identity.rows.length; ir++) {
        var row = stock.identity.rows[ir];
        s01 += '<tr>';
        for (var ic = 0; ic < row.length; ic++) {
          s01 += '<td class="dt-lbl">' + esc(row[ic][0]) + '</td><td class="dt-val">' + esc(strip(String(row[ic][1] || ''))) + '</td>';
        }
        s01 += '</tr>';
      }
      s01 += '</tbody></table>';
    }
  }

  // ── 02: HYPOTHESES
  var s02 = sh('02', 'Competing Hypotheses');
  for (var hi = 0; hi < hyps.length; hi++) {
    var h = hyps[hi];
    var hDir = h.direction || '';
    var hScore = normScores[hi] ? normScores[hi] + '%' : esc(h.score || '');
    var hCol = dirColor(hDir);
    s02 += '<div class="hyp no-break">' +
      '<div class="hyp-hdr">' +
        '<span class="hyp-title">' + esc(strip(h.title || '')) + '</span>' +
        '<span class="hyp-score" style="color:' + hCol + '">' + hScore + '</span>' +
        '<span class="hyp-dir" style="color:' + hCol + '">' + dirIcon(hDir) + ' ' + esc(h.statusText || h.direction || '') + '</span>' +
      '</div>' +
      '<div class="hyp-track"><div class="hyp-fill" style="width:' + (normScores[hi] || 0) + '%;background:' + hCol + '"></div></div>' +
      bt(h.description);
    if (h.requires && h.requires.length) {
      s02 += sh2('Requires') + '<ul class="el">';
      for (var ri = 0; ri < h.requires.length; ri++) s02 += '<li>' + esc(strip(h.requires[ri])) + '</li>';
      s02 += '</ul>';
    }
    if (h.supporting && h.supporting.length) {
      s02 += sh2(h.supportingLabel || 'Supporting Evidence') + '<ul class="el el-s">';
      for (var si = 0; si < h.supporting.length; si++) s02 += '<li>' + strip(h.supporting[si]) + '</li>';
      s02 += '</ul>';
    }
    if (h.contradicting && h.contradicting.length) {
      s02 += sh2(h.contradictingLabel || 'Contradicting Evidence') + '<ul class="el el-c">';
      for (var ci = 0; ci < h.contradicting.length; ci++) s02 += '<li>' + strip(h.contradicting[ci]) + '</li>';
      s02 += '</ul>';
    }
    s02 += '</div>';
  }

  // ── 03: NARRATIVE
  var s03 = sh('03', 'Dominant Narrative');
  if (stock.narrative) {
    var n = stock.narrative;
    var pairs = [['The Narrative', n.theNarrative], ['Price Implication', n.priceImplication], ['Evidence Check', n.evidenceCheck], ['Narrative Stability', n.narrativeStability]];
    for (var ni = 0; ni < pairs.length; ni++) {
      if (pairs[ni][1]) s03 += sh2(pairs[ni][0]) + btHtml(pairs[ni][1]);
    }
  }

  // ── 04: EVIDENCE
  var s04 = sh('04', 'Cross-Domain Evidence Synthesis');
  if (stock.evidence) {
    if (stock.evidence.intro) s04 += '<p class="bt bt-em">' + esc(strip(stock.evidence.intro)) + '</p>';
    var evCards = stock.evidence.cards || [];
    if (evCards.length) {
      s04 += '<div class="grid2">';
      for (var eci = 0; eci < evCards.length; eci++) {
        var ec = evCards[eci];
        s04 += '<div class="ev-item no-break">' +
          '<div class="ev-hdr"><span class="ev-title">' + esc(strip(ec.title || '')) + '</span>' +
            (ec.epistemicLabel ? '<span class="ev-ep">' + esc(ec.epistemicLabel) + '</span>' : '') +
          '</div>' +
          (ec.finding ? '<div class="ev-finding">' + strip(ec.finding) + '</div>' : '') +
          (ec.tension ? '<div class="ev-tension">' + esc(strip(ec.tension)) + '</div>' : '') +
          (ec.source ? '<div class="ev-src">' + esc(ec.source) + '</div>' : '') +
        '</div>';
      }
      s04 += '</div>';
    }
    if (stock.evidence.alignmentSummary) s04 += sh2('Evidence Alignment Summary') + bt(stock.evidence.alignmentSummary);
  }

  // ── 05: DISCRIMINATORS
  var s05 = sh('05', 'What Discriminates');
  if (stock.discriminators) {
    if (stock.discriminators.intro) s05 += '<p class="bt bt-em">' + esc(strip(stock.discriminators.intro)) + '</p>';
    var dRows = stock.discriminators.rows || [];
    if (dRows.length) {
      s05 += '<table class="dt"><thead><tr><th style="width:70px">Diagnosticity</th><th>Evidence</th><th style="width:160px">Discriminates Between</th><th style="width:110px">Current Reading</th></tr></thead><tbody>';
      for (var di = 0; di < dRows.length; di++) {
        var dr = dRows[di];
        var dCls = String(dr.diagnosticity || '').toLowerCase() === 'high' ? 'diag-high' : String(dr.diagnosticity || '').toLowerCase() === 'critical' ? 'diag-crit' : '';
        s05 += '<tr class="no-break"><td><span class="diag ' + dCls + '">' + esc(dr.diagnosticity || '') + '</span></td>' +
          '<td>' + strip(dr.evidence || '') + '</td>' +
          '<td>' + esc(strip(dr.discriminatesBetween || '')) + '</td>' +
          '<td>' + esc(dr.currentReading || '') + '</td></tr>';
      }
      s05 += '</tbody></table>';
    }
    if (stock.discriminators.nonDiscriminating) s05 += '<div class="callout">' + esc(strip(stock.discriminators.nonDiscriminating)) + '</div>';
  }

  // ── 06: TRIPWIRES
  var s06 = sh('06', "What We're Watching");
  if (stock.tripwires) {
    if (stock.tripwires.intro) s06 += '<p class="bt bt-em">' + esc(strip(stock.tripwires.intro)) + '</p>';
    var tCards = stock.tripwires.cards || [];
    for (var tci = 0; tci < tCards.length; tci++) {
      var tc = tCards[tci];
      s06 += '<div class="tw no-break">' +
        '<div class="tw-hdr">' + (tc.date ? '<span class="tw-date">' + esc(tc.date) + '</span>' : '') +
          '<span class="tw-name">' + esc(strip(tc.name || '')) + '</span></div>';
      var conds = tc.conditions || [];
      for (var cci = 0; cci < conds.length; cci++) {
        var c = conds[cci];
        s06 += '<div class="tw-cond"><span class="tw-if ' + (String(c.valence) === 'positive' ? 'tw-pos' : 'tw-neg') + '">' + esc(c.if || '') + '</span>' +
          ' <span class="tw-arr">&rarr;</span> <span class="tw-then">' + esc(c.then || '') + '</span></div>';
      }
      if (tc.source) s06 += '<div class="ev-src">' + esc(tc.source) + '</div>';
      s06 += '</div>';
    }
  }

  // ── 07: GAPS
  var s07 = '';
  if (stock.gaps) {
    s07 = sh('07', 'Evidence Gaps & Analytical Limitations');
    var gaps = stock.gaps;
    if (gaps.coverageRows && gaps.coverageRows.length) {
      s07 += sh2('Evidence Coverage');
      s07 += '<table class="dt"><thead><tr><th>Domain</th><th>Coverage</th><th>Freshness</th><th>Confidence</th></tr></thead><tbody>';
      for (var gri = 0; gri < gaps.coverageRows.length; gri++) {
        var gr = gaps.coverageRows[gri];
        var gcCls = gr.coverageLevel === 'full' ? '' : gr.coverageLevel === 'good' ? ' diag-high' : ' diag-crit';
        s07 += '<tr><td>' + esc(gr.domain) + '</td><td><span class="diag' + gcCls + '">' + esc(gr.coverageLabel) + '</span></td>' +
          '<td>' + esc(gr.freshness) + '</td><td>' + esc(gr.confidence) + '</td></tr>';
      }
      s07 += '</tbody></table>';
    }
    var gapSections = [['couldntAssess', "Couldn't Assess"], ['analyticalLimitations', 'Analytical Limitations']];
    for (var gsi = 0; gsi < gapSections.length; gsi++) {
      var gv = gaps[gapSections[gsi][0]];
      if (!gv) continue;
      if (typeof gv === 'string') { s07 += sh2(gapSections[gsi][1]) + bt(gv); }
      else if (Array.isArray(gv)) {
        s07 += sh2(gapSections[gsi][1]) + '<ul class="el">';
        for (var gli = 0; gli < gv.length; gli++) s07 += '<li>' + esc(strip(String(gv[gli]))) + '</li>';
        s07 += '</ul>';
      }
    }
  }

  // ── 08: TECHNICAL
  var s08 = sh('08', 'Technical Analysis');
  if (stock.technicalAnalysis) {
    var ta = stock.technicalAnalysis;
    s08 += '<div class="ta-row">';
    if (ta.regime) s08 += '<span class="badge" style="background:var(--navy-lt);color:var(--navy)">' + esc(ta.regime) + (ta.clarity ? ' / ' + esc(ta.clarity) : '') + '</span>';
    if (ta.trend) s08 += '<span class="ta-meta">Trend: ' + esc(ta.trend.direction || '') + (ta.trend.duration ? ', ' + esc(ta.trend.duration) : '') + '</span>';
    if (ta.price) s08 += '<span class="ta-meta">Price: ' + esc(ta.price.currency || '') + esc(String(ta.price.current || '')) + '</span>';
    s08 += '</div>';

    var leftCol = '', rightCol = '';
    if (ta.movingAverages) {
      leftCol += sh2('Moving Averages') + '<table class="dt"><tbody>';
      if (ta.movingAverages.ma50) leftCol += '<tr><td class="dt-lbl">50-day MA</td><td class="dt-val">' + esc(String(ta.movingAverages.ma50.value || '')) + (ta.movingAverages.priceVsMa50 ? ' (+' + esc(String(ta.movingAverages.priceVsMa50)) + '%)' : '') + '</td></tr>';
      if (ta.movingAverages.ma200) leftCol += '<tr><td class="dt-lbl">200-day MA</td><td class="dt-val">' + esc(String(ta.movingAverages.ma200.value || '')) + (ta.movingAverages.priceVsMa200 ? ' (+' + esc(String(ta.movingAverages.priceVsMa200)) + '%)' : '') + '</td></tr>';
      if (ta.movingAverages.crossover && ta.movingAverages.crossover.description) leftCol += '<tr><td class="dt-lbl">' + esc(ta.movingAverages.crossover.type || 'Crossover') + '</td><td class="dt-val">' + esc(ta.movingAverages.crossover.description) + '</td></tr>';
      leftCol += '</tbody></table>';
    }
    if (ta.keyLevels) {
      rightCol += sh2('Key Price Levels') + '<table class="dt"><tbody>';
      var klKeys = Object.keys(ta.keyLevels);
      for (var ki = 0; ki < klKeys.length; ki++) {
        var kv = ta.keyLevels[klKeys[ki]];
        if (kv && typeof kv === 'object') rightCol += '<tr><td class="dt-lbl">' + esc(klKeys[ki]) + '</td><td class="dt-val">' + esc(String(kv.value || kv.price || '')) + (kv.description ? ' &ndash; ' + esc(kv.description) : '') + '</td></tr>';
        else if (kv) rightCol += '<tr><td class="dt-lbl">' + esc(klKeys[ki]) + '</td><td class="dt-val">' + esc(String(kv)) + '</td></tr>';
      }
      rightCol += '</tbody></table>';
    }
    if (leftCol || rightCol) s08 += '<div class="grid2"><div>' + leftCol + '</div><div>' + rightCol + '</div></div>';
    if (ta.trend && ta.trend.structure) s08 += sh2('Trend Structure') + bt(ta.trend.structure);
    if (ta.volatility && typeof ta.volatility === 'object') {
      s08 += sh2('Volatility') + '<table class="dt"><tbody>';
      var vKeys = Object.keys(ta.volatility);
      for (var vi = 0; vi < vKeys.length; vi++) {
        var vv = ta.volatility[vKeys[vi]];
        if (vv && typeof vv !== 'object') s08 += '<tr><td class="dt-lbl">' + esc(vKeys[vi]) + '</td><td class="dt-val">' + esc(String(vv)) + '</td></tr>';
        else if (vv && vv.value) s08 += '<tr><td class="dt-lbl">' + esc(vKeys[vi]) + '</td><td class="dt-val">' + esc(String(vv.value)) + (vv.description ? ' &ndash; ' + esc(vv.description) : '') + '</td></tr>';
      }
      s08 += '</tbody></table>';
    }
    if (ta.inflectionPoints && ta.inflectionPoints.length) {
      s08 += sh2('Inflection Points') + '<table class="dt"><thead><tr><th>Date</th><th>Type</th><th>Price</th><th>Description</th></tr></thead><tbody>';
      for (var ipi = 0; ipi < ta.inflectionPoints.length; ipi++) {
        var ip = ta.inflectionPoints[ipi];
        s08 += '<tr><td>' + esc(ip.date || '') + '</td><td>' + esc(ip.type || '') + '</td><td>' + esc(String(ip.price || '')) + '</td><td>' + esc(ip.description || '') + '</td></tr>';
      }
      s08 += '</tbody></table>';
    }
    if (ta.relativePerformance && typeof ta.relativePerformance === 'object') {
      s08 += sh2('Relative Performance') + '<table class="dt"><tbody>';
      var rpKeys = Object.keys(ta.relativePerformance);
      for (var rpi = 0; rpi < rpKeys.length; rpi++) {
        var rpv = ta.relativePerformance[rpKeys[rpi]];
        if (rpv !== null && rpv !== undefined && typeof rpv !== 'object') s08 += '<tr><td class="dt-lbl">' + esc(rpKeys[rpi]) + '</td><td class="dt-val">' + esc(String(rpv)) + '</td></tr>';
      }
      s08 += '</tbody></table>';
    }
    if (ta.meanReversion && typeof ta.meanReversion === 'object') {
      s08 += sh2('Mean Reversion') + '<table class="dt"><tbody>';
      var mrKeys = Object.keys(ta.meanReversion);
      for (var mri = 0; mri < mrKeys.length; mri++) {
        var mrv = ta.meanReversion[mrKeys[mri]];
        if (mrv !== null && mrv !== undefined) {
          var mrvStr = typeof mrv === 'object' ? (mrv.value !== undefined ? String(mrv.value) + (mrv.description ? ' &ndash; ' + mrv.description : '') : JSON.stringify(mrv)) : String(mrv);
          s08 += '<tr><td class="dt-lbl">' + esc(mrKeys[mri]) + '</td><td class="dt-val">' + esc(mrvStr) + '</td></tr>';
        }
      }
      s08 += '</tbody></table>';
    }
  }

  // ── 09: VERDICT
  var s09 = '';
  if (stock.verdict && stock.verdict.text) {
    s09 = sh('09', 'Verdict') + '<div class="callout" style="border-left-color:' + dirColor(skewDir.toLowerCase()) + '">' + strip(stock.verdict.text) + '</div>';
  }

  // ── 10: PRICE DRIVERS
  var s10 = '';
  if (stock.priceDrivers && stock.priceDrivers.report) {
    var pd = stock.priceDrivers.report;
    s10 = sh(stock.verdict ? '10' : '09', 'Price Drivers');
    if (pd.title) s10 += '<div class="sh2" style="font-size:7.5pt;color:var(--navy-dk);margin-bottom:3px">' + esc(pd.title) + '</div>';
    if (pd.executive_summary) s10 += bt(pd.executive_summary);
  }

  // ── DISCLAIMER
  var discHTML =
    '<div class="disc">' +
      '<div class="disc-title">Methodology & Disclaimer</div>' +
      '<p>This report employs Analysis of Competing Hypotheses (ACH), a structured analytical technique that systematically evaluates evidence against multiple competing explanations, weighting by diagnosticity rather than volume. Not personal financial advice. For institutional and wholesale investor use only.</p>' +
      '<p>Generated: ' + esc(ts) + ' AEST &bull; ' + esc(stock.ticker) + ' &bull; Continuum Intelligence &bull; continuumintelligence.ai</p>' +
    '</div>';

  // ── INSTITUTIONAL CSS
  var css = [
'.cover{margin:0 0 6px;padding:0 0 6px;}',
'.cover-brand{font-size:6pt;font-weight:700;letter-spacing:2px;color:var(--navy);text-transform:uppercase;margin-bottom:3px;}',
'.cover-rule{height:2px;background:var(--navy);margin:2px 0 8px;}',
'.cover-grid{display:grid;grid-template-columns:1fr 170px;gap:14px;align-items:start;}',
'.cover-co{font-size:18pt;font-weight:800;color:var(--navy-dk);line-height:1.08;margin-bottom:2px;font-family:"Source Serif 4",Georgia,serif;}',
'.cover-sub{font-size:7pt;color:var(--tx2);margin-bottom:4px;}',
'.cover-tag{font-size:7.5pt;color:var(--tx);line-height:1.4;margin-bottom:4px;}',

'.sidebar{background:var(--navy-lt);padding:8px;border-top:3px solid var(--navy);font-size:6.8pt;}',
'.sb-row{display:flex;justify-content:space-between;padding:2.5px 0;border-bottom:1px solid var(--rule-lt);}',
'.sb-row:last-child{border-bottom:none;}',
'.sb-lbl{color:var(--tx3);font-weight:600;text-transform:uppercase;font-size:5.5pt;letter-spacing:.4px;}',
'.sb-val{font-weight:700;color:var(--navy-dk);text-align:right;}',

'.hyp{margin-bottom:6px;padding:5px 0 5px 8px;border-left:3px solid var(--rule);}',
'.hyp-hdr{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:2px;}',
'.hyp-title{font-size:8.2pt;font-weight:800;color:var(--navy-dk);flex:1;}',
'.hyp-score{font-size:8.5pt;font-weight:800;}',
'.hyp-dir{font-size:6.5pt;font-weight:600;}',
'.hyp-track{height:5px;background:var(--rule-lt);border-radius:1px;margin:2px 0 4px;}',
'.hyp-fill{height:100%;border-radius:1px;}',

'.ev-item{padding:4px 6px;border-left:2px solid var(--rule);margin-bottom:2px;}',
'.ev-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;}',
'.ev-title{font-size:7pt;font-weight:700;color:var(--navy-dk);}',
'.ev-ep{font-size:5.5pt;color:var(--tx3);background:var(--alt);padding:1px 4px;border-radius:1px;}',
'.ev-finding{font-size:6.8pt;color:var(--tx);line-height:1.38;margin-bottom:2px;}',
'.ev-tension{font-size:6.5pt;color:var(--tx2);font-style:italic;line-height:1.35;}',

'.tw{margin-bottom:5px;padding:3px 0 3px 7px;border-left:3px solid var(--rule-lt);}',
'.tw-hdr{display:flex;gap:6px;align-items:baseline;margin-bottom:2px;}',
'.tw-date{font-size:6pt;color:var(--tx3);font-weight:600;}',
'.tw-name{font-size:7.2pt;font-weight:700;color:var(--navy-dk);}',
'.tw-cond{font-size:6.5pt;line-height:1.35;margin:1px 0;}',
'.tw-if{font-weight:600;}',
'.tw-pos{color:var(--grn);}',
'.tw-neg{color:var(--red);}',
'.tw-arr{color:var(--tx3);}',
'.tw-then{color:var(--tx2);}',

'.ta-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:3px 0 6px;}',
'.ta-meta{font-size:7pt;color:var(--tx2);}',

'@media print{',
'  .cover-grid{grid-template-columns:1fr 170px;}',
'  .sidebar{-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
'  .grid2{grid-template-columns:1fr 1fr;}',
'}'
  ].join('\n');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>' + esc(stock.ticker) + ' Institutional Research | Continuum Intelligence</title>' +
    '<style>' + baseCSS() + '\n' + css + '</style></head><body style="padding:8px 10px">' +
    rh('INSTITUTIONAL RESEARCH') +
    coverHTML + sparkHTML + s01 + s02 + s03 + s04 + s05 + s06 + s07 + s08 + s09 + s10 + discHTML +
    '</body></html>';
}

// Sidebar builder
function buildSidebar(stock, ts) {
  var rows = [['Price', (stock.currency || 'A$') + String(stock.price || stock.current_price || '')]];
  if (stock.heroMetrics) {
    for (var i = 0; i < stock.heroMetrics.length; i++) rows.push([stock.heroMetrics[i].label, strip(stock.heroMetrics[i].value)]);
  }
  rows.push(['Sector', stock.sector || '']);
  if (stock.sectorSub) rows.push(['Sub-sector', stock.sectorSub]);
  rows.push(['Exchange', stock.exchange || 'ASX']);
  rows.push(['Report Date', stock.date || ts]);
  var html = '';
  for (var r = 0; r < rows.length; r++) {
    html += '<div class="sb-row"><span class="sb-lbl">' + esc(rows[r][0]) + '</span><span class="sb-val">' + esc(rows[r][1]) + '</span></div>';
  }
  return html;
}

// Sparkline section builder
function buildSparkSection(stock) {
  if (!stock.priceHistory || stock.priceHistory.length <= 10) return '';
  var p = stock.priceHistory;
  var sMin = p[0], sMax = p[0];
  for (var i = 1; i < p.length; i++) { if (p[i] < sMin) sMin = p[i]; if (p[i] > sMax) sMax = p[i]; }
  var sLast = p[p.length - 1], sFirst = p[0];
  var sChg = ((sLast / sFirst - 1) * 100).toFixed(1);
  return '<div class="spark">' +
    '<div class="spark-meta">' +
      '<span class="lbl">1-YEAR PRICE HISTORY (' + esc(stock.currency || 'A$') + ')</span>' +
      '<span>Low: ' + esc(stock.currency || 'A$') + sMin.toFixed(2) + ' &nbsp;&bull;&nbsp; High: ' + esc(stock.currency || 'A$') + sMax.toFixed(2) + '</span>' +
      '<span class="spark-chg ' + (sLast >= sFirst ? 'chg-pos' : 'chg-neg') + '">' + (sLast >= sFirst ? '+' : '') + sChg + '% (1Y)</span>' +
    '</div>' + sparkSVG(p, 680, 52) + '</div>';
}


// ============================================================
// INVESTOR BRIEFING
// ============================================================

function buildBriefing(stock) {
  var ts = timestamp();
  var hyps = stock.hypotheses || [];
  var normScores = normHypScores(hyps);

  // ── PAGE 1 HEADER
  var p1Hdr =
    '<div class="ib-hdr">' +
      '<div class="ib-hdr-left">' +
        '<div class="ib-co">' + esc(stock.company) + '</div>' +
        '<div class="ib-sub">' +
          esc(stock.tickerFull || stock.ticker + '.AX') +
          ' &nbsp;&bull;&nbsp; ' + esc(stock.currency || 'A$') + esc(String(stock.price || '')) +
          ' &nbsp;&bull;&nbsp; ' + esc(stock.date || ts) +
          (stock.sector ? ' &nbsp;&bull;&nbsp; ' + esc(stock.sector) : '') +
        '</div>' +
        (stock.heroDescription ? '<div class="ib-tag">' + esc(strip(stock.heroDescription)) + '</div>' : '') +
      '</div>' +
      '<div class="ib-hdr-right"><div class="ib-type">INVESTOR<br>BRIEFING</div></div>' +
    '</div>';

  // Metrics
  var metricsHTML = '';
  if (stock.heroMetrics && stock.heroMetrics.length) {
    metricsHTML = '<div class="ib-metrics">';
    for (var mi = 0; mi < stock.heroMetrics.length; mi++) {
      var m = stock.heroMetrics[mi];
      metricsHTML += '<div class="ib-m"><div class="ib-m-lbl">' + esc(m.label) + '</div><div class="ib-m-val">' + strip(m.value) + '</div></div>';
    }
    metricsHTML += '</div>';
  }

  // Skew
  var skewDir = (stock.hero && stock.hero.skew) || (stock.skew && stock.skew.direction ? String(stock.skew.direction).toUpperCase() : '');
  var skewDesc = (stock.hero && stock.hero.skew_description) || (stock.skew && stock.skew.rationale) || '';
  var skewCls = skewDir === 'UPSIDE' ? 'badge-up' : skewDir === 'DOWNSIDE' ? 'badge-dn' : 'badge-bal';
  var skewHTML = skewDir ?
    '<div class="ib-block"><div class="lbl ib-blbl">RISK SKEW</div>' +
      '<div style="display:flex;align-items:baseline;gap:6px">' +
        '<span class="badge ' + skewCls + '">' + esc(skewDir) + '</span>' +
        (skewDesc ? '<span class="bt" style="margin:0;font-size:6.5pt">' + esc(trunc(skewDesc, 250)) + '</span>' : '') +
      '</div></div>' : '';

  // Position in Range
  var pirHTML = '';
  var pirWorlds = stock.hero && stock.hero.position_in_range && stock.hero.position_in_range.worlds;
  if (pirWorlds && pirWorlds.length >= 2) {
    var pirCur = parseFloat(stock._livePrice || stock.price || stock.hero.position_in_range.current_price || 0);
    var pirPrices = pirWorlds.map(function(w) { return parseFloat(w.price) || 0; });
    pirPrices.push(pirCur);
    var pirMin = Math.min.apply(null, pirPrices), pirMax = Math.max.apply(null, pirPrices), pirR = pirMax - pirMin || 1;
    var markers = '';
    for (var wi = 0; wi < pirWorlds.length; wi++) {
      var w = pirWorlds[wi], wPct = ((parseFloat(w.price) - pirMin) / pirR * 100).toFixed(1);
      markers += '<div class="pir-w" style="left:' + wPct + '%"><div class="pir-tick"></div><div class="pir-price">' + esc(stock.currency || 'A$') + parseFloat(w.price).toFixed(0) + '</div><div class="pir-lbl">' + esc(w.label) + '</div></div>';
    }
    var cPct = Math.min(100, Math.max(0, ((pirCur - pirMin) / pirR * 100))).toFixed(1);
    pirHTML = '<div class="ib-block"><div class="lbl ib-blbl">POSITION IN RANGE</div>' +
      '<div class="pir-wrap"><div class="pir-bar">' + markers +
        '<div class="pir-cur" style="left:' + cPct + '%"><div class="pir-dot">&#9679;</div><div class="pir-cur-price">' + esc(stock.currency || 'A$') + pirCur.toFixed(2) + '</div></div>' +
      '</div></div>' +
      (stock.hero.position_in_range.note ? '<div style="font-size:5.5pt;color:var(--tx3);font-style:italic;margin-top:3px">' + esc(stock.hero.position_in_range.note) + '</div>' : '') +
    '</div>';
  }

  // Sparkline
  var sparkHTML = '';
  if (stock.priceHistory && stock.priceHistory.length > 10) {
    var sp = stock.priceHistory, spMin = sp[0], spMax = sp[0];
    for (var spi = 1; spi < sp.length; spi++) { if (sp[spi] < spMin) spMin = sp[spi]; if (sp[spi] > spMax) spMax = sp[spi]; }
    var spLast = sp[sp.length - 1], spFirst = sp[0], spChg = ((spLast / spFirst - 1) * 100).toFixed(1);
    sparkHTML = '<div class="ib-block"><div class="lbl ib-blbl">1-YEAR PRICE HISTORY</div>' +
      '<div class="spark-meta" style="margin-bottom:1px"><span>Low: ' + esc(stock.currency || 'A$') + spMin.toFixed(2) + '</span>' +
        '<span class="spark-chg ' + (spLast >= spFirst ? 'chg-pos' : 'chg-neg') + '">' + (spLast >= spFirst ? '+' : '') + spChg + '% (1Y)</span>' +
        '<span>High: ' + esc(stock.currency || 'A$') + spMax.toFixed(2) + '</span></div>' +
      sparkSVG(sp, 550, 50) + '</div>';
  }

  // Hypothesis bars
  var hypHTML = '<div class="ib-block"><div class="lbl ib-blbl">HYPOTHESIS SURVIVAL SCORES</div>';
  for (var hi = 0; hi < hyps.length; hi++) {
    var h = hyps[hi], sc = normScores[hi] || 0, dc = dirColor(h.direction || '');
    hypHTML += '<div class="ib-hyp">' +
      '<div class="ib-hyp-hdr"><span class="ib-hyp-title">' + esc(strip(h.title || '')) + '</span>' +
        '<span class="ib-hyp-score" style="color:' + dc + '">' + sc + '%</span></div>' +
      '<div class="ib-hyp-track"><div class="ib-hyp-fill" style="width:' + sc + '%;background:' + dc + '"></div></div>' +
      '<div class="ib-hyp-desc">' + esc(trunc(h.description || '', 350)) + '</div></div>';
  }
  hypHTML += '</div>';

  // ── PAGE 2
  var p2Hdr = '<div class="ib-p2hdr"><span class="ib-p2co">' + esc(stock.company) + ' &bull; ' + esc(stock.tickerFull || stock.ticker + '.AX') + '</span><span class="lbl">INVESTOR BRIEFING &ndash; PAGE 2</span></div>';

  // Identity
  var identHTML = '<div class="ib-block"><div class="lbl ib-blbl">IDENTITY & SNAPSHOT</div>';
  if (stock.identity && stock.identity.rows && stock.identity.rows.length) {
    identHTML += '<table class="dt"><tbody>';
    for (var ir = 0; ir < stock.identity.rows.length; ir++) {
      var irow = stock.identity.rows[ir]; identHTML += '<tr>';
      for (var ic = 0; ic < irow.length; ic++) identHTML += '<td class="dt-lbl">' + esc(irow[ic][0]) + '</td><td class="dt-val">' + esc(strip(String(irow[ic][1] || ''))) + '</td>';
      identHTML += '</tr>';
    }
    identHTML += '</tbody></table>';
  }
  identHTML += '</div>';

  // Narrative
  function narrText(v) {
    if (!v) return '';
    if (typeof v === 'object') return esc(strip(v.text || v.summary || JSON.stringify(v)));
    return esc(strip(v));
  }
  var narrHTML = '<div class="ib-block"><div class="lbl ib-blbl">DOMINANT NARRATIVE</div>';
  if (stock.narrative) {
    if (stock.narrative.theNarrative) narrHTML += '<p class="bt" style="font-size:6.8pt">' + narrText(stock.narrative.theNarrative) + '</p>';
    if (stock.narrative.priceImplication) narrHTML += '<p class="bt" style="font-size:6.8pt"><strong>Price Implication:</strong> ' + narrText(stock.narrative.priceImplication) + '</p>';
    if (stock.narrative.evidenceCheck) narrHTML += '<p class="bt" style="font-size:6.8pt"><strong>Evidence Check:</strong> ' + narrText(stock.narrative.evidenceCheck) + '</p>';
  }
  narrHTML += '</div>';

  // Technical
  var techHTML = '<div class="ib-block"><div class="lbl ib-blbl">TECHNICAL STRUCTURE</div>';
  if (stock.technicalAnalysis) {
    var ta = stock.technicalAnalysis, tRows = [];
    if (ta.regime) tRows.push(['Regime', ta.regime + (ta.clarity ? ' / ' + ta.clarity : '')]);
    if (ta.trend) { tRows.push(['Trend', (ta.trend.direction || '') + (ta.trend.duration ? ', ' + ta.trend.duration : '')]); if (ta.trend.structure) tRows.push(['Structure', trunc(ta.trend.structure, 120)]); }
    if (ta.movingAverages) { if (ta.movingAverages.ma50) tRows.push(['50-day MA', String(ta.movingAverages.ma50.value || '')]); if (ta.movingAverages.ma200) tRows.push(['200-day MA', String(ta.movingAverages.ma200.value || '')]); }
    if (ta.keyLevels) { var klKs = Object.keys(ta.keyLevels).slice(0, 3); for (var kli = 0; kli < klKs.length; kli++) { var klv = ta.keyLevels[klKs[kli]]; if (klv) tRows.push([klKs[kli], typeof klv === 'object' ? String(klv.value || klv.price || '') : String(klv)]); } }
    if (tRows.length) {
      techHTML += '<table class="dt"><tbody>';
      for (var tri = 0; tri < tRows.length; tri++) techHTML += '<tr><td class="dt-lbl">' + esc(tRows[tri][0]) + '</td><td class="dt-val">' + esc(tRows[tri][1]) + '</td></tr>';
      techHTML += '</tbody></table>';
    }
  }
  techHTML += '</div>';

  // Evidence 3-col
  var evCards = stock.evidence && stock.evidence.cards ? stock.evidence.cards : [];
  function pick(keywords) { for (var ki = 0; ki < keywords.length; ki++) { for (var eci = 0; eci < evCards.length; eci++) { if (String(evCards[eci].title || '').toLowerCase().indexOf(keywords[ki].toLowerCase()) !== -1) return evCards[eci]; } } return null; }
  function miniCard(card, fb) {
    if (!card) return '<div class="ib-ev"><div class="ib-ev-t">' + esc(fb) + '</div><div class="ib-ev-b">No data available</div></div>';
    return '<div class="ib-ev"><div class="ib-ev-t">' + esc(strip(card.title || fb)) + (card.epistemicLabel ? ' <span class="ev-ep">' + esc(card.epistemicLabel) + '</span>' : '') + '</div>' +
      (card.finding ? '<div class="ib-ev-b">' + trunc(card.finding, 200) + '</div>' : '') +
      (card.tension ? '<div class="ib-ev-ten">' + trunc(card.tension, 120) + '</div>' : '') + '</div>';
  }
  var evHTML = '<div class="ib-block"><div class="lbl ib-blbl">EVIDENCE: COMPANY &bull; SECTOR &bull; MACRO</div><div class="grid3">' +
    miniCard(pick(['corporate', 'company']), 'Corporate') +
    miniCard(pick(['broker', 'consensus', 'analyst', 'sector']), 'Broker Research') +
    miniCard(pick(['economic', 'macro', 'alternative']), 'Economic Data') +
    '</div></div>';

  // Discriminators
  var discHTML = '<div class="ib-block"><div class="lbl ib-blbl">WHAT DISCRIMINATES</div>';
  var dRows = stock.discriminators && stock.discriminators.rows ? stock.discriminators.rows : [];
  if (dRows.length) {
    discHTML += '<table class="dt"><thead><tr><th style="width:55px">Diag.</th><th>Evidence</th><th style="width:130px">Between</th></tr></thead><tbody>';
    for (var dri = 0; dri < Math.min(dRows.length, 3); dri++) {
      var dr = dRows[dri], dCls = String(dr.diagnosticity || '').toLowerCase() === 'high' ? 'diag-high' : String(dr.diagnosticity || '').toLowerCase() === 'critical' ? 'diag-crit' : '';
      discHTML += '<tr><td><span class="diag ' + dCls + '">' + esc(dr.diagnosticity || '') + '</span></td><td>' + trunc(dr.evidence || '', 140) + '</td><td>' + esc(trunc(dr.discriminatesBetween || '', 80)) + '</td></tr>';
    }
    discHTML += '</tbody></table>';
  }
  discHTML += '</div>';

  // Tripwires
  var tripHTML = '<div class="ib-block"><div class="lbl ib-blbl">WHAT WE\'RE WATCHING</div>';
  var tCards = stock.tripwires && stock.tripwires.cards ? stock.tripwires.cards : [];
  for (var tci = 0; tci < Math.min(tCards.length, 4); tci++) {
    var tc = tCards[tci];
    tripHTML += '<div class="ib-tw">' +
      '<div class="ib-tw-name">' + (tc.date ? '<span class="ib-tw-date">' + esc(tc.date) + '</span> ' : '') + esc(strip(tc.name || '')) + '</div>';
    var conds = tc.conditions || [];
    for (var cci = 0; cci < Math.min(conds.length, 2); cci++) {
      var cond = conds[cci];
      tripHTML += '<div class="ib-tw-cond"><span class="tw-if ' + (String(cond.valence) === 'positive' ? 'tw-pos' : 'tw-neg') + '">' + esc(trunc(cond.if || '', 100)) + '</span>' +
        ' <span class="tw-arr">&rarr;</span> <span class="tw-then">' + esc(trunc(cond.then || '', 110)) + '</span></div>';
    }
    tripHTML += '</div>';
  }
  tripHTML += '</div>';

  var footerHTML = '<div class="ib-footer">Generated ' + esc(ts) + ' AEST &bull; ' + esc(stock.ticker) + ' &bull; Continuum Intelligence &bull; Not personal financial advice.</div>';

  // ── BRIEFING CSS
  var css = [
'.ib-page{min-height:auto;padding:6px 8px;}',

'.ib-hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid var(--navy);padding-bottom:5px;margin-bottom:6px;}',
'.ib-co{font-size:14pt;font-weight:800;color:var(--navy-dk);line-height:1.08;font-family:"Source Serif 4",Georgia,serif;}',
'.ib-sub{font-size:6.5pt;color:var(--tx2);margin-top:2px;}',
'.ib-tag{font-size:6.5pt;color:var(--tx2);font-style:italic;margin-top:2px;max-width:420px;}',
'.ib-type{font-size:7pt;font-weight:700;color:var(--navy);letter-spacing:1.5px;text-transform:uppercase;text-align:right;line-height:1.3;}',

'.ib-block{margin-bottom:5px;}',
'.ib-blbl{margin-bottom:3px;border-bottom:1px solid var(--rule-lt);padding-bottom:2px;}',

'.ib-metrics{display:flex;gap:10px;flex-wrap:wrap;margin:3px 0 5px;padding:4px 0;border-top:1px solid var(--rule-lt);border-bottom:1px solid var(--rule-lt);}',
'.ib-m{min-width:50px;}',
'.ib-m-lbl{font-size:5.2pt;text-transform:uppercase;letter-spacing:.4px;color:var(--tx3);font-weight:600;}',
'.ib-m-val{font-size:8pt;font-weight:700;color:var(--navy-dk);}',

'.pir-wrap{position:relative;margin:14px 0 6px;}',
'.pir-bar{position:relative;height:6px;background:var(--rule-lt);border-radius:3px;margin:0 6px;}',
'.pir-w{position:absolute;transform:translateX(-50%);top:-14px;text-align:center;white-space:nowrap;}',
'.pir-tick{width:1px;height:10px;background:var(--tx3);margin:0 auto;}',
'.pir-price{font-size:5.5pt;font-weight:700;color:var(--tx);margin-top:1px;}',
'.pir-lbl{font-size:4.5pt;color:var(--tx3);text-transform:uppercase;letter-spacing:.3px;}',
'.pir-cur{position:absolute;transform:translateX(-50%);top:-5px;text-align:center;}',
'.pir-dot{font-size:7pt;color:var(--navy);line-height:1;}',
'.pir-cur-price{font-size:5.5pt;font-weight:700;color:var(--navy);white-space:nowrap;}',

'.ib-hyp{margin-bottom:4px;}',
'.ib-hyp-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:1px;}',
'.ib-hyp-title{font-size:7.2pt;font-weight:700;color:var(--navy-dk);}',
'.ib-hyp-score{font-size:7.5pt;font-weight:800;}',
'.ib-hyp-track{height:5px;background:var(--rule-lt);border-radius:1px;margin-bottom:2px;}',
'.ib-hyp-fill{height:100%;border-radius:1px;}',
'.ib-hyp-desc{font-size:6pt;color:var(--tx2);line-height:1.38;}',

'.ib-p2hdr{display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--navy);padding-bottom:3px;margin-bottom:6px;}',
'.ib-p2co{font-size:7pt;font-weight:700;color:var(--navy);}',

'.ib-ev{border-left:2px solid var(--rule);padding:3px 5px;}',
'.ib-ev-t{font-size:6.2pt;font-weight:700;color:var(--navy-dk);margin-bottom:2px;}',
'.ib-ev-b{font-size:5.8pt;color:var(--tx);line-height:1.35;margin-bottom:1px;}',
'.ib-ev-ten{font-size:5.5pt;color:var(--tx2);font-style:italic;line-height:1.3;}',

'.ib-tw{border-left:2px solid var(--rule-lt);padding:2px 0 2px 6px;margin-bottom:3px;}',
'.ib-tw-name{font-size:6.5pt;font-weight:700;color:var(--navy-dk);margin-bottom:1px;}',
'.ib-tw-date{font-size:5.5pt;color:var(--tx3);font-weight:400;}',
'.ib-tw-cond{font-size:6pt;color:var(--tx2);line-height:1.32;margin-top:1px;}',

'.ib-footer{font-size:5.5pt;color:var(--tx3);border-top:1px solid var(--rule);padding-top:3px;margin-top:5px;text-align:center;}',

'@media print{',
'  .ib-page-1{page-break-after:auto;}',
'  .ib-ev,.ib-tw{page-break-inside:avoid;}',
'  .grid3{grid-template-columns:1fr 1fr 1fr;}',
'}'
  ].join('\n');

  return '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
    '<title>' + esc(stock.ticker) + ' Investor Briefing | Continuum Intelligence</title>' +
    '<style>' + baseCSS() + '\n' + css + '</style></head><body>' +
    '<div class="ib-page ib-page-1">' + p1Hdr + metricsHTML + skewHTML + pirHTML + sparkHTML + hypHTML + identHTML + narrHTML + techHTML + '</div>' +
    '<div class="ib-page ib-page-2">' + p2Hdr + evHTML + discHTML + tripHTML + footerHTML + '</div>' +
    '</body></html>';
}
