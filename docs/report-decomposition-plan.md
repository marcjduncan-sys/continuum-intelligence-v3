# Report Renderer Decomposition Plan

## BEAD-012: Audit and Decomposition Specification

**Date:** 2026-03-31
**Author:** Surgeon (Claude Code session)
**Status:** PLAN -- no code changes

---

## Current State

- **File:** `src/pages/report-sections.js`
- **Lines:** 2,762
- **Exports:** 32
- **Internal (non-exported) functions:** 8 (`RS_HDR`, `RS_CHEVRON`, `_dirTextToCls`, `loadNarrativeHistory`, `_renderGoldAssets`, `_renderGoldValuation`, `_renderGoldPeers`, `_renderGoldSensitivities`, `_renderGoldDiscoveryInner`, `_formatDriverDate`, `_truncate`)
- **Module-level mutable state:** 2 (`HISTORY_CACHE` object, `NT_COLORS` constant)
- **`.toFixed()` calls:** 76
- **Null guard patterns:** 15+ distinct styles (`!= null`, `!== null`, `|| 0`, `|| ''`, `|| 'N/A'`, `?? `, ternary guards, `typeof`, `Array.isArray`, chained `&&`, `.get()` fallbacks)
- **Imports from external modules:** `state.js` (STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA, FEATURED_ORDER, ANNOUNCEMENTS_DATA), `format.js` (renderSparkline, formatDateAEST, fmtPE), `dom.js` (normaliseScores, computeSkewScore, _inferPolarity), `api-config.js` (API_BASE)
- **DOM access:** `document.getElementById`, `document.querySelector`, `IntersectionObserver`, `window.Chart` (Chart.js), `XMLHttpRequest`, `fetch`
- **window globals referenced:** `window.Chart`, `window.CI_API_KEY`, `window.toggleSection`, `navigate`

---

## External Consumers

Each export is consumed by one or more external files. This determines which imports must be updated during extraction.

### Consumer: `src/pages/report.js` (primary orchestrator)

Imports 26 of 32 exports:
`renderReportHero`, `renderSkewBar`, `renderVerdict`, `renderSectionNav`, `renderIdentity`, `renderHypotheses`, `renderNarrative`, `renderEvidence`, `renderDiscriminators`, `renderTripwires`, `renderGaps`, `renderTechnicalAnalysis`, `renderGoldDiscovery`, `renderReportFooter`, `renderPDFDownload`, `renderHypSidebar`, `prepareHypotheses`, `renderOvercorrectionBanner`, `renderNarrativeTimeline`, `renderSignalBars`, `setupScrollSpy`, `renderPriceDriversPlaceholder`, `fetchPriceDrivers`, `renderGoldSection`

### Consumer: `src/main.js`

Imports 3: `setupScrollSpy`, `initNarrativeTimelineChart`, `destroyNarrativeTimelineChart`

### Consumer: `src/services/live-data.js`

Imports 4: `renderTAChart`, `setupScrollSpy`, `initNarrativeTimelineChart`, `destroyNarrativeTimelineChart`

### Consumer: `src/features/batch-refresh.js`

Imports 1: `fetchPriceDrivers`
Also accesses via `window.*`: `initNarrativeTimelineChart`, `destroyNarrativeTimelineChart`, `setupScrollSpy`

### Consumer: `src/pages/snapshot.js`

Imports 2: `renderPDFDownload`, `prepareHypotheses`

### Consumer: `src/pages/report-sections.test.js`

Imports 1: `computeMA`

### Exports with zero external consumers (internal only)

- `renderEvidenceCard` -- called only by `renderEvidence` within the monolith
- `renderAlignmentSummary` -- called only by `renderEvidence` within the monolith
- `computeMA` -- called only by `renderTAChart` within the monolith (and test file)
- `renderPriceDriversContent` -- called only by `fetchPriceDrivers` within the monolith

---

## Dependency Graph

### Exports by line range, internal calls, and external imports

