#!/usr/bin/env node
/**
 * calc-macro-signal.js
 *
 * Continuum Intelligence — Phase 2.1: Macro Signal Calculator
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md
 *
 * Reads data/macro-factors.json, produces a single Macro_Signal (-100..+100).
 * The same value applies to ALL stocks on any given day.
 * Writes result to data/macro-signal.json.
 *
 * Usage:
 *   node scripts/calc-macro-signal.js [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT         = path.join(__dirname, '..');
const MACRO_PATH   = path.join(ROOT, 'data', 'macro-factors.json');
const OUTPUT_PATH  = path.join(ROOT, 'data', 'macro-signal.json');

const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const verbose = args.includes('--verbose');

// ── Score lookup helpers ─────────────────────────────────────────────────────

function asx200Score(change20d) {
  // change20d is a decimal fraction (0.03 = +3%)
  if (change20d === null || change20d === undefined) return 0;
  const pct = change20d * 100;
  if (pct >  5) return  30;
  if (pct >  2) return  15;
  if (pct > -2) return   0;
  if (pct > -5) return -15;
  return -30;
}

function vixScore(vix) {
  if (vix === null || vix === undefined) return 0;
  if (vix < 15) return  20;
  if (vix < 20) return  10;
  if (vix < 25) return   0;
  if (vix < 35) return -15;
  return -30;
}

function audScore(change20d) {
  if (change20d === null || change20d === undefined) return 0;
  const pct = change20d * 100;
  if (pct >  3) return  15;
  if (pct > -3) return   0;
  return -15;
}

function rbaScore(trajectory) {
  // trajectory is one of: 'cutting_aggressively', 'cutting_gradually',
  //                        'on_hold', 'hiking'
  if (!trajectory) return 0;
  switch (trajectory) {
    case 'cutting_aggressively': return  15;
    case 'cutting_gradually':    return  10;
    case 'on_hold':              return   0;
    case 'hiking':               return -15;
    default:                     return   0;
  }
}

function chinaScore(pmi) {
  if (pmi === null || pmi === undefined) return 0;
  if (pmi > 52) return  20;
  if (pmi > 50) return  10;
  if (pmi > 48) return -10;
  return -25;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  let macro;
  try {
    macro = JSON.parse(fs.readFileSync(MACRO_PATH, 'utf8'));
  } catch (e) {
    console.error('[calc-macro-signal] Cannot read macro-factors.json:', e.message);
    process.exit(1);
  }

  const m = macro.market    || {};
  const r = macro.rates     || {};
  const f = macro.fx        || {};
  const x = macro.macro     || {};

  const asx200  = m.asx200  || {};
  const vix     = m.vix     || {};
  const aud     = f.aud_usd || {};

  // Component scores
  const s_asx200 = asx200Score(asx200.change_20d);
  const s_vix    = vixScore(vix.close);
  const s_aud    = audScore(aud.change_20d);
  const s_rba    = rbaScore(r.rba_trajectory);
  const s_china  = chinaScore(x.china_mfg_pmi);

  // Which components have live data vs defaulted to 0
  const nulled = [];
  if (asx200.change_20d == null)   nulled.push('asx200_20d');
  if (vix.close == null)           nulled.push('vix');
  if (aud.change_20d == null)      nulled.push('aud_20d');
  if (!r.rba_trajectory)           nulled.push('rba_trajectory');
  if (x.china_mfg_pmi == null)     nulled.push('china_pmi');

  const raw = s_asx200 + s_vix + s_aud + s_rba + s_china;
  const signal = Math.max(-100, Math.min(100, raw));

  if (verbose) {
    console.log('[calc-macro-signal]');
    console.log('  ASX200 20d:', (asx200.change_20d != null ? (asx200.change_20d*100).toFixed(2)+'%' : 'null'), '→', s_asx200);
    console.log('  VIX close:', vix.close ?? 'null', '→', s_vix);
    console.log('  AUD 20d:', (aud.change_20d != null ? (aud.change_20d*100).toFixed(2)+'%' : 'null'), '→', s_aud);
    console.log('  RBA trajectory:', r.rba_trajectory ?? 'null', '→', s_rba);
    console.log('  China PMI:', x.china_mfg_pmi ?? 'null', '→', s_china);
    console.log('  Raw sum:', raw, '→ capped:', signal);
    if (nulled.length) console.log('  Null inputs (scored 0):', nulled.join(', '));
  }

  const output = {
    date:        macro.date,
    computed_at: new Date().toISOString(),
    macro_signal: signal,
    components: {
      asx200_score:  s_asx200,
      vix_score:     s_vix,
      aud_score:     s_aud,
      rba_score:     s_rba,
      china_score:   s_china
    },
    inputs: {
      asx200_20d:      asx200.change_20d  ?? null,
      vix_close:       vix.close          ?? null,
      aud_20d:         aud.change_20d     ?? null,
      rba_trajectory:  r.rba_trajectory   ?? null,
      china_pmi:       x.china_mfg_pmi    ?? null
    },
    null_inputs: nulled
  };

  if (!dryRun) {
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  }

  console.log('[calc-macro-signal] Macro_Signal =', signal,
    '| components:', s_asx200, s_vix, s_aud, s_rba, s_china,
    dryRun ? '(dry-run)' : '→ data/macro-signal.json');

  return signal;
}

module.exports = { main };
main();
