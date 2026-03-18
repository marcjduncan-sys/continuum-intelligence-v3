// thesis.js — Thesis comparator engine and inline chat functions
// Extracted from index.html without logic changes

import { STOCK_DATA, getTcData } from '../lib/state.js';
import { truncateAtWord } from '../lib/format.js';
import { ANALYST_SYSTEM_PROMPT } from '../features/chat.js';
import { saveThesis, inferBiasFromSplit } from '../features/thesis-capture.js';
import { API_BASE as _API_BASE } from '../lib/api-config.js';


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

  var thesis = document.getElementById('tc-thesis-input').value.trim();
  if (!thesis || thesis.length < 20) {
    alert('Please enter a substantive thesis (at least a sentence or two).');
    return;
  }

  // Show loading state
  var resultsEl = document.getElementById('tc-results');
  resultsEl.classList.add('active');
  resultsEl.scrollIntoView({ behavior: 'smooth' });

  var banner = document.getElementById('tc-banner');
  banner.className = 'tc-banner loading';
  document.getElementById('tc-banner-label').textContent = 'Analysing your thesis against ' + tcSelectedTicker + ' research...';
  document.getElementById('tc-banner-hypothesis').textContent = '';
  document.getElementById('tc-banner-desc').textContent = '';
  document.getElementById('tc-map-rows').innerHTML = '<div class="tc-loading"><div class="tc-loading-dot"></div><div class="tc-loading-dot"></div><div class="tc-loading-dot"></div></div>';
  document.getElementById('tc-analysis-text').innerHTML = '';
  document.getElementById('tc-supporting').innerHTML = '';
  document.getElementById('tc-contradicting').innerHTML = '';

  // Disable the button during analysis
  var btn = document.querySelector('.tc-analyze-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analysing...'; }

  var systemPrompt = buildComparatorPrompt(tcSelectedTicker);

  var apiBase = _API_BASE;

  fetch(apiBase + '/api/research-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': window.CI_API_KEY || ''
    },
    body: JSON.stringify({
      ticker: tcSelectedTicker,
      question: thesis,
      system_prompt: systemPrompt
    })
  })
  .then(function(res) {
    if (!res.ok) throw new Error('Analysis failed (' + res.status + ')');
    return res.json();
  })
  .then(function(data) {
    renderComparatorResult(data.response, tcSelectedTicker);
  })
  .catch(function(err) {
    renderComparatorError(err.message);
  })
  .finally(function() {
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>Analyse My Thesis</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'; }
  });
}

function buildComparatorPrompt(ticker) {
  var tcData = getTcData(ticker);

  var prompt = 'You are the Thesis Comparator engine for Continuum Intelligence. ';
  prompt += 'The user has submitted an investment thesis for ' + ticker + '. ';
  prompt += 'Your job is to compare their thesis against the platform\'s four competing hypotheses (N1 through N4) using the research passages provided.\n\n';

  prompt += 'RESPONSE FORMAT (you must follow this exactly):\n\n';

  prompt += '1. Start with a single line: ALIGNMENT: [N1/N2/N3/N4] followed by the hypothesis name.\n';
  prompt += '   This is the hypothesis the user\'s thesis most closely aligns with.\n';
  prompt += '   If their thesis does not clearly align with any single hypothesis, write: ALIGNMENT: CONTRARIAN\n\n';

  prompt += '2. Then write a section headed ANALYSIS (plain text, no markdown headers).\n';
  prompt += '   In 150-250 words, explain:\n';
  prompt += '   - Which hypothesis their thesis supports and why\n';
  prompt += '   - Where their thesis diverges from the platform\'s evidence base\n';
  prompt += '   - What probability weight the platform assigns to their preferred outcome\n';
  prompt += '   - Whether they are aligned with or against the dominant narrative\n\n';

  prompt += '3. Then a section headed SUPPORTING EVIDENCE (plain text, no markdown headers).\n';
  prompt += '   List 3-5 specific evidence items from the research that support the user\'s view.\n';
  prompt += '   Each item on its own line, prefixed with a bullet character.\n';
  prompt += '   Use the actual evidence from the research passages, not generic statements.\n\n';

  prompt += '4. Then a section headed CONTRADICTING EVIDENCE (plain text, no markdown headers).\n';
  prompt += '   List 3-5 specific evidence items the user may be underweighting or ignoring.\n';
  prompt += '   Each item on its own line, prefixed with a bullet character.\n';
  prompt += '   These should be the strongest challenges to their thesis from the research.\n\n';

  prompt += '5. Then a section headed DISCRIMINATORS (plain text, no markdown headers).\n';
  prompt += '   Identify 1-3 upcoming data points or catalysts that will resolve the tension between the user\'s thesis and the competing hypotheses.\n';
  prompt += '   Each on its own line, prefixed with a bullet character.\n\n';

  prompt += 'VOICE RULES:\n';
  prompt += '- Speak as "we" (Continuum\'s research team). Never "I".\n';
  prompt += '- Be direct and opinionated. "Your thesis is pricing in X but ignoring Y" is good.\n';
  prompt += '- No markdown headers (no #). Use the section names as plain text labels.\n';
  prompt += '- No em-dashes. Use commas, colons, or full stops.\n';
  prompt += '- No filler phrases. No "it is important to note". No "notably".\n';
  prompt += '- Reference hypothesis tiers by label: N1, N2, N3, N4.\n';
  prompt += '- Use institutional language: "the print", "consensus", "the street", "the multiple".\n';

  if (tcData) {
    prompt += '\nHYPOTHESIS REFERENCE (from platform data):\n';
    ['n1','n2','n3','n4'].forEach(function(tier) {
      var h = tcData[tier];
      if (h) {
        prompt += tier.toUpperCase() + ': ' + h.name + ' (' + h.prob + '% probability) - ' + h.desc + '\n';
      }
    });
  }

  return prompt;
}

