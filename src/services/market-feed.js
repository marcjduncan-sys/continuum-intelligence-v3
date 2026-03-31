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
import { formatPrice, formatChange, formatSignedPercent } from '../lib/format.js';
import { LiveData, fetchAndPatchLive, updateLiveUI } from './live-data.js';

// ============================================================
// MARKET FEED -- Live Price Polling & Market Status Engine
// ============================================================

let _pollTimer = null;
const _lastPrices = {};        // Previous prices for flash detection
let _lastFetchTime = null;
let _isPolling = false;
let _pollCount = 0;
let _errorCount = 0;

// Polling intervals (ms)
const INTERVAL_MARKET_OPEN = 60 * 1000;     // 60s during trading
const INTERVAL_PRE_MARKET = 120 * 1000;     // 2 min pre-market
const INTERVAL_CLOSED = 15 * 60 * 1000;     // 15 min when closed
const INTERVAL_ERROR_BACKOFF = 30 * 1000;   // 30s after error

// Track which tickers have had live data fetched (shared with live-data module)
const _liveFetched = new Set();

// Detect ASX market status (AEDT = UTC+11, AEST = UTC+10)
// We use UTC+11 as default (covers most of trading year)
function getMarketStatus() {
    const now = new Date();
    const day = now.getUTCDay();
    if (day === 0 || day === 6) return 'closed';

    const aedt = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    const h = aedt.getUTCHours();
    const m = aedt.getUTCMinutes();
    const t = h * 60 + m;

    if (t < 590) return 'pre-market';   // Before 9:50 AM
    if (t < 600) return 'pre-open';      // 9:50 - 10:00 AM
    if (t < 960) return 'open';          // 10:00 AM - 4:00 PM
    if (t < 972) return 'auction';       // 4:00 - 4:12 PM
    return 'closed';
}

function getNextMarketOpen() {
    const now = new Date();
    const aedt = new Date(now.getTime() + 11 * 60 * 60 * 1000);
    const day = aedt.getUTCDay();
    const h = aedt.getUTCHours();

    // If before 10 AM on a weekday, opens today
    if (day >= 1 && day <= 5 && h < 10) {
        return 'today at 10:00 AM AEDT';
    }
    // Otherwise, next weekday
    const daysUntil = day === 5 ? 3 : day === 6 ? 2 : 1;
    return 'Monday at 10:00 AM AEDT';
}

function getPollInterval() {
    if (_errorCount >= 3) return INTERVAL_ERROR_BACKOFF;
    const status = getMarketStatus();
    if (status === 'open' || status === 'auction') return INTERVAL_MARKET_OPEN;
    if (status === 'pre-market' || status === 'pre-open') return INTERVAL_PRE_MARKET;
    return INTERVAL_CLOSED;
}

