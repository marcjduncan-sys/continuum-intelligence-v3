/**
 * pm-chat.js -- Portfolio Manager Panel
 *
 * Docked right-rail panel that mode-switches with the Analyst panel.
 * Owns its own DOM, state, send cycle, and backend endpoint.
 * Does NOT share any mutable state with chat.js (Analyst).
 *
 * Depends on:
 *   - marked (npm, bundled via Vite)
 *   - dompurify (npm, bundled via Vite)
 *   - API_BASE from api-config.js
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { API_BASE } from '../lib/api-config.js';
import { onStateChange, getState, STATES } from './portfolio-state.js';

// ============================================================
// CONFIGURATION
// ============================================================

const isFile        = window.location.protocol === 'file:';
const apiOrigin     = API_BASE;
const PM_API_BASE   = apiOrigin + '/api/pm-chat';
const CI_API_KEY    = window.CI_API_KEY || '';

// ============================================================
// DOM REFS
// ============================================================

let panel, fab, collapseBtn, clearBtn, messagesEl, inputEl, sendBtn, portfolioBadge;

// ============================================================
// STATE
// ============================================================

const isOpen        = false;
let isLoading     = false;
let _lastSendTime = 0;
let _cooldownTimer = null;
const SEND_COOLDOWN_MS = 2000;
let _lastBreaches = [];
let _lastAlignmentScore = null;
let _lastNotCoveredCount = null;
let _pmConversationId = null;  // Phase E: persisted PM conversation ID
const conversations = (function() {
    try {
        const saved = sessionStorage.getItem('ci_pm_conversations');
        return saved ? JSON.parse(saved) : {};
    } catch(e) {
        return {};
    }
}());
const currentPortfolioKey = '_default';

// ============================================================
// DB PERSISTENCE
// ============================================================

function _restoreFromDB() {
    if (isFile) return Promise.resolve();
    const token   = window.CI_AUTH && window.CI_AUTH.getToken();
    const guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    if (!token && !guestId) return Promise.resolve();

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;

    const portfolioId = (typeof window.pnGetPortfolioId === 'function') ? window.pnGetPortfolioId() : null;
    let url = apiOrigin + '/api/pm-conversations/latest';
    const params = [];
    if (!token && guestId) params.push('guest_id=' + encodeURIComponent(guestId));
    if (portfolioId) params.push('portfolio_id=' + encodeURIComponent(portfolioId));
    if (params.length > 0) url += '?' + params.join('&');

    return fetch(url, { headers: headers })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
            if (!data || !data.messages || data.messages.length === 0) return;
            if (data.conversation_id) _pmConversationId = data.conversation_id;
            // DB wins over sessionStorage for cross-session/cross-device history
            conversations[currentPortfolioKey] = data.messages.map(function(m) {
                return {
                    role: m.role,
                    content: m.content,
                    timestamp: m.created_at ? new Date(m.created_at).getTime() : 0
                };
            });
            try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) {}
            if (_currentMode === 'pm') renderConversation();
        })
        .catch(function(err) {
            console.warn('[PM] DB restore failed:', err.message || err);
        });
}

// ============================================================
// RAIL MODE SWITCH
// ============================================================

let _analystPanel  = null;
let _econPanel     = null;
const _modeSwitches  = [];   // all mode-switch containers (analyst + pm + strat header)
var _currentMode   = 'analyst'; // 'analyst' | 'pm' | 'strategist'

function _getRailMode() { return _currentMode; }

function _syncAllModeSwitches(mode) {
    _modeSwitches.forEach(function(sw) {
        sw.querySelectorAll('.rail-mode-btn').forEach(function(btn) {
            const isActive = btn.getAttribute('data-mode') === mode;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
            btn.setAttribute('tabindex', isActive ? '0' : '-1');
        });
    });
}

function switchRailMode(mode) {
    if (mode === _currentMode) return;
    _currentMode = mode;

    _syncAllModeSwitches(mode);

    // Hide all panels first
    if (_analystPanel) {
        _analystPanel.classList.remove('ap-open');
        _analystPanel.style.display = 'none';
    }
    if (panel) {
        panel.classList.remove('pm-open');
        panel.style.display = 'none';
    }
    if (_econPanel) {
        _econPanel.classList.remove('econ-panel-open');
        _econPanel.style.display = 'none';
    }

    // Show the selected panel
    if (mode === 'analyst') {
        if (_analystPanel) {
            _analystPanel.style.display = '';
            _analystPanel.classList.add('ap-open');
        }
        if (fab) fab.style.display = window.innerWidth < 1024 ? '' : 'none';
    } else if (mode === 'pm') {
        if (panel) {
            panel.style.display = '';
            panel.classList.add('pm-open');
        }
        if (fab) fab.style.display = 'none';
        renderConversation();
        if (inputEl) inputEl.focus();
    } else if (mode === 'strategist') {
        if (_econPanel) {
            _econPanel.style.display = '';
            _econPanel.classList.add('econ-panel-open');
        }
        if (fab) fab.style.display = 'none';
        // Trigger strategist init if not yet done
        if (window._initStrategistPanel) window._initStrategistPanel();
    }

    document.body.classList.add('analyst-panel-open');

    // Clear collapsed state so the active panel always shows at full width
    if (_analystPanel && _analystPanel.classList.contains('ap-user-collapsed')) {
        _analystPanel.classList.remove('ap-user-collapsed');
        document.body.classList.remove('ap-user-collapsed-active');
        const _cb = document.getElementById('apCollapseBtn');
        if (_cb) _cb.style.transform = '';
        try { localStorage.setItem('ci_panel_collapsed', '0'); } catch(e) { /* storage unavailable */ }
    }

    try { localStorage.setItem('ci_rail_mode', mode); } catch(e) { // Expected: localStorage may be unavailable in restricted environments
    }
    console.log('[PM] Rail mode switched to', mode);
}

