import {
  fmtB, fmtPrice, fmtPct, fmtPE, signPct, formatNum, renderSparkline,
  formatPrice, formatPriceWithCurrency, formatPercent, formatSignedPercent,
  formatChange, formatRatio, formatVolume, formatMarketCap, formatInteger, svgCoord
} from './format.js';

describe('fmtB', () => {
  it('formats sub-billion as millions', () => {
    expect(fmtB(0.95)).toBe('950M');
  });
  it('formats zero as 0M', () => {
    expect(fmtB(0)).toBe('0M');
  });
  it('formats 1-10B range with one decimal', () => {
    expect(fmtB(1.5)).toBe('1.5B');
  });
  it('drops trailing .0 in 1-10B range', () => {
    expect(fmtB(3.0)).toBe('3B');
  });
  it('formats 10-100B range with one decimal', () => {
    expect(fmtB(12.05)).toBe('12.1B');
    expect(fmtB(79.3)).toBe('79.3B');
  });
  it('rounds >=100B to integer', () => {
    expect(fmtB(150)).toBe('150B');
    expect(fmtB(221.7)).toBe('222B');
  });
  it('handles non-numeric input', () => {
    expect(fmtB('abc')).toBe('0M');
    expect(fmtB(NaN)).toBe('0M');
    expect(fmtB(undefined)).toBe('0M');
  });
});

describe('fmtPrice', () => {
  it('formats with default A$ currency', () => {
    expect(fmtPrice(31.41)).toBe('A$31.41');
  });
  it('formats with custom currency', () => {
    expect(fmtPrice(31.41, 'US$')).toBe('US$31.41');
  });
  it('always uses 2 decimal places', () => {
    expect(fmtPrice(130)).toBe('A$130.00');
    expect(fmtPrice(5)).toBe('A$5.00');
  });
  it('handles zero', () => {
    expect(fmtPrice(0)).toBe('A$0.00');
  });
});

describe('fmtPct', () => {
  it('takes absolute value of negative', () => {
    expect(fmtPct(-60.4)).toBe('60%');
  });
  it('rounds positive values', () => {
    expect(fmtPct(15.7)).toBe('16%');
  });
  it('handles zero', () => {
    expect(fmtPct(0)).toBe('0%');
  });
});

describe('fmtPE', () => {
  it('formats normal P/E with one decimal', () => {
    expect(fmtPE(41.3)).toBe('41.3x');
  });
  it('drops trailing .0', () => {
    expect(fmtPE(25.0)).toBe('25x');
  });
  it('prefixes >=100 with ~', () => {
    expect(fmtPE(150)).toBe('~150x');
  });
  it('returns null for negative', () => {
    expect(fmtPE(-1)).toBeNull();
  });
  it('returns null for zero', () => {
    expect(fmtPE(0)).toBeNull();
  });
  it('returns null for Infinity', () => {
    expect(fmtPE(Infinity)).toBeNull();
  });
  it('returns null for NaN', () => {
    expect(fmtPE(NaN)).toBeNull();
  });
});

describe('signPct', () => {
  it('prefixes positive with +', () => {
    expect(signPct(12)).toBe('+12%');
  });
  it('includes - for negative', () => {
    expect(signPct(-5)).toBe('-5%');
  });
  it('zero gets + prefix', () => {
    expect(signPct(0)).toBe('+0%');
  });
  it('rounds fractional values', () => {
    expect(signPct(19.23)).toBe('+19%');
  });
});

describe('formatNum', () => {
  it('formats millions with M suffix', () => {
    expect(formatNum(1234567, 1)).toBe('1.2M');
  });
  it('formats thousands with locale formatting', () => {
    const result = formatNum(1500, 0);
    expect(result).toMatch(/1[,.]500/);
  });
  it('formats small numbers with decimals', () => {
    expect(formatNum(3.14, 2)).toBe('3.14');
  });
  it('returns -- for null', () => {
    expect(formatNum(null, 0)).toBe('--');
  });
  it('returns -- for undefined', () => {
    expect(formatNum(undefined, 0)).toBe('--');
  });
  it('returns -- for NaN', () => {
    expect(formatNum(NaN, 0)).toBe('--');
  });
});

describe('renderSparkline', () => {
  it('returns empty string for empty array', () => {
    expect(renderSparkline([])).toBe('');
  });
  it('returns empty string for single element', () => {
    expect(renderSparkline([100])).toBe('');
  });
  it('returns empty string for null', () => {
    expect(renderSparkline(null)).toBe('');
  });
  it('generates SVG with polyline for valid data', () => {
    const svg = renderSparkline([100, 105, 102, 110, 108]);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('class="rh-sparkline"');
  });
  it('uses green for rising prices (>2% gain)', () => {
    const svg = renderSparkline([100, 101, 102, 103, 104]);
    expect(svg).toContain('#00c875');
  });
  it('uses red for falling prices (>2% loss)', () => {
    const svg = renderSparkline([110, 108, 105, 102, 100]);
    expect(svg).toContain('#e44258');
  });
  it('uses amber for flat prices (<2% change)', () => {
    const svg = renderSparkline([100, 100.5, 100, 100.5, 100.5]);
    expect(svg).toContain('#f5a623');
  });
  it('generates unique gradient IDs', () => {
    const svg1 = renderSparkline([100, 110]);
    const svg2 = renderSparkline([100, 110]);
    const id1 = svg1.match(/id="(sp[a-z0-9]+)"/)[1];
    const id2 = svg2.match(/id="(sp[a-z0-9]+)"/)[1];
    expect(id1).not.toBe(id2);
  });
});

// BEAD-013: Standardised formatting library tests

