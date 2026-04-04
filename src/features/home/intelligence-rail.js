// ============================================================
// INTELLIGENCE-RAIL.JS -- Right rail for the Home page.
// Four collapsible sections: Alerts, Feed, Signals, Coverage health.
// Pure renderer. No DOM access during render.
// ============================================================

import { formatSignedPercent } from '../../lib/format.js';

/**
 * Render a single rail section using ci-rail-card markup.
 * @param {string} key - section identifier
 * @param {string} title - display title
 * @param {number|null} count - badge count (null = hide badge)
 * @param {string} content - inner HTML
 * @returns {string}
 */
function _railSection(key, title, count, content) {
  var badge = count != null
    ? '<span class="ci-badge rail-section__count">' + count + '</span>'
    : '';
  return '<div class="ci-rail-card rail-section" data-rail-section="' + key + '">' +
    '<div class="ci-rail-card-head rail-section__header">' +
      '<span class="ci-rail-title rail-section__title">' + title + '</span>' +
      badge +
      '<button class="ci-action-btn rail-section__toggle" aria-expanded="true">&#9650;</button>' +
    '</div>' +
    '<div class="ci-rail-card-body rail-section__content">' + content + '</div>' +
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
    var iconCls = 'ci-alert-icon--amber';
    if (flags.indexOf('signal-changed') !== -1) {
      msg = 'Signal changed to ' + row.signal.charAt(0).toUpperCase() + row.signal.slice(1);
      iconCls = row.signal === 'upside' ? 'ci-alert-icon--up' : row.signal === 'downside' ? 'ci-alert-icon--down' : 'ci-alert-icon--amber';
    } else if (flags.indexOf('imminent-catalyst') !== -1) {
      msg = row.signal.charAt(0).toUpperCase() + row.signal.slice(1) + ' thesis, catalyst within 3 days';
      iconCls = 'ci-alert-icon--amber';
    } else if (flags.indexOf('stale-extraction') !== -1) {
      msg = row.signal.charAt(0).toUpperCase() + row.signal.slice(1) + ' signal and stale extraction';
      iconCls = 'ci-alert-icon--amber';
    } else if (flags.indexOf('stale-research') !== -1) {
      msg = 'Research stale (> 72h)';
      iconCls = 'ci-alert-icon--amber';
    } else if (flags.indexOf('large-move') !== -1) {
      msg = 'Large move: ' + formatSignedPercent(row.dayChangePct);
      iconCls = row.dayChangePct > 0 ? 'ci-alert-icon--up' : 'ci-alert-icon--down';
    } else {
      msg = flags[0];
    }
    return '<div class="ci-alert-item">' +
      '<div class="ci-alert-icon ' + iconCls + '">!</div>' +
      '<div class="ci-alert-text">' +
        '<span class="ci-ticker-badge rail-alert-item__ticker">' + row.ticker + '</span> ' +
        '<span class="rail-alert-item__msg">' + msg + '</span>' +
      '</div>' +
      '</div>';
  });
  return items.join('');
}

/**
 * Build signals content -- portfolio signal distribution.
 * @param {import('./home-selectors.js').CoverageRow[]} rows
 * @returns {string}
 */
function _signalsContent(rows) {
  var upside = 0, balanced = 0, downside = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].signal === 'upside') upside++;
    else if (rows[i].signal === 'balanced') balanced++;
    else if (rows[i].signal === 'downside') downside++;
  }

  return '<div class="rail-signal-dist">' +
    '<div class="ci-signal-row rail-signal-row">' +
      '<span class="signal-badge signal-badge--upside ci-signal-label">Upside</span>' +
      '<span class="ci-signal-count rail-signal-count">' + upside + '</span>' +
    '</div>' +
    '<div class="ci-signal-row rail-signal-row">' +
      '<span class="signal-badge signal-badge--balanced ci-signal-label">Balanced</span>' +
      '<span class="ci-signal-count rail-signal-count">' + balanced + '</span>' +
    '</div>' +
    '<div class="ci-signal-row rail-signal-row">' +
      '<span class="signal-badge signal-badge--downside ci-signal-label">Downside</span>' +
      '<span class="ci-signal-count rail-signal-count">' + downside + '</span>' +
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
 * @param {string|null} selectedTicker - currently selected ticker (deferred)
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
