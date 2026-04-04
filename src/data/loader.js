// ============================================================
// LOADER.JS -- Data fetching extracted from index.html
// Handles loading full research data on demand, building
// coverage data, and building snapshot data from stock data.
// ============================================================

import { STOCK_DATA, SNAPSHOT_DATA, WORKSTATION_DATA } from '../lib/state.js';
import { validateWorkstationPayload } from '../features/workstation/ws-schema-validator.js';
import { computeSkewScore, normaliseScores } from '../lib/dom.js';
import { validateResearchFields, REQUIRED_STOCKS_FIELDS } from './schema-manifest.js';
import { formatPrice, formatPercent } from '../lib/format.js';

// Bump this when the research JSON schema or score pipeline changes.
// Any cached entry without a matching _cacheVersion is discarded so the
// fresh static JSON is fetched instead, keeping the UI in sync with ingest.py.
export var CACHE_VERSION = 'v4';

/**
 * Async loader for full research data (called before rendering a report page).
 * Fetches full research JSON for a ticker, merges into STOCK_DATA,
 * re-hydrates with ContinuumDynamics, and rebuilds snapshot data.
 * @param {string} ticker
 * @param {function} callback - Called with stock data or null on error
 */
export function loadFullResearchData(ticker, callback) {
  if (STOCK_DATA[ticker] && !STOCK_DATA[ticker]._indexOnly) {
    // Already loaded full data
    if (callback) callback(STOCK_DATA[ticker]);
    return;
  }

  // Check localStorage for cached refresh data (persists across page reloads)
  try {
    const cached = localStorage.getItem('ci_research_' + ticker);
    if (cached) {
      const cachedData = JSON.parse(cached);
      // Use cached data only if it has the current cache version AND is less than 24h old.
      // TTL prevents stale localStorage from masking server-side updates (e.g. BMAD session,
      // gold agent runs, or pipeline refreshes that bypass the client cache).
      const cacheAge = cachedData._lastRefreshed ? Date.now() - new Date(cachedData._lastRefreshed).getTime() : Infinity;
      const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
      if (cachedData._lastRefreshed && cachedData._cacheVersion === CACHE_VERSION && cacheAge < CACHE_TTL_MS) {
        const prev = STOCK_DATA[ticker] || {};
        const livePrice = prev._livePrice;
        const livePriceHistory = prev.priceHistory;
        const livePrevClose = prev._livePrevClose;
        const liveChange = prev._liveChange;
        const liveChangePct = prev._liveChangePct;
        STOCK_DATA[ticker] = cachedData;
        STOCK_DATA[ticker]._indexOnly = false;
        STOCK_DATA[ticker]._fromCache = true;
        if (livePrice !== undefined) {
          STOCK_DATA[ticker]._livePrice = livePrice;
          STOCK_DATA[ticker].price = livePrice;
        }
        if (livePriceHistory) {
          STOCK_DATA[ticker].priceHistory = livePriceHistory;
        }
        if (livePrevClose !== undefined) {
          STOCK_DATA[ticker]._livePrevClose = livePrevClose;
          STOCK_DATA[ticker]._liveChange = liveChange;
          STOCK_DATA[ticker]._liveChangePct = liveChangePct;
        }
        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
          window.ContinuumDynamics.hydrate(ticker);
        }
        SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
        console.log('[StockDataLoader] Loaded CACHED research for ' + ticker + ' (refreshed ' + cachedData._lastRefreshed + ')');
        if (callback) callback(STOCK_DATA[ticker]);
        return;
      }
    }
  } catch (cacheErr) {
    console.warn('[StockDataLoader] Cache read failed:', cacheErr);
  }

  const url = 'data/research/' + ticker + '.json';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const fullData = JSON.parse(xhr.responseText);
        // Validate required fields (BEAD-003)
        const missing = validateResearchFields(fullData);
        if (missing.length > 0) {
          console.warn('[Schema Loader] data/research/' + ticker + '.json missing required fields: ' + missing.join(', '));
        }
        // Merge full data into STOCK_DATA, preserving any live price patches
        const livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
        const livePriceHistory = STOCK_DATA[ticker] ? STOCK_DATA[ticker].priceHistory : undefined;
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
        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
          window.ContinuumDynamics.hydrate(ticker);
        }
        // Re-build snapshot data
        SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
        console.log('[StockDataLoader] Loaded full research data for ' + ticker);
        // Also merge signal fields from data/stocks/TICKER.json
        const sigUrl = 'data/stocks/' + ticker + '.json';
        const sigXhr = new XMLHttpRequest();
        sigXhr.open('GET', sigUrl, true);
        sigXhr.onload = function() {
          if (sigXhr.status === 200) {
            try {
              const sd = JSON.parse(sigXhr.responseText);
              // Validate expected fields (BEAD-003)
              var sigMissing = REQUIRED_STOCKS_FIELDS.filter(function(f) { return !(f in sd) || sd[f] == null; });
              if (sigMissing.length > 0) {
                console.warn('[Schema Loader] data/stocks/' + ticker + '.json missing fields: ' + sigMissing.join(', '));
              }
              if (sd.three_layer_signal) STOCK_DATA[ticker].three_layer_signal = sd.three_layer_signal;
              if (sd.valuation_range)    STOCK_DATA[ticker].valuation_range    = sd.valuation_range;
              if (sd.price_signals && sd.price_signals.length)
                {STOCK_DATA[ticker].price_signals = sd.price_signals;}
            } catch(e) { console.error('[Loader] Failed to parse signal data for ' + ticker + ':', e); }
          } else {
            console.error('[Schema Loader] Missing data/stocks/' + ticker + '.json: HTTP ' + sigXhr.status + ' -- signal fields (three_layer_signal, valuation_range, price_signals) will be absent');
          }
          if (callback) callback(STOCK_DATA[ticker]);
        };
        sigXhr.onerror = function() {
          console.error('[Schema Loader] Network error loading data/stocks/' + ticker + '.json -- signal fields will be absent');
          if (callback) callback(STOCK_DATA[ticker]);
        };
        sigXhr.send();
        return; // callback is called from sigXhr handlers above
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

