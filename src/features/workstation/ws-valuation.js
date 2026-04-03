/**
 * Workstation Section Renderer: 03 Valuation
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import {
  sanitiseInlineHtml,
  computeBridgeWidths
} from './ws-computed.js';
import { formatPriceWithCurrency } from '../../lib/format.js';

/**
 * Render bridge bar rows.
 *
 * @param {Array<{label: string, price: number, currency: string, style: string, value_class: string, widthPct: number}>} items
 * @returns {string} HTML string.
 */
function renderBridge(items) {
  return items.map(item => {
    const priceDisplay = formatPriceWithCurrency(item.price, item.currency);
    return `<div class="ws-bridge-bar ws-bridge-bar--${item.style}">
      <span class="ws-bridge-bar__label">${item.label}</span>
      <div class="ws-bridge-bar__track">
        <div class="ws-bridge-bar__fill" style="width:${item.widthPct}%"></div>
      </div>
      <span class="ws-bridge-bar__value ${item.value_class}">${priceDisplay}</span>
    </div>`;
  }).join('');
}

/**
 * Render the sensitivity table body rows.
 *
 * @param {Array<{driver: string, base_deck: string, sensitivity_range: string, equity_effect: string}>} rows
 * @returns {string} HTML string.
 */
function renderSensitivityRows(rows) {
  return rows.map(row => `<tr>
      <td>${row.driver}</td>
      <td>${row.base_deck}</td>
      <td>${row.sensitivity_range}</td>
      <td>${row.equity_effect}</td>
    </tr>`).join('');
}

/**
 * Render the 03 Valuation section.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsValuation(data) {
  if (!data || !data.valuation) {
    return '<section class="ws-section ws-section--valuation" id="ws-valuation"><p class="ws-section__empty">Valuation data unavailable.</p></section>';
  }

  const val = data.valuation;
  const headline = val.headline ? val.headline : '';

  const bridgeItems = Array.isArray(val.bridge) ? computeBridgeWidths(val.bridge) : [];
  const bridgeHtml = bridgeItems.length > 0
    ? `<div class="ws-bridge">${renderBridge(bridgeItems)}</div>`
    : '';

  const narrativeHtml = val.narrative
    ? `<div class="ws-valuation__narrative">${sanitiseInlineHtml(val.narrative)}</div>`
    : '';

  const sensitivities = Array.isArray(val.sensitivities) ? val.sensitivities : [];
  const tableHtml = sensitivities.length > 0
    ? `<table class="ws-sensitivity">
      <thead>
        <tr>
          <th>Driver</th>
          <th>Base deck</th>
          <th>Sensitivity</th>
          <th>Equity effect</th>
        </tr>
      </thead>
      <tbody>
        ${renderSensitivityRows(sensitivities)}
      </tbody>
    </table>
    <p class="ws-sensitivity__footnote">${val.footnote ? val.footnote : ''}</p>`
    : '';

  return `<section class="ws-section ws-section--valuation" id="ws-valuation">
  <h2 class="ws-section__heading">03 / Valuation</h2>
  <p class="ws-section__headline">${headline}</p>
  <div class="ws-valuation">
    ${bridgeHtml}
    ${narrativeHtml}
    ${tableHtml}
  </div>
</section>`;
}
