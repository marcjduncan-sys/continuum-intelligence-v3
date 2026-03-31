// Report identity and section navigation renderers

import { RS_HDR } from './shared.js';

export function renderSectionNav(data) {
  const t = data.ticker.toLowerCase();
  const sections = [
    ['identity', 'Identity'],
    ['hypotheses', 'Hypotheses']
  ];

  if (data.goldAgent || data.goldAnalysis) {
    sections.push(['gold-analysis', 'Gold']);
  }

  sections.push(
    ['narrative-timeline', 'Timeline'],
    ['narrative', 'Narrative'],
    ['evidence', 'Evidence'],
    ['discriminates', 'Discriminates'],
    ['tripwires', 'Tripwires'],
    ['gaps', 'Gaps']
  );

  if (data.technicalAnalysis) {
    sections.push(['technical', 'Technical']);
  }

  if (data.priceDrivers) {
    sections.push(['price-drivers', 'Price Drivers']);
  }

  sections.push(['sources', 'Ext. Research']);
  sections.push(['chat', 'Research Chat']);

  let linksHtml = '';
  for (let i = 0; i < sections.length; i++) {
    const activeClass = i === 0 ? ' class="active"' : '';
    linksHtml += '<a href="#' + t + '-' + sections[i][0] + '"' + activeClass + '>' + sections[i][1] + '</a>';
  }

  return '<div class="section-nav">' +
    '<div class="section-nav-inner">' + linksHtml + '</div>' +
  '</div>';
}

export function renderIdentity(data) {
  const id = data.identity;
  if (!id || !id.rows || !id.rows.length) return '';
  const t = data.ticker.toLowerCase();

  let rowsHtml = '';
  for (let i = 0; i < id.rows.length; i++) {
    const row = id.rows[i];
    const left = row[0];
    const right = row[1];
    rowsHtml += '<tr>' +
      '<td class="td-label">' + left[0] + '</td>' +
      '<td' + (left[2] ? ' class="' + left[2] + '"' : '') + '>' + left[1] + '</td>' +
      '<td class="td-label">' + right[0] + '</td>' +
      '<td' + (right[2] ? ' class="' + right[2] + '"' : '') + '>' + right[1] + '</td>' +
    '</tr>';
  }

  return '<div class="report-section" id="' + t + '-identity">' +
    RS_HDR('Section 01', 'Identity &amp; Snapshot') +
    '<div class="rs-body">' +
    '<table class="identity-table">' +
      '<thead><tr><th>Metric</th><th>Value</th><th>Metric</th><th>Value</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
    '</table>' +
  '</div></div>';
}
