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

// ============================================================
// CONFIGURATION
// ============================================================

var isFile        = window.location.protocol === 'file:';
var apiOrigin     = API_BASE;
var PM_API_BASE   = apiOrigin + '/api/pm-chat';
var CI_API_KEY    = window.CI_API_KEY || '';

// ============================================================
// DOM REFS
// ============================================================

var panel, fab, collapseBtn, clearBtn, messagesEl, inputEl, sendBtn, portfolioBadge;

// ============================================================
// STATE
// ============================================================

var isOpen        = false;
var isLoading     = false;
var _lastSendTime = 0;
var _cooldownTimer = null;
var SEND_COOLDOWN_MS = 2000;
var _lastBreaches = [];
var _lastAlignmentScore = null;
var _lastNotCoveredCount = null;
var _pmConversationId = null;  // Phase E: persisted PM conversation ID
var conversations = (function() {
    try {
        var saved = sessionStorage.getItem('ci_pm_conversations');
        return saved ? JSON.parse(saved) : {};
    } catch(e) {
        return {};
    }
}());
var currentPortfolioKey = '_default';

// ============================================================
// RAIL MODE SWITCH
// ============================================================

var _analystPanel  = null;
var _modeSwitches  = [];   // all mode-switch containers (analyst + pm header)
var _currentMode   = 'analyst'; // 'analyst' | 'pm'

function _getRailMode() { return _currentMode; }

