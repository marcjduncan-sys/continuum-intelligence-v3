/**
 * pm.js -- PM page renderer
 *
 * Renders the main content area for the #pm route.
 * Phase A: polished landing page explaining PM Chat.
 * Phase B: portfolio selector placeholder and snapshot summary stub.
 * Phase C: analytics dashboard (top positions, concentration, sector exposure, flags).
 * Phase G: diagnostics dashboard (mandate, breaches, alignment, DNA, hedges, reweighting, changes, themes).
 */

import { API_BASE } from '../lib/api-config.js';

export function renderPMPage() {
    var container = document.getElementById('page-pm');
    if (!container || container.dataset.rendered === '1') return;

    container.innerHTML =
        '<div class="page-inner" style="max-width:720px;margin:0 auto;padding:48px 24px">' +

            // --- Header ---
            '<div style="margin-bottom:32px">' +
                '<div style="' +
                    'font-family:var(--font-data);font-size:0.62rem;font-weight:700;' +
                    'letter-spacing:0.12em;text-transform:uppercase;color:var(--accent-gold);' +
                    'margin-bottom:8px' +
                '">' +
                    'PORTFOLIO MANAGER' +
                '</div>' +
                '<h1 style="' +
                    'font-size:1.5rem;font-weight:700;color:var(--text-primary);' +
                    'margin:0 0 12px;line-height:1.3' +
                '">' +
                    'Portfolio construction, sizing, exposure and risk decisions' +
                '</h1>' +
                '<p style="' +
                    'font-size:0.88rem;line-height:1.65;color:var(--text-muted);margin:0' +
                '">' +
                    'PM Chat is your portfolio-level decision surface. It handles position sizing, ' +
                    'concentration analysis, sector exposure, source-of-funds decisions, and prioritised ' +
                    'portfolio actions. For stock-level thesis and evidence, use the Analyst.' +
                '</p>' +
            '</div>' +

            // --- Portfolio selector placeholder ---
            '<div id="pmPortfolioSelector" style="margin-bottom:24px">' +
                '<div style="' +
                    'display:flex;align-items:center;gap:12px;padding:14px 16px;' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px' +
                '">' +
                    '<div style="' +
                        'width:8px;height:8px;border-radius:50%;' +
                        'background:var(--accent-gold);opacity:0.6;flex-shrink:0' +
                    '"></div>' +
                    '<div style="flex:1">' +
                        '<div style="' +
                            'font-family:var(--font-data);font-size:0.62rem;font-weight:700;' +
                            'letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);' +
                            'margin-bottom:2px' +
                        '">PORTFOLIO</div>' +
                        '<div id="pmPortfolioName" style="' +
                            'font-size:0.82rem;color:var(--text-primary);font-weight:600' +
                        '">No portfolio loaded</div>' +
                    '</div>' +
                    '<button id="pmRefreshDiag" style="' +
                        'font-family:var(--font-data);font-size:0.58rem;font-weight:600;' +
                        'color:var(--accent-gold);background:none;border:1px solid var(--accent-gold);' +
                        'border-radius:4px;padding:4px 10px;cursor:pointer;opacity:0.7' +
                    '">Refresh</button>' +
                '</div>' +
            '</div>' +

            // --- Summary metrics ---
            '<div id="pmSnapshotSummary" style="margin-bottom:24px">' +
                '<div style="' +
                    'display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px' +
                '">' +
                    _metricStub('Total Value', '--') +
                    _metricStub('Cash', '--') +
                    _metricStub('Positions', '--') +
                '</div>' +
            '</div>' +

            // --- Mandate settings (BEAD-003) ---
            '<div id="pmMandateSettings" style="margin-bottom:24px;display:none">' +
                _sectionHeader('MANDATE SETTINGS') +
                '<div id="pmMandateSettingsBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No mandate configured' +
                '</div>' +
            '</div>' +

            // --- Mandate breaches (BEAD-004) ---
            '<div id="pmMandateBreaches" style="margin-bottom:24px;display:none">' +
                _sectionHeader('MANDATE BREACHES') +
                '<div id="pmMandateBreachesBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No breaches' +
                '</div>' +
            '</div>' +

            // --- Concentration bar (Phase C) ---
            '<div id="pmConcentration" style="margin-bottom:24px">' +
                _sectionHeader('CONCENTRATION') +
                '<div style="' +
                    'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px' +
                '">' +
                    _metricStub('Max Single', '--') +
                    _metricStub('Top 5', '--') +
                    _metricStub('Top 10', '--') +
                    _metricStub('Score', '--') +
                '</div>' +
            '</div>' +

            // --- Top positions (Phase C) ---
            '<div id="pmTopPositions" style="margin-bottom:24px">' +
                _sectionHeader('TOP POSITIONS') +
                '<div id="pmTopPositionsBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No portfolio loaded' +
                '</div>' +
            '</div>' +

            // --- Alignment matrix (BEAD-005) ---
            '<div id="pmAlignmentMatrix" style="margin-bottom:24px;display:none">' +
                _sectionHeader('ALIGNMENT MATRIX') +
                '<div id="pmAlignmentMatrixBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No portfolio loaded' +
                '</div>' +
            '</div>' +

            // --- Sector exposure (Phase C) ---
            '<div id="pmSectorExposure" style="margin-bottom:24px">' +
                _sectionHeader('SECTOR EXPOSURE') +
                '<div id="pmSectorExposureBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No portfolio loaded' +
                '</div>' +
            '</div>' +

            // --- Theme exposure (BEAD-002) ---
            '<div id="pmThemeExposure" style="margin-bottom:24px;display:none">' +
                _sectionHeader('THEME EXPOSURE') +
                '<div id="pmThemeExposureBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No portfolio loaded' +
                '</div>' +
            '</div>' +

            // --- Hypothesis DNA (BEAD-006) ---
            '<div id="pmHypothesisDNA" style="margin-bottom:24px;display:none">' +
                _sectionHeader('HYPOTHESIS DNA') +
                '<div id="pmHypothesisDNABody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No portfolio loaded' +
                '</div>' +
            '</div>' +

            // --- Hedge gaps (BEAD-007) ---
            '<div id="pmHedgeGaps" style="margin-bottom:24px;display:none">' +
                _sectionHeader('HEDGE GAP ALERTS') +
                '<div id="pmHedgeGapsBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No gaps detected' +
                '</div>' +
            '</div>' +

            // --- Reweighting signals (BEAD-008) ---
            '<div id="pmReweighting" style="margin-bottom:24px;display:none">' +
                _sectionHeader('REWEIGHTING SIGNALS') +
                '<div id="pmReweightingBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No signals' +
                '</div>' +
            '</div>' +

            // --- Change detection (BEAD-009) ---
            '<div id="pmChangeLog" style="margin-bottom:24px;display:none">' +
                _sectionHeader('CHANGE LOG') +
                '<div id="pmChangeLogBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No changes detected' +
                '</div>' +
            '</div>' +

            // --- Flags (Phase C) ---
            '<div id="pmFlags" style="margin-bottom:32px">' +
                _sectionHeader('RISK FLAGS') +
                '<div id="pmFlagsBody" style="' +
                    'background:var(--bg-card);border:1px solid var(--border);border-radius:6px;' +
                    'padding:12px 14px;font-size:0.75rem;color:var(--text-muted)' +
                '">' +
                    'No flags' +
                '</div>' +
            '</div>' +

            // --- How to start ---
            '<div style="' +
                'padding:16px;background:rgba(201,169,110,0.05);' +
                'border-left:2px solid rgba(201,169,110,0.3);border-radius:0 4px 4px 0' +
            '">' +
                '<div style="' +
                    'font-family:var(--font-data);font-size:0.58rem;font-weight:700;' +
                    'letter-spacing:0.08em;text-transform:uppercase;color:var(--accent-gold);' +
                    'margin-bottom:6px' +
                '">' +
                    'HOW TO START' +
                '</div>' +
                '<p style="font-size:0.80rem;line-height:1.6;color:var(--text-muted);margin:0">' +
                    'Switch to PM mode using the Analyst/PM toggle in the right panel header, ' +
                    'then ask a portfolio-level question. Load a portfolio to see analytics, ' +
                    'concentration, and risk flags updated in real time.' +
                '</p>' +
            '</div>' +
        '</div>';

    container.dataset.rendered = '1';

    // Wire refresh button
    var refreshBtn = document.getElementById('pmRefreshDiag');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', function() {
            fetchDiagnostics();
        });
    }

    // Auto-fetch diagnostics if portfolio exists
    setTimeout(function() { fetchDiagnostics(); }, 500);
}


