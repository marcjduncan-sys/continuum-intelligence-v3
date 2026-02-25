# Continuum Intelligence v3 — Module Map

> Reference document for safe, section-by-section editing.
> Each Unit and Sub-Section lists its HTML, CSS, and JS line ranges
> so you know exactly what to touch — and what NOT to touch.

---

## Golden Rules

1. **Never edit a shared CSS class directly** (`.hero`, `.site-footer`, `.section-header`, `.skew-badge`, etc.) unless you intend to change ALL pages. Instead, scope with the page ID:
   ```css
   /* SAFE — only changes home page */
   #page-home .hero-title { font-size: 2.8rem; }

   /* DANGEROUS — changes every page */
   .hero-title { font-size: 2.8rem; }
   ```

2. **Never rename an `id` attribute** without updating the corresponding JS `getElementById` / `querySelector` calls.

3. **Never change the `data-ticker-card` attribute** on featured cards or the `.fc-price` class — the live price updater depends on them.

4. **Never modify `computeSkewScore()`** without checking its 5+ callers across home, reports, snapshots, and portfolio.

5. **Never modify `prepareHypotheses()`** without understanding that it remaps N1-N4 labels across evidence, discriminators, tripwires, and gaps.

---

## Shared Data Contract

These data structures are read by multiple Units. Changes here affect everything.

| Asset | File | Consumed By |
|---|---|---|
| Lightweight Index | `data/research/_index.json` | Units 1, 3, 5, 7 |
| Full Research JSON | `data/research/{TICKER}.json` | Units 2, 4, 5, 6 |
| Config | `data/config/tickers.json`, `price_rules.json` | Units 2, 6 |
| STOCK_DATA object | In-memory (populated by data loader) | Most Units |
| TC_DATA object | In-memory (line ~9972) | Units 5 (Portfolio), 6 (Thesis) |
| COVERAGE_DATA object | In-memory (line 9367) | Units 5 (Portfolio) |
| REFERENCE_DATA object | In-memory (line 4710) | Unit 2 (DNE), live price system |
| FRESHNESS_DATA object | In-memory (line 4701) | Unit 1 (Home cards) |

---

## Shared CSS Classes (DANGER ZONE)

These classes are used by multiple pages. Never edit the base definition — use page-scoped selectors instead.

| Class | Used By |
|---|---|
| `.hero`, `.hero-title`, `.hero-subtitle`, `.hero-tagline` | Home, Snapshots, Portfolio, About |
| `.hero-cred` | Home only (but shares `.hero` parent) |
| `.page`, `.page.active`, `.page-inner` | Every page |
| `.site-footer`, `.footer-*` | Home, Snapshots, About |
| `.section-header`, `.section-title` | Home, Reports |
| `.skew-badge` | Home cards, Coverage table, Reports, Snapshots |
| `.skew-bar-track`, `.skew-bar-bull`, `.skew-bar-bear` | Home cards, Coverage table, Reports, Snapshots |
| `.skew-score` | Home cards, Coverage table, Reports |
| `.callout` | Reports (narrative, gaps), potentially others |
| `.brand-green` | Nav, Footer, Snapshots |
| `.report-section` | Reports (all 10 sections) |

Page-scoped override templates have been added to `index.html` (search for "PAGE-SCOPED OVERRIDES").

---

## Unit 1: Home Page

**Container:** `#page-home` (line 4199)

### Sub-Section 1A: Hero Banner
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4202–4207 | Yes (text only) |
| CSS | 375–404 | **SHARED** — scope with `#page-home` |

### Sub-Section 1B: Price Ticker Strip
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4210 | Yes |
| CSS | 3545–3583 | **Yes — unique** |
| JS renderer | 8754–8780 (`renderTickerStrip`) | Yes |
| JS caller | 8793 (inside `MarketFeed.poll`) | Careful |

