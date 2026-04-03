/**
 * Workstation Section Renderer: 07 Deep Research
 * Pure function. No DOM. No state imports. Returns an HTML string.
 *
 * The collapse/expand toggle is wired up post-render by the page module.
 * The renderer emits the correct structure: body with max-height cap, fade
 * overlay, and an expand button with data-ws-expand="deep-research".
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
 * Render the 07 Deep Research section card.
 *
 * The body container starts collapsed (max-height: 220px via inline style).
 * A .ws-deep-research__fade overlay sits at the bottom to indicate overflow.
 * The expand button carries data-ws-expand="deep-research" for post-render
 * hook targeting. Clicking it adds the .expanded class to the body, which
 * CSS uses to remove the height cap and hide the fade.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsDeepResearch(data) {
  if (!data || !data.deep_research) {
    return '<section class="ws-section ws-section--deep-research" id="ws-deep-research"><p class="ws-section__empty">Deep research data unavailable.</p></section>';
  }

  const dr = data.deep_research;
  const headline = dr.headline ? escapeText(dr.headline) : '';
  const paragraphs = Array.isArray(dr.paragraphs) ? dr.paragraphs : [];

  const paragraphsHtml = paragraphs
    .map(p => '<p class="ws-deep-research__para">' + sanitiseInlineHtml(p) + '</p>')
    .join('');

  return (
    '<section class="ws-section ws-section--deep-research" id="ws-deep-research">' +
      '<h2 class="ws-section__heading">07 / Deep Research</h2>' +
      '<div class="ws-deep-research">' +
        (headline ? '<p class="ws-section__headline">' + headline + '</p>' : '') +
        '<div class="ws-deep-research__body" style="max-height:220px;overflow:hidden">' +
          paragraphsHtml +
          '<div class="ws-deep-research__fade"></div>' +
        '</div>' +
        '<button class="ws-deep-research__expand" data-ws-expand="deep-research" type="button">' +
          'Read more' +
        '</button>' +
      '</div>' +
    '</section>'
  );
}
