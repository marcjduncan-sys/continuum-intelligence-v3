// report-sections.js – Individual report section renderers
// Extracted from index.html without logic changes

import { STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA, FEATURED_ORDER, ANNOUNCEMENTS_DATA } from '../lib/state.js';
import { renderSparkline, formatDateAEST, fmtPE } from '../lib/format.js';
import { normaliseScores, computeSkewScore } from '../lib/dom.js';
import { API_BASE } from '../lib/api-config.js';

const RS_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
function RS_HDR(num, title) {
  return '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">' + num + '</div>' +
    '<h2 class="rs-title">' + title + '</h2>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' + RS_CHEVRON + '</button></div>';
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
      const pct = ((w.price - minP) / rangeP * 100).toFixed(1);
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
          '<div class="pir-world-price">A$' + w.price.toFixed(0) + '</div>' +
          '<div class="pir-world-label">' + w.label + probStr + '</div>' +
          metricHtml +
        '</div>';
    }
    const currentPct = ((current - minP) / rangeP * 100).toFixed(1);

    // Probability-weighted average price
    let weightedAvgHtml = '';
    const hasProbs = worlds.length > 0 && worlds[0].probability != null;
    if (hasProbs) {
      let weightedAvg = 0;
      for (let wi = 0; wi < worlds.length; wi++) {
        weightedAvg += (parseFloat(worlds[wi].probability) || 0) * worlds[wi].price;
      }
      const wavgPct = ((weightedAvg - minP) / rangeP * 100).toFixed(1);
      const wavgDelta = ((weightedAvg - current) / current * 100);
      const wavgDeltaCls = wavgDelta >= 0 ? 'upside' : 'downside';
      const wavgDeltaLabel = (wavgDelta >= 0 ? '+' : '') + wavgDelta.toFixed(1) + '% ' + wavgDeltaCls;
      weightedAvgHtml =
        '<div class="pir-weighted-avg" style="left:' + wavgPct + '%">' +
          '<div class="pir-weighted-avg-label">A$' + weightedAvg.toFixed(2) + '</div>' +
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
              '<div class="pir-current-label">A$' + current.toFixed(2) + '</div>' +
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
            '<div class="rh-price"><span class="rh-price-currency">' + (data.currency || '') + '</span>' + (data.price != null ? parseFloat(data.price).toFixed(2) : '') + '</div>' +
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

export function renderSkewBar(data) {
  if (!data.skew && !data._skew && (!data.hypotheses || !data.hypotheses.length)) return '';
  const skew = data._skew || computeSkewScore(data);
  const dir = skew.direction;
  const arrow = dir === 'downside' ? '&#9660; DOWNSIDE' : dir === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';
  const scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  const scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;
  const rationale = (data.skew && data.skew.rationale) || '';

  return '<div class="risk-skew-bar">' +
    '<div class="rsb-inner">' +
      '<span class="rsb-label">Thesis Skew</span>' +
      '<span class="skew-badge ' + dir + '">' + arrow + '</span>' +
      '<div class="skew-bar-track" style="width:80px;height:10px;margin:0 4px">' +
        '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
        '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
      '</div>' +
      '<span class="skew-score ' + scoreCls + '">' + scoreLabel + '</span>' +
      '<span class="rsb-rationale">' + rationale + '</span>' +
    '</div>' +
  '</div>';
}

/**
 * Compute direction colour class from dirText AND narrative polarity.
 * Colour tells the investor: "is this change good or bad for the stock?"
 *
 * Bullish narratives (upside): Rising = good = green, Falling = bad = red.
 * Bearish narratives (downside): Rising = bad = red, Falling = good = green.
 * Steady/Contained/Stable = always amber regardless of polarity.
 *
 * @param {string} dirText  - "Rising", "Falling", "Steady", etc.
 * @param {string} polarity - hypothesis direction: "upside", "downside", or "neutral"
 * @returns {string|null} CSS class or null if dirText is unrecognised
 */
function _dirTextToCls(dirText, polarity) {
  if (!dirText) return null;
  var t = dirText.toLowerCase();

  // Steady states are always amber
  if (t.indexOf('steady') >= 0 || t.indexOf('contained') >= 0 || t.indexOf('stable') >= 0 || t.indexOf('base') >= 0 || t.indexOf('awaiting') >= 0 || t.indexOf('watching') >= 0 || t.indexOf('priced') >= 0) return 'dir-neutral';

  var isRising = t.indexOf('rising') >= 0 || t.indexOf('upside') >= 0 || t.indexOf('building') >= 0 || t.indexOf('confirmed') >= 0;
  var isFalling = t.indexOf('falling') >= 0 || t.indexOf('downside') >= 0 || t.indexOf('declining') >= 0;
  if (!isRising && !isFalling) return null;

  // For bearish narratives, invert: rising risk = bad (red), falling risk = good (green)
  var isBearish = polarity === 'downside';
  if (isBearish) return isRising ? 'dir-down' : 'dir-up';
  return isRising ? 'dir-up' : 'dir-down';
}

export function renderVerdict(data) {
  const v = data.verdict;
  if (!v || !v.scores || !v.scores.length) return '';
  const skewDir = (data.skew && data.skew.direction) || '';
  const vtCls = skewDir === 'upside' ? ' vt-positive' : skewDir === 'downside' ? ' vt-negative' : '';
  const hyps = data.hypotheses || [];
  const norm = (hyps.length)
    ? normaliseScores(hyps)
    : normaliseScores(v.scores);

  let scoresHtml = '';
  for (let i = 0; i < v.scores.length; i++) {
    const s = v.scores[i];
    // _dirCls is pre-computed by prepareHypotheses -- single source of truth
    const dirCls = s._dirCls || 'dir-neutral';
    const dirAttr = ' data-dir="' + dirCls + '"';
    scoresHtml += '<div class="vs-item ' + dirCls + '"' + dirAttr + '>' +
      '<div class="vs-label">' + (s.label || '') + '</div>' +
      '<div class="vs-score">' + (norm[i] != null ? norm[i] : 0) + '%</div>' +
      '<div class="vs-direction">' + (s.dirArrow || '') + ' ' + (s.dirText || '') + '</div>' +
    '</div>';
  }

  return '<div class="verdict-section">' +
    '<div class="verdict-inner">' +
      '<div class="verdict-text' + vtCls + '">' + (v.text || '') + '</div>' +
      '<div class="verdict-scores">' + scoresHtml + '</div>' +
    '</div>' +
  '</div>';
}

export function renderSectionNav(data) {
  const t = data.ticker.toLowerCase();
  const sections = [
    ['identity', 'Identity'],
    ['hypotheses', 'Hypotheses']
  ];

  if (data.goldAgent || data.goldAnalysis) {
    sections.push(['gold-analysis', 'Gold']);
  }

  sections.push(
    ['narrative-timeline', 'Timeline'],
    ['narrative', 'Narrative'],
    ['evidence', 'Evidence'],
    ['discriminates', 'Discriminates'],
    ['tripwires', 'Tripwires'],
    ['gaps', 'Gaps']
  );

  if (data.technicalAnalysis) {
    sections.push(['technical', 'Technical']);
  }

  if (data.priceDrivers) {
    sections.push(['price-drivers', 'Price Drivers']);
  }

  sections.push(['sources', 'Ext. Research']);
  sections.push(['chat', 'Research Chat']);

  let linksHtml = '';
  for (let i = 0; i < sections.length; i++) {
    const activeClass = i === 0 ? ' class="active"' : '';
    linksHtml += '<a href="#' + t + '-' + sections[i][0] + '"' + activeClass + '>' + sections[i][1] + '</a>';
  }

  return '<div class="section-nav">' +
    '<div class="section-nav-inner">' + linksHtml + '</div>' +
  '</div>';
}

export function renderIdentity(data) {
  const id = data.identity;
  if (!id || !id.rows || !id.rows.length) return '';
  const t = data.ticker.toLowerCase();

  let rowsHtml = '';
  for (let i = 0; i < id.rows.length; i++) {
    const row = id.rows[i];
    const left = row[0];
    const right = row[1];
    rowsHtml += '<tr>' +
      '<td class="td-label">' + left[0] + '</td>' +
      '<td' + (left[2] ? ' class="' + left[2] + '"' : '') + '>' + left[1] + '</td>' +
      '<td class="td-label">' + right[0] + '</td>' +
      '<td' + (right[2] ? ' class="' + right[2] + '"' : '') + '>' + right[1] + '</td>' +
    '</tr>';
  }

  return '<div class="report-section" id="' + t + '-identity">' +
    RS_HDR('Section 01', 'Identity &amp; Snapshot') +
    '<div class="rs-body">' +
    '<table class="identity-table">' +
      '<thead><tr><th>Metric</th><th>Value</th><th>Metric</th><th>Value</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
  '</div></div>';
}

export function renderHypotheses(data) {
  if (!data.hypotheses || !data.hypotheses.length) return '';
  const t = data.ticker.toLowerCase();
  let cardsHtml = '';
  const norm = normaliseScores(data.hypotheses);

  for (let i = 0; i < data.hypotheses.length; i++) {
    const h = data.hypotheses[i];
    const normScore = norm[i] + '%';
    const normWidth = norm[i] + '%';

    let requiresHtml = '';
    if (h.requires && h.requires.length > 0) {
      requiresHtml = '<div class="hc-subtitle">Requires</div><ul class="hc-list requires">';
      for (let r = 0; r < h.requires.length; r++) {
        requiresHtml += '<li>' + h.requires[r] + '</li>';
      }
      requiresHtml += '</ul>';
    }

    let supportHtml = '';
    if (h.supporting && h.supporting.length > 0) {
      supportHtml = '<div class="hc-subtitle">' + h.supportingLabel + '</div><ul class="hc-list supports">';
      for (let s = 0; s < h.supporting.length; s++) {
        supportHtml += '<li>' + h.supporting[s] + '</li>';
      }
      supportHtml += '</ul>';
    }

    let contradictHtml = '';
    if (h.contradicting && h.contradicting.length > 0) {
      contradictHtml = '<div class="hc-subtitle">' + h.contradictingLabel + '</div><ul class="hc-list contradicts">';
      for (let c = 0; c < h.contradicting.length; c++) {
        contradictHtml += '<li>' + h.contradicting[c] + '</li>';
      }
      contradictHtml += '</ul>';
    }

    const tierMatch = (h.tier || '').toUpperCase().match(/^[NT]\d+/);
    let displayTitle = (h.title || '');
    if (tierMatch && !/^[NT]\d+[:\s]/i.test(displayTitle)) {
      displayTitle = tierMatch[0] + ': ' + displayTitle;
    }

    const dominantCls = (i === 0) ? ' dominant' : '';
    cardsHtml += '<div class="hyp-card ' + h.dirClass + dominantCls + '">' +
      '<div class="hc-header"><div class="hc-title">' + displayTitle + '</div><div class="hc-status ' + h.statusClass + '">' + h.statusText + '</div></div>' +
      '<div class="hc-score-row"><div class="hc-score-number">' + normScore + '</div><div class="hc-score-bar"><div class="hc-score-fill" style="width:' + normWidth + '"></div></div><div class="hc-score-meta">' + h.scoreMeta + '</div></div>' +
      '<p class="hc-desc">' + h.description + '</p>' +
      requiresHtml +
      supportHtml +
      contradictHtml +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-hypotheses">' +
    RS_HDR('Section 02', 'Competing Hypotheses') +
    '<div class="rs-body">' +
    cardsHtml +
  '</div></div>';
}

export function renderNarrative(data) {
  const n = data.narrative;
  if (!n) return '';
  const t = data.ticker.toLowerCase();
  const pi = n.priceImplication || {};

  return '<div class="report-section" id="' + t + '-narrative">' +
    RS_HDR('Section 03', 'Dominant Narrative') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">The Narrative</div>' +
    '<div class="rs-text">' + (n.theNarrative || 'Pending analysis.') + '</div>' +
    (pi.label || pi.content ? '<div class="rs-subtitle">The Price Implication</div>' +
    '<div class="callout">' +
      '<div class="callout-label">' + (pi.label || '') + '</div>' +
      '<div class="rs-text">' + (pi.content || '') + '</div>' +
    '</div>' : '') +
    (n.evidenceCheck ? '<div class="rs-subtitle">The Evidence Check</div>' +
    '<div class="rs-text">' + n.evidenceCheck + '</div>' : '') +
    (n.narrativeStability ? '<div class="rs-subtitle">Narrative Stability</div>' +
    '<div class="rs-text">' + n.narrativeStability + '</div>' : '') +
  '</div></div>';
}

export function renderEvidenceCard(card) {
  if (!card) return '';
  let tableHtml = '';
  if (card.table && card.table.headers && card.table.rows) {
    let thHtml = '';
    for (let h = 0; h < card.table.headers.length; h++) {
      thHtml += '<th>' + card.table.headers[h] + '</th>';
    }
    let tbHtml = '';
    for (let r = 0; r < card.table.rows.length; r++) {
      tbHtml += '<tr>';
      for (let c = 0; c < card.table.rows[r].length; c++) {
        tbHtml += '<td>' + card.table.rows[r][c] + '</td>';
      }
      tbHtml += '</tr>';
    }
    tableHtml = '<table class="identity-table" style="margin-bottom:var(--space-md)">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody>' + tbHtml + '</tbody>' +
    '</table>';
  }

  let tensionHtml = '';
  if (card.tension) {
    tensionHtml = '<div class="ec-tension">' +
      '<div class="ec-tension-label">Key Tension</div>' +
      '<div class="rs-text">' + card.tension + '</div>' +
    '</div>';
  }

  let tagsHtml = '';
  const tags = card.tags || [];
  for (let t = 0; t < tags.length; t++) {
    tagsHtml += '<span class="ec-tag ' + (tags[t].class || '') + '">' + (tags[t].text || '') + '</span>';
  }

  return '<div class="evidence-card">' +
    '<div class="ec-header">' +
      '<div class="ec-title">' + (card.title || '') + '</div>' +
      '<div class="ec-header-right">' +
        '<span class="ec-epistemic ' + (card.epistemicClass || '') + '">' + (card.epistemicLabel || '') + '</span>' +
        '<span class="ec-toggle">&#9660;</span>' +
      '</div>' +
    '</div>' +
    '<div class="ec-body">' +
      tableHtml +
      '<div class="ec-finding">' + (card.finding || '') + '</div>' +
      tensionHtml +
      '<div class="ec-footer">' +
        '<div class="ec-tags">' + tagsHtml + '</div>' +
        '<div class="ec-source">' + (card.source || '') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderAlignmentSummary(data) {
  const as = data.evidence && data.evidence.alignmentSummary;
  if (!as || typeof as !== 'object' || !Array.isArray(as.headers) || !Array.isArray(as.rows)) return '';

  let thHtml = '';
  for (let h = 0; h < as.headers.length; h++) {
    thHtml += '<th>' + as.headers[h] + '</th>';
  }

  let tbHtml = '';
  for (let i = 0; i < as.rows.length; i++) {
    const row = as.rows[i];

    const cellFn = function(cell) {
      const styleAttr = cell.style ? ' style="' + cell.style + '"' : '';
      return '<td class="' + cell.class + '"' + styleAttr + '>' + cell.text + '</td>';
    };

    tbHtml += '<tr>' +
      '<td>' + row.domain + '</td>' +
      '<td style="color:var(--text-muted)">' + row.epistemic + '</td>' +
      cellFn(row.n1) +
      cellFn(row.n2) +
      cellFn(row.n3) +
      cellFn(row.n4) +
    '</tr>';
  }

  const sum = as.summary;
  tbHtml += '<tr style="font-weight:700">' +
    '<td>Domain Count</td>' +
    '<td></td>' +
    '<td style="font-family:var(--font-data)">' + sum.n1 + '</td>' +
    '<td style="font-family:var(--font-data)' + (sum.n2Color ? ';color:' + sum.n2Color : '') + '">' + sum.n2 + '</td>' +
    '<td style="font-family:var(--font-data)' + (sum.n3Color ? ';color:' + sum.n3Color : '') + '">' + sum.n3 + '</td>' +
    '<td style="font-family:var(--font-data)">' + sum.n4 + '</td>' +
  '</tr>';

  return '<div class="rs-subtitle">Evidence Alignment Summary</div>' +
    '<table class="evidence-table">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody>' + tbHtml + '</tbody>' +
    '</table>';
}

export function renderEvidence(data) {
  const ev = data.evidence;
  if (!ev) return '';
  const t = data.ticker.toLowerCase();
  const cards = ev.cards || [];

  let cardsHtml = '';
  for (let i = 0; i < cards.length; i++) {
    cardsHtml += renderEvidenceCard(cards[i]);
  }

  const alignmentHtml = renderAlignmentSummary(data);

  return '<div class="report-section" id="' + t + '-evidence">' +
    RS_HDR('Section 04', 'Cross-Domain Evidence Synthesis') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + (ev.intro || '') + '</div>' +
    cardsHtml +
    alignmentHtml +
  '</div></div>';
}

export function renderDiscriminators(data) {
  const d = data.discriminators;
  if (!d || !d.rows || !d.rows.length) return '';
  const t = data.ticker.toLowerCase();

  let rowsHtml = '';
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    rowsHtml += '<tr>' +
      '<td><span class="' + (r.diagnosticityClass || '') + '">' + (r.diagnosticity || '') + '</span></td>' +
      '<td>' + (r.evidence || '') + '</td>' +
      '<td>' + (r.discriminatesBetween || '') + '</td>' +
      '<td class="' + (r.readingClass || '') + '">' + (r.currentReading || '') + '</td>' +
    '</tr>';
  }

  return '<div class="report-section" id="' + t + '-discriminates">' +
    RS_HDR('Section 05', 'What Discriminates') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + (d.intro || '') + '</div>' +
    '<table class="disc-table">' +
      '<thead><tr><th>Diagnosticity</th><th>Evidence</th><th>Discriminates Between</th><th>Current Reading</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    (d.nonDiscriminating ? '<div class="callout warn">' +
      '<div class="callout-label">Non-Discriminating Evidence &mdash; Assessed &amp; Discarded</div>' +
      '<div class="callout-body">' + d.nonDiscriminating + '</div>' +
    '</div>' : '') +
  '</div></div>';
}

export function renderTripwires(data) {
  const t = data.ticker.toLowerCase();
  const tw = data.tripwires;
  if (!tw || !tw.cards) return '';

  let cardsHtml = '';
  for (let i = 0; i < tw.cards.length; i++) {
    const card = tw.cards[i];
    if (!card) continue;
    const cardName = card.name || '';

    let conditionsHtml = '';
    const conditions = card.conditions || [];
    for (let c = 0; c < conditions.length; c++) {
      const cond = conditions[c];
      conditionsHtml += '<div class="tw-condition">' +
        '<div class="tw-cond-if ' + cond.valence + '">' + cond.if + '</div>' +
        '<div class="tw-cond-then">' + cond.then + '</div>' +
      '</div>';
    }

    const resolvedCls = cardName.indexOf('RESOLVED') >= 0 ? ' tw-resolved' : '';

    cardsHtml += '<div class="tw-card' + resolvedCls + '">' +
      '<div class="tw-header"><div class="tw-date">' + (card.date || '') + '</div><div class="tw-name">' + cardName + '</div></div>' +
      '<div class="tw-conditions">' + conditionsHtml + '</div>' +
      '<div class="tw-source">' + (card.source || '') + '</div>' +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-tripwires">' +
    RS_HDR('Section 06', 'What We\'re Watching') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + tw.intro + '</div>' +
    cardsHtml +
  '</div></div>';
}

export function renderGaps(data) {
  const g = data.gaps;
  if (!g || !g.coverageRows || !g.coverageRows.length) return '';
  const t = data.ticker.toLowerCase();

  let coverageHtml = '';
  for (let i = 0; i < g.coverageRows.length; i++) {
    const r = g.coverageRows[i];
    const confClass = r.confidenceClass ? ' class="' + r.confidenceClass + '"' : '';
    coverageHtml += '<tr>' +
      '<td>' + r.domain + '</td>' +
      '<td><span class="gap-dot ' + r.coverageLevel + '"></span>' + r.coverageLabel + '</td>' +
      '<td style="font-family:var(--font-data)">' + r.freshness + '</td>' +
      '<td' + confClass + '>' + r.confidence + '</td>' +
    '</tr>';
  }

  const couldntAssess = g.couldntAssess || [];
  let calloutsHtml = '';
  if (couldntAssess.length) {
    let listItems = '';
    for (let j = 0; j < couldntAssess.length; j++) {
      listItems += '<li>' + couldntAssess[j] + '</li>';
    }
    calloutsHtml = '<div class="callout"><ul class="gaps-list">' + listItems + '</ul></div>';
  }

  return '<div class="report-section" id="' + t + '-gaps">' +
    RS_HDR('Section 07', 'Evidence Gaps &amp; Integrity Notes') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">Domain Coverage Assessment</div>' +
    '<table class="gaps-table">' +
      '<thead><tr><th>Domain</th><th>Coverage</th><th>Freshness</th><th>Confidence</th></tr></thead>' +
      '<tbody>' + coverageHtml + '</tbody>' +
    '</table>' +
    '<div class="rs-subtitle">What We Couldn\'t Assess</div>' +
    calloutsHtml +
    (g.analyticalLimitations ? '<div class="rs-subtitle">Analytical Limitations</div>' +
    '<div class="rs-text">' + g.analyticalLimitations + '</div>' : '') +
  '</div></div>';
}

export function computeMA(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j];
    result.push(sum / period);
  }
  return result;
}

