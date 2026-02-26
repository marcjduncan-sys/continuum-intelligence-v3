/**
 * chat.js -- Research Chat FAB Controller + Inline Research Chat
 *
 * Extracted from index.html lines ~12183-12784.
 * Contains both the floating chat panel (FAB) and the inline chat
 * widget embedded within report pages.
 *
 * Depends on:
 *   - window.STOCK_DATA (global)
 *   - window.marked (CDN)
 *   - window.DOMPurify (CDN)
 */

import { STOCK_DATA } from '../lib/state.js';

// ============================================================
// RESEARCH CHAT -- FAB Controller
// ============================================================

// --- Configuration ---
var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isFile  = window.location.protocol === 'file:';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin = window.CHAT_API_URL
    || (isFile ? '' // will trigger graceful error below
        : isGitHubPages ? PRODUCTION_API
        : '');  // Same origin (Vite proxy in dev, Railway in prod)
var CHAT_API_BASE = apiOrigin + '/api/research-chat';

// --- Shared system prompt (used by FAB, inline, and thesis chat) ---
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

// --- DOM refs ---
var fab       = document.getElementById('chatFab');
var panel     = document.getElementById('chatPanel');
var closeBtn  = document.getElementById('chatClose');
var messages  = document.getElementById('chatMessages');
var input     = document.getElementById('chatInput');
var sendBtn   = document.getElementById('chatSend');
var select    = document.getElementById('chatTickerSelect');
var subtitle  = document.getElementById('chatSubtitle');

// --- State ---
var isOpen          = false;
var isLoading       = false;
var conversations   = {};   // { ticker: [ {role, content}, ... ] }
var currentTicker   = '';

// --- Populate ticker dropdown ---
function populateTickerSelect() {
    var tickers = Object.keys(STOCK_DATA).sort();
    select.innerHTML = '';
    tickers.forEach(function(t) {
        var opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t + '  --  ' + STOCK_DATA[t].company;
        select.appendChild(opt);
    });
    // Try to detect current ticker from route
    var hash = window.location.hash.slice(1) || '';
    var detected = '';
    if (hash.startsWith('report-')) detected = hash.replace('report-', '').toUpperCase();
    if (hash.startsWith('snapshot-')) detected = hash.replace('snapshot-', '').toUpperCase();
    if (detected && STOCK_DATA[detected]) {
        select.value = detected;
    }
    currentTicker = select.value;
}

// --- Suggestions per stock ---
function getSuggestions(ticker) {
    return [
        'What is the bull case for ' + ticker + '?',
        'What are the key risks?',
        'Summarise the competing hypotheses',
        'What catalysts should I watch?'
    ];
}

// --- Render welcome state ---
function renderWelcome() {
    var ticker = currentTicker;
    var company = STOCK_DATA[ticker] ? STOCK_DATA[ticker].company : ticker;
    var html =
        '<div class="chat-welcome">' +
            '<div class="chat-welcome-icon">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>' +
                '</svg>' +
            '</div>' +
            '<div class="chat-welcome-title">Research Chat</div>' +
            '<div class="chat-welcome-text">Ask questions about <strong>' + company + '</strong> grounded in our structured research data.</div>' +
            '<div class="chat-suggestions">' +
                getSuggestions(ticker).map(function(s) {
                    return '<button class="chat-suggestion-btn" data-q="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>';
                }).join('') +
            '</div>' +
        '</div>';
    messages.innerHTML = html;

    // Bind suggestion clicks
    messages.querySelectorAll('.chat-suggestion-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            input.value = btn.getAttribute('data-q');
            sendMessage();
        });
    });
}

// --- Render conversation ---
function renderConversation() {
    var convo = conversations[currentTicker] || [];
    if (convo.length === 0) {
        renderWelcome();
        return;
    }

    var html = '';
    convo.forEach(function(msg) {
        if (msg.role === 'user') {
            html += '<div class="chat-msg user">' + escapeHtml(msg.content) + '</div>';
        } else {
            html += '<div class="chat-msg assistant">' + renderMarkdown(msg.content);
            if (msg.sources && msg.sources.length > 0) {
                var id = 'src-' + Math.random().toString(36).substr(2, 6);
                html += '<button class="chat-sources-toggle" data-target="' + id + '">' +
                    msg.sources.length + ' source' + (msg.sources.length === 1 ? '' : 's') + ' &#9662;</button>';
                html += '<div class="chat-sources-list" id="' + id + '">';
                msg.sources.forEach(function(s) {
                    html += '<div class="chat-source-item">' +
                        '<span class="cs-label">' + escapeHtml(s.section) + ' / ' + escapeHtml(s.subsection) + '</span>' +
                        escapeHtml(s.content) +
                    '</div>';
                });
                html += '</div>';
            }
            html += '</div>';
        }
    });
    messages.innerHTML = html;
    scrollToBottom();
    bindSourceToggles();
}

