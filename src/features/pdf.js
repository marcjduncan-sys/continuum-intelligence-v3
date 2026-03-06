/**
 * pdf.js -- PDF Report Generation (Institutional + Investor Briefing)
 *
 * Two formats:
 *   - Institutional: Comprehensive, all sections from STOCK_DATA, dense layout,
 *     no running page headers/footers, includes price sparkline.
 *   - Investor Briefing: Exactly 2 pages. Page 1: hero, metrics, skew,
 *     Position in Range, Valuation Range, hypothesis bars.
 *     Page 2: identity, narrative, technical, evidence (3 cards),
 *     discriminators, tripwires.
 *
 * Both read from STOCK_DATA[ticker] directly (no DOM scraping).
 * Uses browser print-to-PDF (window.open + window.print).
 *
 * Depends on:
 *   - STOCK_DATA from ../lib/state.js
 *   - normaliseScores from ../lib/dom.js
 */

import { STOCK_DATA } from '../lib/state.js';
import { normaliseScores } from '../lib/dom.js';

// ============================================================
// SHARED UTILITIES
// ============================================================

function pdfEsc(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(str) {
  if (!str) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || '';
}

function trunc(str, maxLen) {
  if (!str) return '';
  var s = stripHtml(str);
  return s.length > maxLen ? s.substring(0, maxLen - 1) + '\u2026' : s;
}

function normaliseHypScores(hyps) {
  if (!hyps || !hyps.length) return [];
  var items = hyps.map(function(h) {
    var raw = String(h.score || h.scoreWidth || '0').replace('%', '');
    return { score: parseFloat(raw) || 0 };
  });
  return normaliseScores(items);
}

// Inline SVG sparkline (reproduced from src/lib/format.js to be self-contained in print window)
function buildSparklineSVG(prices, width, height) {
  if (!prices || prices.length < 2) return '';
  var w = width || 680, h = height || 72, pad = 4;
  var min = prices[0], max = prices[0];
  for (var i = 1; i < prices.length; i++) {
    if (prices[i] < min) min = prices[i];
    if (prices[i] > max) max = prices[i];
  }
  var range = max - min || 1;
  var stepX = (w - pad * 2) / (prices.length - 1);
  var points = '';
  var fillPoints = pad + ',' + (h - pad);
  for (var j = 0; j < prices.length; j++) {
    var x = pad + j * stepX;
    var y = h - pad - ((prices[j] - min) / range) * (h - pad * 2);
    points += x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    fillPoints += ' ' + x.toFixed(1) + ',' + y.toFixed(1);
  }
  fillPoints += ' ' + (pad + (prices.length - 1) * stepX).toFixed(1) + ',' + (h - pad);
  var last = prices[prices.length - 1], first = prices[0];
  var color = last > first * 1.02 ? '#16a34a' : last < first * 0.98 ? '#dc2626' : '#d97706';
  var gradId = 'spg' + Math.floor(Math.random() * 99999);
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" style="display:block;overflow:visible">' +
    '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + color + '" stop-opacity="0.25"/>' +
      '<stop offset="100%" stop-color="' + color + '" stop-opacity="0.02"/>' +
    '</linearGradient></defs>' +
    '<polygon points="' + pdfEsc(fillPoints) + '" fill="url(#' + gradId + ')"/>' +
    '<polyline points="' + pdfEsc(points) + '" fill="none" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>' +
  '</svg>';
}

// Direction display
function dirIcon(dir) {
  return dir === 'upside' ? '&#9650;' : dir === 'downside' ? '&#9660;' : '&#9670;';
}
function dirColor(dir) {
  return dir === 'upside' ? '#16a34a' : dir === 'downside' ? '#dc2626' : '#d97706';
}
function dirBorderColor(dir) {
  return dir === 'upside' ? '#16a34a' : dir === 'downside' ? '#dc2626' : '#d97706';
}

// ============================================================
// ENTRY POINT
// ============================================================

export function generatePDFReport(ticker, type) {
  var btn = (typeof event !== 'undefined' && event) ? event.currentTarget : null;
  if (btn) btn.classList.add('generating');

  var stock = null;
  if (typeof STOCK_DATA !== 'undefined' && STOCK_DATA[ticker]) {
    stock = STOCK_DATA[ticker];
  }

  if (!stock || stock._indexOnly) {
    alert('Full research data not yet loaded for ' + ticker + '. Please wait for the report to finish loading, then try again.');
    if (btn) btn.classList.remove('generating');
    return;
  }

  var reportHTML = '';
  if (type === 'institutional') {
    console.log('[PDF] Institutional report from STOCK_DATA for', ticker);
    reportHTML = buildInstitutionalHTML(stock);
  } else {
    console.log('[PDF] Investor Briefing from STOCK_DATA for', ticker);
    reportHTML = buildInvestorBriefingHTML(stock);
  }

  var win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site.');
    if (btn) btn.classList.remove('generating');
    return;
  }
  win.document.write(reportHTML);
  win.document.close();
  if (btn) btn.classList.remove('generating');
  setTimeout(function() { win.print(); }, 900);
}

// ============================================================
// INSTITUTIONAL REPORT
// Comprehensive. All sections. Dense. No running headers.
// ============================================================

