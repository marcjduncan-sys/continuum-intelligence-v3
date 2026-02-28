/**
 * batch-refresh.js -- Single-ticker refresh + Batch Refresh All modal
 *
 * Extracted from index.html lines ~11438-12125.
 * Contains triggerRefresh (single ticker), batch refresh modal,
 * polling, incremental caching, and result merging.
 *
 * Depends on:
 *   - window.STOCK_DATA (global)
 *   - window.REFERENCE_DATA (global)
 *   - Various render functions exposed on window
 */

import { STOCK_DATA } from '../lib/state.js';

// ============================================================
// REFRESH API BASE (localhost detection pattern)
// ============================================================
var REFRESH_API_BASE = window.location.hostname.includes('github.io')
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';  // Same origin (Vite proxy in dev, Railway in prod)

var _refreshPollers = {};

// ============================================================
// SINGLE-TICKER REFRESH
// ============================================================

async function triggerRefresh(ticker) {
    ticker = ticker.toUpperCase();
    var btn = document.getElementById('refresh-btn-' + ticker);
    var progress = document.getElementById('refresh-progress-' + ticker);
    var fill = document.getElementById('refresh-fill-' + ticker);
    var label = document.getElementById('refresh-label-' + ticker);
    var ts = document.getElementById('refresh-ts-' + ticker);

    if (!btn) return;

    // Disable button, show progress
    btn.disabled = true;
    btn.classList.add('refreshing');
    if (progress) progress.style.display = 'flex';
    if (fill) fill.style.width = '5%';
    if (label) label.textContent = 'Starting refresh...';

    try {
        // POST to trigger refresh
        var resp = await fetch(REFRESH_API_BASE + '/api/refresh/' + ticker, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (resp.status === 409) {
            if (label) label.textContent = 'Refresh already in progress...';
            // Still poll for status
        } else if (!resp.ok) {
            var errData = await resp.json().catch(function() { return {}; });
            throw new Error(errData.detail || 'Refresh failed (' + resp.status + ')');
        }

        // Start polling for status
        _pollRefreshStatus(ticker);

    } catch (err) {
        console.error('Refresh error:', err);
        if (label) label.textContent = 'Error: ' + err.message;
        setTimeout(function() {
            _resetRefreshUI(ticker);
        }, 4000);
    }
}

function _pollRefreshStatus(ticker) {
    // Clear any existing poller
    if (_refreshPollers[ticker]) clearInterval(_refreshPollers[ticker]);

    _refreshPollers[ticker] = setInterval(async function() {
        try {
            var resp = await fetch(REFRESH_API_BASE + '/api/refresh/' + ticker + '/status');
            if (!resp.ok) return;

            var data = await resp.json();
            var fill = document.getElementById('refresh-fill-' + ticker);
            var label = document.getElementById('refresh-label-' + ticker);

            if (fill) fill.style.width = data.progress_pct + '%';
            if (label) label.textContent = data.stage_label;

            if (data.status === 'completed') {
                clearInterval(_refreshPollers[ticker]);
                delete _refreshPollers[ticker];

                // Fetch updated data
                try {
                    var resultResp = await fetch(REFRESH_API_BASE + '/api/refresh/' + ticker + '/result');
                    if (resultResp.ok) {
                        var updatedData = await resultResp.json();
                        // Normalise ISO currency codes to symbols
                        var currencyMap = {'AUD':'A$','USD':'US$','GBP':'\u00A3','EUR':'\u20AC'};
                        if (updatedData.currency && currencyMap[updatedData.currency]) {
                            updatedData.currency = currencyMap[updatedData.currency];
                        }
                        // Merge into global stock data, preserving live price patches
                        if (typeof STOCK_DATA !== 'undefined') {
                            var livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
                            STOCK_DATA[ticker] = updatedData;
                            if (livePrice !== undefined) STOCK_DATA[ticker]._livePrice = livePrice;
                        }
                        // Cache in localStorage so refresh survives page reload
                        try {
                            localStorage.setItem('ci_research_' + ticker.toUpperCase(), JSON.stringify(updatedData));
                            console.log('[RefreshCache] Cached refresh result for ' + ticker);
                        } catch (lsErr) {
                            console.warn('[RefreshCache] localStorage write failed:', lsErr);
                        }
                        // Hydrate computed fields (market cap, P/E, narrative text, hypothesis scores)
                        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
                            window.ContinuumDynamics.hydrate(ticker);
                        }
                        // Destroy Chart.js instances before DOM replacement
                        if (typeof window.destroyNarrativeTimelineChart === 'function') {
                            window.destroyNarrativeTimelineChart(ticker);
                        }
                        // Re-render the report page
                        var container = document.getElementById('page-report-' + ticker);
                        if (container && typeof window.renderReportPage === 'function') {
                            container.innerHTML = window.renderReportPage(STOCK_DATA[ticker]);
                            if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
                            // Re-initialise scroll spy and charts
                            if (typeof window.setupScrollSpy === 'function') window.setupScrollSpy('page-report-' + ticker);
                            if (typeof window.initNarrativeTimelineChart === 'function') window.initNarrativeTimelineChart(ticker);
                            if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
                        }
                    }
                } catch (e) {
                    console.error('Failed to fetch refresh result:', e);
                }

                // Show completion briefly then reset
                if (fill) fill.style.width = '100%';
                if (label) label.textContent = 'Complete!';
                setTimeout(function() { _resetRefreshUI(ticker); }, 2000);
            }

            if (data.status === 'failed') {
                clearInterval(_refreshPollers[ticker]);
                delete _refreshPollers[ticker];
                if (label) label.textContent = 'Failed: ' + (data.error || 'Unknown error');
                setTimeout(function() { _resetRefreshUI(ticker); }, 5000);
            }

        } catch (e) {
            console.error('Status poll error:', e);
        }
    }, 2000);  // Poll every 2 seconds
}

