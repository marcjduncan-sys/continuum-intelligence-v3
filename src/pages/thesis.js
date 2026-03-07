// thesis.js — Thesis comparator engine and inline chat functions
// Extracted from index.html without logic changes

import { STOCK_DATA, getTcData } from '../lib/state.js';
import { ANALYST_SYSTEM_PROMPT } from '../features/chat.js';


var tcSelectedTicker = null;
var tcCurrentAlignment = null;

export function tcSelectStock(ticker) {
  tcSelectedTicker = ticker;
  document.querySelectorAll('.tc-stock-card').forEach(function(card) {
    card.classList.toggle('selected', card.dataset.ticker === ticker);
  });
  document.getElementById('tc-step-2').classList.add('active');
  document.getElementById('tc-step-2').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function tcAnalyze() {
  if (!tcSelectedTicker) { alert('Please select a stock first'); return; }

  var data = getTcData(tcSelectedTicker);
  if (!data) {
    document.getElementById('tc-results').innerHTML = '<div class="tc-banner"><div class="tc-banner-label">Thesis comparison not yet available for ' + tcSelectedTicker + '. Full analysis coming soon.</div></div>';
    document.getElementById('tc-results').style.display = 'block';
    return;
  }
  var thesis = document.getElementById('tc-thesis-input').value.toLowerCase();

  var primaryTier = data.primary;
  if (thesis.length > 50) {
    var scores = { n1: 0, n2: 0, n3: 0, n4: 0 };
    if (/growth|recovery|expansion|synergy|dominance|leadership|success/i.test(thesis)) scores.n1 += 2;
    if (/bull|bullish|outperform|buy/i.test(thesis)) scores.n1 += 1;
    if (/normalize|moderate|decline|cyclical|slowdown|steady|base/i.test(thesis)) scores.n2 += 2;
    if (/hold|neutral|fair value/i.test(thesis)) scores.n2 += 1;
    if (/risk|execution|failure|challenge|problem|concern|bear/i.test(thesis)) scores.n3 += 2;
    if (/short|sell|underperform|avoid/i.test(thesis)) scores.n3 += 1;
    if (/disrupt|competition|threat|obsolete|replace/i.test(thesis)) scores.n4 += 2;

    var maxScore = Math.max(scores.n1, scores.n2, scores.n3, scores.n4);
    if (maxScore > 0) {
      var entries = Object.keys(scores);
      for (var ei = 0; ei < entries.length; ei++) {
        if (scores[entries[ei]] === maxScore) { primaryTier = entries[ei]; break; }
      }
    }
  }

  tcCurrentAlignment = primaryTier;

  var banner = document.getElementById('tc-banner');
  banner.className = 'tc-banner ' + primaryTier;

  var tierData = data[primaryTier];
  if (primaryTier === 'uphill') {
    document.getElementById('tc-banner-label').textContent = 'Your thesis position:';
    document.getElementById('tc-banner-hypothesis').textContent = '\u26A0\uFE0F PUSHING UPHILL';
    document.getElementById('tc-banner-desc').textContent = "Your view doesn't clearly align with any single hypothesis. You're making a contrarian bet.";
  } else {
    document.getElementById('tc-banner-label').textContent = 'Your thesis aligns most closely with:';
    document.getElementById('tc-banner-hypothesis').textContent = primaryTier.toUpperCase() + ': ' + tierData.name;
    document.getElementById('tc-banner-desc').textContent = tierData.desc;
  }

  var rowsContainer = document.getElementById('tc-map-rows');
  rowsContainer.innerHTML = ['n1','n2','n3','n4'].map(function(tier) {
    var tData = data[tier];
    var isMatch = tier === primaryTier;
    var stance = isMatch ? 'supports' : 'contradicts';
    return '<div class="tc-row">' +
      '<div class="tc-indicator ' + tier + (isMatch ? ' match' : '') + '">' + tier.toUpperCase() + '</div>' +
      '<div class="tc-info">' +
        '<div class="tc-name">' + tier.toUpperCase() + ': ' + tData.name + '</div>' +
        '<div class="tc-prob">Continuum: ' + tData.prob + '% probability</div>' +
      '</div>' +
      '<span class="tc-stance ' + stance + '">' + stance.toUpperCase() + '</span>' +
    '</div>';
  }).join('');

  document.getElementById('tc-analysis-text').innerHTML = data.analysis;
  document.getElementById('tc-supporting').innerHTML = data.supporting.map(function(item) {
    return '<div class="tc-evidence-item"><span class="tc-evidence-icon support">&#10003;</span><span>' + item + '</span></div>';
  }).join('');
  document.getElementById('tc-contradicting').innerHTML = data.contradicting.map(function(item) {
    return '<div class="tc-evidence-item"><span class="tc-evidence-icon contradict">!</span><span>' + item + '</span></div>';
  }).join('');

  document.getElementById('tc-results').classList.add('active');
  document.getElementById('tc-results').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================
// INLINE RESEARCH CHAT FUNCTIONS
// ============================================================

var PRODUCTION_API = 'https://imaginative-vision-production-16cb.up.railway.app';
var isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
var isGitHubPages = window.location.hostname.indexOf('github.io') !== -1;
var apiOrigin = window.CHAT_API_URL
  || (isLocal ? ''
      : isGitHubPages ? PRODUCTION_API
      : '');
var API_BASE = apiOrigin + '/api/research-chat';

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

function getSuggestions(ticker) {
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
    var sugs = getSuggestions(ticker);
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
  var sendBtn = container ? container.querySelector('.chat-inline-send') : null;
  if (sendBtn) sendBtn.disabled = true;

  var history = convo.slice(0, -1).map(function(m) {
    return { role: m.role, content: m.content };
  });

  fetch(API_BASE, {
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
    if (sendBtn) {
      var inp = container ? container.querySelector('.chat-inline-input') : null;
      sendBtn.disabled = !(inp && inp.value.trim());
    }
  });
}

export function initThesisPage() {
  // Populate thesis comparator stock cards dynamically
  var tcGrid = document.getElementById('tc-stock-grid');
  if (tcGrid) {
    Object.keys(STOCK_DATA).sort().forEach(function(ticker) {
      var stock = STOCK_DATA[ticker];
      var card = document.createElement('div');
      card.className = 'tc-stock-card';
      card.dataset.ticker = ticker;
      card.onclick = function() { tcSelectStock(ticker); };
      card.innerHTML = '<div class="tc-stock-ticker">' + ticker + '</div>' +
                       '<div class="tc-stock-name">' + (stock.company || ticker) + '</div>';
      tcGrid.appendChild(card);
    });
  }

  // Event delegation for inline chat -- suggestion buttons
  document.addEventListener('click', function(e) {
    var sugBtn = e.target.closest('.chat-inline-suggestion');
    if (sugBtn) {
      var container = sugBtn.closest('.chat-inline');
      if (container) {
        var ticker = container.getAttribute('data-ticker');
        var q = sugBtn.getAttribute('data-q');
        var inp = container.querySelector('.chat-inline-input');
        if (inp) inp.value = '';
        sendInlineMessage(ticker, q);
      }
      return;
    }

    // Send button click
    var sendBtnEl = e.target.closest('.chat-inline-send');
    if (sendBtnEl) {
      var container = sendBtnEl.closest('.chat-inline');
      if (container) {
        var ticker = container.getAttribute('data-ticker');
        var inp = container.querySelector('.chat-inline-input');
        if (inp && inp.value.trim()) {
          sendInlineMessage(ticker, inp.value.trim());
          inp.value = '';
          inp.style.height = 'auto';
          sendBtnEl.disabled = true;
        }
      }
      return;
    }
  });

  // Handle input and enter key via delegation
  document.addEventListener('input', function(e) {
    if (e.target.classList.contains('chat-inline-input')) {
      var container = e.target.closest('.chat-inline');
      if (container) {
        var sendBtn = container.querySelector('.chat-inline-send');
        if (sendBtn) sendBtn.disabled = !e.target.value.trim();
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
      }
    }
  });

  document.addEventListener('keydown', function(e) {
    if (e.target.classList.contains('chat-inline-input') && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      var container = e.target.closest('.chat-inline');
      if (container) {
        var ticker = container.getAttribute('data-ticker');
        if (e.target.value.trim()) {
          sendInlineMessage(ticker, e.target.value.trim());
          e.target.value = '';
          e.target.style.height = 'auto';
          var sendBtn = container.querySelector('.chat-inline-send');
          if (sendBtn) sendBtn.disabled = true;
        }
      }
    }
  });
}
