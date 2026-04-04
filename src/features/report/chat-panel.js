// Report chat panel -- redesigned shell (3 tabs: Analyst / PM / Strategist)
// Matches approved prototype with structured header, context bar, and full composer UI

export function renderChatPanel(data) {
  const ticker = data.ticker || '';
  const company = data.company || ticker;
  const currency = data.currency || 'USD';

  // Calculate EWP from worlds array if available
  let ewpPrice = '';
  if (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds) {
    const worlds = data.hero.position_in_range.worlds;
    let weightedSum = 0;
    let totalProbability = 0;
    for (const world of worlds) {
      if (world.price && world.label) {
        const prob = world.probability || 0;
        weightedSum += world.price * prob;
        totalProbability += prob;
      }
    }
    if (totalProbability > 0) {
      ewpPrice = (weightedSum / totalProbability).toFixed(2);
    }
  }

  // Fallback: try direct ewp field
  if (!ewpPrice && data.hero && data.hero.position_in_range && data.hero.position_in_range.ewp) {
    ewpPrice = data.hero.position_in_range.ewp;
  }

  // Info icon SVG
  const infoIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  // Send icon SVG (arrow/plane)
  const sendIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';

  let html = '<aside class="chat-panel" id="' + ticker.toLowerCase() + '-chat">';

  // Header section
  html += '<div class="cp-head">';
  html += '<div class="cp-eyebrow">AI Research Intelligence</div>';
  html += '<div class="cp-title-row">';
  html += '<h2 class="cp-title">Research Analyst</h2>';
  html += '<div class="cp-context-tag">';
  html += infoIcon;
  html += '<span>' + ticker + ' &#8211; EWP ' + (ewpPrice || 'n/a') + '</span>';
  html += '</div>';
  html += '</div>';
  html += '<p class="cp-sub">Evidence-grounded analysis across all four ACH cases. Ask the Analyst to interrogate evidence, the PM to assess portfolio sizing, or the Strategist for macro context on the Swing Case.</p>';
  html += '</div>';

  // Tabs section
  html += '<div class="cp-tabs">';

  html += '<div class="cp-tab analyst active">';
  html += '<div class="cp-tab-icon">A</div>';
  html += '<div class="cp-tab-label">Analyst</div>';
  html += '<div class="cp-tab-desc">Evidence &amp; ACH cases</div>';
  html += '</div>';

  html += '<div class="cp-tab pm">';
  html += '<div class="cp-tab-icon">PM</div>';
  html += '<div class="cp-tab-label">Port. Manager</div>';
  html += '<div class="cp-tab-desc">Position &amp; EWP sizing</div>';
  html += '</div>';

  html += '<div class="cp-tab strat">';
  html += '<div class="cp-tab-icon">S</div>';
  html += '<div class="cp-tab-label">Strategist</div>';
  html += '<div class="cp-tab-desc">Macro &amp; Swing Case</div>';
  html += '</div>';

  html += '</div>';

  // Context bar
  html += '<div class="cp-context-bar">';
  html += '<span class="ctx-label">Context</span>';
  html += '<div class="ctx-chip active">All Cases</div>';
  html += '<div class="ctx-chip">Bull Case</div>';
  html += '<div class="ctx-chip">Base Case</div>';
  html += '<div class="ctx-chip">Bear Case</div>';
  html += '<div class="ctx-chip">Swing Case</div>';
  html += '<div class="ctx-chip">EWP</div>';
  html += '</div>';

  // Stream area
  html += '<div class="cp-stream">';
  html += '<div class="cp-placeholder">Ask about ' + company + '&hellip;</div>';
  html += '</div>';

  // Suggestions
  html += '<div class="cp-suggestions">';
  html += '<div class="suggestion">What does the price embed?</div>';
  html += '<div class="suggestion">Summarise the thesis</div>';
  html += '<div class="suggestion">What is the key risk?</div>';
  html += '</div>';

  // Composer
  html += '<div class="cp-composer">';
  html += '<div class="composer-inner">';
  html += '<textarea placeholder="Ask about the ACH cases, EWP derivation, or evidence&hellip;" rows="2"></textarea>';
  html += '<button class="send-btn" aria-label="Send">' + sendIcon + '</button>';
  html += '</div>';
  html += '<div class="composer-meta">';
  html += '<span class="tiny">&#8984;&#8629; to send &#8211; Context: All Cases &#8211; <a>Switch to PM</a> &#8211; <a>Switch to Strategist</a></span>';
  html += '<span class="tiny" style="color:var(--blue);font-weight:700;cursor:pointer">History</span>';
  html += '</div>';
  html += '</div>';

  html += '</aside>';

  return html;
}
