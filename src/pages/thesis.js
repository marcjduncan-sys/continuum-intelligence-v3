// thesis.js — Thesis comparator engine and inline chat functions
// Extracted from index.html without logic changes

import { STOCK_DATA } from '../lib/state.js';
import { ANALYST_SYSTEM_PROMPT } from '../features/chat.js';

export const TC_DATA = {
  WOW: {
    name: 'Woolworths Group', primary: 'n2',
    n1: { name: 'Managed Turnaround', prob: 36, desc: 'New leadership executes turnaround; margins stabilize' },
    n2: { name: 'Structural Margin Erosion', prob: 25, desc: 'Price investment and regulatory pressure permanently compress margins' },
    n3: { name: 'Regulatory Squeeze', prob: 21, desc: 'ACCC/FGCC action intensifies, constraining pricing power' },
    n4: { name: 'Competitive Disruption', prob: 18, desc: 'Aldi and independents take meaningful share' },
    supporting: ['ACCC margin findings', 'FGCC compliance costs', 'Aldi expansion data'],
    contradicting: ['Q1 FY26 trading update', 'NPS improvement', 'Cost-out progress'],
    analysis: "Your thesis <strong>supports N2 and N3</strong>  --  the downside scenarios. You believe margin pressure is structural, not cyclical, and regulatory headwinds are underappreciated. This puts you <strong>against consensus</strong> which prices a Bardwell turnaround (N1)."
  },
  CSL: {
    name: 'CSL Limited', primary: 'n1',
    n1: { name: 'Plasma Recovery & Growth', prob: 45, desc: 'Collections normalize; Behring margins expand; Vifor synergies realized' },
    n2: { name: 'Collection Shortfall', prob: 25, desc: 'US plasma collections fail to recover to target levels' },
    n3: { name: 'Behring Margin Compression', prob: 18, desc: 'Pricing pressure and input costs squeeze Behring profitability' },
    n4: { name: 'Competitive Threat', prob: 12, desc: 'Biosimilar competition emerges faster than expected' },
    supporting: ['Plasma collection trends', 'Behring margin guidance', 'Vifor integration synergies'],
    contradicting: ['Persistent collection challenges', 'Competitive dynamics', 'Pricing pressure signs'],
    analysis: "Your thesis <strong>strongly supports N1</strong>  --  the base case recovery. You believe plasma collections are normalizing and Behring margins will expand. You're <strong>aligned with consensus</strong>. Watch N2 risks."
  },
  XRO: {
    name: 'Xero Limited', primary: 'n1',
    n1: { name: 'AI-Led Growth Recovery', prob: 28, desc: 'AI investments drive subscriber growth; churn reduces' },
    n2: { name: 'Structural Margin Pressure', prob: 22, desc: 'Competition forces sustained price investment' },
    n3: { name: 'Execution Failure', prob: 35, desc: 'Management fails to deliver on AI promises; growth stalls' },
    n4: { name: 'Competitive Disruption', prob: 15, desc: 'QuickBooks or new entrant disrupts with superior AI' },
    supporting: ['AI partnership announcement', 'Subscriber growth momentum', 'US market opportunity'],
    contradicting: ['History of missed guidance', 'QuickBooks AI advancement', 'Microsoft SMB push'],
    analysis: "Your thesis <strong>supports N1</strong>  --  the turnaround narrative. However, you <strong>contradict N3 and N4</strong>, representing 50% of probability. High reward if right; significant risk if execution fails."
  },
  WTC: {
    name: 'WiseTech Global', primary: 'uphill',
    n1: { name: 'Organic Growth & Margins Intact', prob: 30, desc: 'Growth accelerates organically; margins expand' },
    n2: { name: 'Growth Deceleration', prob: 25, desc: 'Customer acquisition slows; revenue growth moderates' },
    n3: { name: 'Governance/Execution Risk', prob: 30, desc: 'Founder departure or governance issues impair execution' },
    n4: { name: 'Competitive Disruption', prob: 15, desc: 'New logistics platform gains traction' },
    supporting: ['CargoWise platform strength', 'Founder vision alignment', 'Global trade recovery'],
    contradicting: ['Governance concerns persist', 'Insider selling patterns', 'Competitive pricing pressure'],
    analysis: "Your thesis is <strong>\u26A0\uFE0F PUSHING UPHILL</strong>. You don't align clearly with N1, yet contradict N2, N3, N4 (70% combined). Requires growth recovery AND governance concerns proving overblown."
  },
  WDS: {
    name: 'Woodside Energy', primary: 'n2',
    n1: { name: 'Energy Transition Delayed', prob: 30, desc: 'Fossil demand persists longer; LNG prices remain elevated' },
    n2: { name: 'Managed Decline', prob: 35, desc: 'Orderly transition; stable cash flows; disciplined capex' },
    n3: { name: 'Stranded Asset Risk', prob: 20, desc: 'Accelerated transition strands LNG assets' },
    n4: { name: 'Execution Failure', prob: 15, desc: 'Scarborough delays; cost overruns; production misses' },
    supporting: ['LNG demand resilience', 'Asian contract pricing', 'Scarborough progress'],
    contradicting: ['Energy transition acceleration', 'EU LNG diversification', 'Cost inflation'],
    analysis: "Your thesis <strong>supports N2</strong>  --  the managed decline scenario. You expect orderly cash flow generation through transition. Watch N1 (upside) and N3 (downside) scenarios."
  },
  MQG: {
    name: 'Macquarie Group', primary: 'n1',
    n1: { name: 'Green Energy Leadership', prob: 40, desc: 'Green investment bank thesis succeeds; asset realizations strong' },
    n2: { name: 'Commodities Normalization', prob: 25, desc: 'Commodity earnings normalize; offset by green growth' },
    n3: { name: 'Asset Realization Shortfall', prob: 20, desc: 'Green asset sales disappoint; valuation gap persists' },
    n4: { name: 'Competitive Pressure', prob: 15, desc: 'Traditional banks compete effectively on green finance' },
    supporting: ['Green asset pipeline', 'Commodity earnings resilience', 'Asset realization track record'],
    contradicting: ['Green asset valuation compression', 'Traditional bank competition', 'Rate headwinds'],
    analysis: "Your thesis <strong>strongly supports N1</strong>  --  the green energy bank narrative. You believe Macquarie can pivot successfully. Watch N3 risk on asset realizations."
  },
  DRO: {
    name: 'Droneshield', primary: 'n3',
    n1: { name: 'Mass Adoption', prob: 15, desc: 'Government contracts scale rapidly; commercial adoption accelerates' },
    n2: { name: 'Defense Budget Dependence', prob: 25, desc: 'Revenue tied to lumpy defense procurement' },
    n3: { name: 'Competitive Threat', prob: 40, desc: 'Larger defense primes enter; pricing pressure emerges' },
    n4: { name: 'Technology Obsolescence', prob: 20, desc: 'New counter-drone tech renders products obsolete' },
    supporting: ['Defense contract wins', 'Counter-drone threat urgency', 'International expansion'],
    contradicting: ['Defense budget volatility', 'Large prime competition', 'Technology cycle risk'],
    analysis: "Your thesis <strong>supports N2</strong> but acknowledges N3 risks. Droneshield operates in a niche vulnerable to larger competitors. High conviction required given N3/N4 probability (60%)."
  },
  PME: {
    name: 'Pro Medicus', primary: 'n1',
    n1: { name: 'Continued Dominance', prob: 50, desc: 'Visage AI maintains technical lead; contract renewals at higher rates' },
    n2: { name: 'Growth Normalization', prob: 25, desc: 'Growth moderates from exceptional to strong levels' },
    n3: { name: 'Competitive Entry', prob: 15, desc: 'Big Tech or med-tech enters radiology AI effectively' },
    n4: { name: 'Valuation Compression', prob: 10, desc: 'Multiple derates despite continued execution' },
    supporting: ['Visage AI technical lead', 'Contract renewal pricing', 'Market expansion'],
    contradicting: ['Big Tech AI capabilities', 'Healthcare IT budgets', 'Multiple sustainability'],
    analysis: "Your thesis <strong>strongly supports N1</strong>  --  the continued dominance scenario. High conviction in technical moat. Watch N3 (competition) as main risk."
  },
  GYG: {
    name: 'Guzman y Gomez', primary: 'n2',
    n1: { name: 'Successful Scale-Up', prob: 25, desc: 'Store rollout succeeds; unit economics improve at scale' },
    n2: { name: 'Growth vs Profitability Tension', prob: 35, desc: 'Expansion costs weigh; path to profit unclear' },
    n3: { name: 'Competitive Response', prob: 25, desc: 'Incumbents respond effectively; differentiation erodes' },
    n4: { name: 'Execution Failure', prob: 15, desc: 'Store openings miss targets; franchisee issues emerge' },
    supporting: ['Store rollout momentum', 'Brand differentiation', 'Australian market opportunity'],
    contradicting: ['Unit economics uncertainty', 'Competitive intensity', 'Franchisee model risks'],
    analysis: "Your thesis <strong>aligns with N2</strong>  --  the growth vs profitability tension. You believe expansion will strain economics. This is the base case for recent IPOs in competitive markets."
  },
  GMG: {
    name: 'Goodman Group', primary: 'n1',
    n1: { name: 'Logistics Megatrend', prob: 45, desc: 'E-commerce growth sustains; development pipeline delivers' },
    n2: { name: 'Cyclical Slowdown', prob: 25, desc: 'Development slows; valuations moderate' },
    n3: { name: 'Oversupply Risk', prob: 18, desc: 'Competitive development creates oversupply' },
    n4: { name: 'Interest Rate Sensitivity', prob: 12, desc: 'Higher rates impair valuations and development returns' },
    supporting: ['E-commerce penetration growth', 'Development pipeline', 'Premium asset quality'],
    contradicting: ['Interest rate environment', 'Development cycle maturity', 'Competitive supply'],
    analysis: "Your thesis <strong>supports N1</strong>  --  the logistics megatrend. You believe e-commerce tailwinds persist. Watch N4 (rates) and N3 (oversupply) as cyclical risks."
  },
  SIG: {
    name: 'Sigma Healthcare', primary: 'n1',
    n1: { name: 'Chemist Warehouse Synergies', prob: 40, desc: 'Merger delivers cost synergies; market position strengthens' },
    n2: { name: 'Integration Challenges', prob: 30, desc: 'Merger execution proves difficult; synergies delayed' },
    n3: { name: 'Regulatory Block', prob: 15, desc: 'ACCC blocks or conditions merger heavily' },
    n4: { name: 'Competitive Response', prob: 15, desc: 'EBOS and independents respond effectively' },
    supporting: ['Synergy targets', 'Market share opportunity', 'Scale advantages'],
    contradicting: ['Integration complexity', 'Regulatory uncertainty', 'Competitive dynamics'],
    analysis: "Your thesis <strong>supports N1</strong>  --  the merger synergy story. You believe Sigma+Chemist Warehouse creates value. Key risk is N2 (integration execution)."
  },
  FMG: {
    name: 'Fortescue', primary: 'n2',
    n1: { name: 'Green Hydrogen Success', prob: 20, desc: 'Fortescue Future Industries becomes viable business' },
    n2: { name: 'Iron Ore Cash Machine', prob: 45, desc: 'Core iron ore generates cash; green projects scaled back' },
    n3: { name: 'Iron Ore Price Collapse', prob: 25, desc: 'Chinese demand weakness crushes iron ore prices' },
    n4: { name: 'Green Capital Destruction', prob: 10, desc: 'Hydrogen investments destroy value with no returns' },
    supporting: ['Iron ore cost position', 'Chinese demand resilience', 'Green hydrogen optionality'],
    contradicting: ['Iron ore price volatility', 'Chinese property weakness', 'Hydrogen economics'],
    analysis: "Your thesis <strong>aligns with N2</strong>  --  the cash machine scenario. You view green hydrogen as optionality, not core value. Watch N3 (China risk) as main downside."
  }
};

// Make TC_DATA available globally for portfolio.js (avoids circular dependency)
window.TC_DATA = TC_DATA;

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

  var data = TC_DATA[tcSelectedTicker];
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
