/**
 * chat.js -- Persistent Analyst Panel
 *
 * Docked right-rail panel that persists across all page navigation.
 * Replaces FAB popup and inline report chat.
 *
 * Depends on:
 *   - window.STOCK_DATA (global, via state.js)
 *   - marked (npm, bundled via Vite)
 *   - dompurify (npm, bundled via Vite)
 *   - window.pnBuildSystemPrompt (classic script public/js/personalisation.js)
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { STOCK_DATA } from '../lib/state.js';
import { saveThesis, getThesis, inferBiasFromQuestion, recordSignal, getConsistentSignalCount } from './thesis-capture.js';
import { API_BASE } from '../lib/api-config.js';

// ============================================================
// CONFIGURATION
// ============================================================

var isFile        = window.location.protocol === 'file:';
var apiOrigin     = API_BASE;
var CHAT_API_BASE = apiOrigin + '/api/research-chat';
var CI_API_KEY    = window.CI_API_KEY || '';

// ============================================================
// VOICE RULES -- loaded from data/config/voice-rules.json (single source of truth)
// ============================================================

import voiceRulesData from '../../data/config/voice-rules.json';

export var VOICE_RULES = '\n\n' + voiceRulesData.header + '\n' + voiceRulesData.rules.join('\n') + '\n';

// ============================================================
// SYSTEM PROMPT (shared, used by thesis comparator and fallback)
// ============================================================

export var ANALYST_SYSTEM_PROMPT =
    'You are a senior equity research analyst at Continuum Intelligence. ' +
    'You speak in the first person plural ("we", "our analysis", "our framework"). ' +
    'You are direct, precise, and opinionated, like a fund manager talking to another fund manager. ' +
    'Present competing hypotheses fairly. Never default to bullish or bearish bias. ' +
    'Distinguish between facts (statutory filings, audited data), motivated claims (company communications), consensus views (broker research), and noise (media/social). ' +
    'Highlight what discriminates between hypotheses. Be direct about what is unknown or uncertain. Flag research gaps explicitly.' +
    VOICE_RULES;


// ============================================================
// DOM REFS
// ============================================================

var panel, fab, collapseBtn, clearBtn, historyBtn, messages, input, sendBtn, tickerSelect, tickerBadge;

// ============================================================
// STATE
// ============================================================

var isOpen        = false;
var isLoading     = false;
var _lastSendTime = 0;
var _cooldownTimer = null;
var SEND_COOLDOWN_MS = 2000;
var conversations = (function() {
    try {
        var saved = sessionStorage.getItem('ci_conversations');
        return saved ? JSON.parse(saved) : {};
    } catch(e) {
        return {};
    }
}());
var currentTicker = '';

// ============================================================
// DB PERSISTENCE
// ============================================================

// Per-session cache of conversationId per ticker (avoids creating duplicate conversations)
var dbConversationIds = {};

async function _ensureConversation(ticker) {
    if (!ticker) return null;
    if (dbConversationIds[ticker]) return dbConversationIds[ticker];
    if (isFile) return null;
    var token   = window.CI_AUTH && window.CI_AUTH.getToken();
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    if (!token && !guestId) return null;

    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
        var res = await fetch(apiOrigin + '/api/conversations', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ ticker: ticker, guest_id: token ? null : guestId })
        });
        if (!res.ok) return null;
        var data = await res.json();
        dbConversationIds[ticker] = data.id;
        return data.id;
    } catch (e) {
        return null;
    }
}

function _persistMessage(ticker, role, content, sources) {
    // Fire and forget -- DB failures must never block the chat UI
    _ensureConversation(ticker).then(function(convId) {
        if (!convId) return;
        var token   = window.CI_AUTH && window.CI_AUTH.getToken();
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        fetch(apiOrigin + '/api/conversations/' + convId + '/messages', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ role: role, content: content, sources_json: sources || null })
        }).catch(function() { /* silent -- no impact on UX */ });
    });
}

