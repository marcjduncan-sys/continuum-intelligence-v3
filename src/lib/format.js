// ============================================================
// FORMAT.JS -- Formatting helpers extracted from index.html
// Used by ContinuumDynamics and rendering functions throughout
// ============================================================

/**
 * Format billions: 12.05 -> "12.1B", 0.95 -> "950M", 79.3 -> "79B"
 * @param {number|string} val
 * @returns {string}
 */
export function fmtB(val) {
  val = parseFloat(/** @type {string} */(val)) || 0;
  if (val >= 100) return Math.round(val) + 'B';
  if (val >= 10)  return val.toFixed(1).replace(/\.0$/, '') + 'B';
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
  var str = String(utcDateStr).replace(/\s*UTC\s*$/i, '').trim();
  var date;
  var hasTime = false;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var longMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  // "2026-03-15 22:40"
  var m = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
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
      var monName = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
      var monIdx = longMonths.indexOf(monName);
      if (monIdx < 0) {
        for (var i = 0; i < months.length; i++) {
          if (months[i].toLowerCase() === monName.toLowerCase().substring(0, 3)) { monIdx = i; break; }
        }
      }
      if (monIdx >= 0) date = new Date(Date.UTC(+m[3], monIdx, +m[1], 0, 0));
    }
  }
  if (!date || isNaN(date.getTime())) return utcDateStr;
  // Use Intl to get correct AEST/AEDT offset for any date
  var aest = new Date(date.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
  var day = String(aest.getDate()).padStart(2, '0');
  var mon = months[aest.getMonth()];
  var year = String(aest.getFullYear()).slice(-2);
  if (hasTime) {
    var hours = String(aest.getHours()).padStart(2, '0');
    var mins = String(aest.getMinutes()).padStart(2, '0');
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
  var cut = str.lastIndexOf(' ', maxLen);
  return (cut > maxLen * 0.5 ? str.slice(0, cut) : str.slice(0, maxLen)) + '\u2026';
}

export function renderSparkline(prices) {
  if (!prices || prices.length < 2) return '';
  var w = 280, h = 88, pad = 4;
  var min = prices[0], max = prices[0];
  for (var i = 1; i < prices.length; i++) {
    if (prices[i] < min) min = prices[i];
    if (prices[i] > max) max = prices[i];
  }
  var range = max - min || 1;
  var stepX = (w - pad * 2) / (prices.length - 1);

  var points = '';
  var fillPoints = pad + ',' + (h - pad);
  for (var i = 0; i < prices.length; i++) {
    var x = pad + i * stepX;
    var y = h - pad - ((prices[i] - min) / range) * (h - pad * 2);
    points += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    fillPoints += ' ' + x.toFixed(1) + ',' + y.toFixed(1);
  }
  fillPoints += ' ' + (pad + (prices.length - 1) * stepX).toFixed(1) + ',' + (h - pad);

  var color = prices[prices.length - 1] > prices[0] * 1.02 ? '#00c875' :
              prices[prices.length - 1] < prices[0] * 0.98 ? '#e44258' : '#f5a623';
  var id = 'sp' + Math.random().toString(36).substr(2, 6);

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
