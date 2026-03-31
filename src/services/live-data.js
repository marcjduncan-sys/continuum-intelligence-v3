/**
 * live-data.js -- Yahoo Finance integration + caching
 *
 * Extracted from index.html lines ~9303-9646.
 * Provides live price fetching, localStorage caching, technical
 * analysis computation, and STOCK_DATA patching.
 *
 * Depends on:
 *   - window.STOCK_DATA (global)
 *   - window.REFERENCE_DATA (global)
 *   - window.ContinuumDynamics (global)
 *   - Various render functions exposed on window
 */

import { STOCK_DATA, REFERENCE_DATA } from '../lib/state.js';
import { renderedPages } from '../lib/router.js';
import { renderFeaturedCard } from '../pages/home.js';
import { renderTAChart, setupScrollSpy, initNarrativeTimelineChart, destroyNarrativeTimelineChart } from '../pages/report-sections.js';
import { renderReport } from '../pages/report.js';
import { renderSourceUploadZone, initSourceUpload } from '../features/source-upload.js';
import { initSourcesPanel, appendSource } from '../features/sources-panel.js';
import { initStalenessBadge } from '../features/staleness-badge.js';
import ContinuumDynamics from '../data/dynamics.js';
import { API_BASE } from '../lib/api-config.js';

// ============================================================
// LiveData -- Yahoo Finance OHLCV fetcher with localStorage cache
// ============================================================

const CACHE_KEY = 'continuum_market_data';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
const _status = {}; // Per-ticker status: 'loading', 'live', 'failed'

// Live prices come from data/live-prices.json (updated every 15 min via GitHub Actions).
// OHLCV chart data routes through the Railway backend proxy to avoid CORS blocks.
// Direct Yahoo Finance calls kept as best-effort fallback only (works in dev, blocked on GH Pages).

// Railway API base (centralised in api-config.js)
const _CHART_API_BASE = API_BASE;

// Chart data URLs: Railway proxy only. Direct Yahoo calls are CORS-blocked
// from GitHub Pages and generate noisy console errors.
function chartUrls(ticker) {
    const clean = ticker.replace(/\.AX$/i, '');
    return [_CHART_API_BASE + '/api/chart/' + clean];
}

function getCache(ticker) {
    try {
      const raw = localStorage.getItem(CACHE_KEY + '_' + ticker);
      if (!raw) return null;
      const cached = JSON.parse(raw);
      if (Date.now() - cached.ts > CACHE_TTL) return null;
      return cached.data;
    } catch(e) { return null; }
}

function setCache(ticker, data) {
    try {
      localStorage.setItem(CACHE_KEY + '_' + ticker, JSON.stringify({ ts: Date.now(), data: data }));
    } catch(e) { /* quota exceeded  --  ignore */ }
}

function parseYahooResponse(json) {
    const result = json.chart.result[0];
    const meta = result.meta;
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    const adjclose = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : null;

    const bars = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (quote.close[i] == null) continue;
      bars.push({
        date: new Date(timestamps[i] * 1000),
        open:  quote.open[i],
        high:  quote.high[i],
        low:   quote.low[i],
        close: quote.close[i],
        volume: quote.volume[i],
        adjclose: adjclose ? adjclose[i] : quote.close[i]
      });
    }

    return {
      ticker: meta.symbol,
      currency: meta.currency === 'AUD' ? 'A$' : meta.currency + ' ',
      currentPrice: meta.regularMarketPrice,
      previousClose: meta.chartPreviousClose,
      bars: bars
    };
}

// Timeout wrapper that works in all browsers
function fetchWithTimeout(url, opts, ms) {
    return new Promise(function(resolve, reject) {
      const controller = new AbortController();
      opts.signal = controller.signal;
      const timer = setTimeout(function() { controller.abort(); }, ms);
      fetch(url, opts).then(function(r) { clearTimeout(timer); resolve(r); })
                       .catch(function(e) { clearTimeout(timer); reject(e); });
    });
}

async function fetchTicker(ticker) {
    const cached = getCache(ticker);
    if (cached) {
      _status[ticker] = 'live';
      return cached;
    }

    _status[ticker] = 'loading';
    const urls = chartUrls(ticker);

    // Direct Yahoo Finance attempt (may work from some origins/browsers)
    for (let u = 0; u < urls.length; u++) {
      try {
        const resp = await fetchWithTimeout(urls[u], {
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        }, 10000);
        if (resp.ok) {
          const json = await resp.json();
          if (json.chart && json.chart.result) {
            const data = parseYahooResponse(json);
            if (data.bars.length > 100) {
              setCache(ticker, data);
              _status[ticker] = 'live';
              return data;
            }
          }
        }
      } catch(e) { /* expected CORS block */ }
    }

    _status[ticker] = 'failed';
    return null;
}