### Sub-Section 1C: Market Status Bar
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4213–4223 | Yes |
| CSS | 3462–3542 | **Yes — unique** |
| JS module | 8576–8987 (`MarketFeed` IIFE) | Careful — also updates cards & reports |
| JS DOM IDs | `msb-dot`, `msb-label`, `msb-updated`, `msb-feed-status`, `msb-refresh` | Must keep in sync |

### Sub-Section 1D: Featured Cards Grid
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4237–4241 (container) | Yes |
| CSS unique | `.featured-grid`, `.featured-card`, `.fc-*` (425–650) | **Yes** |
| CSS shared | `.skew-badge`, `.skew-bar-*`, `.skew-score` (501–560) | **SHARED** |
| JS renderer | 7586–7624 (`renderFeaturedCard`) | Yes — but keep `data-ticker-card` attr & `.fc-price` class |
| JS helpers | 7626–7644 (`renderFreshnessBadge`, `renderCatalystTag`) | Yes |
| JS bootstrap | 9293–9300 | Yes |
| JS live updater | 8730–8751 (`updateHomeCardPrice`) | **COUPLED** to card HTML structure |
| JS re-renderer | 8494–8503, 8555–8564 | **COUPLED** — replaces card DOM |

**Critical preservation:**
- `data-ticker-card="TICKER"` attribute (queried at lines 8495, 8556, 8731)
- `.fc-price` class (queried at line 8734)
- Single root element structure (for `replaceChild` at lines 8501, 8562)

### Sub-Section 1E: Coverage Table
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4244–4261 | Yes |
| CSS unique | `.coverage-table`, `.td-*`, `.sort-arrow` (621–760) | **Yes** |
| CSS shared | `.skew-cell`, `.skew-bar-*`, `.skew-tooltip-*` (524–618) | **SHARED** with cards |
| JS renderer | 7646–7717 (`renderCoverageRow`, `renderComingSoonRow`) | Yes |
| JS sort | 7719–7764 (`sortCoverageTable`) | Yes |
| JS bootstrap | 9303–9313 | Yes |

### Sub-Section 1F: Footer
| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4264–4288 | Yes |
| CSS | 312–372 | **SHARED** — scope with `#page-home` |
| JS | 9316–9325 (footer links) | Yes |

---

## Unit 2: Dynamic Narrative Engine (DNE)

**Files:** All in `js/dne/`

| File | Lines | Purpose | Safe to edit alone? |
|---|---|---|---|
| `app.js` | 129 lines | Bootstrap DNE on stock pages | Yes |
| `engine.js` | 209 lines | Hypothesis survival scoring | **Careful** — core algorithm |
| `evidence.js` | 106 lines | Constants, decay calc, utilities | **Careful** — shared constants |
| `normalise.js` | 176 lines | Score normalisation to 100% | **Careful** — used by 5+ callers |
| `override.js` | 69 lines | Editorial override mechanism | Yes |
| `price-signals.js` | 279 lines | Price dislocation detection | Yes |
| `weighting.js` | 333 lines | Price-correlation analysis | Yes |
| `ui.js` | 353 lines | DNE UI rendering | Yes |
| `pdf.js` | 655 lines | PDF report generation | Yes |

**CSS:** `css/narrative.css`

---

## Unit 3: Snapshots

**Container:** `#page-snapshots` (line 4294), `#page-snapshot-{TICKER}` (lines 4316–4327)

### Sub-Sections

| Component | HTML Lines | CSS Lines | JS Lines |
|---|---|---|---|
| Snapshot grid page | 4294–4313 | 3280–3299 | `snapshot-generator.js` (external) |
| Snapshot detail pages | 4316–4327 (containers) | 3301–3461 (`.snap-*`) | 7382–7781 (`renderSnapshotPage`) |
| Snapshot data builder | N/A | N/A | 7102–7352 (`buildSnapshotFromStock`) |
| Snapshot list card | N/A | 3280–3299 | 7354–7380 (`renderSnapshotListCard`) |

**CSS prefix:** `.snap-*`, `.snapshot-*` — all unique to snapshots

