/**
 * pm.js -- PM page renderer
 *
 * Renders the main content area for the #pm route.
 * Phase A: polished landing page explaining PM Chat.
 * Phase B: portfolio selector placeholder and snapshot summary stub.
 * Phase C: analytics dashboard (top positions, concentration, sector exposure, flags).
 */

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
                    '<div style="' +
                        'font-family:var(--font-data);font-size:0.58rem;' +
                        'color:var(--text-muted);opacity:0.5' +
                    '">Select</div>' +
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

function _capabilityCard(title, description) {
    return '<div style="' +
        'padding:14px;background:var(--bg-card);border:1px solid var(--border);' +
        'border-radius:6px' +
    '">' +
        '<div style="' +
            'font-family:var(--font-data);font-size:0.65rem;font-weight:700;' +
            'letter-spacing:0.06em;color:var(--text-primary);margin-bottom:4px' +
        '">' + title + '</div>' +
        '<div style="' +
            'font-size:0.75rem;line-height:1.5;color:var(--text-muted)' +
        '">' + description + '</div>' +
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

function _esc(str) {
    var d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}
