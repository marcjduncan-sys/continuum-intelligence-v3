#!/usr/bin/env node
/**
 * fetch-macro-factors.js
 *
 * Continuum Intelligence — Macro/Sector Factor Data Fetcher
 * Phase 1, Step 1.1 of the three-layer narrative engine.
 *
 * Runs daily at 06:30 AM AEST (before the main pipeline) and produces
 * data/macro-factors.json, which feeds the Macro Signal and Sector Signal
 * calculators for all stocks in the coverage universe.
 *
 * Automated fetches (Yahoo Finance v8 chart API, same auth as fetch-live-prices.js):
 *   ^AXJO  ASX 200
 *   ^VIX   VIX
 *   ^IXIC  NASDAQ
 *   ^TNX   US 10yr yield
 *   AUDUSD=X
 *   BZ=F   Brent crude
 *   CL=F   WTI crude
 *   TIO=F  Iron ore 62% Fe
 *   GC=F   Gold USD
 *   HG=F   Copper LME
 *   ALI=F  Aluminium LME
 *   NG=F   Natural gas
 *
 * Derived:
 *   gold_aud = GC=F / AUDUSD=X
 *
 * Semi-automated fields (rates, manual commodities, macro indicators):
 *   Read from existing data/macro-factors.json if present.
 *   Never overwritten by this script — updated via separate manual process
 *   or event-driven scripts. Stale flags applied if >5 trading days old.
 *
 * Stale handling:
 *   If a Yahoo fetch fails, use prior value from existing file and set stale: true.
 *   If stale_days > 5, the signal calculators will degrade sector weight by 50%.
 *
 * Usage:
 *   node scripts/fetch-macro-factors.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── Paths ─────────────────────────────────────────────────────────────────────

const ROOT_DIR   = path.join(__dirname, '..');
const DATA_DIR   = path.join(ROOT_DIR, 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'macro-factors.json');

// ── Constants ─────────────────────────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                   '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Request 30 days of daily data so we can compute 1d, 5d and 20d returns.
const HISTORY_RANGE    = '1mo';
const HISTORY_INTERVAL = '1d';

// 1-year lookback for benchmark return calculations (3m/6m/12m).
const BENCHMARK_RANGE = '1y';

// Tickers fetched with BENCHMARK_RANGE to produce benchmark_returns.
// These values are IDENTICAL for every stock on any given day.
const BENCHMARK_TICKERS = {
  asx200:               '^AXJO',
  asx_small_ords:       '^AXSO',
  asx_materials:        '^AXMJ',
  asx_financials:       '^AXFJ',
  asx_healthcare:       '^AXHJ',
  asx_consumer_staples: '^AXSJ',
  asx_consumer_disc:    '^AXDJ',
  asx_areit:            '^AXPJ',
  asx_energy:           '^AXEJ',
  asx_industrials:      '^AXIJ',
  asx_technology:       '^AXTJ',
  asx_gold:             '^AXGD',
};

// Tickers to fetch automatically from Yahoo Finance.
// Key = field name used in the output schema.
const YAHOO_TICKERS = {
  // Market indices
  asx200:  '^AXJO',
  vix:     '^VIX',
  nasdaq:  '^IXIC',
  // Rates
  us_10yr: '^TNX',
  // FX
  aud_usd: 'AUDUSD=X',
  // Commodities
  brent:       'BZ=F',
  wti:         'CL=F',
  iron_ore_62: 'TIO=F',
  gold_usd:    'GC=F',
  copper:      'HG=F',
  aluminium:   'ALI=F',
  nat_gas:     'NG=F'
};

// Metadata for each auto-fetched key (unit, section it goes in).
const TICKER_META = {
  asx200:      { section: 'market',      unit: 'index'       },
  vix:         { section: 'market',      unit: 'index'       },
  nasdaq:      { section: 'market',      unit: 'index'       },
  us_10yr:     { section: 'rates',       unit: '%'           },
  aud_usd:     { section: 'fx',          unit: 'rate'        },
  brent:       { section: 'commodities', unit: 'USD/bbl'     },
  wti:         { section: 'commodities', unit: 'USD/bbl'     },
  iron_ore_62: { section: 'commodities', unit: 'USD/dmt'     },
  gold_usd:    { section: 'commodities', unit: 'USD/oz'      },
  copper:      { section: 'commodities', unit: 'USD/lb'      },
  aluminium:   { section: 'commodities', unit: 'USD/t'       },
  nat_gas:     { section: 'commodities', unit: 'USD/mmBtu'   }
};

// ── HTTP helpers (mirrors fetch-live-prices.js pattern) ──────────────────────

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/json,*/*',
        ...options.headers
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function getYahooSession() {
  console.log('  Obtaining Yahoo Finance session...');
  const consentRes = await httpGet('https://fc.yahoo.com/', {
    headers: { 'Accept': 'text/html' }
  });

  const setCookies = consentRes.headers['set-cookie'];
  if (!setCookies) throw new Error('No cookies from Yahoo Finance');

  const cookieArray = Array.isArray(setCookies) ? setCookies : [setCookies];
  const cookies = cookieArray.map(c => c.split(';')[0]).join('; ');

  const crumbRes = await httpGet('https://query2.finance.yahoo.com/v1/test/getcrumb', {
    headers: { 'Cookie': cookies, 'Accept': 'text/plain' }
  });

  if (crumbRes.statusCode !== 200) {
    throw new Error(`Crumb request failed: HTTP ${crumbRes.statusCode}`);
  }
  const crumb = crumbRes.body.trim();
  if (!crumb || crumb.length < 3) throw new Error(`Invalid crumb: "${crumb}"`);

  console.log('  Session established.');
  return { cookies, crumb };
}

