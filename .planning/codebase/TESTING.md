# Testing Patterns

**Analysis Date:** 2026-02-19

## Test Framework

**Runner:**
- **Framework:** Jest v29.7.0
- **Config file:** `jest.config.js` (at root)
- **Environment:** jsdom (browser-like environment for DOM testing)

**Assertion Library:**
- Jest built-in assertions (no additional library)
- Pattern: `expect(value).toBe()`, `expect(value).toContain()`, etc.

**Run Commands:**
```bash
npm test              # Run all tests with verbose output
npm run test:ci       # Run tests with coverage (CI mode)
```

**Configuration Details:**
```javascript
// jest.config.js
{
  testEnvironment: 'jsdom',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'scripts/**/*.js',
    '!scripts/extract-stock-data.js',
    '!scripts/refactor-stock-data.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov'],
  verbose: true
}
```

## Test File Organization

**Location:**
- **Pattern:** Co-located in dedicated `tests/` directory
- **Directory:** `tests/` at project root
- **Separate from source:** Source in `js/`, `scripts/`; tests in dedicated directory

**Naming:**
- Pattern: `*.test.js` suffix
- Convention: Named after component or concern being tested
- Examples: `data-integrity.test.js`, `html-structure.test.js`

**Structure:**
```
tests/
├── data-integrity.test.js      # Validates JSON files and schema consistency
└── html-structure.test.js      # Tests HTML document structure and security
```

## Test Structure

**Suite Organization:**

From `data-integrity.test.js`:
```javascript
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');

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
    });
  });
});
```

**Patterns:**

- **Setup:** `beforeAll()` for reading files and loading test data once
- **Teardown:** Not required; no persistent state modified (read-only tests)
- **Assertions:** Multiple assertions per test; grouped by logical unit
- **Iteration:** `.forEach()` used for parametric testing over collections

