#!/usr/bin/env node
/**
 * update-orchestrator.js
 *
 * Continuum Intelligence — Master Update Coordinator
 *
 * Runs the full update pipeline in sequence:
 *   1. Fetch latest stock prices (update-prices.js)
 *   2. Hydrate content in research JSON files (hydrate-content.js)
 *   3. Analyse research freshness and write to data/freshness.json
 *   4. Generate a structured report for GitHub Actions
 *
 * This replaces running update-prices.js directly in CI.
 * It ensures prices are current BEFORE freshness is assessed,
 * and that the freshness data reflects the latest price state.
 *
 * Usage: node scripts/update-orchestrator.js [--skip-prices] [--report-only]
 *   --skip-prices   Skip price fetching (useful for local testing)
 *   --report-only   Don't write freshness data, just print report
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPTS_DIR = __dirname;

function run(cmd, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  STEP: ${label}`);
  console.log('='.repeat(60));
  try {
    execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
    return true;
  } catch (e) {
    console.error(`  [ERROR] ${label} failed: ${e.message}`);
    return false;
  }
}

function main() {
  const args = process.argv.slice(2);
  const skipPrices = args.includes('--skip-prices');
  const reportOnly = args.includes('--report-only');

  const startTime = Date.now();

  console.log('');
  console.log('='.repeat(62));
  console.log('  CONTINUUM INTELLIGENCE -- UPDATE ORCHESTRATOR');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(62));

  // Step 1: Update prices
  let pricesUpdated = false;
  if (!skipPrices) {
    pricesUpdated = run(
      `node ${path.join(SCRIPTS_DIR, 'update-prices.js')}`,
      'Fetch Latest Stock Prices'
    );
    if (!pricesUpdated) {
      console.log('\n  [WARN] Price update failed -- continuing with stale prices');
    }
  } else {
    console.log('\n  [SKIP] Price update skipped (--skip-prices)');
  }

  // Step 2: Hydrate content (update narrative text, metrics, anchors in JSON files)
  let contentHydrated = false;
  if (!reportOnly && pricesUpdated) {
    contentHydrated = run(
      `node ${path.join(SCRIPTS_DIR, 'hydrate-content.js')}`,
      'Hydrate Dynamic Content (Narrative, Metrics, Scores)'
    );
    if (!contentHydrated) {
      console.log('\n  [WARN] Content hydration failed -- text may be stale');
    }
  } else if (reportOnly) {
    console.log('\n  [SKIP] Content hydration skipped (--report-only)');
  }

  // Step 3: Run research monitor (writes to data/freshness.json)
  const monitorFlags = reportOnly ? '' : '--inject';
  const monitorOk = run(
    `node ${path.join(SCRIPTS_DIR, 'research-monitor.js')} ${monitorFlags}`,
    'Research Freshness Analysis'
  );

  // Step 4: Generate summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  ORCHESTRATOR COMPLETE');
  console.log('='.repeat(60));
  console.log(`  Prices updated:     ${pricesUpdated ? 'YES' : skipPrices ? 'SKIPPED' : 'FAILED'}`);
  console.log(`  Content hydrated:   ${contentHydrated ? 'YES' : reportOnly ? 'SKIPPED' : pricesUpdated ? 'FAILED' : 'SKIPPED (no price change)'}`);
  console.log(`  Monitor ran:        ${monitorOk ? 'YES' : 'FAILED'}`);
  console.log(`  Freshness written:  ${!reportOnly && monitorOk ? 'YES (data/freshness.json)' : 'NO'}`);
  console.log(`  Elapsed:            ${elapsed}s`);
  console.log('');

  // Write GitHub Actions step summary if available
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      // Re-run monitor in JSON mode to get structured data
      const jsonOutput = execSync(
        `node ${path.join(SCRIPTS_DIR, 'research-monitor.js')} --json --quiet`,
        { encoding: 'utf8', cwd: path.join(__dirname, '..') }
      );
      const report = JSON.parse(jsonOutput);

      let md = `## Continuum Intelligence -- Daily Update Report\n\n`;
      md += `**Date:** ${new Date().toISOString().split('T')[0]}\n\n`;
      md += `| Status | Count |\n|--------|-------|\n`;
      md += `| Critical | ${report.summary.critical} |\n`;
      md += `| High | ${report.summary.high} |\n`;
      md += `| Moderate | ${report.summary.moderate} |\n`;
      md += `| OK | ${report.summary.ok} |\n\n`;

      md += `### Priority Queue\n\n`;
      md += `| Ticker | Company | Last Review | Days | Price D | Urgency | Next Catalyst |\n`;
      md += `|--------|---------|------------|------|---------|---------|---------------|\n`;

      for (const s of report.stocks) {
        const icon = { CRITICAL: 'CRIT', HIGH: 'HIGH', MODERATE: 'MOD', OK: 'OK' }[s.status];
        const catalyst = s.nearestCatalyst
          ? `${s.nearestCatalyst} (${s.nearestCatalystDays <= 0 ? 'PASSED' : s.nearestCatalystDays + 'd'})`
          : '--';
        md += `| ${s.ticker} | ${s.company} | ${s.reviewDate || '?'} | ${s.daysSinceReview}d | ${s.pricePctChange >= 0 ? '+' : ''}${s.pricePctChange}% | ${icon} ${s.scores.urgency} | ${catalyst} |\n`;
      }

      // Action items for critical/high
      const urgent = report.stocks.filter(s => s.status === 'CRITICAL' || s.status === 'HIGH');
      if (urgent.length > 0) {
        md += `\n### Stocks Requiring Attention\n\n`;
        for (const s of urgent) {
          md += `- **${s.ticker}** (${s.company}): ${s.action}\n`;
        }
      }

      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    } catch (e) {
      console.error('  [WARN] Could not write step summary:', e.message);
    }
  }

  // Exit code: 2 if critical, 1 if prices failed, 0 otherwise
  if (!monitorOk) process.exit(1);

  // Check for criticals via monitor's JSON output
  try {
    const jsonOutput = execSync(
      `node ${path.join(SCRIPTS_DIR, 'research-monitor.js')} --json --quiet`,
      { encoding: 'utf8', cwd: path.join(__dirname, '..') }
    );
    const report = JSON.parse(jsonOutput);
    if (report.summary.critical > 0) {
      console.log(`  WARNING: ${report.summary.critical} CRITICAL stock(s) -- exit code 2`);
      process.exit(2);
    }
  } catch (e) {
    // Non-fatal
  }
}

main();
