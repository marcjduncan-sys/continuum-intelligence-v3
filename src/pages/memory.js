/**
 * memory.js -- Memory Dashboard Page
 *
 * Renders at #page-memory. Fetches all active memories from the API,
 * groups them by type (structural / positional / tactical), and allows
 * deletion of individual memories.
 */

var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal       = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile        = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin     = window.CHAT_API_URL
    || (isFile        ? ''
        : isGitHubPages ? PRODUCTION_API
        : '');

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

function _confLabel(conf) {
    if (conf >= 0.7) return 'high';
    if (conf >= 0.4) return 'medium';
    return 'low';
}

function _injectCSS() {
    if (document.getElementById('memory-page-css')) return;
    var style = document.createElement('style');
    style.id = 'memory-page-css';
    style.textContent =
        '#page-memory{padding:24px 32px;max-width:900px;margin:0 auto}' +
        '.mem-header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:24px}' +
        '.mem-header h2{font-size:20px;font-weight:700;color:var(--text-primary,#222);margin:0}' +
        '.mem-count{font-size:13px;color:var(--text-secondary,#888)}' +
        '.mem-group{margin-bottom:28px}' +
        '.mem-group-title{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary,#666);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border,#e5e5e5)}' +
        '.mem-card{display:flex;align-items:flex-start;justify-content:space-between;padding:12px 14px;border:1px solid var(--border-light,#f0f0f0);border-radius:6px;margin-bottom:8px;background:var(--bg-primary,#fff)}' +
        '.mem-card:hover{border-color:var(--border,#ddd)}' +
        '.mem-card-body{flex:1;min-width:0}' +
        '.mem-card-content{font-size:13px;color:var(--text-primary,#222);line-height:1.45;margin-bottom:6px}' +
        '.mem-card-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--text-secondary,#999)}' +
        '.mem-tag{background:var(--bg-secondary,#f5f5f5);padding:1px 6px;border-radius:3px;font-size:10px;color:var(--text-secondary,#777)}' +
        '.mem-ticker{font-weight:600;color:var(--accent,#003A70)}' +
        '.mem-conf{padding:1px 5px;border-radius:3px;font-size:10px;font-weight:600}' +
        '.mem-conf-high{background:#e8f5e9;color:#2e7d32}' +
        '.mem-conf-medium{background:#fff8e1;color:#f57f17}' +
        '.mem-conf-low{background:#fce4ec;color:#c62828}' +
        '.mem-delete{background:none;border:none;cursor:pointer;color:var(--text-secondary,#bbb);padding:4px;border-radius:4px;margin-left:8px;font-size:16px;line-height:1;flex-shrink:0}' +
        '.mem-delete:hover{color:#c62828;background:rgba(198,40,40,.08)}' +
        '.mem-empty{text-align:center;padding:48px 16px;color:var(--text-secondary,#888);font-size:14px}' +
        '.mem-loading{text-align:center;padding:48px 16px;color:var(--text-secondary,#999);font-size:13px}';
    document.head.appendChild(style);
}

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

async function _deleteMemory(id, token) {
    var url = apiOrigin + '/api/memories/' + id + _getGuestParam(token);
    var auth = _getAuthHeaders();
    try {
        await fetch(url, { method: 'DELETE', headers: auth.headers });
    } catch (e) {
        // silent
    }
}

export async function renderMemoryPage() {
    _injectCSS();
    var container = document.getElementById('page-memory');
    if (!container) return;

    container.innerHTML = '<div class="mem-loading">Loading memories...</div>';

    var auth = _getAuthHeaders();
    var memories = await _fetchMemories(auth.token);

    if (memories.length === 0) {
        container.innerHTML =
            '<div class="mem-header"><h2>Memory Dashboard</h2></div>' +
            '<div class="mem-empty">No memories yet. Start a conversation with the analyst to build your memory profile.</div>';
        return;
    }

    // Group by type
    var groups = { structural: [], positional: [], tactical: [] };
    memories.forEach(function(m) {
        var t = m.memory_type || 'structural';
        if (!groups[t]) groups[t] = [];
        groups[t].push(m);
    });

    var html = '<div class="mem-header"><h2>Memory Dashboard</h2><span class="mem-count">' + memories.length + ' active</span></div>';

    var groupLabels = { structural: 'Structural (permanent)', positional: 'Positional (60-90 day)', tactical: 'Tactical (days-weeks)' };
    ['structural', 'positional', 'tactical'].forEach(function(type) {
        var items = groups[type];
        if (!items || items.length === 0) return;

        html += '<div class="mem-group">';
        html += '<div class="mem-group-title">' + groupLabels[type] + ' (' + items.length + ')</div>';

        items.forEach(function(m) {
            var confClass = 'mem-conf mem-conf-' + _confLabel(m.confidence);
            html += '<div class="mem-card" data-id="' + _escHtml(m.id) + '">';
            html += '<div class="mem-card-body">';
            html += '<div class="mem-card-content">' + _escHtml(m.content) + '</div>';
            html += '<div class="mem-card-meta">';
            if (m.ticker) html += '<span class="mem-ticker">' + _escHtml(m.ticker) + '</span>';
            html += '<span class="' + confClass + '">' + _confLabel(m.confidence) + '</span>';
            html += '<span>' + _formatAge(m.created_at) + '</span>';
            if (m.tags && m.tags.length > 0) {
                m.tags.slice(0, 4).forEach(function(t) {
                    if (t !== 'seed') html += '<span class="mem-tag">' + _escHtml(t) + '</span>';
                });
            }
            html += '</div>';
            html += '</div>';
            html += '<button class="mem-delete" title="Delete memory" aria-label="Delete memory">&times;</button>';
            html += '</div>';
        });

        html += '</div>';
    });

    container.innerHTML = html;

    // Wire delete buttons
    container.querySelectorAll('.mem-delete').forEach(function(btn) {
        btn.addEventListener('click', async function() {
            var card = btn.closest('.mem-card');
            if (!card) return;
            var id = card.getAttribute('data-id');
            card.style.opacity = '0.4';
            await _deleteMemory(id, auth.token);
            card.remove();
            // Update count
            var countEl = container.querySelector('.mem-count');
            if (countEl) {
                var remaining = container.querySelectorAll('.mem-card').length;
                countEl.textContent = remaining + ' active';
                if (remaining === 0) {
                    container.querySelector('.mem-header').insertAdjacentHTML(
                        'afterend',
                        '<div class="mem-empty">No memories yet. Start a conversation with the analyst to build your memory profile.</div>'
                    );
                }
            }
        });
    });
}
