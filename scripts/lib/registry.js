/**
 * registry.js — Central ticker registry reader
 *
 * Single source of truth for the Continuum Intelligence coverage universe.
 * All scripts import from here instead of maintaining hardcoded TICKERS arrays.
 *
 * Registry file: data/config/tickers.json
 */

const fs = require('fs');
const path = require('path');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'data', 'config', 'tickers.json');

function loadRegistry() {
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
}

/**
 * Get array of active ticker codes (e.g. ['XRO', 'CSL', 'WOW', ...])
 */
function getActiveTickers() {
  const reg = loadRegistry();
  return Object.keys(reg.tickers).filter(t => reg.tickers[t].status === 'active');
}

/**
 * Get array of active tickers with .AX suffix for Yahoo Finance
 * (e.g. ['XRO.AX', 'CSL.AX', 'WOW.AX', ...])
 */
function getTickersAX() {
  return getActiveTickers().map(t => t + '.AX');
}

/**
 * Get STOCK_CONFIG-shaped object for run-automated-analysis.js
 * Returns { XRO: { peakPrice, low52Week, high52Week, baseWeights, characteristics, hypothesisNames }, ... }
 */
function getAnalysisConfig() {
  const reg = loadRegistry();
  const config = {};
  for (const [ticker, meta] of Object.entries(reg.tickers)) {
    if (meta.status === 'active' && meta.analysisConfig) {
      config[ticker] = meta.analysisConfig;
    }
  }
  return config;
}

/**
 * Get full metadata for a single ticker
 */
function getTickerMeta(ticker) {
  const reg = loadRegistry();
  return reg.tickers[ticker] || null;
}

module.exports = {
  loadRegistry,
  getActiveTickers,
  getTickersAX,
  getAnalysisConfig,
  getTickerMeta,
  REGISTRY_PATH
};
