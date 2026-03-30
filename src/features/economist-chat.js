/**
 * economist-chat.js -- Economist Chat Panel
 *
 * Full-page chat within #page-economist for macro-economic discussion.
 * Follows the same patterns as chat.js (Analyst) and pm-chat.js (PM).
 *
 * Depends on:
 *   - marked (npm, bundled via Vite)
 *   - dompurify (npm, bundled via Vite)
 *   - API_BASE from api-config.js
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { API_BASE } from '../lib/api-config.js';

// ============================================================
// CONFIGURATION
// ============================================================

var isFile         = window.location.protocol === 'file:';
var apiOrigin      = API_BASE;
var ECON_API_BASE  = apiOrigin + '/api/economist/chat';
var ECON_STATE_URL = apiOrigin + '/api/economist/state';
var CI_API_KEY     = window.CI_API_KEY || '';

// ============================================================
// DOM REFS
// ============================================================

var container, headerEl, messagesEl, inputEl, sendBtn, clearBtn;
var historyBtn, sidebarEl, regimeBadgeEl;

// ============================================================
// STATE
// ============================================================

var _initialised  = false;
var isLoading     = false;
var _lastSendTime = 0;
var _cooldownTimer = null;
var SEND_COOLDOWN_MS = 2000;
var STREAM_TIMEOUT_MS = 120000; // 2 min max for streaming response
var _econConversationId = null;
var _currentRegime = null;
var _currentPolicyPath = null;
var _streamAbortController = null; // AbortController for in-flight SSE stream
var _streamReader = null; // ReadableStreamDefaultReader for cleanup

var conversations = (function() {
    try {
        var saved = localStorage.getItem('ci_economist_conversations');
        return saved ? JSON.parse(saved) : {};
    } catch(e) {
        return {};
    }
}());
var currentConversationKey = '_default';

// Conversation list cache for sidebar
var _conversationList = [];
var _sidebarOpen = false;

// ============================================================
// SUGGESTIONS
// ============================================================

var ECON_SUGGESTIONS = [
    'What is the current macro regime and why?',
    'How should I position for an RBA rate cut?',
    'What are the leading indicators signalling right now?',
    'Compare the monetary policy outlook: RBA vs Fed vs RBNZ'
];

// ============================================================
// DB PERSISTENCE
// ============================================================

function _getAuthHeaders() {
    var headers = { 'Content-Type': 'application/json' };
    if (CI_API_KEY) headers['X-API-Key'] = CI_API_KEY;
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
}

function _getGuestParam() {
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) return '';
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    return guestId ? '?guest_id=' + encodeURIComponent(guestId) : '';
}

function _getUserId() {
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    if (token) return null; // server derives from JWT
    return (window.CI_AUTH && window.CI_AUTH.getGuestId()) || null;
}

function _persistToLocalStorage() {
    try {
        localStorage.setItem('ci_economist_conversations', JSON.stringify(conversations));
    } catch(e) { /* localStorage may be full or unavailable */ }
}

function _restoreFromDB() {
    if (isFile) return Promise.resolve();
    var token   = window.CI_AUTH && window.CI_AUTH.getToken();
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    if (!token && !guestId) return Promise.resolve();

    // Fetch conversation list (sorted newest-first by backend), then load the latest
    return _fetchConversationList().then(function(convos) {
        if (!convos || convos.length === 0) return;
        var latest = convos[0];
        if (!latest.conversation_id) return;
        return _loadConversationFromDB(latest.conversation_id);
    }).catch(function(err) {
        console.warn('[Economist] DB restore failed:', err.message || err);
    });
}

function _loadConversationFromDB(conversationId) {
    var headers = _getAuthHeaders();
    var url = apiOrigin + '/api/economist/conversations/' + encodeURIComponent(conversationId) + _getGuestParam();
    return fetch(url, { headers: headers })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
            if (!data || !data.messages || data.messages.length === 0) return;
            _econConversationId = data.conversation_id || conversationId;
            conversations[currentConversationKey] = data.messages.map(function(m) {
                return {
                    role: m.role,
                    content: m.content,
                    timestamp: m.created_at ? new Date(m.created_at).getTime() : 0
                };
            });
            _persistToLocalStorage();
        });
}

