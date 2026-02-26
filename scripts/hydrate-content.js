#!/usr/bin/env node
/**
 * hydrate-content.js
 *
 * Continuum Intelligence — Server-Side Content Hydration
 *
 * After prices are updated by update-prices.js, this script:
 *   1. Reads current prices from per-ticker data/research/{ticker}.json files
 *   2. Reads REFERENCE_DATA anchors from data/reference.json
 *   3. Computes new derived metrics (market cap, P/E, drawdown, upside)
 *   4. Performs targeted text replacement in all string fields within the JSON
 *   5. Updates _anchors in data/reference.json to match new values
 *
 * This ensures the JSON data files stay current between deploys,
 * not just at client-side runtime.
 *
 * Usage: node scripts/hydrate-content.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const RESEARCH_DIR = path.join(ROOT, 'data', 'research');
const REFERENCE_PATH = path.join(ROOT, 'data', 'reference.json');

// --- JSON helpers ---

function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (e) { return null; }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Formatting (must match client-side ContinuumDynamics) ---

function fmtB(val) {
  if (val >= 100) return Math.round(val) + 'B';
  if (val >= 10)  return val.toFixed(1).replace(/\.0$/, '') + 'B';
  if (val >= 1)   return val.toFixed(1).replace(/\.0$/, '') + 'B';
  return Math.round(val * 1000) + 'M';
}

function fmtPE(val) {
  if (!val || !isFinite(val) || val <= 0) return null;
  if (val >= 100) return '~' + Math.round(val) + 'x';
  return val.toFixed(1).replace(/\.0$/, '') + 'x';
}

// --- Compute derived metrics ---

function computeMetrics(price, priceHistory, ref) {
  const h252 = priceHistory.slice(-252);
  const high52 = h252.length > 0 ? Math.max(...h252) : null;
  const low52 = h252.length > 0 ? Math.min(...h252) : null;

  const marketCap = ref.sharesOutstanding ? (price * ref.sharesOutstanding / 1000) : null;
  const trailingPE = ref.epsTrailing ? price / ref.epsTrailing : null;
  const forwardPE = ref.epsForward ? price / ref.epsForward : null;
  const divYield = ref.divPerShare ? (ref.divPerShare / price) * 100 : null;
  const drawdownFromHigh = high52 ? ((price - high52) / high52) * 100 : null;
  const upsideToTarget = ref.analystTarget ? ((ref.analystTarget - price) / price) * 100 : null;

  return {
    price, marketCap, trailingPE, forwardPE, divYield,
    high52, low52, drawdownFromHigh, upsideToTarget,
    marketCapStr: marketCap ? fmtB(marketCap) : null
  };
}

// --- Deep string replacement in JSON objects ---

/**
 * Recursively walk all string values in an object and replace oldStr with newStr.
 * Returns true if any replacement was made.
 */
function replaceInAllStrings(obj, oldStr, newStr) {
  if (!oldStr || !newStr || oldStr === newStr) return false;
  let changed = false;

  function walk(o, parentKey) {
    if (typeof o === 'string') {
      return o.split(oldStr).join(newStr);
    }
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        const result = walk(o[i], i);
        if (typeof o[i] === 'string' && result !== o[i]) {
          o[i] = result;
          changed = true;
        } else if (typeof o[i] === 'object' && o[i] !== null) {
          walk(o[i], i);
        }
      }
      return o;
    }
    if (typeof o === 'object' && o !== null) {
      for (const key of Object.keys(o)) {
        const val = o[key];
        if (typeof val === 'string') {
          const replaced = val.split(oldStr).join(newStr);
          if (replaced !== val) {
            o[key] = replaced;
            changed = true;
          }
        } else if (typeof val === 'object' && val !== null) {
          walk(val, key);
        }
      }
      return o;
    }
    return o;
  }

  walk(obj, null);
  return changed;
}

/**
 * Regex replacement across all string values in an object.
 */
