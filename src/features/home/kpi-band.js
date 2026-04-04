// ============================================================
// KPI-BAND.JS -- Compact stat ribbon for the Home page.
// Renders six metric cards above the coverage table.
// Pure renderer: receives rows and batchStatus as arguments.
// ============================================================

import { formatPrice, formatSignedPercent } from '../../lib/format.js';

/**
 * Render the KPI band / stat ribbon HTML string.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @param {object} batchStatus - BATCH_STATUS object
 * @returns {string}
 */
export function renderKpiBand(rows, batchStatus) {
  if (!rows) rows = [];
  var bs = batchStatus || {};

  // 1. Coverage count
  var total = rows.length;

  // 2. Avg day change
  var netChange = 0;
  for (var i = 0; i < rows.length; i++) {
    netChange += (rows[i].dayChangePct || 0);
  }
  var netChangeStr = formatSignedPercent(netChange / Math.max(rows.length, 1));
  var netChangeDelta = netChange > 0 ? 'delta--up' : netChange < 0 ? 'delta--down' : '';

  // 3. Signal changes
  var signalChangedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].signalChanged) signalChangedCount++;
  }

  // 4. Stale names
  var staleCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].freshnessHours > 48) staleCount++;
  }

  // 5. Extraction health
  var readyCount = 0;
  var failedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].workstationStatus === 'ready') readyCount++;
    if (rows[i].workstationStatus === 'failed') failedCount++;
  }
  var healthDelta = failedCount > 0 ? failedCount + ' failed' : staleCount + ' stale';

  // 6. Top mover
  var topMover = null;
  var topAbs = -1;
  for (var i = 0; i < rows.length; i++) {
    var abs = Math.abs(rows[i].dayChangePct || 0);
    if (abs > topAbs) { topAbs = abs; topMover = rows[i]; }
  }
  var topMoverStr = topMover ? (topMover.ticker + ' ' + formatSignedPercent(topMover.dayChangePct)) : '--';
  var topMoverDelta = topMover && topMover.dayChangePct > 0 ? 'delta--up' : topMover && topMover.dayChangePct < 0 ? 'delta--down' : '';

  function stat(label, value, deltaCls, deltaText) {
    return '<div class="ci-stat kpi-card">' +
      '<div class="ci-stat-label">' + label + '</div>' +
      '<div class="ci-stat-value">' + value + '</div>' +
      '<div class="ci-stat-delta ci-stat-delta--' + (deltaCls || '') + '">' + (deltaText || '') + '</div>' +
      '</div>';
  }

  return '<div class="ci-stat-ribbon kpi-band">' +
    stat('Coverage', total + ' names', '', readyCount + ' ready') +
    stat('Avg Move', netChangeStr, netChangeDelta, 'day change avg') +
    stat('Signal Changes', signalChangedCount + ' of ' + total, '', 'since last session') +
    stat('Stale Names', staleCount, staleCount > 0 ? 'down' : '', 'of ' + total + ' covered') +
    stat('Extractions', readyCount + ' / ' + total, readyCount === total ? 'up' : '', healthDelta) +
    stat('Top Mover', topMoverStr, topMoverDelta, 'largest abs move') +
    '</div>';
}
