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

  // Standard report: existing flow (unchanged)
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
    renderTechnicalAnalysis(data);

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
