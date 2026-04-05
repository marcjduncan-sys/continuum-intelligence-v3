// @vitest-environment jsdom
import {
  computeEWP,
  computeEWPvSpot,
  computeBridgeWidths,
  mapSeverityToColour,
  mapDirectionToClass,
  mapScenarioStyle,
  sortScenarios,
  buildEWPFootnote,
  sanitiseInlineHtml,
  formatDisplayDate
} from './ws-computed.js';

// ============================================================================
// computeEWP
// ============================================================================

describe('computeEWP', () => {
  it('computes EWP for BHP scenarios correctly', () => {
    const scenarios = [
      { probability: 0.25, target_price: 63 },
      { probability: 0.45, target_price: 56 },
      { probability: 0.20, target_price: 44 },
      { probability: 0.10, target_price: 68 }
    ];
    const result = computeEWP(scenarios);
    // 0.25*63 + 0.45*56 + 0.20*44 + 0.10*68 = 15.75 + 25.2 + 8.8 + 6.8 = 56.55
    expect(result).toBeCloseTo(56.55, 2);
  });

  it('returns null for empty array', () => {
    expect(computeEWP([])).toBe(null);
  });

  it('returns null when any target_price is null', () => {
    const scenarios = [
      { probability: 0.5, target_price: 50 },
      { probability: 0.5, target_price: null }
    ];
    expect(computeEWP(scenarios)).toBe(null);
  });

  it('returns null when any target_price is undefined', () => {
    const scenarios = [
      { probability: 0.5, target_price: 50 },
      { probability: 0.5, target_price: undefined }
    ];
    expect(computeEWP(scenarios)).toBe(null);
  });

  it('returns null for null input', () => {
    expect(computeEWP(null)).toBe(null);
  });

  it('returns null for undefined input', () => {
    expect(computeEWP(undefined)).toBe(null);
  });

  it('computes EWP for single scenario', () => {
    const scenarios = [{ probability: 1.0, target_price: 100 }];
    expect(computeEWP(scenarios)).toBe(100);
  });

  it('computes EWP for three scenarios', () => {
    const scenarios = [
      { probability: 0.33, target_price: 50 },
      { probability: 0.33, target_price: 60 },
      { probability: 0.34, target_price: 70 }
    ];
    const result = computeEWP(scenarios);
    // 0.33*50 + 0.33*60 + 0.34*70 = 16.5 + 19.8 + 23.8 = 60.1
    expect(result).toBeCloseTo(60.1, 1);
  });
});

// ============================================================================
// computeEWPvSpot
// ============================================================================

describe('computeEWPvSpot', () => {
  it('computes percentage difference correctly', () => {
    const ewp = 56.55;
    const spotPrice = 52.56;
    const result = computeEWPvSpot(ewp, spotPrice);
    // (56.55 - 52.56) / 52.56 * 100 = 7.593%
    expect(result).toBeCloseTo(7.593, 2);
  });

  it('returns null when EWP is null', () => {
    expect(computeEWPvSpot(null, 50)).toBe(null);
  });

  it('returns null when EWP is undefined', () => {
    expect(computeEWPvSpot(undefined, 50)).toBe(null);
  });

  it('returns null when spot price is null', () => {
    expect(computeEWPvSpot(50, null)).toBe(null);
  });

  it('returns null when spot price is undefined', () => {
    expect(computeEWPvSpot(50, undefined)).toBe(null);
  });

  it('returns null when spot price is zero', () => {
    expect(computeEWPvSpot(50, 0)).toBe(null);
  });

  it('handles negative result when EWP below spot', () => {
    const result = computeEWPvSpot(40, 50);
    // (40 - 50) / 50 * 100 = -20%
    expect(result).toBe(-20);
  });

  it('handles zero difference', () => {
    const result = computeEWPvSpot(50, 50);
    expect(result).toBe(0);
  });

  it('handles large positive difference', () => {
    const result = computeEWPvSpot(100, 50);
    expect(result).toBe(100);
  });
});