// Compute technical metrics from live bar data
function computeLiveTA(bars, staticTA) {
    if (!bars || bars.length < 50) return null;
    const n = bars.length;
    const closes = bars.map(function(b) { return b.close; });

    function ma(arr, period) {
      if (arr.length < period) return null;
      let sum = 0;
      for (let i = arr.length - period; i < arr.length; i++) sum += arr[i];
      return sum / period;
    }

    const ma50 = ma(closes, 50);
    const ma200 = ma(closes, 200);
    const price = closes[n - 1];
    const high52 = Math.max.apply(null, closes.slice(-252));
    const low52 = Math.min.apply(null, closes.slice(-252));

    // Full MA arrays for chart
    const ma50Arr = [];
    const ma200Arr = [];
    for (let i = 0; i < n; i++) {
      if (i >= 49) {
        var s = 0; for (var j = i - 49; j <= i; j++) s += closes[j];
        ma50Arr.push(s / 50);
      } else { ma50Arr.push(null); }
      if (i >= 199) {
        var s = 0; for (var j = i - 199; j <= i; j++) s += closes[j];
        ma200Arr.push(s / 200);
      } else { ma200Arr.push(null); }
    }

    return {
      price: price,
      ma50: ma50,
      ma200: ma200,
      ma50Arr: ma50Arr,
      ma200Arr: ma200Arr,
      priceVsMa50: ma50 ? ((price / ma50) - 1) * 100 : null,
      priceVsMa200: ma200 ? ((price / ma200) - 1) * 100 : null,
      high52: high52,
      low52: low52,
      drawdown: ((price - high52) / high52) * 100,
      rangePosition: high52 !== low52 ? ((price - low52) / (high52 - low52)) * 100 : 50,
      bars: bars
    };
}

// Patch a STOCK_DATA entry with live data
function patchStockData(ticker, liveData) {
    const stock = STOCK_DATA[ticker];
    if (!stock || !liveData) return;

    // Store live chart data on the stock object
    stock._liveChart = liveData;
    stock._liveTA = computeLiveTA(liveData.bars, stock.technicalAnalysis);

    // Update the displayed price
    if (liveData.currentPrice) {
      stock._livePrice = liveData.currentPrice;
    }
}

export const LiveData = {
    fetch: fetchTicker,
    patchStockData: patchStockData,
    getCache: getCache,
    status: function(ticker) { return _status[ticker] || 'idle'; }
};


// ============================================================
// LIVE DATA WIRING
// Fetches live data for a ticker, patches STOCK_DATA, then
// updates the chart container and hero price in-place.
// ============================================================

const _liveFetched = new Set();

export async function fetchAndPatchLive(ticker) {
    if (_liveFetched.has(ticker)) {
        // Already fetched this session  --  just ensure UI is current
        updateLiveUI(ticker);
        return;
    }

    const stock = STOCK_DATA[ticker];
    if (!stock) return;

    // Show loading state in chart container
    const chartContainer = document.querySelector('#page-report-' + ticker + ' .ta-chart-container');
    if (chartContainer && !stock._liveChart) {
        chartContainer.style.position = 'relative';
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'ta-chart-loading';
        loadingDiv.id = 'chart-loading-' + ticker;
        loadingDiv.innerHTML = '<div class="spinner"></div>Fetching live market data\u2026';
        loadingDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;border-radius:6px;z-index:2';
        chartContainer.appendChild(loadingDiv);
    }

    try {
        const liveData = await LiveData.fetch(stock.tickerFull);
        if (liveData) {
            LiveData.patchStockData(ticker, liveData);
            _liveFetched.add(ticker);
            updateLiveUI(ticker);
        } else {
            _liveFetched.add(ticker);
            showDataStatus(ticker, 'static');
        }
    } catch(e) {
        _liveFetched.add(ticker);
        showDataStatus(ticker, 'static');
    }
}

export function showDataStatus(ticker, status) {
    // Remove any loading overlay
    const loader = document.getElementById('chart-loading-' + ticker);
    if (loader) loader.remove();
    // Update badge text if static
    if (status === 'static') {
        const badge = document.querySelector('#page-report-' + ticker + ' .ta-chart-static-badge');
        if (badge) badge.textContent = 'STATIC \u2014 Live feed unavailable';
    }
}

function _initSourcesAfterRerender(ticker) {
    const t = ticker.toLowerCase();
    const uploadMount = document.getElementById('src-upload-mount-' + t);
    if (uploadMount) {
        if (!uploadMount.querySelector('.src-upload-zone')) {
            uploadMount.innerHTML = renderSourceUploadZone(ticker);
        }
        initSourceUpload(ticker, function(sourceData) {
            appendSource(sourceData, ticker);
        });
    }
    const panelMount = document.getElementById('src-panel-mount-' + t);
    if (panelMount) {
        initSourcesPanel(ticker);
    }
    initStalenessBadge(ticker, STOCK_DATA[ticker.toUpperCase()] || STOCK_DATA[ticker]);
}

