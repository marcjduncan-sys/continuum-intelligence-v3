/**
 * Portfolio Overlay — js/portfolio.js
 *
 * Slide-in panel showing current holdings with live narrative state.
 * Opens with keyboard shortcut 'P' or the briefcase button in the nav.
 *
 * Reads:
 *   - continuum_personalisation_profile (localStorage) for holdings
 *   - window.STOCK_DATA or DataService.getAllStocks() for narrative state
 *   - window.FRESHNESS_DATA for price drift since last research review
 *
 * Sort order: FLIP → ALERT → high urgency → NORMAL
 */

/* global DataService, STOCK_DATA, FRESHNESS_DATA */

(function () {
  'use strict';

  var STORAGE_KEY = 'continuum_personalisation_profile';
  var _overlay = null;
  var _backdrop = null;
  var _isOpen = false;
  var _allStocks = null;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function getHoldings() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.state) return null;
      if (data.state.portfolioSkipped) return [];
      return (data.state.portfolio || []).filter(function (h) {
        return h && h.ticker && h.ticker.trim() !== '';
      });
    } catch (_e) {
      return null;
    }
  }

  async function loadAllStocks() {
    if (_allStocks) return _allStocks;
    if (typeof DataService !== 'undefined') {
      _allStocks = await DataService.getAllStocks();
    } else if (typeof STOCK_DATA !== 'undefined') {
      _allStocks = STOCK_DATA;
    } else {
      _allStocks = {};
    }
    return _allStocks;
  }

  function getFreshness(ticker) {
    if (typeof FRESHNESS_DATA !== 'undefined' && FRESHNESS_DATA) {
      return FRESHNESS_DATA[ticker] || null;
    }
    return null;
  }

  function alertSortKey(stock, fd) {
    var state = stock ? (stock.alert_state || 'NORMAL') : 'NORMAL';
    if (state === 'FLIP') return 0;
    if (state === 'ALERT') return 1;
    if (fd && (fd.urgency || 0) >= 70) return 2;
    return 3;
  }

  // ─── DOM Construction ────────────────────────────────────────────────────────

  function createOverlay() {
    var div = document.createElement('div');
    div.id = 'ci-portfolio-overlay';
    div.className = 'ci-portfolio-overlay';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-label', 'Portfolio overview');
    div.innerHTML =
      '<div class="ci-portfolio-header">' +
        '<div class="ci-portfolio-title">Portfolio</div>' +
        '<button class="ci-portfolio-close" id="ci-portfolio-close" aria-label="Close">&times;</button>' +
      '</div>' +
      '<div class="ci-portfolio-body" id="ci-portfolio-body">' +
        '<div class="ci-port-loading">Loading&hellip;</div>' +
      '</div>';
    document.body.appendChild(div);
    div.querySelector('#ci-portfolio-close').addEventListener('click', close);

    var bd = document.createElement('div');
    bd.id = 'ci-portfolio-backdrop';
    bd.className = 'ci-portfolio-backdrop';
    bd.addEventListener('click', close);
    document.body.appendChild(bd);

    _overlay = div;
    _backdrop = bd;
  }

  async function renderBody() {
    var body = document.getElementById('ci-portfolio-body');
    if (!body) return;

    var holdings = getHoldings();

    if (holdings === null) {
      body.innerHTML =
        '<div class="ci-port-empty">' +
          '<p>No profile configured.</p>' +
          '<p>Complete the <strong>Profile</strong> wizard to track your positions here.</p>' +
        '</div>';
      return;
    }

    if (holdings.length === 0) {
      body.innerHTML =
        '<div class="ci-port-empty">' +
          '<p>No holdings entered.</p>' +
          '<p>Edit your <strong>Profile</strong> to add positions.</p>' +
        '</div>';
      return;
    }

    var stocks = await loadAllStocks();

    var rows = holdings.map(function (h) {
      var t = h.ticker.replace('.AX', '').toUpperCase();
      return { h: h, ticker: t, stock: stocks[t] || null, fd: getFreshness(t) };
    });

    rows.sort(function (a, b) {
      return alertSortKey(a.stock, a.fd) - alertSortKey(b.stock, b.fd);
    });

    var html = rows.map(function (row) {
      var stock = row.stock;
      var fd = row.fd;
      var ticker = row.ticker;
      var weight = row.h.weight ? row.h.weight + '%' : '';

      if (!stock) {
        return '<div class="ci-port-row ci-port-row-missing">' +
          '<span class="ci-port-ticker">' + esc(ticker) + '</span>' +
          '<span class="ci-port-meta">Data unavailable</span>' +
          '</div>';
      }

      var alertState = stock.alert_state || 'NORMAL';
      var dominant = stock.dominant || 'T1';
      var hyp = stock.hypotheses && stock.hypotheses[dominant];
      var survivalPct = hyp ? Math.round((hyp.survival_score || 0) * 100) : 0;
      var label = hyp ? (hyp.label || dominant) : dominant;

      var badgeCls = alertState === 'FLIP' ? 'ci-badge-flip' :
                     alertState === 'ALERT' ? 'ci-badge-alert' : 'ci-badge-normal';

      var driftHtml = '';
      if (fd && fd.pricePctChange != null && Math.abs(fd.pricePctChange) >= 0.005) {
        var sign = fd.pricePctChange >= 0 ? '+' : '';
        var driftCls = fd.pricePctChange >= 0 ? 'ci-drift-up' : 'ci-drift-down';
        driftHtml = ' <span class="ci-port-drift ' + driftCls + '">' +
          sign + (fd.pricePctChange * 100).toFixed(1) + '%</span>';
      }

      var href = 'stock.html?ticker=' + encodeURIComponent(ticker + '.AX');

      return '<a class="ci-port-row" href="' + href + '">' +
        '<div class="ci-port-top">' +
          '<span class="ci-port-ticker">' + esc(ticker) + '</span>' +
          '<span class="ci-port-badge ' + badgeCls + '">' + esc(alertState) + '</span>' +
          (weight ? '<span class="ci-port-weight">' + esc(weight) + '</span>' : '') +
        '</div>' +
        '<div class="ci-port-bottom">' +
          '<span class="ci-port-hyp">' + esc(dominant) + ' &middot; ' + esc(label) + '</span>' +
          '<span class="ci-port-score">' + survivalPct + '%' + driftHtml + '</span>' +
        '</div>' +
      '</a>';
    }).join('');

    body.innerHTML = html;
  }

  // ─── Open / Close ────────────────────────────────────────────────────────────

  function open() {
    if (!_overlay) createOverlay();
    _isOpen = true;
    _overlay.classList.add('ci-portfolio-open');
    _backdrop.classList.add('ci-portfolio-backdrop-open');
    _allStocks = null; // refresh on each open
    renderBody();
  }

  function close() {
    _isOpen = false;
    if (_overlay) _overlay.classList.remove('ci-portfolio-open');
    if (_backdrop) _backdrop.classList.remove('ci-portfolio-backdrop-open');
  }

  function toggle() { if (_isOpen) close(); else open(); }

  // ─── Keyboard shortcut ────────────────────────────────────────────────────────

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'p' || e.key === 'P') toggle();
    if (e.key === 'Escape' && _isOpen) close();
  });

  // ─── Nav button ───────────────────────────────────────────────────────────────

  function injectNavButton() {
    var actions = document.querySelector('.nav-actions');
    if (!actions || document.getElementById('ci-portfolio-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'ci-portfolio-btn';
    btn.className = 'ci-nav-btn';
    btn.setAttribute('aria-label', 'Portfolio (P)');
    btn.setAttribute('title', 'Portfolio (P)');
    // Briefcase icon
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">' +
        '<rect x="2" y="7" width="20" height="14" rx="2"/>' +
        '<path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>' +
      '</svg>';
    btn.addEventListener('click', toggle);

    var themeToggle = actions.querySelector('.theme-toggle');
    if (themeToggle) actions.insertBefore(btn, themeToggle);
    else actions.prepend(btn);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavButton);
  } else {
    injectNavButton();
  }

  window.CI_Portfolio = { open: open, close: close, toggle: toggle };
})();