/**
 * Fetch diagnostics from the backend and update all dashboard sections.
 * Reads portfolio_id from the personalisation bridge and mandate from localStorage.
 */
export function fetchDiagnostics() {
    var portfolioId = (typeof window.pnGetPortfolioId === 'function') ? window.pnGetPortfolioId() : null;
    if (!portfolioId) return;

    // Read mandate from localStorage
    var mandate = _readMandate();

    var params = new URLSearchParams();
    if (mandate.max_position_size != null) params.set('mandate_max_position', mandate.max_position_size);
    if (mandate.sector_cap != null) params.set('mandate_sector_cap', mandate.sector_cap);
    if (mandate.cash_range_min != null) params.set('mandate_cash_min', mandate.cash_range_min);
    if (mandate.cash_range_max != null) params.set('mandate_cash_max', mandate.cash_range_max);
    if (mandate.risk_appetite) params.set('mandate_risk_appetite', mandate.risk_appetite);
    if (mandate.turnover_tolerance) params.set('mandate_turnover_tolerance', mandate.turnover_tolerance);
    if (mandate.restricted_names && mandate.restricted_names.length > 0) {
        params.set('restricted_names', mandate.restricted_names.join(','));
    }

    var url = API_BASE + '/api/portfolios/' + portfolioId + '/diagnostics?' + params.toString();
    var headers = {};
    var apiKey = window.CI_API_KEY || '';
    if (apiKey) headers['X-API-Key'] = apiKey;
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    fetch(url, { headers: headers })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data) return;
            updatePMDashboard(data.analytics);
            updatePMDiagnostics(data.alignment, data.analytics);
            _renderMandateSettings(mandate);
        })
        .catch(function(err) {
            console.warn('[PM] Diagnostics fetch failed:', err);
        });
}