function _resetRefreshUI(ticker) {
    var btn = document.getElementById('refresh-btn-' + ticker);
    var progress = document.getElementById('refresh-progress-' + ticker);
    var fill = document.getElementById('refresh-fill-' + ticker);

    if (btn) {
        btn.disabled = false;
        btn.classList.remove('refreshing');
    }
    if (progress) progress.style.display = 'none';
    if (fill) fill.style.width = '0%';
}

// ============================================================
// BATCH REFRESH (Refresh All)
// ============================================================
var _batchPoller = null;
var _batchStartTime = null;
var _batchCachedTickers = {};

async function triggerRefreshAll() {
    var btn = document.getElementById('btn-refresh-all');
    if (btn) { btn.disabled = true; btn.textContent = 'Refreshing...'; }

    try {
        // On retry, send only tickers not already cached this session
        var cachedKeys = Object.keys(_batchCachedTickers).filter(function(k) { return _batchCachedTickers[k]; });
        var bodyPayload = {};
        if (cachedKeys.length > 0) {
            var allTickers = ['BHP','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
            var remaining = allTickers.filter(function(t) { return cachedKeys.indexOf(t) === -1; });
            if (remaining.length > 0) bodyPayload.tickers = remaining;
        }

        var resp = await fetch(REFRESH_API_BASE + '/api/refresh-all', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload)
        });

        if (resp.status === 409) {
            // Already running -- just open modal and start polling
            _showBatchModal();
            _startBatchPolling();
            return;
        }

        if (!resp.ok) {
            var err = await resp.json().catch(function() { return {}; });
            throw new Error(err.detail || 'Batch refresh failed (' + resp.status + ')');
        }

        var data = await resp.json();
        _batchStartTime = Date.now();
        // Don't reset _batchCachedTickers -- preserve already-cached from prior run

        // Build the grid showing all 21 tickers (cached ones pre-marked green)
        var allTickers = ['BHP','CBA','CSL','DRO','DXS','FMG','GMG','GYG','HRZ','MQG','NAB','OCL','PME','RFG','RIO','SIG','WDS','WOR','WOW','WTC','XRO'];
        _buildBatchGrid(allTickers);
        _showBatchModal();
        _startBatchPolling();

    } catch (err) {
        console.error('Batch refresh error:', err);
        alert('Failed to start batch refresh: ' + err.message);
        if (btn) { btn.disabled = false; btn.textContent = '\u21BB Refresh All Research'; }
    }
}

