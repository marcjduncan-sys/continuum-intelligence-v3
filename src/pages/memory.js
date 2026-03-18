/**
 * memory.js -- Analyst Journal Page
 *
 * Renders at #page-memory. Fetches all active memories from the API,
 * groups them by stock (default), type, or date, and allows archiving
 * and challenging individual insights.
 */

import { STOCK_DATA } from '../lib/state.js';

var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal       = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile        = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin     = window.CHAT_API_URL
    || (isFile        ? ''
        : isGitHubPages ? PRODUCTION_API
        : '');

// ============================================================
// VIEW STATE
// ============================================================

var _currentView = 'stock'; // 'stock' | 'type' | 'date'
var _currentFilter = '';    // ticker filter

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
    conviction:       { label: 'CONVICTION',       borderColor: 'var(--signal-green, #2e7d32)' },
    risk_flag:        { label: 'RISK FLAG',         borderColor: 'var(--signal-amber, #f57f17)' },
    valuation:        { label: 'VALUATION',         borderColor: 'var(--accent, #003A70)' },
    thesis_challenge: { label: 'THESIS CHALLENGE',  borderColor: 'var(--signal-red, #c62828)' },
    process_note:     { label: 'PROCESS NOTE',      borderColor: 'var(--text-secondary, #888)' }
};

