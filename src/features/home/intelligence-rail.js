// ============================================================
// INTELLIGENCE-RAIL.JS -- Right rail for the Home page.
// Four collapsible sections: Alerts, Feed, Signals, Coverage health.
// Pure renderer. No DOM access during render.
// ============================================================

import { formatSignedPercent } from '../../lib/format.js';

/**
 * Render a single rail section.
 * @param {string} key - section identifier
 * @param {string} title - display title
 * @param {number|null} count - badge count (null = hide badge)
 * @param {string} content - inner HTML
 * @returns {string}
 */
function _railSection(key, title, count, content) {
  var badge = count != null ? '<span class="rail-section__count">' + count + '</span>' : '';
  return '<div class="rail-section" data-rail-section="' + key + '">' +
    '<div class="rail-section__header">' +
      '<span class="rail-section__title">' + title + '</span>' +
      badge +
      '<button class="rail-section__toggle" aria-expanded="true">&#9650;</button>' +
    '</div>' +
    '<div class="rail-section__content">' + content + '</div>' +
    '</div>';
}

/**
 * Build alert items from rows with alertFlags.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @returns {string}
 */
function _alertsContent(rows) {
  var alertRows = rows.filter(function(r) { return r.alertFlags && r.alertFlags.length > 0; });
  if (alertRows.length === 0) {
    return '<div class="rail-empty">No active alerts.</div>';
  }
  var items = alertRows.slice(0, 5).map(function(row) {
    var flags = row.alertFlags;
    var msg = '';
    if (flags.indexOf('signal-changed') !== -1) {
      msg = 'Signal changed to ' + row.signal.charAt(0).toUpperCase() + row.signal.slice(1);
    } else if (flags.indexOf('imminent-catalyst') !== -1) {
      msg = row.signal.charAt(0).toUpperCase() + row.signal.slice(1) + ' thesis, catalyst within 3 days';
    } else if (flags.indexOf('stale-extraction') !== -1) {
      msg = row.signal.charAt(0).toUpperCase() + row.signal.slice(1) + ' signal and stale extraction';
    } else if (flags.indexOf('stale-research') !== -1) {
      msg = 'Research stale (> 72h)';
    } else if (flags.indexOf('large-move') !== -1) {
      msg = 'Large move: ' + formatSignedPercent(row.dayChangePct);
    } else {
      msg = flags[0];
    }
    return '<div class="rail-alert-item">' +
      '<span class="rail-alert-item__ticker">' + row.ticker + '</span>' +
      '<span class="rail-alert-item__msg">' + msg + '</span>' +
      '</div>';
  });
  return items.join('');
}

/**
 * Build signals content (portfolio distribution, no per-ticker selection in v1).
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @returns {string}
 */
function _signalsContent(rows) {
  var upside = 0, balanced = 0, downside = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].signal === 'upside') upside++;
    else if (rows[i].balanced === 'balanced' || rows[i].signal === 'balanced') balanced++;
    else if (rows[i].signal === 'downside') downside++;
  }
  // Recount balanced properly
  balanced = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].signal === 'balanced') balanced++;
  }

  return '<div class="rail-signal-dist">' +
    '<div class="rail-signal-row">' +
      '<span class="signal-badge signal-badge--upside">Upside</span>' +
      '<span class="rail-signal-count">' + upside + '</span>' +
    '</div>' +
    '<div class="rail-signal-row">' +
      '<span class="signal-badge signal-badge--balanced">Balanced</span>' +
      '<span class="rail-signal-count">' + balanced + '</span>' +
    '</div>' +
    '<div class="rail-signal-row">' +
      '<span class="signal-badge signal-badge--downside">Downside</span>' +
      '<span class="rail-signal-count">' + downside + '</span>' +
    '</div>' +
    '</div>';
}

/**
 * Build coverage health content.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @param {object} batchStatus
 * @returns {string}
 */
function _healthContent(rows, batchStatus) {
  var bs = batchStatus || {};
  var ready = 0, stale = 0, failed = 0, missing = 0;
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i].workstationStatus;
    if (s === 'ready') ready++;
    else if (s === 'stale') stale++;
    else if (s === 'failed') failed++;
    else if (s === 'missing') missing++;
  }

  var completedAt = bs.completedAt ? 'Last batch: ' + bs.completedAt : 'No batch run yet';

  return '<div class="rail-health">' +
    '<div class="rail-health-row"><span>Refreshed</span><span class="rail-health-value">' + ready + '</span></div>' +
    '<div class="rail-health-row"><span>Stale</span><span class="rail-health-value rail-health-value--amber">' + stale + '</span></div>' +
    '<div class="rail-health-row"><span>Failed</span><span class="rail-health-value rail-health-value--red">' + failed + '</span></div>' +
    '<div class="rail-health-row"><span>Missing</span><span class="rail-health-value rail-health-value--muted">' + missing + '</span></div>' +
    '<div class="rail-health-meta">' + completedAt + '</div>' +
    '</div>';
}

/**
 * Render the full intelligence rail HTML string.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @param {object} batchStatus - BATCH_STATUS object
 * @param {string|null} selectedTicker - currently selected ticker (unused in v1, deferred to H5)
 * @returns {string}
 */
export function renderIntelligenceRail(rows, batchStatus, selectedTicker) {
  if (!rows) rows = [];
  var alertCount = rows.filter(function(r) { return r.alertFlags && r.alertFlags.length > 0; }).length;

  return '<aside class="intelligence-rail">' +
    _railSection('alerts', 'Alerts', alertCount, _alertsContent(rows)) +
    _railSection('feed', 'Feed', null, '<div class="rail-empty">No recent insights.</div>') +
    _railSection('signals', 'Signals', null, _signalsContent(rows)) +
    _railSection('coverage', 'Coverage Health', null, _healthContent(rows, batchStatus)) +
    '</aside>';
}
