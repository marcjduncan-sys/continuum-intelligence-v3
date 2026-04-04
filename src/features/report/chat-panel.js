// Report chat panel -- static shell (3 tabs: Analyst / PM / Strategist)

export function renderChatPanel(data) {
  const ticker = data.ticker || '';
  const company = data.company || ticker;

  const tabs =
    '<button class="cp-tab active" data-tab="analyst">Analyst</button>' +
    '<button class="cp-tab" data-tab="pm">PM</button>' +
    '<button class="cp-tab" data-tab="strat">Strategist</button>';

  const suggestions =
    '<button class="cp-suggestion-btn">What does the price embed?</button>' +
    '<button class="cp-suggestion-btn">Summarise the thesis</button>' +
    '<button class="cp-suggestion-btn">What is the key risk?</button>';

  const sendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  return '<div class="chat-panel" id="' + ticker.toLowerCase() + '-chat">' +
    '<div class="cp-head">' +
      '<div class="cp-tabs">' + tabs + '</div>' +
    '</div>' +
    '<div class="cp-context-bar">' +
      '<span class="cp-context-label">' + company + ' context loaded</span>' +
    '</div>' +
    '<div class="cp-stream">' +
      '<div class="cp-placeholder">Ask about ' + company + '&hellip;</div>' +
    '</div>' +
    '<div class="cp-suggestions">' + suggestions + '</div>' +
    '<div class="cp-composer">' +
      '<div class="cp-composer-inner">' +
        '<input type="text" class="cp-input" placeholder="Ask the analyst&hellip;" autocomplete="off" />' +
        '<button class="send-btn" aria-label="Send">' + sendIcon + '</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}
