/**
 * Workstation Section Renderer: §02 Scenarios
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import {
  sanitiseInlineHtml,
  computeEWP,
  mapScenarioStyle,
  sortScenarios,
  buildEWPFootnote
} from './ws-computed.js';
import { formatPercent, formatPriceWithCurrency } from '../../lib/format.js';

/**
 * Render a single scenario card.
 *
 * @param {{ case_name: string, probability: number, target_price: number, currency: string, description: string, style: string }} scenario
 * @returns {string} HTML string.
 */
function renderScenarioCard(scenario) {
  const styleClass = mapScenarioStyle(scenario.style);
  const probDisplay = formatPercent(scenario.probability * 100, 0);
  const priceDisplay = formatPriceWithCurrency(scenario.target_price, scenario.currency);
  const descHtml = sanitiseInlineHtml(scenario.description);

  return `<div class="ws-scenario-card ws-scenario-card--${styleClass}">
    <div class="ws-scenario-card__header">
      <span class="ws-scenario-card__name">${scenario.case_name}</span>
      <span class="ws-scenario-card__prob">${probDisplay}</span>
    </div>
    <div class="ws-scenario-card__price">${priceDisplay}</div>
    <div class="ws-scenario-card__desc">${descHtml}</div>
  </div>`;
}

/**
 * Render the §02 Scenarios section.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsScenarios(data) {
  if (!data || !Array.isArray(data.scenarios)) {
    return '<section class="ws-section ws-section--scenarios" id="ws-scenarios"><p class="ws-section__empty">Scenario data unavailable.</p></section>';
  }

  if (data.scenarios.length === 0) {
    return '<section class="ws-section ws-section--scenarios" id="ws-scenarios"><p class="ws-section__empty">No scenarios defined.</p></section>';
  }

  const sorted = sortScenarios(data.scenarios);
  const cardHtml = sorted.map(renderScenarioCard).join('');

  const ewp = computeEWP(data.scenarios);
  const currency = (data.scenarios[0] && data.scenarios[0].currency) ? data.scenarios[0].currency : 'A$';
  const footnoteHtml = ewp !== null
    ? `<p class="ws-scenarios__footnote">${buildEWPFootnote(data.scenarios, ewp, currency)}</p>`
    : '';

  return `<section class="ws-section ws-section--scenarios" id="ws-scenarios">
  <h2 class="ws-section__heading">§02 Scenarios</h2>
  <div class="ws-scenarios__grid">
    ${cardHtml}
  </div>
  ${footnoteHtml}
</section>`;
}
