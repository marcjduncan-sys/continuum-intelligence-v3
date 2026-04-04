// Catalyst Calendar renderer
// Uses next_decision_point and discriminators as seed data
// Falls back to TBC placeholder if insufficient data

export function renderCatalystCalendar(data) {
  const t = data.ticker.toLowerCase();
  let rowsHtml = '';
  let rowCount = 0;

  // Pull next decision point as first catalyst
  const ndp = data.hero && data.hero.next_decision_point;
  if (ndp) {
    rowsHtml += '<tr>' +
      '<td>Upcoming</td>' +
      '<td>' + ndp + '</td>' +
      '<td><span class="tag blue">Key</span></td>' +
      '<td>TBC</td>' +
      '<td>Monitoring</td>' +
    '</tr>';
    rowCount++;
  }

  // Pull discriminators as catalysts
  const disc = data.discriminators;
  if (disc && disc.items && disc.items.length) {
    for (let i = 0; i < disc.items.length && rowCount < 6; i++) {
      const d = disc.items[i];
      const title = d.title || d.label || ('Discriminator ' + (i + 1));
      const detail = d.description || d.detail || d.text || '';
      // Try to infer which case this relates to
      const lowerTitle = title.toLowerCase();
      let caseTag = '<span class="tag blue">Base</span>';
      if (lowerTitle.indexOf('bull') >= 0 || lowerTitle.indexOf('upside') >= 0) {
        caseTag = '<span class="tag green">Bull</span>';
      } else if (lowerTitle.indexOf('bear') >= 0 || lowerTitle.indexOf('downside') >= 0) {
        caseTag = '<span class="tag red">Bear</span>';
      } else if (lowerTitle.indexOf('swing') >= 0) {
        caseTag = '<span class="tag violet">Swing</span>';
      }

      rowsHtml += '<tr>' +
        '<td>TBC</td>' +
        '<td>' + title + (detail ? '<br><span style="font-size:10px;color:var(--muted)">' + detail.substring(0, 120) + '</span>' : '') + '</td>' +
        '<td>' + caseTag + '</td>' +
        '<td>TBC</td>' +
        '<td>Monitoring</td>' +
      '</tr>';
      rowCount++;
    }
  }

  // TBC placeholder if no data
  if (rowCount === 0) {
    rowsHtml = '<tr>' +
      '<td colspan="5" style="text-align:center;padding:24px;color:var(--muted);font-style:italic;">' +
        'Catalyst calendar will be populated once the research pipeline generates forward-looking event data for ' + (data.company || data.ticker) + '.' +
      '</td>' +
    '</tr>';
  }

  return '<section class="section" id="' + t + '-catalysts">' +
    '<div class="section-header">' +
      '<div>' +
        '<div class="eyebrow">Forward Calendar &middot; Section 05</div>' +
        '<h2 class="sec-title">Upcoming Catalysts</h2>' +
        '<p class="sec-sub">Events that could confirm or contradict ACH cases and shift the EWP.</p>' +
      '</div>' +
    '</div>' +
    '<table>' +
      '<thead><tr>' +
        '<th>Date</th><th>Event</th><th>ACH Case</th><th>EWP Impact</th><th>Probability</th>' +
      '</tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
  '</section>';
}
