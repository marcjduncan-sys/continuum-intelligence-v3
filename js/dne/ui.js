/**
 * DYNAMIC NARRATIVE ENGINE — UI Rendering
 *
 * Updates the narrative survival bar, dislocation indicator, competing
 * hypotheses panel, confidence halo, and narrative flip history.
 *
 * Work Streams 1–3: Dislocation banner redesign, hypothesis clarity,
 * narrative weighting display.
 *
 * Depends on: evidence.js (HYPOTHESIS_IDS), weighting.js (optional)
 */

/* global HYPOTHESIS_IDS, hasActiveOverride */

// ─── Narrative Survival Bar ──────────────────────────────────────────────────

/**
 * Update the narrative survival bar and alert banner from stock data.
 *
 * @param {Object} stock  Stock evidence data object
 */
function updateNarrativeUI(stock) {
  var bar = document.getElementById('narrative-bar');
  if (!bar) return;

  var total = 0;
  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];

  for (var i = 0; i < ids.length; i++) {
    total += stock.hypotheses[ids[i]].survival_score;
  }

  for (var j = 0; j < ids.length; j++) {
    var hId = ids[j];
    var segment = bar.querySelector('[data-hypothesis="' + hId + '"]');
    if (!segment) continue;

    var h = stock.hypotheses[hId];
    var widthPct = total > 0 ? (h.survival_score / total * 100) : 25;

    segment.style.width = widthPct + '%';

    var scoreEl = segment.querySelector('.segment-score');
    if (scoreEl) {
      scoreEl.textContent = Math.round(h.survival_score * 100) + '%';
    }

    // Mark dominant hypothesis
    if (hId === stock.dominant) {
      segment.classList.add('dominant');
    } else {
      segment.classList.remove('dominant');
    }
  }

  // Alert banner
  updateAlertBanner(stock);

  // Confidence halo
  updateConfidenceHalo(stock);

  // Editorial override banner
  updateOverrideBanner(stock);

  // Critical dislocation indicator (Work Stream 1)
  updateDislocationIndicator(stock);

  // Competing hypotheses panel (Work Stream 2)
  renderCompetingHypotheses(stock);
}

// ─── Alert Banner ────────────────────────────────────────────────────────────

/**
 * Show or hide the narrative pressure alert.
 *
 * @param {Object} stock  Stock evidence data object
 */
function updateAlertBanner(stock) {
  var alertBanner = document.getElementById('narrative-alert');
  if (!alertBanner) return;

  if (stock.alert_state === 'ALERT') {
    alertBanner.style.display = 'flex';

    // Find strongest alternative
    var bestAltId = null;
    var bestAltScore = -1;
    var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];

    for (var i = 0; i < ids.length; i++) {
      if (ids[i] !== stock.dominant &&
          stock.hypotheses[ids[i]].survival_score > bestAltScore) {
        bestAltScore = stock.hypotheses[ids[i]].survival_score;
        bestAltId = ids[i];
      }
    }

    var detailEl = document.getElementById('alert-detail');
    if (detailEl && bestAltId) {
      detailEl.textContent = bestAltId + ' (' + stock.hypotheses[bestAltId].label +
                             ') challenging ' + stock.dominant;
    }
  } else {
    alertBanner.style.display = 'none';
  }
}

// ─── Confidence Halo ─────────────────────────────────────────────────────────

/**
 * Update the confidence indicator ring around the stock price/logo.
 *
 * Classes applied: confidence-high, confidence-moderate, confidence-low, confidence-very_low
 *
 * @param {Object} stock  Stock evidence data object
 */
function updateConfidenceHalo(stock) {
  var halo = document.getElementById('confidence-halo');
  if (!halo) return;

  var confidence = stock.hypotheses[stock.dominant].status;
  halo.className = 'confidence-halo confidence-' + confidence.toLowerCase();
}

// ─── Editorial Override Banner ───────────────────────────────────────────────

/**
 * Show or hide the editorial override notice.
 *
 * @param {Object} stock  Stock evidence data object
 */
function updateOverrideBanner(stock) {
  var banner = document.getElementById('editorial-override-banner');
  if (!banner) return;

  var isActive = typeof hasActiveOverride === 'function'
    ? hasActiveOverride(stock)
    : (stock.editorial_override && new Date() < new Date(stock.editorial_override.until));

  if (isActive) {
    banner.style.display = 'flex';
    var reasonEl = document.getElementById('override-reason');
    if (reasonEl) {
      reasonEl.textContent = stock.editorial_override.reason;
    }
    var untilEl = document.getElementById('override-until');
    if (untilEl) {
      untilEl.textContent = new Date(stock.editorial_override.until).toLocaleString();
    }
  } else {
    banner.style.display = 'none';
  }
}