function fetchJSON(url, session) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': USER_AGENT, 'Accept': 'application/json' };
    if (session) headers['Cookie'] = session.cookies;

    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// ── Fetch one ticker — returns array of daily closes ─────────────────────────

async function fetchDailyCloses(ticker, session, range = HISTORY_RANGE) {
  const crumbParam = session ? `&crumb=${encodeURIComponent(session.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}` +
              `?range=${range}&interval=${HISTORY_INTERVAL}&includePrePost=false${crumbParam}`;

  const json = await fetchJSON(url, session);
  const result = json.chart && json.chart.result && json.chart.result[0];
  if (!result) throw new Error('No chart result');

  const closes = result.indicators.quote[0].close;
  if (!closes || closes.length === 0) throw new Error('No close data');

  // Filter nulls (non-trading days sometimes appear as null)
  return closes.filter(v => v !== null && v !== undefined);
}

// ── Compute period returns from close array ────────────────────────────────────
//
// change_1d  = (closes[-1] - closes[-2]) / closes[-2]
// change_5d  = (closes[-1] - closes[-6]) / closes[-6]   (5 trading days back)
// change_20d = (closes[-1] - closes[-21]) / closes[-21]  (20 trading days back)
//
// Returns decimal fractions (0.023 = +2.3%).

function computeReturns(closes) {
  const n = closes.length;
  const last = closes[n - 1];

  const pct = (from) => {
    if (from == null || from === 0) return null;
    return Math.round(((last - from) / from) * 100000) / 100000; // 5dp
  };

  return {
    close:     Math.round(last * 10000) / 10000,
    change_1d: n >= 2  ? pct(closes[n - 2])  : null,
    change_5d: n >= 6  ? pct(closes[n - 6])  : null,
    change_20d: n >= 21 ? pct(closes[n - 21]) : null
  };
}

// ── Compute long-period benchmark returns (3m/6m/12m) ────────────────────────
//
// Requires at least 1 year of daily closes. Returns decimal fractions (5dp).
// Uses trading-day counts: 12m=252, 6m=126, 3m=63.

function computeBenchmarkReturns(closes) {
  const n = closes.length;
  if (n < 2) return { m12: null, m6: null, m3: null };

  const last = closes[n - 1];
  const pct = (from) => {
    if (from == null || from === 0) return null;
    return Math.round(((last - from) / from) * 100000) / 100000; // 5dp
  };

  // 12m: 252 trading days back; if history is shorter, use oldest available
  const base12m = n >= 253 ? closes[n - 253] : closes[0];
  return {
    m12: pct(base12m),
    m6:  n >= 127 ? pct(closes[n - 127]) : null,
    m3:  n >= 64  ? pct(closes[n - 64])  : null,
  };
}

