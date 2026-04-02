/**
 * Workstation Section Renderer: §01 Thesis
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import { sanitiseInlineHtml } from './ws-computed.js';

/**
 * Render the §01 Thesis section card.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsThesis(data) {
  if (!data || !data.thesis) {
    return '<section class="ws-section ws-section--thesis" id="ws-thesis"><p class="ws-section__empty">Thesis data unavailable.</p></section>';
  }

  const thesis = data.thesis;

  const headline = thesis.headline ? thesis.headline : '';
  const bluf = sanitiseInlineHtml(thesis.bluf);
  const narrative = sanitiseInlineHtml(thesis.narrative);

  const conditions = Array.isArray(thesis.decision_frame_conditions)
    ? thesis.decision_frame_conditions
    : [];

  const conditionItems = conditions.length > 0
    ? conditions.map(c => `<li>${sanitiseInlineHtml(c)}</li>`).join('')
    : '';

  const conditionsBlock = conditions.length > 0
    ? `<div class="ws-thesis__conditions">
      <p class="ws-thesis__conditions-label">Decision frame conditions:</p>
      <ol class="ws-thesis__conditions-list">
        ${conditionItems}
      </ol>
    </div>`
    : '';

  return `<section class="ws-section ws-section--thesis" id="ws-thesis">
  <h2 class="ws-section__heading">§01 Thesis</h2>
  <div class="ws-thesis">
    <p class="ws-thesis__headline">${headline}</p>
    <div class="ws-thesis__bluf">${bluf}</div>
    <div class="ws-thesis__narrative">${narrative}</div>
    ${conditionsBlock}
  </div>
</section>`;
}
