/**
 * DYNAMIC NARRATIVE ENGINE — UI Rendering
 *
 * Updates the narrative survival bar, alert banners, confidence halo,
 * and narrative flip history on the stock page.
 *
 * Depends on: evidence.js (HYPOTHESIS_IDS)
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
    renderNarrativeHistory: renderNarrativeHistory,
    escapeHtml: escapeHtml
  };
}