function _fetchConversationList() {
    if (isFile) return Promise.resolve([]);
    var headers = _getAuthHeaders();
    var url = apiOrigin + '/api/economist/conversations' + _getGuestParam();
    return fetch(url, { headers: headers })
        .then(function(res) { return res.ok ? res.json() : { conversations: [] }; })
        .then(function(data) { return data.conversations || []; })
        .catch(function() { return []; });
}

// ============================================================
// REGIME STATE
// ============================================================

function fetchRegimeState() {
    if (isFile) return Promise.resolve();
    var headers = _getAuthHeaders();
    return fetch(ECON_STATE_URL, { headers: headers })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
            if (!data) {
                _currentRegime = null;
                _currentPolicyPath = null;
            } else {
                _currentRegime = data.regime || null;
                _currentPolicyPath = data.policy_path || null;
            }
            renderRegimeBadge();
        })
        .catch(function(err) {
            console.warn('[Economist] Regime state fetch failed:', err.message || err);
            _currentRegime = null;
            _currentPolicyPath = null;
            renderRegimeBadge();
        });
}

function renderRegimeBadge() {
    if (!regimeBadgeEl) return;

    var regime = _currentRegime;
    var colourClass = 'econ-regime-none';
    var label = 'NO DATA';

    if (regime === 'RISK_ON') {
        colourClass = 'econ-regime-risk-on';
        label = 'RISK ON';
    } else if (regime === 'RISK_OFF') {
        colourClass = 'econ-regime-risk-off';
        label = 'RISK OFF';
    } else if (regime === 'TRANSITION') {
        colourClass = 'econ-regime-transition';
        label = 'TRANSITION';
    }

    var html = '<span class="econ-regime-dot ' + colourClass + '"></span>' +
               '<span class="econ-regime-label">' + escapeHtml(label) + '</span>';

    if (_currentPolicyPath) {
        html += '<span class="econ-policy-path">' + escapeHtml(_currentPolicyPath) + '</span>';
    }

    regimeBadgeEl.innerHTML = html;
    regimeBadgeEl.className = 'econ-regime-badge ' + colourClass;
}

// ============================================================
// RENDERING
// ============================================================

function formatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    return hh + ':' + mm;
}

function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str != null ? String(str) : '';
    return d.innerHTML;
}

function renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text));
}

function renderWelcome() {
    if (!messagesEl) return;
    var html =
        '<div class="econ-welcome">' +
            '<div class="econ-welcome-title">Strategist Ready</div>' +
            '<div class="econ-welcome-text">Macro regime analysis, central bank policy, and economic indicators grounded in official data sources.</div>' +
            '<div class="econ-welcome-descriptor">' +
                'The Strategist synthesises RBA, RBNZ, Fed, ABS, BIS, and EIA data ' +
                'to provide regime-aware macro analysis and policy path guidance.' +
            '</div>' +
            '<div class="econ-suggestions">' +
                ECON_SUGGESTIONS.map(function(s) {
                    return '<button class="econ-suggestion" data-q="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
                }).join('') +
            '</div>' +
        '</div>';
    messagesEl.innerHTML = html;
    messagesEl.querySelectorAll('.econ-suggestion').forEach(function(btn) {
        btn.addEventListener('click', function() {
            inputEl.value = btn.getAttribute('data-q');
            updateSendButton();
            sendMessage();
        });
    });
}