function _buildBatchGrid(tickers) {
    var grid = document.getElementById('batch-ticker-grid');
    if (!grid) return;
    var html = '';
    for (var i = 0; i < tickers.length; i++) {
        var t = tickers[i];
        var isCached = _batchCachedTickers[t];
        var statusClass = isCached ? 'status-completed' : 'status-queued';
        var icon = isCached ? '\u2713' : '\u25CB';
        var fill = isCached ? '100' : '0';
        html += '<div class="batch-card ' + statusClass + '" id="batch-card-' + t + '">' +
            '<div class="batch-card-ticker">' + t + '</div>' +
            '<div class="batch-card-mini-bar"><div class="batch-card-mini-fill" style="width:' + fill + '%"></div></div>' +
            '<div class="batch-card-icon">' + icon + '</div>' +
        '</div>';
    }
    grid.innerHTML = html;
}

function _showBatchModal() {
    var modal = document.getElementById('batch-refresh-modal');
    if (modal) modal.style.display = 'flex';
}

function closeBatchModal() {
    var modal = document.getElementById('batch-refresh-modal');
    if (modal) modal.style.display = 'none';
    // Don't stop polling -- let it continue in background
}

function _startBatchPolling() {
    if (_batchPoller) clearInterval(_batchPoller);
    _batchPoller = setInterval(_pollBatchStatus, 3000);
    _pollBatchStatus(); // immediate first poll
}

async function _pollBatchStatus() {
    try {
        var resp = await fetch(REFRESH_API_BASE + '/api/refresh-all/status');
        if (resp.status === 404) {
            // Server restarted -- batch state lost
            clearInterval(_batchPoller);
            _batchPoller = null;
            var stats = document.getElementById('batch-stats');
            var cachedCount = Object.keys(_batchCachedTickers).filter(function(k) { return _batchCachedTickers[k]; }).length;
            if (stats) stats.textContent = 'Server restarted. ' + cachedCount + ' tickers cached. Close and retry remaining.';
            var btn = document.getElementById('btn-refresh-all');
            if (btn) { btn.disabled = false; btn.textContent = '\u21BB Refresh All Research'; }
            return;
        }
        if (!resp.ok) return;

        var data = await resp.json();

        // Update overall progress
        var fill = document.getElementById('batch-overall-fill');
        if (fill) fill.style.width = data.overall_progress_pct + '%';

        var stats = document.getElementById('batch-stats');
        if (stats) {
            stats.textContent = data.total_completed + '/' + data.total + ' completed' +
                (data.total_failed > 0 ? ', ' + data.total_failed + ' failed' : '') +
                (data.total_in_progress > 0 ? ', ' + data.total_in_progress + ' in progress' : '') +
                (data.total_queued > 0 ? ', ' + data.total_queued + ' queued' : '');
        }

        // Update elapsed time
        if (_batchStartTime) {
            var elapsed = Math.round((Date.now() - _batchStartTime) / 1000);
            var mins = Math.floor(elapsed / 60);
            var secs = elapsed % 60;
            var elapsedEl = document.getElementById('batch-elapsed');
            if (elapsedEl) elapsedEl.textContent = mins + 'm ' + (secs < 10 ? '0' : '') + secs + 's';
        }

        // Update per-ticker cards + incremental caching
        var tickerStatuses = data.per_ticker_status || [];
        for (var i = 0; i < tickerStatuses.length; i++) {
            var ts = tickerStatuses[i];
            _updateBatchCard(ts);

            // Incrementally fetch + cache each ticker as it completes
            if (ts.status === 'completed' && !_batchCachedTickers[ts.ticker]) {
                _batchCachedTickers[ts.ticker] = true;
                _fetchAndCacheSingleTicker(ts.ticker);
            }
        }

        // Check if done
        if (data.status === 'completed' || data.status === 'partially_failed' || data.status === 'failed') {
            clearInterval(_batchPoller);
            _batchPoller = null;

            // Re-enable button
            var btn = document.getElementById('btn-refresh-all');
            if (btn) { btn.disabled = false; btn.textContent = '\u21BB Refresh All Research'; }

            // Final re-render (individual caches already done incrementally)
            if (typeof window.renderCoverageTable === 'function') window.renderCoverageTable();
            if (typeof window.renderFeaturedGrid === 'function') window.renderFeaturedGrid();
        }

    } catch (e) {
        console.error('Batch poll error:', e);
    }
}

