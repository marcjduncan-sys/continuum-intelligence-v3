#!/usr/bin/env node
/**
 * ingest-ta-signals.js — Phase 7.2: TA Signal Ingestion Interface
 *
 * Reads data/ta-signals/{TICKER}.json (written by external TA agent),
 * converts each signal into a structured evidence_item, and upserts it
 * into the stock's data/stocks/{TICKER}.json.
 *
 * Feature-flagged: set TA_SIGNALS_ENABLED=true env var to activate,
 * OR pass --force flag. Silently no-ops if disabled or no files present.
 *
 * TA signal schema (from DEV1_V2_TA_INTEGRATION.md):
 * {
 *   source: "ta_agent",
 *   ticker: "WOW",
 *   date: "2026-02-19T16:00:00+11:00",
 *   signals: [{
 *     type: "technical_signal",
 *     indicator: "RSI_14",
 *     value: 28.3,
 *     interpretation: "OVERSOLD",
 *     confidence: 0.82,
 *     description: "RSI(14) at 28.3, below 30 for 3 consecutive days",
 *     sentiment: "BULLISH",
 *     suggested_score_impact: 3
 *   }]
 * }
 *
 * Output: upserts into stock.evidence_items[] with:
 *   id, type, source, epistemic_tag, date, summary, diagnosticity,
 *   hypothesis_impact, decay, active
 *
 * Referenced by: MASTER_IMPLEMENTATION_INSTRUCTIONS.md Phase 7.2
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Config ───────────────────────────────────────────────────────────────────

const ROOT         = path.resolve(__dirname, '..');
const TA_DIR       = path.join(ROOT, 'data', 'ta-signals');
const STOCKS_DIR   = path.join(ROOT, 'data', 'stocks');

const ENABLED      = process.env.TA_SIGNALS_ENABLED === 'true' || process.argv.includes('--force');
const DRY_RUN      = process.argv.includes('--dry-run');

// Map TA confidence + sentiment to evidence diagnosticity
// High confidence (≥0.80) = MEDIUM; TA evidence is objective but not statutory
function taDiagnosticity(confidence) {
  if (confidence >= 0.80) return 'MEDIUM';
  if (confidence >= 0.55) return 'LOW';
  return 'LOW';
}

// Map TA sentiment string to hypothesis_impact object.
// Bullish TA supports T1 (upside), bearish supports T3 (downside).
// We can't know exact tiers without loading the stock, so we use direction keys.
function taHypothesisImpact(sentiment) {
  const s = (sentiment || '').toUpperCase();
  if (s === 'BULLISH') {
    return { bullish_tiers: 'CONSISTENT', bearish_tiers: 'INCONSISTENT' };
  }
  if (s === 'BEARISH') {
    return { bullish_tiers: 'INCONSISTENT', bearish_tiers: 'CONSISTENT' };
  }
  return { bullish_tiers: 'NEUTRAL', bearish_tiers: 'NEUTRAL' };
}

// Decay: TA signals are short-lived — full weight 7 days, half-life 14 days
const TA_DECAY = { full_weight_days: 7, half_life_days: 14 };

// ── Main ─────────────────────────────────────────────────────────────────────

function run() {
  if (!ENABLED) {
    console.log('[TA-Ingest] Feature flag off. Set TA_SIGNALS_ENABLED=true or pass --force to activate.');
    process.exit(0);
  }

  if (!fs.existsSync(TA_DIR)) {
    console.log('[TA-Ingest] No ta-signals directory — nothing to do.');
    process.exit(0);
  }

  const files = fs.readdirSync(TA_DIR).filter(f => f.endsWith('.json') && f !== '.gitkeep');
  if (files.length === 0) {
    console.log('[TA-Ingest] No signal files found in data/ta-signals/.');
    process.exit(0);
  }

  let totalIngested = 0;
  let totalSkipped  = 0;
  const errors = [];

  for (const file of files) {
    const taPath = path.join(TA_DIR, file);
    let taData;
    try {
      taData = JSON.parse(fs.readFileSync(taPath, 'utf8'));
    } catch (err) {
      errors.push(`${file}: parse error — ${err.message}`);
      continue;
    }

    const ticker = (taData.ticker || '').toUpperCase();
    if (!ticker) {
      errors.push(`${file}: missing ticker field`);
      continue;
    }

    const stockPath = path.join(STOCKS_DIR, ticker + '.json');
    if (!fs.existsSync(stockPath)) {
      console.warn(`[TA-Ingest] ${ticker}: stock file not found — skipping`);
      totalSkipped++;
      continue;
    }

    let stock;
    try {
      stock = JSON.parse(fs.readFileSync(stockPath, 'utf8'));
    } catch (err) {
      errors.push(`${ticker}: could not read stock JSON — ${err.message}`);
      continue;
    }

    if (!Array.isArray(stock.evidence_items)) stock.evidence_items = [];

    const signals = Array.isArray(taData.signals) ? taData.signals : [];
    const signalDate = taData.date || new Date().toISOString();

    let stockIngested = 0;

    for (const sig of signals) {
      // Build a deterministic ID: TICKER_INDICATOR_DATE(YYYYMMDD)
      const dateStub = signalDate.substring(0, 10).replace(/-/g, '');
      const indicator = (sig.indicator || 'TA').replace(/[^A-Z0-9_]/gi, '_').toUpperCase();
      const itemId = `${ticker}_TA_${indicator}_${dateStub}`;

      // Skip if already present with same ID (idempotent)
      const existingIdx = stock.evidence_items.findIndex(e => e.id === itemId);
      if (existingIdx >= 0) {
        totalSkipped++;
        continue;
      }

      // Mark old signals for same indicator as inactive (superseded)
      for (const existing of stock.evidence_items) {
        if (existing.id && existing.id.startsWith(`${ticker}_TA_${indicator}_`)) {
          existing.active = false;
        }
      }

      const confidence = typeof sig.confidence === 'number' ? sig.confidence : 0.60;
      const diagn      = taDiagnosticity(confidence);
      const impact     = taHypothesisImpact(sig.sentiment);

      const summary = sig.description
        || `${sig.indicator || 'TA'}: ${sig.interpretation || sig.value} — ${sig.sentiment || 'neutral'}`;

      const item = {
        id:            itemId,
        type:          'TECHNICAL_SIGNAL',
        source:        `TA Agent (${sig.indicator || 'unknown'})`,
        epistemic_tag: 'Objective (quantitative)',
        date:          signalDate,
        summary:       summary,
        diagnosticity: diagn,
        hypothesis_impact: impact,
        ta_meta: {
          indicator:          sig.indicator || null,
          value:              sig.value     !== undefined ? sig.value : null,
          interpretation:     sig.interpretation || null,
          confidence:         confidence,
          sentiment:          sig.sentiment  || null,
          suggested_score_impact: sig.suggested_score_impact || 0
        },
        decay:  TA_DECAY,
        active: true
      };

      stock.evidence_items.push(item);
      stockIngested++;
      totalIngested++;
      console.log(`[TA-Ingest] ${ticker}: ingested ${itemId} (${diagn}, ${sig.sentiment || 'NEUTRAL'})`);
    }

    if (stockIngested > 0 && !DRY_RUN) {
      try {
        fs.writeFileSync(stockPath, JSON.stringify(stock, null, 2));
      } catch (err) {
        errors.push(`${ticker}: could not write stock JSON — ${err.message}`);
      }
    }
  }

  // Summary
  console.log(`\n[TA-Ingest] Done — ${totalIngested} signals ingested, ${totalSkipped} skipped.`);
  if (DRY_RUN) console.log('[TA-Ingest] DRY RUN — no files written.');
  if (errors.length > 0) {
    console.error('[TA-Ingest] Errors:');
    errors.forEach(e => console.error('  ', e));
    process.exit(1);
  }
  process.exit(0);
}

run();
