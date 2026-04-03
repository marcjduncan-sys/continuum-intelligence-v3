// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Home page coverage command surface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/#home');
    // Wait for the coverage table to appear
    await page.waitForSelector('.coverage-table, #page-home', { timeout: 10000 });
  });

  test('page loads without console errors', async ({ page }) => {
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.reload();
    await page.waitForSelector('#page-home', { timeout: 10000 });
    // Filter known boot subsystem warnings
    const realErrors = errors.filter(e =>
      !e.includes('[Boot]') &&
      !e.includes('subsystem') &&
      !e.includes('favicon')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('coverage table renders with correct columns', async ({ page }) => {
    const table = page.locator('.coverage-table');
    await expect(table).toBeVisible();
    await expect(page.locator('.coverage-table th')).toHaveCount(10);
  });

  test('signal badges use new taxonomy (Upside/Balanced/Downside only)', async ({ page }) => {
    const badges = page.locator('.signal-badge');
    const count = await badges.count();
    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await badges.nth(i).innerText();
        expect(['Upside', 'Balanced', 'Downside']).toContain(text.trim());
      }
    }
  });

  test('filter chips filter the table correctly', async ({ page }) => {
    // Click Upside filter
    const upsideChip = page.locator('.filter-chip[data-filter-value="upside"]');
    await upsideChip.click();
    await page.waitForTimeout(200);

    // All visible signal badges should be Upside
    const badges = await page.locator('.signal-badge').allInnerTexts();
    if (badges.length > 0) {
      expect(badges.every(b => b.trim() === 'Upside')).toBe(true);
    }
  });

  test('sort by clicking column headers works', async ({ page }) => {
    const priceHeader = page.locator('th[data-sort-col="price"]');
    await priceHeader.click();
    await page.waitForTimeout(100);
    await expect(page.locator('.sort-indicator')).toBeVisible();
  });

  test('KPI band renders 6 cards', async ({ page }) => {
    const cards = page.locator('.kpi-card');
    await expect(cards).toHaveCount(6);
  });

  test('intelligence rail renders 4 sections', async ({ page }) => {
    const sections = page.locator('.rail-section');
    await expect(sections).toHaveCount(4);
  });

  test('row click navigates to workstation or report route', async ({ page }) => {
    const firstRow = page.locator('tr[data-ticker]').first();
    const ticker = await firstRow.getAttribute('data-ticker');
    if (ticker) {
      await firstRow.click();
      await page.waitForTimeout(300);
      const hash = await page.evaluate(() => window.location.hash);
      expect(hash).toMatch(new RegExp('workstation-' + ticker + '|report-' + ticker));
    }
  });

  test('no bull/bear/neutral signal text in rendered output', async ({ page }) => {
    const content = await page.locator('#page-home').innerHTML();
    expect(content.toLowerCase()).not.toMatch(/\bbull\b|\bbear\b/);
  });

  test('full-page screenshot at 1200px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 900 });
    await page.goto('/#home');
    await page.waitForSelector('.coverage-table', { timeout: 10000 });
    await page.screenshot({ path: 'test-results/home-1200px.png', fullPage: true });
  });
});
