/**
 * Workstation Section Renderer: 06 Revisions
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import { sanitiseInlineHtml, mapDirectionToClass } from './ws-computed.js';

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
 * Render a single revision row.
 *
 * @param {{ item: string, previous_view: string, current_view: string, direction: string, rationale: string }} rev
 * @returns {string}
 */
function renderRevisionRow(rev) {
  const dirClass = mapDirectionToClass(rev.direction || '');
  const rationaleHtml = sanitiseInlineHtml(rev.rationale || '');

  return (
    '<div class="ws-revision-row">' +
      '<div class="ws-revision-row__item">' + escapeText(rev.item || '') + '</div>' +
      '<div class="ws-revision-row__previous">' + escapeText(rev.previous_view || '') + '</div>' +
      '<div class="ws-revision-row__current ws-revision-row__current--' + escapeText(dirClass) + '">' +
        escapeText(rev.current_view || '') +
      '</div>' +
      '<div class="ws-revision-row__rationale">' + rationaleHtml + '</div>' +
    '</div>'
  );
}

/**
 * Render the 06 Revisions section card.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsRevisions(data) {
  if (!data || !data.revisions) {
    return '<section class="ws-section ws-section--revisions" id="ws-revisions"><p class="ws-section__empty">Revisions data unavailable.</p></section>';
  }

  const revisions = data.revisions;
  const headline = revisions.headline ? escapeText(revisions.headline) : '';
  const items = Array.isArray(revisions.items) ? revisions.items : [];

  const headerRow = (
    '<div class="ws-revision-header">' +
      '<div class="ws-revision-header__item">Item</div>' +
      '<div class="ws-revision-header__previous">Previous view</div>' +
      '<div class="ws-revision-header__current">Current view</div>' +
      '<div class="ws-revision-header__rationale">Rationale</div>' +
    '</div>'
  );

  const rowsHtml = items.map(renderRevisionRow).join('');

  return (
    '<section class="ws-section ws-section--revisions" id="ws-revisions">' +
      '<h2 class="ws-section__heading">06 / Revisions</h2>' +
      '<div class="ws-revisions">' +
        (headline ? '<p class="ws-section__headline">' + headline + '</p>' : '') +
        '<div class="ws-revisions__table">' +
          headerRow +
          rowsHtml +
        '</div>' +
      '</div>' +
    '</section>'
  );
}
