#!/usr/bin/env node
/**
 * narrative-framework-integration.js
 *
 * Continuum Intelligence — Narrative Framework v3.0
 *
 * Client-side integration script that:
 * 1. Loads narrative-analysis.json on init and stores data globally
 * 2. Exposes window.applyNarrativeAnalysis(ticker) for lazy report rendering
 * 3. Renders alert banners with full narrative shift commentary
 * 4. Adds Short-Term vs Long-Term weight breakdown to hypothesis cards
 * 5. Injects market-responsive narrative section into the Dominant Narrative
 * 6. Updates hypothesis descriptions when contradicted by price action
 *
 * Called from route() in index.html AFTER renderReportPage() completes.
 */

// ─── CSS STYLES ──────────────────────────────────────────────────────────────

const NFI_STYLES = `
/* Narrative Framework v3.0 — Dislocation Indicator (matches Risk Skew bar) */
.nfi-alert-banner {
  padding: var(--space-md, 12px) 0;
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
  border-bottom: 1px solid var(--border, #1E3050);
}
.nfi-alert-inner {
  max-width: var(--max-width, 1120px);
  margin: 0 auto;
  padding: 0 var(--space-lg, 24px);
}
.nfi-alert-row {
  display: flex;
  align-items: center;
  gap: var(--space-md, 12px);
}
.nfi-alert-label {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted, #6B7A8D);
  white-space: nowrap;
}
.nfi-alert-severity {
  font-family: var(--font-data, monospace);
  font-size: 0.7rem;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 3px;
  white-space: nowrap;
  letter-spacing: 0.04em;
}
.nfi-alert-metrics {
  font-size: 0.82rem;
  color: var(--text-secondary, #9CA3AF);
  white-space: nowrap;
  flex: 1;
}
.nfi-alert-dismiss {
  font-size: 0.9rem;
  cursor: pointer;
  background: none;
  border: none;
  color: var(--text-muted, #6B7A8D);
  padding: 0 4px;
  margin-left: auto;
  line-height: 1;
  opacity: 0.5;
}
.nfi-alert-dismiss:hover { opacity: 1; }

/* Severity badge colours — mirrors .skew-badge styling */
.nfi-alert-negative { background: var(--bg-surface, #111827); }
.nfi-alert-negative .nfi-alert-severity {
  background: rgba(212, 85, 85, 0.12);
  color: var(--signal-red, #D45555);
  border: 1px solid rgba(212, 85, 85, 0.25);
}
.nfi-alert-positive { background: var(--bg-surface, #111827); }
.nfi-alert-positive .nfi-alert-severity {
  background: rgba(61, 170, 109, 0.12);
  color: var(--signal-green, #3DAA6D);
  border: 1px solid rgba(61, 170, 109, 0.25);
}
.nfi-alert-neutral { background: var(--bg-surface, #111827); }
.nfi-alert-neutral .nfi-alert-severity {
  background: rgba(212, 160, 60, 0.12);
  color: var(--signal-amber, #D4A03C);
  border: 1px solid rgba(212, 160, 60, 0.25);
}

/* ─── Market-Responsive Narrative Section ─── */
.nfi-market-narrative {
  margin: 20px 0;
  border: 1px solid var(--border, #374151);
  border-radius: 8px;
  overflow: hidden;
}
.nfi-mn-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: linear-gradient(135deg, #1e1b4b, #312e81);
  border-bottom: 1px solid #4338ca;
}
.nfi-mn-header-critical {
  background: linear-gradient(135deg, #450a0a, #7f1d1d) !important;
  border-bottom-color: #dc2626 !important;
}
.nfi-mn-header-high {
  background: linear-gradient(135deg, #451a03, #78350f) !important;
  border-bottom-color: #d97706 !important;
}
.nfi-mn-title {
  font-weight: 700;
  font-size: 0.85rem;
  color: #ffffff;
  letter-spacing: 0.02em;
}
.nfi-mn-badge {
  font-size: 0.65rem;
  padding: 3px 8px;
  border-radius: 3px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.nfi-mn-badge-critical { background: #dc2626; color: #fff; }
.nfi-mn-badge-high { background: #d97706; color: #fff; }
.nfi-mn-badge-moderate { background: #2563eb; color: #fff; }
.nfi-mn-body {
  padding: 16px 18px;
  background: var(--bg-surface, #111827);
}
.nfi-mn-section {
  margin-bottom: 16px;
}
.nfi-mn-section:last-child { margin-bottom: 0; }
.nfi-mn-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #9ca3af);
  font-weight: 600;
  margin-bottom: 6px;
}
.nfi-mn-text {
  font-size: 0.82rem;
  line-height: 1.6;
  color: var(--text-secondary, #d1d5db);
  font-family: var(--font-narrative, Georgia, serif);
}

/* ─── Hypothesis Weight Breakdown (ST/LT) ─── */
.nfi-hyp-weights {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--bg-surface-alt, #1a1a2e);
  border-radius: 6px;
  border: 1px solid var(--border, #374151);
}
.nfi-hw-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 0.72rem;
  color: var(--text-muted, #9ca3af);
}
.nfi-hw-row:last-child { margin-bottom: 0; }
.nfi-hw-label { width: 80px; font-weight: 600; }
.nfi-hw-bar-container {
  flex: 1;
  height: 8px;
  background: rgba(255,255,255,0.06);
  border-radius: 4px;
  overflow: hidden;
}
.nfi-hw-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}
.nfi-hw-bar-lt { background: #14b8a6; }
.nfi-hw-bar-st { background: #f59e0b; }
.nfi-hw-bar-blend { background: #8b5cf6; }
.nfi-hw-value {
  width: 36px;
  text-align: right;
  font-family: var(--font-data, monospace);
}
.nfi-hw-gap {
  font-size: 0.68rem;
  margin-top: 4px;
  color: var(--text-muted, #6b7280);
}
.nfi-hw-gap-high { color: #ef4444 !important; font-weight: 600; }
.nfi-hw-gap-medium { color: #f59e0b !important; }
.nfi-contradicted-badge {
  display: inline-block;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 3px;
  background: #7f1d1d;
  color: #fca5a5;
  font-weight: 600;
  margin-left: 8px;
  letter-spacing: 0.03em;
}
`;