function buildInstitutionalHTML(stock) {
  var e = pdfEsc;

  var now = new Date();
  var timestamp = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // ── Helpers ─────────────────────────────────────────────
  function secHdr(num, title) {
    return '<div class="sec-hdr"><span class="sec-num">0' + num + '</span>' +
      '<span class="sec-title">' + e(title) + '</span></div>';
  }
  function subHdr(label) {
    return '<div class="sub-hdr">' + e(label) + '</div>';
  }
  function bodyP(text) {
    if (!text) return '';
    return '<p class="body">' + e(stripHtml(text)) + '</p>';
  }
  function htmlP(text) {
    if (!text) return '';
    // Allow safe HTML from research JSON (already generated/reviewed content)
    return '<p class="body">' + stripHtml(text) + '</p>';
  }
  function tag(label, cls) {
    return '<span class="tag ' + (cls || '') + '">' + e(label) + '</span>';
  }

  // ── COVER ────────────────────────────────────────────────
  var heroMetricsHtml = '';
  if (stock.heroMetrics && stock.heroMetrics.length) {
    heroMetricsHtml = '<div class="cover-metrics">';
    for (var mi = 0; mi < stock.heroMetrics.length; mi++) {
      var m = stock.heroMetrics[mi];
      heroMetricsHtml += '<div class="cm-item"><div class="cm-label">' + e(m.label) + '</div>' +
        '<div class="cm-value">' + e(m.value) + '</div></div>';
    }
    heroMetricsHtml += '</div>';
  }

  var skewDir = (stock.hero && stock.hero.skew) || (stock.skew && stock.skew.direction) || '';
  var skewRat = (stock.hero && stock.hero.skew_description) || (stock.skew && stock.skew.rationale) || '';
  var embeddedThesis = (stock.hero && stock.hero.embedded_thesis) || '';

  var skewCls = skewDir === 'UPSIDE' ? 'skew-up' : skewDir === 'DOWNSIDE' ? 'skew-dn' : 'skew-bal';

  var coverHtml =
    '<div class="cover">' +
      '<div class="cover-brand">CONTINUUM INTELLIGENCE &mdash; INDEPENDENT EQUITY RESEARCH</div>' +
      '<div class="cover-title">' + e(stock.company) + '</div>' +
      '<div class="cover-sub">' + e(stock.tickerFull || stock.ticker + '.AX') +
        ' &bull; ' + e(stock.sector || '') + (stock.sectorSub ? ' &bull; ' + e(stock.sectorSub) : '') +
        ' &bull; ' + e(stock.currency || '') + e(String(stock.price || '')) +
        ' &bull; As at ' + e(stock.date || timestamp) + '</div>' +
      (stock.heroDescription ? '<div class="cover-tagline">' + e(stripHtml(stock.heroDescription)) + '</div>' : '') +
      heroMetricsHtml +
      (skewDir ? '<div class="cover-skew ' + skewCls + '">RISK SKEW: ' + e(skewDir) +
        (skewRat ? ' &mdash; ' + e(stripHtml(skewRat)) : '') + '</div>' : '') +
      (embeddedThesis ? '<div class="cover-thesis"><strong>WHAT THE PRICE EMBEDS &mdash; </strong>' + e(stripHtml(embeddedThesis)) + '</div>' : '') +
    '</div>';

  // ── PRICE SPARKLINE ──────────────────────────────────────
  var sparkHtml = '';
  if (stock.priceHistory && stock.priceHistory.length > 10) {
    var prices = stock.priceHistory;
    var spMin = prices[0], spMax = prices[0];
    for (var si = 1; si < prices.length; si++) {
      if (prices[si] < spMin) spMin = prices[si];
      if (prices[si] > spMax) spMax = prices[si];
    }
    var spFirst = prices[0], spLast = prices[prices.length - 1];
    var spChg = ((spLast / spFirst - 1) * 100).toFixed(1);
    var spChgCls = spLast >= spFirst ? 'pos' : 'neg';
    sparkHtml =
      '<div class="spark-wrap">' +
        '<div class="spark-meta">' +
          '<span class="spark-label">1-YEAR PRICE HISTORY (' + e(stock.currency || '') + ')</span>' +
          '<span class="spark-range">Low: ' + e(stock.currency || '') + spMin.toFixed(2) +
            ' &nbsp;|&nbsp; High: ' + e(stock.currency || '') + spMax.toFixed(2) + '</span>' +
          '<span class="spark-chg ' + spChgCls + '">' + (spLast >= spFirst ? '+' : '') + spChg + '% (1Y)</span>' +
        '</div>' +
        buildSparklineSVG(prices, 680, 72) +
      '</div>';
  }

  // ── SECTION 01: IDENTITY & SNAPSHOT ─────────────────────
  var identHtml = secHdr(1, 'Identity & Snapshot');
  if (stock.identity) {
    if (stock.identity.overview) {
      identHtml += bodyP(stock.identity.overview);
    }
    if (stock.identity.rows && stock.identity.rows.length) {
      identHtml += '<table class="dt compact"><tbody>';
      for (var ir = 0; ir < stock.identity.rows.length; ir++) {
        var row = stock.identity.rows[ir];
        identHtml += '<tr>';
        for (var ic = 0; ic < row.length; ic++) {
          var cell = row[ic];
          var label = cell[0], val = cell[1];
          identHtml += '<td class="dt-lbl">' + e(label) + '</td>' +
            '<td class="dt-val">' + e(stripHtml(String(val || ''))) + '</td>';
        }
        identHtml += '</tr>';
      }
      identHtml += '</tbody></table>';
    }
  }

  // ── SECTION 02: COMPETING HYPOTHESES ────────────────────
  var hypHtml = secHdr(2, 'Competing Hypotheses');
  var hyps = stock.hypotheses || [];
  var normScores = normaliseHypScores(hyps);
  for (var hi = 0; hi < hyps.length; hi++) {
    var h = hyps[hi];
    var hDir = h.direction || '';
    var hScore = normScores[hi] ? normScores[hi] + '%' : e(h.score || '');
    var hBorder = dirBorderColor(hDir);
    hypHtml += '<div class="hyp-card" style="border-left-color:' + hBorder + '">' +
      '<div class="hyp-hdr">' +
        '<span class="hyp-title">' + e(stripHtml(h.title || '')) + '</span>' +
        '<span class="hyp-score" style="color:' + hBorder + '">' + hScore + '</span>' +
        '<span class="hyp-dir" style="color:' + hBorder + '">' + dirIcon(hDir) + ' ' + e(h.statusText || h.direction || '') + '</span>' +
      '</div>' +
      '<p class="body">' + e(stripHtml(h.description || '')) + '</p>';

    // Requires
    if (h.requires && h.requires.length) {
      hypHtml += subHdr('Requires');
      hypHtml += '<ul class="ev-list">';
      for (var ri2 = 0; ri2 < h.requires.length; ri2++) {
        hypHtml += '<li>' + e(stripHtml(h.requires[ri2])) + '</li>';
      }
      hypHtml += '</ul>';
    }

    // Supporting + Contradicting
    if (h.supporting && h.supporting.length) {
      hypHtml += subHdr(h.supportingLabel || 'Supporting Evidence');
      hypHtml += '<ul class="ev-list ev-support">';
      for (var si2 = 0; si2 < h.supporting.length; si2++) {
        hypHtml += '<li>' + stripHtml(h.supporting[si2]) + '</li>';
      }
      hypHtml += '</ul>';
    }
    if (h.contradicting && h.contradicting.length) {
      hypHtml += subHdr(h.contradictingLabel || 'Contradicting Evidence');
      hypHtml += '<ul class="ev-list ev-contra">';
      for (var ci2 = 0; ci2 < h.contradicting.length; ci2++) {
        hypHtml += '<li>' + stripHtml(h.contradicting[ci2]) + '</li>';
      }
      hypHtml += '</ul>';
    }
    hypHtml += '</div>';
  }

  // ── SECTION 03: DOMINANT NARRATIVE ──────────────────────
  var narrHtml = secHdr(3, 'Dominant Narrative');
  if (stock.narrative) {
    var n = stock.narrative;
    var narrSubs = [
      ['The Narrative', n.theNarrative],
      ['Price Implication', n.priceImplication],
      ['Evidence Check', n.evidenceCheck],
      ['Narrative Stability', n.narrativeStability]
    ];
    for (var ni = 0; ni < narrSubs.length; ni++) {
      if (narrSubs[ni][1]) {
        narrHtml += subHdr(narrSubs[ni][0]) + bodyP(narrSubs[ni][1]);
      }
    }
  }

  // ── SECTION 04: EVIDENCE SYNTHESIS ──────────────────────
  var evHtml = secHdr(4, 'Cross-Domain Evidence Synthesis');
  if (stock.evidence) {
    if (stock.evidence.intro) {
      evHtml += '<p class="body italic">' + e(stripHtml(stock.evidence.intro)) + '</p>';
    }
    var evCards = stock.evidence.cards || [];
    for (var eci = 0; eci < evCards.length; eci++) {
      var ec = evCards[eci];
      evHtml += '<div class="ev-card">' +
        '<div class="ev-hdr">' +
          '<span class="ev-title">' + e(stripHtml(ec.title || '')) + '</span>' +
          (ec.epistemicLabel ? '<span class="ev-ep">' + e(ec.epistemicLabel) + '</span>' : '') +
        '</div>' +
        (ec.finding ? '<div class="ev-finding">' + stripHtml(ec.finding) + '</div>' : '') +
        (ec.tension ? '<div class="ev-tension">' + e(stripHtml(ec.tension)) + '</div>' : '');
      if (ec.tags && ec.tags.length) {
        evHtml += '<div class="ev-tags">';
        for (var ti = 0; ti < ec.tags.length; ti++) {
          evHtml += '<span class="ev-tag">' + e(ec.tags[ti]) + '</span>';
        }
        evHtml += '</div>';
      }
      if (ec.source) {
        evHtml += '<div class="ev-src">' + e(ec.source) + '</div>';
      }
      evHtml += '</div>';
    }
    if (stock.evidence.alignmentSummary) {
      evHtml += subHdr('Evidence Alignment Summary') +
        bodyP(stock.evidence.alignmentSummary);
    }
  }

  // ── SECTION 05: DISCRIMINATORS ───────────────────────────
  var discHtml = secHdr(5, 'What Discriminates');
  if (stock.discriminators) {
    if (stock.discriminators.intro) {
      discHtml += '<p class="body italic">' + e(stripHtml(stock.discriminators.intro)) + '</p>';
    }
    var dRows = stock.discriminators.rows || [];
    if (dRows.length) {
      discHtml += '<table class="dt"><thead><tr>' +
        '<th>Diagnosticity</th><th>Evidence</th><th>Discriminates Between</th><th>Current Reading</th>' +
        '</tr></thead><tbody>';
      for (var di = 0; di < dRows.length; di++) {
        var dr = dRows[di];
        var diagCls = String(dr.diagnosticity || '').toLowerCase() === 'high' ? 'diag-high' :
                      String(dr.diagnosticity || '').toLowerCase() === 'critical' ? 'diag-crit' : '';
        discHtml += '<tr>' +
          '<td><span class="diag ' + diagCls + '">' + e(dr.diagnosticity || '') + '</span></td>' +
          '<td>' + stripHtml(dr.evidence || '') + '</td>' +
          '<td>' + e(stripHtml(dr.discriminatesBetween || '')) + '</td>' +
          '<td>' + e(dr.currentReading || '') + '</td>' +
          '</tr>';
      }
      discHtml += '</tbody></table>';
    }
    if (stock.discriminators.nonDiscriminating) {
      discHtml += '<div class="callout">' + e(stripHtml(stock.discriminators.nonDiscriminating)) + '</div>';
    }
  }

  // ── SECTION 06: TRIPWIRES ────────────────────────────────
  var tripHtml = secHdr(6, 'What We\'re Watching');
  if (stock.tripwires) {
    if (stock.tripwires.intro) {
      tripHtml += '<p class="body italic">' + e(stripHtml(stock.tripwires.intro)) + '</p>';
    }
    var tCards = stock.tripwires.cards || [];
    for (var tci = 0; tci < tCards.length; tci++) {
      var tc = tCards[tci];
      tripHtml += '<div class="trip-card">' +
        '<div class="trip-hdr">' +
          (tc.date ? '<span class="trip-date">' + e(tc.date) + '</span>' : '') +
          '<span class="trip-name">' + e(stripHtml(tc.name || '')) + '</span>' +
        '</div>';
      var conds = tc.conditions || [];
      for (var cci = 0; cci < conds.length; cci++) {
        var cond = conds[cci];
        var cv = String(cond.valence || '');
        var ifCls = cv === 'positive' ? 'cond-pos' : 'cond-neg';
        tripHtml += '<div class="trip-cond">' +
          '<span class="trip-if ' + ifCls + '">' + e(cond.if || '') + '</span>' +
          '<span class="trip-then">' + e(cond.then || '') + '</span>' +
          '</div>';
      }
      if (tc.source) {
        tripHtml += '<div class="trip-src">' + e(tc.source) + '</div>';
      }
      tripHtml += '</div>';
    }
  }

  // ── SECTION 07: EVIDENCE GAPS ────────────────────────────
  var gapsHtml = '';
  if (stock.gaps) {
    gapsHtml = secHdr(7, 'Evidence Gaps & Analytical Limitations');
    var gaps = stock.gaps;
    if (typeof gaps === 'string') {
      gapsHtml += bodyP(gaps);
    } else if (typeof gaps === 'object') {
      var gapKeys = Object.keys(gaps);
      for (var gi = 0; gi < gapKeys.length; gi++) {
        var gk = gapKeys[gi];
        var gv = gaps[gk];
        if (gv && typeof gv === 'string') {
          gapsHtml += subHdr(gk) + bodyP(gv);
        } else if (gv && Array.isArray(gv)) {
          gapsHtml += subHdr(gk) + '<ul class="ev-list">';
          for (var gai = 0; gai < gv.length; gai++) {
            gapsHtml += '<li>' + e(stripHtml(String(gv[gai]))) + '</li>';
          }
          gapsHtml += '</ul>';
        }
      }
    }
  }

  // ── SECTION 08: TECHNICAL ANALYSIS ──────────────────────
  var techHtml = secHdr(8, 'Technical Analysis');
  if (stock.technicalAnalysis) {
    var ta = stock.technicalAnalysis;

    // Regime + trend summary row
    techHtml += '<div class="ta-summary">' +
      (ta.regime ? '<span class="ta-badge">' + e(ta.regime) + (ta.clarity ? ' &mdash; ' + e(ta.clarity) : '') + '</span>' : '') +
      (ta.trend ? '<span class="ta-val">Trend: ' + e(ta.trend.direction || '') +
        (ta.trend.duration ? ', ' + e(ta.trend.duration) : '') + '</span>' : '') +
      (ta.price ? '<span class="ta-val">Price: ' + e(ta.price.currency || '') + e(String(ta.price.current || '')) + '</span>' : '') +
    '</div>';

    // Moving averages
    if (ta.movingAverages) {
      var mas = ta.movingAverages;
      techHtml += subHdr('Moving Averages');
      techHtml += '<table class="dt compact"><tbody>';
      if (mas.ma50) {
        techHtml += '<tr><td class="dt-lbl">50-day MA</td><td class="dt-val">' + e(String(mas.ma50.value || '')) +
          (mas.priceVsMa50 ? ' (price +' + e(String(mas.priceVsMa50)) + '% above)' : '') + '</td></tr>';
      }
      if (mas.ma200) {
        techHtml += '<tr><td class="dt-lbl">200-day MA</td><td class="dt-val">' + e(String(mas.ma200.value || '')) +
          (mas.priceVsMa200 ? ' (price +' + e(String(mas.priceVsMa200)) + '% above)' : '') + '</td></tr>';
      }
      if (mas.crossover && mas.crossover.description) {
        techHtml += '<tr><td class="dt-lbl">' + e(mas.crossover.type || 'Crossover') + '</td>' +
          '<td class="dt-val">' + e(mas.crossover.description) + '</td></tr>';
      }
      techHtml += '</tbody></table>';
    }

    // Trend structure
    if (ta.trend && ta.trend.structure) {
      techHtml += subHdr('Trend Structure') + bodyP(ta.trend.structure);
    }

    // Key levels
    if (ta.keyLevels) {
      techHtml += subHdr('Key Price Levels');
      var kl = ta.keyLevels;
      techHtml += '<table class="dt compact"><tbody>';
      var klKeys = Object.keys(kl);
      for (var ki = 0; ki < klKeys.length; ki++) {
        var kv = kl[klKeys[ki]];
        if (kv && typeof kv === 'object') {
          techHtml += '<tr><td class="dt-lbl">' + e(klKeys[ki]) + '</td>' +
            '<td class="dt-val">' + e(String(kv.value || kv.price || '')) +
            (kv.description ? ' &mdash; ' + e(kv.description) : '') + '</td></tr>';
        } else if (kv) {
          techHtml += '<tr><td class="dt-lbl">' + e(klKeys[ki]) + '</td>' +
            '<td class="dt-val">' + e(String(kv)) + '</td></tr>';
        }
      }
      techHtml += '</tbody></table>';
    }

    // Volatility
    if (ta.volatility) {
      techHtml += subHdr('Volatility');
      var vol = ta.volatility;
      if (typeof vol === 'object') {
        techHtml += '<table class="dt compact"><tbody>';
        var volKeys = Object.keys(vol);
        for (var vi = 0; vi < volKeys.length; vi++) {
          var vv = vol[volKeys[vi]];
          if (vv && typeof vv !== 'object') {
            techHtml += '<tr><td class="dt-lbl">' + e(volKeys[vi]) + '</td><td class="dt-val">' + e(String(vv)) + '</td></tr>';
          } else if (vv && typeof vv === 'object' && vv.value) {
            techHtml += '<tr><td class="dt-lbl">' + e(volKeys[vi]) + '</td><td class="dt-val">' + e(String(vv.value)) +
              (vv.description ? ' &mdash; ' + e(vv.description) : '') + '</td></tr>';
          }
        }
        techHtml += '</tbody></table>';
      } else {
        techHtml += bodyP(String(vol));
      }
    }

    // Inflection points
    if (ta.inflectionPoints && ta.inflectionPoints.length) {
      techHtml += subHdr('Inflection Points');
      var ips = ta.inflectionPoints;
      techHtml += '<table class="dt compact"><thead><tr><th>Date</th><th>Type</th><th>Price</th><th>Description</th></tr></thead><tbody>';
      for (var ipi = 0; ipi < ips.length; ipi++) {
        var ip = ips[ipi];
        techHtml += '<tr>' +
          '<td>' + e(ip.date || '') + '</td>' +
          '<td>' + e(ip.type || '') + '</td>' +
          '<td>' + e(String(ip.price || '')) + '</td>' +
          '<td>' + e(ip.description || '') + '</td>' +
          '</tr>';
      }
      techHtml += '</tbody></table>';
    }

    // Relative performance
    if (ta.relativePerformance) {
      var rp = ta.relativePerformance;
      if (typeof rp === 'object') {
        techHtml += subHdr('Relative Performance');
        techHtml += '<table class="dt compact"><tbody>';
        var rpKeys = Object.keys(rp);
        for (var rpi = 0; rpi < rpKeys.length; rpi++) {
          var rpv = rp[rpKeys[rpi]];
          if (rpv !== null && rpv !== undefined && typeof rpv !== 'object') {
            techHtml += '<tr><td class="dt-lbl">' + e(rpKeys[rpi]) + '</td><td class="dt-val">' + e(String(rpv)) + '</td></tr>';
          } else if (rpv && typeof rpv === 'object') {
            techHtml += '<tr><td class="dt-lbl">' + e(rpKeys[rpi]) + '</td><td class="dt-val">' + e(JSON.stringify(rpv)) + '</td></tr>';
          }
        }
        techHtml += '</tbody></table>';
      }
    }

    // Mean reversion
    if (ta.meanReversion) {
      var mr = ta.meanReversion;
      if (typeof mr === 'object') {
        techHtml += subHdr('Mean Reversion');
        techHtml += '<table class="dt compact"><tbody>';
        var mrKeys = Object.keys(mr);
        for (var mri = 0; mri < mrKeys.length; mri++) {
          var mrv = mr[mrKeys[mri]];
          if (mrv !== null && mrv !== undefined) {
            var mrvStr = typeof mrv === 'object' ? (mrv.value !== undefined ? String(mrv.value) + (mrv.description ? ' &mdash; ' + mrv.description : '') : JSON.stringify(mrv)) : String(mrv);
            techHtml += '<tr><td class="dt-lbl">' + e(mrKeys[mri]) + '</td><td class="dt-val">' + e(mrvStr) + '</td></tr>';
          }
        }
        techHtml += '</tbody></table>';
      }
    }
  }

  // ── DISCLAIMER ───────────────────────────────────────────
  var disclaimerHtml =
    '<div class="disclaimer">' +
      '<div class="disc-title">Methodology &amp; Disclaimer</div>' +
      '<p>This report employs Analysis of Competing Hypotheses (ACH), a structured analytical technique that systematically evaluates evidence against multiple competing explanations, weighting by diagnosticity rather than volume. Not personal financial advice. For institutional and wholesale investor use only.</p>' +
      '<p>Snapshot generated: ' + e(timestamp) + ' AEST &bull; ' + e(stock.ticker) + ' &bull; Continuum Intelligence</p>' +
    '</div>';

  // ── CSS ───────────────────────────────────────────────────
  var css =
    '*{margin:0;padding:0;box-sizing:border-box;}' +
    'body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#1a1f2e;font-size:8pt;line-height:1.4;' +
      'background:#fff;padding:8px 10px;max-width:none;}' +
    /* Cover */
    '.cover{margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid #0f2e57;}' +
    '.cover-brand{font-size:6.5pt;font-weight:700;letter-spacing:2px;color:#0f2e57;text-transform:uppercase;margin-bottom:4px;}' +
    '.cover-title{font-size:19pt;font-weight:800;color:#102a43;line-height:1.1;margin-bottom:3px;}' +
    '.cover-sub{font-size:7.5pt;color:#64748b;margin-bottom:4px;}' +
    '.cover-tagline{font-size:8pt;color:#334155;font-style:italic;margin-bottom:6px;}' +
    '.cover-metrics{display:flex;gap:16px;flex-wrap:wrap;margin:6px 0;}' +
    '.cm-item{min-width:60px;}' +
    '.cm-label{font-size:6pt;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;}' +
    '.cm-value{font-size:9pt;font-weight:700;color:#1e3a5f;}' +
    '.cover-skew{font-size:7.5pt;font-weight:700;padding:4px 8px;border-radius:3px;' +
      'display:inline-block;margin:4px 0;}' +
    '.skew-up{background:#dcfce7;color:#166534;}' +
    '.skew-dn{background:#fee2e2;color:#991b1b;}' +
    '.skew-bal{background:#fef3c7;color:#92400e;}' +
    '.cover-thesis{font-size:7.5pt;color:#334155;margin-top:6px;border-left:3px solid #0f2e57;padding-left:8px;line-height:1.45;}' +
    /* Sparkline */
    '.spark-wrap{margin:8px 0 12px 0;padding:6px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;}' +
    '.spark-meta{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;font-size:6.5pt;}' +
    '.spark-label{color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;}' +
    '.spark-range{color:#64748b;}' +
    '.spark-chg{font-weight:700;}.pos{color:#16a34a;}.neg{color:#dc2626;}' +
    /* Section headers */
    '.sec-hdr{display:flex;align-items:baseline;gap:8px;margin:12px 0 6px 0;padding-bottom:3px;border-bottom:1.5px solid #e2e8f0;page-break-after:avoid;}' +
    '.sec-num{font-size:6pt;font-weight:700;color:#94a3b8;letter-spacing:1px;text-transform:uppercase;}' +
    '.sec-title{font-size:9.5pt;font-weight:800;color:#0f2e57;letter-spacing:0.2px;}' +
    '.sub-hdr{font-size:7.5pt;font-weight:700;color:#1e3a5f;margin:7px 0 2px 0;text-transform:uppercase;letter-spacing:0.4px;}' +
    /* Body text */
    '.body{font-size:7.8pt;color:#334155;line-height:1.48;margin:3px 0 6px 0;}' +
    '.italic{font-style:italic;}' +
    /* Tables */
    '.dt{width:100%;border-collapse:collapse;font-size:7.2pt;margin:3px 0 8px 0;}' +
    '.dt th{background:#edf2f8;color:#334155;text-align:left;padding:3px 5px;border:1px solid #d9e2ef;font-size:6.5pt;text-transform:uppercase;letter-spacing:0.3px;font-weight:700;}' +
    '.dt td{padding:3px 5px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.3;}' +
    '.dt tbody tr:nth-child(even){background:#fafcfe;}' +
    '.compact td,.compact th{padding:2px 4px;font-size:6.8pt;}' +
    '.dt-lbl{font-weight:600;color:#475569;white-space:nowrap;width:120px;}' +
    '.dt-val{color:#1e293b;}' +
    /* Hypothesis cards */
    '.hyp-card{border:1px solid #dce3ee;border-left:4px solid #94a3b8;border-radius:3px;' +
      'padding:8px 10px;margin-bottom:7px;page-break-inside:avoid;}' +
    '.hyp-hdr{display:flex;align-items:baseline;gap:10px;margin-bottom:4px;flex-wrap:wrap;}' +
    '.hyp-title{font-size:8.5pt;font-weight:800;color:#102a43;flex:1;}' +
    '.hyp-score{font-size:9pt;font-weight:800;}' +
    '.hyp-dir{font-size:7pt;font-weight:600;}' +
    /* Evidence lists */
    '.ev-list{font-size:7.3pt;color:#475569;margin:2px 0 5px 14px;line-height:1.4;}' +
    '.ev-list li{margin-bottom:2px;}' +
    '.ev-support li::marker{color:#16a34a;}' +
    '.ev-contra li::marker{color:#dc2626;}' +
    /* Evidence cards */
    '.ev-card{border:1px solid #e2e8f0;border-radius:3px;padding:6px 8px;margin-bottom:5px;page-break-inside:avoid;}' +
    '.ev-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px;}' +
    '.ev-title{font-size:7.8pt;font-weight:700;color:#102a43;}' +
    '.ev-ep{font-size:6pt;color:#64748b;background:#f1f5f9;padding:1px 5px;border-radius:2px;}' +
    '.ev-finding{font-size:7.3pt;color:#334155;line-height:1.4;margin-bottom:3px;}' +
    '.ev-tension{font-size:7pt;color:#475569;font-style:italic;margin-bottom:3px;}' +
    '.ev-tags{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:2px;}' +
    '.ev-tag{font-size:5.8pt;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;padding:1px 3px;border-radius:2px;}' +
    '.ev-src{font-size:6pt;color:#94a3b8;}' +
    /* Discriminators */
    '.diag{font-size:6.5pt;font-weight:700;padding:1px 4px;border-radius:2px;background:#f1f5f9;color:#475569;}' +
    '.diag-high{background:#fef3c7;color:#92400e;}' +
    '.diag-crit{background:#fee2e2;color:#991b1b;}' +
    /* Tripwires */
    '.trip-card{border:1px solid #dce3ee;border-radius:3px;padding:6px 8px;margin-bottom:5px;page-break-inside:avoid;}' +
    '.trip-hdr{display:flex;gap:8px;align-items:baseline;margin-bottom:3px;}' +
    '.trip-date{font-size:6.5pt;color:#64748b;font-weight:600;}' +
    '.trip-name{font-size:7.8pt;font-weight:700;color:#102a43;}' +
    '.trip-cond{margin:2px 0;font-size:7pt;display:flex;gap:4px;}' +
    '.trip-if{font-weight:600;}' +
    '.cond-pos{color:#16a34a;}' +
    '.cond-neg{color:#dc2626;}' +
    '.trip-then{color:#475569;}' +
    '.trip-src{font-size:6pt;color:#94a3b8;margin-top:2px;}' +
    /* Callout */
    '.callout{background:#f8fafc;border:1px solid #e2e8f0;border-radius:3px;padding:5px 8px;' +
      'font-size:7.3pt;color:#475569;line-height:1.4;margin:3px 0 6px 0;}' +
    /* Technical */
    '.ta-summary{display:flex;gap:12px;flex-wrap:wrap;margin:4px 0 6px 0;align-items:center;}' +
    '.ta-badge{font-size:7.5pt;font-weight:700;background:#dbeafe;color:#1e40af;padding:2px 7px;border-radius:3px;}' +
    '.ta-val{font-size:7.2pt;color:#475569;}' +
    /* Tags */
    '.tag{font-size:6pt;padding:1px 4px;border-radius:2px;margin-right:3px;}' +
    /* Disclaimer */
    '.disclaimer{margin-top:14px;padding:10px;background:#f8fafc;border:1px solid #dce3ee;' +
      'font-size:6.8pt;color:#64748b;line-height:1.5;}' +
    '.disc-title{font-size:7.5pt;font-weight:800;color:#0f2e57;text-transform:uppercase;' +
      'letter-spacing:0.5px;margin-bottom:5px;}' +
    '.disclaimer p{margin:0 0 4px 0;}' +
    /* Print */
    '@media print{' +
      'body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '@page{size:A4 portrait;margin:6mm 8mm;}' +
      '.hyp-card,.ev-card,.trip-card{page-break-inside:avoid;}' +
      '.sec-hdr{page-break-after:avoid;}' +
      '.disclaimer{page-break-inside:avoid;}' +
    '}';

  // ── ASSEMBLY ──────────────────────────────────────────────
  return '<!DOCTYPE html>' +
    '<html lang="en"><head>' +
      '<meta charset="UTF-8">' +
      '<title>' + e(stock.ticker) + ' Institutional Research | Continuum Intelligence</title>' +
      '<style>' + css + '</style>' +
    '</head><body>' +
      coverHtml +
      sparkHtml +
      identHtml +
      hypHtml +
      narrHtml +
      evHtml +
      discHtml +
      tripHtml +
      gapsHtml +
      techHtml +
      disclaimerHtml +
    '</body></html>';
}

