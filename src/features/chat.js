/**
 * chat.js -- Persistent Analyst Panel
 *
 * Docked right-rail panel that persists across all page navigation.
 * Replaces FAB popup and inline report chat.
 *
 * Depends on:
 *   - window.STOCK_DATA (global, via state.js)
 *   - window.marked (CDN)
 *   - window.DOMPurify (CDN)
 *   - window.pnBuildSystemPrompt (classic script js/personalisation.js)
 */

import { STOCK_DATA } from '../lib/state.js';

// ============================================================
// CONFIGURATION
// ============================================================

var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal       = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile        = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin     = window.CHAT_API_URL
    || (isFile        ? ''
        : isGitHubPages ? PRODUCTION_API
        : '');
var CHAT_API_BASE = apiOrigin + '/api/research-chat';
var CI_API_KEY    = window.CI_API_KEY || '';

// ============================================================
// SYSTEM PROMPT (shared, used by thesis comparator and fallback)
// ============================================================

export var ANALYST_SYSTEM_PROMPT = 'You are a senior equity research analyst at Continuum Intelligence. You speak in the first person plural ("we", "our analysis", "our framework"). You are direct, precise, and opinionated -- like a fund manager talking to another fund manager. ' +
    'VOICE RULES: ' +
    'Never use markdown headers (#, ##, ###). Write in flowing paragraphs. ' +
    'Never use bullet point dashes or asterisks for lists. Weave points into natural sentences. ' +
    'Never begin a response with "Based on" or "Here is" or "Sure" or "Great question". ' +
    'Never say "I" -- always "we" or speak in the declarative. ' +
    'Never use em-dashes. Use commas, colons, or full stops instead. ' +
    'Never use exclamation marks or rhetorical questions. ' +
    'Never use filler phrases: "It\'s important to note", "Notably", "Importantly", "Interestingly", "In terms of", "It is worth mentioning". ' +
    'Never use weak openings: "It is...", "There are...", "This is...". ' +
    'When presenting numbers, weave them into sentences: "At 25x forward earnings on consensus EPS of $1.34, you get to $33.40, roughly 5% above the current print" NOT "Forward EPS: A$1.336, multiplied by 25 = A$33.40". ' +
    'Reference specific evidence items and hypothesis labels naturally: "The N2 erosion thesis is gaining weight here, margins are the tell." ' +
    'Be opinionated. Take positions. "We think the market is wrong about X" is better than "There are arguments on both sides." ' +
    'Use the vocabulary of an institutional investor: "the print", "the tape", "the multiple", "re-rate", "de-rate", "the street", "consensus", "buy-side", "the name". ' +
    'Ground every claim in the provided research passages. Cite specific evidence. ' +
    'Never fabricate data, price targets, or financial metrics not in the provided research. ' +
    'If asked about a topic not covered in the research passages, say so directly.';

// ============================================================
// PERSONALISATION INTEGRATION
// ============================================================

function loadPersonalisationProfile() {
    try {
        var raw = localStorage.getItem('continuum_personalisation_profile');
        if (!raw) return null;
        var data = JSON.parse(raw);
        return (data && data.state && data.state.profile) ? data.state : null;
    } catch (e) {
        return null;
    }
}

function buildEffectiveSystemPrompt() {
    var pnState = loadPersonalisationProfile();
    if (pnState && typeof window.pnBuildSystemPrompt === 'function') {
        try {
            return window.pnBuildSystemPrompt(
                pnState.profile,
                pnState.firm,
                pnState.fund,
                pnState.portfolio || []
            );
        } catch (e) {
            console.warn('[Analyst] pnBuildSystemPrompt threw:', e);
        }
    }
    return ANALYST_SYSTEM_PROMPT;
}


// ============================================================
// DOM REFS
// ============================================================

var panel        = document.getElementById('analyst-panel');
var fab          = document.getElementById('apFab');
var collapseBtn  = document.getElementById('apCollapseBtn');
var clearBtn     = document.getElementById('apClearBtn');
var messages     = document.getElementById('apMessages');
var input        = document.getElementById('apInput');
var sendBtn      = document.getElementById('apSend');
var tickerSelect = document.getElementById('apTickerSelect');
var tickerBadge  = document.getElementById('apTickerBadge');

// ============================================================
// STATE
// ============================================================

var isOpen        = false;
var isLoading     = false;
var conversations = {};   // { ticker: [ {role, content, sources?, timestamp?}, ... ] }
var currentTicker = '';

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

var _tickerFromRoute = false; // true when currentTicker was auto-set from URL, not by user

function syncTickerFromRoute() {
    var hash = window.location.hash.slice(1) || '';
    var detected = '';
    if (hash.startsWith('report-'))   detected = hash.replace('report-', '').toUpperCase();
    if (hash.startsWith('snapshot-')) detected = hash.replace('snapshot-', '').toUpperCase();
    if (detected && STOCK_DATA[detected]) {
        if (tickerSelect) tickerSelect.value = detected;
        currentTicker = detected;
        _tickerFromRoute = true;
    } else {
        // Only clear if the ticker was auto-set by a route (not manually chosen by user)
        if (_tickerFromRoute) {
            if (tickerSelect) tickerSelect.value = '';
            currentTicker = '';
        }
        _tickerFromRoute = false;
    }
    updateTickerBadge();
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
    if (typeof window.marked !== 'undefined' && window.marked.parse && typeof window.DOMPurify !== 'undefined') {
        return window.DOMPurify.sanitize(window.marked.parse(text));
    }
    var html = escapeHtml(text);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    html = html.split(/\n{2,}/).map(function(block) {
        block = block.trim();
        if (!block) return '';
        if (/^<(ul|ol|h[1-6]|div|blockquote)/.test(block)) return block;
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return html;
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

    var ticker = currentTicker || (tickerSelect ? tickerSelect.value : '');

    if (!conversations[ticker]) conversations[ticker] = [];
    var convo = conversations[ticker];

    var now = Date.now();
    convo.push({ role: 'user', content: question, timestamp: now });
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

    // Always read personalisation fresh from localStorage on each send
    var systemPrompt = buildEffectiveSystemPrompt();

    fetch(CHAT_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY },
        body: JSON.stringify({
            ticker: ticker,
            question: question,
            conversation_history: history,
            system_prompt: systemPrompt
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

function updateSendButton() {
    if (!sendBtn || !input) return;
    sendBtn.disabled = !input.value.trim() || isLoading;
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
        if (window.innerWidth < 1024) fab.style.display = 'flex';
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
    renderWelcome();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

if (panel) {
    // FAB opens panel on mobile
    if (fab) {
        fab.addEventListener('click', function() { openPanel(); });
    }

    // Collapse/close button
    if (collapseBtn) {
        collapseBtn.addEventListener('click', closePanel);
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

    // Sync ticker on route change (always, panel stays open)
    window.addEventListener('hashchange', function() {
        syncTickerFromRoute();
        updateTickerBadge();
        // Rebuild conversation view if ticker changed
        renderConversation();
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
    if (!panel) {
        console.warn('[Analyst] #analyst-panel not found -- analyst panel disabled');
        return;
    }

    populateTickerSelect();


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