function _createModeSwitch(activeMode) {
    const sw = document.createElement('div');
    sw.className = 'rail-mode-switch';
    sw.setAttribute('role', 'tablist');
    sw.setAttribute('aria-label', 'Panel mode');
    sw.innerHTML =
        '<button class="rail-mode-btn" data-mode="analyst" role="tab">Analyst</button>' +
        '<button class="rail-mode-btn" data-mode="pm" role="tab">PM</button>' +
        '<button class="rail-mode-btn" data-mode="strategist" role="tab">Strat</button>';

    // Set initial active state
    sw.querySelectorAll('.rail-mode-btn').forEach(function(btn) {
        const isActive = btn.getAttribute('data-mode') === activeMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Click handler
    sw.addEventListener('click', function(e) {
        const btn = e.target.closest('.rail-mode-btn');
        if (!btn) return;
        switchRailMode(btn.getAttribute('data-mode'));
    });

    // Keyboard: arrow keys move between tabs (ARIA tablist pattern)
    sw.addEventListener('keydown', function(e) {
        const btns = Array.from(sw.querySelectorAll('.rail-mode-btn'));
        const idx  = btns.indexOf(document.activeElement);
        if (idx < 0) return;

        let next = -1;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            next = (idx + 1) % btns.length;
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            next = (idx - 1 + btns.length) % btns.length;
        } else if (e.key === 'Home') {
            next = 0;
        } else if (e.key === 'End') {
            next = btns.length - 1;
        }
        if (next >= 0) {
            e.preventDefault();
            btns[next].focus();
            switchRailMode(btns[next].getAttribute('data-mode'));
        }
    });

    _modeSwitches.push(sw);
    return sw;
}

function _injectModeSwitch() {
    _analystPanel = document.getElementById('analyst-panel');
    _econPanel = document.getElementById('econ-panel');
    if (!_analystPanel) return;

    // Inject into analyst header
    const apHeader = _analystPanel.querySelector('.ap-header');
    if (apHeader) {
        const apHeaderLeft = apHeader.querySelector('.ap-header-left');
        if (apHeaderLeft) {
            const analystSw = _createModeSwitch('analyst');
            apHeader.insertBefore(analystSw, apHeaderLeft.nextSibling);
        }
    }

    // Inject into PM header
    const pmHeader = panel ? panel.querySelector('.pm-header') : null;
    if (pmHeader) {
        const pmHeaderLeft = pmHeader.querySelector('.pm-header-left');
        if (pmHeaderLeft) {
            const pmSw = _createModeSwitch('pm');
            pmHeader.insertBefore(pmSw, pmHeaderLeft.nextSibling);
        }
    }

    // Expose switchRailMode and mode switch injector globally
    window.switchRailMode = switchRailMode;
    window._injectStratModeSwitch = function() {
        if (!_econPanel) _econPanel = document.getElementById('econ-panel');
        if (!_econPanel) return;
        const econHeader = _econPanel.querySelector('.econ-header');
        if (!econHeader) return;
        // Only inject once
        if (econHeader.querySelector('.rail-mode-switch')) return;
        const econHeaderLeft = econHeader.querySelector('.econ-header-left');
        if (econHeaderLeft) {
            const econSw = _createModeSwitch('strategist');
            econHeader.insertBefore(econSw, econHeaderLeft.nextSibling);
        }
    };
}

// ============================================================
// SUGGESTIONS
// ============================================================

const PM_SUGGESTIONS = [
    'Am I too concentrated?',
    'What should fund a new position?',
    'What are my top three portfolio actions?',
    'Should I trim my largest holding?'
];

// Phase F: Track the ticker the user last referenced from Analyst handoff
let _lastHandoffTicker = null;

// ============================================================
// RENDERING
// ============================================================

function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}

