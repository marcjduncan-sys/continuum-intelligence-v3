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
    expect(tickers.length).toBeGreaterThanOrEqual(35);

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
      expect(['upside', 'downside', 'neutral', 'balanced', 'bullish', 'bearish']).toContain(data.skew.direction);
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


// ---------------------------------------------------------------------------
// Deep validation for INITIATED stocks (not scaffolds)
// A stock is "initiated" if its first hypothesis score is not "?"
// ---------------------------------------------------------------------------
describe('Deep Validation — Initiated Stocks', () => {
  let initiatedFiles;

  beforeAll(() => {
    const files = fs.readdirSync(RESEARCH_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('_'));
    initiatedFiles = files.map(f => {
      const data = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf-8'));
      return data;
    }).filter(d => {
      const first = (d.hypotheses || [])[0];
      return first && first.score && first.score !== '?';
    });
  });

  test('has at least 1 initiated stock to validate', () => {
    expect(initiatedFiles.length).toBeGreaterThanOrEqual(1);
  });

  test('priceHistory has 50+ entries for initiated stocks', () => {
    initiatedFiles.forEach(d => {
      expect(d.priceHistory.length).toBeGreaterThanOrEqual(50);
    });
  });

  test('heroMetrics has 3+ items', () => {
    initiatedFiles.forEach(d => {
      expect(d.heroMetrics.length).toBeGreaterThanOrEqual(3);
      d.heroMetrics.forEach(m => {
        expect(m).toHaveProperty('label');
        expect(m).toHaveProperty('value');
        expect(m.value).not.toBe('');
      });
    });
  });

  test('featuredMetrics has 3+ items', () => {
    initiatedFiles.forEach(d => {
      expect(d.featuredMetrics.length).toBeGreaterThanOrEqual(3);
      d.featuredMetrics.forEach(m => {
        expect(m).toHaveProperty('label');
        expect(m).toHaveProperty('value');
      });
    });
  });

  test('identity.rows has 3+ rows', () => {
    initiatedFiles.forEach(d => {
      expect(d.identity).toBeDefined();
      expect(d.identity.rows.length).toBeGreaterThanOrEqual(3);
    });
  });

  test('verdict.scores have scoreColor set (not empty)', () => {
    initiatedFiles.forEach(d => {
      if (!d.verdict || !d.verdict.scores) return;
      d.verdict.scores.forEach(vs => {
        if (vs.score === '?') return; // scaffold placeholder
        expect(vs.scoreColor).toBeDefined();
        // scoreColor must be some value — CSS var or hex color
        // Empty string means the bug at line 1778 was hit
        expect(typeof vs.scoreColor).toBe('string');
        expect(vs.scoreColor.length).toBeGreaterThan(0);
      });
    });
  });

  test('hypothesis scores are valid percentages (pre-normalisation)', () => {
    // Note: raw scores do NOT sum to 100% — they are survival scores
    // that get normalised by normaliseScores() on the frontend.
    // Each individual score should be a valid percentage string.
    initiatedFiles.forEach(d => {
      d.hypotheses.forEach(h => {
        const raw = String(h.score).replace('%', '');
        const num = parseFloat(raw);
        expect(isNaN(num)).toBe(false);
        expect(num).toBeGreaterThanOrEqual(1);
        expect(num).toBeLessThanOrEqual(95);
      });
    });
  });

  test('position_in_range has numeric prices', () => {
    initiatedFiles.forEach(d => {
      const pir = (d.hero || {}).position_in_range;
      if (!pir) return; // acceptable if hero.position_in_range absent
      expect(typeof pir.current_price).toBe('number');
      expect(pir.current_price).toBeGreaterThan(0);
      (pir.worlds || []).forEach(w => {
        expect(typeof w.price).toBe('number');
        expect(w.price).toBeGreaterThan(0);
        expect(w).toHaveProperty('label');
      });
    });
  });

  test('evidence.cards has entries with required fields', () => {
    initiatedFiles.forEach(d => {
      const cards = (d.evidence || {}).cards || [];
      expect(cards.length).toBeGreaterThanOrEqual(1);
      cards.forEach(c => {
        // Cards must have at least a name/title identifier
        const hasName = c.hasOwnProperty('name') || c.hasOwnProperty('title') || c.hasOwnProperty('domain');
        expect(hasName).toBe(true);
      });
    });
  });

  test('gaps.coverageRows exist for initiated stocks', () => {
    initiatedFiles.forEach(d => {
      const rows = (d.gaps || {}).coverageRows || [];
      // Initiated stocks should have some coverage rows
      // (newly refreshed stocks via the fixed pipeline will have confidenceClass)
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('no emoji characters in research text', () => {
    const emojiPattern = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{FE0F}]/u;
    initiatedFiles.forEach(d => {
      const text = JSON.stringify(d);
      const match = text.match(emojiPattern);
      if (match) {
        // Report the ticker + first emoji found
        throw new Error(`${d.ticker}: contains emoji "${match[0]}" (code point U+${match[0].codePointAt(0).toString(16).toUpperCase()})`);
      }
    });
  });

  test('footer counts are populated', () => {
    initiatedFiles.forEach(d => {
      const footer = d.footer || {};
      if (footer.hypothesesCount) {
        expect(footer.hypothesesCount).not.toBe('4 Pending');
      }
      if (footer.domainCount) {
        expect(footer.domainCount).not.toBe('0 of 10');
      }
    });
  });

  test('narrative sections are populated', () => {
    initiatedFiles.forEach(d => {
      const n = d.narrative || {};
      expect(n.theNarrative).toBeDefined();
      expect(n.theNarrative.length).toBeGreaterThan(50);
      expect(n.evidenceCheck).toBeDefined();
      expect(n.narrativeStability).toBeDefined();
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

  test('index hypotheses have core fields', () => {
    Object.keys(indexData).forEach(ticker => {
      indexData[ticker].hypotheses.forEach(hyp => {
        expect(hyp).toHaveProperty('tier');
        expect(hyp).toHaveProperty('direction');
        expect(hyp).toHaveProperty('score');
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