function _restoreFromDB(ticker) {
    if (!ticker || isFile) return Promise.resolve();
    var token   = window.CI_AUTH && window.CI_AUTH.getToken();
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    if (!token && !guestId) return Promise.resolve();

    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var url = apiOrigin + '/api/conversations/' + encodeURIComponent(ticker) +
              (token ? '' : ('?guest_id=' + encodeURIComponent(guestId)));
    return fetch(url, { headers: headers })
        .then(function(res) { return res.ok ? res.json() : null; })
        .then(function(data) {
            if (!data || !data.messages || data.messages.length === 0) return;
            if (data.conversation_id) dbConversationIds[ticker] = data.conversation_id;
            // DB wins over sessionStorage for cross-session history
            conversations[ticker] = data.messages.map(function(m) {
                return { role: m.role, content: m.content, sources: m.sources_json || [], timestamp: 0 };
            });
            try { sessionStorage.setItem('ci_conversations', JSON.stringify(conversations)); } catch(e) {}
        })
        .catch(function() { /* silent -- degrades to sessionStorage */ });
}

// ============================================================
// TICKER MANAGEMENT
// ============================================================

function populateTickerSelect() {
    if (!tickerSelect) return;
    var tickers = Object.keys(STOCK_DATA).sort();
    tickerSelect.innerHTML = '<option value="">-- All coverage --</option>';
    tickers.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t + '  --  ' + (STOCK_DATA[t].company || t);
        tickerSelect.appendChild(opt);
    });
    syncTickerFromRoute();
}

function syncTickerFromRoute() {
    // Only SET coverage when navigating to a stock page -- never clear on navigation.
    // The user controls clearing via the dropdown or Clear button.
    var hash = window.location.hash.slice(1) || '';
    var detected = '';
    if (hash.startsWith('report-'))   detected = hash.replace('report-', '').toUpperCase();
    if (hash.startsWith('snapshot-')) detected = hash.replace('snapshot-', '').toUpperCase();
    if (detected) {
        // Trust the route -- data may not be loaded yet when hashchange fires
        currentTicker = detected;
        if (tickerSelect && tickerSelect.querySelector('option[value="' + detected + '"]')) {
            tickerSelect.value = detected;
        }
        updateTickerBadge();
    }
    // Non-stock pages: leave coverage unchanged
}

function updateTickerBadge() {
    if (!tickerBadge) return;
    if (currentTicker && STOCK_DATA[currentTicker]) {
        tickerBadge.textContent = currentTicker;
    } else {
        tickerBadge.textContent = 'ALL COVERAGE';
    }
    // Update textarea placeholder
    if (input) {
        var company = currentTicker && STOCK_DATA[currentTicker] ? STOCK_DATA[currentTicker].company : 'any covered stock';
        input.placeholder = 'Ask about ' + company + '...';
    }
}

// ============================================================
// SUGGESTIONS
// ============================================================

function getSuggestions(ticker) {
    if (ticker && STOCK_DATA[ticker]) {
        return [
            'What is the bull case for ' + ticker + '?',
            'What are the key risks the market is underpricing?',
            'Summarise the competing hypotheses and where weight is accumulating',
            'What catalysts should I watch over the next 90 days?'
        ];
    }
    return [
        'Which names look most dislocated right now?',
        'Compare the risk skew across your coverage',
        'Which hypotheses are closest to being resolved?',
        'Where is consensus most wrong?'
    ];
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
    var suggs = getSuggestions(currentTicker);
    var company = currentTicker && STOCK_DATA[currentTicker] ? STOCK_DATA[currentTicker].company : 'any covered stock';
    var html =
        '<div class="ap-welcome">' +
            '<div class="ap-welcome-title">Analyst Ready</div>' +
            '<div class="ap-welcome-text">Ask questions about <strong>' + escapeHtml(company) + '</strong> grounded in our structured ACH research framework.</div>' +
            '<div class="ap-suggestions">' +
                suggs.map(function(s) {
                    return '<button class="ap-suggestion" data-q="' + escapeHtml(s) + '">' + escapeHtml(s) + '</button>';
                }).join('') +
            '</div>' +
        '</div>';
    messages.innerHTML = html;
    messages.querySelectorAll('.ap-suggestion').forEach(function(btn) {
        btn.addEventListener('click', function() {
            input.value = btn.getAttribute('data-q');
            updateSendButton();
            sendMessage();
        });
    });
}