// ============================================================
// RECOMMENDATION CARD RENDERER
// ============================================================

const _ACTION_COLORS = {
    'add':       { bg: 'rgba(76,175,80,0.08)',  border: 'rgba(76,175,80,0.3)',  label: '#4CAF50' },
    'trim':      { bg: 'rgba(255,152,0,0.08)',  border: 'rgba(255,152,0,0.3)',  label: '#FF9800' },
    'exit':      { bg: 'rgba(244,67,54,0.08)',   border: 'rgba(244,67,54,0.3)',  label: '#F44336' },
    'hold':      { bg: 'rgba(33,150,243,0.08)',  border: 'rgba(33,150,243,0.3)', label: '#2196F3' },
    'watch':     { bg: 'rgba(156,39,176,0.08)',  border: 'rgba(156,39,176,0.3)', label: '#9C27B0' },
    'rebalance': { bg: 'rgba(0,150,136,0.08)',   border: 'rgba(0,150,136,0.3)',  label: '#009688' },
    'no action': { bg: 'rgba(158,158,158,0.08)', border: 'rgba(158,158,158,0.3)', label: '#9E9E9E' },
};

function _renderRecommendationCard(action, fields) {
    const actionLower = (action || '').toLowerCase().trim();
    const colors = _ACTION_COLORS[actionLower] || _ACTION_COLORS['hold'];

    let html = '<div class="pm-rec-card" style="' +
        'margin:12px 0;padding:14px 16px;' +
        'background:' + colors.bg + ';' +
        'border-left:3px solid ' + colors.border + ';' +
        'border-radius:0 6px 6px 0' +
    '">';

    // Action badge
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
    html += '<span style="' +
        'font-family:var(--font-data);font-size:0.58rem;font-weight:700;' +
        'letter-spacing:0.08em;text-transform:uppercase;' +
        'padding:2px 8px;border-radius:3px;' +
        'color:#fff;background:' + colors.label +
    '">' + escapeHtml(action) + '</span>';

    if (fields.security) {
        html += '<span style="font-weight:600;font-size:0.80rem;color:var(--text-primary)">' +
            escapeHtml(fields.security) + '</span>';
    }
    if (fields.sizing_band) {
        html += '<span style="font-family:var(--font-data);font-size:0.70rem;color:var(--text-muted)">' +
            escapeHtml(fields.sizing_band) + '</span>';
    }
    html += '</div>';

    // Fields
    const fieldOrder = ['rationale', 'portfolio_effect', 'risks_tradeoffs', 'data_basis', 'confidence'];
    const fieldLabels = {
        'rationale': 'Rationale',
        'portfolio_effect': 'Portfolio Effect',
        'risks_tradeoffs': 'Risks / Trade-offs',
        'data_basis': 'Data Basis',
        'confidence': 'Confidence'
    };

    fieldOrder.forEach(function(key) {
        if (fields[key]) {
            html += '<div style="margin-bottom:6px">';
            html += '<span style="' +
                'font-family:var(--font-data);font-size:0.56rem;font-weight:700;' +
                'letter-spacing:0.06em;text-transform:uppercase;color:var(--text-muted)' +
            '">' + (fieldLabels[key] || key) + '</span>';
            html += '<div style="font-size:0.75rem;line-height:1.5;color:var(--text-primary);margin-top:2px">' +
                escapeHtml(fields[key]) + '</div>';
            html += '</div>';
        }
    });

    html += '</div>';
    return html;
}

