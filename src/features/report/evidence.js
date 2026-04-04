// Evidence section renderers
// Extracted from report-sections.js without logic changes

import { RS_HDR } from './shared.js';

export function renderEvidenceCard(card) {
  if (!card) return '';
  let tableHtml = '';
  if (card.table && card.table.headers && card.table.rows) {
    let thHtml = '';
    for (let h = 0; h < card.table.headers.length; h++) {
      thHtml += '<th>' + card.table.headers[h] + '</th>';
    }
    let tbHtml = '';
    for (let r = 0; r < card.table.rows.length; r++) {
      tbHtml += '<tr>';
      for (let c = 0; c < card.table.rows[r].length; c++) {
        tbHtml += '<td>' + card.table.rows[r][c] + '</td>';
      }
      tbHtml += '</tr>';
    }
    tableHtml = '<table class="identity-table" style="margin-bottom:var(--space-md)">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody>' + tbHtml + '</tbody>' +
    '</table>';
  }

  let tensionHtml = '';
  if (card.tension) {
    tensionHtml = '<div class="ec-tension">' +
      '<div class="ec-tension-label">Key Tension</div>' +
      '<div class="rs-text">' + card.tension + '</div>' +
    '</div>';
  }

  let tagsHtml = '';
  const tags = card.tags || [];
  for (let t = 0; t < tags.length; t++) {
    tagsHtml += '<span class="ec-tag ' + (tags[t].class || '') + '">' + (tags[t].text || '') + '</span>';
  }

  return '<div class="evidence-card">' +
    '<div class="ec-header">' +
      '<div class="ec-title">' + (card.title || '') + '</div>' +
      '<div class="ec-header-right">' +
        '<span class="ec-epistemic ' + (card.epistemicClass || '') + '">' + (card.epistemicLabel || '') + '</span>' +
        '<span class="ec-toggle">&#9660;</span>' +
      '</div>' +
    '</div>' +
    '<div class="ec-body">' +
      tableHtml +
      '<div class="ec-finding">' + (card.finding || '') + '</div>' +
      tensionHtml +
      '<div class="ec-footer">' +
        '<div class="ec-tags">' + tagsHtml + '</div>' +
        '<div class="ec-source">' + (card.source || '') + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

export function renderAlignmentSummary(data) {
  const as = data.evidence && data.evidence.alignmentSummary;
  if (!as || typeof as !== 'object' || !Array.isArray(as.headers) || !Array.isArray(as.rows)) return '';

  let thHtml = '';
  for (let h = 0; h < as.headers.length; h++) {
    thHtml += '<th>' + as.headers[h] + '</th>';
  }

  let tbHtml = '';
  for (let i = 0; i < as.rows.length; i++) {
    const row = as.rows[i];

    const cellFn = function(cell) {
      const styleAttr = cell.style ? ' style="' + cell.style + '"' : '';
      return '<td class="' + cell.class + '"' + styleAttr + '>' + cell.text + '</td>';
    };

    tbHtml += '<tr>' +
      '<td>' + row.domain + '</td>' +
      '<td style="color:var(--muted)">' + row.epistemic + '</td>' +
      cellFn(row.n1) +
      cellFn(row.n2) +
      cellFn(row.n3) +
      cellFn(row.n4) +
    '</tr>';
  }

  const sum = as.summary;
  tbHtml += '<tr style="font-weight:700">' +
    '<td>Domain Count</td>' +
    '<td></td>' +
    '<td style="font-family:var(--font-mono)">' + sum.n1 + '</td>' +
    '<td style="font-family:var(--font-mono)' + (sum.n2Color ? ';color:' + sum.n2Color : '') + '">' + sum.n2 + '</td>' +
    '<td style="font-family:var(--font-mono)' + (sum.n3Color ? ';color:' + sum.n3Color : '') + '">' + sum.n3 + '</td>' +
    '<td style="font-family:var(--font-mono)">' + sum.n4 + '</td>' +
  '</tr>';

  return '<div class="rs-subtitle">Evidence Alignment Summary</div>' +
    '<table class="evidence-table">' +
      '<thead><tr>' + thHtml + '</tr></thead>' +
      '<tbody>' + tbHtml + '</tbody>' +
    '</table>';
}

export function renderEvidence(data) {
  const ev = data.evidence;
  if (!ev) return '';
  const t = data.ticker.toLowerCase();
  const cards = ev.cards || [];

  let cardsHtml = '';
  for (let i = 0; i < cards.length; i++) {
    cardsHtml += renderEvidenceCard(cards[i]);
  }

  const alignmentHtml = renderAlignmentSummary(data);

  return '<div class="report-section" id="' + t + '-evidence">' +
    RS_HDR('Section 04', 'Cross-Domain Evidence Synthesis') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + (ev.intro || '') + '</div>' +
    cardsHtml +
    alignmentHtml +
  '</div></div>';
}

export function renderDiscriminators(data) {
  const d = data.discriminators;
  if (!d || !d.rows || !d.rows.length) return '';
  const t = data.ticker.toLowerCase();

  let rowsHtml = '';
  for (let i = 0; i < d.rows.length; i++) {
    const r = d.rows[i];
    rowsHtml += '<tr>' +
      '<td><span class="' + (r.diagnosticityClass || '') + '">' + (r.diagnosticity || '') + '</span></td>' +
      '<td>' + (r.evidence || '') + '</td>' +
      '<td>' + (r.discriminatesBetween || '') + '</td>' +
      '<td class="' + (r.readingClass || '') + '">' + (r.currentReading || '') + '</td>' +
    '</tr>';
  }

  return '<div class="report-section" id="' + t + '-discriminates">' +
    RS_HDR('Section 05', 'What Discriminates') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + (d.intro || '') + '</div>' +
    '<table class="disc-table">' +
      '<thead><tr><th>Diagnosticity</th><th>Evidence</th><th>Discriminates Between</th><th>Current Reading</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
    (d.nonDiscriminating ? '<div class="callout warn">' +
      '<div class="callout-label">Non-Discriminating Evidence &mdash; Assessed &amp; Discarded</div>' +
      '<div class="callout-body">' + d.nonDiscriminating + '</div>' +
    '</div>' : '') +
  '</div></div>';
}

export function renderTripwires(data) {
  const t = data.ticker.toLowerCase();
  const tw = data.tripwires;
  if (!tw || !tw.cards) return '';

  let cardsHtml = '';
  for (let i = 0; i < tw.cards.length; i++) {
    const card = tw.cards[i];
    if (!card) continue;
    const cardName = card.name || '';

    let conditionsHtml = '';
    const conditions = card.conditions || [];
    for (let c = 0; c < conditions.length; c++) {
      const cond = conditions[c];
      conditionsHtml += '<div class="tw-condition">' +
        '<div class="tw-cond-if ' + cond.valence + '">' + cond.if + '</div>' +
        '<div class="tw-cond-then">' + cond.then + '</div>' +
      '</div>';
    }

    const resolvedCls = cardName.indexOf('RESOLVED') >= 0 ? ' tw-resolved' : '';

    cardsHtml += '<div class="tw-card' + resolvedCls + '">' +
      '<div class="tw-header"><div class="tw-date">' + (card.date || '') + '</div><div class="tw-name">' + cardName + '</div></div>' +
      '<div class="tw-conditions">' + conditionsHtml + '</div>' +
      '<div class="tw-source">' + (card.source || '') + '</div>' +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-tripwires">' +
    RS_HDR('Section 06', 'What We\'re Watching') +
    '<div class="rs-body">' +
    '<div class="rs-text">' + tw.intro + '</div>' +
    cardsHtml +
  '</div></div>';
}

export function renderGaps(data) {
  const g = data.gaps;
  if (!g || !g.coverageRows || !g.coverageRows.length) return '';
  const t = data.ticker.toLowerCase();

  let coverageHtml = '';
  for (let i = 0; i < g.coverageRows.length; i++) {
    const r = g.coverageRows[i];
    const confClass = r.confidenceClass ? ' class="' + r.confidenceClass + '"' : '';
    coverageHtml += '<tr>' +
      '<td>' + r.domain + '</td>' +
      '<td><span class="gap-dot ' + r.coverageLevel + '"></span>' + r.coverageLabel + '</td>' +
      '<td style="font-family:var(--font-mono)">' + r.freshness + '</td>' +
      '<td' + confClass + '>' + r.confidence + '</td>' +
    '</tr>';
  }

  const couldntAssess = g.couldntAssess || [];
  let calloutsHtml = '';
  if (couldntAssess.length) {
    let listItems = '';
    for (let j = 0; j < couldntAssess.length; j++) {
      listItems += '<li>' + couldntAssess[j] + '</li>';
    }
    calloutsHtml = '<div class="callout"><ul class="gaps-list">' + listItems + '</ul></div>';
  }

  return '<div class="report-section" id="' + t + '-gaps">' +
    RS_HDR('Section 07', 'Evidence Gaps &amp; Integrity Notes') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">Domain Coverage Assessment</div>' +
    '<table class="gaps-table">' +
      '<thead><tr><th>Domain</th><th>Coverage</th><th>Freshness</th><th>Confidence</th></tr></thead>' +
      '<tbody>' + coverageHtml + '</tbody>' +
    '</table>' +
    '<div class="rs-subtitle">What We Couldn\'t Assess</div>' +
    calloutsHtml +
    (g.analyticalLimitations ? '<div class="rs-subtitle">Analytical Limitations</div>' +
    '<div class="rs-text">' + g.analyticalLimitations + '</div>' : '') +
  '</div></div>';
}
