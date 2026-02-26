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
import ContinuumDynamics from '../data/dynamics.js';

// ============================================================
// LiveData -- Yahoo Finance OHLCV fetcher with localStorage cache
// ============================================================

const CACHE_KEY = 'continuum_market_data';
const CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours
var _status = {}; // Per-ticker status: 'loading', 'live', 'failed'

// CORS proxies removed for security  --  third-party proxies can log/modify traffic.
// Live prices come from data/live-prices.json (updated every 15 min via GitHub Actions).
// Direct Yahoo Finance calls kept as best-effort fallback only.

// Yahoo Finance chart URLs (try multiple endpoints)
function yahooUrls(ticker) {
    return [
      'https://query1.finance.yahoo.com/v8/finance/chart/' + ticker + '?range=3y&interval=1d&includePrePost=false&events=history',
      'https://query2.finance.yahoo.com/v8/finance/chart/' + ticker + '?range=3y&interval=1d&includePrePost=false'
    ];
}

function getCache(ticker) {
    try {
      var raw = localStorage.getItem(CACHE_KEY + '_' + ticker);
      if (!raw) return null;
      var cached = JSON.parse(raw);
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
    var result = json.chart.result[0];
    var meta = result.meta;
    var timestamps = result.timestamp;
    var quote = result.indicators.quote[0];
    var adjclose = result.indicators.adjclose ? result.indicators.adjclose[0].adjclose : null;

    var bars = [];
    for (var i = 0; i < timestamps.length; i++) {
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
      var controller = new AbortController();
      opts.signal = controller.signal;
      var timer = setTimeout(function() { controller.abort(); }, ms);
      fetch(url, opts).then(function(r) { clearTimeout(timer); resolve(r); })
                       .catch(function(e) { clearTimeout(timer); reject(e); });
    });
}

