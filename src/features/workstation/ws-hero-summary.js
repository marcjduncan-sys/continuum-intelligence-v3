/**
 * Workstation Hero Summary Renderer
 * Renders the summary table (4 rows) and watchlist risk items.
 * Pure function -- no DOM, no state imports, no side effects.
 */

import {
  sanitiseInlineHtml,
  mapSeverityToColour
} from './ws-computed.js';

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
 * Render a single summary table row.
 *
 * @param {string} label      - Row label
 * @param {string} valueHtml  - Pre-sanitised or plain-text value for innerHTML
 * @returns {string}
 */
function renderSummaryRow(label, valueHtml) {
  return (
    '<div class="ws-summary-row">' +
      '<div class="ws-summary-row__label">' + escapeText(label) + '</div>' +
      '<div class="ws-summary-row__value">' + valueHtml + '</div>' +
    '</div>'
  );
}

/**
 * Render a single watchlist item.
 *
 * @param {{ label: string, description: string, severity: string }} item
 * @returns {string}
 */
function renderWatchlistItem(item) {
  const colour      = mapSeverityToColour(item.severity || '');
  const severityText = escapeText(item.severity || '');
  const labelText   = escapeText(item.label || '');
  const descHtml    = sanitiseInlineHtml(item.description || '');

  return (
    '<div class="ws-watchlist-item">' +
      '<span class="ws-severity ws-severity--' + escapeText(colour) + '">' +
        severityText +
      '</span>' +
      '<div class="ws-watchlist-item__label">' + labelText + '</div>' +
      '<div class="ws-watchlist-item__desc">' + descHtml + '</div>' +
    '</div>'
  );
}

/**
 * Render the hero summary section: 4-row summary table and watchlist.
 *
 * @param {Object} data - Full workstation payload (BHP.json shape)
 * @returns {string} HTML string
 */
export function renderWsHeroSummary(data) {
  if (!data || (!data.summary && !data.watchlist)) {
    return '<div class="ws-hero-summary"></div>';
  }

  const summary  = data.summary || {};
  const watchlist = Array.isArray(data.watchlist) ? data.watchlist : [];

  // Summary table rows
  // bottom_line, why_now, decision_rule: LLM prose -- sanitiseInlineHtml
  // what_matters_most: plain text -- escapeText
  const summaryTableHtml =
    '<div class="ws-summary-table">' +
      renderSummaryRow('Bottom line', sanitiseInlineHtml(summary.bottom_line || '')) +
      renderSummaryRow('Why now', sanitiseInlineHtml(summary.why_now || '')) +
      renderSummaryRow('Decision rule', sanitiseInlineHtml(summary.decision_rule || '')) +
      renderSummaryRow('What matters most', escapeText(summary.what_matters_most || '')) +
    '</div>';

  // Watchlist
  const watchlistHtml =
    '<div class="ws-watchlist">' +
      watchlist.map(renderWatchlistItem).join('') +
    '</div>';

  return (
    '<div class="ws-hero-summary">' +
      summaryTableHtml +
      watchlistHtml +
    '</div>'
  );
}
