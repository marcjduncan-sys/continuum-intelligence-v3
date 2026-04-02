/**
 * Workstation Barrel Assembler
 * Assembles the complete workstation page HTML from all section renderers.
 * Pure function. No DOM. No state imports. No side effects.
 *
 * The page module (src/pages/workstation.js) handles routing, data loading,
 * boot registration, CSS import, and post-render hooks. This barrel is
 * concerned only with HTML assembly.
 */

import { renderWsHeroIdentity } from './ws-hero-identity.js';
import { renderWsDecisionStrip } from './ws-decision-strip.js';
import { renderWsHeroSummary } from './ws-hero-summary.js';
import { renderWsThesis } from './ws-thesis.js';
import { renderWsScenarios } from './ws-scenarios.js';
import { renderWsValuation } from './ws-valuation.js';
import { renderWsRisks } from './ws-risks.js';
import { renderWsEvidence } from './ws-evidence.js';
import { renderWsRevisions } from './ws-revisions.js';
import { renderWsDeepResearch } from './ws-deep-research.js';
import { renderWsQuality } from './ws-quality.js';
import { renderWsChat } from './ws-chat.js';
import '../../styles/workstation.css';

// Re-export all section renderers so callers can import individual sections
// from the barrel without reaching into individual module files.
export {
  renderWsHeroIdentity,
  renderWsDecisionStrip,
  renderWsHeroSummary,
  renderWsThesis,
  renderWsScenarios,
  renderWsValuation,
  renderWsRisks,
  renderWsEvidence,
  renderWsRevisions,
  renderWsDeepResearch,
  renderWsQuality,
  renderWsChat
};

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

// Section anchor definitions for the subnav. Order matches left-column render order.
const SECTION_ANCHORS = [
  { href: '#ws-thesis',        label: '\u00a701 Thesis' },
  { href: '#ws-scenarios',     label: '\u00a702 Scenarios' },
  { href: '#ws-valuation',     label: '\u00a703 Valuation' },
  { href: '#ws-risks',         label: '\u00a704 Risks' },
  { href: '#ws-evidence',      label: '\u00a705 Evidence' },
  { href: '#ws-revisions',     label: '\u00a706 Revisions' },
  { href: '#ws-deep-research', label: '\u00a707 Deep Research' },
  { href: '#ws-quality',       label: '\u00a708 Quality' }
];

/**
 * Render the topbar for the workstation page.
 * Provides a back link and the current ticker identifier.
 *
 * @param {string} ticker
 * @returns {string}
 */
function renderTopbar(ticker) {
  const safeTicker = escapeText(ticker);
  return (
    '<header class="ws-topbar">' +
      '<div class="ws-topbar__left">' +
        '<a class="ws-topbar__back" href="#home">\u2190 Home</a>' +
      '</div>' +
      '<div class="ws-topbar__right">' +
        '<span class="ws-topbar__ticker">' + safeTicker + '</span>' +
      '</div>' +
    '</header>'
  );
}

/**
 * Render the subnav anchor strip linking to all 8 content sections.
 *
 * @returns {string}
 */
function renderSubnav() {
  const linksHtml = SECTION_ANCHORS
    .map(s => '<a class="ws-subnav__link" href="' + s.href + '">' + s.label + '</a>')
    .join('');

  return (
    '<nav class="ws-subnav" aria-label="Workstation sections">' +
      '<div class="ws-subnav__links">' + linksHtml + '</div>' +
    '</nav>'
  );
}

/**
 * Render the hero band: identity, decision strip, and summary table.
 *
 * @param {Object} data - Full workstation payload
 * @returns {string}
 */
function renderHero(data) {
  return (
    '<div class="ws-hero">' +
      renderWsHeroIdentity(data) +
      renderWsDecisionStrip(data) +
      renderWsHeroSummary(data) +
    '</div>'
  );
}

/**
 * Render the left workspace column containing the 8 research sections.
 *
 * @param {Object} data - Full workstation payload
 * @returns {string}
 */
function renderLeftColumn(data) {
  return (
    '<div class="ws-workspace__left">' +
      renderWsThesis(data) +
      renderWsScenarios(data) +
      renderWsValuation(data) +
      renderWsRisks(data) +
      renderWsEvidence(data) +
      renderWsRevisions(data) +
      renderWsDeepResearch(data) +
      renderWsQuality(data) +
    '</div>'
  );
}