function _parseRecommendationBlocks(text) {
    // Look for structured recommendation blocks in the LLM output.
    // Pattern: **Action**: ... followed by structured fields.
    // We detect blocks that have at least action + one other schema field.
    const schemaKeys = ['action', 'security', 'sizing_band', 'sizing band',
                      'rationale', 'portfolio_effect', 'portfolio effect',
                      'risks_tradeoffs', 'risks/trade-offs', 'risks / trade-offs',
                      'data_basis', 'data basis', 'confidence'];

    // Try to find recommendation blocks delimited by field patterns
    const blockPattern = /\*\*(?:action|recommendation)\*\*\s*[:]\s*(.+?)(?=\n\*\*(?:action|recommendation)\*\*|\n#{1,3}\s|$)/gis;
    const blocks = [];
    let match;

    // Simpler approach: find lines that look like "**Field**: Value" grouped together
    const lines = text.split('\n');
    let currentBlock = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const fieldMatch = line.match(/^\*\*(.+?)\*\*\s*[:]\s*(.+)/);
        if (fieldMatch) {
            const key = fieldMatch[1].toLowerCase().trim();
            const val = fieldMatch[2].trim();

            // Normalise key names
            const normKey = key
                .replace(/\s+/g, '_')
                .replace(/risks[_/]trade[_-]offs/i, 'risks_tradeoffs')
                .replace(/sizing_band/i, 'sizing_band')
                .replace(/portfolio_effect/i, 'portfolio_effect')
                .replace(/data_basis/i, 'data_basis');

            if (normKey === 'action' || normKey === 'recommendation') {
                if (currentBlock && currentBlock.action) {
                    blocks.push(currentBlock);
                }
                currentBlock = { action: val };
            } else if (currentBlock) {
                currentBlock[normKey] = val;
            }
        }
    }
    if (currentBlock && currentBlock.action) {
        blocks.push(currentBlock);
    }

    return blocks;
}

function renderMarkdown(text) {
    // Check for recommendation blocks first
    const blocks = _parseRecommendationBlocks(text);
    if (blocks.length > 0) {
        // Render recommendation cards, plus any non-card text as markdown
        const cardHtml = blocks.map(function(b) {
            return _renderRecommendationCard(b.action, b);
        }).join('');

        // Also render the full text as markdown for any narrative content
        const fullHtml = DOMPurify.sanitize(marked.parse(text));

        // If the text is primarily structured recommendations, show cards prominently
        // Otherwise show both
        return cardHtml + '<div class="pm-narrative">' + fullHtml + '</div>';
    }

    return DOMPurify.sanitize(marked.parse(text));
}

// ============================================================
// MANDATE STATUS BAR
// ============================================================

