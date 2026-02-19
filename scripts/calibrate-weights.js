#!/usr/bin/env node
/**
 * calibrate-weights.js — Phase 7.3: Monthly Regression Weight Calibration
 *
 * Runs on the 1st of each month (via GitHub Actions monthly-calibration.yml).
 * For each stock with >= 60 trading days of history that includes three-layer
 * signal data, performs a partial-R² decomposition to estimate how much of
 * the stock's daily return variance is explained by:
 *   - Macro layer  (ASX200 / VIX / AUD — proxied by macro_signal history)
 *   - Sector layer (proxied by sector_signal history)
 *   - Idio layer   (residual = 1 - R²_macro - R²_sector)
 *
 * Weights are blended 70/30 with the stock's model-default weights, then
 * written back to data/stocks/{TICKER}.json as narrative_weights.
 *
 * Override rules (from spec):
 *   - w_macro + w_sector <= 0.85 (min 15% idiosyncratic)
 *   - w_idio >= 0.15
 *   - If regression w_sector < 0.10 for a commodity stock → flag, keep default
 *
 * Referenced by: MASTER_IMPLEMENTATION_INSTRUCTIONS.md Phase 7.3
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────────────

const ROOT       = path.resolve(__dirname, '..');
const STOCKS_DIR = path.join(ROOT, 'data', 'stocks');

const MIN_SIGNAL_DAYS = 60;   // minimum history entries with signal data
const BLEND_REGRESSION = 0.70; // weight on regression result
const BLEND_DEFAULT    = 0.30; // weight on model default
const FLOOR_EACH       = 0.05; // floor per weight component
const MAX_MACRO_SECTOR = 0.85; // cap on combined macro+sector
const MIN_IDIO         = 0.15; // minimum idio weight

const DRY_RUN = process.argv.includes('--dry-run');

// Commodity narrative models that require w_sector >= 0.10
const COMMODITY_MODELS = new Set([
  'ENERGY_OIL_GAS', 'MATERIALS_IRON_ORE', 'MATERIALS_GOLD',
  'MATERIALS_DIVERSIFIED_MINING', 'MATERIALS_COPPER', 'MATERIALS_COAL'
]);

// ── OLS helpers (no external dependencies) ───────────────────────────────────

/** Simple mean */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Pearson correlation coefficient between two same-length arrays */
function pearsonR(x, y) {
  const n = x.length;
  if (n < 2) return 0;
  const mx = mean(x), my = mean(y);
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    num += dx * dy;
    sx  += dx * dx;
    sy  += dy * dy;
  }
  if (sx === 0 || sy === 0) return 0;
  return num / Math.sqrt(sx * sy);
}

/** R² of simple OLS (y ~ x) */
function r2Simple(x, y) {
  const r = pearsonR(x, y);
  return r * r;
}

/**
 * Partial R² decomposition using variance partitioning.
 *
 * Returns { r2_macro, r2_sector, r2_idio } where each is the marginal
 * contribution to explained variance. Uses the Lindeman-Merenda-Gold (LMG)
 * average over orderings approach simplified to 2 predictors:
 *
 *   R²(macro+sector) via multiple regression
 *   r2_macro   = [R²(macro_only) + (R²(both) - R²(sector_only))] / 2
 *   r2_sector  = [R²(sector_only) + (R²(both) - R²(macro_only))] / 2
 *   r2_idio    = 1 - R²(both)
 */