/**
 * Render the right workspace column containing the chat panel.
 *
 * @param {Object} data - Full workstation payload
 * @returns {string}
 */
function renderRightColumn(data) {
  return (
    '<div class="ws-workspace__right">' +
      renderWsChat(data) +
    '</div>'
  );
}

/**
 * Render the complete workstation page HTML.
 * Returns a self-contained HTML string suitable for direct innerHTML assignment.
 *
 * Post-render hooks (compact toggle, section expand/collapse, chat tab
 * filtering, scroll spy) are the responsibility of the page module
 * (src/pages/workstation.js), not this assembler.
 *
 * @param {Object} data - Full workstation payload (BHP.json shape)
 * @returns {string} Complete HTML string for the workstation page
 */
export function renderWorkstationPage(data) {
  if (!data) {
    return '<div class="workstation-page workstation-page--empty"><p>No workstation data available.</p></div>';
  }

  const ticker = (data.identity && data.identity.ticker) ? data.identity.ticker : '';

  return (
    '<div class="workstation-page" data-ticker="' + escapeText(ticker) + '">' +
      renderTopbar(ticker) +
      renderSubnav() +
      renderHero(data) +
      '<div class="ws-workspace">' +
        renderLeftColumn(data) +
        renderRightColumn(data) +
      '</div>' +
    '</div>'
  );
}

/**
 * Render the complete workstation page as a single HTML string.
 *
 * Assembles topbar, subnav, hero band, and two-column workspace
 * (main sections + chat panel) into the standard workstation layout.
 * This is the primary integration entry point used by tests and the page module.
 *
 * @param {Object} data - Full workstation payload (BHP.json shape)
 * @returns {string} Complete HTML string for the workstation page
 */
export function renderWorkstation(data) {
  if (!data || !data.identity) {
    return '<div class="ws-error">No workstation data available.</div>';
  }

  const ticker = escapeText(data.identity.ticker);
  const companyName = escapeText(data.identity.company_name);

  const topbar =
    '<header class="ws-topbar">' +
      '<span class="ws-topbar__ticker">' + ticker + '</span>' +
      '<span class="ws-topbar__company">' + companyName + '</span>' +
    '</header>';

  const subnav =
    '<nav class="ws-subnav">' +
      '<a href="#ws-thesis" class="ws-subnav__link">\u00a701 Thesis</a>' +
      '<a href="#ws-scenarios" class="ws-subnav__link">\u00a702 Scenarios</a>' +
      '<a href="#ws-valuation" class="ws-subnav__link">\u00a703 Valuation</a>' +
      '<a href="#ws-risks" class="ws-subnav__link">\u00a704 Risks</a>' +
      '<a href="#ws-evidence" class="ws-subnav__link">\u00a705 Evidence</a>' +
      '<a href="#ws-revisions" class="ws-subnav__link">\u00a706 Revisions</a>' +
      '<a href="#ws-deep-research" class="ws-subnav__link">\u00a707 Deep Research</a>' +
      '<a href="#ws-quality" class="ws-subnav__link">\u00a708 Quality</a>' +
    '</nav>';

  const heroBand =
    '<div class="ws-hero-band">' +
      renderWsHeroIdentity(data) +
      renderWsDecisionStrip(data) +
      renderWsHeroSummary(data) +
    '</div>';

  const mainColumn =
    '<div class="ws-workspace__main">' +
      renderWsThesis(data) +
      renderWsScenarios(data) +
      renderWsValuation(data) +
      renderWsRisks(data) +
      renderWsEvidence(data) +
      renderWsRevisions(data) +
      renderWsDeepResearch(data) +
      renderWsQuality(data) +
    '</div>';

  const chatColumn =
    '<div class="ws-workspace__chat">' +
      renderWsChat(data) +
    '</div>';

  const workspace =
    '<div class="ws-workspace">' +
      mainColumn +
      chatColumn +
    '</div>';

  return (
    '<div class="workstation-page">' +
      topbar +
      subnav +
      heroBand +
      workspace +
    '</div>'
  );
}
