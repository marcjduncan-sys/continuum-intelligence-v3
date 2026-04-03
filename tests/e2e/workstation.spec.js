// @ts-check
/**
 * Workstation page E2E smoke tests (BEAD-W021).
 * Validates the #workstation-BHP route against the live Vite preview server.
 *
 * Route format: #workstation-{TICKER} (hyphen, not slash -- matches router.js pattern).
 * Data source:  dist/data/workstation/BHP.json (copied from data/ by the Vite copy-data plugin).
 * Container:    #page-workstation-BHP (created lazily by the router on first visit).
 */
import { test, expect } from '@playwright/test';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Navigate to #home first so boot() and _index.json complete, then go to the
 * workstation page and wait for its container to be active. This mirrors the
 * pattern used in smoke.spec.js for the report page.
 */
async function gotoWorkstation(page) {
  await page.goto('#home');
  await page.waitForTimeout(2000);
  await page.goto('#workstation-BHP');
  await expect(page.locator('#page-workstation-BHP')).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#page-workstation-BHP')).toHaveClass(/active/, { timeout: 15000 });
  // Allow render and data fetch to complete
  await page.waitForTimeout(2000);
}

// ============================================================================
// BEAD-W021: Playwright smoke tests
// ============================================================================

test('workstation page loads without unexpected console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await gotoWorkstation(page);

  // Filter out known non-blocking errors (same allowlist as smoke.spec.js)
  // Boot subsystem warnings when backend API is unavailable are expected in E2E
  const unexpected = errors.filter(e =>
    !e.includes('Failed to fetch') &&
    !e.includes('net::ERR_') &&
    !e.includes('NetworkError') &&
    !e.includes('api.continuumintelligence.ai') &&
    !e.includes('500') &&
    !e.includes('Internal Server Error') &&
    !e.includes('Content Security Policy') &&
    !e.includes('frame-ancestors') &&
    !e.includes('[Boot]') &&
    !e.includes('dependency not ready') &&
    !e.includes('not registered')
  );
  expect(unexpected).toHaveLength(0);
});

test('workstation page container is active after navigation', async ({ page }) => {
  await gotoWorkstation(page);
  const container = page.locator('#page-workstation-BHP');
  await expect(container).toBeVisible();
  await expect(container).toHaveClass(/active/);
});

// ============================================================================
// Hero section
// ============================================================================

test('hero renders ticker badge with BHP', async ({ page }) => {
  await gotoWorkstation(page);
  const badge = page.locator('#page-workstation-BHP .ws-ticker-badge');
  await expect(badge).toBeVisible({ timeout: 10000 });
  await expect(badge).toContainText('BHP');
});

test('hero renders company name BHP Group', async ({ page }) => {
  await gotoWorkstation(page);
  const container = page.locator('#page-workstation-BHP');
  await expect(container).toContainText('BHP Group');
});

test('hero renders verdict rating Accumulate', async ({ page }) => {
  await gotoWorkstation(page);
  const tag = page.locator('#page-workstation-BHP .ws-tag').first();
  await expect(tag).toContainText('Accumulate');
});

test('hero renders skew tag Moderate upside', async ({ page }) => {
  await gotoWorkstation(page);
  const skewTag = page.locator('#page-workstation-BHP .ws-tag--skew');
  await expect(skewTag).toBeVisible({ timeout: 10000 });
  await expect(skewTag).toContainText('Moderate upside');
});

test('hero renders confidence percentage 76%', async ({ page }) => {
  await gotoWorkstation(page);
  const confTag = page.locator('#page-workstation-BHP .ws-tag--confidence');
  await expect(confTag).toBeVisible({ timeout: 10000 });
  await expect(confTag).toContainText('76');
});

// ============================================================================
// Decision strip: 8 cells, EWP, spot
// ============================================================================

test('decision strip renders 8 cells', async ({ page }) => {
  await gotoWorkstation(page);
  // Each cell has exactly one .ws-strip-cell__label -- count those
  const labels = page.locator('#page-workstation-BHP .ws-strip-cell__label');
  await expect(labels).toHaveCount(8);
});

test('decision strip EWP cell shows computed value 56.55', async ({ page }) => {
  await gotoWorkstation(page);
  const ewpCell = page.locator('#page-workstation-BHP .ws-strip-cell--ewp');
  await expect(ewpCell).toBeVisible({ timeout: 10000 });
  await expect(ewpCell).toContainText('56.55');
});

