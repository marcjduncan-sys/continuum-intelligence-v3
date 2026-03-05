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