/**
 * Build coverage data from STOCK_DATA
 * @returns {object} Coverage data keyed by ticker
 */
export function buildCoverageData() {
  const coverageData = {};
  const tickers = Object.keys(STOCK_DATA);
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const d = STOCK_DATA[t];
    coverageData[t] = {
      company: d.company,
      price: d._livePrice || d.price,
      skew: (d._skew || computeSkewScore(d)).direction,
      sector: d.sector
    };
  }
  return coverageData;
}

/**
 * Auto-generate snapshot data from STOCK_DATA for a given ticker.
 * Requires full hypothesis/evidence/tripwire data (not index-only).
 * @param {string} ticker
 * @returns {object|null} Snapshot data object or null if stock not found
 */
export function buildSnapshotFromStock(ticker) {
  const stock = STOCK_DATA[ticker];
  if (!stock) return null;

  // 1. Clone hypotheses -- already sorted by prepareHypotheses (disconfirmation ranking)
  const hyps = [];
  const stockHyps = stock.hypotheses || [];
  for (var i = 0; i < stockHyps.length; i++) {
    const h = stockHyps[i];
    hyps.push({
      originalTier: h.tier,
      direction: h.direction,
      title: h.title.replace(/^N\d+:\s*/, ''),
      statusClass: h.statusClass,
      statusText: h.statusText,
      score: parseInt(h.score) || 0,
      scoreMeta: h.scoreMeta,
      description: h.description
    });
  }
  // Note: not re-sorting -- prepareHypotheses already ranked by fewest contradictions (v3 framework)

  // Build original tier -> new position mapping
  const tierMap = {};
  for (var i = 0; i < hyps.length; i++) {
    tierMap[hyps[i].originalTier] = i;
  }

  // Build N-reference remapper for snapshot text fields
  const snapRemapN = function(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\bN([1-4])\b/g, function(m, n) {
      const oldTier = 'n' + n;
      const newIdx = tierMap[oldTier];
      return newIdx !== undefined ? 'N' + (newIdx + 1) : m;
    });
  };

  // 2. Normalise scores to 100% with v3 floor/ceiling
  const normScores = normaliseScores(hyps);

  // 3. Direction -> CSS class mappings
  const dirCls = { upside: 'snap-upside', downside: 'snap-downside', neutral: 'snap-neutral' };
  const dirSbCls = { upside: 'snap-sb-upside', downside: 'snap-sb-downside', neutral: 'snap-sb-neutral' };
  const dirColor = { upside: 'var(--green)', downside: 'var(--red)', neutral: 'var(--amber)' };
  const dirScoreCls = { upside: 'priced', downside: 'high', neutral: 'medium' };
  const statusTagMap = { priced: 'snap-tag-priced', accumulating: 'snap-tag-accumulating', active: 'snap-tag-tail', minimal: 'snap-tag-minimal' };

  // Parse direction and label from scoreMeta
  function parseDirMeta(meta) {
    if (!meta) return { direction: 'flat', dirLabel: '&rarr; Steady' };
    let label = meta.replace(/^[^&]*/, '').trim();
    if (!label) label = meta;
    if (meta.indexOf('&uarr;') >= 0) return { direction: 'up', dirLabel: label };
    if (meta.indexOf('&darr;') >= 0) return { direction: 'down', dirLabel: label };
    return { direction: 'flat', dirLabel: label };
  }

  // 4. Build survival bar
  const survivalBar = [];
  const survivalLegend = [];
  for (var i = 0; i < hyps.length; i++) {
    survivalBar.push({
      cls: dirSbCls[hyps[i].direction] || 'snap-sb-neutral',
      width: normScores[i] + '%',
      label: 'N' + (i + 1) + ': ' + normScores[i] + '%'
    });
    survivalLegend.push({
      color: dirColor[hyps[i].direction] || 'var(--amber)',
      label: hyps[i].title
    });
  }

  // 5. Build hypothesis cards
  const snapHyps = [];
  for (var i = 0; i < hyps.length; i++) {
    const dm = parseDirMeta(hyps[i].scoreMeta);
    let desc = hyps[i].description;
    if (desc.length > 200) desc = desc.substring(0, 197) + '...';
    snapHyps.push({
      cls: dirCls[hyps[i].direction] || 'snap-neutral',
      label: 'N' + (i + 1) + ': ' + hyps[i].title,
      statusTag: statusTagMap[hyps[i].statusClass] || 'snap-tag-minimal',
      statusText: hyps[i].statusText,
      desc: desc,
      score: normScores[i] + '%',
      scoreCls: dirScoreCls[hyps[i].direction] || 'medium',
      direction: dm.direction,
      dirLabel: dm.dirLabel
    });
  }

  // 6. Build evidence matrix from evidence card tags
  const matrixHeaders = ['Domain'];
  for (var i = 0; i < hyps.length; i++) {
    matrixHeaders.push('N' + (i + 1) + ' ' + hyps[i].title.substring(0, 12));
  }

  const matrixRows = [];
  const cards = stock.evidence && stock.evidence.cards ? stock.evidence.cards : [];
  const maxCards = Math.min(cards.length, 8);
  for (let c = 0; c < maxCards; c++) {
    const card = cards[c];
    const cells = [];
    for (let h2 = 0; h2 < hyps.length; h2++) {
      cells.push({ cls: 'snap-signal-neutral', text: '&mdash;' });
    }
    if (card.tags) {
      for (let t = 0; t < card.tags.length; t++) {
        const tag = card.tags[t];
        const tierMatch = tag.text.match(/N(\d)/);
        if (tierMatch) {
          const origTier = 'n' + tierMatch[1];
          const newPos = tierMap[origTier];
          if (newPos !== undefined) {
            if (tag.class === 'strong') {
              cells[newPos] = { cls: 'snap-signal-strong-support', text: '&#9650;&#9650;' };
            } else if (tag.class === 'supports') {
              cells[newPos] = { cls: 'snap-signal-support', text: '&#9650;' };
            } else if (tag.class === 'contradicts') {
              cells[newPos] = { cls: 'snap-signal-contradict', text: '&#9660;' };
            }
          }
        }
      }
    }
    const domainName = (card.title || card.name || card.domain || 'Unknown Domain').replace(/^\d+\.\s*/, '');
    let epistemic = card.epistemicLabel || '';
    if (epistemic.indexOf('/') >= 0) epistemic = epistemic.split('/')[0].trim();
    matrixRows.push({ domain: domainName, epistemic: epistemic, cells: cells });
  }

  // 7. Build discriminators
  const snapDiscrim = [];
  const discRows = stock.discriminators && stock.discriminators.rows ? stock.discriminators.rows : [];
  for (let d = 0; d < Math.min(discRows.length, 4); d++) {
    const disc = discRows[d];
    if (typeof disc === 'string') {
      snapDiscrim.push({ level: 'Medium', cls: 'medium', text: snapRemapN(disc) });
      continue;
    }
    snapDiscrim.push({
      level: disc.diagnosticity,
      cls: (disc.diagnosticityClass || '').replace('disc-', ''),
      text: snapRemapN(disc.evidence)
    });
  }

  // Non-discriminating chips
  const ndText = stock.discriminators && stock.discriminators.nonDiscriminating ? stock.discriminators.nonDiscriminating : '';
  const ndChips = [];
  if (typeof ndText === 'string') {
    const parts = ndText.split('&bull;');
    for (let p = 0; p < Math.min(parts.length, 5); p++) {
      const chip = parts[p].replace(/<[^>]+>/g, '').trim();
      if (chip) ndChips.push(chip);
    }
  }

  // 8. Build tripwires
  const snapTripwires = [];
  const tripCards = stock.tripwires && stock.tripwires.cards ? stock.tripwires.cards : [];
  for (let tc2 = 0; tc2 < Math.min(tripCards.length, 4); tc2++) {
    const tw = tripCards[tc2];
    const conds = [];
    for (let co = 0; co < tw.conditions.length; co++) {
      const cond = tw.conditions[co];
      const icon = cond.valence === 'positive' ? '&#9650;' : '&#9660;';
      const iconCls = cond.valence === 'positive' ? 'up' : 'down';
      const condText = snapRemapN(cond.if.replace(/^If\s+/i, ''));
      const thenShort = snapRemapN(cond.then.split('.')[0]);
      conds.push({ icon: icon, iconCls: iconCls, text: condText + ' &rarr; ' + thenShort });
    }
    snapTripwires.push({ date: tw.date, name: tw.name.replace(/\s*&mdash;.*/, ''), conditions: conds });
  }

  // 9. Evidence coverage
  const snapCoverage = [];
  const coverageRows = stock.gaps && stock.gaps.coverageRows ? stock.gaps.coverageRows : [];
  for (let g = 0; g < Math.min(coverageRows.length, 8); g++) {
    const gr = coverageRows[g];
    const sCls = gr.coverageLevel === 'full' || gr.coverageLevel === 'good' ? 'snap-gap-full' :
              gr.coverageLevel === 'partial' ? 'snap-gap-partial' : 'snap-gap-limited';
    snapCoverage.push({ domain: gr.domain, status: gr.coverageLabel.toUpperCase(), cls: sCls });
  }

  // 10. Questions from gaps
  const snapQuestions = [];
  const couldntAssess = stock.gaps && stock.gaps.couldntAssess ? stock.gaps.couldntAssess : [];
  for (let q = 0; q < Math.min(couldntAssess.length, 3); q++) {
    snapQuestions.push(couldntAssess[q].replace(/<[^>]+>/g, ''));
  }

  // 11. Price metrics from heroMetrics
  const priceMetrics = [];
  for (let m = 0; m < stock.heroMetrics.length; m++) {
    priceMetrics.push({
      label: stock.heroMetrics[m].label,
      value: stock.heroMetrics[m].value,
      cls: stock.heroMetrics[m].colorClass || ''
    });
  }

  // 12. Skew badge -- derived from computed score, not static data
  const skewComputed = stock._skew || computeSkewScore(stock);
  const skewBadge = skewComputed.direction === 'downside' ? '&#9660; DOWNSIDE' :
                  skewComputed.direction === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';

  // 13. Date formatting
  let dateStr = stock.date || '';
  const dateMatch = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
  if (dateMatch) dateStr = dateMatch[1] + ' ' + dateMatch[2].toUpperCase().substring(0, 3) + ' ' + dateMatch[3];

  return {
    ticker: stock.ticker,
    tickerFull: stock.tickerFull,
    company: stock.company,
    sector: stock.sector,
    sectorSub: stock.sectorSub,
    price: stock.price,
    currency: stock.currency,
    date: dateStr,
    version: 'v1.0',
    reportId: stock.reportId,
    priceMetrics: priceMetrics,
    riskSkew: { direction: skewComputed.direction, badge: skewBadge, rationale: (stock.skew && stock.skew.rationale) || '', computed: skewComputed },
    narrative: { text: (stock.narrative && stock.narrative.theNarrative) || '', verdict: (stock.verdict && stock.verdict.text) || '' },
    survivalBar: survivalBar,
    survivalLegend: survivalLegend,
    hypotheses: snapHyps,
    evidenceMatrix: { headers: matrixHeaders, rows: matrixRows },
    discriminators: snapDiscrim,
    nonDiscriminating: ndChips,
    tripwires: snapTripwires,
    evidenceCoverage: snapCoverage,
    questions: snapQuestions,
    technicalAnalysis: stock.technicalAnalysis ? (function(ta) {
      const taT  = ta.trend || {};
      const taP  = ta.price || {};
      const taMA = ta.movingAverages || {};
      const ma50  = taMA.ma50  || {};
      const ma200 = taMA.ma200 || {};
      const taKL  = ta.keyLevels || {};
      const taSup = taKL.support  || {};
      const taRes = taKL.resistance || {};
      const taMR  = ta.meanReversion || {};
      const taCO  = taMA.crossover || null;
      return {
        regime:        ta.regime || null,
        trend:         taT.direction ? taT.direction + ' (' + (taT.duration || '') + ')' : null,
        ma50:          (ma50.value  != null) ? (taP.currency || '') + formatPrice(ma50.value)  : null,
        ma200:         (ma200.value != null) ? (taP.currency || '') + formatPrice(ma200.value) : null,
        vsMa50:        (taMA.priceVsMa50  != null) ? formatPercent(taMA.priceVsMa50)  : null,
        vsMa200:       (taMA.priceVsMa200 != null) ? formatPercent(taMA.priceVsMa200) : null,
        support:       (taSup.price != null) ? (taP.currency || '') + formatPrice(taSup.price) : null,
        resistance:    (taRes.price != null) ? (taP.currency || '') + formatPrice(taRes.price) : null,
        rangePosition: (taMR.rangePosition != null) ? 'Lower ' + taMR.rangePosition + '%' : null,
        crossover:     taCO ? taCO.type + ' (' + taCO.date + ')' : null
      };
    })(stock.technicalAnalysis) : null,
    footerDisclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using ACH methodology. All data sourced from ASX filings, broker consensus, and publicly available data as at report date. Hypothesis scores reflect editorial assessment.',
    footerMeta: [
      { label: 'ID: ' + stock.reportId },
      { label: 'MODE: Narrative Intelligence' },
      { label: 'NEXT: Mar 2026' }
    ]
  };
}

