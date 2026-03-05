// @ts-check
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 0,
  workers: 1,
  reporter: 'list',

  use: {
    baseURL: 'http://localhost:4173/continuum-intelligence-v3/',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },

  // Start vite preview (requires a prior `npm run build`)
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173/continuum-intelligence-v3/',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