// ============================================================================
// computeBridgeWidths
// ============================================================================

describe('computeBridgeWidths', () => {
  it('computes widths for BHP scenarios correctly', () => {
    const items = [
      { label: 'Bear', price: 44 },
      { label: 'Base', price: 56 },
      { label: 'Bull', price: 63 },
      { label: 'Stretch', price: 68 }
    ];
    const result = computeBridgeWidths(items);
    // Max is 68; Bear=44/68=64.7=65%, Base=56/68=82.4=82%, Bull=63/68=92.6=93%, Stretch=68/68=100%
    expect(result[0]).toMatchObject({ label: 'Bear', price: 44, widthPct: 65 });
    expect(result[1]).toMatchObject({ label: 'Base', price: 56, widthPct: 82 });
    expect(result[2]).toMatchObject({ label: 'Bull', price: 63, widthPct: 93 });
    expect(result[3]).toMatchObject({ label: 'Stretch', price: 68, widthPct: 100 });
  });

  it('computes width for single item as 100%', () => {
    const items = [{ label: 'Single', price: 50 }];
    const result = computeBridgeWidths(items);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ label: 'Single', price: 50, widthPct: 100 });
  });

  it('returns empty array for null input', () => {
    expect(computeBridgeWidths(null)).toEqual([]);
  });

  it('returns empty array for undefined input', () => {
    expect(computeBridgeWidths(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(computeBridgeWidths([])).toEqual([]);
  });

  it('handles all zero prices', () => {
    const items = [
      { label: 'A', price: 0 },
      { label: 'B', price: 0 }
    ];
    const result = computeBridgeWidths(items);
    expect(result[0]).toMatchObject({ price: 0, widthPct: 0 });
    expect(result[1]).toMatchObject({ price: 0, widthPct: 0 });
  });

  it('does not mutate input array', () => {
    const items = [{ label: 'A', price: 50 }];
    const original = JSON.stringify(items);
    computeBridgeWidths(items);
    expect(JSON.stringify(items)).toBe(original);
  });

  it('preserves other properties on items', () => {
    const items = [
      { label: 'Test', price: 50, colour: 'red', extra: 'data' }
    ];
    const result = computeBridgeWidths(items);
    expect(result[0]).toMatchObject({ label: 'Test', colour: 'red', extra: 'data' });
  });
});

// ============================================================================
// mapSeverityToColour
// ============================================================================