test('decision strip spot cell shows 52.56', async ({ page }) => {
  await gotoWorkstation(page);
  const spotCell = page.locator('#page-workstation-BHP .ws-strip-cell--spot');
  await expect(spotCell).toBeVisible({ timeout: 10000 });
  await expect(spotCell).toContainText('52.56');
});

test('decision strip EWP cell has data-ws-spot attribute on spot value', async ({ page }) => {
  await gotoWorkstation(page);
  const spotValue = page.locator('#page-workstation-BHP [data-ws-spot]');
  await expect(spotValue).toBeAttached();
  const attrVal = await spotValue.getAttribute('data-ws-spot');
  expect(attrVal).toBe('52.56');
});

// ============================================================================
// All 8 left-column sections present
// ============================================================================

test('all 8 research section IDs are present in the DOM', async ({ page }) => {
  await gotoWorkstation(page);
  const sectionIds = [
    'ws-thesis',
    'ws-scenarios',
    'ws-valuation',
    'ws-risks',
    'ws-evidence',
    'ws-revisions',
    'ws-deep-research',
    'ws-quality'
  ];
  for (const id of sectionIds) {
    await expect(page.locator('#' + id)).toBeAttached({ timeout: 10000 });
  }
});

test('thesis section renders', async ({ page }) => {
  await gotoWorkstation(page);
  await expect(page.locator('#ws-thesis')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#ws-thesis')).toContainText('Thesis');
});

test('scenarios section renders with scenario cards', async ({ page }) => {
  await gotoWorkstation(page);
  await expect(page.locator('#ws-scenarios')).toBeVisible({ timeout: 10000 });
  const cards = page.locator('#ws-scenarios .ws-scenario-card');
  await expect(cards).toHaveCount(4); // BHP has 4 scenarios
});

test('quality section renders tiles', async ({ page }) => {
  await gotoWorkstation(page);
  const tiles = page.locator('#ws-quality .ws-quality-tile');
  await expect(tiles).toHaveCount(6); // BHP has 6 quality tiles
});

// ============================================================================
// Chat panel
// ============================================================================

test('chat panel is present and visible', async ({ page }) => {
  await gotoWorkstation(page);
  const chat = page.locator('#ws-chat');
  await expect(chat).toBeVisible({ timeout: 10000 });
});

test('chat panel has Research Discussion heading', async ({ page }) => {
  await gotoWorkstation(page);
  await expect(page.locator('#ws-chat')).toContainText('Research Discussion');
});

test('chat panel renders 6 messages', async ({ page }) => {
  await gotoWorkstation(page);
  // Each message starts with class="ws-chat-msg ws-chat-msg--{role}"
  const messages = page.locator('#ws-chat .ws-chat-msg');
  await expect(messages).toHaveCount(6);
});

test('chat panel renders 3 stat boxes', async ({ page }) => {
  await gotoWorkstation(page);
  const stats = page.locator('#ws-chat .ws-chat__stat');
  await expect(stats).toHaveCount(3);
});

test('chat panel stat shows current posture Accumulate', async ({ page }) => {
  await gotoWorkstation(page);
  await expect(page.locator('#ws-chat .ws-chat__stats')).toContainText('Current posture');
  await expect(page.locator('#ws-chat .ws-chat__stats')).toContainText('Accumulate');
});

test('chat panel All filter tab is present and active by default', async ({ page }) => {
  await gotoWorkstation(page);
  const allTab = page.locator('#ws-chat .ws-chat__filter[data-thread="all"]');
  await expect(allTab).toBeVisible({ timeout: 10000 });
  await expect(allTab).toHaveClass(/ws-chat__filter--active/);
});

test('chat panel filter tabs are present for each thread', async ({ page }) => {
  await gotoWorkstation(page);
  // BHP fixture has 6 unique thread_labels
  const filters = page.locator('#ws-chat .ws-chat__filter');
  // All tab + 6 thread label tabs = 7 total
  await expect(filters).toHaveCount(7);
});

test('chat panel renders suggested question', async ({ page }) => {
  await gotoWorkstation(page);
  await expect(page.locator('#ws-chat .ws-chat__suggested')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('#ws-chat .ws-chat__suggested-btn')).toContainText(
    'What would change your view'
  );
});

// ============================================================================
// Chat tab filtering (interactive)
// ============================================================================

test('chat thread tab filtering hides non-matching messages', async ({ page }) => {
  await gotoWorkstation(page);

  // Click the first non-All thread tab (e.g. "Copper mix shift")
  const firstThreadTab = page.locator('#ws-chat .ws-chat__filter').nth(1);
  const threadLabel = await firstThreadTab.getAttribute('data-thread');
  await firstThreadTab.click();

  // Tab becomes active
  await expect(firstThreadTab).toHaveClass(/ws-chat__filter--active/);

  // Messages not matching this thread should be hidden
  const allMessages = page.locator('#ws-chat .ws-chat-msg');
  const count = await allMessages.count();
  let visibleCount = 0;
  for (let i = 0; i < count; i++) {
    const msg = allMessages.nth(i);
    const msgThread = await msg.getAttribute('data-thread');
    const isVisible = await msg.isVisible();
    if (msgThread === threadLabel) {
      expect(isVisible).toBe(true);
      visibleCount++;
    } else {
      expect(isVisible).toBe(false);
    }
  }
  expect(visibleCount).toBeGreaterThan(0);
});

test('chat All tab restores all messages after filtering', async ({ page }) => {
  await gotoWorkstation(page);

  // Click a thread tab to filter
  const firstThreadTab = page.locator('#ws-chat .ws-chat__filter').nth(1);
  await firstThreadTab.click();

  // Click All to restore
  const allTab = page.locator('#ws-chat .ws-chat__filter[data-thread="all"]');
  await allTab.click();
  await expect(allTab).toHaveClass(/ws-chat__filter--active/);

  // All 6 messages should be visible
  const messages = page.locator('#ws-chat .ws-chat-msg');
  await expect(messages).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await expect(messages.nth(i)).toBeVisible();
  }
});

