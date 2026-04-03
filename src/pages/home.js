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
      // Update sort indicators in header
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
    var chip = e.target.closest('.filter-chip[data-filter-group]');
    if (!chip) return;
    var group = chip.getAttribute('data-filter-group');
    var value = chip.getAttribute('data-filter-value');
    if (group === 'signal') updateHomeState({ filterSignal: value });
    if (group === 'staleness') updateHomeState({ filterStaleness: value });
    if (group === 'extraction') updateHomeState({ filterExtraction: value });

    // Update active chip within the group
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

  // Patch price cell
  var priceEl = homePage.querySelector('[data-home-price="' + ticker + '"]');
  if (priceEl) {
    var { formatPrice, formatSignedPercent } = _getFormatFns();
    priceEl.textContent = formatPrice(price);
  }

  // Patch change cell
  var changeEl = homePage.querySelector('[data-home-change="' + ticker + '"]');
  if (changeEl) {
    var { formatSignedPercent: fsp } = _getFormatFns();
    changeEl.textContent = fsp(dayChangePct);
    changeEl.className = 'td-change ' + (dayChangePct > 0 ? 'td-change--positive' : dayChangePct < 0 ? 'td-change--negative' : '');
  }

  // Update cached row price for future re-renders
  for (var i = 0; i < _currentRows.length; i++) {
    if (_currentRows[i].ticker === ticker) {
      _currentRows[i].price = price;
      _currentRows[i].dayChangePct = dayChangePct;
      break;
    }
  }
}

// Lazy import to keep this module from requiring format.js at definition time.
// format.js is always available since it's bundled -- this just avoids circular-import risk.
function _getFormatFns() {
  // format.js functions are synchronously available; this is not async.
  // We call them inline via the module-level import in coverage-table.js.
  // For the live-patch case here, inline the formatting to avoid a second import.
  return {
    formatPrice: function(v) { return isNaN(v) ? '--' : v.toFixed(2); },
    formatSignedPercent: function(v) { return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'; }
  };
}

export function initHomePage() {
  var t0 = performance.now();

  resetHomeState();

  var container = document.getElementById('page-home');
  if (!container) return;

  _currentRows = buildCoverageRows(_buildSources());

  var state = getHomeState();
  var displayRows = _getFilteredSorted(state);

  container.innerHTML =
    '<div class="home-layout">' +
    '<div class="home-main">' +
    renderCoverageTable(displayRows, state) +
    '</div>' +
    '</div>';

  _bindTableEvents(container);
  _bindFilterEvents(container);
  _bindSearchEvents(container);

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
// Returns empty string -- featured cards are no longer rendered by home.js.
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
