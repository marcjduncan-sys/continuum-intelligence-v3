/**
 * memory.js -- Analyst Journal Page
 *
 * Renders at #page-memory. Fetches all active memories from the API,
 * groups them by stock (default), type, or date, and allows archiving
 * and challenging individual insights.
 */

import { STOCK_DATA } from '../lib/state.js';
import { API_BASE } from '../lib/api-config.js';

var apiOrigin = API_BASE;

// ============================================================
// VIEW STATE
// ============================================================

var _currentView = 'stock'; // 'stock' | 'type' | 'date'
var _currentFilter = '';    // ticker filter
var _currentSource = 'analyst'; // 'analyst' | 'pm'

// ============================================================
// AUTH HELPERS
// ============================================================

function _getAuthHeaders() {
    var headers = {};
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return { headers: headers, token: token };
}

function _getGuestParam(token) {
    if (token) return '';
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    return guestId ? '?guest_id=' + encodeURIComponent(guestId) : '';
}

function _escHtml(str) {
    var d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}

// ============================================================
// FORMATTING
// ============================================================

function _formatAge(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var diff = Date.now() - d.getTime();
    var days = Math.floor(diff / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1 day ago';
    if (days < 30) return days + ' days ago';
    var months = Math.floor(days / 30);
    return months === 1 ? '1 month ago' : months + ' months ago';
}

function _formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var day = d.getDate();
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return day + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function _confLabel(conf) {
    if (conf >= 0.7) return 'high';
    if (conf >= 0.4) return 'medium';
    return 'low';
}

// ============================================================
// TYPE CLASSIFICATION
// ============================================================

var TYPE_CONFIG = {
    conviction:       { label: 'CONVICTION', borderColor: '#22c55e', badgeBg: 'rgba(34,197,94,.12)',  badgeColor: '#16a34a' },
    risk_flag:        { label: 'RISK FLAG',  borderColor: '#f59e0b', badgeBg: 'rgba(245,158,11,.12)', badgeColor: '#d97706' },
    valuation:        { label: 'VALUATION',  borderColor: '#3b82f6', badgeBg: 'rgba(59,130,246,.12)', badgeColor: '#2563eb' },
    thesis_challenge: { label: 'CHALLENGE',  borderColor: '#ef4444', badgeBg: 'rgba(239,68,68,.12)',  badgeColor: '#dc2626' },
    process_note:     { label: 'PROCESS',    borderColor: '#6b7280', badgeBg: 'rgba(107,114,128,.1)', badgeColor: '#4b5563' }
};

function _classifyMemory(m) {
    var content = (m.content || '').toLowerCase();
    var tags = (m.tags || []).map(function(t) { return t.toLowerCase(); });

    // Non-ticker = process note (check early)
    if (!m.ticker) return 'process_note';

    // Check tags first (most reliable signal)
    if (tags.indexOf('valuation') !== -1 || tags.indexOf('entry-point') !== -1 || tags.indexOf('dislocation') !== -1 || tags.indexOf('multiple') !== -1) return 'valuation';
    if (tags.indexOf('risk') !== -1 || tags.indexOf('management-risk') !== -1 || tags.indexOf('governance') !== -1 || tags.indexOf('tail-risk') !== -1) return 'risk_flag';
    if (tags.indexOf('catalyst') !== -1 || tags.indexOf('earnings') !== -1 || tags.indexOf('conviction') !== -1) return 'conviction';

    // Content-based classification
    if (content.indexOf('disagree') !== -1 || content.indexOf('challenge') !== -1 || content.indexOf('skepti') !== -1 || content.indexOf('dismiss') !== -1 || content.indexOf('overstat') !== -1) return 'thesis_challenge';
    if (content.indexOf('risk') !== -1 || content.indexOf('concern') !== -1 || content.indexOf('worry') !== -1 || content.indexOf('flag') !== -1 || content.indexOf('caution') !== -1) return 'risk_flag';
    if (content.indexOf('valuation') !== -1 || (content.indexOf('price') !== -1 && (content.indexOf('entry') !== -1 || content.indexOf('target') !== -1 || content.indexOf('multiple') !== -1 || content.indexOf('cheap') !== -1 || content.indexOf('expensive') !== -1))) return 'valuation';

    // Default for positional/tactical with ticker = conviction
    return 'conviction';
}

function _getTypeConfig(type) {
    return TYPE_CONFIG[type] || TYPE_CONFIG.conviction;
}

// ============================================================
// CSS INJECTION
// ============================================================

function _injectCSS() {
    if (document.getElementById('journal-page-css')) return;
    var style = document.createElement('style');
    style.id = 'journal-page-css';
    style.textContent =
        '#page-memory{padding:96px 32px 24px;max-width:960px;margin:0 auto}' +

        // Header
        '.jnl-header{margin-bottom:8px}' +
        '.jnl-header h2{font-size:22px;font-weight:700;color:var(--text-primary,#222);margin:0 0 4px}' +
        '.jnl-subtitle{font-size:13px;color:var(--text-secondary,#888);line-height:1.4;margin-bottom:16px}' +

        // Controls bar
        '.jnl-controls{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}' +
        '.jnl-view-toggle{display:flex;border:1px solid var(--border,#e0e0e0);border-radius:5px;overflow:hidden}' +
        '.jnl-view-btn{background:var(--bg-primary,#fff);border:none;padding:6px 14px;font-size:12px;font-weight:600;letter-spacing:.03em;color:var(--text-secondary,#666);cursor:pointer;transition:background .15s,color .15s}' +
        '.jnl-view-btn:not(:last-child){border-right:1px solid var(--border,#e0e0e0)}' +
        '.jnl-view-btn.active{background:var(--accent,#003A70);color:#fff}' +
        '.jnl-view-btn:hover:not(.active){background:var(--bg-hover,rgba(0,0,0,.04))}' +
        '.jnl-filter{padding:5px 10px;font-size:12px;border:1px solid var(--border,#e0e0e0);border-radius:5px;background:var(--bg-primary,#fff);color:var(--text-primary,#222);min-width:140px}' +
        '.jnl-count{font-size:12px;color:var(--text-secondary,#888);margin-left:auto}' +

        // Stock group (collapsible)
        '.jnl-stock-group{margin-bottom:24px}' +
        '.jnl-stock-header{display:flex;align-items:center;gap:10px;padding:8px 0 6px;border-bottom:1px solid var(--border,#e5e5e5);margin-bottom:10px;cursor:pointer;user-select:none}' +
        '.jnl-stock-header:hover .jnl-stock-ticker{opacity:.8}' +
        '.jnl-stock-arrow{transition:transform .2s;font-size:9px;color:var(--text-secondary,#999)}' +
        '.jnl-stock-group.collapsed .jnl-stock-arrow{transform:rotate(-90deg)}' +
        '.jnl-stock-group.collapsed .jnl-stock-cards{display:none}' +
        '.jnl-stock-ticker{font-size:14px;font-weight:700;color:var(--accent,#003A70)}' +
        '.jnl-stock-name{font-size:13px;color:var(--text-secondary,#666)}' +
        '.jnl-stock-meta{margin-left:auto;display:flex;gap:10px;align-items:center;font-size:11px}' +
        '.jnl-stock-count{color:var(--text-secondary,#999)}' +
        '.jnl-skew{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}' +
        '.jnl-skew-upside{background:#e8f5e9;color:#2e7d32}' +
        '.jnl-skew-downside{background:#fce4ec;color:#c62828}' +
        '.jnl-skew-balanced{background:#fff8e1;color:#f57f17}' +

        // Type group (collapsible)
        '.jnl-type-group{margin-bottom:24px}' +
        '.jnl-type-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary,#666);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border,#e5e5e5);cursor:pointer;user-select:none;display:flex;align-items:center;gap:6px}' +
        '.jnl-type-title:hover{color:var(--text-primary,#333)}' +
        '.jnl-type-arrow{transition:transform .2s;font-size:9px}' +
        '.jnl-type-group.collapsed .jnl-type-arrow{transform:rotate(-90deg)}' +
        '.jnl-type-group.collapsed .jnl-type-cards{display:none}' +

        // Date group
        '.jnl-date-group{margin-bottom:20px}' +
        '.jnl-date-title{font-size:12px;font-weight:600;color:var(--text-secondary,#666);margin-bottom:8px}' +

        // Card
        '.jnl-card{display:flex;align-items:flex-start;padding:12px 14px;border:1px solid var(--border-light,#f0f0f0);border-left:3px solid var(--text-secondary,#888);border-radius:4px;margin-bottom:8px;background:var(--bg-primary,#fff);transition:border-color .15s}' +
        '.jnl-card:hover{border-color:var(--border,#ccc)}' +
        '.jnl-card-body{flex:1;min-width:0}' +
        '.jnl-card-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}' +
        '.jnl-type-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 7px;border-radius:3px}' +
        '.jnl-card-ticker{font-size:12px;font-weight:600;color:var(--accent,#003A70)}' +
        '.jnl-card-date{font-size:11px;color:var(--text-secondary,#999);margin-left:auto}' +
        '.jnl-card-content{font-size:13px;color:var(--text-primary,#222);line-height:1.5;margin-bottom:6px}' +
        '.jnl-card-source{font-size:11px;color:var(--text-secondary,#999);margin-bottom:6px;font-style:italic}' +
        '.jnl-card-tags{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}' +
        '.jnl-tag{background:var(--bg-secondary,#f5f5f5);padding:1px 6px;border-radius:3px;font-size:10px;color:var(--text-secondary,#777)}' +
        '.jnl-card-actions{display:flex;gap:8px}' +
        '.jnl-action-btn{background:none;border:1px solid var(--border-light,#e0e0e0);cursor:pointer;color:var(--text-secondary,#888);padding:3px 10px;border-radius:3px;font-size:11px;transition:all .15s}' +
        '.jnl-action-btn:hover{color:var(--text-primary,#333);border-color:var(--border,#bbb);background:var(--bg-hover,rgba(0,0,0,.03))}' +
        '.jnl-action-btn.archive:hover{color:#c62828;border-color:#c62828}' +

        // Archived section
        '.jnl-archived{margin-top:32px;border-top:1px solid var(--border,#e5e5e5);padding-top:16px}' +
        '.jnl-archived-toggle{background:none;border:none;cursor:pointer;font-size:12px;font-weight:600;color:var(--text-secondary,#888);padding:4px 0;display:flex;align-items:center;gap:6px}' +
        '.jnl-archived-toggle:hover{color:var(--text-primary,#444)}' +
        '.jnl-archived-toggle:focus-visible{outline:2px solid var(--accent,#003A70);outline-offset:2px}' +
        '.jnl-toggle-arrow{font-size:10px;transition:transform .15s}' +
        '.jnl-toggle-arrow.open{transform:rotate(90deg)}' +
        '.jnl-archived-list .jnl-card{opacity:0.55}' +
        '.jnl-archived-list .jnl-card:hover{opacity:0.8}' +

        // Evidence drift alerts
        '.jnl-drift{margin-bottom:20px;border:1px solid rgba(239,68,68,.25);border-left:3px solid #ef4444;border-radius:4px;background:rgba(239,68,68,.04);padding:14px 16px}' +
        '.jnl-drift-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#dc2626}' +
        '.jnl-drift-item{padding:10px 0;border-top:1px solid rgba(239,68,68,.12)}' +
        '.jnl-drift-item:first-child{border-top:none;padding-top:0}' +
        '.jnl-drift-ticker{font-weight:700;color:var(--accent,#003A70);font-size:13px}' +
        '.jnl-drift-text{font-size:13px;color:var(--text-primary,#222);line-height:1.45;margin:4px 0 8px}' +
        '.jnl-drift-actions{display:flex;gap:8px}' +
        '.jnl-drift-btn{background:none;border:1px solid rgba(239,68,68,.3);cursor:pointer;color:#dc2626;padding:3px 10px;border-radius:3px;font-size:11px;font-weight:600;transition:all .15s}' +
        '.jnl-drift-skew{font-size:11px;font-weight:600;color:#dc2626;margin-left:4px}' +
        '.jnl-drift-btn:hover{background:rgba(239,68,68,.08);border-color:#ef4444}' +

        // Empty and loading
        '.jnl-empty{text-align:center;padding:48px 16px;color:var(--text-secondary,#888);font-size:14px;line-height:1.5}' +
        '.jnl-loading{text-align:center;padding:48px 16px;color:var(--text-secondary,#999);font-size:13px}';
    document.head.appendChild(style);
}

// ============================================================
// PM TYPE CONFIG
// ============================================================

var PM_TYPE_CONFIG = {
    pm_decision:          { label: 'DECISION',   borderColor: '#003A70', badgeBg: 'rgba(0,58,112,.10)',   badgeColor: '#003A70' },
    portfolio_risk:       { label: 'RISK',        borderColor: '#ef4444', badgeBg: 'rgba(239,68,68,.10)',  badgeColor: '#dc2626' },
    mandate_breach:       { label: 'BREACH',      borderColor: '#f59e0b', badgeBg: 'rgba(245,158,11,.12)', badgeColor: '#d97706' },
    sizing_principle:     { label: 'SIZING',      borderColor: '#8b5cf6', badgeBg: 'rgba(139,92,246,.10)', badgeColor: '#7c3aed' },
    rebalance_suggestion: { label: 'REBALANCE',   borderColor: '#06b6d4', badgeBg: 'rgba(6,182,212,.10)', badgeColor: '#0891b2' },
    uncovered_exposure:   { label: 'UNCOVERED',   borderColor: '#6b7280', badgeBg: 'rgba(107,114,128,.10)', badgeColor: '#4b5563' },
    change_alert:         { label: 'CHANGE',      borderColor: '#10b981', badgeBg: 'rgba(16,185,129,.10)', badgeColor: '#059669' }
};

var PM_ACTION_CONFIG = {
    trim:      { label: 'TRIM',      color: '#ef4444' },
    add:       { label: 'ADD',       color: '#22c55e' },
    exit:      { label: 'EXIT',      color: '#dc2626' },
    hold:      { label: 'HOLD',      color: '#6b7280' },
    rebalance: { label: 'REBALANCE', color: '#06b6d4' },
    watch:     { label: 'WATCH',     color: '#f59e0b' },
    no_action: { label: 'NO ACTION', color: '#9ca3af' }
};

// ============================================================
// PM JOURNAL CSS (injected alongside main CSS)
// ============================================================

function _injectPMCSS() {
    if (document.getElementById('pm-journal-css')) return;
    var style = document.createElement('style');
    style.id = 'pm-journal-css';
    style.textContent =
        // Source toggle bar (Analyst | PM)
        '.jnl-source-toggle{display:flex;border:1px solid var(--border,#e0e0e0);border-radius:5px;overflow:hidden;margin-bottom:16px}' +
        '.jnl-source-btn{background:var(--bg-primary,#fff);border:none;padding:8px 20px;font-size:13px;font-weight:600;letter-spacing:.03em;color:var(--text-secondary,#666);cursor:pointer;transition:background .15s,color .15s;flex:1;text-align:center}' +
        '.jnl-source-btn:not(:last-child){border-right:1px solid var(--border,#e0e0e0)}' +
        '.jnl-source-btn.active{background:var(--accent,#003A70);color:#fff}' +
        '.jnl-source-btn:hover:not(.active){background:var(--bg-hover,rgba(0,0,0,.04))}' +

        // PM decision card
        '.jnl-pm-decision{border-left:3px solid #003A70;padding:12px 14px;border:1px solid var(--border-light,#f0f0f0);border-left:3px solid #003A70;border-radius:4px;margin-bottom:8px;background:var(--bg-primary,#fff)}' +
        '.jnl-pm-decision-top{display:flex;align-items:center;gap:8px;margin-bottom:6px}' +
        '.jnl-pm-action-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:3px;color:#fff}' +
        '.jnl-pm-decision-ticker{font-size:13px;font-weight:700;color:var(--accent,#003A70)}' +
        '.jnl-pm-decision-date{font-size:11px;color:var(--text-secondary,#999);margin-left:auto}' +
        '.jnl-pm-rationale{font-size:13px;color:var(--text-primary,#222);line-height:1.5;margin-bottom:6px}' +
        '.jnl-pm-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:6px}' +
        '.jnl-pm-meta-item{font-size:11px;color:var(--text-secondary,#777);background:var(--bg-secondary,#f5f5f5);padding:2px 8px;border-radius:3px}' +
        '.jnl-pm-breach-tag{font-size:10px;font-weight:600;color:#dc2626;background:rgba(239,68,68,.08);padding:2px 6px;border-radius:3px}' +

        // PM insight card
        '.jnl-pm-insight{border-left:3px solid #6b7280;padding:12px 14px;border:1px solid var(--border-light,#f0f0f0);border-radius:4px;margin-bottom:8px;background:var(--bg-primary,#fff)}' +
        '.jnl-pm-insight.archived{opacity:0.5}' +
        '.jnl-pm-insight-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}' +
        '.jnl-pm-insight-date{font-size:11px;color:var(--text-secondary,#999);margin-left:auto}' +
        '.jnl-pm-insight-content{font-size:13px;color:var(--text-primary,#222);line-height:1.5;margin-bottom:6px}' +
        '.jnl-pm-insight-tickers{display:flex;gap:4px;margin-bottom:6px}' +
        '.jnl-pm-ticker-tag{font-size:11px;font-weight:600;color:var(--accent,#003A70);background:rgba(0,58,112,.06);padding:1px 6px;border-radius:3px}' +
        '.jnl-pm-insight-actions{display:flex;gap:8px}' +

        // PM confidence badge
        '.jnl-pm-confidence{display:inline-block;font-size:10px;font-weight:600;padding:1px 6px;border-radius:3px;margin-bottom:6px}' +
        '.jnl-pm-confidence--high{color:#15803d;background:rgba(34,197,94,.08)}' +
        '.jnl-pm-confidence--med{color:#a16207;background:rgba(234,179,8,.08)}' +
        '.jnl-pm-confidence--low{color:#dc2626;background:rgba(239,68,68,.08)}';
    document.head.appendChild(style);
}

// ============================================================
// PM JOURNAL API
// ============================================================

async function _fetchPMJournal(token, options) {
    options = options || {};
    var params = [];
    var gp = _getGuestParam(token);
    if (gp) params.push(gp.slice(1)); // remove leading ?
    if (options.ticker) params.push('ticker=' + encodeURIComponent(options.ticker));
    if (options.insightType) params.push('insight_type=' + encodeURIComponent(options.insightType));
    if (options.includeArchived) params.push('include_archived=true');
    var qs = params.length > 0 ? '?' + params.join('&') : '';
    var url = apiOrigin + '/api/pm-journal' + qs;
    var auth = _getAuthHeaders();
    try {
        var res = await fetch(url, { headers: auth.headers });
        if (!res.ok) return [];
        var data = await res.json();
        return data.entries || [];
    } catch (e) {
        return [];
    }
}

async function _archivePMInsight(id, token) {
    var url = apiOrigin + '/api/pm-journal/insights/' + id + '/archive' + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        await fetch(url, { method: 'POST', headers: auth.headers });
    } catch (e) { /* silent */ }
}

