/**
 * Workstation Decision Strip Renderer
 * Renders 8 decision cells: Spot, EWP, Base, Bull, Bear, Yield, Key lever, Next catalyst.
 * Pure function -- no DOM, no state imports, no side effects.
 */

import {
  computeEWP,
  computeEWPvSpot,
  sanitiseInlineHtml
} from './ws-computed.js';

import {
  formatPriceWithCurrency,
  formatSignedPercent
} from '../../lib/format.js';

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
 * Render a single decision strip cell.
 *
 * @param {Object} opts
 * @param {string}  opts.modifier     - BEM modifier class (may be empty string)
 * @param {string}  opts.label        - Cell label text
 * @param {string}  opts.value        - Formatted value string
 * @param {string}  opts.subtitle     - Subtitle text (LLM prose -- piped through sanitiseInlineHtml)
 * @param {string}  [opts.valueAttrs] - Extra HTML attributes on the value element
 * @param {string}  [opts.ewpVsSpot]  - Optional EWP-vs-spot HTML block (inserted between value and subtitle)
 * @returns {string}
 */
function renderCell({ modifier, label, value, subtitle, valueAttrs = '', ewpVsSpot = '' }) {
  const baseClass = 'ws-strip-cell' + (modifier ? ' ' + modifier : '');
  return (
    '<div class="' + baseClass + '">' +
      '<div class="ws-strip-cell__label">' + escapeText(label) + '</div>' +
      '<div class="ws-strip-cell__value"' + (valueAttrs ? ' ' + valueAttrs : '') + '>' +
        escapeText(value) +
      '</div>' +
      ewpVsSpot +
      '<div class="ws-strip-cell__subtitle">' + sanitiseInlineHtml(subtitle) + '</div>' +
    '</div>'
  );
}

/**
 * Render the full 8-cell decision strip.
 *
 * @param {Object} data - Full workstation payload (BHP.json shape)
 * @returns {string} HTML string
 */
export function renderWsDecisionStrip(data) {
  if (!data || !data.decision_strip) {
    return '<div class="ws-decision-strip"></div>';
  }

  const ds       = data.decision_strip;
  const scenarios = data.scenarios || [];

  // --- Cell 1: Spot ---
  const spotValue    = ds.spot_price ? ds.spot_price.value : null;
  const spotCurrency = ds.spot_price ? (ds.spot_price.currency || 'A$') : 'A$';
  const spotFormatted = formatPriceWithCurrency(spotValue, spotCurrency);
  const spotSubtitle = ds.spot_price ? (ds.spot_price.subtitle || '') : '';

  const spotCell = renderCell({
    modifier: 'ws-strip-cell--spot',
    label: 'Spot',
    value: spotFormatted,
    subtitle: spotSubtitle,
    valueAttrs: 'data-ws-spot="' + escapeText(String(spotValue !== null ? spotValue : '')) + '"'
  });

  // --- Cell 2: EWP ---
  const ewpCurrency = scenarios.length > 0 ? (scenarios[0].currency || 'A$') : 'A$';
  const ewp         = computeEWP(scenarios);
  const ewpFormatted = formatPriceWithCurrency(ewp, ewpCurrency);

  let ewpVsSpotBlock = '';
  if (ewp !== null && spotValue !== null) {
    const pct = computeEWPvSpot(ewp, spotValue);
    const pctFormatted = formatSignedPercent(pct);
    const rawPct = pct !== null ? String(Math.round(pct * 10) / 10) : '';
    ewpVsSpotBlock =
      '<div class="ws-strip-cell__ewp-vs-spot" data-ws-ewp-pct="' + escapeText(rawPct) + '">' +
        escapeText(pctFormatted) + ' vs spot' +
      '</div>';
  }

  const ewpCell = (
    '<div class="ws-strip-cell ws-strip-cell--ewp">' +
      '<div class="ws-strip-cell__label">EWP</div>' +
      '<div class="ws-strip-cell__value">' + escapeText(ewpFormatted) + '</div>' +
      ewpVsSpotBlock +
      '<div class="ws-strip-cell__subtitle">' +
        sanitiseInlineHtml('Expected weighted price across all scenarios.') +
      '</div>' +
    '</div>'
  );

  // --- Cell 3: Base ---
  const baseCase = ds.base_case || {};
  const baseCell = renderCell({
    modifier: 'ws-strip-cell--base',
    label: 'Base case',
    value: formatPriceWithCurrency(baseCase.value, baseCase.currency || 'A$'),
    subtitle: baseCase.subtitle || ''
  });

  // --- Cell 4: Bull ---
  const bullCase = ds.bull_case || {};
  const bullCell = renderCell({
    modifier: 'ws-strip-cell--bull',
    label: 'Bull case',
    value: formatPriceWithCurrency(bullCase.value, bullCase.currency || 'A$'),
    subtitle: bullCase.subtitle || ''
  });

  // --- Cell 5: Bear ---
  const bearCase = ds.bear_case || {};
  const bearCell = renderCell({
    modifier: 'ws-strip-cell--bear',
    label: 'Bear case',
    value: formatPriceWithCurrency(bearCase.value, bearCase.currency || 'A$'),
    subtitle: bearCase.subtitle || ''
  });

  // --- Cell 6: Yield ---
  const forwardYield = ds.forward_yield || {};
  const yieldCell = renderCell({
    modifier: '',
    label: 'Yield (fwd)',
    value: forwardYield.display_value || '--',
    subtitle: forwardYield.subtitle || ''
  });

  // --- Cell 7: Key lever ---
  const keyLever = ds.key_lever || {};
  const keyLeverCell = renderCell({
    modifier: '',
    label: 'Key lever',
    value: keyLever.value || '--',
    subtitle: keyLever.subtitle || ''
  });

  // --- Cell 8: Next catalyst ---
  const nextCatalyst = ds.next_catalyst || {};
  const nextCatalystCell = renderCell({
    modifier: '',
    label: 'Next catalyst',
    value: nextCatalyst.value || '--',
    subtitle: nextCatalyst.subtitle || ''
  });

  return (
    '<div class="ws-decision-strip">' +
      spotCell +
      ewpCell +
      baseCell +
      bullCell +
      bearCell +
      yieldCell +
      keyLeverCell +
      nextCatalystCell +
    '</div>'
  );
}