function renderConversation() {
    if (!messagesEl) return;
    var convo = conversations[currentConversationKey] || [];
    if (convo.length === 0) {
        renderWelcome();
        return;
    }

    var html = '';
    convo.forEach(function(msg) {
        var role      = msg.role === 'user' ? 'user' : 'economist';
        var roleLabel = msg.role === 'user' ? 'YOU' : 'STRATEGIST';
        var timeStr   = formatTime(msg.timestamp);

        html += '<div class="econ-msg-row">';
        html += '<div class="econ-msg-meta">';
        html += '<span class="econ-msg-role ' + role + '">' + roleLabel + '</span>';
        if (timeStr) html += '<span class="econ-msg-time">' + timeStr + '</span>';
        html += '</div>';
        html += '<div class="econ-msg-body">';

        if (msg.role === 'user') {
            html += '<p>' + escapeHtml(msg.content) + '</p>';
        } else {
            html += renderMarkdown(msg.content);
        }
        html += '</div>';
        html += '</div>';
    });

    messagesEl.innerHTML = html;
    scrollToBottom();
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function showTyping() {
    if (!messagesEl) return;
    var el = document.createElement('div');
    el.className = 'econ-typing';
    el.id = 'econTypingIndicator';
    el.innerHTML =
        '<span class="econ-typing-label">STRATEGIST</span>' +
        '<div class="econ-typing-dots">' +
            '<div class="econ-typing-dot"></div>' +
            '<div class="econ-typing-dot"></div>' +
            '<div class="econ-typing-dot"></div>' +
        '</div>';
    messagesEl.appendChild(el);
    scrollToBottom();
}

function hideTyping() {
    var el = document.getElementById('econTypingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================================================
// SEND MESSAGE
// ============================================================

function _appendStreamingBubble() {
    if (!messagesEl) return null;

    // Suppress aria-live during streaming to avoid flooding screen readers
    messagesEl.setAttribute('aria-live', 'off');

    var row = document.createElement('div');
    row.className = 'econ-msg-row';
    row.innerHTML =
        '<div class="econ-msg-meta">' +
            '<span class="econ-msg-role economist">STRATEGIST</span>' +
            '<span class="econ-msg-time"></span>' +
        '</div>' +
        '<div class="econ-msg-body econ-streaming"></div>';
    messagesEl.appendChild(row);
    scrollToBottom();
    return row.querySelector('.econ-msg-body');
}

function _finaliseStreamingBubble(bubbleEl) {
    if (!bubbleEl) return;
    bubbleEl.classList.remove('econ-streaming');
    // Re-render accumulated text through markdown
    var rawText = bubbleEl.getAttribute('data-raw') || bubbleEl.textContent;
    bubbleEl.innerHTML = renderMarkdown(rawText);

    // Restore aria-live so the final message is announced
    if (messagesEl) messagesEl.setAttribute('aria-live', 'polite');
}

function _abortStream() {
    if (_streamAbortController) {
        _streamAbortController.abort();
        _streamAbortController = null;
    }
    if (_streamReader) {
        try { _streamReader.cancel(); } catch(e) { /* already closed */ }
        _streamReader = null;
    }
}

function sendMessage() {
    var question = inputEl ? inputEl.value.trim() : '';
    if (!question || isLoading) return;

    var now = Date.now();
    if (now - _lastSendTime < SEND_COOLDOWN_MS) return;
    _lastSendTime = now;

    if (_cooldownTimer) clearTimeout(_cooldownTimer);
    _cooldownTimer = setTimeout(function() { updateSendButton(); }, SEND_COOLDOWN_MS);

    if (!conversations[currentConversationKey]) conversations[currentConversationKey] = [];
    var convo = conversations[currentConversationKey];

    convo.push({ role: 'user', content: question, timestamp: now });
    _persistToLocalStorage();
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    updateSendButton();
    renderConversation();
    showTyping();

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;

    if (isFile) {
        hideTyping();
        appendError('Strategist Chat requires the hosted version.');
        isLoading = false;
        updateSendButton();
        return;
    }

    // Set up abort controller and timeout for this stream
    _abortStream(); // cancel any previous in-flight stream
    _streamAbortController = new AbortController();
    var streamTimeoutId = setTimeout(function() {
        _abortStream();
    }, STREAM_TIMEOUT_MS);

    var headers = _getAuthHeaders();
    var chatUrl = ECON_API_BASE + _getGuestParam();

    // Build personalisation profile if available (same source as Analyst/PM Chat)
    var personalisationProfile = null;
    if (typeof window.pnBuildSystemPrompt === 'function' &&
        typeof window.pnGetPersonalisationContext === 'function') {
        var ctx = window.pnGetPersonalisationContext();
        if (ctx && ctx.hasProfile && ctx.profile) {
            try {
                personalisationProfile = window.pnBuildSystemPrompt(
                    ctx.profile, ctx.firm || {}, ctx.fund || {}, ctx.portfolio || [], ctx.mandate || {}
                );
            } catch(e) {
                console.warn('[Economist] personalisation profile build failed:', e);
            }
        }
    }

    var requestBody = {
        conversation_id: _econConversationId,
        message: question,
        user_id: _getUserId()
    };
    if (personalisationProfile) {
        requestBody.personalisation_profile = personalisationProfile;
    }

    fetch(chatUrl, {
        method: 'POST',
        headers: headers,
        signal: _streamAbortController.signal,
        body: JSON.stringify(requestBody)
    })
    .then(function(res) {
        if (!res.ok) {
            return res.text().then(function(body) {
                var detail = '';
                try { detail = JSON.parse(body).detail || ''; } catch(e) { /* not JSON */ }
                if (res.status === 502) {
                    throw new Error('The Strategist service returned an error. Please try again in a moment.');
                }
                if (res.status === 429) {
                    throw new Error('Rate limited. Please wait a moment before trying again.');
                }
                throw new Error(detail || 'Request failed (' + res.status + ')');
            });
        }

        // Extract conversation_id from header
        var headerConvId = res.headers.get('X-Conversation-Id');
        if (headerConvId) _econConversationId = headerConvId;

        // Replace typing indicator with a streaming bubble
        hideTyping();
        var bubbleEl = _appendStreamingBubble();
        var accumulated = '';

        var reader = res.body.getReader();
        _streamReader = reader; // store for cleanup
        var decoder = new TextDecoder();
        var buffer = '';

        function processStream() {
            return reader.read().then(function(result) {
                if (result.done) {
                    // Stream ended; finalise
                    _streamReader = null;
                    clearTimeout(streamTimeoutId);
                    if (bubbleEl) {
                        bubbleEl.setAttribute('data-raw', accumulated);
                        _finaliseStreamingBubble(bubbleEl);
                    }
                    if (accumulated) {
                        convo.push({
                            role: 'assistant',
                            content: accumulated,
                            timestamp: Date.now()
                        });
                        _persistToLocalStorage();
                    }
                    fetchRegimeState();
                    isLoading = false;
                    updateSendButton();
                    return;
                }

                buffer += decoder.decode(result.value, { stream: true });

                // Parse SSE lines: each event is "data: {...}\n\n"
                var lines = buffer.split('\n');
                buffer = '';

                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];

                    // If this is the last element and does not end with a
                    // newline, it is an incomplete line; keep it in buffer.
                    if (i === lines.length - 1 && line !== '') {
                        buffer = line;
                        break;
                    }

                    if (!line.startsWith('data: ')) continue;

                    var jsonStr = line.slice(6);
                    if (!jsonStr) continue;

                    try {
                        var evt = JSON.parse(jsonStr);
                    } catch(e) {
                        continue;
                    }

                    if (evt.type === 'content_delta' && evt.text) {
                        accumulated += evt.text;
                        if (bubbleEl) {
                            bubbleEl.textContent = accumulated;
                            scrollToBottom();
                        }
                    } else if (evt.type === 'message_complete') {
                        if (evt.text) accumulated = evt.text;
                        if (evt.conversation_id) _econConversationId = evt.conversation_id;
                    }
                }

                return processStream();
            });
        }

        return processStream();
    })
    .catch(function(err) {
        clearTimeout(streamTimeoutId);
        _streamReader = null;
        hideTyping();
        if (err.name === 'AbortError') {
            appendError('Request timed out or was cancelled. Please try again.');
        } else {
            var msg = err.message || 'Something went wrong. Please try again.';
            if (msg === 'Failed to fetch') msg = 'Cannot reach the Strategist API. Check that the server is running.';
            appendError(msg);
        }
        isLoading = false;
        updateSendButton();
    });
}

function appendError(msg) {
    var el = document.createElement('div');
    el.className = 'econ-error';
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
    var cooldown = _isInCooldown();
    sendBtn.disabled = !inputEl.value.trim() || isLoading || cooldown;
    sendBtn.style.opacity = cooldown ? '0.4' : '';
}

// ============================================================
// CLEAR CONVERSATION
// ============================================================

function clearConversation() {
    _abortStream(); // cancel any in-flight stream
    isLoading = false;
    conversations[currentConversationKey] = [];
    _econConversationId = null;
    _persistToLocalStorage();
    renderWelcome();
    updateSendButton();
}

// ============================================================
// CONVERSATION HISTORY SIDEBAR
// ============================================================

function _formatHistoryDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var now = new Date();
    var diff = now - d;
    if (diff < 86400000) {
        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
    }
    if (diff < 604800000) {
        return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
    }
    return d.getDate() + ' ' + ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
}

