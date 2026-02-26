// ============================================================
// ROUTER.JS -- Hash-based SPA router extracted from index.html
// Handles navigation, route validation, lazy rendering,
// and accessibility announcements.
// ============================================================

import { STOCK_DATA, SNAPSHOT_DATA } from './state.js';
import { VALID_STATIC_PAGES } from './state.js';
import { announcePageChange } from './dom.js';

// --- Router state ---
const renderedPages = new Set();
const renderedSnapshots = new Set();

// Page renderer callbacks -- wired in during integration (Phase 6)
let _pageRenderers = {};

/**
 * Navigate to a page by setting the location hash
 * @param {string} page
 */
export function navigate(page) {
  window.location.hash = page;
}

/**
 * Initialise the router with page renderer callbacks.
 * @param {object} pageRenderers - Object with renderer functions:
 *   { renderReportPage, renderSnapshotPage, renderPersonalisationPage,
 *     loadFullResearchData, buildSnapshotFromStock, setupScrollSpy,
 *     populateSidebar, initInlineChat, applyNarrativeAnalysis,
 *     initNarrativeTimelineChart, fetchAndPatchLive, initPersonalisationDemo,
 *     pnOnRouteEnter, renderPDFDownload }
 */
export function initRouter(pageRenderers) {
  _pageRenderers = pageRenderers || {};

  // Listen for hash changes
  window.addEventListener('hashchange', function() {
    route();
    // Announce the page change
    var hash = window.location.hash.slice(1) || 'home';
    var pageName = hash;
    if (hash.startsWith('report-')) {
      var t = hash.replace('report-', '');
      pageName = STOCK_DATA[t] ? STOCK_DATA[t].company + ' Research Report' : t + ' Report';
    } else if (hash.startsWith('snapshot-')) {
      pageName = hash.replace('snapshot-', '') + ' Snapshot';
    } else {
      var names = { home: 'Research Home', snapshots: 'Investment Snapshots', portfolio: 'Portfolio Intelligence', thesis: 'Investment Thesis Comparator', personalisation: 'Personalisation', about: 'About' };
      pageName = names[hash] || hash;
    }
    announcePageChange('Navigated to ' + pageName);
  });

  // Run initial route
  route();
}

/**
 * Main router function -- parses hash and shows the appropriate page.
 * Handles lazy rendering of report, snapshot, and personalisation pages.
 */