/**
 * Read mandate settings from localStorage (personalisation profile).
 */
function _readMandate() {
    var defaults = {
        max_position_size: 0.15,
        sector_cap: 0.35,
        cash_range_min: 0.03,
        cash_range_max: 0.25,
        risk_appetite: 'moderate',
        turnover_tolerance: 'moderate',
        restricted_names: []
    };
    try {
        var raw = localStorage.getItem('continuum_personalisation_profile');
        if (!raw) return defaults;
        var parsed = JSON.parse(raw);
        var state = parsed.state || parsed;
        var m = state.mandate || {};
        return {
            max_position_size: m.maxPositionSize != null ? m.maxPositionSize / 100 : defaults.max_position_size,
            sector_cap: m.sectorCap != null ? m.sectorCap / 100 : defaults.sector_cap,
            cash_range_min: m.cashRangeMin != null ? m.cashRangeMin / 100 : defaults.cash_range_min,
            cash_range_max: m.cashRangeMax != null ? m.cashRangeMax / 100 : defaults.cash_range_max,
            risk_appetite: m.riskAppetite || defaults.risk_appetite,
            turnover_tolerance: m.turnoverTolerance || defaults.turnover_tolerance,
            restricted_names: m.restrictedNames || defaults.restricted_names
        };
    } catch (e) {
        return defaults;
    }
}


/**
 * Update the PM dashboard with analytics data.
 * Called by pm-chat.js or portfolio loading logic when analytics are available.
 *
 * @param {object} analytics - The analytics object from compute_analytics()
 */
