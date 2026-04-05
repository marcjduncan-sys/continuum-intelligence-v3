/**
 * Workstation Computed Values
 * Pure utility functions for EWP, bridge widths, colour mappings, and HTML sanitisation.
 * No side effects, no DOM, no state imports.
 */

import { formatNum } from '../../lib/format.js';

// ============================================================================
// EWP (Expected Weighted Price) Functions
// ============================================================================

/**
 * Compute Expected Weighted Price from scenarios.
 * Returns null if any target_price is null, undefined, or array is empty.
 *
 * @param {Array<{probability: number, target_price: number|null}>} scenarios
 * @returns {number|null}
 */
export function computeEWP(scenarios) {
  if (!scenarios || scenarios.length === 0) return null;
  for (const s of scenarios) {
    if (s.target_price === null || s.target_price === undefined) return null;
  }
  return scenarios.reduce((sum, s) => sum + s.probability * s.target_price, 0);
}

/**
 * Compute EWP vs spot price as a percentage.
 * Returns null if inputs are invalid or spot price is zero.
 *
 * @param {number|null} ewp
 * @param {number|null} spotPrice
 * @returns {number|null}
 */
export function computeEWPvSpot(ewp, spotPrice) {
  if (ewp === null || ewp === undefined || spotPrice === null || spotPrice === undefined || spotPrice === 0) {
    return null;
  }
  return ((ewp - spotPrice) / spotPrice) * 100;
}

// ============================================================================
// Bridge Widths
// ============================================================================

/**
 * Compute bar widths as percentages of maximum price.
 * Adds a widthPct property to each item. Returns new array, does not mutate input.
 *
 * @param {Array<{price: number}>} bridgeItems
 * @returns {Array<{price: number, widthPct: number}>}
 */
export function computeBridgeWidths(bridgeItems) {
  if (!bridgeItems || bridgeItems.length === 0) return [];
  const maxPrice = Math.max(...bridgeItems.map(b => b.price));
  if (maxPrice === 0) return bridgeItems.map(b => ({ ...b, widthPct: 0 }));
  return bridgeItems.map(b => ({
    ...b,
    widthPct: Math.round((b.price / maxPrice) * 100)
  }));
}

// ============================================================================
// Colour Mappings
// ============================================================================

const SEVERITY_COLOUR_MAP = {
  'High': 'red',
  'Critical': 'red',
  'Medium': 'amber',
  'Needs market proof': 'amber',
  'Low': 'green',
  'Directional': 'green',
  'Supportive': 'blue',
  'High quality': 'blue'
};

/**
 * Map a severity label to a colour name.
 * Returns empty string if severity not recognised.
 *
 * @param {string} severity
 * @returns {string}
 */
export function mapSeverityToColour(severity) {
  return SEVERITY_COLOUR_MAP[severity] || '';
}

const DIRECTION_CLASS_MAP = {
  'positive': 'pos',
  'negative': 'neg',
  'neutral': 'neu'
};

/**
 * Map a direction label to a CSS class name.
 * Returns empty string if direction not recognised.
 *
 * @param {string} direction
 * @returns {string}
 */
export function mapDirectionToClass(direction) {
  return DIRECTION_CLASS_MAP[direction] || '';
}

const SCENARIO_STYLE_MAP = {
  'bull': 'bull',
  'base': 'base',
  'bear': 'bear',
  'stretch': 'stretch',
  'stress': 'stretch'
};

/**
 * Map a scenario style to a CSS class name.
 * Returns empty string if style not recognised.
 *
 * @param {string} style
 * @returns {string}
 */
export function mapScenarioStyle(style) {
  return SCENARIO_STYLE_MAP[style] || '';
}

// ============================================================================
// Scenario Sorting
// ============================================================================

const SCENARIO_ORDER = {
  'bull': 0,
  'base': 1,
  'bear': 2,
  'stretch': 3,
  'stress': 4
};

