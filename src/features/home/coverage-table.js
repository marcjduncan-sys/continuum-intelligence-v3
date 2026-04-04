// ============================================================
// COVERAGE-TABLE.JS -- HTML renderer for the coverage table.
// Receives CoverageRow[] as arguments. No state access.
// All number formatting via src/lib/format.js.
// ============================================================

import { formatPrice, formatSignedPercent } from '../../lib/format.js';

var COLUMNS = [
  { key: 'ticker',         label: 'Stock',       sortable: true  },
  { key: 'sector',         label: 'Sector',      sortable: true  },
  { key: 'price',          label: 'Price',       sortable: true  },
  { key: 'dayChangePct',   label: '1D',          sortable: true  },
  { key: 'signal',         label: 'Verdict',     sortable: true  },
  { key: null,             label: 'Thesis Skew', sortable: false },
  { key: 'convictionPct',  label: 'Conviction',  sortable: true  },
  { key: 'freshnessHours', label: 'Updated',     sortable: true  },
  { key: null,             label: '',            sortable: false }
];

function _verdictTag(signal) {
  if (signal === 'upside')   return '<span class="tag green">Upside</span>';
  if (signal === 'downside') return '<span class="tag red">Downside</span>';
  return '<span class="tag amber">Balanced</span>';
}

function _verdictBadge(signal) {
  return '<span class="signal-badge signal-badge--' + signal + '">' +
    signal.charAt(0).toUpperCase() + signal.slice(1) +
    '</span>';
}

function _thesisSkew(signal, convictionPct) {
  var pct = convictionPct != null ? convictionPct : 0;
  var cls = signal === 'upside' ? 'pos' : signal === 'downside' ? 'neg' : 'neu';
  var strength = pct >= 80 ? 'Strong' : pct >= 60 ? 'Moderate' : 'Balanced';
  var label = signal === 'upside'
    ? (strength === 'Balanced' ? 'Upside skew' : strength + ' upside')
    : signal === 'downside'
    ? (strength === 'Balanced' ? 'Downside skew' : strength + ' downside')
    : 'Balanced skew';
  return '<span class="' + cls + '">' + label + '</span>';
}

function _convictionCell(convictionPct) {
  if (convictionPct == null) {
    return '<span class="metric-unavailable">--</span>';
  }
  var pct = Math.round(convictionPct);
  return '<div class="confidence-bar">' +
    '<div class="conf-track"><div class="conf-fill" style="width:' + pct + '%"></div></div>' +
    '<span class="conf-pct">' + pct + '%</span>' +
    '</div>';
}

function _updatedCell(freshnessHours) {
  var dotCls = (!isFinite(freshnessHours) || freshnessHours > 72) ? 'stale' : 'fresh';
  var label;
  if (!isFinite(freshnessHours)) {
    label = 'Unknown';
  } else if (freshnessHours < 24) {
    label = 'Today';
  } else {
    var days = Math.round(freshnessHours / 24);
    var d = new Date(Date.now() - days * 86400000);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    label = d.getDate() + ' ' + months[d.getMonth()];
  }
  return '<span class="status-dot ' + dotCls + '"></span> <span class="updated">' + label + '</span>';
}

function _changeClass(val) {
  if (val > 0) return 'pos';
  if (val < 0) return 'neg';
  return '';
}

/**
 * Render the <thead> HTML string with sortable column headers.
 * @param {string} sortColumn - active sort column key
 * @param {string} sortDirection - 'asc' | 'desc'
 * @returns {string}
 */
export function renderCoverageTableHeader(sortColumn, sortDirection) {
  var ths = COLUMNS.map(function(col) {
    var indicator = '';
    if (col.sortable && col.key && sortColumn === col.key) {
      indicator = '<span class="sort-indicator">' + (sortDirection === 'asc' ? '&#9650;' : '&#9660;') + '</span>';
    }
    var sortAttr = (col.sortable && col.key) ? ' data-sort-col="' + col.key + '"' : '';
    return '<th' + sortAttr + '>' + col.label + indicator + '</th>';
  }).join('');
  return '<thead><tr>' + ths + '</tr></thead>';
}