// --- Bind source toggle buttons ---
function bindSourceToggles() {
    messages.querySelectorAll('.chat-sources-toggle').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var target = document.getElementById(btn.getAttribute('data-target'));
            if (target) target.classList.toggle('open');
        });
    });
}

// --- Simple markdown renderer ---
function renderMarkdown(text) {
    // If marked + DOMPurify available, use them for richer rendering
    if (typeof window.marked !== 'undefined' && window.marked.parse && typeof window.DOMPurify !== 'undefined') {
        return window.DOMPurify.sanitize(window.marked.parse(text));
    }
    // Escape HTML first, then apply markdown
    var html = escapeHtml(text);
    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Headers (### and ####)
    html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    // Unordered list items
    html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    // Wrap consecutive <li> in <ul>
    html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
    // Paragraphs: split on double newline
    html = html.split(/\n{2,}/).map(function(block) {
        block = block.trim();
        if (!block) return '';
        // Don't wrap if already a block element
        if (/^<(ul|ol|h[1-6]|div|blockquote)/.test(block)) return block;
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('');
    return html;
}

function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// --- Typing indicator ---
function showTyping() {
    var el = document.createElement('div');
    el.className = 'chat-typing';
    el.id = 'chatTypingIndicator';
    el.innerHTML = '<div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div>';
    messages.appendChild(el);
    scrollToBottom();
}
function hideTyping() {
    var el = document.getElementById('chatTypingIndicator');
    if (el) el.remove();
}

// --- Scroll helpers ---
function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
}

// --- Send message ---
function sendMessage() {
    var question = input.value.trim();
    if (!question || isLoading || !currentTicker) return;

    // Init conversation array for this ticker if needed
    if (!conversations[currentTicker]) {
        conversations[currentTicker] = [];
    }
    var convo = conversations[currentTicker];

    // Add user message
    convo.push({ role: 'user', content: question });
    input.value = '';
    input.style.height = 'auto';
    updateSendButton();
    renderConversation();
    showTyping();

    isLoading = true;
    sendBtn.disabled = true;

    // Build conversation history (exclude current message)
    var history = convo.slice(0, -1).map(function(m) {
        return { role: m.role, content: m.content };
    });

    // Guard: file:// protocol cannot reach the API
    if (isFile) {
        hideTyping();
        var errorEl = document.createElement('div');
        errorEl.className = 'chat-error';
        errorEl.textContent = 'Chat requires the hosted version. Open the Railway / Render URL instead of a local file.';
        messages.appendChild(errorEl);
        scrollToBottom();
        isLoading = false;
        updateSendButton();
        return;
    }

    // API call
    fetch(CHAT_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            ticker: currentTicker,
            question: question,
            conversation_history: history,
            system_prompt: ANALYST_SYSTEM_PROMPT
        })
    })
    .then(function(res) {
        if (!res.ok) {
            return res.text().then(function(body) {
                var detail = '';
                try {
                    var parsed = JSON.parse(body);
                    detail = parsed.detail || '';
                } catch(e) { /* non-JSON response */ }

                if (res.status === 502 && detail.indexOf('authentication_error') !== -1) {
                    throw new Error('API key error  --  the server\'s Anthropic key may be invalid. Check the ANTHROPIC_API_KEY environment variable.');
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
            sources: data.sources || []
        });
        renderConversation();
    })
    .catch(function(err) {
        hideTyping();
        var msg = err.message || 'Something went wrong. Please try again.';
        if (msg === 'Failed to fetch') {
            msg = 'Cannot reach the API. Check that the server is running and accessible.';
        }
        var errorEl = document.createElement('div');
        errorEl.className = 'chat-error';
        errorEl.textContent = msg;
        messages.appendChild(errorEl);
        scrollToBottom();
    })
    .finally(function() {
        isLoading = false;
        updateSendButton();
    });
}

// --- Auto-resize textarea ---
function autoResize() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

// --- Enable/disable send button ---
function updateSendButton() {
    sendBtn.disabled = !input.value.trim() || isLoading;
}

// --- Open/Close ---
function openChat() {
    populateTickerSelect();
    panel.classList.add('open');
    fab.classList.add('hidden');
    fab.setAttribute('aria-expanded', 'true');
    isOpen = true;
    renderConversation();
    input.focus();
    updateSubtitle();
}
function closeChat() {
    panel.classList.remove('open');
    fab.classList.remove('hidden');
    fab.setAttribute('aria-expanded', 'false');
    isOpen = false;
    fab.focus(); // Return focus to FAB on close
}

function updateSubtitle() {
    var company = STOCK_DATA[currentTicker] ? STOCK_DATA[currentTicker].company : currentTicker;
    subtitle.textContent = company;
}

// --- Event listeners ---
fab.addEventListener('click', openChat);
closeBtn.addEventListener('click', closeChat);

input.addEventListener('input', function() {
    autoResize();
    updateSendButton();
});
input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

sendBtn.addEventListener('click', sendMessage);

select.addEventListener('change', function() {
    currentTicker = select.value;
    renderConversation();
    updateSubtitle();
});

// Sync ticker when navigating to a report page
window.addEventListener('hashchange', function() {
    if (!isOpen) return;
    var hash = window.location.hash.slice(1) || '';
    var detected = '';
    if (hash.startsWith('report-')) detected = hash.replace('report-', '').toUpperCase();
    if (hash.startsWith('snapshot-')) detected = hash.replace('snapshot-', '').toUpperCase();
    if (detected && STOCK_DATA[detected] && detected !== currentTicker) {
        select.value = detected;
        currentTicker = detected;
        renderConversation();
        updateSubtitle();
    }
});

// Close on Escape
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) closeChat();
});


