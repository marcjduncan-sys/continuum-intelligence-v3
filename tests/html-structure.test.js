/**
 * HTML Structure Tests
 *
 * Validates critical structural elements of index.html including
 * security headers, accessibility landmarks, and required functions.
 */

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'index.html');
let html;

beforeAll(() => {
  html = fs.readFileSync(HTML_PATH, 'utf-8');
});

describe('Security Headers', () => {
  test('CSP meta tag is present', () => {
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain("default-src 'self'");
  });

  test('DOMPurify script is included', () => {
    expect(html).toContain('dompurify');
    expect(html).toContain('integrity=');
  });

  test('marked.js has SRI hash', () => {
    expect(html).toMatch(/marked.*integrity=/);
  });

  test('no inline STOCK_DATA assignments remain', () => {
    // All data should be loaded from JSON files now
    expect(html).not.toMatch(/^STOCK_DATA\.[A-Z]{2,4}\s*=\s*\{/m);
  });

  test('CORS proxy URLs are not present', () => {
    expect(html).not.toContain('corsproxy.io');
    expect(html).not.toContain('allorigins.win');
    expect(html).not.toContain('codetabs.com');
    expect(html).not.toContain('cors-anywhere');
  });

  test('fonts are self-hosted (no Google Fonts CDN)', () => {
    expect(html).not.toContain('fonts.googleapis.com');
    expect(html).not.toContain('fonts.gstatic.com');
    expect(html).toContain("font-src 'self'");
  });

  test('font preload hints are present', () => {
    expect(html).toContain('rel="preload"');
    expect(html).toContain('inter-latin.woff2');
    expect(html).toContain('source-serif-4-latin.woff2');
    expect(html).toContain('as="font"');
  });
});

describe('Accessibility Landmarks', () => {
  test('skip link is present', () => {
    expect(html).toContain('skip-link');
    expect(html).toContain('Skip to main content');
  });

  test('main landmark is present', () => {
    expect(html).toContain('<main');
    expect(html).toContain('id="main-content"');
  });

  test('nav has aria-label', () => {
    expect(html).toMatch(/nav.*aria-label/);
  });

  test('screen reader only class is defined', () => {
    expect(html).toContain('.sr-only');
  });

  test('aria-live region exists', () => {
    expect(html).toContain('aria-live');
  });

  test('prefers-reduced-motion query exists', () => {
    expect(html).toContain('prefers-reduced-motion');
  });
});

describe('Data Loader', () => {
  test('synchronous index loader is present', () => {
    expect(html).toContain('StockDataLoader');
    expect(html).toContain('data/research/_index.json');
  });

  test('async research data loader function exists', () => {
    expect(html).toContain('function loadFullResearchData');
    expect(html).toContain('data/research/');
  });

  test('_indexOnly flag is used in route()', () => {
    expect(html).toContain('_indexOnly');
  });
});

describe('Route Validation', () => {
  test('VALID_STATIC_PAGES allowlist exists', () => {
    expect(html).toContain('VALID_STATIC_PAGES');
    expect(html).toContain("'home'");
    expect(html).toContain("'snapshots'");
    expect(html).toContain("'portfolio'");
    expect(html).toContain("'about'");
  });

  test('route() validates hashes', () => {
    expect(html).toContain('isValidRoute');
    expect(html).toContain('STOCK_DATA.hasOwnProperty');
  });
});

describe('Critical Functions', () => {
  const requiredFunctions = [
    'function route()',
    'function renderReportPage',
    'function renderSnapshotPage',
    'function renderFeaturedCard',
    'function renderCoverageRow',
    'function buildSnapshotFromStock',
    'function computeSkewScore',
    'function loadFullResearchData'
  ];

  requiredFunctions.forEach(fn => {
    test(`${fn} is defined`, () => {
      expect(html).toContain(fn);
    });
  });
});