async function _restorePMInsight(id, token) {
    var url = apiOrigin + '/api/pm-journal/insights/' + id + '/restore' + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        await fetch(url, { method: 'POST', headers: auth.headers });
    } catch (e) { /* silent */ }
}

// ============================================================
// PM CARD RENDERING
// ============================================================

function _renderPMDecisionCard(d) {
    var actionCfg = PM_ACTION_CONFIG[d.action_type] || PM_ACTION_CONFIG.hold;
    var html = '<div class="jnl-pm-decision" data-id="' + _escHtml(d.id) + '">';
    html += '<div class="jnl-pm-decision-top">';
    html += '<span class="jnl-pm-action-badge" style="background:' + actionCfg.color + '">' + actionCfg.label + '</span>';
    if (d.ticker) html += '<span class="jnl-pm-decision-ticker">' + _escHtml(d.ticker) + '</span>';
    html += '<span class="jnl-pm-decision-date">' + _formatDate(d.created_at) + '</span>';
    html += '</div>';
    html += '<div class="jnl-pm-rationale">' + _escHtml(d.rationale) + '</div>';

    // Meta items
    var meta = [];
    if (d.sizing_band) meta.push('Size: ' + d.sizing_band);
    if (d.source_of_funds) meta.push('Source: ' + d.source_of_funds);
    if (d.mandate_basis) meta.push('Mandate: ' + d.mandate_basis);
    if (d.coverage_state) meta.push('Coverage: ' + d.coverage_state);
    if (meta.length > 0) {
        html += '<div class="jnl-pm-meta">';
        meta.forEach(function(m) {
            html += '<span class="jnl-pm-meta-item">' + _escHtml(m) + '</span>';
        });
        html += '</div>';
    }

    // Breach tags
    if (d.breach_codes && d.breach_codes.length > 0) {
        html += '<div class="jnl-pm-meta">';
        d.breach_codes.forEach(function(code) {
            html += '<span class="jnl-pm-breach-tag">' + _escHtml(code) + '</span>';
        });
        html += '</div>';
    }

    html += '</div>';
    return html;
}