**Coupling:**
- Reads `STOCK_DATA` and `computeSkewScore()` (read-only)
- Shares `.hero` classes with home/portfolio/about (scope with `#page-snapshots`)
- `SNAPSHOT_DATA` written by `buildSnapshotFromStock()`, read by `route()`

---

## Unit 4: Stock Report Pages

**Container:** `#page-report-{TICKER}` (dynamically created)

### Sub-Sections (in render order)

| Section | JS Function | JS Lines | CSS Lines | Coupling |
|---|---|---|---|---|
| Report Hero | `renderReportHero()` | 5266–5443 | 762–1035 | Live price updates hero via `updateLiveUI()` |
| Signal Bars | `renderSignalBars()` | 6903–7049 | 1109–1168 | Reads `_livePrice` |
| Skew Bar | `renderSkewBar()` | 5448–5467 | 1040–1063 | Calls `computeSkewScore()` |
| Verdict | `renderVerdict()` | 5469–5492 | 1065–1107 | Depends on `prepareHypotheses()` reorder |
| Section Nav | `renderSectionNav()` | 5494–5523 | 1170–1199 | None |
| Sec 1: Identity | `renderIdentity()` | 5525–5551 | 1842–1864 | None — **fully isolated** |
| Sec 2: Hypotheses | `renderHypotheses()` | 5553–5609 | 1499–1601 | **HIGH** — `prepareHypotheses()` remaps all N1-N4 refs |
| Narrative Timeline | `renderNarrativeTimeline()` | 6542–6562 | N/A | Chart.js async init |
| Sec 3: Narrative | `renderNarrative()` | 5611–5630 | 1603–1636 | Updated by `applyNarrativeAnalysis()` |
| Sec 4: Evidence | `renderEvidence()` | 5738–5756 | 1376–1497 | Alignment table reordered by `prepareHypotheses()` |
| Sec 5: Discriminators | `renderDiscriminators()` | 5758–5786 | 1817–1841 | Text remapped by `prepareHypotheses()` |
| Sec 6: Tripwires | `renderTripwires()` | 5788–5818 | 1733–1782 | Text remapped by `prepareHypotheses()` |
| Sec 7: Gaps | `renderGaps()` | 5820–5856 | 1784–1815 | Text remapped by `prepareHypotheses()` |
| Sec 8: Technical | `renderTechnicalAnalysis()` | 6075–6243 | 2974–3209 | Uses `_liveChart` from live data |
| Sec 9: Chat | inline HTML | 7066–7079 | N/A | `initInlineChat()` async |
| PDF Download | `renderPDFDownload()` | 6261–6282 | 2332–2390 | None — **isolated** |
| Report Footer | `renderReportFooter()` | 6245–6259 | 2294–2330 | None — **isolated** |

**CSS prefixes (all unique to reports):**
- `rh-*` (hero), `rs-*` (section), `ta-*` (technical), `ec-*` (evidence cards), `hc-*` (hypothesis cards), `tw-*` (tripwires), `disc-*` (discriminators), `sb-*` (signal bars), `vs-*` (verdict), `pir-*` (position in range), `vr-*` (valuation range), `ndp-*` (next decision point), `nt-*` (narrative timeline), `rf-*` (report footer)

**Key coupling function:** `prepareHypotheses()` (lines 6288–6480) — sorts hypotheses and remaps ALL N1-N4 text references across evidence, discriminators, tripwires, gaps, verdict, alignment table. **Do not modify without understanding full impact.**

**Live data coupling chain:**
```
MarketFeed.poll() / prefetchAllLiveData()
  → fetchAndPatchLive(ticker)
    → sets stock._livePrice, stock._liveChart, stock._liveTA
      → updateLiveUI(ticker)
        → ContinuumDynamics.onPriceUpdate() → hero metrics
        → applyNarrativeAnalysis() → narrative text
        → replaces TA chart container
        → updates hero price element
```

---

## Unit 5: Portfolio Analysis

**Container:** `#page-portfolio` (line 4332)

### Sub-Sections

