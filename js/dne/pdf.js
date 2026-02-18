/**
 * DYNAMIC NARRATIVE ENGINE — PDF Report Generation
 *
 * Generates institutional and retail PDF reports from stock data.
 * - Institutional Report: Full ACH analysis for portfolio managers
 * - Investor Briefing: Plain English summary for self-directed investors
 *
 * Data comes from window.DNE_STOCK (populated by app.js).
 * HTML is built dynamically, rendered by html2pdf.js library.
 *
 * Depends on: html2pdf.js (loaded in stock.html via CDN)
 */

/* global html2pdf */

// ─── Utility: HTML escape ───────────────────────────────────────────────────

function escapeHtmlForPdf(text) {
  if (!text) return '';
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, function (s) { return map[s]; });
}

// ─── Hypothesis colour mapping ──────────────────────────────────────────────

function getHypothesisColor(hId) {
  var colors = {
    'T1': { hex: '#00C853', rgb: '0, 200, 83' },
    'T2': { hex: '#2979FF', rgb: '41, 121, 255' },
    'T3': { hex: '#FF9100', rgb: '255, 145, 0' },
    'T4': { hex: '#D50000', rgb: '213, 0, 0' }
  };
  return colors[hId] || { hex: '#666666', rgb: '102, 102, 102' };
}

// ─── Build Institutional Report HTML ────────────────────────────────────────