function _renderMandateStatus() {
    let container = panel ? panel.querySelector('.pm-mandate-status') : null;
    if (!container) {
        // Create the container if it doesn't exist
        if (!panel) return;
        container = document.createElement('div');
        container.className = 'pm-mandate-status';
        const messagesParent = messagesEl ? messagesEl.parentNode : null;
        if (messagesParent && messagesEl) {
            messagesParent.insertBefore(container, messagesEl);
        }
    }

    const parts = [];

    // Alignment score
    if (_lastAlignmentScore !== null && _lastAlignmentScore !== undefined) {
        const pct = Math.round(_lastAlignmentScore * 100);
        const scoreClass = pct >= 70 ? 'good' : pct >= 40 ? 'mixed' : 'poor';
        parts.push(
            '<span class="pm-status-pill pm-status-' + scoreClass + '">' +
            'Alignment ' + pct + '%</span>'
        );
    }

    // Not-covered count
    if (_lastNotCoveredCount && _lastNotCoveredCount > 0) {
        parts.push(
            '<span class="pm-status-pill pm-status-info">' +
            _lastNotCoveredCount + ' uncovered</span>'
        );
    }

    // Breaches
    if (_lastBreaches.length > 0) {
        let critCount = 0;
        let warnCount = 0;
        _lastBreaches.forEach(function(b) {
            if (b.severity === 'critical') critCount++;
            else warnCount++;
        });
        let breachLabel = '';
        if (critCount > 0) breachLabel += critCount + ' critical';
        if (warnCount > 0) breachLabel += (breachLabel ? ', ' : '') + warnCount + ' warning';
        parts.push(
            '<span class="pm-status-pill pm-status-breach" title="' +
            escapeHtml(_lastBreaches.map(function(b) { return b.description; }).join('; ')) +
            '">' + breachLabel + ' breach' + (_lastBreaches.length > 1 ? 'es' : '') + '</span>'
        );
    }

    if (parts.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    container.innerHTML = parts.join('');
}

function renderWelcome() {
    const html =
        '<div class="pm-welcome">' +
            '<div class="pm-welcome-title">Portfolio Manager Ready</div>' +
            '<div class="pm-welcome-text">Portfolio construction, sizing, exposure, and risk decisions.</div>' +
            '<div class="pm-welcome-descriptor">' +
                'PM Chat helps you make portfolio-level decisions: position sizing, concentration, ' +
                'sector exposure, source-of-funds, and prioritised actions. ' +
                'For stock-level thesis and evidence, switch to the Analyst.' +
            '</div>' +
            '<div class="pm-suggestions">' +
                PM_SUGGESTIONS.map(function(s) {
                    return '<button class="pm-suggestion" data-q="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
                }).join('') +
            '</div>' +
        '</div>';
    messagesEl.innerHTML = html;
    messagesEl.querySelectorAll('.pm-suggestion').forEach(function(btn) {
        btn.addEventListener('click', function() {
            inputEl.value = btn.getAttribute('data-q');
            updateSendButton();
            sendMessage();
        });
    });
}

function renderConversation() {
    if (!messagesEl) return;
    const convo = conversations[currentPortfolioKey] || [];
    if (convo.length === 0) {
        renderWelcome();
        return;
    }

    let html = '';
    convo.forEach(function(msg) {
        const role      = msg.role === 'user' ? 'user' : 'pm';
        const roleLabel = msg.role === 'user' ? 'YOU' : 'PM';
        const timeStr   = formatTime(msg.timestamp);

        html += '<div class="pm-msg-row">';
        html += '<div class="pm-msg-meta">';
        html += '<span class="pm-msg-role ' + role + '">' + roleLabel + '</span>';
        if (timeStr) html += '<span class="pm-msg-time">' + timeStr + '</span>';
        html += '</div>';
        html += '<div class="pm-msg-body">';

        if (msg.role === 'user') {
            html += '<p>' + escapeHtml(msg.content) + '</p>';
        } else {
            html += renderMarkdown(msg.content);
            // Phase F: Show "View Analyst Summary" action if a ticker is referenced
            if (_lastHandoffTicker) {
                html += '<div class="pm-handoff-actions">' +
                    '<button class="pm-view-analyst-btn" data-ticker="' + escapeHtml(_lastHandoffTicker) + '" ' +
                    'title="View current Analyst summary for ' + escapeHtml(_lastHandoffTicker) + '">' +
                    '<span class="pm-handoff-icon">&#8592;</span> View Analyst summary: ' + escapeHtml(_lastHandoffTicker) +
                    '</button></div>';
            }
        }
        html += '</div>';
        html += '</div>';
    });

    messagesEl.innerHTML = html;
    scrollToBottom();
    _bindViewAnalystButtons();
}

function _bindViewAnalystButtons() {
    if (!messagesEl) return;
    messagesEl.querySelectorAll('.pm-view-analyst-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const t = btn.getAttribute('data-ticker');
            if (t) viewAnalystSummary(t);
        });
    });
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function showTyping() {
    const el = document.createElement('div');
    el.className = 'pm-typing';
    el.id = 'pmTypingIndicator';
    el.innerHTML =
        '<span class="pm-typing-label">PM</span>' +
        '<div class="pm-typing-dots">' +
            '<div class="pm-typing-dot"></div>' +
            '<div class="pm-typing-dot"></div>' +
            '<div class="pm-typing-dot"></div>' +
        '</div>';
    messagesEl.appendChild(el);
    scrollToBottom();
}

