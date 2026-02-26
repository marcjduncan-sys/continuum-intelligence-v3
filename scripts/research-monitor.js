#!/usr/bin/env node
/**
 * research-monitor.js
 *
 * Continuum Intelligence — Research Freshness & Catalyst Monitor
 *
 * Parses all stock data from data/research/*.json and generates a priority-ranked
 * action queue based on three signals:
 *
 *   1. FRESHNESS  — Days since research was last updated
 *   2. CATALYSTS  — Upcoming events that require research revision
 *   3. DISLOCATION — Price has moved significantly since last review
 *
 * Each stock receives an urgency score (0-100) and a recommended action.
 *
 * Freshness data is written to data/freshness.json.
 *
 * Usage: node scripts/research-monitor.js [--json] [--quiet] [--inject]
 *   --json     Output machine-readable JSON instead of console table
 *   --quiet    Suppress banner and summary text (for piping)
 *   --inject   Write freshness data to data/freshness.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const FRESHNESS_PATH = path.join(ROOT, 'data', 'freshness.json');

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Configuration ---

// Freshness thresholds (calendar days since last research update)
const FRESHNESS = {
  FRESH: 7,       // 0-7 days: green, no action needed
  AGING: 14,      // 8-14 days: amber, review recommended
  STALE: 30,      // 15-30 days: orange, review required
  CRITICAL: 60    // 31-60 days: red, urgent review
  // >60 days: research is unreliable
};

// Catalyst proximity thresholds (calendar days until event)
const CATALYST = {
  IMMINENT: 3,    // 0-3 days: event is upon us, research must be current
  UPCOMING: 7,    // 4-7 days: prepare for event
  NEAR: 14,       // 8-14 days: flag for attention
  HORIZON: 30     // 15-30 days: on the radar
};

// Price dislocation thresholds (% change since last research date)
const DISLOCATION = {
  MINOR: 5,       // 5-10%: notable move
  SIGNIFICANT: 10, // 10-20%: material dislocation, review hypotheses
  MAJOR: 20       // >20%: major dislocation, research likely invalid
};

// Urgency score weights
const WEIGHTS = {
  FRESHNESS: 0.35,
  CATALYST: 0.35,
  DISLOCATION: 0.30
};

// --- Parsing ---

/**
 * Extract all stock tickers and their metadata from data/research/*.json files
 */
function parseStockData() {
  const stocks = [];

  let files;
  try {
    files = fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  } catch (e) {
    console.error(`[ERROR] Could not read research directory: ${e.message}`);
    return stocks;
  }

  for (const file of files) {
    const filePath = path.join(RESEARCH_DIR, file);
    const data = readJson(filePath);
    if (!data) continue;

    const ticker = data.ticker || file.replace('.json', '');

    const stock = {
      ticker,
      company: data.company || null,
      sector: data.sector || null,
      price: data.price || null,
      date: data.date || null,
      priceAtReview: null,
      tripwires: extractTripwires(data),
      priceHistory: data.priceHistory || []
    };

    // Calculate price at time of review from priceHistory
    if (stock.date && stock.price) {
      stock.priceAtReview = stock.price; // default: use current price as fallback

      // Try to get price from technicalAnalysis latestDailyRange if present
      if (data.technicalAnalysis && data.technicalAnalysis.latestDailyRange) {
        const range = data.technicalAnalysis.latestDailyRange;
        if (range.high != null && range.low != null) {
          stock.priceAtReview = (range.high + range.low) / 2;
        }
      }
    }

    stocks.push(stock);
  }

  return stocks;
}

function stripHtmlEntities(str) {
  return str
    .replace(/&mdash;/g, '\u2014')
    .replace(/&ndash;/g, '\u2013')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&bull;/g, '\u2022')
    .replace(/&ge;/g, '>=')
    .replace(/&le;/g, '<=')
    .replace(/&rarr;/g, '->')
    .replace(/&#\d+;/g, '');
}

/**
 * Extract tripwires from research JSON data.
 * Tripwires may be in data.tripwires.cards[] (each with date and title/name fields).
 */
