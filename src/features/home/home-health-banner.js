// ============================================================
// HOME-HEALTH-BANNER.JS -- Coverage health banner.
// Renders slim or persistent banner when extraction completeness < 95%.
// Returns empty string when coverage is healthy.
// ============================================================

/**
 * Render a health banner based on batch completeness.
 * @param {object} batchStatus - BATCH_STATUS object
 * @param {number} totalTickers - total tickers in coverage universe
 * @returns {string} HTML string or empty string
 */
export function renderHealthBanner(batchStatus, totalTickers) {
  var bs = batchStatus || {};
  var total = totalTickers || bs.totalTickers || 0;

  // No banner if status is unknown or no batch has run
  if (!bs.status || bs.status === 'unknown' || total === 0) return '';

  var succeeded = bs.succeeded || 0;
  var completeness = total > 0 ? succeeded / total : 0;

  if (completeness >= 0.95) return '';

  var isCritical = completeness < 0.85;
  var severity = isCritical ? 'critical' : 'warning';
  var refreshed = succeeded + ' / ' + total + ' refreshed';

  return '<div class="ci-callout' + (isCritical ? ' ci-callout--critical' : '') + ' health-banner health-banner--' + severity + '">' +
    'Coverage update partial: ' + refreshed +
    '<button class="ci-callout-action health-banner__action" data-health-action="show-failed">Show affected names</button>' +
    '</div>';
}
