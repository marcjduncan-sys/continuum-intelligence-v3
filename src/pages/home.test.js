/**
 * BMAD Test Suite: Add Stock Frontend Pipeline
 * =============================================
 * Tests the frontend hydration chain that converts reference.json data
 * into displayable tile metrics. Covers:
 *   - compute() metric derivation from REFERENCE_DATA
 *   - hydrateFeaturedMetrics() patching N/A values
 *   - The null-reference failure mode that causes "Analysis pending"
 *   - renderFeaturedCard() output for pending vs populated states
 *
 * Run: npx vitest run src/pages/home.test.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  compute,
  hydrateFeaturedMetrics,
  hydrate,
} from '../data/dynamics.js';
import {
  STOCK_DATA, REFERENCE_DATA,
  initStockData, initReferenceData,
} from '../lib/state.js';
import { renderFeaturedCard } from './home.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clearState() {
  for (var k in STOCK_DATA) delete STOCK_DATA[k];
  for (var k in REFERENCE_DATA) delete REFERENCE_DATA[k];
}

function seedStock(ticker, stockOverrides, refOverrides) {
  initStockData({
    [ticker]: Object.assign({
      ticker: ticker,
      tickerFull: ticker + '.AX',
      company: ticker + ' Corp',
      sector: 'Test Sector',
      price: 10.00,
      currency: 'A$',
      priceHistory: [8, 9, 10, 11, 12, 10],
      featuredMetrics: [
        { label: 'Mkt Cap', value: 'N/A', color: '' },
        { label: 'Fwd P/E', value: 'N/A', color: '' },
        { label: 'Div Yield', value: 'N/A', color: '' },
        { label: 'Drawdown', value: '-16.7%', color: '' },
      ],
      featuredRationale: 'Test rationale',
      skew: { direction: 'neutral', rationale: 'Test' },
      hypotheses: [
        { label: 'N1', score: '30%', direction: 'upside' },
        { label: 'N2', score: '40%', direction: 'neutral' },
        { label: 'N3', score: '20%', direction: 'downside' },
        { label: 'N4', score: '10%', direction: 'downside' },
      ],
    }, stockOverrides),
  });
  initReferenceData({
    [ticker]: Object.assign({
      sharesOutstanding: null,
      epsForward: null,
      epsTrailing: null,
      divPerShare: null,
      analystTarget: null,
      archetype: 'diversified',
      _anchors: { price: 10.00, marketCapStr: null, pe: null, divYield: null },
    }, refOverrides),
  });
}

beforeEach(clearState);

// ---------------------------------------------------------------------------
// compute() — metric derivation
// ---------------------------------------------------------------------------

describe('compute() with null reference data (the bug)', () => {
  it('returns null marketCap when sharesOutstanding is null', () => {
    seedStock('IPX', { price: 3.52 }, { sharesOutstanding: null });
    var result = compute('IPX');
    expect(result.marketCap).toBeNull();
    expect(result.fmt.marketCap).toBeNull();
  });

  it('returns null forwardPE when epsForward is null', () => {
    seedStock('IPX', { price: 3.52 }, { epsForward: null });
    var result = compute('IPX');
    expect(result.forwardPE).toBeNull();
    expect(result.fmt.forwardPE).toBeNull();
  });

  it('returns null divYield when divPerShare is null', () => {
    seedStock('IPX', { price: 3.52 }, { divPerShare: null });
    var result = compute('IPX');
    expect(result.divYield).toBeNull();
    expect(result.fmt.divYield).toBeNull();
  });
});

describe('compute() with populated reference data (the fix)', () => {
  it('computes marketCap from sharesOutstanding', () => {
    seedStock('QAN', { price: 8.34 }, { sharesOutstanding: 1220 });
    var result = compute('QAN');
    // marketCap = price * sharesOutstanding / 1000 = 8.34 * 1220 / 1000 = ~10.17
    expect(result.marketCap).toBeCloseTo(8.34 * 1220 / 1000, 1);
    expect(result.fmt.marketCap).toContain('$');
  });

  it('computes forwardPE from epsForward', () => {
    seedStock('QAN', { price: 8.34 }, { epsForward: 0.667 });
    var result = compute('QAN');
    expect(result.forwardPE).toBeCloseTo(8.34 / 0.667, 1);
    expect(result.fmt.forwardPE).toMatch(/\d+\.\dx$/);
  });

  it('computes divYield from divPerShare', () => {
    seedStock('QAN', { price: 8.34 }, { divPerShare: 0.20 });
    var result = compute('QAN');
    expect(result.divYield).toBeCloseTo((0.20 / 8.34) * 100, 1);
    expect(result.fmt.divYield).toMatch(/\d+\.\d+%$/);
  });
});

// ---------------------------------------------------------------------------
// hydrateFeaturedMetrics() — patching N/A values
// ---------------------------------------------------------------------------

describe('hydrateFeaturedMetrics()', () => {
  it('does NOT overwrite N/A when computed values are null', () => {
    seedStock('IPX', {}, { sharesOutstanding: null, epsForward: null, divPerShare: null });
    var stock = STOCK_DATA['IPX'];
    var computed = compute('IPX');
    hydrateFeaturedMetrics(stock, computed);

    var mktCap = stock.featuredMetrics.find(m => m.label === 'Mkt Cap');
    expect(mktCap.value).toBe('N/A');  // Still N/A because computed.fmt.marketCap is null
  });

  it('DOES overwrite N/A when computed values are populated', () => {
    seedStock('QAN', { price: 8.34 }, {
      sharesOutstanding: 1220,
      epsForward: 0.667,
      divPerShare: 0.20,
    });
    var stock = STOCK_DATA['QAN'];
    var computed = compute('QAN');
    hydrateFeaturedMetrics(stock, computed);

    var mktCap = stock.featuredMetrics.find(m => m.label === 'Mkt Cap');
    expect(mktCap.value).not.toBe('N/A');
    expect(mktCap.value).toContain('$');

    var pe = stock.featuredMetrics.find(m => m.label === 'Fwd P/E');
    expect(pe.value).not.toBe('N/A');
    expect(pe.value).toMatch(/x$/);

    var div = stock.featuredMetrics.find(m => m.label === 'Div Yield');
    expect(div.value).not.toBe('N/A');
    expect(div.value).toMatch(/%$/);
  });

  it('always updates Drawdown from priceHistory', () => {
    seedStock('TEST', { price: 10, priceHistory: [8, 9, 12, 11, 10] }, { sharesOutstanding: null });
    var stock = STOCK_DATA['TEST'];
    var computed = compute('TEST');
    hydrateFeaturedMetrics(stock, computed);

    var dd = stock.featuredMetrics.find(m => m.label === 'Drawdown');
    expect(dd.value).not.toBe('N/A');
    // Drawdown from high of 12: (10-12)/12 = -16.7%, formatted as &darr;17%
    expect(dd.value).toMatch(/\d+%/);
  });
});

// ---------------------------------------------------------------------------
// hydrate() full pipeline
// ---------------------------------------------------------------------------

describe('hydrate() end-to-end', () => {
  it('with null reference data, featuredMetrics stay N/A (the bug)', () => {
    seedStock('IPX', { price: 3.52 }, {
      sharesOutstanding: null,
      epsForward: null,
      divPerShare: null,
    });
    hydrate('IPX');
    var stock = STOCK_DATA['IPX'];
    var mktCap = stock.featuredMetrics.find(m => m.label === 'Mkt Cap');
    expect(mktCap.value).toBe('N/A');
  });

  it('with populated reference data, featuredMetrics are populated (the fix)', () => {
    seedStock('QAN', { price: 8.34 }, {
      sharesOutstanding: 1220,
      epsForward: 0.667,
      divPerShare: 0.20,
    });
    hydrate('QAN');
    var stock = STOCK_DATA['QAN'];

    var mktCap = stock.featuredMetrics.find(m => m.label === 'Mkt Cap');
    expect(mktCap.value).not.toBe('N/A');

    var pe = stock.featuredMetrics.find(m => m.label === 'Fwd P/E');
    expect(pe.value).not.toBe('N/A');

    var div = stock.featuredMetrics.find(m => m.label === 'Div Yield');
    expect(div.value).not.toBe('N/A');
  });
});

// ---------------------------------------------------------------------------
// renderFeaturedCard() — Analysis pending detection
// ---------------------------------------------------------------------------

describe('renderFeaturedCard() pending state', () => {
  it('renders "Analysis pending" when 3 of 4 metrics are N/A', () => {
    seedStock('IPX', {
      price: 3.52,
      featuredMetrics: [
        { label: 'Mkt Cap', value: 'N/A', color: '' },
        { label: 'Fwd P/E', value: 'N/A', color: '' },
        { label: 'Div Yield', value: 'N/A', color: '' },
        { label: 'Drawdown', value: '-60.3%', color: '' },
      ],
    });
    var html = renderFeaturedCard(STOCK_DATA['IPX']);
    expect(html).toContain('Analysis pending');
    expect(html).toContain('fc-pending');
  });

  it('renders full card when 2+ metrics are populated', () => {
    seedStock('QAN', {
      price: 8.34,
      featuredMetrics: [
        { label: 'Mkt Cap', value: 'A$10.2B', color: '' },
        { label: 'Fwd P/E', value: '12.5x', color: '' },
        { label: 'Div Yield', value: '2.4%', color: '' },
        { label: 'Drawdown', value: '-27.5%', color: '' },
      ],
    });
    var html = renderFeaturedCard(STOCK_DATA['QAN']);
    expect(html).not.toContain('Analysis pending');
    expect(html).not.toContain('fc-pending');
    expect(html).toContain('A$10.2B');
    expect(html).toContain('12.5x');
  });

  it('renders full card after hydrate() with populated reference data', () => {
    seedStock('QAN', {
      price: 8.34,
      featuredMetrics: [
        { label: 'Mkt Cap', value: 'N/A', color: '' },
        { label: 'Fwd P/E', value: 'N/A', color: '' },
        { label: 'Div Yield', value: 'N/A', color: '' },
        { label: 'Drawdown', value: '-27.5%', color: '' },
      ],
    }, {
      sharesOutstanding: 1220,
      epsForward: 0.667,
      divPerShare: 0.20,
    });

    // Before hydration: should be pending
    var beforeHtml = renderFeaturedCard(STOCK_DATA['QAN']);
    expect(beforeHtml).toContain('Analysis pending');

    // After hydration: should be populated
    hydrate('QAN');
    var afterHtml = renderFeaturedCard(STOCK_DATA['QAN']);
    expect(afterHtml).not.toContain('Analysis pending');
  });
});

// ---------------------------------------------------------------------------
// Regression guards
// ---------------------------------------------------------------------------

describe('Regression guards', () => {
  it('hydrate does not crash when REFERENCE_DATA entry is missing', () => {
    initStockData({ GHOST: { price: 5.00, priceHistory: [5] } });
    // No REFERENCE_DATA entry for GHOST
    var result = hydrate('GHOST');
    expect(result).toBeNull();
  });

  it('hydrate does not crash when featuredMetrics is missing', () => {
    seedStock('BARE', { price: 5.00 }, { sharesOutstanding: 100 });
    delete STOCK_DATA['BARE'].featuredMetrics;
    // Should not throw
    var result = hydrate('BARE');
    expect(result).toBeDefined();
  });

  it('hydrate does not crash when priceHistory is empty', () => {
    seedStock('EMPTY', { price: 5.00, priceHistory: [] }, { sharesOutstanding: 100 });
    var result = hydrate('EMPTY');
    expect(result).toBeDefined();
    expect(result.high52).toBeNull();
  });

  it('compute handles zero price gracefully', () => {
    seedStock('ZERO', { price: 0 }, { sharesOutstanding: 100, epsForward: 0.5 });
    var result = compute('ZERO');
    expect(result.price).toBe(0);
    expect(result.marketCap).toBe(0);
    // divYield with no divPerShare (default null in seed) should be null
    expect(result.divYield).toBeNull();
  });
});
