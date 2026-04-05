import { chromium } from 'playwright';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const PORT = process.env.PORT || 5003;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`http://localhost:${PORT}/#home`, { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

await page.screenshot({
  path: resolve(repoRoot, 'uxfront/live/desktop/01-home-post-fix.png'),
  fullPage: false
});

const chips = await page.$$eval('.cap-chip', chips => chips.map(c => c.textContent.trim()));
console.log('Cap chips on home:', chips);

const dividers = await page.$$eval('.cap-divider', d => d.length);
console.log('Cap dividers:', dividers);

const capLabels = await page.$$eval('.cap-label', labels => labels.map(l => l.textContent.trim()));
console.log('Cap labels:', capLabels);

// Check featured grid
const featuredGrid = await page.$('.featured-grid');
const gridStyle = featuredGrid ? await featuredGrid.evaluate(el => getComputedStyle(el).gridTemplateColumns) : 'not found';
console.log('Featured grid columns:', gridStyle);

// Check home rail width
const homeRail = await page.$('.home-right-rail');
const railWidth = homeRail ? await homeRail.evaluate(el => el.getBoundingClientRect().width) : 0;
console.log('Home right rail width:', railWidth);

await browser.close();
console.log('Verification done');
