// report-sections.js -- Barrel re-export file
// Original monolith decomposed into src/features/report/ modules.
// This file re-exports all 32 original exports for backward compatibility.

// Wave 1: shared, identity, narrative, footer
export { renderSectionNav, renderIdentity } from '../features/report/identity.js';
export { renderNarrative } from '../features/report/narrative.js';
export { renderReportFooter, renderPDFDownload, setupScrollSpy } from '../features/report/footer.js';

// Wave 2: evidence, technical
export { renderEvidenceCard, renderAlignmentSummary, renderEvidence, renderDiscriminators, renderTripwires, renderGaps } from '../features/report/evidence.js';
export { computeMA, renderTAChart, renderTechnicalAnalysis } from '../features/report/technical.js';

// Wave 3: hypothesis, signal-bars, sidebar
export { renderSkewBar, renderVerdict, renderHypotheses, prepareHypotheses, renderOvercorrectionBanner } from '../features/report/hypothesis.js';
export { renderSignalBars } from '../features/report/signal-bars.js';
export { renderHypSidebar } from '../features/report/sidebar.js';

// Wave 4: hero, gold, narrative-timeline, price-drivers
export { renderReportHero } from '../features/report/hero.js';
export { renderGoldDiscovery, renderGoldSection } from '../features/report/gold.js';
export { renderNarrativeTimeline, initNarrativeTimelineChart, destroyNarrativeTimelineChart } from '../features/report/narrative-timeline.js';
export { renderPriceDrivers, renderPriceDriversPlaceholder, renderPriceDriversContent, fetchPriceDrivers } from '../features/report/price-drivers.js';
