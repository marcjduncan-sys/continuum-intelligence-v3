// @vitest-environment jsdom
import { computeMA } from './report-sections.js';

describe('computeMA', () => {
  it('returns empty array for empty input', () => {
    expect(computeMA([], 3)).toEqual([]);
  });

  it('pads nulls before period completes', () => {
    var result = computeMA([10, 20, 30, 40, 50], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates 3-period moving average', () => {
    var result = computeMA([10, 20, 30, 40, 50], 3);
    expect(result[2]).toBe(20);   // (10+20+30)/3
    expect(result[3]).toBe(30);   // (20+30+40)/3
    expect(result[4]).toBe(40);   // (30+40+50)/3
  });

  it('calculates 2-period moving average', () => {
    var result = computeMA([10, 20, 30, 40, 50], 2);
    expect(result[0]).toBeNull();
    expect(result[1]).toBe(15);
    expect(result[2]).toBe(25);
    expect(result[3]).toBe(35);
    expect(result[4]).toBe(45);
  });

  it('period=1 returns all values', () => {
    expect(computeMA([10, 20, 30], 1)).toEqual([10, 20, 30]);
  });

  it('full-period MA returns one non-null value', () => {
    var result = computeMA([10, 20, 30, 40, 50], 5);
    expect(result.slice(0, 4)).toEqual([null, null, null, null]);
    expect(result[4]).toBe(30);
  });

  it('output length matches input length', () => {
    var input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computeMA(input, 4)).toHaveLength(10);
  });

  it('single element with period=1', () => {
    expect(computeMA([42], 1)).toEqual([42]);
  });
});
