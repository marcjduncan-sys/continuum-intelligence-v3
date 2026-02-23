// ============================================================
// SNAPSHOT GENERATOR v2.0
// Dynamically populates the snapshot grid with cards for all
// stocks in COVERAGE_UNIVERSE. Designed to run AFTER NFI and
// personalisation have finished processing so that narrative
// overlays, weight adjustments, and dislocation badges are
// reflected in the snapshot cards.
//
// Usage:
//   <script src="scripts/snapshot-generator.js"></script>
//   window.addEventListener('load', function() {
//     setTimeout(function() { initSnapshots('snapshot-container'); }, 1500);
//   });
//
// Dependencies:
//   - STOCK_DATA (global, from index.html)
//   - window._nfiAnalysisData (optional, from narrative-framework-integration.js)
//   - computeSkewScore(data) (index.html)
// ============================================================

(function(global) {
  'use strict';

  // Derive coverage universe from STOCK_DATA keys — always in sync with index.html
  // Falls back to a known list only if STOCK_DATA is unavailable at initialisation time
  var COVERAGE_UNIVERSE = (typeof STOCK_DATA !== 'undefined' && STOCK_DATA)
    ? Object.keys(STOCK_DATA).filter(function(k) {
        return k !== '_meta' && typeof STOCK_DATA[k] === 'object' && STOCK_DATA[k] !== null;
      })
    : [
        'BHP', 'CBA', 'CSL', 'DRO', 'DXS', 'FMG',
        'GMG', 'GYG', 'HRZ', 'MQG', 'NAB', 'OCL',
        'PME', 'RFG', 'RIO', 'SIG', 'WDS', 'WOR',
        'WOW', 'WTC', 'XRO'
      ];

  // ─── DATA EXTRACTION ────────────────────────────────────────

  /**
   * Extract snapshot data from STOCK_DATA for a given ticker.
   * Pulls verdict, hypotheses, evidence count, sector, and key metrics
   * directly from the in-memory STOCK_DATA object.
   */
  function extractFromStockData(ticker) {
    if (typeof STOCK_DATA === 'undefined' || !STOCK_DATA[ticker]) return null;
    var stock = STOCK_DATA[ticker];

    // Evidence domain count
    var evidenceCount = 0;
    if (stock.evidence && stock.evidence.cards) {
      evidenceCount = stock.evidence.cards.length;
    }

    // Verdict text (truncate for card display)
    var verdictText = '';
    if (stock.verdict && stock.verdict.text) {
      verdictText = stock.verdict.text;
      if (verdictText.length > 180) verdictText = verdictText.substring(0, 177) + '...';
    }

    // Hypothesis summary — top thesis direction and title
    var hypotheses = [];
    if (stock.hypotheses) {
      for (var i = 0; i < stock.hypotheses.length; i++) {
        var h = stock.hypotheses[i];
        hypotheses.push({
          tier: h.tier,
          title: h.title.replace(/^T\d+:\s*/, ''),
          direction: h.direction,
          score: parseInt(h.score) || 0,
          statusText: h.statusText
        });
      }
    }

    // Skew score
    var skew = null;
    if (typeof computeSkewScore === 'function') {
      skew = computeSkewScore(stock);
    }

    // BUGFIX_002: compute weighted overall sentiment (matches report page)
    var overallSentiment = null;
    if (typeof _computeOverallSentiment === 'function') {
      overallSentiment = _computeOverallSentiment(stock);
    }

    return {
      ticker: stock.ticker,
      tickerFull: stock.tickerFull,
      company: stock.company,
      sector: stock.sector,
      sectorSub: stock.sectorSub,
      price: stock.price,
      currency: stock.currency,
      date: stock.date,
      heroMetrics: stock.heroMetrics || [],
      verdictText: verdictText,
      verdictScores: stock.verdict ? stock.verdict.scores : [],
      hypotheses: hypotheses,
      evidenceCount: evidenceCount,
      skew: stock.skew,
      skewComputed: skew,
      overallSentiment: overallSentiment,
      hasTechnical: !!stock.technicalAnalysis,
      narrative: stock.narrative ? stock.narrative.theNarrative : ''
    };
  }

  /**
   * Get NFI analysis data for a ticker (if available).
   * NFI provides severity level, divergence score, and contradictions.
   */
  function getNFIData(ticker) {
    if (!global._nfiAnalysisData || !global._nfiAnalysisData.results) return null;
    var result = global._nfiAnalysisData.results[ticker];
    if (!result) return null;

    return {
      severity: result.dislocation ? result.dislocation.severity : 'NONE',
      severityScore: result.dislocation ? (result.dislocation.severityScore || 0) : 0,
      divergence: result.dislocation ? (result.dislocation.divergencePercent || 0) : 0,
      contradictions: result.inference ? (result.inference.contradictedHypothesis || null) : null,
      dominantThesis: result.inference ? (result.inference.dominantThesis || null) : null
    };
  }

  /**
   * Get live price if available from DOM (price-narrative-engine updates these).
   */
  function getLivePrice(ticker) {
    var el = document.querySelector('#page-report-' + ticker + ' .hero-price-value');
    if (el) {
      var text = el.textContent.replace(/[^0-9.]/g, '');
      var val = parseFloat(text);
      if (!isNaN(val) && val > 0) return val;
    }
    return null;
  }

  // ─── SEVERITY STYLING ───────────────────────────────────────

  var SEVERITY_CONFIG = {
    'CRITICAL': { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', label: 'CRITICAL', order: 0 },
    'HIGH':     { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)', label: 'HIGH', order: 1 },
    'MODERATE': { color: '#3b82f6', bg: 'rgba(59,130,246,0.05)', border: 'rgba(59,130,246,0.2)', label: 'MODERATE', order: 2 },
    'LOW':      { color: '#6b7280', bg: 'rgba(107,114,128,0.04)', border: 'rgba(107,114,128,0.15)', label: 'LOW', order: 3 },
    'NONE':     { color: '#9ca3af', bg: 'rgba(156,163,175,0.03)', border: 'rgba(156,163,175,0.1)', label: 'NONE', order: 4 }
  };

  function getSeverityConfig(severity) {
    return SEVERITY_CONFIG[severity] || SEVERITY_CONFIG['NONE'];
  }

  // ─── CARD RENDERING ─────────────────────────────────────────

  /**
   * Render a single snapshot card.
   * Card structure: header (ticker, company, sector), NFI badge,
   * verdict excerpt, hypothesis bars, evidence count, skew indicator.
   */
  function renderCard(data) {
    var stock = data.stock;
    var nfi = data.nfi;
    var livePrice = data.livePrice;

    var severity = nfi ? nfi.severity : 'NONE';
    var config = getSeverityConfig(severity);

    // Price display — prefer live price
    var displayPrice = livePrice || stock.price;
    var priceStr = stock.currency + displayPrice.toFixed(2);

    // NFI badge HTML
    var nfiBadgeHtml = '';
    if (nfi && severity !== 'NONE') {
      nfiBadgeHtml = '<span class="snap-nfi-badge" style="color:' + config.color + ';border-color:' + config.border + ';background:' + config.bg + '">' +
        config.label +
        (nfi.divergence ? ' (' + nfi.divergence.toFixed(0) + '% div.)' : '') +
      '</span>';
    }

    // Hypothesis mini-bars
    var hypBarsHtml = '';
    if (stock.hypotheses.length > 0) {
      // Normalise scores
      var totalScore = 0;
      for (var i = 0; i < stock.hypotheses.length; i++) totalScore += stock.hypotheses[i].score;
      if (totalScore === 0) totalScore = 1;

      hypBarsHtml = '<div class="snap-hyp-bars">';
      for (var i = 0; i < stock.hypotheses.length; i++) {
        var h = stock.hypotheses[i];
        var pct = Math.round(h.score / totalScore * 100);
        var barColor = h.direction === 'upside' ? 'var(--signal-green)' :
                       h.direction === 'downside' ? 'var(--signal-red)' : 'var(--signal-amber)';
        var titleShort = h.title.length > 25 ? h.title.substring(0, 22) + '...' : h.title;
        hypBarsHtml += '<div class="snap-hyp-bar-row">' +
          '<span class="snap-hyp-bar-label">D' + (i + 1) + '</span>' +
          '<div class="snap-hyp-bar-track"><div class="snap-hyp-bar-fill" style="width:' + pct + '%;background:' + barColor + '"></div></div>' +
          '<span class="snap-hyp-bar-pct">' + pct + '%</span>' +
        '</div>';
      }
      hypBarsHtml += '</div>';
    }

    // Skew indicator — BUGFIX_002: show overall sentiment (weighted), not raw skew score
    var skewHtml = '';
    if (stock.skewComputed) {
      var sc = stock.skewComputed;
      var displayScore = stock.overallSentiment !== null && stock.overallSentiment !== undefined
        ? stock.overallSentiment : sc.score;
      var skewCls = displayScore > 5 ? 'positive' : displayScore < -5 ? 'negative' : 'neutral';
      skewHtml = '<div class="snap-skew">' +
        '<div class="skew-bar-track" style="width:60px;height:5px">' +
          '<div class="skew-bar-bull" style="width:' + sc.bull + '%"></div>' +
          '<div class="skew-bar-bear" style="width:' + sc.bear + '%"></div>' +
        '</div>' +
        '<span class="skew-score ' + skewCls + '" style="font-size:0.65rem">' + (displayScore > 0 ? '+' : '') + displayScore + '</span>' +
      '</div>';
    }

    // Evidence coverage badge
    var evBadgeCls = stock.evidenceCount >= 10 ? 'snap-ev-full' :
                     stock.evidenceCount >= 7 ? 'snap-ev-good' : 'snap-ev-partial';

    // Key metrics (top 3)
    var metricsHtml = '';
    var metrics = stock.heroMetrics.slice(0, 3);
    for (var m = 0; m < metrics.length; m++) {
      var cls = metrics[m].colorClass ? ' snap-metric-' + metrics[m].colorClass : '';
      metricsHtml += '<span class="snap-metric' + cls + '">' + metrics[m].label + ': ' + metrics[m].value + '</span>';
    }

    return '<div class="snap-card" data-ticker="' + stock.ticker + '" data-sector="' + stock.sector + '" data-severity="' + (nfi ? nfi.severityScore : 0) + '" ' +
           'style="border-left-color:' + config.color + '" onclick="navigateToReport(\'' + stock.ticker + '\')">' +
      '<div class="snap-header">' +
        '<div class="snap-header-left">' +
          '<div class="snap-ticker">' + stock.tickerFull + '</div>' +
          '<div class="snap-company">' + stock.company + '</div>' +
          '<div class="snap-sector">' + stock.sector + ' &bull; ' + stock.sectorSub + '</div>' +
        '</div>' +
        '<div class="snap-header-right">' +
          '<div class="snap-price">' + priceStr + '</div>' +
          nfiBadgeHtml +
        '</div>' +
      '</div>' +
      '<div class="snap-body">' +
        '<div class="snap-verdict">' + stock.verdictText + '</div>' +
        '<div class="snap-metrics">' + metricsHtml + '</div>' +
        hypBarsHtml +
      '</div>' +
      '<div class="snap-card-footer">' +
        '<span class="snap-ev-badge ' + evBadgeCls + '">' + stock.evidenceCount + '/10 domains</span>' +
        (stock.hasTechnical ? '<span class="snap-tech-badge">&#9679; Technical</span>' : '') +
        skewHtml +
      '</div>' +
    '</div>';
  }

  // ─── SORT & GRID ────────────────────────────────────────────

  /**
   * Generate all snapshot cards with sort controls.
   * Collects data for all stocks in COVERAGE_UNIVERSE,
   * sorts by selected criteria, and renders into the grid.
   */
  function generateSnapshotCards(containerId, sortBy) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // Collect card data
    var cardData = [];
    for (var i = 0; i < COVERAGE_UNIVERSE.length; i++) {
      var ticker = COVERAGE_UNIVERSE[i];
      var stock = extractFromStockData(ticker);
      if (!stock) continue;

      var nfi = getNFIData(ticker);
      var livePrice = getLivePrice(ticker);

      cardData.push({
        stock: stock,
        nfi: nfi,
        livePrice: livePrice
      });
    }

    // Sort
    sortBy = sortBy || 'severity';
    if (sortBy === 'severity') {
      cardData.sort(function(a, b) {
        var sa = a.nfi ? a.nfi.severityScore : 0;
        var sb = b.nfi ? b.nfi.severityScore : 0;
        return sb - sa; // Highest severity first
      });
    } else if (sortBy === 'ticker') {
      cardData.sort(function(a, b) {
        return a.stock.ticker.localeCompare(b.stock.ticker);
      });
    } else if (sortBy === 'sector') {
      cardData.sort(function(a, b) {
        var sc = a.stock.sector.localeCompare(b.stock.sector);
        return sc !== 0 ? sc : a.stock.ticker.localeCompare(b.stock.ticker);
      });
    }

    // Render
    var gridEl = container.querySelector('.snap-grid');
    if (!gridEl) return;
    gridEl.innerHTML = '';

    for (var j = 0; j < cardData.length; j++) {
      gridEl.innerHTML += renderCard(cardData[j]);
    }

    console.log('[SnapshotGenerator] Rendered ' + cardData.length + ' snapshot cards (sorted by ' + sortBy + ')');
  }

  // ─── NAVIGATION ─────────────────────────────────────────────

  /**
   * Navigate to a stock's report page.
   */
  global.navigateToReport = function(ticker) {
    if (typeof navigate === 'function') {
      navigate('report-' + ticker);
    } else {
      window.location.hash = '#report-' + ticker;
    }
  };

  // ─── CSS INJECTION ──────────────────────────────────────────

  function injectSnapshotStyles() {
    if (document.getElementById('snapshot-gen-styles')) return;

    var css = '' +
      '.snap-sort-controls { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }' +
      '.snap-sort-btn { padding:6px 14px; border-radius:6px; border:1px solid var(--border-subtle, rgba(255,255,255,0.08)); ' +
        'background:var(--bg-tertiary, rgba(255,255,255,0.03)); color:var(--text-secondary, #9ca3af); font-size:0.75rem; ' +
        'cursor:pointer; transition:all 0.2s; text-transform:uppercase; letter-spacing:0.5px; font-weight:500; }' +
      '.snap-sort-btn:hover { border-color:var(--border-medium, rgba(255,255,255,0.15)); color:var(--text-primary, #e5e7eb); }' +
      '.snap-sort-btn.active { background:rgba(59,130,246,0.12); border-color:rgba(59,130,246,0.3); color:#60a5fa; }' +
      '.snap-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(380px, 1fr)); gap:16px; }' +
      '.snap-card { background:var(--bg-card, rgba(255,255,255,0.02)); border:1px solid var(--border-subtle, rgba(255,255,255,0.06)); ' +
        'border-left:3px solid #6b7280; border-radius:8px; padding:16px; cursor:pointer; transition:all 0.2s; }' +
      '.snap-card:hover { border-color:var(--border-medium, rgba(255,255,255,0.15)); transform:translateY(-1px); ' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.15); }' +
      '.snap-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px; }' +
      '.snap-header-left { flex:1; min-width:0; }' +
      '.snap-header-right { text-align:right; flex-shrink:0; margin-left:12px; }' +
      '.snap-ticker { font-size:0.95rem; font-weight:700; color:var(--text-primary, #e5e7eb); letter-spacing:0.3px; }' +
      '.snap-company { font-size:0.75rem; color:var(--text-secondary, #9ca3af); margin-top:2px; }' +
      '.snap-sector { font-size:0.65rem; color:var(--text-muted, #6b7280); margin-top:2px; }' +
      '.snap-price { font-size:0.9rem; font-weight:600; color:var(--text-primary, #e5e7eb); font-variant-numeric:tabular-nums; }' +
      '.snap-nfi-badge { display:inline-block; padding:2px 8px; border-radius:4px; font-size:0.6rem; font-weight:600; ' +
        'letter-spacing:0.5px; margin-top:4px; border:1px solid; }' +
      '.snap-body { margin-bottom:12px; }' +
      '.snap-verdict { font-size:0.7rem; color:var(--text-secondary, #9ca3af); line-height:1.5; margin-bottom:8px; }' +
      '.snap-metrics { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px; }' +
      '.snap-metric { font-size:0.65rem; color:var(--text-muted, #6b7280); padding:2px 6px; ' +
        'background:rgba(255,255,255,0.03); border-radius:3px; }' +
      '.snap-metric-premium { color:#f59e0b; }' +
      '.snap-metric-negative { color:#ef4444; }' +
      '.snap-metric-positive { color:#10b981; }' +
      '.snap-hyp-bars { margin-top:8px; }' +
      '.snap-hyp-bar-row { display:flex; align-items:center; gap:6px; margin-bottom:3px; }' +
      '.snap-hyp-bar-label { font-size:0.6rem; color:var(--text-muted, #6b7280); width:18px; flex-shrink:0; font-weight:600; }' +
      '.snap-hyp-bar-track { flex:1; min-width:0; height:6px; background:rgba(255,255,255,0.07); border-radius:3px; overflow:hidden; }' +
      '.snap-hyp-bar-fill { height:100%; border-radius:3px; transition:width 0.3s; }' +
      '.snap-hyp-bar-pct { font-size:0.6rem; color:var(--text-muted, #6b7280); width:28px; text-align:right; flex-shrink:0; font-variant-numeric:tabular-nums; }' +
      '.snap-card-footer { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-top:10px; margin-top:4px; ' +
        'border-top:1px solid var(--border-subtle, rgba(255,255,255,0.06)); }' +
      '.snap-ev-badge { font-size:0.6rem; padding:2px 8px; border-radius:3px; font-weight:500; }' +
      '.snap-ev-full { background:rgba(16,185,129,0.1); color:#10b981; }' +
      '.snap-ev-good { background:rgba(245,158,11,0.1); color:#f59e0b; }' +
      '.snap-ev-partial { background:rgba(239,68,68,0.08); color:#ef4444; }' +
      '.snap-tech-badge { font-size:0.6rem; color:var(--text-muted, #6b7280); }' +
      '.snap-skew { display:flex; align-items:center; gap:4px; margin-left:auto; }' +
      '@media (max-width: 480px) { .snap-grid { grid-template-columns:1fr; } }' +
    '';

    var style = document.createElement('style');
    style.id = 'snapshot-gen-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ─── INITIALIZATION ─────────────────────────────────────────

  /**
   * Initialise the snapshot grid.
   * Creates sort controls and grid container inside the target element,
   * then populates with snapshot cards.
   *
   * @param {string} containerId - DOM id of the snapshot container
   */
  function initSnapshots(containerId) {
    console.log('[SnapshotGenerator] Initialising snapshots for #' + containerId + '...');

    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[SnapshotGenerator] Container #' + containerId + ' not found');
      return;
    }

    // Inject CSS
    injectSnapshotStyles();

    // Build sort controls + grid container
    container.innerHTML = '' +
      '<div class="snap-sort-controls">' +
        '<button class="snap-sort-btn active" data-sort="severity">&#9650; Severity</button>' +
        '<button class="snap-sort-btn" data-sort="ticker">A-Z Ticker</button>' +
        '<button class="snap-sort-btn" data-sort="sector">Sector</button>' +
      '</div>' +
      '<div class="snap-grid"></div>';

    // Wire sort buttons
    var buttons = container.querySelectorAll('.snap-sort-btn');
    for (var b = 0; b < buttons.length; b++) {
      buttons[b].addEventListener('click', function(e) {
        var sortBy = this.getAttribute('data-sort');
        // Update active state
        var allBtns = container.querySelectorAll('.snap-sort-btn');
        for (var k = 0; k < allBtns.length; k++) allBtns[k].classList.remove('active');
        this.classList.add('active');
        // Re-render
        generateSnapshotCards(containerId, sortBy);
      });
    }

    // Render cards (default sort: severity)
    generateSnapshotCards(containerId, 'severity');

    console.log('[SnapshotGenerator] Initialisation complete (' + COVERAGE_UNIVERSE.length + ' stocks)');
  }

  // Expose to global scope
  global.initSnapshots = initSnapshots;
  global.refreshSnapshotData = function() {
    // Compatibility with any code that calls refreshSnapshotData
    if (typeof SNAPSHOT_ORDER !== 'undefined' && typeof STOCK_DATA !== 'undefined' && typeof buildSnapshotFromStock === 'function') {
      for (var i = 0; i < SNAPSHOT_ORDER.length; i++) {
        var ticker = SNAPSHOT_ORDER[i];
        if (STOCK_DATA[ticker]) {
          SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
        }
      }
    }
  };

})(typeof window !== 'undefined' ? window : this);