// ─── Narrative History Timeline ──────────────────────────────────────────────

/**
 * Render the full narrative flip history into the timeline container.
 *
 * @param {Object} stock  Stock evidence data object
 */
function renderNarrativeHistory(stock) {
  var container = document.getElementById('narrative-history');
  if (!container) return;

  var allFlips = [];
  if (stock.last_flip) allFlips.push(stock.last_flip);
  if (stock.narrative_history) {
    for (var i = 0; i < stock.narrative_history.length; i++) {
      allFlips.push(stock.narrative_history[i]);
    }
  }

  if (allFlips.length === 0) {
    container.innerHTML = '<p class="no-flips">No narrative changes recorded.</p>';
    return;
  }

  var html = '';
  for (var f = 0; f < allFlips.length; f++) {
    var flip = allFlips[f];
    var isLatest = f === 0 ? ' latest' : '';
    var priceHtml = flip.price_at_flip
      ? '<div class="flip-price">Price: $' + Number(flip.price_at_flip).toFixed(2) + '</div>'
      : '';

    html += '<div class="flip-event' + isLatest + '">' +
      '<div class="flip-date">' + escapeHtml(flip.date) + '</div>' +
      '<div class="flip-arrow">' +
        '<span class="flip-from hypothesis-' + flip.from.toLowerCase() + '">' + escapeHtml(flip.from) + '</span>' +
        '<span class="flip-direction">&rarr;</span>' +
        '<span class="flip-to hypothesis-' + flip.to.toLowerCase() + '">' + escapeHtml(flip.to) + '</span>' +
      '</div>' +
      '<div class="flip-trigger">' + escapeHtml(flip.trigger) + '</div>' +
      priceHtml +
    '</div>';
  }

  container.innerHTML = html;
}

// ─── Critical Dislocation Indicator (Work Stream 1) ──────────────────────────

/**
 * Render the dislocation indicator — institutional-grade, colour-coded.
 *
 * Shown only when dislocation is material (>500bps).
 * Green = positive narrative shift, Red = negative, Yellow = neutral.
 * Same visual hierarchy as a RiskSkew label.
 *
 * @param {Object} stock  Stock evidence data object (must have stock.weighting)
 */
function updateDislocationIndicator(stock) {
  var el = document.getElementById('dislocation-indicator');
  if (!el) return;

  var w = stock.weighting;
  if (!w || !w.dislocation || !w.dislocation.is_material) {
    el.style.display = 'none';
    return;
  }

  var d = w.dislocation;
  var direction = d.direction || 'neutral';

  // Set directional class
  el.className = 'dislocation-indicator dislocation-' + direction;
  el.style.display = 'flex';

  var labelEl = el.querySelector('.dislocation-label');
  if (labelEl) {
    labelEl.textContent = direction === 'positive' ? 'RISK SKEW'
      : direction === 'negative' ? 'RISK SKEW' : 'RISK SKEW';
  }

  var detailEl = el.querySelector('.dislocation-detail');
  if (detailEl) {
    var bps = Math.abs(d.max_dislocation_bps);
    var hId = d.max_dislocation_hypothesis;
    var hLabel = stock.hypotheses[hId] ? stock.hypotheses[hId].label : hId;
    var sign = d.max_dislocation_bps >= 0 ? '+' : '-';

    var dirText = direction === 'positive'
      ? 'Price action supports upside narrative shift'
      : direction === 'negative'
        ? 'Price action signals downside narrative pressure'
        : 'Price action diverges from evidence consensus';

    detailEl.innerHTML = escapeHtml(dirText) +
      ' &mdash; ' + escapeHtml(hId + ' ' + hLabel) +
      ' <span class="dislocation-value">' + sign + bps + 'bps</span>';
  }
}

// ─── Competing Hypotheses Panel (Work Stream 2) ──────────────────────────────

/**
 * Explanatory frame templates per hypothesis tier.
 * Each explains: (a) what is being measured, (b) why it matters,
 * (c) what the percentage signifies.
 */
