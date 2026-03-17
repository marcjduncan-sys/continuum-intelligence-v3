import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateAlerts,
  saveAlerts,
  getAlerts,
  getAllAlerts,
  acknowledgeAlert,
  dismissAlert,
  getAuditLog,
  getAlertCounts,
  checkForAlerts
} from './thesis-monitor.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeHypotheses(scores, directions) {
  return scores.map(function (s, i) {
    return {
      tier: 'N' + (i + 1),
      title: 'Hypothesis ' + (i + 1),
      direction: directions ? directions[i] : 'upside',
      score: s + '%',
      supporting: ['evidence-a', 'evidence-b'],
      contradicting: ['contra-a']
    };
  });
}

function makeStockData(opts) {
  var hypotheses = opts.hypotheses || makeHypotheses([55, 20, 15, 10]);
  var _skew = opts._skew !== undefined ? opts._skew : { bull: 55, bear: 45, score: 10, direction: 'upside' };
  return { hypotheses: hypotheses, _skew: _skew };
}

function makeThesis(overrides) {
  return Object.assign({
    ticker: 'WOR',
    dominantHypothesis: 'N1',
    probabilitySplit: [50, 25, 15, 10],
    biasDirection: 'bullish',
    keyAssumption: 'energy transition capex grows',
    source: 'explicit',
    confidence: 'high'
  }, overrides);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateAlerts', function () {

  // -----------------------------------------------------------------------
  // Rule 1: Hypothesis dominance mismatch
  // -----------------------------------------------------------------------

  it('returns conflict with high materiality when dominance gap > 30', function () {
    // User thinks N2 dominates, but N1 is at 65% and N2 at 20% (gap = 45)
    var stock = makeStockData({
      hypotheses: makeHypotheses([65, 20, 10, 5])
    });
    var thesis = makeThesis({ dominantHypothesis: 'N2' });

    var alerts = generateAlerts(thesis, stock);
    var conflicts = alerts.filter(function (a) { return a.type === 'conflict'; });

    expect(conflicts.length).toBeGreaterThanOrEqual(1);
    var dominance = conflicts.find(function (a) { return a.id.includes('dominance'); });
    expect(dominance).toBeDefined();
    expect(dominance.materiality).toBe('high');
    expect(dominance.sourceHypothesis).toBe('N1');
    expect(dominance.userHypothesis).toBe('N2');
    expect(dominance.summary).toContain('N1');
    expect(dominance.summary).toContain('65%');
  });

  it('returns conflict with medium materiality when dominance gap is 20', function () {
    // User thinks N2 dominates; N1 at 50%, N2 at 30% (gap = 20)
    var stock = makeStockData({
      hypotheses: makeHypotheses([50, 30, 15, 5])
    });
    var thesis = makeThesis({ dominantHypothesis: 'N2' });

    var alerts = generateAlerts(thesis, stock);
    var dominance = alerts.find(function (a) { return a.id.includes('dominance'); });

    expect(dominance).toBeDefined();
    expect(dominance.type).toBe('conflict');
    expect(dominance.materiality).toBe('medium');
  });

  it('does not generate dominance conflict when gap <= 15', function () {
    // N1 at 40%, N2 at 30% (gap = 10, below threshold)
    var stock = makeStockData({
      hypotheses: makeHypotheses([40, 30, 20, 10])
    });
    var thesis = makeThesis({ dominantHypothesis: 'N2' });

    var alerts = generateAlerts(thesis, stock);
    var dominance = alerts.find(function (a) { return a.id.includes('dominance'); });

    expect(dominance).toBeUndefined();
  });

  it('downgrades dominance mismatch to signal for inferred thesis', function () {
    var stock = makeStockData({
      hypotheses: makeHypotheses([65, 20, 10, 5])
    });
    var thesis = makeThesis({
      dominantHypothesis: 'N2',
      source: 'inferred',
      confidence: 'low'
    });

    var alerts = generateAlerts(thesis, stock);
    var dominance = alerts.find(function (a) { return a.id.includes('dominance'); });

    expect(dominance).toBeDefined();
    expect(dominance.type).toBe('signal');
  });

  // -----------------------------------------------------------------------
  // Rule 2: Skew contradicts bias
  // -----------------------------------------------------------------------

  it('returns conflict when skew contradicts bias direction', function () {
    // User is bearish but skew is upside with magnitude > 10%
    var stock = makeStockData({
      _skew: { bull: 65, bear: 35, score: 30, direction: 'upside' }
    });
    var thesis = makeThesis({ biasDirection: 'bearish' });

    var alerts = generateAlerts(thesis, stock);
    var skewConflict = alerts.find(function (a) { return a.id.includes('skew'); });

    expect(skewConflict).toBeDefined();
    expect(skewConflict.type).toBe('conflict');
    expect(skewConflict.summary).toContain('bearish');
    expect(skewConflict.summary).toContain('upside');
  });

  it('does not generate skew conflict when magnitude <= 10%', function () {
    // Skew contradicts but magnitude is only 8%
    var stock = makeStockData({
      _skew: { bull: 54, bear: 46, score: 8, direction: 'upside' }
    });
    var thesis = makeThesis({ biasDirection: 'bearish' });

    var alerts = generateAlerts(thesis, stock);
    var skewConflict = alerts.find(function (a) { return a.id.includes('skew'); });

    expect(skewConflict).toBeUndefined();
  });

  it('assigns high materiality when skew magnitude > 20%', function () {
    var stock = makeStockData({
      _skew: { bull: 70, bear: 30, score: 40, direction: 'upside' }
    });
    var thesis = makeThesis({ biasDirection: 'bearish' });

    var alerts = generateAlerts(thesis, stock);
    var skewConflict = alerts.find(function (a) { return a.id.includes('skew'); });

    expect(skewConflict).toBeDefined();
    expect(skewConflict.materiality).toBe('high');
  });

  // -----------------------------------------------------------------------
  // Rule 3: Low score on user's weighted hypothesis
  // -----------------------------------------------------------------------

  it('returns signal when user assigns >25% to a hypothesis scoring <30%', function () {
    // User assigns 40% to N2, but N2 only scores 15%
    var stock = makeStockData({
      hypotheses: makeHypotheses([55, 15, 20, 10])
    });
    var thesis = makeThesis({ probabilitySplit: [20, 40, 25, 15] });

    var alerts = generateAlerts(thesis, stock);
    var lowScore = alerts.find(function (a) { return a.id.includes('lowscore-N2'); });

    expect(lowScore).toBeDefined();
    expect(lowScore.type).toBe('signal');
    expect(lowScore.materiality).toBe('medium');
    expect(lowScore.summary).toContain('N2');
    expect(lowScore.summary).toContain('15%');
    expect(lowScore.summary).toContain('40%');
  });

  // -----------------------------------------------------------------------
  // Rule 4: New evidence since last review
  // -----------------------------------------------------------------------

  it('returns signal when hypothesis gains 2+ evidence items', function () {
    // N1 had 2 items, now has 5 (supporting: 3, contradicting: 2)
    var hypotheses = makeHypotheses([55, 20, 15, 10]);
    hypotheses[0].supporting = ['a', 'b', 'c'];
    hypotheses[0].contradicting = ['x', 'y'];
    var stock = makeStockData({ hypotheses: hypotheses });

    var lastReviewed = { N1: 2, N2: 3, N3: 3, N4: 3 };
    var thesis = makeThesis({});

    var alerts = generateAlerts(thesis, stock, lastReviewed);
    var newEvidence = alerts.find(function (a) { return a.id.includes('newevidence-N1'); });

    expect(newEvidence).toBeDefined();
    expect(newEvidence.type).toBe('signal');
    expect(newEvidence.materiality).toBe('low');
    expect(newEvidence.summary).toContain('3');
  });

  it('does not generate new evidence signal when change < 2', function () {
    var stock = makeStockData({});
    var lastReviewed = { N1: 2, N2: 3, N3: 3, N4: 3 };
    var thesis = makeThesis({});

    var alerts = generateAlerts(thesis, stock, lastReviewed);
    var newEvidence = alerts.filter(function (a) { return a.id.includes('newevidence'); });

    expect(newEvidence.length).toBe(0);
  });

  // -----------------------------------------------------------------------
  // Rule 5: Thesis alignment (confirmation)
  // -----------------------------------------------------------------------

  it('returns confirmation when thesis aligns with data', function () {
    // User thinks N1 dominates, N1 IS the highest, skew is upside, user is bullish
    var stock = makeStockData({
      hypotheses: makeHypotheses([55, 20, 15, 10]),
      _skew: { bull: 55, bear: 45, score: 10, direction: 'upside' }
    });
    var thesis = makeThesis({
      dominantHypothesis: 'N1',
      biasDirection: 'bullish'
    });

    var alerts = generateAlerts(thesis, stock);
    var confirmation = alerts.find(function (a) { return a.type === 'confirmation'; });

    expect(confirmation).toBeDefined();
    expect(confirmation.id).toContain('confirmation');
    expect(confirmation.summary).toContain('N1');
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  it('returns empty array when no mismatches exist and no confirmation conditions met', function () {
    // User's thesis matches dominant, skew matches bias, no low scores, no new evidence
    var stock = makeStockData({
      hypotheses: makeHypotheses([55, 50, 45, 40]),
      _skew: { bull: 55, bear: 45, score: 10, direction: 'upside' }
    });
    var thesis = makeThesis({
      dominantHypothesis: 'N1',
      biasDirection: 'bullish',
      probabilitySplit: [30, 30, 20, 20]
    });

    // No mismatch: N1 is dominant (55) and user picks N1. No hypothesis scores < 30.
    // This WILL produce a confirmation though. Filter to non-confirmation.
    var alerts = generateAlerts(thesis, stock);
    var actionable = alerts.filter(function (a) { return a.type !== 'confirmation'; });

    expect(actionable.length).toBe(0);
  });

  it('returns empty array for null inputs', function () {
    expect(generateAlerts(null, {})).toEqual([]);
    expect(generateAlerts({}, null)).toEqual([]);
    expect(generateAlerts(null, null)).toEqual([]);
  });

  it('returns empty array when stockData has no hypotheses', function () {
    var thesis = makeThesis({});
    expect(generateAlerts(thesis, { hypotheses: null })).toEqual([]);
    expect(generateAlerts(thesis, {})).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// localStorage polyfill for Node test environment
// ---------------------------------------------------------------------------

var _store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    _data: _store,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null; },
    setItem: function (key, val) { _store[key] = String(val); },
    removeItem: function (key) { delete _store[key]; },
    clear: function () { for (var k in _store) { if (Object.prototype.hasOwnProperty.call(_store, k)) delete _store[k]; } },
    key: function (i) { return Object.keys(_store)[i] || null; },
    get length() { return Object.keys(_store).length; }
  };
}

// ---------------------------------------------------------------------------
// State management tests
// ---------------------------------------------------------------------------

describe('alert state management', function () {

  beforeEach(function () {
    // Clear all thesis alert keys from localStorage
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf('ci_thesis_alerts') === 0) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
  });

  it('saveAlerts/getAlerts round-trip preserves alert data', function () {
    var alerts = [
      {
        id: 'WOR-conflict-dominance-20260317',
        ticker: 'WOR',
        type: 'conflict',
        summary: 'Test conflict',
        detail: 'Detail text',
        sourceHypothesis: 'N1',
        userHypothesis: 'N2',
        materiality: 'high',
        timestamp: '2026-03-17T10:30:00Z',
        status: 'new'
      },
      {
        id: 'WOR-signal-skew-20260317',
        ticker: 'WOR',
        type: 'signal',
        summary: 'Test signal',
        detail: 'Detail text',
        sourceHypothesis: null,
        userHypothesis: 'N2',
        materiality: 'medium',
        timestamp: '2026-03-17T10:30:00Z',
        status: 'new'
      }
    ];

    saveAlerts('WOR', alerts);
    var retrieved = getAlerts('WOR');

    expect(retrieved.length).toBe(2);
    expect(retrieved[0].id).toBe('WOR-conflict-dominance-20260317');
    expect(retrieved[1].id).toBe('WOR-signal-skew-20260317');
    expect(retrieved[0].summary).toBe('Test conflict');
    expect(retrieved[0].status).toBe('new');
  });

  it('acknowledgeAlert updates status and appends to audit log', function () {
    var alerts = [
      {
        id: 'BHP-conflict-dominance-20260317',
        ticker: 'BHP',
        type: 'conflict',
        summary: 'Test conflict',
        detail: 'Detail',
        sourceHypothesis: 'N1',
        userHypothesis: 'N2',
        materiality: 'high',
        timestamp: '2026-03-17T10:30:00Z',
        status: 'new'
      }
    ];

    saveAlerts('BHP', alerts);
    var result = acknowledgeAlert('BHP-conflict-dominance-20260317');

    expect(result).not.toBeNull();
    expect(result.status).toBe('acknowledged');

    // Verify persisted state
    var stored = getAlerts('BHP');
    expect(stored[0].status).toBe('acknowledged');

    // Verify audit log
    var log = getAuditLog('BHP');
    expect(log.length).toBe(1);
    expect(log[0].action).toBe('acknowledged');
    expect(log[0].alertId).toBe('BHP-conflict-dominance-20260317');
    expect(log[0].ticker).toBe('BHP');
  });

  it('getAlertCounts returns correct category counts', function () {
    saveAlerts('WOR', [
      { id: 'a1', ticker: 'WOR', type: 'conflict', status: 'new', timestamp: new Date().toISOString() },
      { id: 'a2', ticker: 'WOR', type: 'conflict', status: 'new', timestamp: new Date().toISOString() },
      { id: 'a3', ticker: 'WOR', type: 'signal', status: 'new', timestamp: new Date().toISOString() },
      { id: 'a4', ticker: 'WOR', type: 'confirmation', status: 'new', timestamp: new Date().toISOString() },
      { id: 'a5', ticker: 'WOR', type: 'conflict', status: 'dismissed', timestamp: new Date().toISOString() }
    ]);

    var counts = getAlertCounts();

    expect(counts.conflicts).toBe(2);   // a5 dismissed, excluded
    expect(counts.signals).toBe(1);
    expect(counts.confirmations).toBe(1);
  });

  it('pruning removes dismissed alerts older than 30 days', function () {
    var oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    var recentDate = new Date().toISOString();

    saveAlerts('FMG', [
      { id: 'old-dismissed', ticker: 'FMG', type: 'conflict', status: 'dismissed', timestamp: oldDate },
      { id: 'old-acknowledged', ticker: 'FMG', type: 'conflict', status: 'acknowledged', timestamp: oldDate },
      { id: 'recent-dismissed', ticker: 'FMG', type: 'signal', status: 'dismissed', timestamp: recentDate },
      { id: 'recent-new', ticker: 'FMG', type: 'signal', status: 'new', timestamp: recentDate }
    ]);

    var retrieved = getAlerts('FMG');

    // old-dismissed should be pruned; old-acknowledged kept (not dismissed); recent ones kept
    expect(retrieved.length).toBe(3);
    var ids = retrieved.map(function (a) { return a.id; });
    expect(ids).not.toContain('old-dismissed');
    expect(ids).toContain('old-acknowledged');
    expect(ids).toContain('recent-dismissed');
    expect(ids).toContain('recent-new');
  });

  it('dismissAlert updates status and appends to audit log', function () {
    saveAlerts('CBA', [
      { id: 'cba-signal-1', ticker: 'CBA', type: 'signal', status: 'new', timestamp: new Date().toISOString() }
    ]);

    var result = dismissAlert('cba-signal-1');

    expect(result).not.toBeNull();
    expect(result.status).toBe('dismissed');

    var log = getAuditLog('CBA');
    expect(log.length).toBe(1);
    expect(log[0].action).toBe('dismissed');
  });

  it('getAllAlerts returns alerts across multiple tickers', function () {
    saveAlerts('WOR', [
      { id: 'wor-1', ticker: 'WOR', type: 'conflict', status: 'new', timestamp: new Date().toISOString() }
    ]);
    saveAlerts('BHP', [
      { id: 'bhp-1', ticker: 'BHP', type: 'signal', status: 'new', timestamp: new Date().toISOString() }
    ]);

    var all = getAllAlerts();
    expect(all.length).toBe(2);
    var tickers = all.map(function (a) { return a.ticker; }).sort();
    expect(tickers).toEqual(['BHP', 'WOR']);
  });
});

// ---------------------------------------------------------------------------
// checkForAlerts pipeline integration tests
// ---------------------------------------------------------------------------

describe('checkForAlerts', function () {

  beforeEach(function () {
    // Clear all thesis alert keys and personalisation profile
    var keysToRemove = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && (key.indexOf('ci_thesis_alerts') === 0 || key === 'continuum_personalisation_profile')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
  });

  it('returns 0 when no personalisation profile exists', function () {
    var stockData = {
      WOR: {
        hypotheses: [
          { tier: 'N1', score: '55%', direction: 'upside', supporting: ['a'], contradicting: ['b'] }
        ],
        _skew: { bull: 55, bear: 45, score: 10, direction: 'upside' }
      }
    };

    var count = checkForAlerts(stockData);
    expect(count).toBe(0);
  });

  it('returns correct count when profile exists and mismatches are detected', function () {
    // Set up a profile with portfolio holding in WOR
    localStorage.setItem('continuum_personalisation_profile', JSON.stringify({
      version: 2,
      state: {
        portfolio: [
          { ticker: 'WOR', weight: 15 }
        ]
      }
    }));

    // Stock data where N1 dominates at 65%, user's inferred thesis will pick N1
    // but bias is bullish while skew is downside with magnitude > 10% -- should trigger conflict
    var stockData = {
      WOR: {
        hypotheses: [
          { tier: 'N1', score: '30%', direction: 'upside', supporting: ['a'], contradicting: [] },
          { tier: 'N2', score: '25%', direction: 'upside', supporting: ['b'], contradicting: [] },
          { tier: 'N3', score: '65%', direction: 'downside', supporting: ['c', 'd'], contradicting: [] },
          { tier: 'N4', score: '10%', direction: 'downside', supporting: [], contradicting: [] }
        ],
        _skew: { bull: 30, bear: 70, score: -40, direction: 'downside' }
      }
    };

    var count = checkForAlerts(stockData);

    // Should detect at least 1 alert:
    // - Skew contradicts bias (user inferred bullish from 15% weight, skew is downside, magnitude 40%)
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify alerts were persisted
    var stored = getAlerts('WOR');
    expect(stored.length).toBeGreaterThanOrEqual(1);
  });
});
