// home.js -- Home page barrel assembler.
// Orchestrates the coverage command surface: selectors, state, renderers.
// Entry point: initHomePage() (registered as critical boot subsystem).

import {
  STOCK_DATA, FRESHNESS_DATA, REFERENCE_DATA, SNAPSHOT_DATA,
  WORKSTATION_DATA, WORKSTATION_STATUS, BATCH_STATUS
} from '../lib/state.js';
import { on } from '../lib/data-events.js';
import { buildCoverageRows, sortCoverageRows, filterCoverageRows } from '../features/home/home-selectors.js';
import { getHomeState, resetHomeState, toggleSort, updateHomeState } from '../features/home/home-state.js';
import { renderCoverageTable, renderCoverageTableBody } from '../features/home/coverage-table.js';
import { renderHealthBanner } from '../features/home/home-health-banner.js';

// Cached rows for the current render cycle.
var _currentRows = [];

function _buildSources() {
  return {
    STOCK_DATA: STOCK_DATA,
    REFERENCE_DATA: REFERENCE_DATA,
    FRESHNESS_DATA: FRESHNESS_DATA,
    SNAPSHOT_DATA: SNAPSHOT_DATA,
    WORKSTATION_DATA: WORKSTATION_DATA,
    WORKSTATION_STATUS: WORKSTATION_STATUS,
    BATCH_STATUS: BATCH_STATUS
  };
}

function _getFilteredSorted(state) {
  var filtered = filterCoverageRows(_currentRows, {
    signal: state.filterSignal,
    staleness: state.filterStaleness,
    extraction: state.filterExtraction,
    searchQuery: state.searchQuery
  });
  return sortCoverageRows(filtered, state.sortColumn, state.sortDirection);
}

function _rerenderBody(container) {
  var tbody = container.querySelector('.coverage-tbody');
  if (!tbody) return;
  var state = getHomeState();
  tbody.innerHTML = renderCoverageTableBody(_getFilteredSorted(state));
}

function _bindTableEvents(container) {
  container.addEventListener('click', function(e) {
    var th = e.target.closest('th[data-sort-col]');
    if (th) {
      toggleSort(th.getAttribute('data-sort-col'));
      _rerenderBody(container);
      var thead = container.querySelector('thead');
      if (thead) {
        var state = getHomeState();
        var ths = thead.querySelectorAll('th[data-sort-col]');
        for (var i = 0; i < ths.length; i++) {
          var col = ths[i].getAttribute('data-sort-col');
          var ind = ths[i].querySelector('.sort-indicator');
          if (col === state.sortColumn) {
            if (!ind) {
              ind = document.createElement('span');
              ind.className = 'sort-indicator';
              ths[i].appendChild(ind);
            }
            ind.innerHTML = state.sortDirection === 'asc' ? '&#9650;' : '&#9660;';
          } else if (ind) {
            ind.remove();
          }
        }
      }
      return;
    }

    var tr = e.target.closest('tr[data-ticker]');
    if (tr) {
      var ticker = tr.getAttribute('data-ticker');
      if (ticker && window.navigate) {
        var row = null;
        for (var j = 0; j < _currentRows.length; j++) {
          if (_currentRows[j].ticker === ticker) { row = _currentRows[j]; break; }
        }
        var target = row ? row.routeTarget.replace('#', '') : ('report-' + ticker);
        window.navigate(target);
      }
    }
  });
}

function _bindFilterEvents(container) {
  container.addEventListener('click', function(e) {
    var bannerBtn = e.target.closest('[data-health-action="show-failed"]');
    if (bannerBtn) {
      updateHomeState({ filterExtraction: 'failed' });
      _rerenderBody(container);
      var chips = container.querySelectorAll('.filter-chip[data-filter-group="extraction"]');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('active', chips[i].getAttribute('data-filter-value') === 'failed');
      }
      return;
    }

    var chip = e.target.closest('.filter-chip[data-filter-group]');
    if (!chip) return;
    var group = chip.getAttribute('data-filter-group');
    var value = chip.getAttribute('data-filter-value');
    if (group === 'signal') updateHomeState({ filterSignal: value });
    if (group === 'staleness') updateHomeState({ filterStaleness: value });
    if (group === 'extraction') updateHomeState({ filterExtraction: value });

    var groupEl = chip.closest('.filter-group');
    if (groupEl) {
      var chips = groupEl.querySelectorAll('.filter-chip');
      for (var i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('active', chips[i].getAttribute('data-filter-value') === value);
      }
    }

    _rerenderBody(container);
  });
}

