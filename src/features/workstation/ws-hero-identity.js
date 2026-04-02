/**
 * Workstation Hero Identity Renderer
 * Renders the top identity band: ticker badge, company name, meta row, verdict tags.
 * Pure function -- no DOM, no state imports, no side effects.
 */

import { formatDisplayDate } from './ws-computed.js';

/**
 * Escape plain text for safe HTML attribute or text node use.
 * Replaces the five XML/HTML special characters.
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
 * Render the hero identity band for the workstation page.
 *
 * @param {Object} data - Full workstation payload (BHP.json shape)
 * @returns {string} HTML string
 */
export function renderWsHeroIdentity(data) {
  if (!data || !data.identity) return '<div class="ws-hero-identity"></div>';

  const identity = data.identity;
  const verdict = data.verdict || {};

  const ticker      = escapeText(identity.ticker);
  const companyName = escapeText(identity.company_name);
  const exchange    = escapeText(identity.exchange);
  const sector      = escapeText(identity.sector);
  const displayDate = escapeText(formatDisplayDate(identity.updated_date));

  const rating         = verdict.rating || '';
  const ratingSlug     = escapeText(rating.toLowerCase().replace(/\s+/g, '-'));
  const ratingText     = escapeText(rating);
  const skewText       = escapeText(verdict.skew || '');
  const confidencePct  = verdict.confidence_pct !== undefined && verdict.confidence_pct !== null
    ? escapeText(String(verdict.confidence_pct))
    : '';

  return (
    '<div class="ws-hero-identity">' +
      '<span class="ws-ticker-badge">' + ticker + '</span>' +
      '<h1 class="ws-company-name">' + companyName + '</h1>' +
      '<div class="ws-hero-meta">' +
        '<span class="ws-hero-meta__exchange">' + exchange + '</span>' +
        '<span class="ws-hero-meta__sep"> | </span>' +
        '<span class="ws-hero-meta__sector">' + sector + '</span>' +
        '<span class="ws-hero-meta__sep"> | </span>' +
        '<span class="ws-hero-meta__date">' + displayDate + '</span>' +
      '</div>' +
      '<div class="ws-hero-tags">' +
        '<span class="ws-tag ws-tag--' + ratingSlug + '">' + ratingText + '</span>' +
        '<span class="ws-tag ws-tag--skew">' + skewText + '</span>' +
        (confidencePct
          ? '<span class="ws-tag ws-tag--confidence">' + confidencePct + '% confidence</span>'
          : '') +
      '</div>' +
    '</div>'
  );
}
