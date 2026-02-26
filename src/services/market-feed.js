/**
 * market-feed.js -- Live Price Polling & Market Status Engine
 *
 * Extracted from index.html lines ~9651-10062.
 * Provides adaptive polling for ASX market data, market status
 * detection, ticker strip rendering, and announcements loading.
 *
 * Depends on:
 *   - window.STOCK_DATA (global)
 *   - window.REFERENCE_DATA (global)
 *   - window.ContinuumDynamics (global)
 *   - Various render functions exposed on window
 */

import { STOCK_DATA, REFERENCE_DATA } from '../lib/state.js';
import { LiveData, fetchAndPatchLive } from './live-data.js';

// ============================================================
// MARKET FEED -- Live Price Polling & Market Status Engine
// ============================================================

var _pollTimer = null;
var _lastPrices = {};        // Previous prices for flash detection
var _lastFetchTime = null;
var _isPolling = false;
var _pollCount = 0;
var _errorCount = 0;

// Polling intervals (ms)
var INTERVAL_MARKET_OPEN = 60 * 1000;     // 60s during trading
var INTERVAL_PRE_MARKET = 120 * 1000;     // 2 min pre-market
var INTERVAL_CLOSED = 15 * 60 * 1000;     // 15 min when closed
var INTERVAL_ERROR_BACKOFF = 30 * 1000;   // 30s after error

// Track which tickers have had live data fetched (shared with live-data module)
var _liveFetched = new Set();

// Detect ASX market status (AEDT = UTC+11, AEST = UTC+10)
// We use UTC+11 as default (covers most of trading year)
function getMarketStatus() {
    var now = new Date();
    var day = now.getUTCDay();
    if (day === 0 || day === 6) return 'closed';

    var aedt = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    var h = aedt.getUTCHours();
    var m = aedt.getUTCMinutes();
    var t = h * 60 + m;

    if (t < 590) return 'pre-market';   // Before 9:50 AM
    if (t < 600) return 'pre-open';      // 9:50 - 10:00 AM
    if (t < 960) return 'open';          // 10:00 AM - 4:00 PM
    if (t < 972) return 'auction';       // 4:00 - 4:12 PM
    return 'closed';
}

function getNextMarketOpen() {
    var now = new Date();
    var aedt = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    var day = aedt.getUTCDay();
    var h = aedt.getUTCHours();

    // If before 10 AM on a weekday, opens today
    if (day >= 1 && day <= 5 && h < 10) {
        return 'today at 10:00 AM AEDT';
    }
    // Otherwise, next weekday
    var daysUntil = day === 5 ? 3 : day === 6 ? 2 : 1;
    return 'Monday at 10:00 AM AEDT';
}

function getPollInterval() {
    if (_errorCount >= 3) return INTERVAL_ERROR_BACKOFF;
    var status = getMarketStatus();
    if (status === 'open' || status === 'auction') return INTERVAL_MARKET_OPEN;
    if (status === 'pre-market' || status === 'pre-open') return INTERVAL_PRE_MARKET;
    return INTERVAL_CLOSED;
}

// Update the market status bar UI
function updateStatusBar(feedStatus) {
    var status = getMarketStatus();
    var dot = document.getElementById('msb-dot');
    var label = document.getElementById('msb-label');
    var updated = document.getElementById('msb-updated');
    var feedEl = document.getElementById('msb-feed-status');

    if (dot) {
        dot.className = 'msb-dot ' + status;
    }
    if (label) {
        var labels = {
            'open': 'ASX OPEN',
            'pre-open': 'ASX PRE-OPEN',
            'pre-market': 'ASX PRE-MARKET',
            'auction': 'CLOSING AUCTION',
            'closed': 'ASX CLOSED'
        };
        label.textContent = labels[status] || 'ASX CLOSED';
        label.className = 'msb-label ' + status;
    }
    if (updated && _lastFetchTime) {
        var ago = Math.round((Date.now() - _lastFetchTime) / 1000);
        var agoStr = ago < 60 ? ago + 's ago' : Math.round(ago / 60) + 'm ago';
        updated.textContent = 'Updated ' + agoStr;
    }
    if (feedEl) {
        if (feedStatus) {
            feedEl.textContent = feedStatus;
        } else if (_isPolling) {
            var ms = getMarketStatus();
            if (ms === 'open') feedEl.textContent = 'Live feed active';
            else if (ms === 'pre-open' || ms === 'pre-market') feedEl.textContent = 'Pre-market monitoring';
            else feedEl.textContent = 'After-hours  --  polling every 15m';
        }
    }
}

// Fetch from server-side live-prices.json (fast, reliable, no CORS issues)
async function fetchServerPrices() {
    try {
        var resp = await fetch('data/live-prices.json?t=' + Date.now(), {
            cache: 'no-store'
        });
        if (!resp.ok) return null;
        var data = await resp.json();
        if (!data || !data.prices) return null;
        return data;
    } catch(e) {
        return null;
    }
}