function _bindSearchEvents(container) {
  var input = container.querySelector('[data-filter-search]');
  if (!input) return;
  input.addEventListener('input', function() {
    updateHomeState({ searchQuery: this.value });
    _rerenderBody(container);
  });
}

function _handleStockUpdate(ticker) {
  var homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  var stock = STOCK_DATA[ticker];
  if (!stock) return;

  var price = stock._livePrice != null ? stock._livePrice : (stock.price || 0);
  var previousClose = stock.previousClose;
  var dayChangePct = 0;
  if (typeof stock.priceChange === 'number') {
    dayChangePct = stock.priceChange;
  } else if (typeof previousClose === 'number' && previousClose !== 0) {
    dayChangePct = ((price - previousClose) / previousClose) * 100;
  }

  var priceEl = homePage.querySelector('[data-home-price="' + ticker + '"]');
  if (priceEl) {
    var fmt = _getFormatFns();
    priceEl.textContent = fmt.formatPrice(price);
  }

  var changeEl = homePage.querySelector('[data-home-change="' + ticker + '"]');
  if (changeEl) {
    var fmt2 = _getFormatFns();
    changeEl.textContent = fmt2.formatSignedPercent(dayChangePct);
    changeEl.className = 'chg ' + (dayChangePct > 0 ? 'pos' : dayChangePct < 0 ? 'neg' : '');
  }

  for (var i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].ticker === ticker) {
      _currentRows[i].price = price;
      _currentRows[i].dayChangePct = dayChangePct;
      break;
    }
  }
}

function _getFormatFns() {
  return {
    formatPrice: function(v) { return isNaN(v) ? '--' : 'A$' + v.toFixed(2); },
    formatSignedPercent: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
  };
}

// ── Hero ─────────────────────────────────────────────────────

function _renderHero(rows) {
  var total = rows ? rows.length : 0;
  var upside = 0, downside = 0, neutral = 0, highConviction = 0;
  if (rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].signal === 'upside') upside++;
      else if (rows[i].signal === 'downside') downside++;
      else neutral++;
      if (rows[i].convictionPct != null && rows[i].convictionPct >= 80) highConviction++;
    }
  }

  return '<section class="hero">' +
    '<div class="hero-head">' +
    '<div class="hero-identity">' +
    '<div>' +
    '<h1 class="hero-title">Continuum Intelligence</h1>' +
    '<div class="hero-sub">' +
    '<span>Independent Cross-Domain Equity Research</span>' +
    '<span class="sep">·</span>' +
    '<span>ASX Coverage Universe</span>' +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="hero-tags">' +
    '<span class="tag blue">' + total + ' Stocks Covered</span>' +
    '<span class="tag green">ACH Methodology</span>' +
    '<span class="tag gold">Institutional Grade</span>' +
    '<span class="tag violet">10 Evidence Domains</span>' +
    '</div>' +
    '</div>' +
    '<div class="stat-ribbon">' +
    '<div class="stat-row">' +
    '<div class="stat-cell"><div class="stat-k">Coverage</div><div class="stat-v">' + total + ' <small>ASX-listed stocks</small></div></div>' +
    '<div class="stat-cell"><div class="stat-k">High Conviction</div><div class="stat-v neu">' + highConviction + ' <small>skews ≥80%</small></div></div>' +
    '<div class="stat-cell"><div class="stat-k">Upside Skew</div><div class="stat-v pos">' + upside + ' <small>stocks</small></div></div>' +
    '<div class="stat-cell"><div class="stat-k">Downside Skew</div><div class="stat-v neg">' + downside + ' <small>stocks</small></div></div>' +
    '<div class="stat-cell"><div class="stat-k">Last Refresh</div><div class="stat-v"><small>Platform data</small></div></div>' +
    '</div>' +
    '</div>' +
    '</section>';
}

// ── Market bar (IDs preserved for market-feed.js patching) ───

function _renderMarketBar() {
  return '<div class="market-bar" id="market-status-bar">' +
    '<div class="market-left">' +
    '<div class="market-dot" id="msb-dot"></div>' +
    '<span class="market-label" id="msb-label">ASX</span>' +
    '<span class="market-updated" id="msb-updated"></span>' +
    '</div>' +
    '<div class="market-indices" id="market-indices"></div>' +
    '<div class="market-right">' +
    '<span class="market-updated" id="msb-feed-status">Loading prices\u2026</span>' +
    '<button class="refresh-btn" id="msb-refresh">REFRESH</button>' +
    '</div>' +
    '</div>';
}

// ── Featured research ─────────────────────────────────────────

