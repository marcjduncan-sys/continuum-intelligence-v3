# Gold Analyst Agent Integration -- Design Spec

**Date:** 2026-03-15
**Approach:** A (Expand Gold Discovery Section)
**Status:** Approved

---

## 1. Objective

Integrate the Gold Analyst Agent into Continuum Intelligence v3 for three new gold stocks (OBM, WIA, SNX), expanding the research page to surface gold-specific analytical depth. The existing ACH framework sections remain intact; the Gold Discovery section (09) is promoted and expanded with six sub-panels for gold stocks.

---

## 2. Target Stocks

| Ticker | Company | Current State | NotebookLM ID |
|--------|---------|---------------|---------------|
| OBM | Ora Banda Mining | Scaffolded, no gold analysis | `3551536b-a14e-4eab-9b6f-68be4d697e37` |
| WIA | WIA Gold Limited | Scaffolded, no gold analysis | `83e83b7b-8cf0-4238-a1af-8c5c6a6a0bff` |
| SNX | Sierra Nevada Gold | Not in codebase | `72e4ccf0-e062-4e01-ba0f-0ce935358ff1` |

Existing gold stocks with completed analyses: NST, EVN, WAF, HRZ.

---

## 3. Workstreams

### 3.1 Stock Onboarding (prerequisite)

- Scaffold SNX via Railway `/api/stocks/add`
- Verify OBM, WIA, SNX all have entries in `data/reference.json`, `data/research/_index.json`, and `data/research/TICKER.json`
- Populate `reference.json` with SNX market data (sharesOutstanding, EPS, divPerShare, analyst targets)

### 3.2 Gold Agent Execution

- Run gold agent endpoint `GET /api/agents/gold/{ticker}` against OBM, WIA, SNX
- The agent uses the NotebookLM corpus already prepared (notebook IDs above)
- Merge gold agent output into each research JSON under the `goldAgent` key (matching existing NST/EVN/WAF pattern)
- Validate output against the six sub-panel schemas (see Section 6)
- Fallback: if NotebookLM auth is expired, re-run `Get NotebookLM Auth.bat` and update `NOTEBOOKLM_AUTH_JSON` in Railway

### 3.3 Research Page Enhancement

Expand `renderGoldDiscovery` in `src/pages/report-sections.js` from a basic 5-metric summary into a full gold analytical section with six sub-panels.

---

## 4. Data Flow

```
Gold Agent (api/gold_agent.py)
  -> 21 corpus queries via NotebookLM
  -> Claude synthesis into structured JSON (100+ fields)
  -> _flatten_for_frontend() maps to CI v3 compatibility
  -> Stored as data.goldAgent in research JSON (nested, not replacing)
  -> renderGoldDiscovery(data) reads data.goldAgent
  -> Six sub-panel renderers conditionally render based on data presence
```

**Detection logic:** A stock is "gold-enhanced" when `data.goldAgent` exists and is non-null. No sector string matching; the presence of the object is the gate.

**Integration mechanism:** The gold agent API endpoint returns the full analysis JSON. This is manually merged into the research JSON file under the `goldAgent` key, alongside (not replacing) the standard ACH fields. This matches the existing pattern in NST.json, EVN.json, WAF.json, and HRZ.json, where `goldAgent` sits alongside `hypotheses`, `evidence`, `narrative`, etc.

---

## 5. Section Ordering

**Gold stocks (goldAgent present):**
```
Hero -> Skew Bar -> Verdict -> Identity (01) -> Hypotheses (02)
  -> Gold Analysis (09)
  -> Narrative (03) -> Evidence (04) -> Discriminators (05)
  -> Tripwires (06) -> Gaps (07) -> TA (08)
```

**Standard stocks (no change):**
```
Hero -> Skew Bar -> Verdict -> Identity (01) -> Hypotheses (02)
  -> Narrative (03) -> Evidence (04) -> Discriminators (05)
  -> Tripwires (06) -> Gaps (07) -> TA (08)
```

