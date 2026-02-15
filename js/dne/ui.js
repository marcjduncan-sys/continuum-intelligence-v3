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

// ─── PDF Report Generation (Workstream 3) ────────────────────────────────────

function getDateString() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function getAssessmentClass(dominant) {
  if (dominant === 'T1') return 'assessment-positive';
  if (dominant === 'T2') return 'assessment-neutral';
  return 'assessment-negative';
}

function getAssessmentLabel(stock) {
  var dom = stock.hypotheses[stock.dominant];
  return stock.dominant + ': ' + dom.label + ' (' + dom.status + ')';
}

function buildEvidenceMatrixHtml(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var allEvidence = (stock.evidence_items || []).concat(
    (stock.price_signals || []).filter(function (ps) { return ps.active !== false; })
  );

  if (allEvidence.length === 0) return '<p style="color:#999;">No evidence items available.</p>';

  var html = '<table class="report-table"><thead><tr>' +
    '<th>Evidence</th><th>Source</th><th>Diagnosticity</th>';

  for (var h = 0; h < ids.length; h++) {
    html += '<th style="text-align:center;">' + ids[h] + '</th>';
  }
  html += '</tr></thead><tbody>';

  for (var i = 0; i < allEvidence.length; i++) {
    var e = allEvidence[i];
    var impacts = e.hypothesis_impact || e.ratings || {};
    html += '<tr>' +
      '<td>' + escapeHtml(e.summary || e.name || e.id) + '</td>' +
      '<td>' + escapeHtml(e.source || e.rule_id || '') + '</td>' +
      '<td>' + escapeHtml(e.diagnosticity || '') + '</td>';

    for (var j = 0; j < ids.length; j++) {
      var rating = impacts[ids[j]] || 'NEUTRAL';
      var cellClass = rating === 'CONSISTENT' ? 'cell-consistent'
        : rating === 'INCONSISTENT' ? 'cell-inconsistent' : 'cell-neutral';
      var cellLabel = rating === 'CONSISTENT' ? 'C'
        : rating === 'INCONSISTENT' ? 'I' : 'N';
      html += '<td class="' + cellClass + '">' + cellLabel + '</td>';
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function buildHypothesisBarHtml(hId, score, color) {
  var pct = Math.round(score * 100);
  return '<div class="report-hyp-bar">' +
    '<span class="report-hyp-label">' + hId + '</span>' +
    '<div class="report-hyp-bar-track">' +
    '<div class="report-hyp-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
    '</div>' +
    '<span class="report-hyp-pct">' + pct + '%</span>' +
    '</div>';
}

var TIER_COLORS = { T1: '#00C853', T2: '#2979FF', T3: '#FF9100', T4: '#D50000' };

function buildInstitutionalReport(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var dom = stock.hypotheses[stock.dominant];
  var domPct = Math.round(dom.survival_score * 100);

  var el = document.createElement('div');
  el.className = 'report-template report-institutional';

  // Cover
  var cover = '<div class="report-cover">' +
    '<div class="report-cover-brand">CONTINUUM INTELLIGENCE</div>' +
    '<div class="report-cover-tagline">Independent Cross-Domain Equity Research</div>' +
    '<div class="report-cover-company">' + escapeHtml(stock.company) + '</div>' +
    '<div class="report-cover-ticker">' + escapeHtml(stock.ticker) + (stock.sector ? ' | ' + escapeHtml(stock.sector) : '') + '</div>' +
    '<div class="report-cover-price">$' + Number(stock.current_price).toFixed(2) + '</div>' +
    '<div class="report-cover-assessment ' + getAssessmentClass(stock.dominant) + '">' +
    escapeHtml(getAssessmentLabel(stock)) + '</div>' +
    '<div class="report-cover-date">' + getDateString() + '</div>' +
    '</div>';

  // Executive Summary
  var execSummary = '<div class="report-section">' +
    '<div class="report-section-title">Executive Summary</div>' +
    '<ul class="report-bullet-list">' +
    '<li>Dominant narrative: <strong>' + escapeHtml(stock.dominant + ' — ' + dom.label) + '</strong> with ' + domPct + '% evidence support (Confidence: ' + escapeHtml(dom.status) + ')</li>' +
    '<li>' + escapeHtml(dom.description) + '</li>';

  // Add last flip context
  if (stock.last_flip) {
    execSummary += '<li>Narrative shifted from ' + escapeHtml(stock.last_flip.from) + ' to ' + escapeHtml(stock.last_flip.to) +
      ' on ' + escapeHtml(stock.last_flip.date) + ' at $' + Number(stock.last_flip.price_at_flip).toFixed(2) +
      '. Trigger: ' + escapeHtml(stock.last_flip.trigger) + '</li>';
  }

  execSummary += '</ul></div>';

  // Hypothesis Framework
  var framework = '<div class="report-section">' +
    '<div class="report-section-title">Hypothesis Framework</div>' +
    '<p class="report-text">Four competing hypotheses are scored by weighted evidence consistency. ' +
    'Higher scores indicate fewer inconsistencies with the available evidence.</p>';

  for (var i = 0; i < ids.length; i++) {
    var hId = ids[i];
    var h = stock.hypotheses[hId];
    var isDom = hId === stock.dominant;
    framework += '<div style="margin-bottom:12px;' + (isDom ? 'border-left:3px solid ' + TIER_COLORS[hId] + ';padding-left:12px;' : '') + '">' +
      '<p class="report-text" style="margin-bottom:4px;"><strong>' + hId + ': ' + escapeHtml(h.label) + (isDom ? ' (DOMINANT)' : '') + '</strong></p>' +
      '<p class="report-text" style="margin-bottom:4px;font-style:italic;">' + escapeHtml(h.description) + '</p>' +
      buildHypothesisBarHtml(hId, h.survival_score, TIER_COLORS[hId]);

    if (h.what_to_watch) {
      framework += '<p class="report-text" style="font-size:9pt;color:#666;">What to watch: ' + escapeHtml(h.what_to_watch) + '</p>';
    }
    framework += '</div>';
  }
  framework += '</div>';

  // Evidence Matrix
  var matrix = '<div class="report-section">' +
    '<div class="report-section-title">Evidence Matrix</div>' +
    '<p class="report-text" style="font-size:9pt;">C = Consistent, I = Inconsistent, N = Neutral with hypothesis.</p>' +
    buildEvidenceMatrixHtml(stock) +
    '</div>';

  // Discriminating Evidence
  var discriminating = '<div class="report-section">' +
    '<div class="report-section-title">Discriminating Evidence</div>' +
    '<p class="report-text">Key evidence items that separate the dominant hypothesis from alternatives:</p>' +
    '<ul class="report-bullet-list">';

  var allEvidence = (stock.evidence_items || []).filter(function (e) {
    return e.diagnosticity === 'CRITICAL' || e.diagnosticity === 'HIGH';
  });

  for (var d = 0; d < Math.min(allEvidence.length, 5); d++) {
    discriminating += '<li><strong>' + escapeHtml(allEvidence[d].diagnosticity) + '</strong> — ' +
      escapeHtml(allEvidence[d].summary) + ' (' + escapeHtml(allEvidence[d].source) + ')</li>';
  }
  discriminating += '</ul></div>';

  // Tripwires
  var tripwires = '<div class="report-section">' +
    '<div class="report-section-title">Tripwires</div>' +
    '<p class="report-text">Conditions that would trigger narrative reassessment:</p>' +
    '<ul class="report-bullet-list">';

  for (var t = 0; t < ids.length; t++) {
    var tw = stock.hypotheses[ids[t]];
    if (tw.what_to_watch) {
      tripwires += '<li><strong>' + ids[t] + ' (' + escapeHtml(tw.label) + '):</strong> ' + escapeHtml(tw.what_to_watch) + '</li>';
    }
  }
  tripwires += '</ul></div>';

  // Narrative History
  var historySection = '<div class="report-section">' +
    '<div class="report-section-title">Narrative History</div>';

  var allFlips = [];
  if (stock.last_flip) allFlips.push(stock.last_flip);
  if (stock.narrative_history) allFlips = allFlips.concat(stock.narrative_history);

  if (allFlips.length > 0) {
    historySection += '<table class="report-table"><thead><tr>' +
      '<th>Date</th><th>From</th><th>To</th><th>Trigger</th><th>Price</th>' +
      '</tr></thead><tbody>';

    for (var fl = 0; fl < allFlips.length; fl++) {
      var f = allFlips[fl];
      historySection += '<tr>' +
        '<td>' + escapeHtml(f.date) + '</td>' +
        '<td>' + escapeHtml(f.from) + '</td>' +
        '<td>' + escapeHtml(f.to) + '</td>' +
        '<td>' + escapeHtml(f.trigger) + '</td>' +
        '<td>$' + Number(f.price_at_flip).toFixed(2) + '</td>' +
        '</tr>';
    }
    historySection += '</tbody></table>';
  } else {
    historySection += '<p class="report-text" style="color:#999;">No narrative changes recorded.</p>';
  }
  historySection += '</div>';

  // Disclaimer
  var disclaimer = '<div class="report-disclaimer">' +
    '<div class="report-section-title" style="font-size:10px;">Disclaimer</div>' +
    '<p>This report is produced by Continuum Intelligence for informational purposes only. It does not constitute personal financial advice, ' +
    'a recommendation to buy or sell any security, or an offer to transact. The Analysis of Competing Hypotheses (ACH) methodology used ' +
    'in this report systematically evaluates evidence against multiple competing explanations to identify the most consistent narrative. ' +
    'Past performance is not indicative of future results. All data is believed to be reliable but accuracy is not guaranteed. ' +
    'Investors should conduct their own research and consult a licensed financial adviser before making investment decisions. ' +
    'Continuum Intelligence Pty Ltd and its associates may hold positions in securities discussed in this report.</p>' +
    '<p style="margin-top:8px;">Report generated: ' + new Date().toLocaleString() + ' | Page references are indicative.</p>' +
    '</div>';

  el.innerHTML = cover + execSummary + framework + matrix + discriminating + tripwires + historySection + disclaimer;
  return el;
}

function buildRetailReport(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var dom = stock.hypotheses[stock.dominant];
  var domPct = Math.round(dom.survival_score * 100);

  var el = document.createElement('div');
  el.className = 'report-template report-retail';

  // Cover
  var cover = '<div class="report-cover">' +
    '<div class="report-cover-brand">CONTINUUM INTELLIGENCE</div>' +
    '<div class="report-cover-tagline">Investor Briefing</div>' +
    '<div class="report-cover-company">' + escapeHtml(stock.company) + '</div>' +
    '<div class="report-cover-ticker">' + escapeHtml(stock.ticker) + (stock.sector ? ' | ' + escapeHtml(stock.sector) : '') + '</div>' +
    '<div class="report-cover-price">$' + Number(stock.current_price).toFixed(2) + '</div>' +
    '<div class="report-cover-assessment ' + getAssessmentClass(stock.dominant) + '">' +
    escapeHtml(dom.plain_english ? dom.plain_english.split('.')[0] + '.' : dom.label) + '</div>' +
    '<div class="report-cover-date">' + getDateString() + '</div>' +
    '</div>';

  // The Big Picture
  var bigPicture = '<div class="report-section">' +
    '<div class="report-section-title">The Big Picture</div>' +
    '<p class="report-text">' + escapeHtml(stock.big_picture || stock.company + ' is listed on the ASX under the ticker ' + stock.ticker + '.') + '</p>' +
    '</div>';

  // Our View in Plain English
  var ourView = '<div class="report-section">' +
    '<div class="report-section-title">Our View in Plain English</div>' +
    '<p class="report-text">' + escapeHtml(dom.plain_english || dom.description) + '</p>' +
    '<p class="report-text" style="font-size:10pt;color:#666;">This is the story that the evidence best supports right now, with a ' + domPct + '% evidence support score.</p>' +
    '</div>';

  // What Could Go Wrong
  var goWrong = '<div class="report-section">' +
    '<div class="report-section-title">What Could Go Wrong</div>';

  var risks = [];
  for (var r = 0; r < ids.length; r++) {
    var rh = stock.hypotheses[ids[r]];
    if (rh.risk_plain && ids[r] !== stock.dominant) {
      risks.push(rh.risk_plain);
    }
  }
  if (risks.length > 0) {
    goWrong += '<ul class="report-bullet-list">';
    for (var ri = 0; ri < Math.min(risks.length, 3); ri++) {
      goWrong += '<li>' + escapeHtml(risks[ri]) + '</li>';
    }
    goWrong += '</ul>';
  } else {
    goWrong += '<p class="report-text" style="color:#999;">No significant downside risks identified at this time.</p>';
  }
  goWrong += '</div>';

  // What Could Go Right
  var goRight = '<div class="report-section">' +
    '<div class="report-section-title">What Could Go Right</div>';

  var upsides = [];
  for (var u = 0; u < ids.length; u++) {
    var uh = stock.hypotheses[ids[u]];
    if (uh.upside) {
      upsides.push(uh.upside);
    }
  }
  if (upsides.length > 0) {
    goRight += '<ul class="report-bullet-list">';
    for (var ui = 0; ui < Math.min(upsides.length, 3); ui++) {
      goRight += '<li>' + escapeHtml(upsides[ui]) + '</li>';
    }
    goRight += '</ul>';
  } else {
    goRight += '<p class="report-text" style="color:#999;">No specific upside catalysts identified at this time.</p>';
  }
  goRight += '</div>';

  // Evidence Snapshot with balance dial
  var evidenceSnapshot = '<div class="report-section">' +
    '<div class="report-section-title">Evidence Snapshot</div>' +
    '<p class="report-text">The balance of evidence currently sits here:</p>';

  // Calculate dial position: weighted average of T1/T2 (bullish) vs T3/T4 (bearish)
  var bullScore = stock.hypotheses.T1.survival_score + stock.hypotheses.T2.survival_score;
  var bearScore = stock.hypotheses.T3.survival_score + stock.hypotheses.T4.survival_score;
  var totalScore = bullScore + bearScore;
  var dialPct = totalScore > 0 ? Math.round((bullScore / totalScore) * 100) : 50;

  evidenceSnapshot += '<div class="report-balance-dial">' +
    '<div class="report-dial-track">' +
    '<div class="report-dial-marker" style="left:' + dialPct + '%"></div>' +
    '</div>' +
    '<div class="report-dial-labels"><span>Bearish</span><span>Neutral</span><span>Bullish</span></div>' +
    '</div>';

  // Key evidence points
  var keyEvidence = (stock.evidence_items || []).slice(0, 5);
  if (keyEvidence.length > 0) {
    evidenceSnapshot += '<p class="report-text" style="margin-top:16px;"><strong>Key evidence points:</strong></p>' +
      '<ul class="report-bullet-list">';
    for (var ke = 0; ke < keyEvidence.length; ke++) {
      evidenceSnapshot += '<li>' + escapeHtml(keyEvidence[ke].summary) + ' <span style="color:#999;font-size:9pt;">(' + escapeHtml(keyEvidence[ke].source) + ')</span></li>';
    }
    evidenceSnapshot += '</ul>';
  }
  evidenceSnapshot += '</div>';

  // What We're Watching
  var watching = '<div class="report-section">' +
    '<div class="report-section-title">What We\'re Watching</div>' +
    '<p class="report-text">We\'d reassess our view if any of these conditions change:</p>' +
    '<ul class="report-bullet-list">';

  var watchCount = 0;
  for (var ww = 0; ww < ids.length; ww++) {
    var wh = stock.hypotheses[ids[ww]];
    if (wh.what_to_watch && watchCount < 4) {
      watching += '<li>' + escapeHtml(wh.what_to_watch) + '</li>';
      watchCount++;
    }
  }
  watching += '</ul></div>';

  // How to Read This Report
  var howTo = '<div class="report-section">' +
    '<div class="report-section-title">How to Read This Report</div>' +
    '<p class="report-text">We don\'t predict prices or tell you what to buy. We systematically weigh evidence for and ' +
    'against four competing stories about each company, then tell you which story the evidence best supports. ' +
    'When new evidence emerges, we update our scores and the dominant narrative may change.</p>' +
    '<p class="report-text">The "Evidence Support" percentage measures how consistent available evidence is with each hypothesis. ' +
    'A higher percentage means more evidence points in that direction. Think of it as the strength of each story\'s case.</p>' +
    '</div>';

  // Disclaimer
  var disclaimer = '<div class="report-disclaimer">' +
    '<div class="report-section-title" style="font-size:10px;">Important Information</div>' +
    '<p>This report is produced by Continuum Intelligence for informational purposes only. It does not constitute personal financial advice, ' +
    'a recommendation to buy or sell any security, or an offer to transact. The analysis used in this report systematically evaluates ' +
    'evidence against multiple competing explanations to identify the most consistent story. Past performance is not indicative of future ' +
    'results. All data is believed to be reliable but accuracy is not guaranteed. Investors should conduct their own research and ' +
    'consult a licensed financial adviser before making investment decisions.</p>' +
    '<p style="margin-top:8px;">Report generated: ' + new Date().toLocaleString() + '</p>' +
    '</div>';

  el.innerHTML = cover + bigPicture + ourView + goWrong + goRight + evidenceSnapshot + watching + howTo + disclaimer;
  return el;
}

/**
 * Generate and download a PDF report.
 * Requires html2pdf.js to be loaded.
 *
 * @param {string} format  'institutional' or 'retail'
 */
async function generateReport(format) {
  if (typeof html2pdf === 'undefined') {
    console.error('[DNE] html2pdf.js not loaded');
    alert('PDF generation library not available. Please try again.');
    return;
  }

  var stock = window.DNE_STOCK;
  if (!stock) {
    alert('Stock data not loaded yet. Please wait and try again.');
    return;
  }

  // Show loading state on button
  var btnClass = format === 'institutional' ? '.btn-download.institutional' : '.btn-download.retail';
  var btn = document.querySelector(btnClass);
  if (btn) btn.classList.add('generating');

  try {
    var element, opt;

    if (format === 'institutional') {
      element = buildInstitutionalReport(stock);
      opt = {
        margin: [10, 18, 10, 18],
        filename: 'Continuum_' + stock.ticker.replace('.', '_') + '_Institutional_' + getDateString() + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
    } else {
      element = buildRetailReport(stock);
      opt = {
        margin: [12, 20, 12, 20],
        filename: 'Continuum_' + stock.ticker.replace('.', '_') + '_InvestorBriefing_' + getDateString() + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };
    }

    await html2pdf().set(opt).from(element).save();
  } catch (err) {
    console.error('[DNE] PDF generation error:', err);
    alert('There was an error generating the PDF. Please try again.');
  } finally {
    if (btn) btn.classList.remove('generating');
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────

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
    generateReport: generateReport,
    buildInstitutionalReport: buildInstitutionalReport,
    buildRetailReport: buildRetailReport,
    escapeHtml: escapeHtml
  };
}