function _renderFeaturedSection(rows) {
  if (!rows || rows.length === 0) return '';

  var sorted = rows.slice().sort(function(a, b) {
    return (b.convictionPct || 0) - (a.convictionPct || 0);
  });
  var featured = sorted.slice(0, 6);

  var cards = featured.map(function(row) {
    var pct = row.convictionPct != null ? Math.round(row.convictionPct) : null;
    var signalTag = row.signal === 'upside'
      ? '<span class="tag green">Upside</span>'
      : row.signal === 'downside'
      ? '<span class="tag red">Downside</span>'
      : '<span class="tag amber">Balanced</span>';
    var confTag = pct != null ? '<span class="tag">' + pct + '%</span>' : '';
    var priceStr = row.price ? 'A$' + row.price.toFixed(2) : '--';
    var chgStr = row.dayChangePct != null
      ? (row.dayChangePct >= 0 ? '+' : '') + row.dayChangePct.toFixed(1) + '%'
      : '';
    var chgCls = row.dayChangePct > 0 ? 'pos' : row.dayChangePct < 0 ? 'neg' : '';

    return '<div class="research-card" data-research-ticker="' + row.ticker + '">' +
      '<div class="rc-head">' +
      '<div class="rc-ticker">' + row.ticker + '</div>' +
      '<div class="rc-tags">' + signalTag + confTag + '</div>' +
      '</div>' +
      '<div class="rc-company">' + (row.name || row.ticker) + '</div>' +
      '<div class="rc-sector">' + (row.sector || '') + '</div>' +
      '<div class="rc-footer">' +
      '<span class="rc-meta"></span>' +
      '<span class="rc-price" data-featured-price="' + row.ticker + '">' + priceStr + '</span>' +
      '<span class="rc-chg ' + chgCls + '">' + chgStr + '</span>' +
      '</div>' +
      '</div>';
  }).join('');

  return '<section class="section">' +
    '<div class="section-header">' +
    '<div>' +
    '<div class="eyebrow">Latest Research</div>' +
    '<h2 class="sec-title">Featured Analysis</h2>' +
    '<p class="sec-sub">Highest conviction positions across the coverage universe.</p>' +
    '</div>' +
    '</div>' +
    '<div class="featured-grid" id="featured-grid">' + cards + '</div>' +
    '</section>';
}

// ── Coverage universe section ─────────────────────────────────

function _renderCoverageSection(displayRows, state, totalTickers, batchStatus) {
  var healthBanner = renderHealthBanner(batchStatus, totalTickers);
  return '<section class="section">' +
    '<div class="section-header">' +
    '<div>' +
    '<div class="eyebrow">Research Coverage</div>' +
    '<h2 class="sec-title">Coverage Universe</h2>' +
    '<p class="sec-sub">ASX equities under active coverage. Click any row to open the full research page.</p>' +
    '</div>' +
    '<div style="display:flex;gap:8px">' +
    '<button class="btn btn-add-stock" id="btn-add-stock" onclick="openAddStockModal()">+ Add Stock</button>' +
    '<button class="btn btn-refresh-all" id="btn-refresh-all" onclick="triggerRefreshAll()">&#8635; Refresh All</button>' +
    '</div>' +
    '</div>' +
    (healthBanner || '') +
    renderCoverageTable(displayRows, state) +
    '</section>';
}

// ── Announcements section (IDs preserved for market-feed.js) ──

function _renderAnnouncementsSection() {
  return '<section class="section" id="announcements-panel" style="display:none">' +
    '<div class="section-header">' +
    '<div>' +
    '<div class="eyebrow">Market Intelligence</div>' +
    '<h2 class="sec-title">Latest ASX Announcements</h2>' +
    '<p class="sec-sub" id="ann-updated">Coverage universe announcements from the last 48 hours.</p>' +
    '</div>' +
    '</div>' +
    '<ul class="ann-list" id="ann-list"><li style="color:var(--muted);font-size:12px">No announcements loaded yet.</li></ul>' +
    '</section>';
}

// ── Right rail ────────────────────────────────────────────────