Change is in `src/pages/report.js` render orchestration. Section 09 inserted after Section 02 when `data.goldAgent` is present.

**`renderSectionNav` must also be updated** to move the Gold Discovery nav link from its current position (after Technical) to after Hypotheses when `data.goldAgent` is present.

---

## 6. Expanded renderGoldDiscovery Sub-panels

All sub-panels conditionally rendered based on data presence. Graceful degradation: if a field is missing, that sub-panel is omitted silently. The existing try/catch error boundary pattern (return empty string on error) is retained.

### 6a. Scorecard + Verdict (existing, refined)

**Data source:** `ga.skew_score`, `ga.executive_summary` (fallback: `ga.verdict`), `ga.company_stage`, `ga.analysis_date`

- Skew score badge (coloured: green >= 55, amber 46-54, red <= 45)
- Company stage badge (e.g. "Single Asset Producer", "Advanced Explorer")
- Executive summary paragraph
- Bull/bear two-column layout (`ga.investment_view.bull_case` / `ga.investment_view.bear_case`, fallback: `ga.hypothesis.bull` / `ga.hypothesis.bear`)
- Monitoring trigger (`ga.investment_view.monitoring_trigger`, fallback: `ga.monitoring_trigger`)

### 6b. Asset Portfolio

**Data source:** `ga.assets[]`

Table columns:
- Asset name, country, ownership %, stage
- Deposit type, mining method
- Annual production (koz), reserve grade (g/t), mine life (years)
- AISC per oz

Assets are flat objects with fields like `resources_koz`, `reserves_koz`, `reserve_grade_gt`. No nested JORC breakdown sub-objects exist in the schema; rows are non-expandable.

**Omitted if** `assets` is empty, absent, or null.

### 6c. Cost Structure

**Data source:** `ga.key_metrics`

Compact 3x2 metrics grid:
- AISC per oz (`aisc_per_oz` or `aisc_per_oz_usd`) | Cash cost per oz (`cash_cost_per_oz_usd`)
- Production koz/year (`production_koz_annual`) | Mine life years (`mine_life_years`)
- Reserve grade g/t (`reserve_grade_gt`) | Net cash/debt (`net_cash_debt_aud_m` or `net_cash_debt_usd_m`)

Margin at spot gold calculated dynamically: `(spot_gold - aisc) / spot_gold * 100`. Spot gold from `ga.key_metrics.gold_price_assumption_usd_per_oz` (default 2900).

### 6d. Valuation Scenarios

**Data source:** `ga.valuation.*` (nested under `valuation`, not top-level)

Three-column card:
- Base NAV (`valuation.screening_nav_usd_m`) | Upside NAV (`valuation.upside_nav_usd_m`) | Downside NAV (`valuation.downside_nav_usd_m`)
- Below: P/NAV (`valuation.p_nav`), EV/reserve oz (`valuation.ev_per_reserve_oz_usd`), EV/resource oz (`valuation.ev_per_resource_oz_usd`), EV/production oz (`valuation.ev_per_production_oz_usd`), FCF yield (`valuation.fcf_yield_spot_pct`)

**Omitted if** `ga.valuation` is absent or all NAV fields are null.

### 6e. Peer Comparison

**Data source:** `ga.peer_frame` (summary card, not per-peer table)

The `peer_frame` object contains aggregate metrics, not per-peer rows:
- `peer_group` (list of ticker strings)
- `peer_median_p_nav` (number or null)
- `peer_median_ev_per_reserve_oz_usd` (number or null)
- `p_nav_discount_premium_pct` (number or null)
- `relative_valuation_comment` (string)

Rendered as a summary card:
- Company P/NAV vs peer median P/NAV
- Discount/premium percentage (colour-coded: green for discount, red for premium)
- Peer group list (comma-separated tickers)
- Relative valuation comment

**Omitted if** `ga.peer_frame` is absent or empty.

### 6f. Sensitivity Matrix

