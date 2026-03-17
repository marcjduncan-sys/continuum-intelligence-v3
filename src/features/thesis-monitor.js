/**
 * thesis-monitor.js -- Thesis Integrity Monitor
 *
 * Alert generation (pure functions), localStorage state management,
 * and pipeline integration (checkForAlerts).
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a score string like "55%" into a number (55).
 * Returns 0 if unparseable.
 */
function parseScore(score) {
  if (typeof score === 'number') return score;
  if (typeof score === 'string') return parseFloat(score) || 0;
  return 0;
}

/**
 * Find the highest-scoring hypothesis in the research data.
 * Returns { tier, score, direction } or null.
 */
function findDominantHypothesis(hypotheses) {
  if (!hypotheses || hypotheses.length === 0) return null;
  var best = null;
  var bestScore = -1;
  for (var i = 0; i < hypotheses.length; i++) {
    var s = parseScore(hypotheses[i].score);
    if (s > bestScore) {
      bestScore = s;
      best = hypotheses[i];
    }
  }
  if (!best) return null;
  return { tier: best.tier, score: bestScore, direction: best.direction || 'downside' };
}

/**
 * Find a hypothesis by tier identifier.
 */
function findHypothesis(hypotheses, tier) {
  if (!hypotheses) return null;
  for (var i = 0; i < hypotheses.length; i++) {
    if (hypotheses[i].tier === tier) return hypotheses[i];
  }
  return null;
}

/**
 * Map bias direction to expected skew direction.
 * bullish -> upside, bearish -> downside, neutral -> balanced
 */
function biasToSkewDirection(bias) {
  if (bias === 'bullish') return 'upside';
  if (bias === 'bearish') return 'downside';
  return 'balanced';
}

/**
 * Count evidence items for a hypothesis (supporting + contradicting arrays).
 */
function countEvidence(hypothesis) {
  var count = 0;
  if (hypothesis.supporting) count += hypothesis.supporting.length;
  if (hypothesis.contradicting) count += hypothesis.contradicting.length;
  return count;
}

/**
 * Generate a date string for deterministic IDs (YYYYMMDD).
 */
function dateStr(timestamp) {
  var d = new Date(timestamp);
  var y = d.getUTCFullYear();
  var m = String(d.getUTCMonth() + 1).padStart(2, '0');
  var day = String(d.getUTCDate()).padStart(2, '0');
  return '' + y + m + day;
}

// ---------------------------------------------------------------------------
// Alert generation
// ---------------------------------------------------------------------------

/**
 * Generate thesis integrity alerts by comparing user thesis against stock data.
 *
 * @param {Object} userThesis - User's thesis position on a stock
 * @param {string} userThesis.ticker - Stock ticker
 * @param {string} userThesis.dominantHypothesis - Tier the user believes (e.g. 'N2')
 * @param {number[]} userThesis.probabilitySplit - User's probability assignments per hypothesis
 * @param {string} userThesis.biasDirection - 'bullish' | 'bearish' | 'neutral'
 * @param {string} [userThesis.keyAssumption] - Free text assumption
 * @param {string} userThesis.source - 'explicit' | 'inferred'
 * @param {string} userThesis.confidence - 'high' | 'low'
 *
 * @param {Object} stockData - STOCK_DATA[ticker] object
 * @param {Array} stockData.hypotheses - Array of hypothesis objects with tier, score, direction, supporting, contradicting
 * @param {Object} [stockData._skew] - Computed skew: { bull, bear, score, direction }
 * @param {Object} [stockData.skew] - Raw skew: { direction, rationale }
 *
 * @param {Object} [lastReviewedEvidence] - Map of { tier: evidenceCount } at last review
 *
 * @returns {Array} Array of alert objects
 */