// ─── STYLE INJECTION ─────────────────────────────────────────────────────────

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('nfi-styles')) return;
  var style = document.createElement('style');
  style.id = 'nfi-styles';
  style.textContent = NFI_STYLES;
  document.head.appendChild(style);
}

// ─── ALERT BANNER RENDERING ──────────────────────────────────────────────────

function createAlertBanner(analysis) {
  var dislocation = analysis.dislocation;
  var severity = dislocation.severity;
  var metrics = dislocation.metrics;

  if (severity === 'NORMAL') return null;

  // Direction from price action
  var direction = metrics.todayReturn < 0 ? 'negative' :
                  metrics.todayReturn > 0 ? 'positive' : 'neutral';

  // Severity label
  var severityLabel = severity === 'CRITICAL' ? 'Critical' :
                      severity === 'HIGH' ? 'Moderate' : 'Minor';

  var banner = document.createElement('div');
  banner.className = 'nfi-alert-banner nfi-alert-' + direction;

  banner.innerHTML =
    '<div class="nfi-alert-inner">' +
      '<div class="nfi-alert-row">' +
        '<span class="nfi-alert-label">Dislocation</span>' +
        '<span class="nfi-alert-severity">' + severityLabel + '</span>' +
        '<span class="nfi-alert-metrics">' +
          'A$' + metrics.currentPrice.toFixed(2) +
          ' \u2502 ' + (metrics.todayReturn >= 0 ? '+' : '') + metrics.todayReturn.toFixed(1) + '% today' +
          ' \u2502 ' + metrics.drawdownFromPeak.toFixed(1) + '% from peak' +
          ' \u2502 Z: ' + metrics.zScore.toFixed(1) +
        '</span>' +
        '<button class="nfi-alert-dismiss" onclick="this.closest(\'.nfi-alert-banner\').remove()">&times;</button>' +
      '</div>' +
    '</div>';

  return banner;
}