// ============================================================
// INLINE RESEARCH CHAT (within report pages)
// ============================================================

var INLINE_API_BASE = (function() {
    var PRODUCTION_API_INLINE = 'https://imaginative-vision-production-16cb.up.railway.app';
    var isLocalInline = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    var isGitHubPagesInline = window.location.hostname.indexOf('github.io') !== -1;
    var origin = window.CHAT_API_URL
        || (isLocalInline ? ''
            : isGitHubPagesInline ? PRODUCTION_API_INLINE
            : '');
    return origin + '/api/research-chat';
})();

var inlineConversations = {};
var inlineLoading = {};

function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMd(text) {
    if (typeof window.marked !== 'undefined' && window.marked.parse) {
        var raw = window.marked.parse(text);
        // Sanitize to prevent XSS from AI responses or compromised backend
        if (typeof window.DOMPurify !== 'undefined') return window.DOMPurify.sanitize(raw);
        return raw;
    }
    // Fallback if marked.js hasn't loaded
    return escHtml(text).replace(/\n/g, '<br>');
}

function getInlineSuggestions(ticker) {
    return [
        'What is the bull case for ' + ticker + '?',
        'What are the key risks?',
        'Summarise the competing hypotheses',
        'What catalysts should I watch?'
    ];
}

function renderInlineMessages(ticker) {
    var el = document.getElementById('chat-inline-' + ticker);
    if (!el) return;
    var convo = inlineConversations[ticker] || [];
    if (convo.length === 0) {
        var company = STOCK_DATA[ticker] ? STOCK_DATA[ticker].company : ticker;
        var sugs = getInlineSuggestions(ticker);
        el.innerHTML =
            '<div class="chat-inline-welcome">' +
              '<p>Ask questions about <strong>' + company + '</strong> grounded in structured research data.</p>' +
              '<div class="chat-inline-suggestions">' +
                sugs.map(function(s) {
                    return '<button class="chat-inline-suggestion" data-q="' + s.replace(/"/g, '&quot;') + '">' + s + '</button>';
                }).join('') +
              '</div>' +
            '</div>';
        return;
    }
    var html = '';
    convo.forEach(function(msg) {
        if (msg.role === 'user') {
            html += '<div class="chat-msg user">' + escHtml(msg.content) + '</div>';
        } else {
            html += '<div class="chat-msg assistant">' + renderMd(msg.content) + '</div>';
        }
    });
    el.innerHTML = html;
    el.scrollTop = el.scrollHeight;
}

function sendInlineMessage(ticker, question) {
    if (!question || inlineLoading[ticker]) return;
    if (!inlineConversations[ticker]) inlineConversations[ticker] = [];
    var convo = inlineConversations[ticker];
    convo.push({ role: 'user', content: question });
    renderInlineMessages(ticker);
    inlineLoading[ticker] = true;

    // Show typing indicator
    var el = document.getElementById('chat-inline-' + ticker);
    if (el) {
        var typing = document.createElement('div');
        typing.className = 'chat-typing';
        typing.id = 'inline-typing-' + ticker;
        typing.innerHTML = '<div class="chat-typing-dot"></div><div class="chat-typing-dot"></div><div class="chat-typing-dot"></div>';
        el.appendChild(typing);
        el.scrollTop = el.scrollHeight;
    }

    // Disable send button
    var container = document.querySelector('.chat-inline[data-ticker="' + ticker + '"]');
    var inlineSendBtn = container ? container.querySelector('.chat-inline-send') : null;
    if (inlineSendBtn) inlineSendBtn.disabled = true;

    var history = convo.slice(0, -1).map(function(m) {
        return { role: m.role, content: m.content };
    });

    fetch(INLINE_API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: ticker, question: question, conversation_history: history, system_prompt: ANALYST_SYSTEM_PROMPT })
    })
    .then(function(res) {
        if (!res.ok) throw new Error('Request failed (' + res.status + ')');
        return res.json();
    })
    .then(function(data) {
        var t = document.getElementById('inline-typing-' + ticker);
        if (t) t.remove();
        convo.push({ role: 'assistant', content: data.response });
        renderInlineMessages(ticker);
    })
    .catch(function(err) {
        var t = document.getElementById('inline-typing-' + ticker);
        if (t) t.remove();
        if (el) {
            var errEl = document.createElement('div');
            errEl.className = 'chat-error';
            errEl.textContent = err.message || 'Something went wrong.';
            el.appendChild(errEl);
            el.scrollTop = el.scrollHeight;
        }
    })
    .finally(function() {
        inlineLoading[ticker] = false;
        if (inlineSendBtn) {
            var inp = container ? container.querySelector('.chat-inline-input') : null;
            inlineSendBtn.disabled = !(inp && inp.value.trim());
        }
    });
}

