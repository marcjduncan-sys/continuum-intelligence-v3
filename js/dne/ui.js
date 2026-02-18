/**
 * DYNAMIC NARRATIVE ENGINE — UI Rendering
 *
 * Workstream 1: Dislocation indicator — severity-graded (Minor/Moderate/Critical),
 *   integrated within the RiskSkew section, institutional aesthetic.
 * Workstream 2: Competing hypotheses — full clarity overhaul with plain English
 *   descriptions, evidence support bars, "what to watch", and explanatory header.
 * Workstream 3: PDF report generation — institutional and retail formats.
 *
 * Depends on: evidence.js (HYPOTHESIS_IDS), weighting.js (optional)
 */

/* global HYPOTHESIS_IDS, hasActiveOverride */

// ─── Utility: HTML escape ───────────────────────────────────────────────────

function escapeHtml(text) {
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

// ─── Narrative Survival Bar ──────────────────────────────────────────────────

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

    if (hId === stock.dominant) {
      segment.classList.add('dominant');
    } else {
      segment.classList.remove('dominant');
    }
  }

  updateAlertBanner(stock);
  updateConfidenceHalo(stock);
  updateOverrideBanner(stock);
  updateDislocationIndicator(stock);
  renderCompetingHypotheses(stock);
  renderTAEvidence(stock);
}

// ─── Alert Banner ────────────────────────────────────────────────────────────