// ── Fetch benchmark returns for all BENCHMARK_TICKERS ────────────────────────
//
// Falls back to prior values on failure. Only stamps calculated_date if the
// primary ASX200 benchmark succeeds (guarantees the date is meaningful).

async function fetchAllBenchmarks(session, prior) {
  const today  = new Date().toISOString().split('T')[0];
  // Seed with prior values so stale fallback works on partial failures
  const result = Object.assign({}, prior && prior.benchmark_returns ? prior.benchmark_returns : {});

  let asx200Ok = false;
  let fetchCount = 0;

  for (const [key, ticker] of Object.entries(BENCHMARK_TICKERS)) {
    if (fetchCount > 0) await new Promise(r => setTimeout(r, 300));
    fetchCount++;

    try {
      const closes = await fetchDailyCloses(ticker, session, BENCHMARK_RANGE);
      const ret    = computeBenchmarkReturns(closes);

      if (key === 'asx200') {
        result.asx200_12m = ret.m12;
        result.asx200_6m  = ret.m6;
        result.asx200_3m  = ret.m3;
        if (ret.m12 != null) asx200Ok = true;
      } else {
        result[key + '_12m'] = ret.m12;
      }

      const pctStr = ret.m12 != null ? (ret.m12 * 100).toFixed(2) + '%' : 'n/a';
      console.log(`  [BENCH] ${ticker.padEnd(12)} 12m=${pctStr}`);
    } catch (e) {
      console.log(`  [BENCH-FAIL] ${ticker}: ${e.message} — keeping prior`);
    }
  }

  if (asx200Ok) result.calculated_date = today;
  return result;
}

// ── Stale day counter ─────────────────────────────────────────────────────────
//
// Given a date string (YYYY-MM-DD), count the number of calendar days since then.
// Approximate trading days = calendar days * 5/7. We use calendar days for simplicity
// as the spec says "stale > 5 trading days" and we want to be conservative.

