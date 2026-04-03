/**
 * Workstation Section Renderer: 05 Evidence
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import { sanitiseInlineHtml, mapSeverityToColour } from './ws-computed.js';

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
 * Render a single evidence item.
 *
 * @param {{ category: string, text: string, quality: string }} item
 * @returns {string}
 */
function renderEvidenceItem(item) {
  const colour = mapSeverityToColour(item.quality || '');
  const categoryText = escapeText(item.category || '');
  const qualityText = escapeText(item.quality || '');
  const textHtml = sanitiseInlineHtml(item.text || '');

  return (
    '<div class="ws-evidence-item">' +
      '<div class="ws-evidence-item__header">' +
        '<span class="ws-evidence-item__category">' + categoryText + '</span>' +
        '<span class="ws-quality-tag ws-quality-tag--' + escapeText(colour) + '">' + qualityText + '</span>' +
      '</div>' +
      '<div class="ws-evidence-item__text">' + textHtml + '</div>' +
    '</div>'
  );
}

/**
 * Render the 05 Evidence section card.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsEvidence(data) {
  if (!data || !data.evidence) {
    return '<section class="ws-section ws-section--evidence" id="ws-evidence"><p class="ws-section__empty">Evidence data unavailable.</p></section>';
  }

  const evidence = data.evidence;
  const headline = evidence.headline ? escapeText(evidence.headline) : '';
  const items = Array.isArray(evidence.items) ? evidence.items : [];
  const itemsHtml = items.map(renderEvidenceItem).join('');

  return (
    '<section class="ws-section ws-section--evidence" id="ws-evidence">' +
      '<h2 class="ws-section__heading">05 / Evidence</h2>' +
      '<div class="ws-evidence">' +
        (headline ? '<p class="ws-section__headline">' + headline + '</p>' : '') +
        '<div class="ws-evidence__items">' + itemsHtml + '</div>' +
      '</div>' +
    '</section>'
  );
}
