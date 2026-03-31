// Hypothesis sidebar renderer
// Extracted from report-sections.js without logic changes

import { REFERENCE_DATA } from '../../lib/state.js';
import { normaliseScores, computeSkewScore } from '../../lib/dom.js';
import { formatPrice, formatPriceWithCurrency, formatSignedPercent, formatRatio, svgCoord } from '../../lib/format.js';

export function renderHypSidebar(data) {
  const t = data.ticker.toLowerCase();
  const ticker = data.ticker;

  let hypItems = '';
  if (data.hypotheses && data.hypotheses.length > 0) {
    const norm = normaliseScores(data.hypotheses);
    for (let i = 0; i < data.hypotheses.length; i++) {
      const h = data.hypotheses[i];
      const dc = h.dirClass || 'dir-neutral';
      const label = (h.title || '').replace(/^N\d+:\s*/, '');
      hypItems += '<div class="hs-item">' +
        '<div class="hs-dot ' + dc + '"></div>' +
        '<div class="hs-label">' + label + '</div>' +
        '<div class="hs-score ' + dc + '">' + norm[i] + '%</div>' +
      '</div>';
    }
  }

  const skew = data._skew || computeSkewScore(data);
  const skewDir = skew.direction || 'balanced';
  const skewLabel = skewDir.toUpperCase();
  const skewScoreNum = skew.score || 0;
  const skewScoreStr = (skewScoreNum > 0 ? '+' : '') + skewScoreNum;

  const tls = data.three_layer_signal || {};
  const macSig = tls.macro_signal || 0;
  const secSig = tls.sector_signal || 0;
  const macCls = macSig > 10 ? 'dir-up' : macSig < -10 ? 'dir-down' : 'dir-neutral';
  const secCls = secSig > 10 ? 'dir-up' : secSig < -10 ? 'dir-down' : 'dir-neutral';

  const ref = (typeof REFERENCE_DATA !== 'undefined') ? REFERENCE_DATA[ticker] : null;
  let peValue = '\u2014';
  let revGrowthValue = '\u2014';
  if (data.heroMetrics) {
    for (let mi = 0; mi < data.heroMetrics.length; mi++) {
      const mLabel = (data.heroMetrics[mi].label || '').toLowerCase();
      if (mLabel === 'fwd p/e' || mLabel === 'p/e') peValue = data.heroMetrics[mi].value;
      if (mLabel === 'rev growth' || mLabel === 'revenue growth') revGrowthValue = data.heroMetrics[mi].value;
    }
  }
  if (ref) {
    if (peValue === '\u2014' && ref.epsForward) {
      const currentP = parseFloat(data._livePrice || data.price || data.current_price || 0);
      if (currentP > 0) peValue = formatRatio(currentP / ref.epsForward);
    }
    if (revGrowthValue === '\u2014' && ref.revenueGrowth != null) {
      revGrowthValue = (ref.revenueGrowth > 0 ? '+' : '') + ref.revenueGrowth + '%';
    }
  }

  const livePrice = parseFloat(data._livePrice || data.price || data.current_price || 0);
  const ph = data.priceHistory;
  let changePct = null;
  if (ph && ph.length >= 2) {
    changePct = ((ph[ph.length - 1] - ph[ph.length - 2]) / ph[ph.length - 2] * 100);
  } else if (data.freshness && data.freshness.pricePctChange != null) {
    changePct = data.freshness.pricePctChange;
  }

  let vr = null;
  let vrBear = 0, vrFair = 0, vrBull = 0, vrZone = '', vrZoneCls = '';
  let vrToBull = '', vrToBear = '';
  if (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds &&
      data.hero.position_in_range.worlds.length >= 4) {
    const w = data.hero.position_in_range.worlds;
    vrBear = parseFloat(w[1].price) || 0;
    vrFair = (parseFloat(w[1].price) + parseFloat(w[2].price)) / 2;
    vrBull = parseFloat(w[3].price) || 0;
    vr = { low: vrBear, mid: vrFair, high: vrBull };
  } else if (data.valuation_range) {
    vr = data.valuation_range;
    vrBear = vr.low;
    vrFair = vr.mid;
    vrBull = vr.high;
  }
  if (vr && livePrice > 0) {
    if (livePrice < vrBear)      { vrZone = 'RED';   vrZoneCls = 'red'; }
    else if (livePrice > vrFair) { vrZone = 'GREEN'; vrZoneCls = 'green'; }
    else                         { vrZone = 'AMBER'; vrZoneCls = 'amber'; }
    vrToBull = formatPrice((vrBull / livePrice - 1) * 100, 1);
    vrToBear = formatPrice((vrBear / livePrice - 1) * 100, 1);
  }

  let inner = '';

  inner += '<div class="hs-stock-id">' +
    '<div class="hs-stock-ticker">' + (data.tickerFull || data.ticker || ticker) + '</div>' +
    '<div class="hs-price-row">';
  if (livePrice > 0) {
    inner += '<span class="hs-price">' + formatPriceWithCurrency(livePrice) + '</span>';
  }
  if (changePct !== null) {
    const chgCls = changePct >= 0 ? 'pos' : 'neg';
    inner += '<span class="hs-change-badge ' + chgCls + '">' +
      formatSignedPercent(changePct) + '</span>';
  }
  inner += '</div>' +
    '<div class="hs-stock-name">' + (data.company || '') + '</div>' +
  '</div>';

  inner += '<div class="hs-section-head">Driver Tracker</div>' + hypItems;

  inner += '<div class="hs-subhead">Risk Skew</div>';
  inner += '<div class="hs-overall-skew">' +
    '<span class="hs-skew-dir ' + skewDir + '">' + skewLabel + '</span>' +
    '<span class="hs-skew-score ' + skewDir + '">' + skewScoreStr + '</span>' +
  '</div>';

  inner += '<div class="hs-subhead">Ext. Environment</div>' +
    '<div class="hs-env-row">' +
      '<div class="hs-dot ' + macCls + '"></div>' +
      '<span class="hs-env-label">Macro</span>' +
      '<span class="hs-env-score">' + (macSig > 0 ? '+' : '') + Math.round(macSig) + '</span>' +
    '</div>' +
    '<div class="hs-env-row">' +
      '<div class="hs-dot ' + secCls + '"></div>' +
      '<span class="hs-env-label">Sector</span>' +
      '<span class="hs-env-score">' + (secSig > 0 ? '+' : '') + Math.round(secSig) + '</span>' +
    '</div>';

  inner += '<div class="hs-subhead">Company</div>' +
    '<div class="hs-company-row">' +
      '<span class="hs-company-label">P/E</span>' +
      '<span class="hs-company-value">' + peValue + '</span>' +
    '</div>' +
    '<div class="hs-company-row">' +
      '<span class="hs-company-label">Rev Growth</span>' +
      '<span class="hs-company-value">' + revGrowthValue + '</span>' +
    '</div>';

  if (vr && livePrice > 0) {
    const vrRange = vrBull - vrBear || 1;
    const vrCurrPct = svgCoord(Math.min(100, Math.max(0, ((livePrice - vrBear) / vrRange * 100))));
    inner += '<div class="hs-section-head">Valuation Range</div>' +
      '<div class="hs-val-section">' +
        '<div class="hs-val-header">' +
          '<span class="hs-val-zone ' + vrZoneCls + '">' + vrZone + '</span>' +
        '</div>' +
        '<div class="hs-val-levels">' +
          '<span>Bear<br>' + formatPriceWithCurrency(vrBear) + '</span>' +
          '<span>Fair<br>' + formatPriceWithCurrency(vrFair) + '</span>' +
          '<span>Bull<br>' + formatPriceWithCurrency(vrBull) + '</span>' +
        '</div>' +
        '<div class="hs-val-bar">' +
          '<div class="hs-val-marker" style="left:' + vrCurrPct + '%"></div>' +
        '</div>' +
        '<div class="hs-val-distances">' +
          '<span class="neg">' + vrToBear + '% to bear</span>' +
          '<span class="pos">+' + vrToBull + '% to bull</span>' +
        '</div>' +
      '</div>';
  }

  return '<div class="hyp-sidebar" id="' + t + '-sidebar">' + inner + '</div>';
}