function buildInstitutionalReportHTML(stock) {
  if (!stock || !stock.ticker) {
    return '<div>Error: Stock data unavailable</div>';
  }

  var date = new Date().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  var risk_skew = stock.risk_skew || 'NEUTRAL';
  var risk_color = risk_skew === 'DOWNSIDE' ? '#D50000' :
                   risk_skew === 'UPSIDE' ? '#00C853' : '#FF9100';

  var html = '';

  // ─── PAGE 1: Cover ──────────────────────────────────────────────────────
  html += '<div style="' +
    'page-break-after: always; ' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    'height: 297mm; ' +
    'display: flex; ' +
    'flex-direction: column; ' +
    'justify-content: space-between; ' +
    '">';

  // Header
  html += '<div>';
  html += '<div style="font-size: 10px; letter-spacing: 2px; color: #1B2A4A; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">' +
    'Continuum Intelligence' +
    '</div>';
  html += '<div style="font-size: 9px; color: #888; margin-bottom: 24px;">' +
    'Independent Cross-Domain Equity Research' +
    '</div>';
  html += '<div style="border-bottom: 3px solid #1B2A4A; margin-bottom: 40px;"></div>';

  // Title
  html += '<div style="margin-bottom: 40px;">';
  html += '<h1 style="font-size: 32px; color: #1B2A4A; margin: 0 0 8px 0; font-weight: 700;">' +
    escapeHtmlForPdf(stock.company) +
    '</h1>';
  html += '<div style="font-size: 16px; color: #666; margin-bottom: 8px;">' +
    escapeHtmlForPdf(stock.ticker) + ' &bull; ' + escapeHtmlForPdf(stock.sector || 'Unknown') +
    '</div>';
  html += '<div style="font-size: 14px; color: #888; margin-bottom: 24px;">' +
    'As of ' + date +
    '</div>';
  
  // Price and key metrics
  html += '<table style="width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 12px;">';
  html += '<tr style="background: #F2F2F2;">';
  html += '<td style="padding: 6px 12px; font-weight: 700; border: 1px solid #ddd;">Metric</td>';
  html += '<td style="padding: 6px 12px; font-weight: 700; border: 1px solid #ddd;">Value</td>';
  html += '</tr>';
  
  html += '<tr>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fff;">Share Price</td>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fff; font-weight: 700;">A$' +
    (stock.current_price ? Number(stock.current_price).toFixed(2) : 'N/A') +
    '</td>';
  html += '</tr>';
  
  html += '<tr>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fafafa;">Market Cap</td>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fafafa;">' +
    escapeHtmlForPdf(stock.market_cap || 'N/A') +
    '</td>';
  html += '</tr>';
  
  html += '<tr>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fff;">Risk Skew</td>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fff; color: ' + risk_color + '; font-weight: 700;">' +
    risk_skew +
    '</td>';
  html += '</tr>';
  
  html += '<tr>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fafafa;">Dominant Narrative</td>';
  var dom = stock.hypotheses[stock.dominant];
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fafafa; font-weight: 700;">' +
    stock.dominant + ': ' + escapeHtmlForPdf(dom.label) +
    '</td>';
  html += '</tr>';
  
  html += '</table>';
  html += '</div>';

  // Footer
  html += '<div style="border-top: 1px solid #ddd; padding-top: 12px;">';
  html += '<div style="font-size: 8px; color: #999; line-height: 1.4;">' +
    '© 2026 Continuum Intelligence. This is not personal financial advice. ' +
    'Analysis uses the Analysis of Competing Hypotheses (ACH) methodology. ' +
    'Consult a licensed financial adviser before making investment decisions.' +
    '</div>';
  html += '</div>';

  html += '</div>';

  // ─── PAGE 2: Hypotheses ─────────────────────────────────────────────────
  html += '<div style="' +
    'page-break-after: always; ' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    '">';

  html += '<h2 style="font-size: 18px; color: #2E5090; border-bottom: 2px solid #2E5090; padding-bottom: 8px; margin: 0 0 24px 0; font-weight: 700;">' +
    'Competing Hypotheses' +
    '</h2>';

  // List all four hypotheses
  var hyp_ids = ['T1', 'T2', 'T3', 'T4'];
  for (var i = 0; i < hyp_ids.length; i++) {
    var hId = hyp_ids[i];
    var h = stock.hypotheses[hId];
    if (!h) continue;

    var color = getHypothesisColor(hId);
    var score = Math.round(h.survival_score * 100);
    var isDom = hId === stock.dominant ? ' (DOMINANT)' : '';

    html += '<div style="' +
      'margin: 0 0 16px 0; ' +
      'padding: 12px; ' +
      'background: #ffffff; ' +
      'border-left: 4px solid ' + color.hex + '; ' +
      'page-break-inside: avoid; ' +
      '">';

    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 4px;">';
    html += '<div style="font-size: 13px; font-weight: 700; color: #1B2A4A;">' +
      hId + ': ' + escapeHtmlForPdf(h.label) + isDom +
      '</div>';
    html += '<div style="font-size: 16px; font-weight: 700; color: ' + color.hex + ';">' +
      score + '%' +
      '</div>';
    html += '</div>';

    html += '<div style="font-size: 10px; color: #666; margin-bottom: 6px; line-height: 1.4;">' +
      escapeHtmlForPdf(h.description || '') +
      '</div>';

    if (h.plain_english) {
      html += '<div style="font-size: 10px; color: #555; font-style: italic; line-height: 1.4;">' +
        escapeHtmlForPdf(h.plain_english) +
        '</div>';
    }

    html += '</div>';
  }

  html += '</div>';

  // ─── PAGE 3: Evidence & Tripwires ───────────────────────────────────────
  html += '<div style="' +
    'page-break-after: always; ' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    '">';

  html += '<h2 style="font-size: 18px; color: #2E5090; border-bottom: 2px solid #2E5090; padding-bottom: 8px; margin: 0 0 16px 0; font-weight: 700;">' +
    'Evidence Items' +
    '</h2>';

  if (stock.evidence_items && stock.evidence_items.length > 0) {
    html += '<table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 24px;">';
    html += '<tr style="background: #F2F2F2;">';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">Date</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">Source</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">Summary</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">T1</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">T2</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">T3</td>';
    html += '<td style="padding: 6px; font-weight: 700; border: 1px solid #ddd;">T4</td>';
    html += '</tr>';

    for (var j = 0; j < Math.min(stock.evidence_items.length, 8); j++) {
      var ev = stock.evidence_items[j];
      var date_str = ev.date ? new Date(ev.date).toLocaleDateString('en-AU') : 'N/A';
      
      html += '<tr>';
      html += '<td style="padding: 6px; border: 1px solid #ddd; font-size: 9px;">' + date_str + '</td>';
      html += '<td style="padding: 6px; border: 1px solid #ddd; font-size: 9px;">' + escapeHtmlForPdf(ev.source || '') + '</td>';
      html += '<td style="padding: 6px; border: 1px solid #ddd; font-size: 9px;">' + escapeHtmlForPdf(ev.summary || '') + '</td>';
      
      for (var k = 0; k < 4; k++) {
        var hId_k = 'T' + (k + 1);
        var impact = ev.hypothesis_impact && ev.hypothesis_impact[hId_k];
        var impact_color = impact === 'CONSISTENT' ? '#00C853' : impact === 'INCONSISTENT' ? '#D50000' : '#999';
        var impact_text = impact ? impact.charAt(0).toUpperCase() : '−';
        html += '<td style="padding: 6px; border: 1px solid #ddd; text-align: center; color: ' + impact_color + '; font-weight: 700; font-size: 9px;">' +
          impact_text +
          '</td>';
      }
      
      html += '</tr>';
    }
    
    html += '</table>';
  } else {
    html += '<div style="font-size: 10px; color: #666; padding: 12px; background: #fff; border: 1px solid #ddd;">' +
      'No evidence items available.' +
      '</div>';
  }

  if (stock.tripwires && stock.tripwires.length > 0) {
    html += '<h3 style="font-size: 14px; color: #2E5090; margin: 20px 0 12px 0; font-weight: 700;">' +
      'Tripwires' +
      '</h3>';

    for (var tw_idx = 0; tw_idx < Math.min(stock.tripwires.length, 5); tw_idx++) {
      var tw = stock.tripwires[tw_idx];
      html += '<div style="margin-bottom: 8px; padding: 8px; background: #fff; border: 1px solid #ddd; font-size: 10px;">';
      html += '<strong>' + escapeHtmlForPdf(tw.name || 'Tripwire') + ':</strong> ' +
        escapeHtmlForPdf(tw.description || '') +
        '</div>';
    }
  }

  html += '</div>';

  // ─── PAGE 4: Disclaimer ─────────────────────────────────────────────────
  html += '<div style="' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    'font-size: 10px; ' +
    'line-height: 1.6; ' +
    '">';

  html += '<h2 style="font-size: 16px; color: #1B2A4A; margin: 0 0 16px 0; font-weight: 700;">' +
    'Disclaimer' +
    '</h2>';

  html += '<div style="margin-bottom: 12px;">' +
    '<strong>Not Personal Financial Advice:</strong> ' +
    'This report is provided for educational and informational purposes only. ' +
    'It does not constitute personal financial advice, an investment recommendation, ' +
    'or an offer to buy or sell any security. You should not rely on this report as ' +
    'the sole basis for any investment decision. Consult a licensed financial adviser ' +
    'before making any investment decisions.' +
    '</div>';

  html += '<div style="margin-bottom: 12px;">' +
    '<strong>Methodology:</strong> ' +
    'This analysis uses the Analysis of Competing Hypotheses (ACH) framework. ' +
    'The ACH method systematically evaluates the consistency of evidence with ' +
    'competing narratives and ranks them by the strength of supporting evidence. ' +
    'Strong evidence for one hypothesis does not eliminate other possibilities.' +
    '</div>';

  html += '<div style="margin-bottom: 12px;">' +
    '<strong>No Warranty:</strong> ' +
    'Continuum Intelligence makes no warranty regarding the accuracy, completeness, ' +
    'or timeliness of information in this report. Past performance is not indicative ' +
    'of future results. Market conditions change rapidly.' +
    '</div>';

  html += '<div style="margin-bottom: 12px;">' +
    '<strong>Data Sources:</strong> ' +
    'Data sourced from public filings, ASX announcements, broker research, and ' +
    'publicly available financial data. All sources are believed to be reliable ' +
    'but are not guaranteed.' +
    '</div>';

  html += '<div style="border-top: 1px solid #ddd; padding-top: 12px; margin-top: 24px; font-size: 9px; color: #999;">' +
    '© 2026 Continuum Intelligence. All rights reserved.' +
    '</div>';

  html += '</div>';

  return html;
}

