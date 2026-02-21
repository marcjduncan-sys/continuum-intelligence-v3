/**
 * Alert System — js/alerts.js
 *
 * Detects narrative state changes per-stock and fires in-browser toast
 * notifications. Persists alert history to localStorage.
 *
 * Toast: bottom-right, 5s auto-dismiss, coloured by type (FLIP/ALERT/info)
 * Drawer: bell icon in nav, lists last 50 alerts with relative timestamps
 * Badge: unread count on bell icon, clears on drawer open
 *
 * Usage:
 *   window.CI_Alerts.check(stock)  — call after each price update
 *   window.CI_Alerts.toast(msg, type) — manual toast
 */

(function () {
  'use strict';

  var HISTORY_KEY = 'ci_alert_history';
  var STATE_KEY   = 'ci_alert_state_cache';
  var MAX_HISTORY = 50;

  var _drawerOpen  = false;
  var _unreadCount = 0;
  var _badge = null;
  var _releaseTrap = null;
  var _triggerEl = null;

  // ─── Focus trap utility ──────────────────────────────────────────────────────

  function trapFocus(modalEl) {
    var focusable = modalEl.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (first) first.focus();
    function onKeyDown(e) {
      if (e.key !== 'Tab') return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modalEl.addEventListener('keydown', onKeyDown);
    return function releaseTrap() { modalEl.removeEventListener('keydown', onKeyDown); };
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────────

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (_e) { return []; }
  }

  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-MAX_HISTORY))); }
    catch (_e) {}
  }

  function loadStateCache() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }
    catch (_e) { return {}; }
  }

  function saveStateCache(c) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(c)); }
    catch (_e) {}
  }

  // ─── Badge ───────────────────────────────────────────────────────────────────

  function updateBadge() {
    if (!_badge) return;
    if (_unreadCount > 0) {
      _badge.textContent = _unreadCount > 9 ? '9+' : String(_unreadCount);
      _badge.style.display = '';
    } else {
      _badge.style.display = 'none';
    }
  }

  // ─── Toast ───────────────────────────────────────────────────────────────────

  function getToastContainer() {
    var el = document.getElementById('ci-toast-container');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ci-toast-container';
      el.className = 'ci-toast-container';
      document.body.appendChild(el);
    }
    return el;
  }

  function showToast(message, type) {
    var container = getToastContainer();
    var toast = document.createElement('div');
    toast.className = 'ci-toast ci-toast-' + (type || 'info');
    toast.innerHTML =
      '<div class="ci-toast-msg">' + message + '</div>' +
      '<button class="ci-toast-close" aria-label="Dismiss">&times;</button>';
    toast.querySelector('.ci-toast-close').addEventListener('click', function () {
      dismiss(toast);
    });
    container.appendChild(toast);
    requestAnimationFrame(function () { toast.classList.add('ci-toast-visible'); });
    setTimeout(function () { dismiss(toast); }, 5000);
  }

  function dismiss(toast) {
    toast.classList.remove('ci-toast-visible');
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 300);
  }

  // ─── Alert Drawer ────────────────────────────────────────────────────────────

  function getOrCreateDrawer() {
    var el = document.getElementById('ci-alerts-drawer');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'ci-alerts-drawer';
    el.className = 'ci-alerts-drawer';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Alert history');
    el.innerHTML =
      '<div class="ci-alerts-header">' +
        '<div class="ci-alerts-title">Alerts</div>' +
        '<button class="ci-alerts-close" aria-label="Close alerts">&times;</button>' +
      '</div>' +
      '<div class="ci-alerts-body" id="ci-alerts-body"></div>';
    el.querySelector('.ci-alerts-close').addEventListener('click', closeDrawer);
    document.body.appendChild(el);
    return el;
  }

  function openDrawer() {
    var drawer = getOrCreateDrawer();
    _triggerEl = document.activeElement;
    _drawerOpen = true;
    drawer.classList.add('ci-alerts-drawer-open');
    _unreadCount = 0;
    updateBadge();
    renderDrawer(drawer.querySelector('#ci-alerts-body'));
    if (_releaseTrap) { _releaseTrap(); _releaseTrap = null; }
    _releaseTrap = trapFocus(drawer);
  }

  function closeDrawer() {
    var drawer = document.getElementById('ci-alerts-drawer');
    if (!drawer) return;
    _drawerOpen = false;
    drawer.classList.remove('ci-alerts-drawer-open');
    if (_releaseTrap) { _releaseTrap(); _releaseTrap = null; }
    if (_triggerEl && typeof _triggerEl.focus === 'function') {
      _triggerEl.focus();
      _triggerEl = null;
    }
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function relTime(ts) {
    var diff = Date.now() - new Date(ts).getTime();
    var m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    var h = Math.round(m / 60);
    if (h < 24) return h + 'h ago';
    return Math.round(h / 24) + 'd ago';
  }

  function renderDrawer(body) {
    if (!body) return;
    var history = loadHistory();
    if (history.length === 0) {
      body.innerHTML =
        '<div class="ci-alerts-empty">No alerts yet. Alerts fire when narrative states change.</div>';
      return;
    }
    var html = '';
    for (var i = history.length - 1; i >= 0; i--) {
      var a = history[i];
      var cls = a.type === 'FLIP'  ? 'ci-alert-flip' :
                a.type === 'ALERT' ? 'ci-alert-alert' : 'ci-alert-info';
      html +=
        '<div class="ci-alert-item ' + cls + '">' +
          '<div class="ci-alert-item-top">' +
            '<span class="ci-alert-ticker">' + esc(a.ticker) + '</span>' +
            '<span class="ci-alert-time">' + esc(relTime(a.ts)) + '</span>' +
          '</div>' +
          '<div class="ci-alert-msg">' + esc(a.message) + '</div>' +
        '</div>';
    }
    body.innerHTML = html;
  }

  // ─── State change detection ───────────────────────────────────────────────────

  function checkStock(stock) {
    if (!stock || !stock.ticker) return;
    var ticker = stock.ticker.replace('.AX', '');
    var newDominant   = stock.dominant || '';
    var newAlertState = stock.alert_state || 'NORMAL';

    var cache = loadStateCache();
    var prev  = cache[ticker];

    if (!prev) {
      // Seed on first encounter — no alert fired
      cache[ticker] = { dominant: newDominant, alertState: newAlertState };
      saveStateCache(cache);
      return;
    }

    var type = '', message = '';

    if (newAlertState !== prev.alertState) {
      if (newAlertState === 'FLIP') {
        type = 'FLIP';
        message = ticker + ' narrative flipped: ' + prev.dominant + ' \u2192 ' + newDominant;
      } else if (newAlertState === 'ALERT') {
        type = 'ALERT';
        message = ticker + ' under narrative pressure — alternative gaining strength';
      } else {
        type = 'info';
        message = ticker + ' returned to NORMAL narrative state';
      }
    } else if (newDominant !== prev.dominant) {
      type = 'FLIP';
      message = ticker + ' dominant narrative: ' + prev.dominant + ' \u2192 ' + newDominant;
    }

    if (!type) return; // no change

    var entry = { ticker: ticker, message: message, type: type, ts: new Date().toISOString() };
    var history = loadHistory();
    history.push(entry);
    saveHistory(history);

    cache[ticker] = { dominant: newDominant, alertState: newAlertState };
    saveStateCache(cache);

    _unreadCount++;
    updateBadge();

    showToast('<strong>' + esc(ticker) + '</strong> &mdash; ' + esc(message), type);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Continuum Intelligence', { body: message, tag: 'ci-' + ticker });
    }
  }

  // ─── Nav button (bell icon) ───────────────────────────────────────────────────

  function injectNavButton() {
    var actions = document.querySelector('.nav-actions');
    if (!actions || document.getElementById('ci-alerts-btn')) return;

    var btn = document.createElement('button');
    btn.id = 'ci-alerts-btn';
    btn.className = 'ci-nav-btn';
    btn.setAttribute('aria-label', 'Open alerts');
    btn.setAttribute('title', 'Alerts');
    btn.style.position = 'relative';
    // Bell icon
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" width="18" height="18" aria-hidden="true">' +
        '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>' +
        '<path d="M13.73 21a2 2 0 0 1-3.46 0"/>' +
      '</svg>' +
      '<span id="ci-alerts-badge" class="ci-alerts-badge" style="display:none">0</span>';

    btn.addEventListener('click', function () {
      if (_drawerOpen) closeDrawer(); else openDrawer();
    });

    // Place before portfolio btn (if present) or before theme toggle
    var portfolioBtn  = document.getElementById('ci-portfolio-btn');
    var themeToggle   = actions.querySelector('.theme-toggle');
    var insertBefore  = portfolioBtn || themeToggle;
    if (insertBefore) actions.insertBefore(btn, insertBefore);
    else actions.prepend(btn);

    _badge = document.getElementById('ci-alerts-badge');

    // Politely request browser notification permission
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  // Escape key closes drawer
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && _drawerOpen) closeDrawer();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNavButton);
  } else {
    injectNavButton();
  }

  window.CI_Alerts = { check: checkStock, toast: showToast };
})();
