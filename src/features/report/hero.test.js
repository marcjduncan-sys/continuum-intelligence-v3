// @vitest-environment jsdom
/**
 * Regression tests for report hero.js.
 * Covers three remediation fixes:
 * - Issue 6: market cap formatting via fmtB() when heroMetrics has numeric value
 * - Issue 14: 52W range en-dash format ("$X.XX -- $Y.YY")
 * - Confidence computation from hypothesis scores
 */

vi.mock('../../lib/state.js', () => ({
  STOCK_DATA: {},
  ANNOUNCEMENTS_DATA: {},
  FEATURED_ORDER: [],
  SNAPSHOT_DATA: {},
}));

import { renderDecisionRibbon, renderReportHero } from './hero.js';

// ---------------------------------------------------------------------------
// Market cap formatting (Issue 6)
// ---------------------------------------------------------------------------

describe('renderDecisionRibbon -- market cap formatting', () => {
  it('calls fmtB when heroMetrics has a label containing "cap" with numeric value', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: 'Market Cap', value: 220000000000 },
      ],
    };
    const html = renderDecisionRibbon(data);
    // fmtB(220e9 / 1e9) = fmtB(220) = '220B'
    expect(html).toContain('220B');
  });

  it('uses fmtB with 1 decimal for caps in the 1-10B range', () => {
    const data = {
      ticker: 'XYZ',
      price: 10.00,
      currency: 'A$',
      hero: { skew: 'BALANCED', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: 'Market Cap', value: 5500000000 },
      ],
    };
    const html = renderDecisionRibbon(data);
    // fmtB(5.5B) = '5.5B'
    expect(html).toContain('5.5B');
  });

  it('shows TBC when heroMetrics has no cap label', () => {
    const data = {
      ticker: 'TBC',
      price: 10.00,
      currency: 'A$',
      hero: { skew: 'BALANCED', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: 'P/E Ratio', value: '22x' },
      ],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('TBC');
  });

  it('uses string value directly when heroMetrics cap value is already a string', () => {
    const data = {
      ticker: 'STR',
      price: 10.00,
      currency: 'A$',
      hero: { skew: 'BALANCED', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: 'Market Cap', value: '$45.2B' },
      ],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('$45.2B');
  });
});

// ---------------------------------------------------------------------------
// 52W range en-dash format (Issue 14)
// ---------------------------------------------------------------------------

describe('renderDecisionRibbon -- 52W range en-dash format', () => {
  it('formats range as low en-dash high when both high and low heroMetrics exist', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: '52W High', value: '$52.80' },
        { label: '52W Low', value: '$38.10' },
      ],
    };
    const html = renderDecisionRibbon(data);
    // Should use en-dash (U+2013), not double hyphen
    expect(html).toContain('$38.10 \u2013 $52.80');
  });

  it('uses en-dash (U+2013), not double hyphen, for the 52W range separator', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [
        { label: '52W High', value: '52.80' },
        { label: '52W Low', value: '38.10' },
      ],
    };
    const html = renderDecisionRibbon(data);
    // The range value should use en-dash U+2013, not double-hyphen
    expect(html).toContain('38.10 \u2013 52.80');
    expect(html).not.toContain('38.10 -- 52.80');
    expect(html).not.toContain('38.10-52.80');
  });

  it('shows TBC when both high and low heroMetrics are absent', () => {
    const data = {
      ticker: 'XYZ',
      price: 10.00,
      currency: 'A$',
      hero: { skew: 'BALANCED', position_in_range: { worlds: [] } },
      hypotheses: [],
      heroMetrics: [],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('TBC');
  });
});

// ---------------------------------------------------------------------------
// Confidence computation
// ---------------------------------------------------------------------------

describe('renderDecisionRibbon -- confidence computation', () => {
  it('computes confidence percentage correctly from hypothesis scores', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [
        { score: 70, direction: 'upside' },
        { score: 30, direction: 'downside' },
      ],
    };
    const html = renderDecisionRibbon(data);
    // 70/(70+30) = 70%
    expect(html).toContain('70%');
  });

  it('shows "Strong" label for confidence >= 70%', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [
        { score: 80, direction: 'upside' },
        { score: 20, direction: 'downside' },
      ],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('Strong');
  });

  it('shows "Moderate" label for confidence between 40-69%', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [
        { score: 50, direction: 'upside' },
        { score: 50, direction: 'downside' },
      ],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('Moderate');
  });

  it('shows "Low" label for confidence below 40%', () => {
    const data = {
      ticker: 'BHP',
      price: 45.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [
        { score: 30, direction: 'upside' },
        { score: 70, direction: 'downside' },
      ],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('Low');
  });

  it('shows TBC when no hypotheses data is available', () => {
    const data = {
      ticker: 'XYZ',
      price: 10.00,
      currency: 'A$',
      hero: { skew: 'UPSIDE', position_in_range: { worlds: [] } },
      hypotheses: [],
    };
    const html = renderDecisionRibbon(data);
    expect(html).toContain('TBC');
  });
});