**Data source:** `ga.sensitivities` (flat dict with fixed keys, not an array)

Keys:
- `gold_price_down_15_nav_usd_m`
- `gold_price_up_15_nav_usd_m`
- `fx_plus_5pct_nav_usd_m`
- `recovery_minus_2pt_nav_usd_m`
- `capex_plus_15pct_nav_usd_m`
- `delay_6m_nav_usd_m`

Rendered as a table:
| Scenario | NAV (USD m) | Change from Base |
|----------|-------------|------------------|

Base NAV is `ga.valuation.ic_nav_usd_m` or `ga.valuation.screening_nav_usd_m`. Percentage change computed at render time: `((scenario_nav - base_nav) / base_nav * 100)`. Colour-coded: green for positive delta, red for negative.

**Omitted if** `ga.sensitivities` is absent or all values are null.

---

## 7. Home Page Tile Handling

No home page code changes. The `_flatten_for_frontend()` pipeline in `gold_agent.py` already maps gold agent output into `hypothesis.bull`, `hypothesis.bear`, `verdict`, `skew_score`, `key_metrics`, and `monitoring_trigger` fields at the top level of the `goldAgent` object. The standard ACH fields (`featuredMetrics`, `skew`, `verdict`, `hypotheses`) in the parent research JSON drive the home page tiles.

Data-level only: when merging gold agent output, ensure `featuredMetrics` in the research JSON includes AISC as one of the four displayed metrics (replacing the least informative standard metric). This is set during gold agent output merge, not at render time.

---

## 8. CSS Strategy

Follow existing report-section patterns. All new styles scoped under `.gold-` class prefix. Use CSS custom properties already defined in the report stylesheet (colours, spacing, typography). No new CSS file; styles added within the `renderGoldDiscovery` function following the pattern used by `renderTechnicalAnalysis` and other sections that inject their own styles.

---

## 9. Section Title

Standardise on **"Gold Analysis"** as the section heading (replacing the current mix of "Gold Agent Discovery" in `RS_HDR` and "Gold Discovery" in nav). Update both `renderSectionNav` and `renderGoldDiscovery` to use this label.

---

## 10. Files Modified

| File | Change |
|------|--------|
| `src/pages/report.js` | Insert Section 09 after Section 02 when `data.goldAgent` present |
| `src/pages/report-sections.js` | Expand `renderGoldDiscovery` with 6 sub-panel renderers; update `renderSectionNav` link ordering and label |
| `data/reference.json` | Add SNX entry |
| `data/research/_index.json` | Add SNX entry |
| `data/research/OBM.json` | Merge `goldAgent` output |
| `data/research/WIA.json` | Merge `goldAgent` output |
| `data/research/SNX.json` | Create via scaffold, merge `goldAgent` output |

No new files created. All rendering code added to existing `report-sections.js`.

---

## 11. Backward Compatibility

The existing `renderGoldDiscovery` handles both raw and flattened schemas with fallback chains (e.g. `ga.verdict || ga.executive_summary`, `ga.hypothesis.bull || ga.investment_view.bull_case`). The expanded renderer must preserve these fallbacks to remain compatible with the three existing gold stocks (NST, EVN, WAF) whose stored format may use either variant.

---

## 12. Testing

- All six gold stocks (NST, EVN, WAF, OBM, WIA, SNX) render Gold Analysis section
- Standard stocks (e.g. BHP, CBA) do not render Gold Analysis section
- Each sub-panel gracefully omitted when its data is absent
- Existing 157 Vitest tests pass without modification
- Manual verification on dev server: section ordering correct for gold vs standard stocks
- Build succeeds (`npm run build`)

---

## 13. Implementation Phases

**Phase 1:** Stock onboarding (SNX scaffold, verify OBM/WIA)
**Phase 2:** Gold agent execution (run against OBM, WIA, SNX; merge output)
**Phase 3:** Research page enhancement (expand renderGoldDiscovery, reorder sections, update nav)

Phases are sequential; each depends on the prior.