function renderConversation() {
    if (!messages) return;
    var convo = conversations[currentTicker] || [];
    if (convo.length === 0) {
        renderWelcome();
        return;
    }

    var html = '';
    convo.forEach(function(msg) {
        var role     = msg.role === 'user' ? 'user' : 'analyst';
        var roleLabel = msg.role === 'user' ? 'YOU' : 'ANALYST';
        var timeStr  = formatTime(msg.timestamp);

        html += '<div class="ap-msg-row">';
        html += '<div class="ap-msg-meta">';
        html += '<span class="ap-msg-role ' + role + '">' + roleLabel + '</span>';
        if (timeStr) html += '<span class="ap-msg-time">' + timeStr + '</span>';
        html += '</div>';
        html += '<div class="ap-msg-body">';

        if (msg.role === 'user') {
            html += '<p>' + escapeHtml(msg.content) + '</p>';
        } else {
            html += renderMarkdown(msg.content);
            if (msg.sources && msg.sources.length > 0) {
                var srcId = 'ap-src-' + Math.random().toString(36).substr(2, 6);
                html += '<div class="ap-sources">';
                html += '<button class="ap-sources-toggle" data-target="' + srcId + '">' +
                    msg.sources.length + ' source' + (msg.sources.length === 1 ? '' : 's') + ' &#9662;' +
                    '</button>';
                html += '<div class="ap-sources-list" id="' + srcId + '">';
                msg.sources.forEach(function(s) {
                    html += '<div class="ap-source-item">';
                    if (s.section || s.subsection) {
                        html += '<span class="ap-source-domain">' +
                            escapeHtml((s.section || '') + (s.subsection ? ' / ' + s.subsection : '')) +
                            '</span> ';
                    }
                    html += escapeHtml(s.content || '');
                    html += '</div>';
                });
                html += '</div>';
                html += '</div>';
            }
        }
        html += '</div>';
        html += '</div>';
    });

    messages.innerHTML = html;
    scrollToBottom();
    bindSourceToggles();
}

function bindSourceToggles() {
    messages.querySelectorAll('.ap-sources-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var target = document.getElementById(btn.getAttribute('data-target'));
            if (target) target.classList.toggle('open');
        });
    });
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function showTyping() {
    var el = document.createElement('div');
    el.className = 'ap-typing';
    el.id = 'apTypingIndicator';
    el.innerHTML =
        '<span class="ap-typing-label">ANALYST</span>' +
        '<div class="ap-typing-dots">' +
            '<div class="ap-typing-dot"></div>' +
            '<div class="ap-typing-dot"></div>' +
            '<div class="ap-typing-dot"></div>' +
        '</div>';
    messages.appendChild(el);
    scrollToBottom();
}

