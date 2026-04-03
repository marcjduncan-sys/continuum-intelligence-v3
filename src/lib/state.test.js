import {
  STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA, SNAPSHOT_DATA, WORKSTATION_DATA,
  initStockData, initReferenceData, initFreshnessData, initWorkstationData,
  getStock, getAllTickers, setStockData, patchStock,
  getReference, getFreshness,
  getWorkstation, setWorkstation, getAllWorkstationTickers, clearWorkstation,
  FEATURED_ORDER, SNAPSHOT_ORDER, VALID_STATIC_PAGES,
} from './state.js';

// State isolation: clear singletons before each test
beforeEach(() => {
  for (var k in STOCK_DATA) delete STOCK_DATA[k];
  for (var k in REFERENCE_DATA) delete REFERENCE_DATA[k];
  for (var k in FRESHNESS_DATA) delete FRESHNESS_DATA[k];
  for (var k in SNAPSHOT_DATA) delete SNAPSHOT_DATA[k];
  for (var k in WORKSTATION_DATA) delete WORKSTATION_DATA[k];
});

describe('VALID_STATIC_PAGES', () => {
  it('is a Set with 9 entries', () => {
    expect(VALID_STATIC_PAGES).toBeInstanceOf(Set);
    expect(VALID_STATIC_PAGES.size).toBe(9);
  });
  it('contains all static page names', () => {
    ['home', 'deep-research', 'portfolio', 'comparator', 'personalisation', 'memory', 'pm', 'ops', 'about']
      .forEach(page => expect(VALID_STATIC_PAGES.has(page)).toBe(true));
  });
  it('rejects unknown pages', () => {
    expect(VALID_STATIC_PAGES.has('admin')).toBe(false);
    expect(VALID_STATIC_PAGES.has('')).toBe(false);
  });
});

describe('initStockData / getStock / getAllTickers', () => {
  it('starts empty before seeding', () => {
    expect(getAllTickers()).toHaveLength(0);
  });
  it('stores and retrieves stock by ticker', () => {
    initStockData({ CBA: { price: 130, currency: 'A$' } });
    expect(getStock('CBA')).toEqual({ price: 130, currency: 'A$' });
  });
  it('merges multiple init calls', () => {
    initStockData({ CBA: { price: 130 } });
    initStockData({ WBC: { price: 28 } });
    expect(getAllTickers()).toContain('CBA');
    expect(getAllTickers()).toContain('WBC');
  });
  it('returns undefined for unknown ticker', () => {
    expect(getStock('XYZ')).toBeUndefined();
  });
});

describe('setStockData / patchStock', () => {
  it('setStockData replaces entire entry', () => {
    initStockData({ CBA: { price: 130, name: 'CommBank' } });
    setStockData('CBA', { price: 135 });
    expect(getStock('CBA')).toEqual({ price: 135 });
    expect(getStock('CBA').name).toBeUndefined();
  });
  it('patchStock merges into existing entry', () => {
    initStockData({ CBA: { price: 130, name: 'CommBank' } });
    patchStock('CBA', { price: 135, _livePrice: 135 });
    expect(getStock('CBA').name).toBe('CommBank');
    expect(getStock('CBA').price).toBe(135);
    expect(getStock('CBA')._livePrice).toBe(135);
  });
});

describe('FEATURED_ORDER Proxy', () => {
  it('is empty before seeding', () => {
    expect(FEATURED_ORDER.length).toBe(0);
  });
  it('reflects STOCK_DATA keys after seeding', () => {
    initStockData({ CBA: {}, WBC: {} });
    expect(FEATURED_ORDER.length).toBe(2);
    expect(FEATURED_ORDER[0]).toBe('CBA');
    expect(FEATURED_ORDER[1]).toBe('WBC');
  });
  it('updates dynamically when STOCK_DATA changes', () => {
    initStockData({ CBA: {} });
    expect(FEATURED_ORDER.length).toBe(1);
    initStockData({ WBC: {} });
    expect(FEATURED_ORDER.length).toBe(2);
  });
  it('supports forEach iteration', () => {
    initStockData({ CBA: {}, WBC: {} });
    const tickers = [];
    FEATURED_ORDER.forEach(t => tickers.push(t));
    expect(tickers).toEqual(['CBA', 'WBC']);
  });
});

describe('SNAPSHOT_ORDER Proxy', () => {
  it('mirrors FEATURED_ORDER', () => {
    initStockData({ CBA: {}, WBC: {} });
    expect(SNAPSHOT_ORDER.length).toBe(FEATURED_ORDER.length);
    expect(SNAPSHOT_ORDER[0]).toBe(FEATURED_ORDER[0]);
  });
});

describe('Reference and Freshness accessors', () => {
  it('stores and retrieves reference data', () => {
    initReferenceData({ CBA: { sharesOutstanding: 1700000 } });
    expect(getReference('CBA')).toEqual({ sharesOutstanding: 1700000 });
  });
  it('stores and retrieves freshness data', () => {
    initFreshnessData({ CBA: { updatedAt: '2026-02-27' } });
    expect(getFreshness('CBA')).toEqual({ updatedAt: '2026-02-27' });
  });
});

describe('Workstation accessor functions', () => {
  it('WORKSTATION_DATA starts as an object', () => {
    expect(typeof WORKSTATION_DATA).toBe('object');
    expect(WORKSTATION_DATA).toEqual({});
  });
  it('getWorkstation returns undefined for unknown ticker', () => {
    expect(getWorkstation('XYZ')).toBeUndefined();
  });
  it('setWorkstation stores and getWorkstation retrieves', () => {
    setWorkstation('CBA', { position: 'long', shares: 1000 });
    expect(getWorkstation('CBA')).toEqual({ position: 'long', shares: 1000 });
  });
  it('initWorkstationData merges multiple tickers via Object.assign', () => {
    initWorkstationData({ CBA: { position: 'long' }, WBC: { position: 'short' } });
    expect(getWorkstation('CBA')).toEqual({ position: 'long' });
    expect(getWorkstation('WBC')).toEqual({ position: 'short' });
  });
  it('getAllWorkstationTickers returns correct keys', () => {
    initWorkstationData({ CBA: { position: 'long' }, WBC: { position: 'short' }, ASX: { position: 'hold' } });
    const tickers = getAllWorkstationTickers();
    expect(tickers).toContain('CBA');
    expect(tickers).toContain('WBC');
    expect(tickers).toContain('ASX');
    expect(tickers).toHaveLength(3);
  });
  it('clearWorkstation removes a specific ticker', () => {
    initWorkstationData({ CBA: { position: 'long' }, WBC: { position: 'short' } });
    clearWorkstation('CBA');
    expect(getWorkstation('CBA')).toBeUndefined();
    expect(getWorkstation('WBC')).toEqual({ position: 'short' });
    expect(getAllWorkstationTickers()).toEqual(['WBC']);
  });
  it('setWorkstation does not affect STOCK_DATA (isolation test)', () => {
    initStockData({ CBA: { price: 130 } });
    setWorkstation('CBA', { position: 'long' });
    expect(getStock('CBA')).toEqual({ price: 130 });
    expect(getWorkstation('CBA')).toEqual({ position: 'long' });
  });
});
