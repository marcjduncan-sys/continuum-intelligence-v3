/**
 * Narrative Framework v2.0 Integration Module
 * 
 * Integrates Price-Narrative Engine and Institutional Commentary Engine
 * into the Continuum website. Adds dynamic hypothesis weights, price dislocation
 * alerts, and institutional-grade commentary to stock reports.
 * 
 * Include this script AFTER price-narrative-engine.js and 
 * institutional-commentary-engine.js in index.html
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const NFI_CONFIG = {
  // Analysis triggers
  AUTO_ANALYZE_ON_LOAD: true,
  ANALYZE_DISLOCATION_ONLY: false,  // If true, only show updates when dislocation detected
  
  // Display options
  SHOW_WEIGHT_BREAKDOWN: true,
  SHOW_DIVERGENCE_BADGES: true,
  SHOW_DISLOCATION_ALERTS: true,
  SHOW_MARKET_COMMENTARY: true,
  
  // Visual thresholds
  DIVERGENCE_MODERATE: 20,
  DIVERGENCE_MAJOR: 40,
  DIVERGENCE_CRITICAL: 50,
  
  // Update behavior
  PRESERVE_ORIGINAL_WEIGHTS: true,  // Keep original weights in _originalWeights
  HIGHLIGHT_CHANGES: true
};

// ============================================================================
// CSS STYLES (Injected dynamically)
// ============================================================================

const NFI_STYLES = `
/* Narrative Framework v2.0 Styles */

/* Dislocation Alert Banner */
.nfi-alert-banner {
  margin: 16px 0;
  padding: 16px 20px;
  border-radius: 8px;
  font-family: var(--font-ui);
  animation: nfi-slide-down 0.3s ease;
}

.nfi-alert-critical {
  background: linear-gradient(135deg, #7f1d1d, #991b1b);
  border: 1px solid #dc2626;
  color: #ffffff !important;
}

.nfi-alert-high {
  background: linear-gradient(135deg, #92400e, #b45309);
  border: 1px solid #f59e0b;
  color: #ffffff !important;
}

.nfi-alert-moderate {
  background: linear-gradient(135deg, #1e3a8a, #1d4ed8);
  border: 1px solid #3b82f6;
  color: #ffffff !important;
}

@keyframes nfi-slide-down {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.nfi-alert-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.nfi-alert-icon {
  font-size: 1.4rem;
}

.nfi-alert-title {
  font-weight: 700;
  font-size: 0.9rem;
  letter-spacing: 0.02em;
}

.nfi-alert-metrics {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.85) !important;
  font-family: var(--font-data);
}

.nfi-alert-action {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.1);
  font-size: 0.8rem;
}

.nfi-alert-button {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.2);
  color: inherit;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  margin-right: 8px;
  transition: all 0.2s;
}

.nfi-alert-button:hover {
  background: rgba(255,255,255,0.2);
}

/* Hypothesis Weight Breakdown */
.nfi-weight-container {
  margin: 12px 0;
  padding: 12px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
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
  color: var(--text-muted);
  font-weight: 600;
}

.nfi-weight-bar-container {
  height: 10px;
  background: var(--bg-surface);
  border-radius: 5px;
  overflow: hidden;
  display: flex;
}

.nfi-weight-lt {
  background: var(--accent-teal);
  transition: width 0.5s ease;
}

.nfi-weight-st {
  background: var(--accent-gold);
  transition: width 0.5s ease;
}

.nfi-weight-labels {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 0.65rem;
  color: var(--text-muted);
}

/* Divergence Badge */
.nfi-divergence-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  margin-left: 8px;
}

.nfi-divergence-moderate {
  background: rgba(212, 160, 60, 0.15);
  color: #D4A03C;
  border: 1px solid rgba(212, 160, 60, 0.3);
}

.nfi-divergence-major {
  background: rgba(212, 85, 85, 0.15);
  color: #D45555;
  border: 1px solid rgba(212, 85, 85, 0.3);
}

