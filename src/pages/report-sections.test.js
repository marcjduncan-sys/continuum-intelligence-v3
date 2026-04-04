// @vitest-environment jsdom
import { computeMA } from '../features/report/technical.js';
import { renderReport } from './report.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('computeMA', () => {
  it('returns empty array for empty input', () => {
    expect(computeMA([], 3)).toEqual([]);
  });

  it('pads nulls before period completes', () => {
    const result = computeMA([10, 20, 30, 40, 50], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates 3-period moving average', () => {
    const result = computeMA([10, 20, 30, 40, 50], 3);
    expect(result[2]).toBe(20);   // (10+20+30)/3
    expect(result[3]).toBe(30);   // (20+30+40)/3
    expect(result[4]).toBe(40);   // (30+40+50)/3
  });

  it('calculates 2-period moving average', () => {
    const result = computeMA([10, 20, 30, 40, 50], 2);
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
    const result = computeMA([10, 20, 30, 40, 50], 5);
    expect(result.slice(0, 4)).toEqual([null, null, null, null]);
    expect(result[4]).toBe(30);
  });

  it('output length matches input length', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computeMA(input, 4)).toHaveLength(10);
  });

  it('single element with period=1', () => {
    expect(computeMA([42], 1)).toEqual([42]);
  });
});

describe('renderReport null safety', () => {
  it('renders without throwing on minimal scaffold data', () => {
    const minimal = {
      ticker: 'TEST',
      tickerFull: 'TEST.AX',
      company: 'Test Company',
      exchange: 'ASX',
      sector: 'Test',
      heroDescription: '',
      heroCompanyDescription: '',
      currency: 'A$',
      price: '0.00',
      date: '2026-01-01',
      reportId: 'test-001',
      heroMetrics: [],
      hypotheses: [],
      skew: { direction: 'balanced', rationale: '' },
      verdict: { text: '', scores: [] },
      narrative: null,
      evidence: null,
      discriminators: null,
      tripwires: null,
      gaps: null,
      identity: null,
      footer: null,
      technicalAnalysis: null,
      priceDrivers: null,
      goldAgent: null,
      goldAnalysis: null
    };

    // Must not throw
    const html = renderReport(minimal);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });

  it('renders without throwing on fully populated BHP data', () => {
    const bhpPath = resolve(__dirname, '../../data/research/BHP.json');
    let bhpData;
    try {
      bhpData = JSON.parse(readFileSync(bhpPath, 'utf-8'));
    } catch {
      // Skip if BHP.json not available in CI
      return;
    }

    // Simulate the minimal shape renderReport expects
    const data = {
      ticker: 'BHP',
      tickerFull: 'BHP.AX',
      company: bhpData.company || 'BHP Group',
      exchange: bhpData.exchange || 'ASX',
      sector: bhpData.sector || 'Materials',
      heroDescription: bhpData.heroDescription || '',
      heroCompanyDescription: bhpData.heroCompanyDescription || '',
      currency: bhpData.currency || 'A$',
      price: bhpData.price || '0.00',
      date: bhpData.date || '2026-01-01',
      reportId: bhpData.reportId || 'bhp-001',
      heroMetrics: bhpData.heroMetrics || [],
      hypotheses: bhpData.hypotheses || [],
      skew: bhpData.skew || { direction: 'balanced', rationale: '' },
      verdict: bhpData.verdict || { text: '', scores: [] },
      narrative: bhpData.narrative || null,
      evidence: bhpData.evidence || null,
      discriminators: bhpData.discriminators || null,
      tripwires: bhpData.tripwires || null,
      gaps: bhpData.gaps || null,
      identity: bhpData.identity || null,
      footer: bhpData.footer || null,
      technicalAnalysis: bhpData.technicalAnalysis || null,
      priceDrivers: bhpData.priceDrivers || null,
      goldAgent: bhpData.goldAgent || null,
      goldAnalysis: bhpData.goldAnalysis || null,
      hero: bhpData.hero || null,
      priceHistory: bhpData.priceHistory || null,
      three_layer_signal: bhpData.three_layer_signal || null,
      _overcorrection: bhpData._overcorrection || null
    };

    const html = renderReport(data);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(100);
  });


  it('renders without throwing when all sub-properties are empty objects/arrays', () => {
    const partial = {
      ticker: 'EMPTY',
      tickerFull: 'EMPTY.AX',
      company: 'Empty Corp',
      exchange: 'ASX',
      sector: 'Test',
      heroDescription: '',
      currency: 'A$',
      price: '1.00',
      date: '2026-01-01',
      reportId: 'empty-001',
      heroMetrics: [{ label: 'Mkt Cap', value: 'N/A' }],
      hypotheses: [],
      skew: { direction: 'balanced', rationale: '' },
      verdict: { text: 'Pending', scores: [] },
      narrative: { theNarrative: 'Pending', priceImplication: {}, evidenceCheck: '', narrativeStability: '' },
      evidence: { cards: [], intro: '' },
      discriminators: { rows: [], intro: '', nonDiscriminating: '' },
      tripwires: { cards: [], intro: '' },
      gaps: { coverageRows: [], couldntAssess: [], analyticalLimitations: '' },
      identity: { rows: [] },
      footer: { disclaimer: '', domainCount: 0, hypothesesCount: 0 }
    };

    const html = renderReport(partial);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(0);
  });
});
