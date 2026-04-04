// Report hero section renderer
// Extracted from report-sections.js without logic changes

import { STOCK_DATA, ANNOUNCEMENTS_DATA, FEATURED_ORDER } from '../../lib/state.js';
import { renderSparkline, formatDateAEST, fmtPE, formatPrice, formatPriceWithCurrency, svgCoord, formatSignedPercent } from '../../lib/format.js';

export function renderRefreshControls(data) {
  return '<div class="refresh-controls">' +
    '<button class="btn-refresh" id="refresh-btn-' + data.ticker + '" onclick="triggerRefresh(\'' + data.ticker + '\')">' +
      '<span class="refresh-icon">&#8635;</span> Update' +
    '</button>' +
    '<span id="staleness-mount-' + (data.ticker || '').toLowerCase() + '"></span>' +
    '<span class="refresh-timestamp" id="refresh-ts-' + data.ticker + '">' +
      (data.date ? 'Last updated: ' + formatDateAEST(data.date) : '') +
    '</span>' +
    '<div class="refresh-progress" id="refresh-progress-' + data.ticker + '" style="display:none">' +
      '<div class="progress-bar"><div class="progress-fill" id="refresh-fill-' + data.ticker + '"></div></div>' +
      '<span class="progress-label" id="refresh-label-' + data.ticker + '">Searching for new data...</span>' +
    '</div>' +
  '</div>';
}