// Event delegation for inline chat
document.addEventListener('click', function(e) {
    // Suggestion button click
    var sugBtn = e.target.closest('.chat-inline-suggestion');
    if (sugBtn) {
        var sugContainer = sugBtn.closest('.chat-inline');
        if (sugContainer) {
            var ticker = sugContainer.getAttribute('data-ticker');
            var q = sugBtn.getAttribute('data-q');
            var inp = sugContainer.querySelector('.chat-inline-input');
            if (inp) inp.value = '';
            sendInlineMessage(ticker, q);
        }
        return;
    }

    // Send button click
    var clickedSendBtn = e.target.closest('.chat-inline-send');
    if (clickedSendBtn) {
        var sendContainer = clickedSendBtn.closest('.chat-inline');
        if (sendContainer) {
            var sendTicker = sendContainer.getAttribute('data-ticker');
            var sendInp = sendContainer.querySelector('.chat-inline-input');
            if (sendInp && sendInp.value.trim()) {
                sendInlineMessage(sendTicker, sendInp.value.trim());
                sendInp.value = '';
                sendInp.style.height = 'auto';
                clickedSendBtn.disabled = true;
            }
        }
        return;
    }
});

// Handle input and enter key via delegation
document.addEventListener('input', function(e) {
    if (e.target.classList.contains('chat-inline-input')) {
        var inputContainer = e.target.closest('.chat-inline');
        if (inputContainer) {
            var inputSendBtn = inputContainer.querySelector('.chat-inline-send');
            if (inputSendBtn) inputSendBtn.disabled = !e.target.value.trim();
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
        }
    }
});

document.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('chat-inline-input') && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        var keyContainer = e.target.closest('.chat-inline');
        if (keyContainer) {
            var keyTicker = keyContainer.getAttribute('data-ticker');
            if (e.target.value.trim()) {
                sendInlineMessage(keyTicker, e.target.value.trim());
                e.target.value = '';
                e.target.style.height = 'auto';
                var keySendBtn = keyContainer.querySelector('.chat-inline-send');
                if (keySendBtn) keySendBtn.disabled = true;
            }
        }
    }
});

// Initialize welcome state for any already-rendered inline chats
document.querySelectorAll('.chat-inline').forEach(function(container) {
    var ticker = container.getAttribute('data-ticker');
    if (ticker) renderInlineMessages(ticker);
});

// Expose for dynamic page renders
window.initInlineChat = function(ticker) {
    renderInlineMessages(ticker);
};

// ============================================================
// EXPORTS
// ============================================================

export function initChat(ticker) {
    if (ticker && STOCK_DATA[ticker]) {
        currentTicker = ticker;
        if (select) select.value = ticker;
    }
    populateTickerSelect();
    renderConversation();
    updateSubtitle();
}

export { openChat, closeChat };