function toggleSidebar() {
    _sidebarOpen = !_sidebarOpen;
    if (_sidebarOpen) {
        openSidebar();
    } else {
        closeSidebar();
    }
}

function openSidebar() {
    if (!sidebarEl) return;
    _sidebarOpen = true;
    sidebarEl.classList.add('econ-sidebar-open');
    _refreshSidebar();
}

function closeSidebar() {
    if (!sidebarEl) return;
    _sidebarOpen = false;
    sidebarEl.classList.remove('econ-sidebar-open');
}

function _refreshSidebar() {
    if (!sidebarEl) return;
    var listEl = sidebarEl.querySelector('.econ-sidebar-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="econ-sidebar-loading">Loading...</div>';

    _fetchConversationList().then(function(convos) {
        _conversationList = convos;
        if (convos.length === 0) {
            listEl.innerHTML = '<div class="econ-sidebar-empty">No conversation history yet</div>';
            return;
        }

        listEl.innerHTML = '';
        convos.forEach(function(c) {
            var item = document.createElement('div');
            item.className = 'econ-conversation-item';
            var convId = c.conversation_id || '';
            var title = c.macro_context_summary || ('Conversation ' + convId.slice(0, 8));
            item.innerHTML =
                '<span class="econ-conv-title">' + escapeHtml(title) + '</span>' +
                '<div class="econ-conv-meta">' +
                    '<span>' + (c.message_count || 0) + ' msg' + ((c.message_count || 0) === 1 ? '' : 's') + '</span>' +
                    '<span>' + _formatHistoryDate(c.updated_at || c.created_at) + '</span>' +
                '</div>';
            item.addEventListener('click', function() {
                _loadConversation(c);
                closeSidebar();
            });
            listEl.appendChild(item);
        });
    });
}

function _loadConversation(convMeta) {
    var convId = convMeta && convMeta.conversation_id;
    if (!convId) return;

    _loadConversationFromDB(convId)
        .then(function() { renderConversation(); })
        .catch(function(err) {
            console.warn('[Economist] Load conversation failed:', err.message || err);
        });
}

// ============================================================
// BUILD DOM
// ============================================================

function _buildDOM() {
    if (!container) return;

    container.innerHTML =
        '<div class="econ-header" id="econHeader">' +
            '<div class="econ-header-left">' +
                '<div class="econ-header-icon">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="econ-header-text">' +
                    '<div class="econ-header-title">STRATEGIST</div>' +
                    '<div class="econ-regime-badge" id="econRegimeBadge"></div>' +
                '</div>' +
            '</div>' +
            '<div class="econ-header-actions">' +
                '<button class="econ-history-btn" id="econHistoryBtn" title="Conversation history" aria-label="Conversation history">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' +
                    '</svg>' +
                '</button>' +
                '<button class="econ-clear-btn" id="econClearBtn" title="Clear conversation" aria-label="Clear conversation">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>' +
                    '</svg>' +
                '</button>' +
                '<button class="econ-collapse-btn" id="econCollapseBtn" title="Switch to Analyst" aria-label="Switch to Analyst panel">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<polyline points="9 18 15 12 9 6"/>' +
                    '</svg>' +
                '</button>' +
            '</div>' +
        '</div>' +

        '<div class="econ-sidebar" id="econSidebar">' +
            '<div class="econ-sidebar-head">' +
                '<h3>History</h3>' +
                '<button class="econ-sidebar-close" id="econSidebarClose" aria-label="Close history">&times;</button>' +
            '</div>' +
            '<div class="econ-sidebar-list"></div>' +
        '</div>' +

        '<div class="econ-messages" id="econMessages" aria-live="polite" role="log" aria-label="Strategist conversation"></div>' +

        '<div class="econ-input-area">' +
            '<label for="econInput" class="sr-only">Ask the strategist a question</label>' +
            '<textarea class="econ-input" id="econInput" placeholder="Ask about macro regime, rates outlook, sector positioning..." rows="1" aria-label="Ask the strategist a question"></textarea>' +
            '<div class="econ-input-actions">' +
                '<span class="econ-shortcut-hint">&#8984;&#8629;</span>' +
                '<button class="econ-send-btn" id="econSend" disabled aria-label="Send message">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
                        '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>' +
                    '</svg>' +
                '</button>' +
            '</div>' +
        '</div>';

    // Cache DOM refs
    headerEl      = container.querySelector('.econ-header');
    messagesEl    = document.getElementById('econMessages');
    inputEl       = document.getElementById('econInput');
    sendBtn       = document.getElementById('econSend');
    clearBtn      = document.getElementById('econClearBtn');
    historyBtn    = document.getElementById('econHistoryBtn');
    sidebarEl     = document.getElementById('econSidebar');
    regimeBadgeEl = document.getElementById('econRegimeBadge');
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function _setupListeners() {
    if (clearBtn) {
        clearBtn.addEventListener('click', clearConversation);
    }

    if (historyBtn) {
        historyBtn.addEventListener('click', toggleSidebar);
    }

    var sidebarClose = document.getElementById('econSidebarClose');
    if (sidebarClose) {
        sidebarClose.addEventListener('click', closeSidebar);
    }

    var collapseBtn = document.getElementById('econCollapseBtn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function() {
            // Import switchRailMode from pm-chat.js (available globally after init)
            if (typeof window.switchRailMode === 'function') {
                window.switchRailMode('analyst');
            } else {
                // Fallback: import dynamically
                import('./pm-chat.js').then(function(mod) {
                    mod.switchRailMode('analyst');
                });
            }
        });
    }

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

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
}

// ============================================================
// INIT
// ============================================================

export function initEconomistChat() {
    // Register lazy-init hook for panel mode switch
    window._initStrategistPanel = function() {
        if (_initialised) return;
        _doInit();
    };

    // Also attempt immediate init if container already exists
    _doInit();
}

function _doInit() {
    container = document.getElementById('econChatContainer');
    if (!container) {
        return;
    }

    if (_initialised) return;
    _initialised = true;

    _buildDOM();
    _setupListeners();

    // Inject mode switch tab bar into strategist header
    if (typeof window._injectStratModeSwitch === 'function') {
        window._injectStratModeSwitch();
    }

    // Restore conversation from DB, then render
    _restoreFromDB().then(function() {
        renderConversation();
    });

    // Fetch initial regime state
    fetchRegimeState();

    // Re-fetch after auth login
    window.addEventListener('ci:auth:login', function() {
        _restoreFromDB().then(renderConversation);
        fetchRegimeState();
    });

    console.log('[Economist] Strategist panel initialised');
}

// ============================================================
// EXPORTS
// ============================================================

export { fetchRegimeState };