describe('mapSeverityToColour', () => {
  it('maps High to red', () => {
    expect(mapSeverityToColour('High')).toBe('red');
  });

  it('maps Critical to red', () => {
    expect(mapSeverityToColour('Critical')).toBe('red');
  });

  it('maps Medium to amber', () => {
    expect(mapSeverityToColour('Medium')).toBe('amber');
  });

  it('maps Needs market proof to amber', () => {
    expect(mapSeverityToColour('Needs market proof')).toBe('amber');
  });

  it('maps Low to green', () => {
    expect(mapSeverityToColour('Low')).toBe('green');
  });

  it('maps Directional to green', () => {
    expect(mapSeverityToColour('Directional')).toBe('green');
  });

  it('maps Supportive to blue', () => {
    expect(mapSeverityToColour('Supportive')).toBe('blue');
  });

  it('maps High quality to blue', () => {
    expect(mapSeverityToColour('High quality')).toBe('blue');
  });

  it('returns empty string for unknown severity', () => {
    expect(mapSeverityToColour('Unknown')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(mapSeverityToColour(null)).toBe('');
  });
});

// ============================================================================
// mapDirectionToClass
// ============================================================================

describe('mapDirectionToClass', () => {
  it('maps positive to pos', () => {
    expect(mapDirectionToClass('positive')).toBe('pos');
  });

  it('maps negative to neg', () => {
    expect(mapDirectionToClass('negative')).toBe('neg');
  });

  it('maps neutral to neu', () => {
    expect(mapDirectionToClass('neutral')).toBe('neu');
  });

  it('returns empty string for unknown direction', () => {
    expect(mapDirectionToClass('unknown')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(mapDirectionToClass(null)).toBe('');
  });
});

// ============================================================================
// mapScenarioStyle
// ============================================================================

describe('mapScenarioStyle', () => {
  it('maps bull to bull', () => {
    expect(mapScenarioStyle('bull')).toBe('bull');
  });

  it('maps base to base', () => {
    expect(mapScenarioStyle('base')).toBe('base');
  });

  it('maps bear to bear', () => {
    expect(mapScenarioStyle('bear')).toBe('bear');
  });

  it('maps stretch to stretch', () => {
    expect(mapScenarioStyle('stretch')).toBe('stretch');
  });

  it('maps stress to stretch', () => {
    expect(mapScenarioStyle('stress')).toBe('stretch');
  });

  it('returns empty string for unknown style', () => {
    expect(mapScenarioStyle('unknown')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(mapScenarioStyle(null)).toBe('');
  });
});

// ============================================================================
// sortScenarios
// ============================================================================

describe('sortScenarios', () => {
  it('sorts mixed scenarios in canonical order', () => {
    const scenarios = [
      { style: 'bear', probability: 0.2 },
      { style: 'bull', probability: 0.25 },
      { style: 'stress', probability: 0.1 },
      { style: 'base', probability: 0.45 }
    ];
    const sorted = sortScenarios(scenarios);
    expect(sorted[0].style).toBe('bull');
    expect(sorted[1].style).toBe('base');
    expect(sorted[2].style).toBe('bear');
    expect(sorted[3].style).toBe('stress'); // stress is preserved (sorted to position 4)
  });

  it('does not mutate original array', () => {
    const scenarios = [
      { style: 'bear' },
      { style: 'bull' }
    ];
    const original = JSON.stringify(scenarios);
    sortScenarios(scenarios);
    expect(JSON.stringify(scenarios)).toBe(original);
  });

  it('handles missing styles gracefully', () => {
    const scenarios = [
      { style: 'bull' },
      { style: undefined },
      { style: 'bear' }
    ];
    const sorted = sortScenarios(scenarios);
    // undefined sorts to position 99
    expect(sorted[0].style).toBe('bull');
    expect(sorted[1].style).toBe('bear');
    expect(sorted[2].style).toBeUndefined();
  });

  it('handles empty array', () => {
    expect(sortScenarios([])).toEqual([]);
  });

  it('preserves other properties during sort', () => {
    const scenarios = [
      { style: 'bear', label: 'Bear case', probability: 0.2 },
      { style: 'bull', label: 'Bull case', probability: 0.25 }
    ];
    const sorted = sortScenarios(scenarios);
    expect(sorted[0]).toMatchObject({ style: 'bull', label: 'Bull case' });
    expect(sorted[1]).toMatchObject({ style: 'bear', label: 'Bear case' });
  });
});

// ============================================================================
// buildEWPFootnote
// ============================================================================

describe('buildEWPFootnote', () => {
  it('builds footnote for BHP scenarios with correct format', () => {
    const scenarios = [
      { style: 'bull', probability: 0.25, target_price: 63 },
      { style: 'base', probability: 0.45, target_price: 56 },
      { style: 'bear', probability: 0.20, target_price: 44 },
      { style: 'stretch', probability: 0.10, target_price: 68 }
    ];
    const ewp = 56.55;
    const footnote = buildEWPFootnote(scenarios, ewp);
    // Expected: 'Weighted outcome: A$56.55 = 25% x A$63 + 45% x A$56 + 20% x A$44 + 10% x A$68.'
    expect(footnote).toContain('Weighted outcome: A$56.55');
    expect(footnote).toContain('25% x A$63');
    expect(footnote).toContain('45% x A$56');
    expect(footnote).toContain('20% x A$44');
    expect(footnote).toContain('10% x A$68');
  });

  it('uses custom currency symbol', () => {
    const scenarios = [
      { style: 'bull', probability: 0.5, target_price: 50 },
      { style: 'bear', probability: 0.5, target_price: 40 }
    ];
    const ewp = 45;
    const footnote = buildEWPFootnote(scenarios, ewp, 'USD$');
    expect(footnote).toContain('USD$45.00');
  });

  it('defaults to A$ currency', () => {
    const scenarios = [
      { style: 'bull', probability: 1.0, target_price: 100 }
    ];
    const footnote = buildEWPFootnote(scenarios, 100);
    expect(footnote).toContain('A$100.00');
  });

  it('sorts scenarios before building footnote', () => {
    const scenarios = [
      { style: 'bear', probability: 0.5, target_price: 40 },
      { style: 'bull', probability: 0.5, target_price: 60 }
    ];
    const ewp = 50;
    const footnote = buildEWPFootnote(scenarios, ewp);
    const bullIndex = footnote.indexOf('50% x A$60');
    const bearIndex = footnote.indexOf('50% x A$40');
    expect(bullIndex).toBeLessThan(bearIndex);
  });
});

// ============================================================================
// sanitiseInlineHtml (CRITICAL XSS BOUNDARY)
// ============================================================================

describe('sanitiseInlineHtml', () => {
  it('preserves plain text unchanged', () => {
    expect(sanitiseInlineHtml('Hello world')).toBe('Hello world');
  });

  it('preserves strong tags', () => {
    expect(sanitiseInlineHtml('<strong>bold</strong>')).toBe('<strong>bold</strong>');
  });

  it('strips script tags but keeps content', () => {
    expect(sanitiseInlineHtml('<script>alert("xss")</script>')).toBe('alert("xss")');
  });

  it('removes img tags with event handlers', () => {
    expect(sanitiseInlineHtml('<img onerror="alert(1)" src="x">')).toBe('');
  });

  it('removes a tags but keeps content', () => {
    expect(sanitiseInlineHtml('<a href="evil">link</a>')).toBe('link');
  });

  it('removes div tags but keeps content', () => {
    expect(sanitiseInlineHtml('<div>content</div>')).toBe('content');
  });

  it('strips attributes from strong tags', () => {
    expect(sanitiseInlineHtml('<strong onclick="alert(1)">text</strong>')).toBe('<strong>text</strong>');
  });

  it('strips style attributes from strong tags', () => {
    expect(sanitiseInlineHtml('<strong style="color: red">text</strong>')).toBe('<strong>text</strong>');
  });

  it('returns empty string for null', () => {
    expect(sanitiseInlineHtml(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(sanitiseInlineHtml(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(sanitiseInlineHtml('')).toBe('');
  });

  it('preserves text without HTML', () => {
    expect(sanitiseInlineHtml('No markup here')).toBe('No markup here');
  });

  it('handles mixed content', () => {
    const input = 'Hello <strong>world</strong> and <script>bad</script>';
    const output = sanitiseInlineHtml(input);
    expect(output).toContain('Hello <strong>world</strong> and bad');
  });

  it('preserves br tags', () => {
    expect(sanitiseInlineHtml('Line 1<br>Line 2')).toBe('Line 1<br>Line 2');
  });

  it('converts br/ to br', () => {
    expect(sanitiseInlineHtml('Line 1<br/>Line 2')).toBe('Line 1<br>Line 2');
  });

  it('handles br with space before slash', () => {
    expect(sanitiseInlineHtml('Line 1<br />Line 2')).toBe('Line 1<br>Line 2');
  });

  it('removes span tags but keeps content', () => {
    expect(sanitiseInlineHtml('<span>content</span>')).toBe('content');
  });

  it('removes p tags but keeps content', () => {
    expect(sanitiseInlineHtml('<p>paragraph</p>')).toBe('paragraph');
  });

  it('removes em tags but keeps content', () => {
    expect(sanitiseInlineHtml('<em>emphasis</em>')).toBe('emphasis');
  });

  it('handles nested tags', () => {
    const input = '<div><strong><script>alert(1)</script></strong></div>';
    const output = sanitiseInlineHtml(input);
    expect(output).toBe('<strong>alert(1)</strong>');
  });

  it('removes iframe tags entirely', () => {
    expect(sanitiseInlineHtml('<iframe src="evil"></iframe>')).toBe('');
  });

  it('removes onclick handlers', () => {
    expect(sanitiseInlineHtml('<span onclick="alert(1)">click</span>')).toBe('click');
  });

  it('removes data- attributes', () => {
    expect(sanitiseInlineHtml('<span data-evil="xss">text</span>')).toBe('text');
  });

  it('handles multiple strong tags', () => {
    expect(sanitiseInlineHtml('<strong>bold1</strong> and <strong>bold2</strong>')).toBe(
      '<strong>bold1</strong> and <strong>bold2</strong>'
    );
  });

  it('handles strong closing tag without opening', () => {
    expect(sanitiseInlineHtml('text</strong>')).toBe('text</strong>');
  });

  it('handles opening strong without closing', () => {
    expect(sanitiseInlineHtml('<strong>text')).toBe('<strong>text');
  });

  it('returns empty string for non-string input', () => {
    expect(sanitiseInlineHtml(123)).toBe('');
  });

  it('returns empty string for object input', () => {
    expect(sanitiseInlineHtml({ tag: 'xss' })).toBe('');
  });

  it('returns empty string for array input', () => {
    expect(sanitiseInlineHtml(['<strong>test</strong>'])).toBe('');
  });

  it('handles strong with newlines in attributes', () => {
    expect(sanitiseInlineHtml('<strong\nonclick="bad">text</strong>')).toBe('<strong>text</strong>');
  });

  it('preserves text with HTML entities', () => {
    expect(sanitiseInlineHtml('Price: &pound;50')).toBe('Price: &pound;50');
  });

  it('handles closing br tag (non-standard)', () => {
    expect(sanitiseInlineHtml('Line 1</br>Line 2')).toBe('Line 1Line 2');
  });
});

// ============================================================================
// formatDisplayDate
// ============================================================================

describe('formatDisplayDate', () => {
  it('formats 2026-04-02 as "2 April 2026"', () => {
    expect(formatDisplayDate('2026-04-02')).toBe('2 April 2026');
  });

  it('formats 2026-12-25 as "25 December 2026"', () => {
    expect(formatDisplayDate('2026-12-25')).toBe('25 December 2026');
  });

  it('formats 2026-01-01 as "1 January 2026"', () => {
    expect(formatDisplayDate('2026-01-01')).toBe('1 January 2026');
  });

  it('returns input for invalid format', () => {
    expect(formatDisplayDate('04/02/2026')).toBe('04/02/2026');
  });

  it('returns input for partial date', () => {
    expect(formatDisplayDate('2026-04')).toBe('2026-04');
  });

  it('returns empty string for null', () => {
    expect(formatDisplayDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDisplayDate(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(formatDisplayDate('')).toBe('');
  });

  it('returns input for non-string', () => {
    expect(formatDisplayDate(123)).toBe(123);
  });

  it('returns input for invalid month', () => {
    expect(formatDisplayDate('2026-13-01')).toBe('2026-13-01');
  });

  it('returns input for month zero', () => {
    expect(formatDisplayDate('2026-00-01')).toBe('2026-00-01');
  });

  it('handles leap year date', () => {
    expect(formatDisplayDate('2024-02-29')).toBe('29 February 2024');
  });

  it('formats mid-year date', () => {
    expect(formatDisplayDate('2026-06-15')).toBe('15 June 2026');
  });
});