// ─── MARKET-RESPONSIVE NARRATIVE SECTION ────────────────────────────────────

function createMarketNarrativeSection(analysis) {
  var severity = analysis.dislocation.severity;
  if (severity === 'NORMAL') return null;

  var shift = analysis.narrativeShift;
  var weights = analysis.weights;
  var hNames = analysis.hypothesisNames || {};
  if (!shift || !shift.hasShift) return null;

  var headerClass = severity === 'CRITICAL' ? ' nfi-mn-header-critical' :
                    severity === 'HIGH' ? ' nfi-mn-header-high' : '';
  var badgeClass = severity === 'CRITICAL' ? 'nfi-mn-badge-critical' :
                   severity === 'HIGH' ? 'nfi-mn-badge-high' : 'nfi-mn-badge-moderate';

  // Build weight divergence table
  var weightRows = '';
  var tiers = ['T1', 'T2', 'T3', 'T4'];
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var w = weights[t];
    if (!w) continue;
    var name = hNames[t] || t;
    var gap = Math.abs(w.longTerm - w.shortTerm);
    var gapClass = gap > 40 ? 'nfi-hw-gap-high' : gap > 20 ? 'nfi-hw-gap-medium' : '';
    var isContradicted = analysis.inference.contradictedHypothesis === t;

    weightRows +=
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:0.78rem;">' +
        '<div style="width:150px;color:var(--text-secondary,#d1d5db);font-weight:600;">' + t + ': ' + name +
          (isContradicted ? ' <span class="nfi-contradicted-badge">CONTRADICTED</span>' : '') +
        '</div>' +
        '<div style="flex:1;">' +
          '<div class="nfi-hw-row">' +
            '<span class="nfi-hw-label">Research</span>' +
            '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-lt" style="width:' + w.longTerm + '%"></div></div>' +
            '<span class="nfi-hw-value">' + w.longTerm + '%</span>' +
          '</div>' +
          '<div class="nfi-hw-row">' +
            '<span class="nfi-hw-label">Market</span>' +
            '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-st" style="width:' + w.shortTerm + '%"></div></div>' +
            '<span class="nfi-hw-value">' + w.shortTerm + '%</span>' +
          '</div>' +
          '<div class="nfi-hw-row">' +
            '<span class="nfi-hw-label">Blended</span>' +
            '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-blend" style="width:' + w.blended + '%"></div></div>' +
            '<span class="nfi-hw-value">' + w.blended + '%</span>' +
          '</div>' +
          '<div class="nfi-hw-gap ' + gapClass + '">' + gap + 'pt divergence | Confidence: ' + w.confidence + '</div>' +
        '</div>' +
      '</div>';
  }

  var section = document.createElement('div');
  section.className = 'nfi-market-narrative';
  section.innerHTML =
    '<div class="nfi-mn-header' + headerClass + '">' +
      '<span class="nfi-mn-title">Market-Responsive Narrative Update</span>' +
      '<span class="nfi-mn-badge ' + badgeClass + '">' + severity + '</span>' +
    '</div>' +
    '<div class="nfi-mn-body">' +
      '<div class="nfi-mn-section">' +
        '<div class="nfi-mn-label">Short-Term View (Market-Implied)</div>' +
        '<div class="nfi-mn-text">' + shift.shortTermView + '</div>' +
      '</div>' +
      '<div class="nfi-mn-section">' +
        '<div class="nfi-mn-label">Long-Term View (Research-Based)</div>' +
        '<div class="nfi-mn-text">' + shift.longTermView + '</div>' +
      '</div>' +
      (shift.commentary ? '<div class="nfi-mn-section">' +
        '<div class="nfi-mn-label">Institutional Commentary</div>' +
        '<div class="nfi-mn-text">' + shift.commentary + '</div>' +
      '</div>' : '') +
      '<div class="nfi-mn-section">' +
        '<div class="nfi-mn-label">Hypothesis Weight Breakdown: Research vs Market vs Blended</div>' +
        weightRows +
      '</div>' +
    '</div>';

  return section;
}

