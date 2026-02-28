// report-sections.js — Individual report section renderers
// Extracted from index.html without logic changes

import { STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA, FEATURED_ORDER } from '../lib/state.js';
import { renderSparkline } from '../lib/format.js';
import { normaliseScores, computeSkewScore } from '../lib/dom.js';

const RS_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
function RS_HDR(num, title) {
  return '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">' + num + '</div>' +
    '<div class="rs-title">' + title + '</div>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' + RS_CHEVRON + '</button></div>';
}

export function renderReportHero(data) {
  var metricsHtml = '';
  for (var i = 0; i < data.heroMetrics.length; i++) {
    var m = data.heroMetrics[i];
    var cls = 'rh-metric-value' + (m.colorClass ? ' ' + m.colorClass : '');
    metricsHtml += '<div class="rh-metric"><div class="rh-metric-label">' + m.label + '</div><div class="' + cls + '">' + m.value + '</div></div>';
  }

  var sparklineHtml = data.priceHistory ? renderSparkline(data.priceHistory) : '';

  // Spec Section 1.2 -- What the Price Embeds
  var embeddedThesisHtml = '';
  if (data.hero && data.hero.embedded_thesis) {
    embeddedThesisHtml =
      '<div class="rh-spec-block rh-embedded-thesis">' +
        '<div class="rh-spec-label">WHAT THE PRICE EMBEDS</div>' +
        '<p class="rh-spec-text">' + data.hero.embedded_thesis + '</p>' +
      '</div>';
  }

  // Spec Section 1.3 -- Position in Range
  var positionInRangeHtml = '';
  if (data.hero && data.hero.position_in_range) {
    var pir = data.hero.position_in_range;
    var worlds = pir.worlds;
    var current = parseFloat(data._livePrice || data.price || pir.current_price);
    var prices = worlds.map(function(w) { w.price = parseFloat(w.price) || 0; return w.price; });
    prices.push(current);
    var minP = Math.min.apply(null, prices);
    var maxP = Math.max.apply(null, prices);
    var rangeP = maxP - minP || 1;

    var worldMarkersHtml = '';
    for (var i = 0; i < worlds.length; i++) {
      var w = worlds[i];
      var pct = ((w.price - minP) / rangeP * 100).toFixed(1);
      worldMarkersHtml +=
        '<div class="pir-world" style="left:' + pct + '%">' +
          '<div class="pir-world-tick"></div>' +
          '<div class="pir-world-price">A$' + w.price.toFixed(0) + '</div>' +
          '<div class="pir-world-label">' + w.label + '</div>' +
        '</div>';
    }
    var currentPct = ((current - minP) / rangeP * 100).toFixed(1);

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
          '</div>' +
        '</div>' +
        (pir.note ? '<div class="pir-note">' + pir.note + '</div>' : '') +
      '</div>';
  }

  // Spec Section 1.4 -- Valuation Range
  var valuationRangeHtml = '';
  if (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds &&
      data.hero.position_in_range.worlds.length >= 4) {
    var vrWorlds = data.hero.position_in_range.worlds;
    var vrCurrent = data._livePrice || data.price || data.hero.position_in_range.current_price;
    vrCurrent = parseFloat(vrCurrent);
    var vrBear    = parseFloat(vrWorlds[1].price) || 0;
    var vrFairLow = (parseFloat(vrWorlds[1].price) + parseFloat(vrWorlds[2].price)) / 2;
    var vrFairHigh= (parseFloat(vrWorlds[2].price) + parseFloat(vrWorlds[3].price)) / 2;
    var vrBull    = parseFloat(vrWorlds[3].price) || 0;
    var vrMin     = parseFloat(vrWorlds[0].price) || 0;
    var vrRange   = vrBull - vrMin || 1;

    var vrBadgeCls   = vrCurrent < vrBear ? 'amber' : vrCurrent > vrFairHigh ? 'positive' : 'neutral';
    var vrBadgeLabel = vrCurrent < vrBear ? 'AMBER'  : vrCurrent > vrFairHigh ? 'POSITIVE' : 'NEUTRAL';

    var vrBearPct    = ((vrBear     - vrMin) / vrRange * 100).toFixed(1);
    var vrFairLowPct = ((vrFairLow  - vrMin) / vrRange * 100).toFixed(1);
    var vrFairHighPct= ((vrFairHigh - vrMin) / vrRange * 100).toFixed(1);
    var vrCurrPct    = Math.min(100, Math.max(0, ((vrCurrent - vrMin) / vrRange * 100))).toFixed(1);

    var vrToFairH = ((vrFairHigh / vrCurrent - 1) * 100).toFixed(1);
    var vrToBull  = ((vrBull     / vrCurrent - 1) * 100).toFixed(1);
    var vrToBear  = ((vrBear     / vrCurrent - 1) * 100).toFixed(1);

    var vrPE = '';
    if (data.heroMetrics) {
      for (var mi = 0; mi < data.heroMetrics.length; mi++) {
        if (data.heroMetrics[mi].label === 'FWD P/E') { vrPE = data.heroMetrics[mi].value; break; }
      }
    }

    valuationRangeHtml =
      '<div class="rh-spec-block vr-block">' +
        '<div class="vr-title-row">' +
          '<span class="rh-spec-label">VALUATION RANGE</span>' +
          '<span class="vr-badge ' + vrBadgeCls + '">' + vrBadgeLabel + '</span>' +
        '</div>' +
        '<div class="vr-bar-wrap">' +
          '<div class="vr-bar">' +
            '<div class="vr-current" style="left:' + vrCurrPct + '%">A$' + vrCurrent.toFixed(2) + '</div>' +
            '<div class="vr-marker" style="left:' + vrBearPct + '%">' +
              '<div class="vr-marker-price">A$' + vrBear.toFixed(2) + '</div>' +
              '<div class="vr-marker-label">Bear</div>' +
            '</div>' +
            '<div class="vr-marker" style="left:' + vrFairLowPct + '%;color:var(--accent-teal)">' +
              '<div class="vr-marker-price" style="color:var(--accent-teal)">A$' + vrFairLow.toFixed(2) + ' &ndash; A$' + vrFairHigh.toFixed(2) + '</div>' +
              '<div class="vr-marker-label">Fair</div>' +
            '</div>' +
            '<div class="vr-marker" style="left:100%">' +
              '<div class="vr-marker-price">A$' + vrBull.toFixed(2) + '</div>' +
              '<div class="vr-marker-label">Bull</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="vr-stats">' +
          '<span class="pos">+' + vrToFairH + '% to fair high</span>' +
          '<span class="pos">+' + vrToBull + '% to bull case</span>' +
          '<span>' + vrToBear + '% to bear case</span>' +
          (vrPE ? '<span>PE FORWARD: ' + vrPE + '</span>' : '') +
        '</div>' +
      '</div>';
  }

  // Spec Section 1.5 -- Skew Indicator
  var skewIndicatorHtml = '';
  if (data.hero && data.hero.skew) {
    var skewCls = data.hero.skew === 'DOWNSIDE' ? 'rh-skew-down' : data.hero.skew === 'UPSIDE' ? 'rh-skew-up' : 'rh-skew-balanced';
    skewIndicatorHtml =
      '<div class="rh-spec-block rh-skew-indicator">' +
        '<span class="rh-spec-label">SKEW: </span>' +
        '<span class="rh-skew-value ' + skewCls + '">' + data.hero.skew + '</span>' +
        (data.hero.skew_description ? '<p class="rh-spec-text">' + data.hero.skew_description + '</p>' : '') +
      '</div>';
  }

  // Spec Section 1.5 -- Next Decision Point
  var nextDecisionHtml = '';
  if (data.hero && data.hero.next_decision_point) {
    var ndp = data.hero.next_decision_point;
    nextDecisionHtml =
      '<div class="rh-spec-block rh-next-decision">' +
        '<div class="rh-spec-label">NEXT DECISION POINT</div>' +
        '<div class="ndp-event">' + ndp.event + ' &middot; <span class="ndp-date">' + ndp.date + '</span></div>' +
        '<p class="rh-spec-text">' + ndp.metric + '. ' + ndp.thresholds + '</p>' +
      '</div>';
  }

  // Prev/next stock navigation
  var _navTickers = (typeof FEATURED_ORDER !== 'undefined') ? FEATURED_ORDER : Object.keys(STOCK_DATA);
  var _navIdx = _navTickers.indexOf(data.ticker);
  var _prevTicker = _navTickers[(_navIdx - 1 + _navTickers.length) % _navTickers.length];
  var _nextTicker = _navTickers[(_navIdx + 1) % _navTickers.length];
  var stockNavHtml = '<div class="rh-stock-nav-bar">' +
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
          '<div class="rh-ticker">' + data.company + '</div>' +
          '<div class="rh-company">' + data.tickerFull + ' &bull; ' + data.exchange + ' &bull; ' + data.sector + '</div>' +
          '<div class="rh-sector-tag">' + data.heroDescription + '</div>' +
          (data.heroCompanyDescription ? '<div class="rh-company-desc">' + data.heroCompanyDescription + '</div>' : '') +
          '<div class="refresh-controls">' +
            '<button class="btn-refresh" id="refresh-btn-' + data.ticker + '" onclick="triggerRefresh(\'' + data.ticker + '\')">' +
              '<span class="refresh-icon">&#8635;</span> Update' +
            '</button>' +
            '<span class="refresh-timestamp" id="refresh-ts-' + data.ticker + '">' +
              (data.date ? 'Last updated: ' + data.date : '') +
            '</span>' +
            '<div class="refresh-progress" id="refresh-progress-' + data.ticker + '" style="display:none">' +
              '<div class="progress-bar"><div class="progress-fill" id="refresh-fill-' + data.ticker + '"></div></div>' +
              '<span class="progress-label" id="refresh-label-' + data.ticker + '">Searching for new data...</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="rh-right">' +
          sparklineHtml +
          '<div class="rh-price"><span class="rh-price-currency">' + data.currency + '</span>' + data.price + '</div>' +
          '<div class="rh-metrics">' + metricsHtml + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>' +
  (embeddedThesisHtml || positionInRangeHtml || valuationRangeHtml || skewIndicatorHtml || nextDecisionHtml
    ? '<div class="rh-spec-section"><div class="report-hero-inner">' +
        embeddedThesisHtml +
        positionInRangeHtml +
        valuationRangeHtml +
        skewIndicatorHtml +
        nextDecisionHtml +
      '</div></div>'
    : '');
}