function renderComparatorResult(text, ticker) {
  var tcData = getTcData(ticker);

  // Parse alignment from first line
  var lines = text.split('\n');
  var alignment = 'contrarian';
  var alignmentName = '';
  for (var i = 0; i < Math.min(lines.length, 5); i++) {
    var match = lines[i].match(/^ALIGNMENT:\s*(N[1-4]|CONTRARIAN)/i);
    if (match) {
      alignment = match[1].toLowerCase();
      alignmentName = lines[i].replace(/^ALIGNMENT:\s*(N[1-4]|CONTRARIAN)\s*/i, '').replace(/^[:\-]\s*/, '').trim();
      break;
    }
  }

  tcCurrentAlignment = alignment;

  // Capture thesis from comparator result (explicit, high confidence)
  if (alignment !== 'contrarian') {
    var _stockData = STOCK_DATA[ticker];
    var _tierIdx = parseInt(alignment.replace('n', ''), 10) - 1;
    var _hypDirection = (_stockData && _stockData.hypotheses && _stockData.hypotheses[_tierIdx])
      ? _stockData.hypotheses[_tierIdx].direction : '';
    var _bias = _hypDirection === 'upside' ? 'bullish' : _hypDirection === 'downside' ? 'bearish' : 'neutral';

    // Build probability split from tcData if available
    var _split = null;
    if (tcData) {
      _split = ['n1','n2','n3','n4'].map(function(t) { return tcData[t] ? (parseFloat(tcData[t].prob) || 0) : 0; });
    }

    saveThesis({
      ticker: ticker,
      dominantHypothesis: alignment.toUpperCase(),
      probabilitySplit: _split,
      biasDirection: _bias,
      keyAssumption: null,
      source: 'explicit',
      confidence: 'high',
      capturedAt: new Date().toISOString(),
      capturedFrom: 'comparator'
    });
  }

  // Banner
  var banner = document.getElementById('tc-banner');
  banner.className = 'tc-banner ' + alignment;

  if (alignment === 'contrarian') {
    document.getElementById('tc-banner-label').textContent = 'Your thesis position:';
    document.getElementById('tc-banner-hypothesis').textContent = '\u26A0\uFE0F CONTRARIAN';
    document.getElementById('tc-banner-desc').textContent = alignmentName || "Your view doesn't clearly align with any single hypothesis. You're making a contrarian bet.";
  } else {
    var tierData = tcData ? tcData[alignment] : null;
    document.getElementById('tc-banner-label').textContent = 'Your thesis aligns most closely with:';
    document.getElementById('tc-banner-hypothesis').textContent = alignment.toUpperCase() + ': ' + (tierData ? tierData.name : alignmentName);
    document.getElementById('tc-banner-desc').textContent = tierData ? tierData.desc : alignmentName;
  }

  // Hypothesis map rows
  var rowsContainer = document.getElementById('tc-map-rows');
  if (tcData) {
    rowsContainer.innerHTML = ['n1','n2','n3','n4'].map(function(tier) {
      var tData = tcData[tier];
      if (!tData) return '';
      var isMatch = tier === alignment;
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
  } else {
    rowsContainer.innerHTML =
      '<div class="tc-no-tc-data">Hypothesis probability data not yet available for ' + ticker + '. Analysis is grounded in full research content.</div>';
  }

  // Parse sections from the response
  var analysisText = extractSection(text, 'ANALYSIS');
  var supportingItems = extractBulletList(text, 'SUPPORTING EVIDENCE');
  var contradictingItems = extractBulletList(text, 'CONTRADICTING EVIDENCE');
  var discriminatorItems = extractBulletList(text, 'DISCRIMINATORS');

  // Render analysis
  document.getElementById('tc-analysis-text').innerHTML = formatParagraphs(analysisText);

  // Render supporting evidence
  document.getElementById('tc-supporting').innerHTML = supportingItems.map(function(item) {
    return '<div class="tc-evidence-item"><span class="tc-evidence-icon support">&#10003;</span><span>' + item + '</span></div>';
  }).join('');

  // Render contradicting evidence
  document.getElementById('tc-contradicting').innerHTML = contradictingItems.map(function(item) {
    return '<div class="tc-evidence-item"><span class="tc-evidence-icon contradict">!</span><span>' + item + '</span></div>';
  }).join('');

  // Render discriminators if present
  if (discriminatorItems.length > 0) {
    var discHtml = '<div class="tc-evidence-col" style="grid-column: 1 / -1; margin-top: 1.5rem;">' +
      '<div class="tc-evidence-header">Key Discriminators to Watch</div>' +
      discriminatorItems.map(function(item) {
        return '<div class="tc-evidence-item"><span class="tc-evidence-icon disc">\u25C6</span><span>' + item + '</span></div>';
      }).join('') +
      '</div>';
    var grid = document.querySelector('.tc-evidence-grid');
    if (grid) {
      var existing = grid.querySelector('.tc-evidence-col[style]');
      if (existing) existing.remove();
      grid.insertAdjacentHTML('beforeend', discHtml);
    }
  }
}

function extractSection(text, sectionName) {
  var pattern = new RegExp(sectionName + '[:\\s]*\\n([\\s\\S]*?)(?=\\n(?:ALIGNMENT|ANALYSIS|SUPPORTING EVIDENCE|CONTRADICTING EVIDENCE|DISCRIMINATORS)[:\\s]*\\n|$)', 'i');
  var match = text.match(pattern);
  if (match) return match[1].trim();

  // Fallback: find the section name and take everything until the next all-caps label
  var idx = text.indexOf(sectionName);
  if (idx === -1) return '';
  var rest = text.substring(idx + sectionName.length).replace(/^[:\s]+/, '');
  var nextSection = rest.match(/\n[A-Z][A-Z ]{5,}[:\s]*\n/);
  if (nextSection) return rest.substring(0, nextSection.index).trim();
  return rest.trim();
}

function extractBulletList(text, sectionName) {
  var section = extractSection(text, sectionName);
  if (!section) return [];
  return section.split(/\n/).filter(function(line) {
    return line.trim().length > 0;
  }).map(function(line) {
    return line.replace(/^[\s]*[\u2022\u2023\u25E6\u2043\u2219\-\*\u25CF\u25CB\u25AA\u25BA]\s*/, '').trim();
  }).filter(function(item) {
    return item.length > 10;
  });
}

function formatParagraphs(text) {
  if (!text) return '<p>Analysis unavailable.</p>';
  return text.split(/\n\n+/).map(function(para) {
    return '<p>' + para.replace(/\n/g, ' ').trim() + '</p>';
  }).filter(function(p) {
    return p !== '<p></p>';
  }).join('');
}

function renderComparatorError(message) {
  var banner = document.getElementById('tc-banner');
  banner.className = 'tc-banner error';
  document.getElementById('tc-banner-label').textContent = 'Analysis unavailable';
  document.getElementById('tc-banner-hypothesis').textContent = '';
  document.getElementById('tc-banner-desc').textContent = message || 'Could not reach the analysis engine. Try again in a moment.';
  document.getElementById('tc-map-rows').innerHTML = '';
  document.getElementById('tc-analysis-text').innerHTML = '';
  document.getElementById('tc-supporting').innerHTML = '';
  document.getElementById('tc-contradicting').innerHTML = '';
}

// ============================================================
// INLINE RESEARCH CHAT FUNCTIONS
// ============================================================

var API_BASE = _API_BASE + '/api/research-chat';

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
                       '<div class="tc-stock-name">' + truncateAtWord(stock.company || ticker, 22) + '</div>';
      card.title = stock.company || ticker;
      tcGrid.appendChild(card);
    });
  }

  // Enter key on the thesis textarea submits analysis (Shift+Enter inserts newline)
  var tcTextarea = document.getElementById('tc-thesis-input');
  if (tcTextarea) {
    tcTextarea.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        tcAnalyze();
      }
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