function updateAlertBanner(stock) {
  var alertBanner = document.getElementById('narrative-alert');
  if (!alertBanner) return;

  if (stock.alert_state === 'ALERT') {
    alertBanner.style.display = 'flex';

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

function updateConfidenceHalo(stock) {
  var halo = document.getElementById('confidence-halo');
  if (!halo) return;

  var confidence = stock.hypotheses[stock.dominant].status;
  halo.className = 'confidence-halo confidence-' + confidence.toLowerCase();
}

// ─── Editorial Override Banner ───────────────────────────────────────────────

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

// ─── Dislocation Indicator (Workstream 1 Redesign) ───────────────────────────
// Severity-graded: Minor (<800bps) / Moderate (800-1500bps) / Critical (>1500bps)
// Integrated into the RiskSkew area with matching typography.
// No exclamation marks. No pulsing. Institutional aesthetic.

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
  var absBps = Math.abs(d.max_dislocation_bps);

  // Severity classification
  var severity, severityLabel;
  if (absBps >= 1500) {
    severity = 'critical';
    severityLabel = 'Critical Dislocation';
  } else if (absBps >= 800) {
    severity = 'moderate';
    severityLabel = 'Moderate Dislocation';
  } else {
    severity = 'minor';
    severityLabel = 'Minor Dislocation';
  }

  // Set directional + severity class
  el.className = 'dislocation-indicator dislocation-' + direction;
  if (severity === 'critical') {
    el.classList.add('dislocation-critical');
  }
  el.style.display = 'flex';

  var labelEl = el.querySelector('.dislocation-label');
  if (labelEl) {
    labelEl.textContent = severityLabel;
  }

  var detailEl = el.querySelector('.dislocation-detail');
  if (detailEl) {
    var hId = d.max_dislocation_hypothesis;
    var hLabel = stock.hypotheses[hId] ? stock.hypotheses[hId].label : hId;
    var sign = d.max_dislocation_bps >= 0 ? '+' : '-';

    var dirText = direction === 'positive'
      ? 'Price action supports upside narrative shift'
      : direction === 'negative'
        ? 'Price action signals downside narrative pressure'
        : 'Price action diverges from evidence consensus';

    detailEl.innerHTML = escapeHtml(dirText) +
      ' <span class="dislocation-separator">&mdash;</span> ' +
      escapeHtml(hId + ' ' + hLabel) +
      ' <span class="dislocation-value">' + sign + absBps + 'bps</span>';
  }
}

// ─── Competing Hypotheses Panel (Workstream 2 Redesign) ──────────────────────
// Full clarity overhaul: explanatory header, plain English descriptions,
// evidence support bars, "what to watch", and clear percentage labelling.

function renderCompetingHypotheses(stock) {
  var container = document.getElementById('hypotheses-panel');
  if (!container) return;

  var ids = HYPOTHESIS_IDS || ['T1', 'T2', 'T3', 'T4'];
  var w = stock.weighting;
  var hasWeighting = w && w.hypothesis_weights;

  // Explanatory header
  var html = '<div class="hypotheses-header">' +
    '<div class="hypotheses-header-title">How we read the evidence landscape</div>' +
    '<div class="hypotheses-header-desc">' +
    'Each hypothesis is scored by the weight of evidence against it. Fewer inconsistencies with the available ' +
    'evidence produces a higher Evidence Support score. The dominant narrative is the hypothesis with the strongest ' +
    'evidence support and fewest contradictions.' +
    '</div></div>';

  // Sort: dominant first, then by survival score descending
  var sorted = ids.slice().sort(function (a, b) {
    if (a === stock.dominant) return -1;
    if (b === stock.dominant) return 1;
    return stock.hypotheses[b].survival_score - stock.hypotheses[a].survival_score;
  });

  for (var i = 0; i < sorted.length; i++) {
    var hId = sorted[i];
    var h = stock.hypotheses[hId];
    var isDominant = hId === stock.dominant;
    var hw = hasWeighting ? w.hypothesis_weights[hId] : null;
    var survivalPct = Math.round(h.survival_score * 100);
    var signalPct = hw ? hw.signal_strength_pct : survivalPct;
    var weightPct = hw ? hw.narrative_weight_pct : 25;
    var windowLabel = hw ? hw.dominant_window + 'd' : '';

    // Inflection detection
    var isInflection = hasWeighting && w.top_narrative &&
      w.top_narrative.inflection && w.top_narrative.top_narrative === hId;

    // Use plain_english if available, else description
    var plainText = h.plain_english || h.description;
    var watchText = h.what_to_watch || '';

    html += '<div class="hypothesis-card' + (isDominant ? ' hypothesis-dominant' : '') + '">';

    // Header row with score badge
    html += '<div class="hypothesis-card-header">' +
      '<span class="hypothesis-id id-' + hId.toLowerCase() + '">' + hId + '</span>' +
      '<span class="hypothesis-title">' + escapeHtml(h.label) + '</span>' +
      '<span class="hypothesis-score-badge">' + survivalPct + '%</span>' +
      '</div>';

    // Plain English description
    html += '<div class="hypothesis-plain plain-' + hId.toLowerCase() + '">' +
      escapeHtml(plainText) + '</div>';

    // Evidence support bar
    html += '<div class="evidence-bar-container">' +
      '<div class="evidence-bar-label">Evidence Support: ' + survivalPct + '%</div>' +
      '<div class="evidence-bar-track">' +
      '<div class="evidence-bar-fill bar-' + hId.toLowerCase() + '" style="width: ' + survivalPct + '%"></div>' +
      '</div></div>';

    // Dual-percentage metrics (Signal Strength and Narrative Weight)
    html += '<div class="hypothesis-metrics">' +
      '<div class="metric-block">' +
        '<span class="metric-label">Signal Strength</span>' +
        '<span class="metric-value">' + signalPct + '%</span>' +
      '</div>' +
      '<div class="metric-separator"></div>' +
      '<div class="metric-block">' +
        '<span class="metric-label">Narrative Weight</span>' +
        '<span class="metric-value metric-secondary">' + weightPct + '%</span>' +
      '</div>';

    if (windowLabel) {
      html += '<div class="metric-window">' + windowLabel + ' window</div>';
    }

    html += '</div>'; // .hypothesis-metrics

    // What to watch
    if (watchText) {
      html += '<div class="hypothesis-watch">' +
        '<span class="hypothesis-watch-label">What to watch:</span>' +
        escapeHtml(watchText) +
        '</div>';
    }

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

  // Footer
  html += '<div class="hypotheses-footer">' +
    'Scores reflect weighted evidence consistency. Higher percentage indicates more evidence ' +
    'supports this hypothesis. Signal Strength measures how strongly recent price action confirms ' +
    'each hypothesis. Narrative Weight shows each hypothesis\'s share of the overall evidence-based ' +
    'narrative. The dominant narrative has the fewest inconsistencies with available evidence.' +
    '</div>';

  container.innerHTML = html;
}

// ─── Technical Analysis Evidence Panel ────────────────────────────────────────

function renderTAEvidence(stock) {
  var container = document.getElementById('ta-evidence-section');
  if (!container) return;
  var allEvidence = stock.evidence_items || [];
  var taItems = [];
  for (var i = 0; i < allEvidence.length; i++) {
    if (allEvidence[i].source === 'TA Agent' && allEvidence[i].active !== false) taItems.push(allEvidence[i]);
  }
  if (taItems.length === 0) { container.innerHTML = '<p style="color:#90A4AE;font-size:13px;font-style:italic;">No technical signals available.</p>'; return; }
  var bullishCount = 0, bearishCount = 0;
  for (var b = 0; b < taItems.length; b++) {
    var sig = taItems[b].summary || '';
    if (sig.toLowerCase().indexOf('bullish') >= 0) bullishCount++;
    else if (sig.toLowerCase().indexOf('bearish') >= 0) bearishCount++;
  }
  var direction, regimeClass;
  if (bullishCount > bearishCount * 1.5) { direction = 'Bullish'; regimeClass = 'regime-bullish'; }
  else if (bearishCount > bullishCount * 1.5) { direction = 'Bearish'; regimeClass = 'regime-bearish'; }
  else { direction = 'Mixed'; regimeClass = 'regime-neutral'; }
  var signalDate = '';
  if (taItems[0].date) { var d = new Date(taItems[0].date); signalDate = d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }); }
  var html = '<div class="ta-evidence-header"><div class="ta-evidence-header-left"><span class="ta-regime-badge ' + regimeClass + '">' + escapeHtml(direction) + '</span><span class="ta-evidence-composite"><strong>' + bullishCount + '</strong> bullish, <strong>' + bearishCount + '</strong> bearish, <strong>' + (taItems.length - bullishCount - bearishCount) + '</strong> neutral</span></div><span class="ta-evidence-meta">TA Agent &mdash; ' + escapeHtml(signalDate) + '</span></div>';
  html += '<div class="ta-evidence-grid">';
  var sorted = taItems.slice().sort(function (a, b) { var aS = (a.summary || '').toLowerCase(); var bS = (b.summary || '').toLowerCase(); var aScore = aS.indexOf('bullish') >= 0 ? 0 : (aS.indexOf('bearish') >= 0 ? 1 : 2); var bScore = bS.indexOf('bullish') >= 0 ? 0 : (bS.indexOf('bearish') >= 0 ? 1 : 2); if (aScore !== bScore) return aScore - bScore; var diagOrder = { HIGH: 0, MODERATE: 1, MEDIUM: 1, LOW: 2 }; return (diagOrder[a.diagnosticity] || 3) - (diagOrder[b.diagnosticity] || 3); });
  for (var s = 0; s < sorted.length; s++) {
    var item = sorted[s]; var summary = item.summary || item.id; var sigLower = summary.toLowerCase();
    var signalClass = sigLower.indexOf('bullish') >= 0 ? 'signal-bullish' : (sigLower.indexOf('bearish') >= 0 ? 'signal-bearish' : 'signal-neutral');
    html += '<div class="ta-item"><div class="ta-item-signal ' + signalClass + '"></div><div class="ta-item-body"><div class="ta-item-summary">' + escapeHtml(summary) + '</div><div class="ta-item-meta">' + escapeHtml(item.diagnosticity || '') + ' diagnosticity</div>';
    if (item.hypothesis_impact) { html += '<div class="ta-item-impact">'; var ids = HYPOTHESIS_IDS || ['T1','T2','T3','T4']; for (var h = 0; h < ids.length; h++) { var hId = ids[h]; var impact = item.hypothesis_impact[hId]; if (!impact || impact === 'NEUTRAL') continue; html += '<span class="ta-impact-pill ' + (impact === 'CONSISTENT' ? 'impact-consistent' : 'impact-inconsistent') + '">' + (impact === 'CONSISTENT' ? '+' : '-') + hId + '</span>'; } html += '</div>'; }
    html += '</div></div>';
  }
  html += '</div><div class="ta-evidence-footer">Automated technical signals generated by TA Agent. Signals decay over time and are refreshed daily after market close.</div>';
  container.innerHTML = html;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    updateNarrativeUI: updateNarrativeUI,
    updateAlertBanner: updateAlertBanner,
    updateConfidenceHalo: updateConfidenceHalo,
    updateOverrideBanner: updateOverrideBanner,
    updateDislocationIndicator: updateDislocationIndicator,
    renderCompetingHypotheses: renderCompetingHypotheses,
    renderNarrativeHistory: renderNarrativeHistory,
    renderTAEvidence: renderTAEvidence
  };
}
