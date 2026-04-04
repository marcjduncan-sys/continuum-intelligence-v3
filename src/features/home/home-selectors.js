// ============================================================
// HOME-SELECTORS.JS -- Pure selector layer for the Home page.
// Transforms raw state into sorted, filtered CoverageRow arrays.
// No DOM access. No side effects.
// ============================================================

import { computeSkewScore } from '../../lib/dom.js';

/**
 * Signal taxonomy constants.
 * Used across the entire Home page. No other signal vocabulary is permitted.
 */
export const SIGNALS = ['upside', 'balanced', 'downside'];

/**
 * Compute attention score for a single ticker.
 * Higher score = needs more attention. Determines default sort order.
 *
 * @param {object} params
 * @param {boolean} params.signalChanged
 * @param {string} params.workstationStatus - 'ready'|'stale'|'failed'|'missing'|'generating'
 * @param {number} params.freshnessHours
 * @param {number|null} params.dtc
 * @param {number|null} params.ewpVsSpotPct
 * @param {number} params.dayChangePct
 * @returns {number}
 */
export function computeAttentionScore({ signalChanged, workstationStatus, freshnessHours, dtc, ewpVsSpotPct, dayChangePct }) {
  return (
    (signalChanged ? 4 : 0) +
    (workstationStatus === 'failed' ? 4 : 0) +
    (freshnessHours > 72 ? 3 : freshnessHours > 48 ? 2 : 0) +
    (dtc != null && dtc <= 3 ? 3 : dtc != null && dtc <= 7 ? 2 : 0) +
    (ewpVsSpotPct != null ? Math.min(Math.abs(ewpVsSpotPct) / 5, 3) : 0) +
    (Math.abs(dayChangePct) >= 4 ? 1 : 0)
  );
}

/**
 * @typedef {object} CoverageRow
 * @property {string} ticker
 * @property {string} name
 * @property {number} price
 * @property {number} dayChangePct
 * @property {string} signal - 'upside' | 'balanced' | 'downside'
 * @property {number|null} convictionPct - null if workstation payload unavailable
 * @property {number|null} ewpVsSpotPct - null if unavailable
 * @property {number} freshnessHours
 * @property {number|null} dtc - days to catalyst, null if unavailable
 * @property {string|null} catalystLabel - null if unavailable
 * @property {string} workstationStatus - 'ready'|'stale'|'failed'|'missing'|'generating'
 * @property {string} routeTarget - '#workstation-TICKER' or '#report-TICKER'
 * @property {boolean} signalChanged
 * @property {number} attentionScore
 * @property {string[]} alertFlags
 */

/**
 * Build coverage rows from all state sources.
 * Single entry point for the Home page data layer.
 * Pure function: no DOM access, no side effects.
 *
 * @param {object} sources
 * @param {object} sources.STOCK_DATA
 * @param {object} sources.REFERENCE_DATA
 * @param {object} sources.FRESHNESS_DATA
 * @param {object} sources.SNAPSHOT_DATA
 * @param {object} sources.WORKSTATION_DATA
 * @param {object} sources.WORKSTATION_STATUS
 * @param {object} sources.BATCH_STATUS
 * @returns {CoverageRow[]}
 */