export function updatePMDashboard(analytics) {
    if (!analytics) return;

    // Summary metrics
    var summary = document.getElementById('pmSnapshotSummary');
    if (summary) {
        var tv = analytics.total_value || 0;
        var cv = analytics.cash_value || 0;
        var pc = analytics.position_count || 0;
        summary.innerHTML =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
                _metricStub('Total Value', _fmtCurrency(tv)) +
                _metricStub('Cash', _fmtCurrency(cv)) +
                _metricStub('Positions', String(pc)) +
            '</div>';
    }

    // Concentration
    var conc = analytics.concentration || {};
    var concEl = document.getElementById('pmConcentration');
    if (concEl) {
        concEl.innerHTML =
            _sectionHeader('CONCENTRATION') +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px">' +
                _metricStub('Max Single', _fmtPct(conc.max_single_weight)) +
                _metricStub('Top 5', _fmtPct(conc.top5_weight)) +
                _metricStub('Top 10', _fmtPct(conc.top10_weight)) +
                _metricStub('Score', analytics.concentration_score != null ? String(analytics.concentration_score) : '--') +
            '</div>';
    }

    // Top positions
    var topBody = document.getElementById('pmTopPositionsBody');
    if (topBody && analytics.top_positions && analytics.top_positions.length > 0) {
        var rows = analytics.top_positions.map(function(p) {
            return '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;' +
                'border-bottom:1px solid var(--border)">' +
                '<div>' +
                    '<span style="font-weight:600;color:var(--text-primary)">' + _esc(p.ticker) + '</span>' +
                    '<span style="margin-left:8px;font-size:0.65rem;color:var(--text-muted)">' + _esc(p.sector) + '</span>' +
                '</div>' +
                '<div style="text-align:right">' +
                    '<span style="font-weight:600;color:var(--text-primary)">' + _fmtPct(p.weight) + '</span>' +
                    '<span style="margin-left:8px;font-size:0.65rem;color:var(--text-muted)">' + _fmtCurrency(p.market_value) + '</span>' +
                '</div>' +
            '</div>';
        });
        topBody.innerHTML = rows.join('');
    }

    // Sector exposure
    var sectorBody = document.getElementById('pmSectorExposureBody');
    if (sectorBody && analytics.sector_exposure) {
        var sectors = Object.entries(analytics.sector_exposure);
        if (sectors.length > 0) {
            var sectorRows = sectors.map(function(entry) {
                var name = entry[0];
                var weight = entry[1];
                var barWidth = Math.min(weight * 100, 100);
                return '<div style="margin-bottom:8px">' +
                    '<div style="display:flex;justify-content:space-between;margin-bottom:2px">' +
                        '<span style="font-size:0.70rem;color:var(--text-primary)">' + _esc(name) + '</span>' +
                        '<span style="font-family:var(--font-data);font-size:0.65rem;color:var(--text-muted)">' + _fmtPct(weight) + '</span>' +
                    '</div>' +
                    '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">' +
                        '<div style="height:100%;width:' + barWidth + '%;background:var(--accent-gold);border-radius:2px"></div>' +
                    '</div>' +
                '</div>';
            });
            sectorBody.innerHTML = sectorRows.join('');
        }
    }

    // Theme exposure (BEAD-002)
    _renderThemeExposure(analytics.theme_exposure);

    // Flags
    var flagsBody = document.getElementById('pmFlagsBody');
    if (flagsBody && analytics.flags) {
        if (analytics.flags.length === 0) {
            flagsBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem">No risk flags triggered</div>';
        } else {
            var flagRows = analytics.flags.map(function(f) {
                var icon = f.severity === 'warning' ? '!' : 'i';
                var color = f.severity === 'warning' ? 'var(--accent-gold)' : 'var(--text-muted)';
                return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">' +
                    '<div style="' +
                        'width:18px;height:18px;border-radius:50%;flex-shrink:0;' +
                        'display:flex;align-items:center;justify-content:center;' +
                        'font-family:var(--font-data);font-size:0.55rem;font-weight:700;' +
                        'background:' + color + ';color:var(--bg-body)' +
                    '">' + icon + '</div>' +
                    '<div style="font-size:0.75rem;line-height:1.5;color:var(--text-primary)">' +
                        _esc(f.message) +
                    '</div>' +
                '</div>';
            });
            flagsBody.innerHTML = flagRows.join('');
        }
    }
}


/**
 * Update the PM dashboard with alignment diagnostics data.
 * Called after fetchDiagnostics() returns alignment data.
 *
 * @param {object} alignment - The alignment object from compute_alignment()
 * @param {object} analytics - The analytics object (for cross-referencing)
 */
export function updatePMDiagnostics(alignment, analytics) {
    if (!alignment) return;

    _renderMandateBreaches(alignment.mandate_breaches);
    _renderAlignmentMatrix(alignment.holdings, alignment.alignment_summary);
    _renderHypothesisDNA(alignment.hypothesis_dna);
    _renderHedgeGaps(alignment.hedge_gaps);
    _renderReweighting(alignment.reweighting_suggestions);
    _renderChangeLog(alignment.changes);
}


// ============================================================
// BEAD-002: THEME EXPOSURE
// ============================================================