export function generateAlerts(userThesis, stockData, lastReviewedEvidence) {
  if (!userThesis || !stockData || !stockData.hypotheses) return [];

  var alerts = [];
  var ticker = userThesis.ticker;
  var now = new Date().toISOString();
  var ds = dateStr(Date.now());
  var hypotheses = stockData.hypotheses;

  // Resolve skew: prefer computed _skew, fall back to raw skew
  var skew = stockData._skew || stockData.skew || null;
  var skewDirection = skew ? (skew.direction || 'balanced') : 'balanced';
  // For computed _skew, magnitude is Math.abs(score)/100; for raw skew, no magnitude available
  var skewMagnitude = (skew && typeof skew.score === 'number')
    ? Math.abs(skew.score) / 100
    : 0;

  var dominant = findDominantHypothesis(hypotheses);

  // Only generate conflict alerts for explicit/high-confidence theses.
  // Inferred theses generate signals only.
  var isExplicit = userThesis.source === 'explicit' || userThesis.confidence === 'high';

  // -------------------------------------------------------------------
  // Rule 1: Hypothesis dominance mismatch
  // -------------------------------------------------------------------
  if (dominant && userThesis.dominantHypothesis) {
    var userHyp = findHypothesis(hypotheses, userThesis.dominantHypothesis);
    var userScore = userHyp ? parseScore(userHyp.score) : 0;
    var gap = dominant.score - userScore;

    if (dominant.tier !== userThesis.dominantHypothesis && gap > 15) {
      var materiality = gap > 30 ? 'high' : 'medium';
      var alertType = isExplicit ? 'conflict' : 'signal';

      alerts.push({
        id: ticker + '-' + alertType + '-dominance-' + ds,
        ticker: ticker,
        type: alertType,
        summary: 'Your thesis favours ' + userThesis.dominantHypothesis + '. The data says ' + dominant.tier + ' leads at ' + dominant.score + '%.',
        detail: 'Your dominant hypothesis (' + userThesis.dominantHypothesis + ') scores ' + userScore + '%. The research data\u2019s highest-scoring hypothesis (' + dominant.tier + ') scores ' + dominant.score + '%, a gap of ' + Math.round(gap) + ' points.',
        sourceHypothesis: dominant.tier,
        userHypothesis: userThesis.dominantHypothesis,
        materiality: materiality,
        timestamp: now,
        status: 'new'
      });
    }
  }

  // -------------------------------------------------------------------
  // Rule 2: Skew contradicts bias direction
  // -------------------------------------------------------------------
  if (skew && userThesis.biasDirection && userThesis.biasDirection !== 'neutral') {
    var expectedDirection = biasToSkewDirection(userThesis.biasDirection);
    var contradicts = (
      (expectedDirection === 'upside' && skewDirection === 'downside') ||
      (expectedDirection === 'downside' && skewDirection === 'upside')
    );

    if (contradicts && skewMagnitude > 0.10) {
      var skewMateriality = skewMagnitude > 0.20 ? 'high' : 'medium';
      var skewAlertType = isExplicit ? 'conflict' : 'signal';

      alerts.push({
        id: ticker + '-' + skewAlertType + '-skew-' + ds,
        ticker: ticker,
        type: skewAlertType,
        summary: 'You are ' + userThesis.biasDirection + '. The skew points ' + skewDirection + ' (' + Math.round(skewMagnitude * 100) + '% magnitude).',
        detail: 'Your bias direction is ' + userThesis.biasDirection + ' but the computed skew direction is ' + skewDirection + ' with ' + Math.round(skewMagnitude * 100) + '% magnitude, exceeding the 10% threshold.',
        sourceHypothesis: null,
        userHypothesis: userThesis.dominantHypothesis,
        materiality: skewMateriality,
        timestamp: now,
        status: 'new'
      });
    }
  }

  // -------------------------------------------------------------------
  // Rule 3: Low score on user's weighted hypothesis
  // If any hypothesis the user assigned >25% probability to scores below 30%
  // in the research data, generate a signal.
  // -------------------------------------------------------------------
  if (userThesis.probabilitySplit && userThesis.probabilitySplit.length > 0) {
    for (var i = 0; i < hypotheses.length && i < userThesis.probabilitySplit.length; i++) {
      var userProb = userThesis.probabilitySplit[i];
      if (userProb > 25) {
        var researchScore = parseScore(hypotheses[i].score);
        if (researchScore < 30) {
          alerts.push({
            id: ticker + '-signal-lowscore-' + hypotheses[i].tier + '-' + ds,
            ticker: ticker,
            type: 'signal',
            summary: hypotheses[i].tier + ' scores only ' + researchScore + '% in the research, but you assigned it ' + userProb + '% probability.',
            detail: 'Hypothesis ' + hypotheses[i].tier + ' (' + (hypotheses[i].title || '') + ') has a research score of ' + researchScore + '%, well below your ' + userProb + '% probability assignment. This divergence may warrant review.',
            sourceHypothesis: hypotheses[i].tier,
            userHypothesis: userThesis.dominantHypothesis,
            materiality: 'medium',
            timestamp: now,
            status: 'new'
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Rule 4: New evidence since last review
  // If a hypothesis has gained 2+ evidence items since the user last reviewed.
  // -------------------------------------------------------------------
  if (lastReviewedEvidence && typeof lastReviewedEvidence === 'object') {
    for (var j = 0; j < hypotheses.length; j++) {
      var tier = hypotheses[j].tier;
      var currentCount = countEvidence(hypotheses[j]);
      var previousCount = lastReviewedEvidence[tier];
      if (typeof previousCount === 'number' && (currentCount - previousCount) >= 2) {
        alerts.push({
          id: ticker + '-signal-newevidence-' + tier + '-' + ds,
          ticker: ticker,
          type: 'signal',
          summary: tier + ' has ' + (currentCount - previousCount) + ' new evidence items since your last review.',
          detail: 'Hypothesis ' + tier + ' had ' + previousCount + ' evidence items at last review and now has ' + currentCount + '. Review the new evidence to assess impact on your thesis.',
          sourceHypothesis: tier,
          userHypothesis: userThesis.dominantHypothesis,
          materiality: 'low',
          timestamp: now,
          status: 'new'
        });
      }
    }
  }

  // -------------------------------------------------------------------
  // Rule 5: Thesis alignment (confirmation)
  // User's dominant hypothesis IS the highest-scoring AND skew matches bias.
  // Logged as confirmation, not surfaced as notification.
  // -------------------------------------------------------------------
  if (dominant && userThesis.dominantHypothesis === dominant.tier) {
    var biasMatchesSkew = (
      userThesis.biasDirection === 'neutral' ||
      !userThesis.biasDirection ||
      biasToSkewDirection(userThesis.biasDirection) === skewDirection ||
      skewDirection === 'balanced'
    );

    if (biasMatchesSkew) {
      alerts.push({
        id: ticker + '-confirmation-aligned-' + ds,
        ticker: ticker,
        type: 'confirmation',
        summary: 'Your thesis on ' + ticker + ' aligns with the research data. ' + dominant.tier + ' leads at ' + dominant.score + '%.',
        detail: 'Your dominant hypothesis (' + userThesis.dominantHypothesis + ') is the highest-scoring hypothesis and the skew direction is consistent with your bias.',
        sourceHypothesis: dominant.tier,
        userHypothesis: userThesis.dominantHypothesis,
        materiality: 'low',
        timestamp: now,
        status: 'new'
      });
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// localStorage keys
// ---------------------------------------------------------------------------

var KEY_PREFIX = 'ci_thesis_alerts_';
var KEY_LOG = 'ci_thesis_alerts_log';
var KEY_LAST_CHECK = 'ci_thesis_alerts_lastCheck';
var PRUNE_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Safe localStorage wrappers
// ---------------------------------------------------------------------------

function _lsGet(key) {
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

function _lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (_e) {
    // localStorage full or disabled; fail silently
  }
}

// ---------------------------------------------------------------------------
// Pruning
// ---------------------------------------------------------------------------

/**
 * Remove dismissed alerts older than 30 days from an array.
 * Returns a new array (immutable).
 */
function _pruneOld(alerts) {
  var cutoff = Date.now() - PRUNE_AGE_MS;
  return alerts.filter(function (a) {
    if (a.status !== 'dismissed') return true;
    var ts = new Date(a.timestamp).getTime();
    return ts >= cutoff;
  });
}

// ---------------------------------------------------------------------------
// Alert CRUD
// ---------------------------------------------------------------------------

/**
 * Save alerts for a ticker, merging with existing (dedup by id).
 * New alerts overwrite existing alerts with the same id.
 */
export function saveAlerts(ticker, alerts) {
  var key = KEY_PREFIX + ticker;
  var existing = _lsGet(key) || [];
  var map = {};
  for (var i = 0; i < existing.length; i++) {
    map[existing[i].id] = existing[i];
  }
  for (var j = 0; j < alerts.length; j++) {
    map[alerts[j].id] = alerts[j];
  }
  var merged = Object.keys(map).map(function (k) { return map[k]; });
  _lsSet(key, _pruneOld(merged));
  _lsSet(KEY_LAST_CHECK, new Date().toISOString());
}

/**
 * Get alerts for a ticker. Prunes dismissed alerts older than 30 days.
 */
export function getAlerts(ticker) {
  var key = KEY_PREFIX + ticker;
  var alerts = _lsGet(key) || [];
  var pruned = _pruneOld(alerts);
  // Write back if pruning removed anything
  if (pruned.length !== alerts.length) {
    _lsSet(key, pruned);
  }
  return pruned;
}

/**
 * Get all alerts across all tickers. Scans localStorage for matching keys.
 */
export function getAllAlerts() {
  var all = [];
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (key && key.indexOf(KEY_PREFIX) === 0 && key !== KEY_LOG && key !== KEY_LAST_CHECK) {
        var alerts = getAlerts(key.replace(KEY_PREFIX, ''));
        for (var j = 0; j < alerts.length; j++) {
          all.push(alerts[j]);
        }
      }
    }
  } catch (_e) {
    // localStorage disabled
  }
  return all;
}

// ---------------------------------------------------------------------------
// Status updates
// ---------------------------------------------------------------------------

/**
 * Append an entry to the audit log.
 */
function _appendLog(entry) {
  var log = _lsGet(KEY_LOG) || [];
  log.push(entry);
  _lsSet(KEY_LOG, log);
}

/**
 * Find and update an alert's status across all ticker keys.
 * Returns the updated alert or null if not found.
 */
function _updateAlertStatus(alertId, newStatus) {
  try {
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key || key.indexOf(KEY_PREFIX) !== 0 || key === KEY_LOG || key === KEY_LAST_CHECK) continue;

      var alerts = _lsGet(key);
      if (!alerts) continue;

      var found = false;
      var updated = alerts.map(function (a) {
        if (a.id === alertId) {
          found = true;
          return Object.assign({}, a, { status: newStatus });
        }
        return a;
      });

      if (found) {
        _lsSet(key, updated);
        var match = updated.find(function (a) { return a.id === alertId; });
        return match || null;
      }
    }
  } catch (_e) {
    // localStorage disabled
  }
  return null;
}

/**
 * Acknowledge an alert: set status to 'acknowledged' and log the action.
 */
export function acknowledgeAlert(alertId) {
  var alert = _updateAlertStatus(alertId, 'acknowledged');
  if (alert) {
    _appendLog({
      alertId: alertId,
      action: 'acknowledged',
      ticker: alert.ticker,
      type: alert.type,
      summary: alert.summary,
      timestamp: new Date().toISOString()
    });
  }
  return alert;
}

/**
 * Dismiss an alert: set status to 'dismissed' and log the action.
 */
export function dismissAlert(alertId) {
  var alert = _updateAlertStatus(alertId, 'dismissed');
  if (alert) {
    _appendLog({
      alertId: alertId,
      action: 'dismissed',
      ticker: alert.ticker,
      type: alert.type,
      summary: alert.summary,
      timestamp: new Date().toISOString()
    });
  }
  return alert;
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/**
 * Get the audit log, optionally filtered by ticker.
 */
export function getAuditLog(ticker) {
  var log = _lsGet(KEY_LOG) || [];
  if (!ticker) return log;
  return log.filter(function (entry) { return entry.ticker === ticker; });
}

// ---------------------------------------------------------------------------
// Badge counts
// ---------------------------------------------------------------------------

/**
 * Count actionable alerts by category (excludes dismissed).
 * Confirmations are counted but not surfaced as notifications.
 */
export function getAlertCounts() {
  var all = getAllAlerts();
  var counts = { conflicts: 0, signals: 0, confirmations: 0 };
  for (var i = 0; i < all.length; i++) {
    if (all[i].status === 'dismissed') continue;
    if (all[i].type === 'conflict') counts.conflicts++;
    else if (all[i].type === 'signal') counts.signals++;
    else if (all[i].type === 'confirmation') counts.confirmations++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Pipeline integration
// ---------------------------------------------------------------------------

var PN_STORAGE_KEY = 'continuum_personalisation_profile';

/**
 * Read the user's personalisation profile from localStorage.
 * Returns the state object or null.
 */
function _readProfile() {
  try {
    var raw = localStorage.getItem(PN_STORAGE_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    return (parsed && parsed.state) ? parsed.state : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Build an inferred thesis from portfolio weight and stock data.
 * Weight > 5% = bullish, 0 or absent = neutral, explicit overweight = high confidence.
 */
function _inferThesisFromPortfolio(ticker, weight, stockData) {
  if (!stockData || !stockData.hypotheses || stockData.hypotheses.length === 0) return null;

  var dominant = findDominantHypothesis(stockData.hypotheses);
  if (!dominant) return null;

  // Infer bias from portfolio weight
  var biasDirection = 'neutral';
  var confidence = 'low';
  if (typeof weight === 'number' || typeof weight === 'string') {
    var w = parseFloat(weight) || 0;
    if (w > 5) {
      biasDirection = 'bullish';
      confidence = w > 10 ? 'high' : 'low';
    } else if (w > 0) {
      biasDirection = 'bullish';
      confidence = 'low';
    }
  }

  // Build probability split from research scores (user hasn't declared one)
  var probabilitySplit = stockData.hypotheses.map(function (h) {
    return parseScore(h.score);
  });

  return {
    ticker: ticker,
    dominantHypothesis: dominant.tier,
    probabilitySplit: probabilitySplit,
    biasDirection: biasDirection,
    keyAssumption: null,
    source: 'inferred',
    confidence: confidence
  };
}

/**
 * Check for thesis integrity alerts across all stocks in the user's portfolio.
 *
 * Reads the personalisation profile, builds inferred theses from portfolio
 * weights, generates alerts against STOCK_DATA, deduplicates by id, and
 * saves new alerts.
 *
 * @param {Object} stockDataMap - The STOCK_DATA object (ticker -> stock data)
 * @returns {number} Count of new (previously unseen) alerts generated
 */
export function checkForAlerts(stockDataMap) {
  if (!stockDataMap) return 0;

  var profile = _readProfile();
  if (!profile) return 0;

  var portfolio = profile.portfolio;
  if (!portfolio || !Array.isArray(portfolio) || portfolio.length === 0) return 0;

  // Also check for explicit theses stored by thesis comparator
  var newAlertCount = 0;

  for (var i = 0; i < portfolio.length; i++) {
    var entry = portfolio[i];
    var ticker = (entry.ticker || '').toUpperCase();
    if (!ticker || !stockDataMap[ticker]) continue;

    // Check for explicit thesis first (stored by thesis comparator)
    var explicitThesis = _lsGet('ci_thesis_' + ticker);
    var thesis = explicitThesis || _inferThesisFromPortfolio(ticker, entry.weight, stockDataMap[ticker]);
    if (!thesis) continue;

    // Build last-reviewed evidence counts from stored alerts
    var lastReviewed = _lsGet('ci_thesis_evidence_' + ticker) || {};

    var alerts = generateAlerts(thesis, stockDataMap[ticker], lastReviewed);
    if (alerts.length === 0) continue;

    // Deduplicate: only count alerts with ids not already stored
    var existingAlerts = getAlerts(ticker);
    var existingIds = {};
    for (var j = 0; j < existingAlerts.length; j++) {
      existingIds[existingAlerts[j].id] = true;
    }

    var newAlerts = alerts.filter(function (a) {
      return !existingIds[a.id];
    });

    if (newAlerts.length > 0) {
      saveAlerts(ticker, alerts);
      // Count only actionable (non-confirmation) new alerts
      for (var k = 0; k < newAlerts.length; k++) {
        if (newAlerts[k].type !== 'confirmation') {
          newAlertCount++;
        }
      }
    }
  }

  return newAlertCount;
}

// ---------------------------------------------------------------------------
// Badge UI
// ---------------------------------------------------------------------------

/**
 * Update the thesis monitor badge elements in the analyst panel header.
 * Reads current alert counts and shows/hides badges accordingly.
 */
export function updateAlertBadge() {
  var counts = getAlertCounts();

  var conflictBadge = document.querySelector('.tm-badge-conflict');
  var signalBadge = document.querySelector('.tm-badge-signal');

  if (conflictBadge) {
    conflictBadge.textContent = counts.conflicts + ' conflict' + (counts.conflicts !== 1 ? 's' : '');
    conflictBadge.setAttribute('data-count', counts.conflicts);
    conflictBadge.style.display = counts.conflicts > 0 ? 'inline-flex' : 'none';
  }
  if (signalBadge) {
    signalBadge.textContent = counts.signals + ' signal' + (counts.signals !== 1 ? 's' : '');
    signalBadge.setAttribute('data-count', counts.signals);
    signalBadge.style.display = counts.signals > 0 ? 'inline-flex' : 'none';
  }
}

// ---------------------------------------------------------------------------
// Alert panel rendering
// ---------------------------------------------------------------------------

var MAX_PANEL_ALERTS = 20;

/**
 * Escape HTML entities in user-facing text.
 */
function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Materialitiy sort weight: high = 0, medium = 1, low = 2.
 */
function _matWeight(m) {
  if (m === 'high') return 0;
  if (m === 'medium') return 1;
  return 2;
}

/**
 * Build HTML for a single alert card.
 */
function _renderAlertCard(alert) {
  var typeClass = alert.type === 'conflict' ? 'tm-card-conflict' : 'tm-card-signal';
  var typeLabel = alert.type === 'conflict' ? 'Conflicts with your thesis' : 'New signal';
  var typeBadgeClass = alert.type === 'conflict' ? 'tm-type-conflict' : 'tm-type-signal';

  var actions = '';
  if (alert.type === 'conflict') {
    actions =
      '<button class="tm-action" data-action="review" data-ticker="' + _esc(alert.ticker) + '">Review evidence</button>' +
      '<span class="tm-action-divider"></span>' +
      '<button class="tm-action tm-action-muted" data-action="acknowledge" data-alert-id="' + _esc(alert.id) + '">Acknowledge &amp; hold</button>';
  } else {
    actions =
      '<button class="tm-action" data-action="review" data-ticker="' + _esc(alert.ticker) + '">Review evidence</button>' +
      '<span class="tm-action-divider"></span>' +
      '<button class="tm-action tm-action-muted" data-action="dismiss" data-alert-id="' + _esc(alert.id) + '">Dismiss</button>';
  }

  return '<div class="tm-card ' + typeClass + '" data-alert-id="' + _esc(alert.id) + '">' +
    '<div class="tm-card-row1">' +
      '<span class="tm-card-ticker">' + _esc(alert.ticker) + '</span>' +
      '<span class="tm-card-type ' + typeBadgeClass + '">' + typeLabel + '</span>' +
    '</div>' +
    '<div class="tm-card-summary">' + _esc(alert.summary) + '</div>' +
    '<div class="tm-card-detail">' + _esc(alert.detail) + '</div>' +
    '<div class="tm-card-actions">' + actions + '</div>' +
  '</div>';
}

/**
 * Render the alert panel contents. Call after any alert state change.
 */
export function renderAlertPanel() {
  var body = document.querySelector('.tm-panel-body');
  if (!body) return;

  var alerts = getAllAlerts().filter(function (a) {
    return a.status === 'new' || a.status === 'acknowledged';
  });

  // Sort: conflicts first, then signals; within each, high materiality first, then by timestamp desc
  alerts.sort(function (a, b) {
    // Type priority: conflict = 0, signal = 1
    var ta = a.type === 'conflict' ? 0 : 1;
    var tb = b.type === 'conflict' ? 0 : 1;
    if (ta !== tb) return ta - tb;
    // Materiality
    var ma = _matWeight(a.materiality);
    var mb = _matWeight(b.materiality);
    if (ma !== mb) return ma - mb;
    // Timestamp desc
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  if (alerts.length === 0) {
    body.innerHTML = '<p class="tm-empty">No active alerts. Your thesis alignment is up to date.</p>';
    return;
  }

  var display = alerts.slice(0, MAX_PANEL_ALERTS);
  var html = display.map(_renderAlertCard).join('');

  if (alerts.length > MAX_PANEL_ALERTS) {
    html += '<div class="tm-overflow">Showing ' + MAX_PANEL_ALERTS + ' of ' + alerts.length + ' alerts</div>';
  }

  html += '<div class="tm-panel-footer"><button class="tm-action tm-action-log" data-action="show-log">View audit log</button></div>';

  body.innerHTML = html;
}

var MAX_LOG_ENTRIES = 50;

/**
 * Render the audit log view into the panel body.
 */
export function renderAuditLog() {
  var body = document.querySelector('.tm-panel-body');
  if (!body) return;

  var log = getAuditLog();

  // Sort by timestamp descending
  log.sort(function (a, b) {
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  var display = log.slice(0, MAX_LOG_ENTRIES);

  var html = '<div class="tm-panel-footer tm-panel-footer--top"><button class="tm-action tm-action-log" data-action="show-alerts">Back to alerts</button></div>';

  if (display.length === 0) {
    html += '<p class="tm-empty">No decisions recorded yet.</p>';
    body.innerHTML = html;
    return;
  }

  for (var i = 0; i < display.length; i++) {
    var entry = display[i];
    var date = new Date(entry.timestamp);
    var dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

    var actionClass = 'tm-log-dismissed';
    var actionLabel = 'Dismissed';
    if (entry.action === 'acknowledged') {
      actionClass = 'tm-log-acknowledged';
      actionLabel = 'Acknowledged ' + (entry.type === 'conflict' ? 'conflict' : 'signal');
    } else if (entry.action === 'dismissed') {
      actionClass = 'tm-log-dismissed';
      actionLabel = 'Dismissed ' + (entry.type || 'alert');
    } else if (entry.type === 'confirmation') {
      actionClass = 'tm-log-confirmed';
      actionLabel = 'Confirmed';
    }

    html += '<div class="tm-log-entry">' +
      '<span class="tm-log-date">' + _esc(dateStr) + '</span>' +
      '<span class="tm-log-ticker">' + _esc(entry.ticker || '') + '</span>' +
      '<span class="tm-log-action ' + actionClass + '">' + _esc(actionLabel) + '</span>' +
      '<span class="tm-log-summary">' + _esc(entry.summary || '') + '</span>' +
    '</div>';
  }

  if (log.length > MAX_LOG_ENTRIES) {
    html += '<div class="tm-overflow">Showing ' + MAX_LOG_ENTRIES + ' of ' + log.length + ' entries</div>';
  }

  body.innerHTML = html;
}

/**
 * Toggle the alert panel visibility.
 */
function _togglePanel() {
  var panel = document.querySelector('.tm-panel');
  if (!panel) return;
  var isVisible = panel.style.display !== 'none';
  if (isVisible) {
    panel.style.display = 'none';
  } else {
    renderAlertPanel();
    panel.style.display = 'block';
  }
}

/**
 * Initialise alert panel event handlers.
 * Call once from main.js after DOM is ready.
 */
export function initAlertPanel() {
  // Badge group click toggles panel
  var badgeGroup = document.querySelector('.tm-badge-group');
  if (badgeGroup) {
    badgeGroup.style.cursor = 'pointer';
    badgeGroup.addEventListener('click', function (e) {
      e.stopPropagation();
      _togglePanel();
    });
  }

  // Close button
  var closeBtn = document.querySelector('.tm-panel-close');
  if (closeBtn) {
    closeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var panel = document.querySelector('.tm-panel');
      if (panel) panel.style.display = 'none';
    });
  }

  // Action delegation on panel body
  var panelBody = document.querySelector('.tm-panel-body');
  if (panelBody) {
    panelBody.addEventListener('click', function (e) {
      var btn = e.target.closest('.tm-action');
      if (!btn) return;
      e.stopPropagation();

      var action = btn.getAttribute('data-action');
      var alertId = btn.getAttribute('data-alert-id');
      var ticker = btn.getAttribute('data-ticker');

      if (action === 'review' && ticker) {
        if (typeof window.navigate === 'function') {
          window.navigate('report-' + ticker);
        }
        var panel = document.querySelector('.tm-panel');
        if (panel) panel.style.display = 'none';
      } else if (action === 'acknowledge' && alertId) {
        acknowledgeAlert(alertId);
        renderAlertPanel();
        updateAlertBadge();
      } else if (action === 'dismiss' && alertId) {
        dismissAlert(alertId);
        renderAlertPanel();
        updateAlertBadge();
      } else if (action === 'show-log') {
        renderAuditLog();
      } else if (action === 'show-alerts') {
        renderAlertPanel();
      }
    });
  }

  // Close panel on outside click
  document.addEventListener('click', function (e) {
    var panel = document.querySelector('.tm-panel');
    if (!panel || panel.style.display === 'none') return;
    if (!panel.contains(e.target) && !e.target.closest('.tm-badge-group')) {
      panel.style.display = 'none';
    }
  });
}
