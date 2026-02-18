#!/usr/bin/env node
/**
 * patch-stock-configs.js
 *
 * Phase 1.2 — One-time patch script.
 *
 * Adds narrative_model, narrative_weights, and commodity_overlay to every
 * stock JSON in data/stocks/. Source of truth: SECTION02_REDESIGN.md and
 * ASX200_SECTOR_NARRATIVE_MODELS.md.
 *
 * Safe to re-run: only adds/overwrites the three new top-level keys.
 * All existing keys (hypotheses, price_history, etc.) are untouched.
 *
 * Usage: node scripts/patch-stock-configs.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');

// ── Patch definitions ─────────────────────────────────────────────────────────
// Keyed by short ticker (no .AX suffix), matching filenames in data/stocks/.
//
// narrative_weights from SECTION02_REDESIGN.md Table (initial calibration).
// narrative_model   from ASX200_SECTOR_NARRATIVE_MODELS.md.
// commodity_overlay from SECTION02_REDESIGN.md breakeven specs + model threshold tables.
//   Only present where model has breakeven = Yes.
// revenue_commodity_split only for MATERIALS_DIVERSIFIED_MINING stocks.
// ─────────────────────────────────────────────────────────────────────────────

const PATCHES = {

  // ── ENERGY ────────────────────────────────────────────────────────────────

  WDS: {
    gics_sub_industry: 'Oil & Gas Exploration & Production',
    narrative_model: 'ENERGY_OIL_GAS',
    narrative_weights: { macro: 0.15, sector: 0.55, idio: 0.30 },
    commodity_overlay: {
      primary_commodity: 'brent',
      breakeven: 35,
      breakeven_unit: 'USD/boe',
      breakeven_source: 'Woodside CMD 2025',
      breakeven_confidence: 'HIGH',
      breakeven_note: null,
      sensitivity: '+$1/bbl Brent ≈ +$180M annualised FCF',
      thresholds: {
        strong_bearish: { below: 45,              position_score: -80 },
        bearish:        { range: [45, 60],         position_score: -30 },
        neutral:        { range: [60, 75],         position_score:   0 },
        bullish:        { range: [75, 90],         position_score:  40 },
        strong_bullish: { above: 90,               position_score:  70 }
      }
    }
  },

  WOR: {
    gics_sub_industry: 'Oil & Gas Equipment & Services',
    narrative_model: 'INDUSTRIALS_ENGINEERING_CONSTRUCTION',
    narrative_weights: { macro: 0.20, sector: 0.25, idio: 0.55 },
    commodity_overlay: null
  },

  // ── MATERIALS: IRON ORE ───────────────────────────────────────────────────

  FMG: {
    gics_sub_industry: 'Steel',
    narrative_model: 'MATERIALS_IRON_ORE',
    narrative_weights: { macro: 0.10, sector: 0.60, idio: 0.30 },
    commodity_overlay: {
      primary_commodity: 'iron_ore_62',
      breakeven: 20,
      breakeven_unit: 'USD/wmt',
      breakeven_source: 'FMG FY25 C1 cost guidance',
      breakeven_confidence: 'HIGH',
      breakeven_note: null,
      sensitivity: '+$1/t iron ore ≈ +~$200M annualised EBITDA',
      thresholds: {
        strong_bearish: { below: 70,              position_score: -80 },
        bearish:        { range: [70, 90],         position_score: -30 },
        neutral:        { range: [90, 110],        position_score:   0 },
        bullish:        { range: [110, 130],       position_score:  40 },
        strong_bullish: { above: 130,              position_score:  70 }
      }
    }
  },

  // ── MATERIALS: DIVERSIFIED ────────────────────────────────────────────────

  BHP: {
    gics_sub_industry: 'Diversified Metals & Mining',
    narrative_model: 'MATERIALS_DIVERSIFIED_MINING',
    narrative_weights: { macro: 0.15, sector: 0.45, idio: 0.40 },
    commodity_overlay: null,
    revenue_commodity_split: {
      iron_ore: 0.50,
      copper:   0.25,
      coal:     0.15,
      other:    0.10
    }
  },

  RIO: {
    gics_sub_industry: 'Diversified Metals & Mining',
    narrative_model: 'MATERIALS_DIVERSIFIED_MINING',
    narrative_weights: { macro: 0.15, sector: 0.50, idio: 0.35 },
    commodity_overlay: null,
    revenue_commodity_split: {
      iron_ore:   0.60,
      aluminium:  0.20,
      copper:     0.15,
      other:      0.05
    }
  },

  // ── MATERIALS: GOLD ───────────────────────────────────────────────────────

  HRZ: {
    gics_sub_industry: 'Gold',
    narrative_model: 'MATERIALS_GOLD',
    narrative_weights: { macro: 0.05, sector: 0.65, idio: 0.30 },
    commodity_overlay: {
      primary_commodity: 'gold_aud',
      breakeven: 2800,
      breakeven_unit: 'AUD/oz',
      breakeven_source: 'DFS estimate (pre-production)',
      breakeven_confidence: 'LOW',
      breakeven_note: 'HRZ is pre-production. AISC is estimated from DFS. Actual costs unknown until first pour.',
      secondary_factor: 'aud_usd',
      secondary_note: 'AUD weakness amplifies gold tailwind for AUD-cost producer',
      sensitivity: '+A$100/oz gold ≈ significant FCF uplift (pre-production — sensitivity estimate only)',
      thresholds: {
        strong_bearish: { below: 2200,             position_score: -80 },
        bearish:        { range: [2200, 2800],      position_score: -40 },
        neutral:        { range: [2800, 3500],      position_score:   0 },
        bullish:        { range: [3500, 4500],      position_score:  50 },
        strong_bullish: { above: 4500,              position_score:  75 }
      }
    }
  },

  // ── FINANCIALS: MAJOR BANKS ───────────────────────────────────────────────

  CBA: {
    gics_sub_industry: 'Diversified Banks',
    narrative_model: 'FINANCIALS_MAJOR_BANKS',
    narrative_weights: { macro: 0.25, sector: 0.35, idio: 0.40 },
    commodity_overlay: null
  },

  NAB: {
    gics_sub_industry: 'Diversified Banks',
    narrative_model: 'FINANCIALS_MAJOR_BANKS',
    narrative_weights: { macro: 0.25, sector: 0.35, idio: 0.40 },
    commodity_overlay: null
  },

  // ── FINANCIALS: ASSET MANAGEMENT ─────────────────────────────────────────

  MQG: {
    gics_sub_industry: 'Diversified Financial Services',
    narrative_model: 'FINANCIALS_DIVERSIFIED_ASSET_MGMT',
    narrative_weights: { macro: 0.25, sector: 0.20, idio: 0.55 },
    commodity_overlay: null
  },

  // ── REAL ESTATE ───────────────────────────────────────────────────────────

  GMG: {
    gics_sub_industry: 'Industrial REITs',
    narrative_model: 'REIT_INDUSTRIAL',
    narrative_weights: { macro: 0.20, sector: 0.30, idio: 0.50 },
    commodity_overlay: null
  },

  DXS: {
    gics_sub_industry: 'Office REITs',
    narrative_model: 'REIT_OFFICE',
    narrative_weights: { macro: 0.25, sector: 0.25, idio: 0.50 },
    commodity_overlay: null
  },

  // ── INFORMATION TECHNOLOGY: SAAS ─────────────────────────────────────────

  XRO: {
    gics_sub_industry: 'Application Software',
    narrative_model: 'IT_SOFTWARE_SAAS',
    narrative_weights: { macro: 0.20, sector: 0.25, idio: 0.55 },
    commodity_overlay: null
  },

  WTC: {
    gics_sub_industry: 'Application Software',
    narrative_model: 'IT_SOFTWARE_SAAS',
    narrative_weights: { macro: 0.20, sector: 0.20, idio: 0.60 },
    commodity_overlay: null
  },

  OCL: {
    gics_sub_industry: 'IT Consulting & Other Services',
    narrative_model: 'IT_SOFTWARE_SAAS',
    narrative_weights: { macro: 0.15, sector: 0.10, idio: 0.75 },
    commodity_overlay: null
  },

  // ── HEALTH CARE ───────────────────────────────────────────────────────────

  PME: {
    gics_sub_industry: 'Health Care Equipment',
    narrative_model: 'HEALTHCARE_DEVICES_MEDTECH',
    narrative_weights: { macro: 0.15, sector: 0.05, idio: 0.80 },
    commodity_overlay: null
  },

  CSL: {
    gics_sub_industry: 'Biotechnology',
    narrative_model: 'HEALTHCARE_PHARMA_BIOTECH',
    narrative_weights: { macro: 0.15, sector: 0.10, idio: 0.75 },
    commodity_overlay: null
  },

  SIG: {
    gics_sub_industry: 'Health Care Distributors',
    narrative_model: 'HEALTHCARE_PHARMACY',
    narrative_weights: { macro: 0.15, sector: 0.15, idio: 0.70 },
    commodity_overlay: null
  },

  // ── INDUSTRIALS: DEFENCE ─────────────────────────────────────────────────

  DRO: {
    gics_sub_industry: 'Aerospace & Defence',
    narrative_model: 'INDUSTRIALS_DEFENCE',
    narrative_weights: { macro: 0.10, sector: 0.15, idio: 0.75 },
    commodity_overlay: null
  },

  // ── CONSUMER DISCRETIONARY: QSR ──────────────────────────────────────────

  GYG: {
    gics_sub_industry: 'Restaurants',
    narrative_model: 'CONSUMER_DISC_RESTAURANTS_QSR',
    narrative_weights: { macro: 0.15, sector: 0.10, idio: 0.75 },
    commodity_overlay: null
  },

  RFG: {
    gics_sub_industry: 'Restaurants',
    narrative_model: 'CONSUMER_DISC_RESTAURANTS_QSR',
    narrative_weights: { macro: 0.15, sector: 0.10, idio: 0.75 },
    commodity_overlay: null
  },

  // ── CONSUMER STAPLES: GROCERY ─────────────────────────────────────────────

  WOW: {
    gics_sub_industry: 'Food Retail',
    narrative_model: 'CONSUMER_STAPLES_GROCERY',
    narrative_weights: { macro: 0.20, sector: 0.10, idio: 0.70 },
    commodity_overlay: null
  }
};

// ── Validate weights sum to 1.0 ───────────────────────────────────────────────

function validateWeights(ticker, w) {
  const sum = Math.round((w.macro + w.sector + w.idio) * 1000) / 1000;
  if (Math.abs(sum - 1.0) > 0.001) {
    throw new Error(`${ticker}: weights sum to ${sum}, not 1.0`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 1.2 — Patch stock configs ===\n');

  // Validate all patches first (fail fast before touching files)
  for (const [ticker, patch] of Object.entries(PATCHES)) {
    validateWeights(ticker, patch.narrative_weights);
  }
  console.log('  All weight sums validated.\n');

  const tickers = Object.keys(PATCHES).sort();
  let ok = 0;
  let skipped = 0;
  let errors = 0;

  for (const ticker of tickers) {
    const filePath = path.join(STOCKS_DIR, `${ticker}.json`);

    if (!fs.existsSync(filePath)) {
      console.log(`  [SKIP]  ${ticker} — file not found at ${filePath}`);
      skipped++;
      continue;
    }

    let existing;
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      console.error(`  [ERROR] ${ticker} — could not parse JSON: ${e.message}`);
      errors++;
      continue;
    }

    const patch = PATCHES[ticker];

    // Merge: add new fields, preserve all existing fields.
    const updated = {
      ...existing,
      gics_sub_industry:       patch.gics_sub_industry,
      narrative_model:          patch.narrative_model,
      narrative_weights:        patch.narrative_weights,
      commodity_overlay:        patch.commodity_overlay,
      revenue_commodity_split:  patch.revenue_commodity_split ?? existing.revenue_commodity_split ?? null
    };

    // Remove revenue_commodity_split key entirely if null (keep JSON clean)
    if (updated.revenue_commodity_split === null) {
      delete updated.revenue_commodity_split;
    }

    try {
      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
      console.log(`  [OK]    ${ticker.padEnd(4)}  ${patch.narrative_model}`);
      ok++;
    } catch (e) {
      console.error(`  [ERROR] ${ticker} — could not write: ${e.message}`);
      errors++;
    }
  }

  console.log(`\nDone: ${ok} patched, ${skipped} skipped, ${errors} errors.`);
  if (errors > 0) process.exit(1);
}

main();
