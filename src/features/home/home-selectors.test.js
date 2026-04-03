import { describe, it, expect, vi } from 'vitest';
import {
  SIGNALS,
  computeAttentionScore,
  buildCoverageRows,
  sortCoverageRows,
  filterCoverageRows,
  computeCoverageHealth
} from './home-selectors.js';

// ---------------------------------------------------------------------------
// Shared fixtures (5 tickers covering all states)
// ---------------------------------------------------------------------------

function makeStockData() {
  return {
    BHP: { company: 'BHP Group', price: 45.20, previousClose: 44.80, hypotheses: [{ score: 8, direction: 'upside', title: 'Iron ore demand' }] },
    CBA: { company: 'Commonwealth Bank', price: 130.00, previousClose: 128.00, hypotheses: [{ score: -2, direction: 'downside', title: 'NIM compression' }] },
    CSL: { company: 'CSL Limited', price: 290.00, previousClose: 290.00, hypotheses: [] },
    FMG: { company: 'Fortescue', price: 18.50, previousClose: 18.50, hypotheses: [{ score: -8, direction: 'downside', title: 'Iron ore oversupply' }] },
    NAB: { company: 'National Australia Bank', price: 37.00, previousClose: 35.00, hypotheses: [{ score: 2, direction: 'upside', title: 'Cost cuts' }] }
  };
}

function makeFreshnessData() {
  return {
    BHP: { daysSinceReview: 1, nearestCatalystDays: 2, nearestCatalyst: 'FY results' },
    CBA: { daysSinceReview: 3, nearestCatalystDays: 10, nearestCatalyst: 'AGM' },
    CSL: { daysSinceReview: 5, nearestCatalystDays: null, nearestCatalyst: null },
    FMG: { daysSinceReview: 9999, nearestCatalystDays: null, nearestCatalyst: null },
    NAB: { daysSinceReview: 2, nearestCatalystDays: 6, nearestCatalyst: 'Rate decision' }
  };
}

function makeWorkstationData() {
  return {
    BHP: {
      ewp: 56.55,
      scenarios: [
        { case_type: 'base', probability: 0.45 },
        { case_type: 'bull', probability: 0.25 },
        { case_type: 'bear', probability: 0.30 }
      ]
    },
    CBA: {
      ewp: 125.00,
      scenarios: [
        { case_type: 'base', probability: 0.50 }
      ]
    }
  };
}

function makeWorkstationStatus() {
  return {
    BHP: { status: 'ready', hasPayload: true, lastSuccessfulAt: '2026-04-01', lastAttemptAt: '2026-04-01', lastErrorCode: null, lastErrorSummary: null, payloadGeneratedAt: '2026-04-01' },
    CBA: { status: 'stale', hasPayload: true, lastSuccessfulAt: '2026-03-25', lastAttemptAt: '2026-03-25', lastErrorCode: null, lastErrorSummary: null, payloadGeneratedAt: '2026-03-25' },
    FMG: { status: 'failed', hasPayload: false, lastSuccessfulAt: null, lastAttemptAt: '2026-04-01', lastErrorCode: 'TIMEOUT', lastErrorSummary: 'timed out', payloadGeneratedAt: null }
    // CSL and NAB have no status entry -> workstationStatus = 'missing'
  };
}

function makeSources() {
  return {
    STOCK_DATA: makeStockData(),
    FRESHNESS_DATA: makeFreshnessData(),
    WORKSTATION_DATA: makeWorkstationData(),
    WORKSTATION_STATUS: makeWorkstationStatus(),
    BATCH_STATUS: { runId: 'run-001', startedAt: '2026-04-01', completedAt: '2026-04-01', totalTickers: 5, succeeded: 2, failed: 1, stale: 0, missing: 2, status: 'complete' }
  };
}

// ---------------------------------------------------------------------------
// computeAttentionScore
// ---------------------------------------------------------------------------