function _renderThemeExposure(themeExposure) {
    var wrapper = document.getElementById('pmThemeExposure');
    var body = document.getElementById('pmThemeExposureBody');
    if (!wrapper || !body) return;

    if (!themeExposure || Object.keys(themeExposure).length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    var themes = Object.entries(themeExposure).sort(function(a, b) { return b[1] - a[1]; });
    var themeColors = {
        'Cyclical': '#4ECDC4', 'Defensive': '#45B7D1', 'Growth': '#96CEB4',
        'Financial': '#DDA0DD', 'Real Assets': '#F4A460'
    };

    var rows = themes.map(function(entry) {
        var name = entry[0];
        var weight = entry[1];
        var barWidth = Math.min(weight * 100, 100);
        var barColor = themeColors[name] || 'var(--accent-gold)';
        return '<div style="margin-bottom:8px">' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:2px">' +
                '<span style="font-size:0.70rem;color:var(--text-primary)">' + _esc(name) + '</span>' +
                '<span style="font-family:var(--font-data);font-size:0.65rem;color:var(--text-muted)">' + _fmtPct(weight) + '</span>' +
            '</div>' +
            '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden">' +
                '<div style="height:100%;width:' + barWidth + '%;background:' + barColor + ';border-radius:2px"></div>' +
            '</div>' +
        '</div>';
    });
    body.innerHTML = rows.join('');
}


// ============================================================
// BEAD-003: MANDATE SETTINGS DISPLAY
// ============================================================

function _renderMandateSettings(mandate) {
    var wrapper = document.getElementById('pmMandateSettings');
    var body = document.getElementById('pmMandateSettingsBody');
    if (!wrapper || !body) return;

    wrapper.style.display = '';
    var rows = [
        _mandateRow('Max Position', _fmtPctDec(mandate.max_position_size)),
        _mandateRow('Sector Cap', _fmtPctDec(mandate.sector_cap)),
        _mandateRow('Cash Range', _fmtPctDec(mandate.cash_range_min) + ' - ' + _fmtPctDec(mandate.cash_range_max)),
        _mandateRow('Risk Appetite', _capitalize(mandate.risk_appetite)),
        _mandateRow('Turnover', _capitalize(mandate.turnover_tolerance))
    ];
    if (mandate.restricted_names && mandate.restricted_names.length > 0) {
        rows.push(_mandateRow('Restricted', mandate.restricted_names.join(', ')));
    }
    body.innerHTML = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">' + rows.join('') + '</div>';
}

function _mandateRow(label, value) {
    return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border)">' +
        '<span style="font-size:0.68rem;color:var(--text-muted)">' + _esc(label) + '</span>' +
        '<span style="font-size:0.68rem;font-weight:600;color:var(--text-primary)">' + _esc(value) + '</span>' +
    '</div>';
}


// ============================================================
// BEAD-004: MANDATE BREACH DASHBOARD
// ============================================================

