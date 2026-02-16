#!/usr/bin/env node
/**
 * hydrate-content.js
 *
 * Continuum Intelligence — Server-Side Content Hydration
 *
 * After prices are updated by update-prices.js, this script:
 *   1. Reads current prices from STOCK_DATA in index.html
 *   2. Reads REFERENCE_DATA anchors (what values are in the text)
 *   3. Computes new derived metrics (market cap, P/E, drawdown, upside)
 *   4. Performs targeted text replacement in all STOCK_DATA string fields
 *   5. Updates REFERENCE_DATA._anchors to match the new values
 *
 * This ensures the HTML file itself stays current between deploys,
 * not just at client-side runtime.
 *
 * Usage: node scripts/hydrate-content.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const INDEX_PATH = path.join(__dirname, '..', 'index.html');

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

// --- Parse current prices from STOCK_DATA ---

function extractPrice(html, ticker) {
  const blockStart = html.indexOf(`STOCK_DATA.${ticker}`);
  if (blockStart === -1) return null;
  const searchWindow = html.substring(blockStart, blockStart + 500);
  const priceMatch = searchWindow.match(/\bprice:\s*([\d.]+)/);
  return priceMatch ? parseFloat(priceMatch[1]) : null;
}

function extractPriceHistory(html, ticker) {
  const regex = new RegExp(`STOCK_DATA\\.${ticker}[\\s\\S]*?priceHistory:\\s*\\[([^\\]]+)\\]`, 'm');
  const match = html.match(regex);
  if (!match) return [];
  return match[1].split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
}

// --- Parse REFERENCE_DATA ---

function extractReferenceData(html) {
  const refStart = html.indexOf('const REFERENCE_DATA = {');
  if (refStart === -1) { console.error('[ERROR] REFERENCE_DATA not found'); return null; }
  const refEnd = html.indexOf('\n// === END REFERENCE_DATA ===', refStart);
  if (refEnd === -1) { console.error('[ERROR] END REFERENCE_DATA marker not found'); return null; }

  const refBlock = html.substring(refStart, refEnd + 1);

  // Use a simplified parser: extract per-ticker data
  const tickers = {};
  const tickerRegex = /(\w+):\s*\{/g;
  let match;

  // Find all top-level ticker keys
  const innerStart = refBlock.indexOf('{') + 1;
  const inner = refBlock.substring(innerStart);

  // Extract _anchors for each ticker
  const anchorRegex = /(\w+):\s*\{[^]*?_anchors:\s*\{([^}]+)\}/g;
  while ((match = anchorRegex.exec(refBlock)) !== null) {
    const ticker = match[1];
    const anchorStr = match[2];

    const anchors = {};
    // Parse key-value pairs from anchor string
    const kvRegex = /(\w+):\s*(?:'([^']*)'|"([^"]*)"|(-?[\d.]+)|null)/g;
    let kv;
    while ((kv = kvRegex.exec(anchorStr)) !== null) {
      const key = kv[1];
      const val = kv[2] || kv[3] || (kv[4] !== undefined ? parseFloat(kv[4]) : null);
      anchors[key] = val;
    }

    // Also extract other reference fields
    const tickerBlock = refBlock.substring(
      refBlock.indexOf(ticker + ':'),
      refBlock.indexOf('_anchors:', refBlock.indexOf(ticker + ':'))
    );

    tickers[ticker] = {
      sharesOutstanding: extractRefNumber(tickerBlock, 'sharesOutstanding'),
      analystTarget: extractRefNumber(tickerBlock, 'analystTarget'),
      epsTrailing: extractRefNumber(tickerBlock, 'epsTrailing'),
      epsForward: extractRefNumber(tickerBlock, 'epsForward'),
      divPerShare: extractRefNumber(tickerBlock, 'divPerShare'),
      _anchors: anchors
    };
  }

  return tickers;
}

function extractRefNumber(block, field) {
  const regex = new RegExp(`${field}:\\s*(-?[\\d.]+)`);
  const match = block.match(regex);
  return match ? parseFloat(match[1]) : null;
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

// --- Text Replacement ---

function replaceInRange(html, rangeStart, rangeEnd, oldStr, newStr) {
  if (!oldStr || !newStr || oldStr === newStr) return html;
  const section = html.substring(rangeStart, rangeEnd);
  const updated = section.split(oldStr).join(newStr);
  if (updated !== section) {
    return html.substring(0, rangeStart) + updated + html.substring(rangeEnd);
  }
  return html;
}

function hydrateStockText(html, ticker, anchors, computed, currency) {
  // Find the bounds of this stock's STOCK_DATA block
  const blockStart = html.indexOf(`STOCK_DATA.${ticker}`);
  if (blockStart === -1) return html;

  // Find end: next STOCK_DATA or SNAPSHOT_DATA or REFERENCE_DATA
  let blockEnd = html.length;
  const nextStock = html.indexOf('STOCK_DATA.', blockStart + 20);
  const snapshot = html.indexOf('SNAPSHOT_DATA', blockStart);
  if (nextStock > blockStart) blockEnd = Math.min(blockEnd, nextStock);
  if (snapshot > blockStart) blockEnd = Math.min(blockEnd, snapshot);

  const esc = currency.replace('$', '\\$');

  // Replace price
  if (anchors.price != null && computed.price !== anchors.price) {
    const oldPrice = Number(anchors.price).toFixed(2);
    const newPrice = computed.price.toFixed(2);
    html = replaceInRange(html, blockStart, blockEnd, currency + oldPrice, currency + newPrice);
    // Recalculate blockEnd after replacement (length may change)
    blockEnd += (newPrice.length - oldPrice.length) *
      html.substring(blockStart, blockEnd + 200).split(currency + newPrice).length;
  }

  // Replace market cap
  if (anchors.marketCapStr && computed.marketCapStr && computed.marketCapStr !== anchors.marketCapStr) {
    html = replaceInRange(html, blockStart, html.indexOf('STOCK_DATA.', blockStart + 20) || html.length,
      currency + anchors.marketCapStr, currency + computed.marketCapStr);
  }

  // Replace drawdown percentage in context
  if (anchors.drawdown != null && computed.drawdownFromHigh != null) {
    const oldDd = Math.round(Math.abs(anchors.drawdown));
    const newDd = Math.round(Math.abs(computed.drawdownFromHigh));
    if (oldDd !== newDd && oldDd > 0 && newDd > 0) {
      // Target: "down XX%", "-XX%", "↓XX%", "&darr;XX%"
      const section = html.substring(blockStart, blockEnd);
      let updated = section;
      updated = updated.replace(new RegExp('(down |&darr;|-|sell-off[^\\d]*)' + oldDd + '%', 'gi'),
        function(match) { return match.replace(oldDd + '%', newDd + '%'); });
      if (updated !== section) {
        html = html.substring(0, blockStart) + updated + html.substring(blockEnd);
      }
    }
  }

  // Replace upside to target percentage in context
  if (anchors.upsideToTarget != null && computed.upsideToTarget != null) {
    const oldUp = Math.round(Math.abs(anchors.upsideToTarget));
    const newUp = Math.round(Math.abs(computed.upsideToTarget));
    if (oldUp !== newUp && oldUp > 0 && newUp > 0) {
      const section = html.substring(blockStart, blockEnd);
      let updated = section;
      updated = updated.replace(new RegExp('(\\+|upside[^\\d]*|representing |\\()' + oldUp + '%', 'gi'),
        function(match) { return match.replace(oldUp + '%', newUp + '%'); });
      if (updated !== section) {
        html = html.substring(0, blockStart) + updated + html.substring(blockEnd);
      }
    }
  }

  // Replace P/E
  if (anchors.pe && computed.trailingPE) {
    const oldPE = fmtPE(anchors.pe);
    const newPE = fmtPE(computed.trailingPE);
    if (oldPE && newPE && oldPE !== newPE) {
      html = replaceInRange(html, blockStart,
        html.indexOf('STOCK_DATA.', blockStart + 20) || html.length,
        oldPE, newPE);
    }
  }

  // Replace forward P/E
  if (anchors.fwdPE && computed.forwardPE) {
    const oldFPE = fmtPE(anchors.fwdPE);
    const newFPE = fmtPE(computed.forwardPE);
    if (oldFPE && newFPE && oldFPE !== newFPE) {
      html = replaceInRange(html, blockStart,
        html.indexOf('STOCK_DATA.', blockStart + 20) || html.length,
        oldFPE, newFPE);
    }
  }

  return html;
}

// --- Update _anchors in REFERENCE_DATA to match new values ---

function updateAnchors(html, ticker, computed) {
  // Find the _anchors block for this ticker in REFERENCE_DATA
  const refStart = html.indexOf('const REFERENCE_DATA = {');
  if (refStart === -1) return html;
  const refEnd = html.indexOf('// === END REFERENCE_DATA ===', refStart);
  if (refEnd === -1) return html;

  // Find this ticker's _anchors block
  const tickerAnchorPattern = new RegExp(
    `(${ticker}:[\\s\\S]*?_anchors:\\s*\\{\\s*)` +
    `price:\\s*[\\d.]+`,
    'm'
  );
  const anchorMatch = html.substring(refStart, refEnd).match(tickerAnchorPattern);
  if (!anchorMatch) return html;

  // Build new anchor values
  const anchorStart = refStart + html.substring(refStart, refEnd).indexOf('_anchors:', html.substring(refStart, refEnd).indexOf(ticker + ':'));
  if (anchorStart < refStart) return html;

  const anchorBlockStart = html.indexOf('{', anchorStart) + 1;
  const anchorBlockEnd = html.indexOf('}', anchorBlockStart);
  if (anchorBlockEnd === -1) return html;

  const oldAnchorContent = html.substring(anchorBlockStart, anchorBlockEnd);

  // Update price anchor
  let newAnchorContent = oldAnchorContent.replace(
    /price:\s*[\d.]+/,
    `price: ${computed.price}`
  );

  // Update marketCapStr anchor
  if (computed.marketCapStr) {
    newAnchorContent = newAnchorContent.replace(
      /marketCapStr:\s*'[^']*'/,
      `marketCapStr: '${computed.marketCapStr}'`
    );
  }

  // Update drawdown anchor
  if (computed.drawdownFromHigh != null) {
    if (newAnchorContent.includes('drawdown:')) {
      newAnchorContent = newAnchorContent.replace(
        /drawdown:\s*(?:null|-?[\d.]+)/,
        `drawdown: ${Math.round(Math.abs(computed.drawdownFromHigh))}`
      );
    }
  }

  // Update upside anchor
  if (computed.upsideToTarget != null) {
    if (newAnchorContent.includes('upsideToTarget:')) {
      newAnchorContent = newAnchorContent.replace(
        /upsideToTarget:\s*(?:null|-?[\d.]+)/,
        `upsideToTarget: ${Math.round(Math.abs(computed.upsideToTarget))}`
      );
    }
  }

  // Update PE anchor
  if (computed.trailingPE) {
    newAnchorContent = newAnchorContent.replace(
      /pe:\s*[\d.]+/,
      `pe: ${Math.round(computed.trailingPE * 10) / 10}`
    );
  }

  // Update forward PE anchor
  if (computed.forwardPE) {
    if (newAnchorContent.includes('fwdPE:')) {
      newAnchorContent = newAnchorContent.replace(
        /fwdPE:\s*[\d.]+/,
        `fwdPE: ${Math.round(computed.forwardPE * 10) / 10}`
      );
    }
  }

  // Update divYield anchor
  if (computed.divYield != null) {
    if (newAnchorContent.includes('divYield:')) {
      newAnchorContent = newAnchorContent.replace(
        /divYield:\s*[\d.]+/,
        `divYield: ${Math.round(computed.divYield * 10) / 10}`
      );
    }
  }

  if (newAnchorContent !== oldAnchorContent) {
    html = html.substring(0, anchorBlockStart) + newAnchorContent + html.substring(anchorBlockEnd);
  }

  return html;
}

// --- Main ---

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     CONTINUUM INTELLIGENCE — CONTENT HYDRATION ENGINE       ║');
  console.log(`║     ${new Date().toISOString()}                       ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  let html = fs.readFileSync(INDEX_PATH, 'utf8');
  const refData = extractReferenceData(html);

  if (!refData) {
    console.error('  [FATAL] Could not parse REFERENCE_DATA. Aborting.');
    process.exit(1);
  }

  let updatedCount = 0;
  let unchangedCount = 0;

  for (const ticker of Object.keys(refData)) {
    const ref = refData[ticker];
    if (!ref._anchors) { continue; }

    const price = extractPrice(html, ticker);
    if (!price) {
      console.log(`  [SKIP] ${ticker}: could not extract price`);
      continue;
    }

    const priceHistory = extractPriceHistory(html, ticker);
    const computed = computeMetrics(price, priceHistory, ref);

    const anchorPrice = ref._anchors.price;
    if (anchorPrice && Math.abs(price - anchorPrice) < 0.01) {
      console.log(`  [OK]   ${ticker}: price unchanged at ${price}`);
      unchangedCount++;
      continue;
    }

    console.log(`  [UPD]  ${ticker}: ${anchorPrice} → ${price}` +
      (computed.marketCapStr ? ` | MCap: ${computed.marketCapStr}` : '') +
      (computed.drawdownFromHigh != null ? ` | DD: ${Math.round(computed.drawdownFromHigh)}%` : '') +
      (computed.upsideToTarget != null ? ` | Upside: ${Math.round(computed.upsideToTarget)}%` : ''));

    // Hydrate text content
    const currency = ticker === 'XRO' ? 'A$' : // XRO reports in NZ$ but price is A$
                     (html.match(new RegExp(`STOCK_DATA\\.${ticker}[\\s\\S]*?currency:\\s*'([^']+)'`)) || [,'A$'])[1];

    html = hydrateStockText(html, ticker, ref._anchors, computed, currency);

    // Update anchors to reflect new values
    html = updateAnchors(html, ticker, computed);

    updatedCount++;
  }

  console.log('');
  console.log(`  Summary: ${updatedCount} updated, ${unchangedCount} unchanged`);

  if (dryRun) {
    console.log('  [DRY RUN] No file written.');
  } else if (updatedCount > 0) {
    fs.writeFileSync(INDEX_PATH, html, 'utf8');
    console.log('  [WRITTEN] index.html updated with hydrated content.');
  } else {
    console.log('  [NO-OP] No changes needed.');
  }

  console.log('');
}

main();
