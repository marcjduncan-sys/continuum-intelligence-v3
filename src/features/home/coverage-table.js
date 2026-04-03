// ============================================================
// COVERAGE-TABLE.JS -- HTML renderer for the coverage table.
// Receives CoverageRow[] as arguments. No state access.
// All number formatting via src/lib/format.js.
// ============================================================

import { formatPrice, formatSignedPercent } from '../../lib/format.js';

var COLUMNS = [
  { key: 'ticker',            label: 'Ticker',     sortable: true  },
  { key: 'name',              label: 'Company',    sortable: true  },
  { key: 'price',             label: 'Price',      sortable: true  },
  { key: 'dayChangePct',      label: 'Day',        sortable: true  },
  { key: 'signal',            label: 'Signal',     sortable: true  },
  { key: 'convictionPct',     label: 'Conviction', sortable: true  },
  { key: 'ewpVsSpotPct',      label: 'EWP/Spot',   sortable: true  },
  { key: 'freshnessHours',    label: 'Freshness',  sortable: true  },
  { key: 'dtc',               label: 'DTC',        sortable: true  },
  { key: 'attentionScore',    label: 'Attention',  sortable: true  }
];

function _signalBadge(signal) {
  return '<span class="signal-badge signal-badge--' + signal + '">' +
    signal.charAt(0).toUpperCase() + signal.slice(1) +
    '</span>';
}

function _convictionCell(convictionPct) {
  if (convictionPct == null) {
    return '<span class="metric-unavailable">--</span>';
  }
  var pct = Math.round(convictionPct);
  return '<div class="conviction-bar">' +
    '<div class="conviction-bar__fill" style="width:' + pct + '%"></div>' +
    '<span class="conviction-bar__label">' + pct + '%</span>' +
    '</div>';
}

function _freshnessCell(freshnessHours) {
  if (!isFinite(freshnessHours)) {
    return '<span class="freshness-badge freshness-badge--red">Stale</span>';
  }
  if (freshnessHours > 72) {
    return '<span class="freshness-badge freshness-badge--red">' + Math.round(freshnessHours / 24) + 'd</span>';
  }
  if (freshnessHours > 48) {
    return '<span class="freshness-badge freshness-badge--amber">' + Math.round(freshnessHours) + 'h</span>';
  }
  return '<span class="freshness-badge freshness-badge--green">' + Math.round(freshnessHours) + 'h</span>';
}

function _dtcCell(dtc) {
  if (dtc == null) return '<span class="metric-unavailable">--</span>';
  if (dtc <= 3) return '<span class="dtc-imminent">' + dtc + 'd</span>';
  if (dtc <= 7) return '<span class="dtc-soon">' + dtc + 'd</span>';
  return '<span>' + dtc + 'd</span>';
}

function _changeClass(val) {
  if (val > 0) return 'td-change--positive';
  if (val < 0) return 'td-change--negative';
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
    if (col.sortable && sortColumn === col.key) {
      indicator = '<span class="sort-indicator">' + (sortDirection === 'asc' ? '&#9650;' : '&#9660;') + '</span>';
    }
    var sortAttr = col.sortable ? ' data-sort-col="' + col.key + '"' : '';
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
  var changeClass = _changeClass(row.dayChangePct);
  var ewpStr = row.ewpVsSpotPct != null
    ? formatSignedPercent(row.ewpVsSpotPct)
    : '<span class="metric-unavailable">--</span>';

  return '<tr data-ticker="' + row.ticker + '">' +
    '<td class="td-ticker">' + row.ticker + '</td>' +
    '<td class="td-name">' + row.name + '</td>' +
    '<td class="td-price" data-home-price="' + row.ticker + '">' + formatPrice(row.price) + '</td>' +
    '<td class="td-change ' + changeClass + '" data-home-change="' + row.ticker + '">' + formatSignedPercent(row.dayChangePct) + '</td>' +
    '<td class="td-signal">' + _signalBadge(row.signal) + '</td>' +
    '<td class="td-conviction">' + _convictionCell(row.convictionPct) + '</td>' +
    '<td class="td-ewp">' + ewpStr + '</td>' +
    '<td class="td-freshness">' + _freshnessCell(row.freshnessHours) + '</td>' +
    '<td class="td-dtc">' + _dtcCell(row.dtc) + '</td>' +
    '<td class="td-attention">' + Math.round(row.attentionScore) + '</td>' +
    '</tr>';
}

/**
 * Render all <tr> strings concatenated.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @returns {string}
 */
export function renderCoverageTableBody(rows) {
  if (!rows || rows.length === 0) {
    return '<tr><td colspan="10" class="table-empty">No coverage names match the current filters.</td></tr>';
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
    var cls = 'filter-chip' + (active ? ' active' : '');
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
    '<div class="filter-group"><span class="filter-group__label">Signal</span>' + signalChips + '</div>' +
    '<div class="filter-group"><span class="filter-group__label">Freshness</span>' + stalenessChips + '</div>' +
    '<div class="filter-group"><span class="filter-group__label">Extraction</span>' + extractionChips + '</div>' +
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
    '<div class="coverage-table-wrap">' +
    '<table class="coverage-table">' +
    renderCoverageTableHeader(homeState.sortColumn, homeState.sortDirection) +
    '<tbody class="coverage-tbody">' +
    renderCoverageTableBody(rows) +
    '</tbody>' +
    '</table>' +
    '</div>';
}
