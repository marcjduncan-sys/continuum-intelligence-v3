/**
 * Phase 9: Proactive Insights -- Notification surface
 *
 * Polls GET /api/notifications every 5 minutes and renders a badge + panel.
 * CSS and panel container are injected dynamically (follows auth.js pattern).
 * Requires initAuth() to have run first (guest UUID available in localStorage).
 */

import { API_BASE } from '../lib/api-config.js';

// ---------------------------------------------------------------------------
// HTML escaping -- prevents XSS from server-supplied content
// ---------------------------------------------------------------------------
function _esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------------------
// Configuration (centralised in api-config.js)
// ---------------------------------------------------------------------------

var _NOTIF_BASE = API_BASE + '/api/notifications';

const POLL_INTERVAL_MS = 5 * 60 * 1000;
let _pollTimer = null;

// ---------------------------------------------------------------------------
// Auth helpers (mirrors pattern in chat.js)
// ---------------------------------------------------------------------------

function _authParams() {
    const jwt = localStorage.getItem('ci_auth_token');
    if (jwt) {
        return { headers: { Authorization: `Bearer ${jwt}` }, qs: '' };
    }
    const guestId = localStorage.getItem('ci_guest_id');
    if (guestId) {
        return { headers: {}, qs: `?guest_id=${encodeURIComponent(guestId)}` };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Style injection (follows auth.js eager-inject pattern)
// ---------------------------------------------------------------------------

function _injectStyles() {
    if (document.getElementById('ci-notif-styles')) return;
    const style = document.createElement('style');
    style.id = 'ci-notif-styles';
    style.textContent = [
        '.ci-notif-badge {',
        '  display: none;',
        '  align-items: center;',
        '  justify-content: center;',
        '  min-width: 18px;',
        '  height: 18px;',
        '  padding: 0 4px;',
        '  border-radius: 9px;',
        '  background: var(--accent, #4f6ef7);',
        '  color: #fff;',
        '  font-size: 0.65rem;',
        '  font-weight: 700;',
        '  cursor: pointer;',
        '  margin-right: 8px;',
        '  vertical-align: middle;',
        '}',
        '.ci-notif-panel {',
        '  display: none;',
        '  position: fixed;',
        '  top: 56px;',
        '  right: 16px;',
        '  width: 340px;',
        '  max-height: 480px;',
        '  overflow-y: auto;',
        '  background: var(--bg-card, #1a1a2e);',
        '  border: 1px solid var(--border, #2e2e4a);',
        '  border-radius: 10px;',
        '  box-shadow: 0 8px 24px rgba(0,0,0,0.4);',
        '  z-index: 2000;',
        '  padding: 12px;',
        '}',
        '.ci-notif-panel--open { display: block; }',
        '.ci-notif-empty {',
        '  color: var(--text-muted, #888);',
        '  font-size: 0.85rem;',
        '  text-align: center;',
        '  padding: 16px 0;',
        '  margin: 0;',
        '}',
        '.ci-notif-list { display: flex; flex-direction: column; gap: 10px; }',
        '.ci-notif-item {',
        '  background: var(--bg, #12122a);',
        '  border: 1px solid var(--border, #2e2e4a);',
        '  border-radius: 7px;',
        '  padding: 10px 12px;',
        '}',
        '.ci-notif-item-header {',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 8px;',
        '  margin-bottom: 6px;',
        '}',
        '.ci-notif-ticker {',
        '  font-size: 0.8rem;',
        '  font-weight: 700;',
        '  color: var(--text, #e0e0f0);',
        '}',
        '.ci-notif-signal {',
        '  font-size: 0.65rem;',
        '  font-weight: 700;',
        '  letter-spacing: 0.04em;',
        '  padding: 2px 6px;',
        '  border-radius: 4px;',
        '}',
        '.ci-notif-confirms {',
        '  background: rgba(0, 200, 117, 0.15);',
        '  color: #00c875;',
        '}',
        '.ci-notif-contradicts {',
        '  background: rgba(223, 47, 74, 0.15);',
        '  color: #df2f4a;',
        '}',
        '.ci-notif-date {',
        '  margin-left: auto;',
        '  font-size: 0.7rem;',
        '  color: var(--text-muted, #888);',
        '}',
        '.ci-notif-summary {',
        '  font-size: 0.82rem;',
        '  color: var(--text, #e0e0f0);',
        '  margin: 0 0 8px;',
        '  line-height: 1.4;',
        '}',
        '.ci-notif-dismiss {',
        '  background: none;',
        '  border: 1px solid var(--border, #2e2e4a);',
        '  border-radius: 4px;',
        '  color: var(--text-muted, #888);',
        '  font-size: 0.72rem;',
        '  padding: 2px 8px;',
        '  cursor: pointer;',
        '}',
        '.ci-notif-dismiss:hover { color: var(--text, #e0e0f0); }',
    ].join('\n');
    document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// Panel container
// ---------------------------------------------------------------------------

function _ensurePanel() {
    if (document.getElementById('ci-notif-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'ci-notif-panel';
    panel.className = 'ci-notif-panel';
    document.body.appendChild(panel);
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

async function _fetchNotifications() {
    const auth = _authParams();
    if (!auth) return [];
    try {
        const resp = await fetch(`${_NOTIF_BASE}${auth.qs}`, { headers: auth.headers });
        if (!resp.ok) return [];
        return await resp.json();
    } catch {
        return [];
    }
}

async function _dismissNotification(id) {
    const auth = _authParams();
    if (!auth) return;
    try {
        await fetch(`${_NOTIF_BASE}/${id}/dismiss${auth.qs}`, {
            method: 'PATCH',
            headers: auth.headers,
        });
    } catch {
        // best-effort
    }
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

function _renderBadge(_count) {
    // Badge rendering disabled: replaced by thesis monitor badges (.tm-badge-group)
    // in the analyst panel header. Phase 9 notification data still polls and
    // dispatches ci:notifications:updated events for downstream consumers.
}

// ---------------------------------------------------------------------------
// Panel render
// ---------------------------------------------------------------------------

function _renderPanel(notifications) {
    const panel = document.getElementById('ci-notif-panel');
    if (!panel) return;

    if (notifications.length === 0) {
        panel.innerHTML = '<p class="ci-notif-empty">No new insights.</p>';
        return;
    }

    const items = notifications.map(n => {
        const signalClass = n.signal === 'confirms'
            ? 'ci-notif-confirms'
            : 'ci-notif-contradicts';
        const signalLabel = n.signal === 'confirms' ? 'CONFIRMS' : 'CONTRADICTS';
        const date = new Date(n.created_at).toLocaleDateString('en-AU', {
            day: 'numeric', month: 'short',
        });
        return `<div class="ci-notif-item" data-id="${_esc(n.id)}">
            <div class="ci-notif-item-header">
                <span class="ci-notif-ticker">${_esc(n.ticker)}</span>
                <span class="ci-notif-signal ${signalClass}">${signalLabel}</span>
                <span class="ci-notif-date">${date}</span>
            </div>
            <p class="ci-notif-summary">${_esc(n.summary)}</p>
            <button class="ci-notif-dismiss" data-id="${_esc(n.id)}">Dismiss</button>
        </div>`;
    }).join('');

    panel.innerHTML = `<div class="ci-notif-list">${items}</div>`;

    panel.querySelectorAll('.ci-notif-dismiss').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            await _dismissNotification(id);
            const item = btn.closest('.ci-notif-item');
            if (item) item.remove();
            const remaining = panel.querySelectorAll('.ci-notif-item').length;
            _renderBadge(remaining);
            if (remaining === 0) {
                panel.innerHTML = '<p class="ci-notif-empty">No new insights.</p>';
            }
        });
    });
}

function _togglePanel() {
    const panel = document.getElementById('ci-notif-panel');
    if (!panel) return;
    panel.classList.toggle('ci-notif-panel--open');
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

async function _poll() {
    const notifications = await _fetchNotifications();
    const unseen = notifications.filter(n => !n.seen);
    _renderBadge(unseen.length);
    _renderPanel(notifications);
    document.dispatchEvent(
        new CustomEvent('ci:notifications:updated', { detail: { count: unseen.length } })
    );
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initNotifications() {
    if (!_authParams()) return; // no identity yet -- skip silently

    _injectStyles();
    _ensurePanel();

    // Wire badge click to toggle panel
    document.addEventListener('click', e => {
        const badge = e.target.closest('#ci-notif-badge');
        if (badge) {
            e.stopPropagation();
            _togglePanel();
            return;
        }
        // Close panel on outside click
        const panel = document.getElementById('ci-notif-panel');
        if (panel && panel.classList.contains('ci-notif-panel--open')) {
            if (!panel.contains(e.target)) {
                panel.classList.remove('ci-notif-panel--open');
            }
        }
    });

    // Initial fetch + start polling
    _poll();
    _pollTimer = setInterval(_poll, POLL_INTERVAL_MS);

    window.addEventListener('beforeunload', () => {
        if (_pollTimer) clearInterval(_pollTimer);
    });
}
