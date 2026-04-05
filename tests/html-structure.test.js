/**
 * HTML Structure & Module Architecture Tests
 *
 * Validates index.html structure (security, accessibility, module wiring)
 * and confirms critical functions exist in their src/ module locations.
 * Updated for the modular architecture (Phases 0-3) where JS and CSS live
 * in src/ modules, not as inline blocks in index.html.
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

// Files under test
const HTML        = fs.readFileSync(path.join(root, 'index.html'), 'utf-8');
const BASE_CSS    = fs.readFileSync(path.join(root, 'src/styles/base.css'), 'utf-8');
const ROUTER      = fs.readFileSync(path.join(root, 'src/lib/router.js'), 'utf-8');
const STATE       = fs.readFileSync(path.join(root, 'src/lib/state.js'), 'utf-8');
const LOADER      = fs.readFileSync(path.join(root, 'src/data/loader.js'), 'utf-8');
const DOM_LIB     = fs.readFileSync(path.join(root, 'src/lib/dom.js'), 'utf-8');
const HOME        = fs.readFileSync(path.join(root, 'src/pages/home.js'), 'utf-8');
const SNAPSHOT    = fs.readFileSync(path.join(root, 'src/pages/snapshot.js'), 'utf-8');
const REPORT      = fs.readFileSync(path.join(root, 'src/pages/report.js'), 'utf-8');
const MAIN        = fs.readFileSync(path.join(root, 'src/main.js'), 'utf-8');

// ─────────────────────────────────────────────────────────────────────────────
describe('Security Headers', () => {
  test('CSP meta tag is present', () => {
    expect(HTML).toContain('Content-Security-Policy');
    expect(HTML).toContain("default-src 'self'");
  });

  test('marked + dompurify are bundled (no CDN scripts)', () => {
    expect(HTML).not.toContain('cdnjs.cloudflare.com/ajax/libs/marked');
    expect(HTML).not.toContain('cdnjs.cloudflare.com/ajax/libs/dompurify');
  });

  test('no inline STOCK_DATA assignments remain', () => {
    expect(HTML).not.toMatch(/^STOCK_DATA\.[A-Z]{2,4}\s*=\s*\{/m);
  });

  test('no inline <script> blocks remain', () => {
    // Only external <script src> and <script type="module"> should be present
    const inlineScripts = HTML.match(/<script(?![^>]*src=)(?![^>]*type="module")[^>]*>/g) || [];
    expect(inlineScripts).toHaveLength(0);
  });

  test('CORS proxy URLs are not present', () => {
    expect(HTML).not.toContain('corsproxy.io');
    expect(HTML).not.toContain('allorigins.win');
    expect(HTML).not.toContain('codetabs.com');
    expect(HTML).not.toContain('cors-anywhere');
  });

  test('fonts are self-hosted (no Google Fonts CDN)', () => {
    expect(HTML).not.toContain('fonts.googleapis.com');
    expect(HTML).not.toContain('fonts.gstatic.com');
    expect(HTML).toContain("font-src 'self'");
  });

  test('font preload hints are present', () => {
    expect(HTML).toContain('rel="preload"');
    expect(HTML).toContain('inter-latin.woff2');
    expect(HTML).toContain('source-serif-4-latin.woff2');
    expect(HTML).toContain('as="font"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Module System Wiring', () => {
  test('module entry point is wired into index.html', () => {
    expect(HTML).toContain('type="module"');
    expect(HTML).toContain('src/main.js');
  });

  test('classic DNE engine scripts are present', () => {
    expect(HTML).toContain('price-narrative-engine.js');
    expect(HTML).toContain('institutional-commentary-engine.js');
    expect(HTML).toContain('narrative-framework-integration.js');
  });

  test('no inline <style> blocks remain', () => {
    expect(HTML).not.toContain('<style>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Accessibility Landmarks', () => {
  test('skip link is present', () => {
    expect(HTML).toContain('skip-link');
    expect(HTML).toContain('Skip to main content');
  });

  test('main landmark is present', () => {
    expect(HTML).toContain('<main');
    expect(HTML).toContain('id="main-content"');
  });

  test('nav has aria-label', () => {
    expect(HTML).toMatch(/nav.*aria-label/);
  });

  test('aria-live region exists', () => {
    expect(HTML).toContain('aria-live');
  });

  test('screen reader only class is defined in base.css', () => {
    expect(BASE_CSS).toContain('.sr-only');
  });

  test('prefers-reduced-motion query exists in base.css', () => {
    expect(BASE_CSS).toContain('prefers-reduced-motion');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Data Loader (src/data/loader.js)', () => {
  test('loadFullResearchData function is exported', () => {
    expect(LOADER).toContain('export function loadFullResearchData');
  });

  test('_index.json path is referenced', () => {
    expect(MAIN).toContain('data/research/_index.json');
  });

  test('_indexOnly flag is used', () => {
    expect(LOADER).toContain('_indexOnly');
  });

  test('StockDataLoader log prefix is present', () => {
    expect(LOADER).toContain('StockDataLoader');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Route Validation (src/lib/router.js + state.js)', () => {
  test('VALID_STATIC_PAGES allowlist exists in state.js', () => {
    expect(STATE).toContain('VALID_STATIC_PAGES');
    expect(STATE).toContain("'home'");
    expect(STATE).toContain("'deep-research'");
    expect(STATE).toContain("'portfolio'");
    expect(STATE).toContain("'about'");
  });

  test('route() function is exported from router.js', () => {
    expect(ROUTER).toContain('export function route()');
  });

  test('_indexOnly is checked in route()', () => {
    expect(ROUTER).toContain('_indexOnly');
  });

  test('loadFullResearchData is called in router', () => {
    expect(ROUTER).toContain('loadFullResearchData');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Critical Functions (src/ modules)', () => {
  const checks = [
    ['route()',              ROUTER,   'export function route()'],
    ['renderReport()',       REPORT,   'export function renderReport'],
    ['renderSnapshotPage()', SNAPSHOT, 'export function renderSnapshotPage'],
    ['renderFeaturedCard()', HOME,     'export function renderFeaturedCard'],
    ['buildSnapshotFromStock()', SNAPSHOT, 'export function buildSnapshotFromStock'],
    ['computeSkewScore()',   DOM_LIB,  'export function computeSkewScore'],
    ['loadFullResearchData()', LOADER, 'export function loadFullResearchData'],
  ];

  checks.forEach(([label, source, needle]) => {
    test(`${label} is exported from its module`, () => {
      expect(source).toContain(needle);
    });
  });
});
