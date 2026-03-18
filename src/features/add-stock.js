/**
 * add-stock.js -- Add Stock modal
 *
 * Handles the "+ Add Stock" modal: input validation, Railway API call,
 * progress polling during background coverage initiation, result caching,
 * and post-add navigation to the new report page.
 *
 * Flow:
 *   1. POST /api/stocks/add  -- returns in ~10s with scaffold
 *   2. Poll /api/refresh/{ticker}/status every 3s for progress
 *   3. On "completed": fetch /api/refresh/{ticker}/result, load, navigate
 *   4. On "failed": load scaffold, navigate, tell user to Refresh
 *   5. On timeout (120s polling): load scaffold, navigate
 *
 * Depends on:
 *   - window.ContinuumDynamics (global)
 *   - window.renderCoverageTable, window.renderFeaturedGrid (page globals)
 */

import { STOCK_DATA } from '../lib/state.js';
import { CACHE_VERSION } from '../data/loader.js';
import { API_BASE } from '../lib/api-config.js';

// Railway API base (centralised in api-config.js)
var REFRESH_API_BASE = API_BASE;

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

/**
 * Load research data into STOCK_DATA, localStorage, and re-render grids.
 */
function _loadResearchIntoApp(ticker, data) {
    data._lastRefreshed = new Date().toISOString();
    data._cacheVersion = CACHE_VERSION;
    try {
        localStorage.setItem('ci_research_' + ticker, JSON.stringify(data));
    } catch (e) {
        console.warn('[AddStock] localStorage write failed:', e);
    }
    STOCK_DATA[ticker] = data;
    STOCK_DATA[ticker]._indexOnly = false;
    var currencyMap = {'AUD': 'A\u0024', 'USD': 'US\u0024', 'GBP': '\u00a3', 'EUR': '\u20ac'};
    if (data.currency && currencyMap[data.currency]) {
        STOCK_DATA[ticker].currency = currencyMap[data.currency];
    }
    if (typeof window.ContinuumDynamics !== 'undefined' && window.ContinuumDynamics.hydrate) {
        window.ContinuumDynamics.hydrate(ticker);
    }
    if (typeof window.renderCoverageTable === 'function') window.renderCoverageTable();
    if (typeof window.renderFeaturedGrid === 'function') window.renderFeaturedGrid();
}

/**
 * Fetch scaffold JSON from Railway and load into app state.
 * Falls back to a minimal stub if the scaffold file is not yet available.
 */
async function _loadScaffold(ticker, company, apiData) {
    try {
        var scaffoldResp = await fetch(REFRESH_API_BASE + '/data/research/' + ticker + '.json');
        if (scaffoldResp.ok) {
            var scaffoldData = await scaffoldResp.json();
            _loadResearchIntoApp(ticker, scaffoldData);
            console.log('[AddStock] Scaffold loaded for ' + ticker);
            return;
        }
    } catch (e) {
        console.warn('[AddStock] Scaffold fetch failed:', e);
    }

    // Minimal stub so the stock appears in the UI
    var stub = {
        ticker: ticker,
        tickerFull: ticker + '.AX',
        company: company,
        sector: (apiData && apiData.sector) || 'Unknown',
        sectorSub: '',
        price: (apiData && apiData.price) || 0,
        currency: 'A\u0024',
        date: new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
        hypotheses: [],
        skew: { direction: 'balanced', rationale: 'Research initialising...' },
        featuredMetrics: [],
        featuredRationale: 'Research being generated.',
        _indexOnly: false,
        _stub: true,
        _lastRefreshed: new Date().toISOString(),
        _cacheVersion: CACHE_VERSION
    };
    _loadResearchIntoApp(ticker, stub);
    console.log('[AddStock] Using minimal stub for ' + ticker);
}

/**
 * Poll /api/refresh/{ticker}/status until completed, failed, or timeout.
 * Returns a promise that resolves with {status, result} or rejects on timeout.
 */
function _pollUntilDone(ticker, statusEl, timeoutMs) {
    return new Promise(function(resolve, reject) {
        var elapsed = 0;
        var interval = 3000;

        var poller = setInterval(async function() {
            elapsed += interval;

            if (elapsed > timeoutMs) {
                clearInterval(poller);
                reject(new Error('timeout'));
                return;
            }

            try {
                var resp = await fetch(REFRESH_API_BASE + '/api/refresh/' + ticker + '/status', {
                    headers: { 'X-API-Key': CI_API_KEY }
                });
                if (!resp.ok) return; // job not created yet, keep waiting

                var job = resp.json ? await resp.json() : {};

                // Update status display
                if (job.stage_label) {
                    var pct = job.progress_pct || 0;
                    statusEl.textContent = ticker + ': ' + job.stage_label + (pct > 0 ? ' (' + pct + '%)' : '');
                }

                if (job.status === 'completed') {
                    clearInterval(poller);
                    // Fetch the full result
                    try {
                        var resultResp = await fetch(
                            REFRESH_API_BASE + '/api/refresh/' + ticker + '/result',
                            { headers: { 'X-API-Key': CI_API_KEY } }
                        );
                        if (resultResp.ok) {
                            var resultData = await resultResp.json();
                            resolve({ status: 'completed', result: resultData });
                        } else {
                            resolve({ status: 'completed', result: null });
                        }
                    } catch (e) {
                        resolve({ status: 'completed', result: null });
                    }
                    return;
                }

                if (job.status === 'failed') {
                    clearInterval(poller);
                    resolve({ status: 'failed', error: job.error || 'Coverage initiation failed' });
                    return;
                }
            } catch (e) {
                // Network error on poll -- keep trying
            }
        }, interval);
    });
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
        // Step 1: POST to create scaffold and kick off coverage initiation.
        // This returns in ~10s, well within Railway's 60s proxy timeout.
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
        status.className = 'add-modal-status info';
        status.textContent = company + ' added. Generating research report...';

        // Load the scaffold immediately so the stock is visible
        await _loadScaffold(ticker, company, data);

        // Step 2: Poll for coverage initiation progress (120s timeout)
        try {
            var outcome = await _pollUntilDone(ticker, status, 120000);

            if (outcome.status === 'completed' && outcome.result) {
                _loadResearchIntoApp(ticker, outcome.result);
                status.className = 'add-modal-status success';
                status.textContent = company + ' (' + ticker + ') research complete.';
                console.log('[AddStock] Full research loaded for ' + ticker);
            } else if (outcome.status === 'completed') {
                // Completed but could not fetch result -- scaffold is loaded
                status.className = 'add-modal-status success';
                status.textContent = company + ' research generated. Loading page...';
            } else {
                // Failed
                status.className = 'add-modal-status error';
                status.textContent = company + ' added but research failed: ' + (outcome.error || 'unknown') + '. Use Refresh to retry.';
            }
        } catch (pollErr) {
            // Timeout -- scaffold is already loaded
            status.className = 'add-modal-status info';
            status.textContent = company + ' added. Research still generating. Navigate to report and Refresh when ready.';
        }

        // Step 3: Navigate to the report page
        setTimeout(function() {
            closeAddStockModal();
            window.location.hash = '#report-' + ticker;
        }, 1000);

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
