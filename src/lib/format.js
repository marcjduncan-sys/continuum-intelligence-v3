// ============================================================
// FORMAT.JS -- Formatting helpers extracted from index.html
// Used by ContinuumDynamics and rendering functions throughout
// ============================================================

// --- BEAD-013: Standardised number formatting library ---
// Single source of truth for all numeric display in the platform.
// All .toFixed() calls outside this file and SVG coordinate helpers are bugs.

const SENTINEL = '--';

function _isValid(val) {
  return val !== null && val !== undefined && !Number.isNaN(Number(val));
}

export function formatPrice(val, decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals);
}

export function formatPriceWithCurrency(val, currency = 'A$', decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  return currency + Number(val).toFixed(decimals);
}

export function formatPercent(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals) + '%';
}

export function formatSignedPercent(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  const prefix = num > 0 ? '+' : '';
  return prefix + num.toFixed(decimals) + '%';
}

export function formatChange(val, decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  const prefix = num > 0 ? '+' : '';
  return prefix + num.toFixed(decimals);
}

export function formatRatio(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals) + 'x';
}

export function formatVolume(val) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(0);
}

export function formatMarketCap(val) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
  return '$' + num.toFixed(0);
}

export function formatInteger(val) {
  if (!_isValid(val)) return SENTINEL;
  return Math.round(Number(val)).toLocaleString();
}

export function svgCoord(val) {
  return Number(val).toFixed(1);
}

// --- End BEAD-013 additions ---

/**
 * Format billions: 12.05 -> "12.1B", 0.95 -> "950M", 79.3 -> "79B"
 * @param {number|string} val
 * @returns {string}
 */
export function fmtB(val) {
  val = parseFloat(/** @type {string} */(val)) || 0;
  if (val >= 100) return Math.round(val) + 'B';
  if (val >= 1)   return val.toFixed(1).replace(/\.0$/, '') + 'B';
  return Math.round(val * 1000) + 'M';
}

/**
 * Format price to currency string: fmtPrice(31.41, 'A$') -> "A$31.41"
 * @param {number|string} val
 * @param {string} [currency='A$']
 * @returns {string}
 */
export function fmtPrice(val, currency) {
  val = parseFloat(/** @type {string} */(val)) || 0;
  if (val >= 100) return (currency || 'A$') + val.toFixed(2);
  if (val >= 10)  return (currency || 'A$') + val.toFixed(2);
  return (currency || 'A$') + val.toFixed(2);
}

/**
 * Format percentage (absolute value, rounded): fmtPct(-60) -> "60%"
 * @param {number|string} val
 * @returns {string}
 */
export function fmtPct(val) {
  val = parseFloat(/** @type {string} */(val)) || 0;
  return Math.round(Math.abs(val)) + '%';
}

/**
 * Format P/E ratio: fmtPE(41.3) -> "41.3x", fmtPE(150) -> "~150x"
 * @param {number|string} val
 * @returns {string|null}
 */
export function fmtPE(val) {
  val = parseFloat(/** @type {string} */(val));
  if (!val || !isFinite(val) || val <= 0) return null;
  if (val >= 100) return '~' + Math.round(val) + 'x';
  return val.toFixed(1).replace(/\.0$/, '') + 'x';
}

/**
 * Format signed percentage: signPct(12) -> "+12%", signPct(-5) -> "-5%"
 * @param {number} val
 * @returns {string}
 */
export function signPct(val) {
  return (val >= 0 ? '+' : '') + Math.round(val) + '%';
}

/**
 * Format number with decimals: formatNum(1234567, 1) -> "1.2M"
 * @param {number} n
 * @param {number} decimals
 * @returns {string}
 */
export function formatNum(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  const abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

/**
 * Render SVG sparkline string from price array
 * @param {number[]} prices
 * @returns {string} HTML string with SVG sparkline
 */
/**
 * Convert a UTC date string to AEST/AEDT formatted string.
 * Input formats: "2026-03-15 22:40 UTC", "2026-03-15 22:40", "2026-03-15",
 *                "15 March 2026", "15 Mar 2026"
 * Output: "16-Mar-26 09:40 AEST" (with time) or "16-Mar-26" (date-only inputs)
 */
export function formatDateAEST(utcDateStr) {
  if (!utcDateStr) return '';
  const str = String(utcDateStr).replace(/\s*UTC\s*$/i, '').trim();
  let date;
  let hasTime = false;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const longMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // "2026-03-15 22:40"
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (m) {
    date = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]));
    hasTime = true;
  }
  // "2026-03-15"
  if (!date) {
    m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) date = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], 0, 0));
  }
  // "15 March 2026" or "15 Mar 2026" (case-insensitive)
  if (!date) {
    m = str.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
    if (m) {
      const monName = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
      let monIdx = longMonths.indexOf(monName);
      if (monIdx < 0) {
        for (let i = 0; i < months.length; i++) {
          if (months[i].toLowerCase() === monName.toLowerCase().substring(0, 3)) { monIdx = i; break; }
        }
      }
      if (monIdx >= 0) date = new Date(Date.UTC(+m[3], monIdx, +m[1], 0, 0));
    }
  }
  if (!date || isNaN(date.getTime())) return utcDateStr;
  // Use Intl to get correct AEST/AEDT offset for any date
  const aest = new Date(date.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  const day = String(aest.getDate()).padStart(2, '0');
  const mon = months[aest.getMonth()];
  const year = String(aest.getFullYear()).slice(-2);
  if (hasTime) {
    const hours = String(aest.getHours()).padStart(2, '0');
    const mins = String(aest.getMinutes()).padStart(2, '0');
    return day + '-' + mon + '-' + year + ' ' + hours + ':' + mins + ' AEST';
  }
  return day + '-' + mon + '-' + year;
}