| # | Export | Lines | Calls internally | External consumers |
|---|--------|-------|------------------|--------------------|
| 1 | `renderReportHero` | 17-260 | `RS_HDR`(no), `renderSparkline`, `formatDateAEST`, `fmtPE`, reads `STOCK_DATA`, `ANNOUNCEMENTS_DATA`, `FEATURED_ORDER` | report.js |
| 2 | `renderSkewBar` | 262-283 | `computeSkewScore` (from dom.js) | report.js |
| 3 | `renderVerdict` | 317-346 | `_dirTextToCls`(internal), `normaliseScores` (from dom.js) | report.js |
| 4 | `renderSectionNav` | 348-388 | none | report.js |
| 5 | `renderIdentity` | 390-416 | `RS_HDR` | report.js |
| 6 | `renderHypotheses` | 418-478 | `normaliseScores` (from dom.js) | report.js |
| 7 | `renderNarrative` | 480-501 | `RS_HDR` | report.js |
| 8 | `renderEvidenceCard` | 503-557 | none | **none** (internal to renderEvidence) |
| 9 | `renderAlignmentSummary` | 559-602 | none | **none** (internal to renderEvidence) |
| 10 | `renderEvidence` | 604-624 | `renderEvidenceCard`, `renderAlignmentSummary`, `RS_HDR` | report.js |
| 11 | `renderDiscriminators` | 626-655 | `RS_HDR` | report.js |
| 12 | `renderTripwires` | 657-693 | `RS_HDR` | report.js |
| 13 | `renderGaps` | 695-735 | `RS_HDR` | report.js |
| 14 | `computeMA` | 737-746 | none | **test only** (internal to renderTAChart) |
| 15 | `renderTAChart` | 748-940 | `computeMA` | live-data.js |
| 16 | `renderTechnicalAnalysis` | 942-1123 | `RS_HDR` | report.js |
| 17 | `renderReportFooter` | 1125-1140 | `formatDateAEST` | report.js |
| 18 | `renderPDFDownload` | 1142-1160 | `formatDateAEST` | report.js, snapshot.js |
| 19 | `renderHypSidebar` | 1162-1317 | `normaliseScores`, `computeSkewScore`, `fmtPE`, reads `REFERENCE_DATA` | report.js |
| 20 | `prepareHypotheses` | 1319-1373 | `_dirTextToCls`, `_inferPolarity` (from dom.js) | report.js, snapshot.js |
| 21 | `renderOvercorrectionBanner` | 1375-1394 | none | report.js |
| 22 | `renderNarrativeTimeline` | 1426-1447 | `RS_HDR` | report.js |
| 23 | `initNarrativeTimelineChart` | 1462-1790 | `destroyNarrativeTimelineChart`, `loadNarrativeHistory`, reads `STOCK_DATA`, uses `window.Chart`, `NT_COLORS`, `HISTORY_CACHE` | main.js, live-data.js, batch-refresh.js (via window) |
| 24 | `destroyNarrativeTimelineChart` | 1792-1805 | uses `window.Chart` | main.js, live-data.js, batch-refresh.js (via window) |
| 25 | `renderSignalBars` | 1807-1961 | `computeSkewScore` (from dom.js) | report.js |
| 26 | `renderGoldDiscovery` | 1967-1973 | `_renderGoldDiscoveryInner` | report.js |
| 27 | `renderPriceDrivers` | 2279-2389 | `_formatDriverDate`, `_truncate`, `RS_HDR` | report.js |
| 28 | `renderGoldSection` | 2395-2531 | `RS_HDR` | report.js |
| 29 | `setupScrollSpy` | 2534-2563 | none (pure DOM) | main.js, live-data.js, batch-refresh.js (via window) |
| 30 | `renderPriceDriversPlaceholder` | 2570-2572 | none | report.js |
| 31 | `renderPriceDriversContent` | 2595-2730 | `_formatDriverDate`, `_truncate` | **none** (internal to fetchPriceDrivers) |
| 32 | `fetchPriceDrivers` | 2733-2762 | `renderPriceDriversContent`, reads `API_BASE`, `window.CI_API_KEY` | report.js, batch-refresh.js |

### Internal (non-exported) functions

| Function | Lines | Used by |
|----------|-------|---------|
| `RS_CHEVRON` (const) | 9 | `RS_HDR` |
| `RS_HDR` | 10-15 | renderIdentity, renderNarrative, renderEvidence, renderDiscriminators, renderTripwires, renderGaps, renderTechnicalAnalysis, renderNarrativeTimeline, renderPriceDrivers, renderGoldSection |
| `_dirTextToCls` | 297-315 | renderVerdict, prepareHypotheses |
| `HISTORY_CACHE` (mutable) | 1398 | loadNarrativeHistory, initNarrativeTimelineChart |
| `loadNarrativeHistory` | 1400-1424 | initNarrativeTimelineChart |
| `NT_COLORS` (const) | 1449-1460 | initNarrativeTimelineChart |
| `_renderGoldAssets` | 1975-2005 | _renderGoldDiscoveryInner |
| `_renderGoldValuation` | 2007-2044 | _renderGoldDiscoveryInner |
| `_renderGoldPeers` | 2046-2084 | _renderGoldDiscoveryInner |
| `_renderGoldSensitivities` | 2086-2127 | _renderGoldDiscoveryInner |
| `_renderGoldDiscoveryInner` | 2129-2277 | renderGoldDiscovery |
| `_formatDriverDate` | 2575-2580 | renderPriceDrivers, renderPriceDriversContent |
| `_truncate` | 2582-2592 | renderPriceDrivers, renderPriceDriversContent |