function hideTyping() {
    var el = document.getElementById('apTypingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    if (messages) messages.scrollTop = messages.scrollHeight;
}

// ============================================================
// SEND MESSAGE
// ============================================================

function sendMessage() {
    var question = input ? input.value.trim() : '';
    if (!question || isLoading) return;

    // Debounce: block sends within cooldown window
    var now = Date.now();
    if (now - _lastSendTime < SEND_COOLDOWN_MS) return;
    _lastSendTime = now;

    // Schedule cooldown reset so button re-enables after the window
    if (_cooldownTimer) clearTimeout(_cooldownTimer);
    _cooldownTimer = setTimeout(function() { updateSendButton(); }, SEND_COOLDOWN_MS);

    var ticker = currentTicker || (tickerSelect ? tickerSelect.value : '');

    // Thesis capture: infer bias from the question
    if (ticker) {
      var _inferredBias = inferBiasFromQuestion(question);
      if (_inferredBias && _inferredBias !== 'neutral') {
        recordSignal(ticker, _inferredBias);
        var _signalCount = getConsistentSignalCount(ticker, _inferredBias);
        var _confidence = _signalCount >= 3 ? 'high' : 'low';

        saveThesis({
          ticker: ticker,
          dominantHypothesis: null,
          probabilitySplit: null,
          biasDirection: _inferredBias,
          keyAssumption: null,
          source: 'inferred',
          confidence: _confidence,
          capturedAt: new Date().toISOString(),
          capturedFrom: 'chat'
        });
      }
    }

    if (!conversations[ticker]) conversations[ticker] = [];
    var convo = conversations[ticker];

    var now = Date.now();
    convo.push({ role: 'user', content: question, timestamp: now });
    try { sessionStorage.setItem('ci_conversations', JSON.stringify(conversations)); } catch(e) {}
    _persistMessage(ticker, 'user', question, null);
    if (input) { input.value = ''; input.style.height = 'auto'; }
    updateSendButton();
    renderConversation();
    showTyping();

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;

    // Build history (exclude the just-added user message)
    var history = convo.slice(0, -1).map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
    });

    if (isFile) {
        hideTyping();
        appendError('Chat requires the hosted version. Open via the Railway or GitHub Pages URL.');
        isLoading = false;
        updateSendButton();
        return;
    }

    var _fetchHeaders = { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY };
    var _fetchToken = window.CI_AUTH && window.CI_AUTH.getToken();
    if (_fetchToken) _fetchHeaders['Authorization'] = 'Bearer ' + _fetchToken;
    var _chatUrl = CHAT_API_BASE;
    if (!_fetchToken && window.CI_AUTH && window.CI_AUTH.getGuestId) {
        _chatUrl += '?guest_id=' + encodeURIComponent(window.CI_AUTH.getGuestId());
    }
    fetch(_chatUrl, {
        method: 'POST',
        headers: _fetchHeaders,
        body: JSON.stringify({
            ticker: ticker,
            question: question,
            conversation_history: history,
            conversation_id: dbConversationIds[ticker] || null
        })
    })
    .then(function(res) {
        if (!res.ok) {
            return res.text().then(function(body) {
                var detail = '';
                try { detail = JSON.parse(body).detail || ''; } catch(e) {}
                if (res.status === 502 && detail.indexOf('authentication_error') !== -1) {
                    throw new Error('API key error -- the server Anthropic key may be invalid.');
                }
                if (res.status === 502) {
                    throw new Error('The AI service returned an error. Please try again in a moment.');
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
            sources: data.sources || [],
            timestamp: Date.now()
        });
        try { sessionStorage.setItem('ci_conversations', JSON.stringify(conversations)); } catch(e) {}
        _persistMessage(ticker, 'assistant', data.response, data.sources || null);
        renderConversation();
    })
    .catch(function(err) {
        hideTyping();
        var msg = err.message || 'Something went wrong. Please try again.';
        if (msg === 'Failed to fetch') msg = 'Cannot reach the API. Check that the server is running.';
        appendError(msg);
    })
    .finally(function() {
        isLoading = false;
        updateSendButton();
    });
}

function appendError(msg) {
    var el = document.createElement('div');
    el.className = 'ap-error';
    el.textContent = msg;
    if (messages) {
        messages.appendChild(el);
        scrollToBottom();
    }
}

// ============================================================
// INPUT HELPERS
// ============================================================

function autoResize() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
}

function _isInCooldown() {
    return Date.now() - _lastSendTime < SEND_COOLDOWN_MS;
}

function updateSendButton() {
    if (!sendBtn || !input) return;
    var cooldown = _isInCooldown();
    sendBtn.disabled = !input.value.trim() || isLoading || cooldown;
    sendBtn.style.opacity = cooldown ? '0.4' : '';
}

// ============================================================
// OPEN / CLOSE
// ============================================================

function openPanel() {
    if (!panel) return;
    populateTickerSelect();

    panel.classList.add('ap-open');
    document.body.classList.add('analyst-panel-open');
    isOpen = true;
    if (fab) { fab.setAttribute('aria-expanded', 'true'); }
    if (collapseBtn) collapseBtn.setAttribute('aria-label', 'Collapse analyst panel');
    renderConversation();
    if (input) input.focus();
    console.log('[Analyst] Panel opened');
}

function closePanel() {
    if (!panel) return;
    panel.classList.remove('ap-open');
    document.body.classList.remove('analyst-panel-open');
    isOpen = false;
    if (fab) {
        fab.setAttribute('aria-expanded', 'false');
        fab.style.display = 'flex';
    }
    console.log('[Analyst] Panel closed');
}

