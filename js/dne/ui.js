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

// ─── PDF Report Generation (Workstream 3 — Full Rewrite) ─────────────────────
// ALL INLINE STYLES. No CSS classes. No CSS variables. html2pdf-safe.

var TIER_COLORS = { T1: '#00C853', T2: '#2979FF', T3: '#FF9100', T4: '#D50000' };

function getDateString() {
  var d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

// ─── Data Resolution ─────────────────────────────────────────────────────────
// Try multiple sources to find stock data, with DOM scraping as last resort.

function resolveStockData() {
  // Source 1: DNE global (normal path)
  if (window.DNE_STOCK) return window.DNE_STOCK;
  // Source 2: Other common globals
  if (window.currentStock) return window.currentStock;
  if (window.stockData) return window.stockData;
  if (window.currentAnalysis) return window.currentAnalysis;
  // Source 3: data attribute
  var dataEl = document.querySelector('[data-stock]');
  if (dataEl) {
    try { return JSON.parse(dataEl.dataset.stock); } catch (e) { /* ignore */ }
  }
  // Source 4: Scrape from DOM
  return scrapeStockFromDOM();
}

function scrapeStockFromDOM() {
  try {
    var tickerEl = document.getElementById('stock-ticker');
    var companyEl = document.getElementById('stock-company');
    var priceEl = document.getElementById('stock-price');
    var ticker = tickerEl ? tickerEl.textContent.trim() : (document.title.split('-')[0] || '').trim() || 'STOCK';
    var company = companyEl ? companyEl.textContent.trim() : 'Company';
    var priceText = priceEl ? priceEl.textContent.replace(/[^0-9.]/g, '') : '0';

    // Try to find hypothesis data from the rendered panel
    var hypotheses = {};
    var ids = ['T1', 'T2', 'T3', 'T4'];
    var labels = ['Growth', 'Base', 'Risk', 'Disruption'];
    for (var i = 0; i < ids.length; i++) {
      hypotheses[ids[i]] = {
        label: labels[i],
        description: '',
        plain_english: '',
        what_to_watch: '',
        upside: '',
        risk_plain: '',
        survival_score: 0.25,
        status: 'MODERATE'
      };
    }

    // Parse score badges if visible
    var badges = document.querySelectorAll('.hypothesis-score-badge');
    badges.forEach(function (badge, idx) {
      if (ids[idx] && hypotheses[ids[idx]]) {
        var pct = parseInt(badge.textContent);
        if (!isNaN(pct)) hypotheses[ids[idx]].survival_score = pct / 100;
      }
    });

    return {
      ticker: ticker,
      company: company,
      sector: '',
      current_price: parseFloat(priceText) || 0,
      dominant: 'T1',
      hypotheses: hypotheses,
      evidence_items: [],
      last_flip: null,
      narrative_history: [],
      big_picture: ''
    };
  } catch (e) {
    console.error('[DNE] DOM scrape failed:', e);
    return null;
  }
}

// ─── Inline-Styled Evidence Matrix ───────────────────────────────────────────

function buildEvidenceMatrixInline(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var allEvidence = (stock.evidence_items || []).concat(
    (stock.price_signals || []).filter(function (ps) { return ps.active !== false; })
  );
  if (allEvidence.length === 0) return '<p style="color:#999;font-size:10px;">No evidence items available.</p>';

  var thStyle = 'padding:6px 8px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;border:1px solid #E0E0E0;color:#37474F;background:#F2F2F2;';
  var tdStyle = 'padding:5px 8px;border:1px solid #E0E0E0;vertical-align:top;font-size:9px;';

  var html = '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin:12px 0;"><thead><tr>' +
    '<th style="' + thStyle + '">Evidence</th>' +
    '<th style="' + thStyle + '">Source</th>' +
    '<th style="' + thStyle + '">Diagnosticity</th>';
  for (var h = 0; h < ids.length; h++) {
    html += '<th style="' + thStyle + 'text-align:center;">' + ids[h] + '</th>';
  }
  html += '</tr></thead><tbody>';

  for (var i = 0; i < allEvidence.length; i++) {
    var e = allEvidence[i];
    var impacts = e.hypothesis_impact || e.ratings || {};
    html += '<tr>' +
      '<td style="' + tdStyle + '">' + escapeHtml(e.summary || e.name || e.id) + '</td>' +
      '<td style="' + tdStyle + '">' + escapeHtml(e.source || e.rule_id || '') + '</td>' +
      '<td style="' + tdStyle + '">' + escapeHtml(e.diagnosticity || '') + '</td>';
    for (var j = 0; j < ids.length; j++) {
      var rating = impacts[ids[j]] || 'NEUTRAL';
      var cellBg, cellColor, cellLabel;
      if (rating === 'CONSISTENT') { cellBg = '#E8F5E9'; cellColor = '#2E7D32'; cellLabel = 'C'; }
      else if (rating === 'INCONSISTENT') { cellBg = '#FFEBEE'; cellColor = '#C62828'; cellLabel = 'I'; }
      else { cellBg = '#FAFAFA'; cellColor = '#9E9E9E'; cellLabel = 'N'; }
      html += '<td style="' + tdStyle + 'text-align:center;font-weight:600;background:' + cellBg + ';color:' + cellColor + ';">' + cellLabel + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

// ─── Inline Hypothesis Bar ───────────────────────────────────────────────────

function buildHypBarInline(hId, score, color) {
  var pct = Math.round(score * 100);
  return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
    '<span style="font-size:10px;font-weight:600;color:#263238;min-width:32px;">' + hId + '</span>' +
    '<div style="flex:1;height:12px;background:#ECEFF1;border-radius:6px;overflow:hidden;">' +
    '<div style="height:100%;border-radius:6px;width:' + pct + '%;background:' + color + ';"></div>' +
    '</div>' +
    '<span style="font-size:12px;font-weight:700;min-width:36px;text-align:right;">' + pct + '%</span>' +
    '</div>';
}

// ─── Section Title (inline) ──────────────────────────────────────────────────

function sectionTitle(text, borderColor) {
  return '<div style="font-size:14px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:0.06em;border-bottom:2px solid ' + (borderColor || '#2E5090') + ';padding-bottom:6px;margin-bottom:12px;">' + escapeHtml(text) + '</div>';
}

// ─── Institutional Report Builder (ALL INLINE) ───────────────────────────────

function buildInstitutionalReport(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var dom = stock.hypotheses[stock.dominant];
  var domPct = Math.round(dom.survival_score * 100);

  var el = document.createElement('div');
  el.style.cssText = 'font-family:Arial,Helvetica,sans-serif;color:#333;line-height:1.6;width:170mm;font-size:10pt;background:#ffffff;';

  // Assessment badge colors
  var assessBg, assessColor;
  if (stock.dominant === 'T1') { assessBg = '#E8F5E9'; assessColor = '#2E7D32'; }
  else if (stock.dominant === 'T2') { assessBg = '#E3F2FD'; assessColor = '#1565C0'; }
  else { assessBg = '#FBE9E7'; assessColor = '#BF360C'; }

  // Cover
  var cover =
    '<div style="text-align:center;padding:60px 40px 40px;">' +
      '<div style="font-size:24px;font-weight:700;color:#1B2A4A;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">CONTINUUM INTELLIGENCE</div>' +
      '<div style="font-size:11px;color:#2E5090;letter-spacing:0.05em;margin-bottom:48px;">Independent Cross-Domain Equity Research</div>' +
      '<div style="font-size:32px;font-weight:700;color:#1B2A4A;margin-bottom:8px;">' + escapeHtml(stock.company) + '</div>' +
      '<div style="font-size:16px;color:#666;margin-bottom:24px;">' + escapeHtml(stock.ticker) + (stock.sector ? ' | ' + escapeHtml(stock.sector) : '') + '</div>' +
      '<div style="font-size:28px;font-weight:700;color:#263238;margin-bottom:16px;">$' + Number(stock.current_price).toFixed(2) + '</div>' +
      '<div style="display:inline-block;padding:6px 20px;border-radius:4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;background:' + assessBg + ';color:' + assessColor + ';">' +
        escapeHtml(stock.dominant + ': ' + dom.label + ' (' + dom.status + ')') +
      '</div>' +
      '<div style="font-size:12px;color:#90A4AE;margin-top:24px;">' + getDateString() + '</div>' +
    '</div>';

  // Executive Summary
  var execSummary = '<div style="margin-bottom:24px;">' +
    sectionTitle('Executive Summary') +
    '<ul style="margin:8px 0;padding-left:20px;">' +
    '<li style="margin-bottom:6px;line-height:1.6;">Dominant narrative: <strong>' + escapeHtml(stock.dominant + ' \u2014 ' + dom.label) + '</strong> with ' + domPct + '% evidence support (Confidence: ' + escapeHtml(dom.status) + ')</li>' +
    '<li style="margin-bottom:6px;line-height:1.6;">' + escapeHtml(dom.description) + '</li>';
  if (stock.last_flip) {
    execSummary += '<li style="margin-bottom:6px;line-height:1.6;">Narrative shifted from ' + escapeHtml(stock.last_flip.from) + ' to ' + escapeHtml(stock.last_flip.to) +
      ' on ' + escapeHtml(stock.last_flip.date) + ' at $' + Number(stock.last_flip.price_at_flip).toFixed(2) +
      '. Trigger: ' + escapeHtml(stock.last_flip.trigger) + '</li>';
  }
  execSummary += '</ul></div>';

  // Hypothesis Framework
  var framework = '<div style="margin-bottom:24px;">' +
    sectionTitle('Hypothesis Framework') +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">Four competing hypotheses are scored by weighted evidence consistency. Higher scores indicate fewer inconsistencies with the available evidence.</p>';
  for (var i = 0; i < ids.length; i++) {
    var hId = ids[i];
    var h = stock.hypotheses[hId];
    var isDom = hId === stock.dominant;
    framework += '<div style="margin-bottom:12px;' + (isDom ? 'border-left:3px solid ' + TIER_COLORS[hId] + ';padding-left:12px;' : '') + '">' +
      '<p style="color:#444;margin-bottom:4px;"><strong>' + hId + ': ' + escapeHtml(h.label) + (isDom ? ' (DOMINANT)' : '') + '</strong></p>' +
      '<p style="color:#444;margin-bottom:4px;font-style:italic;">' + escapeHtml(h.description) + '</p>' +
      buildHypBarInline(hId, h.survival_score, TIER_COLORS[hId]);
    if (h.what_to_watch) {
      framework += '<p style="font-size:9pt;color:#666;">What to watch: ' + escapeHtml(h.what_to_watch) + '</p>';
    }
    framework += '</div>';
  }
  framework += '</div>';

  // Evidence Matrix
  var matrix = '<div style="margin-bottom:24px;">' +
    sectionTitle('Evidence Matrix') +
    '<p style="font-size:9pt;color:#444;margin-bottom:10px;">C = Consistent, I = Inconsistent, N = Neutral with hypothesis.</p>' +
    buildEvidenceMatrixInline(stock) +
    '</div>';

  // Discriminating Evidence
  var discriminating = '<div style="margin-bottom:24px;">' +
    sectionTitle('Discriminating Evidence') +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">Key evidence items that separate the dominant hypothesis from alternatives:</p>' +
    '<ul style="margin:8px 0;padding-left:20px;">';
  var critEvidence = (stock.evidence_items || []).filter(function (e) {
    return e.diagnosticity === 'CRITICAL' || e.diagnosticity === 'HIGH';
  });
  for (var d = 0; d < Math.min(critEvidence.length, 5); d++) {
    discriminating += '<li style="margin-bottom:6px;line-height:1.6;"><strong>' + escapeHtml(critEvidence[d].diagnosticity) + '</strong> \u2014 ' +
      escapeHtml(critEvidence[d].summary) + ' (' + escapeHtml(critEvidence[d].source) + ')</li>';
  }
  if (critEvidence.length === 0) {
    discriminating += '<li style="margin-bottom:6px;color:#999;">No critical/high diagnosticity evidence available.</li>';
  }
  discriminating += '</ul></div>';

  // Tripwires
  var tripwires = '<div style="margin-bottom:24px;">' +
    sectionTitle('Tripwires') +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">Conditions that would trigger narrative reassessment:</p>' +
    '<ul style="margin:8px 0;padding-left:20px;">';
  for (var t = 0; t < ids.length; t++) {
    var tw = stock.hypotheses[ids[t]];
    if (tw.what_to_watch) {
      tripwires += '<li style="margin-bottom:6px;line-height:1.6;"><strong>' + ids[t] + ' (' + escapeHtml(tw.label) + '):</strong> ' + escapeHtml(tw.what_to_watch) + '</li>';
    }
  }
  tripwires += '</ul></div>';

  // Narrative History
  var historySection = '<div style="margin-bottom:24px;">' + sectionTitle('Narrative History');
  var allFlips = [];
  if (stock.last_flip) allFlips.push(stock.last_flip);
  if (stock.narrative_history) allFlips = allFlips.concat(stock.narrative_history);
  if (allFlips.length > 0) {
    var hThStyle = 'padding:6px 8px;text-align:left;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;border:1px solid #E0E0E0;color:#37474F;background:#F2F2F2;';
    var hTdStyle = 'padding:5px 8px;border:1px solid #E0E0E0;vertical-align:top;font-size:9px;';
    historySection += '<table style="width:100%;border-collapse:collapse;font-size:9pt;margin:12px 0;"><thead><tr>' +
      '<th style="' + hThStyle + '">Date</th><th style="' + hThStyle + '">From</th><th style="' + hThStyle + '">To</th><th style="' + hThStyle + '">Trigger</th><th style="' + hThStyle + '">Price</th>' +
      '</tr></thead><tbody>';
    for (var fl = 0; fl < allFlips.length; fl++) {
      var f = allFlips[fl];
      historySection += '<tr>' +
        '<td style="' + hTdStyle + '">' + escapeHtml(f.date) + '</td>' +
        '<td style="' + hTdStyle + '">' + escapeHtml(f.from) + '</td>' +
        '<td style="' + hTdStyle + '">' + escapeHtml(f.to) + '</td>' +
        '<td style="' + hTdStyle + '">' + escapeHtml(f.trigger) + '</td>' +
        '<td style="' + hTdStyle + '">$' + Number(f.price_at_flip).toFixed(2) + '</td>' +
        '</tr>';
    }
    historySection += '</tbody></table>';
  } else {
    historySection += '<p style="color:#999;">No narrative changes recorded.</p>';
  }
  historySection += '</div>';

  // Disclaimer
  var disclaimer = '<div style="font-size:8pt;color:#999;line-height:1.5;margin-top:24px;border-top:1px solid #E0E0E0;padding-top:12px;">' +
    '<div style="font-size:10px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Disclaimer</div>' +
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

// ─── Retail Report Builder (ALL INLINE) ──────────────────────────────────────

function buildRetailReport(stock) {
  var ids = ['T1', 'T2', 'T3', 'T4'];
  var dom = stock.hypotheses[stock.dominant];
  var domPct = Math.round(dom.survival_score * 100);

  var el = document.createElement('div');
  el.style.cssText = 'font-family:Arial,Helvetica,sans-serif;color:#333;line-height:1.6;width:170mm;font-size:11pt;background:#ffffff;';

  var tealBorder = '#0097A7';

  // Assessment badge
  var assessBg, assessColor;
  if (stock.dominant === 'T1') { assessBg = '#E8F5E9'; assessColor = '#2E7D32'; }
  else if (stock.dominant === 'T2') { assessBg = '#E3F2FD'; assessColor = '#1565C0'; }
  else { assessBg = '#FBE9E7'; assessColor = '#BF360C'; }

  var coverText = dom.plain_english ? escapeHtml(dom.plain_english.split('.')[0] + '.') : escapeHtml(dom.label);

  // Cover
  var cover =
    '<div style="text-align:center;padding:60px 40px 40px;">' +
      '<div style="font-size:24px;font-weight:700;color:#1B2A4A;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:4px;">CONTINUUM INTELLIGENCE</div>' +
      '<div style="font-size:11px;color:#0097A7;letter-spacing:0.05em;margin-bottom:48px;">Investor Briefing</div>' +
      '<div style="font-size:32px;font-weight:700;color:#1B2A4A;margin-bottom:8px;">' + escapeHtml(stock.company) + '</div>' +
      '<div style="font-size:16px;color:#666;margin-bottom:24px;">' + escapeHtml(stock.ticker) + (stock.sector ? ' | ' + escapeHtml(stock.sector) : '') + '</div>' +
      '<div style="font-size:28px;font-weight:700;color:#263238;margin-bottom:16px;">$' + Number(stock.current_price).toFixed(2) + '</div>' +
      '<div style="display:inline-block;padding:6px 20px;border-radius:4px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;background:' + assessBg + ';color:' + assessColor + ';">' +
        coverText +
      '</div>' +
      '<div style="font-size:12px;color:#90A4AE;margin-top:24px;">' + getDateString() + '</div>' +
    '</div>';

  // The Big Picture
  var bigPicture = '<div style="margin-bottom:24px;">' +
    sectionTitle('The Big Picture', tealBorder) +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">' + escapeHtml(stock.big_picture || stock.company + ' is listed on the ASX under the ticker ' + stock.ticker + '.') + '</p>' +
    '</div>';

  // Our View in Plain English
  var ourView = '<div style="margin-bottom:24px;">' +
    sectionTitle('Our View in Plain English', tealBorder) +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">' + escapeHtml(dom.plain_english || dom.description) + '</p>' +
    '<p style="font-size:10pt;color:#666;line-height:1.7;">This is the story that the evidence best supports right now, with a ' + domPct + '% evidence support score.</p>' +
    '</div>';

  // What Could Go Wrong
  var goWrong = '<div style="margin-bottom:24px;">' + sectionTitle('What Could Go Wrong', tealBorder);
  var risks = [];
  for (var r = 0; r < ids.length; r++) {
    var rh = stock.hypotheses[ids[r]];
    if (rh.risk_plain && ids[r] !== stock.dominant) risks.push(rh.risk_plain);
  }
  if (risks.length > 0) {
    goWrong += '<ul style="margin:8px 0;padding-left:20px;">';
    for (var ri = 0; ri < Math.min(risks.length, 3); ri++) {
      goWrong += '<li style="margin-bottom:6px;line-height:1.6;">' + escapeHtml(risks[ri]) + '</li>';
    }
    goWrong += '</ul>';
  } else {
    goWrong += '<p style="color:#999;">No significant downside risks identified at this time.</p>';
  }
  goWrong += '</div>';

  // What Could Go Right
  var goRight = '<div style="margin-bottom:24px;">' + sectionTitle('What Could Go Right', tealBorder);
  var upsides = [];
  for (var u = 0; u < ids.length; u++) {
    var uh = stock.hypotheses[ids[u]];
    if (uh.upside) upsides.push(uh.upside);
  }
  if (upsides.length > 0) {
    goRight += '<ul style="margin:8px 0;padding-left:20px;">';
    for (var ui = 0; ui < Math.min(upsides.length, 3); ui++) {
      goRight += '<li style="margin-bottom:6px;line-height:1.6;">' + escapeHtml(upsides[ui]) + '</li>';
    }
    goRight += '</ul>';
  } else {
    goRight += '<p style="color:#999;">No specific upside catalysts identified at this time.</p>';
  }
  goRight += '</div>';

  // Evidence Snapshot with balance dial
  var bullScore = stock.hypotheses.T1.survival_score + stock.hypotheses.T2.survival_score;
  var bearScore = stock.hypotheses.T3.survival_score + stock.hypotheses.T4.survival_score;
  var totalScore = bullScore + bearScore;
  var dialPct = totalScore > 0 ? Math.round((bullScore / totalScore) * 100) : 50;

  var evidenceSnapshot = '<div style="margin-bottom:24px;">' +
    sectionTitle('Evidence Snapshot', tealBorder) +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">The balance of evidence currently sits here:</p>' +
    '<div style="text-align:center;margin:16px 0;">' +
      '<div style="height:14px;background:linear-gradient(to right,#FFCDD2,#FFF9C4,#C8E6C9);border-radius:7px;position:relative;margin:0 auto;max-width:400px;">' +
        '<div style="position:absolute;top:-4px;left:' + dialPct + '%;width:4px;height:22px;background:#1B2A4A;border-radius:2px;transform:translateX(-50%);"></div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;max-width:400px;margin:4px auto 0;font-size:9px;color:#999;text-transform:uppercase;letter-spacing:0.04em;">' +
        '<span>Bearish</span><span>Neutral</span><span>Bullish</span>' +
      '</div>' +
    '</div>';

  var keyEvidence = (stock.evidence_items || []).slice(0, 5);
  if (keyEvidence.length > 0) {
    evidenceSnapshot += '<p style="color:#444;margin-top:16px;"><strong>Key evidence points:</strong></p>' +
      '<ul style="margin:8px 0;padding-left:20px;">';
    for (var ke = 0; ke < keyEvidence.length; ke++) {
      evidenceSnapshot += '<li style="margin-bottom:6px;line-height:1.6;">' + escapeHtml(keyEvidence[ke].summary) +
        ' <span style="color:#999;font-size:9pt;">(' + escapeHtml(keyEvidence[ke].source) + ')</span></li>';
    }
    evidenceSnapshot += '</ul>';
  }
  evidenceSnapshot += '</div>';

  // What We're Watching
  var watching = '<div style="margin-bottom:24px;">' +
    sectionTitle('What We\'re Watching', tealBorder) +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">We\'d reassess our view if any of these conditions change:</p>' +
    '<ul style="margin:8px 0;padding-left:20px;">';
  var watchCount = 0;
  for (var ww = 0; ww < ids.length; ww++) {
    var wh = stock.hypotheses[ids[ww]];
    if (wh.what_to_watch && watchCount < 4) {
      watching += '<li style="margin-bottom:6px;line-height:1.6;">' + escapeHtml(wh.what_to_watch) + '</li>';
      watchCount++;
    }
  }
  watching += '</ul></div>';

  // How to Read This Report
  var howTo = '<div style="margin-bottom:24px;">' +
    sectionTitle('How to Read This Report', tealBorder) +
    '<p style="color:#444;line-height:1.7;margin-bottom:10px;">We don\'t predict prices or tell you what to buy. We systematically weigh evidence for and ' +
    'against four competing stories about each company, then tell you which story the evidence best supports. ' +
    'When new evidence emerges, we update our scores and the dominant narrative may change.</p>' +
    '<p style="color:#444;line-height:1.7;">The "Evidence Support" percentage measures how consistent available evidence is with each hypothesis. ' +
    'A higher percentage means more evidence points in that direction. Think of it as the strength of each story\'s case.</p>' +
    '</div>';

  // Disclaimer
  var disclaimer = '<div style="font-size:8pt;color:#999;line-height:1.5;margin-top:24px;border-top:1px solid #E0E0E0;padding-top:12px;">' +
    '<div style="font-size:10px;font-weight:700;color:#1B2A4A;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:8px;">Important Information</div>' +
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

// ─── Generate Report (with fallback) ─────────────────────────────────────────

async function generateReport(format) {
  // Resolve stock data from multiple sources
  var stock = resolveStockData();
  if (!stock) {
    alert('Could not find stock data. Please reload the page and try again.');
    console.error('[DNE] PDF generation: No stock data found from any source');
    return;
  }
  console.log('[DNE] PDF: Using stock data:', stock.ticker || stock.company);

  // Show loading state
  var btnClass = format === 'institutional' ? '.btn-download.institutional' : '.btn-download.retail';
  var btn = document.querySelector(btnClass);
  if (btn) btn.classList.add('generating');

  // Build the report element
  var element = format === 'institutional'
    ? buildInstitutionalReport(stock)
    : buildRetailReport(stock);

  var filename = 'Continuum_' + (stock.ticker || 'Report').replace(/\./g, '_') + '_' +
    (format === 'institutional' ? 'Institutional' : 'InvestorBriefing') + '_' + getDateString() + '.pdf';

  // Try html2pdf first
  if (typeof html2pdf !== 'undefined') {
    document.body.appendChild(element);
    try {
      await html2pdf()
        .set({
          margin: format === 'institutional' ? [10, 18, 10, 18] : [12, 20, 12, 20],
          filename: filename,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(element)
        .save();
      document.body.removeChild(element);
      if (btn) btn.classList.remove('generating');
      return;
    } catch (err) {
      console.error('[DNE] html2pdf failed, falling back to print:', err);
      document.body.removeChild(element);
    }
  }

  // Fallback: open in new window and trigger print (Save as PDF)
  console.log('[DNE] Using print fallback for PDF generation');
  var win = window.open('', '_blank');
  if (win) {
    win.document.write(
      '<html><head><title>' + escapeHtml((stock.ticker || 'Report') + ' - ' + format) + '</title>' +
      '<style>@media print { body { margin: 0; } }</style></head>' +
      '<body>' + element.outerHTML + '</body></html>'
    );
    win.document.close();
    setTimeout(function () { win.print(); }, 500);
  } else {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
  }

  if (btn) btn.classList.remove('generating');
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