var HYPOTHESIS_FRAMES = {
  T1: 'Market consensus assumes upside re-rating catalysts are present. Signal strength measures how strongly recent price action confirms this growth trajectory. A higher percentage indicates price behaviour consistent with the market recognising improving fundamentals.',
  T2: 'Market consensus assumes stable, base-case execution. Signal strength measures alignment between recent price action and steady-state compounder behaviour. A higher percentage indicates the market is pricing predictable, low-variance outcomes.',
  T3: 'Market consensus incorporates risk of fundamental deterioration. Signal strength measures how strongly recent price action reflects downside positioning. A higher percentage indicates the market is actively pricing in negative catalysts.',
  T4: 'Market consensus considers structural disruption to the business model. Signal strength measures correlation between recent price action and disruption scenarios. A higher percentage indicates the market sees existential competitive or strategic risk.'
};

/**
 * Render the full Competing Hypotheses panel with explanatory frames,
 * dual-percentage display, and section legend.
 *
 * @param {Object} stock  Stock evidence data object (must have stock.weighting)
 */
function renderCompetingHypotheses(stock) {
  var container = document.getElementById('hypotheses-panel');
  if (!container) return;

  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];
  var w = stock.weighting;
  var hasWeighting = w && w.hypothesis_weights;

  // Legend at section head
  var html = '<div class="hypotheses-legend">' +
    '<div class="legend-item"><span class="legend-dot dot-signal"></span>' +
    '<span>Signal Strength: measures how strongly recent price action confirms this hypothesis. ' +
    'Derived from correlation analysis across 5, 10 and 20 day lookback windows.</span></div>' +
    '<div class="legend-item"><span class="legend-dot dot-weight"></span>' +
    '<span>Narrative Weight: this hypothesis\'s share of the overall evidence-based narrative architecture. ' +
    'Based on weighted ACH survival scoring.</span></div>' +
    '</div>';

  for (var i = 0; i < ids.length; i++) {
    var hId = ids[i];
    var h = stock.hypotheses[hId];
    var isDominant = hId === stock.dominant;
    var hw = hasWeighting ? w.hypothesis_weights[hId] : null;

    var signalPct = hw ? hw.signal_strength_pct : Math.round(h.survival_score * 100);
    var weightPct = hw ? hw.narrative_weight_pct : 25;
    var windowLabel = hw ? hw.dominant_window + 'd' : '';

    // Inflection detection
    var isInflection = hasWeighting && w.top_narrative &&
      w.top_narrative.inflection && w.top_narrative.top_narrative === hId;

    var frame = HYPOTHESIS_FRAMES[hId] || '';

    html += '<div class="hypothesis-card' + (isDominant ? ' hypothesis-dominant' : '') + '">';

    // Header row
    html += '<div class="hypothesis-card-header">' +
      '<span class="hypothesis-id id-' + hId.toLowerCase() + '">' + hId + '</span>' +
      '<span class="hypothesis-title">' + escapeHtml(h.label) + '</span>' +
      '<span class="hypothesis-status">' + escapeHtml(h.status) + '</span>' +
      '</div>';

    // Explanatory frame
    html += '<div class="hypothesis-frame">' + escapeHtml(frame) + '</div>';

    // Description
    html += '<div class="hypothesis-description">' + escapeHtml(h.description) + '</div>';

    // Dual-percentage metrics
    html += '<div class="hypothesis-metrics">' +
      '<div class="metric-block">' +
        '<span class="metric-label">Signal</span>' +
        '<span class="metric-value">' + signalPct + '%</span>' +
      '</div>' +
      '<div class="metric-separator"></div>' +
      '<div class="metric-block">' +
        '<span class="metric-label">Weight</span>' +
        '<span class="metric-value metric-secondary">' + weightPct + '%</span>' +
      '</div>';

    if (windowLabel) {
      html += '<div class="metric-window">' + windowLabel + ' window</div>';
    }

    html += '</div>'; // .hypothesis-metrics

    // Inflection tag
    if (isInflection) {
      html += '<div class="inflection-tag visible">' +
        '<span class="inflection-dot"></span>' +
        'Narrative inflection: T1 changed from ' +
        escapeHtml(w.top_narrative.previous_top) + ' to ' + escapeHtml(hId) +
        '</div>';
    }

    html += '</div>'; // .hypothesis-card
  }

  container.innerHTML = html;
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Escape HTML entities to prevent XSS in dynamically rendered content.
 *
 * @param {string} str  Raw string
 * @returns {string}    Escaped string safe for innerHTML
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updateNarrativeUI: updateNarrativeUI,
    updateAlertBanner: updateAlertBanner,
    updateConfidenceHalo: updateConfidenceHalo,
    updateOverrideBanner: updateOverrideBanner,
    updateDislocationIndicator: updateDislocationIndicator,
    renderCompetingHypotheses: renderCompetingHypotheses,
    renderNarrativeHistory: renderNarrativeHistory,
    escapeHtml: escapeHtml
  };
}