function _updateBatchCard(ts) {
    var card = document.getElementById('batch-card-' + ts.ticker);
    if (!card) return;

    // Determine visual status class
    var statusClass = 'status-queued';
    var icon = '\u25CB'; // circle
    if (ts.status === 'completed') {
        statusClass = 'status-completed';
        icon = '\u2713'; // checkmark
    } else if (ts.status === 'failed') {
        statusClass = 'status-failed';
        icon = '\u2717'; // cross
    } else if (ts.status !== 'queued') {
        statusClass = 'status-running';
        icon = '\u21BB'; // refresh
    }

    card.className = 'batch-card ' + statusClass;

    var miniFill = card.querySelector('.batch-card-mini-fill');
    if (miniFill) miniFill.style.width = ts.progress_pct + '%';

    var iconEl = card.querySelector('.batch-card-icon');
    if (iconEl) {
        iconEl.textContent = icon;
        if (ts.error) iconEl.title = ts.error;
    }
}

async function _fetchAndCacheSingleTicker(ticker) {
    try {
        var resp = await fetch(REFRESH_API_BASE + '/api/refresh/' + ticker + '/result');
        if (!resp.ok) return;

        var updatedData = await resp.json();
        var currencyMap = {'AUD':'A$','USD':'US$','GBP':'\u00A3','EUR':'\u20AC'};

        // Normalise currency
        if (updatedData.currency && currencyMap[updatedData.currency]) {
            updatedData.currency = currencyMap[updatedData.currency];
        }

        // Merge into STOCK_DATA, preserving live prices
        if (typeof STOCK_DATA !== 'undefined') {
            var livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
            var livePriceHistory = STOCK_DATA[ticker] ? STOCK_DATA[ticker].priceHistory : undefined;
            STOCK_DATA[ticker] = updatedData;
            if (livePrice !== undefined) {
                STOCK_DATA[ticker]._livePrice = livePrice;
                STOCK_DATA[ticker].price = livePrice;
            }
            if (livePriceHistory) STOCK_DATA[ticker].priceHistory = livePriceHistory;
        }

        // Cache in localStorage
        try {
            localStorage.setItem('ci_research_' + ticker, JSON.stringify(updatedData));
        } catch (lsErr) { /* ignore */ }

        console.log('[BatchRefresh] Cached ' + ticker + ' incrementally');

        // Hydrate computed fields before re-render
        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
            window.ContinuumDynamics.hydrate(ticker);
        }

        // Re-render current page if viewing this ticker
        var hash = window.location.hash || '';
        var reportMatch = hash.match(/^#report-(\w+)/);
        if (reportMatch && reportMatch[1].toUpperCase() === ticker) {
            if (typeof window.destroyNarrativeTimelineChart === 'function') window.destroyNarrativeTimelineChart(ticker);
            var container = document.getElementById('page-report-' + ticker);
            if (container && typeof window.renderReportPage === 'function') {
                container.innerHTML = window.renderReportPage(STOCK_DATA[ticker]);
                if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
                if (typeof window.setupScrollSpy === 'function') window.setupScrollSpy('page-report-' + ticker);
                if (typeof window.initNarrativeTimelineChart === 'function') window.initNarrativeTimelineChart(ticker);
                if (typeof window.initInlineChat === 'function') window.initInlineChat(ticker);
            }
        }
    } catch (e) {
        console.error('[BatchRefresh] Failed to cache ' + ticker + ':', e);
        _batchCachedTickers[ticker] = false; // Allow retry on next poll
    }
}

