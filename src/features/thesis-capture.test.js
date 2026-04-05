import {
  saveThesis,
  getThesis,
  getAllTheses,
  inferBiasFromQuestion,
  getDominantFromSplit,
  inferBiasFromSplit,
  recordSignal,
  getConsistentSignalCount
} from './thesis-capture.js';

// ---------------------------------------------------------------------------
// localStorage polyfill for Node test environment
// ---------------------------------------------------------------------------

const _store = {};
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    _data: _store,
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null; },
    setItem: function (key, val) { _store[key] = String(val); },
    removeItem: function (key) { delete _store[key]; },
    clear: function () { for (const k in _store) { if (Object.prototype.hasOwnProperty.call(_store, k)) delete _store[k]; } },
    key: function (i) { return Object.keys(_store)[i] || null; },
    get length() { return Object.keys(_store).length; }
  };
}

function clearThesisKeys() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.indexOf('ci_thesis_') === 0)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(function (k) { localStorage.removeItem(k); });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('thesis-capture core', function () {

  beforeEach(clearThesisKeys);

  // Task 1 tests

  it('saveThesis stores and getThesis retrieves correctly', function () {
    const thesis = {
      ticker: 'WOR',
      dominantHypothesis: 'N2',
      probabilitySplit: [25, 50, 15, 10],
      biasDirection: 'bearish',
      source: 'explicit',
      confidence: 'high',
      capturedFrom: 'comparator'
    };

    const saved = saveThesis(thesis);
    expect(saved).toBe(true);

    const retrieved = getThesis('WOR');
    expect(retrieved).not.toBeNull();
    expect(retrieved.ticker).toBe('WOR');
    expect(retrieved.dominantHypothesis).toBe('N2');
    expect(retrieved.source).toBe('explicit');
    expect(retrieved.capturedAt).toBeDefined();
  });

  it('explicit thesis is NOT overwritten by inferred', function () {
    saveThesis({
      ticker: 'WOR',
      dominantHypothesis: 'N2',
      biasDirection: 'bearish',
      source: 'explicit',
      confidence: 'high',
      capturedFrom: 'comparator'
    });

    const overwritten = saveThesis({
      ticker: 'WOR',
      dominantHypothesis: 'N1',
      biasDirection: 'bullish',
      source: 'inferred',
      confidence: 'low',
      capturedFrom: 'chat'
    });

    expect(overwritten).toBe(false);
    const stored = getThesis('WOR');
    expect(stored.dominantHypothesis).toBe('N2');
    expect(stored.source).toBe('explicit');
  });

  it('inferred-high overwrites inferred-low', function () {
    saveThesis({
      ticker: 'BHP',
      biasDirection: 'bullish',
      source: 'inferred',
      confidence: 'low',
      capturedFrom: 'portfolio'
    });

    const overwritten = saveThesis({
      ticker: 'BHP',
      biasDirection: 'bullish',
      source: 'inferred',
      confidence: 'high',
      capturedFrom: 'chat'
    });

    expect(overwritten).toBe(true);
    const stored = getThesis('BHP');
    expect(stored.confidence).toBe('high');
    expect(stored.capturedFrom).toBe('chat');
  });

  it('explicit overwrites inferred', function () {
    saveThesis({
      ticker: 'FMG',
      biasDirection: 'bearish',
      source: 'inferred',
      confidence: 'high',
      capturedFrom: 'chat'
    });

    const overwritten = saveThesis({
      ticker: 'FMG',
      biasDirection: 'bullish',
      source: 'explicit',
      confidence: 'high',
      capturedFrom: 'comparator'
    });

    expect(overwritten).toBe(true);
    const stored = getThesis('FMG');
    expect(stored.source).toBe('explicit');
    expect(stored.biasDirection).toBe('bullish');
  });
});

describe('inferBiasFromQuestion', function () {

  it('detects bullish from "is WOR a buy?"', function () {
    expect(inferBiasFromQuestion('is WOR a buy?')).toBe('bullish');
  });

  it('detects bearish from "what is the bear case for FMG?"', function () {
    expect(inferBiasFromQuestion('what is the bear case for FMG?')).toBe('bearish');
  });

  it('detects neutral from "what is FMG worth?"', function () {
    expect(inferBiasFromQuestion('what is FMG worth?')).toBe('neutral');
  });

  it('returns null for "tell me about WOR"', function () {
    expect(inferBiasFromQuestion('tell me about WOR')).toBeNull();
  });

  it('returns null for ambiguous "should I buy or sell WOR?"', function () {
    expect(inferBiasFromQuestion('should I buy or sell WOR?')).toBeNull();
  });
});

describe('getDominantFromSplit', function () {

  it('returns N2 for [10, 50, 25, 15]', function () {
    expect(getDominantFromSplit([10, 50, 25, 15])).toBe('N2');
  });

  it('returns N1 for tied [40, 40, 10, 10] (first wins)', function () {
    expect(getDominantFromSplit([40, 40, 10, 10])).toBe('N1');
  });
});

describe('inferBiasFromSplit', function () {

  it('returns bullish when dominant hypothesis is upside', function () {
    const stock = {
      hypotheses: [
        { tier: 'N1', direction: 'upside' },
        { tier: 'N2', direction: 'downside' }
      ]
    };
    expect(inferBiasFromSplit([70, 30], stock)).toBe('bullish');
  });

  it('returns bearish when dominant hypothesis is downside', function () {
    const stock = {
      hypotheses: [
        { tier: 'N1', direction: 'upside' },
        { tier: 'N2', direction: 'downside' }
      ]
    };
    expect(inferBiasFromSplit([20, 80], stock)).toBe('bearish');
  });
});

describe('signal tracking', function () {

  beforeEach(clearThesisKeys);

  it('recordSignal stores and getConsistentSignalCount retrieves', function () {
    recordSignal('WOR', 'bullish');
    recordSignal('WOR', 'bullish');
    recordSignal('WOR', 'bullish');

    expect(getConsistentSignalCount('WOR', 'bullish')).toBe(3);
  });

  it('3 consistent signals returns 3', function () {
    recordSignal('BHP', 'bearish');
    recordSignal('BHP', 'bearish');
    recordSignal('BHP', 'bearish');

    expect(getConsistentSignalCount('BHP', 'bearish')).toBe(3);
    expect(getConsistentSignalCount('BHP', 'bullish')).toBe(0);
  });

  it('mixed signals: 2 bullish + 1 bearish returns correct counts', function () {
    recordSignal('CBA', 'bullish');
    recordSignal('CBA', 'bullish');
    recordSignal('CBA', 'bearish');

    expect(getConsistentSignalCount('CBA', 'bearish')).toBe(1);
    expect(getConsistentSignalCount('CBA', 'bullish')).toBe(2);
  });
});