async function fetchTicker(ticker) {
    var cached = getCache(ticker);
    if (cached) {
      _status[ticker] = 'live';
      return cached;
    }

    _status[ticker] = 'loading';
    var urls = yahooUrls(ticker);

    // Direct Yahoo Finance attempt (may work from some origins/browsers)
    for (var u = 0; u < urls.length; u++) {
      try {
        var resp = await fetchWithTimeout(urls[u], {
          headers: { 'Accept': 'application/json' },
          mode: 'cors'
        }, 10000);
        if (resp.ok) {
          var json = await resp.json();
          if (json.chart && json.chart.result) {
            var data = parseYahooResponse(json);
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
    var n = bars.length;
    var closes = bars.map(function(b) { return b.close; });

    function ma(arr, period) {
      if (arr.length < period) return null;
      var sum = 0;
      for (var i = arr.length - period; i < arr.length; i++) sum += arr[i];
      return sum / period;
    }

    var ma50 = ma(closes, 50);
    var ma200 = ma(closes, 200);
    var price = closes[n - 1];
    var high52 = Math.max.apply(null, closes.slice(-252));
    var low52 = Math.min.apply(null, closes.slice(-252));

    // Full MA arrays for chart
    var ma50Arr = [];
    var ma200Arr = [];
    for (var i = 0; i < n; i++) {
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
    var stock = window.STOCK_DATA[ticker];
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

    var stock = STOCK_DATA[ticker];
    if (!stock) return;

    // Show loading state in chart container
    var chartContainer = document.querySelector('#page-report-' + ticker + ' .ta-chart-container');
    if (chartContainer && !stock._liveChart) {
        chartContainer.style.position = 'relative';
        var loadingDiv = document.createElement('div');
        loadingDiv.className = 'ta-chart-loading';
        loadingDiv.id = 'chart-loading-' + ticker;
        loadingDiv.innerHTML = '<div class="spinner"></div>Fetching live market data\u2026';
        loadingDiv.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;border-radius:6px;z-index:2';
        chartContainer.appendChild(loadingDiv);
    }

    try {
        var liveData = await LiveData.fetch(stock.tickerFull);
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
    var loader = document.getElementById('chart-loading-' + ticker);
    if (loader) loader.remove();
    // Update badge text if static
    if (status === 'static') {
        var badge = document.querySelector('#page-report-' + ticker + ' .ta-chart-static-badge');
        if (badge) badge.textContent = 'STATIC \u2014 Live feed unavailable';
    }
}

export function updateLiveUI(ticker) {
    var stock = STOCK_DATA[ticker];
    if (!stock || stock._indexOnly) return;

    // 0) Re-hydrate STOCK_DATA with new live price  --  updates all metrics and narrative
    if (stock._livePrice && REFERENCE_DATA[ticker]) {
        ContinuumDynamics.onPriceUpdate(ticker, stock._livePrice);

        // Force re-render of the report page with hydrated data
        if (renderedPages.has(ticker)) {
            renderedPages.delete(ticker);
            var container = document.getElementById('page-report-' + ticker);
            if (container) {
                // Destroy Chart.js instances BEFORE DOM replacement
                destroyNarrativeTimelineChart(ticker);
                container.innerHTML = renderReport(STOCK_DATA[ticker]);
                setupScrollSpy('page-report-' + ticker);
                if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
                // Re-apply narrative analysis after re-render
                if (typeof window.applyNarrativeAnalysis === 'function') {
                    window.applyNarrativeAnalysis(ticker);
                }
                // Init narrative timeline chart after DOM render
                initNarrativeTimelineChart(ticker);
            }
            renderedPages.add(ticker);
        }

        // Update home page featured card with hydrated metrics
        var featuredCard = document.querySelector('[data-ticker-card="' + ticker + '"]');
        if (featuredCard) {
            var newCardHtml = renderFeaturedCard(stock);
            var temp = document.createElement('div');
            temp.innerHTML = newCardHtml;
            if (temp.firstElementChild) {
                featuredCard.parentNode.replaceChild(temp.firstElementChild, featuredCard);
            }
        }
    }

    // 1) Re-render the chart with live data
    var chartContainer = document.querySelector('#page-report-' + ticker + ' .ta-chart-container');
    if (chartContainer) {
        var newChartHtml = renderTAChart(stock);
        var temp = document.createElement('div');
        temp.innerHTML = newChartHtml;
        chartContainer.parentNode.replaceChild(temp.firstElementChild, chartContainer);
    }

    // 2) Update hero price with live indicator
    if (stock._livePrice) {
        var priceEl = document.querySelector('#page-report-' + ticker + ' .rh-price');
        if (priceEl) {
            var change = stock._livePrice - stock.price;
            var changePct = (change / stock.price) * 100;
            var sign = change >= 0 ? '+' : '';
            var cls = change >= 0 ? 'positive' : 'negative';
            priceEl.innerHTML = '<span class="rh-price-currency">' + stock.currency + '</span>' +
                stock._livePrice.toFixed(2) +
                '<span class="rh-live-indicator"><span class="live-dot"></span>LIVE</span>' +
                '<div class="rh-price-change ' + cls + '">' + sign + change.toFixed(2) + ' (' + sign + changePct.toFixed(1) + '%)</div>';
        }
    }

    // 3) Update featured card price on home page
    var homeCard = document.querySelector('[data-ticker-card="' + ticker + '"] .fc-price');
    if (homeCard && stock._livePrice) {
        homeCard.textContent = stock.currency + stock._livePrice.toFixed(2);
    }
}

// Prefetch live data for all tickers on page load (background, staggered)
export function prefetchAllLiveData() {
    var tickers = Object.keys(STOCK_DATA);
    var delay = 0;
    tickers.forEach(function(ticker) {
        setTimeout(function() {
            var stock = STOCK_DATA[ticker];
            if (stock && stock.tickerFull) {
                LiveData.fetch(stock.tickerFull).then(function(liveData) {
                    if (liveData) {
                        LiveData.patchStockData(ticker, liveData);
                        _liveFetched.add(ticker);

                        // Re-hydrate with live price  --  updates metrics, narrative, everything
                        if (REFERENCE_DATA[ticker]) {
                            ContinuumDynamics.onPriceUpdate(ticker, liveData.currentPrice);
                        }

                        // Update home card with fully hydrated data
                        var featuredCard = document.querySelector('[data-ticker-card="' + ticker + '"]');
                        if (featuredCard) {
                            var newCardHtml = renderFeaturedCard(stock);
                            var temp = document.createElement('div');
                            temp.innerHTML = newCardHtml;
                            if (temp.firstElementChild) {
                                featuredCard.parentNode.replaceChild(temp.firstElementChild, featuredCard);
                            }
                        }
                    }
                }).catch(function() {});
            }
        }, delay);
        delay += 500; // Stagger by 500ms to avoid rate limiting
    });
}
