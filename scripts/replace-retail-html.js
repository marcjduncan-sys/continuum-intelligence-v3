/**
 * Replaces buildRetailHTML() in index.html with the LinkedIn 9-slide carousel.
 * Run: node scripts/replace-retail-html.js
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let content = fs.readFileSync(indexPath, 'utf8');

// Find function boundaries
const startMarker = 'function buildRetailHTML(stock) {';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) { console.error('ERROR: buildRetailHTML not found'); process.exit(1); }

let depth = 0, endIdx = startIdx, inString = null, i = startIdx;
while (i < content.length) {
  const c = content[i];
  if (inString) {
    if (c === '\\' && inString !== '`') { i += 2; continue; }
    if (c === inString) inString = null;
  } else if (c === '"' || c === "'" || c === '`') {
    inString = c;
  } else if (c === '{') { depth++; }
  else if (c === '}') { depth--; if (depth === 0) { endIdx = i + 1; break; } }
  i++;
}
if (endIdx === startIdx) { console.error('ERROR: closing brace not found'); process.exit(1); }

const startLine = content.slice(0, startIdx).split('\n').length;
const endLine   = content.slice(0, endIdx).split('\n').length;
console.log(`Replacing lines ${startLine}–${endLine}`);

// ── New function ─────────────────────────────────────────────────────────────
const newFunction = `function buildRetailHTML(stock) {
  // LinkedIn 9-slide carousel (A4 landscape).
  // User saves as PDF from print dialog, then uploads to LinkedIn as a Document Post.

  var genDate = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
  var TIERS = ['T1', 'T2', 'T3', 'T4'];
  var TIER_COLORS = { T1: '#00C853', T2: '#2979FF', T3: '#FF9100', T4: '#D50000' };

  // Normalise raw survival_scores to percentages that sum to 100
  var rawScores = TIERS.map(function(t) {
    var h = stock.hypotheses && stock.hypotheses[t];
    return (h && typeof h.survival_score === 'number') ? h.survival_score : 0;
  });
  var total = rawScores.reduce(function(a, b) { return a + b; }, 0) || 1;
  var pcts = rawScores.map(function(s) { return Math.round((s / total) * 100); });
  var rSum = pcts.reduce(function(a, b) { return a + b; }, 0);
  if (rSum !== 100) {
    var maxI = pcts.indexOf(Math.max.apply(null, pcts));
    pcts[maxI] += (100 - rSum);
  }

  var domTier  = stock.dominant || 'T1';
  var domHyp   = (stock.hypotheses && stock.hypotheses[domTier]) || {};
  var domPct   = pcts[TIERS.indexOf(domTier)];
  var domColor = TIER_COLORS[domTier] || '#2979FF';

  var riskSkew  = stock.risk_skew || 'NEUTRAL';
  var riskColor = riskSkew === 'UPSIDE' ? '#00C853' : riskSkew === 'DOWNSIDE' ? '#D50000' : '#FF9100';

  var shortTicker = (stock.ticker || '').replace(/\\.(AX|ASX)$/i, '');
  var price = stock.current_price ? 'A$' + Number(stock.current_price).toFixed(2) : 'N/A';

  function trunc(text, maxLen) {
    if (!text) return '';
    var t = String(text).replace(/\\s+/g, ' ').trim();
    return t.length > maxLen ? t.substring(0, maxLen - 1) + '...' : t;
  }

  // Shared header bar (non-cover slides)
  function slideHeader(label) {
    return '<div style="background:#0F2E57;padding:9px 15mm;display:flex;justify-content:space-between;align-items:center;">' +
      '<div>' +
        '<div style="font-size:6pt;letter-spacing:2px;color:rgba(255,255,255,0.5);text-transform:uppercase;margin-bottom:2px;">' + pdfEsc(label) + '</div>' +
        '<div style="font-size:8pt;font-weight:700;color:#FFF;">' + pdfEsc(stock.company || shortTicker) + ' &bull; ' + pdfEsc(shortTicker) + '</div>' +
      '</div>' +
      '<div style="font-size:6pt;color:rgba(255,255,255,0.35);">Continuum Intelligence</div>' +
    '</div>';
  }

  // ── SLIDE 1: Cover ───────────────────────────────────────────────────────────
  var s1 =
    '<div class="slide cover-slide">' +
      '<div style="font-size:7pt;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.4);text-transform:uppercase;margin-bottom:8mm;">Continuum Intelligence &bull; Independent Equity Research</div>' +
      '<div style="flex:1;display:flex;flex-direction:column;justify-content:center;">' +
        '<div style="width:12mm;height:3px;background:#00C2C7;margin-bottom:5mm;"></div>' +
        '<div style="font-size:30pt;font-weight:900;color:#FFF;line-height:1.1;margin-bottom:4mm;">' + pdfEsc(stock.company || shortTicker) + '</div>' +
        '<div style="font-size:10pt;color:rgba(255,255,255,0.5);margin-bottom:5mm;">' +
          pdfEsc(shortTicker) + ' &bull; ' + pdfEsc(stock.sector || 'ASX') + ' &bull; ' + pdfEsc(price) +
          (stock.market_cap ? ' &bull; Mkt cap A$' + pdfEsc(stock.market_cap) : '') +
        '</div>' +
        '<div style="display:inline-block;padding:4px 12px;background:' + riskColor + ';font-size:7pt;font-weight:700;color:#FFF;letter-spacing:1px;">' +
          pdfEsc(riskSkew) + ' SKEW' +
        '</div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.12);padding-top:4mm;display:flex;justify-content:space-between;">' +
        '<span style="font-size:6pt;color:rgba(255,255,255,0.3);">' + pdfEsc(genDate) + '</span>' +
        '<span style="font-size:6pt;color:rgba(255,255,255,0.3);">Not financial advice &bull; Consult a licensed adviser</span>' +
      '</div>' +
    '</div>';

  // ── SLIDE 2: Big Picture ──────────────────────────────────────────────────────
  var bigPicText = trunc(stock.big_picture || domHyp.plain_english || '', 300);
  var s2 =
    '<div class="slide">' +
      slideHeader('The Big Picture') +
      '<div class="slide-body">' +
        '<div style="font-size:12.5pt;font-weight:800;color:#0F2E57;line-height:1.4;margin-bottom:6mm;">' + pdfEsc(bigPicText) + '</div>' +
        '<div style="background:#F0F4FA;border-left:4px solid ' + domColor + ';padding:8px 12px;">' +
          '<div style="font-size:6pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Dominant Narrative &mdash; ' + pdfEsc(domTier) + '</div>' +
          '<div style="font-size:9.5pt;font-weight:700;color:#0F2E57;">' + pdfEsc(domHyp.label || '') + ' &mdash; ' + domPct + '%</div>' +
          '<div style="font-size:7.5pt;color:#334155;margin-top:3px;line-height:1.4;">' + pdfEsc(trunc(domHyp.plain_english || '', 150)) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── SLIDE 3: Evidence Scorecard ───────────────────────────────────────────────
  var scoreRows = '';
  for (var si = 0; si < TIERS.length; si++) {
    var st = TIERS[si];
    var sh = (stock.hypotheses && stock.hypotheses[st]) || {};
    var sp = pcts[si];
    var sc = TIER_COLORS[st];
    var isD = (st === domTier);
    scoreRows +=
      '<div style="display:flex;align-items:center;padding:6px 0;border-bottom:1px solid #F1F5F9;">' +
        '<div style="width:3px;height:36px;background:' + sc + ';flex-shrink:0;margin-right:3mm;border-radius:1px;"></div>' +
        '<div style="width:16mm;flex-shrink:0;">' +
          '<div style="font-size:8.5pt;font-weight:900;color:' + sc + ';">' + pdfEsc(st) + '</div>' +
          (isD ? '<div style="font-size:5pt;color:#FFF;background:' + sc + ';padding:1px 3px;margin-top:2px;display:inline-block;">DOM</div>' : '') +
        '</div>' +
        '<div style="flex:1;padding-right:4mm;min-width:0;">' +
          '<div style="font-size:8.5pt;font-weight:700;color:#0F2E57;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pdfEsc(sh.label || '') + '</div>' +
          '<div style="font-size:6.5pt;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pdfEsc(trunc(sh.description || '', 95)) + '</div>' +
        '</div>' +
        '<div style="width:40mm;flex-shrink:0;text-align:right;">' +
          '<div style="font-size:18pt;font-weight:900;color:' + sc + ';line-height:1;">' + sp + '%</div>' +
          '<div style="height:4px;background:#F1F5F9;border-radius:2px;margin-top:4px;">' +
            '<div style="width:' + sp + '%;height:100%;background:' + sc + ';border-radius:2px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  var s3 =
    '<div class="slide">' +
      slideHeader('Evidence Scorecard') +
      '<div class="slide-body">' +
        '<div style="font-size:7.5pt;color:#64748B;margin-bottom:3mm;">Four possible futures for ' + pdfEsc(stock.company || shortTicker) + '. Percentages = evidence weight, not predicted probability.</div>' +
        scoreRows +
      '</div>' +
    '</div>';

  // ── SLIDES 4–7: T1–T4 hypothesis detail ───────────────────────────────────────
  var hypSlides = '';
  for (var hi = 0; hi < TIERS.length; hi++) {
    var ht = TIERS[hi];
    var hh = (stock.hypotheses && stock.hypotheses[ht]) || {};
    var hp = pcts[hi];
    var hc = TIER_COLORS[ht];
    var isDom = (ht === domTier);
    hypSlides +=
      '<div class="slide">' +
        '<div style="background:' + hc + ';padding:9px 15mm;display:flex;justify-content:space-between;align-items:center;">' +
          '<div>' +
            '<div style="font-size:6pt;letter-spacing:2px;color:rgba(255,255,255,0.65);text-transform:uppercase;margin-bottom:2px;">' +
              pdfEsc(ht) + (isDom ? ' &bull; Dominant' : '') +
            '</div>' +
            '<div style="font-size:11pt;font-weight:900;color:#FFF;">' + pdfEsc(hh.label || '') + '</div>' +
          '</div>' +
          '<div style="font-size:32pt;font-weight:900;color:rgba(255,255,255,0.9);line-height:1;">' + hp + '%</div>' +
        '</div>' +
        '<div class="slide-body">' +
          '<div style="font-size:11pt;font-weight:700;color:#0F2E57;line-height:1.4;margin-bottom:4mm;">' +
            pdfEsc(trunc(hh.plain_english || hh.description || '', 180)) +
          '</div>' +
          '<div style="display:flex;gap:4mm;margin-bottom:3mm;">' +
            (hh.upside
              ? '<div style="flex:1;background:#F0FDF4;border-left:3px solid #00C853;padding:5px 9px;">' +
                  '<div style="font-size:6pt;font-weight:700;color:#00C853;text-transform:uppercase;margin-bottom:2px;">Upside</div>' +
                  '<div style="font-size:7pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.upside, 120)) + '</div>' +
                '</div>'
              : '') +
            (hh.risk_plain
              ? '<div style="flex:1;background:#FFF5F5;border-left:3px solid #D50000;padding:5px 9px;">' +
                  '<div style="font-size:6pt;font-weight:700;color:#D50000;text-transform:uppercase;margin-bottom:2px;">Risk</div>' +
                  '<div style="font-size:7pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.risk_plain, 120)) + '</div>' +
                '</div>'
              : '') +
          '</div>' +
          (hh.what_to_watch
            ? '<div style="background:#F8FAFC;border-top:2px solid #E2E8F0;padding:5px 9px;">' +
                '<div style="font-size:6pt;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:2px;">What to Watch</div>' +
                '<div style="font-size:7pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.what_to_watch, 160)) + '</div>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>';
  }

  // ── SLIDE 8: Catalyst Monitor ─────────────────────────────────────────────────
  var watchItems = '';
  for (var wi = 0; wi < TIERS.length; wi++) {
    var wt = TIERS[wi];
    var wh = (stock.hypotheses && stock.hypotheses[wt]) || {};
    if (wh.what_to_watch) {
      watchItems +=
        '<div style="display:flex;align-items:flex-start;gap:3mm;margin-bottom:4mm;">' +
          '<div style="width:9px;height:9px;border-radius:50%;background:' + TIER_COLORS[wt] + ';flex-shrink:0;margin-top:3px;"></div>' +
          '<div>' +
            '<div style="font-size:6pt;font-weight:700;color:' + TIER_COLORS[wt] + ';text-transform:uppercase;margin-bottom:2px;">' +
              pdfEsc(wt) + ': ' + pdfEsc(wh.label || '') +
            '</div>' +
            '<div style="font-size:8pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(wh.what_to_watch, 180)) + '</div>' +
          '</div>' +
        '</div>';
    }
  }
  var s8 =
    '<div class="slide">' +
      slideHeader('Catalyst Monitor') +
      '<div class="slide-body">' +
        (watchItems || '<div style="font-size:8pt;color:#64748B;">No specific catalysts identified.</div>') +
      '</div>' +
    '</div>';

  // ── SLIDE 9: Disclaimer + CTA ──────────────────────────────────────────────────
  var s9 =
    '<div class="slide">' +
      slideHeader('Important Information') +
      '<div class="slide-body" style="display:flex;flex-direction:column;justify-content:space-between;">' +
        '<div style="font-size:7pt;color:#334155;line-height:1.6;">' +
          '<p style="margin-bottom:4mm;"><strong>This is not personal financial advice.</strong> Produced by Continuum Intelligence for informational purposes only. Not a recommendation to buy, sell, or hold any investment. Consult a licensed financial adviser before making any investment decision.</p>' +
          '<p style="margin-bottom:4mm;"><strong>Methodology:</strong> Analysis of Competing Hypotheses (ACH) framework. Percentages represent evidence weight, not predicted probability of outcome. Reassess regularly as markets change.</p>' +
          '<p>Data from public filings, ASX announcements, and market data. Generated ' + pdfEsc(genDate) + '. &copy; ' + new Date().getFullYear() + ' Continuum Intelligence. All rights reserved.</p>' +
        '</div>' +
        '<div style="background:#F0F4FA;border:1px solid #E2E8F0;padding:8px 14px;display:inline-block;">' +
          '<div style="font-size:7.5pt;font-weight:700;color:#0F2E57;margin-bottom:2px;">Full Interactive Research</div>' +
          '<div style="font-size:6.5pt;color:#64748B;">Live updates 5&times; daily &bull; continuum-intel.com</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── CSS (print-first, screen enhancements via @media screen) ─────────────────
  //
  // KEY DESIGN: @page at TOP LEVEL ensures landscape orientation is set before
  // any print rules. @media screen adds visual chrome for the popup preview.
  // No height: fixed on slides — use min-height + page-break-inside:avoid so
  // Chrome never needs to split a slide across two pages.

  var css = [
    // @page at top level — sets paper size & margins for ALL print output
    '@page{size:A4 landscape;margin:12mm 15mm;}',

    // Reset
    '*{box-sizing:border-box;margin:0;padding:0;}',

    // Base slide styles — work for both screen and print
    'body{font-family:Arial,Helvetica,sans-serif;color:#333;}',
    '.slide{',
      'page-break-after:always;',
      'page-break-inside:avoid;',
      'display:flex;',
      'flex-direction:column;',
      // min-height = landscape A4 content height (210mm - 2*12mm margins = 186mm)
      'min-height:186mm;',
    '}',
    '.slide:last-child{page-break-after:avoid;}',
    '.cover-slide{background:#0F2E57;padding:12mm 15mm;}',
    '.slide-body{flex:1;padding:6mm 15mm;display:flex;flex-direction:column;justify-content:center;}',
    '.print-hint{display:none;}', // hidden by default (safe for print)

    // Screen-only styles
    '@media screen{',
      'body{background:#E5E7EB;padding:10mm;}',
      '.slide{',
        'background:#FFF;',
        'margin-bottom:6mm;',
        'box-shadow:0 2px 8px rgba(0,0,0,0.12);',
        'width:267mm;', // 297mm - 2*15mm print margins (so slides look right on screen)
      '}',
      '.slide:last-child{margin-bottom:0;}',
      '.print-hint{',
        'display:flex;align-items:center;gap:12px;',
        'background:#1B2A4A;color:#FFF;',
        'padding:12px 20px;font-size:9pt;',
        'margin-bottom:6mm;border-radius:4px;',
        'width:267mm;',
      '}',
    '}',
  ].join('');

  var printHint =
    '<div class="print-hint">' +
      '<span style="font-size:20pt;">&#8595;</span>' +
      '<div>' +
        '<strong>Save as PDF for LinkedIn:</strong> Press Ctrl+P (or Cmd+P) &rarr; Destination: &ldquo;Save as PDF&rdquo; &rarr; Save. ' +
        'Then on LinkedIn, create a post and click the <strong>Document</strong> icon to upload.' +
      '</div>' +
    '</div>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + pdfEsc(shortTicker) + ' &mdash; LinkedIn Slides | Continuum Intelligence</title>' +
    '<style>' + css + '</style></head><body>' +
    printHint +
    s1 + s2 + s3 + hypSlides + s8 + s9 +
    '</body></html>';
}`;

// Do the replacement
const newContent = content.slice(0, startIdx) + newFunction + content.slice(endIdx);
fs.writeFileSync(indexPath, newContent, 'utf8');
console.log('Done.');