// ============================================================
// INVESTOR BRIEFING
// Exactly 2 A4 pages. Dense. All key sections.
// ============================================================

function buildInvestorBriefingHTML(stock) {
  var e = pdfEsc;

  var now = new Date();
  var timestamp = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // ── Hypothesis scores (normalised) ───────────────────────
  var hyps = stock.hypotheses || [];
  var normScores = normaliseHypScores(hyps);

  // ── PAGE 1 ───────────────────────────────────────────────
  // Header
  var p1Header =
    '<div class="ib-hdr">' +
      '<div>' +
        '<div class="ib-company">' + e(stock.company) + '</div>' +
        '<div class="ib-sub">' +
          e(stock.tickerFull || stock.ticker + '.AX') + ' &nbsp;&bull;&nbsp; ' +
          e(stock.currency || '') + e(String(stock.price || '')) + ' &nbsp;&bull;&nbsp; ' +
          e(stock.date || timestamp) +
          (stock.sector ? ' &nbsp;&bull;&nbsp; ' + e(stock.sector) : '') +
        '</div>' +
        (stock.heroDescription ? '<div class="ib-tagline">' + e(stripHtml(stock.heroDescription)) + '</div>' : '') +
      '</div>' +
      '<div class="ib-hdr-right">INVESTOR BRIEFING</div>' +
    '</div>';

  // Hero Metrics
  var metricsHtml = '';
  if (stock.heroMetrics && stock.heroMetrics.length) {
    metricsHtml = '<div class="ib-metrics">';
    for (var mi = 0; mi < stock.heroMetrics.length; mi++) {
      var m = stock.heroMetrics[mi];
      metricsHtml += '<div class="ibm-item">' +
        '<div class="ibm-label">' + e(m.label) + '</div>' +
        '<div class="ibm-value">' + e(m.value) + '</div>' +
      '</div>';
    }
    metricsHtml += '</div>';
  }

  // Skew
  var skewDir = (stock.hero && stock.hero.skew) || (stock.skew && stock.skew.direction ? String(stock.skew.direction).toUpperCase() : '');
  var skewDesc = (stock.hero && stock.hero.skew_description) || (stock.skew && stock.skew.rationale) || '';
  var skewCls = skewDir === 'UPSIDE' ? 'skew-up' : skewDir === 'DOWNSIDE' ? 'skew-dn' : 'skew-bal';
  var skewHtml = skewDir ?
    '<div class="ib-block">' +
      '<div class="ib-block-label">RISK SKEW</div>' +
      '<div class="ib-skew-row">' +
        '<span class="ib-skew-badge ' + skewCls + '">' + e(skewDir) + '</span>' +
        (skewDesc ? '<span class="ib-skew-text">' + e(trunc(skewDesc, 220)) + '</span>' : '') +
      '</div>' +
    '</div>' : '';

  // Position in Range
  var pirHtml = '';
  var pirWorlds = stock.hero && stock.hero.position_in_range && stock.hero.position_in_range.worlds;
  if (pirWorlds && pirWorlds.length >= 2) {
    var pirCurrent = parseFloat(stock._livePrice || stock.price || stock.hero.position_in_range.current_price || 0);
    var pirPrices = pirWorlds.map(function(w) { return parseFloat(w.price) || 0; });
    pirPrices.push(pirCurrent);
    var pirMin = Math.min.apply(null, pirPrices);
    var pirMax = Math.max.apply(null, pirPrices);
    var pirRange = pirMax - pirMin || 1;

    var pirMarkers = '';
    for (var wi = 0; wi < pirWorlds.length; wi++) {
      var w = pirWorlds[wi];
      var wPct = ((parseFloat(w.price) - pirMin) / pirRange * 100).toFixed(1);
      pirMarkers += '<div class="pir-world" style="left:' + wPct + '%">' +
        '<div class="pir-tick"></div>' +
        '<div class="pir-price">' + e(stock.currency || '') + parseFloat(w.price).toFixed(0) + '</div>' +
        '<div class="pir-lbl">' + e(w.label) + '</div>' +
      '</div>';
    }
    var pirCurrPct = Math.min(100, Math.max(0, ((pirCurrent - pirMin) / pirRange * 100))).toFixed(1);

    pirHtml = '<div class="ib-block">' +
      '<div class="ib-block-label">POSITION IN RANGE</div>' +
      '<div class="pir-wrap">' +
        '<div class="pir-bar">' +
          pirMarkers +
          '<div class="pir-current" style="left:' + pirCurrPct + '%">' +
            '<div class="pir-dot">&#9679;</div>' +
            '<div class="pir-cur-lbl">' + e(stock.currency || '') + pirCurrent.toFixed(2) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      (stock.hero.position_in_range.note ? '<div class="pir-note">' + e(stock.hero.position_in_range.note) + '</div>' : '') +
    '</div>';
  }

  // Valuation Range
  var vrHtml = '';
  if (pirWorlds && pirWorlds.length >= 4) {
    var vrCurrent = parseFloat(stock._livePrice || stock.price || (stock.hero.position_in_range && stock.hero.position_in_range.current_price) || 0);
    var vrMin    = parseFloat(pirWorlds[0].price) || 0;
    var vrBear   = parseFloat(pirWorlds[1].price) || 0;
    var vrFairLow= (parseFloat(pirWorlds[1].price) + parseFloat(pirWorlds[2].price)) / 2;
    var vrFairHigh=(parseFloat(pirWorlds[2].price) + parseFloat(pirWorlds[3].price)) / 2;
    var vrBull   = parseFloat(pirWorlds[3].price) || 0;
    var vrRange  = vrBull - vrMin || 1;

    var vrBearPct    = ((vrBear     - vrMin) / vrRange * 100).toFixed(1);
    var vrFairLowPct = ((vrFairLow  - vrMin) / vrRange * 100).toFixed(1);
    var vrFairHighPct= ((vrFairHigh - vrMin) / vrRange * 100).toFixed(1);
    var vrCurrPct    = Math.min(100, Math.max(0, ((vrCurrent - vrMin) / vrRange * 100))).toFixed(1);
    var vrToFairH    = ((vrFairHigh / vrCurrent - 1) * 100).toFixed(1);
    var vrToBull     = ((vrBull / vrCurrent - 1) * 100).toFixed(1);
    var vrToBear     = ((vrBear / vrCurrent - 1) * 100).toFixed(1);

    var vrBadgeCls   = vrCurrent < vrBear ? 'vr-amber' : vrCurrent > vrFairHigh ? 'vr-pos' : 'vr-neu';
    var vrBadgeLabel = vrCurrent < vrBear ? 'BELOW BEAR' : vrCurrent > vrFairHigh ? 'ABOVE FAIR' : 'WITHIN FAIR';

    vrHtml = '<div class="ib-block">' +
      '<div class="ib-block-label-row">' +
        '<div class="ib-block-label">VALUATION RANGE</div>' +
        '<span class="vr-badge ' + vrBadgeCls + '">' + vrBadgeLabel + '</span>' +
      '</div>' +
      '<div class="vr-wrap">' +
        '<div class="vr-bar">' +
          '<div class="vr-zone bear-zone" style="left:0%;width:' + vrBearPct + '%"></div>' +
          '<div class="vr-zone fair-zone" style="left:' + vrFairLowPct + '%;width:' + (parseFloat(vrFairHighPct) - parseFloat(vrFairLowPct)).toFixed(1) + '%"></div>' +
          '<div class="vr-current" style="left:' + vrCurrPct + '%">' + e(stock.currency || '') + vrCurrent.toFixed(2) + '</div>' +
          '<div class="vr-marker" style="left:' + vrBearPct + '%">' +
            '<div class="vr-m-price">' + e(stock.currency || '') + vrBear.toFixed(0) + '</div>' +
            '<div class="vr-m-lbl">Bear</div>' +
          '</div>' +
          '<div class="vr-marker" style="left:' + vrFairLowPct + '%">' +
            '<div class="vr-m-price" style="color:#0d9488">' + e(stock.currency || '') + vrFairLow.toFixed(0) + '&ndash;' + e(stock.currency || '') + vrFairHigh.toFixed(0) + '</div>' +
            '<div class="vr-m-lbl">Fair</div>' +
          '</div>' +
          '<div class="vr-marker" style="left:100%">' +
            '<div class="vr-m-price">' + e(stock.currency || '') + vrBull.toFixed(0) + '</div>' +
            '<div class="vr-m-lbl">Bull</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="vr-stats">' +
        '<span class="pos">+' + vrToFairH + '% to fair high</span>' +
        '<span class="pos">+' + vrToBull + '% to bull</span>' +
        '<span>' + vrToBear + '% to bear</span>' +
      '</div>' +
    '</div>';
  }

  // Hypothesis bars
  var hypBarsHtml = '<div class="ib-block">' +
    '<div class="ib-block-label">HYPOTHESIS SURVIVAL SCORES</div>';
  for (var hi2 = 0; hi2 < hyps.length; hi2++) {
    var h2 = hyps[hi2];
    var score2 = normScores[hi2] || 0;
    var dc = dirColor(h2.direction || '');
    var desc2 = trunc(h2.description || '', 150);
    hypBarsHtml += '<div class="hyp-bar">' +
      '<div class="hyp-bar-hdr">' +
        '<span class="hyp-bar-title">' + e(stripHtml(h2.title || '')) + '</span>' +
        '<span class="hyp-bar-score" style="color:' + dc + '">' +
          e(dirIcon(h2.direction || '')) + ' ' + score2 + '%' +
        '</span>' +
      '</div>' +
      '<div class="hyp-bar-track"><div class="hyp-bar-fill" style="width:' + score2 + '%;background:' + dc + '"></div></div>' +
      '<div class="hyp-bar-desc">' + desc2 + '</div>' +
    '</div>';
  }
  hypBarsHtml += '</div>';

  // ── PAGE 2 ───────────────────────────────────────────────

  // Identity (compact table, no overview)
  var identHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">IDENTITY &amp; SNAPSHOT</div>';
  if (stock.identity && stock.identity.rows && stock.identity.rows.length) {
    identHtml2 += '<table class="dt compact"><tbody>';
    for (var ir2 = 0; ir2 < stock.identity.rows.length; ir2++) {
      var irow = stock.identity.rows[ir2];
      identHtml2 += '<tr>';
      for (var ic2 = 0; ic2 < irow.length; ic2++) {
        var icell = irow[ic2];
        identHtml2 += '<td class="dt-lbl">' + e(icell[0]) + '</td>' +
          '<td class="dt-val">' + e(stripHtml(String(icell[1] || ''))) + '</td>';
      }
      identHtml2 += '</tr>';
    }
    identHtml2 += '</tbody></table>';
  }
  identHtml2 += '</div>';

  // Dominant Narrative
  var narrHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">DOMINANT NARRATIVE</div>';
  if (stock.narrative) {
    if (stock.narrative.theNarrative) {
      narrHtml2 += '<p class="body">' + e(stripHtml(stock.narrative.theNarrative)) + '</p>';
    }
    if (stock.narrative.priceImplication) {
      narrHtml2 += '<p class="body"><strong>Price Implication:</strong> ' + e(stripHtml(stock.narrative.priceImplication)) + '</p>';
    }
    if (stock.narrative.evidenceCheck) {
      narrHtml2 += '<p class="body"><strong>Evidence Check:</strong> ' + e(stripHtml(stock.narrative.evidenceCheck)) + '</p>';
    }
  }
  narrHtml2 += '</div>';

  // Technical Analysis (condensed)
  var techHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">TECHNICAL STRUCTURE</div>';
  if (stock.technicalAnalysis) {
    var ta2 = stock.technicalAnalysis;
    var techRows = [];
    if (ta2.regime) techRows.push(['Regime', ta2.regime + (ta2.clarity ? ' / ' + ta2.clarity : '')]);
    if (ta2.trend) {
      techRows.push(['Trend', (ta2.trend.direction || '') + (ta2.trend.duration ? ', ' + ta2.trend.duration : '')]);
      if (ta2.trend.structure) techRows.push(['Structure', trunc(ta2.trend.structure, 120)]);
    }
    if (ta2.movingAverages) {
      var mas2 = ta2.movingAverages;
      if (mas2.ma50) techRows.push(['50-day MA', String(mas2.ma50.value || '') + (mas2.priceVsMa50 ? ' (+' + mas2.priceVsMa50 + '% below price)' : '')]);
      if (mas2.ma200) techRows.push(['200-day MA', String(mas2.ma200.value || '') + (mas2.priceVsMa200 ? ' (+' + mas2.priceVsMa200 + '% below price)' : '')]);
      if (mas2.crossover && mas2.crossover.type) techRows.push([mas2.crossover.type, mas2.crossover.date || '']);
    }
    if (ta2.keyLevels) {
      var klKs = Object.keys(ta2.keyLevels).slice(0, 4);
      for (var kli = 0; kli < klKs.length; kli++) {
        var klv2 = ta2.keyLevels[klKs[kli]];
        if (klv2) {
          var klStr = typeof klv2 === 'object' ? String(klv2.value || klv2.price || '') + (klv2.description ? ' (' + trunc(klv2.description, 50) + ')' : '') : String(klv2);
          techRows.push([klKs[kli], klStr]);
        }
      }
    }
    if (techRows.length) {
      techHtml2 += '<table class="dt compact"><tbody>';
      for (var tri = 0; tri < techRows.length; tri++) {
        techHtml2 += '<tr><td class="dt-lbl">' + e(techRows[tri][0]) + '</td>' +
          '<td class="dt-val">' + e(techRows[tri][1]) + '</td></tr>';
      }
      techHtml2 += '</tbody></table>';
    }
  }
  techHtml2 += '</div>';

  // Evidence cards: Corporate (Company), Broker (Sector), Economic (Macro)
  var evCards2 = stock.evidence && stock.evidence.cards ? stock.evidence.cards : [];
  function pickCard(keywords) {
    for (var ki3 = 0; ki3 < keywords.length; ki3++) {
      for (var eci2 = 0; eci2 < evCards2.length; eci2++) {
        var t = String(evCards2[eci2].title || '').toLowerCase();
        if (t.indexOf(keywords[ki3].toLowerCase()) !== -1) return evCards2[eci2];
      }
    }
    return null;
  }
  var cardCompany = pickCard(['corporate', 'company']);
  var cardSector  = pickCard(['broker', 'consensus', 'analyst', 'sector']);
  var cardMacro   = pickCard(['economic', 'macro', 'macro &amp; sector', 'alternative data']);

  var evHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">EVIDENCE: COMPANY &bull; SECTOR &bull; MACRO</div>' +
    '<div class="ev3-grid">';

  function renderMiniCard(card, fallbackTitle) {
    if (!card) return '';
    return '<div class="ev3-card">' +
      '<div class="ev3-title">' + e(stripHtml(card.title || fallbackTitle)) +
        (card.epistemicLabel ? ' <span class="ev3-ep">' + e(card.epistemicLabel) + '</span>' : '') +
      '</div>' +
      (card.finding ? '<div class="ev3-finding">' + trunc(card.finding, 200) + '</div>' : '') +
      (card.tension ? '<div class="ev3-tension">' + trunc(card.tension, 120) + '</div>' : '') +
    '</div>';
  }

  evHtml2 += renderMiniCard(cardCompany, 'Corporate Communications');
  evHtml2 += renderMiniCard(cardSector,  'Broker Research');
  evHtml2 += renderMiniCard(cardMacro,   'Economic Data');
  evHtml2 += '</div></div>';

  // Discriminators (top 3)
  var discHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">WHAT DISCRIMINATES</div>';
  var dRows2 = stock.discriminators && stock.discriminators.rows ? stock.discriminators.rows : [];
  if (dRows2.length) {
    discHtml2 += '<table class="dt compact"><thead><tr>' +
      '<th>Diag.</th><th>Evidence</th><th>Between</th></tr></thead><tbody>';
    for (var dri2 = 0; dri2 < Math.min(dRows2.length, 3); dri2++) {
      var dr2 = dRows2[dri2];
      var dc2 = String(dr2.diagnosticity || '').toLowerCase() === 'high' ? 'diag-high' :
                String(dr2.diagnosticity || '').toLowerCase() === 'critical' ? 'diag-crit' : '';
      discHtml2 += '<tr>' +
        '<td><span class="diag ' + dc2 + '">' + e(dr2.diagnosticity || '') + '</span></td>' +
        '<td>' + trunc(dr2.evidence || '', 120) + '</td>' +
        '<td>' + e(trunc(dr2.discriminatesBetween || '', 70)) + '</td>' +
        '</tr>';
    }
    discHtml2 += '</tbody></table>';
  }
  discHtml2 += '</div>';

  // Tripwires / What We're Watching (top 4)
  var tripHtml2 = '<div class="ib-block">' +
    '<div class="ib-block-label">WHAT WE\'RE WATCHING</div>';
  var tCards2 = stock.tripwires && stock.tripwires.cards ? stock.tripwires.cards : [];
  for (var tci2 = 0; tci2 < Math.min(tCards2.length, 4); tci2++) {
    var tc2 = tCards2[tci2];
    tripHtml2 += '<div class="tw2-card">' +
      '<div class="tw2-name">' +
        (tc2.date ? '<span class="tw2-date">' + e(tc2.date) + '</span> ' : '') +
        e(stripHtml(tc2.name || '')) +
      '</div>';
    var conds2 = tc2.conditions || [];
    for (var cci2 = 0; cci2 < Math.min(conds2.length, 2); cci2++) {
      var cond2 = conds2[cci2];
      var cv2 = String(cond2.valence || '');
      var ifCls2 = cv2 === 'positive' ? 'cond-pos' : 'cond-neg';
      tripHtml2 += '<div class="tw2-cond">' +
        '<span class="tw2-if ' + ifCls2 + '">' + e(trunc(cond2.if || '', 90)) + '</span>' +
        ' &rarr; <span class="tw2-then">' + e(trunc(cond2.then || '', 100)) + '</span>' +
      '</div>';
    }
    tripHtml2 += '</div>';
  }
  tripHtml2 += '</div>';

  // Footer
  var footerHtml = '<div class="ib-footer">Generated ' + e(timestamp) + ' AEST &bull; ' +
    e(stock.ticker) + ' &bull; Continuum Intelligence &bull; Not personal financial advice.</div>';

  // ── CSS ───────────────────────────────────────────────────
  var css2 =
    '*{margin:0;padding:0;box-sizing:border-box;}' +
    'body{font-family:Inter,"Segoe UI",Arial,sans-serif;color:#1a1f2e;font-size:7pt;' +
      'line-height:1.38;background:#fff;padding:6px 8px;max-width:none;}' +
    '.page{min-height:auto;}' +
    /* Header */
    '.ib-hdr{display:flex;justify-content:space-between;align-items:flex-start;' +
      'border-bottom:2px solid #0f2e57;padding-bottom:5px;margin-bottom:6px;}' +
    '.ib-company{font-size:14pt;font-weight:800;color:#102a43;line-height:1.1;}' +
    '.ib-sub{font-size:7pt;color:#64748b;margin-top:2px;}' +
    '.ib-tagline{font-size:6.5pt;color:#475569;font-style:italic;margin-top:2px;}' +
    '.ib-hdr-right{font-size:7pt;font-weight:700;color:#0f2e57;letter-spacing:1.5px;' +
      'text-transform:uppercase;white-space:nowrap;padding-top:2px;}' +
    /* Metrics row */
    '.ib-metrics{display:flex;gap:12px;flex-wrap:wrap;margin:4px 0;}' +
    '.ibm-item{min-width:55px;}' +
    '.ibm-label{font-size:5.8pt;text-transform:uppercase;letter-spacing:0.5px;color:#94a3b8;}' +
    '.ibm-value{font-size:8.5pt;font-weight:700;color:#1e3a5f;}' +
    /* Block containers */
    '.ib-block{margin-bottom:7px;}' +
    '.ib-block-label{font-size:6pt;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;' +
      'color:#94a3b8;margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:2px;}' +
    '.ib-block-label-row{display:flex;align-items:center;justify-content:space-between;' +
      'margin-bottom:3px;border-bottom:1px solid #e2e8f0;padding-bottom:2px;}' +
    /* Skew */
    '.ib-skew-row{display:flex;align-items:baseline;gap:8px;}' +
    '.ib-skew-badge{font-size:7.5pt;font-weight:800;padding:2px 7px;border-radius:3px;white-space:nowrap;}' +
    '.skew-up{background:#dcfce7;color:#166534;}' +
    '.skew-dn{background:#fee2e2;color:#991b1b;}' +
    '.skew-bal{background:#fef3c7;color:#92400e;}' +
    '.ib-skew-text{font-size:6.8pt;color:#475569;line-height:1.4;}' +
    /* Position in Range */
    '.pir-wrap{position:relative;margin:18px 0 8px 0;}' +
    '.pir-bar{position:relative;height:6px;background:#e2e8f0;border-radius:3px;margin:0 6px;}' +
    '.pir-world{position:absolute;transform:translateX(-50%);top:-16px;text-align:center;white-space:nowrap;}' +
    '.pir-tick{width:1px;height:14px;background:#94a3b8;margin:0 auto;}' +
    '.pir-price{font-size:5.5pt;font-weight:700;color:#334155;margin-top:1px;}' +
    '.pir-lbl{font-size:5pt;color:#94a3b8;}' +
    '.pir-current{position:absolute;transform:translateX(-50%);top:-5px;text-align:center;}' +
    '.pir-dot{font-size:8pt;color:#0f2e57;line-height:1;}' +
    '.pir-cur-lbl{font-size:5.5pt;font-weight:700;color:#0f2e57;white-space:nowrap;}' +
    '.pir-note{font-size:5.8pt;color:#94a3b8;margin-top:2px;font-style:italic;}' +
    /* Valuation Range */
    '.vr-wrap{position:relative;margin:18px 0 6px 0;}' +
    '.vr-bar{position:relative;height:10px;background:#f1f5f9;border-radius:4px;margin:0 6px;}' +
    '.vr-zone{position:absolute;top:0;bottom:0;border-radius:2px;}' +
    '.bear-zone{background:#fee2e2;opacity:0.5;}' +
    '.fair-zone{background:#dcfce7;opacity:0.5;}' +
    '.vr-current{position:absolute;transform:translateX(-50%);top:-14px;font-size:6pt;font-weight:700;color:#0f2e57;white-space:nowrap;}' +
    '.vr-marker{position:absolute;transform:translateX(-50%);top:12px;text-align:center;}' +
    '.vr-m-price{font-size:5.5pt;font-weight:700;color:#334155;white-space:nowrap;}' +
    '.vr-m-lbl{font-size:5pt;color:#94a3b8;}' +
    '.vr-badge{font-size:6pt;font-weight:700;padding:1px 5px;border-radius:2px;}' +
    '.vr-pos{background:#dcfce7;color:#166534;}' +
    '.vr-amber{background:#fef3c7;color:#92400e;}' +
    '.vr-neu{background:#f0f4fa;color:#334155;}' +
    '.vr-stats{display:flex;gap:10px;font-size:6pt;margin-top:22px;flex-wrap:wrap;}' +
    '.pos{color:#16a34a;font-weight:600;}' +
    '.neg{color:#dc2626;}' +
    /* Hypothesis bars */
    '.hyp-bar{margin-bottom:5px;}' +
    '.hyp-bar-hdr{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;}' +
    '.hyp-bar-title{font-size:7.5pt;font-weight:700;color:#102a43;}' +
    '.hyp-bar-score{font-size:7.5pt;font-weight:800;}' +
    '.hyp-bar-track{height:5px;background:#f1f5f9;border-radius:3px;margin-bottom:2px;}' +
    '.hyp-bar-fill{height:100%;border-radius:3px;}' +
    '.hyp-bar-desc{font-size:6.2pt;color:#64748b;line-height:1.35;}' +
    /* Page 2 containers */
    '.body{font-size:7pt;color:#334155;line-height:1.45;margin:2px 0 4px 0;}' +
    /* Tables */
    '.dt{width:100%;border-collapse:collapse;font-size:6.5pt;margin:2px 0 5px 0;}' +
    '.dt th{background:#edf2f8;color:#334155;text-align:left;padding:2px 4px;border:1px solid #d9e2ef;' +
      'font-size:5.8pt;text-transform:uppercase;letter-spacing:0.3px;font-weight:700;}' +
    '.dt td{padding:2px 4px;border:1px solid #e2e8f0;vertical-align:top;line-height:1.3;}' +
    '.dt tbody tr:nth-child(even){background:#fafcfe;}' +
    '.compact td,.compact th{padding:2px 3px;font-size:6.2pt;}' +
    '.dt-lbl{font-weight:600;color:#475569;white-space:nowrap;width:90px;}' +
    '.dt-val{color:#1e293b;}' +
    '.diag{font-size:5.8pt;font-weight:700;padding:1px 3px;border-radius:2px;background:#f1f5f9;color:#475569;}' +
    '.diag-high{background:#fef3c7;color:#92400e;}' +
    '.diag-crit{background:#fee2e2;color:#991b1b;}' +
    /* Evidence 3-grid */
    '.ev3-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}' +
    '.ev3-card{border:1px solid #e2e8f0;border-radius:3px;padding:4px 5px;}' +
    '.ev3-title{font-size:6.5pt;font-weight:700;color:#102a43;margin-bottom:2px;}' +
    '.ev3-ep{font-size:5.5pt;color:#64748b;background:#f1f5f9;padding:0 3px;border-radius:2px;margin-left:3px;}' +
    '.ev3-finding{font-size:6.2pt;color:#334155;line-height:1.38;margin-bottom:2px;}' +
    '.ev3-tension{font-size:6pt;color:#64748b;font-style:italic;line-height:1.35;}' +
    /* Tripwires */
    '.tw2-card{border-left:3px solid #e2e8f0;padding:2px 0 2px 6px;margin-bottom:4px;}' +
    '.tw2-name{font-size:7pt;font-weight:700;color:#102a43;margin-bottom:1px;}' +
    '.tw2-date{font-size:5.8pt;color:#94a3b8;font-weight:400;}' +
    '.tw2-cond{font-size:6.2pt;color:#475569;line-height:1.35;margin-top:1px;}' +
    '.tw2-if{font-weight:600;}' +
    '.cond-pos{color:#16a34a;}' +
    '.cond-neg{color:#dc2626;}' +
    '.tw2-then{color:#64748b;}' +
    /* Footer */
    '.ib-footer{font-size:5.8pt;color:#94a3b8;border-top:1px solid #e2e8f0;' +
      'padding-top:4px;margin-top:6px;text-align:center;}' +
    /* Page 2 mini-header */
    '.p2-hdr{display:flex;justify-content:space-between;align-items:baseline;' +
      'border-bottom:1px solid #0f2e57;padding-bottom:3px;margin-bottom:6px;font-size:6.5pt;}' +
    '.p2-hdr-co{font-weight:700;color:#0f2e57;}' +
    '.p2-hdr-label{color:#94a3b8;letter-spacing:1px;text-transform:uppercase;}' +
    /* Print */
    '@media print{' +
      'body{margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      '@page{size:A4 portrait;margin:6mm 8mm;}' +
      '.page-1{page-break-after:always;}' +
      '.ev3-card,.tw2-card{page-break-inside:avoid;}' +
      '.ib-block{page-break-inside:avoid;}' +
    '}';

  // ── ASSEMBLY ──────────────────────────────────────────────
  var p2Header = '<div class="p2-hdr">' +
    '<span class="p2-hdr-co">' + e(stock.company) + ' &bull; ' + e(stock.tickerFull || stock.ticker + '.AX') + '</span>' +
    '<span class="p2-hdr-label">INVESTOR BRIEFING &mdash; PAGE 2</span>' +
  '</div>';

  return '<!DOCTYPE html>' +
    '<html lang="en"><head>' +
      '<meta charset="UTF-8">' +
      '<title>' + e(stock.ticker) + ' Investor Briefing | Continuum Intelligence</title>' +
      '<style>' + css2 + '</style>' +
    '</head><body>' +
    '<div class="page page-1">' +
      p1Header +
      metricsHtml +
      skewHtml +
      pirHtml +
      vrHtml +
      hypBarsHtml +
    '</div>' +
    '<div class="page page-2">' +
      p2Header +
      identHtml2 +
      narrHtml2 +
      techHtml2 +
      evHtml2 +
      discHtml2 +
      tripHtml2 +
      footerHtml +
    '</div>' +
    '</body></html>';
}