export function renderDecisionRibbon(data) {
  const livePrice = data._livePrice || data.price || '';
  const current = parseFloat(livePrice) || 0;
  const currency = data.currency || 'A$';
  const verdictClass = data.hero && data.hero.skew === 'UPSIDE' ? 'upside' :
    data.hero && data.hero.skew === 'DOWNSIDE' ? 'downside' : 'balanced';
  const verdictLabel = data.hero && data.hero.skew
    ? data.hero.skew.charAt(0) + data.hero.skew.slice(1).toLowerCase()
    : 'Balanced';

  // Chevron SVG for verdict tag
  const chevronUp = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="18 15 12 9 6 15"/></svg>';
  const chevronDown = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="6 9 12 15 18 9"/></svg>';
  const verdictChevron = verdictClass === 'upside' ? chevronUp : verdictClass === 'downside' ? chevronDown : '';

  // Calculate EWP from worlds
  let ewpValue = 0;
  const worlds = (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds) || [];
  const norm = data.hypotheses ? (function() {
    // Use normalised scores as probability weights
    const hyps = data.hypotheses;
    let total = 0;
    for (let i = 0; i < hyps.length; i++) total += parseFloat(hyps[i].score) || 0;
    return hyps.map(function(h) { return total > 0 ? (parseFloat(h.score) || 0) / total : 0; });
  })() : [];

  if (worlds.length) {
    for (let wi = 0; wi < worlds.length; wi++) {
      const prob = norm[wi] || (worlds[wi].probability || (1 / worlds.length));
      ewpValue += (parseFloat(worlds[wi].price) || 0) * prob;
    }
  }

  // EWP gap
  const ewpGap = current > 0 && ewpValue > 0 ? ((ewpValue - current) / current * 100) : 0;
  const gapCls = ewpGap >= 0 ? 'pos' : 'neg';
  const gapSign = ewpGap >= 0 ? '+' : '';
  const gapLabel = ewpGap >= 0 ? 'Upside to EWP' : 'Downside to EWP';

  // Evidence domain count
  const evCount = (data.evidence && data.evidence.cards) ? data.evidence.cards.length : 0;

  // Build EWP strip (4-column per prototype)
  let ewpHtml = '';
  if (ewpValue > 0 || current > 0) {
    ewpHtml = '<div class="ewp-strip">' +
      '<div class="ewp-cell">' +
        '<div class="ewp-k">Live Market Price</div>' +
        '<div class="ewp-v">' + formatPriceWithCurrency(current, currency) + '</div>' +
        '<div class="ewp-sub">' + (data.exchange || 'ASX') + ' &middot; ' + (data.date ? formatDateAEST(data.date) : '') + '</div>' +
      '</div>' +
      '<div class="ewp-cell highlight">' +
        '<div class="ewp-k">Evidence Weighted Price</div>' +
        '<div class="ewp-v">' + formatPriceWithCurrency(ewpValue, currency) + '</div>' +
        '<div class="ewp-sub">ACH probability-weighted &middot; ' + worlds.length + ' cases</div>' +
      '</div>' +
      '<div class="ewp-cell">' +
        '<div class="ewp-k">EWP Gap</div>' +
        '<div class="ewp-gap-v ' + gapCls + '">' + gapSign + ewpGap.toFixed(1) + '%</div>' +
        '<div class="ewp-gap-badge ' + gapCls + '">' + (ewpGap >= 0 ? chevronUp : chevronDown) + ' ' + gapLabel + '</div>' +
      '</div>' +
      '<div class="ewp-cell">' +
        '<div class="ewp-k">Confidence</div>' +
        '<div style="font-size:18px;font-weight:800;color:var(--blue);">TBC</div>' +
        '<div class="ewp-sub">Evidence weight</div>' +
      '</div>' +
    '</div>' +
    '<div class="ewp-methodology">' +
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>' +
      ' EWP is derived from the probability-weighted price targets of all four ACH cases, adjusted by evidence strength. It is not a price target.' +
    '</div>';
  }

  // Key stats row (5 columns matching prototype)
  let bullTarget = '';
  let bearTarget = '';
  for (let wi = 0; wi < worlds.length; wi++) {
    const wl = (worlds[wi].label || '').toLowerCase();
    if (wl.indexOf('bull') >= 0) bullTarget = formatPriceWithCurrency(worlds[wi].price, currency, 0);
    if (wl.indexOf('bear') >= 0) bearTarget = formatPriceWithCurrency(worlds[wi].price, currency, 0);
  }
  const marketCap = data.marketCap || (data.heroMetrics && data.heroMetrics[0] ? data.heroMetrics[0].value : 'TBC');
  // Find 52W range from heroMetrics
  let range52w = 'TBC';
  if (data.heroMetrics) {
    for (let mi = 0; mi < data.heroMetrics.length; mi++) {
      const lbl = (data.heroMetrics[mi].label || '').toLowerCase();
      if (lbl.indexOf('52') >= 0 || lbl.indexOf('range') >= 0 || lbl.indexOf('high') >= 0) {
        range52w = data.heroMetrics[mi].value || 'TBC';
        break;
      }
    }
  }

  const statsHtml = '<div class="dr-stats">' +
    '<div class="dr-stat"><div class="dr-stat-k">Market Cap</div><div class="dr-stat-v">' + marketCap + '</div></div>' +
    '<div class="dr-stat"><div class="dr-stat-k">52W Range</div><div class="dr-stat-v">' + range52w + '</div></div>' +
    '<div class="dr-stat"><div class="dr-stat-k">Bull Case Target</div><div class="dr-stat-v pos">' + (bullTarget || 'TBC') + '</div></div>' +
    '<div class="dr-stat"><div class="dr-stat-k">Bear Case Target</div><div class="dr-stat-v neg">' + (bearTarget || 'TBC') + '</div></div>' +
    '<div class="dr-stat"><div class="dr-stat-k">ACH Cases</div><div class="dr-stat-v neu">' + worlds.length + ' Active</div></div>' +
  '</div>';

  // Prev/next stock navigation
  const _navTickers = (typeof FEATURED_ORDER !== 'undefined') ? FEATURED_ORDER : Object.keys(STOCK_DATA);
  const _navIdx = _navTickers.indexOf(data.ticker);
  const _prevTicker = _navTickers[(_navIdx - 1 + _navTickers.length) % _navTickers.length];
  const _nextTicker = _navTickers[(_navIdx + 1) % _navTickers.length];
  const stockNavHtml = '<div class="rh-stock-nav-bar">' +
    '<div class="rh-stock-nav">' +
      '<a href="#report-' + _prevTicker + '" onclick="navigate(\'report-' + _prevTicker + '\');return false;">&lsaquo; ' + _prevTicker + '</a>' +
      '<a href="#report-' + _nextTicker + '" onclick="navigate(\'report-' + _nextTicker + '\');return false;">' + _nextTicker + ' &rsaquo;</a>' +
    '</div>' +
  '</div>';

  // Live price change display
  let priceChgHtml = '';
  if (livePrice) {
    priceChgHtml = '<div class="dr-live-price">Live <strong>' + formatPriceWithCurrency(current, currency) + '</strong></div>';
  }

  return stockNavHtml +
    '<div class="decision-ribbon">' +
      '<div class="dr-head">' +
        '<div class="dr-badge">' + (data.ticker || '') + '</div>' +
        '<div>' +
          '<div class="dr-company">' + (data.company || data.ticker || '') + '</div>' +
          '<div class="dr-meta">' +
            '<span>' + (data.sector || '') + '</span>' +
            (data.exchange ? '<span class="sep">&middot;</span><span>' + data.exchange + ': ' + data.ticker + '</span>' : '') +
            (data.date ? '<span class="sep">&middot;</span><span>Updated ' + formatDateAEST(data.date) + '</span>' : '') +
            (evCount ? '<span class="sep">&middot;</span><span>' + evCount + ' Evidence Domains</span>' : '') +
          '</div>' +
        '</div>' +
        '<div class="dr-verdict-block">' +
          '<div class="verdict-tag ' + verdictClass + '">' + verdictChevron + ' ' + verdictLabel + '</div>' +
          priceChgHtml +
        '</div>' +
      '</div>' +
      ewpHtml +
      statsHtml +
      renderRefreshControls(data) +
    '</div>';
}