function _renderMandateBreaches(breaches) {
    var wrapper = document.getElementById('pmMandateBreaches');
    var body = document.getElementById('pmMandateBreachesBody');
    if (!wrapper || !body) return;

    if (!breaches || breaches.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    var rows = breaches.map(function(b) {
        var sevColor = b.severity === 'critical' ? '#e74c3c' : 'var(--accent-gold)';
        var sevLabel = b.severity === 'critical' ? 'CRITICAL' : 'WARNING';
        var postureLabel = (b.recommended_posture || '').replace(/_/g, ' ');
        return '<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);align-items:flex-start">' +
            '<div style="' +
                'flex-shrink:0;font-family:var(--font-data);font-size:0.52rem;font-weight:700;' +
                'padding:2px 6px;border-radius:3px;color:#fff;background:' + sevColor +
            '">' + sevLabel + '</div>' +
            '<div style="flex:1">' +
                '<div style="font-size:0.72rem;color:var(--text-primary);line-height:1.4">' + _esc(b.description) + '</div>' +
                '<div style="font-size:0.60rem;color:var(--text-muted);margin-top:2px">' +
                    _esc(b.code) + (postureLabel ? ' -- ' + _esc(postureLabel) : '') +
                '</div>' +
            '</div>' +
        '</div>';
    });
    body.innerHTML = rows.join('');
}


// ============================================================
// BEAD-005: ALIGNMENT MATRIX
// ============================================================

function _renderAlignmentMatrix(holdings, summary) {
    var wrapper = document.getElementById('pmAlignmentMatrix');
    var body = document.getElementById('pmAlignmentMatrixBody');
    if (!wrapper || !body) return;

    if (!holdings || holdings.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    var clsColors = {
        'aligned': '#27ae60',
        'contradicts': '#e74c3c',
        'neutral': '#95a5a6',
        'not-covered': '#7f8c8d'
    };

    // Summary bar at top
    var summaryHtml = '';
    if (summary) {
        summaryHtml =
            '<div style="display:flex;gap:12px;margin-bottom:10px;font-family:var(--font-data);font-size:0.60rem">' +
                '<span style="color:#27ae60">Aligned: ' + _fmtPctDec(summary.aligned_weight) + '</span>' +
                '<span style="color:#e74c3c">Contradicts: ' + _fmtPctDec(summary.contradicts_weight) + '</span>' +
                '<span style="color:#95a5a6">Neutral: ' + _fmtPctDec(summary.neutral_weight) + '</span>' +
                '<span style="color:#7f8c8d">Not covered: ' + _fmtPctDec(summary.not_covered_weight) + '</span>' +
            '</div>';
    }

    var rows = holdings.map(function(h) {
        var a = h.alignment || {};
        var cls = a.cls || 'not-covered';
        var badgeColor = clsColors[cls] || '#7f8c8d';
        var skewDir = (h.skew && h.skew.direction) ? h.skew.direction : '';
        var skewScore = (h.skew && h.skew.score != null) ? h.skew.score : '';
        return '<div style="display:flex;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);gap:8px">' +
            '<span style="font-weight:600;color:var(--text-primary);font-size:0.72rem;min-width:50px">' + _esc(h.ticker) + '</span>' +
            '<span style="font-family:var(--font-data);font-size:0.62rem;color:var(--text-muted);min-width:40px">' + _fmtPctDec(h.weight) + '</span>' +
            '<span style="' +
                'font-family:var(--font-data);font-size:0.50rem;font-weight:700;padding:2px 6px;' +
                'border-radius:3px;color:#fff;background:' + badgeColor +
            '">' + _esc(cls.toUpperCase()) + '</span>' +
            (skewDir ? '<span style="font-size:0.60rem;color:var(--text-muted)">' + _esc(skewDir) + (skewScore ? ' ' + skewScore : '') + '</span>' : '') +
        '</div>';
    });

    body.innerHTML = summaryHtml + rows.join('');
}


// ============================================================
// BEAD-006: HYPOTHESIS DNA
// ============================================================

function _renderHypothesisDNA(dna) {
    var wrapper = document.getElementById('pmHypothesisDNA');
    var body = document.getElementById('pmHypothesisDNABody');
    if (!wrapper || !body) return;

    if (!dna) {
        wrapper.style.display = 'none';
        return;
    }

    var hasContent = false;
    var html = '';

    // Upside hypotheses
    if (dna.upside_hypotheses && dna.upside_hypotheses.length > 0) {
        hasContent = true;
        html += '<div style="margin-bottom:10px">' +
            '<div style="font-family:var(--font-data);font-size:0.54rem;font-weight:700;color:#27ae60;margin-bottom:6px;letter-spacing:0.06em">UPSIDE EXPOSURE</div>';
        dna.upside_hypotheses.forEach(function(h) {
            var barWidth = Math.min((h.weighted_exposure || 0) * 100, 100);
            html += '<div style="margin-bottom:6px">' +
                '<div style="display:flex;justify-content:space-between;font-size:0.65rem;margin-bottom:2px">' +
                    '<span style="color:var(--text-primary)">' + _esc(h.hypothesis || h.name || '') + '</span>' +
                    '<span style="color:var(--text-muted)">' + _fmtPctDec(h.weighted_exposure) + '</span>' +
                '</div>' +
                '<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">' +
                    '<div style="height:100%;width:' + barWidth + '%;background:#27ae60;border-radius:2px"></div>' +
                '</div>' +
                '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:1px">' +
                    (h.tickers ? h.tickers.join(', ') : '') +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    // Downside hypotheses
    if (dna.downside_hypotheses && dna.downside_hypotheses.length > 0) {
        hasContent = true;
        html += '<div style="margin-bottom:10px">' +
            '<div style="font-family:var(--font-data);font-size:0.54rem;font-weight:700;color:#e74c3c;margin-bottom:6px;letter-spacing:0.06em">DOWNSIDE EXPOSURE</div>';
        dna.downside_hypotheses.forEach(function(h) {
            var barWidth = Math.min((h.weighted_exposure || 0) * 100, 100);
            html += '<div style="margin-bottom:6px">' +
                '<div style="display:flex;justify-content:space-between;font-size:0.65rem;margin-bottom:2px">' +
                    '<span style="color:var(--text-primary)">' + _esc(h.hypothesis || h.name || '') + '</span>' +
                    '<span style="color:var(--text-muted)">' + _fmtPctDec(h.weighted_exposure) + '</span>' +
                '</div>' +
                '<div style="height:3px;background:var(--border);border-radius:2px;overflow:hidden">' +
                    '<div style="height:100%;width:' + barWidth + '%;background:#e74c3c;border-radius:2px"></div>' +
                '</div>' +
                '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:1px">' +
                    (h.tickers ? h.tickers.join(', ') : '') +
                '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    // Concentration risks
    if (dna.concentration_risks && dna.concentration_risks.length > 0) {
        hasContent = true;
        html += '<div>' +
            '<div style="font-family:var(--font-data);font-size:0.54rem;font-weight:700;color:var(--accent-gold);margin-bottom:6px;letter-spacing:0.06em">CONCENTRATION RISKS</div>';
        dna.concentration_risks.forEach(function(r) {
            html += '<div style="font-size:0.65rem;color:var(--text-primary);padding:4px 0;border-bottom:1px solid var(--border)">' +
                _esc(r.hypothesis || r.description || r) +
                (r.combined_weight ? ' (' + _fmtPctDec(r.combined_weight) + ')' : '') +
            '</div>';
        });
        html += '</div>';
    }

    if (!hasContent) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    body.innerHTML = html;
}


// ============================================================
// BEAD-007: HEDGE GAP ALERTS
// ============================================================

function _renderHedgeGaps(gaps) {
    var wrapper = document.getElementById('pmHedgeGaps');
    var body = document.getElementById('pmHedgeGapsBody');
    if (!wrapper || !body) return;

    if (!gaps) {
        wrapper.style.display = 'none';
        return;
    }

    var hasContent = false;
    var html = '';

    // Correlated downside
    if (gaps.correlated_downside && gaps.correlated_downside.length > 0) {
        hasContent = true;
        gaps.correlated_downside.forEach(function(g) {
            html += '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
                '<div style="font-size:0.70rem;font-weight:600;color:#e74c3c;margin-bottom:2px">Correlated Downside</div>' +
                '<div style="font-size:0.65rem;color:var(--text-primary)">' +
                    _esc(g.hypothesis || '') + ' -- ' + _fmtPctDec(g.combined_weight) + ' combined weight' +
                '</div>' +
                '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:2px">' +
                    'Tickers: ' + _esc((g.tickers || []).join(', ')) +
                '</div>' +
            '</div>';
        });
    }

    // Single-name unhedged
    if (gaps.single_name_unhedged && gaps.single_name_unhedged.length > 0) {
        hasContent = true;
        gaps.single_name_unhedged.forEach(function(g) {
            html += '<div style="padding:8px 0;border-bottom:1px solid var(--border)">' +
                '<div style="font-size:0.70rem;font-weight:600;color:var(--accent-gold);margin-bottom:2px">Single-Name Unhedged</div>' +
                '<div style="font-size:0.65rem;color:var(--text-primary)">' +
                    _esc(g.ticker) + ' at ' + _fmtPctDec(g.weight) +
                    (g.downside_score ? ' (downside score: ' + g.downside_score + ')' : '') +
                '</div>' +
            '</div>';
        });
    }

    if (!hasContent) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    body.innerHTML = html;
}


// ============================================================
// BEAD-008: REWEIGHTING SIGNALS
// ============================================================

function _renderReweighting(suggestions) {
    var wrapper = document.getElementById('pmReweighting');
    var body = document.getElementById('pmReweightingBody');
    if (!wrapper || !body) return;

    if (!suggestions || suggestions.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    var rows = suggestions.map(function(s) {
        var actionColor = '#95a5a6';
        var action = s.action || s.signal || '';
        if (action === 'trim' || action === 'reduce') actionColor = '#e74c3c';
        else if (action === 'add' || action === 'increase') actionColor = '#27ae60';
        else if (action === 'review') actionColor = 'var(--accent-gold)';

        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">' +
            '<span style="font-weight:600;color:var(--text-primary);font-size:0.72rem;min-width:50px">' + _esc(s.ticker || '') + '</span>' +
            '<span style="' +
                'font-family:var(--font-data);font-size:0.50rem;font-weight:700;padding:2px 6px;' +
                'border-radius:3px;color:#fff;background:' + actionColor +
            '">' + _esc(action.toUpperCase()) + '</span>' +
            '<span style="flex:1;font-size:0.65rem;color:var(--text-muted)">' + _esc(s.reason || s.rationale || '') + '</span>' +
            '<button class="pm-send-to-pm-btn" data-ticker="' + _esc(s.ticker || '') + '" data-action="' + _esc(action) + '" style="' +
                'font-family:var(--font-data);font-size:0.50rem;font-weight:600;' +
                'color:var(--accent-gold);background:none;border:1px solid var(--accent-gold);' +
                'border-radius:3px;padding:2px 8px;cursor:pointer;white-space:nowrap' +
            '">Send to PM</button>' +
        '</div>';
    });
    body.innerHTML = rows.join('');

    // Wire "Send to PM" buttons
    body.querySelectorAll('.pm-send-to-pm-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var ticker = btn.getAttribute('data-ticker');
            var action = btn.getAttribute('data-action');
            var question = 'Reweighting signal for ' + ticker + ': ' + action +
                '. Assess the portfolio impact, source of funds, and mandate compliance.';
            document.dispatchEvent(new CustomEvent('ci:pm:ask', { detail: { question: question } }));
        });
    });
}


// ============================================================
// BEAD-009: CHANGE DETECTION LOG
// ============================================================

function _renderChangeLog(changes) {
    var wrapper = document.getElementById('pmChangeLog');
    var body = document.getElementById('pmChangeLogBody');
    if (!wrapper || !body) return;

    if (!changes) {
        wrapper.style.display = 'none';
        return;
    }

    var hasContent = false;
    var html = '';

    // New positions
    if (changes.new_positions && changes.new_positions.length > 0) {
        hasContent = true;
        changes.new_positions.forEach(function(p) {
            html += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);align-items:center">' +
                '<span style="font-family:var(--font-data);font-size:0.50rem;font-weight:700;padding:2px 6px;border-radius:3px;color:#fff;background:#27ae60">NEW</span>' +
                '<span style="font-size:0.70rem;font-weight:600;color:var(--text-primary)">' + _esc(p.ticker || p) + '</span>' +
                (p.weight ? '<span style="font-size:0.62rem;color:var(--text-muted)">' + _fmtPctDec(p.weight) + '</span>' : '') +
            '</div>';
        });
    }

    // Removed positions
    if (changes.removed_positions && changes.removed_positions.length > 0) {
        hasContent = true;
        changes.removed_positions.forEach(function(p) {
            html += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);align-items:center">' +
                '<span style="font-family:var(--font-data);font-size:0.50rem;font-weight:700;padding:2px 6px;border-radius:3px;color:#fff;background:#e74c3c">REMOVED</span>' +
                '<span style="font-size:0.70rem;font-weight:600;color:var(--text-primary)">' + _esc(p.ticker || p) + '</span>' +
            '</div>';
        });
    }

    // Weight changes
    if (changes.weight_changes && changes.weight_changes.length > 0) {
        hasContent = true;
        changes.weight_changes.forEach(function(c) {
            var delta = (c.new_weight || 0) - (c.old_weight || 0);
            var deltaColor = delta > 0 ? '#27ae60' : '#e74c3c';
            var arrow = delta > 0 ? '\u2191' : '\u2193';
            html += '<div style="display:flex;gap:8px;padding:4px 0;border-bottom:1px solid var(--border);align-items:center">' +
                '<span style="font-family:var(--font-data);font-size:0.50rem;font-weight:700;padding:2px 6px;border-radius:3px;color:#fff;background:var(--accent-gold)">CHANGE</span>' +
                '<span style="font-size:0.70rem;font-weight:600;color:var(--text-primary)">' + _esc(c.ticker) + '</span>' +
                '<span style="font-size:0.62rem;color:var(--text-muted)">' +
                    _fmtPctDec(c.old_weight) + ' &rarr; ' + _fmtPctDec(c.new_weight) +
                '</span>' +
                '<span style="font-size:0.62rem;font-weight:600;color:' + deltaColor + '">' +
                    arrow + ' ' + _fmtPctDec(Math.abs(delta)) +
                '</span>' +
            '</div>';
        });
    }

    if (!hasContent) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    body.innerHTML = html;
}


// ============================================================
// HELPERS
// ============================================================

function _sectionHeader(label) {
    return '<div style="' +
        'font-family:var(--font-data);font-size:0.56rem;font-weight:700;' +
        'letter-spacing:0.10em;text-transform:uppercase;color:var(--accent-gold);' +
        'margin-bottom:10px' +
    '">' + label + '</div>';
}

function _metricStub(label, value) {
    return '<div style="' +
        'padding:12px 14px;background:var(--bg-card);border:1px solid var(--border);' +
        'border-radius:6px;text-align:center' +
    '">' +
        '<div style="' +
            'font-family:var(--font-data);font-size:0.56rem;font-weight:700;' +
            'letter-spacing:0.08em;text-transform:uppercase;color:var(--text-muted);' +
            'margin-bottom:4px' +
        '">' + label + '</div>' +
        '<div style="' +
            'font-family:var(--font-data);font-size:1.1rem;font-weight:700;' +
            'color:var(--text-primary);opacity:' + (value === '--' ? '0.3' : '1') +
        '">' + value + '</div>' +
    '</div>';
}

function _fmtCurrency(val) {
    if (val == null || isNaN(val)) return '--';
    if (val >= 1000000) return '$' + (val / 1000000).toFixed(1) + 'M';
    if (val >= 1000) return '$' + (val / 1000).toFixed(0) + 'K';
    return '$' + Number(val).toFixed(0);
}

function _fmtPct(val) {
    if (val == null || isNaN(val)) return '--';
    return (val * 100).toFixed(1) + '%';
}

function _fmtPctDec(val) {
    if (val == null || isNaN(val)) return '--';
    return (val * 100).toFixed(1) + '%';
}

function _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function _esc(str) {
    var d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}
