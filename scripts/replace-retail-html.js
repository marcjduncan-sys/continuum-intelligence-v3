/**
 * One-shot script: replaces buildRetailHTML() in index.html with
 * the LinkedIn 9-slide carousel generator.
 * Run: node scripts/replace-retail-html.js
 */
const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'index.html');
let content = fs.readFileSync(indexPath, 'utf8');

// ─── Find function boundaries ────────────────────────────────────────────────
const startMarker = 'function buildRetailHTML(stock) {';
const startIdx = content.indexOf(startMarker);
if (startIdx === -1) {
  console.error('ERROR: buildRetailHTML not found in index.html');
  process.exit(1);
}

// Walk forward from startMarker, tracking brace depth to find closing }
let depth = 0;
let endIdx = startIdx;
let inString = null;
let i = startIdx;
while (i < content.length) {
  const c = content[i];
  if (inString) {
    if (c === '\\' && inString !== '`') { i += 2; continue; }
    if (c === inString) inString = null;
  } else if (c === '"' || c === "'" || c === '`') {
    inString = c;
  } else if (c === '{') {
    depth++;
  } else if (c === '}') {
    depth--;
    if (depth === 0) { endIdx = i + 1; break; }
  }
  i++;
}

if (endIdx === startIdx) {
  console.error('ERROR: Could not find closing brace of buildRetailHTML');
  process.exit(1);
}

const startLine = content.slice(0, startIdx).split('\n').length;
const endLine   = content.slice(0, endIdx).split('\n').length;
console.log(`Replacing buildRetailHTML: lines ${startLine}–${endLine} (${endIdx - startIdx} chars)`);

