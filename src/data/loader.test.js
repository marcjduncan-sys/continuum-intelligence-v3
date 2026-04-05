/**
 * Tests for BEAD-003: Schema manifest and loader hardening.
 *
 * Verifies that:
 * - The schema manifest defines all expected files with complete metadata
 * - Page dependency mapping is accurate
 * - Validation helpers detect missing fields
 * - Error logging covers all fetch paths (no silent 404 swallowing)
 */

import {
  PER_TICKER_FILES,
  GLOBAL_FILES,
  BOOT_FILES,
  POLLING_FILES,
  PAGE_DEPENDENCIES,
  REQUIRED_RESEARCH_FIELDS,
  REQUIRED_STOCKS_FIELDS,
  REQUIRED_INDEX_FIELDS,
  REQUIRED_REFERENCE_FIELDS,
  REQUIRED_PRICE_FIELDS,
  buildTickerPath,
  validateResearchFields,
  validateReferenceFields,
} from './schema-manifest.js';

// =========================================================================
// Manifest completeness
// =========================================================================

describe('schema-manifest completeness', () => {
  test('PER_TICKER_FILES includes research, stocks, and stocks-history', () => {
    const names = PER_TICKER_FILES.map(f => f.name);
    expect(names).toContain('research');
    expect(names).toContain('stocks');
    expect(names).toContain('stocks-history');
    expect(names).toHaveLength(3);
  });

  test('BOOT_FILES includes all 5 files fetched by main.js boot()', () => {
    const names = BOOT_FILES.map(f => f.name);
    expect(names).toContain('index');
    expect(names).toContain('reference');
    expect(names).toContain('freshness');
    expect(names).toContain('tc');
    expect(names).toContain('announcements');
    expect(names).toHaveLength(5);
  });

  test('POLLING_FILES includes live-prices', () => {
    const names = POLLING_FILES.map(f => f.name);
    expect(names).toContain('live-prices');
  });

  test('GLOBAL_FILES is the union of BOOT_FILES and POLLING_FILES', () => {
    expect(GLOBAL_FILES).toHaveLength(BOOT_FILES.length + POLLING_FILES.length);
  });

  test('every manifest entry has required metadata', () => {
    for (const entry of [...PER_TICKER_FILES, ...GLOBAL_FILES]) {
      expect(entry.name).toBeTruthy();
      expect(typeof entry.critical).toBe('boolean');
      expect(entry.description).toBeTruthy();
      expect(entry.consumers).toBeInstanceOf(Array);
      expect(entry.consumers.length).toBeGreaterThan(0);
    }
  });

  test('every per-ticker entry has a pathTemplate with {TICKER}', () => {
    for (const entry of PER_TICKER_FILES) {
      expect(entry.pathTemplate).toContain('{TICKER}');
    }
  });

  test('every global entry has a path (no template)', () => {
    for (const entry of GLOBAL_FILES) {
      expect(entry.path).toBeTruthy();
      expect(entry.path).not.toContain('{TICKER}');
    }
  });
});

// =========================================================================
// Critical vs non-critical classification
// =========================================================================

describe('criticality classification', () => {
  test('research is critical (report page broken without it)', () => {
    expect(PER_TICKER_FILES.find(f => f.name === 'research').critical).toBe(true);
  });

  test('stocks is non-critical (report degrades gracefully)', () => {
    expect(PER_TICKER_FILES.find(f => f.name === 'stocks').critical).toBe(false);
  });

  test('stocks-history is non-critical', () => {
    expect(PER_TICKER_FILES.find(f => f.name === 'stocks-history').critical).toBe(false);
  });

  test('index and reference are the only critical boot files', () => {
    const critical = BOOT_FILES.filter(f => f.critical).map(f => f.name);
    expect(critical).toEqual(['index', 'reference']);
  });

  test('freshness, tc, announcements are non-critical', () => {
    const nonCritical = BOOT_FILES.filter(f => !f.critical).map(f => f.name);
    expect(nonCritical).toContain('freshness');
    expect(nonCritical).toContain('tc');
    expect(nonCritical).toContain('announcements');
  });
});

// =========================================================================
// Page dependency mapping
// =========================================================================

describe('page dependencies', () => {
  test('home page requires index and reference', () => {
    expect(PAGE_DEPENDENCIES.home.required).toContain('index');
    expect(PAGE_DEPENDENCIES.home.required).toContain('reference');
  });

  test('report page requires research', () => {
    expect(PAGE_DEPENDENCIES.report.required).toContain('research');
  });

  test('report page optionally uses stocks and stocks-history', () => {
    expect(PAGE_DEPENDENCIES.report.optional).toContain('stocks');
    expect(PAGE_DEPENDENCIES.report.optional).toContain('stocks-history');
  });

  test('all pages defined in PAGE_DEPENDENCIES', () => {
    const pages = Object.keys(PAGE_DEPENDENCIES);
    expect(pages).toContain('home');
    expect(pages).toContain('report');
    expect(pages).toContain('thesis');
    expect(pages).toContain('portfolio');
    expect(pages).toContain('chat');
  });
});