export function renderReportHero(data) {
  if (!data.heroMetrics || !data.heroMetrics.length) return '';
  let metricsHtml = '';
  for (var i = 0; i < data.heroMetrics.length; i++) {
    const m = data.heroMetrics[i];
    const cls = 'rh-metric-value' + (m.colorClass ? ' ' + m.colorClass : '');
    metricsHtml += '<div class="rh-metric"><div class="rh-metric-label">' + m.label + '</div><div class="' + cls + '">' + m.value + '</div></div>';
  }

  const sparklineHtml = data.priceHistory ? renderSparkline(data.priceHistory) : '';

  // Hero announcements -- latest 4 ASX announcements for this ticker
  let heroAnnouncementsHtml = '';
  const tickerAnns = ANNOUNCEMENTS_DATA[data.ticker];
  if (tickerAnns && tickerAnns.length > 0) {
    let annItems = '';
    const count = Math.min(tickerAnns.length, 4);
    for (let a = 0; a < count; a++) {
      const ann = tickerAnns[a];
      let annDate = '';
      if (ann.date) {
        const d = new Date(ann.date);
        annDate = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
      }
      const headlineText = ann.headline || '';
      const annLink = ann.url
        ? '<a href="' + ann.url + '" target="_blank" rel="noopener">' + headlineText + '</a>'
        : headlineText;
      const sensitiveIcon = ann.sensitive ? '<span class="rh-ann-sensitive" title="Price sensitive">&#9679;</span>' : '';
      annItems +=
        '<div class="rh-ann-item">' +
          '<span class="rh-ann-date">' + annDate + '</span>' +
          sensitiveIcon +
          '<span class="rh-ann-headline">' + annLink + '</span>' +
          (ann.size ? '<span class="rh-ann-size">' + ann.size + '</span>' : '') +
        '</div>';
    }
    heroAnnouncementsHtml =
      '<div class="rh-announcements">' +
        '<div class="rh-ann-header">ASX Announcements' +
          '<a href="https://www.asx.com.au/markets/company/' + data.ticker + '" target="_blank" rel="noopener" class="rh-ann-more">See all &#8599;</a>' +
        '</div>' +
        annItems +
      '</div>';
  }

  // Spec Section 1.2 -- What the Price Embeds
  let embeddedThesisHtml = '';
  if (data.hero && data.hero.embedded_thesis) {
    embeddedThesisHtml =
      '<div class="rh-spec-block rh-embedded-thesis">' +
        '<div class="rh-spec-label">WHAT THE PRICE EMBEDS</div>' +
        '<p class="rh-spec-text">' + data.hero.embedded_thesis + '</p>' +
      '</div>';
  }

  // Spec Section 1.3 -- Position in Range
  let positionInRangeHtml = '';
  if (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds && data.hero.position_in_range.worlds.length > 0) {
    const pir = data.hero.position_in_range;
    const worlds = pir.worlds;
    const current = parseFloat(data._livePrice || data.price || pir.current_price);
    const prices = worlds.map(function(w) { w.price = parseFloat(w.price) || 0; return w.price; });
    prices.push(current);
    const minP = Math.min.apply(null, prices);
    const maxP = Math.max.apply(null, prices);
    const rangeP = maxP - minP || 1;

    // Map hypothesis weights to worlds via direction-based sort
    const pirWeights = [];
    let skewObj = data._skew;
    if (typeof skewObj === 'string') { try { skewObj = JSON.parse(skewObj); } catch (e) { skewObj = null; } }
    if (skewObj && skewObj.hypotheses && skewObj.hypotheses.length === worlds.length) {
      const dirOrd = { downside: 0, neutral: 1, upside: 2 };
      const sorted = skewObj.hypotheses.map(function(h) {
        const tMatch = (h.title || '').match(/N(\d)/);
        return { weight: parseInt(h.weight) || 0, direction: h.direction || 'neutral', tierNum: tMatch ? parseInt(tMatch[1]) : 9 };
      }).sort(function(a, b) {
        const da = dirOrd[a.direction] != null ? dirOrd[a.direction] : 1;
        const db = dirOrd[b.direction] != null ? dirOrd[b.direction] : 1;
        if (da !== db) return da - db;
        if (a.weight !== b.weight) return a.weight - b.weight;
        return b.tierNum - a.tierNum;
      });
      for (let si = 0; si < sorted.length; si++) pirWeights.push(sorted[si].weight);
    }

    // Derive implied valuation metric for each world price
    let pirValLabel = '';
    let pirDenom = 0;
    if (data.heroMetrics) {
      for (let vi = 0; vi < data.heroMetrics.length; vi++) {
        const mLbl = data.heroMetrics[vi].label || '';
        if (/P\/E|P\/B|EV\/|P\/S|P\/NTA/i.test(mLbl)) {
          const mVal = String(data.heroMetrics[vi].value || '').replace(/[~x]/g, '');
          const parsed = parseFloat(mVal);
          if (parsed > 0 && isFinite(parsed) && current > 0) {
            pirValLabel = mLbl;
            pirDenom = current / parsed;
          }
          break;
        }
      }
    }

    let worldMarkersHtml = '';
    for (var i = 0; i < worlds.length; i++) {
      const w = worlds[i];
      const pct = svgCoord((w.price - minP) / rangeP * 100);
      const probStr = pirWeights[i] != null ? ' (' + pirWeights[i] + '%)' : '';
      let metricHtml = '';
      if (pirDenom > 0 && w.price > 0) {
        const implied = w.price / pirDenom;
        const formatted = fmtPE(implied);
        if (formatted) {
          metricHtml = '<div class="pir-world-metric">' + formatted + ' ' + pirValLabel + '</div>';
        }
      }
      worldMarkersHtml +=
        '<div class="pir-world" style="left:' + pct + '%">' +
          '<div class="pir-world-tick"></div>' +
          '<div class="pir-world-price">' + formatPriceWithCurrency(w.price, 'A$', 0) + '</div>' +
          '<div class="pir-world-label">' + w.label + probStr + '</div>' +
          metricHtml +
        '</div>';
    }
    const currentPct = svgCoord((current - minP) / rangeP * 100);

    // Probability-weighted average price
    let weightedAvgHtml = '';
    const hasProbs = worlds.length > 0 && worlds[0].probability != null;
    if (hasProbs) {
      let weightedAvg = 0;
      for (let wi = 0; wi < worlds.length; wi++) {
        weightedAvg += (parseFloat(worlds[wi].probability) || 0) * worlds[wi].price;
      }
      const wavgPct = svgCoord((weightedAvg - minP) / rangeP * 100);
      const wavgDelta = ((weightedAvg - current) / current * 100);
      const wavgDeltaCls = wavgDelta >= 0 ? 'upside' : 'downside';
      const wavgDeltaLabel = formatSignedPercent(wavgDelta) + ' ' + wavgDeltaCls;
      weightedAvgHtml =
        '<div class="pir-weighted-avg" style="left:' + wavgPct + '%">' +
          '<div class="pir-weighted-avg-label">' + formatPriceWithCurrency(weightedAvg) + '</div>' +
          '<div class="pir-weighted-avg-delta ' + wavgDeltaCls + '">' + wavgDeltaLabel + '</div>' +
          '<div class="pir-weighted-avg-line"></div>' +
        '</div>';
    }

    positionInRangeHtml =
      '<div class="rh-spec-block rh-position-range">' +
        '<div class="rh-spec-label">POSITION IN RANGE</div>' +
        '<div class="pir-bar-wrap">' +
          '<div class="pir-bar">' +
            worldMarkersHtml +
            '<div class="pir-current" style="left:' + currentPct + '%">' +
              '<div class="pir-current-dot">&#9679;</div>' +
              '<div class="pir-current-label">' + formatPriceWithCurrency(current) + '</div>' +
            '</div>' +
            weightedAvgHtml +
          '</div>' +
        '</div>' +
        (pir.note ? '<div class="pir-note">' + pir.note + '</div>' : '') +
      '</div>';
  }

  // Spec Section 1.5 -- Skew Indicator
  let skewIndicatorHtml = '';
  if (data.hero && data.hero.skew) {
    const skewCls = data.hero.skew === 'DOWNSIDE' ? 'rh-skew-down' : data.hero.skew === 'UPSIDE' ? 'rh-skew-up' : 'rh-skew-balanced';
    skewIndicatorHtml =
      '<div class="rh-spec-block rh-skew-indicator">' +
        '<span class="rh-spec-label">SKEW: </span>' +
        '<span class="rh-skew-value ' + skewCls + '">' + data.hero.skew + '</span>' +
        (data.hero.skew_description ? '<p class="rh-spec-text">' + data.hero.skew_description + '</p>' : '') +
      '</div>';
  }

  // Spec Section 1.5 -- Next Decision Point
  let nextDecisionHtml = '';
  if (data.hero && data.hero.next_decision_point) {
    const ndp = data.hero.next_decision_point;
    nextDecisionHtml =
      '<div class="rh-spec-block rh-next-decision">' +
        '<div class="rh-spec-label">NEXT DECISION POINT</div>' +
        '<div class="ndp-event">' + ndp.event + ' &middot; <span class="ndp-date">' + ndp.date + '</span></div>' +
        '<p class="rh-spec-text">' + ndp.metric + '. ' + ndp.thresholds + '</p>' +
      '</div>';
  }

  // Prev/next stock navigation
  const _navTickers = (typeof FEATURED_ORDER !== 'undefined') ? FEATURED_ORDER : Object.keys(STOCK_DATA);
  const _navIdx = _navTickers.indexOf(data.ticker);
  const _prevTicker = _navTickers[(_navIdx - 1 + _navTickers.length) % _navTickers.length];
  const _nextTicker = _navTickers[(_navIdx + 1) % _navTickers.length];
  const stockNavHtml = '<div class="rh-stock-nav-bar">' +
    '<div class="rh-stock-nav">' +
      '<a href="#report-' + _prevTicker + '" onclick="navigate(\'report-' + _prevTicker + '\');return false;">&lsaquo; ' + _prevTicker + '</a>' +
      '<a href="#report-' + _nextTicker + '" onclick="navigate(\'report-' + _nextTicker + '\');return false;">' + _nextTicker + ' &rsaquo;</a>' +
    '</div>' +
  '</div>';

  return stockNavHtml +
  '<div class="report-hero">' +
    '<div class="report-hero-inner">' +
      '<a class="report-back" href="#home" onclick="navigate(\'home\')">&larr; Back to Coverage</a>' +
      '<div class="rh-main">' +
        '<div class="rh-left">' +
          '<div class="rh-type">Narrative Intelligence &mdash; Initial Coverage</div>' +
          '<div class="rh-ticker">' + (data.company || data.ticker || '') + '</div>' +
          '<div class="rh-company">' + (data.tickerFull || '') + ' &bull; ' + (data.exchange || '') + ' &bull; ' + (data.sector || '') + '</div>' +
          '<div class="rh-sector-tag">' + (data.heroDescription || '') + '</div>' +
          (data.heroCompanyDescription ? '<div class="rh-company-desc">' + data.heroCompanyDescription + '</div>' : '') +
          '<div class="refresh-controls">' +
            '<button class="btn-refresh" id="refresh-btn-' + data.ticker + '" onclick="triggerRefresh(\'' + data.ticker + '\')">' +
              '<span class="refresh-icon">&#8635;</span> Update' +
            '</button>' +
            '<span id="staleness-mount-' + (data.ticker || '').toLowerCase() + '"></span>' +
            '<span class="refresh-timestamp" id="refresh-ts-' + data.ticker + '">' +
              (data.date ? 'Last updated: ' + formatDateAEST(data.date) : '') +
            '</span>' +
            '<div class="refresh-progress" id="refresh-progress-' + data.ticker + '" style="display:none">' +
              '<div class="progress-bar"><div class="progress-fill" id="refresh-fill-' + data.ticker + '"></div></div>' +
              '<span class="progress-label" id="refresh-label-' + data.ticker + '">Searching for new data...</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rh-right">' +
          heroAnnouncementsHtml +
          '<div class="rh-right-bottom">' +
            sparklineHtml +
            '<div class="rh-price"><span class="rh-price-currency">' + (data.currency || '') + '</span>' + formatPrice(data.price) + '</div>' +
            '<div class="rh-metrics">' + metricsHtml + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>' +
  '<div class="rh-spec-section"><div class="report-hero-inner">' +
    embeddedThesisHtml +
    positionInRangeHtml +
    skewIndicatorHtml +
    nextDecisionHtml +
  '</div></div>';
}

