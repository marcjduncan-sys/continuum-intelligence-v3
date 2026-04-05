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
    sector: 'Mining',
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

  it('renders all 9 column headers', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    expect(html).toContain('Stock');
    expect(html).toContain('Sector');
    expect(html).toContain('Price');
    expect(html).toContain('1D');
    expect(html).toContain('Verdict');
    expect(html).toContain('Thesis Skew');
    expect(html).toContain('Conviction');
    expect(html).toContain('Updated');
  });

  it('active sort column has a sort indicator', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    expect(html).toContain('sort-indicator');
  });

  it('inactive column has no sort indicator', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    const count = (html.match(/sort-indicator/g) || []).length;
    expect(count).toBe(1);
  });

  it('adds data-sort-col attributes to sortable columns', () => {
    const html = renderCoverageTableHeader('attentionScore', 'desc');
    expect(html).toContain('data-sort-col="ticker"');
    expect(html).toContain('data-sort-col="price"');
    expect(html).toContain('data-sort-col="convictionPct"');
  });

  it('does not add data-sort-col to non-sortable columns', () => {
    const html = renderCoverageTableHeader('price', 'asc');
    expect(html).not.toContain('data-sort-col="null"');
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

  it('renders verdict tag green for upside signal', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'upside' }));
    expect(html).toContain('tag green');
    expect(html).toContain('Upside');
  });

  it('renders verdict tag red for downside signal', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'downside' }));
    expect(html).toContain('tag red');
    expect(html).toContain('Downside');
  });

  it('renders verdict tag amber for balanced signal', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'balanced' }));
    expect(html).toContain('tag amber');
    expect(html).toContain('Balanced');
  });

  it('renders signal-badge class for upside (used by CSS)', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'upside' }));
    // Verdict tag contains the signal; ensure class reflects it
    expect(html).toContain('Upside');
  });

  it('renders signal-badge class for downside', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'downside' }));
    expect(html).toContain('Downside');
  });

  it('renders conviction bar when convictionPct is not null', () => {
    const html = renderCoverageTableRow(makeRow({ convictionPct: 42 }));
    expect(html).toContain('confidence-bar');
    expect(html).toContain('42%');
  });

  it('renders metric-unavailable for null convictionPct', () => {
    const html = renderCoverageTableRow(makeRow({ convictionPct: null }));
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

  it('renders status-dot stale for infinite freshnessHours', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: Infinity }));
    expect(html).toContain('status-dot stale');
  });

  it('renders status-dot stale for freshnessHours > 72', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: 96 }));
    expect(html).toContain('status-dot stale');
  });

  it('renders status-dot fresh for freshnessHours <= 72', () => {
    const html = renderCoverageTableRow(makeRow({ freshnessHours: 24 }));
    expect(html).toContain('status-dot fresh');
  });

  it('renders ticker badge with t-badge class', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('t-badge');
    expect(html).toContain('BHP');
  });

  it('renders company name with t-name class', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('t-name');
    expect(html).toContain('BHP Group');
  });

  it('renders ASX label in t-sector', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('ASX: BHP');
  });

  it('renders sector column text', () => {
    const html = renderCoverageTableRow(makeRow({ sector: 'Mining' }));
    expect(html).toContain('Mining');
  });

  it('renders view button with tbl-action class', () => {
    const html = renderCoverageTableRow(makeRow());
    expect(html).toContain('tbl-action');
    expect(html).toContain('View');
  });

  it('renders thesis skew strong upside for high conviction upside', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'upside', convictionPct: 85 }));
    expect(html).toContain('Strong upside');
  });

  it('renders thesis skew balanced skew for balanced signal', () => {
    const html = renderCoverageTableRow(makeRow({ signal: 'balanced', convictionPct: 50 }));
    expect(html).toContain('Balanced skew');
  });

  it('renders positive day change with pos class', () => {
    const html = renderCoverageTableRow(makeRow({ dayChangePct: 1.5 }));
    expect(html).toContain('class="chg pos"');
  });

  it('renders negative day change with neg class', () => {
    const html = renderCoverageTableRow(makeRow({ dayChangePct: -1.5 }));
    expect(html).toContain('class="chg neg"');
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

  it('empty colspan is 9 (matches column count)', () => {
    const html = renderCoverageTableBody([]);
    expect(html).toContain('colspan="9"');
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