function _renderPMInsightCard(i) {
    var typeCfg = PM_TYPE_CONFIG[i.insight_type] || PM_TYPE_CONFIG.portfolio_risk;
    var archivedClass = i.active === false ? ' archived' : '';
    var borderStyle = 'border-left-color:' + typeCfg.borderColor;
    var html = '<div class="jnl-pm-insight' + archivedClass + '" data-id="' + _escHtml(i.id) + '" style="' + borderStyle + '">';
    html += '<div class="jnl-pm-insight-top">';
    html += '<span class="jnl-type-badge" style="background:' + typeCfg.badgeBg + ';color:' + typeCfg.badgeColor + '">' + typeCfg.label + '</span>';
    html += '<span class="jnl-pm-insight-date">' + _formatDate(i.created_at) + '</span>';
    html += '</div>';
    html += '<div class="jnl-pm-insight-content">' + _escHtml(i.content) + '</div>';

    // Confidence
    if (typeof i.confidence === 'number') {
        var pct = Math.round(i.confidence * 100);
        var confClass = pct >= 80 ? 'high' : pct >= 50 ? 'med' : 'low';
        html += '<span class="jnl-pm-confidence jnl-pm-confidence--' + confClass + '">' + pct + '% confidence</span>';
    }

    // Ticker tags
    if (i.tickers && i.tickers.length > 0) {
        html += '<div class="jnl-pm-insight-tickers">';
        i.tickers.forEach(function(t) {
            html += '<span class="jnl-pm-ticker-tag">' + _escHtml(t) + '</span>';
        });
        html += '</div>';
    }

    // Tags
    if (i.tags && i.tags.length > 0) {
        html += '<div class="jnl-card-tags">';
        i.tags.slice(0, 5).forEach(function(t) {
            html += '<span class="jnl-tag">' + _escHtml(t) + '</span>';
        });
        html += '</div>';
    }

    // Actions
    html += '<div class="jnl-pm-insight-actions">';
    if (i.active !== false) {
        html += '<button class="jnl-action-btn archive pm-archive" data-id="' + _escHtml(i.id) + '">Archive</button>';
    } else {
        html += '<button class="jnl-action-btn pm-restore" data-id="' + _escHtml(i.id) + '">Restore</button>';
    }
    html += '</div>';

    html += '</div>';
    return html;
}

