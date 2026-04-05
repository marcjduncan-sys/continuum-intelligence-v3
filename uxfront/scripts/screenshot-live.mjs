import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const PORT = process.env.PORT || 5003;
const BASE = `http://localhost:${PORT}`;

const routes = [
  { name: '01-home', hash: '#home' },
  { name: '02-stock-detail', hash: '#report-BHP' },
  { name: '03-portfolio', hash: '#portfolio' },
  { name: '04-comparator', hash: '#thesis-comparator' },
  { name: '05-deep-research', hash: '#deep-research' },
  { name: '06-pm-dashboard', hash: '#pm-dashboard' },
  { name: '07-journal', hash: '#analyst-journal' },
  { name: '08-personalisation', hash: '#settings' },
  { name: '09-about', hash: '#about' }
];

const viewports = [
  { w: 1440, h: 900, name: 'desktop' },
  { w: 1024, h: 768, name: 'tablet' },
  { w: 768, h: 1024, name: 'mobile' }
];

const browser = await chromium.launch();

for (const vp of viewports) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h } });
  const page = await ctx.newPage();

  for (const r of routes) {
    try {
      await page.goto(`${BASE}/${r.hash}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);

      const dir = resolve(repoRoot, `uxfront/live/${vp.name}`);
      mkdirSync(dir, { recursive: true });
      await page.screenshot({ path: resolve(dir, `${r.name}.png`), fullPage: true });
      console.log(`Captured ${r.name} at ${vp.name}`);
    } catch (e) {
      console.error(`Failed ${r.name}: ${e.message}`);
    }
  }

  await ctx.close();
}

await browser.close();
console.log('Done');