describe('computeAttentionScore', () => {
  const base = { signalChanged: false, workstationStatus: 'ready', freshnessHours: 0, dtc: null, ewpVsSpotPct: null, dayChangePct: 0 };

  it('all zero inputs returns 0', () => {
    expect(computeAttentionScore(base)).toBe(0);
  });

  it('signalChanged alone returns 4', () => {
    expect(computeAttentionScore({ ...base, signalChanged: true })).toBe(4);
  });

  it('workstationStatus failed returns 4', () => {
    expect(computeAttentionScore({ ...base, workstationStatus: 'failed' })).toBe(4);
  });

  it('freshnessHours 49 returns 2', () => {
    expect(computeAttentionScore({ ...base, freshnessHours: 49 })).toBe(2);
  });

  it('freshnessHours 73 returns 3', () => {
    expect(computeAttentionScore({ ...base, freshnessHours: 73 })).toBe(3);
  });

  it('dtc 2 returns 3', () => {
    expect(computeAttentionScore({ ...base, dtc: 2 })).toBe(3);
  });

  it('dtc 5 returns 2', () => {
    expect(computeAttentionScore({ ...base, dtc: 5 })).toBe(2);
  });

  it('dtc 8 returns 0', () => {
    expect(computeAttentionScore({ ...base, dtc: 8 })).toBe(0);
  });

  it('ewpVsSpotPct 15 returns 3 (capped at 3)', () => {
    expect(computeAttentionScore({ ...base, ewpVsSpotPct: 15 })).toBe(3);
  });

  it('ewpVsSpotPct 5 returns 1', () => {
    expect(computeAttentionScore({ ...base, ewpVsSpotPct: 5 })).toBe(1);
  });

  it('dayChangePct 5 returns 1', () => {
    expect(computeAttentionScore({ ...base, dayChangePct: 5 })).toBe(1);
  });

  it('dayChangePct 2 returns 0', () => {
    expect(computeAttentionScore({ ...base, dayChangePct: 2 })).toBe(0);
  });

  it('combined scenario: signalChanged + failed + 73h stale + dtc 2 = 14', () => {
    expect(computeAttentionScore({
      signalChanged: true,
      workstationStatus: 'failed',
      freshnessHours: 73,
      dtc: 2,
      ewpVsSpotPct: null,
      dayChangePct: 0
    })).toBe(14);
  });
});

// ---------------------------------------------------------------------------
// buildCoverageRows
// ---------------------------------------------------------------------------

