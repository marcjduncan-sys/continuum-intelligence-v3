// @vitest-environment jsdom
/**
 * Regression tests for router.js route-type body attribute.
 * Covers the fix in redesign/phase5-cleanup: report routes set
 * document.body.dataset.routeType = "report", all other hashes set "page".
 */

import { route } from './router.js';

vi.mock('./state.js', () => ({
  STOCK_DATA: { BHP: { company: 'BHP Group' }, WOW: { company: 'Woolworths' } },
  SNAPSHOT_DATA: { BHP: { ticker: 'BHP' } },
  VALID_STATIC_PAGES: new Set(['home', 'deep-research', 'portfolio', 'comparator', 'personalisation', 'memory', 'pm', 'ops', 'about']),
}));

vi.mock('./dom.js', () => ({
  announcePageChange: vi.fn(),
}));

vi.mock('../data/loader.js', () => ({
  CACHE_VERSION: 'v4',
  loadFullResearchData: vi.fn(),
}));

vi.mock('./api-config.js', () => ({
  API_BASE: 'https://test-api.example.com',
}));

describe('router route-type attribute', () => {
  beforeEach(() => {
    // Reset body state and provide minimal DOM
    delete document.body.dataset.routeType;
    document.body.innerHTML = '<div id="page-home" class="page"></div>';
  });

  it('sets routeType to "report" when hash starts with "report-"', () => {
    window.location.hash = '#report-BHP';
    route();
    expect(document.body.dataset.routeType).toBe('report');
  });

  it('sets routeType to "report" when hash starts with "deep-report-"', () => {
    window.location.hash = '#deep-report-WOW';
    route();
    expect(document.body.dataset.routeType).toBe('report');
  });

  it('sets routeType to "page" when hash is "home"', () => {
    window.location.hash = '#home';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('sets routeType to "page" when hash is "portfolio"', () => {
    window.location.hash = '#portfolio';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('sets routeType to "page" when hash is "deep-research"', () => {
    window.location.hash = '#deep-research';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('sets routeType to "page" when hash is "snapshot-BHP"', () => {
    window.location.hash = '#snapshot-BHP';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('sets routeType to "page" when hash is "workstation-BHP"', () => {
    window.location.hash = '#workstation-BHP';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('sets routeType to "page" when hash is empty (default home)', () => {
    window.location.hash = '';
    route();
    expect(document.body.dataset.routeType).toBe('page');
  });

  it('falls back to home and does not crash on unknown hash', () => {
    window.location.hash = '#unknown-page-xyz';
    expect(() => route()).not.toThrow();
  });

  it('isReportRoute is true only for "report-" and "deep-report-" prefixes, not other prefixes', () => {
    // snapshot is NOT a report route
    window.location.hash = '#snapshot-BHP';
    route();
    expect(document.body.dataset.routeType).not.toBe('report');

    // workstation is NOT a report route
    window.location.hash = '#workstation-BHP';
    route();
    expect(document.body.dataset.routeType).not.toBe('report');
  });
});