export function buildCoverageRows(sources) {
  const { STOCK_DATA, FRESHNESS_DATA, WORKSTATION_DATA, WORKSTATION_STATUS } = sources;
  const tickers = Object.keys(STOCK_DATA || {});

  return tickers.map(function(ticker) {
    const stock = STOCK_DATA[ticker] || {};
    const freshness = (FRESHNESS_DATA || {})[ticker] || {};
    const wsData = (WORKSTATION_DATA || {})[ticker];
    const wsStatus = (WORKSTATION_STATUS || {})[ticker];

    // Price
    const price = stock._livePrice != null ? stock._livePrice : (stock.price || 0);

    // Day change percentage
    var dayChangePct = 0;
    if (typeof stock.priceChange === 'number') {
      dayChangePct = stock.priceChange;
    } else if (typeof stock.previousClose === 'number' && stock.previousClose !== 0) {
      dayChangePct = ((price - stock.previousClose) / stock.previousClose) * 100;
    }

    // Signal from skew score
    const skew = computeSkewScore(stock);
    const signal = skew.direction || 'balanced';

    // Conviction from workstation base case scenario
    var convictionPct = null;
    if (wsData && Array.isArray(wsData.scenarios)) {
      for (var i = 0; i < wsData.scenarios.length; i++) {
        if (wsData.scenarios[i].case_type === 'base') {
          var prob = wsData.scenarios[i].probability;
          if (typeof prob === 'number') {
            convictionPct = prob * 100;
          }
          break;
        }
      }
    }

    // EWP vs spot
    var ewpVsSpotPct = null;
    if (wsData && typeof wsData.ewp === 'number' && price > 0) {
      ewpVsSpotPct = ((wsData.ewp - price) / price) * 100;
    }

    // Freshness hours
    var freshnessHours = 0;
    var daysSince = freshness.daysSinceReview;
    if (typeof daysSince === 'number') {
      freshnessHours = daysSince >= 9999 ? Infinity : daysSince * 24;
    }

    // Days to catalyst
    var dtc = null;
    if (typeof freshness.nearestCatalystDays === 'number') {
      dtc = freshness.nearestCatalystDays;
    }

    // Catalyst label
    var catalystLabel = freshness.nearestCatalyst || null;

    // Workstation status
    var workstationStatus = wsStatus ? (wsStatus.status || 'missing') : 'missing';

    // Route target
    var routeTarget = wsData ? ('#workstation-' + ticker) : ('#report-' + ticker);

    // Signal changed (placeholder -- will be wired when signal history tracking exists)
    var signalChanged = false;

    // Attention score
    var attentionScore = computeAttentionScore({
      signalChanged: signalChanged,
      workstationStatus: workstationStatus,
      freshnessHours: freshnessHours,
      dtc: dtc,
      ewpVsSpotPct: ewpVsSpotPct,
      dayChangePct: dayChangePct
    });

    // Alert flags
    var alertFlags = [];
    if (signalChanged) alertFlags.push('signal-changed');
    if (workstationStatus === 'stale' || workstationStatus === 'failed') alertFlags.push('stale-extraction');
    if (dtc != null && dtc <= 3) alertFlags.push('imminent-catalyst');
    if (freshnessHours > 72) alertFlags.push('stale-research');
    if (Math.abs(dayChangePct) >= 4) alertFlags.push('large-move');

    return {
      ticker: ticker,
      name: stock.company || ticker,
      sector: stock.sector || '',
      price: price,
      dayChangePct: dayChangePct,
      signal: signal,
      convictionPct: convictionPct,
      ewpVsSpotPct: ewpVsSpotPct,
      freshnessHours: freshnessHours,
      dtc: dtc,
      catalystLabel: catalystLabel,
      workstationStatus: workstationStatus,
      routeTarget: routeTarget,
      signalChanged: signalChanged,
      attentionScore: attentionScore,
      alertFlags: alertFlags
    };
  });
}

/**
 * Sort coverage rows by a column.
 * @param {CoverageRow[]} rows
 * @param {string} column - column key from CoverageRow
 * @param {'asc'|'desc'} direction
 * @returns {CoverageRow[]} new sorted array (does not mutate input)
 */
export function sortCoverageRows(rows, column, direction) {
  var sorted = rows.slice();
  var factor = direction === 'asc' ? 1 : -1;

  sorted.sort(function(a, b) {
    var av = a[column];
    var bv = b[column];

    // Nulls sort last regardless of direction
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;

    if (typeof av === 'string' && typeof bv === 'string') {
      return factor * av.localeCompare(bv);
    }
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });

  return sorted;
}

/**
 * Filter coverage rows.
 * @param {CoverageRow[]} rows
 * @param {object} filters
 * @param {string} filters.signal - 'all' | 'upside' | 'balanced' | 'downside'
 * @param {string} filters.staleness - 'all' | 'fresh' | 'stale'
 * @param {string} filters.extraction - 'all' | 'ready' | 'stale' | 'failed' | 'missing'
 * @param {string} filters.searchQuery - ticker or name substring, case-insensitive
 * @returns {CoverageRow[]} new filtered array
 */
export function filterCoverageRows(rows, filters) {
  var signal = filters.signal || 'all';
  var staleness = filters.staleness || 'all';
  var extraction = filters.extraction || 'all';
  var search = (filters.searchQuery || '').toLowerCase();

  return rows.filter(function(row) {
    if (signal !== 'all' && row.signal !== signal) return false;
    if (staleness === 'fresh' && row.freshnessHours > 48) return false;
    if (staleness === 'stale' && row.freshnessHours <= 48) return false;
    if (extraction !== 'all' && row.workstationStatus !== extraction) return false;
    if (search) {
      var inTicker = row.ticker.toLowerCase().indexOf(search) !== -1;
      var inName = row.name.toLowerCase().indexOf(search) !== -1;
      if (!inTicker && !inName) return false;
    }
    return true;
  });
}

/**
 * Compute coverage health summary from rows.
 * @param {CoverageRow[]} rows - all rows (unfiltered)
 * @param {object} batchStatus - BATCH_STATUS object
 * @returns {{ total: number, ready: number, stale: number, failed: number, missing: number, generating: number, batchCompleteness: number, batchStatus: string }}
 */
export function computeCoverageHealth(rows, batchStatus) {
  var counts = { ready: 0, stale: 0, failed: 0, missing: 0, generating: 0 };

  rows.forEach(function(row) {
    var s = row.workstationStatus;
    if (counts[s] !== undefined) {
      counts[s]++;
    }
  });

  var total = rows.length;
  var batchCompleteness = total > 0 ? counts.ready / total : 0;

  return {
    total: total,
    ready: counts.ready,
    stale: counts.stale,
    failed: counts.failed,
    missing: counts.missing,
    generating: counts.generating,
    batchCompleteness: batchCompleteness,
    batchStatus: (batchStatus && batchStatus.status) || 'unknown'
  };
}