// Apply price updates from the server JSON to STOCK_DATA and UI
function applyServerPrices(data) {
    var prices = data.prices;
    var updated = 0;

    for (var ticker in prices) {
        var p = prices[ticker];
        var stock = STOCK_DATA[ticker];
        if (!stock) continue;

        var oldPrice = _lastPrices[ticker] || stock.price;
        var newPrice = p.p;

        // Update STOCK_DATA with server price
        if (newPrice && newPrice > 0) {
            stock._livePrice = newPrice;
            stock._livePrevClose = p.pc;
            stock._liveChange = p.c;
            stock._liveChangePct = p.cp;
            stock._liveVolume = p.v;

            // Detect price direction for flash animation
            var direction = null;
            if (Math.abs(newPrice - oldPrice) > 0.005) {
                direction = newPrice > oldPrice ? 'up' : 'down';
            }

            // Update featured card on home page
            updateHomeCardPrice(ticker, newPrice, p.c, p.cp, p.cur || stock.currency, direction);

            // Hydrate metrics if ContinuumDynamics is available
            if (typeof window.ContinuumDynamics !== 'undefined' && REFERENCE_DATA[ticker]) {
                window.ContinuumDynamics.onPriceUpdate(ticker, newPrice);
            }

            _lastPrices[ticker] = newPrice;
            updated++;
        }
    }

    return updated;
}

// Update a single featured card's price display
function updateHomeCardPrice(ticker, price, change, changePct, currency, direction) {
    var card = document.querySelector('[data-ticker-card="' + ticker + '"]');
    if (!card) return;

    var priceEl = card.querySelector('.fc-price');
    if (!priceEl) return;

    // Build price HTML with live dot
    var sign = change >= 0 ? '+' : '';
    var cls = change >= 0 ? 'positive' : 'negative';
    priceEl.innerHTML =
        '<span style="font-size:0.8rem; color:var(--text-muted)">' + currency + '</span>' +
        price.toFixed(2) +
        '<span class="fc-live-dot"></span>' +
        '<div class="fc-price-change ' + cls + '">' + sign + change.toFixed(2) + ' (' + sign + changePct.toFixed(1) + '%)</div>';

    // Flash animation on price change
    if (direction) {
        priceEl.classList.remove('flash-green', 'flash-red');
        void priceEl.offsetWidth; // Force reflow for re-trigger
        priceEl.classList.add(direction === 'up' ? 'flash-green' : 'flash-red');
    }
}

// Render the scrolling price ticker strip
function renderTickerStrip(data) {
    var strip = document.getElementById('price-ticker-strip');
    if (!strip || !data || !data.prices) return;

    var prices = data.prices;
    var items = '';

    // Build items for all tickers (doubled for infinite scroll effect)
    var tickers = Object.keys(STOCK_DATA);
    for (var pass = 0; pass < 2; pass++) {
        tickers.forEach(function(ticker) {
            var p = prices[ticker];
            if (!p) return;
            var sign = p.c >= 0 ? '+' : '';
            var cls = p.c >= 0 ? 'positive' : 'negative';
            items += '<span class="pt-item" onclick="navigate(\'report-' + ticker + '\')">' +
                '<span class="pt-ticker">' + ticker + '</span>' +
                '<span class="pt-price">' + (p.cur || 'A$') + p.p.toFixed(2) + '</span>' +
                '<span class="pt-change ' + cls + '">' + sign + p.cp.toFixed(1) + '%</span>' +
            '</span>';
        });
    }

    strip.innerHTML = '<div class="price-ticker-inner">' + items + '</div>';
    strip.style.display = 'flex';
}