---

## Proposed Domain Modules

### Module 1: `src/pages/report/shared.js` (~30 lines)

Shared constants and utilities used across multiple section renderers.

- **Exports:** `RS_CHEVRON`, `RS_HDR`
- **Internal dependencies:** none
- **External consumers:** all section modules that render section headers
- **Estimated lines:** ~30

### Module 2: `src/pages/report/hero.js` (~260 lines)

Report hero section: stock identity, price, sparkline, announcements, position-in-range, skew indicator, next decision point, nav.

- **Exports to extract:** `renderReportHero`
- **Internal dependencies:** `RS_HDR` from shared.js, `renderSparkline`/`formatDateAEST`/`fmtPE` from lib/format.js, reads `STOCK_DATA`/`ANNOUNCEMENTS_DATA`/`FEATURED_ORDER` from state.js
- **External consumers:** report.js
- **Estimated lines:** ~260

### Module 3: `src/pages/report/hypothesis.js` (~300 lines)

Hypothesis preparation, rendering, verdict, skew bar, overcorrection banner.

- **Exports to extract:** `prepareHypotheses`, `renderHypotheses`, `renderVerdict`, `renderSkewBar`, `renderOvercorrectionBanner`
- **Internal dependencies:** `_dirTextToCls` (moves here), `normaliseScores`/`computeSkewScore`/`_inferPolarity` from dom.js
- **External consumers:** report.js, snapshot.js (prepareHypotheses)
- **Estimated lines:** ~300

### Module 4: `src/pages/report/evidence.js` (~250 lines)

Evidence cards, alignment summary, discriminators, tripwires, gaps.

- **Exports to extract:** `renderEvidence`, `renderEvidenceCard`, `renderAlignmentSummary`, `renderDiscriminators`, `renderTripwires`, `renderGaps`
- **Internal dependencies:** `RS_HDR` from shared.js
- **External consumers:** report.js
- **Estimated lines:** ~250

### Module 5: `src/pages/report/identity.js` (~60 lines)

Identity table and section nav.

- **Exports to extract:** `renderIdentity`, `renderSectionNav`
- **Internal dependencies:** `RS_HDR` from shared.js
- **External consumers:** report.js
- **Estimated lines:** ~60

### Module 6: `src/pages/report/narrative.js` (~50 lines)

Dominant narrative section.

- **Exports to extract:** `renderNarrative`
- **Internal dependencies:** `RS_HDR` from shared.js
- **External consumers:** report.js
- **Estimated lines:** ~50

### Module 7: `src/pages/report/technical.js` (~400 lines)

TA chart (SVG), technical analysis metrics, computeMA.

- **Exports to extract:** `renderTAChart`, `renderTechnicalAnalysis`, `computeMA`
- **Internal dependencies:** `RS_HDR` from shared.js
- **External consumers:** report.js, live-data.js (renderTAChart), report-sections.test.js (computeMA)
- **Estimated lines:** ~400

### Module 8: `src/pages/report/signal-bars.js` (~160 lines)

Three-layer signal bars (Technical, Macro, Sector, Company).

- **Exports to extract:** `renderSignalBars`
- **Internal dependencies:** `computeSkewScore` from dom.js
- **External consumers:** report.js
- **Estimated lines:** ~160

### Module 9: `src/pages/report/sidebar.js` (~200 lines)

Hypothesis sidebar (sticky panel with skew, valuation range, signals).

- **Exports to extract:** `renderHypSidebar`
- **Internal dependencies:** `normaliseScores`/`computeSkewScore` from dom.js, `fmtPE` from format.js, reads `REFERENCE_DATA` from state.js
- **External consumers:** report.js
- **Estimated lines:** ~200

### Module 10: `src/pages/report/gold.js` (~430 lines)

Gold discovery section (gold_agent data) and gold analysis section (goldAnalysis data).

- **Exports to extract:** `renderGoldDiscovery`, `renderGoldSection`
- **Internal dependencies:** `_renderGoldAssets`, `_renderGoldValuation`, `_renderGoldPeers`, `_renderGoldSensitivities`, `_renderGoldDiscoveryInner` (all move here), `RS_HDR` from shared.js
- **External consumers:** report.js
- **Estimated lines:** ~430

