/**
 * pdf.js -- PDF Report Generation (Institutional + Retail)
 *
 * Extracted from index.html lines ~12787-13719.
 * Generates self-contained HTML documents for print-to-PDF.
 * Two formats:
 *   - Institutional: DOM-based snapshot capturing NFI overlays
 *   - Retail: STOCK_DATA-based simplified investor briefing
 *
 * Depends on:
 *   - window.STOCK_DATA (global)
 *   - normaliseScores from ../lib/dom.js
 */

import { STOCK_DATA } from '../lib/state.js';
import { normaliseScores } from '../lib/dom.js';

// ============================================================
// PDF REPORT GENERATOR -- window.open + window.print
// Reads directly from STOCK_DATA[ticker]. ALL inline styles.
// NO html2pdf -- uses browser print-to-PDF (guaranteed content).
// ============================================================

function pdfEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function stripHtml(str) {
  if (!str) return '';
  var tmp = document.createElement('div');
  tmp.innerHTML = str;
  return tmp.textContent || tmp.innerText || '';
}

function normaliseScoresForPDF(scores) {
  // Delegate to normaliseScores for consistent v3 floor/ceiling enforcement
  var items = scores.map(function(s) { return { score: String(parseFloat(s.score) || 0) }; });
  return normaliseScores(items);
}

export function generatePDFReport(ticker, type) {
  var btn = event ? event.currentTarget : null;
  if (btn) btn.classList.add('generating');

  // Institutional reads live DOM; retail reads STOCK_DATA
  var reportHTML = '';
  if (type === 'institutional') {
    // DOM-based: captures NFI overlays, live weight divergences, contradicted badges
    reportHTML = buildInstitutionalHTML(ticker);
    if (!reportHTML) {
      alert('Report page not rendered for ' + ticker + '. Navigate to the report first.');
      if (btn) btn.classList.remove('generating');
      return;
    }
    console.log('[PDF] Institutional snapshot from live DOM for', ticker);
  } else {
    // Retail still reads from STOCK_DATA (simplified view, no NFI overlays)
    var stock = null;
    if (typeof STOCK_DATA !== 'undefined' && STOCK_DATA[ticker]) {
      stock = STOCK_DATA[ticker];
    }
    if (!stock || stock._indexOnly) {
      alert('Full research data not yet loaded for ' + ticker + '. Please wait for the report to finish loading, then try again.');
      if (btn) btn.classList.remove('generating');
      return;
    }
    console.log('[PDF] Retail briefing from STOCK_DATA for', ticker, '- company:', stock.company);
    reportHTML = buildRetailHTML(stock);
  }

  // Open in new window and trigger print dialog
  var win = window.open('', '_blank');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site.');
    if (btn) btn.classList.remove('generating');
    return;
  }
  win.document.write(reportHTML);
  win.document.close();
  if (btn) btn.classList.remove('generating');
  setTimeout(function() { win.print(); }, 800);
}

/**
 * buildInstitutionalHTML(ticker)
 *
 * Generates a self-contained HTML document for PDF rendering by extracting
 * content directly from the live rendered DOM, including all NFI overlay
 * modifications (weight breakdowns, contradicted badges, narrative shifts).
 *
 * This is a screen-to-print translation layer. The PDF is a snapshot of the
 * living research document at the moment the user clicks download.
 *
 * Architecture:
 *   - Reads from document.getElementById('page-report-' + ticker)
 *   - Extracts each numbered section by class/ID conventions
 *   - Preserves all NFI-injected content (market-responsive narrative, weight bars)
 *   - Renders to self-contained A4-optimised HTML for headless Chrome / Puppeteer
 *
 * Sections extracted (matching live page order):
 *   1. Verdict banner
 *   2. Section 01: Identity & Snapshot
 *   3. Section 02: Competing Hypotheses (with NFI weight overlays)
 *   4. Section 03: Dominant Narrative (with NFI market-responsive update)
 *   5. Section 04: Cross-Domain Evidence Synthesis (10 domains + matrix)
 *   6. Section 05: What Discriminates
 *   7. Section 06: What We're Watching (tripwires)
 *   8. Section 07: Evidence Gaps & Integrity Notes
 *   9. Section 08: Technical Structure (text only; charts excluded)
 *  10. Disclaimer / methodology
 */