export function renderTAChart(data) {
  const ta = data.technicalAnalysis;
  const live = data._liveChart;
  const liveTA = data._liveTA;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const C = {
    bg: isLight ? '#FFFFFF' : '#0D1726',
    grid: isLight ? '#E2E8F0' : '#1E3050',
    axisText: isLight ? '#718096' : '#566882',
    price: isLight ? '#1A1F2E' : '#E8EDF4',
    priceGradA: isLight ? '#1A1F2E' : '#E8EDF4',
    hlBand: isLight ? '#1A1F2E' : '#E8EDF4',
    legendText: isLight ? '#4A5568' : '#8B9AB8',
    dot: isLight ? '#1A1F2E' : '#E8EDF4',
    dotStroke: isLight ? '#FFFFFF' : '#0D1726',
    support: '#3DAA6D',
    resistance: '#D45555',
    ma50: '#D4A03C',
    ma200: '#4A8ECC'
  };

  const useLive = live && live.bars && live.bars.length > 100;
  const bars = useLive ? live.bars : null;
  const closes = useLive ? bars.map(function(b){ return b.close; }) : data.priceHistory;
  const highs = useLive ? bars.map(function(b){ return b.high; }) : null;
  const lows = useLive ? bars.map(function(b){ return b.low; }) : null;

  if (!closes || closes.length < 20) return '';

  const n = closes.length;
  const ma50Arr = useLive && liveTA ? liveTA.ma50Arr : computeMA(closes, 50);
  const ma200Arr = useLive && liveTA ? liveTA.ma200Arr : computeMA(closes, 200);

  const chartTitle = useLive ? (n > 500 ? '3' : n > 250 ? '2' : '1') + '-Year Daily Price &amp; Moving Averages' : '12-Month Daily Price &amp; Moving Averages';
  const liveLabel = useLive ? '<span class="ta-chart-live-badge">LIVE</span>' : '<span class="ta-chart-static-badge">STATIC</span>';

  const W = 960, H = 380;
  const padL = 62, padR = 16, padT = 28, padB = 44;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const allVals = closes.slice();
  if (highs) for (var i = 0; i < n; i++) { if (highs[i] != null) allVals.push(highs[i]); }
  if (lows) for (var i = 0; i < n; i++) { if (lows[i] != null) allVals.push(lows[i]); }
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] !== null) allVals.push(ma50Arr[i]);
    if (ma200Arr[i] !== null) allVals.push(ma200Arr[i]);
  }
  let pMin = Math.min.apply(null, allVals);
  let pMax = Math.max.apply(null, allVals);
  let pRange = pMax - pMin;
  pMin -= pRange * 0.05;
  pMax += pRange * 0.05;
  pRange = pMax - pMin;

  function xPos(idx) { return padL + (idx / (n - 1)) * cW; }
  function yPos(val) { return padT + (1 - (val - pMin) / pRange) * cH; }

  const taKl = ta && ta.keyLevels ? ta.keyLevels : {};
  const supportPrice = taKl.support ? parseFloat(taKl.support.price) || null : null;
  const resistPrice = taKl.resistance ? parseFloat(taKl.resistance.price) || null : null;
  const curPrice = parseFloat(useLive && live.currentPrice ? live.currentPrice : data.price) || 0;
  const cur = data.currency;

  let svg = '<svg class="ta-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
  svg += '<rect x="' + padL + '" y="' + padT + '" width="' + cW + '" height="' + cH + '" fill="' + C.bg + '" rx="2"/>';

  const gridStep = pRange / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(gridStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  let bestStep = magnitude;
  for (let s = 0; s < niceSteps.length; s++) {
    if (niceSteps[s] * magnitude >= gridStep) { bestStep = niceSteps[s] * magnitude; break; }
  }
  for (let gv = Math.ceil(pMin / bestStep) * bestStep; gv <= pMax; gv += bestStep) {
    const gy = yPos(gv);
    if (gy < padT || gy > padT + cH) continue;
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + gy.toFixed(1) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    svg += '<text x="' + (padL - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="9">' + cur + gv.toFixed(gv >= 100 ? 0 : 2) + '</text>';
  }

  if (supportPrice && supportPrice >= pMin && supportPrice <= pMax) {
    const sy = yPos(supportPrice);
    svg += '<line x1="' + padL + '" y1="' + sy.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + sy.toFixed(1) + '" stroke="' + C.support + '" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + (sy - 4).toFixed(1) + '" fill="' + C.support + '" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">S ' + cur + supportPrice.toFixed(2) + '</text>';
  }
  if (resistPrice && resistPrice >= pMin && resistPrice <= pMax) {
    const ry = yPos(resistPrice);
    svg += '<line x1="' + padL + '" y1="' + ry.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + ry.toFixed(1) + '" stroke="' + C.resistance + '" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + (ry - 4).toFixed(1) + '" fill="' + C.resistance + '" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">R ' + cur + resistPrice.toFixed(2) + '</text>';
  }

  if (highs && lows) {
    let hlUpper = '', hlLower = '';
    for (var i = 0; i < n; i++) {
      if (highs[i] == null || lows[i] == null) continue;
      const x = xPos(i).toFixed(1);
      hlUpper += (hlUpper === '' ? 'M' : 'L') + x + ',' + yPos(highs[i]).toFixed(1);
      hlLower = x + ',' + yPos(lows[i]).toFixed(1) + (hlLower === '' ? '' : 'L' + hlLower);
    }
    if (hlUpper && hlLower) {
      svg += '<path d="' + hlUpper + 'L' + hlLower + 'Z" fill="' + C.hlBand + '" opacity="' + (isLight ? '0.08' : '0.06') + '"/>';
    }
  }

  let ma200Path = '';
  for (var i = 0; i < n; i++) {
    if (ma200Arr[i] === null) continue;
    ma200Path += (ma200Path === '' ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(ma200Arr[i]).toFixed(1);
  }
  if (ma200Path) svg += '<path d="' + ma200Path + '" fill="none" stroke="' + C.ma200 + '" stroke-width="1.3" opacity="0.8"/>';

  let ma50Path = '';
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] === null) continue;
    ma50Path += (ma50Path === '' ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(ma50Arr[i]).toFixed(1);
  }
  if (ma50Path) svg += '<path d="' + ma50Path + '" fill="none" stroke="' + C.ma50 + '" stroke-width="1.3" opacity="0.8"/>';

  let pricePath = 'M' + xPos(0).toFixed(1) + ',' + yPos(closes[0]).toFixed(1);
  for (var i = 1; i < n; i++) pricePath += 'L' + xPos(i).toFixed(1) + ',' + yPos(closes[i]).toFixed(1);
  const areaPath = pricePath + 'L' + xPos(n-1).toFixed(1) + ',' + (padT+cH) + 'L' + xPos(0).toFixed(1) + ',' + (padT+cH) + 'Z';
  svg += '<defs><linearGradient id="priceGrad-' + data.ticker + '" x1="0" y1="0" x2="0" y2="1">';
  svg += '<stop offset="0%" stop-color="' + C.priceGradA + '" stop-opacity="' + (isLight ? '0.1' : '0.08') + '"/>';
  svg += '<stop offset="100%" stop-color="' + C.priceGradA + '" stop-opacity="0.01"/>';
  svg += '</linearGradient></defs>';
  svg += '<path d="' + areaPath + '" fill="url(#priceGrad-' + data.ticker + ')"/>';

  svg += '<path d="' + pricePath + '" fill="none" stroke="' + C.price + '" stroke-width="1.4"/>';

  const lastX = xPos(n - 1), lastY = yPos(closes[n-1]);
  svg += '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="3.5" fill="' + C.dot + '" stroke="' + C.dotStroke + '" stroke-width="1.5"/>';
  const labelX = lastX + 8 > W - padR - 60 ? lastX - 65 : lastX + 8;
  svg += '<text x="' + labelX.toFixed(1) + '" y="' + (lastY + 3).toFixed(1) + '" fill="' + C.dot + '" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600">' + cur + curPrice.toFixed(2) + '</text>';

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (useLive) {
    let lastMonth = -1, lastYear = -1;
    const step = Math.max(1, Math.floor(n / 36));
    for (var i = 0; i < n; i += step) {
      const d = bars[i].date;
      const mm = d.getMonth(), yy = d.getFullYear();
      if (mm === lastMonth && yy === lastYear) continue;
      lastMonth = mm; lastYear = yy;
      var lx = xPos(i);
      if (lx < padL + 15 || lx > padL + cW - 15) continue;
      var label = monthNames[mm];
      if (mm === 0 || (i < step * 2)) label += " '" + String(yy).slice(2);
      svg += '<text x="' + lx.toFixed(1) + '" y="' + (padT + cH + 22) + '" text-anchor="middle" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="7.5">' + label + '</text>';
      svg += '<line x1="' + lx.toFixed(1) + '" y1="' + (padT + cH) + '" x2="' + lx.toFixed(1) + '" y2="' + (padT + cH + 4) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    }
  } else {
    const reportDate = new Date(data.date);
    const tradingDaysPerMonth = n / 12;
    for (let m = 0; m <= 11; m++) {
      let idx = Math.round(m * tradingDaysPerMonth);
      if (idx >= n) idx = n - 1;
      const labelDate = new Date(reportDate);
      labelDate.setMonth(labelDate.getMonth() - (11 - m));
      var label = monthNames[labelDate.getMonth()];
      if (labelDate.getMonth() === 0) label += " '" + String(labelDate.getFullYear()).slice(2);
      var lx = xPos(idx);
      if (lx < padL + 15 || lx > padL + cW - 15) continue;
      svg += '<text x="' + lx.toFixed(1) + '" y="' + (padT + cH + 22) + '" text-anchor="middle" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="7.5">' + label + '</text>';
      svg += '<line x1="' + lx.toFixed(1) + '" y1="' + (padT + cH) + '" x2="' + lx.toFixed(1) + '" y2="' + (padT + cH + 4) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    }
  }

  let lx0 = padL + 8;
  svg += '<circle cx="' + lx0 + '" cy="14" r="3" fill="' + C.dot + '"/>';
  svg += '<text x="' + (lx0+8) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Price</text>';
  if (highs) {
    svg += '<rect x="' + (lx0+44) + '" y="10" width="16" height="8" rx="1" fill="' + C.hlBand + '" opacity="0.12"/>';
    svg += '<text x="' + (lx0+64) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">High/Low</text>';
    lx0 += 56;
  }
  svg += '<line x1="' + (lx0+52) + '" y1="14" x2="' + (lx0+68) + '" y2="14" stroke="' + C.ma50 + '" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+72) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">50d MA</text>';
  svg += '<line x1="' + (lx0+112) + '" y1="14" x2="' + (lx0+128) + '" y2="14" stroke="' + C.ma200 + '" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+132) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">200d MA</text>';
  svg += '<line x1="' + (lx0+182) + '" y1="14" x2="' + (lx0+198) + '" y2="14" stroke="' + C.support + '" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+202) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Support</text>';
  svg += '<line x1="' + (lx0+242) + '" y1="14" x2="' + (lx0+258) + '" y2="14" stroke="' + C.resistance + '" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+262) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Resistance</text>';

  svg += '</svg>';

  return '<div class="ta-chart-container">' +
    '<div class="ta-chart-header"><div class="ta-chart-title">' + chartTitle + '</div>' + liveLabel + '</div>' +
    svg +
  '</div>';
}

