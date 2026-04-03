// @ts-check
/**
 * Smoke tests — verify core navigation and page rendering.
 * Runs against the Vite preview server (npm run build first).
 * Base URL is http://localhost:4173/continuum-intelligence-v3/
 */
import { test, expect } from '@playwright/test';

test('home page loads with coverage table', async ({ page }) => {
  await page.goto('#home');
  await expect(page).toHaveTitle(/Continuum/i);
  // Coverage table is present on home page
  const table = page.locator('.coverage-table, table');
  await expect(table.first()).toBeVisible({ timeout: 10000 });
});

test('report page renders for BHP', async ({ page }) => {
  // Navigate to home first so _index.json loads, then navigate to report
  await page.goto('#home');
  await page.waitForTimeout(2000); // allow boot() and _index.json fetch to complete
  await page.goto('#report-BHP');
  // Router creates #page-report-BHP dynamically and adds .active
  await expect(page.locator('#page-report-BHP')).toBeAttached({ timeout: 15000 });
  await expect(page.locator('#page-report-BHP')).toHaveClass(/active/, { timeout: 15000 });
});

test('portfolio page is accessible', async ({ page }) => {
  await page.goto('#portfolio');
  const portfolioPage = page.locator('#page-portfolio');
  await expect(portfolioPage).toBeVisible({ timeout: 10000 });
  await expect(portfolioPage).toHaveClass(/active/);
});

test('deep-research page is accessible', async ({ page }) => {
  await page.goto('#deep-research');
  const drPage = page.locator('#page-deep-research');
  await expect(drPage).toBeVisible({ timeout: 10000 });
  await expect(drPage).toHaveClass(/active/);
});

test('about page is accessible', async ({ page }) => {
  await page.goto('#about');
  const aboutPage = page.locator('#page-about');
  await expect(aboutPage).toBeVisible({ timeout: 10000 });
  await expect(aboutPage).toHaveClass(/active/);
});

test('invalid route falls back to home', async ({ page }) => {
  await page.goto('#not-a-real-page-xyz');
  // Home page should be active after invalid route
  const homePage = page.locator('#page-home');
  await expect(homePage).toHaveClass(/active/, { timeout: 5000 });
});

test('home page loads without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', err => errors.push(err.message));

  await page.goto('#home');
  await page.waitForTimeout(3000); // allow boot sequence to complete

  // Filter out expected errors when running without backend
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

test('analyst chat panel opens', async ({ page }) => {
  await page.goto('#home');
  await page.waitForTimeout(2000);

  // The analyst panel should exist in the DOM
  const panel = page.locator('#analyst-panel');
  await expect(panel).toBeAttached({ timeout: 10000 });

  // The FAB or panel header should be visible
  const fab = page.locator('#apFab');
  const header = page.locator('.ap-header');
  const panelVisible = await panel.isVisible();
  const fabVisible = await fab.isVisible();
  const headerVisible = await header.isVisible();

  // Either the panel is visible (desktop) or the FAB is visible (mobile)
  expect(panelVisible || fabVisible || headerVisible).toBe(true);
});

test('portfolio page shows upload zone', async ({ page }) => {
  await page.goto('#portfolio');
  await expect(page.locator('#page-portfolio')).toBeVisible({ timeout: 10000 });

  // Upload zone should be present for file upload
  const uploadZone = page.locator('#uploadZone, .upload-zone, input[type="file"]');
  await expect(uploadZone.first()).toBeAttached({ timeout: 10000 });
});

test('report page has no critical encoding contamination', async ({ page }) => {
  await page.goto('#home');
  await page.waitForTimeout(2000);
  await page.goto('#report-BHP');
  await expect(page.locator('#page-report-BHP')).toBeAttached({ timeout: 15000 });
  await page.waitForTimeout(2000);

  // Check rendered text for encoding contamination (Family 1 regression gate)
  const text = await page.locator('#page-report-BHP').textContent();
  // Null bytes must never appear (caused platform-wide outage in commit 8ceebc77)
  expect(text).not.toContain('\u0000');
  // Double-encoded mojibake patterns must not appear
  expect(text).not.toContain('\u00e2\u0080\u0093'); // double-encoded en-dash
  expect(text).not.toContain('\u00e2\u0080\u0094'); // double-encoded em-dash
  // Smart quotes should not appear in data content
  expect(text).not.toContain('\u201c'); // left double smart quote
  expect(text).not.toContain('\u201d'); // right double smart quote
});