// ─── HYPOTHESIS CARD WEIGHT INJECTION ──────────────────────────────────────

function addWeightBreakdownToCards(reportPage, analysis) {
  var weights = analysis.weights;
  var hNames = analysis.hypothesisNames || {};
  if (!weights) return;

  // Find all hypothesis cards
  var cards = reportPage.querySelectorAll('.hyp-card');
  cards.forEach(function(card) {
    var titleEl = card.querySelector('.hc-title');
    if (!titleEl) return;

    var titleText = titleEl.textContent;
    var tier = null;
    var match = titleText.match(/T(\d)/);
    if (match) tier = 'T' + match[1];
    if (!tier || !weights[tier]) return;

    var w = weights[tier];
    var gap = Math.abs(w.longTerm - w.shortTerm);
    var gapClass = gap > 40 ? 'nfi-hw-gap-high' : gap > 20 ? 'nfi-hw-gap-medium' : '';
    var isContradicted = analysis.inference.contradictedHypothesis === tier;

    // Add contradicted badge to title if applicable
    if (isContradicted && !titleEl.querySelector('.nfi-contradicted-badge')) {
      titleEl.insertAdjacentHTML('beforeend', ' <span class="nfi-contradicted-badge">CONTRADICTED</span>');
    }

    // Remove any existing weight breakdown
    var existing = card.querySelector('.nfi-hyp-weights');
    if (existing) existing.remove();

    var breakdown = document.createElement('div');
    breakdown.className = 'nfi-hyp-weights';
    breakdown.innerHTML =
      '<div class="nfi-hw-row">' +
        '<span class="nfi-hw-label">Research</span>' +
        '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-lt" style="width:' + w.longTerm + '%"></div></div>' +
        '<span class="nfi-hw-value">' + w.longTerm + '%</span>' +
      '</div>' +
      '<div class="nfi-hw-row">' +
        '<span class="nfi-hw-label">Market</span>' +
        '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-st" style="width:' + w.shortTerm + '%"></div></div>' +
        '<span class="nfi-hw-value">' + w.shortTerm + '%</span>' +
      '</div>' +
      '<div class="nfi-hw-row">' +
        '<span class="nfi-hw-label">Blended</span>' +
        '<div class="nfi-hw-bar-container"><div class="nfi-hw-bar nfi-hw-bar-blend" style="width:' + w.blended + '%"></div></div>' +
        '<span class="nfi-hw-value">' + w.blended + '%</span>' +
      '</div>' +
      '<div class="nfi-hw-gap ' + gapClass + '">' +
        gap + 'pt divergence | Confidence: ' + w.confidence +
        (isContradicted ? ' | PRICE ACTION CONTRADICTS THIS THESIS' : '') +
      '</div>';

    // Insert after score row
    var scoreRow = card.querySelector('.hc-score-row');
    if (scoreRow) {
      scoreRow.parentNode.insertBefore(breakdown, scoreRow.nextSibling);
    } else {
      card.appendChild(breakdown);
    }
  });
}

// ─── MAIN UPDATE FUNCTION ────────────────────────────────────────────────────

