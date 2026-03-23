// ============================================================
// ROUTER.JS -- Hash-based SPA router extracted from index.html
// Handles navigation, route validation, lazy rendering,
// and accessibility announcements.
// ============================================================

import { STOCK_DATA, SNAPSHOT_DATA } from './state.js';
import { VALID_STATIC_PAGES } from './state.js';
import { announcePageChange } from './dom.js';
import { CACHE_VERSION } from '../data/loader.js';
import { API_BASE } from './api-config.js';

// --- Router state ---
const renderedPages = new Set();
const renderedSnapshots = new Set();

// Railway API base (centralised in api-config.js)
var _REFRESH_API_BASE = API_BASE;

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
 *     populateSidebar, applyNarrativeAnalysis,
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
    } else if (hash.startsWith('deep-report-')) {
      var t2 = hash.replace('deep-report-', '');
      pageName = STOCK_DATA[t2] ? STOCK_DATA[t2].company + ' Deep Research Report' : t2 + ' Deep Report';
    } else if (hash.startsWith('snapshot-')) {
      pageName = hash.replace('snapshot-', '') + ' Snapshot';
    } else {
      var names = { home: 'Research Home', 'deep-research': 'Deep Research', portfolio: 'Portfolio Intelligence', comparator: 'Investment Thesis Comparator', personalisation: 'Personalisation', memory: 'Analyst Journal', pm: 'Portfolio Manager', about: 'About' };
      pageName = names[hash] || hash;
    }
    announcePageChange('Navigated to ' + pageName);
  });

  // Run initial route
  route();
}

/**
 * Shared helper: lazy-render a stock research report into its page div.
 * Called for both report-TICKER and deep-report-TICKER routes.
 * renderedPages is keyed by full hash so the two page divs are independent.
 * @param {string} hash   - full hash, e.g. "report-WOW" or "deep-report-WOW"
 * @param {string} ticker - uppercase ticker, e.g. "WOW"
 */
