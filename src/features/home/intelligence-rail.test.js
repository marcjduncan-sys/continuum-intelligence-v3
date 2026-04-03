import { describe, it, expect } from 'vitest';
import { renderIntelligenceRail } from './intelligence-rail.js';

function makeRow(overrides) {
  return Object.assign({
    ticker: 'BHP',
    name: 'BHP Group',
    price: 45.20,
    dayChangePct: 1.5,
    signal: 'upside',
    freshnessHours: 24,
    workstationStatus: 'ready',
    signalChanged: false,
    attentionScore: 3,
    alertFlags: []
  }, overrides);
}

describe('renderIntelligenceRail', () => {
  it('renders four sections', () => {
    const html = renderIntelligenceRail([], {}, null);
    expect(html).toContain('data-rail-section="alerts"');
    expect(html).toContain('data-rail-section="feed"');
    expect(html).toContain('data-rail-section="signals"');
    expect(html).toContain('data-rail-section="coverage"');
  });

  it('renders the intelligence-rail container', () => {
    const html = renderIntelligenceRail([], {}, null);
    expect(html).toContain('intelligence-rail');
    expect(html).toContain('<aside');
  });

  it('alerts section shows correct count badge', () => {
    const rows = [
      makeRow({ ticker: 'BHP', alertFlags: ['imminent-catalyst'] }),
      makeRow({ ticker: 'CBA', alertFlags: [] }),
      makeRow({ ticker: 'FMG', alertFlags: ['stale-extraction'] })
    ];
    const html = renderIntelligenceRail(rows, {}, null);
    // 2 rows with alerts
    expect(html).toContain('rail-section__count">2<');
  });

  it('alerts section shows no active alerts when rows have no flags', () => {
    const rows = [makeRow({ alertFlags: [] })];
    const html = renderIntelligenceRail(rows, {}, null);
    expect(html).toContain('No active alerts');
  });

  it('alerts section renders alert items for flagged rows', () => {
    const rows = [
      makeRow({ ticker: 'BHP', signal: 'upside', alertFlags: ['signal-changed'] })
    ];
    const html = renderIntelligenceRail(rows, {}, null);
    expect(html).toContain('BHP');
    expect(html).toContain('Signal changed to Upside');
  });

  it('signals section shows distribution when no selection', () => {
    const rows = [
      makeRow({ signal: 'upside' }),
      makeRow({ ticker: 'CBA', signal: 'downside' }),
      makeRow({ ticker: 'CSL', signal: 'balanced' }),
      makeRow({ ticker: 'FMG', signal: 'upside' })
    ];
    const html = renderIntelligenceRail(rows, {}, null);
    expect(html).toContain('signal-badge--upside');
    expect(html).toContain('signal-badge--downside');
    expect(html).toContain('signal-badge--balanced');
  });

  it('coverage health shows correct counts', () => {
    const rows = [
      makeRow({ workstationStatus: 'ready' }),
      makeRow({ ticker: 'CBA', workstationStatus: 'ready' }),
      makeRow({ ticker: 'FMG', workstationStatus: 'failed' }),
      makeRow({ ticker: 'NAB', workstationStatus: 'missing' })
    ];
    const html = renderIntelligenceRail(rows, { completedAt: '2026-04-01' }, null);
    expect(html).toContain('rail-health');
    expect(html).toContain('2026-04-01');
  });

  it('handles empty rows gracefully', () => {
    expect(() => renderIntelligenceRail([], {}, null)).not.toThrow();
    const html = renderIntelligenceRail([], {}, null);
    expect(html).toContain('No active alerts');
  });

  it('handles null rows gracefully', () => {
    expect(() => renderIntelligenceRail(null, {}, null)).not.toThrow();
  });
});
