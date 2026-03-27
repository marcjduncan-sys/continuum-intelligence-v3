// report.js – Stock report page orchestrator
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
  renderGoldDiscovery,
  renderReportFooter,
  renderPDFDownload,
  renderHypSidebar,
  prepareHypotheses,
  renderOvercorrectionBanner,
  renderNarrativeTimeline,
  renderSignalBars,
  setupScrollSpy,
  renderPriceDriversPlaceholder,
  fetchPriceDrivers,
  renderGoldSection
} from './report-sections.js';

import { renderDeepContent, getDeepSectionNavItems } from './deep-report-sections.js';

var SOURCES_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="6 9 12 15 18 9"/></svg>';

function sourcesSection(ticker) {
  var t = ticker.toLowerCase();
  return '<div class="report-section" id="' + t + '-sources">' +
    '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">Section 12</div>' +
    '<h2 class="rs-title">External Research</h2>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' +
    SOURCES_CHEVRON + '</button></div>' +
    '<div class="rs-body">' +
    '<div id="src-upload-mount-' + ticker + '"></div>' +
    '<div id="src-panel-mount-' + ticker + '"></div>' +
    '</div></div>';
}

export function renderReport(data) {
  prepareHypotheses(data);

  var floatingToggle =
    '<button class="sections-float-toggle" onclick="window.toggleAllSections(this)" data-state="expanded" aria-label="Collapse all sections">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="18 15 12 9 6 15"/></svg>' +
      '<span>Collapse All</span>' +
    '</button>';

  // Deep research: hybrid layout -- existing hero chrome, long-form body
  if (data._deepResearch && data.deepContent) {
    var deepMainContent = renderDeepContent(data);

    // Build custom section nav for deep content
    var deepNavItems = getDeepSectionNavItems(data);
    var t = data.ticker.toLowerCase();
    var deepNavHtml = '';
    for (var i = 0; i < deepNavItems.length; i++) {
      var activeClass = i === 0 ? ' class="active"' : '';
      deepNavHtml += '<a href="#' + t + '-' + deepNavItems[i][0] + '"' + activeClass + '>' + deepNavItems[i][1] + '</a>';
    }
    var deepSectionNav = '<div class="section-nav"><div class="section-nav-inner">' + deepNavHtml + '</div></div>';

    return renderReportHero(data) +
      renderSignalBars(data) +
      renderSkewBar(data) +
      renderVerdict(data) +
      deepSectionNav +
      '<div class="report-content">' +
        '<div class="report-main deep-report-main">' + deepMainContent + '</div>' +
        renderHypSidebar(data) +
      '</div>' +
      renderPDFDownload(data) +
      renderReportFooter(data) +
      floatingToggle;
  }

  // Standard report: existing flow with sources section
  var mainContent =
    renderPriceDriversPlaceholder(data.ticker) +
    renderOvercorrectionBanner(data) +
    renderIdentity(data) +
    renderHypotheses(data) +
    (data.goldAgent ? renderGoldDiscovery(data) : renderGoldSection(data)) +
    renderNarrativeTimeline(data) +
    renderNarrative(data) +
    renderEvidence(data) +
    renderDiscriminators(data) +
    renderTripwires(data) +
    renderGaps(data) +
    renderTechnicalAnalysis(data) +
    sourcesSection(data.ticker);

  // Trigger async price drivers fetch after render
  requestAnimationFrame(function() { fetchPriceDrivers(data.ticker); });

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