// ─── Build Retail Report HTML ───────────────────────────────────────────────

function buildRetailReportHTML(stock) {
  if (!stock || !stock.ticker) {
    return '<div>Error: Stock data unavailable</div>';
  }

  var date = new Date().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  var risk_skew = stock.risk_skew || 'NEUTRAL';
  var risk_color = risk_skew === 'DOWNSIDE' ? '#D50000' :
                   risk_skew === 'UPSIDE' ? '#00C853' : '#FF9100';

  var html = '';

  // ─── PAGE 1: Cover ──────────────────────────────────────────────────────
  html += '<div style="' +
    'page-break-after: always; ' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    'height: 297mm; ' +
    'display: flex; ' +
    'flex-direction: column; ' +
    'justify-content: space-between; ' +
    '">';

  // Header
  html += '<div>';
  html += '<div style="font-size: 10px; letter-spacing: 2px; color: #1B2A4A; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">' +
    'Continuum Intelligence' +
    '</div>';
  html += '<div style="font-size: 9px; color: #888; margin-bottom: 24px;">' +
    'Investor Briefing — Plain English Summary' +
    '</div>';
  html += '<div style="border-bottom: 3px solid #1B2A4A; margin-bottom: 40px;"></div>';

  // Title
  html += '<div style="margin-bottom: 40px;">';
  html += '<h1 style="font-size: 32px; color: #1B2A4A; margin: 0 0 8px 0; font-weight: 700;">' +
    escapeHtmlForPdf(stock.company) +
    '</h1>';
  html += '<div style="font-size: 14px; color: #666; margin-bottom: 24px;">' +
    escapeHtmlForPdf(stock.ticker) + ' &bull; As of ' + date +
    '</div>';

  var dom = stock.hypotheses[stock.dominant];
  
  // Summary in plain English
  html += '<div style="background: #ffffff; padding: 16px; border: 1px solid #ddd; margin-bottom: 24px; line-height: 1.6;">';
  html += '<div style="font-size: 12px; font-weight: 700; color: #1B2A4A; margin-bottom: 8px;">' +
    'What the evidence says' +
    '</div>';
  html += '<div style="font-size: 12px; color: #444; line-height: 1.8;">' +
    escapeHtmlForPdf(dom.plain_english || dom.description || 'Analysis in progress.') +
    '</div>';
  html += '</div>';

  // Price and key metrics
  html += '<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 11px;">';
  html += '<tr style="background: #F2F2F2;">';
  html += '<td style="padding: 6px 12px; font-weight: 700; border: 1px solid #ddd;">Share Price</td>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; font-weight: 700; font-size: 14px;">A$' +
    (stock.current_price ? Number(stock.current_price).toFixed(2) : 'N/A') +
    '</td>';
  html += '</tr>';
  html += '<tr>';
  html += '<td style="padding: 6px 12px; font-weight: 700; border: 1px solid #ddd; background: #fafafa;">Risk Level</td>';
  html += '<td style="padding: 6px 12px; border: 1px solid #ddd; background: #fafafa; color: ' + risk_color + '; font-weight: 700;">' +
    risk_skew +
    '</td>';
  html += '</tr>';
  html += '</table>';

  // Hypothesis bars (simplified for retail)
  html += '<div style="background: #ffffff; padding: 12px; border: 1px solid #ddd; margin-bottom: 24px;">';
  html += '<div style="font-size: 12px; font-weight: 700; color: #1B2A4A; margin-bottom: 12px;">' +
    'What the Market is Pricing In' +
    '</div>';

  var hyp_ids = ['T1', 'T2', 'T3', 'T4'];
  for (var i = 0; i < hyp_ids.length; i++) {
    var hId = hyp_ids[i];
    var h = stock.hypotheses[hId];
    if (!h) continue;

    var color = getHypothesisColor(hId);
    var score = Math.round(h.survival_score * 100);

    html += '<div style="margin-bottom: 8px;">';
    html += '<div style="display: flex; justify-content: space-between; margin-bottom: 2px; font-size: 11px;">';
    html += '<span>' + hId + ': ' + escapeHtmlForPdf(h.label) + '</span>';
    html += '<span style="font-weight: 700; color: ' + color.hex + ';">' + score + '%</span>';
    html += '</div>';
    html += '<div style="background: #f0f0f0; height: 6px; border-radius: 3px; overflow: hidden;">';
    html += '<div style="background: ' + color.hex + '; height: 100%; width: ' + score + '%;"></div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>';

  // Footer
  html += '<div style="border-top: 1px solid #ddd; padding-top: 12px;">';
  html += '<div style="font-size: 8px; color: #999; line-height: 1.4;">' +
    '© 2026 Continuum Intelligence. This is not personal financial advice. ' +
    'Consult a licensed financial adviser before making investment decisions.' +
    '</div>';
  html += '</div>';

  html += '</div>';

  // ─── PAGE 2: What to Watch ──────────────────────────────────────────────
  html += '<div style="' +
    'page-break-after: always; ' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    '">';

  html += '<h2 style="font-size: 18px; color: #2E5090; border-bottom: 2px solid #2E5090; padding-bottom: 8px; margin: 0 0 16px 0; font-weight: 700;">' +
    'What Could Go Right' +
    '</h2>';

  if (dom.upside) {
    html += '<div style="background: #ffffff; padding: 12px; border-left: 4px solid #00C853; margin-bottom: 16px; font-size: 11px; line-height: 1.6; color: #333;">' +
      escapeHtmlForPdf(dom.upside) +
      '</div>';
  }

  html += '<h2 style="font-size: 18px; color: #2E5090; border-bottom: 2px solid #2E5090; padding-bottom: 8px; margin: 24px 0 16px 0; font-weight: 700;">' +
    'What Could Go Wrong' +
    '</h2>';

  if (dom.risk_plain) {
    html += '<div style="background: #ffffff; padding: 12px; border-left: 4px solid #D50000; margin-bottom: 16px; font-size: 11px; line-height: 1.6; color: #333;">' +
      escapeHtmlForPdf(dom.risk_plain) +
      '</div>';
  }

  html += '<h2 style="font-size: 18px; color: #2E5090; border-bottom: 2px solid #2E5090; padding-bottom: 8px; margin: 24px 0 16px 0; font-weight: 700;">' +
    'What We Are Watching' +
    '</h2>';

  if (dom.what_to_watch) {
    html += '<div style="background: #ffffff; padding: 12px; border-left: 4px solid #FF9100; font-size: 11px; line-height: 1.6; color: #333;">' +
      escapeHtmlForPdf(dom.what_to_watch) +
      '</div>';
  }

  html += '</div>';

  // ─── PAGE 3: How to Read + Disclaimer ────────────────────────────────────
  html += '<div style="' +
    'font-family: Arial, sans-serif; ' +
    'background: #f8f9fa; ' +
    'padding: 40mm 18mm; ' +
    'color: #333; ' +
    'font-size: 11px; ' +
    'line-height: 1.6; ' +
    '">';

  html += '<h2 style="font-size: 16px; color: #1B2A4A; margin: 0 0 12px 0; font-weight: 700;">' +
    'How to Read This Briefing' +
    '</h2>';

  html += '<div style="background: #ffffff; padding: 12px; border: 1px solid #ddd; margin-bottom: 24px; font-size: 10px; line-height: 1.6;">' +
    '<p><strong>The four scenarios above</strong> represent competing explanations for how this company might perform.</p>' +
    '<p><strong>The percentages</strong> show how much evidence currently supports each scenario, based on recent announcements, ' +
    'earnings, and market behaviour.</p>' +
    '<p><strong>A higher percentage</strong> means stronger evidence, not a prediction of what will happen. Markets and ' +
    'companies change.</p>' +
    '<p><strong>Your job:</strong> Consider whether these scenarios match your own analysis and risk tolerance. ' +
    'Disagree with our percentages? That\'s valuable — it might mean the market has misprice this stock.</p>' +
    '</div>';

  html += '<h2 style="font-size: 14px; color: #1B2A4A; margin: 20px 0 12px 0; font-weight: 700;">' +
    'Important' +
    '</h2>';

  html += '<div style="font-size: 10px; color: #666; line-height: 1.6; background: #fff8f0; padding: 12px; border-left: 4px solid #D50000;">' +
    'This is not personal financial advice. Before making any investment decision, please consult a licensed financial adviser. ' +
    'The information in this briefing comes from public sources and is believed to be accurate but is not guaranteed. ' +
    'Past performance is not a reliable guide to future results.' +
    '</div>';

  html += '<div style="border-top: 1px solid #ddd; padding-top: 12px; margin-top: 24px; font-size: 9px; color: #999;">' +
    '© 2026 Continuum Intelligence. All rights reserved.' +
    '</div>';

  html += '</div>';

  return html;
}

// ─── Main PDF generation function ───────────────────────────────────────────

window.generateReport = function (format) {
  // 1. Get stock data
  var stock = window.DNE_STOCK;
  
  if (!stock || !stock.ticker) {
    alert('Stock data not loaded yet. Please wait a moment and try again.');
    console.error('[PDF] DNE_STOCK not available', window.DNE_STOCK);
    return;
  }

  console.log('[PDF] Starting report generation for:', stock.ticker, 'format:', format);

  // 2. Build the HTML
  var reportHTML = format === 'retail'
    ? buildRetailReportHTML(stock)
    : buildInstitutionalReportHTML(stock);

  if (!reportHTML || reportHTML.length < 100) {
    alert('Failed to generate report HTML.');
    console.error('[PDF] HTML generation failed, length:', reportHTML ? reportHTML.length : 0);
    return;
  }

  console.log('[PDF] HTML generated, length:', reportHTML.length);

  // 3. Create a complete standalone HTML document
  var fullDocument = '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    '<title>' + escapeHtmlForPdf(stock.ticker) + ' Report</title>' +
    '<style>' +
    'body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: white; color: #333; }' +
    '@page { size: A4; margin: 20mm; }' +
    '</style>' +
    '</head>' +
    '<body>' +
    reportHTML +
    '</body>' +
    '</html>';

  // 4. Open a new window and write the complete document directly
  var printWindow = window.open('', 'PrintReport_' + Date.now());
  
  console.log('[PDF] Print window opened');

  if (!printWindow) {
    alert('Unable to open print window. Please check if popups are blocked in your browser.');
    console.error('[PDF] Failed - popup blocked');
    return;
  }

  // Write complete document to the new window
  printWindow.document.write(fullDocument);
  printWindow.document.close();

  console.log('[PDF] Document written and closed');

  // 5. Wait for rendering, then trigger print dialog
  setTimeout(function() {
    try {
      printWindow.focus();
      printWindow.print();
      console.log('[PDF] Print dialog triggered');
      
      // Close window after print completes
      setTimeout(function() {
        printWindow.close();
        console.log('[PDF] Window closed after print');
      }, 1000);
    } catch (err) {
      console.error('[PDF] Error during print:', err);
    }
  }, 300);
};
