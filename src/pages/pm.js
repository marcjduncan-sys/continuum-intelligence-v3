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
import { formatPrice, formatPercent } from '../lib/format.js';

export function renderPMPage() {
    const container = document.getElementById('page-pm');
    if (!container || container.dataset.rendered === '1') return;

    const heroHtml =
        '<div class="pm-hero">' +
            '<div class="pm-hero-top">' +
                '<div>' +
                    '<div class="pm-hero-sub">PORTFOLIO MANAGER</div>' +
                    '<div class="pm-hero-title">Portfolio Dashboard</div>' +
                    '<div class="pm-hero-date" id="pmHeroDate"></div>' +
                '</div>' +
                '<div class="pm-actions">' +
                    '<button id="pmRefreshDiag" class="btn-light">&#8635; Refresh</button>' +
                '</div>' +
            '</div>' +
            '<div class="pm-kpi-grid">' +
                '<div class="pm-kpi"><div class="pm-kpi-k">Total Value</div><div class="pm-kpi-v" id="pmKpiValue">--</div></div>' +
                '<div class="pm-kpi"><div class="pm-kpi-k">Positions</div><div class="pm-kpi-v" id="pmKpiPositions">--</div></div>' +
                '<div class="pm-kpi"><div class="pm-kpi-k">Cash</div><div class="pm-kpi-v" id="pmKpiCash">--</div></div>' +
                '<div class="pm-kpi"><div class="pm-kpi-k">Portfolio</div><div class="pm-kpi-v pm-kpi-v--name" id="pmKpiName">None</div></div>' +
            '</div>' +
        '</div>';

    const contentCol =
        heroHtml +

        // --- Portfolio selector (hidden ID preserved for JS) ---
        '<div id="pmPortfolioSelector" class="pm-port-selector-wrap" style="display:none">' +
            '<div class="pm-port-selector">' +
                '<div class="pm-port-selector-dot"></div>' +
                '<div style="flex:1">' +
                    '<div class="pm-port-selector-kicker">PORTFOLIO</div>' +
                    '<div id="pmPortfolioName" class="pm-port-selector-name">No portfolio loaded</div>' +
                '</div>' +
            '</div>' +
        '</div>' +

        // --- Summary metrics (JS populates these) ---
        '<div id="pmSnapshotSummary" class="pm-dashboard-section">' +
            '<div class="pm-grid-3">' +
                _metricStub('Total Value', '--') +
                _metricStub('Cash', '--') +
                _metricStub('Positions', '--') +
            '</div>' +
        '</div>' +

        // --- Mandate settings (BEAD-003) ---
        '<div id="pmMandateSettings" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('MANDATE SETTINGS') +
            '<div id="pmMandateSettingsBody" class="pm-dashboard-body">No mandate configured</div>' +
        '</div>' +

        // --- Mandate breaches (BEAD-004) ---
        '<div id="pmMandateBreaches" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('MANDATE BREACHES') +
            '<div id="pmMandateBreachesBody" class="pm-dashboard-body">No breaches</div>' +
        '</div>' +

        // --- Concentration bar (Phase C) ---
        '<div id="pmConcentration" class="pm-dashboard-section">' +
            _sectionHeader('CONCENTRATION') +
            '<div class="pm-grid-4">' +
                _metricStub('Max Single', '--') +
                _metricStub('Top 5', '--') +
                _metricStub('Top 10', '--') +
                _metricStub('Score', '--') +
            '</div>' +
        '</div>' +

        // --- Top positions (Phase C) ---
        '<div id="pmTopPositions" class="pm-dashboard-section">' +
            _sectionHeader('TOP POSITIONS') +
            '<div id="pmTopPositionsBody" class="pm-dashboard-body">No portfolio loaded</div>' +
        '</div>' +

        // --- Alignment matrix (BEAD-005) ---
        '<div id="pmAlignmentMatrix" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('ALIGNMENT MATRIX') +
            '<div id="pmAlignmentMatrixBody" class="pm-dashboard-body">No portfolio loaded</div>' +
        '</div>' +

        // --- Sector exposure (Phase C) ---
        '<div id="pmSectorExposure" class="pm-dashboard-section">' +
            _sectionHeader('SECTOR EXPOSURE') +
            '<div id="pmSectorExposureBody" class="pm-dashboard-body">No portfolio loaded</div>' +
        '</div>' +

        // --- Theme exposure (BEAD-002) ---
        '<div id="pmThemeExposure" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('THEME EXPOSURE') +
            '<div id="pmThemeExposureBody" class="pm-dashboard-body">No portfolio loaded</div>' +
        '</div>' +

        // --- Hypothesis DNA (BEAD-006) ---
        '<div id="pmHypothesisDNA" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('HYPOTHESIS DNA') +
            '<div id="pmHypothesisDNABody" class="pm-dashboard-body">No portfolio loaded</div>' +
        '</div>' +

        // --- Hedge gaps (BEAD-007) ---
        '<div id="pmHedgeGaps" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('HEDGE GAP ALERTS') +
            '<div id="pmHedgeGapsBody" class="pm-dashboard-body">No gaps detected</div>' +
        '</div>' +

        // --- Reweighting signals (BEAD-008) ---
        '<div id="pmReweighting" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('REWEIGHTING SIGNALS') +
            '<div id="pmReweightingBody" class="pm-dashboard-body">No signals</div>' +
        '</div>' +

        // --- Change detection (BEAD-009) ---
        '<div id="pmChangeLog" class="pm-dashboard-section" style="display:none">' +
            _sectionHeader('CHANGE LOG') +
            '<div id="pmChangeLogBody" class="pm-dashboard-body">No changes detected</div>' +
        '</div>' +

        // --- Flags (Phase C) ---
        '<div id="pmFlags" class="pm-dashboard-section pm-flags-section">' +
            _sectionHeader('RISK FLAGS') +
            '<div id="pmFlagsBody" class="pm-dashboard-body">No flags</div>' +
        '</div>' +

        // --- How to start ---
        '<div class="pm-how-to-start">' +
            '<div class="pm-how-to-start-title">HOW TO START</div>' +
            '<p class="pm-how-to-start-desc">' +
                'Switch to PM mode using the Analyst/PM toggle in the right panel header, ' +
                'then ask a portfolio-level question. Load a portfolio to see analytics, ' +
                'concentration, and risk flags updated in real time.' +
            '</p>' +
        '</div>';

    container.innerHTML =
        '<div class="workstation">' +
            '<div class="content-col">' + contentCol + '</div>' +
            '<div id="pm-workstation-slot" class="chat-panel pm-panel-slot"></div>' +
        '</div>';

    container.dataset.rendered = '1';

    // Wire refresh button
    const refreshBtn = document.getElementById('pmRefreshDiag');
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
    const portfolioId = (typeof window.pnGetPortfolioId === 'function') ? window.pnGetPortfolioId() : null;
    if (!portfolioId) return;

    // Read mandate from localStorage
    const mandate = _readMandate();

    const params = new URLSearchParams();
    if (mandate.max_position_size != null) params.set('mandate_max_position', mandate.max_position_size);
    if (mandate.sector_cap != null) params.set('mandate_sector_cap', mandate.sector_cap);
    if (mandate.cash_range_min != null) params.set('mandate_cash_min', mandate.cash_range_min);
    if (mandate.cash_range_max != null) params.set('mandate_cash_max', mandate.cash_range_max);
    if (mandate.risk_appetite) params.set('mandate_risk_appetite', mandate.risk_appetite);
    if (mandate.turnover_tolerance) params.set('mandate_turnover_tolerance', mandate.turnover_tolerance);
    if (mandate.restricted_names && mandate.restricted_names.length > 0) {
        params.set('restricted_names', mandate.restricted_names.join(','));
    }

    const url = API_BASE + '/api/portfolios/' + portfolioId + '/diagnostics?' + params.toString();
    const headers = {};
    const apiKey = window.CI_API_KEY || '';
    if (apiKey) headers['X-API-Key'] = apiKey;
    const token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;

    fetch(url, { headers: headers })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (!data) return;
            // Update portfolio name badge
            const nameEl = document.getElementById('pmPortfolioName');
            if (nameEl) {
                const pc = (data.analytics && data.analytics.position_count) || 0;
                const tv = (data.analytics && data.analytics.total_value) || 0;
                nameEl.textContent = pc + ' holdings -- ' + _fmtCurrency(tv);
            }
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
    const defaults = {
        max_position_size: 0.15,
        sector_cap: 0.35,
        cash_range_min: 0.03,
        cash_range_max: 0.25,
        risk_appetite: 'moderate',
        turnover_tolerance: 'moderate',
        restricted_names: []
    };
    try {
        const raw = localStorage.getItem('continuum_personalisation_profile');
        if (!raw) return defaults;
        const parsed = JSON.parse(raw);
        const state = parsed.state || parsed;
        const m = state.mandate || {};
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
    const summary = document.getElementById('pmSnapshotSummary');
    if (summary) {
        const tv = analytics.total_value || 0;
        const cv = analytics.cash_value || 0;
        const pc = analytics.position_count || 0;
        summary.innerHTML =
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
                _metricStub('Total Value', _fmtCurrency(tv)) +
                _metricStub('Cash', _fmtCurrency(cv)) +
                _metricStub('Positions', String(pc)) +
            '</div>';
    }

    // Concentration
    const conc = analytics.concentration || {};
    const concEl = document.getElementById('pmConcentration');
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
    const topBody = document.getElementById('pmTopPositionsBody');
    if (topBody && analytics.top_positions && analytics.top_positions.length > 0) {
        const rows = analytics.top_positions.map(function(p) {
            return '<div class="pm-top-pos-row">' +
                '<div>' +
                    '<span class="pm-top-pos-ticker">' + _esc(p.ticker) + '</span>' +
                    '<span class="pm-top-pos-sector">' + _esc(p.sector) + '</span>' +
                '</div>' +
                '<div class="pm-top-pos-right">' +
                    '<span class="pm-top-pos-weight">' + _fmtPct(p.weight) + '</span>' +
                    '<span class="pm-top-pos-mv">' + _fmtCurrency(p.market_value) + '</span>' +
                '</div>' +
            '</div>';
        });
        topBody.innerHTML = rows.join('');
    }

    // Sector exposure
    const sectorBody = document.getElementById('pmSectorExposureBody');
    if (sectorBody && analytics.sector_exposure) {
        const sectors = Object.entries(analytics.sector_exposure);
        if (sectors.length > 0) {
            const sectorRows = sectors.map(function(entry) {
                const name = entry[0];
                const weight = entry[1];
                const barWidth = Math.min(weight * 100, 100);
                return '<div class="pm-exposure-row">' +
                    '<div class="pm-exposure-header">' +
                        '<span class="pm-exposure-name">' + _esc(name) + '</span>' +
                        '<span class="pm-exposure-value">' + _fmtPct(weight) + '</span>' +
                    '</div>' +
                    '<div class="pm-exposure-track">' +
                        '<div class="pm-exposure-fill pm-bg-gold" style="width:' + barWidth + '%"></div>' +
                    '</div>' +
                '</div>';
            });
            sectorBody.innerHTML = sectorRows.join('');
        }
    }

    // Theme exposure (BEAD-002)
    _renderThemeExposure(analytics.theme_exposure);

    // Flags
    const flagsBody = document.getElementById('pmFlagsBody');
    if (flagsBody && analytics.flags) {
        if (analytics.flags.length === 0) {
            flagsBody.innerHTML = '<div style="color:var(--text-muted);font-size:0.75rem">No risk flags triggered</div>';
        } else {
            const flagRows = analytics.flags.map(function(f) {
                const icon = f.severity === 'warning' ? '!' : 'i';
                const color = f.severity === 'warning' ? 'var(--accent-gold)' : 'var(--text-muted)';
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
    const wrapper = document.getElementById('pmThemeExposure');
    const body = document.getElementById('pmThemeExposureBody');
    if (!wrapper || !body) return;

    if (!themeExposure || Object.keys(themeExposure).length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    const themes = Object.entries(themeExposure).sort(function(a, b) { return b[1] - a[1]; });
    const themeColors = {
        'Cyclical': '#4ECDC4', 'Defensive': '#45B7D1', 'Growth': '#96CEB4',
        'Financial': '#DDA0DD', 'Real Assets': '#F4A460'
    };

    const rows = themes.map(function(entry) {
        const name = entry[0];
        const weight = entry[1];
        const barWidth = Math.min(weight * 100, 100);
        const barColor = themeColors[name] || 'var(--accent-gold)';
        return '<div class="pm-exposure-row">' +
            '<div class="pm-exposure-header">' +
                '<span class="pm-exposure-name">' + _esc(name) + '</span>' +
                '<span class="pm-exposure-value">' + _fmtPct(weight) + '</span>' +
            '</div>' +
            '<div class="pm-exposure-track">' +
                '<div class="pm-exposure-fill" style="width:' + barWidth + '%;background:' + barColor + '"></div>' +
            '</div>' +
        '</div>';
    });
    body.innerHTML = rows.join('');
}


// ============================================================
// BEAD-003: MANDATE SETTINGS DISPLAY
// ============================================================

function _renderMandateSettings(mandate) {
    const wrapper = document.getElementById('pmMandateSettings');
    const body = document.getElementById('pmMandateSettingsBody');
    if (!wrapper || !body) return;

    wrapper.style.display = '';
    const rows = [
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
    return '<div class="pm-mandate-row">' +
        '<span class="pm-mandate-label">' + _esc(label) + '</span>' +
        '<span class="pm-mandate-value">' + _esc(value) + '</span>' +
    '</div>';
}


// ============================================================
// BEAD-004: MANDATE BREACH DASHBOARD
// ============================================================

function _renderMandateBreaches(breaches) {
    const wrapper = document.getElementById('pmMandateBreaches');
    const body = document.getElementById('pmMandateBreachesBody');
    if (!wrapper || !body) return;

    if (!breaches || breaches.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    const rows = breaches.map(function(b) {
        const sevColor = b.severity === 'critical' ? '#e74c3c' : 'var(--accent-gold)';
        const sevLabel = b.severity === 'critical' ? 'CRITICAL' : 'WARNING';
        const postureLabel = (b.recommended_posture || '').replace(/_/g, ' ');
        return '<div class="pm-breach-row">' +
            '<div class="pm-breach-badge" style="background:' + sevColor + '">' + sevLabel + '</div>' +
            '<div class="pm-breach-content">' +
                '<div class="pm-breach-desc">' + _esc(b.description) + '</div>' +
                '<div class="pm-breach-meta">' +
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
    const wrapper = document.getElementById('pmAlignmentMatrix');
    const body = document.getElementById('pmAlignmentMatrixBody');
    if (!wrapper || !body) return;

    if (!holdings || holdings.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    const clsColors = {
        'aligned': '#27ae60',
        'contradicts': '#e74c3c',
        'neutral': '#95a5a6',
        'not-covered': '#7f8c8d'
    };

    // Summary bar at top
    let summaryHtml = '';
    if (summary) {
        summaryHtml =
            '<div class="pm-align-summary">' +
                '<span class="pm-text-green">Aligned: ' + _fmtPctDec(summary.aligned_weight) + '</span>' +
                '<span class="pm-text-red">Contradicts: ' + _fmtPctDec(summary.contradicts_weight) + '</span>' +
                '<span class="pm-text-neutral">Neutral: ' + _fmtPctDec(summary.neutral_weight) + '</span>' +
                '<span class="pm-text-muted">Not covered: ' + _fmtPctDec(summary.not_covered_weight) + '</span>' +
            '</div>';
    }

    const rows = holdings.map(function(h) {
        const a = h.alignment || {};
        const cls = a.cls || 'not-covered';
        const badgeColor = clsColors[cls] || '#7f8c8d';
        const skewDir = (h.skew && h.skew.direction) ? h.skew.direction : '';
        const skewScore = (h.skew && h.skew.score != null) ? h.skew.score : '';
        return '<div class="pm-align-row">' +
            '<span class="pm-align-ticker">' + _esc(h.ticker) + '</span>' +
            '<span class="pm-align-weight">' + _fmtPctDec(h.weight) + '</span>' +
            '<span class="pm-align-badge" style="background:' + badgeColor + '">' + _esc(cls.toUpperCase()) + '</span>' +
            (skewDir ? '<span class="pm-align-skew">' + _esc(skewDir) + (skewScore ? ' ' + skewScore : '') + '</span>' : '') +
        '</div>';
    });

    body.innerHTML = summaryHtml + rows.join('');
}


// ============================================================
// BEAD-006: HYPOTHESIS DNA
// ============================================================

function _renderHypothesisDNA(dna) {
    const wrapper = document.getElementById('pmHypothesisDNA');
    const body = document.getElementById('pmHypothesisDNABody');
    if (!wrapper || !body) return;

    if (!dna) {
        wrapper.style.display = 'none';
        return;
    }

    let hasContent = false;
    let html = '';

    // Upside hypotheses
    if (dna.upside_hypotheses && dna.upside_hypotheses.length > 0) {
        hasContent = true;
        html += '<div class="pm-dna-block">' +
            '<div class="pm-dna-title pm-text-green">UPSIDE EXPOSURE</div>';
        dna.upside_hypotheses.forEach(function(h) {
            const barWidth = Math.min((h.weighted_exposure || 0) * 100, 100);
            html += '<div class="pm-dna-row">' +
                '<div class="pm-dna-header">' +
                    '<span class="pm-dna-name">' + _esc(h.hypothesis || h.name || '') + '</span>' +
                    '<span class="pm-dna-weight">' + _fmtPctDec(h.weighted_exposure) + '</span>' +
                '</div>' +
                '<div class="pm-dna-track">' +
                    '<div class="pm-dna-fill pm-bg-green" style="width:' + barWidth + '%"></div>' +
                '</div>' +
                '<div class="pm-dna-tickers">' + (h.tickers ? h.tickers.join(', ') : '') + '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    // Downside hypotheses
    if (dna.downside_hypotheses && dna.downside_hypotheses.length > 0) {
        hasContent = true;
        html += '<div class="pm-dna-block">' +
            '<div class="pm-dna-title pm-text-red">DOWNSIDE EXPOSURE</div>';
        dna.downside_hypotheses.forEach(function(h) {
            const barWidth = Math.min((h.weighted_exposure || 0) * 100, 100);
            html += '<div class="pm-dna-row">' +
                '<div class="pm-dna-header">' +
                    '<span class="pm-dna-name">' + _esc(h.hypothesis || h.name || '') + '</span>' +
                    '<span class="pm-dna-weight">' + _fmtPctDec(h.weighted_exposure) + '</span>' +
                '</div>' +
                '<div class="pm-dna-track">' +
                    '<div class="pm-dna-fill pm-bg-red" style="width:' + barWidth + '%"></div>' +
                '</div>' +
                '<div class="pm-dna-tickers">' + (h.tickers ? h.tickers.join(', ') : '') + '</div>' +
            '</div>';
        });
        html += '</div>';
    }

    // Concentration risks
    if (dna.concentration_risks && dna.concentration_risks.length > 0) {
        hasContent = true;
        html += '<div>' +
            '<div class="pm-dna-title pm-text-gold">CONCENTRATION RISKS</div>';
        dna.concentration_risks.forEach(function(r) {
            html += '<div class="pm-dna-risk">' +
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
    const wrapper = document.getElementById('pmHedgeGaps');
    const body = document.getElementById('pmHedgeGapsBody');
    if (!wrapper || !body) return;

    if (!gaps) {
        wrapper.style.display = 'none';
        return;
    }

    let hasContent = false;
    let html = '';

    // Correlated downside
    if (gaps.correlated_downside && gaps.correlated_downside.length > 0) {
        hasContent = true;
        gaps.correlated_downside.forEach(function(g) {
            html += '<div class="pm-gap-row">' +
                '<div class="pm-gap-type pm-text-red">Correlated Downside</div>' +
                '<div class="pm-gap-desc">' +
                    _esc(g.hypothesis || '') + ' -- ' + _fmtPctDec(g.combined_weight) + ' combined weight' +
                '</div>' +
                '<div class="pm-gap-tickers">Tickers: ' + _esc((g.tickers || []).join(', ')) + '</div>' +
            '</div>';
        });
    }

    // Single-name unhedged
    if (gaps.single_name_unhedged && gaps.single_name_unhedged.length > 0) {
        hasContent = true;
        gaps.single_name_unhedged.forEach(function(g) {
            html += '<div class="pm-gap-row">' +
                '<div class="pm-gap-type pm-text-gold">Single-Name Unhedged</div>' +
                '<div class="pm-gap-desc">' +
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
    const wrapper = document.getElementById('pmReweighting');
    const body = document.getElementById('pmReweightingBody');
    if (!wrapper || !body) return;

    if (!suggestions || suggestions.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    wrapper.style.display = '';
    const rows = suggestions.map(function(s) {
        let actionColor = '#95a5a6';
        const action = s.suggested_direction || s.action || '';
        if (action.indexOf('trim') >= 0) actionColor = '#e74c3c';
        else if (action.indexOf('increase') >= 0 || action === 'add') actionColor = '#27ae60';
        else if (action.indexOf('review') >= 0) actionColor = 'var(--accent-gold)';
        const actionLabel = action.replace(/_/g, ' ');

        return '<div class="pm-reweight-row">' +
            '<span class="pm-reweight-ticker">' + _esc(s.ticker || '') + '</span>' +
            '<span class="pm-reweight-badge" style="background:' + actionColor + '">' + _esc(actionLabel.toUpperCase()) + '</span>' +
            '<span class="pm-reweight-reason">' + _esc(s.reason || s.rationale || '') + '</span>' +
            '<button class="pm-send-to-pm-btn pm-send-btn-small" data-ticker="' + _esc(s.ticker || '') + '" data-action="' + _esc(actionLabel) + '" data-reason="' + _esc(s.reason || '') + '">Send to PM</button>' +
        '</div>';
    });
    body.innerHTML = rows.join('');

    // Wire "Send to PM" buttons
    body.querySelectorAll('.pm-send-to-pm-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const ticker = btn.getAttribute('data-ticker');
            const action = btn.getAttribute('data-action');
            const reason = btn.getAttribute('data-reason') || '';
            const question = 'Reweighting signal for ' + ticker + ': ' + action + '.' +
                (reason ? ' Reason: ' + reason + '.' : '') +
                ' Assess the portfolio impact, source of funds, and mandate compliance.';
            document.dispatchEvent(new CustomEvent('ci:pm:ask', { detail: { question: question } }));
        });
    });
}


// ============================================================
// BEAD-009: CHANGE DETECTION LOG
// ============================================================

function _renderChangeLog(changes) {
    const wrapper = document.getElementById('pmChangeLog');
    const body = document.getElementById('pmChangeLogBody');
    if (!wrapper || !body) return;

    // Backend returns a flat array of {ticker, change_type, description}
    if (!changes || !Array.isArray(changes) || changes.length === 0) {
        wrapper.style.display = 'none';
        return;
    }

    let html = '';
    changes.forEach(function(c) {
        const type = c.change_type || '';
        let badgeColor = '#95a5a6';
        let badgeLabel = 'CHANGE';
        if (type === 'new_position') { badgeColor = '#27ae60'; badgeLabel = 'NEW'; }
        else if (type === 'removed_position') { badgeColor = '#e74c3c'; badgeLabel = 'REMOVED'; }
        else if (type.indexOf('weight_') === 0) { badgeColor = 'var(--accent-gold)'; badgeLabel = 'WEIGHT'; }

        html += '<div class="pm-log-row">' +
            '<span class="pm-log-badge" style="background:' + badgeColor + '">' + badgeLabel + '</span>' +
            '<span class="pm-log-ticker">' + _esc(c.ticker || '') + '</span>' +
            '<span class="pm-log-desc">' + _esc(c.description || '') + '</span>' +
        '</div>';
    });

    if (!html) {
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
    return '<div class="pm-dash-header">' + label + '</div>';
}

function _metricStub(label, value) {
    return '<div class="pm-metric-card">' +
        '<div class="pm-metric-label">' + label + '</div>' +
        '<div class="pm-metric-value"' + (value === '--' ? ' style="opacity:0.3"' : '') + '>' + value + '</div>' +
    '</div>';
}

function _fmtCurrency(val) {
    if (val == null || isNaN(val)) return '--';
    if (val >= 1000000) return '$' + formatPrice(val / 1000000, 1) + 'M';
    if (val >= 1000) return '$' + formatPrice(val / 1000, 0) + 'K';
    return '$' + formatPrice(val, 0);
}

function _fmtPct(val) {
    if (val == null || isNaN(val)) return '--';
    return formatPercent(val * 100);
}

function _fmtPctDec(val) {
    if (val == null || isNaN(val)) return '--';
    return formatPercent(val * 100);
}

function _capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}