.nfi-divergence-critical {
  background: rgba(212, 85, 85, 0.25);
  color: #FF6B6B;
  border: 1px solid rgba(212, 85, 85, 0.5);
  animation: nfi-pulse 2s infinite;
}

@keyframes nfi-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Confidence Indicator */
.nfi-confidence {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
}

.nfi-confidence-high { color: var(--signal-green); }
.nfi-confidence-medium { color: var(--signal-amber); }
.nfi-confidence-low { color: var(--signal-red); }

/* Market Commentary Box */
.nfi-commentary-box {
  margin: 16px 0;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-family: var(--font-narrative);
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

.nfi-commentary-box h4 {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.nfi-commentary-box p {
  margin-bottom: 12px;
}

.nfi-commentary-box p:last-child {
  margin-bottom: 0;
}

.nfi-commentary-box strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* Status Indicators */
.nfi-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 600;
}

.nfi-status-aligned { color: var(--signal-green); }
.nfi-status-tension { color: var(--signal-amber); }
.nfi-status-divergent { color: var(--signal-red); }

/* Price Metrics Mini */
.nfi-price-mini {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: var(--bg-surface-alt);
  border-radius: 6px;
  margin: 12px 0;
  font-family: var(--font-data);
  font-size: 0.75rem;
}

.nfi-price-metric {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nfi-price-metric-label {
  color: var(--text-muted);
  font-size: 0.65rem;
  text-transform: uppercase;
}

.nfi-price-metric-value {
  color: var(--text-primary);
  font-weight: 600;
}

.nfi-price-metric-value.negative {
  color: var(--signal-red);
}

.nfi-price-metric-value.positive {
  color: var(--signal-green);
}

/* Section Headers with Status */
.nfi-section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.nfi-section-title {
  font-size: 0.85rem;
  font-weight: 700;
}

.nfi-last-updated {
  font-size: 0.65rem;
  color: var(--text-muted);
  font-style: italic;
}
`;

// ============================================================================
// MAIN INTEGRATION CLASS
// ============================================================================

const NarrativeFrameworkIntegration = {
  
  /**
   * Initialize the integration
   */
  init() {
    console.log('[NFI] Initializing Narrative Framework v2.0 Integration...');
    
    // Inject styles
    this.injectStyles();
    
    // Check dependencies
    if (!this.checkDependencies()) {
      console.error('[NFI] Required engines not loaded. Aborting.');
      return false;
    }
    
    // Load analysis results if they exist
    this.loadStoredAnalysis();
    
    // Auto-analyze if configured
    if (NFI_CONFIG.AUTO_ANALYZE_ON_LOAD) {
      this.analyzeAllStocks();
    }
    
    console.log('[NFI] Integration initialized successfully.');
    return true;
  },

  /**
   * Inject CSS styles
   */
  injectStyles() {
    if (document.getElementById('nfi-styles')) return;
    
    const styleEl = document.createElement('style');
    styleEl.id = 'nfi-styles';
    styleEl.textContent = NFI_STYLES;
    document.head.appendChild(styleEl);
    console.log('[NFI] Styles injected.');
  },

  /**
   * Check required dependencies
   */
  checkDependencies() {
    const hasPriceEngine = typeof PriceNarrativeEngine !== 'undefined';
    const hasCommentaryEngine = typeof InstitutionalCommentaryEngine !== 'undefined';
    
    if (!hasPriceEngine) {
      console.error('[NFI] PriceNarrativeEngine not found. Load scripts/price-narrative-engine.js first.');
    }
    if (!hasCommentaryEngine) {
      console.error('[NFI] InstitutionalCommentaryEngine not found. Load scripts/institutional-commentary-engine.js first.');
    }
    
    return hasPriceEngine && hasCommentaryEngine;
  },

  /**
   * Load previously stored analysis from localStorage or data file
   */
  loadStoredAnalysis() {
    try {
      const stored = localStorage.getItem('nfi-analysis');
      if (stored) {
        this.analysisCache = JSON.parse(stored);
        console.log('[NFI] Loaded stored analysis:', Object.keys(this.analysisCache));
      }
    } catch (e) {
      console.warn('[NFI] Could not load stored analysis:', e);
    }
  },

  /**
   * Save analysis to localStorage
   */
  saveAnalysis(ticker, analysis) {
    try {
      if (!this.analysisCache) this.analysisCache = {};
      this.analysisCache[ticker] = {
        ...analysis,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('nfi-analysis', JSON.stringify(this.analysisCache));
    } catch (e) {
      console.warn('[NFI] Could not save analysis:', e);
    }
  },

  /**
   * Analyze all stocks in STOCK_DATA
   */
  async analyzeAllStocks() {
    console.log('[NFI] Analyzing all stocks...');
    
    const tickers = Object.keys(STOCK_DATA);
    const results = {};
    
    for (const ticker of tickers) {
      try {
        const result = await this.analyzeStock(ticker);
        if (result) {
          results[ticker] = result;
        }
      } catch (e) {
        console.error(`[NFI] Error analyzing ${ticker}:`, e);
      }
    }
    
    console.log('[NFI] Analysis complete:', Object.keys(results));
    return results;
  },

  /**
   * Analyze a single stock
   */
  async analyzeStock(ticker) {
    const stockData = STOCK_DATA[ticker];
    if (!stockData) {
      console.warn(`[NFI] No data found for ${ticker}`);
      return null;
    }
    
    // Build price data from available sources
    const priceData = this.buildPriceData(ticker, stockData);
    
    // Run analysis
    const analysis = PriceNarrativeEngine.analyze(ticker, stockData, priceData);
    
    // Store original weights if not already stored
    if (NFI_CONFIG.PRESERVE_ORIGINAL_WEIGHTS && !stockData._originalWeights) {
      stockData._originalWeights = this.extractOriginalWeights(stockData);
    }
    
    // Apply dynamic weights to stockData
    if (analysis.shouldUpdate) {
      PriceNarrativeEngine.applyAnalysis(stockData, analysis);
      
      // Generate institutional commentary
      if (typeof InstitutionalCommentaryEngine !== 'undefined') {
        analysis.institutionalCommentary = InstitutionalCommentaryEngine.generateReport(
          ticker, stockData, priceData, analysis.weights, analysis.dislocation, analysis.inference
        );
      }
      
      // Store in cache
      this.saveAnalysis(ticker, analysis);
      
      // Update UI
      this.updateStockUI(ticker, analysis);
    }
    
    return analysis;
  },

  /**
   * Build price data from available sources
   */
  buildPriceData(ticker, stockData) {
    // Try to get from live-prices.json data if available
    const livePrice = window.LIVE_PRICES?.prices?.[ticker];
    
    const priceHistory = stockData.priceHistory || [];
    const currentPrice = livePrice?.p || stockData.price || priceHistory[priceHistory.length - 1] || 100;
    const previousPrice = livePrice?.pc || priceHistory[priceHistory.length - 2] || currentPrice;
    const priceAtReview = stockData.price || currentPrice;
    const peakPrice = Math.max(...priceHistory, currentPrice);
    const low52Week = Math.min(...priceHistory, currentPrice);
    const high52Week = peakPrice;
    
    // Calculate historical returns
    const returns = [];
    for (let i = 1; i < priceHistory.length; i++) {
      returns.push((priceHistory[i] - priceHistory[i-1]) / priceHistory[i-1]);
    }
    
    // Count consecutive down days
    let consecutiveDown = 0;
    for (let i = priceHistory.length - 1; i > 0; i--) {
      if (priceHistory[i] < priceHistory[i-1]) consecutiveDown++;
      else break;
    }
    
    return {
      currentPrice,
      previousPrice,
      priceAtReview,
      peakPrice,
      low52Week,
      high52Week,
      todayVolume: livePrice?.v || 1000000,
      avgVolume20d: livePrice?.v ? livePrice.v / 1.5 : 800000,
      historicalReturns: returns.length ? returns : [0, 0, 0, 0, 0],
      consecutiveDownDays: consecutiveDown
    };
  },

  /**
   * Extract original weights from stockData
   */
  extractOriginalWeights(stockData) {
    const weights = {};
    if (stockData.hypotheses) {
      stockData.hypotheses.forEach(h => {
        const scoreStr = h.score || '0%';
        weights[h.tier.toUpperCase()] = parseInt(scoreStr);
      });
    }
    return weights;
  },

  /**
   * Update UI for a stock
   */
  updateStockUI(ticker, analysis) {
    // Show dislocation alert if significant
    if (NFI_CONFIG.SHOW_DISLOCATION_ALERTS && analysis.dislocation.severity !== 'NORMAL') {
      this.renderDislocationAlert(ticker, analysis);
    }
    
    // Update hypothesis displays
    if (NFI_CONFIG.SHOW_WEIGHT_BREAKDOWN) {
      this.updateHypothesisWeights(ticker, analysis);
    }
    
    // Update narrative commentary
    if (NFI_CONFIG.SHOW_MARKET_COMMENTARY && analysis.institutionalCommentary) {
      this.updateNarrativeCommentary(ticker, analysis);
    }
  },

  /**
   * Render dislocation alert banner
   */
  renderDislocationAlert(ticker, analysis) {
    const container = document.querySelector(`#page-report-${ticker}`);
    if (!container) return;
    
    // Remove existing alert
    const existing = container.querySelector('.nfi-alert-banner');
    if (existing) existing.remove();
    
    const severity = analysis.dislocation.severity.toLowerCase();
    const metrics = analysis.dislocation.metrics;
    
    const alert = document.createElement('div');
    alert.className = `nfi-alert-banner nfi-alert-${severity}`;
    alert.innerHTML = `
      <div class="nfi-alert-header">
        <span class="nfi-alert-icon">${severity === 'critical' ? '🔴' : severity === 'high' ? '🟠' : '🟡'}</span>
        <span class="nfi-alert-title">Price Dislocation — ${analysis.dislocation.severity}</span>
      </div>
      <div class="nfi-alert-metrics">
        ${metrics.todayReturn}% move | Z: ${metrics.zScore} | Vol: ${metrics.volumeRatio}x | ${analysis.dislocation.pattern}
      </div>
      <div class="nfi-alert-action">
        <strong>Market-implied:</strong> ${analysis.inference.primaryHypothesis} dominant (${(analysis.inference.confidence * 100).toFixed(0)}% confidence)
        <br>
        <button class="nfi-alert-button" onclick="NarrativeFrameworkIntegration.showFullAnalysis('${ticker}')">
          View Full Analysis
        </button>
        <button class="nfi-alert-button" onclick="NarrativeFrameworkIntegration.showNarrativeModal('${ticker}')">
          Research vs Market
        </button>
      </div>
    `;
    
    container.insertBefore(alert, container.firstChild);
  },

  /**
   * Update hypothesis weight displays
   */
  updateHypothesisWeights(ticker, analysis) {
    const container = document.querySelector(`#${ticker}-hypotheses, #page-report-${ticker} .report-section`);
    if (!container) return;
    
    // Find hypothesis cards and update them
    const cards = container.querySelectorAll('.hypothesis-card, .rs-hypothesis');
    
    cards.forEach((card, index) => {
      const tier = ['T1', 'T2', 'T3', 'T4'][index];
      if (!tier || !analysis.weights[tier]) return;
      
      const weight = analysis.weights[tier];
      const gap = Math.abs(weight.longTerm - weight.shortTerm);
      
      // Add or update weight breakdown
      let breakdown = card.querySelector('.nfi-weight-container');
      if (!breakdown && NFI_CONFIG.SHOW_WEIGHT_BREAKDOWN) {
        breakdown = document.createElement('div');
        breakdown.className = 'nfi-weight-container';
        card.appendChild(breakdown);
      }
      
      if (breakdown) {
        breakdown.innerHTML = `
          <div class="nfi-weight-header">
            <span class="nfi-weight-label">Hypothesis Weight</span>
            <span class="nfi-confidence nfi-confidence-${weight.confidence.toLowerCase()}">
              ${weight.confidence === 'HIGH' ? '🟢' : weight.confidence === 'MEDIUM' ? '🟡' : '🔴'} ${weight.confidence}
            </span>
          </div>
          <div class="nfi-weight-bar-container">
            <div class="nfi-weight-lt" style="width: ${weight.longTerm}%"></div>
            <div class="nfi-weight-st" style="width: ${weight.shortTerm - weight.longTerm > 0 ? weight.shortTerm - weight.longTerm : 0}%"></div>
          </div>
          <div class="nfi-weight-labels">
            <span>Research: ${weight.longTerm}%</span>
            <span>Blended: ${weight.blended}%</span>
            <span>Market: ${weight.shortTerm}%</span>
          </div>
          ${gap > NFI_CONFIG.DIVERGENCE_MODERATE ? `
            <div style="margin-top: 8px; font-size: 0.7rem; color: ${gap > NFI_CONFIG.DIVERGENCE_MAJOR ? 'var(--signal-red)' : 'var(--signal-amber)'}">
              ${gap > NFI_CONFIG.DIVERGENCE_CRITICAL ? '🔴' : '⚠️'} ${gap}pt ${weight.shortTerm > weight.longTerm ? 'above' : 'below'} research view
            </div>
          ` : ''}
        `;
      }
      
      // Add divergence badge to title
      if (NFI_CONFIG.SHOW_DIVERGENCE_BADGES && gap > NFI_CONFIG.DIVERGENCE_MODERATE) {
        const title = card.querySelector('.rs-h-title, h4');
        if (title && !title.querySelector('.nfi-divergence-badge')) {
          const badgeClass = gap > NFI_CONFIG.DIVERGENCE_CRITICAL ? 'critical' : gap > NFI_CONFIG.DIVERGENCE_MAJOR ? 'major' : 'moderate';
          const badge = document.createElement('span');
          badge.className = `nfi-divergence-badge nfi-divergence-${badgeClass}`;
          badge.textContent = `${gap}pt gap`;
          title.appendChild(badge);
        }
      }
    });
  },

  /**
   * Update narrative commentary section
   */
  updateNarrativeCommentary(ticker, analysis) {
    if (!analysis.institutionalCommentary) return;
    
    const container = document.querySelector(`#${ticker}-narrative, #page-report-${ticker} .report-section`);
    if (!container) return;
    
    const commentary = analysis.institutionalCommentary;
    
    // Find or create commentary box
    let box = container.querySelector('.nfi-commentary-box');
    if (!box) {
      box = document.createElement('div');
      box.className = 'nfi-commentary-box';
      container.insertBefore(box, container.firstChild);
    }
    
    box.innerHTML = `
      <h4>🎯 Market-Responsive Analysis</h4>
      <div style="font-size: 0.7rem; color: var(--text-muted); margin-bottom: 12px;">
        Updated: ${new Date().toLocaleString()} | Severity: ${analysis.dislocation.severity} | Urgency: ${commentary.summary.urgency}
      </div>
      <p>${commentary.executiveSummary.split('\n\n')[0]}</p>
      <p>${commentary.executiveSummary.split('\n\n')[1] || ''}</p>
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">
        <strong>Action:</strong> ${commentary.summary.keyAction}
      </div>
    `;
  },

  /**
   * Show full analysis modal
   */
  showFullAnalysis(ticker) {
    const analysis = this.analysisCache?.[ticker];
    if (!analysis || !analysis.institutionalCommentary) {
      alert('Analysis not available. Please wait for analysis to complete.');
      return;
    }
    
    const report = analysis.institutionalCommentary;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background: var(--bg-surface); max-width: 800px; max-height: 90vh; overflow-y: auto; border-radius: 12px; padding: 24px; border: 1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;font-family:var(--font-ui);">${ticker} — Full Narrative Analysis</h2>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <pre style="white-space:pre-wrap;font-family:var(--font-narrative);font-size:0.85rem;line-height:1.7;color:var(--text-secondary);">${report.fullReport}</pre>
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    document.body.appendChild(modal);
  },

  /**
   * Show research vs market comparison modal
   */
  showNarrativeModal(ticker) {
    const analysis = this.analysisCache?.[ticker];
    if (!analysis) return;
    
    const weights = analysis.weights;
    const inference = analysis.inference;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
      <div style="background: var(--bg-surface); max-width: 600px; max-height: 90vh; overflow-y: auto; border-radius: 12px; padding: 24px; border: 1px solid var(--border);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
          <h2 style="margin:0;font-family:var(--font-ui);">${ticker} — Research vs Market</h2>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;color:var(--text-muted);font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        
        <div style="margin-bottom:20px;">
          <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">Market-Implied Primary Narrative</div>
          <div style="font-size:1.1rem;font-weight:600;color:var(--accent-teal);">${inference.primaryHypothesis} (${(inference.confidence * 100).toFixed(0)}% confidence)</div>
        </div>
        
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
          <thead>
            <tr style="border-bottom:1px solid var(--border);">
              <th style="text-align:left;padding:8px;">Hypothesis</th>
              <th style="text-align:center;padding:8px;">Research</th>
              <th style="text-align:center;padding:8px;">Market</th>
              <th style="text-align:center;padding:8px;">Blended</th>
              <th style="text-align:center;padding:8px;">Gap</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(weights).map(([tier, w]) => {
              const gap = Math.abs(w.longTerm - w.shortTerm);
              const gapColor = gap > 40 ? 'var(--signal-red)' : gap > 20 ? 'var(--signal-amber)' : 'var(--signal-green)';
              return `
                <tr style="border-bottom:1px solid var(--border-light);">
                  <td style="padding:8px;font-weight:600;">${tier}</td>
                  <td style="text-align:center;padding:8px;">${w.longTerm}%</td>
                  <td style="text-align:center;padding:8px;">${w.shortTerm}%</td>
                  <td style="text-align:center;padding:8px;font-weight:600;">${w.blended}%</td>
                  <td style="text-align:center;padding:8px;color:${gapColor};font-weight:600;">${gap}pt</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
        
        <div style="margin-top:20px;padding:12px;background:var(--bg-surface-alt);border-radius:6px;font-size:0.8rem;">
          <strong>Max Divergence:</strong> ${Math.max(...Object.values(weights).map(w => Math.abs(w.longTerm - w.shortTerm)))} points
          <br><strong>Urgency:</strong> ${analysis.commentary?.urgency || analysis.institutionalCommentary?.summary?.urgency || 'N/A'}
        </div>
      </div>
    `;
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
    
    document.body.appendChild(modal);
  },

  /**
   * Manually trigger analysis for a ticker
   */
  async refreshAnalysis(ticker) {
    console.log(`[NFI] Manually refreshing analysis for ${ticker}...`);
    const result = await this.analyzeStock(ticker);
    if (result) {
      console.log(`[NFI] Analysis refreshed for ${ticker}:`, result.dislocation.severity);
    }
    return result;
  },

  /**
   * Get current analysis for a ticker
   */
  getAnalysis(ticker) {
    return this.analysisCache?.[ticker];
  },

  /**
   * Check if analysis shows significant divergence
   */
  hasSignificantDivergence(ticker, threshold = 30) {
    const analysis = this.getAnalysis(ticker);
    if (!analysis) return false;
    
    return Object.values(analysis.weights).some(w => 
      Math.abs(w.longTerm - w.shortTerm) > threshold
    );
  }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => NarrativeFrameworkIntegration.init());
} else {
  // DOM already loaded
  NarrativeFrameworkIntegration.init();
}

// Expose globally
window.NarrativeFrameworkIntegration = NarrativeFrameworkIntegration;
window.NFI = NarrativeFrameworkIntegration; // Short alias

console.log('[NFI] Module loaded. Access via window.NarrativeFrameworkIntegration or window.NFI');