export function renderTechnicalAnalysis(data) {
  if (!data.technicalAnalysis) return '';
  const t = data.ticker.toLowerCase();
  const ta = data.technicalAnalysis;
  const trend = ta.trend || {};
  const price = ta.price || {};
  const kl = ta.keyLevels || {};
  const support = kl.support || {};
  const resistance = kl.resistance || {};
  const ma = ta.movingAverages || {};
  const vol = ta.volume || {};
  const vola = ta.volatility || {};
  const mr = ta.meanReversion || {};

  const chartHtml = renderTAChart(data);

  const trendDir = trend.direction || '';
  const regimeHtml = '<div class="ta-regime-bar">' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Regime</div><div class="ta-regime-value">' + (ta.regime || '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Clarity</div><div class="ta-regime-value">' + (ta.clarity || '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Trend</div><div class="ta-regime-value ' + (/down/i.test(trendDir) ? 'ta-down' : /up|recover/i.test(trendDir) ? 'ta-up' : '') + '">' + trendDir + (trend.duration ? ' (' + trend.duration + ')' : '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Structure</div><div class="ta-regime-value">' + (trend.structure || '') + '</div></div>' +
    (support.price != null ? '<div class="ta-regime-item"><div class="ta-regime-label">Support</div><div class="ta-regime-value">' + (price.currency || '') + support.price.toFixed(2) + '</div></div>' : '') +
    (resistance.price != null ? '<div class="ta-regime-item"><div class="ta-regime-label">Resistance</div><div class="ta-regime-value">' + (price.currency || '') + resistance.price.toFixed(2) + '</div></div>' : '') +
  '</div>';

  const ma50 = ma.ma50 || {};
  const ma200 = ma.ma200 || {};
  const maHtml = (ma50.value != null || ma200.value != null) ? '<div class="rs-subtitle">Moving Averages</div>' +
    '<table class="ta-ma-table"><thead><tr>' +
      '<th>Measure</th><th>Value</th><th>Price vs MA</th><th>Note</th>' +
    '</tr></thead><tbody>' +
    (ma50.value != null ? '<tr>' +
      '<td class="ta-label-cell">50-Day MA</td>' +
      '<td>' + (price.currency || '') + ma50.value.toFixed(2) + '</td>' +
      '<td style="color:' + (ma.priceVsMa50 >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (ma.priceVsMa50 >= 0 ? '+' : '') + (ma.priceVsMa50 != null ? ma.priceVsMa50.toFixed(1) : '0.0') + '%</td>' +
      '<td>As at ' + (ma50.date || '') + '</td>' +
    '</tr>' : '') +
    (ma200.value != null ? '<tr>' +
      '<td class="ta-label-cell">200-Day MA</td>' +
      '<td>' + (price.currency || '') + ma200.value.toFixed(2) + '</td>' +
      '<td style="color:' + (ma.priceVsMa200 >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (ma.priceVsMa200 >= 0 ? '+' : '') + (ma.priceVsMa200 != null ? ma.priceVsMa200.toFixed(1) : '0.0') + '%</td>' +
      '<td>As at ' + (ma200.date || '') + '</td>' +
    '</tr>' : '') +
    '</tbody></table>' : '';

  let crossoverHtml = '';
  if (ma.crossover) {
    const cx = ma.crossover;
    crossoverHtml = '<div class="ta-crossover-callout">' +
      '<div class="ta-crossover-label">' + cx.type + '</div>' +
      '<div class="ta-crossover-text">' + cx.description + ' &mdash; ' + cx.date + '</div>' +
    '</div>';
  }

  let inflHtml = '';
  if (ta.inflectionPoints && ta.inflectionPoints.length > 0) {
    let inflRows = '';
    for (let i = 0; i < ta.inflectionPoints.length; i++) {
      const ip = ta.inflectionPoints[i];
      inflRows += '<tr>' +
        '<td class="ta-date-cell">' + ip.date + '</td>' +
        '<td class="ta-price-cell">' + ta.price.currency + ip.price.toFixed(2) + '</td>' +
        '<td class="ta-event-cell">' + ip.event + '</td>' +
      '</tr>';
    }
    inflHtml = '<div class="rs-subtitle">Price Inflection Points</div>' +
      '<table class="ta-inflection-table"><thead><tr>' +
        '<th>Date</th><th>Price</th><th>Observation</th>' +
      '</tr></thead><tbody>' + inflRows + '</tbody></table>';
  }

  let volHtml = '';
  if (vol.latestVs20DayAvg != null) {
    volHtml = '<div class="ta-metrics-grid">' +
      '<div class="ta-metric-card">' +
        '<div class="ta-metric-card-title">Volume</div>' +
        '<div class="ta-metric-row"><div class="ta-metric-name">Latest vs 20-day avg</div><div class="ta-metric-val">' + vol.latestVs20DayAvg.toFixed(1) + 'x</div></div>' +
        '<div class="ta-metric-row"><div class="ta-metric-name">Date</div><div class="ta-metric-val">' + (vol.latestDate || '') + '</div></div>';
    if (vol.priorSpikes) {
      for (let v = 0; v < vol.priorSpikes.length; v++) {
        const sp = vol.priorSpikes[v];
        volHtml += '<div class="ta-metric-row"><div class="ta-metric-name">' + (sp.period || '') + '</div><div class="ta-metric-val">' + (sp.ratio != null ? sp.ratio.toFixed(1) : '0.0') + 'x <span class="ta-metric-desc">&mdash; ' + (sp.context || '') + '</span></div></div>';
      }
    }
    volHtml += '</div>';
    if (vola.latestRangePercent != null) {
      const latestRange = vola.latestDailyRange || {};
      volHtml +=
        '<div class="ta-metric-card">' +
          '<div class="ta-metric-card-title">Volatility</div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">Latest daily range</div><div class="ta-metric-val">' + vola.latestRangePercent.toFixed(1) + '%</div></div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">30-day avg range</div><div class="ta-metric-val">' + (vola.avgDailyRangePercent30 != null ? vola.avgDailyRangePercent30.toFixed(1) : '0.0') + '%</div></div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">90-day avg range</div><div class="ta-metric-val">' + (vola.avgDailyRangePercent90 != null ? vola.avgDailyRangePercent90.toFixed(1) : '0.0') + '%</div></div>' +
          (latestRange.high != null && latestRange.low != null ? '<div class="ta-metric-row"><div class="ta-metric-name">Latest session</div><div class="ta-metric-val">' + (price.currency || '') + latestRange.high.toFixed(2) + ' &ndash; ' + (price.currency || '') + latestRange.low.toFixed(2) + '</div></div>' : '') +
        '</div>';
    }
    volHtml += '</div>';
  }

  let mrHtml = '';
  if (mr.rangeHigh != null && mr.rangeLow != null) {
    const rangeSpan = mr.rangeHigh - mr.rangeLow;
    const pricePct = rangeSpan > 0 ? (((price.current || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;
    const ma50Pct = rangeSpan > 0 ? (((ma50.value || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;
    const ma200Pct = rangeSpan > 0 ? (((ma200.value || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;

    mrHtml = '<div class="ta-mr-container">' +
      '<div class="ta-mr-title">Mean Reversion Positioning</div>' +
      '<div class="ta-mr-bar-track">' +
        '<div class="ta-mr-ma200-marker" style="left:' + ma200Pct.toFixed(1) + '%"></div>' +
        '<div class="ta-mr-ma50-marker" style="left:' + ma50Pct.toFixed(1) + '%"></div>' +
        '<div class="ta-mr-marker" style="left:' + pricePct.toFixed(1) + '%"></div>' +
      '</div>' +
      '<div class="ta-mr-bar-labels">' +
        '<span>' + (price.currency || '') + mr.rangeLow.toFixed(2) + '</span>' +
        '<span>' + (price.currency || '') + mr.rangeHigh.toFixed(2) + '</span>' +
      '</div>' +
      '<div class="ta-mr-legend">' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-red)"></div>Price (' + (price.currency || '') + (price.current != null ? price.current.toFixed(2) : '0.00') + ')</div>' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-amber)"></div>50-Day MA (' + (price.currency || '') + (ma50.value != null ? ma50.value.toFixed(2) : '0.00') + ')</div>' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-blue)"></div>200-Day MA (' + (price.currency || '') + (ma200.value != null ? ma200.value.toFixed(2) : '0.00') + ')</div>' +
    '</div>' +
    '<table class="ta-ma-table" style="margin-top:var(--space-sm)"><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>' +
      '<tr><td class="ta-label-cell">vs 50-Day MA</td><td style="color:var(--signal-red)">' + (mr.vsMa50 != null ? mr.vsMa50.toFixed(1) : '0.0') + '%</td></tr>' +
      '<tr><td class="ta-label-cell">vs 200-Day MA</td><td style="color:var(--signal-red)">' + (mr.vsMa200 != null ? mr.vsMa200.toFixed(1) : '0.0') + '%</td></tr>' +
      '<tr><td class="ta-label-cell">12-Month Range Position</td><td>' + ((mr.rangePosition || 50) <= 50 ? 'Lower ' : 'Upper ') + (mr.rangePosition || 50) + '%</td></tr>' +
    '</tbody></table>' +
  '</div>';
  }

  let relHtml = '';
  if (ta.relativePerformance && ta.relativePerformance.vsIndex && ta.relativePerformance.vsSector) {
    const rp = ta.relativePerformance;
    relHtml = '<div class="rs-subtitle">Relative Performance (' + rp.vsIndex.period + ')</div>' +
      '<table class="ta-rel-table"><thead><tr>' +
        '<th>Benchmark</th><th>Stock Return</th><th>Benchmark Return</th><th>Relative</th>' +
      '</tr></thead><tbody>' +
      '<tr>' +
        '<td style="font-family:var(--font-ui);font-weight:600;color:var(--text-primary)">' + rp.vsIndex.name + '</td>' +
        '<td style="color:' + (rp.vsIndex.stockReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsIndex.stockReturn >= 0 ? '+' : '') + rp.vsIndex.stockReturn.toFixed(1) + '%</td>' +
        '<td style="color:' + (rp.vsIndex.indexReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsIndex.indexReturn >= 0 ? '+' : '') + rp.vsIndex.indexReturn.toFixed(1) + '%</td>' +
        '<td style="color:' + (rp.vsIndex.relativeReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsIndex.relativeReturn >= 0 ? '+' : '') + rp.vsIndex.relativeReturn.toFixed(1) + '%</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="font-family:var(--font-ui);font-weight:600;color:var(--text-primary)">' + rp.vsSector.name + '</td>' +
        '<td style="color:' + (rp.vsSector.stockReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsSector.stockReturn >= 0 ? '+' : '') + rp.vsSector.stockReturn.toFixed(1) + '%</td>' +
        '<td style="color:' + (rp.vsSector.sectorReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsSector.sectorReturn >= 0 ? '+' : '') + rp.vsSector.sectorReturn.toFixed(1) + '%</td>' +
        '<td style="color:' + (rp.vsSector.relativeReturn >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (rp.vsSector.relativeReturn >= 0 ? '+' : '') + rp.vsSector.relativeReturn.toFixed(1) + '%</td>' +
      '</tr>' +
      '</tbody></table>';
  }

  const ftw52High = kl.fiftyTwoWeekHigh || {};
  const ftw52Low = kl.fiftyTwoWeekLow || {};
  const levelsHtml = (support.price != null || resistance.price != null) ? '<div class="rs-subtitle">Key Levels</div>' +
    '<table class="ta-ma-table"><thead><tr><th>Level</th><th>Price</th><th>Derivation</th></tr></thead><tbody>' +
    (support.price != null ? '<tr><td class="ta-label-cell">Support</td><td>' + (price.currency || '') + support.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + (support.method || '') + '</td></tr>' : '') +
    (resistance.price != null ? '<tr><td class="ta-label-cell">Resistance</td><td>' + (price.currency || '') + resistance.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + (resistance.method || '') + '</td></tr>' : '') +
    (ftw52High.price != null ? '<tr><td class="ta-label-cell">52-Week High</td><td>' + (price.currency || '') + ftw52High.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + (ftw52High.date || '') + '</td></tr>' : '') +
    (ftw52Low.price != null ? '<tr><td class="ta-label-cell">52-Week Low</td><td>' + (price.currency || '') + ftw52Low.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + (ftw52Low.date || '') + '</td></tr>' : '') +
    '</tbody></table>' : '';

  const footerHtml = '<div class="ta-footer">' +
    'Analysis period: ' + (ta.period || '') + ' &bull; Generated: ' + (ta.date || '') + ' &bull; Source: ' + (ta.source || 'Continuum Technical Intelligence') +
  '</div>';

  return '<div class="report-section ta-section" id="' + t + '-technical">' +
    RS_HDR('Section 08', 'Technical Structure') +
    '<div class="rs-body">' +
    chartHtml +
    regimeHtml +
    maHtml +
    crossoverHtml +
    levelsHtml +
    inflHtml +
    volHtml +
    mrHtml +
    relHtml +
    footerHtml +
  '</div></div>';
}

export function renderReportFooter(data) {
  const footer = data.footer || {};
  return '<div class="report-footer-section">' +
    '<div class="rf-inner">' +
      '<div class="rf-disclaimer-text">' + (footer.disclaimer || '') + '</div>' +
      '<div class="rf-meta-row">' +
        '<div class="rf-brand">Contin<span class="brand-green">uu</span>m Inte<span class="brand-green">ll</span>igence</div>' +
        '<div class="rf-meta-item">ID: ' + (data.reportId || '') + '</div>' +
        '<div class="rf-meta-item">Mode: Narrative Intelligence</div>' +
        '<div class="rf-meta-item">Domains: ' + (footer.domainCount || 0) + '</div>' +
        '<div class="rf-meta-item">Hypotheses: ' + (footer.hypothesesCount || 0) + '</div>' +
        '<div class="rf-meta-item">' + (data.date ? formatDateAEST(data.date) : '') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderPDFDownload(data) {
  const t = data.ticker;
  return '<div class="report-download-section">' +
    '<div class="report-download-inner">' +
      '<div class="report-download-title">Download Research Report</div>' +
      '<div class="report-download-subtitle">' + data.company + ' (' + data.ticker + '.AX) &mdash; ' + formatDateAEST(data.date) + '</div>' +
      '<div class="report-download-buttons">' +
        '<button class="btn-pdf-download institutional" onclick="generatePDFReport(\'' + t + '\', \'institutional\')">' +
          '<span class="btn-pdf-label">Institutional Report <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">Full ACH analysis with evidence matrix</span>' +
        '</button>' +
        '<button class="btn-pdf-download retail" onclick="generatePDFReport(\'' + t + '\', \'retail\')">' +
          '<span class="btn-pdf-label">Investor Briefing <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">2-page briefing: ranges, narrative &amp; analysis</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

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
      if (currentP > 0) peValue = (currentP / ref.epsForward).toFixed(1) + 'x';
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
    vrToBull = ((vrBull / livePrice - 1) * 100).toFixed(1);
    vrToBear = ((vrBear / livePrice - 1) * 100).toFixed(1);
  }

  let inner = '';

  inner += '<div class="hs-stock-id">' +
    '<div class="hs-stock-ticker">' + (data.tickerFull || data.ticker || ticker) + '</div>' +
    '<div class="hs-price-row">';
  if (livePrice > 0) {
    inner += '<span class="hs-price">A$' + livePrice.toFixed(2) + '</span>';
  }
  if (changePct !== null) {
    const chgCls = changePct >= 0 ? 'pos' : 'neg';
    inner += '<span class="hs-change-badge ' + chgCls + '">' +
      (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%</span>';
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
    const vrCurrPct = Math.min(100, Math.max(0, ((livePrice - vrBear) / vrRange * 100))).toFixed(1);
    inner += '<div class="hs-section-head">Valuation Range</div>' +
      '<div class="hs-val-section">' +
        '<div class="hs-val-header">' +
          '<span class="hs-val-zone ' + vrZoneCls + '">' + vrZone + '</span>' +
        '</div>' +
        '<div class="hs-val-levels">' +
          '<span>Bear<br>A$' + vrBear.toFixed(2) + '</span>' +
          '<span>Fair<br>A$' + vrFair.toFixed(2) + '</span>' +
          '<span>Bull<br>A$' + vrBull.toFixed(2) + '</span>' +
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

export function prepareHypotheses(data) {
  if (data._hypothesesPrepared) return;
  data._hypothesesPrepared = true;
  if (!data.hypotheses || !data.hypotheses.length) return;

  const dirMap = { upside: 'dir-up', downside: 'dir-down', neutral: 'dir-neutral' };
  const colorMap = { 'dir-up': 'var(--signal-green)', 'dir-down': 'var(--signal-red)', 'dir-neutral': 'var(--signal-amber)' };

  const hyps = data.hypotheses;

  // No sort. The JSON stores hypotheses in canonical N1→N4 order and is the
  // source of truth. Sorting in place would permanently reorder STOCK_DATA,
  // stranding JSON-embedded N-labels (e.g. "N2: Structural Margin Erosion")
  // at the wrong array positions and diverging from the LLM context in ingest.py.

  // Enrich direction class -- do not rename tiers or titles.
  for (var i = 0; i < hyps.length; i++) {
    hyps[i].dirClass = dirMap[hyps[i].direction] || 'dir-neutral';
  }

  // Apply direction colours to verdict scores without renaming labels.
  // Also compute _dirCls (composite direction class) once for all rendering surfaces.
  if (data.verdict && data.verdict.scores) {
    for (var i = 0; i < data.verdict.scores.length; i++) {
      var vs = data.verdict.scores[i];
      // scoreColor: match by raw score value to hypothesis polarity
      if (hyps[i]) {
        vs.scoreColor = colorMap[hyps[i].dirClass] || vs.scoreColor;
      }
      // _dirCls: composite direction class (good/bad for the stock)
      if (vs.dirColor) {
        // Explicit colour set by backend -- map to CSS class
        if (vs.dirColor.indexOf('green') >= 0) vs._dirCls = 'dir-up';
        else if (vs.dirColor.indexOf('red') >= 0) vs._dirCls = 'dir-down';
        else vs._dirCls = 'dir-neutral';
      } else {
        var polarity = hyps[i] ? hyps[i].direction || 'neutral' : 'neutral';
        vs._dirCls = _dirTextToCls(vs.dirText, polarity) || (hyps[i] ? hyps[i].dirClass || 'dir-neutral' : 'dir-neutral');
      }
    }
  }

  // Rebuild alignmentSummary column headers to match sorted display order.
  if (data.evidence && data.evidence.alignmentSummary && typeof data.evidence.alignmentSummary === 'object') {
    const as = data.evidence.alignmentSummary;
    if (Array.isArray(as.headers) && as.headers.length >= 5 && as.rows) {
      const nonNCount = as.headers.length - hyps.length;
      const newHeaders = as.headers.slice(0, nonNCount);
      for (var i = 0; i < hyps.length; i++) {
        newHeaders.push(hyps[i].title.substring(0, 18));
      }
      as.headers = newHeaders;
    }
  }
}

export function renderOvercorrectionBanner(data) {
  const oc = data._overcorrection;
  if (!oc || !oc.active) return '';
  const cls = oc.reviewResult && oc.reviewResult.confirmed ? ' confirmed' : '';
  const label = oc.reviewResult && oc.reviewResult.confirmed
    ? '&#10004; Overcorrection Confirmed'
    : '&#9888; Possible Overcorrection Detected';
  const message = oc.message || 'Price move exceeded threshold  --  scores under review.';
  let reviewHtml = oc.reviewDate
    ? '<div class="oc-review">5-day review scheduled: ' + oc.reviewDate + '</div>'
    : '';
  if (oc.reviewResult) {
    reviewHtml = '<div class="oc-review">' + oc.reviewResult.message + '</div>';
  }
  return '<div class="overcorrection-banner' + cls + '">' +
    '<div class="oc-label">' + label + '</div>' +
    '<div class="oc-message">' + message + '</div>' +
    reviewHtml +
  '</div>';
}

// Narrative Timeline Chart (Phase 6)

const HISTORY_CACHE = {};

function loadNarrativeHistory(ticker, callback) {
  if (HISTORY_CACHE[ticker]) {
    callback(HISTORY_CACHE[ticker]);
    return;
  }
  const url = 'data/stocks/' + ticker + '-history.json';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const data = JSON.parse(xhr.responseText);
        HISTORY_CACHE[ticker] = data;
        callback(data);
      } catch (e) {
        console.warn('[NarrativeTimeline] Failed to parse history for', ticker);
        callback(null);
      }
    } else {
      callback(null);
    }
  };
  xhr.onerror = function() { callback(null); };
  xhr.send();
}

export function renderNarrativeTimeline(data) {
  const t = data.ticker.toLowerCase();
  return '<div class="report-section narrative-timeline-section" id="' + t + '-narrative-timeline">' +
    RS_HDR('Timeline', 'Narrative Evolution') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">How hypothesis survival scores and price have moved over time</div>' +
    '<div class="nt-chart-container">' +
      '<div class="nt-chart-header">' +
        '<div class="nt-chart-title">Price &amp; Hypothesis Survival Scores</div>' +
        '<div class="nt-chart-badge">60-DAY HISTORY</div>' +
      '</div>' +
      '<div class="nt-chart-canvas-wrap" id="nt-wrap-' + data.ticker + '">' +
        '<div class="nt-chart-loading" id="nt-loading-' + data.ticker + '">' +
          '<div class="spinner"></div> Loading timeline data&hellip;' +
        '</div>' +
        '<canvas id="nt-canvas-' + data.ticker + '" style="display:none"></canvas>' +
      '</div>' +
      '<div class="nt-flip-legend" id="nt-legend-' + data.ticker + '"></div>' +
    '</div>' +
    '</div>' +
  '</div>';
}

const NT_COLORS = {
  price: '#8B95A5',
  hypotheses: [
    { bg: 'rgba(61, 170, 109, 0.15)', border: '#3DAA6D', label: '#3DAA6D' },
    { bg: 'rgba(74, 142, 204, 0.12)', border: '#4A8ECC', label: '#4A8ECC' },
    { bg: 'rgba(212, 160, 60, 0.12)', border: '#D4A03C', label: '#D4A03C' },
    { bg: 'rgba(224, 93, 93, 0.10)', border: '#E05D5D', label: '#E05D5D' }
  ],
  flip: '#D4A03C',
  overcorrection: '#E05D5D',
  grid: 'rgba(139, 149, 165, 0.1)'
};

export function initNarrativeTimelineChart(ticker) {
  const Chart = window.Chart;
  if (!Chart) {
    console.warn('[NarrativeTimeline] Chart.js not loaded yet');
    return;
  }

  destroyNarrativeTimelineChart(ticker);

  const canvas = document.getElementById('nt-canvas-' + ticker);
  const loading = document.getElementById('nt-loading-' + ticker);
  const legend = document.getElementById('nt-legend-' + ticker);
  if (!canvas) return;

  loadNarrativeHistory(ticker, function(histData) {
    const canvasCheck = document.getElementById('nt-canvas-' + ticker);
    if (!canvasCheck) return;

    if (loading) loading.style.display = 'none';
    canvasCheck.style.display = 'block';

    if (!histData || !histData.entries || histData.entries.length < 2) {
      const wrap = document.getElementById('nt-wrap-' + ticker);
      if (wrap) {
        wrap.innerHTML = '<div class="nt-chart-empty">Insufficient history data for timeline visualisation.<br>Data accumulates daily via the automated pipeline.</div>';
      }
      return;
    }

    const history = histData.entries;
    const flips = histData.flips || [];

    // Canonical ID: map T-prefixed IDs to N-prefixed (same hypotheses, renamed mid-history)
    function canonId(id) {
      if (typeof id === 'string' && id.charAt(0) === 'T') return 'N' + id.slice(1);
      return id;
    }

    // Normalise both history schemas into {N1: score, N2: score, ...} with integer 0-100 scale
    function extractScores(entry) {
      const result = {};
      if (entry.hypotheses) {
        for (var j = 0; j < entry.hypotheses.length; j++) {
          result[canonId(entry.hypotheses[j].id)] = entry.hypotheses[j].survival_score;
        }
      } else if (entry.scores) {
        const keys = Object.keys(entry.scores);
        for (var j = 0; j < keys.length; j++) {
          result[canonId(keys[j])] = Math.round(entry.scores[keys[j]] * 100);
        }
      }
      return result;
    }

    const labels = [];
    const priceData = [];
    const hypDatasets = {};
    const hypIdSet = {};
    const hypIds = [];
    for (var i = 0; i < history.length; i++) {
      var scores = extractScores(history[i]);
      const sKeys = Object.keys(scores);
      for (var h = 0; h < sKeys.length; h++) {
        if (!hypIdSet[sKeys[h]]) {
          hypIdSet[sKeys[h]] = true;
          hypIds.push(sKeys[h]);
        }
      }
    }

    for (var i = 0; i < history.length; i++) {
      const entry = history[i];
      const parts = (entry.date || '').split('-');
      if (parts.length === 3) {
        labels.push(parts[2] + '/' + parts[1]);
      } else {
        labels.push(entry.date || '?');
      }
      priceData.push(entry.price);

      var scores = extractScores(entry);
      for (var h = 0; h < hypIds.length; h++) {
        var hid = hypIds[h];
        if (!hypDatasets[hid]) hypDatasets[hid] = [];
        hypDatasets[hid].push(scores[hid] != null ? scores[hid] : null);
      }
    }

    // Resolve hypothesis names: old-schema rich names first, then STOCK_DATA research fallback
    const hypNames = {};
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].hypotheses) {
        for (var h = 0; h < history[i].hypotheses.length; h++) {
          var cid = canonId(history[i].hypotheses[h].id);
          if (!hypNames[cid]) {
            hypNames[cid] = history[i].hypotheses[h].name;
          }
        }
        if (Object.keys(hypNames).length >= hypIds.length) break;
      }
    }
    // Fall back to STOCK_DATA hypotheses (tier/title) for any gaps
    const stockHyps = STOCK_DATA[ticker] && STOCK_DATA[ticker].hypotheses;
    if (stockHyps) {
      for (var h = 0; h < stockHyps.length; h++) {
        var cid = canonId(stockHyps[h].tier || stockHyps[h].id || '');
        if (cid && !hypNames[cid]) {
          hypNames[cid] = stockHyps[h].title || stockHyps[h].name || cid;
        }
      }
    }

    const datasets = [];
    datasets.push({
      label: 'Price',
      data: priceData,
      borderColor: NT_COLORS.price,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 6,
      yAxisID: 'yPrice',
      tension: 0.3,
      order: 0
    });

    for (var h = 0; h < hypIds.length; h++) {
      var hid = hypIds[h];
      const colorSet = NT_COLORS.hypotheses[h] || NT_COLORS.hypotheses[0];
      datasets.push({
        label: hid + ': ' + (hypNames[hid] || hid),
        data: hypDatasets[hid],
        borderColor: colorSet.border,
        backgroundColor: colorSet.bg,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHitRadius: 6,
        yAxisID: 'yScore',
        fill: true,
        tension: 0.3,
        order: h + 1
      });
    }

    // Filter out false flips caused by T->N rename (same canonical ID)
    const realFlips = [];
    for (var f = 0; f < flips.length; f++) {
      var fl = flips[f];
      const fromId = fl.from && fl.from.id ? canonId(fl.from.id) : null;
      const toId = fl.to && fl.to.id ? canonId(fl.to.id) : null;
      if (fromId !== toId) realFlips.push(fl);
    }

    const flipMarkers = [];
    for (var f = 0; f < realFlips.length; f++) {
      const flip = realFlips[f];
      const flipParts = (flip.date || '').split('-');
      if (flipParts.length === 3) {
        const flipLabel = flipParts[2] + '/' + flipParts[1];
        const flipIdx = labels.indexOf(flipLabel);
        if (flipIdx >= 0) {
          flipMarkers.push({ idx: flipIdx, color: NT_COLORS.flip, dash: [4, 3], width: 1.5 });
        }
      }
    }
    for (var i = 0; i < history.length; i++) {
      if (history[i].overcorrection_active) {
        const ocParts = (history[i].date || '').split('-');
        if (ocParts.length === 3) {
          const ocLabel = ocParts[2] + '/' + ocParts[1];
          const ocIdx = labels.indexOf(ocLabel);
          if (ocIdx >= 0) {
            flipMarkers.push({ idx: ocIdx, color: NT_COLORS.overcorrection, dash: [2, 2], width: 2 });
          }
        }
      }
    }

    const verticalLinePlugin = {
      id: 'ntVerticalLines',
      afterDraw: function(chart) {
        if (!flipMarkers || flipMarkers.length === 0) return;
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.yPrice;
        ctx.save();
        for (let m = 0; m < flipMarkers.length; m++) {
          const marker = flipMarkers[m];
          const xPixel = xScale.getPixelForValue(marker.idx);
          ctx.beginPath();
          ctx.setLineDash(marker.dash);
          ctx.strokeStyle = marker.color;
          ctx.lineWidth = marker.width;
          ctx.moveTo(xPixel, yScale.top);
          ctx.lineTo(xPixel, yScale.bottom);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#8B95A5' : '#4A5568';
    const gridColor = isDark ? 'rgba(139, 149, 165, 0.1)' : 'rgba(0, 0, 0, 0.06)';

    const ctx = canvasCheck.getContext('2d');
    try {
    var chart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: "'JetBrains Mono', 'SF Mono', monospace", size: 10 },
              boxWidth: 12,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'rectRounded'
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(11, 18, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#E2E8F0' : '#1A202C',
            bodyColor: isDark ? '#A0AEC0' : '#4A5568',
            borderColor: isDark ? 'rgba(139, 149, 165, 0.2)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: 'bold' },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'yPrice') {
                  return label + ': $' + (value !== null ? value.toFixed(2) : ' -- ');
                }
                return label + ': ' + (value !== null ? value + '%' : ' -- ');
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          yPrice: {
            type: 'linear',
            position: 'left',
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              callback: function(value) { return '$' + value.toFixed(0); }
            },
            title: {
              display: true,
              text: 'Price',
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 10, weight: 'bold' }
            }
          },
          yScore: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              callback: function(value) { return value + '%'; },
              stepSize: 20
            },
            title: {
              display: true,
              text: 'Survival Score',
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 10, weight: 'bold' }
            }
          }
        }
      },
      plugins: [verticalLinePlugin]
    });
    } catch (e) {
      console.error('[NarrativeTimeline] Chart.js init failed for', ticker, e);
      return;
    }

    canvasCheck._ntChart = chart;

    const legendEl = document.getElementById('nt-legend-' + ticker);
    if (legendEl && realFlips.length > 0) {
      legendEl.innerHTML = '';
      for (var f = 0; f < realFlips.length; f++) {
        var fl = realFlips[f];
        const item = document.createElement('div');
        item.className = 'nt-flip-item';
        const marker = document.createElement('span');
        marker.className = 'nt-flip-marker';
        item.appendChild(marker);
        item.appendChild(document.createTextNode(
          ' ' + (fl.date || '') + ': ' + (fl.from && fl.from.id || '?') + ' \u2192 ' + (fl.to && fl.to.id || '?')
        ));
        legendEl.appendChild(item);
      }
    } else if (legendEl) {
      legendEl.style.display = 'none';
    }
  });
}

export function destroyNarrativeTimelineChart(ticker) {
  const Chart = window.Chart;
  const canvas = document.getElementById('nt-canvas-' + ticker);
  if (canvas) {
    if (canvas._ntChart) {
      canvas._ntChart.destroy();
      canvas._ntChart = null;
    }
    const existing = (window.Chart && window.Chart.getChart) ? window.Chart.getChart(canvas) : null;
    if (existing) {
      existing.destroy();
    }
  }
}

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
      dailyChange = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% today';
    } else if (ph && ph.length >= 2) {
      const last2 = parseFloat(ph[ph.length - 1]);
      const prev2 = parseFloat(ph[ph.length - 2]);
      if (!isNaN(last2) && !isNaN(prev2) && prev2 !== 0) {
        var chg = (last2 - prev2) / prev2 * 100;
        dailyCls    = chg >= 0 ? 'pos' : 'neg';
        dailyChange = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% today';
      }
    }
    let fromPeak = '', fromPeakCls = '';
    if (ta.trend && ta.trend.drawdown != null) {
      fromPeak    = ta.trend.drawdown.toFixed(1) + '% from peak';
      fromPeakCls = ta.trend.drawdown < 0 ? 'neg' : 'pos';
    }
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + regimeCls + '"></span>' +
        '<span class="sb-row-label">Technical Indicators</span>' +
        '<span class="sb-badge ' + regimeCls + '">' + badgeLabel + '</span>' +
        '<div class="sb-items">' +
          (currentP ? '<span class="sb-item">A$' + currentP.toFixed(2) + '</span><span class="sb-sep">|</span>' : '') +
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

