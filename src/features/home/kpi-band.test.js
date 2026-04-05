import { renderKpiBand } from './kpi-band.js';

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

describe('renderKpiBand', () => {
  it('renders 6 KPI cards', () => {
    const rows = [makeRow()];
    const html = renderKpiBand(rows, {});
    const count = (html.match(/kpi-card"/g) || []).length;
    expect(count).toBe(6);
  });

  it('renders the kpi-band container', () => {
    const html = renderKpiBand([], {});
    expect(html).toContain('kpi-band');
  });

  it('stale count is correct', () => {
    const rows = [
      makeRow({ ticker: 'BHP', freshnessHours: 60 }),
      makeRow({ ticker: 'CBA', freshnessHours: 24 }),
      makeRow({ ticker: 'FMG', freshnessHours: 80 })
    ];
    const html = renderKpiBand(rows, {});
    // 2 stale names (60 and 80 > 48)
    expect(html).toContain('>2<');
  });

  it('top mover shows correct ticker', () => {
    const rows = [
      makeRow({ ticker: 'BHP', dayChangePct: 1.5 }),
      makeRow({ ticker: 'FMG', dayChangePct: -6.2 }),
      makeRow({ ticker: 'CBA', dayChangePct: 0.3 })
    ];
    const html = renderKpiBand(rows, {});
    // FMG has the largest abs move
    expect(html).toContain('FMG');
    expect(html).toContain('-6.2%');
  });

  it('coverage health shows correct ready/total counts', () => {
    const rows = [
      makeRow({ ticker: 'BHP', workstationStatus: 'ready' }),
      makeRow({ ticker: 'CBA', workstationStatus: 'ready' }),
      makeRow({ ticker: 'FMG', workstationStatus: 'failed' }),
      makeRow({ ticker: 'NAB', workstationStatus: 'missing' })
    ];
    const html = renderKpiBand(rows, {});
    expect(html).toContain('2 / 4');
  });

  it('handles empty rows gracefully', () => {
    expect(() => renderKpiBand([], {})).not.toThrow();
    const html = renderKpiBand([], {});
    expect(html).toContain('kpi-band');
    expect(html).toContain('0 names');
  });

  it('handles null rows gracefully', () => {
    expect(() => renderKpiBand(null, {})).not.toThrow();
  });

  it('top mover shows -- when rows is empty', () => {
    const html = renderKpiBand([], {});
    expect(html).toContain('--');
  });
});