function _renderPMJournal(entries) {
    var decisions = entries.filter(function(e) { return e.journal_type === 'decision'; });
    var insights = entries.filter(function(e) { return e.journal_type === 'insight'; });
    var activeInsights = insights.filter(function(e) { return e.active !== false; });
    var archivedInsights = insights.filter(function(e) { return e.active === false; });

    var html = '';

    // Decisions section
    if (decisions.length > 0) {
        html += '<div class="jnl-type-group">';
        html += '<div class="jnl-type-title"><span class="jnl-type-arrow">&#9660;</span> DECISIONS (' + decisions.length + ')</div>';
        html += '<div class="jnl-type-cards">';
        decisions.forEach(function(d) { html += _renderPMDecisionCard(d); });
        html += '</div></div>';
    }

    // Active insights section
    if (activeInsights.length > 0) {
        html += '<div class="jnl-type-group">';
        html += '<div class="jnl-type-title"><span class="jnl-type-arrow">&#9660;</span> INSIGHTS (' + activeInsights.length + ')</div>';
        html += '<div class="jnl-type-cards">';
        activeInsights.forEach(function(i) { html += _renderPMInsightCard(i); });
        html += '</div></div>';
    }

    // Archived section
    if (archivedInsights.length > 0) {
        html += '<div class="jnl-archived">';
        html += '<button class="jnl-archived-toggle" aria-expanded="false">';
        html += 'Archived (' + archivedInsights.length + ') ';
        html += '<span class="jnl-toggle-arrow">\u25B8</span>';
        html += '</button>';
        html += '<div class="jnl-archived-list" style="display:none;">';
        archivedInsights.forEach(function(i) { html += _renderPMInsightCard(i); });
        html += '</div></div>';
    }

    if (entries.length === 0) {
        html += '<div class="jnl-empty">No PM journal entries yet.<br>Ask a portfolio-level question in the PM panel to start building your decision record.</div>';
    }

    return html;
}