function hideTyping() {
    const el = document.getElementById('pmTypingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================================================
// SEND MESSAGE
// ============================================================

function sendMessage() {
    const question = inputEl ? inputEl.value.trim() : '';
    if (!question || isLoading) return;

    const now = Date.now();
    if (now - _lastSendTime < SEND_COOLDOWN_MS) return;
    _lastSendTime = now;

    if (_cooldownTimer) clearTimeout(_cooldownTimer);
    _cooldownTimer = setTimeout(function() { updateSendButton(); }, SEND_COOLDOWN_MS);

    if (!conversations[currentPortfolioKey]) conversations[currentPortfolioKey] = [];
    const convo = conversations[currentPortfolioKey];

    convo.push({ role: 'user', content: question, timestamp: now });
    try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) { // Expected: sessionStorage may be unavailable in restricted environments
    }
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    updateSendButton();
    renderConversation();
    showTyping();

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;

    // Build history
    const history = convo.slice(0, -1).map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
    });

    if (isFile) {
        hideTyping();
        appendError('PM Chat requires the hosted version. Open via the GitHub Pages or custom domain URL.');
        isLoading = false;
        updateSendButton();
        return;
    }

    const _fetchHeaders = { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY };
    const _fetchToken = window.CI_AUTH && window.CI_AUTH.getToken();
    if (_fetchToken) _fetchHeaders['Authorization'] = 'Bearer ' + _fetchToken;
    let _chatUrl = PM_API_BASE;
    if (!_fetchToken && window.CI_AUTH && window.CI_AUTH.getGuestId) {
        _chatUrl += '?guest_id=' + encodeURIComponent(window.CI_AUTH.getGuestId());
    }

    fetch(_chatUrl, {
        method: 'POST',
        headers: _fetchHeaders,
        body: JSON.stringify({
            question: question,
            conversation_history: history,
            portfolio_id: (typeof window.pnGetPortfolioId === 'function' ? window.pnGetPortfolioId() : null),
            personalisation_context: (typeof window.pnGetPersonalisationContext === 'function' ? window.pnGetPersonalisationContext() : null),
            pm_conversation_id: _pmConversationId,
            guest_id: (window.CI_AUTH && window.CI_AUTH.getGuestId ? window.CI_AUTH.getGuestId() : null)
        })
    })
    .then(function(res) {
        if (!res.ok) {
            return res.text().then(function(body) {
                let detail = '';
                try { detail = JSON.parse(body).detail || ''; } catch(e) { // Expected: response body may not be valid JSON
                }
                if (res.status === 502) {
                    throw new Error('The PM service returned an error. Please try again in a moment.');
                }
                throw new Error(detail || 'Request failed (' + res.status + ')');
            });
        }
        return res.json();
    })
    .then(function(data) {
        hideTyping();
        convo.push({
            role: 'assistant',
            content: data.response,
            timestamp: Date.now()
        });
        try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) { // Expected: sessionStorage may be unavailable in restricted environments
        }

        // Capture PM conversation ID for persistence (Phase E)
        if (data.pm_conversation_id) _pmConversationId = data.pm_conversation_id;

        // Capture mandate/alignment metadata
        _lastBreaches = data.mandate_breaches || [];
        _lastAlignmentScore = data.alignment_score != null ? data.alignment_score : null;
        _lastNotCoveredCount = data.not_covered_count != null ? data.not_covered_count : null;
        _renderMandateStatus();

        renderConversation();
    })
    .catch(function(err) {
        hideTyping();
        let msg = err.message || 'Something went wrong. Please try again.';
        if (msg === 'Failed to fetch') msg = 'Cannot reach the PM API. Check that the server is running.';
        appendError(msg);
    })
    .finally(function() {
        isLoading = false;
        updateSendButton();
    });
}

function appendError(msg) {
    const el = document.createElement('div');
    el.className = 'pm-error';
    el.textContent = msg;
    if (messagesEl) {
        messagesEl.appendChild(el);
        scrollToBottom();
    }
}

// ============================================================
// INPUT HELPERS
// ============================================================

function autoResize() {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

function _isInCooldown() {
    return Date.now() - _lastSendTime < SEND_COOLDOWN_MS;
}

function updateSendButton() {
    if (!sendBtn || !inputEl) return;
    const cooldown = _isInCooldown();
    sendBtn.disabled = !inputEl.value.trim() || isLoading || cooldown;
    sendBtn.style.opacity = cooldown ? '0.4' : '';
}

// ============================================================
// CLEAR CONVERSATION
// ============================================================

function clearConversation() {
    conversations[currentPortfolioKey] = [];
    _pmConversationId = null;  // Phase E: reset persisted conversation
    try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) { // Expected: sessionStorage may be unavailable in restricted environments
    }
    renderWelcome();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function _setupListeners() {
    // Clear button
    if (clearBtn) {
        clearBtn.addEventListener('click', clearConversation);
    }

    // Collapse button (switch back to analyst)
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function() {
            switchRailMode('analyst');
        });
    }

    // Input events
    if (inputEl) {
        inputEl.addEventListener('input', function() {
            autoResize();
            updateSendButton();
        });

        inputEl.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    // Send button
    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }

    // Escape closes on mobile
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && _currentMode === 'pm' && window.innerWidth < 1024) {
            switchRailMode('analyst');
        }
    });

    // Mobile FAB
    if (fab) {
        fab.addEventListener('click', function() {
            switchRailMode('pm');
        });
    }
}

/**
 * Check if a portfolio already exists in localStorage/backend
 * and update the PM badge accordingly. Handles page refresh scenario
 * where ci:portfolio:synced event was never fired.
 */