export function route() {
  const hash = window.location.hash.slice(1) || 'home';
  const pages = document.querySelectorAll('.page');
  pages.forEach(p => p.classList.remove('active'));

  // Validate hash against allowlist before DOM construction (S5 security fix)
  var isValidRoute = VALID_STATIC_PAGES.has(hash);
  if (!isValidRoute && hash.startsWith('report-')) {
    var ticker = hash.replace('report-', '');
    isValidRoute = typeof STOCK_DATA !== 'undefined' && STOCK_DATA.hasOwnProperty(ticker);
  }
  if (!isValidRoute && hash.startsWith('snapshot-')) {
    var snapTicker = hash.replace('snapshot-', '');
    // Accept if snapshot exists OR if stock data exists (snapshot will be built on demand)
    isValidRoute = (typeof SNAPSHOT_DATA !== 'undefined' && SNAPSHOT_DATA.hasOwnProperty(snapTicker)) ||
                   (typeof STOCK_DATA !== 'undefined' && STOCK_DATA.hasOwnProperty(snapTicker));
  }
  if (!isValidRoute) {
    // Invalid route -- fall back to home
    document.getElementById('page-home').classList.add('active');
    window.scrollTo(0, 0);
    return;
  }

  // Auto-create page divs for dynamically added stocks (safe -- validated above)
  if ((hash.startsWith('report-') || hash.startsWith('snapshot-')) && !document.getElementById('page-' + hash)) {
    const div = document.createElement('div');
    div.className = 'page';
    div.id = 'page-' + hash;
    document.getElementById('page-home').parentNode.appendChild(div);
  }

  // Lazy render report pages on first visit
  if (hash.startsWith('report-')) {
    const ticker = hash.replace('report-', '');
    if (!renderedPages.has(ticker) && STOCK_DATA[ticker]) {
      const container = document.getElementById('page-' + hash);
      if (container) {
        // Show loading state
        if (STOCK_DATA[ticker]._indexOnly) {
          container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Loading Research Data&hellip;</div><div style="font-size:0.9rem">Fetching full report for ' + STOCK_DATA[ticker].company + '</div></div></div>';
          if (_pageRenderers.loadFullResearchData) {
            _pageRenderers.loadFullResearchData(ticker, function(data) {
              if (data) {
                if (_pageRenderers.renderReportPage) {
                  container.innerHTML = _pageRenderers.renderReportPage(data);
                }
                renderedPages.add(ticker);
                if (_pageRenderers.setupScrollSpy) _pageRenderers.setupScrollSpy('page-' + hash);
                if (_pageRenderers.populateSidebar) _pageRenderers.populateSidebar(ticker);
                if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
                if (typeof window.applyNarrativeAnalysis === 'function') window.applyNarrativeAnalysis(ticker);
                if (_pageRenderers.initNarrativeTimelineChart) _pageRenderers.initNarrativeTimelineChart(ticker);
                if (_pageRenderers.fetchAndPatchLive) _pageRenderers.fetchAndPatchLive(ticker);
              }
            });
          }
        } else {
          if (_pageRenderers.renderReportPage) {
            container.innerHTML = _pageRenderers.renderReportPage(STOCK_DATA[ticker]);
          }
          renderedPages.add(ticker);
          if (_pageRenderers.setupScrollSpy) _pageRenderers.setupScrollSpy('page-' + hash);
          if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
          if (_pageRenderers.initNarrativeTimelineChart) _pageRenderers.initNarrativeTimelineChart(ticker);
        }
      }
    }
    // Apply narrative analysis (alerts, ST/LT weights, market-responsive narrative)
    if (typeof window.applyNarrativeAnalysis === 'function') {
      window.applyNarrativeAnalysis(ticker);
    }
    // Fetch live data asynchronously and update chart + hero price
    if (STOCK_DATA[ticker] && _pageRenderers.fetchAndPatchLive) {
      _pageRenderers.fetchAndPatchLive(ticker);
    }
  }

  // Lazy render personalisation page on first visit
  if (hash === 'personalisation' && !renderedPages.has('_personalisation')) {
    var pnContainer = document.getElementById('page-personalisation');
    if (pnContainer && _pageRenderers.renderPersonalisationPage) {
      pnContainer.innerHTML = _pageRenderers.renderPersonalisationPage();
      if (_pageRenderers.initPersonalisationDemo) _pageRenderers.initPersonalisationDemo();
      renderedPages.add('_personalisation');
    }
  }
  if (hash === 'personalisation' && renderedPages.has('_personalisation')) {
    if (typeof window.pnOnRouteEnter === 'function') window.pnOnRouteEnter();
  }

  // Lazy render snapshot pages on first visit
  if (hash.startsWith('snapshot-')) {
    const ticker = hash.replace('snapshot-', '');
    if (!renderedSnapshots.has(ticker)) {
      const container = document.getElementById('page-' + hash);
      if (container) {
        // If snapshot data already exists, render immediately
        if (SNAPSHOT_DATA[ticker]) {
          if (_pageRenderers.renderSnapshotPage) {
            container.innerHTML = _pageRenderers.renderSnapshotPage(SNAPSHOT_DATA[ticker]);
          }
          renderedSnapshots.add(ticker);
        } else if (STOCK_DATA[ticker]) {
          // Need to load full research data first, then build snapshot
          container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Loading Snapshot&hellip;</div><div style="font-size:0.9rem">Fetching data for ' + STOCK_DATA[ticker].company + '</div></div></div>';
          if (_pageRenderers.loadFullResearchData) {
            _pageRenderers.loadFullResearchData(ticker, function(data) {
              if (data) {
                if (_pageRenderers.buildSnapshotFromStock) {
                  SNAPSHOT_DATA[ticker] = _pageRenderers.buildSnapshotFromStock(ticker);
                }
                if (SNAPSHOT_DATA[ticker] && _pageRenderers.renderSnapshotPage) {
                  container.innerHTML = _pageRenderers.renderSnapshotPage(SNAPSHOT_DATA[ticker]);
                  renderedSnapshots.add(ticker);
                }
              }
            });
          }
        }
      }
    }
  }

  const target = document.getElementById('page-' + hash);
  if (target) {
    target.classList.add('active');
    window.scrollTo(0, 0);
    // A7: Focus management -- move focus to the new page content
    // Use requestAnimationFrame to ensure DOM is rendered before focusing
    requestAnimationFrame(function() {
      var focusTarget = target.querySelector('h1, h2, .hero-title, .page-heading');
      if (focusTarget) {
        focusTarget.setAttribute('tabindex', '-1');
        focusTarget.focus({ preventScroll: true });
      } else {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  } else {
    document.getElementById('page-home').classList.add('active');
  }

  // Update nav links -- add aria-current for a11y
  document.querySelectorAll('.nav-links a').forEach(a => {
    a.classList.remove('active');
    a.removeAttribute('aria-current');
    if (a.dataset.nav === hash || (hash.startsWith('report-') && a.dataset.nav === 'home') || (hash.startsWith('snapshot-') && a.dataset.nav === 'snapshots')) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
  });

  // Populate hypothesis sidebar for report pages
  if (hash.startsWith('report-')) {
    const ticker = hash.replace('report-', '');
    if (_pageRenderers.populateSidebar) _pageRenderers.populateSidebar(ticker);
  }
}

// Export the Sets for external access if needed
export { renderedPages, renderedSnapshots };
