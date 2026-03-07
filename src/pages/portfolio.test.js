// @vitest-environment jsdom
import { renderChangeAlerts } from './portfolio.js';
import { STOCK_DATA, FRESHNESS_DATA, initStockData, initFreshnessData } from '../lib/state.js';

function setupDom() {
  document.body.innerHTML =
    '<div id="changeAlertsSection" style="display:none"></div>' +
    '<div id="changeAlertsFeed" style="display:none"></div>' +
    '<div id="changeAlertsEmpty"></div>';
}

beforeEach(() => {
  for (var k in STOCK_DATA) delete STOCK_DATA[k];
  for (var k in FRESHNESS_DATA) delete FRESHNESS_DATA[k];
  setupDom();
});

describe('renderChangeAlerts -- overcorrection signal', () => {
  it('renders a critical alert for a portfolio ticker with active overcorrection', () => {
    initStockData({
      WTC: {
        _alertState: 'OVERCORRECTION',
        _overcorrection: {
          active: true,
          triggerType: 'SINGLE_DAY',
          triggerDate: '2026-03-06',
          triggerPrice: 52.72,
          direction: 'up',
          movePct: 18.74,
          reviewDate: '2026-03-13',
          message: 'Single-day move of +18.7% exceeds 10% threshold'
        },
        hero: { skew: 'UPSIDE' }
      }
    });
    var positions = [{ ticker: 'WTC', weight: 15, marketValue: 15000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).toContain('WTC: upside overcorrection signal');
    expect(feed.innerHTML).toContain('Single-day move of +18.7% exceeds 10% threshold');
    expect(feed.innerHTML).toContain('Triggered 2026-03-06');
    expect(feed.innerHTML).toContain('Review by 2026-03-13');
    expect(feed.innerHTML).toContain('change-alert-item critical');
    expect(feed.style.display).not.toBe('none');
  });

  it('labels downside overcorrection correctly', () => {
    initStockData({
      FMG: {
        _alertState: 'OVERCORRECTION',
        _overcorrection: {
          active: true,
          triggerDate: '2026-03-05',
          direction: 'down',
          movePct: 11.0,
          reviewDate: '2026-03-12',
          message: 'Single-day move of -11.0% exceeds 10% threshold'
        },
        hero: { skew: 'DOWNSIDE' }
      }
    });
    var positions = [{ ticker: 'FMG', weight: 10, marketValue: 10000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).toContain('FMG: downside overcorrection signal');
  });

  it('ignores ticker where _overcorrection.active is false', () => {
    initStockData({
      GMG: {
        _alertState: 'OVERCORRECTION',
        _overcorrection: { active: false, triggerDate: '2026-02-01', reviewDate: '2026-02-08', direction: 'up' },
        hero: { skew: 'UPSIDE' }
      }
    });
    var positions = [{ ticker: 'GMG', weight: 20, marketValue: 20000 }];
    renderChangeAlerts(positions);

    var empty = document.getElementById('changeAlertsEmpty');
    expect(empty.style.display).toBe('');
  });
});

describe('renderChangeAlerts -- empty state', () => {
  it('shows empty state when no signals are active for any portfolio ticker', () => {
    initStockData({
      GMG: {
        _alertState: 'NORMAL',
        hero: { skew: 'UPSIDE', previousSkew: 'UPSIDE' }
      }
    });
    initFreshnessData({
      GMG: {
        status: 'OK',
        nearestCatalystDays: 30,
        nearestCatalyst: 'FY2026 Results',
        nearestCatalystDate: 'Aug 2026',
        reviewDate: '2026-03-01'
      }
    });

    var positions = [{ ticker: 'GMG', weight: 20, marketValue: 20000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    var empty = document.getElementById('changeAlertsEmpty');
    expect(feed.style.display).toBe('none');
    expect(empty.style.display).toBe('');
  });

  it('shows empty state when positions array is empty', () => {
    renderChangeAlerts([]);

    var feed = document.getElementById('changeAlertsFeed');
    var empty = document.getElementById('changeAlertsEmpty');
    expect(feed.style.display).toBe('none');
    expect(empty.style.display).toBe('');
  });

  it('shows empty state when portfolio tickers are not in STOCK_DATA', () => {
    var positions = [{ ticker: 'UNKNOWN', weight: 10, marketValue: 10000 }];
    renderChangeAlerts(positions);

    var empty = document.getElementById('changeAlertsEmpty');
    expect(empty.style.display).toBe('');
  });
});

describe('renderChangeAlerts -- no hardcoded ticker content', () => {
  it('does not render hardcoded XRO content when XRO has no active signals', () => {
    initStockData({
      XRO: { _alertState: 'NORMAL', hero: { skew: 'UPSIDE', previousSkew: 'UPSIDE' } }
    });
    initFreshnessData({ XRO: { status: 'OK', nearestCatalystDays: 30 } });

    var positions = [{ ticker: 'XRO', weight: 15, marketValue: 15000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).not.toContain('N3 Probability Increased');
    expect(feed.innerHTML).not.toContain('AI disruption thesis');
    expect(feed.innerHTML).not.toContain('Claude 4 announcement');
  });

  it('does not render hardcoded WOW content when WOW has no active signals', () => {
    initStockData({
      WOW: { _alertState: 'NORMAL', hero: { skew: 'DOWNSIDE', previousSkew: 'DOWNSIDE' } }
    });
    initFreshnessData({ WOW: { status: 'OK', nearestCatalystDays: 30 } });

    var positions = [{ ticker: 'WOW', weight: 12, marketValue: 12000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).not.toContain('Earnings Preview');
    expect(feed.innerHTML).not.toContain('11.8% EBIT growth');
  });

  it('does not render hardcoded CSL content when CSL has no active signals', () => {
    initStockData({
      CSL: { _alertState: 'NORMAL', hero: { skew: 'DOWNSIDE', previousSkew: 'DOWNSIDE' } }
    });
    initFreshnessData({ CSL: { status: 'OK', nearestCatalystDays: 30 } });

    var positions = [{ ticker: 'CSL', weight: 20, marketValue: 20000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).not.toContain('Plasma Collection Update');
    expect(feed.innerHTML).not.toContain('plasma');
  });

  it('never renders ASX 200 Volatility Elevated regardless of portfolio composition', () => {
    // Empty portfolio -- no signals possible
    renderChangeAlerts([]);
    expect(document.body.innerHTML).not.toContain('ASX 200 Volatility Elevated');

    // Portfolio with tickers but no signals
    initStockData({
      XRO: { _alertState: 'NORMAL', hero: { skew: 'UPSIDE', previousSkew: 'UPSIDE' } },
      WOW: { _alertState: 'NORMAL', hero: { skew: 'DOWNSIDE', previousSkew: 'DOWNSIDE' } }
    });
    var positions = [
      { ticker: 'XRO', weight: 15, marketValue: 15000 },
      { ticker: 'WOW', weight: 12, marketValue: 12000 }
    ];
    renderChangeAlerts(positions);
    expect(document.body.innerHTML).not.toContain('ASX 200 Volatility Elevated');
    expect(document.body.innerHTML).not.toContain('VIX-equivalent');
  });
});

describe('renderChangeAlerts -- catalyst signal', () => {
  it('renders warning when catalyst is approaching within 7 days', () => {
    initStockData({
      DRO: { _alertState: 'NORMAL', hero: { skew: 'BALANCED' } }
    });
    initFreshnessData({
      DRO: {
        status: 'MODERATE',
        nearestCatalystDays: 3,
        nearestCatalyst: 'FY2025 Full-Year Results',
        nearestCatalystDate: '10 March 2026',
        reviewDate: '2026-03-06'
      }
    });

    var positions = [{ ticker: 'DRO', weight: 8, marketValue: 8000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).toContain('DRO: catalyst approaching');
    expect(feed.innerHTML).toContain('FY2025 Full-Year Results');
    expect(feed.innerHTML).toContain('in 3 days');
    expect(feed.innerHTML).toContain('change-alert-item warning');
  });

  it('renders warning when catalyst is overdue (up to 14 days past)', () => {
    initStockData({
      OCL: { _alertState: 'NORMAL', hero: { skew: 'DOWNSIDE' } }
    });
    initFreshnessData({
      OCL: {
        status: 'MODERATE',
        nearestCatalystDays: -5,
        nearestCatalyst: 'H1 FY2026 Results',
        nearestCatalystDate: 'Feb-Mar 2026',
        reviewDate: '2026-03-01'
      }
    });

    var positions = [{ ticker: 'OCL', weight: 6, marketValue: 6000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).toContain('OCL: catalyst overdue');
    expect(feed.innerHTML).toContain('5 days overdue');
  });

  it('does not render catalyst alert when catalyst is more than 7 days away', () => {
    initStockData({
      CSL: { _alertState: 'NORMAL', hero: { skew: 'DOWNSIDE', previousSkew: 'DOWNSIDE' } }
    });
    initFreshnessData({
      CSL: {
        status: 'OK',
        nearestCatalystDays: 25,
        nearestCatalyst: 'Permanent CEO Appointment',
        nearestCatalystDate: '1H 2026',
        reviewDate: '2026-03-06'
      }
    });

    var positions = [{ ticker: 'CSL', weight: 20, marketValue: 20000 }];
    renderChangeAlerts(positions);

    var empty = document.getElementById('changeAlertsEmpty');
    expect(empty.style.display).toBe('');
  });
});

describe('renderChangeAlerts -- skew momentum signal', () => {
  it('renders info alert when skew direction has changed', () => {
    initStockData({
      BHP: {
        _alertState: 'NORMAL',
        hero: { skew: 'UPSIDE', previousSkew: 'DOWNSIDE' }
      }
    });

    var positions = [{ ticker: 'BHP', weight: 12, marketValue: 12000 }];
    renderChangeAlerts(positions);

    var feed = document.getElementById('changeAlertsFeed');
    expect(feed.innerHTML).toContain('BHP: skew direction changed');
    expect(feed.innerHTML).toContain('DOWNSIDE');
    expect(feed.innerHTML).toContain('UPSIDE');
    expect(feed.innerHTML).toContain('change-alert-item info');
  });

  it('does not render skew alert when previousSkew is absent', () => {
    initStockData({
      BHP: {
        _alertState: 'NORMAL',
        hero: { skew: 'UPSIDE', previousSkew: '' }
      }
    });

    var positions = [{ ticker: 'BHP', weight: 12, marketValue: 12000 }];
    renderChangeAlerts(positions);

    var empty = document.getElementById('changeAlertsEmpty');
    expect(empty.style.display).toBe('');
  });
});