function regexReplaceInAllStrings(obj, regex, replacerFn) {
  let changed = false;

  function walk(o) {
    if (typeof o === 'string') {
      const replaced = o.replace(regex, replacerFn);
      return { val: replaced, changed: replaced !== o };
    }
    if (Array.isArray(o)) {
      for (let i = 0; i < o.length; i++) {
        if (typeof o[i] === 'string') {
          const { val, changed: c } = walk(o[i]);
          if (c) { o[i] = val; changed = true; }
        } else if (typeof o[i] === 'object' && o[i] !== null) {
          walk(o[i]);
        }
      }
      return { val: o, changed };
    }
    if (typeof o === 'object' && o !== null) {
      for (const key of Object.keys(o)) {
        const val = o[key];
        if (typeof val === 'string') {
          const result = walk(val);
          if (result.changed) { o[key] = result.val; changed = true; }
        } else if (typeof val === 'object' && val !== null) {
          walk(val);
        }
      }
      return { val: o, changed };
    }
    return { val: o, changed: false };
  }

  walk(obj);
  return changed;
}

// --- Hydrate a single stock's JSON data ---

function hydrateStockData(stockData, anchors, computed, currency) {
  // Replace price
  if (anchors.price != null && computed.price !== anchors.price) {
    const oldPrice = Number(anchors.price).toFixed(2);
    const newPrice = computed.price.toFixed(2);
    replaceInAllStrings(stockData, currency + oldPrice, currency + newPrice);
  }

  // Replace market cap
  if (anchors.marketCapStr && computed.marketCapStr && computed.marketCapStr !== anchors.marketCapStr) {
    replaceInAllStrings(stockData, currency + anchors.marketCapStr, currency + computed.marketCapStr);
  }

  // Replace drawdown percentage in context
  if (anchors.drawdown != null && computed.drawdownFromHigh != null) {
    const oldDd = Math.round(Math.abs(anchors.drawdown));
    const newDd = Math.round(Math.abs(computed.drawdownFromHigh));
    if (oldDd !== newDd && oldDd > 0 && newDd > 0) {
      regexReplaceInAllStrings(stockData,
        new RegExp('(down |&darr;|-|sell-off[^\\d]*)' + oldDd + '%', 'gi'),
        function(match) { return match.replace(oldDd + '%', newDd + '%'); }
      );
    }
  }

  // Replace upside to target percentage in context
  if (anchors.upsideToTarget != null && computed.upsideToTarget != null) {
    const oldUp = Math.round(Math.abs(anchors.upsideToTarget));
    const newUp = Math.round(Math.abs(computed.upsideToTarget));
    if (oldUp !== newUp && oldUp > 0 && newUp > 0) {
      regexReplaceInAllStrings(stockData,
        new RegExp('(\\+|upside[^\\d]*|representing |\\()' + oldUp + '%', 'gi'),
        function(match) { return match.replace(oldUp + '%', newUp + '%'); }
      );
    }
  }

  // Replace P/E
  if (anchors.pe && computed.trailingPE) {
    const oldPE = fmtPE(anchors.pe);
    const newPE = fmtPE(computed.trailingPE);
    if (oldPE && newPE && oldPE !== newPE) {
      replaceInAllStrings(stockData, oldPE, newPE);
    }
  }

  // Replace forward P/E
  if (anchors.fwdPE && computed.forwardPE) {
    const oldFPE = fmtPE(anchors.fwdPE);
    const newFPE = fmtPE(computed.forwardPE);
    if (oldFPE && newFPE && oldFPE !== newFPE) {
      replaceInAllStrings(stockData, oldFPE, newFPE);
    }
  }

  return stockData;
}

// --- Update _anchors in reference data ---