| Component | HTML Lines | CSS Lines | JS Lines | Safe? |
|---|---|---|---|---|
| Upload Zone | 4342–4350 | 2419–2461 | 9369–9389 (`setupUploadZone`) | **Yes — isolated** |
| Actions Bar | 4352–4356 | 2570–2599 | Part of `renderPortfolio` | Yes |
| Summary Bar | 4358–4380 | 2463–2494 | Part of `renderPortfolio` | Yes |
| Holdings Table | 4382–4399 | 2496–2535 | 9511–9577 (`renderPortfolio`) | Yes (keep IDs) |
| DNA Diagnostics | 4401–4467 | 2601–2741 | 9595–9673 (`renderPortfolioDiagnostics`) | Yes (keep IDs) |
| Change Alerts | 4469–4485 | 2743–2861 | 9785–9880 (`renderChangeAlerts`) | Yes |
| Reweighting | 4487–4497 | 2863–2925 | 9675–9782 (`renderReweighting`) | Yes |

**CSS prefixes (all unique):** `.portfolio-*`, `.upload-*`, `.port-*`, `.alignment-*`, `.change-alert-*`, `.rw-*`

**Data coupling:** Reads `TC_DATA` (hypothesis data) and `COVERAGE_DATA` (prices/skew) — read-only.

**Critical IDs (do not rename):**
`uploadZone`, `fileInput`, `portfolioTable`, `portfolioBody`, `portfolioSummary`, `portfolioActions`, `portfolioDiagnostics`, `changeAlertsSection`, `changeAlertsFeed`, `changeAlertsEmpty`, `portfolioReweighting`, `reweightBody`, `portDnaBar`, `dnaN1–4`, `portConcentrationAlert`, `portContrarianOpp`, `portHedgeGaps`, `portAlignmentScore`

---

## Unit 6: Thesis Comparator

**Container:** `#page-thesis` (line 4568)

### Sub-Sections

| Component | HTML Lines | CSS Lines | JS Lines | Safe? |
|---|---|---|---|---|
| Hero | 4571–4575 | 1908–1934 | None | **Yes — static** |
| Stock Grid (Step 1) | 4578–4588 | 1952–1991 | 9330–9343 (bootstrap), 10098–10105 (`tcSelectStock`) | Yes |
| Thesis Input (Step 2) | 4590–4601 | 1993–2043 | Part of `tcAnalyze` | Yes |
| Results | 4604–4631 | 2045–2256 | 10107–10179 (`tcAnalyze`) | Yes (keep IDs) |

**CSS prefix (all unique):** `.tc-*`

**Coupling:** Reads `TC_DATA` — no reverse coupling. Portfolio reads from TC_DATA but Thesis never reads from Portfolio.

**Critical IDs:** `tc-stock-grid`, `tc-step-2`, `tc-thesis-input`, `tc-results`, `tc-banner`, `tc-banner-label`, `tc-banner-hypothesis`, `tc-banner-desc`, `tc-map-rows`, `tc-analysis-text`, `tc-supporting`, `tc-contradicting`

---

## Unit 7: Personalisation

**Container:** `#page-personalisation` (line 4648 — empty div, JS-rendered)

| Layer | File | Safe? |
|---|---|---|
| JS | `js/personalisation.js` (1,781 lines) | **Yes — fully isolated** |
| CSS | `css/personalisation.css` (1,354 lines) | **Yes — fully isolated** |
| HTML | Empty container, populated by `renderPersonalisationPage()` | Yes |

**CSS prefix:** `.pn-*`, `.wizard-*`
**Data:** LocalStorage only — zero coupling to other Units
**Lifecycle:** `route()` calls `renderPersonalisationPage()` on first visit, `pnOnRouteEnter()` on subsequent visits

---

## Unit 8: API Backend

**Directory:** `api/`

| File | Purpose | Safe? |
|---|---|---|
| `main.py` | FastAPI app, chat endpoint | **Yes — isolated service** |
| `ingest.py` | Research data ingestion | Yes |
| `retriever.py` | BM25 passage retrieval | Yes |
| `config.py` | Environment config | Yes |
| `Dockerfile` | Container build | Yes |

