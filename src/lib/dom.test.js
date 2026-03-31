// @vitest-environment jsdom
import { normaliseScores, computeSkewScore, _inferPolarity, escapeHtml } from './dom.js';

// --- normaliseScores ---

describe('normaliseScores', () => {
  it('returns empty array for empty input', () => {
    expect(normaliseScores([])).toEqual([]);
  });

  it('sums to 100 for two items', () => {
    const result = normaliseScores([{ score: 60 }, { score: 40 }]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('sums to 100 for four equal items', () => {
    const result = normaliseScores([{ score: 25 }, { score: 25 }, { score: 25 }, { score: 25 }]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([25, 25, 25, 25]);
  });

  it('enforces floor of 5 on zero-score items', () => {
    const result = normaliseScores([{ score: 80 }, { score: 80 }, { score: 0 }, { score: 0 }]);
    result.forEach(v => expect(v).toBeGreaterThanOrEqual(5));
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('enforces ceiling of 80', () => {
    const result = normaliseScores([{ score: 95 }, { score: 5 }, { score: 5 }, { score: 5 }]);
    result.forEach(v => expect(v).toBeLessThanOrEqual(80));
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('single item returns [100]', () => {
    const result = normaliseScores([{ score: 100 }]);
    expect(result).toEqual([100]);
  });

  it('handles all-zero inputs', () => {
    const result = normaliseScores([{ score: 0 }, { score: 0 }, { score: 0 }]);
    result.forEach(v => expect(v).toBeGreaterThan(0));
    // Sum should be close to 100 (rounding may cause 99 or 100)
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeGreaterThanOrEqual(99);
    expect(sum).toBeLessThanOrEqual(101);
  });

  it('parses string scores', () => {
    const result = normaliseScores([{ score: '60' }, { score: '40' }]);
    expect(result).toEqual([60, 40]);
  });

  it('preserves proportional ordering', () => {
    const result = normaliseScores([{ score: 50 }, { score: 30 }, { score: 20 }]);
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
    const data = {
      hypotheses: [
        { score: 60, direction: 'upside', title: 'Growth', tier: 'n1' },
        { score: 40, direction: 'downside', title: 'Risk', tier: 'n2' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.bull).toBeGreaterThan(result.bear);
    expect(result.direction).toBe('upside');
    expect(result.bull + result.bear).toBe(100);
  });

  it('classifies downside direction when bear > bull + 5', () => {
    const data = {
      hypotheses: [
        { score: 30, direction: 'upside', title: 'Growth', tier: 'n1' },
        { score: 70, direction: 'downside', title: 'Risk', tier: 'n2' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.bear).toBeGreaterThan(result.bull);
    expect(result.direction).toBe('downside');
  });

  it('neutral hypotheses contribute zero directional weight', () => {
    const data = {
      hypotheses: [
        { score: 50, direction: 'neutral', title: 'Base', tier: 'n1' },
        { score: 50, direction: 'neutral', title: 'Alt', tier: 'n2' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.bull).toBe(0);
    expect(result.bear).toBe(0);
    expect(result.score).toBe(0);
    expect(result.direction).toBe('balanced');
  });

  it('returns hypotheses breakdown', () => {
    const data = {
      hypotheses: [
        { score: 60, direction: 'upside', title: 'Growth', tier: 'n1' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.hypotheses).toHaveLength(1);
    expect(result.hypotheses[0]).toMatchObject({
      title: 'Growth', direction: 'upside'
    });
    expect(result.hypotheses[0].weight).toBeGreaterThan(0);
  });

  it('score equals bull minus bear', () => {
    const data = {
      hypotheses: [
        { score: 40, direction: 'upside', title: 'N1', tier: 'n1' },
        { score: 30, direction: 'upside', title: 'N2', tier: 'n2' },
        { score: 20, direction: 'downside', title: 'N3', tier: 'n3' },
        { score: 10, direction: 'downside', title: 'N4', tier: 'n4' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.score).toBe(result.bull - result.bear);
  });
  it('scaffold defaults produce zero skew', () => {
    const data = {
      hypotheses: [
        { score: 25, direction: 'upside', title: 'N1: Growth/Recovery', tier: 'n1' },
        { score: 25, direction: 'neutral', title: 'N2: Base Case', tier: 'n2' },
        { score: 25, direction: 'downside', title: 'N3: Risk/Downside', tier: 'n3' },
        { score: 25, direction: 'neutral', title: 'N4: Disruption/Catalyst', tier: 'n4' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.score).toBe(0);
    expect(result.direction).toBe('balanced');
  });

  it('CBA-like all classified produces -30', () => {
    const data = {
      hypotheses: [
        { score: 35, direction: 'upside', title: 'N1 Franchise', tier: 'n1' },
        { score: 28, direction: 'downside', title: 'N2 NIM Pressure', tier: 'n2' },
        { score: 21, direction: 'downside', title: 'N3 Competition', tier: 'n3' },
        { score: 16, direction: 'downside', title: 'N4 Credit Risk', tier: 'n4' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.score).toBe(-30);
    expect(result.direction).toBe('downside');
  });

  it('strong bull with neutral N2 produces positive skew', () => {
    const data = {
      hypotheses: [
        { score: 50, direction: 'upside', title: 'N1 Growth', tier: 'n1' },
        { score: 20, direction: 'neutral', title: 'N2 Base Case', tier: 'n2' },
        { score: 20, direction: 'downside', title: 'N3 Risk', tier: 'n3' },
        { score: 10, direction: 'neutral', title: 'N4 Catalyst', tier: 'n4' },
      ]
    };
    const result = computeSkewScore(data);
    expect(result.score).toBeGreaterThan(0);
    expect(result.direction).toBe('upside');
  });

  it('infers polarity from title when direction is absent', () => {
    const data = {
      hypotheses: [
        { score: 30, title: 'N1 Growth/Recovery' },
        { score: 30, title: 'N2 Base Case' },
        { score: 25, title: 'N3 Risk/Downside' },
        { score: 15, title: 'N4 Disruption/Catalyst' },
      ]
    };
    const result = computeSkewScore(data);
    // Only N1 (upside=30) vs N3 (downside=25) contribute
    // bull = 30, bear = 25, score = 5 -> balanced (within +/-5 threshold)
    expect(result.score).toBe(5);
    expect(result.direction).toBe('balanced');
  });

  it('missing direction defaults to neutral (not downside)', () => {
    const data = {
      hypotheses: [
        { score: 25, direction: 'upside', title: 'Growth' },
        { score: 25, title: 'Unknown Narrative' },
        { score: 25, direction: 'downside', title: 'Risk' },
        { score: 25, title: 'Another Unknown' },
      ]
    };
    const result = computeSkewScore(data);
    // N1 upside, N2 neutral (no keyword match), N3 downside, N4 neutral
    expect(result.score).toBe(0);
    expect(result.direction).toBe('balanced');
  });
});

// --- _inferPolarity ---

describe('_inferPolarity', () => {
  it('classifies bullish keywords', () => {
    expect(_inferPolarity('N1 Growth/Recovery')).toBe('upside');
    expect(_inferPolarity('Turnaround')).toBe('upside');
    expect(_inferPolarity('Franchise')).toBe('upside');
    expect(_inferPolarity('Quality Premium')).toBe('upside');
    expect(_inferPolarity('Moat Advantage')).toBe('upside');
  });

  it('classifies bearish keywords', () => {
    expect(_inferPolarity('N3 Risk/Downside')).toBe('downside');
    expect(_inferPolarity('NIM Pressure')).toBe('downside');
    expect(_inferPolarity('Competition')).toBe('downside');
    expect(_inferPolarity('Credit Risk')).toBe('downside');
    expect(_inferPolarity('Margin Erosion')).toBe('downside');
    expect(_inferPolarity('Regulatory Threat')).toBe('downside');
    expect(_inferPolarity('Decline')).toBe('downside');
  });

  it('defaults to neutral for ambiguous or generic labels', () => {
    expect(_inferPolarity('N2 Base Case')).toBe('neutral');
    expect(_inferPolarity('N4 Disruption/Catalyst')).toBe('neutral');
    expect(_inferPolarity('Catalyst')).toBe('neutral');
    expect(_inferPolarity('')).toBe('neutral');
    expect(_inferPolarity(null)).toBe('neutral');
    expect(_inferPolarity(undefined)).toBe('neutral');
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
