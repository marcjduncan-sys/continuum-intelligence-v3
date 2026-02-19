#!/usr/bin/env node
/**
 * calc-composite-sentiment.js
 *
 * Continuum Intelligence — Phase 2.4: Composite Sentiment Calculator
 * Per MASTER_IMPLEMENTATION_INSTRUCTIONS.md
 *
 * Reads data/macro-signal.json, data/sector-signals.json,
 * data/idio-signals.json. For each stock, computes the four-component
 * composite per ERRATA_002_IDIO_AMPLIFICATION.md:
 *
 *   Overall_Sentiment = (w_macro × Macro) + (w_sector × Sector)
 *                     + (w_tech × Tech) + (w_company × Company)
 *
 * w_tech = 0.10 reserved for TA agent (Tech_Signal = 0 until live).
 * External cap: w_macro + w_sector + w_tech ≤ 0.40
 * Research floor: w_company ≥ 0.60
 *
 * Writes signal values back into each stock's today history entry AND
 * onto the stock JSON (for the display layer).
 *
 * Usage:
 *   node scripts/calc-composite-sentiment.js [--date YYYY-MM-DD] [--dry-run] [--verbose]
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT          = path.join(__dirname, '..');
const MACRO_SIG     = path.join(ROOT, 'data', 'macro-signal.json');
const SECTOR_SIG    = path.join(ROOT, 'data', 'sector-signals.json');
const IDIO_SIG      = path.join(ROOT, 'data', 'idio-signals.json');
const TICKERS_PATH  = path.join(ROOT, 'data', 'config', 'tickers.json');
const STOCKS_DIR    = path.join(ROOT, 'data', 'stocks');

const args      = process.argv.slice(2);
const dryRun    = args.includes('--dry-run');
const verbose   = args.includes('--verbose');
const dateIdx   = args.indexOf('--date');
const dateArg   = dateIdx !== -1 && args[dateIdx + 1] ? args[dateIdx + 1] : null;

// ── Display label mapping ────────────────────────────────────────────────────

function sentimentLabel(score) {
  // Thresholds per ERRATA_002 composite display mapping
  if (score >  25) return 'STRONG UPSIDE';
  if (score >   8) return 'UPSIDE';
  if (score >  -8) return 'NEUTRAL';
  if (score > -25) return 'DOWNSIDE';
  return 'STRONG DOWNSIDE';
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Load signal inputs
  let macroSigData, sectorSigData, idioSigData;
  try {
    macroSigData  = JSON.parse(fs.readFileSync(MACRO_SIG,  'utf8'));
    sectorSigData = JSON.parse(fs.readFileSync(SECTOR_SIG, 'utf8'));
    idioSigData   = JSON.parse(fs.readFileSync(IDIO_SIG,   'utf8'));
  } catch (e) {
    console.error('[calc-composite-sentiment] Cannot read signal files:', e.message);
    process.exit(1);
  }

  const today      = dateArg || new Date().toISOString().split('T')[0];
  const macroSignal = macroSigData.macro_signal;

  const tickerConfig = JSON.parse(fs.readFileSync(TICKERS_PATH, 'utf8'));
  const tickers = Object.keys(tickerConfig.tickers)
    .filter(t => tickerConfig.tickers[t].status === 'active');

  let updated = 0;

  console.log('[calc-composite-sentiment] Date:', today, '| Macro_Signal:', macroSignal);

  for (const ticker of tickers) {
    const stockPath   = path.join(STOCKS_DIR, ticker + '.json');
    const historyPath = path.join(STOCKS_DIR, ticker + '-history.json');

    if (!fs.existsSync(stockPath) || !fs.existsSync(historyPath)) continue;

    let stock, historyData;
    try {
      stock       = JSON.parse(fs.readFileSync(stockPath,   'utf8'));
      historyData = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
    } catch (e) {
      console.warn('[calc-composite-sentiment] Cannot read', ticker, ':', e.message);
      continue;
    }

    // Get signals
    const sectorEntry = sectorSigData.signals && sectorSigData.signals[ticker];
    const idioEntry   = idioSigData.signals   && idioSigData.signals[ticker];

    if (!sectorEntry || !idioEntry) {
      console.warn('[calc-composite-sentiment] Missing signals for', ticker, '— skipping');
      continue;
    }

    const sectorSignal = sectorEntry.sector_signal;
    const idioSignal   = idioEntry.idio_signal;

    // Four-component weights from stock config (ERRATA_002)
    // Falls back gracefully: 'company' replaces legacy 'idio', tech defaults 0.10
    const weights   = stock.narrative_weights || { macro: 0.05, sector: 0.25, tech: 0.10, company: 0.60 };
    const wMacro    = weights.macro   || 0;
    const wSector   = weights.sector  || 0;
    const wTech     = weights.tech    !== undefined ? weights.tech : 0.10;
    const wCompany  = weights.company || weights.idio || 0;  // 'idio' is legacy alias

    // Tech_Signal = 0 until TA agent is live (weight reserved, contributes nothing)
    const techSignal    = 0;
    const companySignal = idioSignal;  // Company layer = idio signal (sqrt-amplified)

    // Four-component composite
    const raw     = (wMacro * macroSignal)
                  + (wSector * sectorSignal)
                  + (wTech  * techSignal)
                  + (wCompany * companySignal);
    const overall = Math.max(-100, Math.min(100, Math.round(raw)));
    const label   = sentimentLabel(overall);

    const macroCont   = Math.round(wMacro   * macroSignal);
    const sectorCont  = Math.round(wSector  * sectorSignal);
    const techCont    = Math.round(wTech    * techSignal);     // always 0 until TA live
    const companyCont = Math.round(wCompany * companySignal);

    if (verbose) {
      console.log(' ', ticker.padEnd(6),
        '| M:', String(macroSignal).padStart(4),
        'S:', String(sectorSignal).padStart(4),
        'C:', String(companySignal).padStart(4),
        '| w:', wMacro.toFixed(2), wSector.toFixed(2), wTech.toFixed(2), wCompany.toFixed(2),
        '→', String(overall).padStart(4), label);
    }

    const signalPayload = {
      macro_signal:         macroSignal,
      sector_signal:        sectorSignal,
      tech_signal:          techSignal,
      idio_signal:          idioSignal,   // kept for backward compat
      company_signal:       companySignal,
      overall_sentiment:    overall,
      sentiment_label:      label,
      macro_contribution:   macroCont,
      sector_contribution:  sectorCont,
      tech_contribution:    techCont,
      company_contribution: companyCont,
      idio_contribution:    companyCont   // backward compat alias
    };

    // ── Write to today's history entry ──────────────────────────────────────
    const history = historyData.history;
    if (!history) continue;

    // Find today's entry (or most recent if today not yet logged)
    let entryIdx = history.findIndex(e => e.date === today);
    if (entryIdx === -1) entryIdx = history.length - 1;

    if (entryIdx >= 0) {
      const entry = history[entryIdx];
      entry.macro_signal         = macroSignal;
      entry.sector_signal        = sectorSignal;
      entry.tech_signal          = techSignal;
      entry.idio_signal          = idioSignal;          // backward compat
      entry.company_signal       = companySignal;
      entry.overall_sentiment    = overall;
      entry.sentiment_label      = label;
      entry.macro_contribution   = macroCont;
      entry.sector_contribution  = sectorCont;
      entry.tech_contribution    = techCont;
      entry.company_contribution = companyCont;
      entry.idio_contribution    = companyCont;         // backward compat alias
    }

    // ── Write to stock JSON (for display layer) ─────────────────────────────
    stock.three_layer_signal = {
      date:                today,
      ...signalPayload,
      sector_detail:       sectorEntry.detail,
      idio_detail:         idioEntry.detail
    };

    if (!dryRun) {
      fs.writeFileSync(historyPath, JSON.stringify(historyData, null, 2), 'utf8');
      fs.writeFileSync(stockPath,   JSON.stringify(stock,       null, 2), 'utf8');
    }

    updated++;
    console.log(' ', ticker.padEnd(6),
      '| Sentiment:', String(overall).padStart(4), label,
      `(M:${macroCont} S:${sectorCont} T:${techCont} C:${companyCont})`);
  }

  console.log('[calc-composite-sentiment] Updated', updated, 'stocks',
    dryRun ? '(dry-run)' : '');
}

module.exports = { main, sentimentLabel };
main();
