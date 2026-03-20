/**
 * deep-report-sections.js -- Deep Research long-form content renderer
 *
 * Renders the long-form deep research content from the `deepContent` field
 * in research JSON files. Used as a substitute for the standard report body
 * when `data._deepResearch && data.deepContent` is truthy.
 *
 * The existing report chrome (hero, signal bars, skew bar, verdict, footer)
 * is preserved; only the body sections are replaced.
 *
 * Depends on:
 *   - escapeHtml() from dom.js
 */

import { escapeHtml } from '../lib/dom.js';

var DR_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

function drHeader(num, title) {
  return '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">' + num + '</div>' +
    '<h2 class="rs-title">' + escapeHtml(title) + '</h2>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' + DR_CHEVRON + '</button></div>';
}

function renderStanceBanner(dc) {
  if (!dc.stance) return '';
  var stanceCls = 'dr-stance-' + dc.stance.toLowerCase();
  var catalystHtml = dc.stanceCatalyst
    ? '<span class="dr-stance-catalyst">' + escapeHtml(dc.stanceCatalyst) + '</span>'
    : '';
  var dateHtml = dc.stanceDate
    ? '<span class="dr-stance-date">' + escapeHtml(dc.stanceDate) + '</span>'
    : '';
  return '<div class="dr-stance-banner ' + stanceCls + '">' +
    '<span class="dr-stance-label">' + escapeHtml(dc.stance) + '</span>' +
    catalystHtml + dateHtml +
  '</div>';
}

function renderExecutiveSummary(es) {
  if (!es) return '';
  var html = '<div class="dr-exec-summary">';

  if (es.lede) {
    html += '<p class="dr-exec-lede">' + escapeHtml(es.lede) + '</p>';
  }

  if (es.whatHappened) {
    html += '<h3 class="dr-exec-heading">What Happened</h3>';
    html += '<p class="dr-prose">' + escapeHtml(es.whatHappened) + '</p>';
  }

  if (es.whatTheEvidenceSays) {
    html += '<h3 class="dr-exec-heading">What the Evidence Says</h3>';
    html += '<p class="dr-prose">' + escapeHtml(es.whatTheEvidenceSays) + '</p>';
  }

  if (es.whatToWatch) {
    html += '<h3 class="dr-exec-heading">What to Watch</h3>';
    html += '<p class="dr-prose">' + escapeHtml(es.whatToWatch) + '</p>';
  }

  html += '</div>';
  return html;
}

function renderTable(block) {
  if (!block.headers || !block.rows) return '';
  var html = '<div class="dr-table-wrap"><table class="dr-table">';
  html += '<thead><tr>';
  for (var h = 0; h < block.headers.length; h++) {
    html += '<th>' + escapeHtml(block.headers[h]) + '</th>';
  }
  html += '</tr></thead><tbody>';
  for (var r = 0; r < block.rows.length; r++) {
    html += '<tr>';
    for (var c = 0; c < block.rows[r].length; c++) {
      html += '<td>' + escapeHtml(String(block.rows[r][c] || '')) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}

function renderContentBlock(block) {
  if (!block || !block.type) return '';

  switch (block.type) {
    case 'prose':
      return '<p class="dr-prose">' + escapeHtml(block.text || '') + '</p>';
    case 'subheading':
      return '<h3 class="dr-subheading">' + escapeHtml(block.text || '') + '</h3>';
    case 'table':
      return renderTable(block);
    case 'callout':
      return '<div class="dr-callout"><p>' + escapeHtml(block.text || '') + '</p></div>';
    case 'footnote':
      return '<div class="dr-footnote"><p>' + escapeHtml(block.text || '') + '</p></div>';
    default:
      return '';
  }
}

function renderDeepSection(section, ticker) {
  var t = ticker.toLowerCase();
  var sectionId = t + '-dr-section-' + section.number;
  var html = '<div class="report-section dr-section" id="' + sectionId + '">';
  html += drHeader('Section ' + String(section.number).padStart(2, '0'), section.title);
  html += '<div class="rs-body dr-section-body">';

  if (section.content && Array.isArray(section.content)) {
    for (var i = 0; i < section.content.length; i++) {
      html += renderContentBlock(section.content[i]);
    }
  }

  html += '</div></div>';
  return html;
}

/**
 * Build section nav links for deep research content.
 * Returns an array of [anchorId, label] pairs matching the pattern
 * used by renderSectionNav in report-sections.js.
 */
export function getDeepSectionNavItems(data) {
  var dc = data.deepContent;
  if (!dc || !dc.sections) return [];

  var t = data.ticker.toLowerCase();
  var items = [['dr-exec-summary', 'Summary']];

  for (var i = 0; i < dc.sections.length; i++) {
    var s = dc.sections[i];
    items.push(['dr-section-' + s.number, s.title]);
  }

  items.push(['chat', 'Research Chat']);
  return items;
}

/**
 * Render the full deep research content body.
 * Replaces the standard report body sections (identity, hypotheses,
 * narrative, evidence, etc.) with long-form deep research content.
 */
export function renderDeepContent(data) {
  var dc = data.deepContent;
  if (!dc) return '';

  var ticker = data.ticker;
  var t = ticker.toLowerCase();
  var html = '';

  // Stance banner
  html += renderStanceBanner(dc);

  // Executive summary (not collapsible)
  html += '<div id="' + t + '-dr-exec-summary">';
  html += renderExecutiveSummary(dc.executiveSummary);
  html += '</div>';

  // Numbered sections (collapsible, reuse existing rs-header/rs-body pattern)
  if (dc.sections && Array.isArray(dc.sections)) {
    for (var i = 0; i < dc.sections.length; i++) {
      html += renderDeepSection(dc.sections[i], ticker);
    }
  }

  return html;
}