const SENTINEL = '--';

describe('formatPrice (BEAD-013)', () => {
  it('formats normal value to 2 decimals', () => expect(formatPrice(42.567)).toBe('42.57'));
  it('formats string number', () => expect(formatPrice('42.567')).toBe('42.57'));
  it('formats zero', () => expect(formatPrice(0)).toBe('0.00'));
  it('formats negative', () => expect(formatPrice(-5.1)).toBe('-5.10'));
  it('returns sentinel for null', () => expect(formatPrice(null)).toBe(SENTINEL));
  it('returns sentinel for undefined', () => expect(formatPrice(undefined)).toBe(SENTINEL));
  it('returns sentinel for NaN', () => expect(formatPrice(NaN)).toBe(SENTINEL));
  it('respects custom decimals', () => expect(formatPrice(42.567, 0)).toBe('43'));
  it('respects 1 decimal', () => expect(formatPrice(42.567, 1)).toBe('42.6'));
});

describe('formatPriceWithCurrency (BEAD-013)', () => {
  it('formats with default currency', () => expect(formatPriceWithCurrency(31.41)).toBe('A$31.41'));
  it('formats with custom currency', () => expect(formatPriceWithCurrency(31.41, 'US$')).toBe('US$31.41'));
  it('returns sentinel for null', () => expect(formatPriceWithCurrency(null)).toBe(SENTINEL));
  it('formats zero', () => expect(formatPriceWithCurrency(0)).toBe('A$0.00'));
});

describe('formatPercent (BEAD-013)', () => {
  it('formats normal value', () => expect(formatPercent(12.34)).toBe('12.3%'));
  it('formats zero', () => expect(formatPercent(0)).toBe('0.0%'));
  it('formats negative', () => expect(formatPercent(-3.456)).toBe('-3.5%'));
  it('returns sentinel for null', () => expect(formatPercent(null)).toBe(SENTINEL));
  it('returns sentinel for undefined', () => expect(formatPercent(undefined)).toBe(SENTINEL));
  it('returns sentinel for NaN', () => expect(formatPercent(NaN)).toBe(SENTINEL));
  it('respects custom decimals', () => expect(formatPercent(12.34, 0)).toBe('12%'));
});

describe('formatSignedPercent (BEAD-013)', () => {
  it('adds + for positive', () => expect(formatSignedPercent(12.34)).toBe('+12.3%'));
  it('no prefix for negative', () => expect(formatSignedPercent(-5.67)).toBe('-5.7%'));
  it('no prefix for zero', () => expect(formatSignedPercent(0)).toBe('0.0%'));
  it('returns sentinel for null', () => expect(formatSignedPercent(null)).toBe(SENTINEL));
  it('returns sentinel for NaN', () => expect(formatSignedPercent(NaN)).toBe(SENTINEL));
});

describe('formatChange (BEAD-013)', () => {
  it('adds + for positive', () => expect(formatChange(1.5)).toBe('+1.50'));
  it('no prefix for negative', () => expect(formatChange(-1.5)).toBe('-1.50'));
  it('no prefix for zero', () => expect(formatChange(0)).toBe('0.00'));
  it('returns sentinel for null', () => expect(formatChange(null)).toBe(SENTINEL));
  it('returns sentinel for undefined', () => expect(formatChange(undefined)).toBe(SENTINEL));
});

describe('formatRatio (BEAD-013)', () => {
  it('formats with x suffix', () => expect(formatRatio(1.5)).toBe('1.5x'));
  it('formats zero', () => expect(formatRatio(0)).toBe('0.0x'));
  it('returns sentinel for null', () => expect(formatRatio(null)).toBe(SENTINEL));
  it('returns sentinel for NaN', () => expect(formatRatio(NaN)).toBe(SENTINEL));
});

describe('formatVolume (BEAD-013)', () => {
  it('abbreviates billions', () => expect(formatVolume(1500000000)).toBe('1.5B'));
  it('abbreviates millions', () => expect(formatVolume(1500000)).toBe('1.5M'));
  it('abbreviates thousands', () => expect(formatVolume(1500)).toBe('1.5K'));
  it('formats small numbers', () => expect(formatVolume(42)).toBe('42'));
  it('returns sentinel for null', () => expect(formatVolume(null)).toBe(SENTINEL));
});

describe('formatMarketCap (BEAD-013)', () => {
  it('abbreviates trillions', () => expect(formatMarketCap(2500000000000)).toBe('$2.50T'));
  it('abbreviates billions', () => expect(formatMarketCap(2500000000)).toBe('$2.50B'));
  it('abbreviates millions', () => expect(formatMarketCap(2500000)).toBe('$2.5M'));
  it('formats small numbers', () => expect(formatMarketCap(500)).toBe('$500'));
  it('returns sentinel for null', () => expect(formatMarketCap(null)).toBe(SENTINEL));
});

describe('formatInteger (BEAD-013)', () => {
  it('formats with locale separators', () => {
    const result = formatInteger(1234567);
    expect(result).toMatch(/1[,.]?234[,.]?567/);
  });
  it('rounds decimals', () => expect(formatInteger(42.7)).toBe('43'));
  it('returns sentinel for null', () => expect(formatInteger(null)).toBe(SENTINEL));
  it('returns sentinel for NaN', () => expect(formatInteger(NaN)).toBe(SENTINEL));
});

describe('svgCoord (BEAD-013)', () => {
  it('formats to 1 decimal', () => expect(svgCoord(42.567)).toBe('42.6'));
  it('formats integer', () => expect(svgCoord(42)).toBe('42.0'));
  it('formats zero', () => expect(svgCoord(0)).toBe('0.0'));
});
