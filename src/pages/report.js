// report.js – Stock report page orchestrator
// Extracted from index.html without logic changes

import { STOCK_DATA } from '../lib/state.js';
import { renderSourceUploadZone } from '../features/source-upload.js';

import { renderReportHero, renderDecisionRibbon, renderDeepResearchHero } from '../features/report/hero.js';
import { renderChatPanel } from '../features/report/chat-panel.js';
import { renderSkewBar, renderVerdict, renderHypotheses, prepareHypotheses, renderOvercorrectionBanner } from '../features/report/hypothesis.js';
import { renderEvidence, renderDiscriminators, renderTripwires, renderGaps } from '../features/report/evidence.js';
import { renderTechnicalAnalysis } from '../features/report/technical.js';
import { renderSignalBars } from '../features/report/signal-bars.js';
import { renderHypSidebar } from '../features/report/sidebar.js';
import { renderGoldDiscovery, renderGoldSection } from '../features/report/gold.js';
import { renderNarrativeTimeline } from '../features/report/narrative-timeline.js';
import { renderPriceDriversPlaceholder, fetchPriceDrivers } from '../features/report/price-drivers.js';
import { renderSectionNav, renderIdentity, renderNarrative, renderReportFooter, renderPDFDownload, setupScrollSpy } from './report-sections.js';

import { renderDeepContent, getDeepSectionNavItems } from './deep-report-sections.js';

const SOURCES_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="6 9 12 15 18 9"/></svg>';

function sourcesSection(ticker) {
  const t = ticker.toLowerCase();
  return '<div class="report-section" id="' + t + '-sources">' +
    '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">Section 09</div>' +
    '<h2 class="rs-title">External Research</h2>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' +
    SOURCES_CHEVRON + '</button></div>' +
    '<div class="rs-body">' +
    '<div id="src-upload-mount-' + t + '">' + renderSourceUploadZone(ticker) + '</div>' +
    '<div id="src-panel-mount-' + t + '"></div>' +
    '</div></div>';
}

export function renderReport(data) {
  prepareHypotheses(data);

  const floatingToggle =
    '<button class="sections-float-toggle" onclick="window.toggleAllSections(this)" data-state="expanded" aria-label="Collapse all sections">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><polyline points="18 15 12 9 6 15"/></svg>' +
      '<span>Collapse All</span>' +
    '</button>';

  // Deep research: hybrid layout -- existing hero chrome, long-form body
  if (data._deepResearch && data.deepContent) {
    const deepMainContent = renderDeepContent(data);

    // Build custom section nav for deep content
    const deepNavItems = getDeepSectionNavItems(data);
    deepNavItems.push(['sources', 'Ext. Research']);
    const t = data.ticker.toLowerCase();
    let deepNavHtml = '';
    for (let i = 0; i < deepNavItems.length; i++) {
      const activeClass = i === 0 ? ' class="active"' : '';
      deepNavHtml += '<a href="#' + t + '-' + deepNavItems[i][0] + '"' + activeClass + '>' + deepNavItems[i][1] + '</a>';
    }
    const deepSectionNav = '<div class="section-nav"><div class="section-nav-inner">' + deepNavHtml + '</div></div>';

    return renderDeepResearchHero(data) +
      deepSectionNav +
      '<div class="report-content">' +
        '<div class="report-main deep-report-main">' + deepMainContent + sourcesSection(data.ticker) + '</div>' +
        renderHypSidebar(data) +
      '</div>' +
      renderPDFDownload(data) +
      renderReportFooter(data) +
      floatingToggle;
  }

  // Standard report: redesigned two-column layout
  const t = data.ticker.toLowerCase();
  const navItems = [
    ['identity', 'Identity'],
    ['hypotheses', 'Thesis'],
    ['narrative', 'Narrative'],
    ['evidence', 'Evidence'],
  ];
  if (data.technicalAnalysis) navItems.push(['technical', 'Technical']);
  if (data.goldAgent || data.goldAnalysis) navItems.push(['gold-analysis', 'Gold']);
  navItems.push(['sources', 'Ext. Research']);

  let subnavHtml = '<nav class="subnav">';
  for (var ni = 0; ni < navItems.length; ni++) {
    const activeCls = ni === 0 ? ' active' : '';
    subnavHtml += '<a href="#' + t + '-' + navItems[ni][0] + '" class="subnav-item' + activeCls + '">' + navItems[ni][1] + '</a>';
  }
  subnavHtml += '</nav>';

  const contentCol =
    renderDecisionRibbon(data) +
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

  return subnavHtml +
    '<div class="workstation">' +
      '<div class="content-col">' + contentCol + '</div>' +
      renderChatPanel(data) +
    '</div>' +
    renderPDFDownload(data) +
    renderReportFooter(data) +
    floatingToggle;
}