function extractTripwires(data) {
  const tripwires = [];

  // Check tripwires.cards array format (used by research JSON)
  if (data.tripwires && Array.isArray(data.tripwires.cards)) {
    for (const card of data.tripwires.cards) {
      if (card.date && card.title) {
        tripwires.push({ date: card.date, name: stripHtmlEntities(card.title) });
      } else if (card.date && card.name) {
        tripwires.push({ date: card.date, name: stripHtmlEntities(card.name) });
      }
    }
  }

  // Check flat tripwires array format
  if (Array.isArray(data.tripwires) && data.tripwires.length > 0 && typeof data.tripwires[0] === 'object') {
    for (const tw of data.tripwires) {
      if (tw.date && (tw.name || tw.title)) {
        tripwires.push({ date: tw.date, name: stripHtmlEntities(tw.name || tw.title) });
      }
    }
  }

  return tripwires;
}

// --- Date Parsing ---

/**
 * Parse various date formats used in the data:
 *   '10 February 2026'      -> exact date
 *   '25 FEB 2026'            -> exact date
 *   '12 FEBRUARY 2026'       -> exact date
 *   '1H 2026'                -> approximate (Jul 1 2026)
 *   '2H 2026'                -> approximate (Dec 1 2026)
 *   'Q1 2026' - 'Q4 2026'   -> approximate
 *   'APR 2026', 'APRIL 2026'-> first of month
 *   'MID-2026'               -> Jul 1 2026
 *   'CY 2026'                -> Jun 30 2026
 *   'FY26', 'FY27'           -> Jun 30 of that year (Aus financial year)
 *   'ONGOING'                -> null (no specific date)
 *   '1H FY26 RESULTS'        -> Feb 2026
 *   '2026 AGM'               -> Oct 2026 (typical AGM season)
 *   '2026-2027'              -> mid-2026
 */