// ============================================================================
// Subnav
// ============================================================================

test('subnav has exactly 8 section links', async ({ page }) => {
  await gotoWorkstation(page);
  const links = page.locator('#page-workstation-BHP .ws-subnav__link');
  await expect(links).toHaveCount(8);
});

test('subnav links target the correct section IDs', async ({ page }) => {
  await gotoWorkstation(page);
  const expectedHrefs = [
    '#ws-thesis',
    '#ws-scenarios',
    '#ws-valuation',
    '#ws-risks',
    '#ws-evidence',
    '#ws-revisions',
    '#ws-deep-research',
    '#ws-quality'
  ];
  const links = page.locator('#page-workstation-BHP .ws-subnav__link');
  const count = await links.count();
  expect(count).toBe(8);
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute('href');
    expect(expectedHrefs).toContain(href);
  }
});

// ============================================================================
// Encoding contamination regression (Family 1 -- same as smoke.spec.js)
// ============================================================================

test('workstation page has no critical encoding contamination', async ({ page }) => {
  await gotoWorkstation(page);

  const container = page.locator('#page-workstation-BHP');
  await expect(container).toBeAttached({ timeout: 15000 });

  const text = await container.textContent();

  // Null bytes must never appear (Family 1 boundary violation)
  expect(text).not.toContain('\u0000');
  // Double-encoded mojibake must not appear
  expect(text).not.toContain('\u00e2\u0080\u0093'); // double-encoded en-dash
  expect(text).not.toContain('\u00e2\u0080\u0094'); // double-encoded em-dash
  // Smart quotes must not appear in data content
  expect(text).not.toContain('\u201c'); // left double smart quote
  expect(text).not.toContain('\u201d'); // right double smart quote
});

// ============================================================================
// BEAD-W022: Visual comparison screenshot
// Full-page screenshot at 1440px for manual sign-off by MD.
// Not a visual diff -- no golden baseline. Human review step only.
// ============================================================================

test('BEAD-W022: full-page screenshot saved for visual sign-off', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoWorkstation(page);
  // Allow additional time for any CSS transitions to settle
  await page.waitForTimeout(1000);
  await page.screenshot({
    path: 'docs/plans/workstation-bhp-screenshot.png',
    fullPage: true
  });
  // Test passes as long as the page is rendered -- screenshot is for human review
  const container = page.locator('#page-workstation-BHP');
  await expect(container).toBeVisible();
});
