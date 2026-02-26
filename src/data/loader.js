// ============================================================
// LOADER.JS -- Data fetching extracted from index.html
// Handles loading full research data on demand, building
// coverage data, and building snapshot data from stock data.
// ============================================================

import { STOCK_DATA, SNAPSHOT_DATA } from '../lib/state.js';
import { computeSkewScore, normaliseScores } from '../lib/dom.js';

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
    var cached = localStorage.getItem('ci_research_' + ticker);
    if (cached) {
      var cachedData = JSON.parse(cached);
      // Use cached data if it has a _lastRefreshed timestamp (written by refresh pipeline)
      if (cachedData._lastRefreshed) {
        var livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
        var livePriceHistory = STOCK_DATA[ticker] ? STOCK_DATA[ticker].priceHistory : undefined;
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
        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
          window.ContinuumDynamics.hydrate(ticker);
        }
        // Re-build snapshot data
        SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
        console.log('[StockDataLoader] Loaded full research data for ' + ticker);
        // Also merge signal fields from data/stocks/TICKER.json
        var sigUrl = 'data/stocks/' + ticker + '.json';
        var sigXhr = new XMLHttpRequest();
        sigXhr.open('GET', sigUrl, true);
        sigXhr.onload = function() {
          if (sigXhr.status === 200) {
            try {
              var sd = JSON.parse(sigXhr.responseText);
              if (sd.three_layer_signal) STOCK_DATA[ticker].three_layer_signal = sd.three_layer_signal;
              if (sd.valuation_range)    STOCK_DATA[ticker].valuation_range    = sd.valuation_range;
              if (sd.price_signals && sd.price_signals.length)
                STOCK_DATA[ticker].price_signals = sd.price_signals;
            } catch(e) {}
          }
          if (callback) callback(STOCK_DATA[ticker]);
        };
        sigXhr.onerror = function() { if (callback) callback(STOCK_DATA[ticker]); };
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
  var coverageData = {};
  var tickers = Object.keys(STOCK_DATA);
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    var d = STOCK_DATA[t];
    coverageData[t] = {
      company: d.company,
      price: d.price,
      skew: computeSkewScore(d).direction,
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
  var stock = STOCK_DATA[ticker];
  if (!stock) return null;

  // 1. Clone hypotheses -- already sorted by prepareHypotheses (disconfirmation ranking)
  var hyps = [];
  for (var i = 0; i < stock.hypotheses.length; i++) {
    var h = stock.hypotheses[i];
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
  var tierMap = {};
  for (var i = 0; i < hyps.length; i++) {
    tierMap[hyps[i].originalTier] = i;
  }

  // Build N-reference remapper for snapshot text fields
  var snapRemapN = function(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\bN([1-4])\b/g, function(m, n) {
      var oldTier = 'n' + n;
      var newIdx = tierMap[oldTier];
      return newIdx !== undefined ? 'N' + (newIdx + 1) : m;
    });
  };

  // 2. Normalise scores to 100% with v3 floor/ceiling
  var normScores = normaliseScores(hyps);

  // 3. Direction -> CSS class mappings
  var dirCls = { upside: 'snap-upside', downside: 'snap-downside', neutral: 'snap-neutral' };
  var dirSbCls = { upside: 'snap-sb-upside', downside: 'snap-sb-downside', neutral: 'snap-sb-neutral' };
  var dirColor = { upside: 'var(--signal-green)', downside: 'var(--signal-red)', neutral: 'var(--signal-amber)' };
  var dirScoreCls = { upside: 'priced', downside: 'high', neutral: 'medium' };
  var statusTagMap = { priced: 'snap-tag-priced', accumulating: 'snap-tag-accumulating', active: 'snap-tag-tail', minimal: 'snap-tag-minimal' };

  // Parse direction and label from scoreMeta
  function parseDirMeta(meta) {
    if (!meta) return { direction: 'flat', dirLabel: '&rarr; Steady' };
    var label = meta.replace(/^[^&]*/, '').trim();
    if (!label) label = meta;
    if (meta.indexOf('&uarr;') >= 0) return { direction: 'up', dirLabel: label };
    if (meta.indexOf('&darr;') >= 0) return { direction: 'down', dirLabel: label };
    return { direction: 'flat', dirLabel: label };
  }

  // 4. Build survival bar
  var survivalBar = [];
  var survivalLegend = [];
  for (var i = 0; i < hyps.length; i++) {
    survivalBar.push({
      cls: dirSbCls[hyps[i].direction] || 'snap-sb-neutral',
      width: normScores[i] + '%',
      label: 'N' + (i + 1) + ': ' + normScores[i] + '%'
    });
    survivalLegend.push({
      color: dirColor[hyps[i].direction] || 'var(--signal-amber)',
      label: hyps[i].title
    });
  }

  // 5. Build hypothesis cards
  var snapHyps = [];
  for (var i = 0; i < hyps.length; i++) {
    var dm = parseDirMeta(hyps[i].scoreMeta);
    var desc = hyps[i].description;
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
  var matrixHeaders = ['Domain'];
  for (var i = 0; i < hyps.length; i++) {
    matrixHeaders.push('N' + (i + 1) + ' ' + hyps[i].title.substring(0, 12));
  }

  var matrixRows = [];
  var cards = stock.evidence && stock.evidence.cards ? stock.evidence.cards : [];
  var maxCards = Math.min(cards.length, 8);
  for (var c = 0; c < maxCards; c++) {
    var card = cards[c];
    var cells = [];
    for (var h2 = 0; h2 < hyps.length; h2++) {
      cells.push({ cls: 'snap-signal-neutral', text: '&mdash;' });
    }
    if (card.tags) {
      for (var t = 0; t < card.tags.length; t++) {
        var tag = card.tags[t];
        var tierMatch = tag.text.match(/N(\d)/);
        if (tierMatch) {
          var origTier = 'n' + tierMatch[1];
          var newPos = tierMap[origTier];
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
    var domainName = card.title.replace(/^\d+\.\s*/, '');
    var epistemic = card.epistemicLabel || '';
    if (epistemic.indexOf('/') >= 0) epistemic = epistemic.split('/')[0].trim();
    matrixRows.push({ domain: domainName, epistemic: epistemic, cells: cells });
  }

  // 7. Build discriminators
  var snapDiscrim = [];
  var discRows = stock.discriminators && stock.discriminators.rows ? stock.discriminators.rows : [];
  for (var d = 0; d < Math.min(discRows.length, 4); d++) {
    var disc = discRows[d];
    snapDiscrim.push({
      level: disc.diagnosticity,
      cls: disc.diagnosticityClass.replace('disc-', ''),
      text: snapRemapN(disc.evidence)
    });
  }

  // Non-discriminating chips
  var ndText = stock.discriminators && stock.discriminators.nonDiscriminating ? stock.discriminators.nonDiscriminating : '';
  var ndChips = [];
  if (typeof ndText === 'string') {
    var parts = ndText.split('&bull;');
    for (var p = 0; p < Math.min(parts.length, 5); p++) {
      var chip = parts[p].replace(/<[^>]+>/g, '').trim();
      if (chip) ndChips.push(chip);
    }
  }

  // 8. Build tripwires
  var snapTripwires = [];
  var tripCards = stock.tripwires && stock.tripwires.cards ? stock.tripwires.cards : [];
  for (var tc2 = 0; tc2 < Math.min(tripCards.length, 4); tc2++) {
    var tw = tripCards[tc2];
    var conds = [];
    for (var co = 0; co < tw.conditions.length; co++) {
      var cond = tw.conditions[co];
      var icon = cond.valence === 'positive' ? '&#9650;' : '&#9660;';
      var iconCls = cond.valence === 'positive' ? 'up' : 'down';
      var condText = snapRemapN(cond.if.replace(/^If\s+/i, ''));
      var thenShort = snapRemapN(cond.then.split('.')[0]);
      conds.push({ icon: icon, iconCls: iconCls, text: condText + ' &rarr; ' + thenShort });
    }
    snapTripwires.push({ date: tw.date, name: tw.name.replace(/\s*&mdash;.*/, ''), conditions: conds });
  }

  // 9. Evidence coverage
  var snapCoverage = [];
  var coverageRows = stock.gaps && stock.gaps.coverageRows ? stock.gaps.coverageRows : [];
  for (var g = 0; g < Math.min(coverageRows.length, 8); g++) {
    var gr = coverageRows[g];
    var sCls = gr.coverageLevel === 'full' || gr.coverageLevel === 'good' ? 'snap-gap-full' :
              gr.coverageLevel === 'partial' ? 'snap-gap-partial' : 'snap-gap-limited';
    snapCoverage.push({ domain: gr.domain, status: gr.coverageLabel.toUpperCase(), cls: sCls });
  }

  // 10. Questions from gaps
  var snapQuestions = [];
  var couldntAssess = stock.gaps && stock.gaps.couldntAssess ? stock.gaps.couldntAssess : [];
  for (var q = 0; q < Math.min(couldntAssess.length, 3); q++) {
    snapQuestions.push(couldntAssess[q].replace(/<[^>]+>/g, ''));
  }

  // 11. Price metrics from heroMetrics
  var priceMetrics = [];
  for (var m = 0; m < stock.heroMetrics.length; m++) {
    priceMetrics.push({
      label: stock.heroMetrics[m].label,
      value: stock.heroMetrics[m].value,
      cls: stock.heroMetrics[m].colorClass || ''
    });
  }

  // 12. Skew badge -- derived from computed score, not static data
  var skewComputed = computeSkewScore(stock);
  var skewBadge = skewComputed.direction === 'downside' ? '&#9660; DOWNSIDE' :
                  skewComputed.direction === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';

  // 13. Date formatting
  var dateStr = stock.date;
  var dateMatch = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
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
    riskSkew: { direction: skewComputed.direction, badge: skewBadge, rationale: stock.skew.rationale, computed: skewComputed },
    narrative: { text: stock.narrative.theNarrative || '', verdict: stock.verdict.text || '' },
    survivalBar: survivalBar,
    survivalLegend: survivalLegend,
    hypotheses: snapHyps,
    evidenceMatrix: { headers: matrixHeaders, rows: matrixRows },
    discriminators: snapDiscrim,
    nonDiscriminating: ndChips,
    tripwires: snapTripwires,
    evidenceCoverage: snapCoverage,
    questions: snapQuestions,
    technicalAnalysis: stock.technicalAnalysis ? {
      regime: stock.technicalAnalysis.regime,
      trend: stock.technicalAnalysis.trend.direction + ' (' + stock.technicalAnalysis.trend.duration + ')',
      ma50: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.movingAverages.ma50.value.toFixed(2),
      ma200: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.movingAverages.ma200.value.toFixed(2),
      vsMa50: stock.technicalAnalysis.movingAverages.priceVsMa50.toFixed(1) + '%',
      vsMa200: stock.technicalAnalysis.movingAverages.priceVsMa200.toFixed(1) + '%',
      support: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.keyLevels.support.price.toFixed(2),
      resistance: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.keyLevels.resistance.price.toFixed(2),
      rangePosition: 'Lower ' + stock.technicalAnalysis.meanReversion.rangePosition + '%',
      crossover: stock.technicalAnalysis.movingAverages.crossover ? stock.technicalAnalysis.movingAverages.crossover.type + ' (' + stock.technicalAnalysis.movingAverages.crossover.date + ')' : null
    } : null,
    footerDisclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using ACH methodology. All data sourced from ASX filings, broker consensus, and publicly available data as at report date. Hypothesis scores reflect editorial assessment.',
    footerMeta: [
      { label: 'ID: ' + stock.reportId },
      { label: 'MODE: Narrative Intelligence' },
      { label: 'NEXT: Mar 2026' }
    ]
  };
}