function updateAnchors(refEntry, computed) {
  if (!refEntry || !refEntry._anchors) return;

  const anchors = refEntry._anchors;

  // Update price anchor
  anchors.price = computed.price;

  // Update marketCapStr anchor
  if (computed.marketCapStr) {
    anchors.marketCapStr = computed.marketCapStr;
  }

  // Update drawdown anchor
  if (computed.drawdownFromHigh != null && anchors.drawdown !== undefined) {
    anchors.drawdown = Math.round(Math.abs(computed.drawdownFromHigh));
  }

  // Update upside anchor
  if (computed.upsideToTarget != null && anchors.upsideToTarget !== undefined) {
    anchors.upsideToTarget = Math.round(Math.abs(computed.upsideToTarget));
  }

  // Update PE anchor
  if (computed.trailingPE) {
    anchors.pe = Math.round(computed.trailingPE * 10) / 10;
  }

  // Update forward PE anchor
  if (computed.forwardPE && anchors.fwdPE !== undefined) {
    anchors.fwdPE = Math.round(computed.forwardPE * 10) / 10;
  }

  // Update divYield anchor
  if (computed.divYield != null && anchors.divYield !== undefined) {
    anchors.divYield = Math.round(computed.divYield * 10) / 10;
  }
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('');
  console.log('='.repeat(62));
  console.log('  CONTINUUM INTELLIGENCE -- CONTENT HYDRATION ENGINE');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(62));
  console.log('');

  // Load reference data
  const refData = readJson(REFERENCE_PATH);
  if (!refData) {
    console.error('  [FATAL] Could not parse data/reference.json. Aborting.');
    process.exit(1);
  }

  // Get list of tickers from reference data keys
  const tickers = Object.keys(refData);
  let updatedCount = 0;
  let unchangedCount = 0;
  let refChanged = false;

  for (const ticker of tickers) {
    const ref = refData[ticker];
    if (!ref || !ref._anchors) { continue; }

    // Load per-ticker research JSON
    const researchPath = path.join(RESEARCH_DIR, `${ticker}.json`);
    const stockData = readJson(researchPath);
    if (!stockData) {
      console.log(`  [SKIP] ${ticker}: could not read data/research/${ticker}.json`);
      continue;
    }

    const price = stockData.price;
    if (!price) {
      console.log(`  [SKIP] ${ticker}: no price field in research JSON`);
      continue;
    }

    const priceHistory = stockData.priceHistory || [];
    const computed = computeMetrics(price, priceHistory, ref);

    const anchorPrice = ref._anchors.price;
    if (anchorPrice && Math.abs(price - anchorPrice) < 0.01) {
      console.log(`  [OK]   ${ticker}: price unchanged at ${price}`);
      unchangedCount++;
      continue;
    }

    console.log(`  [UPD]  ${ticker}: ${anchorPrice} -> ${price}` +
      (computed.marketCapStr ? ` | MCap: ${computed.marketCapStr}` : '') +
      (computed.drawdownFromHigh != null ? ` | DD: ${Math.round(computed.drawdownFromHigh)}%` : '') +
      (computed.upsideToTarget != null ? ` | Upside: ${Math.round(computed.upsideToTarget)}%` : ''));

    // Determine currency from stock data
    const currency = stockData.currency || 'A$';

    // Hydrate text content within the JSON
    hydrateStockData(stockData, ref._anchors, computed, currency);

    // Write updated research JSON
    if (!dryRun) {
      try {
        writeJson(researchPath, stockData);
      } catch (e) {
        console.error(`  [ERROR] Failed to write ${researchPath}: ${e.message}`);
      }
    }

    // Update anchors in reference data
    updateAnchors(ref, computed);
    refChanged = true;

    updatedCount++;
  }

  console.log('');
  console.log(`  Summary: ${updatedCount} updated, ${unchangedCount} unchanged`);

  if (dryRun) {
    console.log('  [DRY RUN] No files written.');
  } else if (refChanged) {
    try {
      writeJson(REFERENCE_PATH, refData);
      console.log('  [WRITTEN] data/reference.json updated with new anchors.');
    } catch (e) {
      console.error(`  [ERROR] Failed to write reference.json: ${e.message}`);
    }
    console.log(`  [WRITTEN] ${updatedCount} research JSON file(s) updated.`);
  } else {
    console.log('  [NO-OP] No changes needed.');
  }

  console.log('');
}

main();