function partialR2(stockReturns, macroSignals, sectorSignals) {
  const n = stockReturns.length;
  if (n < 10) return { r2_macro: 0, r2_sector: 0, r2_idio: 1 };

  const r2m  = r2Simple(macroSignals,  stockReturns);
  const r2s  = r2Simple(sectorSignals, stockReturns);

  // Multiple R² via matrix formula for 2 predictors
  // R²_both = (r_ym² + r_ys² - 2·r_ym·r_ys·r_ms) / (1 - r_ms²)
  const r_ym = pearsonR(macroSignals,  stockReturns);
  const r_ys = pearsonR(sectorSignals, stockReturns);
  const r_ms = pearsonR(macroSignals,  sectorSignals);
  const denom = 1 - r_ms * r_ms;
  let r2_both;
  if (Math.abs(denom) < 1e-10) {
    // Perfect collinearity — fall back to average of individual R²s
    r2_both = (r2m + r2s) / 2;
  } else {
    r2_both = (r_ym * r_ym + r_ys * r_ys - 2 * r_ym * r_ys * r_ms) / denom;
    r2_both = Math.max(0, Math.min(1, r2_both));
  }

  // LMG averaging
  const r2_macro_lmg  = (r2m + (r2_both - r2s)) / 2;
  const r2_sector_lmg = (r2s + (r2_both - r2m)) / 2;
  const r2_idio_lmg   = Math.max(0, 1 - r2_both);

  // Clamp negatives (can arise from LMG with collinear predictors)
  const rm  = Math.max(0, r2_macro_lmg);
  const rs  = Math.max(0, r2_sector_lmg);
  const ri  = Math.max(0, r2_idio_lmg);
  const sum = rm + rs + ri;
  if (sum < 0.001) return { r2_macro: 0, r2_sector: 0, r2_idio: 1 };

  return {
    r2_macro:  rm  / sum,
    r2_sector: rs  / sum,
    r2_idio:   ri  / sum
  };
}

// ── Weight constraint enforcement ────────────────────────────────────────────

/**
 * Apply override rules:
 *  1. Floor each weight at FLOOR_EACH
 *  2. Cap macro+sector at MAX_MACRO_SECTOR
 *  3. Enforce w_idio >= MIN_IDIO
 *  4. Normalise to sum = 1.0
 */
function applyConstraints(weights) {
  let { macro, sector, idio } = weights;

  // Floor
  macro  = Math.max(macro,  FLOOR_EACH);
  sector = Math.max(sector, FLOOR_EACH);
  idio   = Math.max(idio,   MIN_IDIO);

  // Cap macro+sector
  if (macro + sector > MAX_MACRO_SECTOR) {
    const ratio = MAX_MACRO_SECTOR / (macro + sector);
    macro  *= ratio;
    sector *= ratio;
    idio    = Math.max(idio, 1 - macro - sector);
  }

  // Normalise
  const total = macro + sector + idio;
  macro  = Math.round((macro  / total) * 1000) / 1000;
  sector = Math.round((sector / total) * 1000) / 1000;
  idio   = Math.round(1 - macro - sector, 3);   // remainder to avoid floating sum drift

  return { macro, sector, idio };
}

// ── Per-stock calibration ─────────────────────────────────────────────────────

