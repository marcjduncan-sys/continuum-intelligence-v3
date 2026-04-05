import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

const pages = [
  '01-index', '02-stock-detail', '03-portfolio',
  '04-comparator', '05-deep-research', '06-pm-dashboard',
  '07-journal', '08-personalisation', '09-about'
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

  for (const p of pages) {
    const filePath = resolve(repoRoot, `docs/${p}.html`);
    const fileUrl = 'file:///' + filePath.replace(/\\/g, '/');
    await page.goto(fileUrl);
    await page.waitForTimeout(2000);

    const dir = resolve(repoRoot, `uxfront/golden/${vp.name}`);
    mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: resolve(dir, `${p}.png`), fullPage: true });
    console.log(`Captured ${p} at ${vp.name}`);
  }

  await ctx.close();
}

await browser.close();
console.log('Done');
