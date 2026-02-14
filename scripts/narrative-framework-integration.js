#!/usr/bin/env node
/**
 * narrative-framework-integration.js
 *
 * Continuum Intelligence — Narrative Framework v2.0
 *
 * Client-side integration script that:
 * 1. Injects CSS styles for alert banners (dark-theme compatible)
 * 2. Reads narrative-analysis.json to detect market dislocations
 * 3. Renders alert banners on stock report pages
 * 4. Dynamically updates hypothesis text when contradictions are detected
 *
 * Usage: Include via <script> tag in index.html, or run as Node.js for SSR.
 */

// ─── CSS STYLES ──────────────────────────────────────────────────────────────

const NFI_STYLES = `
/* Narrative Framework v2.0 Styles - FIXED for Dark Theme */
.nfi-alert-banner {
  margin: 16px 0;
  padding: 16px 20px;
  border-radius: 8px;
  font-family: var(--font-ui, system-ui, -apple-system, sans-serif);
  animation: nfi-slide-down 0.3s ease;
  color: #ffffff !important;
  line-height: 1.5;
}
.nfi-alert-critical {
  background: linear-gradient(135deg, #7f1d1d, #991b1b) !important;
  border: 1px solid #dc2626 !important;
  box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
}
.nfi-alert-high {
  background: linear-gradient(135deg, #92400e, #b45309) !important;
  border: 1px solid #f59e0b !important;
  box-shadow: 0 4px 12px rgba(217, 119, 6, 0.3);
}
.nfi-alert-moderate {
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8) !important;
  border: 1px solid #3b82f6 !important;
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}
@keyframes nfi-slide-down {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}
.nfi-alert-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.nfi-alert-icon {
  font-size: 1.4rem;
  line-height: 1;
}
.nfi-alert-title {
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.02em;
  color: #ffffff !important;
}
.nfi-alert-metrics {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.85) !important;
  font-family: var(--font-data, monospace);
  margin: 4px 0;
}
.nfi-alert-action {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.9) !important;
}
.nfi-alert-button {
  background: rgba(255, 255, 255, 0.15) !important;
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  color: #ffffff !important;
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  margin-right: 8px;
  margin-top: 8px;
  font-weight: 500;
  transition: all 0.2s;
}
.nfi-alert-button:hover {
  background: rgba(255, 255, 255, 0.25) !important;
}
/* Weight breakdown */
.nfi-weight-container {
  margin: 12px 0;
  padding: 12px;
  background: var(--bg-surface-alt, #1f2937);
  border-radius: 6px;
  border: 1px solid var(--border, #374151);
}
.nfi-weight-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.nfi-weight-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #9ca3af);
  font-weight: 600;
}
.nfi-weight-bar-container {
  height: 10px;
  background: var(--bg-surface, #111827);
  border-radius: 5px;
  overflow: hidden;
  display: flex;
}
.nfi-weight-lt {
  background: #14b8a6;
  transition: width 0.5s ease;
}
.nfi-weight-st {
  background: #f59e0b;
  transition: width 0.5s ease;
}
.nfi-weight-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.7rem;
  color: var(--text-muted, #9ca3af);
}
/* Commentary box */
.nfi-commentary-box {
  margin: 16px 0;
  padding: 16px;
  background: var(--bg-surface, #111827);
  border: 1px solid var(--border, #374151);
  border-radius: 8px;
  font-family: var(--font-narrative, Georgia, serif);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary, #d1d5db);
}
.nfi-commentary-box strong {
  color: var(--text-primary, #f9fafb);
  font-weight: 600;
}
`;

// ─── STYLE INJECTION ─────────────────────────────────────────────────────────

function injectStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('nfi-styles')) return;
  const style = document.createElement('style');
  style.id = 'nfi-styles';
  style.textContent = NFI_STYLES;
  document.head.appendChild(style);
}

// ─── ALERT BANNER RENDERING ──────────────────────────────────────────────────

