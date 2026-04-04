// Risk Register renderer
// Maps tripwires and gaps data into a risk register format
// Falls back to TBC placeholder if no data available

export function renderRiskRegister(data) {
  const t = data.ticker.toLowerCase();
  const tripwires = data.tripwires;
  const gaps = data.gaps;

  // Try to build risk items from tripwires
  let risksHtml = '';
  let riskCount = 0;

  if (tripwires && tripwires.items && tripwires.items.length) {
    for (let i = 0; i < tripwires.items.length; i++) {
      const tw = tripwires.items[i];
      const title = tw.title || tw.label || ('Tripwire ' + (i + 1));
      const body = tw.description || tw.detail || tw.text || '';
      // Assign severity based on position: first items are higher severity
      const severity = i < 2 ? 'high' : i < 4 ? 'medium' : 'low';
      const icon = severity === 'high' ? '\u26A0' : severity === 'medium' ? '~' : '\u2193';

      risksHtml += '<div class="risk-item">' +
        '<div class="risk-icon ' + severity + '">' + icon + '</div>' +
        '<div>' +
          '<div class="risk-label">' + title + '</div>' +
          '<div class="risk-body">' + body + '</div>' +
        '</div>' +
        '<span class="risk-badge ' + severity + '">' + severity.charAt(0).toUpperCase() + severity.slice(1) + '</span>' +
      '</div>';
      riskCount++;
    }
  }

  // Also pull from gaps if available
  if (gaps && gaps.items && gaps.items.length) {
    for (let i = 0; i < gaps.items.length && riskCount < 6; i++) {
      const gap = gaps.items[i];
      const title = gap.title || gap.label || ('Evidence Gap ' + (i + 1));
      const body = gap.description || gap.detail || gap.text || '';

      risksHtml += '<div class="risk-item">' +
        '<div class="risk-icon medium">?</div>' +
        '<div>' +
          '<div class="risk-label">' + title + ' (Evidence Gap)</div>' +
          '<div class="risk-body">' + body + '</div>' +
        '</div>' +
        '<span class="risk-badge medium">Medium</span>' +
      '</div>';
      riskCount++;
    }
  }

  // TBC placeholder if no data
  if (riskCount === 0) {
    risksHtml = '<div class="risk-list">' +
      '<div class="risk-item">' +
        '<div class="risk-icon medium">TBC</div>' +
        '<div>' +
          '<div class="risk-label">Risk Register: To Be Configured</div>' +
          '<div class="risk-body">Risk factors mapped against ACH cases will appear here once the research pipeline populates this section. Tripwires, evidence gaps, and key risks will be presented with severity ratings.</div>' +
        '</div>' +
        '<span class="risk-badge medium">TBC</span>' +
      '</div>' +
    '</div>';
  } else {
    risksHtml = '<div class="risk-list">' + risksHtml + '</div>';
  }

  return '<section class="section" id="' + t + '-risk-register">' +
    '<div class="section-header">' +
      '<div>' +
        '<div class="eyebrow">Risk Register &middot; Section 04</div>' +
        '<h2 class="sec-title">Key Risk Factors</h2>' +
        '<p class="sec-sub">Material risks mapped against ACH cases.</p>' +
      '</div>' +
    '</div>' +
    risksHtml +
  '</section>';
}
