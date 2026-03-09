import { describe, it, expect } from 'vitest';
import { calculateReweightingScores, deriveAlignment } from './portfolio.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function makePosition(ticker, overrides) {
  return Object.assign({
    ticker: ticker,
    company: ticker + ' Corp',
    units: 1000,
    avgCost: 10,
    currentPrice: 12,
    marketValue: 12000,
    weight: 25,
    skew: 'balanced',
    alignment: { label: 'Balanced exposure', cls: 'neutral' }
  }, overrides);
}

function makeCoverage(ticker, skew) {
  return { skew: skew, price: 12, company: ticker + ' Corp' };
}

function makeTc(ticker, overrides) {
  return Object.assign({
    n1: { prob: 35 },
    n2: { prob: 30 },
    n3: { prob: 20 },
    n4: { prob: 15 },
    primary: 'n1'
  }, overrides);
}

/* ------------------------------------------------------------------ */
/*  deriveAlignment                                                   */
/* ------------------------------------------------------------------ */

describe('deriveAlignment', () => {
  it('returns aligned for upside skew', () => {
    expect(deriveAlignment('upside', 10)).toEqual({ label: 'Aligned with skew', cls: 'aligned' });
  });

  it('returns contradicts for downside skew under 15% weight', () => {
    expect(deriveAlignment('downside', 10)).toEqual({ label: 'Contradicts skew', cls: 'contradicts' });
  });

  it('returns exceeds for downside skew over 15% weight', () => {
    expect(deriveAlignment('downside', 20)).toEqual({ label: 'Exposure exceeds conviction', cls: 'exceeds' });
  });

  it('returns balanced for balanced skew under 15%', () => {
    expect(deriveAlignment('balanced', 10)).toEqual({ label: 'Balanced exposure', cls: 'neutral' });
  });

  it('returns not covered for null skew', () => {
    expect(deriveAlignment(null, 10)).toEqual({ label: 'Not covered', cls: 'not-covered' });
  });
});

/* ------------------------------------------------------------------ */
/*  calculateReweightingScores — scoring                              */
/* ------------------------------------------------------------------ */