function _renderAlertsCard(rows) {
  var alertRows = (rows || []).filter(function(r) { return r.alertFlags && r.alertFlags.length > 0; });

  // Supplement to minimum 5 using top-conviction stocks not already in alerts
  if (alertRows.length < 5) {
    var alertTickers = alertRows.reduce(function(acc, r) { acc[r.ticker] = true; return acc; }, {});
    var supplement = (rows || [])
      .filter(function(r) { return !alertTickers[r.ticker]; })
      .sort(function(a, b) { return (b.convictionPct || 0) - (a.convictionPct || 0); })
      .slice(0, 5 - alertRows.length)
      .map(function(r) { return { ticker: r.ticker, signal: r.signal || 'neutral', alertFlags: ['signal-changed'], convictionPct: r.convictionPct }; });
    alertRows = alertRows.concat(supplement);
  }

  var items = alertRows.length === 0
    ? '<div style="padding:14px;font-size:12px;color:var(--muted)">No active alerts.</div>'
    : alertRows.slice(0, 5).map(function(row) {
        var flags = row.alertFlags;
        var msg = '';
        var iconType = 'signal';
        if (flags.indexOf('signal-changed') !== -1) {
          msg = 'Signal: ' + (row.signal.charAt(0).toUpperCase() + row.signal.slice(1));
          iconType = row.signal === 'upside' ? 'upside' : row.signal === 'downside' ? 'downside' : 'signal';
        } else if (flags.indexOf('imminent-catalyst') !== -1) {
          msg = row.signal + ' thesis, catalyst within 3 days';
          iconType = 'macro';
        } else if (flags.indexOf('large-move') !== -1) {
          var chg = row.dayChangePct;
          msg = 'Large move: ' + (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%';
          iconType = chg > 0 ? 'upside' : 'downside';
        } else if (flags.indexOf('stale-research') !== -1) {
          msg = 'Research stale (> 72h)';
          iconType = 'macro';
        } else {
          msg = flags[0];
        }
        var icon = iconType === 'upside' ? '↑' : iconType === 'downside' ? '↓' : '~';
        return '<div class="alert-item">' +
          '<div class="alert-icon ' + iconType + '">' + icon + '</div>' +
          '<div>' +
          '<div class="alert-ticker">' + row.ticker + ' · ' + (row.signal.charAt(0).toUpperCase() + row.signal.slice(1)) + '</div>' +
          '<div class="alert-text">' + msg + '</div>' +
          '</div>' +
          '<div class="alert-time">Now</div>' +
          '</div>';
      }).join('');

  return '<div class="rail-card">' +
    '<div class="rail-head">' +
    '<div class="rail-eyebrow">Thesis Monitor</div>' +
    '<h2 class="rail-title">Alerts &amp; Signals</h2>' +
    '<p class="rail-sub">Evidence events that materially affect active theses.</p>' +
    '</div>' +
    '<div class="alert-list">' + items + '</div>' +
    '</div>';
}

function _renderConvictionCard(rows) {
  var sorted = (rows || []).slice().sort(function(a, b) {
    return (b.convictionPct || 0) - (a.convictionPct || 0);
  });
  var top = sorted.slice(0, 6);

  var items = top.map(function(row) {
    var pct = row.convictionPct != null ? Math.round(row.convictionPct) : 0;
    var signalStr = row.signal.charAt(0).toUpperCase() + row.signal.slice(1);
    var tagCls = row.signal === 'upside' ? 'green' : row.signal === 'downside' ? 'red' : 'amber';
    var strength = pct >= 80 ? 'Strong' : pct >= 60 ? 'Moderate' : 'Developing';
    return '<div class="signal-row">' +
      '<div>' +
      '<div class="signal-label">' + row.ticker + ' &ndash; ' + (row.name || row.ticker) + '</div>' +
      '<div class="signal-sub">' + signalStr + ' · ' + (row.sector || 'Equity') + ' · ' + pct + '%</div>' +
      '</div>' +
      '<span class="tag ' + tagCls + '" style="font-size:9px">' + strength + '</span>' +
      '</div>';
  }).join('');

  return '<div class="rail-card">' +
    '<div class="rail-head">' +
    '<div class="rail-eyebrow">Conviction Snapshot</div>' +
    '<h2 class="rail-title">High Conviction Skews</h2>' +
    '<p class="rail-sub">Stocks where evidence confidence is ≥80%. Actionable extremes only.</p>' +
    '</div>' +
    '<div>' + (items || '<div style="padding:14px;font-size:12px;color:var(--muted)">No data yet.</div>') + '</div>' +
    '</div>';
}

function _renderWatchlistCard(rows) {
  var sorted = (rows || []).slice().sort(function(a, b) {
    return (b.convictionPct || 0) - (a.convictionPct || 0);
  });
  var top = sorted.slice(0, 5);

  var items = top.map(function(row) {
    var pct = row.convictionPct != null ? Math.round(row.convictionPct) : 0;
    var signalStr = row.signal.charAt(0).toUpperCase() + row.signal.slice(1);
    var tagCls = row.signal === 'upside' ? 'green' : row.signal === 'downside' ? 'red' : 'amber';
    var priceStr = row.price ? 'A$' + row.price.toFixed(2) : '--';
    var chgStr = row.dayChangePct != null
      ? (row.dayChangePct >= 0 ? '+' : '') + row.dayChangePct.toFixed(1) + '%'
      : '';
    var chgCls = row.dayChangePct > 0 ? 'pos' : row.dayChangePct < 0 ? 'neg' : '';
    return '<div class="wl-item" data-wl-ticker="' + row.ticker + '">' +
      '<div class="wl-badge">' + row.ticker + '</div>' +
      '<div>' +
      '<div class="wl-name">' + (row.name || row.ticker) + '</div>' +
      '<div class="wl-sector"><span class="tag ' + tagCls + '" style="font-size:9px;padding:3px 6px">' + signalStr + ' · ' + pct + '%</span></div>' +
      '</div>' +
      '<div class="wl-right">' +
      '<div class="wl-price" data-wl-price="' + row.ticker + '">' + priceStr + '</div>' +
      '<div class="wl-chg ' + chgCls + '">' + chgStr + '</div>' +
      '</div>' +
      '</div>';
  }).join('');

  return '<div class="rail-card">' +
    '<div class="rail-head">' +
    '<div class="rail-eyebrow">Quick Access</div>' +
    '<h2 class="rail-title">Watchlist</h2>' +
    '<p class="rail-sub">Your pinned stocks. Click any row to open the full research page.</p>' +
    '</div>' +
    '<div class="watchlist">' + (items || '<div style="padding:14px;font-size:12px;color:var(--muted)">No coverage loaded.</div>') + '</div>' +
    '</div>';
}

function _renderRightRail(rows, batchStatus) {
  return '<aside class="home-right-rail">' +
    _renderAlertsCard(rows) +
    _renderConvictionCard(rows) +
    _renderWatchlistCard(rows) +
    '</aside>';
}

// ── Entry point ───────────────────────────────────────────────

export function initHomePage() {
  var t0 = performance.now();

  resetHomeState();

  var container = document.getElementById('page-home');
  if (!container) return;

  _currentRows = buildCoverageRows(_buildSources());

  var state = getHomeState();
  var displayRows = _getFilteredSorted(state);
  var totalTickers = Object.keys(STOCK_DATA).length;

  container.innerHTML =
    '<div class="home-grid">' +
    '<div class="home-main-col">' +
    _renderHero(_currentRows) +
    _renderMarketBar() +
    _renderFeaturedSection(_currentRows) +
    _renderCoverageSection(displayRows, state, totalTickers, BATCH_STATUS) +
    _renderAnnouncementsSection() +
    '</div>' +
    _renderRightRail(_currentRows, BATCH_STATUS) +
    '</div>';

  _bindTableEvents(container);
  _bindFilterEvents(container);
  _bindSearchEvents(container);

  // Watchlist rail navigation
  container.addEventListener('click', function(e) {
    var wl = e.target.closest('[data-wl-ticker]');
    if (wl && window.navigate) {
      var ticker = wl.getAttribute('data-wl-ticker');
      var row = null;
      for (var i = 0; i < _currentRows.length; i++) {
        if (_currentRows[i].ticker === ticker) { row = _currentRows[i]; break; }
      }
      var target = row ? row.routeTarget.replace('#', '') : ('report-' + ticker);
      window.navigate(target);
    }
    // Featured card navigation
    var rc = e.target.closest('[data-research-ticker]');
    if (rc && window.navigate) {
      var rticker = rc.getAttribute('data-research-ticker');
      var rrow = null;
      for (var j = 0; j < _currentRows.length; j++) {
        if (_currentRows[j].ticker === rticker) { rrow = _currentRows[j]; break; }
      }
      var rtarget = rrow ? rrow.routeTarget.replace('#', '') : ('report-' + rticker);
      window.navigate(rtarget);
    }
  });

  on('stock:updated', function(evt) {
    _handleStockUpdate(evt.ticker);
  });

  var t1 = performance.now();
  if (t1 - t0 > 200) {
    console.warn('[Home] Initial render took ' + Math.round(t1 - t0) + 'ms (target: <200ms)');
  }
}

// Keep for backward compatibility (main.js imports and assigns to window).
export function sortCoverageTable() {}

// Keep for backward compatibility (live-data.js imports this).
export function renderFeaturedCard() { return ''; }

// Keep for backward compatibility (portfolio.js imports this).
export function buildCoverageData() {
  var result = {};
  var tickers = Object.keys(STOCK_DATA);
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    var d = STOCK_DATA[t];
    var price = d._livePrice != null ? d._livePrice : (d.price || 0);
    result[t] = {
      company: d.company,
      price: price,
      skew: (d._skew || { direction: 'balanced' }).direction,
      sector: d.sector
    };
  }
  return result;
}
