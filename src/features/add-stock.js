/**
 * add-stock.js -- Add Stock modal
 *
 * Handles the "+ Add Stock" modal: input validation, Railway API call,
 * synchronous coverage initiation with progress polling, and post-add
 * navigation to the new report page.
 *
 * Depends on:
 *   - window.ContinuumDynamics (global)
 *   - window.renderCoverageTable, window.renderFeaturedGrid (page globals)
 */

import { STOCK_DATA } from '../lib/state.js';
import { CACHE_VERSION } from '../data/loader.js';

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

    // AbortController with 180s client-side timeout
    var controller = new AbortController();
    var clientTimeout = setTimeout(function() { controller.abort(); }, 180000);

    // Start polling refresh status for progress updates
    var pollInterval = setInterval(function() {
        fetch(REFRESH_API_BASE + '/api/refresh/' + ticker + '/status', {
            headers: { 'X-API-Key': CI_API_KEY }
        }).then(function(r) {
            if (!r.ok) return;
            return r.json();
        }).then(function(job) {
            if (!job) return;
            var label = job.stage_label || job.status;
            var pct = job.progress_pct || 0;
            status.textContent = ticker + ': ' + label + (pct > 0 ? ' (' + pct + '%)' : '');
        }).catch(function() {
            // Polling failures are non-fatal; the main request drives completion
        });
    }, 2500);

    try {
        var resp = await fetch(REFRESH_API_BASE + '/api/stocks/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY },
            body: JSON.stringify({ ticker: ticker }),
            signal: controller.signal
        });

        clearTimeout(clientTimeout);
        clearInterval(pollInterval);

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
        var coverageStatus = data.coverage_status || 'pending';

        if (coverageStatus === 'completed') {
            // Full content generated; fetch the result
            status.className = 'add-modal-status success';
            status.textContent = company + ' (' + ticker + ') added with full research.';

            try {
                var resultResp = await fetch(
                    REFRESH_API_BASE + '/api/refresh/' + ticker + '/result',
                    { headers: { 'X-API-Key': CI_API_KEY } }
                );
                if (resultResp.ok) {
                    var resultData = await resultResp.json();
                    _loadResearchIntoApp(ticker, resultData);
                    console.log('[AddStock] Full research loaded for ' + ticker);
                } else {
                    // Result endpoint failed; fall back to scaffold fetch
                    await _loadScaffold(ticker, company, data);
                }
            } catch (resultErr) {
                console.warn('[AddStock] Result fetch failed, loading scaffold:', resultErr);
                await _loadScaffold(ticker, company, data);
            }

            setTimeout(function() {
                closeAddStockModal();
                window.location.hash = '#report-' + ticker;
            }, 800);

        } else if (coverageStatus === 'degraded') {
            // Partial content; load what was produced and warn
            status.className = 'add-modal-status warning';
            status.textContent = company + ' added with partial research. Use Refresh to complete.';

            try {
                var degradedResp = await fetch(
                    REFRESH_API_BASE + '/api/refresh/' + ticker + '/result',
                    { headers: { 'X-API-Key': CI_API_KEY } }
                );
                if (degradedResp.ok) {
                    var degradedData = await degradedResp.json();
                    _loadResearchIntoApp(ticker, degradedData);
                } else {
                    await _loadScaffold(ticker, company, data);
                }
            } catch (e) {
                await _loadScaffold(ticker, company, data);
            }

            setTimeout(function() {
                closeAddStockModal();
                window.location.hash = '#report-' + ticker;
            }, 2000);

        } else {
            // failed, timeout, or unknown; load scaffold and navigate
            status.className = 'add-modal-status error';
            var errMsg = data.coverage_error || 'Coverage initiation did not complete.';
            status.textContent = company + ' added (scaffold only). ' + errMsg + ' Use Refresh to retry.';

            await _loadScaffold(ticker, company, data);

            setTimeout(function() {
                closeAddStockModal();
                window.location.hash = '#report-' + ticker;
            }, 3000);
        }

    } catch (err) {
        clearTimeout(clientTimeout);
        clearInterval(pollInterval);

        if (err.name === 'AbortError') {
            // Client-side timeout; the server may still be working
            status.className = 'add-modal-status error';
            status.textContent = 'Request timed out. Loading scaffold; use Refresh to retry.';

            await _loadScaffold(ticker, ticker, {});

            setTimeout(function() {
                closeAddStockModal();
                window.location.hash = '#report-' + ticker;
            }, 3000);
        } else {
            status.className = 'add-modal-status error';
            status.textContent = err.message || 'Server unavailable. Try again.';
            submitBtn.disabled = false;
            input.disabled = false;
            submitBtn.textContent = 'Add';
        }
    }
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
 * Expose globals for onclick handlers in HTML
 */
export function initAddStock() {
    window.openAddStockModal = openAddStockModal;
    window.closeAddStockModal = closeAddStockModal;
    window.submitAddStock = submitAddStock;
}