export function updateLiveUI(ticker) {
    const stock = STOCK_DATA[ticker];
    if (!stock || stock._indexOnly) return;

    // 0) Re-hydrate STOCK_DATA with new live price  --  updates all metrics and narrative
    if (stock._livePrice && REFERENCE_DATA[ticker]) {
        ContinuumDynamics.onPriceUpdate(ticker, stock._livePrice);

        // Force re-render of the report page with hydrated data
        if (renderedPages.has(ticker)) {
            renderedPages.delete(ticker);
            const container = document.getElementById('page-report-' + ticker);
            if (container) {
                // Destroy Chart.js instances BEFORE DOM replacement
                destroyNarrativeTimelineChart(ticker);
                container.innerHTML = renderReport(STOCK_DATA[ticker]);
                if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
                setupScrollSpy('page-report-' + ticker);
                if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
                // Re-apply narrative analysis after re-render
                if (typeof window.applyNarrativeAnalysis === 'function') {
                    window.applyNarrativeAnalysis(ticker);
                }
                // Init narrative timeline chart after DOM render
                initNarrativeTimelineChart(ticker);
                // Re-init external research upload zone and sources panel
                _initSourcesAfterRerender(ticker);
            }
            renderedPages.add(ticker);
        }

        // Update home page featured card with hydrated metrics
        const featuredCard = document.querySelector('[data-ticker-card="' + ticker + '"]');
        if (featuredCard) {
            const newCardHtml = renderFeaturedCard(stock);
            var temp = document.createElement('div');
            temp.innerHTML = newCardHtml;
            if (temp.firstElementChild) {
                featuredCard.parentNode.replaceChild(temp.firstElementChild, featuredCard);
            }
        }
    }

    // 1) Re-render the chart with live data
    const chartContainer = document.querySelector('#page-report-' + ticker + ' .ta-chart-container');
    if (chartContainer) {
        const newChartHtml = renderTAChart(stock);
        var temp = document.createElement('div');
        temp.innerHTML = newChartHtml;
        chartContainer.parentNode.replaceChild(temp.firstElementChild, chartContainer);
    }

    // 2) Update hero price with live indicator
    // Rule 7.11: never derive change from stock.price (overwritten to live price).
    // Use server-supplied _liveChange/_liveChangePct from applyServerPrices().
    if (stock._livePrice) {
        const priceEl = document.querySelector('#page-report-' + ticker + ' .rh-price');
        if (priceEl) {
            const change = stock._liveChange !== undefined ? stock._liveChange : 0;
            const changePct = stock._liveChangePct !== undefined ? stock._liveChangePct : 0;
            const sign = change >= 0 ? '+' : '';
            const cls = change >= 0 ? 'positive' : 'negative';
            priceEl.innerHTML = '<span class="rh-price-currency">' + stock.currency + '</span>' +
                stock._livePrice.toFixed(2) +
                '<span class="rh-live-indicator"><span class="live-dot"></span>LIVE</span>' +
                '<div class="rh-price-change ' + cls + '">' + sign + change.toFixed(2) + ' (' + sign + changePct.toFixed(1) + '%)</div>';
        }
    }

    // 3) Update featured card price on home page
    const homeCard = document.querySelector('[data-ticker-card="' + ticker + '"] .fc-price');
    if (homeCard && stock._livePrice) {
        homeCard.textContent = stock.currency + stock._livePrice.toFixed(2);
    }
}

// Prefetch live data for all tickers on page load (background, staggered)
export function prefetchAllLiveData() {
    const tickers = Object.keys(STOCK_DATA);
    let delay = 0;
    tickers.forEach(function(ticker) {
        setTimeout(function() {
            const stock = STOCK_DATA[ticker];
            if (!stock || !stock.tickerFull) return;
            // Skip if already fetched this session
            if (_liveFetched.has(ticker)) return;
            LiveData.fetch(stock.tickerFull).then(function(liveData) {
                if (liveData) {
                    LiveData.patchStockData(ticker, liveData);
                    _liveFetched.add(ticker);

                    // Re-hydrate with live price  --  updates metrics, narrative, everything
                    if (REFERENCE_DATA[ticker]) {
                        ContinuumDynamics.onPriceUpdate(ticker, liveData.currentPrice);
                    }

                    // Update home card with fully hydrated data
                    const featuredCard = document.querySelector('[data-ticker-card="' + ticker + '"]');
                    if (featuredCard) {
                        const newCardHtml = renderFeaturedCard(stock);
                        const temp = document.createElement('div');
                        temp.innerHTML = newCardHtml;
                        if (temp.firstElementChild) {
                            featuredCard.parentNode.replaceChild(temp.firstElementChild, featuredCard);
                        }
                    }
                }
            }).catch(function() {});
        }, delay);
        delay += 1000; // Stagger by 1s to stay well within rate limits
    });
}