function _syncAllModeSwitches(mode) {
    _modeSwitches.forEach(function(sw) {
        sw.querySelectorAll('.rail-mode-btn').forEach(function(btn) {
            var isActive = btn.getAttribute('data-mode') === mode;
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

    if (mode === 'analyst') {
        // Show analyst, hide PM
        if (_analystPanel) {
            _analystPanel.style.display = '';
            _analystPanel.classList.add('ap-open');
        }
        if (panel) {
            panel.classList.remove('pm-open');
            panel.style.display = 'none';
        }
        document.body.classList.add('analyst-panel-open');
        // Show PM FAB on mobile when analyst is active (allows quick switch)
        if (fab) fab.style.display = window.innerWidth < 1024 ? '' : 'none';
    } else {
        // Show PM, hide analyst
        if (_analystPanel) {
            _analystPanel.classList.remove('ap-open');
            _analystPanel.style.display = 'none';
        }
        if (panel) {
            panel.style.display = '';
            panel.classList.add('pm-open');
        }
        document.body.classList.add('analyst-panel-open');
        if (fab) fab.style.display = 'none';
        renderConversation();
        if (inputEl) inputEl.focus();
    }

    try { localStorage.setItem('ci_rail_mode', mode); } catch(e) {}
    console.log('[PM] Rail mode switched to', mode);
}

function _createModeSwitch(activeMode) {
    var sw = document.createElement('div');
    sw.className = 'rail-mode-switch';
    sw.setAttribute('role', 'tablist');
    sw.setAttribute('aria-label', 'Panel mode');
    sw.innerHTML =
        '<button class="rail-mode-btn" data-mode="analyst" role="tab">Analyst</button>' +
        '<button class="rail-mode-btn" data-mode="pm" role="tab">PM</button>';

    // Set initial active state
    sw.querySelectorAll('.rail-mode-btn').forEach(function(btn) {
        var isActive = btn.getAttribute('data-mode') === activeMode;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Click handler
    sw.addEventListener('click', function(e) {
        var btn = e.target.closest('.rail-mode-btn');
        if (!btn) return;
        switchRailMode(btn.getAttribute('data-mode'));
    });

    // Keyboard: arrow keys move between tabs (ARIA tablist pattern)
    sw.addEventListener('keydown', function(e) {
        var btns = Array.from(sw.querySelectorAll('.rail-mode-btn'));
        var idx  = btns.indexOf(document.activeElement);
        if (idx < 0) return;

        var next = -1;
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
    if (!_analystPanel) return;

    // Inject into analyst header
    var apHeader = _analystPanel.querySelector('.ap-header');
    if (apHeader) {
        var apHeaderLeft = apHeader.querySelector('.ap-header-left');
        if (apHeaderLeft) {
            var analystSw = _createModeSwitch('analyst');
            apHeader.insertBefore(analystSw, apHeaderLeft.nextSibling);
        }
    }

    // Inject into PM header
    var pmHeader = panel ? panel.querySelector('.pm-header') : null;
    if (pmHeader) {
        var pmHeaderLeft = pmHeader.querySelector('.pm-header-left');
        if (pmHeaderLeft) {
            var pmSw = _createModeSwitch('pm');
            pmHeader.insertBefore(pmSw, pmHeaderLeft.nextSibling);
        }
    }
}

// ============================================================
// SUGGESTIONS
// ============================================================

var PM_SUGGESTIONS = [
    'Am I too concentrated?',
    'What should fund a new position?',
    'What are my top three portfolio actions?',
    'Should I trim my largest holding?'
];

// Phase F: Track the ticker the user last referenced from Analyst handoff
var _lastHandoffTicker = null;

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

// ============================================================
// RECOMMENDATION CARD RENDERER
// ============================================================

var _ACTION_COLORS = {
    'add':       { bg: 'rgba(76,175,80,0.08)',  border: 'rgba(76,175,80,0.3)',  label: '#4CAF50' },
    'trim':      { bg: 'rgba(255,152,0,0.08)',  border: 'rgba(255,152,0,0.3)',  label: '#FF9800' },
    'exit':      { bg: 'rgba(244,67,54,0.08)',   border: 'rgba(244,67,54,0.3)',  label: '#F44336' },
    'hold':      { bg: 'rgba(33,150,243,0.08)',  border: 'rgba(33,150,243,0.3)', label: '#2196F3' },
    'watch':     { bg: 'rgba(156,39,176,0.08)',  border: 'rgba(156,39,176,0.3)', label: '#9C27B0' },
    'rebalance': { bg: 'rgba(0,150,136,0.08)',   border: 'rgba(0,150,136,0.3)',  label: '#009688' },
    'no action': { bg: 'rgba(158,158,158,0.08)', border: 'rgba(158,158,158,0.3)', label: '#9E9E9E' },
};

function _renderRecommendationCard(action, fields) {
    var actionLower = (action || '').toLowerCase().trim();
    var colors = _ACTION_COLORS[actionLower] || _ACTION_COLORS['hold'];

    var html = '<div class="pm-rec-card" style="' +
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
    var fieldOrder = ['rationale', 'portfolio_effect', 'risks_tradeoffs', 'data_basis', 'confidence'];
    var fieldLabels = {
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
    var schemaKeys = ['action', 'security', 'sizing_band', 'sizing band',
                      'rationale', 'portfolio_effect', 'portfolio effect',
                      'risks_tradeoffs', 'risks/trade-offs', 'risks / trade-offs',
                      'data_basis', 'data basis', 'confidence'];

    // Try to find recommendation blocks delimited by field patterns
    var blockPattern = /\*\*(?:action|recommendation)\*\*\s*[:]\s*(.+?)(?=\n\*\*(?:action|recommendation)\*\*|\n#{1,3}\s|$)/gis;
    var blocks = [];
    var match;

    // Simpler approach: find lines that look like "**Field**: Value" grouped together
    var lines = text.split('\n');
    var currentBlock = null;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        var fieldMatch = line.match(/^\*\*(.+?)\*\*\s*[:]\s*(.+)/);
        if (fieldMatch) {
            var key = fieldMatch[1].toLowerCase().trim();
            var val = fieldMatch[2].trim();

            // Normalise key names
            var normKey = key
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
    var blocks = _parseRecommendationBlocks(text);
    if (blocks.length > 0) {
        // Render recommendation cards, plus any non-card text as markdown
        var cardHtml = blocks.map(function(b) {
            return _renderRecommendationCard(b.action, b);
        }).join('');

        // Also render the full text as markdown for any narrative content
        var fullHtml = DOMPurify.sanitize(marked.parse(text));

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
    var container = panel ? panel.querySelector('.pm-mandate-status') : null;
    if (!container) {
        // Create the container if it doesn't exist
        if (!panel) return;
        container = document.createElement('div');
        container.className = 'pm-mandate-status';
        var messagesParent = messagesEl ? messagesEl.parentNode : null;
        if (messagesParent && messagesEl) {
            messagesParent.insertBefore(container, messagesEl);
        }
    }

    var parts = [];

    // Alignment score
    if (_lastAlignmentScore !== null && _lastAlignmentScore !== undefined) {
        var pct = Math.round(_lastAlignmentScore * 100);
        var scoreClass = pct >= 70 ? 'good' : pct >= 40 ? 'mixed' : 'poor';
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
        var critCount = 0;
        var warnCount = 0;
        _lastBreaches.forEach(function(b) {
            if (b.severity === 'critical') critCount++;
            else warnCount++;
        });
        var breachLabel = '';
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
    var html =
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
    var convo = conversations[currentPortfolioKey] || [];
    if (convo.length === 0) {
        renderWelcome();
        return;
    }

    var html = '';
    convo.forEach(function(msg) {
        var role      = msg.role === 'user' ? 'user' : 'pm';
        var roleLabel = msg.role === 'user' ? 'YOU' : 'PM';
        var timeStr   = formatTime(msg.timestamp);

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
            var t = btn.getAttribute('data-ticker');
            if (t) viewAnalystSummary(t);
        });
    });
}

// ============================================================
// TYPING INDICATOR
// ============================================================

function showTyping() {
    var el = document.createElement('div');
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
    var el = document.getElementById('pmTypingIndicator');
    if (el) el.remove();
}

function scrollToBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ============================================================
// SEND MESSAGE
// ============================================================

function sendMessage() {
    var question = inputEl ? inputEl.value.trim() : '';
    if (!question || isLoading) return;

    var now = Date.now();
    if (now - _lastSendTime < SEND_COOLDOWN_MS) return;
    _lastSendTime = now;

    if (_cooldownTimer) clearTimeout(_cooldownTimer);
    _cooldownTimer = setTimeout(function() { updateSendButton(); }, SEND_COOLDOWN_MS);

    if (!conversations[currentPortfolioKey]) conversations[currentPortfolioKey] = [];
    var convo = conversations[currentPortfolioKey];

    convo.push({ role: 'user', content: question, timestamp: now });
    try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) {}
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }
    updateSendButton();
    renderConversation();
    showTyping();

    isLoading = true;
    if (sendBtn) sendBtn.disabled = true;

    // Build history
    var history = convo.slice(0, -1).map(function(m) {
        return { role: m.role === 'user' ? 'user' : 'assistant', content: m.content };
    });

    if (isFile) {
        hideTyping();
        appendError('PM Chat requires the hosted version. Open via the GitHub Pages or custom domain URL.');
        isLoading = false;
        updateSendButton();
        return;
    }

    var _fetchHeaders = { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY };
    var _fetchToken = window.CI_AUTH && window.CI_AUTH.getToken();
    if (_fetchToken) _fetchHeaders['Authorization'] = 'Bearer ' + _fetchToken;
    var _chatUrl = PM_API_BASE;
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
                var detail = '';
                try { detail = JSON.parse(body).detail || ''; } catch(e) {}
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
        try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) {}

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
        var msg = err.message || 'Something went wrong. Please try again.';
        if (msg === 'Failed to fetch') msg = 'Cannot reach the PM API. Check that the server is running.';
        appendError(msg);
    })
    .finally(function() {
        isLoading = false;
        updateSendButton();
    });
}

function appendError(msg) {
    var el = document.createElement('div');
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
    var cooldown = _isInCooldown();
    sendBtn.disabled = !inputEl.value.trim() || isLoading || cooldown;
    sendBtn.style.opacity = cooldown ? '0.4' : '';
}

// ============================================================
// CLEAR CONVERSATION
// ============================================================

function clearConversation() {
    conversations[currentPortfolioKey] = [];
    _pmConversationId = null;  // Phase E: reset persisted conversation
    try { sessionStorage.setItem('ci_pm_conversations', JSON.stringify(conversations)); } catch(e) {}
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
        var savedMode = localStorage.getItem('ci_rail_mode');
        if (savedMode === 'pm') {
            switchRailMode('pm');
        }
    } catch(e) {}

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
    var coverage = (summaryPayload && summaryPayload.coverage_state) || 'unknown';
    var conviction = (summaryPayload && summaryPayload.conviction_level) || '';
    var valuation = (summaryPayload && summaryPayload.valuation_stance) || '';

    var question = 'Assess portfolio fit for ' + ticker + '.';
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

    var _fetchHeaders = { 'Content-Type': 'application/json', 'X-API-Key': CI_API_KEY };
    var _fetchToken = window.CI_AUTH && window.CI_AUTH.getToken();
    if (_fetchToken) _fetchHeaders['Authorization'] = 'Bearer ' + _fetchToken;
    var guestParam = '';
    if (!_fetchToken && window.CI_AUTH && window.CI_AUTH.getGuestId) {
        guestParam = '?guest_id=' + encodeURIComponent(window.CI_AUTH.getGuestId());
    }

    var url = apiOrigin + '/api/handoffs/summary/' + encodeURIComponent(ticker) + guestParam;

    fetch(url, { method: 'GET', headers: _fetchHeaders })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var payload = data.summary_payload;
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

    var existing = messagesEl.querySelector('.pm-analyst-summary-card');
    if (existing) existing.remove();

    var card = document.createElement('div');
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
        var staleTag = payload.coverage_state === 'stale'
            ? '<span class="pm-handoff-badge stale">STALE</span>' : '';
        var convictionTag = payload.conviction_level
            ? '<span class="pm-handoff-badge conviction-' + payload.conviction_level + '">' +
              payload.conviction_level.toUpperCase() + '</span>' : '';

        var risksHtml = '';
        if (payload.key_risks && payload.key_risks.length > 0) {
            risksHtml = '<div class="pm-handoff-risks"><strong>Risks:</strong> ' +
                payload.key_risks.map(function(r) { return escapeHtml(r); }).join(' | ') +
                '</div>';
        }

        var tripsHtml = '';
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
    var inputArea = panel ? panel.querySelector('.pm-input-area') : null;
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
