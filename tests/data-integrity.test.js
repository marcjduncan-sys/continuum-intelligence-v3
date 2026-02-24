/**
 * Data Integrity Tests
 *
 * Validates that the extracted research data files are structurally
 * correct and consistent with the configuration.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const INDEX_PATH = path.join(RESEARCH_DIR, '_index.json');

describe('Ticker Configuration', () => {
  let tickerConfig;

  beforeAll(() => {
    tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf-8'));
  });

  test('tickers.json exists and is valid JSON', () => {
    expect(tickerConfig).toBeDefined();
    expect(tickerConfig.tickers).toBeDefined();
  });

  test('all tickers have required fields', () => {
    const tickers = Object.keys(tickerConfig.tickers);
    expect(tickers.length).toBeGreaterThanOrEqual(18);

    tickers.forEach(ticker => {
      const entry = tickerConfig.tickers[ticker];
      expect(entry).toHaveProperty('company');
      expect(entry).toHaveProperty('sector');
      expect(entry).toHaveProperty('exchange');
      expect(entry).toHaveProperty('currency');
      expect(entry).toHaveProperty('status');
    });
  });

  test('all active tickers have analysisConfig', () => {
    const tickers = Object.keys(tickerConfig.tickers);
    tickers.forEach(ticker => {
      const entry = tickerConfig.tickers[ticker];
      if (entry.status === 'active') {
        expect(entry).toHaveProperty('analysisConfig');
        expect(entry.analysisConfig).toHaveProperty('baseWeights');
        expect(entry.analysisConfig.baseWeights).toHaveProperty('N1');
        expect(entry.analysisConfig.baseWeights).toHaveProperty('N2');
        expect(entry.analysisConfig.baseWeights).toHaveProperty('N3');
        expect(entry.analysisConfig.baseWeights).toHaveProperty('N4');
      }
    });
  });
});

describe('Research Data Files', () => {
  let tickerConfig;
  let configTickers;

  beforeAll(() => {
    tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf-8'));
    configTickers = Object.keys(tickerConfig.tickers);
  });

  test('every configured ticker has a research JSON file', () => {
    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  test('every research file is valid JSON', () => {
    const files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
    files.forEach(file => {
      const content = fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });
  });

  test('every research file has required top-level fields', () => {
    const requiredFields = [
      'ticker', 'tickerFull', 'exchange', 'company', 'sector',
      'sectorSub', 'price', 'currency', 'date', 'reportId',
      'priceHistory', 'heroDescription', 'heroCompanyDescription',
      'heroMetrics', 'skew', 'verdict', 'featuredMetrics',
      'hypotheses'
    ];

    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      requiredFields.forEach(field => {
        expect(data).toHaveProperty(field);
      });
    });
  });

  test('hypotheses array has exactly 4 entries per ticker', () => {
    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(data.hypotheses).toHaveLength(4);
    });
  });

  test('each hypothesis has required fields', () => {
    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      data.hypotheses.forEach((hyp, idx) => {
        expect(hyp).toHaveProperty('tier');
        expect(hyp).toHaveProperty('direction');
        expect(hyp).toHaveProperty('title');
        expect(hyp).toHaveProperty('score');
        expect(['upside', 'downside', 'neutral']).toContain(hyp.direction);
        expect(['n1', 'n2', 'n3', 'n4']).toContain(hyp.tier.toLowerCase());
      });
    });
  });

  test('skew direction is valid', () => {
    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(['upside', 'downside', 'neutral', 'balanced']).toContain(data.skew.direction);
      expect(data.skew).toHaveProperty('rationale');
    });
  });

  test('priceHistory is a non-empty array of numbers', () => {
    configTickers.forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(Array.isArray(data.priceHistory)).toBe(true);
      expect(data.priceHistory.length).toBeGreaterThan(10);
      data.priceHistory.forEach(p => {
        expect(typeof p).toBe('number');
        expect(p).toBeGreaterThan(0);
      });
    });
  });
});

describe('Index File', () => {
  let indexData;
  let tickerConfig;

  beforeAll(() => {
    indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf-8'));
    tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf-8'));
  });

  test('_index.json exists and is valid', () => {
    expect(indexData).toBeDefined();
    expect(typeof indexData).toBe('object');
  });

  test('index contains all configured tickers', () => {
    const configTickers = Object.keys(tickerConfig.tickers);
    configTickers.forEach(ticker => {
      expect(indexData).toHaveProperty(ticker);
    });
  });

  test('index entries have lightweight fields for home page', () => {
    const requiredFields = [
      'ticker', 'tickerFull', 'company', 'sector', 'price',
      'currency', 'featuredMetrics', 'skew', 'hypotheses'
    ];

    Object.keys(indexData).forEach(ticker => {
      requiredFields.forEach(field => {
        expect(indexData[ticker]).toHaveProperty(field);
      });
    });
  });

  test('index hypotheses are slim (no supporting/contradicting arrays)', () => {
    Object.keys(indexData).forEach(ticker => {
      indexData[ticker].hypotheses.forEach(hyp => {
        expect(hyp).not.toHaveProperty('supporting');
        expect(hyp).not.toHaveProperty('contradicting');
        expect(hyp).not.toHaveProperty('requires');
      });
    });
  });

  test('index file is smaller than full research data', () => {
    const indexSize = Buffer.byteLength(JSON.stringify(indexData), 'utf-8');
    let totalResearchSize = 0;

    Object.keys(indexData).forEach(ticker => {
      const filePath = path.join(RESEARCH_DIR, `${ticker}.json`);
      if (fs.existsSync(filePath)) {
        totalResearchSize += fs.statSync(filePath).size;
      }
    });

    // Index should be less than 30% of total research data
    expect(indexSize).toBeLessThan(totalResearchSize * 0.3);
  });
});