function calibrateTicker(ticker) {
  const stockPath   = path.join(STOCKS_DIR, ticker + '.json');
  const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');

  if (!fs.existsSync(stockPath) || !fs.existsSync(historyPath)) return null;

  let stock, histData;
  try {
    stock    = JSON.parse(fs.readFileSync(stockPath,   'utf8'));
    histData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
  } catch (e) {
    console.warn(`[Calibrate] ${ticker}: read error — ${e.message}`);
    return null;
  }

  const history = histData.history || histData.entries || [];

  // Filter to entries that have all three signals + daily_change_pct
  const valid = history.filter(e =>
    e.daily_change_pct !== null && e.daily_change_pct !== undefined &&
    e.macro_signal  !== null && e.macro_signal  !== undefined &&
    e.sector_signal !== null && e.sector_signal !== undefined &&
    e.idio_signal   !== null && e.idio_signal   !== undefined
  );

  if (valid.length < MIN_SIGNAL_DAYS) {
    console.log(`[Calibrate] ${ticker}: only ${valid.length} signal-days (need ${MIN_SIGNAL_DAYS}) — skipping`);
    return { ticker, status: 'insufficient_data', signal_days: valid.length };
  }

  // Extract parallel arrays
  const stockReturns  = valid.map(e => e.daily_change_pct);
  const macroSignals  = valid.map(e => e.macro_signal);
  const sectorSignals = valid.map(e => e.sector_signal);

  const { r2_macro, r2_sector, r2_idio } = partialR2(stockReturns, macroSignals, sectorSignals);

  // Default weights from stock config
  const defaults = stock.narrative_weights || { macro: 0.15, sector: 0.55, idio: 0.30 };

  // Blend: 70% regression, 30% model default
  const blended = {
    macro:  BLEND_REGRESSION * r2_macro  + BLEND_DEFAULT * (defaults.macro  || 0.15),
    sector: BLEND_REGRESSION * r2_sector + BLEND_DEFAULT * (defaults.sector || 0.55),
    idio:   BLEND_REGRESSION * r2_idio   + BLEND_DEFAULT * (defaults.idio   || 0.30)
  };

  const final = applyConstraints(blended);

  // Override rule: commodity stock must have w_sector >= 0.10
  const model = stock.narrative_model || '';
  let flagged  = false;
  if (COMMODITY_MODELS.has(model) && r2_sector < 0.10) {
    console.warn(`[Calibrate] ${ticker}: commodity model but regression w_sector=${(r2_sector*100).toFixed(1)}% < 10% — flagged, keeping defaults`);
    flagged = true;
  }

  const result = {
    ticker,
    status:      flagged ? 'flagged' : 'calibrated',
    signal_days: valid.length,
    r2: { macro: r2_macro, sector: r2_sector, idio: r2_idio },
    blended,
    final: flagged ? defaults : final,
    previous: defaults
  };

  if (!flagged && !DRY_RUN) {
    stock.narrative_weights = final;
    stock.weight_calibration = {
      last_calibrated: new Date().toISOString().substring(0, 10),
      signal_days:     valid.length,
      r2_decomposition: result.r2,
      blended_before_constraints: blended
    };
    try {
      fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2));
    } catch (e) {
      console.error(`[Calibrate] ${ticker}: write error — ${e.message}`);
      result.status = 'write_error';
    }
  }

  return result;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function run() {
  const files = fs.readdirSync(STOCKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('history') && !f.includes('.gitkeep'));

  const tickers = files.map(f => f.replace('.json', ''));
  console.log(`[Calibrate] Running weight calibration for ${tickers.length} stocks${DRY_RUN ? ' (DRY RUN)' : ''}…\n`);

  const results = [];
  for (const ticker of tickers) {
    const res = calibrateTicker(ticker);
    if (res) results.push(res);
  }

  // Summary
  const calibrated = results.filter(r => r.status === 'calibrated');
  const skipped    = results.filter(r => r.status === 'insufficient_data');
  const flagged    = results.filter(r => r.status === 'flagged');

  console.log('\n── Calibration Summary ─────────────────────────────────────────');
  console.log(`  Calibrated:         ${calibrated.length}`);
  console.log(`  Flagged (kept def): ${flagged.length}`);
  console.log(`  Insufficient data:  ${skipped.length}`);

  if (calibrated.length > 0) {
    console.log('\n  Updated weights:');
    for (const r of calibrated) {
      const prev = r.previous;
      const fin  = r.final;
      const changed = JSON.stringify(prev) !== JSON.stringify(fin);
      if (changed) {
        console.log(`    ${r.ticker}: M=${(prev.macro*100).toFixed(0)}→${(fin.macro*100).toFixed(0)}%  S=${(prev.sector*100).toFixed(0)}→${(fin.sector*100).toFixed(0)}%  I=${(prev.idio*100).toFixed(0)}→${(fin.idio*100).toFixed(0)}%  (${r.signal_days}d)`);
      } else {
        console.log(`    ${r.ticker}: weights unchanged (${r.signal_days}d)`);
      }
    }
  }

  if (flagged.length > 0) {
    console.log('\n  ⚠ Flagged (manual review required):');
    flagged.forEach(r => console.log(`    ${r.ticker}: sector R²=${(r.r2.sector*100).toFixed(1)}% below 10% threshold for ${r.ticker}`));
  }

  if (DRY_RUN) console.log('\n[Calibrate] DRY RUN — no files written.');

  // Exit 1 only on flagged stocks with commodity models (needs attention)
  process.exit(flagged.length > 0 ? 2 : 0); // exit 2 = warning, not error
}

run();
