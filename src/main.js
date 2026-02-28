import './styles/index.css';

// State management
import {
  STOCK_DATA, initStockData, initReferenceData, initFreshnessData,
  REFERENCE_DATA, FRESHNESS_DATA, SNAPSHOT_DATA, SNAPSHOT_ORDER
} from './lib/state.js';

// Utilities
import { computeSkewScore } from './lib/dom.js';

// Data layer
import ContinuumDynamics from './data/dynamics.js';
import { loadFullResearchData, buildCoverageData } from './data/loader.js';

// Router
import { initRouter, navigate } from './lib/router.js';

// Pages
import { initHomePage, sortCoverageTable } from './pages/home.js';
import { renderReport } from './pages/report.js';
import { renderSnapshot, renderSnapshotPage, buildSnapshotFromStock } from './pages/snapshot.js';
import { initPortfolioPage, clearPortfolio, populateSidebar } from './pages/portfolio.js';
import { initThesisPage, tcAnalyze } from './pages/thesis.js';
import { initAboutPage } from './pages/about.js';

// Report sections (needed for router callbacks)
import { setupScrollSpy, initNarrativeTimelineChart, destroyNarrativeTimelineChart } from './pages/report-sections.js';

// Features
import { initChat } from './features/chat.js';
import { initBatchRefresh, closeBatchModal } from './features/batch-refresh.js';
import { generatePDFReport } from './features/pdf.js';

// Services
import { MarketFeed } from './services/market-feed.js';
import { prefetchAllLiveData, fetchAndPatchLive } from './services/live-data.js';

// Make key functions available globally for onclick handlers in HTML
window.navigate = navigate;
window.generatePDFReport = generatePDFReport;
window.ContinuumDynamics = ContinuumDynamics;
window.loadFullResearchData = loadFullResearchData;
window.MarketFeed = MarketFeed;
window.sortCoverageTable = sortCoverageTable;
window.clearPortfolio = clearPortfolio;
window.tcAnalyze = tcAnalyze;
window.closeBatchModal = closeBatchModal;

// Expose state and utility globals needed by classic (non-module) scripts
// (snapshot-generator.js, personalisation.js, DNE engines)
window.STOCK_DATA = STOCK_DATA;
window.REFERENCE_DATA = REFERENCE_DATA;
window.FRESHNESS_DATA = FRESHNESS_DATA;
window.SNAPSHOT_DATA = SNAPSHOT_DATA;
window.SNAPSHOT_ORDER = SNAPSHOT_ORDER;
window.computeSkewScore = computeSkewScore;
window.buildSnapshotFromStock = buildSnapshotFromStock;
window.buildCoverageData = buildCoverageData;
window.renderReportPage = renderReport;
window.destroyNarrativeTimelineChart = destroyNarrativeTimelineChart;
window.setupScrollSpy = setupScrollSpy;
window.initNarrativeTimelineChart = initNarrativeTimelineChart;

window.toggleSection = function(btn) {
  var section = btn.closest('.report-section');
  if (!section) return;
  var body = section.querySelector('.rs-body');
  if (!body) return;
  var isCollapsed = section.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
  body.style.display = isCollapsed ? 'none' : '';
};

window.initSectionToggles = function() {
  document.querySelectorAll('.report-section').forEach(function(section) {
    var body = section.querySelector('.rs-body');
    var btn = section.querySelector('.rs-toggle');
    if (body) body.style.display = '';
    if (btn) btn.setAttribute('aria-expanded', 'true');
    section.classList.remove('collapsed');
  });
  var allBtn = document.querySelector('.sections-toggle-all-btn');
  if (allBtn) { allBtn.dataset.state = 'expanded'; allBtn.querySelector('span').textContent = 'Collapse All'; allBtn.querySelector('svg polyline').setAttribute('points', '18 15 12 9 6 15'); }
};