function createAlertBanner(analysis) {
  const { ticker, dislocation, weights, inference } = analysis;
  const severity = dislocation.severity;
  const metrics = dislocation.metrics;

  if (severity === 'NORMAL') return null;

  const severityClass = severity === 'CRITICAL' ? 'nfi-alert-critical' : 'nfi-alert-high';
  const icon = severity === 'CRITICAL' ? '\u{1F534}' : '\u{1F7E0}';
  const label = severity === 'CRITICAL' ? 'CRITICAL DISLOCATION' : 'HIGH DISLOCATION';

  const banner = document.createElement('div');
  banner.className = `nfi-alert-banner ${severityClass}`;
  banner.innerHTML = `
    <div class="nfi-alert-header">
      <span class="nfi-alert-icon">${icon}</span>
      <span class="nfi-alert-title">${label}: ${ticker}</span>
    </div>
    <div class="nfi-alert-metrics">
      Price: A$${metrics.currentPrice.toFixed(2)} |
      Today: ${metrics.todayReturn >= 0 ? '+' : ''}${metrics.todayReturn.toFixed(2)}% |
      From Peak: ${metrics.drawdownFromPeak.toFixed(1)}% |
      Z-Score: ${metrics.zScore.toFixed(1)} |
      Vol Ratio: ${metrics.volumeRatio.toFixed(1)}x
    </div>
    <div class="nfi-alert-action">
      <strong>Primary hypothesis:</strong> ${inference.primaryHypothesis}
      ${inference.contradictedHypothesis ? ` | <strong>Contradicted:</strong> ${inference.contradictedHypothesis}` : ''}
      <br>
      <button class="nfi-alert-button" onclick="this.parentElement.parentElement.remove()">Dismiss</button>
    </div>
  `;
  return banner;
}

// ─── DYNAMIC NARRATIVE REPLACEMENT ───────────────────────────────────────────

function updateStockUI(ticker, analysis) {
  if (!analysis || analysis.dislocation.severity === 'NORMAL') return;

  const reportPage = document.getElementById(`page-report-${ticker}`);
  if (!reportPage) return;

  // Insert alert banner at top of report page
  const banner = createAlertBanner(analysis);
  if (banner) {
    const existing = reportPage.querySelector('.nfi-alert-banner');
    if (existing) existing.remove();
    reportPage.prepend(banner);
  }

  // Add dynamic narrative replacement for CRITICAL dislocations
  if (analysis.dislocation.severity === 'CRITICAL') {
    // Find and update T4 description if contradicted
    if (analysis.inference.contradictedHypothesis === 'T4') {
      const t4Cards = reportPage.querySelectorAll('.hypothesis-card, .rs-hypothesis');
      t4Cards.forEach(card => {
        const title = card.querySelector('h4, .rs-h-title');
        if (title && title.textContent.includes('T4')) {
          const desc = card.querySelector('p, .description, .rs-h-desc');
          if (desc) {
            desc.innerHTML = `<span style="color: #ef4444; font-weight: 600;">\u{1F534} CONTRADICTED BY PRICE ACTION:</span> Market has reversed view on AI as moat amplifier. Research weight ${analysis.weights.T4.longTerm}% \u2192 Market-implied ${analysis.weights.T4.shortTerm}%. AI now seen as competitive threat, not advantage.`;
          }
        }
      });
    }
  }
}

// ─── INITIALIZATION ──────────────────────────────────────────────────────────

async function initNarrativeFramework() {
  if (typeof document === 'undefined') return;

  injectStyles();

  // Load narrative analysis data
  try {
    const response = await fetch('data/narrative-analysis.json');
    if (!response.ok) {
      console.warn('[NFI] No narrative-analysis.json found. Run analysis first.');
      return;
    }
    const data = await response.json();

    if (!data.results) {
      console.warn('[NFI] No results in narrative-analysis.json');
      return;
    }

    // Update UI for each analyzed ticker
    for (const [ticker, analysis] of Object.entries(data.results)) {
      updateStockUI(ticker, analysis);
    }

    console.log(`[NFI] Narrative Framework loaded. ${data.summary.criticalDislocations} critical, ${data.summary.highDislocations} high dislocations.`);
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
  module.exports = { NFI_STYLES, initNarrativeFramework, updateStockUI, createAlertBanner };
}
