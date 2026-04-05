/**
 * Visual parity audit: compare prototype specs vs live app DOM/CSS.
 * Outputs JSON with per-page deviations.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');
const PORT = process.env.PORT || 5003;
const BASE = `http://localhost:${PORT}`;

const PAGES = [
  { name: 'home',          proto: '01-index.html',        hash: '#home' },
  { name: 'stock-detail',  proto: '02-stock-detail.html', hash: '#report-BHP' },
  { name: 'portfolio',     proto: '03-portfolio.html',    hash: '#portfolio' },
  { name: 'comparator',    proto: '04-comparator.html',   hash: '#thesis-comparator' },
  { name: 'deep-research', proto: '05-deep-research.html',hash: '#deep-research' },
  { name: 'pm-dashboard',  proto: '06-pm-dashboard.html', hash: '#pm-dashboard' },
  { name: 'journal',       proto: '07-journal.html',      hash: '#analyst-journal' },
  { name: 'settings',      proto: '08-personalisation.html', hash: '#settings' },
  { name: 'about',         proto: '09-about.html',        hash: '#about' },
];

const browser = await chromium.launch();
const results = {};

for (const pg of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // --- Prototype ---
  const protoPage = await ctx.newPage();
  const protoPath = resolve(repoRoot, `docs/${pg.proto}`);
  await protoPage.goto('file:///' + protoPath.replace(/\\/g, '/'));
  await protoPage.waitForTimeout(1500);

  const protoData = await protoPage.evaluate(() => {
    const capChips = Array.from(document.querySelectorAll('.cap-chip, .ci-chip')).map(el => ({
      text: el.textContent.trim(),
      classes: el.className,
      active: el.classList.contains('active')
    }));
    const capLabels = Array.from(document.querySelectorAll('.cap-label')).map(el => el.textContent.trim());
    const hasChatPanel = !!(
      document.querySelector('.chat-panel') ||
      document.querySelector('.analyst-panel') ||
      document.querySelector('.cp-head')
    );
    const chatPanelClasses = hasChatPanel ?
      (document.querySelector('.chat-panel, .analyst-panel') || {}).className : null;
    const topbarText = document.querySelector('.topbar, .ci-topbar')?.textContent?.substring(0, 200) || '';
    const hasFooter = !!(document.querySelector('.site-footer, .ci-footer'));
    const footerText = document.querySelector('.site-footer, .ci-footer')?.textContent?.substring(0, 100) || '';
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    const heroExists = !!(document.querySelector('.pm-hero, .port-hero, .dr-hero, .manifesto-hero, .platform-header'));
    const heroGradient = document.querySelector('.pm-hero, .port-hero, .dr-hero')?.getAttribute('style') ||
      getComputedStyle(document.querySelector('.pm-hero, .port-hero, .dr-hero') || document.body).background;
    return { capChips, capLabels, hasChatPanel, chatPanelClasses, topbarText, hasFooter, footerText, heroExists, heroGradient };
  });

  // --- Live ---
  const livePage = await ctx.newPage();
  await livePage.goto(`${BASE}/${pg.hash}`, { waitUntil: 'networkidle', timeout: 15000 });
  await livePage.waitForTimeout(2000);

  const liveData = await livePage.evaluate(() => {
    const capChips = Array.from(document.querySelectorAll('.cap-chip, .ci-chip')).map(el => ({
      text: el.textContent.trim(),
      classes: el.className,
      active: el.classList.contains('active')
    }));
    const capLabels = Array.from(document.querySelectorAll('.cap-label')).map(el => el.textContent.trim());

    // Panel visibility checks
    const analystPanel = document.querySelector('.analyst-panel');
    const pmPanel = document.querySelector('.pm-panel');
    const econPanel = document.querySelector('.econ-panel');
    const chatPanel = document.querySelector('.chat-panel');

    function isVisible(el) {
      if (!el) return false;
      const cs = window.getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
    }

    const panelState = {
      analystPanel: { exists: !!analystPanel, visible: isVisible(analystPanel) },
      pmPanel: { exists: !!pmPanel, visible: isVisible(pmPanel) },
      econPanel: { exists: !!econPanel, visible: isVisible(econPanel) },
      chatPanel: { exists: !!chatPanel, visible: isVisible(chatPanel) },
    };

    const routeType = document.body.dataset.routeType;
    const paddingRight = getComputedStyle(document.body).paddingRight;
    const hasFooter = !!(document.querySelector('.ci-footer'));
    const footerVisible = isVisible(document.querySelector('.ci-footer'));
    const heroExists = !!(document.querySelector('.pm-hero, .port-hero, .dr-hero, .manifesto-hero, .platform-header, .ci-hero'));

    return { capChips, capLabels, panelState, routeType, paddingRight, hasFooter, footerVisible, heroExists };
  });

  results[pg.name] = {
    proto: protoData,
    live: liveData,
    deviations: []
  };

  // Compute deviations
  const devs = results[pg.name].deviations;

  // Cap chip count
  if (protoData.capChips.length !== liveData.capChips.length) {
    devs.push(`Cap chips: proto=${protoData.capChips.length} live=${liveData.capChips.length}`);
  }

  // Panel state
  if (protoData.hasChatPanel && !liveData.panelState.analystPanel.visible &&
      !liveData.panelState.pmPanel.visible && !liveData.panelState.chatPanel.visible) {
    devs.push('Proto has chat panel but live has none visible');
  }
  if (!protoData.hasChatPanel && (liveData.panelState.analystPanel.visible || liveData.panelState.pmPanel.visible)) {
    devs.push('Proto has no chat panel but live shows one');
  }

  // Padding right (should be 0 on non-report pages)
  if (liveData.routeType !== 'report' && liveData.paddingRight !== '0px') {
    devs.push(`Non-report page has padding-right: ${liveData.paddingRight} (should be 0px)`);
  }

  // Footer visibility
  if (liveData.hasFooter && !liveData.footerVisible && liveData.routeType !== 'report') {
    devs.push('Footer exists but not visible on non-report page');
  }

  await ctx.close();
  console.log(`Audited ${pg.name}: ${devs.length} deviations`);
  if (devs.length) devs.forEach(d => console.log(`  - ${d}`));
}

await browser.close();

const outPath = resolve(repoRoot, 'uxfront/parity-audit.json');
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`\nAudit saved to ${outPath}`);