function buildInstitutionalHTML(ticker) {
  if (typeof document === 'undefined') {
    console.error('[PDF] No DOM available. This function must run in the browser.');
    return '';
  }
  var reportPage = document.getElementById('page-report-' + ticker);
  if (!reportPage) {
    console.error('[PDF] No report page found for ticker: ' + ticker);
    return '';
  }
  var now = new Date();
  var timestamp = now.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  // ═════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═════════════════════════════════════════════════════════════════════
  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  /** Extract text from an element, cleaning whitespace */
  function txt(el) {
    if (!el) return '';
    return el.textContent.replace(/\s+/g, ' ').trim();
  }
  /** Find a section by its ID (e.g., 'wow-identity') */
  function getSection(suffix) {
    return reportPage.querySelector('#' + ticker.toLowerCase() + '-' + suffix);
  }
  /** Extract all elements matching a selector within a parent */
  function getAll(parent, selector) {
    if (!parent) return [];
    return Array.from(parent.querySelectorAll(selector));
  }
  /** Extract table as array of row arrays */
  function extractTable(tableEl) {
    if (!tableEl) return { headers: [], rows: [] };
    var headers = [];
    var headerCells = tableEl.querySelectorAll('thead th');
    for (var h = 0; h < headerCells.length; h++) headers.push(txt(headerCells[h]));
    var rows = [];
    var bodyRows = tableEl.querySelectorAll('tbody tr');
    for (var r = 0; r < bodyRows.length; r++) {
      var cells = bodyRows[r].querySelectorAll('td, th');
      var row = [];
      for (var c = 0; c < cells.length; c++) row.push(txt(cells[c]));
      if (row.length) rows.push(row);
    }
    return { headers: headers, rows: rows };
  }
  /** Build an HTML table from headers and rows */
  function buildTable(headers, rows, compact) {
    if (!rows.length && !headers.length) return '';
    var cls = compact ? 'data-table compact' : 'data-table';
    var html = '<table class="' + cls + '">';
    if (headers.length) {
      html += '<thead><tr>';
      for (var h = 0; h < headers.length; h++) {
        html += '<th>' + esc(headers[h]) + '</th>';
      }
      html += '</tr></thead>';
    }
    html += '<tbody>';
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      for (var c = 0; c < rows[r].length; c++) {
        html += '<td>' + esc(rows[r][c]) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }
  // ═════════════════════════════════════════════════════════════════════
  // PAGE CHROME
  // ═════════════════════════════════════════════════════════════════════
  function pageHeader(sectionLabel) {
    return '<div class="pdf-header">' +
      '<div class="pdf-brand-block">' +
        '<div class="pdf-brand">CONTINUUM INTELLIGENCE</div>' +
        '<div class="pdf-tag">INDEPENDENT CROSS-DOMAIN EQUITY RESEARCH</div>' +
      '</div>' +
      '<div class="pdf-head-right">' +
        '<span>' + esc(ticker) + '</span>' +
        '<span class="sep">&bull;</span>' +
        '<span>' + esc(sectionLabel) + '</span>' +
        '<span class="sep">&bull;</span>' +
        '<span>' + esc(timestamp) + '</span>' +
      '</div>' +
    '</div>';
  }
  function pageBreak() {
    return '<div class="page-break"></div>';
  }
  function forcedPageBreak() {
    return '<div class="page-break-forced"></div>';
  }
  function sectionTitle(number, title) {
    return '<div class="sec-header">' +
      '<span class="sec-num">Section ' + esc(number) + '</span>' +
      '<span class="sec-title">' + esc(title) + '</span>' +
    '</div>';
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: VERDICT BANNER
  // ═════════════════════════════════════════════════════════════════════
  var verdictEl = reportPage.querySelector('.verdict-section');
  var verdictHtml = '';
  if (verdictEl) {
    var verdictTextEl = verdictEl.querySelector('.verdict-text');
    var verdictScoresEl = verdictEl.querySelector('.verdict-scores');
    var vText = verdictTextEl ? txt(verdictTextEl) : txt(verdictEl);
    var vScores = '';
    if (verdictScoresEl) {
      var vsItems = getAll(verdictScoresEl, '.vs-item');
      for (var vi = 0; vi < vsItems.length; vi++) {
        var vsLabel = vsItems[vi].querySelector('.vs-label');
        var vsScore = vsItems[vi].querySelector('.vs-score');
        var vsDir = vsItems[vi].querySelector('.vs-direction');
        vScores += '<span class="pdf-vs-item">' +
          '<span class="pdf-vs-label">' + esc(txt(vsLabel)) + '</span>' +
          '<span class="pdf-vs-score">' + esc(txt(vsScore)) + '</span>' +
          (vsDir ? '<span class="pdf-vs-dir">' + esc(txt(vsDir)) + '</span>' : '') +
        '</span>';
      }
    }
    verdictHtml = '<div class="pdf-verdict">' +
      '<div class="pdf-verdict-text">' + esc(vText) + '</div>' +
      (vScores ? '<div class="pdf-verdict-scores">' + vScores + '</div>' : '') +
    '</div>';
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: DISLOCATION ALERT (NFI)
  // ═════════════════════════════════════════════════════════════════════
  var alertEl = reportPage.querySelector('.nfi-alert-banner');
  var alertHtml = '';
  if (alertEl) {
    var alertInner = alertEl.querySelector('.nfi-alert-inner');
    alertHtml = '<div class="pdf-alert">' + esc(txt(alertInner || alertEl)) + '</div>';
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 01 - IDENTITY & SNAPSHOT
  // ═════════════════════════════════════════════════════════════════════
  var identitySection = getSection('identity');
  var identityHtml = '';
  if (identitySection) {
    // Business overview paragraph
    var overviewP = identitySection.querySelector('.rs-text');
    var overview = overviewP ? txt(overviewP) : '';
    // Metrics table (the identity-table with key-value pairs)
    var metricsTable = identitySection.querySelector('.identity-table');
    var metricsData = extractTable(metricsTable);
    identityHtml = sectionTitle('01', 'Identity & Snapshot') +
      buildTable(metricsData.headers, metricsData.rows, true) +
      (overview ? '<p class="body-text">' + esc(overview) + '</p>' : '');
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 02 - COMPETING HYPOTHESES
  // ═════════════════════════════════════════════════════════════════════
  var hypSection = getSection('hypotheses');
  var hypHtml = '';
  if (hypSection) {
    var cards = getAll(hypSection, '.hyp-card');
    var cardsHtml = '';
    for (var hi = 0; hi < cards.length; hi++) {
      var card = cards[hi];
      var titleEl = card.querySelector('.hc-title');
      var scoreEl = card.querySelector('.hc-score-number');
      var scoreMetaEl = card.querySelector('.hc-score-meta');
      var statusEl = card.querySelector('.hc-status');
      var descEl = card.querySelector('.hc-desc');
      var dirClass = card.className.indexOf('dir-up') !== -1 ? 'hyp-up' :
                     card.className.indexOf('dir-down') !== -1 ? 'hyp-down' : 'hyp-flat';
      // NFI weight breakdown (if present)
      var nfiWeights = card.querySelector('.nfi-hyp-weights');
      var nfiHtml = '';
      if (nfiWeights) {
        var hwRows = getAll(nfiWeights, '.nfi-hw-row');
        var gapEl = nfiWeights.querySelector('.nfi-hw-gap');
        nfiHtml = '<div class="pdf-weights">';
        for (var w = 0; w < hwRows.length; w++) {
          var label = hwRows[w].querySelector('.nfi-hw-label');
          var value = hwRows[w].querySelector('.nfi-hw-value');
          var bar = hwRows[w].querySelector('.nfi-hw-bar');
          var barWidth = bar ? bar.style.width : '0%';
          var barClass = '';
          if (bar) {
            if (bar.className.indexOf('bar-lt') !== -1) barClass = 'bar-research';
            else if (bar.className.indexOf('bar-st') !== -1) barClass = 'bar-market';
            else if (bar.className.indexOf('bar-blend') !== -1) barClass = 'bar-blended';
          }
          nfiHtml += '<div class="pdf-weight-row">' +
            '<span class="wt-label">' + esc(txt(label)) + '</span>' +
            '<div class="wt-bar-bg"><div class="wt-bar ' + barClass + '" style="width:' + barWidth + '"></div></div>' +
            '<span class="wt-value">' + esc(txt(value)) + '</span>' +
          '</div>';
        }
        if (gapEl) {
          var gapClass = gapEl.className.indexOf('gap-high') !== -1 ? 'gap-high' :
                         gapEl.className.indexOf('gap-medium') !== -1 ? 'gap-medium' : '';
          nfiHtml += '<div class="pdf-gap ' + gapClass + '">' + esc(txt(gapEl)) + '</div>';
        }
        nfiHtml += '</div>';
      }
      // Contradicted badge check
      var contradicted = card.querySelector('.nfi-contradicted-badge');
      var contradictedHtml = contradicted ? ' <span class="pdf-contradicted">CONTRADICTED</span>' : '';
      // Supporting / Contradicting evidence lists
      var listsHtml = '';
      var hcLists = getAll(card, '.hc-list');
      for (var li = 0; li < hcLists.length; li++) {
        var listLabel = hcLists[li].previousElementSibling;
        if (listLabel && listLabel.classList.contains('hc-subtitle')) {
          listsHtml += '<div class="pdf-hyp-list-label">' + esc(txt(listLabel)) + '</div>';
        }
        var listItems = getAll(hcLists[li], 'li');
        listsHtml += '<ul class="pdf-hyp-list">';
        for (var lj = 0; lj < listItems.length; lj++) {
          listsHtml += '<li>' + esc(txt(listItems[lj])) + '</li>';
        }
        listsHtml += '</ul>';
      }
      cardsHtml += '<div class="pdf-hyp-card ' + dirClass + '">' +
        '<div class="pdf-hyp-header">' +
          '<div class="pdf-hyp-title">' + esc(txt(titleEl)) + contradictedHtml + '</div>' +
          '<div class="pdf-hyp-score">' + esc(txt(scoreEl)) +
            (statusEl ? ' <span class="pdf-hyp-status">' + esc(txt(statusEl)) + '</span>' : '') +
          '</div>' +
        '</div>' +
        (scoreMetaEl ? '<div class="pdf-hyp-meta">' + esc(txt(scoreMetaEl)) + '</div>' : '') +
        nfiHtml +
        '<div class="pdf-hyp-body">' + esc(txt(descEl)) + '</div>' +
        listsHtml +
      '</div>';
    }
    hypHtml = sectionTitle('02', 'Competing Hypotheses') + cardsHtml;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 03 - DOMINANT NARRATIVE (including NFI overlay)
  // ═════════════════════════════════════════════════════════════════════
  var narrativeSection = getSection('narrative');
  var narrativeHtml = '';
  if (narrativeSection) {
    // NFI Market-Responsive Narrative Update (if present)
    var nfiNarrative = narrativeSection.querySelector('.nfi-market-narrative');
    var nfiNarrHtml = '';
    if (nfiNarrative) {
      var nfiHeader = nfiNarrative.querySelector('.nfi-mn-header');
      var nfiSections = getAll(nfiNarrative, '.nfi-mn-section');
      nfiNarrHtml = '<div class="pdf-nfi-narrative">' +
        '<div class="pdf-nfi-header">' + esc(txt(nfiHeader)) + '</div>';
      for (var ns = 0; ns < nfiSections.length; ns++) {
        var nsLabel = nfiSections[ns].querySelector('.nfi-mn-label');
        var nsText = nfiSections[ns].querySelector('.nfi-mn-text');
        nfiNarrHtml += '<div class="pdf-nfi-section">' +
          (nsLabel ? '<div class="pdf-nfi-label">' + esc(txt(nsLabel)) + '</div>' : '') +
          (nsText ? '<div class="pdf-nfi-text">' + esc(txt(nsText)) + '</div>' : '') +
        '</div>';
      }
      nfiNarrHtml += '</div>';
    }
    // Standard narrative sub-sections
    var subtitles = getAll(narrativeSection, '.rs-subtitle');
    var standardNarr = '';
    for (var si = 0; si < subtitles.length; si++) {
      standardNarr += '<div class="pdf-narr-sub">' + esc(txt(subtitles[si])) + '</div>';
      var nextSibling = subtitles[si].nextElementSibling;
      while (nextSibling && !nextSibling.classList.contains('rs-subtitle')) {
        if (nextSibling.classList.contains('rs-text') || nextSibling.tagName === 'P') {
          standardNarr += '<p class="body-text">' + esc(txt(nextSibling)) + '</p>';
        }
        nextSibling = nextSibling.nextElementSibling;
      }
    }
    narrativeHtml = sectionTitle('03', 'Dominant Narrative') +
      nfiNarrHtml + standardNarr;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 04 - EVIDENCE SYNTHESIS
  // ═════════════════════════════════════════════════════════════════════
  var evidenceSection = getSection('evidence');
  var evidenceHtml = '';
  if (evidenceSection) {
    // Intro text
    var evIntro = evidenceSection.querySelector('.rs-text');
    var evIntroHtml = evIntro ? '<p class="body-text italic">' + esc(txt(evIntro)) + '</p>' : '';
    // Evidence cards (10 domains)  --  extract structured content from each card
    var evCards = getAll(evidenceSection, '.evidence-card');
    var evCardsHtml = '';
    for (var ei = 0; ei < evCards.length; ei++) {
      var evCard = evCards[ei];
      var ecTitle = evCard.querySelector('.ec-title');
      var ecEpistemic = evCard.querySelector('.ec-epistemic');
      var ecFinding = evCard.querySelector('.ec-finding');
      var ecSource = evCard.querySelector('.ec-source');
      var ecTags = getAll(evCard, '.ec-tag');
      var tagsStr = '';
      for (var eti = 0; eti < ecTags.length; eti++) {
        tagsStr += '<span class="pdf-ec-tag">' + esc(txt(ecTags[eti])) + '</span>';
      }
      evCardsHtml += '<div class="pdf-ev-card">' +
        '<div class="pdf-ev-header">' +
          '<span class="pdf-ev-title">' + esc(txt(ecTitle)) + '</span>' +
          (ecEpistemic ? '<span class="pdf-ev-epistemic">' + esc(txt(ecEpistemic)) + '</span>' : '') +
        '</div>' +
        (ecFinding ? '<div class="pdf-ev-finding">' + esc(txt(ecFinding)) + '</div>' : '') +
        '<div class="pdf-ev-footer">' +
          (tagsStr ? '<div class="pdf-ev-tags">' + tagsStr + '</div>' : '') +
          (ecSource ? '<div class="pdf-ev-source">' + esc(txt(ecSource)) + '</div>' : '') +
        '</div>' +
      '</div>';
    }
    // Evidence alignment table/matrix
    var evTable = evidenceSection.querySelector('.evidence-table');
    var evTableData = extractTable(evTable);
    var evTableHtml = buildTable(evTableData.headers, evTableData.rows, true);
    var alignSubtitle = '';
    var subs = getAll(evidenceSection, '.rs-subtitle');
    for (var es = 0; es < subs.length; es++) {
      if (txt(subs[es]).indexOf('Alignment') !== -1) {
        alignSubtitle = '<div class="pdf-sub-heading">' + esc(txt(subs[es])) + '</div>';
      }
    }
    evidenceHtml = sectionTitle('04', 'Cross-Domain Evidence Synthesis') +
      evIntroHtml + evCardsHtml + alignSubtitle + evTableHtml;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 05 - WHAT DISCRIMINATES
  // ═════════════════════════════════════════════════════════════════════
  var discSection = getSection('discriminates');
  var discHtml = '';
  if (discSection) {
    var discIntro = discSection.querySelector('.rs-text');
    var discTable = discSection.querySelector('.disc-table');
    var discContent = '';
    if (discTable) {
      var dt = extractTable(discTable);
      discContent += buildTable(dt.headers, dt.rows, true);
    }
    // Non-discriminating callout
    var discCallout = discSection.querySelector('.callout');
    if (discCallout) {
      discContent += '<div class="pdf-callout">' + esc(txt(discCallout)) + '</div>';
    }
    discHtml = sectionTitle('05', 'What Discriminates') +
      (discIntro ? '<p class="body-text">' + esc(txt(discIntro)) + '</p>' : '') +
      discContent;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 06 - TRIPWIRES
  // ═════════════════════════════════════════════════════════════════════
  var tripSection = getSection('tripwires');
  var tripHtml = '';
  if (tripSection) {
    var tripIntro = tripSection.querySelector('.rs-text');
    var tripCards = getAll(tripSection, '.tw-card');
    var tripContent = '';
    for (var tc = 0; tc < tripCards.length; tc++) {
      var twCard = tripCards[tc];
      var twDate = twCard.querySelector('.tw-date');
      var twName = twCard.querySelector('.tw-name');
      var twSource = twCard.querySelector('.tw-source');
      var twConds = getAll(twCard, '.tw-condition');
      var condsHtml = '';
      for (var tci = 0; tci < twConds.length; tci++) {
        var condIf = twConds[tci].querySelector('.tw-cond-if');
        var condThen = twConds[tci].querySelector('.tw-cond-then');
        var valClass = condIf && condIf.classList.contains('positive') ? 'cond-pos' : 'cond-neg';
        condsHtml += '<div class="pdf-tw-cond">' +
          '<span class="pdf-tw-if ' + valClass + '">' + esc(txt(condIf)) + '</span>' +
          '<span class="pdf-tw-then">' + esc(txt(condThen)) + '</span>' +
        '</div>';
      }
      tripContent += '<div class="pdf-trip-card">' +
        '<div class="pdf-trip-header">' +
          (twDate ? '<span class="pdf-trip-date">' + esc(txt(twDate)) + '</span>' : '') +
          (twName ? '<span class="pdf-trip-name">' + esc(txt(twName)) + '</span>' : '') +
        '</div>' +
        condsHtml +
        (twSource ? '<div class="pdf-trip-source">' + esc(txt(twSource)) + '</div>' : '') +
      '</div>';
    }
    tripHtml = sectionTitle('06', 'What We\'re Watching') +
      (tripIntro ? '<p class="body-text">' + esc(txt(tripIntro)) + '</p>' : '') +
      tripContent;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 07 - EVIDENCE GAPS
  // ═════════════════════════════════════════════════════════════════════
  var gapsSection = getSection('gaps');
  var gapsHtml = '';
  if (gapsSection) {
    var gapsContent = '';
    // Coverage table
    var gapsTable = gapsSection.querySelector('.gaps-table');
    if (gapsTable) {
      var gtData = extractTable(gapsTable);
      gapsContent += '<div class="pdf-sub-heading">Domain Coverage Assessment</div>' +
        buildTable(gtData.headers, gtData.rows, true);
    }
    // Couldn't assess callouts
    var gapsCallouts = getAll(gapsSection, '.callout');
    if (gapsCallouts.length) {
      gapsContent += '<div class="pdf-sub-heading">What We Couldn\'t Assess</div>';
      for (var gi = 0; gi < gapsCallouts.length; gi++) {
        gapsContent += '<div class="pdf-callout">' + esc(txt(gapsCallouts[gi])) + '</div>';
      }
    }
    // Analytical limitations
    var gapsSubs = getAll(gapsSection, '.rs-subtitle');
    for (var gsi = 0; gsi < gapsSubs.length; gsi++) {
      if (txt(gapsSubs[gsi]).indexOf('Analytical') !== -1) {
        var limNext = gapsSubs[gsi].nextElementSibling;
        if (limNext) {
          gapsContent += '<div class="pdf-sub-heading">' + esc(txt(gapsSubs[gsi])) + '</div>' +
            '<p class="body-text">' + esc(txt(limNext)) + '</p>';
        }
      }
    }
    gapsHtml = sectionTitle('07', 'Evidence Gaps & Integrity Notes') + gapsContent;
  }
  // ═════════════════════════════════════════════════════════════════════
  // EXTRACT: SECTION 08 - TECHNICAL STRUCTURE (text only)
  // ═════════════════════════════════════════════════════════════════════
  var techSection = getSection('technical');
  var techHtml = '';
  if (techSection) {
    var techSubs = getAll(techSection, '.rs-subtitle');
    var techContent = '';
    for (var tsi = 0; tsi < techSubs.length; tsi++) {
      techContent += '<div class="pdf-sub-heading">' + esc(txt(techSubs[tsi])) + '</div>';
      var nextTech = techSubs[tsi].nextElementSibling;
      while (nextTech && !nextTech.classList.contains('rs-subtitle')) {
        if (nextTech.tagName === 'TABLE') {
          var techTable = extractTable(nextTech);
          techContent += buildTable(techTable.headers, techTable.rows, true);
        } else {
          var techText = txt(nextTech);
          if (techText.length > 5) {
            techContent += '<p class="body-text">' + esc(techText) + '</p>';
          }
        }
        nextTech = nextTech.nextElementSibling;
      }
    }
    // If no subtitles, extract text from ta-text-content area
    if (!techSubs.length) {
      var taTextContent = techSection.querySelector('.ta-text-content');
      if (taTextContent) {
        var taParas = getAll(taTextContent, 'p, .rs-text, .ta-row');
        for (var tap = 0; tap < taParas.length; tap++) {
          var pText = txt(taParas[tap]);
          if (pText.length > 5) techContent += '<p class="body-text">' + esc(pText) + '</p>';
        }
      }
    }
    techHtml = sectionTitle('08', 'Technical Structure') +
      '<p class="body-text italic">Note: Price charts are excluded from the PDF. Refer to the live research page for interactive technical analysis.</p>' +
      techContent;
  }
  // ═════════════════════════════════════════════════════════════════════
  // DISCLAIMER
  // ═════════════════════════════════════════════════════════════════════
  var footerEl = reportPage.querySelector('.report-footer-section');
  var disclaimerText = footerEl ? txt(footerEl) : 'This report does not constitute personal financial advice.';
  var disclaimerHtml = '<div class="pdf-disclaimer">' +
    '<div class="pdf-disc-title">Methodology & Disclaimer</div>' +
    '<p>This report employs the Analysis of Competing Hypotheses (ACH) framework, a structured analytical ' +
      'technique originally developed for intelligence analysis. Rather than seeking evidence to confirm a ' +
      'preferred thesis, ACH systematically evaluates all available evidence against multiple competing ' +
      'explanations, weighting by diagnosticity rather than volume.</p>' +
    '<p>Market-responsive overlays are generated by the Narrative Framework Integration engine, which ' +
      'compares long-term research thesis weights against short-term market-implied weights derived from ' +
      'price action, volume, and drawdown analysis. Divergences are flagged when market positioning ' +
      'contradicts or significantly departs from the research assessment.</p>' +
    '<p>' + esc(disclaimerText) + '</p>' +
    '<p class="pdf-timestamp">Snapshot generated: ' + esc(timestamp) + ' AEST</p>' +
  '</div>';
  // ═════════════════════════════════════════════════════════════════════
  // COMPANY NAME EXTRACTION
  // ═════════════════════════════════════════════════════════════════════
  var companyName = '';
  var heroTitle = reportPage.querySelector('.rh-ticker');
  if (heroTitle) companyName = txt(heroTitle);
  if (!companyName) {
    // Fallback: check download section subtitle
    var dlSection = reportPage.querySelector('.report-download-subtitle');
    if (dlSection) {
      var dlText = txt(dlSection);
      var match = dlText.match(/^([^(]+)\s*\(/);
      if (match) companyName = match[1].trim();
    }
  }
  if (!companyName && typeof STOCK_DATA !== 'undefined' && STOCK_DATA[ticker]) {
    companyName = STOCK_DATA[ticker].company;
  }
  if (!companyName) companyName = ticker;
  // ═════════════════════════════════════════════════════════════════════
  // CSS
  // ═════════════════════════════════════════════════════════════════════
  var css = [
    '*{margin:0;padding:0;box-sizing:border-box;}',
    'body{font-family:Inter,"Segoe UI",Arial,Helvetica,sans-serif;color:#1A1F2E;' +
      'line-height:1.38;max-width:890px;margin:0 auto;padding:22px 26px;background:#FFF;font-size:8.5pt;}',
    /* Page breaks  --  soft breaks allow content to flow naturally; only .page-break-forced creates a new page */
    '.page-break{page-break-before:auto;height:0;margin:0;padding:0;}',
    '.page-break-forced{page-break-before:always;height:0;margin:0;padding:0;}',
    /* Header */
    '.pdf-header{display:flex;justify-content:space-between;align-items:flex-end;' +
      'border-bottom:2px solid #0F2E57;margin-bottom:12px;padding-bottom:6px;}',
    '.pdf-brand{font-size:9pt;font-weight:800;letter-spacing:2.2px;color:#0F2E57;}',
    '.pdf-tag{font-size:6.5pt;color:#52607A;letter-spacing:0.8px;margin-top:1px;}',
    '.pdf-head-right{font-size:7pt;color:#64748B;display:flex;gap:6px;align-items:baseline;}',
    '.pdf-head-right .sep{color:#CBD5E1;}',
    /* Cover title */
    '.pdf-cover-title{font-size:22pt;font-weight:800;color:#102A43;margin:4px 0 2px 0;line-height:1.1;}',
    '.pdf-cover-sub{font-size:9pt;color:#44536A;margin-bottom:12px;}',
    /* Section headers */
    '.sec-header{margin:14px 0 8px 0;padding-bottom:4px;border-bottom:1.5px solid #E2E8F0;page-break-after:avoid;}',
    '.sec-num{font-size:7pt;font-weight:600;color:#94A3B8;letter-spacing:0.6px;text-transform:uppercase;margin-right:8px;}',
    '.sec-title{font-size:10pt;font-weight:800;color:#0F2E57;letter-spacing:0.3px;}',
    /* Body text */
    '.body-text{font-size:8.2pt;color:#334155;line-height:1.5;margin:4px 0 8px 0;}',
    '.italic{font-style:italic;}',
    /* Verdict */
    '.pdf-verdict{background:#F0F4FA;border-left:4px solid #1D4E89;padding:10px 14px;' +
      'font-size:8.5pt;color:#1E3A5F;line-height:1.5;margin-bottom:12px;}',
    '.pdf-verdict-text{margin-bottom:6px;}',
    '.pdf-verdict-scores{display:flex;gap:16px;flex-wrap:wrap;}',
    '.pdf-vs-item{display:inline-flex;gap:4px;align-items:baseline;font-size:7.5pt;}',
    '.pdf-vs-label{color:#64748B;}',
    '.pdf-vs-score{font-weight:800;color:#0F2E57;}',
    '.pdf-vs-dir{color:#64748B;font-size:7pt;}',
    /* Alert */
    '.pdf-alert{background:#FEF3C7;border-left:4px solid #D97706;padding:6px 12px;' +
      'font-size:7.5pt;color:#92400E;margin-bottom:10px;}',
    /* Data tables */
    '.data-table{width:100%;border-collapse:collapse;font-size:7.5pt;margin:4px 0 10px 0;}',
    '.data-table th{background:#EDF2F8;color:#334155;text-align:left;padding:4px 6px;' +
      'border:1px solid #D9E2EF;font-size:6.8pt;text-transform:uppercase;letter-spacing:0.3px;font-weight:700;}',
    '.data-table td{padding:4px 6px;border:1px solid #E2E8F0;vertical-align:top;line-height:1.35;}',
    '.data-table tbody tr:nth-child(even){background:#FAFCFE;}',
    '.compact td,.compact th{padding:3px 5px;font-size:7pt;}',
    /* Sub-headings */
    '.pdf-sub-heading{font-size:8.5pt;font-weight:700;color:#1E3A5F;margin:10px 0 4px 0;}',
    /* Hypothesis cards */
    '.pdf-hyp-card{border:1px solid #DCE3EE;border-radius:4px;padding:10px 12px;' +
      'margin-bottom:8px;}',
    '.hyp-up{border-left:4px solid #0E9F6E;}',
    '.hyp-down{border-left:4px solid #B91C1C;}',
    '.hyp-flat{border-left:4px solid #D97706;}',
    '.pdf-hyp-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}',
    '.pdf-hyp-title{font-size:9pt;font-weight:800;color:#102A43;}',
    '.pdf-hyp-score{font-size:8.5pt;font-weight:700;color:#334155;}',
    '.pdf-hyp-status{font-size:6.5pt;color:#64748B;font-weight:400;margin-left:4px;}',
    '.pdf-hyp-meta{font-size:7pt;color:#94A3B8;margin-bottom:4px;}',
    '.pdf-hyp-body{font-size:7.8pt;color:#475569;line-height:1.45;}',
    '.pdf-hyp-list-label{font-size:7pt;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:0.4px;margin:6px 0 2px 0;}',
    '.pdf-hyp-list{font-size:7.5pt;color:#475569;line-height:1.4;margin:0 0 4px 16px;padding:0;}',
    '.pdf-hyp-list li{margin-bottom:2px;}',
    '.pdf-contradicted{display:inline-block;background:#FEE2E2;color:#B91C1C;font-size:6.5pt;' +
      'font-weight:700;padding:1px 6px;border-radius:999px;margin-left:6px;vertical-align:middle;}',
    /* NFI Weight bars (inline in hyp cards) */
    '.pdf-weights{margin:6px 0;padding:6px 0;border-top:1px solid rgba(0,0,0,0.06);}',
    '.pdf-weight-row{display:flex;align-items:center;gap:6px;margin-bottom:3px;}',
    '.wt-label{font-size:6.5pt;color:#6B7280;width:50px;text-align:right;flex-shrink:0;}',
    '.wt-bar-bg{flex:1;height:8px;background:#F1F5F9;border-radius:4px;overflow:hidden;}',
    '.wt-bar{height:100%;border-radius:4px;transition:none;}',
    '.bar-research{background:#2563EB;}',
    '.bar-market{background:#D97706;}',
    '.bar-blended{background:#7C3AED;}',
    '.wt-value{font-size:6.5pt;font-weight:700;color:#334155;width:32px;flex-shrink:0;}',
    '.pdf-gap{font-size:6.5pt;color:#6B7280;margin-top:2px;}',
    '.gap-high{color:#B91C1C;font-weight:600;}',
    '.gap-medium{color:#D97706;font-weight:600;}',
    /* Narrative sub-sections */
    '.pdf-narr-sub{font-size:8.5pt;font-weight:700;color:#1E3A5F;margin:10px 0 3px 0;}',
    /* NFI Narrative section */
    '.pdf-nfi-narrative{background:#FFF7ED;border:1px solid #FED7AA;border-radius:4px;' +
      'padding:10px 12px;margin-bottom:12px;}',
    '.pdf-nfi-header{font-size:8pt;font-weight:800;color:#9A3412;margin-bottom:8px;' +
      'text-transform:uppercase;letter-spacing:0.5px;}',
    '.pdf-nfi-section{margin-bottom:8px;}',
    '.pdf-nfi-label{font-size:7pt;font-weight:700;color:#C2410C;text-transform:uppercase;' +
      'letter-spacing:0.4px;margin-bottom:2px;}',
    '.pdf-nfi-text{font-size:7.8pt;color:#431407;line-height:1.45;}',
    /* Evidence cards */
    '.pdf-ev-card{border:1px solid #E2E8F0;border-radius:4px;padding:8px 10px;' +
      'margin-bottom:6px;}',
    '.pdf-ev-header{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;}',
    '.pdf-ev-title{font-size:8pt;font-weight:700;color:#102A43;}',
    '.pdf-ev-epistemic{font-size:6.5pt;color:#64748B;background:#F1F5F9;padding:1px 6px;border-radius:2px;}',
    '.pdf-ev-finding{font-size:7.5pt;color:#334155;line-height:1.4;margin-bottom:4px;}',
    '.pdf-ev-footer{display:flex;justify-content:space-between;align-items:center;}',
    '.pdf-ev-tags{display:flex;gap:4px;flex-wrap:wrap;}',
    '.pdf-ec-tag{font-size:6pt;color:#64748B;background:#F8FAFC;border:1px solid #E2E8F0;padding:1px 4px;border-radius:2px;}',
    '.pdf-ev-source{font-size:6.5pt;color:#94A3B8;text-align:right;}',
    /* Tripwire cards */
    '.pdf-trip-card{border:1px solid #DCE3EE;border-radius:4px;padding:8px 10px;' +
      'margin-bottom:6px;}',
    '.pdf-trip-header{display:flex;gap:8px;align-items:baseline;margin-bottom:4px;}',
    '.pdf-trip-date{font-size:7pt;color:#64748B;font-weight:600;}',
    '.pdf-trip-name{font-size:8pt;font-weight:700;color:#102A43;}',
    '.pdf-tw-cond{margin:2px 0;font-size:7.5pt;}',
    '.pdf-tw-if{font-weight:600;}',
    '.cond-pos{color:#0E9F6E;}',
    '.cond-neg{color:#B91C1C;}',
    '.pdf-tw-then{color:#475569;margin-left:4px;}',
    '.pdf-trip-source{font-size:6.5pt;color:#94A3B8;margin-top:3px;}',
    /* Callout boxes */
    '.pdf-callout{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:3px;padding:6px 10px;' +
      'font-size:7.5pt;color:#475569;line-height:1.4;margin:4px 0 8px 0;}',
    /* Disclaimer */
    '.pdf-disclaimer{margin-top:16px;padding:12px;background:#F8FAFC;border:1px solid #DCE3EE;' +
      'font-size:7pt;color:#64748B;line-height:1.5;}',
    '.pdf-disc-title{font-size:8pt;font-weight:800;color:#0F2E57;text-transform:uppercase;' +
      'letter-spacing:0.5px;margin-bottom:6px;}',
    '.pdf-disclaimer p{margin:0 0 6px 0;}',
    '.pdf-disclaimer p:last-child{margin:0;}',
    '.pdf-timestamp{font-weight:600;color:#0F2E57;}',
    /* Print */
    '@media print{',
      'body{margin:0;padding:10mm;max-width:none;-webkit-print-color-adjust:exact;print-color-adjust:exact;}',
      '@page{size:A4 portrait;margin:8mm 10mm;}',
      '.page-break{page-break-before:auto;}',
      '.page-break-forced{page-break-before:always;}',
      '.pdf-hyp-card,.pdf-ev-card,.pdf-trip-card{page-break-inside:auto;}',
      '.pdf-disclaimer{page-break-inside:avoid;}',
      '.pdf-nfi-narrative{page-break-inside:auto;}',
      '.sec-header{page-break-after:avoid;}',
      '.data-table{page-break-inside:auto;}',
      '.data-table tr{page-break-inside:avoid;page-break-after:auto;}',
    '}'
  ].join('\n');
  // ═════════════════════════════════════════════════════════════════════
  // ASSEMBLY
  // ═════════════════════════════════════════════════════════════════════
  return '<!DOCTYPE html>' +
    '<html lang="en">' +
    '<head>' +
      '<meta charset="UTF-8">' +
      '<title>' + esc(ticker) + ' Research Snapshot | Continuum Intelligence</title>' +
      '<style>' + css + '</style>' +
    '</head>' +
    '<body>' +
      /* Cover */
      pageHeader('Research Snapshot') +
      '<div class="pdf-cover-title">' + esc(companyName) + '</div>' +
      '<div class="pdf-cover-sub">' + esc(ticker) + ' | Snapshot as at ' + esc(timestamp) + ' AEST</div>' +
      alertHtml +
      verdictHtml +
      /* Section 01: Identity */
      identityHtml +
      /* Section 02: Hypotheses  --  forced break after cover/identity */
      forcedPageBreak() +
      pageHeader('Competing Hypotheses') +
      hypHtml +
      /* Section 03: Narrative  --  soft break, flows naturally */
      pageBreak() +
      pageHeader('Dominant Narrative') +
      narrativeHtml +
      /* Section 04: Evidence  --  soft break */
      pageBreak() +
      pageHeader('Evidence Synthesis') +
      evidenceHtml +
      /* Section 05: Discriminates  --  soft break */
      pageBreak() +
      pageHeader('Discriminators & Monitoring') +
      discHtml +
      /* Section 06: Tripwires */
      tripHtml +
      /* Section 07: Gaps  --  soft break */
      pageBreak() +
      pageHeader('Integrity & Technical') +
      gapsHtml +
      /* Section 08: Technical */
      techHtml +
      /* Disclaimer  --  forced break to keep it on its own page */
      forcedPageBreak() +
      pageHeader('Disclaimer') +
      disclaimerHtml +
    '</body>' +
    '</html>';
}

function buildRetailHTML(stock) {
  var hyps = stock.hypotheses || [];
  var norm = normaliseScoresForPDF(stock.verdict.scores);
  var verdictText = stripHtml(stock.verdict.text);
  var genDate = new Date().toLocaleString();
  var TIER_COLORS = ['#00C853', '#2979FF', '#FF9100', '#D50000'];

  // Replace jargon with plain English
  function plainify(text) {
    return text
      .replace(/\bEBITDA\b/gi, 'operating profit')
      .replace(/\bROIC\b/gi, 'return on investment')
      .replace(/\bEV\/EBITDA\b/gi, 'company value ratio')
      .replace(/\bbasis points?\b/gi, 'percentage points')
      .replace(/\balpha\b/gi, 'outperformance')
      .replace(/\bbeta\b/gi, 'market sensitivity')
      .replace(/\bNPAT\b/gi, 'net profit');
  }

  // Page header/footer
  function retailPageHeader() {
    return '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #2E5090;padding-bottom:6px;margin-bottom:16px;">' +
      '<span style="font-size:8pt;font-weight:bold;letter-spacing:2px;color:#1B2A4A;">CONTINUUM INTELLIGENCE</span>' +
      '<span style="font-size:8pt;color:#2E5090;font-weight:bold;">Investor Briefing</span>' +
    '</div>';
  }
  function pageFooter(pageNum, totalPages) {
    return '<div style="border-top:1px solid #DDD;padding-top:6px;margin-top:auto;display:flex;justify-content:space-between;font-size:7.5pt;color:#888;">' +
      '<span>Page ' + pageNum + ' of ' + totalPages + '</span>' +
      '<span>' + pdfEsc(genDate) + '</span>' +
    '</div>';
  }

  // Hypothesis bars
  var hypBars = '';
  for (var i = 0; i < hyps.length; i++) {
    var h = hyps[i];
    var dirIcon = h.direction === 'upside' ? '&#9650;' : h.direction === 'downside' ? '&#9660;' : '&#9670;';
    var dirColor = h.direction === 'upside' ? '#00C853' : h.direction === 'downside' ? '#D50000' : '#FF9100';
    var descText = plainify(stripHtml(h.description));
    if (descText.length > 140) descText = descText.substring(0, 137) + '...';
    hypBars += '<div style="margin:8px 0;padding:10px 12px;background:#FAFAFA;border-left:4px solid ' + TIER_COLORS[i] + ';">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<span style="font-size:10pt;font-weight:bold;color:#1B2A4A;">' + pdfEsc(stripHtml(h.title)) +
          ' <span style="color:' + dirColor + ';font-size:8pt;">' + dirIcon + '</span></span>' +
        '<span style="font-size:14pt;font-weight:bold;color:' + TIER_COLORS[i] + ';">' + norm[i] + '%</span>' +
      '</div>' +
      '<div style="font-size:8pt;color:#555;margin-top:3px;line-height:1.3;">' + pdfEsc(descText) + '</div>' +
    '</div>';
  }

  // Risks (downside hypotheses)
  var risks = '';
  for (var ri = 0; ri < hyps.length; ri++) {
    if (hyps[ri].direction === 'downside') {
      var riskText = plainify(stripHtml(hyps[ri].description));
      if (riskText.length > 200) riskText = riskText.substring(0, 197) + '...';
      risks += '<li style="margin-bottom:6px;font-size:9pt;line-height:1.4;">' + pdfEsc(riskText) + '</li>';
    }
  }

  // Upsides (upside hypotheses)
  var upsides = '';
  for (var ui = 0; ui < hyps.length; ui++) {
    if (hyps[ui].direction === 'upside') {
      var upText = plainify(stripHtml(hyps[ui].description));
      if (upText.length > 200) upText = upText.substring(0, 197) + '...';
      upsides += '<li style="margin-bottom:6px;font-size:9pt;line-height:1.4;">' + pdfEsc(upText) + '</li>';
    }
  }
  if (!upsides) upsides = '<li style="font-size:9pt;">No specific upside scenarios identified in the current evidence.</li>';

  // Tripwires simplified
  var watching = '';
  if (stock.tripwires && stock.tripwires.cards) {
    for (var tw = 0; tw < Math.min(stock.tripwires.cards.length, 4); tw++) {
      var trip = stock.tripwires.cards[tw];
      watching += '<li style="margin-bottom:6px;font-size:9pt;line-height:1.4;"><strong>' + pdfEsc(trip.date || '') + ':</strong> ' + pdfEsc(plainify(stripHtml(trip.name))) + '</li>';
    }
  }

  // Page 1: Summary + Hypotheses
  var page1 = retailPageHeader() +
    '<h1 style="font-size:20pt;font-weight:bold;color:#1B2A4A;margin:0 0 4px 0;">' + pdfEsc(stock.company) + '</h1>' +
    '<div style="font-size:10pt;color:#666;margin-bottom:16px;">' + pdfEsc(stock.tickerFull || stock.ticker + '.AX') + ' &bull; Current price: <strong>' + pdfEsc(stock.currency) + stock.price + '</strong></div>' +
    // What the evidence says
    '<div style="background:#F5F7FA;padding:12px;border-radius:6px;margin-bottom:16px;border-left:3px solid #2E5090;">' +
      '<div style="font-size:10pt;font-weight:bold;color:#1B2A4A;margin-bottom:6px;">What the evidence says</div>' +
      '<div style="font-size:9pt;color:#555;line-height:1.5;">' + pdfEsc(plainify(verdictText)) + '</div>' +
    '</div>' +
    // Hypothesis bars
    '<div style="font-size:12pt;font-weight:bold;color:#2E5090;border-bottom:2px solid #2E5090;padding-bottom:4px;margin-bottom:6px;">The four competing stories</div>' +
    '<div style="font-size:8pt;color:#888;margin-bottom:6px;">Each company has four possible futures. We weigh the evidence for each.</div>' +
    hypBars +
    pageFooter(1, 3);

  // Page 2: Risks, Upsides, Watching
  var page2 = retailPageHeader() +
    '<div style="font-size:12pt;font-weight:bold;color:#D50000;margin-bottom:8px;">What could go wrong</div>' +
    '<ul style="color:#555;padding-left:20px;margin-bottom:20px;">' + (risks || '<li style="font-size:9pt;">No major risks identified in current evidence.</li>') + '</ul>' +
    '<div style="font-size:12pt;font-weight:bold;color:#00C853;margin-bottom:8px;">What could go right</div>' +
    '<ul style="color:#555;padding-left:20px;margin-bottom:20px;">' + upsides + '</ul>' +
    '<div style="font-size:12pt;font-weight:bold;color:#2E5090;margin-bottom:8px;">What we are watching</div>' +
    '<ul style="color:#555;padding-left:20px;margin-bottom:20px;">' + (watching || '<li style="font-size:9pt;">No specific events being tracked.</li>') + '</ul>' +
    // How to read
    '<div style="background:#FFF8E1;padding:12px;border-radius:6px;margin-top:16px;">' +
      '<div style="font-size:9pt;font-weight:bold;color:#1B2A4A;margin-bottom:4px;">How to read this briefing</div>' +
      '<div style="font-size:8pt;color:#666;line-height:1.5;">' +
        'We do not predict share prices or tell you what to buy. We systematically weigh evidence for and against four competing stories ' +
        'about each company, then tell you which story the evidence best supports right now. The percentages show how much evidence ' +
        'supports each story. What you do with that information is your decision.' +
      '</div>' +
    '</div>' +
    pageFooter(2, 3);

  // Page 3: Disclaimer
  var page3 = retailPageHeader() +
    '<div style="font-size:12pt;font-weight:bold;color:#2E5090;border-bottom:2px solid #2E5090;padding-bottom:4px;margin-bottom:16px;">Important Information</div>' +
    '<div style="font-size:7.5pt;color:#888;line-height:1.6;">' +
      '<p style="margin-bottom:10px;">This briefing is produced by Continuum Intelligence for informational purposes only. It does not constitute personal financial advice or a recommendation to buy, sell, or hold any investment.</p>' +
      '<p style="margin-bottom:10px;">We use a method called Analysis of Competing Hypotheses to weigh evidence for and against different possible outcomes for each company. This is a structured way of thinking about investments  --  it is not a prediction of what will happen.</p>' +
      '<p style="margin-bottom:10px;">All information comes from public sources including company announcements, regulatory filings, and market data. We do not have access to inside information.</p>' +
      '<p style="margin-bottom:10px;">Before making any investment decision, you should do your own research and speak with a licensed financial adviser who understands your personal circumstances.</p>' +
      '<p style="margin-bottom:10px;">&copy; 2026 Continuum Intelligence. All rights reserved.</p>' +
      '<p>Generated: ' + pdfEsc(genDate) + '</p>' +
    '</div>' +
    pageFooter(3, 3);

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + pdfEsc(stock.ticker) + ' Investor Briefing  --  Continuum Intelligence</title>' +
    '<style>' +
      'body{font-family:Arial,Helvetica,sans-serif;color:#333;line-height:1.3;max-width:750px;margin:0 auto;padding:30px 40px;}' +
      '.page{min-height:calc(100vh - 60px);display:flex;flex-direction:column;padding-bottom:10px;}' +
      '.page-content{flex:1;}' +
      '@media print{' +
        'body{margin:0;padding:0;max-width:none;}' +
        '@page{margin:15mm 20mm;size:A4 portrait;}' +
        '.page{min-height:auto;page-break-after:always;padding:0;}' +
        '.page:last-child{page-break-after:avoid;}' +
      '}' +
    '</style></head><body>' +
    '<div class="page"><div class="page-content">' + page1 + '</div></div>' +
    '<div class="page"><div class="page-content">' + page2 + '</div></div>' +
    '<div class="page"><div class="page-content">' + page3 + '</div></div>' +
  '</body></html>';
}