function togglePanel() {
    if (isOpen) closePanel(); else openPanel();
}

// ============================================================
// CLEAR CONVERSATION
// ============================================================

function clearConversation() {
    conversations[currentTicker] = [];
    try { sessionStorage.setItem('ci_conversations', JSON.stringify(conversations)); } catch(e) {}
    renderWelcome();
}

// ============================================================
// CONVERSATION HISTORY
// ============================================================

var historyOverlay = null;

function _injectHistoryCSS() {
    if (document.getElementById('ap-history-css')) return;
    var style = document.createElement('style');
    style.id = 'ap-history-css';
    style.textContent =
        '.ap-history-btn{background:none;border:none;cursor:pointer;color:var(--text-secondary,#666);padding:4px;border-radius:4px;display:flex;align-items:center;justify-content:center;width:28px;height:28px}' +
        '.ap-history-btn:hover{color:var(--text-primary,#222);background:var(--bg-hover,rgba(0,0,0,.06))}' +
        '.ap-history-btn svg{width:16px;height:16px}' +
        '.ap-history-overlay{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg-primary,#fff);z-index:10;display:flex;flex-direction:column;overflow:hidden}' +
        '.ap-history-head{display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border,#e5e5e5)}' +
        '.ap-history-head h3{margin:0;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-primary,#222)}' +
        '.ap-history-close{background:none;border:none;cursor:pointer;font-size:18px;color:var(--text-secondary,#666);padding:2px 6px;border-radius:4px}' +
        '.ap-history-close:hover{background:var(--bg-hover,rgba(0,0,0,.06))}' +
        '.ap-history-list{flex:1;overflow-y:auto;padding:8px 0}' +
        '.ap-history-item{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--border-light,#f0f0f0)}' +
        '.ap-history-item:hover{background:var(--bg-hover,rgba(0,0,0,.04))}' +
        '.ap-history-ticker{font-weight:600;font-size:13px;color:var(--text-primary,#222);min-width:50px}' +
        '.ap-history-meta{font-size:11px;color:var(--text-secondary,#888);text-align:right}' +
        '.ap-history-meta span{display:block}' +
        '.ap-history-empty{text-align:center;padding:40px 16px;color:var(--text-secondary,#888);font-size:13px}';
    document.head.appendChild(style);
}

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

async function _fetchConversationList() {
    if (isFile) return [];
    var token = window.CI_AUTH && window.CI_AUTH.getToken();
    var guestId = window.CI_AUTH && window.CI_AUTH.getGuestId();
    if (!token && !guestId) return [];

    var headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    var url = apiOrigin + '/api/conversations' + (token ? '' : '?guest_id=' + encodeURIComponent(guestId));
    try {
        var res = await fetch(url, { headers: headers });
        if (!res.ok) return [];
        var data = await res.json();
        return data.conversations || [];
    } catch (e) {
        return [];
    }
}

function _closeHistory() {
    if (historyOverlay && historyOverlay.parentNode) {
        historyOverlay.parentNode.removeChild(historyOverlay);
    }
    historyOverlay = null;
}

