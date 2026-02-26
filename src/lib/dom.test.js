// @vitest-environment jsdom
import { normaliseScores, computeSkewScore, escapeHtml } from './dom.js';

// --- normaliseScores ---

describe('normaliseScores', () => {
  it('returns empty array for empty input', () => {
    expect(normaliseScores([])).toEqual([]);
  });

  it('sums to 100 for two items', () => {
    var result = normaliseScores([{ score: 60 }, { score: 40 }]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('sums to 100 for four equal items', () => {
    var result = normaliseScores([{ score: 25 }, { score: 25 }, { score: 25 }, { score: 25 }]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([25, 25, 25, 25]);
  });

  it('enforces floor of 5 on zero-score items', () => {
    var result = normaliseScores([{ score: 80 }, { score: 80 }, { score: 0 }, { score: 0 }]);
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(5));
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('enforces ceiling of 80', () => {
    var result = normaliseScores([{ score: 95 }, { score: 5 }, { score: 5 }, { score: 5 }]);
    result.forEach(v => expect(v).toBeLessThanOrEqual(80));
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('single item returns [100]', () => {
    var result = normaliseScores([{ score: 100 }]);
    expect(result).toEqual([100]);
  });

  it('handles all-zero inputs', () => {
    var result = normaliseScores([{ score: 0 }, { score: 0 }, { score: 0 }]);
    result.forEach(v => expect(v).toBeGreaterThan(0));
    // Sum should be close to 100 (rounding may cause 99 or 100)
    var sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  it('parses string scores', () => {
    var result = normaliseScores([{ score: '60' }, { score: '40' }]);
    expect(result).toEqual([60, 40]);
  });

  it('preserves proportional ordering', () => {
    var result = normaliseScores([{ score: 50 }, { score: 30 }, { score: 20 }]);
    expect(result[0]).toBeGreaterThan(result[1]);
    expect(result[1]).toBeGreaterThan(result[2]);
  });
});

// --- computeSkewScore ---

describe('computeSkewScore', () => {
  it('returns balanced defaults for null', () => {
    expect(computeSkewScore(null)).toEqual({
      bull: 50, bear: 50, score: 0, direction: 'balanced', hypotheses: []
    });
  });

  it('returns balanced defaults for empty data', () => {
    expect(computeSkewScore({})).toEqual({
      bull: 50, bear: 50, score: 0, direction: 'balanced', hypotheses: []
    });
  });

  it('returns balanced defaults for empty hypotheses', () => {
    expect(computeSkewScore({ hypotheses: [] })).toEqual({
      bull: 50, bear: 50, score: 0, direction: 'balanced', hypotheses: []
    });
  });

  it('classifies upside direction when bull > bear + 5', () => {
    var data = {
      hypotheses: [
        { score: 60, direction: 'upside', title: 'Growth', tier: 'n1' },
        { score: 40, direction: 'downside', title: 'Risk', tier: 'n2' },
      ]
    };
    var result = computeSkewScore(data);
    expect(result.bull).toBeGreaterThan(result.bear);
    expect(result.direction).toBe('upside');
    expect(result.bull + result.bear).toBe(100);
  });

  it('classifies downside direction when bear > bull + 5', () => {
    var data = {
      hypotheses: [
        { score: 30, direction: 'upside', title: 'Growth', tier: 'n1' },
        { score: 70, direction: 'downside', title: 'Risk', tier: 'n2' },
      ]
    };
    var result = computeSkewScore(data);
    expect(result.bear).toBeGreaterThan(result.bull);
    expect(result.direction).toBe('downside');
  });

  it('splits neutral hypotheses 50/50', () => {
    var data = {
      hypotheses: [
        { score: 50, direction: 'neutral', title: 'Base', tier: 'n1' },
        { score: 50, direction: 'neutral', title: 'Alt', tier: 'n2' },
      ]
    };
    var result = computeSkewScore(data);
    expect(result.bull).toBe(50);
    expect(result.bear).toBe(50);
    expect(result.direction).toBe('balanced');
  });

  it('returns hypotheses breakdown', () => {
    var data = {
      hypotheses: [
        { score: 60, direction: 'upside', title: 'Growth', tier: 'n1' },
      ]
    };
    var result = computeSkewScore(data);
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0]).toMatchObject({
      title: 'Growth', direction: 'upside'
    });
    expect(result.hypotheses[0].weight).toBeGreaterThan(0);
  });

  it('score equals bull minus bear', () => {
    var data = {
      hypotheses: [
        { score: 40, direction: 'upside', title: 'N1', tier: 'n1' },
        { score: 30, direction: 'upside', title: 'N2', tier: 'n2' },
        { score: 20, direction: 'downside', title: 'N3', tier: 'n3' },
        { score: 10, direction: 'downside', title: 'N4', tier: 'n4' },
      ]
    };
    var result = computeSkewScore(data);
    expect(result.score).toBe(result.bull - result.bear);
  });
});

// --- escapeHtml ---

describe('escapeHtml', () => {
  it('escapes < and >', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes ampersand', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });
  it('passes through double quotes (textContent does not escape them)', () => {
    expect(escapeHtml('"hello"')).toBe('"hello"');
  });
  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });
  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
