/**
 * Workstation Section Renderer: 04 Risks
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import { sanitiseInlineHtml } from './ws-computed.js';

/**
 * Escape plain text for safe use in HTML text nodes and attributes.
 *
 * @param {string|null|undefined} val
 * @returns {string}
 */
function escapeText(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalise an impact or probability label to a CSS class suffix.
 * 'High' -> 'high', 'Low-Medium' -> 'lowmedium', 'Medium' -> 'medium', etc.
 *
 * @param {string} label
 * @returns {string}
 */
function normaliseLevelClass(label) {
  if (!label) return '';
  return label.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Render a single risk row.
 *
 * @param {{ risk: string, impact: string, probability: string, decision_relevance: string }} item
 * @returns {string}
 */
function renderRiskRow(item) {
  const riskText = escapeText(item.risk || '');
  const impactText = escapeText(item.impact || '');
  const probText = escapeText(item.probability || '');
  const impactClass = normaliseLevelClass(item.impact || '');
  const probClass = normaliseLevelClass(item.probability || '');
  const relevanceHtml = sanitiseInlineHtml(item.decision_relevance || '');

  return (
    '<tr class="ws-risk-row">' +
      '<td class="ws-risk-row__name">' + riskText + '</td>' +
      '<td class="ws-risk-row__impact">' +
        '<span class="ws-risk-level ws-risk-level--' + impactClass + '">' + impactText + '</span>' +
      '</td>' +
      '<td class="ws-risk-row__prob">' +
        '<span class="ws-risk-level ws-risk-level--' + probClass + '">' + probText + '</span>' +
      '</td>' +
      '<td class="ws-risk-row__relevance">' + relevanceHtml + '</td>' +
    '</tr>'
  );
}

/**
 * Render the 04 Risks section card.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsRisks(data) {
  if (!data || !data.risks) {
    return '<section class="ws-section ws-section--risks" id="ws-risks"><p class="ws-section__empty">Risks data unavailable.</p></section>';
  }

  const risks = data.risks;
  const headline = risks.headline ? escapeText(risks.headline) : '';
  const items = Array.isArray(risks.items) ? risks.items : [];
  const rowsHtml = items.map(renderRiskRow).join('');

  return (
    '<section class="ws-section ws-section--risks" id="ws-risks">' +
      '<h2 class="ws-section__heading">04 / Risks</h2>' +
      '<div class="ws-risks">' +
        (headline ? '<p class="ws-section__headline">' + headline + '</p>' : '') +
        '<table class="ws-risk-table">' +
          '<thead>' +
            '<tr>' +
              '<th>Risk</th>' +
              '<th>Impact</th>' +
              '<th>Probability</th>' +
              '<th>Decision relevance</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            rowsHtml +
          '</tbody>' +
        '</table>' +
      '</div>' +
    '</section>'
  );
}