// Main poll function
async function poll() {
    _pollCount++;
    updateStatusBar('Refreshing...');

    // Strategy 1: Try server-side live-prices.json first (fast, reliable)
    var serverData = await fetchServerPrices();
    if (serverData && serverData.prices && Object.keys(serverData.prices).length > 0) {
        var updated = applyServerPrices(serverData);
        _lastFetchTime = new Date(serverData.updated).getTime();
        _errorCount = 0;
        renderTickerStrip(serverData);
        updateStatusBar(updated + ' prices updated');

        // Also update report pages if they're rendered
        for (var ticker in serverData.prices) {
            if (_liveFetched.has(ticker)) {
                updateLiveUI(ticker);
            }
        }
        return;
    }

    // Strategy 2: Fall back to client-side Yahoo Finance fetch via CORS proxies
    // (This uses the existing LiveData module)
    try {
        var tickers = Object.keys(STOCK_DATA);
        var fetched = 0;
        for (var i = 0; i < tickers.length; i++) {
            var ticker = tickers[i];
            var stock = STOCK_DATA[ticker];
            if (!stock || !stock.tickerFull) continue;

            // Override cache TTL during market hours
            var status = getMarketStatus();
            if (status === 'open' || status === 'pre-open') {
                // Clear stale cache for this ticker during market hours
                try {
                    var cacheKey = 'continuum_market_data_' + stock.tickerFull;
                    var cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        var parsed = JSON.parse(cached);
                        // Expire cache after 2 minutes during market hours
                        if (Date.now() - parsed.ts > 2 * 60 * 1000) {
                            localStorage.removeItem(cacheKey);
                        }
                    }
                } catch(e) {}
            }

            var liveData = await LiveData.fetch(stock.tickerFull);
            if (liveData && liveData.currentPrice) {
                LiveData.patchStockData(ticker, liveData);
                _liveFetched.add(ticker);

                var oldPrice = _lastPrices[ticker] || stock.price;
                var newPrice = liveData.currentPrice;
                var change = newPrice - (liveData.previousClose || stock.price);
                var changePct = liveData.previousClose ? ((newPrice - liveData.previousClose) / liveData.previousClose) * 100 : 0;
                var direction = Math.abs(newPrice - oldPrice) > 0.005 ? (newPrice > oldPrice ? 'up' : 'down') : null;

                updateHomeCardPrice(ticker, newPrice, change, changePct, stock.currency, direction);

                if (typeof window.ContinuumDynamics !== 'undefined' && REFERENCE_DATA[ticker]) {
                    window.ContinuumDynamics.onPriceUpdate(ticker, newPrice);
                }

                _lastPrices[ticker] = newPrice;
                fetched++;
            }
        }
        if (fetched > 0) {
            _lastFetchTime = Date.now();
            _errorCount = 0;
            updateStatusBar(fetched + ' prices via live feed');
        } else {
            _errorCount++;
            updateStatusBar('Using cached prices');
        }
    } catch(e) {
        _errorCount++;
        updateStatusBar('Feed error  --  retrying');
    }
}

// Start the polling loop
function start() {
    if (_isPolling) return;
    _isPolling = true;

    // Initial fetch
    poll().then(function() {
        scheduleNext();
    });

    // Update the "X seconds ago" display every 10s
    setInterval(function() {
        updateStatusBar();
    }, 10000);

    // Listen for page visibility changes
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Pause polling when tab is hidden
            if (_pollTimer) {
                clearTimeout(_pollTimer);
                _pollTimer = null;
            }
        } else {
            // Resume immediately when tab becomes visible
            poll().then(function() {
                scheduleNext();
            });
        }
    });
}

function scheduleNext() {
    if (_pollTimer) clearTimeout(_pollTimer);
    var interval = getPollInterval();
    _pollTimer = setTimeout(function() {
        poll().then(function() {
            scheduleNext();
        });
    }, interval);
}

// Manual refresh
function refreshNow() {
    var btn = document.getElementById('msb-refresh');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '...';
    }
    poll().then(function() {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'REFRESH';
        }
        scheduleNext();
    });
}

// Load and display announcements
async function loadAnnouncements() {
    try {
        var resp = await fetch('data/announcements.json?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return;
        var data = await resp.json();
        if (!data || !data.announcements) return;

        var panel = document.getElementById('announcements-panel');
        var list = document.getElementById('ann-list');
        var updatedEl = document.getElementById('ann-updated');
        if (!panel || !list) return;

        var anns = data.announcements;
        var allItems = [];

        // Flatten all announcements across tickers
        for (var ticker in anns) {
            var items = anns[ticker];
            if (!Array.isArray(items)) continue;
            items.forEach(function(item) {
                allItems.push(Object.assign({ ticker: ticker }, item));
            });
        }

        if (allItems.length === 0) return;

        // Sort by date descending
        allItems.sort(function(a, b) {
            return new Date(b.date || 0) - new Date(a.date || 0);
        });

        // Show latest 8
        var html = '';
        allItems.slice(0, 8).forEach(function(item) {
            var timeStr = item.date ? new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
            html += '<li class="ann-item">' +
                '<span class="ann-ticker">' + item.ticker + '</span>' +
                '<span class="ann-headline">' + (item.headline || item.title || '') + '</span>' +
                (item.type ? '<span class="ann-type">' + item.type + '</span>' : '') +
                '<span class="ann-time">' + timeStr + '</span>' +
            '</li>';
        });

        list.innerHTML = html;
        panel.style.display = 'block';

        if (updatedEl && data.updated) {
            updatedEl.textContent = 'Updated ' + new Date(data.updated).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        }
    } catch(e) {
        // Announcements are optional  --  fail silently
    }
}

export const MarketFeed = {
    start: start,
    refreshNow: refreshNow,
    getMarketStatus: getMarketStatus,
    loadAnnouncements: loadAnnouncements,
    updateStatusBar: updateStatusBar
};