export function renderSkewBar(data) {
  var skew = data._skew || computeSkewScore(data);
  var dir = skew.direction;
  var arrow = dir === 'downside' ? '&#9660; DOWNSIDE' : dir === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';
  var scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  var scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;

  return '<div class="risk-skew-bar">' +
    '<div class="rsb-inner">' +
      '<span class="rsb-label">Thesis Skew</span>' +
      '<span class="skew-badge ' + dir + '">' + arrow + '</span>' +
      '<div class="skew-bar-track" style="width:80px;height:10px;margin:0 4px">' +
        '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
        '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
      '</div>' +
      '<span class="skew-score ' + scoreCls + '" style="font-size:0.82rem">' + scoreLabel + '</span>' +
      '<span class="rsb-rationale">' + data.skew.rationale + '</span>' +
    '</div>' +
  '</div>';
}

export function renderVerdict(data) {
  var v = data.verdict;
  var borderStyle = v.borderColor ? ' style="border-color: ' + v.borderColor + '"' : '';
  var norm = normaliseScores(v.scores);

  var scoresHtml = '';
  for (var i = 0; i < v.scores.length; i++) {
    var s = v.scores[i];
    var dirStyle = s.dirColor ? ' style="color:' + s.dirColor + '"' : '';
    var dirAttr = data.hypotheses[i] ? ' data-dir="' + (data.hypotheses[i].dirClass || 'dir-neutral') + '"' : '';
    scoresHtml += '<div class="vs-item"' + dirAttr + '>' +
      '<div class="vs-label">' + s.label + '</div>' +
      '<div class="vs-score" style="color:' + s.scoreColor + '">' + norm[i] + '%</div>' +
      '<div class="vs-direction"' + dirStyle + '>' + s.dirArrow + ' ' + s.dirText + '</div>' +
    '</div>';
  }

  return '<div class="verdict-section">' +
    '<div class="verdict-inner"' + borderStyle + '>' +
      '<div class="verdict-text">' + v.text + '</div>' +
      '<div class="verdict-scores">' + scoresHtml + '</div>' +
    '</div>' +
  '</div>';
}

export function renderSectionNav(data) {
  var t = data.ticker.toLowerCase();
  var sections = [
    ['identity', 'Identity'],
    ['hypotheses', 'Hypotheses'],
    ['narrative-timeline', 'Timeline'],
    ['narrative', 'Narrative'],
    ['evidence', 'Evidence'],
    ['discriminates', 'Discriminates'],
    ['tripwires', 'Tripwires'],
    ['gaps', 'Gaps'],
    ['technical', 'Technical'],
    ['chat', 'Research Chat']
  ];

  if (!data.technicalAnalysis) {
    sections.splice(sections.length - 2, 1);
  }

  var linksHtml = '';
  for (var i = 0; i < sections.length; i++) {
    var activeClass = i === 0 ? ' class="active"' : '';
    linksHtml += '<a href="#' + t + '-' + sections[i][0] + '"' + activeClass + '>' + sections[i][1] + '</a>';
  }

  return '<div class="section-nav">' +
    '<div class="section-nav-inner">' +
      linksHtml +
      '<button class="section-nav-toggle-all" onclick="window.toggleAllSections(this)" data-state="expanded" aria-label="Collapse all sections">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="18 15 12 9 6 15"/></svg>' +
        '<span>Collapse All</span>' +
      '</button>' +
    '</div>' +
  '</div>';
}