function parseDate(dateStr) {
  if (!dateStr) return null;

  const s = dateStr.trim().toUpperCase();

  // Skip non-date entries
  if (s === 'ONGOING' || s === 'TBD' || s === 'N/A') return null;

  // Exact date: '10 February 2026' or '25 FEB 2026' or '12 FEBRUARY 2026'
  const exactMatch = s.match(/^(\d{1,2})\s+(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(\d{4})$/);
  if (exactMatch) {
    return new Date(`${exactMatch[1]} ${exactMatch[2]} ${exactMatch[3]}`);
  }

  // Month + Year: 'APR 2026', 'APRIL 2026', 'AUGUST 2026'
  const monthYearMatch = s.match(/^(JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\s+(\d{4})$/);
  if (monthYearMatch) {
    return new Date(`1 ${monthYearMatch[1]} ${monthYearMatch[2]}`);
  }

  // Half-year: '1H 2026', '2H 2026'
  const halfMatch = s.match(/^([12])H\s+(\d{4})$/);
  if (halfMatch) {
    return halfMatch[1] === '1' ? new Date(`1 April ${halfMatch[2]}`) : new Date(`1 October ${halfMatch[2]}`);
  }

  // Quarter: 'Q1 2026' - 'Q4 2026'
  const quarterMatch = s.match(/^Q([1-4])\s+(\d{4})$/);
  if (quarterMatch) {
    const months = { '1': 'February', '2': 'May', '3': 'August', '4': 'November' };
    return new Date(`1 ${months[quarterMatch[1]]} ${quarterMatch[2]}`);
  }

  // Financial year: 'FY26', 'FY27', '1H FY26', '1H FY26 RESULTS'
  const fyMatch = s.match(/(?:([12])H\s+)?FY(\d{2})(?:\s+RESULTS)?$/);
  if (fyMatch) {
    const year = 2000 + parseInt(fyMatch[2]);
    if (fyMatch[1] === '1') return new Date(`1 February ${year}`);  // 1H results ~Feb
    if (fyMatch[1] === '2') return new Date(`1 August ${year}`);     // 2H results ~Aug
    return new Date(`30 June ${year}`);  // Full year
  }

  // Mid-year: 'MID-2026'
  const midMatch = s.match(/^MID[- ](\d{4})$/);
  if (midMatch) return new Date(`1 July ${midMatch[1]}`);

  // Calendar year: 'CY 2026'
  const cyMatch = s.match(/^CY\s+(\d{4})$/);
  if (cyMatch) return new Date(`30 June ${cyMatch[1]}`);

  // Year range: '2026-2027'
  const rangeMatch = s.match(/^(\d{4})-(\d{4})$/);
  if (rangeMatch) return new Date(`1 July ${rangeMatch[1]}`);

  // AGM: '2026 AGM'
  const agmMatch = s.match(/^(\d{4})\s+AGM$/);
  if (agmMatch) return new Date(`15 October ${agmMatch[1]}`);

  // Fallback: try native parsing
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// --- Scoring ---

/**
 * Calculate freshness score (0-100, higher = more urgent)
 */
function scoreFreshness(daysSinceReview) {
  if (daysSinceReview <= FRESHNESS.FRESH) return 0;
  if (daysSinceReview <= FRESHNESS.AGING) return 25;
  if (daysSinceReview <= FRESHNESS.STALE) return 55;
  if (daysSinceReview <= FRESHNESS.CRITICAL) return 80;
  return 100; // beyond critical
}

/**
 * Calculate catalyst score (0-100, higher = more urgent)
 */
function scoreCatalyst(daysUntilNearest) {
  if (daysUntilNearest === null) return 0; // no upcoming catalysts
  if (daysUntilNearest <= 0) return 100;   // catalyst has passed without update
  if (daysUntilNearest <= CATALYST.IMMINENT) return 90;
  if (daysUntilNearest <= CATALYST.UPCOMING) return 70;
  if (daysUntilNearest <= CATALYST.NEAR) return 40;
  if (daysUntilNearest <= CATALYST.HORIZON) return 15;
  return 0;
}

/**
 * Calculate dislocation score (0-100, higher = more urgent)
 */
function scoreDislocation(pctChange) {
  const abs = Math.abs(pctChange);
  if (abs < DISLOCATION.MINOR) return 0;
  if (abs < DISLOCATION.SIGNIFICANT) return 30;
  if (abs < DISLOCATION.MAJOR) return 65;
  return 100;
}

/**
 * Map urgency score to status label and action
 */
function urgencyLabel(score) {
  if (score >= 75) return { status: 'CRITICAL', action: 'Immediate research review required', badge: 'critical' };
  if (score >= 50) return { status: 'HIGH', action: 'Research review recommended this week', badge: 'high' };
  if (score >= 25) return { status: 'MODERATE', action: 'Monitor -- review within 2 weeks', badge: 'moderate' };
  return { status: 'OK', action: 'Research is current', badge: 'ok' };
}

// --- Main Analysis ---

function analyseStocks(stocks, now) {
  const results = [];

  for (const stock of stocks) {
    const reviewDate = parseDate(stock.date);
    const daysSinceReview = reviewDate
      ? Math.floor((now - reviewDate) / (1000 * 60 * 60 * 24))
      : 999; // no date = assume very stale

    // Find nearest upcoming catalyst
    let nearestCatalyst = null;
    let nearestCatalystDays = null;
    let upcomingCatalysts = [];

    for (const tw of stock.tripwires) {
      const twDate = parseDate(tw.date);
      if (!twDate) continue;
      const daysUntil = Math.floor((twDate - now) / (1000 * 60 * 60 * 24));

      // Include catalysts from 7 days ago (may have just passed) to 90 days out
      if (daysUntil >= -7 && daysUntil <= 90) {
        upcomingCatalysts.push({ ...tw, parsedDate: twDate, daysUntil });
        if (nearestCatalystDays === null || daysUntil < nearestCatalystDays) {
          nearestCatalystDays = daysUntil;
          nearestCatalyst = tw;
        }
      }
    }

    // Sort catalysts by proximity
    upcomingCatalysts.sort((a, b) => a.daysUntil - b.daysUntil);

    // Calculate price dislocation
    const pricePctChange = stock.priceAtReview
      ? ((stock.price - stock.priceAtReview) / stock.priceAtReview) * 100
      : 0;

    // Score each dimension
    const freshScore = scoreFreshness(daysSinceReview);
    const catalystScore = scoreCatalyst(nearestCatalystDays);
    const dislocationScore = scoreDislocation(pricePctChange);

    // Weighted urgency
    const urgency = Math.round(
      freshScore * WEIGHTS.FRESHNESS +
      catalystScore * WEIGHTS.CATALYST +
      dislocationScore * WEIGHTS.DISLOCATION
    );

    const label = urgencyLabel(urgency);

    results.push({
      ticker: stock.ticker,
      company: stock.company,
      sector: stock.sector,
      currentPrice: stock.price,
      reviewDate: stock.date,
      daysSinceReview,
      priceAtReview: stock.priceAtReview ? Math.round(stock.priceAtReview * 100) / 100 : null,
      pricePctChange: Math.round(pricePctChange * 10) / 10,
      nearestCatalyst: nearestCatalyst ? nearestCatalyst.name : null,
      nearestCatalystDate: nearestCatalyst ? nearestCatalyst.date : null,
      nearestCatalystDays,
      upcomingCatalysts: upcomingCatalysts.map(c => ({
        name: c.name,
        date: c.date,
        daysUntil: c.daysUntil
      })),
      scores: {
        freshness: freshScore,
        catalyst: catalystScore,
        dislocation: dislocationScore,
        urgency
      },
      status: label.status,
      action: label.action,
      badge: label.badge
    });
  }

  // Sort by urgency (highest first)
  results.sort((a, b) => b.scores.urgency - a.scores.urgency);

  return results;
}

// --- Output ---

function printReport(results, now) {
  const dateStr = now.toISOString().split('T')[0];

  console.log('');
  console.log('='.repeat(66));
  console.log('  CONTINUUM INTELLIGENCE -- RESEARCH FRESHNESS MONITOR');
  console.log(`  Report Date: ${dateStr}`);
  console.log('='.repeat(66));
  console.log('');

  // Summary counts
  const critical = results.filter(r => r.status === 'CRITICAL').length;
  const high = results.filter(r => r.status === 'HIGH').length;
  const moderate = results.filter(r => r.status === 'MODERATE').length;
  const ok = results.filter(r => r.status === 'OK').length;

  console.log(`  Status:  ${critical} CRITICAL   ${high} HIGH   ${moderate} MODERATE   ${ok} OK`);
  console.log('');

  // Priority queue
  console.log('  +---------+--------------------------+-------+-------+----------+----------------------------+');
  console.log('  | TICKER  | RESEARCH DATE            | DAYS  | PRICE | URGENCY  | NEAREST CATALYST           |');
  console.log('  +---------+--------------------------+-------+-------+----------+----------------------------+');

  for (const r of results) {
    const ticker = r.ticker.padEnd(7);
    const date = (r.reviewDate || 'UNKNOWN').padEnd(24);
    const days = String(r.daysSinceReview).padStart(3) + 'd';
    const priceDelta = (r.pricePctChange >= 0 ? '+' : '') + r.pricePctChange.toFixed(1) + '%';
    const price = priceDelta.padStart(5);
    const statusLabel = { CRITICAL: 'CRIT', HIGH: 'HIGH', MODERATE: 'MOD ', OK: ' OK ' }[r.status];
    const urgency = `${statusLabel} ${String(r.scores.urgency).padStart(2)}`;
    const catalyst = r.nearestCatalyst
      ? `${r.nearestCatalyst} (${r.nearestCatalystDays <= 0 ? 'PASSED' : r.nearestCatalystDays + 'd'})`.substring(0, 26)
      : '--';

    console.log(`  | ${ticker} | ${date} | ${days} | ${price} | ${urgency}     | ${catalyst.padEnd(26)} |`);
  }

  console.log('  +---------+--------------------------+-------+-------+----------+----------------------------+');
  console.log('');

  // Action items
  const actionable = results.filter(r => r.status !== 'OK');
  if (actionable.length > 0) {
    console.log('  ACTION QUEUE (priority order):');
    console.log('  ' + '-'.repeat(35));
    for (let i = 0; i < actionable.length; i++) {
      const r = actionable[i];
      const reasons = [];
      if (r.scores.freshness >= 25) reasons.push(`research ${r.daysSinceReview}d old`);
      if (r.scores.catalyst >= 15) {
        if (r.nearestCatalystDays <= 0) reasons.push(`catalyst "${r.nearestCatalyst}" has passed`);
        else reasons.push(`catalyst "${r.nearestCatalyst}" in ${r.nearestCatalystDays}d`);
      }
      if (r.scores.dislocation >= 30) reasons.push(`price moved ${r.pricePctChange > 0 ? '+' : ''}${r.pricePctChange}% since review`);

      console.log(`  ${i + 1}. [${r.status}] ${r.ticker} -- ${r.action}`);
      if (reasons.length) console.log(`     Reason: ${reasons.join('; ')}`);
    }
    console.log('');
  } else {
    console.log('  All research is current. No action required.');
    console.log('');
  }
}

function generateJSON(results, now) {
  return {
    reportDate: now.toISOString(),
    summary: {
      total: results.length,
      critical: results.filter(r => r.status === 'CRITICAL').length,
      high: results.filter(r => r.status === 'HIGH').length,
      moderate: results.filter(r => r.status === 'MODERATE').length,
      ok: results.filter(r => r.status === 'OK').length
    },
    stocks: results
  };
}

// --- Freshness Data Output ---

/**
 * Write freshness data to data/freshness.json so the frontend
 * can render freshness badges and catalyst alerts on stock cards.
 */
function writeFreshnessData(results, now) {
  const freshnessObj = {};
  for (const r of results) {
    freshnessObj[r.ticker] = {
      reviewDate: r.reviewDate,
      daysSinceReview: r.daysSinceReview,
      priceAtReview: r.priceAtReview,
      pricePctChange: r.pricePctChange,
      nearestCatalyst: r.nearestCatalyst,
      nearestCatalystDate: r.nearestCatalystDate,
      nearestCatalystDays: r.nearestCatalystDays,
      urgency: r.scores.urgency,
      status: r.status,
      badge: r.badge
    };
  }

  try {
    writeJson(FRESHNESS_PATH, freshnessObj);
  } catch (e) {
    console.error(`  [ERROR] Failed to write freshness.json: ${e.message}`);
  }
}

// --- Entry Point ---

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const quietMode = args.includes('--quiet');
  const injectMode = args.includes('--inject');

  const stocks = parseStockData();
  const now = new Date();

  const results = analyseStocks(stocks, now);

  if (jsonMode) {
    console.log(JSON.stringify(generateJSON(results, now), null, 2));
  } else if (!quietMode) {
    printReport(results, now);
  }

  // Write freshness data to JSON file
  if (injectMode) {
    writeFreshnessData(results, now);
    if (!quietMode) {
      console.log('  [WRITTEN] Freshness data saved to data/freshness.json');
    }
  }

  // Exit with code 2 if any stock is CRITICAL (for CI alerting)
  const hasCritical = results.some(r => r.status === 'CRITICAL');
  if (hasCritical && !jsonMode) {
    console.log('  WARNING: CRITICAL stocks detected -- exit code 2');
  }

  // Always output summary line for GitHub Actions
  if (process.env.GITHUB_OUTPUT) {
    const summaryLine = results.map(r => `${r.ticker}:${r.status}`).join(',');
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `monitor_summary=${summaryLine}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `critical_count=${results.filter(r => r.status === 'CRITICAL').length}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `high_count=${results.filter(r => r.status === 'HIGH').length}\n`);
  }

  // Return results for programmatic use
  return { results, hasCritical };
}

// Export for use by orchestrator
module.exports = { analyseStocks, parseStockData, parseDate, writeFreshnessData, generateJSON };

// Run if called directly
if (require.main === module) {
  const { hasCritical } = main();
  process.exit(hasCritical ? 2 : 0);
}