function applyNarrativeAnalysis(ticker) {
  if (typeof document === 'undefined') return;
  if (!window._nfiAnalysisData || !window._nfiAnalysisData.results) return;

  // Throttle guard — prevent re-processing the same ticker within 10 seconds
  // This stops MutationObserver infinite loops where NFI DOM changes re-trigger processing
  if (!window._nfiProcessedTickers) window._nfiProcessedTickers = {};
  if (window._nfiProcessedTickers[ticker] &&
      (Date.now() - window._nfiProcessedTickers[ticker]) < 10000) {
    return;
  }
  window._nfiProcessedTickers[ticker] = Date.now();

  var analysis = window._nfiAnalysisData.results[ticker];
  if (!analysis || analysis.dislocation.severity === 'NORMAL') return;

  var reportPage = document.getElementById('page-report-' + ticker);
  if (!reportPage || !reportPage.innerHTML) return;

  // 1. Insert dislocation indicator just before the Risk Skew bar (sibling element)
  var banner = createAlertBanner(analysis);
  if (banner) {
    var existingBanner = reportPage.querySelector('.nfi-alert-banner');
    if (existingBanner) existingBanner.remove();

    var skewBar = reportPage.querySelector('.risk-skew-bar');
    if (skewBar) {
      skewBar.parentNode.insertBefore(banner, skewBar);
    } else {
      var heroSection = reportPage.querySelector('.report-hero') || reportPage.firstChild;
      if (heroSection && heroSection.nextSibling) {
        reportPage.insertBefore(banner, heroSection.nextSibling);
      } else {
        reportPage.prepend(banner);
      }
    }
  }

  // 2. Update contradicted hypothesis descriptions
  if (analysis.inference.contradictedHypothesis) {
    updateContradictedHypothesis(reportPage, analysis);
  }

  console.log('[NFI] Applied narrative analysis to ' + ticker + ': ' + analysis.dislocation.severity);
}

function updateContradictedHypothesis(reportPage, analysis) {
  var contradicted = analysis.inference.contradictedHypothesis;
  var w = analysis.weights[contradicted];
  var hName = (analysis.hypothesisNames || {})[contradicted] || contradicted;
  if (!w) return;

  var cards = reportPage.querySelectorAll('.hyp-card');
  cards.forEach(function(card) {
    var title = card.querySelector('.hc-title');
    if (!title) return;
    if (!title.textContent.includes(contradicted)) return;

    var desc = card.querySelector('.hc-desc');
    if (desc && !desc.dataset.nfiUpdated) {
      var originalText = desc.innerHTML;
      desc.innerHTML =
        '<span style="color:#ef4444;font-weight:600;display:block;margin-bottom:8px;">' +
          'CONTRADICTED BY PRICE ACTION: Market has reversed view. ' +
          'Research weight ' + w.longTerm + '% \u2192 Market-implied ' + w.shortTerm + '%. ' +
        '</span>' +
        '<span style="opacity:0.7;">' + originalText + '</span>';
      desc.dataset.nfiUpdated = 'true';
    }
  });
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

async function initNarrativeFramework() {
  if (typeof document === 'undefined') return;

  injectStyles();

  // Load narrative analysis data
  try {
    var response = await fetch('data/narrative-analysis.json');
    if (!response.ok) {
      console.warn('[NFI] No narrative-analysis.json found. Run analysis first.');
      return;
    }
    var data = await response.json();

    if (!data.results) {
      console.warn('[NFI] No results in narrative-analysis.json');
      return;
    }

    // Store globally for lazy access
    window._nfiAnalysisData = data;

    // Expose the apply function globally
    window.applyNarrativeAnalysis = applyNarrativeAnalysis;

    // Apply to any already-rendered report pages
    for (var ticker in data.results) {
      if (data.results.hasOwnProperty(ticker)) {
        var reportPage = document.getElementById('page-report-' + ticker);
        if (reportPage && reportPage.innerHTML) {
          applyNarrativeAnalysis(ticker);
        }
      }
    }

    var critCount = data.summary.criticalDislocations || 0;
    var highCount = data.summary.highDislocations || 0;
    console.log('[NFI] Narrative Framework v3.0 loaded. ' + critCount + ' critical, ' + highCount + ' high dislocations.');
  } catch (e) {
    console.warn('[NFI] Could not load narrative analysis:', e.message);
  }
}

// Auto-init when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNarrativeFramework);
  } else {
    initNarrativeFramework();
  }
}

// Export for Node.js usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NFI_STYLES, initNarrativeFramework, applyNarrativeAnalysis, createAlertBanner };
}