/**
 * Truncate a string at a word boundary to at most maxLen characters.
 * Appends '…' if truncated. Safe to call with null/undefined.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateAtWord(str, maxLen) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  const cut = str.lastIndexOf(' ', maxLen);
  return (cut > maxLen * 0.5 ? str.slice(0, cut) : str.slice(0, maxLen)) + '\u2026';
}

export function renderSparkline(prices) {
  if (!prices || prices.length < 2) return '';
  const w = 280, h = 88, pad = 4;
  let min = prices[0], max = prices[0];
  for (var i = 1; i < prices.length; i++) {
    if (prices[i] < min) min = prices[i];
    if (prices[i] > max) max = prices[i];
  }
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (prices.length - 1);

  let points = '';
  let fillPoints = pad + ',' + (h - pad);
  for (var i = 0; i < prices.length; i++) {
    const x = pad + i * stepX;
    const y = h - pad - ((prices[i] - min) / range) * (h - pad * 2);
    points += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    fillPoints += ' ' + x.toFixed(1) + ',' + y.toFixed(1);
  }
  fillPoints += ' ' + (pad + (prices.length - 1) * stepX).toFixed(1) + ',' + (h - pad);

  const color = prices[prices.length - 1] > prices[0] * 1.02 ? '#00c875' :
              prices[prices.length - 1] < prices[0] * 0.98 ? '#e44258' : '#f5a623';
  const id = 'sp' + Math.random().toString(36).substring(2, 8);

  return '<div class="rh-sparkline">' +
    '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.3"/>' +
        '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>' +
      '</linearGradient></defs>' +
      '<polygon points="' + fillPoints + '" fill="url(#' + id + ')"/>' +
      '<polyline points="' + points.trim() + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>' +
  '</div>';
}

// ============================================================
// BEAD-013: Standardised number formatting library
// Single source of truth for all numeric display in the platform.
// All .toFixed() calls outside this file and SVG coordinate helpers are bugs.
// ============================================================

const SENTINEL = '--';

function _isValid(val) {
  return val !== null && val !== undefined && !Number.isNaN(Number(val));
}

/** Format a raw number to fixed decimals (no currency, no sign prefix). */
export function formatPrice(val, decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals);
}

/** Format a price with currency prefix: formatPriceWithCurrency(31.41) -> "A$31.41" */
export function formatPriceWithCurrency(val, currency = 'A$', decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  return currency + Number(val).toFixed(decimals);
}

/** Format a percentage: formatPercent(12.34) -> "12.3%" */
export function formatPercent(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals) + '%';
}

/** Format a signed percentage: formatSignedPercent(12.34) -> "+12.3%" */
export function formatSignedPercent(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  const prefix = num > 0 ? '+' : '';
  return prefix + num.toFixed(decimals) + '%';
}

/** Format a signed change (no % suffix): formatChange(1.5) -> "+1.50" */
export function formatChange(val, decimals = 2) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  const prefix = num > 0 ? '+' : '';
  return prefix + num.toFixed(decimals);
}

/** Format a ratio with x suffix: formatRatio(1.5) -> "1.5x" */
export function formatRatio(val, decimals = 1) {
  if (!_isValid(val)) return SENTINEL;
  return Number(val).toFixed(decimals) + 'x';
}

/** Format a large volume: formatVolume(1500000) -> "1.5M" */
export function formatVolume(val) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toFixed(0);
}

/** Format a market cap: formatMarketCap(2500000000) -> "$2.50B" */
export function formatMarketCap(val) {
  if (!_isValid(val)) return SENTINEL;
  const num = Number(val);
  if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
  return '$' + num.toFixed(0);
}

/** Format an integer with locale separators: formatInteger(1234567) -> "1,234,567" */
export function formatInteger(val) {
  if (!_isValid(val)) return SENTINEL;
  return Math.round(Number(val)).toLocaleString();
}

/** Format a coordinate for SVG paths (1 decimal, no validation). */
export function svgCoord(val) {
  return Number(val).toFixed(1);
}