function renderStockReport(hash, ticker) {
  if (renderedPages.has(hash)) return;
  const container = document.getElementById('page-' + hash);
  if (!container) return;

  // Path 1: stock not in STOCK_DATA -- fetch from Railway (dynamically-added stock)
  if (!STOCK_DATA[ticker]) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Loading Research Data&hellip;</div><div style="font-size:0.9rem">Fetching report for ' + ticker + ' from server</div></div></div>';
    (async function() {
      try {
        var scaffoldResp = await fetch(_REFRESH_API_BASE + '/data/research/' + ticker + '.json');
        if (!scaffoldResp.ok) throw new Error('HTTP ' + scaffoldResp.status);
        var scaffoldData = await scaffoldResp.json();
        scaffoldData._lastRefreshed = scaffoldData._lastRefreshed || new Date().toISOString();
        scaffoldData._cacheVersion = CACHE_VERSION;
        try { localStorage.setItem('ci_research_' + ticker, JSON.stringify(scaffoldData)); } catch(e) {}
        var currencyMap = {'AUD':'A$','USD':'US$','GBP':'\u00a3','EUR':'\u20ac'};
        STOCK_DATA[ticker] = scaffoldData;
        STOCK_DATA[ticker]._indexOnly = false;
        if (scaffoldData.currency && currencyMap[scaffoldData.currency]) {
          STOCK_DATA[ticker].currency = currencyMap[scaffoldData.currency];
        }
        if (typeof window.ContinuumDynamics !== 'undefined' && window.ContinuumDynamics.hydrate) {
          window.ContinuumDynamics.hydrate(ticker);
        }
        if (_pageRenderers.renderReportPage) {
          container.innerHTML = _pageRenderers.renderReportPage(STOCK_DATA[ticker]);
        }
        renderedPages.add(hash);
        if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
        if (_pageRenderers.setupScrollSpy) _pageRenderers.setupScrollSpy('page-' + hash);
        if (_pageRenderers.populateSidebar) _pageRenderers.populateSidebar(ticker);
        if (typeof window.applyNarrativeAnalysis === 'function') window.applyNarrativeAnalysis(ticker);
        if (_pageRenderers.initNarrativeTimelineChart) _pageRenderers.initNarrativeTimelineChart(ticker);
        if (_pageRenderers.fetchAndPatchLive) _pageRenderers.fetchAndPatchLive(ticker);
        console.log('[Route] Fetched dynamically-added stock ' + ticker + ' from Railway');
      } catch(err) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Stock Not Found</div><div style="font-size:0.9rem">' + ticker + ' is not in coverage. <a href="#home" style="color:var(--brand-green)">Return to home</a></div></div></div>';
        console.warn('[Route] Failed to fetch ' + ticker + ':', err);
      }
    })();
  }

  // Path 2: stock is index-only -- load full research data then render
  else if (STOCK_DATA[ticker]._indexOnly) {
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Loading Research Data&hellip;</div><div style="font-size:0.9rem">Fetching full report for ' + STOCK_DATA[ticker].company + '</div></div></div>';
    if (_pageRenderers.loadFullResearchData) {
      _pageRenderers.loadFullResearchData(ticker, function(data) {
        if (data) {
          if (_pageRenderers.renderReportPage) {
            container.innerHTML = _pageRenderers.renderReportPage(data);
          }
          renderedPages.add(hash);
          if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
          if (_pageRenderers.setupScrollSpy) _pageRenderers.setupScrollSpy('page-' + hash);
          if (_pageRenderers.populateSidebar) _pageRenderers.populateSidebar(ticker);
          if (typeof window.applyNarrativeAnalysis === 'function') window.applyNarrativeAnalysis(ticker);
          if (_pageRenderers.initNarrativeTimelineChart) _pageRenderers.initNarrativeTimelineChart(ticker);
          if (_pageRenderers.fetchAndPatchLive) _pageRenderers.fetchAndPatchLive(ticker);
        }
      });
    }
  }

  // Path 3: fully loaded -- render immediately
  else {
    if (_pageRenderers.renderReportPage) {
      container.innerHTML = _pageRenderers.renderReportPage(STOCK_DATA[ticker]);
    }
    renderedPages.add(hash);
    if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
    if (_pageRenderers.setupScrollSpy) _pageRenderers.setupScrollSpy('page-' + hash);
    if (_pageRenderers.initNarrativeTimelineChart) _pageRenderers.initNarrativeTimelineChart(ticker);
  }
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
    // Allow route for dynamically-added stocks not yet in STOCK_DATA
    // (e.g. different browser, no localStorage -- will fetch from Railway)
    if (!isValidRoute && /^[A-Z0-9]{1,6}$/.test(ticker)) {
      isValidRoute = true; // permit route; render block fetches on demand
    }
  }
  if (!isValidRoute && hash.startsWith('deep-report-')) {
    var drTicker = hash.replace('deep-report-', '');
    isValidRoute = typeof STOCK_DATA !== 'undefined' && STOCK_DATA.hasOwnProperty(drTicker);
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
  if ((hash.startsWith('report-') || hash.startsWith('deep-report-') || hash.startsWith('snapshot-')) && !document.getElementById('page-' + hash)) {
    const div = document.createElement('div');
    div.className = 'page';
    div.id = 'page-' + hash;
    document.getElementById('page-home').parentNode.appendChild(div);
  }

  // Lazy render report pages on first visit
  if (hash.startsWith('report-')) {
    const ticker = hash.replace('report-', '');
    renderStockReport(hash, ticker);
    // Apply narrative analysis (alerts, ST/LT weights, market-responsive narrative)
    if (typeof window.applyNarrativeAnalysis === 'function') {
      window.applyNarrativeAnalysis(ticker);
    }
    // Fetch live data asynchronously and update chart + hero price
    if (STOCK_DATA[ticker] && _pageRenderers.fetchAndPatchLive) {
      _pageRenderers.fetchAndPatchLive(ticker);
    }
  }

  // Lazy render deep-report pages on first visit (same renderer as report-)
  if (hash.startsWith('deep-report-')) {
    const ticker = hash.replace('deep-report-', '');
    renderStockReport(hash, ticker);
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

  // Lazy render memory dashboard on each visit (always refresh)
  if (hash === 'memory' && _pageRenderers.renderMemoryPage) {
    _pageRenderers.renderMemoryPage();
  }

  // Lazy render PM page on first visit
  if (hash === 'pm' && _pageRenderers.renderPMPage) {
    _pageRenderers.renderPMPage();
  }

  // Lazy render ops page (URL-only, no nav link)
  if (hash === 'ops' && _pageRenderers.renderOpsPage) {
    _pageRenderers.renderOpsPage();
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
    if (a.dataset.nav === hash || (hash.startsWith('report-') && a.dataset.nav === 'home') || (hash.startsWith('deep-report-') && a.dataset.nav === 'deep-research') || (hash.startsWith('snapshot-') && a.dataset.nav === 'deep-research')) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
  });

  // Populate hypothesis sidebar for report and deep-report pages
  if (hash.startsWith('report-') || hash.startsWith('deep-report-')) {
    const ticker = hash.startsWith('deep-report-')
      ? hash.replace('deep-report-', '')
      : hash.replace('report-', '');
    if (_pageRenderers.populateSidebar) _pageRenderers.populateSidebar(ticker);
  }
}

// Export the Sets for external access if needed
export { renderedPages, renderedSnapshots };