// ============================================================
// API
// ============================================================

async function _fetchMemories(token) {
    var url = apiOrigin + '/api/memories' + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        var res = await fetch(url, { headers: auth.headers });
        if (!res.ok) return [];
        var data = await res.json();
        return data.memories || [];
    } catch (e) {
        return [];
    }
}

async function _archiveMemory(id, token) {
    var url = apiOrigin + '/api/memories/' + id + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        await fetch(url, { method: 'DELETE', headers: auth.headers });
    } catch (e) {
        // silent
    }
}

async function _fetchNotifications(token) {
    var url = apiOrigin + '/api/notifications' + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        var res = await fetch(url, { headers: auth.headers });
        if (!res.ok) return [];
        var data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function _renderDriftAlerts(notifications) {
    // Only show CONTRADICTS signals as evidence drift
    var drifts = notifications.filter(function(n) { return n.signal === 'contradicts'; });
    if (drifts.length === 0) return '';

    var html = '<div class="jnl-drift">';
    html += '<div class="jnl-drift-header">Evidence Drift (' + drifts.length + ')</div>';

    drifts.forEach(function(n) {
        var stock = STOCK_DATA[n.ticker] || {};
        var skew = stock.skew || {};
        var currentSkew = (skew.direction || '').toUpperCase();

        html += '<div class="jnl-drift-item" data-id="' + _escHtml(n.id) + '">';
        html += '<span class="jnl-drift-ticker">' + _escHtml(n.ticker) + '</span>';
        if (currentSkew) {
            html += ' <span class="jnl-drift-skew">Current skew: ' + _escHtml(currentSkew) + '</span>';
        }
        html += '<div class="jnl-drift-text">' + _escHtml(n.summary) + '</div>';
        html += '<div class="jnl-drift-actions">';
        html += '<button class="jnl-drift-btn drift-research" data-ticker="' + _escHtml(n.ticker) + '">Open research</button>';
        html += '<button class="jnl-drift-btn drift-discuss" data-ticker="' + _escHtml(n.ticker) + '" data-summary="' + _escHtml(n.summary) + '">Discuss with analyst</button>';
        html += '<button class="jnl-drift-btn drift-dismiss" data-id="' + _escHtml(n.id) + '">Dismiss</button>';
        html += '</div>';
        html += '</div>';
    });

    html += '</div>';
    return html;
}

// ============================================================
// SECOND-PERSON VOICE REWRITE
// ============================================================

function _toSecondPerson(text) {
    if (!text) return '';
    var t = text.trim();
    var lower = t.toLowerCase();

    // Already second person
    if (lower.startsWith('you ') || lower.startsWith('your ')) return t;

    // Conviction / directional views
    if (/^(believes?|bullish|bearish|views?|interested|expects?|sees?|favou?rs?|considers?|thinks?|anticipates?)\b/i.test(t)) {
        return 'You ' + t.charAt(0).toLowerCase() + t.slice(1);
    }

    // Risk flags / concerns
    if (/^(concerned|skepti|worri|flag|caution|wary|nervous|uncertain|doubt)\b/i.test(t)) {
        return 'You flagged: ' + t.charAt(0).toLowerCase() + t.slice(1);
    }

    // Process notes
    if (/^(requires?|distinguishes?|prefers?|uses?|applies?|always|never|tracks?)\b/i.test(t)) {
        return 'Your process: ' + t.charAt(0).toLowerCase() + t.slice(1);
    }

    // Challenge / disagreement
    if (/^(disagrees?|challenges?|dismiss|rejects?|questions?)\b/i.test(t)) {
        return 'You ' + t.charAt(0).toLowerCase() + t.slice(1);
    }

    // Fallback
    return 'You noted: ' + t.charAt(0).toLowerCase() + t.slice(1);
}

// ============================================================
// CARD RENDERING
// ============================================================

function _renderCard(m, showTicker) {
    // Use server-side insight_type if available, fall back to heuristic
    var type = (m.insight_type && TYPE_CONFIG[m.insight_type]) ? m.insight_type : _classifyMemory(m);
    var cfg = _getTypeConfig(type);
    var borderStyle = 'border-left-color:' + cfg.borderColor;

    var html = '<div class="jnl-card" data-id="' + _escHtml(m.id) + '" style="' + borderStyle + '">';
    html += '<div class="jnl-card-body">';

    // Top row: type badge, ticker (if showing), date
    html += '<div class="jnl-card-top">';
    html += '<span class="jnl-type-badge" style="background:' + cfg.badgeBg + ';color:' + cfg.badgeColor + '">' + cfg.label + '</span>';
    if (showTicker && m.ticker) {
        html += '<span class="jnl-card-ticker">' + _escHtml(m.ticker) + '</span>';
    }
    html += '<span class="jnl-card-date">' + _formatDate(m.created_at) + '</span>';
    html += '</div>';

    // Content (rewritten to second person)
    html += '<div class="jnl-card-content">' + _escHtml(_toSecondPerson(m.content)) + '</div>';

    // Source
    html += '<div class="jnl-card-source">Source: Analyst conversation' +
        (m.ticker ? ', ' + _escHtml(m.ticker) + ' research' : '') +
        ', ' + _formatAge(m.created_at) + '</div>';

    // Tags
    if (m.tags && m.tags.length > 0) {
        html += '<div class="jnl-card-tags">';
        m.tags.slice(0, 5).forEach(function(t) {
            if (t !== 'seed') html += '<span class="jnl-tag">' + _escHtml(t) + '</span>';
        });
        html += '</div>';
    }

    // Actions
    html += '<div class="jnl-card-actions">';
    if (m.ticker && m.source_conversation_id) {
        html += '<button class="jnl-action-btn view-convo" data-ticker="' + _escHtml(m.ticker) + '">View conversation</button>';
    }
    if (m.ticker) {
        html += '<button class="jnl-action-btn challenge" data-ticker="' + _escHtml(m.ticker) + '" ' +
            'data-content="' + _escHtml(m.content) + '">Challenge this view</button>';
    }
    html += '<button class="jnl-action-btn archive" title="Archive this insight">Archive</button>';
    html += '</div>';

    html += '</div>';
    html += '</div>';
    return html;
}

// ============================================================
// VIEW: BY STOCK (default)
// ============================================================

function _renderByStock(memories) {
    var byTicker = {};
    var noTicker = [];
    memories.forEach(function(m) {
        if (m.ticker) {
            if (!byTicker[m.ticker]) byTicker[m.ticker] = [];
            byTicker[m.ticker].push(m);
        } else {
            noTicker.push(m);
        }
    });

    var html = '';
    var tickers = Object.keys(byTicker).sort();

    tickers.forEach(function(ticker) {
        var items = byTicker[ticker];
        var stock = STOCK_DATA[ticker] || {};
        var company = stock.company || ticker;
        var skew = stock.skew || {};
        var skewDir = (skew.direction || '').toLowerCase();
        var skewClass = skewDir === 'upside' ? 'jnl-skew-upside'
            : skewDir === 'downside' ? 'jnl-skew-downside'
            : 'jnl-skew-balanced';

        html += '<div class="jnl-stock-group">';
        html += '<div class="jnl-stock-header">';
        html += '<span class="jnl-stock-arrow">\u25BC</span>';
        html += '<span class="jnl-stock-ticker">' + _escHtml(ticker) + '</span>';
        html += '<span class="jnl-stock-name">\u2013 ' + _escHtml(company) + '</span>';
        html += '<div class="jnl-stock-meta">';
        html += '<span class="jnl-stock-count">' + items.length + ' active</span>';
        if (skewDir) {
            html += '<span class="jnl-skew ' + skewClass + '">' + _escHtml(skewDir) + '</span>';
        }
        html += '</div>';
        html += '</div>';
        html += '<div class="jnl-stock-cards">';
        items.forEach(function(m) {
            html += _renderCard(m, false);
        });
        html += '</div>';

        html += '</div>';
    });

    // Process notes (no ticker)
    if (noTicker.length > 0) {
        html += '<div class="jnl-stock-group">';
        html += '<div class="jnl-stock-header">';
        html += '<span class="jnl-stock-arrow">\u25BC</span>';
        html += '<span class="jnl-stock-ticker">GENERAL</span>';
        html += '<span class="jnl-stock-name">\u2013 Process notes and preferences</span>';
        html += '<div class="jnl-stock-meta"><span class="jnl-stock-count">' + noTicker.length + ' active</span></div>';
        html += '</div>';
        html += '<div class="jnl-stock-cards">';
        noTicker.forEach(function(m) {
            html += _renderCard(m, false);
        });
        html += '</div>';
        html += '</div>';
    }

    return html;
}

// ============================================================
// VIEW: BY TYPE
// ============================================================

function _renderByType(memories) {
    var byType = {};
    memories.forEach(function(m) {
        var type = (m.insight_type && TYPE_CONFIG[m.insight_type]) ? m.insight_type : _classifyMemory(m);
        if (!byType[type]) byType[type] = [];
        byType[type].push(m);
    });

    var html = '';
    var order = ['conviction', 'risk_flag', 'valuation', 'thesis_challenge', 'process_note'];

    order.forEach(function(type) {
        var items = byType[type];
        if (!items || items.length === 0) return;
        var cfg = _getTypeConfig(type);

        // Sort newest first within each type
        items.sort(function(a, b) { return new Date(b.created_at) - new Date(a.created_at); });

        html += '<div class="jnl-type-group" data-type="' + type + '">';
        html += '<div class="jnl-type-title"><span class="jnl-type-arrow">&#9660;</span> ' + cfg.label + ' (' + items.length + ')</div>';
        html += '<div class="jnl-type-cards">';
        items.forEach(function(m) {
            html += _renderCard(m, true);
        });
        html += '</div>';
        html += '</div>';
    });

    return html;
}

// ============================================================
// VIEW: BY DATE
// ============================================================

function _renderByDate(memories) {
    // Sort newest first
    var sorted = memories.slice().sort(function(a, b) {
        return new Date(b.created_at) - new Date(a.created_at);
    });

    // Group by date string
    var byDate = {};
    var dateOrder = [];
    sorted.forEach(function(m) {
        var dateStr = _formatDate(m.created_at);
        if (!byDate[dateStr]) {
            byDate[dateStr] = [];
            dateOrder.push(dateStr);
        }
        byDate[dateStr].push(m);
    });

    var html = '';
    dateOrder.forEach(function(dateStr) {
        html += '<div class="jnl-date-group">';
        html += '<div class="jnl-date-title">' + _escHtml(dateStr) + '</div>';
        byDate[dateStr].forEach(function(m) {
            html += _renderCard(m, true);
        });
        html += '</div>';
    });

    return html;
}

// ============================================================
// MAIN RENDER
// ============================================================

export async function renderMemoryPage() {
    _injectCSS();
    _injectPMCSS();
    var container = document.getElementById('page-memory');
    if (!container) return;

    container.innerHTML = '<div class="jnl-loading">Loading journal...</div>';

    var auth = _getAuthHeaders();

    // Source toggle (Analyst | PM)
    var headerHtml = '<div class="jnl-header">';
    headerHtml += '<h2>Journal</h2>';
    headerHtml += '<p class="jnl-subtitle">Your analytical positions, portfolio decisions, and evolving views.</p>';
    headerHtml += '</div>';
    headerHtml += '<div class="jnl-source-toggle">';
    headerHtml += '<button class="jnl-source-btn' + (_currentSource === 'analyst' ? ' active' : '') + '" data-source="analyst">Analyst</button>';
    headerHtml += '<button class="jnl-source-btn' + (_currentSource === 'pm' ? ' active' : '') + '" data-source="pm">Portfolio Manager</button>';
    headerHtml += '</div>';

    // PM Journal path
    if (_currentSource === 'pm') {
        var pmEntries = await _fetchPMJournal(auth.token, { includeArchived: true });
        var pmHtml = headerHtml;
        pmHtml += _renderPMJournal(pmEntries);
        container.innerHTML = pmHtml;

        // Wire source toggle
        container.querySelectorAll('.jnl-source-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _currentSource = btn.getAttribute('data-source');
                renderMemoryPage();
            });
        });

        // Wire PM archive buttons
        container.querySelectorAll('.pm-archive').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var card = btn.closest('.jnl-pm-insight');
                if (!card) return;
                var id = btn.getAttribute('data-id');
                card.style.opacity = '0.3';
                await _archivePMInsight(id, auth.token);
                renderMemoryPage();
            });
        });

        // Wire PM restore buttons
        container.querySelectorAll('.pm-restore').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                var id = btn.getAttribute('data-id');
                await _restorePMInsight(id, auth.token);
                renderMemoryPage();
            });
        });

        // Wire collapsible sections
        container.querySelectorAll('.jnl-type-title').forEach(function(title) {
            title.addEventListener('click', function() {
                var group = title.closest('.jnl-type-group');
                if (group) group.classList.toggle('collapsed');
            });
        });

        // Wire archived toggle
        var archivedToggle = container.querySelector('.jnl-archived-toggle');
        if (archivedToggle) {
            archivedToggle.addEventListener('click', function() {
                var list = container.querySelector('.jnl-archived-list');
                var arrow = container.querySelector('.jnl-toggle-arrow');
                if (!list) return;
                var isOpen = list.style.display !== 'none';
                list.style.display = isOpen ? 'none' : 'block';
                if (arrow) arrow.classList.toggle('open', !isOpen);
                archivedToggle.setAttribute('aria-expanded', String(!isOpen));
            });
        }

        return;
    }

    // Analyst Journal path (existing code)
    var memories = await _fetchMemories(auth.token);
    var notifications = await _fetchNotifications(auth.token);

    if (memories.length === 0) {
        container.innerHTML = headerHtml +
            '<div class="jnl-empty">No journal entries yet.<br>Start a conversation with the analyst to build your analytical record.</div>';
        // Wire source toggle even on empty
        container.querySelectorAll('.jnl-source-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                _currentSource = btn.getAttribute('data-source');
                renderMemoryPage();
            });
        });
        return;
    }

    // Apply ticker filter
    var filtered = memories;
    if (_currentFilter) {
        filtered = memories.filter(function(m) { return m.ticker === _currentFilter; });
    }

    // Get unique tickers for filter dropdown
    var tickerSet = {};
    memories.forEach(function(m) { if (m.ticker) tickerSet[m.ticker] = true; });
    var allTickers = Object.keys(tickerSet).sort();

    // Build header (use shared header with toggle)
    var html = headerHtml;

    // Controls: view toggle + filter + count
    html += '<div class="jnl-controls">';
    html += '<div class="jnl-view-toggle">';
    html += '<button class="jnl-view-btn' + (_currentView === 'stock' ? ' active' : '') + '" data-view="stock">By Stock</button>';
    html += '<button class="jnl-view-btn' + (_currentView === 'type' ? ' active' : '') + '" data-view="type">By Type</button>';
    html += '<button class="jnl-view-btn' + (_currentView === 'date' ? ' active' : '') + '" data-view="date">By Date</button>';
    html += '</div>';

    // Ticker filter
    html += '<select class="jnl-filter" id="jnlTickerFilter">';
    html += '<option value="">All Stocks</option>';
    allTickers.forEach(function(t) {
        var sel = _currentFilter === t ? ' selected' : '';
        html += '<option value="' + _escHtml(t) + '"' + sel + '>' + _escHtml(t) + '</option>';
    });
    html += '</select>';

    html += '<span class="jnl-count">' + filtered.length + ' entries</span>';
    html += '</div>';

    // Evidence drift alerts (contradictions from proactive insights scan)
    html += _renderDriftAlerts(notifications);

    // Render active view
    html += '<div class="jnl-active-cards">';
    if (_currentView === 'type') {
        html += _renderByType(filtered);
    } else if (_currentView === 'date') {
        html += _renderByDate(filtered);
    } else {
        html += _renderByStock(filtered);
    }
    html += '</div>';

    // Archived section (collapsed by default)
    html += '<div class="jnl-archived">';
    html += '<button class="jnl-archived-toggle" aria-expanded="false">';
    html += 'Archived (<span class="jnl-archived-count">0</span>) ';
    html += '<span class="jnl-toggle-arrow">\u25B8</span>';
    html += '</button>';
    html += '<div class="jnl-archived-list" style="display:none;"></div>';
    html += '</div>';

    container.innerHTML = html;

    // Wire source toggle (Analyst | PM)
    container.querySelectorAll('.jnl-source-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _currentSource = btn.getAttribute('data-source');
            renderMemoryPage();
        });
    });

    // Wire view toggles
    container.querySelectorAll('.jnl-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _currentView = btn.getAttribute('data-view');
            renderMemoryPage();
        });
    });

    // Wire collapsible type sections
    container.querySelectorAll('.jnl-type-title').forEach(function(title) {
        title.addEventListener('click', function() {
            var group = title.closest('.jnl-type-group');
            if (group) group.classList.toggle('collapsed');
        });
    });

    // Wire collapsible stock sections
    container.querySelectorAll('.jnl-stock-header').forEach(function(header) {
        header.addEventListener('click', function() {
            var group = header.closest('.jnl-stock-group');
            if (group) group.classList.toggle('collapsed');
        });
    });

    // Wire drift alert buttons
    container.querySelectorAll('.drift-research').forEach(function(btn) {
        btn.addEventListener('click', function() {
            window.location.hash = 'report-' + btn.getAttribute('data-ticker').toLowerCase();
        });
    });
    container.querySelectorAll('.drift-discuss').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var ticker = btn.getAttribute('data-ticker');
            var summary = btn.getAttribute('data-summary');
            window.location.hash = 'report-' + ticker.toLowerCase();
            setTimeout(function() {
                var chatInput = document.getElementById('apInput');
                if (chatInput) {
                    chatInput.value = 'Evidence drift alert: "' + summary + '" -- Walk me through what changed and whether my view needs updating.';
                    chatInput.dispatchEvent(new Event('input'));
                    chatInput.focus();
                }
            }, 500);
        });
    });
    container.querySelectorAll('.drift-dismiss').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            var item = btn.closest('.jnl-drift-item');
            var id = btn.getAttribute('data-id');
            if (item) { item.style.opacity = '0.3'; item.style.pointerEvents = 'none'; }
            var url = apiOrigin + '/api/notifications/' + id + '/dismiss' + _getGuestParam(auth.token);
            try {
                await fetch(url, { method: 'PATCH', headers: auth.headers });
            } catch (e) { /* silent */ }
            if (item) item.remove();
            // Remove drift container if empty
            var driftBox = container.querySelector('.jnl-drift');
            if (driftBox && driftBox.querySelectorAll('.jnl-drift-item').length === 0) {
                driftBox.remove();
            }
        });
    });

    // Wire ticker filter
    var filterEl = document.getElementById('jnlTickerFilter');
    if (filterEl) {
        filterEl.addEventListener('change', function() {
            _currentFilter = filterEl.value;
            renderMemoryPage();
        });
    }

    // Wire archive buttons: move card to archived section
    container.querySelectorAll('.jnl-action-btn.archive').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            var card = btn.closest('.jnl-card');
            if (!card) return;
            var id = card.getAttribute('data-id');
            card.style.opacity = '0.3';
            card.style.pointerEvents = 'none';
            await _archiveMemory(id, auth.token);

            // Move card to archived section
            var archivedList = container.querySelector('.jnl-archived-list');
            if (archivedList) {
                card.style.opacity = '';
                card.style.pointerEvents = '';
                // Remove archive button from the moved card
                var archiveBtn = card.querySelector('.jnl-action-btn.archive');
                if (archiveBtn) archiveBtn.remove();
                card.parentNode.removeChild(card);
                archivedList.appendChild(card);

                // Update archived count
                var archivedCount = container.querySelector('.jnl-archived-count');
                if (archivedCount) {
                    archivedCount.textContent = archivedList.querySelectorAll('.jnl-card').length;
                }
            } else {
                card.remove();
            }

            // Update active count
            var countEl = container.querySelector('.jnl-count');
            if (countEl) {
                var remaining = container.querySelector('.jnl-active-cards').querySelectorAll('.jnl-card').length;
                countEl.textContent = remaining + ' entries';
            }
        });
    });

    // Wire archived section toggle
    var archivedToggle = container.querySelector('.jnl-archived-toggle');
    if (archivedToggle) {
        archivedToggle.addEventListener('click', function() {
            var list = container.querySelector('.jnl-archived-list');
            var arrow = container.querySelector('.jnl-toggle-arrow');
            if (!list) return;
            var isOpen = list.style.display !== 'none';
            list.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.classList.toggle('open', !isOpen);
            archivedToggle.setAttribute('aria-expanded', String(!isOpen));
        });
    }

    // Wire "View conversation" buttons (navigate to stock report, opens analyst panel with history)
    container.querySelectorAll('.jnl-action-btn.view-convo').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var ticker = btn.getAttribute('data-ticker');
            window.location.hash = 'report-' + ticker.toLowerCase();
        });
    });

    // Wire challenge buttons (open analyst chat with pre-loaded prompt)
    container.querySelectorAll('.jnl-action-btn.challenge').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var ticker = btn.getAttribute('data-ticker');
            var content = btn.getAttribute('data-content');
            // Navigate to the stock page (opens analyst panel)
            window.location.hash = 'report-' + ticker.toLowerCase();
            // Set the chat input after a short delay to let the panel open
            setTimeout(function() {
                var chatInput = document.getElementById('apInput');
                if (chatInput) {
                    chatInput.value = 'I previously noted: "' + content + '" -- Has the evidence changed? Should I update this view?';
                    chatInput.dispatchEvent(new Event('input'));
                    chatInput.focus();
                }
            }, 500);
        });
    });
}