async function openHistory() {
    _injectHistoryCSS();
    _closeHistory();

    historyOverlay = document.createElement('div');
    historyOverlay.className = 'ap-history-overlay';

    var head = document.createElement('div');
    head.className = 'ap-history-head';
    head.innerHTML = '<h3>History</h3><button class="ap-history-close" aria-label="Close history">&times;</button>';
    head.querySelector('.ap-history-close').addEventListener('click', _closeHistory);
    historyOverlay.appendChild(head);

    var listEl = document.createElement('div');
    listEl.className = 'ap-history-list';
    listEl.innerHTML = '<div class="ap-history-empty">Loading...</div>';
    historyOverlay.appendChild(listEl);

    panel.appendChild(historyOverlay);

    var convos = await _fetchConversationList();
    if (convos.length === 0) {
        listEl.innerHTML = '<div class="ap-history-empty">No conversation history yet</div>';
        return;
    }

    listEl.innerHTML = '';
    convos.forEach(function(c) {
        var item = document.createElement('div');
        item.className = 'ap-history-item';
        item.innerHTML =
            '<span class="ap-history-ticker">' + escapeHtml(c.ticker) + '</span>' +
            '<div class="ap-history-meta">' +
                '<span>' + c.message_count + ' message' + (c.message_count === 1 ? '' : 's') + '</span>' +
                '<span>' + _formatHistoryDate(c.updated_at || c.created_at) + '</span>' +
            '</div>';
        item.addEventListener('click', function() {
            _closeHistory();
            currentTicker = c.ticker;
            if (tickerSelect) tickerSelect.value = c.ticker;
            updateTickerBadge();
            _restoreFromDB(c.ticker).then(renderConversation);
        });
        listEl.appendChild(item);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function _setupListeners() {
    // FAB opens panel on mobile
    if (fab) {
        fab.addEventListener('click', function() { openPanel(); });
    }

    // Collapse/close button
    if (collapseBtn) {
        collapseBtn.addEventListener('click', function() {
            var isNowCollapsed = panel.classList.toggle('ap-user-collapsed');
            document.body.classList.toggle('ap-user-collapsed-active', isNowCollapsed);
            try { localStorage.setItem('ci_panel_collapsed', isNowCollapsed ? '1' : '0'); } catch(e) {}
            collapseBtn.style.transform = isNowCollapsed ? 'rotate(180deg)' : '';
        });
    }

    // History panel
    if (historyBtn) {
        historyBtn.addEventListener('click', openHistory);
    }

    // Clear conversation
    if (clearBtn) {
        clearBtn.addEventListener('click', clearConversation);
    }

    // Ticker select change
    if (tickerSelect) {
        tickerSelect.addEventListener('change', function() {
            currentTicker = tickerSelect.value;
            updateTickerBadge();
            renderConversation();
        });
    }

    // Input events
    if (input) {
        input.addEventListener('input', function() {
            autoResize();
            updateSendButton();
        });

        input.addEventListener('keydown', function(e) {
            // Cmd/Ctrl+Enter sends; plain Enter adds newline
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
        if (e.key === 'Escape' && isOpen && window.innerWidth < 1024) closePanel();
    });

    // Navigation: set coverage on stock pages, never clear it
    window.addEventListener('hashchange', function() {
        syncTickerFromRoute();
        _restoreFromDB(currentTicker).then(renderConversation);
    });

    // Handle viewport resize: auto-open at desktop, hide FAB
    window.addEventListener('resize', function() {
        if (window.innerWidth >= 1024) {
            if (!isOpen) openPanel();
            if (fab) fab.style.display = 'none';
        } else {
            if (fab) fab.style.display = isOpen ? 'none' : 'flex';
        }
    });
}

// ============================================================
// INIT
// ============================================================

export function initChat() {
    panel        = document.getElementById('analyst-panel');
    fab          = document.getElementById('apFab');
    collapseBtn  = document.getElementById('apCollapseBtn');
    clearBtn     = document.getElementById('apClearBtn');
    historyBtn   = document.getElementById('apHistoryBtn');
    messages     = document.getElementById('apMessages');
    input        = document.getElementById('apInput');
    sendBtn      = document.getElementById('apSend');
    tickerSelect = document.getElementById('apTickerSelect');
    tickerBadge  = document.getElementById('apTickerBadge');
    try {
        if (localStorage.getItem('ci_panel_collapsed') === '1' && panel) {
            panel.classList.add('ap-user-collapsed');
            document.body.classList.add('ap-user-collapsed-active');
            if (collapseBtn) collapseBtn.style.transform = 'rotate(180deg)';
        }
    } catch(e) {}

    if (!panel) {
        console.warn('[Analyst] #analyst-panel not found -- analyst panel disabled');
        return;
    }

    _setupListeners();
    populateTickerSelect();
    _restoreFromDB(currentTicker).then(renderConversation);

    // Auto-open at desktop widths; show FAB on mobile
    if (window.innerWidth >= 1024) {
        openPanel();
    } else {
        if (fab) fab.style.display = 'flex';
    }

    console.log('[Analyst] Initialised, panel', window.innerWidth >= 1024 ? 'open' : 'collapsed (mobile)');
}

// ============================================================
// EXPORTS (public API)
// ============================================================

export { openPanel as openChat, closePanel as closeChat };