// Update the market status bar UI
function updateStatusBar(feedStatus) {
    const status = getMarketStatus();
    const dot = document.getElementById('msb-dot');
    const label = document.getElementById('msb-label');
    const updated = document.getElementById('msb-updated');
    const feedEl = document.getElementById('msb-feed-status');

    if (dot) {
        dot.className = 'msb-dot ' + status;
    }
    if (label) {
        const labels = {
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
        const ago = Math.round((Date.now() - _lastFetchTime) / 1000);
        const agoStr = ago < 60 ? ago + 's ago' : Math.round(ago / 60) + 'm ago';
        updated.textContent = 'Updated ' + agoStr;
    }
    if (feedEl) {
        if (feedStatus) {
            feedEl.textContent = feedStatus;
        } else if (_isPolling) {
            const ms = getMarketStatus();
            if (ms === 'open') feedEl.textContent = 'Live feed active';
            else if (ms === 'pre-open' || ms === 'pre-market') feedEl.textContent = 'Pre-market monitoring';
            else feedEl.textContent = 'After-hours  --  polling every 15m';
        }
    }
}

// Fetch from server-side live-prices.json (fast, reliable, no CORS issues)
async function fetchServerPrices() {
    try {
        const resp = await fetch('data/live-prices.json?t=' + Date.now(), {
            cache: 'no-store'
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        if (!data || !data.prices) return null;
        return data;
    } catch(e) {
        return null;
    }
}

// Apply price updates from the server JSON to STOCK_DATA and UI
function applyServerPrices(data) {
    const prices = data.prices;
    let updated = 0;

    for (const ticker in prices) {
        const p = prices[ticker];
        const stock = STOCK_DATA[ticker];
        if (!stock) continue;

        const oldPrice = _lastPrices[ticker] || stock.price;
        const newPrice = p.p;

        // Update STOCK_DATA with server price
        if (newPrice && newPrice > 0) {
            stock._livePrice = newPrice;
            stock._livePrevClose = p.pc;
            stock._liveChange = p.c;
            stock._liveChangePct = p.cp;
            stock._liveVolume = p.v;

            // Detect price direction for flash animation
            let direction = null;
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
    const card = document.querySelector('[data-ticker-card="' + ticker + '"]');
    if (!card) return;

    const priceEl = card.querySelector('.fc-price');
    if (!priceEl) return;

    // Build price HTML with live dot
    const sign = change >= 0 ? '+' : '';
    const cls = change >= 0 ? 'positive' : 'negative';
    priceEl.innerHTML =
        '<span style="font-size:0.8rem; color:var(--text-muted)">' + currency + '</span>' +
        formatPrice(price) +
        '<span class="fc-live-dot"></span>' +
        '<div class="fc-price-change ' + cls + '">' + formatChange(change) + ' (' + formatSignedPercent(changePct) + ')</div>';

    // Flash animation on price change
    if (direction) {
        priceEl.classList.remove('flash-green', 'flash-red');
        void priceEl.offsetWidth; // Force reflow for re-trigger
        priceEl.classList.add(direction === 'up' ? 'flash-green' : 'flash-red');
    }
}

// Render the scrolling price ticker strip
function renderTickerStrip(data) {
    const strip = document.getElementById('price-ticker-strip');
    if (!strip || !data || !data.prices) return;

    const prices = data.prices;
    let items = '';

    // Build items for all tickers (doubled for infinite scroll effect)
    const tickers = Object.keys(STOCK_DATA);
    for (let pass = 0; pass < 2; pass++) {
        tickers.forEach(function(ticker) {
            const p = prices[ticker];
            if (!p) return;
            const sign = p.c >= 0 ? '+' : '';
            const cls = p.c >= 0 ? 'positive' : 'negative';
            items += '<span class="pt-item" onclick="navigate(\'report-' + ticker + '\')">' +
                '<span class="pt-ticker">' + ticker + '</span>' +
                '<span class="pt-price">' + (p.cur || 'A$') + formatPrice(p.p) + '</span>' +
                '<span class="pt-change ' + cls + '">' + formatSignedPercent(p.cp) + '</span>' +
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
    const serverData = await fetchServerPrices();
    if (serverData && serverData.prices && Object.keys(serverData.prices).length > 0) {
        const updated = applyServerPrices(serverData);
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
        const tickers = Object.keys(STOCK_DATA);
        let fetched = 0;
        for (let i = 0; i < tickers.length; i++) {
            var ticker = tickers[i];
            const stock = STOCK_DATA[ticker];
            if (!stock || !stock.tickerFull) continue;

            // Override cache TTL during market hours
            const status = getMarketStatus();
            if (status === 'open' || status === 'pre-open') {
                // Clear stale cache for this ticker during market hours
                try {
                    const cacheKey = 'continuum_market_data_' + stock.tickerFull;
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        // Expire cache after 2 minutes during market hours
                        if (Date.now() - parsed.ts > 2 * 60 * 1000) {
                            localStorage.removeItem(cacheKey);
                        }
                    }
                } catch(e) { console.error('[MarketFeed] Failed to expire price cache for ' + ticker + ':', e); }
            }

            const liveData = await LiveData.fetch(stock.tickerFull);
            if (liveData && liveData.currentPrice) {
                LiveData.patchStockData(ticker, liveData);
                _liveFetched.add(ticker);

                const oldPrice = _lastPrices[ticker] || stock.price;
                const newPrice = liveData.currentPrice;
                const change = newPrice - (liveData.previousClose || stock.price);
                const changePct = liveData.previousClose ? ((newPrice - liveData.previousClose) / liveData.previousClose) * 100 : 0;
                const direction = Math.abs(newPrice - oldPrice) > 0.005 ? (newPrice > oldPrice ? 'up' : 'down') : null;

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
    }).catch(function(e) {
        console.warn('[MarketFeed] Poll error on start:', e);
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
            }).catch(function(e) {
                console.warn('[MarketFeed] Poll error on visibility resume:', e);
                scheduleNext();
            });
        }
    });
}

function scheduleNext() {
    if (_pollTimer) clearTimeout(_pollTimer);
    const interval = getPollInterval();
    _pollTimer = setTimeout(function() {
        poll().then(function() {
            scheduleNext();
        }).catch(function(e) {
            console.warn('[MarketFeed] Poll error in schedule:', e);
            scheduleNext();
        });
    }, interval);
}

// Manual refresh
function refreshNow() {
    const btn = document.getElementById('msb-refresh');
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
    }).catch(function(e) {
        console.warn('[MarketFeed] Poll error on manual refresh:', e);
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
        const resp = await fetch('data/announcements.json?t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data || !data.announcements) return;

        const panel = document.getElementById('announcements-panel');
        const list = document.getElementById('ann-list');
        const updatedEl = document.getElementById('ann-updated');
        if (!panel || !list) return;

        const anns = data.announcements;
        const allItems = [];

        // Flatten all announcements across tickers
        for (var ticker in anns) {
            const items = anns[ticker];
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
        let html = '';
        allItems.slice(0, 8).forEach(function(item) {
            const timeStr = item.date ? new Date(item.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '';
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