### Module 11: `src/pages/report/narrative-timeline.js` (~380 lines)

Narrative timeline Chart.js visualisation, history loading, flip markers.

- **Exports to extract:** `renderNarrativeTimeline`, `initNarrativeTimelineChart`, `destroyNarrativeTimelineChart`
- **Internal dependencies:** `loadNarrativeHistory`, `HISTORY_CACHE`, `NT_COLORS` (all move here), `RS_HDR` from shared.js, reads `STOCK_DATA` from state.js, uses `window.Chart`
- **External consumers:** report.js, main.js, live-data.js, batch-refresh.js (via window)
- **Estimated lines:** ~380
- **Mutable state:** `HISTORY_CACHE` (module-scoped, acceptable -- cache per ticker)

### Module 12: `src/pages/report/price-drivers.js` (~260 lines)

Price drivers section (embedded and async), placeholder, content renderer, fetch.

- **Exports to extract:** `renderPriceDrivers`, `renderPriceDriversPlaceholder`, `renderPriceDriversContent`, `fetchPriceDrivers`
- **Internal dependencies:** `_formatDriverDate`, `_truncate` (move here), `RS_HDR` from shared.js, reads `API_BASE` from api-config.js
- **External consumers:** report.js, batch-refresh.js (fetchPriceDrivers)
- **Estimated lines:** ~260

### Module 13: `src/pages/report/footer.js` (~60 lines)

Report footer, PDF download buttons, scroll spy.

- **Exports to extract:** `renderReportFooter`, `renderPDFDownload`, `setupScrollSpy`
- **Internal dependencies:** `formatDateAEST` from format.js
- **External consumers:** report.js, snapshot.js (renderPDFDownload), main.js/live-data.js/batch-refresh.js (setupScrollSpy)
- **Estimated lines:** ~60

### Module 14: `src/pages/report/index.js` (~50 lines)

Re-export barrel file for backward compatibility during migration. All external consumers can import from this single entry point during the transition, then migrate to direct module imports.

- **Estimated lines:** ~50

---

## Extraction Sequence

Ordered by dependency: modules with zero internal dependencies first.

### Wave 1 (zero internal dependencies)

These modules depend only on external libraries (dom.js, format.js, state.js, api-config.js) and the shared constants.

1. **shared.js** -- RS_HDR and RS_CHEVRON. Every other module depends on this. Extract first.
2. **identity.js** -- renderIdentity, renderSectionNav. Depends only on shared.js.
3. **narrative.js** -- renderNarrative. Depends only on shared.js.
4. **footer.js** -- renderReportFooter, renderPDFDownload, setupScrollSpy. Depends only on format.js.

### Wave 2 (depend on shared.js only)

5. **evidence.js** -- renderEvidence, renderEvidenceCard, renderAlignmentSummary, renderDiscriminators, renderTripwires, renderGaps. All depend only on shared.js.
6. **technical.js** -- renderTAChart, renderTechnicalAnalysis, computeMA. Depends on shared.js. Has complex SVG but self-contained.

### Wave 3 (depend on dom.js functions)

7. **hypothesis.js** -- prepareHypotheses, renderHypotheses, renderVerdict, renderSkewBar, renderOvercorrectionBanner. Depends on dom.js (normaliseScores, computeSkewScore, _inferPolarity). **COUPLING CHAIN FUNCTIONS** -- prepareHypotheses is flagged for review.
8. **signal-bars.js** -- renderSignalBars. Depends on dom.js (computeSkewScore).
9. **sidebar.js** -- renderHypSidebar. Depends on dom.js and format.js.

### Wave 4 (complex, self-contained domains)

10. **hero.js** -- renderReportHero. Large function (260 lines) but self-contained. Depends on format.js, state.js.
11. **gold.js** -- renderGoldDiscovery, renderGoldSection. Self-contained gold domain with 5 internal helpers.
12. **narrative-timeline.js** -- Chart.js integration. Contains mutable HISTORY_CACHE. Self-contained.
13. **price-drivers.js** -- Async fetch + render. Contains _formatDriverDate, _truncate. Self-contained.

### Wave 5 (barrel file)

14. **index.js** -- Re-export all 32 exports. Allows gradual consumer migration.

---

## Shared Utilities Required Before Extraction

- **Number formatting library (BEAD-013):** Replace all 76 `.toFixed()` calls in the monolith with `formatPrice()`, `formatPercent()`, `formatChange()` etc. Must be complete before extraction to avoid carrying inconsistent formatting into new modules.
- **Null guard utility (BEAD-014):** Standardise the 15+ null guard patterns. Must be complete before extraction.