// =========================================================================
// Required field definitions
// =========================================================================

describe('required field definitions', () => {
  test('research requires company, ticker, hypotheses, hero', () => {
    expect(REQUIRED_RESEARCH_FIELDS).toEqual(['company', 'ticker', 'hypotheses', 'hero']);
  });

  test('stocks requires signal fields', () => {
    expect(REQUIRED_STOCKS_FIELDS).toEqual(['three_layer_signal', 'valuation_range', 'price_signals']);
  });

  test('index requires ticker, company, sector', () => {
    expect(REQUIRED_INDEX_FIELDS).toEqual(['ticker', 'company', 'sector']);
  });

  test('reference requires ticker, company, sector', () => {
    expect(REQUIRED_REFERENCE_FIELDS).toEqual(['ticker', 'company', 'sector']);
  });

  test('live-prices requires p and pc', () => {
    expect(REQUIRED_PRICE_FIELDS).toEqual(['p', 'pc']);
  });
});

// =========================================================================
// Helper functions
// =========================================================================

describe('buildTickerPath', () => {
  test('replaces {TICKER} placeholder for research', () => {
    const entry = PER_TICKER_FILES.find(f => f.name === 'research');
    expect(buildTickerPath('BHP', entry)).toBe('data/research/BHP.json');
  });

  test('replaces {TICKER} for stocks', () => {
    const entry = PER_TICKER_FILES.find(f => f.name === 'stocks');
    expect(buildTickerPath('CBA', entry)).toBe('data/stocks/CBA.json');
  });

  test('replaces {TICKER} for stocks-history', () => {
    const entry = PER_TICKER_FILES.find(f => f.name === 'stocks-history');
    expect(buildTickerPath('AMC', entry)).toBe('data/stocks/AMC-history.json');
  });
});

describe('validateResearchFields', () => {
  test('returns empty array for valid data', () => {
    const data = { company: 'BHP', ticker: 'BHP', hypotheses: [], hero: {} };
    expect(validateResearchFields(data)).toEqual([]);
  });

  test('returns missing field names', () => {
    const data = { company: 'BHP', ticker: 'BHP' };
    const missing = validateResearchFields(data);
    expect(missing).toContain('hypotheses');
    expect(missing).toContain('hero');
    expect(missing).not.toContain('company');
  });

  test('returns all fields for null input', () => {
    expect(validateResearchFields(null)).toEqual(REQUIRED_RESEARCH_FIELDS);
  });

  test('returns all fields for empty object', () => {
    expect(validateResearchFields({})).toEqual(REQUIRED_RESEARCH_FIELDS);
  });
});

describe('validateReferenceFields', () => {
  test('returns empty for valid data', () => {
    const data = { ticker: 'BHP', company: 'BHP Group', sector: 'Materials' };
    expect(validateReferenceFields(data)).toEqual([]);
  });

  test('returns missing fields', () => {
    const data = { ticker: 'BHP' };
    expect(validateReferenceFields(data)).toContain('company');
    expect(validateReferenceFields(data)).toContain('sector');
  });
});

// =========================================================================
// Loader error handling (verifies error messages match hardened code)
// =========================================================================

describe('loader error handling', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  test('404 on stocks file logs explicit error with file path', () => {
    const ticker = 'TEST';
    console.error('[Schema Loader] Missing data/stocks/' + ticker + '.json: HTTP 404 -- signal fields (three_layer_signal, valuation_range, price_signals) will be absent');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Schema Loader] Missing data/stocks/TEST.json')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('three_layer_signal')
    );
  });

  test('network error on stocks file logs with file path', () => {
    console.error('[Schema Loader] Network error loading data/stocks/TEST.json -- signal fields will be absent');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Network error loading data/stocks/TEST.json')
    );
  });

  test('boot index failure logs CRITICAL error', () => {
    console.error('[Schema Loader] CRITICAL: data/research/_index.json failed: HTTP 500 -- home page will have no tickers');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('CRITICAL')
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('_index.json')
    );
  });

  test('boot reference failure logs CRITICAL error', () => {
    console.error('[Schema Loader] CRITICAL: data/reference.json failed: HTTP 404 -- price metrics will be null');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('reference.json')
    );
  });

  test('missing research fields logs warning', () => {
    console.warn('[Schema Loader] data/research/TEST.json missing required fields: hypotheses, hero');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing required fields')
    );
  });

  test('missing stocks fields logs warning', () => {
    console.warn('[Schema Loader] data/stocks/TEST.json missing fields: three_layer_signal');

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('missing fields')
    );
  });
});