describe('buildCoverageRows', () => {
  it('empty STOCK_DATA returns empty array', () => {
    const rows = buildCoverageRows({ STOCK_DATA: {}, FRESHNESS_DATA: {}, WORKSTATION_DATA: {}, WORKSTATION_STATUS: {}, BATCH_STATUS: {} });
    expect(rows).toEqual([]);
  });

  it('single ticker with full data returns correct CoverageRow shape', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { BHP: { company: 'BHP Group', price: 45.20, previousClose: 44.80, hypotheses: [{ score: 8, direction: 'upside', title: 'Iron ore' }] } },
      FRESHNESS_DATA: { BHP: { daysSinceReview: 1, nearestCatalystDays: 2, nearestCatalyst: 'FY results' } },
      WORKSTATION_DATA: { BHP: { ewp: 50.0, scenarios: [{ case_type: 'base', probability: 0.45 }] } },
      WORKSTATION_STATUS: { BHP: { status: 'ready' } },
      BATCH_STATUS: {}
    });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.ticker).toBe('BHP');
    expect(row.name).toBe('BHP Group');
    expect(row.price).toBe(45.20);
    expect(row.signal).toBe('upside');
    expect(row.convictionPct).toBeCloseTo(45, 0);
    expect(row.ewpVsSpotPct).toBeCloseTo(((50.0 - 45.20) / 45.20) * 100, 1);
    expect(row.freshnessHours).toBe(24);
    expect(row.dtc).toBe(2);
    expect(row.catalystLabel).toBe('FY results');
    expect(row.workstationStatus).toBe('ready');
    expect(row.routeTarget).toBe('#workstation-BHP');
    expect(row.signalChanged).toBe(false);
    expect(typeof row.attentionScore).toBe('number');
    expect(Array.isArray(row.alertFlags)).toBe(true);
  });

  it('ticker with no workstation data returns null convictionPct and null ewpVsSpotPct', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { CSL: { company: 'CSL', price: 290, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].convictionPct).toBeNull();
    expect(rows[0].ewpVsSpotPct).toBeNull();
    expect(rows[0].routeTarget).toBe('#report-CSL');
  });

  it('ticker with no freshness data defaults to zero freshnessHours and null dtc', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { NAB: { company: 'NAB', price: 37, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].freshnessHours).toBe(0);
    expect(rows[0].dtc).toBeNull();
    expect(rows[0].catalystLabel).toBeNull();
  });

  it('routeTarget is #workstation-TICKER when WORKSTATION_DATA has payload', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { BHP: { company: 'BHP', price: 45, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: { BHP: { ewp: 50, scenarios: [] } },
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].routeTarget).toBe('#workstation-BHP');
  });

  it('routeTarget is #report-TICKER when WORKSTATION_DATA has no payload', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { FMG: { company: 'Fortescue', price: 18, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].routeTarget).toBe('#report-FMG');
  });

  it('workstationStatus is missing when WORKSTATION_STATUS has no entry', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { CSL: { company: 'CSL', price: 290, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].workstationStatus).toBe('missing');
  });

  it('uses _livePrice over price when available', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { BHP: { company: 'BHP', price: 45, _livePrice: 46.5, hypotheses: [] } },
      FRESHNESS_DATA: {},
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].price).toBe(46.5);
  });

  it('daysSinceReview 9999 yields Infinity freshnessHours', () => {
    const rows = buildCoverageRows({
      STOCK_DATA: { FMG: { company: 'FMG', price: 18, hypotheses: [] } },
      FRESHNESS_DATA: { FMG: { daysSinceReview: 9999 } },
      WORKSTATION_DATA: {},
      WORKSTATION_STATUS: {},
      BATCH_STATUS: {}
    });
    expect(rows[0].freshnessHours).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// sortCoverageRows
// ---------------------------------------------------------------------------

describe('sortCoverageRows', () => {
  const rows = [
    { ticker: 'FMG', name: 'Fortescue', price: 18.5, attentionScore: 5, convictionPct: null, signal: 'downside' },
    { ticker: 'BHP', name: 'BHP Group', price: 45.2, attentionScore: 10, convictionPct: 45, signal: 'upside' },
    { ticker: 'CSL', name: 'CSL Limited', price: 290, attentionScore: 2, convictionPct: 60, signal: 'balanced' }
  ];

  it('sorts by attentionScore descending', () => {
    const sorted = sortCoverageRows(rows, 'attentionScore', 'desc');
    expect(sorted[0].ticker).toBe('BHP');
    expect(sorted[1].ticker).toBe('FMG');
    expect(sorted[2].ticker).toBe('CSL');
  });

  it('sorts by attentionScore ascending', () => {
    const sorted = sortCoverageRows(rows, 'attentionScore', 'asc');
    expect(sorted[0].ticker).toBe('CSL');
  });

  it('sorts by ticker alphabetically ascending', () => {
    const sorted = sortCoverageRows(rows, 'ticker', 'asc');
    expect(sorted[0].ticker).toBe('BHP');
    expect(sorted[1].ticker).toBe('CSL');
    expect(sorted[2].ticker).toBe('FMG');
  });

  it('sorts by price numerically descending', () => {
    const sorted = sortCoverageRows(rows, 'price', 'desc');
    expect(sorted[0].ticker).toBe('CSL');
    expect(sorted[2].ticker).toBe('FMG');
  });

  it('null convictionPct sorts last regardless of direction', () => {
    const sorted = sortCoverageRows(rows, 'convictionPct', 'asc');
    expect(sorted[sorted.length - 1].ticker).toBe('FMG');
  });

  it('returns new array without mutating input', () => {
    const original = rows.slice();
    sortCoverageRows(rows, 'price', 'desc');
    expect(rows[0].ticker).toBe(original[0].ticker);
  });
});

// ---------------------------------------------------------------------------
// filterCoverageRows
// ---------------------------------------------------------------------------

describe('filterCoverageRows', () => {
  const rows = [
    { ticker: 'BHP', name: 'BHP Group', signal: 'upside', freshnessHours: 24, workstationStatus: 'ready' },
    { ticker: 'CBA', name: 'Commonwealth Bank', signal: 'downside', freshnessHours: 60, workstationStatus: 'stale' },
    { ticker: 'CSL', name: 'CSL Limited', signal: 'balanced', freshnessHours: 24, workstationStatus: 'ready' },
    { ticker: 'FMG', name: 'Fortescue', signal: 'downside', freshnessHours: 80, workstationStatus: 'failed' },
    { ticker: 'NAB', name: 'National Australia Bank', signal: 'upside', freshnessHours: 10, workstationStatus: 'missing' }
  ];
  const allFilters = { signal: 'all', staleness: 'all', extraction: 'all', searchQuery: '' };

  it('filter signal upside returns only upside rows', () => {
    const result = filterCoverageRows(rows, { ...allFilters, signal: 'upside' });
    expect(result.every(r => r.signal === 'upside')).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('filter staleness stale returns rows with freshnessHours > 48', () => {
    const result = filterCoverageRows(rows, { ...allFilters, staleness: 'stale' });
    expect(result.every(r => r.freshnessHours > 48)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('filter staleness fresh returns rows with freshnessHours <= 48', () => {
    const result = filterCoverageRows(rows, { ...allFilters, staleness: 'fresh' });
    expect(result.every(r => r.freshnessHours <= 48)).toBe(true);
  });

  it('filter extraction failed returns only failed rows', () => {
    const result = filterCoverageRows(rows, { ...allFilters, extraction: 'failed' });
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('FMG');
  });

  it('search by ticker substring (case-insensitive)', () => {
    const result = filterCoverageRows(rows, { ...allFilters, searchQuery: 'bhp' });
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('BHP');
  });

  it('search by name substring (case-insensitive)', () => {
    const result = filterCoverageRows(rows, { ...allFilters, searchQuery: 'commonwealth' });
    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe('CBA');
  });

  it('combined filter: signal upside + staleness fresh', () => {
    const result = filterCoverageRows(rows, { ...allFilters, signal: 'upside', staleness: 'fresh' });
    expect(result.every(r => r.signal === 'upside' && r.freshnessHours <= 48)).toBe(true);
  });

  it('filter all returns all rows for that dimension', () => {
    const result = filterCoverageRows(rows, allFilters);
    expect(result).toHaveLength(rows.length);
  });
});

// ---------------------------------------------------------------------------
// computeCoverageHealth
// ---------------------------------------------------------------------------

describe('computeCoverageHealth', () => {
  it('counts rows by workstationStatus correctly', () => {
    const rows = [
      { workstationStatus: 'ready' },
      { workstationStatus: 'ready' },
      { workstationStatus: 'stale' },
      { workstationStatus: 'failed' },
      { workstationStatus: 'missing' }
    ];
    const health = computeCoverageHealth(rows, { status: 'complete' });
    expect(health.ready).toBe(2);
    expect(health.stale).toBe(1);
    expect(health.failed).toBe(1);
    expect(health.missing).toBe(1);
    expect(health.total).toBe(5);
  });

  it('batchCompleteness is ready / total', () => {
    const rows = [
      { workstationStatus: 'ready' },
      { workstationStatus: 'ready' },
      { workstationStatus: 'failed' },
      { workstationStatus: 'missing' }
    ];
    const health = computeCoverageHealth(rows, {});
    expect(health.batchCompleteness).toBeCloseTo(0.5, 2);
  });

  it('handles empty rows', () => {
    const health = computeCoverageHealth([], { status: 'unknown' });
    expect(health.total).toBe(0);
    expect(health.ready).toBe(0);
    expect(health.batchCompleteness).toBe(0);
  });

  it('batchStatus passes through from batchStatus object', () => {
    const health = computeCoverageHealth([], { status: 'running' });
    expect(health.batchStatus).toBe('running');
  });
});