async function _fetchAndMergeBatchResults() {
    try {
        var resp = await fetch(REFRESH_API_BASE + '/api/refresh-all/results');
        if (!resp.ok) {
            console.error('Failed to fetch batch results:', resp.status);
            return;
        }

        var data = await resp.json();
        var results = data.results || {};
        var currencyMap = {'AUD':'A$','USD':'US$','GBP':'\u00A3','EUR':'\u20AC'};
        var merged = 0;

        for (var ticker in results) {
            if (!results.hasOwnProperty(ticker)) continue;
            var updatedData = results[ticker];

            // Normalise currency
            if (updatedData.currency && currencyMap[updatedData.currency]) {
                updatedData.currency = currencyMap[updatedData.currency];
            }

            // Merge into STOCK_DATA, preserving live prices
            if (typeof STOCK_DATA !== 'undefined') {
                var livePrice = STOCK_DATA[ticker] ? STOCK_DATA[ticker]._livePrice : undefined;
                var livePriceHistory = STOCK_DATA[ticker] ? STOCK_DATA[ticker].priceHistory : undefined;
                STOCK_DATA[ticker] = updatedData;
                if (livePrice !== undefined) {
                    STOCK_DATA[ticker]._livePrice = livePrice;
                    STOCK_DATA[ticker].price = livePrice;
                }
                if (livePriceHistory) STOCK_DATA[ticker].priceHistory = livePriceHistory;
            }

            // Cache in localStorage
            try {
                localStorage.setItem('ci_research_' + ticker, JSON.stringify(updatedData));
            } catch (lsErr) { /* ignore */ }

            merged++;
        }

        console.log('[BatchRefresh] Merged ' + merged + ' tickers into STOCK_DATA');

        // Hydrate all merged tickers
        if (window.ContinuumDynamics && window.ContinuumDynamics.hydrate) {
            for (var ht in results) {
                if (results.hasOwnProperty(ht)) {
                    window.ContinuumDynamics.hydrate(ht);
                }
            }
        }

        // Re-render current page if it's a report page
        var hash = window.location.hash || '';
        var reportMatch = hash.match(/^#report-(\w+)/);
        if (reportMatch) {
            var currentTicker = reportMatch[1].toUpperCase();
            if (STOCK_DATA[currentTicker]) {
                if (typeof window.destroyNarrativeTimelineChart === 'function') {
                    window.destroyNarrativeTimelineChart(currentTicker);
                }
                var container = document.getElementById('page-report-' + currentTicker);
                if (container && typeof window.renderReportPage === 'function') {
                    container.innerHTML = window.renderReportPage(STOCK_DATA[currentTicker]);
                    if (typeof window.initSectionToggles === 'function') window.initSectionToggles();
                    if (typeof window.setupScrollSpy === 'function') window.setupScrollSpy('page-report-' + currentTicker);
                    if (typeof window.initNarrativeTimelineChart === 'function') window.initNarrativeTimelineChart(currentTicker);
                    if (typeof window.initInlineChat === 'function') window.initInlineChat(currentTicker);
                }
            }
        }

        // Re-render coverage table and featured grid if on home page
        if (typeof window.renderCoverageTable === 'function') window.renderCoverageTable();
        if (typeof window.renderFeaturedGrid === 'function') window.renderFeaturedGrid();

    } catch (e) {
        console.error('Batch result merge error:', e);
    }
}

// ============================================================
// EXPORTS
// ============================================================

export function initBatchRefresh() {
    // Make triggerRefresh and triggerRefreshAll available globally
    window.triggerRefresh = triggerRefresh;
    window.triggerRefreshAll = triggerRefreshAll;
    window.closeBatchModal = closeBatchModal;
}

export function showBatchModal() {
    _showBatchModal();
}

export { closeBatchModal };