function _checkExistingPortfolio() {
    const pid = (typeof window.pnGetPortfolioId === 'function') ? window.pnGetPortfolioId() : null;
    if (!pid || !portfolioBadge) return;

    const headers = {};
    const apiKey = window.CI_API_KEY || '';
    if (apiKey) headers['X-API-Key'] = apiKey;

    let url = apiOrigin + '/api/portfolios/' + pid + '/state';
    const guestId = (window.CI_AUTH && window.CI_AUTH.getGuestId) ? window.CI_AUTH.getGuestId() : null;
    if (guestId) url += '?guest_id=' + encodeURIComponent(guestId);

    fetch(url, { headers: headers })
        .then(function(r) { return r.ok ? r.json() : null; })
        .then(function(data) {
            if (data && data.holdings && data.holdings.length > 0) {
                portfolioBadge.textContent = data.holdings.length + ' HOLDINGS';
                portfolioBadge.classList.add('pm-badge-active');
                console.log('[PM] Existing portfolio detected: ' + data.holdings.length + ' holdings');
            }
        })
        .catch(function(err) {
            console.log('[PM] Portfolio check skipped: ' + (err.message || err));
        });
}

// ============================================================
// INIT
// ============================================================

export function initPMChat() {
    panel         = document.getElementById('pm-panel');
    fab           = document.getElementById('pmFab');
    collapseBtn   = document.getElementById('pmCollapseBtn');
    clearBtn      = document.getElementById('pmClearBtn');
    messagesEl    = document.getElementById('pmMessages');
    inputEl       = document.getElementById('pmInput');
    sendBtn       = document.getElementById('pmSend');
    portfolioBadge = document.getElementById('pmPortfolioBadge');

    if (!panel) {
        console.warn('[PM] #pm-panel not found -- PM panel disabled');
        return;
    }

    // PM starts hidden; analyst is the default mode
    panel.style.display = 'none';

    _setupListeners();
    _injectModeSwitch();

    // Restore last mode if user had PM active
    try {
        const savedMode = localStorage.getItem('ci_rail_mode');
        if (savedMode === 'pm') {
            switchRailMode('pm');
        }
    } catch(e) { // Expected: localStorage may not have this key
    }

    // BEAD-019: Observe portfolio state machine transitions.
    onStateChange(function(newState) {
        if (newState === STATES.READY) {
            _checkExistingPortfolio();
        } else if (newState === STATES.EMPTY) {
            if (portfolioBadge) {
                portfolioBadge.textContent = 'NO PORTFOLIO';
                portfolioBadge.classList.remove('pm-badge-active');
            }
        } else if (newState === STATES.ERROR) {
            if (portfolioBadge) {
                portfolioBadge.textContent = 'PORTFOLIO ERROR';
                portfolioBadge.classList.remove('pm-badge-active');
            }
        }
    });

    // Legacy event listeners kept for backward compatibility.
    window.addEventListener('ci:portfolio:synced', function(e) {
        if (portfolioBadge) {
            const n = e.detail && e.detail.holdings ? e.detail.holdings : 0;
            portfolioBadge.textContent = n + ' HOLDINGS';
            portfolioBadge.classList.add('pm-badge-active');
        }
    });

    window.addEventListener('ci:portfolio:cleared', function() {
        if (portfolioBadge) {
            portfolioBadge.textContent = 'NO PORTFOLIO';
            portfolioBadge.classList.remove('pm-badge-active');
        }
    });

    // Check for existing portfolio on startup (handles page refresh)
    _checkExistingPortfolio();

    // Restore PM conversation from DB (cross-device persistence)
    _restoreFromDB();

    // Listen for "Send to PM" events from the PM dashboard (BEAD-008)
    document.addEventListener('ci:pm:ask', function(e) {
        const question = e.detail && e.detail.question;
        if (!question || !inputEl) return;
        switchRailMode('pm');
        inputEl.value = question;
        updateSendButton();
        sendMessage();
    });

    // Re-fetch PM history after OTP login (identity changes from guest to authenticated)
    window.addEventListener('ci:auth:login', function() {
        _restoreFromDB();
    });

    console.log('[PM] Initialised');
}

// ============================================================
// HANDOFF: Analyst-to-PM (Phase F)
// ============================================================

/**
 * Called from the Analyst panel when user clicks "Assess portfolio fit in PM".
 * Switches to PM mode and injects a pre-formatted question with Analyst context.
 */
function handleAnalystToPMHandoff(ticker, summaryPayload) {
    // Track the handoff ticker for "View Analyst Summary" action
    _lastHandoffTicker = ticker;

    // Switch to PM mode
    switchRailMode('pm');

    // Build a contextualised question for PM
    const coverage = (summaryPayload && summaryPayload.coverage_state) || 'unknown';
    const conviction = (summaryPayload && summaryPayload.conviction_level) || '';
    const valuation = (summaryPayload && summaryPayload.valuation_stance) || '';

    let question = 'Assess portfolio fit for ' + ticker + '.';
    if (coverage === 'not_covered') {
        question = ticker + ' has no Analyst coverage. Should we add it and what are the portfolio implications?';
    } else if (conviction && valuation) {
        question = 'The Analyst has ' + conviction + ' conviction on ' + ticker +
            ' (valuation: ' + valuation + '). Assess portfolio fit: sizing, source-of-funds, and exposure impact.';
    }

    // Insert into input and auto-send
    if (inputEl) {
        inputEl.value = question;
        updateSendButton();
        sendMessage();
    }
}


