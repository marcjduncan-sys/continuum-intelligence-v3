#!/usr/bin/env node
/**
 * calc-sector-signal.js
 *
 * Continuum Intelligence — Phase 2.2: Sector Signal Calculator
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md
 *
 * Reads data/macro-factors.json + each stock's narrative_model and
 * commodity_overlay config. Produces a Sector_Signal (-100..+100) for
 * each stock. Writes per-stock results to data/sector-signals.json.
 *
 * Usage:
 *   node scripts/calc-sector-signal.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT          = path.join(__dirname, '..');
const MACRO_PATH    = path.join(ROOT, 'data', 'macro-factors.json');
const TICKERS_PATH  = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR    = path.join(ROOT, 'data', 'stocks');
const OUTPUT_PATH   = path.join(ROOT, 'data', 'sector-signals.json');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ── Commodity model — position score via threshold table ─────────────────────

function commodityPositionScore(currentPrice, thresholds) {
  if (currentPrice == null || !thresholds) return 0;

  const { strong_bearish, bearish, neutral, bullish, strong_bullish } = thresholds;

  // Zone boundaries (ascending)
  const zones = [
    { above: null,               below: strong_bearish.below,  score: strong_bearish.position_score },
    { above: strong_bearish.below, below: bearish.range[1],    score: bearish.position_score        },
    { above: bearish.range[1],   below: neutral.range[1],      score: neutral.position_score        },
    { above: neutral.range[1],   below: bullish.range[1],      score: bullish.position_score        },
    { above: bullish.range[1],   below: null,                  score: strong_bullish.position_score },
  ];

  for (const zone of zones) {
    const inLow  = zone.above == null || currentPrice >= zone.above;
    const inHigh = zone.below == null || currentPrice <  zone.below;
    if (inLow && inHigh) return zone.score;
  }

  return 0;
}

function commodityMomentumScore(change5d, change20d) {
  // momentum = (5d * 0.4 + 20d * 0.6) * 1000, capped ±50
  const c5  = change5d  ?? 0;
  const c20 = change20d ?? 0;
  const raw = (c5 * 0.4 + c20 * 0.6) * 1000;
  return Math.max(-50, Math.min(50, Math.round(raw)));
}

function calcCommoditySignal(stock, macro) {
  const overlay = stock.commodity_overlay;
  if (!overlay || !overlay.thresholds) return { signal: 0, detail: 'no_overlay' };

  const primary = overlay.primary_commodity;
  const commodities = macro.commodities || {};

  // Map primary commodity to macro data key
  const commodityMap = {
    'brent':        commodities.brent,
    'wti':          commodities.wti,
    'oil':          commodities.brent,
    'iron_ore':     commodities.iron_ore_62,
    'iron_ore_62':  commodities.iron_ore_62,
    'gold':         commodities.gold_aud,  // gold stocks use AUD price
    'gold_aud':     commodities.gold_aud,
    'gold_usd':     commodities.gold_usd,
    'copper':       commodities.copper,
    'aluminium':    commodities.aluminium,
    'aluminum':     commodities.aluminium,
    'nat_gas':      commodities.nat_gas,
    'natural_gas':  commodities.nat_gas,
  };

  const cData = commodityMap[primary] || commodityMap[(primary || '').toLowerCase()];
  if (!cData || cData.close == null) {
    return { signal: 0, detail: 'commodity_data_unavailable:' + primary };
  }

  const posScore = commodityPositionScore(cData.close, overlay.thresholds);
  const momScore = commodityMomentumScore(cData.change_5d, cData.change_20d);
  const raw      = posScore * 0.7 + momScore * 0.3;
  const signal   = Math.max(-100, Math.min(100, Math.round(raw)));

  return {
    signal,
    detail:          'commodity',
    commodity:       primary,
    price:           cData.close,
    position_score:  posScore,
    momentum_score:  momScore
  };
}

// ── Diversified mining — weighted commodity blend ────────────────────────────

function calcDiversifiedSignal(stock, macro) {
  const split = stock.commodity_overlay && stock.commodity_overlay.revenue_commodity_split;
  if (!split) return calcCommoditySignal(stock, macro); // fallback

  const commodities = macro.commodities || {};
  const map = {
    iron_ore:   commodities.iron_ore_62,
    copper:     commodities.copper,
    coal:       commodities.thermal_coal || commodities.coking_coal,
    aluminium:  commodities.aluminium,
    gold:       commodities.gold_usd,
    other:      null,
  };

  let weighted = 0;
  let totalWeight = 0;

  for (const [comm, weight] of Object.entries(split)) {
    if (comm === 'other') continue;
    const cData = map[comm];
    if (!cData || cData.close == null) continue;

    // Diversified stocks don't have per-commodity thresholds — use momentum only
    const momScore = commodityMomentumScore(cData.change_5d, cData.change_20d);
    weighted    += momScore * weight;
    totalWeight += weight;
  }

  const signal = totalWeight > 0
    ? Math.max(-100, Math.min(100, Math.round(weighted / totalWeight)))
    : 0;

  return { signal, detail: 'diversified_blend' };
}

// ── Rate-sensitive model (banks, insurers) ───────────────────────────────────

function calcRateSignal(macro, invertForREIT) {
  const rates = macro.rates  || {};
  const x     = macro.macro  || {};

  // Rate trajectory score
  let rateScore = 0;
  const traj = rates.rba_trajectory;
  if (traj === 'cutting_aggressively') rateScore =  40;
  else if (traj === 'cutting_gradually') rateScore =  25;
  else if (traj === 'on_hold')           rateScore =   0;
  else if (traj === 'hiking_gradually')  rateScore = -25;
  else if (traj === 'hiking')            rateScore = -40;

  // Yield curve (2s10s)
  let curveScore = 0;
  const curve = rates.yield_curve_2s10s; // in basis points
  if (curve != null) {
    if (curve >  100) curveScore =  30;
    else if (curve >   50) curveScore =  15;
    else if (curve >    0) curveScore =   0;
    else if (curve >  -50) curveScore = -20;
    else                   curveScore = -35;
  }

  // Credit growth
  let creditScore = 0;
  const credit = x.system_credit_growth_yoy; // percentage
  if (credit != null) {
    if (credit >  8) creditScore =  30;
    else if (credit >  4) creditScore =  15;
    else if (credit >  0) creditScore =   0;
    else if (credit > -4) creditScore = -20;
    else                  creditScore = -30;
  }

  // REIT inversion: rising rates bearish for REITs
  if (invertForREIT) rateScore *= -1;

  const raw    = rateScore * 0.40 + curveScore * 0.30 + creditScore * 0.30;
  const signal = Math.max(-100, Math.min(100, Math.round(raw)));

  return { signal, detail: invertForREIT ? 'reit_rate' : 'bank_rate', rateScore, curveScore, creditScore };
}

// ── Tech/SaaS model ──────────────────────────────────────────────────────────

function calcTechSignal(macro) {
  const market = macro.market || {};
  const rates  = macro.rates  || {};

  const nasdaq  = market.nasdaq  || {};
  const us10yr  = rates.us_10yr  || {};

  // NASDAQ momentum score
  let nasdaqScore = 0;
  const n20 = nasdaq.change_20d;
  if (n20 != null) {
    const pct = n20 * 100;
    if (pct >  10) nasdaqScore =  50;
    else if (pct >   3) nasdaqScore =  20;
    else if (pct >  -3) nasdaqScore =   0;
    else if (pct > -10) nasdaqScore = -20;
    else                nasdaqScore = -50;
  }

  // US 10yr yield direction (20d change in yield level — ^TNX change_20d)
  // ^TNX reports in percent (4.08 = 4.08%), change_20d is fractional of that
  // So 20d yield change in bp = us10yr.change_20d * us10yr.close * 100
  let yieldScore = 0;
  if (us10yr.change_20d != null && us10yr.close != null) {
    const yieldChangeBp = us10yr.change_20d * us10yr.close * 100;
    if (yieldChangeBp < -20) yieldScore =  25;
    else if (yieldChangeBp >  20) yieldScore = -25;
    else                         yieldScore =   0;
  }

  const raw    = nasdaqScore * 0.65 + yieldScore * 0.35;
  const signal = Math.max(-100, Math.min(100, Math.round(raw)));

  return { signal, detail: 'tech_saas', nasdaqScore, yieldScore };
}

// ── Diversified asset manager (MQG, etc.) — ASX 200 momentum-led ─────────────

function calcAssetMgrSignal(macro) {
  const market = macro.market || {};
  const rates  = macro.rates  || {};

  const asx200  = market.asx200  || {};
  const us10yr  = rates.us_10yr  || {};

  // ASX 200 20d momentum score — primary driver (65%)
  let asxScore = 0;
  const a20 = asx200.change_20d;
  if (a20 != null) {
    const pct = a20 * 100;
    if (pct >  10) asxScore =  50;
    else if (pct >   3) asxScore =  20;
    else if (pct >  -3) asxScore =   0;
    else if (pct > -10) asxScore = -20;
    else                asxScore = -50;
  }

  // US 10yr yield direction — rising yields compress multiples (35%)
  let yieldScore = 0;
  if (us10yr.change_20d != null && us10yr.close != null) {
    const yieldChangeBp = us10yr.change_20d * us10yr.close * 100;
    if (yieldChangeBp < -20) yieldScore =  25;
    else if (yieldChangeBp >  20) yieldScore = -25;
    else                         yieldScore =   0;
  }

  const raw    = asxScore * 0.65 + yieldScore * 0.35;
  const signal = Math.max(-100, Math.min(100, Math.round(raw)));

  return { signal, detail: 'asset_mgr', asxScore, yieldScore };
}

// ── Healthcare / COMPANY_DOMINANT: minimal sector signal ─────────────────────

function calcNeutralSignal() {
  return { signal: 0, detail: 'company_dominant' };
}

// ── Route by narrative model ─────────────────────────────────────────────────

const COMMODITY_MODELS = new Set([
  'ENERGY_OIL_GAS', 'MATERIALS_IRON_ORE', 'MATERIALS_GOLD',
  'MATERIALS_COPPER', 'MATERIALS_ALUMINIUM', 'MATERIALS_LITHIUM',
  'MATERIALS_COAL', 'MATERIALS_URANIUM'
]);
const DIVERSIFIED_MODELS = new Set(['MATERIALS_DIVERSIFIED_MINING']);
const BANK_MODELS        = new Set(['FINANCIALS_MAJOR_BANKS', 'FINANCIALS_INSURANCE']);
const ASSET_MGR_MODELS   = new Set(['FINANCIALS_DIVERSIFIED_ASSET_MGMT']);
const REIT_MODELS        = new Set(['REIT_INDUSTRIAL', 'REIT_OFFICE', 'REIT_RETAIL', 'REIT_DIVERSIFIED']);
const TECH_MODELS        = new Set(['IT_SOFTWARE_SAAS', 'IT_HARDWARE', 'TECHNOLOGY']);
const NEUTRAL_MODELS     = new Set(['COMPANY_DOMINANT', 'HEALTHCARE_DEVICES_MEDTECH',
                                     'HEALTHCARE_BIOTECH', 'CONSUMER_STAPLES',
                                     'CONSUMER_DISCRETIONARY', 'INDUSTRIALS',
                                     'UTILITIES', 'ENERGY_SERVICES']);

function calcSectorSignal(stock, macro) {
  const model = stock.narrative_model || 'COMPANY_DOMINANT';

  if (COMMODITY_MODELS.has(model))   return calcCommoditySignal(stock, macro);
  if (DIVERSIFIED_MODELS.has(model)) return calcDiversifiedSignal(stock, macro);
  if (BANK_MODELS.has(model))        return calcRateSignal(macro, false);
  if (REIT_MODELS.has(model))        return calcRateSignal(macro, true);
  if (TECH_MODELS.has(model))        return calcTechSignal(macro);
  if (ASSET_MGR_MODELS.has(model))   return calcAssetMgrSignal(macro);
  return calcNeutralSignal();
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  let macro;
  try {
    macro = JSON.parse(fs.readFileSync(MACRO_PATH, 'utf8'));
  } catch (e) {
    console.error('[calc-sector-signal] Cannot read macro-factors.json:', e.message);
    process.exit(1);
  }

  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers)
    .filter(t => tickerConfig.tickers[t].status === 'active');

  const results = {};

  for (const ticker of tickers) {
    const stockPath = path.join(STOCKS_DIR, ticker + '.json');
    if (!fs.existsSync(stockPath)) continue;

    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (e) {
      console.warn('[calc-sector-signal] Cannot read', ticker, ':', e.message);
      continue;
    }

    const result = calcSectorSignal(stock, macro);
    results[ticker] = {
      sector_signal: result.signal,
      narrative_model: stock.narrative_model,
      detail: result
    };

    if (verbose) {
      console.log(' ', ticker.padEnd(6), '|', (stock.narrative_model || '').padEnd(30),
        '| Sector_Signal:', String(result.signal).padStart(4));
    }
  }

  const output = {
    date:        macro.date,
    computed_at: new Date().toISOString(),
    signals:     results
  };

  if (!dryRun) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  }

  const count = Object.keys(results).length;
  console.log('[calc-sector-signal] Sector signals computed for', count, 'stocks',
    dryRun ? '(dry-run)' : '→ data/sector-signals.json');

  return results;
}

module.exports = { main, calcSectorSignal };
main();