// ─── New function ────────────────────────────────────────────────────────────
const newFunction = `function buildRetailHTML(stock) {
  // ─── LinkedIn Carousel Slides (9 × A4 landscape) ──────────────────────────
  // Designed for LinkedIn Document Posts: save as PDF → upload as Document.
  // Print instructions shown in the popup window (hidden on print).

  var genDate = new Date().toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
  var TIERS = ['T1', 'T2', 'T3', 'T4'];
  var TIER_COLORS = { T1: '#00C853', T2: '#2979FF', T3: '#FF9100', T4: '#D50000' };

  // Normalise raw survival_scores → percentages that sum to exactly 100
  var rawScores = TIERS.map(function(t) {
    var h = stock.hypotheses && stock.hypotheses[t];
    return (h && typeof h.survival_score === 'number') ? h.survival_score : 0;
  });
  var total = rawScores.reduce(function(a, b) { return a + b; }, 0) || 1;
  var pcts = rawScores.map(function(s) { return Math.round((s / total) * 100); });
  var rSum = pcts.reduce(function(a, b) { return a + b; }, 0);
  if (rSum !== 100) { var maxI = pcts.indexOf(Math.max.apply(null, pcts)); pcts[maxI] += (100 - rSum); }

  var domTier  = stock.dominant || 'T1';
  var domHyp   = (stock.hypotheses && stock.hypotheses[domTier]) || {};
  var domPct   = pcts[TIERS.indexOf(domTier)];
  var domColor = TIER_COLORS[domTier] || '#2979FF';

  var riskSkew  = stock.risk_skew || 'NEUTRAL';
  var riskColor = riskSkew === 'UPSIDE' ? '#00C853' : riskSkew === 'DOWNSIDE' ? '#D50000' : '#FF9100';

  // Strip .AX suffix for display
  var shortTicker = (stock.ticker || '').replace(/\\.(AX|ASX)$/i, '');
  var price = stock.current_price ? 'A$' + Number(stock.current_price).toFixed(2) : 'N/A';

  // Truncate text with ellipsis
  function trunc(text, maxLen) {
    if (!text) return '';
    var t = String(text).replace(/\\s+/g, ' ').trim();
    return t.length > maxLen ? t.substring(0, maxLen - 1) + '...' : t;
  }

  // Shared dark-navy header bar used on content slides
  function slideHeader(sectionLabel) {
    return '<div style="background:#0F2E57;padding:10px 18mm;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
      '<div>' +
        '<div style="font-size:6pt;letter-spacing:2px;color:rgba(255,255,255,0.55);text-transform:uppercase;margin-bottom:2px;">' + pdfEsc(sectionLabel) + '</div>' +
        '<div style="font-size:8.5pt;font-weight:700;color:#FFF;">' + pdfEsc(stock.company || shortTicker) + ' &bull; ' + pdfEsc(shortTicker) + '</div>' +
      '</div>' +
      '<div style="font-size:6.5pt;color:rgba(255,255,255,0.4);">Continuum Intelligence</div>' +
    '</div>';
  }

  // ── SLIDE 1: Cover ─────────────────────────────────────────────────────────
  var slide1 =
    '<div class="slide" style="background:#0F2E57;display:flex;flex-direction:column;justify-content:space-between;padding:13mm 18mm;">' +
      '<div>' +
        '<div style="font-size:7.5pt;font-weight:700;letter-spacing:3px;color:rgba(255,255,255,0.45);text-transform:uppercase;">Continuum Intelligence</div>' +
        '<div style="font-size:6.5pt;color:rgba(255,255,255,0.3);margin-top:3px;letter-spacing:0.8px;">Independent Equity Research &bull; ACH Methodology</div>' +
      '</div>' +
      '<div>' +
        '<div style="width:14mm;height:3px;background:#00C2C7;margin-bottom:6mm;"></div>' +
        '<div style="font-size:32pt;font-weight:900;color:#FFF;line-height:1.1;margin-bottom:4mm;">' + pdfEsc(stock.company || shortTicker) + '</div>' +
        '<div style="font-size:11pt;color:rgba(255,255,255,0.55);margin-bottom:5mm;">' +
          pdfEsc(shortTicker) + ' &bull; ' + pdfEsc(stock.sector || 'ASX') + ' &bull; ' + pdfEsc(price) +
          (stock.market_cap ? ' &bull; Mkt cap A$' + pdfEsc(stock.market_cap) : '') +
        '</div>' +
        '<div style="display:inline-block;padding:4px 12px;background:' + riskColor + ';font-size:7.5pt;font-weight:700;color:#FFF;letter-spacing:1px;border-radius:2px;">' +
          pdfEsc(riskSkew) + ' SKEW' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;border-top:1px solid rgba(255,255,255,0.12);padding-top:4mm;">' +
        '<span style="font-size:6pt;color:rgba(255,255,255,0.35);">' + pdfEsc(genDate) + '</span>' +
        '<span style="font-size:6pt;color:rgba(255,255,255,0.35);">Not financial advice &bull; Consult a licensed financial adviser</span>' +
      '</div>' +
    '</div>';

  // ── SLIDE 2: Big Picture ───────────────────────────────────────────────────
  var bigPicText = trunc(stock.big_picture || domHyp.plain_english || '', 300);
  var slide2 =
    '<div class="slide">' +
      slideHeader('The Big Picture') +
      '<div style="flex:1;padding:8mm 18mm;display:flex;flex-direction:column;justify-content:center;overflow:hidden;">' +
        '<div style="font-size:13pt;font-weight:800;color:#0F2E57;line-height:1.4;margin-bottom:6mm;">' + pdfEsc(bigPicText) + '</div>' +
        '<div style="background:#F0F4FA;border-left:4px solid ' + domColor + ';padding:8px 14px;">' +
          '<div style="font-size:6pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:1px;margin-bottom:3px;">Dominant Narrative</div>' +
          '<div style="font-size:10pt;font-weight:700;color:#0F2E57;">' + pdfEsc(domTier) + ': ' + pdfEsc(domHyp.label || '') + ' &mdash; ' + domPct + '%</div>' +
          '<div style="font-size:8pt;color:#334155;margin-top:3px;line-height:1.4;">' + pdfEsc(trunc(domHyp.plain_english || '', 150)) + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── SLIDE 3: Evidence Scorecard ────────────────────────────────────────────
  var scorecardRows = '';
  for (var si = 0; si < TIERS.length; si++) {
    var st = TIERS[si];
    var sh = (stock.hypotheses && stock.hypotheses[st]) || {};
    var sp = pcts[si];
    var sc = TIER_COLORS[st];
    var isDom = (st === domTier);
    scorecardRows +=
      '<div style="display:flex;align-items:center;padding:7px 0;border-bottom:1px solid #F1F5F9;">' +
        '<div style="width:4px;height:40px;background:' + sc + ';border-radius:2px;flex-shrink:0;margin-right:4mm;"></div>' +
        '<div style="width:18mm;flex-shrink:0;">' +
          '<div style="font-size:9pt;font-weight:900;color:' + sc + ';">' + pdfEsc(st) + '</div>' +
          (isDom ? '<div style="font-size:5pt;font-weight:700;color:#FFF;background:' + sc + ';padding:1px 4px;border-radius:2px;margin-top:2px;display:inline-block;">DOMINANT</div>' : '') +
        '</div>' +
        '<div style="flex:1;padding-right:5mm;overflow:hidden;">' +
          '<div style="font-size:9pt;font-weight:700;color:#0F2E57;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pdfEsc(sh.label || '') + '</div>' +
          '<div style="font-size:7pt;color:#64748B;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + pdfEsc(trunc(sh.description || '', 100)) + '</div>' +
        '</div>' +
        '<div style="width:44mm;flex-shrink:0;text-align:right;">' +
          '<div style="font-size:20pt;font-weight:900;color:' + sc + ';line-height:1;">' + sp + '%</div>' +
          '<div style="height:5px;background:#F1F5F9;border-radius:3px;margin-top:4px;">' +
            '<div style="width:' + sp + '%;height:100%;background:' + sc + ';border-radius:3px;"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  var slide3 =
    '<div class="slide">' +
      slideHeader('Evidence Scorecard') +
      '<div style="flex:1;padding:6mm 18mm;overflow:hidden;">' +
        '<div style="font-size:8pt;color:#64748B;margin-bottom:4mm;">Four possible futures for ' + pdfEsc(stock.company || shortTicker) + '. Percentages show evidence weight, not probability of outcome.</div>' +
        scorecardRows +
      '</div>' +
    '</div>';

  // ── SLIDES 4–7: Individual hypothesis detail slides ─────────────────────────
  var hypSlides = '';
  for (var hi = 0; hi < TIERS.length; hi++) {
    var ht = TIERS[hi];
    var hh = (stock.hypotheses && stock.hypotheses[ht]) || {};
    var hp = pcts[hi];
    var hc = TIER_COLORS[ht];
    var hIsDom = (ht === domTier);
    hypSlides +=
      '<div class="slide">' +
        '<div style="background:' + hc + ';padding:10px 18mm;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">' +
          '<div>' +
            '<div style="font-size:6.5pt;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;margin-bottom:2px;">' +
              pdfEsc(ht) + (hIsDom ? ' &bull; Dominant Narrative' : '') +
            '</div>' +
            '<div style="font-size:12pt;font-weight:900;color:#FFF;">' + pdfEsc(hh.label || '') + '</div>' +
          '</div>' +
          '<div style="font-size:36pt;font-weight:900;color:rgba(255,255,255,0.9);line-height:1;">' + hp + '%</div>' +
        '</div>' +
        '<div style="flex:1;padding:7mm 18mm;overflow:hidden;">' +
          '<div style="font-size:11.5pt;font-weight:700;color:#0F2E57;line-height:1.4;margin-bottom:5mm;">' +
            pdfEsc(trunc(hh.plain_english || hh.description || '', 180)) +
          '</div>' +
          '<div style="display:flex;gap:5mm;margin-bottom:4mm;">' +
            (hh.upside
              ? '<div style="flex:1;background:#F0FDF4;border-left:3px solid #00C853;padding:6px 10px;overflow:hidden;">' +
                  '<div style="font-size:6pt;font-weight:700;color:#00C853;text-transform:uppercase;margin-bottom:3px;">Upside</div>' +
                  '<div style="font-size:7.5pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.upside, 120)) + '</div>' +
                '</div>'
              : '') +
            (hh.risk_plain
              ? '<div style="flex:1;background:#FFF5F5;border-left:3px solid #D50000;padding:6px 10px;overflow:hidden;">' +
                  '<div style="font-size:6pt;font-weight:700;color:#D50000;text-transform:uppercase;margin-bottom:3px;">Risk</div>' +
                  '<div style="font-size:7.5pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.risk_plain, 120)) + '</div>' +
                '</div>'
              : '') +
          '</div>' +
          (hh.what_to_watch
            ? '<div style="background:#F8FAFC;border-top:2px solid #E2E8F0;padding:6px 10px;">' +
                '<div style="font-size:6pt;font-weight:700;color:#64748B;text-transform:uppercase;margin-bottom:3px;">What to Watch</div>' +
                '<div style="font-size:7.5pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(hh.what_to_watch, 160)) + '</div>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>';
  }

  // ── SLIDE 8: Catalyst Monitor ──────────────────────────────────────────────
  var watchItems = '';
  for (var wi = 0; wi < TIERS.length; wi++) {
    var wt = TIERS[wi];
    var wh = (stock.hypotheses && stock.hypotheses[wt]) || {};
    if (wh.what_to_watch) {
      watchItems +=
        '<div style="display:flex;align-items:flex-start;gap:4mm;margin-bottom:5mm;">' +
          '<div style="width:10px;height:10px;border-radius:50%;background:' + TIER_COLORS[wt] + ';flex-shrink:0;margin-top:3px;"></div>' +
          '<div style="flex:1;">' +
            '<div style="font-size:6.5pt;font-weight:700;color:' + TIER_COLORS[wt] + ';text-transform:uppercase;margin-bottom:2px;">' +
              pdfEsc(wt) + ': ' + pdfEsc(wh.label || '') +
            '</div>' +
            '<div style="font-size:8.5pt;color:#334155;line-height:1.4;">' + pdfEsc(trunc(wh.what_to_watch, 180)) + '</div>' +
          '</div>' +
        '</div>';
    }
  }
  var slide8 =
    '<div class="slide">' +
      slideHeader('Catalyst Monitor') +
      '<div style="flex:1;padding:8mm 18mm;overflow:hidden;">' +
        (watchItems || '<div style="font-size:9pt;color:#64748B;">No specific catalysts currently identified.</div>') +
      '</div>' +
    '</div>';

  // ── SLIDE 9: Disclaimer + CTA ──────────────────────────────────────────────
  var slide9 =
    '<div class="slide">' +
      slideHeader('Important Information') +
      '<div style="flex:1;padding:8mm 18mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">' +
        '<div style="font-size:7.5pt;color:#334155;line-height:1.6;">' +
          '<p style="margin-bottom:5mm;"><strong>This is not personal financial advice.</strong> This document is produced by Continuum Intelligence for informational purposes only. It does not constitute a recommendation to buy, sell, or hold any investment. Before making any investment decision, consult a licensed financial adviser who understands your personal circumstances.</p>' +
          '<p style="margin-bottom:5mm;"><strong>Methodology:</strong> Analysis uses the Analysis of Competing Hypotheses (ACH) framework, which systematically weighs evidence against multiple competing explanations. Percentages represent evidence weight, not predicted probability of outcome.</p>' +
          '<p>Data sourced from public filings, ASX announcements, and market data. Generated ' + pdfEsc(genDate) + '. &copy; ' + new Date().getFullYear() + ' Continuum Intelligence. All rights reserved.</p>' +
        '</div>' +
        '<div style="background:#F0F4FA;border:1px solid #E2E8F0;padding:10px 16px;display:inline-block;align-self:flex-start;">' +
          '<div style="font-size:8pt;font-weight:700;color:#0F2E57;margin-bottom:2px;">View Full Interactive Research</div>' +
          '<div style="font-size:7pt;color:#64748B;">Live analysis updated 5&times; daily &bull; continuum-intel.com</div>' +
        '</div>' +
      '</div>' +
    '</div>';

  // ── CSS + print-instructions banner + document assembly ───────────────────
  var css =
    '*{box-sizing:border-box;margin:0;padding:0;}' +
    'body{background:#E5E7EB;font-family:Arial,Helvetica,sans-serif;padding:10mm;}' +
    '.slide{width:297mm;height:210mm;page-break-after:always;overflow:hidden;display:flex;flex-direction:column;' +
      'background:#FFF;margin-bottom:8mm;box-shadow:0 2px 8px rgba(0,0,0,0.12);}' +
    '.slide:last-child{page-break-after:avoid;margin-bottom:0;}' +
    '.print-hint{background:#1B2A4A;color:#FFF;padding:12px 20px;font-size:9pt;margin-bottom:8mm;' +
      'border-radius:4px;display:flex;align-items:center;gap:12px;}' +
    '@media print{' +
      '@page{size:A4 landscape;margin:0;}' +
      'body{background:white;padding:0;}' +
      '.print-hint{display:none;}' +
      '.slide{margin-bottom:0;box-shadow:none;}' +
    '}';

  var printHint =
    '<div class="print-hint">' +
      '<span style="font-size:18pt;">&#8595;</span>' +
      '<div>' +
        '<strong>Save as PDF for LinkedIn:</strong> Press Ctrl+P (or Cmd+P on Mac) &rarr; set Destination to ' +
        '&ldquo;Save as PDF&rdquo; &rarr; click Save. Then upload the PDF to LinkedIn using the ' +
        '<strong>Document</strong> attachment icon on a new post.' +
      '</div>' +
    '</div>';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<title>' + pdfEsc(shortTicker) + ' &mdash; LinkedIn Slides | Continuum Intelligence</title>' +
    '<style>' + css + '</style></head><body>' +
    printHint +
    slide1 + slide2 + slide3 + hypSlides + slide8 + slide9 +
    '</body></html>';
}`;

// ─── Do the replacement ──────────────────────────────────────────────────────
const newContent = content.slice(0, startIdx) + newFunction + content.slice(endIdx);
fs.writeFileSync(indexPath, newContent, 'utf8');
console.log('Done. buildRetailHTML replaced successfully.');
