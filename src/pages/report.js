// report.js — Stock report page orchestrator
// Extracted from index.html without logic changes

import { STOCK_DATA } from '../lib/state.js';

import {
  renderReportHero,
  renderSkewBar,
  renderVerdict,
  renderSectionNav,
  renderIdentity,
  renderHypotheses,
  renderNarrative,
  renderEvidence,
  renderDiscriminators,
  renderTripwires,
  renderGaps,
  renderTechnicalAnalysis,
  renderReportFooter,
  renderPDFDownload,
  renderHypSidebar,
  prepareHypotheses,
  renderOvercorrectionBanner,
  renderNarrativeTimeline,
  renderSignalBars,
  setupScrollSpy
} from './report-sections.js';

export function renderReport(data) {
  prepareHypotheses(data);
  var t = data.ticker.toLowerCase();

  var mainContent =
    renderOvercorrectionBanner(data) +
    renderIdentity(data) +
    renderHypotheses(data) +
    renderNarrativeTimeline(data) +
    renderNarrative(data) +
    renderEvidence(data) +
    renderDiscriminators(data) +
    renderTripwires(data) +
    renderGaps(data) +
    renderTechnicalAnalysis(data) +
    '<div class="report-section" id="' + t + '-chat">' +
      '<div class="rs-header"><div class="rs-header-text">' +
        '<div class="rs-number">Research</div>' +
        '<div class="rs-title">Research Chat</div>' +
      '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>' +
      '</button></div>' +
      '<div class="rs-body">' +
      '<div class="rs-subtitle">Ask questions about ' + data.company + ' grounded in structured research data</div>' +
      '<div class="chat-inline" data-ticker="' + data.ticker + '">' +
        '<div class="chat-inline-messages" id="chat-inline-' + data.ticker + '" aria-live="polite" aria-relevant="additions"></div>' +
        '<div class="chat-inline-input-area">' +
          '<textarea class="chat-inline-input" placeholder="Ask about ' + data.company + '..." rows="1" aria-label="Ask a question about ' + data.company + '"></textarea>' +
          '<button class="chat-inline-send" disabled aria-label="Send">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>' +
      '</div>' +
    '</div>';

  var floatingToggle =
    '<button class="sections-float-toggle" onclick="window.toggleAllSections(this)" data-state="expanded" aria-label="Collapse all sections">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="18 15 12 9 6 15"/></svg>' +
      '<span>Collapse All</span>' +
    '</button>';

  return renderReportHero(data) +
    renderSignalBars(data) +
    renderSkewBar(data) +
    renderVerdict(data) +
    renderSectionNav(data) +
    '<div class="report-content">' +
      '<div class="report-main">' + mainContent + '</div>' +
      renderHypSidebar(data) +
    '</div>' +
    renderPDFDownload(data) +
    renderReportFooter(data) +
    floatingToggle;
}