// ---------------------------------------------------------------------------
// Section 09: Gold Agent Discovery (conditional -- gold stocks only)
// ---------------------------------------------------------------------------

export function renderGoldDiscovery(data) {
  if (!data.goldAgent) return '';
  try { return _renderGoldDiscoveryInner(data); } catch (err) {
    console.error('[GoldDiscovery] Render error for ' + data.ticker + ':', err);
    return '';
  }
}

function _renderGoldAssets(ga) {
  const assets = ga.assets;
  if (!assets || !assets.length) return '';

  let rows = '';
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    rows += '<tr>' +
      '<td>' + (a.name || 'N/A') + '</td>' +
      '<td>' + (a.country || 'N/A') + '</td>' +
      '<td>' + (a.ownership_pct != null ? a.ownership_pct + '%' : '100%') + '</td>' +
      '<td>' + (a.stage || 'N/A') + '</td>' +
      '<td>' + (a.deposit_type || 'N/A') + '</td>' +
      '<td>' + (a.mining_method || 'N/A') + '</td>' +
      '<td>' + (a.annual_production_koz != null ? a.annual_production_koz + ' koz' : 'N/A') + '</td>' +
      '<td>' + (a.reserve_grade_gt != null ? a.reserve_grade_gt + ' g/t' : 'N/A') + '</td>' +
      '<td>' + (a.mine_life_years != null ? a.mine_life_years + ' yr' : 'N/A') + '</td>' +
      '<td>' + (a.aisc_per_oz_usd != null ? 'US$' + a.aisc_per_oz_usd.toLocaleString() : 'N/A') + '</td>' +
    '</tr>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Asset Portfolio</div>' +
    '<div class="ga-evidence-scroll">' +
    '<table class="ga-metrics-table ga-assets-table"><thead><tr>' +
      '<th>Asset</th><th>Country</th><th>Own%</th><th>Stage</th>' +
      '<th>Deposit</th><th>Method</th>' +
      '<th>Production</th><th>Grade</th><th>Mine Life</th><th>AISC</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '</div></div>';
}

