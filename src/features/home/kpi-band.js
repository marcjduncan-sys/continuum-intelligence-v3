// ============================================================
// KPI-BAND.JS -- Compact KPI band for the Home page.
// Renders six metric cards above the coverage table.
// Pure renderer: receives rows and batchStatus as arguments.
// ============================================================

import { formatPrice, formatSignedPercent } from '../../lib/format.js';

/**
 * Render the KPI band HTML string.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @param {object} batchStatus - BATCH_STATUS object
 * @returns {string}
 */
export function renderKpiBand(rows, batchStatus) {
  if (!rows) rows = [];
  var bs = batchStatus || {};

  // 1. Portfolio value -- sum of prices across coverage (market indicator proxy)
  var totalValue = 0;
  for (var i = 0; i < rows.length; i++) {
    totalValue += (rows[i].price || 0);
  }

  // 2. Day P&L direction -- net sum of dayChangePct (signed, directional indicator)
  var netChange = 0;
  for (var i = 0; i < rows.length; i++) {
    netChange += (rows[i].dayChangePct || 0);
  }
  var netChangeStr = formatSignedPercent(netChange / Math.max(rows.length, 1));
  var netChangeClass = netChange > 0 ? 'kpi-card__value--green' : netChange < 0 ? 'kpi-card__value--red' : '';

  // 3. Signal changes -- count rows where signalChanged is true
  var signalChangedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].signalChanged) signalChangedCount++;
  }

  // 4. Stale names -- count rows where freshnessHours > 48
  var staleCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].freshnessHours > 48) staleCount++;
  }
  var staleClass = staleCount > 0 ? 'kpi-card__value--amber' : '';

  // 5. Coverage health -- ready vs total
  var readyCount = 0;
  var failedCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].workstationStatus === 'ready') readyCount++;
    if (rows[i].workstationStatus === 'failed') failedCount++;
  }
  var total = rows.length;
  var healthDelta = failedCount > 0 ? failedCount + ' failed' : staleCount + ' stale';

  // 6. Top mover -- row with largest absolute dayChangePct
  var topMover = null;
  var topAbs = -1;
  for (var i = 0; i < rows.length; i++) {
    var abs = Math.abs(rows[i].dayChangePct || 0);
    if (abs > topAbs) { topAbs = abs; topMover = rows[i]; }
  }
  var topMoverStr = topMover ? (topMover.ticker + ' ' + formatSignedPercent(topMover.dayChangePct)) : '--';
  var topMoverClass = topMover && topMover.dayChangePct > 0 ? 'kpi-card__value--green' : topMover && topMover.dayChangePct < 0 ? 'kpi-card__value--red' : '';

  function card(label, value, valueCls, delta) {
    return '<div class="kpi-card">' +
      '<div class="kpi-card__label">' + label + '</div>' +
      '<div class="kpi-card__value ' + (valueCls || '') + '">' + value + '</div>' +
      '<div class="kpi-card__delta">' + (delta || '') + '</div>' +
      '</div>';
  }

  return '<div class="kpi-band">' +
    card('Coverage', total + ' names', '', readyCount + ' ready') +
    card('Avg Move', netChangeStr, netChangeClass, 'day change avg') +
    card('Signal Changes', signalChangedCount + ' of ' + total, '', 'since last session') +
    card('Stale Names', staleCount, staleClass, 'of ' + total + ' covered') +
    card('Extractions', readyCount + ' / ' + total, readyCount === total ? 'kpi-card__value--green' : '', healthDelta) +
    card('Top Mover', topMoverStr, topMoverClass, 'largest abs move') +
    '</div>';
}