/**
 * Sort scenarios in canonical order (bull, base, bear, stretch, stress).
 * Does not mutate input array.
 *
 * @param {Array<{style: string}>} scenarios
 * @returns {Array<{style: string}>}
 */
export function sortScenarios(scenarios) {
  return [...scenarios].sort((a, b) => (SCENARIO_ORDER[a.style] ?? 99) - (SCENARIO_ORDER[b.style] ?? 99));
}

// ============================================================================
// EWP Footnote
// ============================================================================

/**
 * Build a formatted footnote explaining EWP calculation.
 * Scenarios are sorted before generating the footnote.
 *
 * @param {Array<{style: string, probability: number, target_price: number}>} scenarios
 * @param {number} ewp
 * @param {string} currency - currency symbol (default 'A$')
 * @returns {string}
 */
export function buildEWPFootnote(scenarios, ewp, currency = 'A$') {
  const sorted = sortScenarios(scenarios);
  const parts = sorted.map(s => {
    const pct = Math.round(s.probability * 100);
    return pct + '% x ' + currency + formatNum(s.target_price, 0);
  });
  return 'Weighted outcome: ' + currency + formatNum(ewp, 2) + ' = ' + parts.join(' + ') + '.';
}

// ============================================================================
// innerHTML Sanitiser (CRITICAL XSS BOUNDARY)
// ============================================================================

/**
 * Sanitise a string for safe innerHTML injection.
 * ONLY allows <strong>, </strong>, <br>, and <br/> tags.
 * Strips ALL other HTML tags, including event handler attributes.
 * Returns empty string for null/undefined/non-string inputs.
 *
 * This is a BOUNDARY function at the XSS entry point.
 *
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function sanitiseInlineHtml(str) {
  if (str === null || str === undefined) return '';
  if (typeof str !== 'string') return '';
  if (str === '') return '';

  // Step 1: Replace allowed tags with placeholders (before stripping other tags)
  const STRONG_OPEN = '\u0000STRONG_OPEN\u0000';
  const STRONG_CLOSE = '\u0000STRONG_CLOSE\u0000';
  const BR_TAG = '\u0000BR_TAG\u0000';

  let result = str;

  // Match <strong> with any attributes (strip attributes for safety)
  result = result.replace(/<strong\b[^>]*>/gi, STRONG_OPEN);
  result = result.replace(/<\/strong>/gi, STRONG_CLOSE);

  // Match <br>, <br/>, <br />, etc.
  result = result.replace(/<br\s*\/?>/gi, BR_TAG);

  // Step 2: Strip ALL remaining HTML tags (anything in angle brackets)
  result = result.replace(/<[^>]*>/g, '');

  // Step 3: Restore allowed tags (clean, no attributes or contents)
  // Escape the null characters for regex use
  const strongOpenEscaped = STRONG_OPEN.replace(/\u0000/g, '\\u0000');
  const strongCloseEscaped = STRONG_CLOSE.replace(/\u0000/g, '\\u0000');
  const brEscaped = BR_TAG.replace(/\u0000/g, '\\u0000');

  result = result.replace(new RegExp(strongOpenEscaped, 'g'), '<strong>');
  result = result.replace(new RegExp(strongCloseEscaped, 'g'), '</strong>');
  result = result.replace(new RegExp(brEscaped, 'g'), '<br>');

  return result;
}

// ============================================================================
// Date Formatting
// ============================================================================

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Format an ISO date string (YYYY-MM-DD) to display format (D Month YYYY).
 * Returns the input if it cannot be parsed.
 * Returns empty string for null/undefined.
 *
 * @param {string|null|undefined} isoDate
 * @returns {string}
 */
export function formatDisplayDate(isoDate) {
  if (!isoDate || typeof isoDate !== 'string') return isoDate || '';

  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12) {
    return isoDate;
  }

  return day + ' ' + MONTHS[month - 1] + ' ' + year;
}
