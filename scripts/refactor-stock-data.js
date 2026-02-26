#!/usr/bin/env node
/**
 * refactor-stock-data.js
 *
 * Refactors index.html to:
 * 1. Remove all inline STOCK_DATA.TICKER = { ... }; assignments
 * 2. Add a synchronous loader that loads _index.json into STOCK_DATA at startup
 * 3. Modify the route() function to lazy-load full research data from per-ticker JSON
 * 4. Keep all functions, FRESHNESS_DATA, REFERENCE_DATA, SNAPSHOT_DATA intact
 *
 * Usage:  node scripts/refactor-stock-data.js
 *
 * Creates a backup at index.html.bak before modifying.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');
const BACKUP_PATH = HTML_PATH + '.bak';

// Read the full file
const lines = fs.readFileSync(HTML_PATH, 'utf-8').split('\n');
console.log(`Read ${lines.length} lines from index.html`);

// Create backup
fs.copyFileSync(HTML_PATH, BACKUP_PATH);
console.log(`Backup created at ${BACKUP_PATH}`);

// --- Phase 1: Identify all STOCK_DATA assignment blocks to remove ---

// Find all STOCK_DATA.XXX = { lines
const assignmentStarts = [];
for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (/^STOCK_DATA\.[A-Z]{2,4}\s*=\s*\{/.test(trimmed)) {
        assignmentStarts.push(i);
    }
}
console.log(`Found ${assignmentStarts.length} STOCK_DATA assignments starting at lines: ${assignmentStarts.map(i => i + 1).join(', ')}`);

// For each assignment, find the matching closing };
function findClosingBrace(lines, startLine) {
    let depth = 0;
    let inString = false;
    let stringChar = '';
    let escaped = false;

    for (let lineIdx = startLine; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        for (let c = 0; c < line.length; c++) {
            const ch = line[c];

            if (escaped) { escaped = false; continue; }
            if (ch === '\\' && inString) { escaped = true; continue; }

            if (inString) {
                if (ch === stringChar) inString = false;
                continue;
            }

            if (ch === "'" || ch === '"' || ch === '`') {
                inString = true;
                stringChar = ch;
                continue;
            }

            // Skip single-line comments
            if (ch === '/' && c + 1 < line.length && line[c + 1] === '/') {
                break; // rest of line is a comment
            }

            if (ch === '{') depth++;
            if (ch === '}') {
                depth--;
                if (depth === 0) {
                    return lineIdx;
                }
            }
        }
    }
    return -1;
}

// Build list of line ranges to remove
const removeRanges = [];
for (const startLine of assignmentStarts) {
    // Also include comment lines above the assignment (up to 3 lines of section headers)
    let rangeStart = startLine;
    for (let lookback = 1; lookback <= 3; lookback++) {
        const prevLine = lines[rangeStart - 1];
        if (prevLine !== undefined && (prevLine.trim().startsWith('// ====') || prevLine.trim().startsWith('// ---') || prevLine.trim() === '')) {
            rangeStart--;
        } else {
            break;
        }
    }

    const endLine = findClosingBrace(lines, startLine);
    if (endLine === -1) {
        console.error(`ERROR: Could not find closing brace for assignment at line ${startLine + 1}`);
        process.exit(1);
    }

    // Include trailing semicolons and blank lines
    let rangeEnd = endLine;
    while (rangeEnd + 1 < lines.length && (lines[rangeEnd + 1].trim() === '' || lines[rangeEnd + 1].trim() === ';')) {
        rangeEnd++;
    }

    removeRanges.push({ start: rangeStart, end: rangeEnd, ticker: lines[startLine].match(/STOCK_DATA\.([A-Z]{2,4})/)[1] });
}

console.log(`\nRanges to remove:`);
let totalLinesRemoved = 0;
for (const r of removeRanges) {
    const count = r.end - r.start + 1;
    totalLinesRemoved += count;
    console.log(`  ${r.ticker}: lines ${r.start + 1}-${r.end + 1} (${count} lines)`);
}
console.log(`  Total: ${totalLinesRemoved} lines to remove`);

// --- Phase 2: Build the new content ---

// Mark lines for removal
const removeSet = new Set();
for (const r of removeRanges) {
    for (let i = r.start; i <= r.end; i++) {
        removeSet.add(i);
    }
}

// Find where to insert the data loader (right after REFERENCE_DATA end)
let loaderInsertLine = -1;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '// === END REFERENCE_DATA ===') {
        loaderInsertLine = i + 1;
        break;
    }
}

if (loaderInsertLine === -1) {
    console.error('ERROR: Could not find "// === END REFERENCE_DATA ===" marker');
    process.exit(1);
}
console.log(`\nLoader will be inserted at line ${loaderInsertLine + 1} (after REFERENCE_DATA)`);

// The synchronous loader code
const loaderCode = `
// ============================================================
// STOCK DATA LOADER — loads lightweight index data synchronously
// for home page, then fetches full research data on demand
// ============================================================

// Load lightweight index data synchronously (needed for DOMContentLoaded)
(function() {
  try {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', 'data/research/_index.json', false); // synchronous
    xhr.send();
    if (xhr.status === 200) {
      var indexData = JSON.parse(xhr.responseText);
      var tickers = Object.keys(indexData);
      for (var i = 0; i < tickers.length; i++) {
        var t = tickers[i];
        STOCK_DATA[t] = indexData[t];
        STOCK_DATA[t]._indexOnly = true; // flag: full data not yet loaded
      }
      console.log('[StockDataLoader] Loaded index data for ' + tickers.length + ' tickers');
    } else {
      console.error('[StockDataLoader] Failed to load index data: HTTP ' + xhr.status);
    }
  } catch (err) {
    console.error('[StockDataLoader] Error loading index data:', err);
  }
})();

// Async loader for full research data (called before rendering a report page)
function loadFullResearchData(ticker, callback) {
  if (STOCK_DATA[ticker] && !STOCK_DATA[ticker]._indexOnly) {
    // Already loaded full data
    if (callback) callback(STOCK_DATA[ticker]);
    return;
  }
  var url = 'data/research/' + ticker + '.json';
  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var fullData = JSON.parse(xhr.responseText);
        // Merge full data into STOCK_DATA, preserving any live price patches
        var livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
        var livePriceHistory = STOCK_DATA[ticker] ? STOCK_DATA[ticker].priceHistory : undefined;
        STOCK_DATA[ticker] = fullData;
        STOCK_DATA[ticker]._indexOnly = false;
        // Restore live price if it was patched
        if (livePrice !== undefined) {
          STOCK_DATA[ticker]._livePrice = livePrice;
          STOCK_DATA[ticker].price = livePrice;
        }
        if (livePriceHistory) {
          STOCK_DATA[ticker].priceHistory = livePriceHistory;
        }
        // Re-hydrate with ContinuumDynamics if available
        if (typeof ContinuumDynamics !== 'undefined' && ContinuumDynamics.hydrate) {
          ContinuumDynamics.hydrate(ticker);
        }
        // Re-build snapshot data
        if (typeof buildSnapshotFromStock === 'function') {
          SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
        }
        console.log('[StockDataLoader] Loaded full research data for ' + ticker);
        if (callback) callback(STOCK_DATA[ticker]);
      } catch (err) {
        console.error('[StockDataLoader] Error parsing research data for ' + ticker + ':', err);
        if (callback) callback(null);
      }
    } else {
      console.error('[StockDataLoader] Failed to fetch research data for ' + ticker + ': HTTP ' + xhr.status);
      if (callback) callback(null);
    }
  };
  xhr.onerror = function() {
    console.error('[StockDataLoader] Network error fetching research data for ' + ticker);
    if (callback) callback(null);
  };
  xhr.send();
}

`;

// --- Phase 3: Modify route() to use lazy loading ---
// Find the lazy render block in route() and wrap it with loadFullResearchData

let routeModified = false;

// Build the output
const output = [];
let skipInsertedLoader = false;

for (let i = 0; i < lines.length; i++) {
    // Insert loader code after REFERENCE_DATA end marker
    if (i === loaderInsertLine && !skipInsertedLoader) {
        output.push(''); // blank line after END REFERENCE_DATA
        output.push(...loaderCode.split('\n'));
        skipInsertedLoader = true;
    }

    // Skip lines marked for removal
    if (removeSet.has(i)) continue;

    // Modify the route() lazy render block for report pages
    // Original pattern:
    //   if (!renderedPages.has(ticker) && STOCK_DATA[ticker]) {
    //       const container = document.getElementById('page-' + hash);
    //       if (container) {
    //           container.innerHTML = renderReportPage(STOCK_DATA[ticker]);
    //           renderedPages.add(ticker);
    // We need to wrap this in loadFullResearchData callback
    if (!routeModified && lines[i].includes('if (!renderedPages.has(ticker) && STOCK_DATA[ticker])') && i > 18000) {
        // Find the full block to replace (this is the route() lazy render)
        // Look ahead to find the closing of this if block
        output.push('        if (!renderedPages.has(ticker) && STOCK_DATA[ticker]) {');
        output.push('            const container = document.getElementById(\'page-\' + hash);');
        output.push('            if (container) {');
        output.push('                // Show loading state');
        output.push('                if (STOCK_DATA[ticker]._indexOnly) {');
        output.push('                    container.innerHTML = \'<div style="display:flex;align-items:center;justify-content:center;min-height:60vh;color:var(--text-muted)"><div style="text-align:center"><div style="font-size:1.5rem;margin-bottom:0.5rem">Loading Research Data&hellip;</div><div style="font-size:0.9rem">Fetching full report for \' + STOCK_DATA[ticker].company + \'</div></div></div>\';');
        output.push('                    loadFullResearchData(ticker, function(data) {');
        output.push('                        if (data) {');
        output.push('                            container.innerHTML = renderReportPage(data);');
        output.push('                            renderedPages.add(ticker);');
        output.push('                            setupScrollSpy(\'page-\' + hash);');
        output.push('                            if (typeof window.initInlineChat === \'function\') window.initInlineChat(ticker);');
        output.push('                            if (typeof window.applyNarrativeAnalysis === \'function\') window.applyNarrativeAnalysis(ticker);');
        output.push('                            fetchAndPatchLive(ticker);');
        output.push('                        }');
        output.push('                    });');
        output.push('                } else {');
        output.push('                    container.innerHTML = renderReportPage(STOCK_DATA[ticker]);');
        output.push('                    renderedPages.add(ticker);');
        output.push('                    setupScrollSpy(\'page-\' + hash);');
        output.push('                    if (typeof window.initInlineChat === \'function\') window.initInlineChat(ticker);');
        output.push('                }');
        output.push('            }');
        output.push('        }');

        // Skip the original block lines
        // We need to skip from here through the closing of the if block
        let depth = 0;
        let j = i;
        // Find "if (!renderedPages.has" opening brace
        while (j < lines.length && !lines[j].includes('{')) j++;
        depth = 1; // opened first brace
        j++;
        while (j < lines.length && depth > 0) {
            for (let c = 0; c < lines[j].length; c++) {
                if (lines[j][c] === '{') depth++;
                if (lines[j][c] === '}') {
                    depth--;
                    if (depth === 0) break;
                }
            }
            j++;
        }
        i = j - 1; // will be incremented by the for loop
        routeModified = true;
        continue;
    }

    output.push(lines[i]);
}

// Write the modified file
fs.writeFileSync(HTML_PATH, output.join('\n'), 'utf-8');

const newSize = Buffer.byteLength(output.join('\n'), 'utf-8');
const oldSize = Buffer.byteLength(lines.join('\n'), 'utf-8');
console.log(`\n--- Results ---`);
console.log(`Original: ${lines.length} lines, ${(oldSize / 1024).toFixed(1)} KB`);
console.log(`Modified: ${output.length} lines, ${(newSize / 1024).toFixed(1)} KB`);
console.log(`Removed: ${lines.length - output.length} lines, ${((oldSize - newSize) / 1024).toFixed(1)} KB saved`);
console.log(`Route modified: ${routeModified}`);
console.log(`\nBackup: ${BACKUP_PATH}`);