function staleDays(dateStr) {
  if (!dateStr) return 999;
  const then = new Date(dateStr);
  const now  = new Date();
  const diffMs = now - then;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// ── Load existing file (prior values for semi-automated fields) ──────────────

function loadExisting() {
  if (!fs.existsSync(OUTPUT_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

// ── Build output skeleton populated from prior file ──────────────────────────
//
// Semi-automated fields are never cleared — they retain prior values until
// manually updated. The script only writes the automated fields it fetched.

function buildSkeleton(prior) {
  const today = new Date().toISOString().split('T')[0];

  // Default structure — all values null; will be filled by auto-fetch or prior.
  const out = {
    date:       today,
    fetched_at: new Date().toISOString(),
    market: {
      asx200: null,
      vix:    null,
      nasdaq: null
    },
    rates: {
      // Auto-fetched
      us_10yr: null,
      // Semi-automated — carry forward from prior
      rba_cash:         prior?.rates?.rba_cash         ?? null,
      rba_trajectory:   prior?.rates?.rba_trajectory   ?? null,
      au_2yr:           prior?.rates?.au_2yr            ?? null,
      au_10yr:          prior?.rates?.au_10yr           ?? null,
      yield_curve_2s10s: prior?.rates?.yield_curve_2s10s ?? null
    },
    fx: {
      aud_usd: null
    },
    commodities: {
      // Auto-fetched
      brent:       null,
      wti:         null,
      iron_ore_62: null,
      gold_usd:    null,
      gold_aud:    null,  // derived
      copper:      null,
      aluminium:   null,
      nat_gas:     null,
      // Semi-automated — carry forward from prior
      thermal_coal: prior?.commodities?.thermal_coal ?? null,
      coking_coal:  prior?.commodities?.coking_coal  ?? null,
      uranium:      prior?.commodities?.uranium       ?? null,
      lithium_spod: prior?.commodities?.lithium_spod ?? null,
      lithium_carb: prior?.commodities?.lithium_carb ?? null
    },
    macro: {
      // All semi-automated — carry forward from prior
      china_mfg_pmi:             prior?.macro?.china_mfg_pmi             ?? null,
      au_unemployment:           prior?.macro?.au_unemployment            ?? null,
      consumer_confidence:       prior?.macro?.consumer_confidence        ?? null,
      au_building_approvals_yoy: prior?.macro?.au_building_approvals_yoy ?? null,
      system_credit_growth_yoy:  prior?.macro?.system_credit_growth_yoy  ?? null
    },
    // Benchmark returns — refreshed daily, shared across all stocks.
    // Carried forward from prior until fresh fetch succeeds.
    benchmark_returns: prior?.benchmark_returns ?? null
  };

  return out;
}

// ── Place a fetched result into the correct output section ───────────────────

function placeResult(out, key, returns, ticker) {
  const meta = TICKER_META[key];
  const entry = {
    ...returns,
    unit:  meta.unit,
    stale: false
  };
  if (ticker) entry.ticker = ticker;

  // Remove nulls that couldn't be computed (insufficient history)
  for (const k of ['change_1d', 'change_5d', 'change_20d']) {
    if (entry[k] === null) delete entry[k];
  }

  if (meta.section === 'market') {
    out.market[key] = entry;
  } else if (meta.section === 'rates') {
    out.rates[key] = entry;
  } else if (meta.section === 'fx') {
    out.fx[key] = entry;
  } else if (meta.section === 'commodities') {
    out.commodities[key] = entry;
  }
}

// ── Place a stale (fallback) result from the prior file ──────────────────────

function placeFallback(out, key, prior) {
  const meta = TICKER_META[key];
  let priorVal = null;

  if (meta.section === 'market')      priorVal = prior?.market?.[key];
  else if (meta.section === 'rates')  priorVal = prior?.rates?.[key];
  else if (meta.section === 'fx')     priorVal = prior?.fx?.[key];
  else if (meta.section === 'commodities') priorVal = prior?.commodities?.[key];

  if (!priorVal) {
    console.log(`  [WARN] No prior value available for ${key} — leaving null`);
    return;
  }

  const days = staleDays(prior?.date);
  const staleEntry = {
    ...priorVal,
    stale:      true,
    stale_days: (priorVal.stale_days ?? 0) + days
  };

  if (meta.section === 'market')      out.market[key]      = staleEntry;
  else if (meta.section === 'rates')  out.rates[key]       = staleEntry;
  else if (meta.section === 'fx')     out.fx[key]          = staleEntry;
  else if (meta.section === 'commodities') out.commodities[key] = staleEntry;
}

// ── Derive gold_aud from gold_usd and aud_usd ────────────────────────────────

function deriveGoldAud(out) {
  const g = out.commodities.gold_usd;
  const a = out.fx.aud_usd;
  if (!g || !a || !g.close || !a.close) return;

  const close = Math.round((g.close / a.close) * 100) / 100;

  // Derive period changes: gold_aud_change = gold_usd_change - aud_usd_change (approx)
  // More precisely: pct_aud = (1 + pct_gold_usd) / (1 + pct_aud_usd) - 1
  const derivePct = (gPct, aPct) => {
    if (gPct == null || aPct == null) return undefined;
    return Math.round(((1 + gPct) / (1 + aPct) - 1) * 100000) / 100000;
  };

  const entry = {
    close,
    unit:    'AUD/oz',
    derived: true,
    stale:   g.stale || a.stale
  };

  const c1d  = derivePct(g.change_1d, a.change_1d);
  const c5d  = derivePct(g.change_5d, a.change_5d);
  const c20d = derivePct(g.change_20d, a.change_20d);

  if (c1d  !== undefined) entry.change_1d  = c1d;
  if (c5d  !== undefined) entry.change_5d  = c5d;
  if (c20d !== undefined) entry.change_20d = c20d;

  if (g.stale || a.stale) {
    entry.stale_days = Math.max(g.stale_days ?? 0, a.stale_days ?? 0);
  }

  out.commodities.gold_aud = entry;
}

// ── Apply stale flags to semi-automated fields ────────────────────────────────
//
// Semi-automated entries have a { value, date, source } shape.
// Flag stale if date is > 35 calendar days ago (5 trading weeks — very conservative
// since monthly releases are normally replaced within 35 days).

function applySemiAutoStaleFlags(out) {
  const SEMI_AUTO_STALE_THRESHOLD_DAYS = 35;

  const checkSection = (section) => {
    for (const [key, val] of Object.entries(section)) {
      if (val && typeof val === 'object' && 'date' in val) {
        const days = staleDays(val.date);
        val.stale = days > SEMI_AUTO_STALE_THRESHOLD_DAYS;
        if (val.stale) val.stale_days = days;
      }
    }
  };

  checkSection(out.macro);
  // Semi-auto commodity entries
  for (const key of ['thermal_coal', 'coking_coal', 'uranium', 'lithium_spod', 'lithium_carb']) {
    const val = out.commodities[key];
    if (val && typeof val === 'object' && 'date' in val) {
      const days = staleDays(val.date);
      val.stale = days > SEMI_AUTO_STALE_THRESHOLD_DAYS;
      if (val.stale) val.stale_days = days;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Continuum Intelligence — Macro Factor Fetch ===');
  console.log(`Time: ${new Date().toISOString()}`);

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const prior = loadExisting();
  if (prior) {
    console.log(`  Prior file found: dated ${prior.date}`);
  } else {
    console.log('  No prior file — first run.');
  }

  const out = buildSkeleton(prior);

  // ── Yahoo Finance session ──────────────────────────────────────────────────

  let session = null;
  try {
    session = await getYahooSession();
  } catch (e) {
    console.error(`  [WARN] Yahoo session failed: ${e.message} — proceeding without auth`);
  }

  // ── Fetch all auto tickers ─────────────────────────────────────────────────

  let successCount = 0;
  let failCount = 0;

  for (const [key, ticker] of Object.entries(YAHOO_TICKERS)) {
    // Small delay between requests to avoid rate limiting
    if (successCount + failCount > 0) {
      await new Promise(r => setTimeout(r, 300));
    }

    try {
      const closes = await fetchDailyCloses(ticker, session);
      const returns = computeReturns(closes);
      placeResult(out, key, returns, ticker);
      successCount++;
      console.log(`  [OK]   ${ticker.padEnd(12)} close=${returns.close}  1d=${returns.change_1d != null ? (returns.change_1d * 100).toFixed(2) + '%' : 'n/a'}`);
    } catch (e) {
      failCount++;
      console.log(`  [FAIL] ${ticker.padEnd(12)} ${e.message} — using prior value`);
      placeFallback(out, key, prior);
    }
  }

  // ── Benchmark returns (12m/6m/3m for ASX200 + sector indices) ─────────────

  console.log('\n  Fetching benchmark returns (1y range)...');
  out.benchmark_returns = await fetchAllBenchmarks(session, prior);
  const br = out.benchmark_returns;
  if (br && br.asx200_12m != null) {
    console.log(`  [BENCH-OK] ASX200 12m=${(br.asx200_12m * 100).toFixed(2)}%  calculated_date=${br.calculated_date}`);
  } else {
    console.log('  [BENCH-WARN] ASX200 benchmark not available — using prior if present');
  }

  // ── Derive gold_aud ────────────────────────────────────────────────────────

  deriveGoldAud(out);
  if (out.commodities.gold_aud) {
    console.log(`  [DERIVED] gold_aud: ${out.commodities.gold_aud.close} AUD/oz`);
  }

  // ── Stale flags on semi-automated fields ──────────────────────────────────

  applySemiAutoStaleFlags(out);

  // ── Write output ──────────────────────────────────────────────────────────

  if (successCount === 0) {
    console.error('\n[ERROR] Zero tickers fetched successfully. Writing stale-only file.');
    // Still write — downstream calculators need the file to exist.
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2), 'utf8');

  console.log(`\nWrote: data/macro-factors.json`);
  console.log(`  Auto-fetched: ${successCount} OK, ${failCount} stale fallback`);
  console.log(`  Date: ${out.date}`);

  if (failCount > 0) {
    process.exitCode = 1; // Signal partial failure to CI, but don't abort
  }
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