function _renderGoldValuation(ga) {
  const v = ga.valuation;
  if (!v) return '';
  const base = v.screening_nav_usd_m;
  const up = v.upside_nav_usd_m;
  const down = v.downside_nav_usd_m;
  if (base == null && up == null && down == null) return '';

  const fmt = function(n) { return n != null ? 'US$' + n.toLocaleString() + 'm' : 'N/A'; };

  const navCards =
    '<div class="ga-val-grid">' +
      '<div class="ga-val-card ga-val-down"><div class="ga-val-label">Downside NAV</div><div class="ga-val-num">' + fmt(down) + '</div></div>' +
      '<div class="ga-val-card ga-val-base"><div class="ga-val-label">Base NAV</div><div class="ga-val-num">' + fmt(base) + '</div></div>' +
      '<div class="ga-val-card ga-val-up"><div class="ga-val-label">Upside NAV</div><div class="ga-val-num">' + fmt(up) + '</div></div>' +
    '</div>';

  const multiples = [];
  if (v.p_nav != null) multiples.push(['P/NAV', v.p_nav + 'x']);
  if (v.ev_per_reserve_oz_usd != null) multiples.push(['EV/Reserve oz', 'US$' + v.ev_per_reserve_oz_usd.toLocaleString()]);
  if (v.ev_per_resource_oz_usd != null) multiples.push(['EV/Resource oz', 'US$' + v.ev_per_resource_oz_usd.toLocaleString()]);
  if (v.ev_per_production_oz_usd != null) multiples.push(['EV/Production oz', 'US$' + v.ev_per_production_oz_usd.toLocaleString()]);
  if (v.fcf_yield_spot_pct != null) multiples.push(['FCF Yield (spot)', v.fcf_yield_spot_pct + '%']);

  let multiplesHtml = '';
  if (multiples.length > 0) {
    let mRows = '';
    for (let i = 0; i < multiples.length; i++) {
      mRows += '<tr><td class="ga-metric-name">' + multiples[i][0] + '</td><td class="ga-metric-val">' + multiples[i][1] + '</td></tr>';
    }
    multiplesHtml = '<table class="ga-metrics-table"><tbody>' + mRows + '</tbody></table>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Valuation Scenarios</div>' +
    navCards + multiplesHtml +
  '</div>';
}

function _renderGoldPeers(ga) {
  const pf = ga.peer_frame;
  if (!pf) return '';

  const v = ga.valuation || {};
  const pNav = v.p_nav;
  const medianPNav = pf.peer_median_p_nav;
  const discount = pf.p_nav_discount_premium_pct;
  const comment = pf.relative_valuation_comment || '';
  const peers = pf.peer_group || [];

  if (!medianPNav && !comment) return '';

  const discountColor = discount != null
    ? (discount < 0 ? 'var(--signal-green)' : discount > 0 ? 'var(--signal-red)' : 'var(--text-primary)')
    : '';
  const discountText = discount != null
    ? (discount > 0 ? '+' : '') + discount + '% vs peers'
    : '';

  let metricsHtml = '<div class="ga-peer-metrics">';
  if (pNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Company P/NAV</div><div class="ga-cost-value">' + pNav + 'x</div></div>';
  if (medianPNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Peer Median P/NAV</div><div class="ga-cost-value">' + medianPNav + 'x</div></div>';
  if (discount != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Discount / Premium</div><div class="ga-cost-value" style="color:' + discountColor + '">' + discountText + '</div></div>';
  metricsHtml += '</div>';

  const peersHtml = peers.length > 0
    ? '<div class="ga-peer-group"><span class="ga-cost-label">Peer group:</span> ' + peers.join(', ') + '</div>'
    : '';

  const commentHtml = comment
    ? '<div class="rs-text" style="margin-top:8px">' + comment + '</div>'
    : '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Peer Comparison</div>' +
    metricsHtml + peersHtml + commentHtml +
  '</div>';
}

function _renderGoldSensitivities(ga) {
  const sens = ga.sensitivities;
  if (!sens) return '';

  const v = ga.valuation || {};
  const baseNav = v.ic_nav_usd_m || v.screening_nav_usd_m;
  if (!baseNav) return '';

  const scenarios = [
    ['Gold price +15%', sens.gold_price_up_15_nav_usd_m],
    ['Gold price -15%', sens.gold_price_down_15_nav_usd_m],
    ['FX +5%', sens.fx_plus_5pct_nav_usd_m],
    ['Recovery -2pt', sens.recovery_minus_2pt_nav_usd_m],
    ['Capex +15%', sens.capex_plus_15pct_nav_usd_m],
    ['6-month delay', sens.delay_6m_nav_usd_m]
  ];

  let hasAny = false;
  let rows = '';
  for (let i = 0; i < scenarios.length; i++) {
    const nav = scenarios[i][1];
    if (nav == null) continue;
    hasAny = true;
    const pctChange = Math.round((nav - baseNav) / baseNav * 100);
    const color = pctChange >= 0 ? 'var(--signal-green)' : 'var(--signal-red)';
    const sign = pctChange >= 0 ? '+' : '';
    rows += '<tr>' +
      '<td>' + scenarios[i][0] + '</td>' +
      '<td>US$' + nav.toLocaleString() + 'm</td>' +
      '<td style="color:' + color + '">' + sign + pctChange + '%</td>' +
    '</tr>';
  }

  if (!hasAny) return '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Sensitivity Analysis</div>' +
    '<table class="ga-metrics-table"><thead><tr>' +
      '<th>Scenario</th><th>NAV</th><th>Change</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
  '</div>';
}

function _renderGoldDiscoveryInner(data) {
  const t = data.ticker.toLowerCase();
  const ga = data.goldAgent;

  // Normalise both raw (gold_agent.py) and flattened schemas
  const skew = ga.skew_score != null ? ga.skew_score : (ga.scorecard ? ga.scorecard.skew_score : 0);
  const verdict = ga.verdict || ga.executive_summary || '';
  const bull = (ga.hypothesis && ga.hypothesis.bull) || (ga.investment_view && ga.investment_view.bull_case) || '';
  const bear = (ga.hypothesis && ga.hypothesis.bear) || (ga.investment_view && ga.investment_view.bear_case) || '';
  const trigger = ga.monitoring_trigger || (ga.investment_view && ga.investment_view.monitoring_trigger) || '';
  const km = ga.key_metrics || {};
  const aisc = km.aisc_per_oz != null ? km.aisc_per_oz : km.aisc_per_oz_usd;
  const netCash = km.net_cash_debt_aud_m != null ? km.net_cash_debt_aud_m : km.net_cash_debt_usd_m;

  // ---- Scorecard ----
  const skewColor = skew >= 55 ? 'var(--signal-green)' : skew <= 45 ? 'var(--signal-red)' : 'var(--signal-amber)';
  const stageBadge = ga.company_stage
    ? '<div class="ga-score-card"><div class="ga-score-label">Stage</div>' +
        '<div class="ga-score-value ga-stage-value">' + ga.company_stage.replace(/_/g, ' ') + '</div></div>'
    : '';

  const scorecardHtml =
    '<div class="ga-scorecard">' +
      '<div class="ga-score-card ga-score-skew" style="border-color:' + skewColor + '">' +
        '<div class="ga-score-label">Skew</div>' +
        '<div class="ga-score-value" style="color:' + skewColor + '">' + skew + '</div>' +
      '</div>' +
      stageBadge +
    '</div>';

  // ---- Verdict ----
  const verdictHtml = '<div class="ga-verdict">' +
    '<div class="rs-subtitle">Verdict</div>' +
    '<div class="rs-text">' + verdict + '</div>' +
  '</div>';

  // ---- Investment View (Bull / Bear) ----
  const viewHtml = '<div class="ga-view-grid">' +
    '<div class="ga-view-col ga-view-bull">' +
      '<div class="ga-view-label">Bull Case</div>' +
      '<div class="rs-text">' + bull + '</div>' +
    '</div>' +
    '<div class="ga-view-col ga-view-bear">' +
      '<div class="ga-view-label">Bear Case</div>' +
      '<div class="rs-text">' + bear + '</div>' +
    '</div>' +
  '</div>';

  // ---- Cost Structure (3x2 grid) ----
  const goldPrice = (km.gold_price_assumption_usd_per_oz || 2900);
  const aiscUsd = km.aisc_per_oz_usd || aisc;
  const margin = (aiscUsd && goldPrice) ? Math.round((goldPrice - aiscUsd) / goldPrice * 100) : null;

  const costItems = [
    ['AISC (per oz)', aisc != null ? ('A$' + aisc.toLocaleString()) : 'N/A'],
    ['Cash Cost (per oz)', km.cash_cost_per_oz_usd != null ? ('US$' + km.cash_cost_per_oz_usd.toLocaleString()) : 'N/A'],
    ['Production', km.production_koz_annual ? (km.production_koz_annual.toLocaleString() + ' koz/yr') : 'N/A'],
    ['Mine Life', km.mine_life_years ? (km.mine_life_years + ' years') : 'N/A'],
    ['Reserve Grade', km.reserve_grade_gt ? (km.reserve_grade_gt + ' g/t') : 'N/A'],
    ['Net Cash / (Debt)', netCash != null ? ('A$' + netCash.toLocaleString() + 'm') : 'N/A']
  ];

  let costGrid = '';
  for (let c = 0; c < costItems.length; c++) {
    costGrid += '<div class="ga-cost-cell">' +
      '<div class="ga-cost-label">' + costItems[c][0] + '</div>' +
      '<div class="ga-cost-value">' + costItems[c][1] + '</div>' +
    '</div>';
  }

  const marginHtml = margin != null
    ? '<div class="ga-margin-bar">' +
        '<span class="ga-margin-label">Margin at spot:</span> ' +
        '<span class="ga-margin-value" style="color:' + (margin > 30 ? 'var(--signal-green)' : margin > 15 ? 'var(--signal-amber)' : 'var(--signal-red)') + '">' + margin + '%</span>' +
      '</div>'
    : '';

  const metricsHtml = '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Cost Structure</div>' +
    marginHtml +
    '<div class="ga-cost-grid">' + costGrid + '</div>' +
  '</div>';

  // ---- Evidence ----
  let evidenceRows = '';
  const ev = ga.evidence || [];
  for (let e = 0; e < ev.length; e++) {
    const item = ev[e];
    evidenceRows += '<tr>' +
      '<td class="ga-ev-label">' + item.label + '</td>' +
      '<td class="ga-ev-finding">' + item.finding + '</td>' +
      '<td class="ga-ev-source">' + item.source + '</td>' +
    '</tr>';
  }
  const evidenceHtml = '<div class="rs-subtitle">Evidence Base</div>' +
    '<div class="ga-evidence-scroll">' +
    '<table class="ga-evidence-table"><thead><tr>' +
      '<th>Label</th><th>Finding</th><th>Source</th>' +
    '</tr></thead><tbody>' + evidenceRows + '</tbody></table>' +
    '</div>';

  // ---- Monitoring Trigger ----
  let triggerHtml = '';
  if (trigger) {
    triggerHtml = '<div class="ga-trigger">' +
      '<div class="rs-subtitle">Monitoring Trigger</div>' +
      '<div class="rs-text">' + trigger + '</div>' +
    '</div>';
  }

  // ---- Information Gaps ----
  let gapsHtml = '';
  const gaps = ga.information_gaps || [];
  if (gaps.length > 0) {
    let gapItems = '';
    for (let g = 0; g < gaps.length; g++) {
      gapItems += '<li class="ga-gap-item">' + gaps[g] + '</li>';
    }
    gapsHtml = '<div class="ga-gaps">' +
      '<div class="rs-subtitle">Information Gaps</div>' +
      '<ul class="ga-gap-list">' + gapItems + '</ul>' +
    '</div>';
  }

  // ---- Analysis date ----
  const dateHtml = '<div class="ga-date">Analysis date: ' + ga.analysis_date + '</div>';

  return '<div class="report-section" id="' + t + '-gold-analysis">' +
    RS_HDR('Section 02 / Gold', 'Gold Analysis') +
    '<div class="rs-body">' +
      scorecardHtml +
      verdictHtml +
      viewHtml +
      _renderGoldAssets(ga) +
      metricsHtml +
      _renderGoldValuation(ga) +
      _renderGoldPeers(ga) +
      _renderGoldSensitivities(ga) +
      evidenceHtml +
      triggerHtml +
      gapsHtml +
      dateHtml +
    '</div></div>';
}


// ---------------------------------------------------------------------------
// Section 10: Price Drivers (embedded research JSON)
// ---------------------------------------------------------------------------

export function renderPriceDrivers(data) {
  if (!data.priceDrivers) return '';
  const pd = data.priceDrivers;
  if (pd.error) return '';

  const ds = pd.driver_stack || {};
  const pa = pd.price_action_summary || {};
  const msc = pd.macro_sector_context || {};
  const eq = pd.evidence_quality || {};
  const ba = pd.broker_activity || {};
  const ss = pd.social_signal || {};
  const conf = pd.confidence || 'moderate';
  let primary = pd.primary_driver || '';
  const ticker = data.ticker || '';

  if (!primary && ds.primary && ds.primary.length > 0) primary = ds.primary[0];
  if (!primary) return '';

  const confCls = conf === 'very_high' || conf === 'high' ? 'pd-conf-high' : conf === 'moderate' ? 'pd-conf-mod' : 'pd-conf-low';
  const dateStr = _formatDriverDate(pd.analysis_date);

  // Performance grid helper
  function _fmtCell(val) {
    if (val == null) return '<span class="pd-perf-cell pd-perf-flat">N/A</span>';
    const dir = val > 0 ? '+' : '';
    const cls = val > 0.1 ? 'pd-perf-up' : val < -0.1 ? 'pd-perf-down' : 'pd-perf-flat';
    return '<span class="pd-perf-cell ' + cls + '">' + dir + val.toFixed(1) + '%</span>';
  }

  // Performance grid
  const gridHtml =
    '<div class="pd-perf-grid">' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-header"></span><span class="pd-perf-cell pd-perf-header">2D</span><span class="pd-perf-cell pd-perf-header">5D</span><span class="pd-perf-cell pd-perf-header">10D</span></div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">' + ticker + '</span>' + _fmtCell(pa.price_change_2d_pct) + _fmtCell(pa.price_change_5d_pct) + _fmtCell(pa.price_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">ASX 200</span>' + _fmtCell(pa.asx200_change_2d_pct) + _fmtCell(pa.asx200_change_5d_pct) + _fmtCell(pa.asx200_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">Relative</span>' + _fmtCell(pa.relative_2d_pct) + _fmtCell(pa.relative_5d_pct) + _fmtCell(pa.relative_10d_pct) + '</div>' +
    '</div>';

  // Broker alerts
  let brokerHtml = '';
  const upgrades = ba.recent_upgrades || [];
  const downgrades = ba.recent_downgrades || [];
  for (let u = 0; u < upgrades.length && u < 2; u++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-upgrade">\u2191 UPGRADE: ' + _truncate(upgrades[u], 200) + '</div>';
  }
  for (let dg = 0; dg < downgrades.length && dg < 2; dg++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-downgrade">\u2193 DOWNGRADE: ' + _truncate(downgrades[dg], 200) + '</div>';
  }

  // Social badge
  let socialHtml = '';
  const hcAct = ss.hotcopper_activity || '';
  if (hcAct === 'elevated') socialHtml = '<span class="pd-social pd-social-elevated">HC: Elevated</span>';
  else if (hcAct === 'quiet') socialHtml = '<span class="pd-social pd-social-quiet">HC: Quiet</span>';

  const MAX = 250;
  const bullets = [];
  bullets.push('<b>Primary driver:</b> ' + _truncate(primary, MAX));

  const secondaries = ds.secondary || [];
  if (secondaries.length > 0) {
    bullets.push('<b>Secondary:</b> ' + _truncate(secondaries.join('; '), MAX));
  }

  const peerText = msc.peer_moves_summary || '';
  const macroText = msc.commodity_or_rate_context || '';
  if (peerText && macroText) {
    bullets.push('<b>Peer and macro context:</b> ' + _truncate(peerText + '. ' + macroText, MAX));
  } else if (peerText) {
    bullets.push('<b>Peer context:</b> ' + _truncate(peerText, MAX));
  } else if (macroText) {
    bullets.push('<b>Macro context:</b> ' + _truncate(macroText, MAX));
  } else {
    const amps = ds.amplifiers || [];
    if (amps.length > 0) {
      bullets.push('<b>Amplifiers:</b> ' + _truncate(amps.join('; '), MAX));
    }
  }

  const rejected = ds.rejected || [];
  if (rejected.length > 0) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rejected.slice(0, 3).join('; '), MAX));
  }

  if (eq.key_gap) {
    bullets.push('<b>Confidence (' + conf.replace(/_/g, ' ') + '):</b> ' + _truncate(eq.key_gap, MAX));
  }

  let bulletsHtml = '<ul class="pd-bullets">';
  for (let i = 0; i < bullets.length; i++) {
    bulletsHtml += '<li>' + bullets[i] + '</li>';
  }
  bulletsHtml += '</ul>';

  const t = data.ticker.toLowerCase();
  return '<div class="report-section" id="' + t + '-price-drivers-embedded">' +
    RS_HDR('Section 10', 'Price Drivers') +
    '<div class="rs-body">' +
      '<div class="pd-block">' +
        '<div class="pd-header">' +
          '<span class="pd-label">WHAT DROVE THE PRICE</span>' +
          '<span class="pd-conf ' + confCls + '">' + conf.replace(/_/g, ' ') + '</span>' +
          socialHtml +
          (dateStr ? '<span class="pd-date">' + dateStr + '</span>' : '') +
        '</div>' +
        gridHtml +
        brokerHtml +
        bulletsHtml +
      '</div>' +
    '</div></div>';
}

// ---------------------------------------------------------------------------
// Section 11: Gold Analysis (embedded research JSON)
// ---------------------------------------------------------------------------

export function renderGoldSection(data) {
  if (!data.goldAnalysis) return '';
  const t = data.ticker.toLowerCase();
  const ga = data.goldAnalysis;

  // Executive summary
  let execHtml = '';
  if (ga.executive_summary) {
    execHtml =
      '<div class="rs-subtitle">Executive Summary</div>' +
      '<div class="rs-text">' + ga.executive_summary + '</div>';
  }

  // Investment view: bull/base/bear scenario table
  let viewHtml = '';
  const iv = ga.investment_view;
  if (iv) {
    viewHtml =
      '<div class="rs-subtitle">Investment View</div>' +
      '<table class="identity-table">' +
        '<thead><tr><th>Scenario</th><th>Thesis</th></tr></thead>' +
        '<tbody>' +
          (iv.bull_case ? '<tr><td class="td-label">Bull</td><td>' + iv.bull_case + '</td></tr>' : '') +
          (iv.base_case ? '<tr><td class="td-label">Base</td><td>' + iv.base_case + '</td></tr>' : '') +
          (iv.bear_case ? '<tr><td class="td-label">Bear</td><td>' + iv.bear_case + '</td></tr>' : '') +
        '</tbody>' +
      '</table>';
    if (iv.monitoring_trigger) {
      viewHtml += '<div class="callout"><div class="callout-label">Monitoring Trigger</div><div class="rs-text">' + iv.monitoring_trigger + '</div></div>';
    }
  }

  // Key metrics
  let metricsHtml = '';
  const km = ga.key_metrics;
  if (km) {
    let metricRows = '';
    const metricPairs = [
      ['AISC (per oz)', km.aisc_per_oz != null ? ('A$' + km.aisc_per_oz.toLocaleString()) : null],
      ['Production', km.production_koz_annual ? (km.production_koz_annual.toLocaleString() + ' koz/yr') : null],
      ['Reserve Grade', km.reserve_grade_gt ? (km.reserve_grade_gt + ' g/t') : null],
      ['Mine Life', km.mine_life_years ? (km.mine_life_years + ' years') : null],
      ['Net Cash / (Debt)', km.net_cash_debt_aud_m != null ? ('A$' + km.net_cash_debt_aud_m.toLocaleString() + 'm') : null],
      ['Gold Price Assumption', km.gold_price_assumption_usd_per_oz ? ('US$' + km.gold_price_assumption_usd_per_oz.toLocaleString()) : null]
    ];
    for (var i = 0; i < metricPairs.length; i++) {
      if (metricPairs[i][1] != null) {
        metricRows += '<tr><td class="td-label">' + metricPairs[i][0] + '</td><td>' + metricPairs[i][1] + '</td></tr>';
      }
    }
    if (metricRows) {
      metricsHtml =
        '<div class="rs-subtitle">Key Metrics</div>' +
        '<table class="identity-table"><thead><tr><th>Metric</th><th>Value</th></tr></thead>' +
        '<tbody>' + metricRows + '</tbody></table>';
    }
  }

  // Assets table
  let assetsHtml = '';
  const assets = ga.assets;
  if (assets && assets.length > 0) {
    let assetRows = '';
    for (var i = 0; i < assets.length; i++) {
      const a = assets[i];
      assetRows += '<tr>' +
        '<td>' + (a.name || 'N/A') + '</td>' +
        '<td>' + (a.stage || 'N/A') + '</td>' +
        '<td>' + (a.annual_production_koz != null ? a.annual_production_koz + ' koz' : 'N/A') + '</td>' +
        '<td>' + (a.reserve_grade_gt != null ? a.reserve_grade_gt + ' g/t' : 'N/A') + '</td>' +
        '<td>' + (a.aisc_per_oz_usd != null ? 'US$' + a.aisc_per_oz_usd.toLocaleString() : 'N/A') + '</td>' +
      '</tr>';
    }
    assetsHtml =
      '<div class="rs-subtitle">Asset Portfolio</div>' +
      '<div class="ga-evidence-scroll">' +
      '<table class="ga-metrics-table ga-assets-table"><thead><tr>' +
        '<th>Asset</th><th>Stage</th><th>Production</th><th>Grade</th><th>AISC</th>' +
      '</tr></thead><tbody>' + assetRows + '</tbody></table></div>';
  }

  // Quality scorecard
  let scorecardHtml = '';
  const sc = ga.quality_scorecard || ga.scorecard;
  if (sc) {
    let scItems = '';
    const scKeys = Object.keys(sc);
    for (var i = 0; i < scKeys.length; i++) {
      const key = scKeys[i];
      const val = sc[key];
      if (typeof val === 'object') continue;
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      scItems += '<tr><td class="td-label">' + label + '</td><td>' + val + '</td></tr>';
    }
    if (scItems) {
      scorecardHtml =
        '<div class="rs-subtitle">Quality Scorecard</div>' +
        '<table class="identity-table"><thead><tr><th>Criterion</th><th>Rating</th></tr></thead>' +
        '<tbody>' + scItems + '</tbody></table>';
    }
  }

  // Risks
  let risksHtml = '';
  const risks = ga.risks || [];
  if (risks.length > 0) {
    let riskItems = '';
    for (var i = 0; i < risks.length; i++) {
      riskItems += '<li>' + risks[i] + '</li>';
    }
    risksHtml =
      '<div class="rs-subtitle">Key Risks</div>' +
      '<ul class="hc-list contradicts">' + riskItems + '</ul>';
  }

  // Recommendation
  let recoHtml = '';
  if (ga.recommendation) {
    recoHtml =
      '<div class="callout">' +
        '<div class="callout-label">Recommendation</div>' +
        '<div class="rs-text">' + ga.recommendation + '</div>' +
      '</div>';
  }

  return '<div class="report-section" id="' + t + '-gold-section">' +
    RS_HDR('Section 11', 'Gold Analysis') +
    '<div class="rs-body">' +
      execHtml +
      viewHtml +
      metricsHtml +
      assetsHtml +
      scorecardHtml +
      risksHtml +
      recoHtml +
    '</div></div>';
}


export function setupScrollSpy(pageId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  const navLinks = page.querySelectorAll('.section-nav a');
  const sections = [];
  navLinks.forEach(link => {
    const targetId = link.getAttribute('href');
    if (targetId && targetId.startsWith('#')) {
      const section = document.getElementById(targetId.slice(1));
      if (section) sections.push({ link, section });
    }
  });

  if (sections.length === 0) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        navLinks.forEach(l => l.classList.remove('active'));
        const match = sections.find(s => s.section === entry.target);
        if (match) match.link.classList.add('active');
      }
    });
  }, {
    rootMargin: '-20% 0px -70% 0px',
    threshold: 0
  });

  sections.forEach(s => observer.observe(s.section));
}


