#!/usr/bin/env node
/**
 * seed-valuation-anchors.js
 * One-time seed script: writes valuation_anchors to each data/stocks/TICKER.json.
 * Run manually: node scripts/seed-valuation-anchors.js
 * Safe to re-run — overwrites anchors section only.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const STOCKS_DIR = path.join(__dirname, '..', 'data', 'stocks');

// ─── ASX 200 market-wide multiple benchmarks (Feb 2026) ──────────────────────
const MARKET_MULTIPLES = {
  pe_forward:  { median: 19.0, p25: 14.0, p75: 25.0 },
  ev_ebitda:   { median: 11.0, p25:  7.0, p75: 16.0 },
  pb:          { median:  2.2, p25:  1.4, p75:  3.2 },
  ev_revenue:  { median:  2.0, p25:  1.0, p75:  4.0 }
};

// ─── Per-stock anchor data ────────────────────────────────────────────────────
// eps_forward/eps_trailing: in AUD (converted where reporting currency is USD)
// ebitda_forward: in A$M
// revenue_forward: in A$M  (for ev_revenue stocks)
// book_value_per_share: in A$
// shares_outstanding: in millions
// net_debt: in A$M (negative = net cash)
// sector_multiples: sector peer group medians/percentiles
const ANCHORS = {

  WOW: {
    eps_forward:         { value: 1.336, period: 'FY26E', source: 'company_guidance', updated: '2026-02-15' },
    eps_trailing:        { value: 0.858, period: 'FY25A', source: 'annual_report',    updated: '2026-02-15' },
    ebitda_forward:      { value: 3800,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  1219,
    net_debt:            9200,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 22.0, p25: 17.0, p75: 28.0 },
      ev_ebitda:   { median: 11.0, p25:  8.0, p75: 15.0 },
      pb:          { median:  3.5, p25:  2.5, p75:  5.0 }
    }
  },

  XRO: {
    eps_forward:         null,
    eps_trailing:        { value: 1.899, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 550,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_forward:     { value: 2000,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  154,
    net_debt:            -400,
    primary_multiple:    'pe_trailing',
    secondary_multiple:  'ev_revenue',
    sector_multiples: {
      pe_forward:  { median: 45.0, p25: 30.0, p75: 65.0 },
      ev_revenue:  { median:  8.0, p25:  5.0, p75: 14.0 },
      pb:          { median:  6.0, p25:  4.0, p75: 10.0 }
    }
  },

  WTC: {
    eps_forward:         null,
    eps_trailing:        { value: 0.888, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 340,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_forward:     { value: 780,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  381,
    net_debt:            -700,
    primary_multiple:    'pe_trailing',
    secondary_multiple:  'ev_revenue',
    sector_multiples: {
      pe_forward:  { median: 45.0, p25: 30.0, p75: 65.0 },
      ev_revenue:  { median:  8.0, p25:  5.0, p75: 14.0 },
      pb:          { median:  6.0, p25:  4.0, p75: 10.0 }
    }
  },

  DRO: {
    eps_forward:         null,
    eps_trailing:        null,
    ebitda_forward:      null,
    revenue_forward:     { value: 280,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_trailing:    { value: 145,  unit: 'A$M', period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 0.38, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  917,
    net_debt:            -204,
    primary_multiple:    'ev_revenue',
    secondary_multiple:  'pe_forward',
    sector_multiples: {
      ev_revenue:  { median:  5.0, p25: 3.0, p75:  8.0 },
      pe_forward:  { median: 25.0, p25: 18.0, p75: 35.0 },
      pb:          { median:  3.0, p25: 2.0, p75:  5.0 }
    }
  },

  PME: {
    eps_forward:         null,
    eps_trailing:        { value: 1.021, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 175,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_forward:     { value: 240,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  112,
    net_debt:            -300,
    primary_multiple:    'pe_trailing',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 30.0, p25: 22.0, p75: 45.0 },
      ev_ebitda:   { median: 18.0, p25: 12.0, p75: 28.0 },
      pb:          { median:  5.0, p25:  3.0, p75:  8.0 }
    }
  },

  GYG: {
    eps_forward:         null,
    eps_trailing:        { value: 0.122, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 95,    unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_forward:     { value: 560,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  102,
    net_debt:            50,
    primary_multiple:    'pe_trailing',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 22.0, p25: 16.0, p75: 30.0 },
      ev_ebitda:   { median: 10.0, p25:  7.0, p75: 14.0 },
      pb:          { median:  3.5, p25:  2.5, p75:  5.5 }
    }
  },

  CSL: {
    eps_forward:         { value: 11.27, period: 'FY26E', source: 'consensus', updated: '2026-02-15' },
    eps_trailing:        { value: 10.15, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 5500,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  483,
    net_debt:            12000,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 28.0, p25: 20.0, p75: 40.0 },
      ev_ebitda:   { median: 16.0, p25: 10.0, p75: 24.0 },
      pb:          { median:  5.0, p25:  3.0, p75:  8.0 }
    }
  },

  MQG: {
    eps_forward:         { value: 11.17, period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 10.24, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      null,
    book_value_per_share: { value: 69.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  366,
    net_debt:            null,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'pb',
    sector_multiples: {
      pe_forward:  { median: 20.0, p25: 15.0, p75: 28.0 },
      pb:          { median:  3.5, p25:  2.5, p75:  5.0 },
      ev_ebitda:   { median: 12.0, p25:  8.0, p75: 18.0 }
    }
  },

  GMG: {
    eps_forward:         { value: 1.300, period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 0.849, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 1800,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 14.5, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  2062,
    net_debt:            8000,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'pb',
    sector_multiples: {
      pe_forward:  { median: 22.0, p25: 16.0, p75: 30.0 },
      pb:          { median:  1.4, p25:  0.9, p75:  1.9 },
      ev_ebitda:   { median: 18.0, p25: 13.0, p75: 25.0 }
    }
  },

  WDS: {
    eps_forward:         { value: 1.623, period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 2.216, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 8500,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  1899,
    net_debt:            25000,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pe_forward',
    sector_multiples: {
      ev_ebitda:   { median:  8.0, p25:  6.0, p75: 11.0 },
      pe_forward:  { median: 12.0, p25:  9.0, p75: 17.0 },
      pb:          { median:  1.5, p25:  1.0, p75:  2.2 }
    }
  },

  SIG: {
    eps_forward:         { value: 0.0683, period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 0.0515, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 330,    unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  11540,
    net_debt:            -600,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 22.0, p25: 16.0, p75: 30.0 },
      ev_ebitda:   { median:  9.0, p25:  6.0, p75: 13.0 },
      pb:          { median:  2.0, p25:  1.3, p75:  3.0 }
    }
  },

  FMG: {
    eps_forward:         null,
    eps_trailing:        { value: 1.633, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 8000,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 12.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  3203,
    net_debt:            4000,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pb',
    sector_multiples: {
      ev_ebitda:   { median:  7.0, p25:  5.0, p75: 10.0 },
      pb:          { median:  2.0, p25:  1.3, p75:  3.0 },
      pe_forward:  { median: 13.0, p25:  9.0, p75: 18.0 }
    }
  },

  DXS: {
    eps_forward:         null,
    eps_trailing:        { value: 0.15,  period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 400,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 6.50, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  1080,
    net_debt:            4500,
    primary_multiple:    'pb',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pb:          { median:  0.9, p25:  0.7, p75:  1.2 },
      ev_ebitda:   { median: 16.0, p25: 12.0, p75: 22.0 },
      pe_forward:  { median: 20.0, p25: 14.0, p75: 28.0 }
    }
  },

  NAB: {
    eps_forward:         null,
    eps_trailing:        { value: 2.21, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      null,
    book_value_per_share: { value: 28.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  3056,
    net_debt:            null,
    primary_multiple:    'pb',
    secondary_multiple:  'pe_trailing',
    sector_multiples: {
      pb:          { median:  1.8, p25:  1.3, p75:  2.5 },
      pe_forward:  { median: 16.0, p25: 12.0, p75: 20.0 },
      ev_ebitda:   { median: 10.0, p25:  7.0, p75: 14.0 }
    }
  },

  BHP: {
    eps_forward:         null,
    eps_trailing:        null,
    ebitda_forward:      { value: 22000, unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 27.5, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  5078,
    net_debt:            7000,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pb',
    sector_multiples: {
      ev_ebitda:   { median:  7.0, p25:  5.0, p75: 10.0 },
      pb:          { median:  2.0, p25:  1.3, p75:  3.0 },
      pe_forward:  { median: 13.0, p25:  9.0, p75: 18.0 }
    }
  },

  HRZ: {
    eps_forward:         null,
    eps_trailing:        null,
    ebitda_forward:      null,
    book_value_per_share: { value: 0.65, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  206,
    net_debt:            -80,
    primary_multiple:    'pb',
    secondary_multiple:  'ev_revenue',
    sector_multiples: {
      pb:          { median:  2.0, p25:  1.3, p75:  3.2 },
      ev_ebitda:   { median:  8.0, p25:  5.0, p75: 12.0 },
      pe_forward:  { median: 18.0, p25: 12.0, p75: 28.0 }
    }
  },

  OCL: {
    eps_forward:         null,
    eps_trailing:        null,
    ebitda_forward:      { value: 45,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  96,
    net_debt:            -50,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pe_forward',
    sector_multiples: {
      pe_forward:  { median: 22.0, p25: 16.0, p75: 30.0 },
      ev_ebitda:   { median: 12.0, p25:  8.0, p75: 18.0 },
      pb:          { median:  2.5, p25:  1.5, p75:  3.5 }
    }
  },

  RFG: {
    eps_forward:         null,
    eps_trailing:        null,
    ebitda_forward:      { value: 25,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  63,
    net_debt:            100,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pe_forward',
    sector_multiples: {
      pe_forward:  { median: 20.0, p25: 14.0, p75: 28.0 },
      ev_ebitda:   { median:  9.0, p25:  6.0, p75: 13.0 },
      pb:          { median:  2.5, p25:  1.5, p75:  3.5 }
    }
  },

  QBE: {
    eps_forward:         { value: 2.00, period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 1.81, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      null,
    book_value_per_share: { value: 16.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  1387,
    net_debt:            null,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'pb',
    sector_multiples: {
      pe_forward:  { median: 14.0, p25: 10.0, p75: 18.0 },
      pb:          { median:  1.3, p25:  1.0, p75:  1.7 },
      ev_ebitda:   { median:  9.0, p25:  6.0, p75: 13.0 }
    }
  },

  ASB: {
    eps_forward:         { value: 0.27,  period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 0.234, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      null,
    revenue_forward:     { value: 950,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    revenue_trailing:    { value: 845,  unit: 'A$M', period: 'FY25A', source: 'company',   updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  405,
    net_debt:            -200,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_revenue',
    sector_multiples: {
      pe_forward:  { median: 25.0, p25: 18.0, p75: 35.0 },
      ev_revenue:  { median:  3.0, p25:  2.0, p75:  5.0 },
      pb:          { median:  3.0, p25:  2.0, p75:  5.0 }
    }
  },

  BRG: {
    eps_forward:         { value: 1.05,  period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 0.957, period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      { value: 250,   unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  142,
    net_debt:            200,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 20.0, p25: 14.0, p75: 28.0 },
      ev_ebitda:   { median:  9.0, p25:  6.0, p75: 13.0 },
      pb:          { median:  3.0, p25:  2.0, p75:  4.5 }
    }
  },

  CBA: {
    eps_forward:         { value: 6.80,  period: 'FY26E', source: 'consensus',    updated: '2026-02-15' },
    eps_trailing:        { value: 6.34,  period: 'FY25A', source: 'annual_report', updated: '2026-02-15' },
    ebitda_forward:      null,
    book_value_per_share: { value: 50.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  1610,
    net_debt:            null,
    primary_multiple:    'pb',
    secondary_multiple:  'pe_forward',
    sector_multiples: {
      pb:          { median:  1.8, p25:  1.3, p75:  2.5 },
      pe_forward:  { median: 16.0, p25: 12.0, p75: 20.0 },
      ev_ebitda:   { median: 10.0, p25:  7.0, p75: 14.0 }
    }
  },

  RIO: {
    eps_forward:         null,
    eps_trailing:        { value: 8.50, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    ebitda_forward:      { value: 20000, unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: { value: 55.0, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    shares_outstanding:  1571,
    net_debt:            6200,
    primary_multiple:    'ev_ebitda',
    secondary_multiple:  'pb',
    sector_multiples: {
      ev_ebitda:   { median:  7.0, p25:  5.0, p75: 10.0 },
      pb:          { median:  2.0, p25:  1.3, p75:  3.0 },
      pe_forward:  { median: 13.0, p25:  9.0, p75: 18.0 }
    }
  },

  WOR: {
    eps_forward:         { value: 1.10, period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    eps_trailing:        { value: 0.95, period: 'FY25A', source: 'estimate', updated: '2026-02-15' },
    ebitda_forward:      { value: 600,  unit: 'A$M', period: 'FY26E', source: 'estimate', updated: '2026-02-15' },
    book_value_per_share: null,
    shares_outstanding:  682,
    net_debt:            2000,
    primary_multiple:    'pe_forward',
    secondary_multiple:  'ev_ebitda',
    sector_multiples: {
      pe_forward:  { median: 18.0, p25: 13.0, p75: 24.0 },
      ev_ebitda:   { median:  9.0, p25:  6.0, p75: 13.0 },
      pb:          { median:  2.0, p25:  1.3, p75:  3.0 }
    }
  }

};

// ─── Apply anchors to each stock JSON ────────────────────────────────────────
let updated = 0;
let skipped = 0;

for (const [ticker, anchors] of Object.entries(ANCHORS)) {
  const fname = path.join(STOCKS_DIR, ticker + '.json');
  if (!fs.existsSync(fname)) {
    // Try with .AX suffix search — files are named by base ticker
    console.log(`[SKIP] No file for ${ticker} at ${fname}`);
    skipped++;
    continue;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(fname, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] Failed to parse ${fname}: ${e.message}`);
    skipped++;
    continue;
  }

  // Add market_multiples from the shared constant
  const anchorsWithMarket = Object.assign({}, anchors, {
    market_multiples: MARKET_MULTIPLES
  });

  data.valuation_anchors = anchorsWithMarket;

  fs.writeFileSync(fname, JSON.stringify(data, null, 2), 'utf8');
  console.log(`[OK] ${ticker} — anchors written (primary: ${anchors.primary_multiple})`);
  updated++;
}

console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);