function _classifyMemory(m) {
    var content = (m.content || '').toLowerCase();
    var tags = (m.tags || []).map(function(t) { return t.toLowerCase(); });

    // Check tags first
    if (tags.indexOf('valuation') !== -1 || tags.indexOf('entry-point') !== -1 || tags.indexOf('dislocation') !== -1) return 'valuation';
    if (tags.indexOf('risk') !== -1 || tags.indexOf('management-risk') !== -1 || tags.indexOf('governance') !== -1) return 'risk_flag';

    // Content-based classification
    if (content.indexOf('risk') !== -1 || content.indexOf('concern') !== -1 || content.indexOf('worry') !== -1 || content.indexOf('flag') !== -1) return 'risk_flag';
    if (content.indexOf('valuation') !== -1 || content.indexOf('price') !== -1 && (content.indexOf('entry') !== -1 || content.indexOf('target') !== -1 || content.indexOf('multiple') !== -1)) return 'valuation';
    if (content.indexOf('disagree') !== -1 || content.indexOf('challenge') !== -1 || content.indexOf('skepti') !== -1 || content.indexOf('dismiss') !== -1) return 'thesis_challenge';

    // Non-ticker = process note
    if (!m.ticker) return 'process_note';

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
        '#page-memory{padding:24px 32px;max-width:960px;margin:0 auto}' +

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

        // Stock group
        '.jnl-stock-group{margin-bottom:24px}' +
        '.jnl-stock-header{display:flex;align-items:center;gap:10px;padding:8px 0 6px;border-bottom:1px solid var(--border,#e5e5e5);margin-bottom:10px}' +
        '.jnl-stock-ticker{font-size:14px;font-weight:700;color:var(--accent,#003A70)}' +
        '.jnl-stock-name{font-size:13px;color:var(--text-secondary,#666)}' +
        '.jnl-stock-meta{margin-left:auto;display:flex;gap:10px;align-items:center;font-size:11px}' +
        '.jnl-stock-count{color:var(--text-secondary,#999)}' +
        '.jnl-skew{padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}' +
        '.jnl-skew-upside{background:#e8f5e9;color:#2e7d32}' +
        '.jnl-skew-downside{background:#fce4ec;color:#c62828}' +
        '.jnl-skew-balanced{background:#fff8e1;color:#f57f17}' +

        // Type group
        '.jnl-type-group{margin-bottom:24px}' +
        '.jnl-type-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary,#666);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border,#e5e5e5)}' +

        // Date group
        '.jnl-date-group{margin-bottom:20px}' +
        '.jnl-date-title{font-size:12px;font-weight:600;color:var(--text-secondary,#666);margin-bottom:8px}' +

        // Card
        '.jnl-card{display:flex;align-items:flex-start;padding:12px 14px;border:1px solid var(--border-light,#f0f0f0);border-left:3px solid var(--text-secondary,#888);border-radius:4px;margin-bottom:8px;background:var(--bg-primary,#fff);transition:border-color .15s}' +
        '.jnl-card:hover{border-color:var(--border,#ccc)}' +
        '.jnl-card-body{flex:1;min-width:0}' +
        '.jnl-card-top{display:flex;align-items:center;gap:8px;margin-bottom:4px}' +
        '.jnl-type-badge{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:1px 6px;border-radius:3px;background:var(--bg-secondary,#f5f5f5);color:var(--text-secondary,#666)}' +
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

        // Empty and loading
        '.jnl-empty{text-align:center;padding:48px 16px;color:var(--text-secondary,#888);font-size:14px;line-height:1.5}' +
        '.jnl-loading{text-align:center;padding:48px 16px;color:var(--text-secondary,#999);font-size:13px}';
    document.head.appendChild(style);
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

// ============================================================
// CARD RENDERING
// ============================================================

function _renderCard(m, showTicker) {
    var type = _classifyMemory(m);
    var cfg = _getTypeConfig(type);
    var borderStyle = 'border-left-color:' + cfg.borderColor;

    var html = '<div class="jnl-card" data-id="' + _escHtml(m.id) + '" style="' + borderStyle + '">';
    html += '<div class="jnl-card-body">';

    // Top row: type badge, ticker (if showing), date
    html += '<div class="jnl-card-top">';
    html += '<span class="jnl-type-badge">' + cfg.label + '</span>';
    if (showTicker && m.ticker) {
        html += '<span class="jnl-card-ticker">' + _escHtml(m.ticker) + '</span>';
    }
    html += '<span class="jnl-card-date">' + _formatDate(m.created_at) + '</span>';
    html += '</div>';

    // Content
    html += '<div class="jnl-card-content">' + _escHtml(m.content) + '</div>';

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
        html += '<span class="jnl-stock-ticker">' + _escHtml(ticker) + '</span>';
        html += '<span class="jnl-stock-name">' + _escHtml(company) + '</span>';
        html += '<div class="jnl-stock-meta">';
        html += '<span class="jnl-stock-count">' + items.length + ' active</span>';
        if (skewDir) {
            html += '<span class="jnl-skew ' + skewClass + '">' + _escHtml(skewDir) + '</span>';
        }
        html += '</div>';
        html += '</div>';

        items.forEach(function(m) {
            html += _renderCard(m, false);
        });

        html += '</div>';
    });

    // Process notes (no ticker)
    if (noTicker.length > 0) {
        html += '<div class="jnl-stock-group">';
        html += '<div class="jnl-stock-header">';
        html += '<span class="jnl-stock-ticker">GENERAL</span>';
        html += '<span class="jnl-stock-name">Process notes and preferences</span>';
        html += '<div class="jnl-stock-meta"><span class="jnl-stock-count">' + noTicker.length + ' active</span></div>';
        html += '</div>';
        noTicker.forEach(function(m) {
            html += _renderCard(m, false);
        });
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
        var type = _classifyMemory(m);
        if (!byType[type]) byType[type] = [];
        byType[type].push(m);
    });

    var html = '';
    var order = ['conviction', 'risk_flag', 'valuation', 'thesis_challenge', 'process_note'];

    order.forEach(function(type) {
        var items = byType[type];
        if (!items || items.length === 0) return;
        var cfg = _getTypeConfig(type);

        html += '<div class="jnl-type-group">';
        html += '<div class="jnl-type-title">' + cfg.label + ' (' + items.length + ')</div>';
        items.forEach(function(m) {
            html += _renderCard(m, true);
        });
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
    var container = document.getElementById('page-memory');
    if (!container) return;

    container.innerHTML = '<div class="jnl-loading">Loading journal...</div>';

    var auth = _getAuthHeaders();
    var memories = await _fetchMemories(auth.token);

    if (memories.length === 0) {
        container.innerHTML =
            '<div class="jnl-header"><h2>Analyst Journal</h2>' +
            '<p class="jnl-subtitle">Your analytical positions and evolving views, extracted from research conversations. Updated continuously as you interact with the analyst.</p></div>' +
            '<div class="jnl-empty">No journal entries yet.<br>Start a conversation with the analyst to build your analytical record.</div>';
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

    // Build header
    var html = '<div class="jnl-header">';
    html += '<h2>Analyst Journal</h2>';
    html += '<p class="jnl-subtitle">Your analytical positions and evolving views, extracted from research conversations. Updated continuously as you interact with the analyst.</p>';
    html += '</div>';

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

    // Render active view
    if (_currentView === 'type') {
        html += _renderByType(filtered);
    } else if (_currentView === 'date') {
        html += _renderByDate(filtered);
    } else {
        html += _renderByStock(filtered);
    }

    container.innerHTML = html;

    // Wire view toggles
    container.querySelectorAll('.jnl-view-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            _currentView = btn.getAttribute('data-view');
            renderMemoryPage();
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

    // Wire archive buttons
    container.querySelectorAll('.jnl-action-btn.archive').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            var card = btn.closest('.jnl-card');
            if (!card) return;
            var id = card.getAttribute('data-id');
            card.style.opacity = '0.3';
            card.style.pointerEvents = 'none';
            await _archiveMemory(id, auth.token);
            card.remove();
            // Update count
            var countEl = container.querySelector('.jnl-count');
            if (countEl) {
                var remaining = container.querySelectorAll('.jnl-card').length;
                countEl.textContent = remaining + ' entries';
            }
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
