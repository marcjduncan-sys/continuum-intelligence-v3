import { describe, it, expect } from 'vitest';
import {
  renderCoverageTableHeader,
  renderCoverageTableRow,
  renderCoverageTableBody,
  renderFilterBar,
  renderCoverageTable
} from './coverage-table.js';

const defaultState = {
  sortColumn: 'attentionScore',
  sortDirection: 'desc',
  filterSignal: 'all',
  filterStaleness: 'all',
  filterExtraction: 'all',
  searchQuery: ''
};

function makeRow(overrides) {
  return Object.assign({
    ticker: 'BHP',
    name: 'BHP Group',
    price: 45.20,
    dayChangePct: 0.89,
    signal: 'upside',
    convictionPct: 45,
    ewpVsSpotPct: 12.3,
    freshnessHours: 24,
    dtc: 5,
    catalystLabel: 'FY results',
    workstationStatus: 'ready',
    routeTarget: '#workstation-BHP',
    signalChanged: false,
    attentionScore: 6,
    alertFlags: []
  }, overrides);
}

// ---------------------------------------------------------------------------
// renderCoverageTableHeader
// ---------------------------------------------------------------------------

describe('renderCoverageTableHeader', () => {
  it('renders a thead element', () => {
    const html = renderCoverageTableHeader('attentionScore', 'desc');
    expect(html).toContain('<thead>');
    expect(html).toContain('</thead>');
  });

  it('renders all 10 column headers', () => {
    const html = renderCoverageTableHeader('attentionScore', 'desc');
    expect(html).toContain('Ticker');
    expect(html).toContain('Company');
    expect(html).toContain('Price');
    expect(html).toContain('Signal');
    expect(html).toContain('Conviction');
    expect(html).toContain('Freshness');
    expect(html).toContain('DTC');
    expect(html).toContain('Attention');
  });

  it('active sort column has a sort indicator', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    expect(html).toContain('sort-indicator');
  });

  it('inactive column has no sort indicator', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    // Only one th should have sort-indicator
    const count = (html.match(/sort-indicator/g) || []).length;
    expect(count).toBe(1);
  });

  it('adds data-sort-col attributes', () => {
    const html = renderCoverageTableHeader('attentionScore', 'desc');
    expect(html).toContain('data-sort-col="ticker"');
    expect(html).toContain('data-sort-col="price"');
  });
});

// ---------------------------------------------------------------------------
// renderCoverageTableRow
// ---------------------------------------------------------------------------

describe('renderCoverageTableRow', () => {
  it('renders a tr with data-ticker attribute', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('data-ticker="BHP"');
    expect(html).toContain('<tr');
    expect(html).toContain('</tr>');
  });

  it('renders signal badge with correct class', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'upside' }));
    expect(html).toContain('signal-badge--upside');
    expect(html).toContain('Upside');
  });

  it('renders downside signal badge', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'downside' }));
    expect(html).toContain('signal-badge--downside');
  });

  it('renders conviction bar when convictionPct is not null', () => {
    const html = renderCoverageTableRow(makeRow({ convictionPct: 42 }));
    expect(html).toContain('conviction-bar');
    expect(html).toContain('42%');
  });

  it('renders metric-unavailable for null convictionPct', () => {
    const html = renderCoverageTableRow(makeRow({ convictionPct: null }));
    expect(html).toContain('metric-unavailable');
  });

  it('renders metric-unavailable for null ewpVsSpotPct', () => {
    const html = renderCoverageTableRow(makeRow({ ewpVsSpotPct: null }));
    expect(html).toContain('metric-unavailable');
  });

  it('renders dtc-imminent class when dtc <= 3', () => {
    const html = renderCoverageTableRow(makeRow({ dtc: 2 }));
    expect(html).toContain('dtc-imminent');
  });

  it('renders dtc-soon class when dtc <= 7', () => {
    const html = renderCoverageTableRow(makeRow({ dtc: 5 }));
    expect(html).toContain('dtc-soon');
  });

  it('renders -- for null dtc', () => {
    const html = renderCoverageTableRow(makeRow({ dtc: null }));
    expect(html).toContain('metric-unavailable');
  });

  it('renders data-home-price attribute for live price patching', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('data-home-price="BHP"');
  });

  it('renders data-home-change attribute for live price patching', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('data-home-change="BHP"');
  });

  it('renders freshness badge red for infinite hours', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: Infinity }));
    expect(html).toContain('freshness-badge--red');
  });

  it('renders freshness badge amber for hours > 48', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: 60 }));
    expect(html).toContain('freshness-badge--amber');
  });

  it('renders freshness badge green for hours <= 48', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: 24 }));
    expect(html).toContain('freshness-badge--green');
  });
});

// ---------------------------------------------------------------------------
// renderCoverageTableBody
// ---------------------------------------------------------------------------

describe('renderCoverageTableBody', () => {
  it('renders empty state when rows is empty', () => {
    const html = renderCoverageTableBody([]);
    expect(html).toContain('table-empty');
    expect(html).toContain('colspan');
  });

  it('renders one row per item', () => {
    const rows = [makeRow({ ticker: 'BHP' }), makeRow({ ticker: 'CBA' })];
    const html = renderCoverageTableBody(rows);
    expect(html).toContain('data-ticker="BHP"');
    expect(html).toContain('data-ticker="CBA"');
  });
});

// ---------------------------------------------------------------------------
// renderFilterBar
// ---------------------------------------------------------------------------

describe('renderFilterBar', () => {
  it('renders filter chips for signal', () => {
    const html = renderFilterBar(defaultState);
    expect(html).toContain('data-filter-group="signal"');
    expect(html).toContain('data-filter-value="upside"');
    expect(html).toContain('data-filter-value="downside"');
    expect(html).toContain('data-filter-value="balanced"');
  });

  it('marks active chip with active class', () => {
    const html = renderFilterBar({ ...defaultState, filterSignal: 'upside' });
    expect(html).toContain('data-filter-value="upside"');
    // The upside chip should have 'active' class (may include ci-chip class too)
    expect(html).toMatch(/class="filter-chip[^"]*active[^"]*"[^>]*data-filter-value="upside"|data-filter-value="upside"[^>]*class="filter-chip[^"]*active[^"]*"/);
  });

  it('renders search input', () => {
    const html = renderFilterBar(defaultState);
    expect(html).toContain('data-filter-search');
    expect(html).toContain('type="search"');
  });

  it('populates search input value from state', () => {
    const html = renderFilterBar({ ...defaultState, searchQuery: 'bhp' });
    expect(html).toContain('value="bhp"');
  });
});

// ---------------------------------------------------------------------------
// renderCoverageTable
// ---------------------------------------------------------------------------

describe('renderCoverageTable', () => {
  it('renders filter bar, thead, and tbody', () => {
    const rows = [makeRow()];
    const html = renderCoverageTable(rows, defaultState);
    expect(html).toContain('filter-bar');
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody');
    expect(html).toContain('coverage-table');
  });
});