export function renderIdentity(data) {
  var t = data.ticker.toLowerCase();
  var id = data.identity;

  var rowsHtml = '';
  for (var i = 0; i < id.rows.length; i++) {
    var row = id.rows[i];
    var left = row[0];
    var right = row[1];
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
    '<p class="rs-text"><strong>Business overview:</strong> ' + id.overview + '</p>' +
  '</div></div>';
}

export function renderHypotheses(data) {
  var t = data.ticker.toLowerCase();
  var cardsHtml = '';
  var norm = normaliseScores(data.hypotheses);

  for (var i = 0; i < data.hypotheses.length; i++) {
    var h = data.hypotheses[i];
    var normScore = norm[i] + '%';
    var normWidth = norm[i] + '%';

    var requiresHtml = '';
    if (h.requires && h.requires.length > 0) {
      requiresHtml = '<div class="hc-subtitle">Requires</div><ul class="hc-list requires">';
      for (var r = 0; r < h.requires.length; r++) {
        requiresHtml += '<li>' + h.requires[r] + '</li>';
      }
      requiresHtml += '</ul>';
    }

    var supportHtml = '';
    if (h.supporting && h.supporting.length > 0) {
      supportHtml = '<div class="hc-subtitle">' + h.supportingLabel + '</div><ul class="hc-list supports">';
      for (var s = 0; s < h.supporting.length; s++) {
        supportHtml += '<li>' + h.supporting[s] + '</li>';
      }
      supportHtml += '</ul>';
    }

    var contradictHtml = '';
    if (h.contradicting && h.contradicting.length > 0) {
      contradictHtml = '<div class="hc-subtitle">' + h.contradictingLabel + '</div><ul class="hc-list contradicts">';
      for (var c = 0; c < h.contradicting.length; c++) {
        contradictHtml += '<li>' + h.contradicting[c] + '</li>';
      }
      contradictHtml += '</ul>';
    }

    var dominantCls = (i === 0) ? ' dominant' : '';
    cardsHtml += '<div class="hyp-card ' + h.dirClass + dominantCls + '">' +
      '<div class="hc-header"><div class="hc-title">' + h.title + '</div><div class="hc-status ' + h.statusClass + '">' + h.statusText + '</div></div>' +
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
  var t = data.ticker.toLowerCase();
  var n = data.narrative;

  return '<div class="report-section" id="' + t + '-narrative">' +
    RS_HDR('Section 03', 'Dominant Narrative') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">The Narrative</div>' +
    '<p class="rs-text">' + n.theNarrative + '</p>' +
    '<div class="rs-subtitle">The Price Implication</div>' +
    '<div class="callout">' +
      '<div class="callout-label">' + n.priceImplication.label + '</div>' +
      '<p>' + n.priceImplication.content + '</p>' +
    '</div>' +
    '<div class="rs-subtitle">The Evidence Check</div>' +
    '<p class="rs-text">' + n.evidenceCheck + '</p>' +
    '<div class="rs-subtitle">Narrative Stability</div>' +
    '<p class="rs-text">' + n.narrativeStability + '</p>' +
  '</div></div>';
}

export function renderEvidenceCard(card) {
  var tableHtml = '';
  if (card.table) {
    var thHtml = '';
    for (var h = 0; h < card.table.headers.length; h++) {
      thHtml += '<th>' + card.table.headers[h] + '</th>';
    }
    var tbHtml = '';
    for (var r = 0; r < card.table.rows.length; r++) {
      tbHtml += '<tr>';
      for (var c = 0; c < card.table.rows[r].length; c++) {
        tbHtml += '<td>' + card.table.rows[r][c] + '</td>';
      }
      tbHtml += '</tr>';
    }
    tableHtml = '<table class="identity-table" style="margin-bottom:var(--space-md)">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody>' + tbHtml + '</tbody>' +
    '</table>';
  }

  var tensionHtml = '';
  if (card.tension) {
    tensionHtml = '<div class="ec-tension">' +
      '<div class="ec-tension-label">Key Tension</div>' +
      '<p>' + card.tension + '</p>' +
    '</div>';
  }

  var tagsHtml = '';
  for (var t = 0; t < card.tags.length; t++) {
    tagsHtml += '<span class="ec-tag ' + card.tags[t].class + '">' + card.tags[t].text + '</span>';
  }

  return '<div class="evidence-card">' +
    '<div class="ec-header">' +
      '<div class="ec-title">' + card.title + '</div>' +
      '<div class="ec-header-right">' +
        '<span class="ec-epistemic ' + card.epistemicClass + '">' + card.epistemicLabel + '</span>' +
        '<span class="ec-toggle">&#9660;</span>' +
      '</div>' +
    '</div>' +
    '<div class="ec-body">' +
      tableHtml +
      '<div class="ec-finding">' + card.finding + '</div>' +
      tensionHtml +
      '<div class="ec-footer">' +
        '<div class="ec-tags">' + tagsHtml + '</div>' +
        '<div class="ec-source">' + card.source + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderAlignmentSummary(data) {
  if (!data.evidence.alignmentSummary) return '';

  var as = data.evidence.alignmentSummary;

  var thHtml = '';
  for (var h = 0; h < as.headers.length; h++) {
    thHtml += '<th>' + as.headers[h] + '</th>';
  }

  var tbHtml = '';
  for (var i = 0; i < as.rows.length; i++) {
    var row = as.rows[i];

    var cellFn = function(cell) {
      var styleAttr = cell.style ? ' style="' + cell.style + '"' : '';
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

  var sum = as.summary;
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
  var t = data.ticker.toLowerCase();
  var ev = data.evidence;

  var cardsHtml = '';
  for (var i = 0; i < ev.cards.length; i++) {
    cardsHtml += renderEvidenceCard(ev.cards[i]);
  }

  var alignmentHtml = renderAlignmentSummary(data);

  return '<div class="report-section" id="' + t + '-evidence">' +
    RS_HDR('Section 04', 'Cross-Domain Evidence Synthesis') +
    '<div class="rs-body">' +
    '<p class="rs-text">' + ev.intro + '</p>' +
    cardsHtml +
    alignmentHtml +
  '</div></div>';
}

export function renderDiscriminators(data) {
  var t = data.ticker.toLowerCase();
  var d = data.discriminators;

  var rowsHtml = '';
  for (var i = 0; i < d.rows.length; i++) {
    var r = d.rows[i];
    rowsHtml += '<tr>' +
      '<td><span class="' + r.diagnosticityClass + '">' + r.diagnosticity + '</span></td>' +
      '<td>' + r.evidence + '</td>' +
      '<td>' + r.discriminatesBetween + '</td>' +
      '<td class="' + r.readingClass + '">' + r.currentReading + '</td>' +
    '</tr>';
  }

  return '<div class="report-section" id="' + t + '-discriminates">' +
    RS_HDR('Section 05', 'What Discriminates') +
    '<div class="rs-body">' +
    '<p class="rs-text">' + d.intro + '</p>' +
    '<table class="disc-table">' +
      '<thead><tr><th>Diagnosticity</th><th>Evidence</th><th>Discriminates Between</th><th>Current Reading</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    '<div class="callout warn">' +
      '<div class="callout-label">Non-Discriminating Evidence &mdash; Assessed &amp; Discarded</div>' +
      '<p>' + d.nonDiscriminating + '</p>' +
    '</div>' +
  '</div></div>';
}

export function renderTripwires(data) {
  var t = data.ticker.toLowerCase();
  var tw = data.tripwires;

  var cardsHtml = '';
  for (var i = 0; i < tw.cards.length; i++) {
    var card = tw.cards[i];

    var conditionsHtml = '';
    for (var c = 0; c < card.conditions.length; c++) {
      var cond = card.conditions[c];
      conditionsHtml += '<div class="tw-condition">' +
        '<div class="tw-cond-if ' + cond.valence + '">' + cond.if + '</div>' +
        '<div class="tw-cond-then">' + cond.then + '</div>' +
      '</div>';
    }

    var resolvedCls = card.name.indexOf('RESOLVED') >= 0 ? ' tw-resolved' : '';

    cardsHtml += '<div class="tw-card' + resolvedCls + '">' +
      '<div class="tw-header"><div class="tw-date">' + card.date + '</div><div class="tw-name">' + card.name + '</div></div>' +
      '<div class="tw-conditions">' + conditionsHtml + '</div>' +
      '<div class="tw-source">' + (card.source || '') + '</div>' +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-tripwires">' +
    RS_HDR('Section 06', 'What We\'re Watching') +
    '<div class="rs-body">' +
    '<p class="rs-text">' + tw.intro + '</p>' +
    cardsHtml +
  '</div></div>';
}

export function renderGaps(data) {
  var t = data.ticker.toLowerCase();
  var g = data.gaps;

  var coverageHtml = '';
  for (var i = 0; i < g.coverageRows.length; i++) {
    var r = g.coverageRows[i];
    var confClass = r.confidenceClass ? ' class="' + r.confidenceClass + '"' : '';
    coverageHtml += '<tr>' +
      '<td>' + r.domain + '</td>' +
      '<td><span class="gap-dot ' + r.coverageLevel + '"></span>' + r.coverageLabel + '</td>' +
      '<td style="font-family:var(--font-data)">' + r.freshness + '</td>' +
      '<td' + confClass + '>' + r.confidence + '</td>' +
    '</tr>';
  }

  var calloutsHtml = '';
  for (var j = 0; j < g.couldntAssess.length; j++) {
    calloutsHtml += '<div class="callout"><p>' + g.couldntAssess[j] + '</p></div>';
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
    '<div class="rs-subtitle">Analytical Limitations</div>' +
    '<p class="rs-text">' + g.analyticalLimitations + '</p>' +
  '</div></div>';
}

export function computeMA(arr, period) {
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    var sum = 0;
    for (var j = i - period + 1; j <= i; j++) sum += arr[j];
    result.push(sum / period);
  }
  return result;
}

export function renderTAChart(data) {
  var ta = data.technicalAnalysis;
  var live = data._liveChart;
  var liveTA = data._liveTA;

  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  var C = {
    bg: isLight ? '#FFFFFF' : '#0D1726',
    grid: isLight ? '#E2E8F0' : '#1E3050',
    axisText: isLight ? '#718096' : '#566882',
    price: isLight ? '#1A1F2E' : '#E8EDF4',
    priceGradA: isLight ? '#1A1F2E' : '#E8EDF4',
    hlBand: isLight ? '#1A1F2E' : '#E8EDF4',
    legendText: isLight ? '#4A5568' : '#8B9AB8',
    dot: isLight ? '#1A1F2E' : '#E8EDF4',
    dotStroke: isLight ? '#FFFFFF' : '#0D1726'
  };

  var useLive = live && live.bars && live.bars.length > 100;
  var bars = useLive ? live.bars : null;
  var closes = useLive ? bars.map(function(b){ return b.close; }) : data.priceHistory;
  var highs = useLive ? bars.map(function(b){ return b.high; }) : null;
  var lows = useLive ? bars.map(function(b){ return b.low; }) : null;

  if (!closes || closes.length < 20) return '';

  var n = closes.length;
  var ma50Arr = useLive && liveTA ? liveTA.ma50Arr : computeMA(closes, 50);
  var ma200Arr = useLive && liveTA ? liveTA.ma200Arr : computeMA(closes, 200);

  var chartTitle = useLive ? (n > 500 ? '3' : n > 250 ? '2' : '1') + '-Year Daily Price &amp; Moving Averages' : '12-Month Daily Price &amp; Moving Averages';
  var liveLabel = useLive ? '<span class="ta-chart-live-badge">LIVE</span>' : '<span class="ta-chart-static-badge">STATIC</span>';

  var W = 960, H = 380;
  var padL = 62, padR = 16, padT = 28, padB = 44;
  var cW = W - padL - padR;
  var cH = H - padT - padB;

  var allVals = closes.slice();
  if (highs) for (var i = 0; i < n; i++) { if (highs[i] != null) allVals.push(highs[i]); }
  if (lows) for (var i = 0; i < n; i++) { if (lows[i] != null) allVals.push(lows[i]); }
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] !== null) allVals.push(ma50Arr[i]);
    if (ma200Arr[i] !== null) allVals.push(ma200Arr[i]);
  }
  var pMin = Math.min.apply(null, allVals);
  var pMax = Math.max.apply(null, allVals);
  var pRange = pMax - pMin;
  pMin -= pRange * 0.05;
  pMax += pRange * 0.05;
  pRange = pMax - pMin;

  function xPos(idx) { return padL + (idx / (n - 1)) * cW; }
  function yPos(val) { return padT + (1 - (val - pMin) / pRange) * cH; }

  var supportPrice = ta ? parseFloat(ta.keyLevels.support.price) || null : null;
  var resistPrice = ta ? parseFloat(ta.keyLevels.resistance.price) || null : null;
  var curPrice = parseFloat(useLive && live.currentPrice ? live.currentPrice : data.price) || 0;
  var cur = data.currency;

  var svg = '<svg class="ta-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
  svg += '<rect x="' + padL + '" y="' + padT + '" width="' + cW + '" height="' + cH + '" fill="' + C.bg + '" rx="2"/>';

  var gridStep = pRange / 5;
  var magnitude = Math.pow(10, Math.floor(Math.log10(gridStep)));
  var niceSteps = [1, 2, 2.5, 5, 10];
  var bestStep = magnitude;
  for (var s = 0; s < niceSteps.length; s++) {
    if (niceSteps[s] * magnitude >= gridStep) { bestStep = niceSteps[s] * magnitude; break; }
  }
  for (var gv = Math.ceil(pMin / bestStep) * bestStep; gv <= pMax; gv += bestStep) {
    var gy = yPos(gv);
    if (gy < padT || gy > padT + cH) continue;
    svg += '<line x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + gy.toFixed(1) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    svg += '<text x="' + (padL - 8) + '" y="' + (gy + 3.5).toFixed(1) + '" text-anchor="end" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="9">' + cur + gv.toFixed(gv >= 100 ? 0 : 2) + '</text>';
  }

  if (supportPrice && supportPrice >= pMin && supportPrice <= pMax) {
    var sy = yPos(supportPrice);
    svg += '<line x1="' + padL + '" y1="' + sy.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + sy.toFixed(1) + '" stroke="#3DAA6D" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + (sy - 4).toFixed(1) + '" fill="#3DAA6D" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">S ' + cur + supportPrice.toFixed(2) + '</text>';
  }
  if (resistPrice && resistPrice >= pMin && resistPrice <= pMax) {
    var ry = yPos(resistPrice);
    svg += '<line x1="' + padL + '" y1="' + ry.toFixed(1) + '" x2="' + (padL + cW) + '" y2="' + ry.toFixed(1) + '" stroke="#D45555" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + (ry - 4).toFixed(1) + '" fill="#D45555" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">R ' + cur + resistPrice.toFixed(2) + '</text>';
  }

  if (highs && lows) {
    var hlUpper = '', hlLower = '';
    for (var i = 0; i < n; i++) {
      if (highs[i] == null || lows[i] == null) continue;
      var x = xPos(i).toFixed(1);
      hlUpper += (hlUpper === '' ? 'M' : 'L') + x + ',' + yPos(highs[i]).toFixed(1);
      hlLower = x + ',' + yPos(lows[i]).toFixed(1) + (hlLower === '' ? '' : 'L' + hlLower);
    }
    if (hlUpper && hlLower) {
      svg += '<path d="' + hlUpper + 'L' + hlLower + 'Z" fill="' + C.hlBand + '" opacity="' + (isLight ? '0.08' : '0.06') + '"/>';
    }
  }

  var ma200Path = '';
  for (var i = 0; i < n; i++) {
    if (ma200Arr[i] === null) continue;
    ma200Path += (ma200Path === '' ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(ma200Arr[i]).toFixed(1);
  }
  if (ma200Path) svg += '<path d="' + ma200Path + '" fill="none" stroke="#4A8ECC" stroke-width="1.3" opacity="0.8"/>';

  var ma50Path = '';
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] === null) continue;
    ma50Path += (ma50Path === '' ? 'M' : 'L') + xPos(i).toFixed(1) + ',' + yPos(ma50Arr[i]).toFixed(1);
  }
  if (ma50Path) svg += '<path d="' + ma50Path + '" fill="none" stroke="#D4A03C" stroke-width="1.3" opacity="0.8"/>';

  var pricePath = 'M' + xPos(0).toFixed(1) + ',' + yPos(closes[0]).toFixed(1);
  for (var i = 1; i < n; i++) pricePath += 'L' + xPos(i).toFixed(1) + ',' + yPos(closes[i]).toFixed(1);
  var areaPath = pricePath + 'L' + xPos(n-1).toFixed(1) + ',' + (padT+cH) + 'L' + xPos(0).toFixed(1) + ',' + (padT+cH) + 'Z';
  svg += '<defs><linearGradient id="priceGrad-' + data.ticker + '" x1="0" y1="0" x2="0" y2="1">';
  svg += '<stop offset="0%" stop-color="' + C.priceGradA + '" stop-opacity="' + (isLight ? '0.1' : '0.08') + '"/>';
  svg += '<stop offset="100%" stop-color="' + C.priceGradA + '" stop-opacity="0.01"/>';
  svg += '</linearGradient></defs>';
  svg += '<path d="' + areaPath + '" fill="url(#priceGrad-' + data.ticker + ')"/>';

  svg += '<path d="' + pricePath + '" fill="none" stroke="' + C.price + '" stroke-width="1.4"/>';

  var lastX = xPos(n - 1), lastY = yPos(closes[n-1]);
  svg += '<circle cx="' + lastX.toFixed(1) + '" cy="' + lastY.toFixed(1) + '" r="3.5" fill="' + C.dot + '" stroke="' + C.dotStroke + '" stroke-width="1.5"/>';
  var labelX = lastX + 8 > W - padR - 60 ? lastX - 65 : lastX + 8;
  svg += '<text x="' + labelX.toFixed(1) + '" y="' + (lastY + 3).toFixed(1) + '" fill="' + C.dot + '" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600">' + cur + curPrice.toFixed(2) + '</text>';

  var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (useLive) {
    var lastMonth = -1, lastYear = -1;
    var step = Math.max(1, Math.floor(n / 36));
    for (var i = 0; i < n; i += step) {
      var d = bars[i].date;
      var mm = d.getMonth(), yy = d.getFullYear();
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
    var reportDate = new Date(data.date);
    var tradingDaysPerMonth = n / 12;
    for (var m = 0; m <= 11; m++) {
      var idx = Math.round(m * tradingDaysPerMonth);
      if (idx >= n) idx = n - 1;
      var labelDate = new Date(reportDate);
      labelDate.setMonth(labelDate.getMonth() - (11 - m));
      var label = monthNames[labelDate.getMonth()];
      if (labelDate.getMonth() === 0) label += " '" + String(labelDate.getFullYear()).slice(2);
      var lx = xPos(idx);
      if (lx < padL + 15 || lx > padL + cW - 15) continue;
      svg += '<text x="' + lx.toFixed(1) + '" y="' + (padT + cH + 22) + '" text-anchor="middle" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="7.5">' + label + '</text>';
      svg += '<line x1="' + lx.toFixed(1) + '" y1="' + (padT + cH) + '" x2="' + lx.toFixed(1) + '" y2="' + (padT + cH + 4) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    }
  }

  var lx0 = padL + 8;
  svg += '<circle cx="' + lx0 + '" cy="14" r="3" fill="' + C.dot + '"/>';
  svg += '<text x="' + (lx0+8) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Price</text>';
  if (highs) {
    svg += '<rect x="' + (lx0+44) + '" y="10" width="16" height="8" rx="1" fill="' + C.hlBand + '" opacity="0.12"/>';
    svg += '<text x="' + (lx0+64) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">High/Low</text>';
    lx0 += 56;
  }
  svg += '<line x1="' + (lx0+52) + '" y1="14" x2="' + (lx0+68) + '" y2="14" stroke="#D4A03C" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+72) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">50d MA</text>';
  svg += '<line x1="' + (lx0+112) + '" y1="14" x2="' + (lx0+128) + '" y2="14" stroke="#4A8ECC" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+132) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">200d MA</text>';
  svg += '<line x1="' + (lx0+182) + '" y1="14" x2="' + (lx0+198) + '" y2="14" stroke="#3DAA6D" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+202) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Support</text>';
  svg += '<line x1="' + (lx0+242) + '" y1="14" x2="' + (lx0+258) + '" y2="14" stroke="#D45555" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+262) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Resistance</text>';

  svg += '</svg>';

  return '<div class="ta-chart-container">' +
    '<div class="ta-chart-header"><div class="ta-chart-title">' + chartTitle + '</div>' + liveLabel + '</div>' +
    svg +
  '</div>';
}

export function renderTechnicalAnalysis(data) {
  if (!data.technicalAnalysis) return '';
  var t = data.ticker.toLowerCase();
  var ta = data.technicalAnalysis;

  var chartHtml = renderTAChart(data);

  var regimeHtml = '<div class="ta-regime-bar">' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Regime</div><div class="ta-regime-value">' + ta.regime + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Clarity</div><div class="ta-regime-value">' + ta.clarity + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Trend</div><div class="ta-regime-value ' + (/down/i.test(ta.trend.direction) ? 'ta-down' : /up|recover/i.test(ta.trend.direction) ? 'ta-up' : '') + '">' + ta.trend.direction + ' (' + ta.trend.duration + ')</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Structure</div><div class="ta-regime-value">' + ta.trend.structure + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Support</div><div class="ta-regime-value">' + ta.price.currency + ta.keyLevels.support.price.toFixed(2) + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Resistance</div><div class="ta-regime-value">' + ta.price.currency + ta.keyLevels.resistance.price.toFixed(2) + '</div></div>' +
  '</div>';

  var maHtml = '<div class="rs-subtitle">Moving Averages</div>' +
    '<table class="ta-ma-table"><thead><tr>' +
      '<th>Measure</th><th>Value</th><th>Price vs MA</th><th>Note</th>' +
    '</tr></thead><tbody>' +
    '<tr>' +
      '<td class="ta-label-cell">50-Day MA</td>' +
      '<td>' + ta.price.currency + ta.movingAverages.ma50.value.toFixed(2) + '</td>' +
      '<td style="color:' + (ta.movingAverages.priceVsMa50 >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (ta.movingAverages.priceVsMa50 >= 0 ? '+' : '') + ta.movingAverages.priceVsMa50.toFixed(1) + '%</td>' +
      '<td>As at ' + ta.movingAverages.ma50.date + '</td>' +
    '</tr>' +
    '<tr>' +
      '<td class="ta-label-cell">200-Day MA</td>' +
      '<td>' + ta.price.currency + ta.movingAverages.ma200.value.toFixed(2) + '</td>' +
      '<td style="color:' + (ta.movingAverages.priceVsMa200 >= 0 ? 'var(--signal-green)' : 'var(--signal-red)') + '">' + (ta.movingAverages.priceVsMa200 >= 0 ? '+' : '') + ta.movingAverages.priceVsMa200.toFixed(1) + '%</td>' +
      '<td>As at ' + ta.movingAverages.ma200.date + '</td>' +
    '</tr>' +
    '</tbody></table>';

  var crossoverHtml = '';
  if (ta.movingAverages.crossover) {
    var cx = ta.movingAverages.crossover;
    crossoverHtml = '<div class="ta-crossover-callout">' +
      '<div class="ta-crossover-label">' + cx.type + '</div>' +
      '<div class="ta-crossover-text">' + cx.description + ' &mdash; ' + cx.date + '</div>' +
    '</div>';
  }

  var inflHtml = '';
  if (ta.inflectionPoints && ta.inflectionPoints.length > 0) {
    var inflRows = '';
    for (var i = 0; i < ta.inflectionPoints.length; i++) {
      var ip = ta.inflectionPoints[i];
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

  var volHtml = '<div class="ta-metrics-grid">' +
    '<div class="ta-metric-card">' +
      '<div class="ta-metric-card-title">Volume</div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">Latest vs 20-day avg</div><div class="ta-metric-val">' + ta.volume.latestVs20DayAvg.toFixed(1) + 'x</div></div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">Date</div><div class="ta-metric-val">' + ta.volume.latestDate + '</div></div>';
  if (ta.volume.priorSpikes) {
    for (var v = 0; v < ta.volume.priorSpikes.length; v++) {
      var sp = ta.volume.priorSpikes[v];
      volHtml += '<div class="ta-metric-row"><div class="ta-metric-name">' + sp.period + '</div><div class="ta-metric-val">' + sp.ratio.toFixed(1) + 'x &mdash; ' + sp.context + '</div></div>';
    }
  }
  volHtml += '</div>' +
    '<div class="ta-metric-card">' +
      '<div class="ta-metric-card-title">Volatility</div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">Latest daily range</div><div class="ta-metric-val">' + ta.volatility.latestRangePercent.toFixed(1) + '%</div></div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">30-day avg range</div><div class="ta-metric-val">' + ta.volatility.avgDailyRangePercent30.toFixed(1) + '%</div></div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">90-day avg range</div><div class="ta-metric-val">' + ta.volatility.avgDailyRangePercent90.toFixed(1) + '%</div></div>' +
      '<div class="ta-metric-row"><div class="ta-metric-name">Latest session</div><div class="ta-metric-val">' + ta.price.currency + ta.volatility.latestDailyRange.high.toFixed(2) + ' &ndash; ' + ta.price.currency + ta.volatility.latestDailyRange.low.toFixed(2) + '</div></div>' +
    '</div>' +
  '</div>';

  var mr = ta.meanReversion;
  var rangeSpan = mr.rangeHigh - mr.rangeLow;
  var pricePct = rangeSpan > 0 ? ((ta.price.current - mr.rangeLow) / rangeSpan) * 100 : 50;
  var ma50Pct = rangeSpan > 0 ? ((ta.movingAverages.ma50.value - mr.rangeLow) / rangeSpan) * 100 : 50;
  var ma200Pct = rangeSpan > 0 ? ((ta.movingAverages.ma200.value - mr.rangeLow) / rangeSpan) * 100 : 50;

  var mrHtml = '<div class="ta-mr-container">' +
    '<div class="ta-mr-title">Mean Reversion Positioning</div>' +
    '<div class="ta-mr-bar-track">' +
      '<div class="ta-mr-ma200-marker" style="left:' + ma200Pct.toFixed(1) + '%"></div>' +
      '<div class="ta-mr-ma50-marker" style="left:' + ma50Pct.toFixed(1) + '%"></div>' +
      '<div class="ta-mr-marker" style="left:' + pricePct.toFixed(1) + '%"></div>' +
    '</div>' +
    '<div class="ta-mr-bar-labels">' +
      '<span>' + ta.price.currency + mr.rangeLow.toFixed(2) + '</span>' +
      '<span>' + ta.price.currency + mr.rangeHigh.toFixed(2) + '</span>' +
    '</div>' +
    '<div class="ta-mr-legend">' +
      '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-red)"></div>Price (' + ta.price.currency + ta.price.current.toFixed(2) + ')</div>' +
      '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-amber)"></div>50-Day MA (' + ta.price.currency + ta.movingAverages.ma50.value.toFixed(2) + ')</div>' +
      '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--signal-blue)"></div>200-Day MA (' + ta.price.currency + ta.movingAverages.ma200.value.toFixed(2) + ')</div>' +
    '</div>' +
    '<table class="ta-ma-table" style="margin-top:var(--space-sm)"><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>' +
      '<tr><td class="ta-label-cell">vs 50-Day MA</td><td style="color:var(--signal-red)">' + mr.vsMa50.toFixed(1) + '%</td></tr>' +
      '<tr><td class="ta-label-cell">vs 200-Day MA</td><td style="color:var(--signal-red)">' + mr.vsMa200.toFixed(1) + '%</td></tr>' +
      '<tr><td class="ta-label-cell">12-Month Range Position</td><td>' + (mr.rangePosition <= 50 ? 'Lower ' : 'Upper ') + mr.rangePosition + '%</td></tr>' +
    '</tbody></table>' +
  '</div>';

  var relHtml = '';
  if (ta.relativePerformance) {
    var rp = ta.relativePerformance;
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

  var levelsHtml = '<div class="rs-subtitle">Key Levels</div>' +
    '<table class="ta-ma-table"><thead><tr><th>Level</th><th>Price</th><th>Derivation</th></tr></thead><tbody>' +
    '<tr><td class="ta-label-cell">Support</td><td>' + ta.price.currency + ta.keyLevels.support.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + ta.keyLevels.support.method + '</td></tr>' +
    '<tr><td class="ta-label-cell">Resistance</td><td>' + ta.price.currency + ta.keyLevels.resistance.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + ta.keyLevels.resistance.method + '</td></tr>' +
    '<tr><td class="ta-label-cell">52-Week High</td><td>' + ta.price.currency + ta.keyLevels.fiftyTwoWeekHigh.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + ta.keyLevels.fiftyTwoWeekHigh.date + '</td></tr>' +
    '<tr><td class="ta-label-cell">52-Week Low</td><td>' + ta.price.currency + ta.keyLevels.fiftyTwoWeekLow.price.toFixed(2) + '</td><td style="font-family:var(--font-ui)">' + ta.keyLevels.fiftyTwoWeekLow.date + '</td></tr>' +
    '</tbody></table>';

  var footerHtml = '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:var(--space-md);padding-top:var(--space-sm);border-top:1px solid var(--border)">' +
    'Analysis period: ' + ta.period + ' &bull; Generated: ' + ta.date + ' &bull; Source: ' + (ta.source || 'Continuum Technical Intelligence') +
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
  return '<div class="report-footer-section">' +
    '<div class="rf-inner">' +
      '<div class="rf-disclaimer-text">' + data.footer.disclaimer + '</div>' +
      '<div class="rf-meta-row">' +
        '<div class="rf-brand">Contin<span class="brand-green">uu</span>m Inte<span class="brand-green">ll</span>igence</div>' +
        '<div class="rf-meta-item">ID: ' + data.reportId + '</div>' +
        '<div class="rf-meta-item">Mode: Narrative Intelligence</div>' +
        '<div class="rf-meta-item">Domains: ' + data.footer.domainCount + '</div>' +
        '<div class="rf-meta-item">Hypotheses: ' + data.footer.hypothesesCount + '</div>' +
        '<div class="rf-meta-item">' + data.date + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderPDFDownload(data) {
  var t = data.ticker;
  return '<div class="report-download-section">' +
    '<div class="report-download-inner">' +
      '<div class="report-download-title">Download Research Report</div>' +
      '<div class="report-download-subtitle">' + data.company + ' (' + data.ticker + '.AX) &mdash; ' + data.date + '</div>' +
      '<div class="report-download-buttons">' +
        '<button class="btn-pdf-download institutional" onclick="generatePDFReport(\'' + t + '\', \'institutional\')">' +
          '<span class="btn-pdf-label">Institutional Report <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">Full ACH analysis with evidence matrix</span>' +
        '</button>' +
        '<button class="btn-pdf-download retail" onclick="generatePDFReport(\'' + t + '\', \'retail\')">' +
          '<span class="btn-pdf-label">Investor Briefing <span class="btn-pdf-spinner"></span></span>' +
          '<span class="btn-pdf-sub">Plain-language evidence summary</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderHypSidebar(data) {
  var t = data.ticker.toLowerCase();
  var ticker = data.ticker;

  var hypItems = '';
  if (data.hypotheses && data.hypotheses.length > 0) {
    var norm = normaliseScores(data.hypotheses);
    for (var i = 0; i < data.hypotheses.length; i++) {
      var h = data.hypotheses[i];
      var dc = h.dirClass || 'dir-neutral';
      var label = (h.title || '').replace(/^N\d+:\s*/, '');
      hypItems += '<div class="hs-item">' +
        '<div class="hs-dot ' + dc + '"></div>' +
        '<div class="hs-label">' + label + '</div>' +
        '<div class="hs-score ' + dc + '">' + norm[i] + '%</div>' +
      '</div>';
    }
  }

  var skew = data._skew || computeSkewScore(data);
  var skewDir = skew.direction || 'balanced';
  var skewLabel = skewDir.toUpperCase();
  var skewScoreNum = skew.score || 0;
  var skewScoreStr = (skewScoreNum > 0 ? '+' : '') + skewScoreNum;

  var tls = data.three_layer_signal || {};
  var macSig = tls.macro_signal || 0;
  var secSig = tls.sector_signal || 0;
  var macCls = macSig > 10 ? 'dir-up' : macSig < -10 ? 'dir-down' : 'dir-neutral';
  var secCls = secSig > 10 ? 'dir-up' : secSig < -10 ? 'dir-down' : 'dir-neutral';

  var ref = (typeof REFERENCE_DATA !== 'undefined') ? REFERENCE_DATA[ticker] : null;
  var peValue = '\u2014';
  var revGrowthValue = '\u2014';
  if (data.heroMetrics) {
    for (var mi = 0; mi < data.heroMetrics.length; mi++) {
      var mLabel = (data.heroMetrics[mi].label || '').toLowerCase();
      if (mLabel === 'fwd p/e' || mLabel === 'p/e') peValue = data.heroMetrics[mi].value;
      if (mLabel === 'rev growth' || mLabel === 'revenue growth') revGrowthValue = data.heroMetrics[mi].value;
    }
  }
  if (ref) {
    if (peValue === '\u2014' && ref.epsForward) {
      var currentP = parseFloat(data._livePrice || data.price || data.current_price || 0);
      if (currentP > 0) peValue = (currentP / ref.epsForward).toFixed(1) + 'x';
    }
    if (revGrowthValue === '\u2014' && ref.revenueGrowth != null) {
      revGrowthValue = (ref.revenueGrowth > 0 ? '+' : '') + ref.revenueGrowth + '%';
    }
  }

  var livePrice = parseFloat(data._livePrice || data.price || data.current_price || 0);
  var ph = data.priceHistory;
  var changePct = null;
  if (ph && ph.length >= 2) {
    changePct = ((ph[ph.length - 1] - ph[ph.length - 2]) / ph[ph.length - 2] * 100);
  } else if (data.freshness && data.freshness.pricePctChange != null) {
    changePct = data.freshness.pricePctChange;
  }

  var vr = null;
  var vrBear = 0, vrFair = 0, vrBull = 0, vrZone = '', vrZoneCls = '';
  var vrToBull = '', vrToBear = '';
  if (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds &&
      data.hero.position_in_range.worlds.length >= 4) {
    var w = data.hero.position_in_range.worlds;
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

  var inner = '';

  inner += '<div class="hs-stock-id">' +
    '<div class="hs-stock-ticker">' + (data.tickerFull || data.ticker || ticker) + '</div>' +
    '<div class="hs-price-row">';
  if (livePrice > 0) {
    inner += '<span class="hs-price">A$' + livePrice.toFixed(2) + '</span>';
  }
  if (changePct !== null) {
    var chgCls = changePct >= 0 ? 'pos' : 'neg';
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
      '<span class="hs-env-score">' + (macSig > 0 ? '+' : '') + macSig + '</span>' +
    '</div>' +
    '<div class="hs-env-row">' +
      '<div class="hs-dot ' + secCls + '"></div>' +
      '<span class="hs-env-label">Sector</span>' +
      '<span class="hs-env-score">' + (secSig > 0 ? '+' : '') + secSig + '</span>' +
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
    var vrRange = vrBull - vrBear || 1;
    var vrCurrPct = Math.min(100, Math.max(0, ((livePrice - vrBear) / vrRange * 100))).toFixed(1);
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

  var dirMap = { upside: 'dir-up', downside: 'dir-down', neutral: 'dir-neutral' };
  var colorMap = { 'dir-up': 'var(--signal-green)', 'dir-down': 'var(--signal-red)', 'dir-neutral': 'var(--signal-amber)' };

  var hyps = data.hypotheses;

  for (var i = 0; i < hyps.length; i++) {
    hyps[i]._origTierNum = hyps[i].tier.replace(/^n/, '');
  }

  hyps.sort(function(a, b) {
    var aContra = a.contradicting ? a.contradicting.length : 0;
    var bContra = b.contradicting ? b.contradicting.length : 0;
    if (aContra !== bContra) return aContra - bContra;
    return parseFloat(b.score) - parseFloat(a.score);
  });

  var tierMap = {};
  var needsRemap = false;
  for (var i = 0; i < hyps.length; i++) {
    var newNum = String(i + 1);
    var oldNum = hyps[i]._origTierNum;
    tierMap[oldNum] = newNum;
    if (oldNum !== newNum) needsRemap = true;
  }

  for (var i = 0; i < hyps.length; i++) {
    var h = hyps[i];
    var oldPrefix = /^N\d+:\s*/;
    h.tier = 'n' + (i + 1);
    h.dirClass = dirMap[h.direction] || 'dir-neutral';
    h.title = 'N' + (i + 1) + ': ' + h.title.replace(oldPrefix, '');
  }

  if (data.verdict && data.verdict.scores) {
    var oldScores = data.verdict.scores.slice();
    var newScores = [];
    for (var i = 0; i < hyps.length; i++) {
      var rawScore = hyps[i].score;
      var matched = null;
      for (var j = 0; j < oldScores.length; j++) {
        if (oldScores[j] && oldScores[j].score === rawScore) {
          matched = oldScores[j];
          oldScores[j] = null;
          break;
        }
      }
      if (matched) {
        matched.label = 'N' + (i + 1) + ' ' + matched.label.replace(/^N\d+\s*/, '');
        matched.scoreColor = colorMap[hyps[i].dirClass] || matched.scoreColor;
        newScores.push(matched);
      }
    }
    data.verdict.scores = newScores;
  }

  if (data.evidence && data.evidence.alignmentSummary) {
    var as = data.evidence.alignmentSummary;
    if (as.headers && as.headers.length >= 5 && as.rows) {
      var nonNCount = as.headers.length - hyps.length;
      var newHeaders = as.headers.slice(0, nonNCount);
      for (var i = 0; i < hyps.length; i++) {
        newHeaders.push('N' + (i + 1) + ' ' + hyps[i].title.replace(/^N\d+:\s*/, '').substring(0, 15));
      }
      as.headers = newHeaders;

      if (needsRemap) {
        var inverseTierMap = {};
        for (var old in tierMap) {
          if (tierMap.hasOwnProperty(old)) inverseTierMap[tierMap[old]] = old;
        }
        for (var r = 0; r < as.rows.length; r++) {
          var row = as.rows[r];
          var orig = { n1: row.n1, n2: row.n2, n3: row.n3, n4: row.n4 };
          for (var n = 1; n <= 4; n++) {
            var fromOld = inverseTierMap[String(n)] || String(n);
            row['n' + n] = orig['n' + fromOld];
          }
        }
        if (as.summary) {
          var sum = as.summary;
          var origSum = {};
          for (var n = 1; n <= 4; n++) {
            origSum['n' + n] = sum['n' + n];
            origSum['n' + n + 'Color'] = sum['n' + n + 'Color'];
          }
          for (var n = 1; n <= 4; n++) {
            var fromOld = inverseTierMap[String(n)] || String(n);
            sum['n' + n] = origSum['n' + fromOld];
            sum['n' + n + 'Color'] = origSum['n' + fromOld + 'Color'];
          }
        }
      }
    }
  }

  if (data.gaps && data.gaps.analyticalLimitations) {
    var lim = data.gaps.analyticalLimitations;
    var norm = normaliseScores(hyps);
    var scoreStr = '';
    for (var i = 0; i < hyps.length; i++) {
      if (i > 0) scoreStr += ', ';
      scoreStr += 'N' + (i + 1) + ': ' + norm[i] + '%';
    }
    lim = lim.replace(/\(N1:.*?\)/, '(' + scoreStr + ')');
    data.gaps.analyticalLimitations = lim;
  }

  if (needsRemap) {
    var remapN = function(text) {
      if (!text || typeof text !== 'string') return text;
      return text.replace(/\bN([1-4])\b/g, function(m, n) {
        return 'N' + (tierMap[n] || n);
      });
    };

    if (data.discriminators) {
      if (data.discriminators.intro) data.discriminators.intro = remapN(data.discriminators.intro);
      if (data.discriminators.nonDiscriminating) data.discriminators.nonDiscriminating = remapN(data.discriminators.nonDiscriminating);
      if (data.discriminators.rows) {
        for (var i = 0; i < data.discriminators.rows.length; i++) {
          var dRow = data.discriminators.rows[i];
          if (dRow.discriminatesBetween) dRow.discriminatesBetween = remapN(dRow.discriminatesBetween);
          if (dRow.currentReading) dRow.currentReading = remapN(dRow.currentReading);
          if (dRow.evidence) dRow.evidence = remapN(dRow.evidence);
        }
      }
    }

    if (data.tripwires) {
      if (data.tripwires.intro) data.tripwires.intro = remapN(data.tripwires.intro);
      if (data.tripwires.cards) {
        for (var i = 0; i < data.tripwires.cards.length; i++) {
          var twCard = data.tripwires.cards[i];
          if (twCard.conditions) {
            for (var c = 0; c < twCard.conditions.length; c++) {
              var cond = twCard.conditions[c];
              if (cond.if) cond.if = remapN(cond.if);
              if (cond.then) cond.then = remapN(cond.then);
            }
          }
        }
      }
    }

    if (data.evidence && data.evidence.cards) {
      for (var i = 0; i < data.evidence.cards.length; i++) {
        var evCard = data.evidence.cards[i];
        if (evCard.tags) {
          for (var t = 0; t < evCard.tags.length; t++) {
            if (evCard.tags[t].text) evCard.tags[t].text = remapN(evCard.tags[t].text);
          }
        }
        if (evCard.finding) evCard.finding = remapN(evCard.finding);
        if (evCard.tension) evCard.tension = remapN(evCard.tension);
      }
    }

    if (data.gaps && data.gaps.couldntAssess) {
      for (var i = 0; i < data.gaps.couldntAssess.length; i++) {
        data.gaps.couldntAssess[i] = remapN(data.gaps.couldntAssess[i]);
      }
    }

    if (data.verdict && data.verdict.text) data.verdict.text = remapN(data.verdict.text);
    if (data.skew && data.skew.rationale) data.skew.rationale = remapN(data.skew.rationale);
  }
}

export function renderOvercorrectionBanner(data) {
  var oc = data._overcorrection;
  if (!oc || !oc.active) return '';
  var cls = oc.reviewResult && oc.reviewResult.confirmed ? ' confirmed' : '';
  var label = oc.reviewResult && oc.reviewResult.confirmed
    ? '&#10004; Overcorrection Confirmed'
    : '&#9888; Possible Overcorrection Detected';
  var message = oc.message || 'Price move exceeded threshold  --  scores under review.';
  var reviewHtml = oc.reviewDate
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

var HISTORY_CACHE = {};

function loadNarrativeHistory(ticker, callback) {
  if (HISTORY_CACHE[ticker]) {
    callback(HISTORY_CACHE[ticker]);
    return;
  }
  var url = 'data/stocks/' + ticker + '-history.json';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
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
  var t = data.ticker.toLowerCase();
  return '<div class="report-section narrative-timeline-section" id="' + t + '-narrative-timeline">' +
    '<div class="rs-number">Timeline</div>' +
    '<div class="rs-title">Narrative Evolution</div>' +
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
  '</div>';
}

var NT_COLORS = {
  price: '#8B95A5',
  hypotheses: [
    { bg: 'rgba(72, 199, 142, 0.15)', border: '#48C78E', label: '#48C78E' },
    { bg: 'rgba(79, 140, 255, 0.12)', border: '#4F8CFF', label: '#4F8CFF' },
    { bg: 'rgba(255, 183, 77, 0.12)', border: '#FFB74D', label: '#FFB74D' },
    { bg: 'rgba(239, 83, 80, 0.10)', border: '#EF5350', label: '#EF5350' }
  ],
  flip: '#FFB74D',
  overcorrection: '#EF5350',
  grid: 'rgba(139, 149, 165, 0.1)'
};

export function initNarrativeTimelineChart(ticker) {
  var Chart = window.Chart;
  if (!Chart) {
    console.warn('[NarrativeTimeline] Chart.js not loaded yet');
    return;
  }

  destroyNarrativeTimelineChart(ticker);

  var canvas = document.getElementById('nt-canvas-' + ticker);
  var loading = document.getElementById('nt-loading-' + ticker);
  var legend = document.getElementById('nt-legend-' + ticker);
  if (!canvas) return;

  loadNarrativeHistory(ticker, function(histData) {
    var canvasCheck = document.getElementById('nt-canvas-' + ticker);
    if (!canvasCheck) return;

    if (loading) loading.style.display = 'none';
    canvasCheck.style.display = 'block';

    if (!histData || !histData.entries || histData.entries.length < 2) {
      var wrap = document.getElementById('nt-wrap-' + ticker);
      if (wrap) {
        wrap.innerHTML = '<div class="nt-chart-empty">Insufficient history data for timeline visualisation.<br>Data accumulates daily via the automated pipeline.</div>';
      }
      return;
    }

    var history = histData.entries;
    var flips = histData.flips || [];

    var labels = [];
    var priceData = [];
    var hypDatasets = {};
    var hypIdSet = {};
    var hypIds = [];
    for (var i = 0; i < history.length; i++) {
      if (history[i].hypotheses) {
        for (var h = 0; h < history[i].hypotheses.length; h++) {
          var hid = history[i].hypotheses[h].id;
          if (!hypIdSet[hid]) {
            hypIdSet[hid] = true;
            hypIds.push(hid);
          }
        }
      }
    }

    for (var i = 0; i < history.length; i++) {
      var entry = history[i];
      var parts = (entry.date || '').split('-');
      if (parts.length === 3) {
        labels.push(parts[2] + '/' + parts[1]);
      } else {
        labels.push(entry.date || '?');
      }
      priceData.push(entry.price);

      for (var h = 0; h < hypIds.length; h++) {
        var hid = hypIds[h];
        if (!hypDatasets[hid]) hypDatasets[hid] = [];
        var found = null;
        if (entry.hypotheses) {
          for (var j = 0; j < entry.hypotheses.length; j++) {
            if (entry.hypotheses[j].id === hid) { found = entry.hypotheses[j]; break; }
          }
        }
        hypDatasets[hid].push(found ? found.survival_score : null);
      }
    }

    var hypNames = {};
    var lastEntry = history[history.length - 1];
    if (lastEntry.hypotheses) {
      for (var h = 0; h < lastEntry.hypotheses.length; h++) {
        hypNames[lastEntry.hypotheses[h].id] = lastEntry.hypotheses[h].name;
      }
    }

    var datasets = [];
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
      var colorSet = NT_COLORS.hypotheses[h] || NT_COLORS.hypotheses[0];
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

    var flipMarkers = [];
    for (var f = 0; f < flips.length; f++) {
      var flip = flips[f];
      var flipParts = (flip.date || '').split('-');
      if (flipParts.length === 3) {
        var flipLabel = flipParts[2] + '/' + flipParts[1];
        var flipIdx = labels.indexOf(flipLabel);
        if (flipIdx >= 0) {
          flipMarkers.push({ idx: flipIdx, color: NT_COLORS.flip, dash: [4, 3], width: 1.5 });
        }
      }
    }
    for (var i = 0; i < history.length; i++) {
      if (history[i].overcorrection_active) {
        var ocParts = (history[i].date || '').split('-');
        if (ocParts.length === 3) {
          var ocLabel = ocParts[2] + '/' + ocParts[1];
          var ocIdx = labels.indexOf(ocLabel);
          if (ocIdx >= 0) {
            flipMarkers.push({ idx: ocIdx, color: NT_COLORS.overcorrection, dash: [2, 2], width: 2 });
          }
        }
      }
    }

    var verticalLinePlugin = {
      id: 'ntVerticalLines',
      afterDraw: function(chart) {
        if (!flipMarkers || flipMarkers.length === 0) return;
        var ctx = chart.ctx;
        var xScale = chart.scales.x;
        var yScale = chart.scales.yPrice;
        ctx.save();
        for (var m = 0; m < flipMarkers.length; m++) {
          var marker = flipMarkers[m];
          var xPixel = xScale.getPixelForValue(marker.idx);
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

    var isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    var textColor = isDark ? '#8B95A5' : '#4A5568';
    var gridColor = isDark ? 'rgba(139, 149, 165, 0.1)' : 'rgba(0, 0, 0, 0.06)';

    var ctx = canvasCheck.getContext('2d');
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
                var label = context.dataset.label || '';
                var value = context.parsed.y;
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

    var legendEl = document.getElementById('nt-legend-' + ticker);
    if (legendEl && flips.length > 0) {
      legendEl.innerHTML = '';
      for (var f = 0; f < flips.length; f++) {
        var fl = flips[f];
        var item = document.createElement('div');
        item.className = 'nt-flip-item';
        var marker = document.createElement('span');
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
  var Chart = window.Chart;
  var canvas = document.getElementById('nt-canvas-' + ticker);
  if (canvas) {
    if (canvas._ntChart) {
      canvas._ntChart.destroy();
      canvas._ntChart = null;
    }
    var existing = (window.Chart && window.Chart.getChart) ? window.Chart.getChart(canvas) : null;
    if (existing) {
      existing.destroy();
    }
  }
}

export function renderSignalBars(data) {
  var tls = data.three_layer_signal || {};
  var ta  = data.technicalAnalysis;
  var rows = '';

  // Row 1: Technical Indicators
  if (ta) {
    var regime     = ta.regime || '';
    var isCritical = /break|bear|crash/i.test(regime);
    var isPositive = /up|bull|accum|recov/i.test(regime);
    var regimeCls  = isCritical ? 'critical' : isPositive ? 'positive' : 'neutral';
    var badgeLabel = isCritical ? 'Critical' : isPositive ? 'Positive' : (regime.split(/[\s\u2014\u2013-]/)[0] || 'Neutral');

    var currentP = parseFloat(data._livePrice || data.price || 0);
    var ph = data.priceHistory;
    var dailyChange = '', dailyCls = '';
    if (data._liveChangePct != null && !isNaN(data._liveChangePct)) {
      var chg = parseFloat(data._liveChangePct);
      dailyCls    = chg >= 0 ? 'pos' : 'neg';
      dailyChange = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% today';
    } else if (ph && ph.length >= 2) {
      var last2 = parseFloat(ph[ph.length - 1]);
      var prev2 = parseFloat(ph[ph.length - 2]);
      if (!isNaN(last2) && !isNaN(prev2) && prev2 !== 0) {
        var chg = (last2 - prev2) / prev2 * 100;
        dailyCls    = chg >= 0 ? 'pos' : 'neg';
        dailyChange = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '% today';
      }
    }
    var fromPeak = '', fromPeakCls = '';
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
    var macSig   = tls.macro_signal  || 0;
    var macCls   = macSig >  10 ? 'positive' : macSig < -10 ? 'downside' : 'neutral';
    var macLabel = macSig >  10 ? 'SUPPORTIVE' : macSig < -10 ? 'HEADWIND' : 'NEUTRAL';
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + macCls + '"></span>' +
        '<span class="sb-row-label">Macro Environment</span>' +
        '<span class="sb-badge ' + macCls + '">' + macLabel + '</span>' +
        '<div class="sb-items">' +
          '<span class="sb-item">Signal ' + (macSig > 0 ? '+' : '') + macSig + '</span>' +
          (tls.external_weight ? '<span class="sb-sep">|</span><span class="sb-item">Weight ' + tls.external_weight + '%</span>' : '') +
        '</div>' +
      '</div>';
  }

  // Row 3: Sector Narrative
  if (tls) {
    var secSig   = tls.sector_signal || 0;
    var secCls   = secSig >  10 ? 'positive' : secSig < -10 ? 'downside' : 'neutral';
    var secLabel = secSig >  10 ? 'POSITIVE'  : secSig < -10 ? 'NEGATIVE'  : 'NEUTRAL';
    var secName  = (data.sector || '') + (data.sectorSub ? ' / ' + data.sectorSub : '');
    var secWeight = tls.external_weight || 0;
    rows +=
      '<div class="sb-row">' +
        '<span class="sb-indicator ' + secCls + '"></span>' +
        '<span class="sb-row-label">Sector Narrative</span>' +
        '<span class="sb-badge ' + secCls + '">' + secLabel + '</span>' +
        '<div class="sb-items">' +
          (secName ? '<span class="sb-item">' + secName + '</span><span class="sb-sep">|</span>' : '') +
          '<span class="sb-item">Signal ' + (secSig > 0 ? '+' : '') + secSig + '</span>' +
          '<span class="sb-sep">|</span>' +
          '<span class="sb-item">Weight ' + secWeight + '%</span>' +
          '<span class="sb-sep">|</span>' +
          '<span class="sb-item">Contribs 0</span>' +
        '</div>' +
      '</div>';
  }

  // Row 4: Company Research
  var skew     = data._skew || computeSkewScore(data);
  var compCls  = skew.score < -5 ? 'downside' : skew.score > 5 ? 'upside' : 'neutral';
  var compBadge= skew.score < -5 ? 'DOWNSIDE'  : skew.score > 5 ? 'UPSIDE'  : 'NEUTRAL';
  var scoreLbl = (skew.score > 0 ? '+' : '') + skew.score;
  var hyps     = (tls && tls.company_detail && tls.company_detail.hypotheses)
                   ? tls.company_detail.hypotheses
                   : (skew.hypotheses || []);

  var bearCt = 0, bullCt = 0;
  for (var hi = 0; hi < hyps.length; hi++) {
    if      (hyps[hi].direction === 'downside') bearCt++;
    else if (hyps[hi].direction === 'upside')   bullCt++;
  }

  var dominant = null, domMax = -1;
  for (var di = 0; di < hyps.length; di++) {
    var dh = hyps[di], dw = dh.weight || 0;
    if ((skew.score < 0 && dh.direction === 'downside' && dw > domMax) ||
        (skew.score >= 0 && dh.direction === 'upside'  && dw > domMax)) {
      domMax = dw; dominant = dh;
    }
  }

  var sorted = hyps.slice().sort(function(a,b){ return (b.weight||0)-(a.weight||0); });
  var chipsHtml = '';
  for (var ci = 0; ci < sorted.length; ci++) {
    var sh = sorted[ci];
    var chipCls  = sh.direction === 'downside' ? 'downside' : sh.direction === 'upside' ? 'upside' : '';
    var nMatch   = sh.title ? sh.title.match(/^([NT]\d+)/i) : null;
    var nCode    = nMatch ? nMatch[1].toUpperCase() : '';
    var descParts= (sh.title || '').replace(/^[NT]\d+[:\s]*/i,'').split(' ');
    var keyWord  = (descParts[0] || '').toLowerCase() === 'structural' && descParts[1]
                   ? descParts[1] : (descParts[0] || '');
    chipsHtml +=
      '<span class="sb-hyp-chip ' + chipCls + '">' +
        nCode + (keyWord ? ' ' + keyWord.toUpperCase() : '') +
        '<span class="chip-pct">' + (sh.weight || 0) + '%</span>' +
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