// Workstation data cache version. Bump when workstation schema changes.
export var WS_CACHE_VERSION = 'ws-v1';

/**
 * Load workstation data for a ticker.
 * Fetches data/workstation/{TICKER}.json, validates, and stores in state.
 * Uses localStorage cache (24h TTL), same pattern as loadFullResearchData.
 *
 * @param {string} ticker
 * @param {function} callback - Called with payload or null on error/validation failure
 */
export function loadWorkstationData(ticker, callback) {
  // Check if already in state
  const existing = WORKSTATION_DATA[ticker];
  if (existing) {
    if (callback) callback(existing);
    return;
  }

  // Check localStorage cache
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  try {
    const cacheKey = 'ci_workstation_' + ticker;
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const cachedData = JSON.parse(cached);
      const cacheAge = cachedData._lastRefreshed
        ? Date.now() - new Date(cachedData._lastRefreshed).getTime()
        : Infinity;
      if (cachedData._cacheVersion === WS_CACHE_VERSION && cacheAge < CACHE_TTL_MS) {
        WORKSTATION_DATA[ticker] = cachedData;
        console.log('[WorkstationLoader] Loaded CACHED workstation for ' + ticker);
        if (callback) callback(cachedData);
        return;
      }
    }
  } catch (cacheErr) {
    console.warn('[WorkstationLoader] Cache read failed:', cacheErr);
  }

  // Fetch from file
  const url = 'data/workstation/' + ticker + '.json';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const payload = JSON.parse(xhr.responseText);

        // Validate against schema
        const validation = validateWorkstationPayload(payload);
        if (!validation.valid) {
          console.error('[WorkstationLoader] Schema validation failed for ' + ticker + ':', validation.errors.join('; '));
          if (callback) callback(null);
          return;
        }
        if (validation.warnings && validation.warnings.length > 0) {
          console.warn('[WorkstationLoader] Validation warnings for ' + ticker + ':', validation.warnings.join('; '));
        }

        // Cache to localStorage
        try {
          payload._lastRefreshed = new Date().toISOString();
          payload._cacheVersion = WS_CACHE_VERSION;
          localStorage.setItem('ci_workstation_' + ticker, JSON.stringify(payload));
        } catch (writeErr) {
          console.warn('[WorkstationLoader] Cache write failed:', writeErr);
        }

        // Store in state
        WORKSTATION_DATA[ticker] = payload;
        console.log('[WorkstationLoader] Loaded workstation data for ' + ticker);
        if (callback) callback(payload);
      } catch (parseErr) {
        console.error('[WorkstationLoader] Failed to parse workstation data for ' + ticker + ':', parseErr);
        if (callback) callback(null);
      }
    } else if (xhr.status === 404) {
      console.warn('[WorkstationLoader] No workstation data found for ' + ticker + ' (HTTP 404)');
      if (callback) callback(null);
    } else {
      console.error('[WorkstationLoader] Failed to fetch workstation data for ' + ticker + ': HTTP ' + xhr.status);
      if (callback) callback(null);
    }
  };
  xhr.onerror = function() {
    console.error('[WorkstationLoader] Network error fetching workstation data for ' + ticker);
    if (callback) callback(null);
  };
  xhr.send();
}