// ---------------------------------------------------------------------------
// Price Drivers -- async content renderer
// ---------------------------------------------------------------------------

export function renderPriceDriversPlaceholder(ticker) {
  return '<div id="price-drivers-' + ticker + '" class="pd-container"></div>';
}


function _formatDriverDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + '-' + months[d.getMonth()] + '-' + String(d.getFullYear()).slice(2);
}

function _truncate(text, maxLen) {
  if (!text) return '';
  const s = String(text).trim();
  if (s.length <= maxLen) return s;
  const cut = s.substring(0, maxLen);
  const lastDot = cut.lastIndexOf('. ');
  if (lastDot > maxLen * 0.5) return cut.substring(0, lastDot + 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) return cut.substring(0, lastSpace) + '.';
  return cut + '.';
}


export function renderPriceDriversContent(container, driverData) {
  if (!driverData || driverData.error) {
    container.style.display = 'none';
    return;
  }

  const ds = driverData.driver_stack || {};
  const rc = driverData.ranked_conclusion || {};
  const rt = driverData.report_text || {};
  const pa = driverData.price_action_summary || {};
  const eq = driverData.evidence_quality || {};
  const ba = driverData.broker_activity || {};
  const ss = driverData.social_signal || {};
  const meta = driverData.agent_metadata || {};
  const conf = driverData.confidence || rc.overall_confidence || 'moderate';
  const confCls = conf === 'very_high' || conf === 'high' ? 'pd-conf-high' : conf === 'moderate' ? 'pd-conf-mod' : 'pd-conf-low';
  const dateStr = _formatDriverDate(driverData.analysis_date || meta.analysis_date);
  const ticker = driverData.ticker || '';

  // Performance grid helper
  function _fmtCell(val) {
    if (val == null) return '<span class="pd-perf-cell pd-perf-flat">N/A</span>';
    const dir = val > 0 ? '+' : '';
    const cls = val > 0.1 ? 'pd-perf-up' : val < -0.1 ? 'pd-perf-down' : 'pd-perf-flat';
    return '<span class="pd-perf-cell ' + cls + '">' + dir + val.toFixed(1) + '%</span>';
  }

  // Performance grid
  const gridHtml =
    '<div class="pd-perf-grid">' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-header"></span><span class="pd-perf-cell pd-perf-header">2D</span><span class="pd-perf-cell pd-perf-header">5D</span><span class="pd-perf-cell pd-perf-header">10D</span></div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">' + ticker + '</span>' + _fmtCell(pa.price_change_2d_pct) + _fmtCell(pa.price_change_5d_pct) + _fmtCell(pa.price_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">ASX 200</span>' + _fmtCell(pa.asx200_change_2d_pct) + _fmtCell(pa.asx200_change_5d_pct) + _fmtCell(pa.asx200_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">Relative</span>' + _fmtCell(pa.relative_2d_pct) + _fmtCell(pa.relative_5d_pct) + _fmtCell(pa.relative_10d_pct) + '</div>' +
    '</div>';

  // Broker alerts
  let brokerHtml = '';
  const upgrades = ba.recent_upgrades || [];
  const downgrades = ba.recent_downgrades || [];
  for (let u = 0; u < upgrades.length && u < 2; u++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-upgrade">\u2191 UPGRADE: ' + _truncate(upgrades[u], 200) + '</div>';
  }
  for (let dg = 0; dg < downgrades.length && dg < 2; dg++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-downgrade">\u2193 DOWNGRADE: ' + _truncate(downgrades[dg], 200) + '</div>';
  }

  // Social badge
  let socialHtml = '';
  const hcAct = ss.hotcopper_activity || '';
  if (hcAct === 'elevated') socialHtml = '<span class="pd-social pd-social-elevated">HC: Elevated</span>';
  else if (hcAct === 'quiet') socialHtml = '<span class="pd-social pd-social-quiet">HC: Quiet</span>';

  // Build 5 bullets from available data (new or old schema)
  const MAX = 250;
  const bullets = [];

  // Bullet 1: Primary driver
  let primary = driverData.primary_driver || rc.most_likely_primary_driver || '';
  if (!primary && ds.primary && ds.primary.length > 0) primary = ds.primary[0];
  if (!primary && rt.primary_driver_paragraph) primary = _truncate(rt.primary_driver_paragraph, MAX);
  if (primary) {
    bullets.push('<b>Primary driver:</b> ' + _truncate(primary, MAX));
  }

  // Bullet 2: Secondary drivers
  const secondaries = ds.secondary || rc.secondary_drivers || [];
  if (secondaries.length > 0) {
    bullets.push('<b>Secondary:</b> ' + _truncate(secondaries.join('; '), MAX));
  } else if (rt.secondary_drivers_paragraph) {
    bullets.push('<b>Secondary:</b> ' + _truncate(rt.secondary_drivers_paragraph, MAX));
  }

  // Bullet 3: Peer and macro context or amplifiers
  const msc = driverData.macro_sector_context || {};
  const peerText = msc.peer_moves_summary || '';
  const macroText = msc.commodity_or_rate_context || '';
  if (peerText && macroText) {
    bullets.push('<b>Peer and macro context:</b> ' + _truncate(peerText + '. ' + macroText, MAX));
  } else if (peerText) {
    bullets.push('<b>Peer context:</b> ' + _truncate(peerText, MAX));
  } else if (macroText) {
    bullets.push('<b>Macro context:</b> ' + _truncate(macroText, MAX));
  }
  if (!peerText && !macroText) {
    const amps = ds.amplifiers || rc.amplifiers || [];
    if (amps.length > 0) {
      bullets.push('<b>Amplifiers:</b> ' + _truncate(amps.join('; '), MAX));
    }
  }

  // Bullet 4: Ruled out
  const rejected = ds.rejected || rc.rejected_explanations || [];
  if (rejected.length > 0) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rejected.slice(0, 3).join('; '), MAX));
  } else if (rt.rejected_explanations_paragraph) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rt.rejected_explanations_paragraph, MAX));
  }

  // Bullet 5: Confidence rationale
  let rationale = '';
  if (eq.key_gap) {
    rationale = eq.key_gap;
  } else if (rc.confidence_rationale) {
    rationale = rc.confidence_rationale;
  } else if (rt.final_judgement_paragraph) {
    rationale = _truncate(rt.final_judgement_paragraph, MAX);
  }
  if (rationale) {
    bullets.push('<b>Confidence (' + conf.replace(/_/g, ' ') + '):</b> ' + _truncate(rationale, MAX));
  }

  if (bullets.length === 0) {
    container.style.display = 'none';
    return;
  }

  let bulletsHtml = '<ul class="pd-bullets">';
  for (let i = 0; i < bullets.length; i++) {
    bulletsHtml += '<li>' + bullets[i] + '</li>';
  }
  bulletsHtml += '</ul>';

  container.innerHTML =
    '<div class="pd-block">' +
      '<div class="pd-header">' +
        '<span class="pd-label">WHAT DROVE THE PRICE</span>' +
        '<span class="pd-conf ' + confCls + '">' + conf.replace(/_/g, ' ') + '</span>' +
        socialHtml +
        (dateStr ? '<span class="pd-date">' + dateStr + '</span>' : '') +
      '</div>' +
      gridHtml +
      brokerHtml +
      bulletsHtml +
    '</div>';
}


export function fetchPriceDrivers(ticker, force) {
  const container = document.getElementById('price-drivers-' + ticker);
  if (!container) return;

  const baseUrl = API_BASE;
  const apiKey = window.CI_API_KEY || '';

  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  // /latest serves cache only; /{ticker} runs fresh analysis
  const endpoint = force
    ? '/api/agents/drivers/' + ticker
    : '/api/agents/drivers/' + ticker + '/latest';

  fetch(baseUrl + endpoint, { headers: headers })
    .then(function(resp) {
      if (!resp.ok) {
        container.style.display = 'none';
        return null;
      }
      return resp.json();
    })
    .then(function(data) {
      if (data) renderPriceDriversContent(container, data);
    })
    .catch(function() {
      container.style.display = 'none';
    });
}