**Test isolation:**
- File-based tests: Each test reads fresh from disk
- No cross-test dependencies
- No test pollution (tests don't modify state)

## Mocking

**Framework:** None currently used

**Patterns:**
- Tests are integration-style: They read real JSON files and validate structure
- No mocking of `fs`, `fetch`, or network calls in current test suite
- Example: `data-integrity.test.js` reads actual `data/stocks/*.json` files

**When mocking would be needed:**
- Mock `fetch()` for testing network operations in future
- Mock file system for error scenarios in scripts
- Currently, tests validate real artifacts to ensure production correctness

**What NOT to Mock:**
- File system operations (intentional; tests validate real data)
- JSON parsing (real data structures important to validate)
- Core library functions (integration testing preferred)

## Fixtures and Factories

**Test Data:**
- **No dedicated fixtures:** Test data comes from actual project files
- **Real artifacts used:** Reading from `data/` and `data/config/` directories
- **Pattern:** Tests assume consistent structure in `tickers.json` and stock JSON files

**Location:**
- Test data lives in: `data/config/tickers.json`, `data/stocks/`, `data/research/`
- Tests reference via path constants: `TICKERS_PATH`, `RESEARCH_DIR`, `STOCKS_DIR`
- Example from `data-integrity.test.js`:
  ```javascript
  const TICKERS_PATH = path.join(ROOT, 'data', 'config', 'tickers.json');
  const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
  ```

## Coverage

**Requirements:** None enforced in CI (coverage disabled in default test run)

**Coverage in CI mode:**
- Collected from `scripts/**/*.js` (core business logic)
- Excludes: `extract-stock-data.js`, `refactor-stock-data.js`
- Reporters: Text and LCOV format

**View Coverage:**
```bash
npm run test:ci       # Generates coverage report
# Output: ./coverage/index.html (LCOV HTML report)
```

**Current state:** Coverage reports generated but no threshold enforced

## Test Types

**Unit Tests:**
- **Scope:** Individual functions and isolated concerns
- **Examples:** None currently in suite (focus is integration)
- **Approach:** Would test parsing, calculation, validation functions

**Integration Tests:**
- **Scope:** Data integrity across entire system
- **Current use:** Primary test type in codebase
- **Examples:**
  - `data-integrity.test.js`: Validates configuration, file structure, required fields
  - `html-structure.test.js`: Validates HTML document structure, security headers, accessibility

**End-to-End Tests:**
- **Framework:** Not used
- **Approach:** Tests run against real data files and index.html

**Data validation tests (integration pattern):**
- Read actual JSON files
- Validate schema and required fields
- Check cross-file consistency (registry vs. stock files)
- Verify HTML structure and content

## Common Patterns

**Async Testing:**
- No async tests currently; all tests are synchronous
- File I/O happens in `beforeAll()` which is sync
- Pattern would use `async/await` in test function if needed:
  ```javascript
  test('async operation', async () => {
    const result = await someAsyncFn();
    expect(result).toBeDefined();
  });
  ```

**Error Testing:**
- Validation of expected properties and structure
- Pattern: Assert properties exist before accessing
  ```javascript
  test('all tickers have required fields', () => {
    tickers.forEach(ticker => {
      const entry = tickerConfig.tickers[ticker];
      expect(entry).toHaveProperty('company');  // Error if missing
    });
  });
  ```

**Parametric testing:**
- Loop over collection, run same assertion multiple times
- Pattern: `.forEach()` with assertions inside
- Example: Validate all 18+ tickers have required fields

**Collection validation:**
- Check array length: `expect(array.length).toBeGreaterThanOrEqual(18)`
- Validate each item: `.forEach(item => expect(item).toHaveProperty(...))`
- Check existence: `expect(fs.existsSync(path)).toBe(true)`

## Security Headers & Accessibility Testing

**HTML Structure Tests (from html-structure.test.js):**

Security validations:
```javascript
describe('Security Headers', () => {
  test('CSP meta tag is present', () => {
    expect(html).toContain('Content-Security-Policy');
  });

  test('DOMPurify script is included', () => {
    expect(html).toContain('dompurify');
    expect(html).toContain('integrity=');  // SRI check
  });

  test('no inline STOCK_DATA assignments remain', () => {
    expect(html).not.toMatch(/^STOCK_DATA\.[A-Z]{2,4}\s*=\s*\{/m);
  });

  test('CORS proxy URLs are not present', () => {
    expect(html).not.toContain('corsproxy.io');
  });

  test('fonts are self-hosted (no Google Fonts CDN)', () => {
    expect(html).not.toContain('fonts.googleapis.com');
  });
});
```

Accessibility validations:
```javascript
describe('Accessibility Landmarks', () => {
  test('skip link is present', () => {
    expect(html).toContain('skip-link');
  });

  test('main landmark is present', () => {
    expect(html).toContain('<main');
    expect(html).toContain('id="main-content"');
  });

  test('nav has aria-label', () => {
    expect(html).toMatch(/nav.*aria-label/);
  });

  test('aria-live region exists', () => {
    expect(html).toContain('aria-live');
  });
});
```

## Test Execution & CI

**Local execution:**
```bash
npm test              # Run all tests, verbose output
npm run lint          # Lint before testing
npm run validate      # Run lint + test together
```

**CI execution:**
```bash
npm run test:ci       # Includes coverage collection
```

**No pre-commit hooks:** Tests must be run manually or via CI

## Data Files Validated by Tests

**Coverage validation targets:**

From `data-integrity.test.js`:
- `data/config/tickers.json` — Ticker registry with metadata
- `data/stocks/*.json` — Individual stock research data files
- `data/research/*.json` — Research data directory
- `data/config/price_rules.json` — Price evidence configuration

**Validation rules:**
- Required top-level fields in stock files:
  - `ticker`, `tickerFull`, `exchange`, `company`, `sector`
  - `sectorSub`, `price`, `currency`, `date`, `reportId`
  - `priceHistory`, `heroDescription`, `heroCompanyDescription`
  - `heroMetrics`, `skew`, `verdict`, `featuredMetrics`, `hypotheses`

- Ticker configuration rules:
  - All tickers must have: `company`, `sector`, `exchange`, `currency`, `status`
  - Active tickers must have: `analysisConfig` with `baseWeights` (T1-T4)

- Cross-file consistency:
  - Every ticker in registry has corresponding `.json` file
  - Every registry ticker is referenced in index.html

---

*Testing analysis: 2026-02-19*