/**
 * "View Analyst Summary" from PM panel -- fetches and displays inline.
 */
function viewAnalystSummary(ticker) {
    if (!ticker || !messagesEl) return;

    const _fetchHeaders = { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY };
    const _fetchToken = window.CI_AUTH && window.CI_AUTH.getToken();
    if (_fetchToken) _fetchHeaders['Authorization'] = 'Bearer ' + _fetchToken;
    let guestParam = '';
    if (!_fetchToken && window.CI_AUTH && window.CI_AUTH.getGuestId) {
        guestParam = '?guest_id=' + encodeURIComponent(window.CI_AUTH.getGuestId());
    }

    const url = apiOrigin + '/api/handoffs/summary/' + encodeURIComponent(ticker) + guestParam;

    fetch(url, { method: 'GET', headers: _fetchHeaders })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        const payload = data.summary_payload;
        if (!payload) {
            _showAnalystSummaryCard(ticker, null);
            return;
        }
        _showAnalystSummaryCard(ticker, payload);
    })
    .catch(function(err) {
        console.warn('[PM] Failed to fetch Analyst summary:', err);
        _showAnalystSummaryCard(ticker, null);
    });
}


function _showAnalystSummaryCard(ticker, payload) {
    if (!messagesEl) return;

    const existing = messagesEl.querySelector('.pm-analyst-summary-card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.className = 'pm-analyst-summary-card';

    if (!payload || payload.coverage_state === 'not_covered') {
        card.innerHTML =
            '<div class="pm-handoff-header">' +
                '<span class="pm-handoff-badge not-covered">NOT COVERED</span>' +
                '<span class="pm-handoff-ticker">' + escapeHtml(ticker) + '</span>' +
            '</div>' +
            '<div class="pm-handoff-body">No Analyst coverage available. ' +
            'Consider requesting Analyst research before making portfolio decisions.</div>';
    } else {
        const staleTag = payload.coverage_state === 'stale'
            ? '<span class="pm-handoff-badge stale">STALE</span>' : '';
        const convictionTag = payload.conviction_level
            ? '<span class="pm-handoff-badge conviction-' + payload.conviction_level + '">' +
              payload.conviction_level.toUpperCase() + '</span>' : '';

        let risksHtml = '';
        if (payload.key_risks && payload.key_risks.length > 0) {
            risksHtml = '<div class="pm-handoff-risks"><strong>Risks:</strong> ' +
                payload.key_risks.map(function(r) { return escapeHtml(r); }).join(' | ') +
                '</div>';
        }

        let tripsHtml = '';
        if (payload.tripwires && payload.tripwires.length > 0) {
            tripsHtml = '<div class="pm-handoff-trips"><strong>Tripwires:</strong> ' +
                payload.tripwires.map(function(t) { return escapeHtml(t); }).join(' | ') +
                '</div>';
        }

        card.innerHTML =
            '<div class="pm-handoff-header">' +
                '<span class="pm-handoff-source">FROM ANALYST</span>' +
                '<span class="pm-handoff-ticker">' + escapeHtml(ticker) + '</span>' +
                staleTag + convictionTag +
            '</div>' +
            '<div class="pm-handoff-body">' +
                '<div class="pm-handoff-summary">' + escapeHtml(payload.analyst_summary_text || '') + '</div>' +
                '<div class="pm-handoff-meta">' +
                    'Valuation: ' + escapeHtml(payload.valuation_stance || 'unknown') +
                '</div>' +
                risksHtml + tripsHtml +
            '</div>' +
            '<div class="pm-handoff-footer">' +
                '<span class="pm-handoff-version">v' + escapeHtml(payload.summary_version || '') + '</span>' +
            '</div>';
    }

    // Insert before input area
    const inputArea = panel ? panel.querySelector('.pm-input-area') : null;
    if (inputArea) {
        inputArea.parentNode.insertBefore(card, inputArea);
    } else {
        messagesEl.appendChild(card);
    }
    scrollToBottom();
}


// ============================================================
// EXPORTS
// ============================================================

export { switchRailMode, handleAnalystToPMHandoff, viewAnalystSummary };