/**
 * Render a single <tr> HTML string for one CoverageRow.
 * @param {import('./home-selectors.js').CoverageRow} row
 * @returns {string}
 */
export function renderCoverageTableRow(row) {
  var chgCls = _changeClass(row.dayChangePct);
  var chgStr = formatSignedPercent(row.dayChangePct);

  return '<tr data-ticker="' + row.ticker + '">' +
    '<td><div class="td-ticker">' +
      '<div class="t-badge">' + row.ticker + '</div>' +
      '<div><div class="t-name">' + (row.name || row.ticker) + '</div>' +
      '<div class="t-sector">ASX: ' + row.ticker + '</div></div>' +
    '</div></td>' +
    '<td>' + (row.sector || '--') + '</td>' +
    '<td><span class="price-val" data-home-price="' + row.ticker + '">' + formatPrice(row.price) + '</span></td>' +
    '<td><span class="chg ' + chgCls + '" data-home-change="' + row.ticker + '">' + chgStr + '</span></td>' +
    '<td>' + _verdictTag(row.signal) + '</td>' +
    '<td>' + _thesisSkew(row.signal, row.convictionPct) + '</td>' +
    '<td>' + _convictionCell(row.convictionPct) + '</td>' +
    '<td>' + _updatedCell(row.freshnessHours) + '</td>' +
    '<td><button class="tbl-action" data-action-ticker="' + row.ticker + '">View</button></td>' +
    '</tr>';
}

/**
 * Render all <tr> strings concatenated.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @returns {string}
 */
export function renderCoverageTableBody(rows) {
  if (!rows || rows.length === 0) {
    return '<tr><td colspan="9" class="table-empty">No coverage names match the current filters.</td></tr>';
  }
  return rows.map(renderCoverageTableRow).join('');
}

/**
 * Render the filter bar HTML.
 * @param {object} homeState
 * @returns {string}
 */
export function renderFilterBar(homeState) {
  function chip(value, active, group) {
    var cls = 'filter-chip ci-chip' + (active ? ' active' : '');
    return '<button class="' + cls + '" data-filter-group="' + group + '" data-filter-value="' + value + '">' + value.charAt(0).toUpperCase() + value.slice(1) + '</button>';
  }

  var signalChips = ['all', 'upside', 'balanced', 'downside'].map(function(v) {
    return chip(v, homeState.filterSignal === v, 'signal');
  }).join('');

  var stalenessChips = ['all', 'fresh', 'stale'].map(function(v) {
    return chip(v, homeState.filterStaleness === v, 'staleness');
  }).join('');

  var extractionChips = ['all', 'ready', 'failed', 'missing'].map(function(v) {
    return chip(v, homeState.filterExtraction === v, 'extraction');
  }).join('');

  return '<div class="filter-bar">' +
    '<div class="filter-group"><span class="filter-group__label ci-micro">Signal</span>' + signalChips + '</div>' +
    '<div class="filter-group"><span class="filter-group__label ci-micro">Freshness</span>' + stalenessChips + '</div>' +
    '<div class="filter-group"><span class="filter-group__label ci-micro">Extraction</span>' + extractionChips + '</div>' +
    '<div class="filter-group filter-group--search">' +
      '<input class="filter-search" type="search" placeholder="Search ticker or company..." value="' + (homeState.searchQuery || '') + '" data-filter-search />' +
    '</div>' +
    '</div>';
}

/**
 * Render the full table HTML including filter bar, thead, and tbody.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @param {object} homeState
 * @returns {string}
 */
export function renderCoverageTable(rows, homeState) {
  return renderFilterBar(homeState) +
    '<div class="coverage-wrap">' +
    '<table class="coverage-table ci-table">' +
    renderCoverageTableHeader(homeState.sortColumn, homeState.sortDirection) +
    '<tbody class="coverage-tbody">' +
    renderCoverageTableBody(rows) +
    '</tbody>' +
    '</table>' +
    '</div>';
}