**Zero coupling to frontend DOM/CSS/JS.** Completely independent service.

---

## Unit 9: Data Loading

| Component | Lines | Purpose | Risk |
|---|---|---|---|
| `loadFullResearchData()` | ~5013 | Async fetch of per-ticker JSON | **HIGH** — feeds all report/snapshot renders |
| Index loading | DOMContentLoaded handler | Bootstrap STOCK_DATA from `_index.json` | **HIGH** |
| `_indexOnly` flag | Set during index load | Controls lazy-loading behavior | **HIGH** |
| `FEATURED_ORDER` | 8990 | Card display order | Low |
| `COMING_SOON` | 8993 | Stub stock entries | Low |

**Rule:** Treat this Unit as frozen unless you specifically need to change data loading behavior.

---

## Unit 10: Navigation & Routing

| Component | Lines | Purpose | Risk |
|---|---|---|---|
| Nav HTML | 4171–4189 | Site nav, links, theme toggle | Medium |
| Nav CSS | 255–300, 240–252 | Styling, scroll state | Low |
| `route()` | 9007–9154 | Master router | **HIGH** — controls all page activation |
| `navigate()` | 9000–9002 | Hash setter | Low |
| `VALID_STATIC_PAGES` | 8998 | Route allowlist | Medium |
| Hash listener | 9165–9180 | Route trigger | **HIGH** |
| Scroll listener | 9184–9191 | Nav shadow | Low |
| Theme toggle | 9193–9230 | Dark/light mode | Low |
| `renderedPages` | 9004 | Lazy-render tracking | **HIGH** |
| `renderedSnapshots` | 9005 | Lazy snapshot tracking | **HIGH** |

**Rule:** To add a new page:
1. Add `<div class="page" id="page-{name}">` to HTML
2. Add `'{name}'` to `VALID_STATIC_PAGES` set
3. Add `<a href="#{name}" data-nav="{name}">` to `.nav-links`
4. Use unique CSS prefix for all styles

---

## About Page

**Container:** `#page-about` (line 4520)

| Layer | Lines | Safe? |
|---|---|---|
| HTML | 4517–4563 | **Yes — 100% static** |
| CSS | `.about-*` classes | **Yes — all unique** |
| JS | None | N/A |

**Shared classes used:** `.hero-tagline` (inline override), `.site-footer` — scope with `#page-about`.

---

## Independence Matrix

| Unit | Can work on independently? | Risk to others | Shared data read |
|---|---|---|---|
| 1. Home Page | Yes | Low (if CSS scoped) | `_index.json` |
| 2. DNE Engine | Yes | Low (if schema stable) | Research JSON, price rules |
| 3. Snapshots | Yes | None | STOCK_DATA |
| 4. Stock Reports | Yes | None | Full research JSON |
| 5. Portfolio | Yes | None | TC_DATA, COVERAGE_DATA |
| 6. Thesis Comparator | Yes | None | TC_DATA |
| 7. Personalisation | **Fully isolated** | None | localStorage only |
| 8. API Backend | **Fully isolated** | None | Separate service |
| 9. Data Loader | **Careful** | **High** | Feeds everything |
| 10. Routing | **Careful** | **High** | Controls page visibility |
| About | **Fully isolated** | None | None |

---

## Safe Working Order

**Zero risk (start here):**
- Personalisation (Unit 7)
- API Backend (Unit 8)
- About page

**Low risk:**
- Thesis Comparator (Unit 6)
- Portfolio (Unit 5)
- Snapshots (Unit 3)
- Home Page sub-sections 1B, 1C (unique CSS)

**Medium risk:**
- Home Page sub-sections 1D, 1E (shared skew CSS)
- Home Page sub-sections 1A, 1F (shared hero/footer CSS — use `#page-home` scoping)
- DNE Engine (Unit 2) — isolated files but core algorithms

**High risk:**
- Stock Reports (Unit 4) — many live-data coupling points
- Data Loader (Unit 9) — feeds everything
- Routing (Unit 10) — controls everything
