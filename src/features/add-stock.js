/**
 * add-stock.js -- Add Stock modal
 *
 * Extracted from index.html lines ~12388-12525.
 * Handles the "+ Add Stock" modal: input validation, Railway API call,
 * scaffold caching, and post-add navigation to the new report page.
 *
 * Depends on:
 *   - window.ContinuumDynamics (global)
 *   - window.triggerRefresh (exposed by batch-refresh.js)
 *   - window.renderCoverageTable, window.renderFeaturedGrid (page globals)
 */

import { STOCK_DATA } from '../lib/state.js';

// Railway API base (same pattern as batch-refresh.js)
var REFRESH_API_BASE = window.location.hostname.includes('github.io')
    ? 'https://imaginative-vision-production-16cb.up.railway.app'
    : '';

var CI_API_KEY = window.CI_API_KEY || '';

export function openAddStockModal() {
    var modal = document.getElementById('add-stock-modal');
    var input = document.getElementById('add-stock-input');
    var status = document.getElementById('add-stock-status');
    var submitBtn = document.getElementById('add-stock-submit');
    if (!modal) return;
    modal.style.display = 'flex';
    if (input) { input.value = ''; input.disabled = false; }
    if (status) { status.textContent = ''; status.className = 'add-modal-status'; }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Add'; }
    setTimeout(function() { if (input) input.focus(); }, 100);
    modal._escHandler = function(e) { if (e.key === 'Escape') closeAddStockModal(); };
    document.addEventListener('keydown', modal._escHandler);
}

export function closeAddStockModal() {
    var modal = document.getElementById('add-stock-modal');
    if (!modal) return;
    modal.style.display = 'none';
    if (modal._escHandler) {
        document.removeEventListener('keydown', modal._escHandler);
        modal._escHandler = null;
    }
}

export async function submitAddStock(event) {
    event.preventDefault();
    var input = document.getElementById('add-stock-input');
    var status = document.getElementById('add-stock-status');
    var submitBtn = document.getElementById('add-stock-submit');
    if (!input || !status || !submitBtn) return;

    var ticker = input.value.trim().toUpperCase();
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) {
        status.className = 'add-modal-status error';
        status.textContent = 'Enter a valid ASX ticker (1-6 characters).';
        return;
    }

    if (STOCK_DATA[ticker]) {
        status.className = 'add-modal-status error';
        status.textContent = ticker + ' is already in coverage.';
        return;
    }

    submitBtn.disabled = true;
    input.disabled = true;
    submitBtn.innerHTML = '<span class="add-modal-spinner"></span> Adding...';
    status.className = 'add-modal-status info';
    status.textContent = 'Adding ' + ticker + ' to coverage...';

    try {
        var resp = await fetch(REFRESH_API_BASE + '/api/stocks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY },
            body: JSON.stringify({ ticker: ticker })
        });

        var data = await resp.json().catch(function() { return {}; });

        if (resp.status === 409) {
            status.className = 'add-modal-status error';
            status.textContent = ticker + ' is already in coverage.';
            submitBtn.disabled = false;
            input.disabled = false;
            submitBtn.textContent = 'Add';
            return;
        }

        if (!resp.ok) {
            throw new Error(data.detail || 'Failed to add stock (' + resp.status + ')');
        }

        var company = data.company || ticker;
        status.className = 'add-modal-status success';
        status.textContent = 'Added ' + company + ' (' + ticker + '). Loading scaffold...';

        try {
            var scaffoldResp = await fetch(REFRESH_API_BASE + '/data/research/' + ticker + '.json');
            if (scaffoldResp.ok) {
                var scaffoldData = await scaffoldResp.json();
                scaffoldData._lastRefreshed = new Date().toISOString();
                try {
                    localStorage.setItem('ci_research_' + ticker, JSON.stringify(scaffoldData));
                    console.log('[AddStock] Cached scaffold for ' + ticker);
                } catch (lsErr) {
                    console.warn('[AddStock] localStorage write failed:', lsErr);
                }
                STOCK_DATA[ticker] = scaffoldData;
                STOCK_DATA[ticker]._indexOnly = false;
                var currencyMap = {'AUD':'A$','USD':'US$','GBP':'\u00a3','EUR':'\u20ac'};
                if (scaffoldData.currency && currencyMap[scaffoldData.currency]) {
                    STOCK_DATA[ticker].currency = currencyMap[scaffoldData.currency];
                }
                if (typeof window.ContinuumDynamics !== 'undefined' && window.ContinuumDynamics.hydrate) {
                    window.ContinuumDynamics.hydrate(ticker);
                }
                // Re-render coverage table and featured grid so new stock appears on home page
                if (typeof window.renderCoverageTable === 'function') window.renderCoverageTable();
                if (typeof window.renderFeaturedGrid === 'function') window.renderFeaturedGrid();
                console.log('[AddStock] Scaffold loaded for ' + ticker);
            } else {
                console.warn('[AddStock] Scaffold fetch returned ' + scaffoldResp.status + ', using minimal stub');
                // Scaffold not ready yet -- create a minimal stub so the stock appears
                // in the Research tab and the report page loads without "Stock Not Found".
                // The refresh poller below will populate full data once Railway finishes.
                var stub = {
                    ticker: ticker,
                    tickerFull: ticker + '.AX',
                    company: company,
                    sector: data.sector || 'Unknown',
                    sectorSub: '',
                    price: data.price || 0,
                    currency: 'A$',
                    date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
                    hypotheses: [],
                    skew: { direction: 'balanced', rationale: 'Research initialising...' },
                    featuredMetrics: [],
                    featuredRationale: 'Research being generated.',
                    _indexOnly: false,
                    _stub: true,
                    _lastRefreshed: new Date().toISOString()
                };
                try { localStorage.setItem('ci_research_' + ticker, JSON.stringify(stub)); } catch(e) {}
                STOCK_DATA[ticker] = stub;
                if (typeof window.ContinuumDynamics !== 'undefined' && window.ContinuumDynamics.hydrate) {
                    window.ContinuumDynamics.hydrate(ticker);
                }
                if (typeof window.renderCoverageTable === 'function') window.renderCoverageTable();
                if (typeof window.renderFeaturedGrid === 'function') window.renderFeaturedGrid();
            }
        } catch (scaffoldErr) {
            console.warn('[AddStock] Failed to fetch scaffold:', scaffoldErr);
        }

        status.textContent = 'Added ' + company + ' (' + ticker + '). Initiating research...';

        setTimeout(function() {
            closeAddStockModal();
            window.location.hash = '#report-' + ticker;
            var _addPollCount = 0;
            var _addPoller = setInterval(function() {
                _addPollCount++;
                var btn = document.getElementById('refresh-btn-' + ticker);
                if (btn) {
                    clearInterval(_addPoller);
                    if (typeof window.triggerRefresh === 'function') window.triggerRefresh(ticker);
                } else if (_addPollCount > 30) {
                    clearInterval(_addPoller);
                    console.warn('[AddStock] refresh-btn-' + ticker + ' not found after 6s');
                    if (typeof window.triggerRefresh === 'function') window.triggerRefresh(ticker);
                }
            }, 200);
        }, 1200);

    } catch (err) {
        status.className = 'add-modal-status error';
        status.textContent = err.message || 'Server unavailable. Try again.';
        submitBtn.disabled = false;
        input.disabled = false;
        submitBtn.textContent = 'Add';
    }
}

/**
 * Expose globals for onclick handlers in HTML
 */
export function initAddStock() {
    window.openAddStockModal = openAddStockModal;
    window.closeAddStockModal = closeAddStockModal;
    window.submitAddStock = submitAddStock;
}
