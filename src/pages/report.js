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
    renderTechnicalAnalysis(data);

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
