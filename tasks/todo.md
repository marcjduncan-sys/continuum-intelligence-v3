# Task Tracker

<!-- Claude: update this file as you work. Check items off, add review notes, track blockers. -->

## Current Task

**Gold Stock Coverage Pipeline -- Archetype System + Unified Gold Section**

Gold stocks render as broken/incomplete because the onboarding pipeline and display logic assume broker-covered, earnings-generating companies. Pre-production explorers (OBM, WIA, SNX) show all-N/A metrics, trigger the "Analysis Pending" gate, and have confusing dual gold sections.

### Success Criteria

- Every gold stock displays a populated card with archetype-appropriate metrics
- No gold stock triggers "Analysis Pending" when analysis is complete
- Gold analysis renders as a single nav entry (prefer goldAgent over goldAnalysis)
- Add Stock pipeline applies correct metric template based on archetype
- `isDataPending()` distinguishes "structurally unavailable" from "pipeline incomplete"

### Stories (Critical Path: S0 → S1 → S2 → S3/S4 → S6. Parallel: S5, S7.)

- [x] **S0** -- Fix OBM/SNX notebook ID collision. SNX set to PLACEHOLDER pending notebook creation.
- [x] **S1** -- Add `archetype` to `reference.json` for all 32 tickers (7 archetypes: producer, developer, explorer, diversified, financial, tech, reit).
- [x] **S2** -- Created `data/config/metric-templates.json` with 7 archetype-specific templates.
- [x] **S3** -- `home.js` now imports REFERENCE_DATA, uses `_getArchetype()` for archetype lookup.
- [x] **S4** -- `isDataPending()` now archetype-aware: explorer/developer only require Mkt Cap or Drawdown.
- [x] **S5** -- Populated sharesOutstanding + marketCapStr for OBM (520M shares, A$775M), WIA (353M, A$177M), SNX (1860M, A$112M).
- [x] **S6** -- Regenerated featuredMetrics in _index.json: NST/EVN/OBM use producer template, WIA/SNX use explorer, HRZ uses developer.
- [x] **S7** -- Unified gold nav: single "Gold" entry, prefer goldAgent, fallback goldAnalysis. Removed duplicate Section 11 nav entry.
- [ ] **S8** -- Run gold agent for SNX. Depends on S0 (user must create SNX notebook in NotebookLM first).
- [x] **S9** -- `scaffold.py`: `_build_featured_metrics()` selects template by archetype. `build_reference_entry()` now includes archetype. `main.py` passes sector/industry to reference builder.
- [x] **S10** -- `scaffold.py`: `infer_archetype()` with sector/sub-sector rules + `_ARCHETYPE_OVERRIDES` dict for known tickers.

### Review

<!-- Fill after completion -->

---

## Backlog

- [ ] Inject structured research context into analyst chat (prev current task -- paused)
- [ ] Mandatory login enforcement
- [ ] Technical analysis agent
- [ ] Rates/property/banks agent
- [ ] OHLCV Railway proxy
