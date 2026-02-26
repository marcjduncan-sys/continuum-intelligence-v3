import { compute, hydrateText } from './dynamics.js';
import { STOCK_DATA, REFERENCE_DATA, initStockData, initReferenceData } from '../lib/state.js';

beforeEach(() => {
  for (var k in STOCK_DATA) delete STOCK_DATA[k];
  for (var k in REFERENCE_DATA) delete REFERENCE_DATA[k];
});

function seedCBA(stockOverrides, refOverrides) {
  initStockData({
    CBA: Object.assign({
      price: 130, currency: 'A$',
      priceHistory: [110, 115, 120, 125, 128, 130],
    }, stockOverrides)
  });
  initReferenceData({
    CBA: Object.assign({
      sharesOutstanding: 1700000,
      epsForward: 5.5,
      epsTrailing: 4.8,
      analystTarget: 155,
      divPerShare: 4.2,
    }, refOverrides)
  });
}

// --- compute() ---

describe('compute', () => {
  it('returns null when no STOCK_DATA entry', () => {
    initReferenceData({ CBA: { sharesOutstanding: 1700000 } });
    expect(compute('CBA')).toBeNull();
  });

  it('returns null when no REFERENCE_DATA entry', () => {
    initStockData({ CBA: { price: 130 } });
    expect(compute('CBA')).toBeNull();
  });

  it('computes forwardPE', () => {
    seedCBA();
    var result = compute('CBA');
    expect(result.forwardPE).toBeCloseTo(130 / 5.5, 2);
    expect(result.fmt.forwardPE).toBe('23.6x');
  });

  it('computes trailingPE', () => {
    seedCBA();
    var result = compute('CBA');
    expect(result.trailingPE).toBeCloseTo(130 / 4.8, 2);
    expect(result.fmt.trailingPE).toBe('27.1x');
  });

  it('computes dividend yield', () => {
    seedCBA();
    var result = compute('CBA');
    expect(result.divYield).toBeCloseTo((4.2 / 130) * 100, 1);
    expect(result.fmt.divYield).toBe('3.2%');
  });

  it('computes upside to analyst target', () => {
    seedCBA();
    var result = compute('CBA');
    expect(result.upsideToTarget).toBeCloseTo(((155 - 130) / 130) * 100, 1);
    expect(result.fmt.upsideToTarget).toBe('+19%');
  });

  it('computes 52w high and low from priceHistory', () => {
    seedCBA();
    var result = compute('CBA');
    expect(result.high52).toBe(130);
    expect(result.low52).toBe(110);
    expect(result.fmt.high52).toBe('A$130.00');
    expect(result.fmt.low52).toBe('A$110.00');
  });

  it('uses _livePrice over static price', () => {
    seedCBA({ _livePrice: 140 });
    var result = compute('CBA');
    expect(result.price).toBe(140);
    expect(result.fmt.price).toBe('A$140.00');
  });

  it('computes market cap', () => {
    seedCBA();
    var result = compute('CBA');
    // 130 * 1700000 / 1000 = 221000
    expect(result.marketCap).toBe(221000);
  });

  it('returns null marketCap when sharesOutstanding missing', () => {
    seedCBA({}, { sharesOutstanding: undefined });
    var result = compute('CBA');
    expect(result.marketCap).toBeNull();
    expect(result.fmt.marketCap).toBeNull();
  });

  it('includes ticker in result', () => {
    seedCBA();
    expect(compute('CBA').ticker).toBe('CBA');
  });
});

// --- hydrateText() ---

describe('hydrateText', () => {
  var baseRef = {
    _anchors: { price: 77.87, marketCapStr: '12.0B', drawdown: -60 }
  };
  var baseComputed = {
    currency: 'A$', price: 82.5, marketCapStr: '13.5B',
    drawdownFromHigh: -45
  };

  it('returns null for null input', () => {
    expect(hydrateText(null, baseRef, baseComputed)).toBeNull();
  });

  it('returns non-string input unchanged', () => {
    expect(hydrateText(42, baseRef, baseComputed)).toBe(42);
  });

  it('replaces anchored price with computed price', () => {
    var text = 'Trades at A$77.87 which represents fair value.';
    var result = hydrateText(text, baseRef, baseComputed);
    expect(result).toContain('A$82.50');
    expect(result).not.toContain('A$77.87');
  });

  it('replaces anchored market cap', () => {
    var text = 'Market cap of A$12.0B reflects growth premium.';
    var result = hydrateText(text, baseRef, baseComputed);
    expect(result).toContain('A$13.5B');
    expect(result).not.toContain('A$12.0B');
  });

  it('replaces drawdown percentage', () => {
    var text = 'Stock is down 60% from its 52-week high.';
    var result = hydrateText(text, baseRef, baseComputed);
    expect(result).toContain('45%');
    expect(result).not.toContain('60%');
  });

  it('leaves text unchanged when price matches anchor', () => {
    var sameRef = { _anchors: { price: 82.5 } };
    var text = 'Priced at A$82.50 fairly.';
    var result = hydrateText(text, sameRef, baseComputed);
    expect(result).toBe(text);
  });

  it('handles empty anchors gracefully', () => {
    var noAnchorRef = { _anchors: {} };
    var text = 'Generic stock analysis.';
    expect(hydrateText(text, noAnchorRef, baseComputed)).toBe(text);
  });

  it('handles missing _anchors key', () => {
    var text = 'No anchors at all.';
    expect(hydrateText(text, {}, baseComputed)).toBe(text);
  });
});