---

## Risk Assessment

### Circular dependencies

**None found.** All internal function calls flow in one direction:
- `renderEvidence` -> `renderEvidenceCard`, `renderAlignmentSummary`
- `renderGoldDiscovery` -> `_renderGoldDiscoveryInner` -> `_renderGoldAssets/Valuation/Peers/Sensitivities`
- `initNarrativeTimelineChart` -> `destroyNarrativeTimelineChart`, `loadNarrativeHistory`
- `fetchPriceDrivers` -> `renderPriceDriversContent`

No export calls another export in the reverse direction.

### Shared mutable state

1. **`HISTORY_CACHE`** (line 1398) -- mutable object used as XHR cache for narrative history. Moves to narrative-timeline.js. No other module accesses it. **LOW RISK.**

2. **`NT_COLORS`** (line 1449) -- constant colour palette. Moves to narrative-timeline.js. **NO RISK** (immutable).

3. **`prepareHypotheses` mutates `data`** (lines 1319-1373) -- sets `data._hypothesesPrepared`, `hyps[i].dirClass`, `vs.scoreColor`, `vs._dirCls`, modifies `as.headers`. This is a **KNOWN MUTATION PATTERN** guarded by `_hypothesesPrepared` flag. All consumers call it once before rendering. Moves to hypothesis.js. **MEDIUM RISK** -- must preserve call-once semantics in report.js and snapshot.js.

### DOM coupling

The following exports directly access the DOM (not just generating HTML strings):

- `setupScrollSpy` -- reads DOM via `document.getElementById`, `querySelectorAll`, creates `IntersectionObserver`
- `initNarrativeTimelineChart` -- reads DOM, creates Chart.js instance, attaches to canvas
- `destroyNarrativeTimelineChart` -- reads DOM, destroys Chart.js instance
- `fetchPriceDrivers` -- reads DOM, calls fetch(), writes innerHTML
- `renderPriceDriversContent` -- writes to container.innerHTML

These DOM-accessing functions must stay separate from pure HTML generators. They are already naturally grouped:
- footer.js: `setupScrollSpy`
- narrative-timeline.js: `initNarrativeTimelineChart`, `destroyNarrativeTimelineChart`
- price-drivers.js: `fetchPriceDrivers`, `renderPriceDriversContent`

### Coupling chain functions

**`prepareHypotheses`** is flagged in the master brief as a coupling chain function. It:
- Enriches `data.hypotheses[i].dirClass`
- Enriches `data.verdict.scores[i].scoreColor` and `._dirCls`
- Modifies `data.evidence.alignmentSummary.headers`

All downstream renderers (renderHypotheses, renderVerdict, renderHypSidebar, renderSignalBars) depend on these enriched fields. The function MUST be called before any rendering. This contract is already enforced in report.js:53 (`prepareHypotheses(data)` called first) but must be documented and tested.

---

## Post-Extraction Target State

| Module | Max lines | Contains |
|--------|-----------|----------|
| shared.js | 30 | RS_HDR, RS_CHEVRON |
| hero.js | 260 | renderReportHero |
| hypothesis.js | 300 | prepareHypotheses, renderHypotheses, renderVerdict, renderSkewBar, renderOvercorrectionBanner, _dirTextToCls |
| evidence.js | 250 | renderEvidence, renderEvidenceCard, renderAlignmentSummary, renderDiscriminators, renderTripwires, renderGaps |
| identity.js | 60 | renderIdentity, renderSectionNav |
| narrative.js | 50 | renderNarrative |
| technical.js | 400 | renderTAChart, renderTechnicalAnalysis, computeMA |
| signal-bars.js | 160 | renderSignalBars |
| sidebar.js | 200 | renderHypSidebar |
| gold.js | 430 | renderGoldDiscovery, renderGoldSection + 5 internal helpers |
| narrative-timeline.js | 380 | renderNarrativeTimeline, initNarrativeTimelineChart, destroyNarrativeTimelineChart + cache/colours |
| price-drivers.js | 260 | renderPriceDrivers, renderPriceDriversPlaceholder, renderPriceDriversContent, fetchPriceDrivers + helpers |
| footer.js | 60 | renderReportFooter, renderPDFDownload, setupScrollSpy |
| index.js | 50 | barrel re-exports |

**Total estimated:** ~2,890 lines across 14 files (vs 2,762 in monolith -- slight increase from import/export overhead, well within tolerance).

**Monolith reduction:** from 2,762 lines to ~0 (replaced by index.js barrel).

**No module exceeds 430 lines.** All under the 500-line threshold.
