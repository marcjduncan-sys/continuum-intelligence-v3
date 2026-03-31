// Signal bars section renderer
// Extracted from report-sections.js without logic changes

import { computeSkewScore } from '../../lib/dom.js';
import { formatSignedPercent, formatPercent, formatPriceWithCurrency } from '../../lib/format.js';

export function renderSignalBars(data) {
  const tls = data.three_layer_signal || {};
  const ta  = data.technicalAnalysis;
  let rows = '';

  // Row 1: Technical Indicators
  if (ta) {
    const regime     = ta.regime || '';
    const isCritical = /break|bear|crash/i.test(regime);
    const isPositive = /up|bull|accum|recov/i.test(regime);
    const regimeCls  = isCritical ? 'critical' : isPositive ? 'positive' : 'neutral';
    const badgeLabel = isCritical ? 'Critical' : isPositive ? 'Positive' : (regime.split(/[\s\u2014\u2013-]/)[0] || 'Neutral');

    const currentP = parseFloat(data._livePrice || data.price || 0);
    const ph = data.priceHistory;
    let dailyChange = '', dailyCls = '';
    if (data._liveChangePct != null && !isNaN(data._liveChangePct)) {
      var chg = parseFloat(data._liveChangePct);
      dailyCls    = chg >= 0 ? 'pos' : 'neg';
      dailyChange = formatSignedPercent(chg) + ' today';
    } else if (ph && ph.length >= 2) {
      const last2 = parseFloat(ph[ph.length - 1]);
      const prev2 = parseFloat(ph[ph.length - 2]);
      if (!isNaN(last2) && !isNaN(prev2) && prev2 !== 0) {
        var chg = (last2 - prev2) / prev2 * 100;
        dailyCls    = chg >= 0 ? 'pos' : 'neg';
        dailyChange = formatSignedPercent(chg) + ' today';
      }
    }
    let fromPeak = '', fromPeakCls = '';
    if (ta.trend && ta.trend.drawdown != null) {
      fromPeak    = formatPercent(ta.trend.drawdown) + ' from peak';
      fromPeakCls = ta.trend.drawdown < 0 ? 'neg' : 'pos';
    }
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + regimeCls + '"></span>' +
        '<span class="sb-row-label">Technical Indicators</span>' +
        '<span class="sb-badge ' + regimeCls + '">' + badgeLabel + '</span>' +
        '<div class="sb-items">' +
          (currentP ? '<span class="sb-item">' + formatPriceWithCurrency(currentP) + '</span><span class="sb-sep">|</span>' : '') +
          (dailyChange ? '<span class="sb-item ' + dailyCls + '">' + dailyChange + '</span>' : '') +
          (fromPeak    ? '<span class="sb-sep">|</span><span class="sb-item ' + fromPeakCls + '">' + fromPeak + '</span>' : '') +
        '</div>' +
      '</div>';
  }

  // Row 2: Macro Environment
  if (tls) {
    const macSig   = tls.macro_signal  || 0;
    const macCls   = macSig >  10 ? 'positive' : macSig < -10 ? 'downside' : 'neutral';
    const macLabel = macSig >  10 ? 'SUPPORTIVE' : macSig < -10 ? 'HEADWIND' : 'NEUTRAL';
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + macCls + '"></span>' +
        '<span class="sb-row-label">Macro Environment</span>' +
        '<span class="sb-badge ' + macCls + '">' + macLabel + '</span>' +
        '<div class="sb-items">' +
          '<span class="sb-item">Signal ' + (macSig > 0 ? '+' : '') + Math.round(macSig) + '</span>' +
          (tls.external_weight ? '<span class="sb-sep">|</span><span class="sb-item">Weight ' + Math.round(tls.external_weight) + '%</span>' : '') +
        '</div>' +
      '</div>';
  }

  // Row 3: Sector Narrative
  if (tls) {
    const secSig   = tls.sector_signal || 0;
    const secCls   = secSig >  10 ? 'positive' : secSig < -10 ? 'downside' : 'neutral';
    const secLabel = secSig >  10 ? 'POSITIVE'  : secSig < -10 ? 'NEGATIVE'  : 'NEUTRAL';
    const secName  = (data.sector || '') + (data.sectorSub ? ' / ' + data.sectorSub : '');
    const secWeight = tls.external_weight || 0;
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + secCls + '"></span>' +
        '<span class="sb-row-label">Sector Narrative</span>' +
        '<span class="sb-badge ' + secCls + '">' + secLabel + '</span>' +
        '<div class="sb-items">' +
          (secName ? '<span class="sb-item">' + secName + '</span><span class="sb-sep">|</span>' : '') +
          '<span class="sb-item">Signal ' + (secSig > 0 ? '+' : '') + Math.round(secSig) + '</span>' +
          '<span class="sb-sep">|</span>' +
          '<span class="sb-item">Weight ' + Math.round(secWeight) + '%</span>' +
          '<span class="sb-sep">|</span>' +
          '<span class="sb-item">Contribs 0</span>' +
        '</div>' +
      '</div>';
  }

  // Row 4: Company Research
  const skew     = data._skew || computeSkewScore(data);
  const compCls  = skew.score < -5 ? 'downside' : skew.score > 5 ? 'upside' : 'neutral';
  const compBadge= skew.score < -5 ? 'DOWNSIDE'  : skew.score > 5 ? 'UPSIDE'  : 'NEUTRAL';
  const scoreLbl = (skew.score > 0 ? '+' : '') + skew.score;
  const hyps     = (tls && tls.company_detail && tls.company_detail.hypotheses)
                   ? tls.company_detail.hypotheses
                   : (skew.hypotheses || []);

  let bearCt = 0, bullCt = 0;
  for (let hi = 0; hi < hyps.length; hi++) {
    if      (hyps[hi].direction === 'downside') bearCt++;
    else if (hyps[hi].direction === 'upside')   bullCt++;
  }

  let dominant = null, domMax = -1;
  for (let di = 0; di < hyps.length; di++) {
    const dh = hyps[di], dw = dh.weight || 0;
    if ((skew.score < 0 && dh.direction === 'downside' && dw > domMax) ||
        (skew.score >= 0 && dh.direction === 'upside'  && dw > domMax)) {
      domMax = dw; dominant = dh;
    }
  }

  const sorted = hyps.slice().sort(function(a,b){ return (b.weight||0)-(a.weight||0); });
  let chipsHtml = '';
  for (let ci = 0; ci < sorted.length; ci++) {
    const sh = sorted[ci];
    const chipCls  = sh.direction === 'downside' ? 'downside' : sh.direction === 'upside' ? 'upside' : '';
    const nMatch   = sh.title ? sh.title.match(/^([NT]\d+)/i) : null;
    const nCode    = nMatch ? nMatch[1].toUpperCase() : ((sh.tier || '').toUpperCase().match(/^[NT]\d+/) || [''])[0];
    const descParts= (sh.title || '').replace(/^[NT]\d+[:\s]*/i,'').split(' ');
    const keyWord  = (descParts[0] || '').toLowerCase() === 'structural' && descParts[1]
                   ? descParts[1] : (descParts[0] || '');
    chipsHtml +=
      '<span class="sb-hyp-chip ' + chipCls + '">' +
        nCode + (keyWord ? ' ' + keyWord.toUpperCase() : '') +
        '<span class="chip-pct">' + Math.round(sh.weight || 0) + '%</span>' +
      '</span>';
  }

  rows +=
    '<div class="sb-row">' +
      '<span class="sb-indicator ' + compCls + '"></span>' +
      '<span class="sb-row-label">Company Research</span>' +
      '<span class="sb-badge ' + compCls + '">' + compBadge + '</span>' +
      '<div class="sb-company-body">' +
        '<div class="sb-score-line">' +
          '<span class="sb-score ' + compCls + '">' + scoreLbl + ' &#9660;</span>' +
          '<div class="sb-score-track">' +
            '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
            '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
          '</div>' +
        '</div>' +
        (hyps.length
          ? '<div class="sb-desc">' +
              bearCt + ' bear / ' + bullCt + ' bull' +
              (dominant ? ' &bull; Dominant: ' + dominant.title + ' (' + dominant.direction.toUpperCase() + ')' : '') +
            '</div>'
          : '') +
        (chipsHtml ? '<div class="sb-hyp-chips">' + chipsHtml + '</div>' : '') +
      '</div>' +
    '</div>';

  return '<div class="signal-bars-section">' +
    '<div class="report-hero-inner">' + rows + '</div>' +
  '</div>';
}