window.toggleAllSections = function(btn) {
  var isExpanded = btn.dataset.state === 'expanded';
  var newState = isExpanded ? 'collapsed' : 'expanded';
  document.querySelectorAll('.report-section').forEach(function(section) {
    var body = section.querySelector('.rs-body');
    var toggle = section.querySelector('.rs-toggle');
    if (!body) return;
    if (isExpanded) {
      section.classList.add('collapsed');
      body.style.display = 'none';
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    } else {
      section.classList.remove('collapsed');
      body.style.display = '';
      if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
  });
  btn.dataset.state = newState;
  var label = isExpanded ? 'Expand All' : 'Collapse All';
  btn.querySelector('span').textContent = label;
  btn.setAttribute('aria-label', label + ' sections');
  var points = isExpanded ? '6 9 12 15 18 9' : '18 15 12 9 6 15';
  btn.querySelector('svg polyline').setAttribute('points', points);
};

// Lazy-load SheetJS only when needed (portfolio upload interaction)
window.loadSheetJS = function(callback) {
  if (typeof window.XLSX !== 'undefined') { if (callback) callback(); return; }
  var placeholder = document.getElementById('sheetjs-placeholder');
  if (!placeholder) { console.error('[SheetJS] Placeholder not found'); return; }
  var script = document.createElement('script');
  script.src = placeholder.getAttribute('data-src');
  script.onload = function() { if (callback) callback(); };
  script.onerror = function() { console.error('[SheetJS] Failed to load library'); };
  document.head.appendChild(script);
};

async function boot() {
  console.log('[Continuum] Module system booting...');

  // Load _index.json, reference.json, and freshness.json in parallel
  try {
    const [indexResponse, refResponse, freshResponse] = await Promise.all([
      fetch('data/research/_index.json'),
      fetch('data/reference.json'),
      fetch('data/freshness.json')
    ]);

    if (indexResponse.ok) {
      const indexData = await indexResponse.json();
      // Mark each entry as index-only (full data loaded on demand per-ticker)
      Object.keys(indexData).forEach(function(t) {
        indexData[t]._indexOnly = true;
      });
      initStockData(indexData);
    }

    if (refResponse.ok) {
      const refData = await refResponse.json();
      initReferenceData(refData);
    }

    if (freshResponse.ok) {
      const freshData = await freshResponse.json();
      initFreshnessData(freshData);
    }
  } catch (err) {
    console.warn('[Continuum] Failed to load data:', err);
  }

  // Hydrate computed fields (market cap, P/E, etc.)
  ContinuumDynamics.hydrateAll();

  // Initialize router with page renderer callbacks
  initRouter({
    renderReportPage: renderReport,
    renderSnapshotPage: renderSnapshotPage,
    renderPersonalisationPage: window.renderPersonalisationPage,
    loadFullResearchData: loadFullResearchData,
    buildSnapshotFromStock: buildSnapshotFromStock,
    setupScrollSpy: setupScrollSpy,
    populateSidebar: populateSidebar,
    initNarrativeTimelineChart: initNarrativeTimelineChart,
    fetchAndPatchLive: fetchAndPatchLive,
    initPersonalisationDemo: window.initPersonalisationDemo
  });

  // Initialize pages
  initHomePage();
  initBatchRefresh();
  initPortfolioPage();
  initThesisPage();
  initChat();
  initAboutPage();

  // --- Theme toggle ---
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    // Restore saved theme
    var savedTheme = localStorage.getItem('ci-theme');
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    }
    themeToggle.addEventListener('click', function() {
      var isLight = document.documentElement.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('ci-theme', 'dark');
      } else {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('ci-theme', 'light');
      }
    });
  }

  // --- Evidence card expand/collapse (event delegation) ---
  document.addEventListener('click', function(e) {
    var header = e.target.closest('.ec-header');
    if (!header) return;
    var card = header.closest('.evidence-card');
    if (!card) return;
    var body = card.querySelector('.ec-body');
    var toggle = card.querySelector('.ec-toggle');
    if (body) body.classList.toggle('open');
    if (toggle) toggle.classList.toggle('open');
  });

  // --- Mobile nav toggle ---
  var menuBtn = document.getElementById('menuToggle');
  var navLinks = document.querySelector('.nav-links');
  if (menuBtn && navLinks) {
    menuBtn.addEventListener('click', function() {
      navLinks.classList.toggle('open');
      var expanded = menuBtn.getAttribute('aria-expanded') === 'true';
      menuBtn.setAttribute('aria-expanded', String(!expanded));
    });
    // Close mobile nav when a link is clicked
    navLinks.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        navLinks.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Start live data polling (delayed to not block initial render)
  setTimeout(function() { MarketFeed.start(); }, 800);
  setTimeout(function() { prefetchAllLiveData(); }, 3000);

  console.log('[Continuum] Module system ready');
}

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js')
      .then(function(reg) {
        console.log('[SW] Registered, scope:', reg.scope);
      })
      .catch(function(err) {
        console.warn('[SW] Registration failed:', err);
      });
  });
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