export function renderDeepResearchHero(data) {
  const dc = data.deepContent || {};
  const livePrice = data._livePrice || data.price || '';

  // Progress track -- 5 research stages derived from deepContent
  const steps = [
    { label: 'Data Fetch',    status: dc.sections ? 'done'   : 'pending' },
    { label: 'Evidence Map',  status: dc.sections ? 'done'   : 'pending' },
    { label: 'ACH Analysis',  status: dc.stance   ? 'done'   : 'pending' },
    { label: 'Synthesis',     status: dc.executiveSummary ? 'active' : 'pending' },
    { label: 'Review',        status: 'active' },
  ];
  let progressHtml = '<div class="progress-track">';
  for (var pi = 0; pi < steps.length; pi++) {
    const s = steps[pi];
    progressHtml +=
      '<div class="progress-step' + (s.status === 'done' ? ' done' : s.status === 'active' ? ' active' : '') + '">' +
        '<div class="ps-num">0' + (pi + 1) + '</div>' +
        '<div class="ps-label">' + s.label + '</div>' +
        '<div class="ps-status">' + (s.status === 'done' ? 'Complete' : s.status === 'active' ? 'In progress' : 'Pending') + '</div>' +
      '</div>';
  }
  progressHtml += '</div>';

  // Stats strip
  const evCount = (dc.sections || []).reduce(function(n, s) { return n + (s.evidence ? s.evidence.length : 0); }, 0);
  const secCount = (dc.sections || []).length;
  const stanceLabel = dc.stance || 'Pending';

  const statsHtml =
    '<div class="dr-hero-meta">' +
      '<div class="dr-hero-stat"><div class="dr-hero-stat-k">Stance</div><div class="dr-hero-stat-v">' + stanceLabel + '</div></div>' +
      (evCount ? '<div class="dr-hero-stat"><div class="dr-hero-stat-k">Evidence Items</div><div class="dr-hero-stat-v">' + evCount + '</div></div>' : '') +
      (secCount ? '<div class="dr-hero-stat"><div class="dr-hero-stat-k">Sections</div><div class="dr-hero-stat-v">' + secCount + '</div></div>' : '') +
      (livePrice ? '<div class="dr-hero-stat"><div class="dr-hero-stat-k">Price</div><div class="dr-hero-stat-v">' + formatPrice(livePrice) + '</div></div>' : '') +
    '</div>';

  return renderRefreshControls(data) +
    '<div class="dr-hero">' +
      '<div class="dr-hero-top">' +
        '<div>' +
          '<div class="dr-hero-badge"><span class="dot"></span>Deep Research</div>' +
          '<div class="dr-hero-title">' + (data.company || data.ticker || '') + '</div>' +
          '<div class="dr-hero-sub">' + (data.sector || '') + (data.exchange ? ' &middot; ' + data.exchange : '') + '</div>' +
          statsHtml +
        '</div>' +
        '<div class="dr-hero-actions">' +
          '<button class="btn-light btn-white" onclick="navigate(\'report-' + data.ticker + '\')">&#8592; Standard Report</button>' +
        '</div>' +
      '</div>' +
      progressHtml +
    '</div>';
}