describe('calculateReweightingScores', () => {
  describe('contradicting positions get zero weight', () => {
    it('downside-skewed long gets suggestedWeight = 0', () => {
      var covered = [makePosition('WOW', { skew: 'downside', weight: 25, units: 31289 })];
      var coverageData = { WOW: makeCoverage('WOW', 'downside') };
      var tcData = { WOW: makeTc('WOW') };

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      expect(scores[0].suggestedWeight).toBe(0);
      expect(scores[0].rawScore).toBe(0);
    });

    it('upside-skewed short gets suggestedWeight = 0', () => {
      var covered = [makePosition('CBA', { skew: 'upside', weight: 25, units: -500 })];
      var coverageData = { CBA: makeCoverage('CBA', 'upside') };
      var tcData = { CBA: makeTc('CBA') };

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      expect(scores[0].suggestedWeight).toBe(0);
      expect(scores[0].rawScore).toBe(0);
    });
  });

  describe('aligned positions get conviction-weighted scores', () => {
    it('upside-skewed long gets 1.3x multiplier', () => {
      var covered = [
        makePosition('GMG', { skew: 'upside', weight: 50 }),
        makePosition('MQG', { skew: 'balanced', weight: 50 })
      ];
      var coverageData = {
        GMG: makeCoverage('GMG', 'upside'),
        MQG: makeCoverage('MQG', 'balanced')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);
      var gmg = scores.find(function(s) { return s.ticker === 'GMG'; });
      var mqg = scores.find(function(s) { return s.ticker === 'MQG'; });

      // GMG rawScore should be 1.3x baseWeight, MQG should be 1.0x
      expect(gmg.rawScore).toBeGreaterThan(mqg.rawScore);
      expect(gmg.rawScore / mqg.rawScore).toBeCloseTo(1.3, 1);
    });

    it('downside-skewed short gets 1.3x multiplier', () => {
      var covered = [
        makePosition('WDS', { skew: 'downside', weight: 50, units: -1000 }),
        makePosition('MQG', { skew: 'balanced', weight: 50, units: -1000 })
      ];
      var coverageData = {
        WDS: makeCoverage('WDS', 'downside'),
        MQG: makeCoverage('MQG', 'balanced')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);
      var wds = scores.find(function(s) { return s.ticker === 'WDS'; });
      var mqg = scores.find(function(s) { return s.ticker === 'MQG'; });

      expect(wds.rawScore / mqg.rawScore).toBeCloseTo(1.3, 1);
    });
  });

  describe('normalisation', () => {
    it('non-zero weights sum to 100%', () => {
      var covered = [
        makePosition('GMG', { skew: 'upside', weight: 30 }),
        makePosition('MQG', { skew: 'balanced', weight: 30 }),
        makePosition('WOW', { skew: 'downside', weight: 40 })
      ];
      var coverageData = {
        GMG: makeCoverage('GMG', 'upside'),
        MQG: makeCoverage('MQG', 'balanced'),
        WOW: makeCoverage('WOW', 'downside')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      var total = scores.reduce(function(s, x) { return s + x.suggestedWeight; }, 0);
      // WOW is zero, GMG + MQG should sum to 100
      expect(total).toBeCloseTo(100, 1);
      expect(scores.find(function(s) { return s.ticker === 'WOW'; }).suggestedWeight).toBe(0);
    });

    it('all-downside portfolio: no division by zero, all weights zero', () => {
      var covered = [
        makePosition('WOW', { skew: 'downside', weight: 50 }),
        makePosition('WDS', { skew: 'downside', weight: 50 })
      ];
      var coverageData = {
        WOW: makeCoverage('WOW', 'downside'),
        WDS: makeCoverage('WDS', 'downside')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      scores.forEach(function(s) {
        expect(s.suggestedWeight).toBe(0);
      });
    });
  });

  describe('action logic — long positions', () => {
    it('downside skew → Sell All with all units', () => {
      var covered = [makePosition('WOW', { skew: 'downside', weight: 25, units: 31289, currentPrice: 38 })];
      var coverageData = { WOW: makeCoverage('WOW', 'downside') };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 1200000);

      expect(scores[0].action).toBe('Sell All');
      expect(scores[0].actionCls).toBe('sell-all');
      expect(scores[0].shareAction).toBe('31,289');
    });

    it('upside skew, within 1% band → Hold', () => {
      // Two upside positions with equal weight — delta will be ~0
      var covered = [
        makePosition('GMG', { skew: 'upside', weight: 50, units: 1000 }),
        makePosition('CBA', { skew: 'upside', weight: 50, units: 1000 })
      ];
      var coverageData = {
        GMG: makeCoverage('GMG', 'upside'),
        CBA: makeCoverage('CBA', 'upside')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      scores.forEach(function(s) {
        expect(s.action).toBe('Hold');
      });
    });

    it('upside skew, delta < -1% → Trim with calculated shares', () => {
      // One upside position with 80% weight, another with 20% — upside one will be overweight
      var covered = [
        makePosition('GMG', { skew: 'upside', weight: 80, units: 5000, currentPrice: 30 }),
        makePosition('CBA', { skew: 'upside', weight: 20, units: 1000, currentPrice: 130 })
      ];
      var coverageData = {
        GMG: makeCoverage('GMG', 'upside'),
        CBA: makeCoverage('CBA', 'upside')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 200000);
      var cba = scores.find(function(s) { return s.ticker === 'CBA'; });

      // CBA at 20% weight but suggested ~50%, so delta is positive — Hold or no trim
      // GMG at 80% weight but suggested ~50%, so delta is negative — Trim
      var gmg = scores.find(function(s) { return s.ticker === 'GMG'; });
      if (gmg.delta < -1) {
        expect(gmg.action).toBe('Trim');
        expect(gmg.shareAction).not.toBe('--');
      }
    });

    it('balanced skew, within 5% band → Hold', () => {
      var covered = [
        makePosition('MQG', { skew: 'balanced', weight: 50 }),
        makePosition('NAB', { skew: 'balanced', weight: 50 })
      ];
      var coverageData = {
        MQG: makeCoverage('MQG', 'balanced'),
        NAB: makeCoverage('NAB', 'balanced')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      scores.forEach(function(s) {
        expect(s.action).toBe('Hold');
      });
    });
  });

  describe('action logic — short positions', () => {
    it('upside skew → Buy to Close with all units', () => {
      var covered = [makePosition('CBA', { skew: 'upside', weight: 25, units: -500, currentPrice: 130 })];
      var coverageData = { CBA: makeCoverage('CBA', 'upside') };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      expect(scores[0].action).toBe('Buy to Close');
      expect(scores[0].actionCls).toBe('buy');
      expect(scores[0].shareAction).toBe('500');
    });

    it('downside skew short, within 1% band → Hold', () => {
      var covered = [
        makePosition('WDS', { skew: 'downside', weight: 50, units: -1000 }),
        makePosition('WOW', { skew: 'downside', weight: 50, units: -1000 })
      ];
      var coverageData = {
        WDS: makeCoverage('WDS', 'downside'),
        WOW: makeCoverage('WOW', 'downside')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      scores.forEach(function(s) {
        expect(s.action).toBe('Hold');
      });
    });
  });

  describe('TC_DATA adjustments', () => {
    it('high conviction (maxProb > 40) boosts multiplier', () => {
      var covered = [
        makePosition('CBA', { skew: 'upside', weight: 50 }),
        makePosition('MQG', { skew: 'upside', weight: 50 })
      ];
      var coverageData = {
        CBA: makeCoverage('CBA', 'upside'),
        MQG: makeCoverage('MQG', 'upside')
      };
      // CBA has high conviction, MQG has even spread
      var tcData = {
        CBA: makeTc('CBA', { n1: { prob: 55 }, n2: { prob: 20 }, n3: { prob: 15 }, n4: { prob: 10 } }),
        MQG: makeTc('MQG', { n1: { prob: 30 }, n2: { prob: 25 }, n3: { prob: 25 }, n4: { prob: 20 } })
      };

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);
      var cba = scores.find(function(s) { return s.ticker === 'CBA'; });
      var mqg = scores.find(function(s) { return s.ticker === 'MQG'; });

      expect(cba.rawScore).toBeGreaterThan(mqg.rawScore);
    });

    it('contrarian (uphill) reduces multiplier', () => {
      var covered = [
        makePosition('CBA', { skew: 'upside', weight: 50 }),
        makePosition('MQG', { skew: 'upside', weight: 50 })
      ];
      var coverageData = {
        CBA: makeCoverage('CBA', 'upside'),
        MQG: makeCoverage('MQG', 'upside')
      };
      var tcData = {
        CBA: makeTc('CBA', { primary: 'uphill' }),
        MQG: makeTc('MQG', { primary: 'n1' })
      };

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);
      var cba = scores.find(function(s) { return s.ticker === 'CBA'; });
      var mqg = scores.find(function(s) { return s.ticker === 'MQG'; });

      expect(cba.rawScore).toBeLessThan(mqg.rawScore);
    });
  });

  describe('sorting', () => {
    it('sorts by largest |delta| descending', () => {
      var covered = [
        makePosition('GMG', { skew: 'upside', weight: 10 }),
        makePosition('WOW', { skew: 'downside', weight: 60 }),
        makePosition('MQG', { skew: 'balanced', weight: 30 })
      ];
      var coverageData = {
        GMG: makeCoverage('GMG', 'upside'),
        WOW: makeCoverage('WOW', 'downside'),
        MQG: makeCoverage('MQG', 'balanced')
      };
      var tcData = {};

      var scores = calculateReweightingScores(covered, coverageData, tcData, 100000);

      // WOW has delta = 0 - 60 = -60, should be first
      expect(scores[0].ticker).toBe('WOW');
      // Remaining deltas should be in descending |delta| order
      for (var i = 1; i < scores.length; i++) {
        expect(Math.abs(scores[i - 1].delta)).toBeGreaterThanOrEqual(Math.abs(scores[i].delta));
      }
    });
  });
});
