# Research JSON Schema — Data Contract

> **Single source of truth** for the stock research data format.
> Reverse-engineered from `index.html` rendering code and validated against BHP.json (gold standard).
> Every field listed here MUST be present in a fully-initiated research file.

---

## Quick Reference — Validation Rules

| # | Rule | Path | Constraint |
|---|------|------|-----------|
| 1 | `position_in_range.current_price` | `hero.position_in_range.current_price` | Numeric, > 0 |
| 2 | `position_in_range.worlds` | `hero.position_in_range.worlds` | Array of exactly 4 |
| 3 | World prices | `hero.position_in_range.worlds[i].price` | Numeric > 0 (parsed via `parseFloat()`) |
| 4 | World labels | `hero.position_in_range.worlds[i].label` | Non-empty string, descriptive (NOT "N1 Bull") |
| 5 | Verdict scores | `verdict.scores` | Array of exactly 4 |
| 6 | Score colours | `verdict.scores[i].scoreColor` | Non-empty, CSS variable `var(--signal-green)` etc. |
| 7 | Score values | `verdict.scores[i].score` | Parseable as int, all 4 sum to 90–110 |
| 8 | Identity rows | `identity.rows` | Length >= 5 |
| 9 | Hero metrics | `heroMetrics` | Length >= 5 |
| 10 | Featured metrics | `featuredMetrics` | Length >= 3 |
| 11 | Index return | `technicalAnalysis.relativePerformance.vsIndex.indexReturn` | Not 0 |
| 12 | Description length | `heroCompanyDescription` | Stripped HTML < 600 chars |
| 13 | Coverage rows | `gaps.coverageRows` | 10 rows, each has non-empty `confidenceClass` |
| 14 | Evidence cards | `evidence.cards` | 10 cards, `finding` length > 50 |
| 15 | Hypotheses | `hypotheses` | 4 items, each has `supporting[]` and `contradicting[]` |
| 16 | Price history | `priceHistory` | Array of >= 200 positive numbers |
| 17 | No mojibake | All strings | No `\u00e2\u0080` byte sequences |
| 18 | No emoji | All strings | No Unicode emoji codepoints |

---

## Section 1: Root Identity Fields

These appear at the top of every research file and drive the header bar.

| Field | Type | Required | Format / Example | Frontend Usage |
|-------|------|----------|-----------------|----------------|
| `ticker` | string | YES | `"BHP"` | Page title, URL routing |
| `tickerFull` | string | YES | `"BHP.AX"` | Identity table, Yahoo links |
| `exchange` | string | YES | `"ASX"` | Identity table |
| `company` | string | YES | `"BHP Group"` | Page title, cards |
| `sector` | string | YES | `"Materials"` | Card subtitle, index |
| `sectorSub` | string | YES | `"Iron Ore Mining"` | Identity table, hero |
| `price` | number | YES | `59.25` | Price display, range chart |
| `currency` | string | YES | `"A$"` | Prefixed to all price displays |
| `date` | string | YES | `"3 March 2026"` | Report header date |
| `reportId` | string | YES | `"BHP-2026-001"` | Footer reference |

---

## Section 2: Price History

Drives the sparkline chart and 200-day moving average overlay.

| Field | Type | Required | Format | Breaks If Wrong |
|-------|------|----------|--------|----------------|
| `priceHistory` | number[] | YES | `[38.06, 37.66, ...]` — minimum 200 entries | Chart renders thin (60-day) or empty. 200-day MA cannot compute if < 200 points. |

**Rules:**
- Each entry is a positive float (daily close price)
- Ordered oldest → newest
- Minimum 200 entries for 200-day MA
- Maximum ~365 entries (1 year)

---

## Section 3: Hero Section

The prominent hero banner with company description and key metrics sidebar.

### `heroDescription`

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `heroDescription` | string | YES | HTML with `&bull;` separators. E.g. `"~50% Iron Ore Revenue &bull; Global Copper Expansion"` |

### `heroCompanyDescription`

| Field | Type | Required | Format | Breaks If Wrong |
|-------|------|----------|--------|----------------|
| `heroCompanyDescription` | string | YES | HTML string, < 600 chars stripped | Overflows layout if too long |

### `heroMetrics`

Sidebar metric pills. Minimum 5 for parity with BHP.

| Field | Type | Required | Format | Breaks If Wrong |
|-------|------|----------|--------|----------------|
| `heroMetrics` | array | YES | Array of objects, length >= 5 | Sidebar looks sparse |

Each object:

| Key | Type | Required | Format | Example |
|-----|------|----------|--------|---------|
| `label` | string | YES | Short label | `"Fwd P/E"` |
| `value` | string | YES | Formatted value | `"~15x"`, `"A$301B"`, `"~5.5%"` |
| `colorClass` | string | YES (can be empty) | CSS class name | `""`, `"text-green"`, `"text-amber"` |

**Standard 5 items:** Mkt Cap, Fwd P/E, Div Yield, 52w High, 52w Low

---

## Section 4: Skew

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `skew.direction` | string | YES | One of: `"upside"`, `"downside"`, `"neutral"`, `"balanced"` |
| `skew.rationale` | string | YES | Plain text, 2-3 sentences |

---

## Section 5: Verdict

The coloured score bars showing hypothesis weights.

### `verdict.text`

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `verdict.text` | string | YES | HTML with `<strong>`, `<span class="key-stat">` for emphasis |
| `verdict.borderColor` | string\|null | NO | CSS colour or `null` |

### `verdict.scores`

Array of exactly 4 objects. **These render as coloured bars.**

| Key | Type | Required | Format | Breaks If Wrong |
|-----|------|----------|--------|----------------|
| `label` | string | YES | `"N1 Copper Supercycle"` | Bar unlabelled |
| `score` | string | YES | `"44%"` — parseable as int | Bar has no width |
| `scoreColor` | string | YES | CSS variable: `"var(--signal-green)"`, `"var(--signal-amber)"`, `"var(--text-muted)"` | **Bar has no colour (THE BUG)** |
| `dirArrow` | string | YES | HTML entity: `"&uarr;"`, `"&rarr;"`, `"&darr;"` | Arrow missing |
| `dirText` | string | YES | `"Building"`, `"Priced"`, `"Watching"`, `"Fading"` | Status text missing |
| `dirColor` | string\|null | NO | CSS variable or `null` | Falls back to default |

**Score colour mapping (from hypothesis direction):**
- `upside` / `bullish` → `"var(--signal-green)"`
- `neutral` → `"var(--signal-amber)"`
- `downside` / `bearish` → `"var(--text-muted)"`

**Score rules:**
- All 4 scores must be parseable as integers
- Sum should be approximately 100 (tolerance: 90–110)
- Score is normalised to 5–80% width range internally by the frontend

---

## Section 6: Featured Metrics (Home Page Card)

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `featuredMetrics` | array | YES | Array of objects, length >= 3 (ideally 4) |
| `featuredPriceColor` | string | NO | CSS variable or empty |
| `featuredRationale` | string | YES | Plain text, 1-2 sentences |

Each object:

| Key | Type | Required | Format | Example |
|-----|------|----------|--------|---------|
| `label` | string | YES | Short label | `"Div Yield"` |
| `value` | string | YES | Formatted | `"~5.5%"` |
| `color` | string | NO | CSS variable | `"var(--signal-green)"` or `""` |

**Standard 4 items:** Mkt Cap, Fwd P/E, Div Yield, Drawdown

---

## Section 7: Identity Snapshot

Two-column table with company financial details.

### `identity.rows`

Array of rows. Each row is a 2-element array of `[label, value, cssClass]` triples. Minimum 5 rows.

```json
[
  [["Ticker", "BHP.AX", "td-mono"], ["Exchange", "ASX", "td-mono"]],
  [["Market Cap", "A$301B", "td-mono"], ["Enterprise Value", "~A$280B", "td-mono"]],
  [["Share Price", "A$52.74", "td-mono"], ["52-Week Range", "A$34.16 &ndash; A$52.40", "td-mono"]],
  [["Forward P/E", "~15x", "td-mono"], ["EV/EBITDA", "~5.5x", "td-mono"]],
  [["Dividend (FY25)", "~US$1.46 (~5.5%)", "td-mono"], ["Payout Ratio", "~55% (min 50% policy)", "td-mono"]],
  [["Revenue (FY25)", "~US$55B", "td-mono"], ["Underlying EBITDA", "~US$27B", "td-mono"]],
  [["Net Debt", "~US$12B", "td-mono"], ["Gearing", "~25-30%", "td-mono"]],
  [["CEO", "Mike Henry (since 2020)", ""], ["Employees", "~80,000", "td-mono"]]
]
```

**Minimum rows for scaffold (pre-Claude):** 5 (Ticker/Exchange, MktCap/EV, Price/52w, P-E/EV-EBITDA, Div/Revenue)

### `identity.overview`

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `identity.overview` | string | YES | Plain text or light HTML. Company overview paragraph. |

---

## Section 8: Hypotheses

Array of exactly 4 hypothesis objects.

| Key | Type | Required | Format | Example |
|-----|------|----------|--------|---------|
| `tier` | string | YES | `"n1"`, `"n2"`, `"n3"`, `"n4"` | |
| `direction` | string | YES | `"upside"`, `"downside"`, `"neutral"` | |
| `title` | string | YES | `"N1: Copper Supercycle"` | |
| `statusClass` | string | YES | `"accumulating"`, `"priced"`, `"watching"`, `"minimal"` | |
| `statusText` | string | YES | `"Evidence Building"` | |
| `score` | string | YES | `"55%"` — parseable as int | |
| `scoreWidth` | string | YES | `"55%"` — same as score | |
| `scoreMeta` | string | YES | `"&uarr; Building"` — HTML entity + text | |
| `description` | string | YES | 2-5 sentence description | |
| `requires` | array\|null | NO | Array of strings or `null` | |
| `supportingLabel` | string | YES | `"Supporting Evidence"` | |
| `supporting` | string[] | YES | HTML-formatted evidence bullets | |
| `contradictingLabel` | string | YES | `"Contradicting Evidence"` or `"Mitigating Factors"` | |
| `contradicting` | string[] | YES | HTML-formatted evidence bullets | |

**Rules:**
- Exactly 4 hypotheses
- `supporting` and `contradicting` must be arrays with at least 1 item each
- Evidence bullets should use `<strong>Label:</strong>` prefix format
- Scores across all 4 should sum to approximately 100

---

## Section 9: Narrative

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `narrative.theNarrative` | string | YES | HTML, 6-10 sentences with `<strong>` and `<span class="key-stat">` |
| `narrative.priceImplication.label` | string | YES | `"Embedded Assumptions at A$52.74"` |
| `narrative.priceImplication.content` | string | YES | HTML with `<strong>` bullets |
| `narrative.evidenceCheck` | string | YES | HTML paragraph, 3-5 sentences |
| `narrative.narrativeStability` | string | YES | HTML paragraph, 3-5 sentences |

---

## Section 10: Evidence

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `evidence.intro` | string | YES | HTML, evidence hierarchy description |
| `evidence.cards` | array | YES | Array of 10 evidence card objects |
| `evidence.alignmentSummary` | any | NO | `null` or string |

### Evidence Card Object

| Key | Type | Required | Format |
|-----|------|----------|--------|
| `number` | int | YES | 1-10 |
| `title` | string | YES | `"1. Corporate Communications"` — HTML-encoded |
| `epistemicClass` | string | YES | CSS class: `"ep-motivated"`, `"ep-statutory"`, `"ep-consensus"`, `"ep-independent"`, `"ep-objective"`, `"ep-behavioural"`, `"ep-peerreviewed"`, `"ep-noise"`, `"ep-governance"`, `"ep-registry"` |
| `epistemicLabel` | string | YES | Human label: `"Motivated"`, `"Audited / Statutory"`, etc. |
| `finding` | string | YES | HTML, minimum 50 chars. `<strong>` for lead statement. |
| `tension` | string | YES | Plain text or HTML describing the counter-argument |
| `table` | any | NO | `null` or data table object |
| `tags` | array | YES | Array of `{text, class}` objects |
| `source` | string | YES | Source citations |

Tag classes: `"supports"`, `"contradicts"`, `"neutral"`, `"strong"`

---

## Section 11: Discriminators

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `discriminators.intro` | string | YES | Plain text |
| `discriminators.rows` | array | YES | Array of discriminator objects |
| `discriminators.nonDiscriminating` | string | NO | HTML with `<strong>` and `&bull;` |

### Discriminator Object

| Key | Type | Required | Format |
|-----|------|----------|--------|
| `diagnosticity` | string | YES | `"HIGH"`, `"MEDIUM"`, `"LOW"` |
| `diagnosticityClass` | string | YES | `"disc-high"`, `"disc-med"`, `"disc-low"` |
| `evidence` | string | YES | HTML description |
| `discriminatesBetween` | string | YES | `"N1 vs N3"` |
| `currentReading` | string | YES | Current status |
| `readingClass` | string | YES | `"td-green"`, `"td-amber"`, `"td-red"` |

---

## Section 12: Tripwires

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `tripwires.intro` | string | YES | Plain text |
| `tripwires.cards` | array | YES | Array of tripwire card objects (min 2) |

### Tripwire Card Object

| Key | Type | Required | Format |
|-----|------|----------|--------|
| `date` | string | YES | `"FEBRUARY 2026"` — uppercase month + year |
| `name` | string | YES | Short catalyst name |
| `conditions` | array | YES | Array of condition objects |
| `source` | string | YES | Source citation |

### Condition Object

| Key | Type | Format |
|-----|------|--------|
| `if` | string | `"If [scenario]"` |
| `valence` | string | `"positive"` or `"negative"` |
| `then` | string | `"Then [implication]"` |

---

## Section 13: Gaps (Coverage Assessment)

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `gaps.coverageRows` | array | YES | Array of 10 coverage row objects |
| `gaps.couldntAssess` | string[] | YES | HTML-formatted items |
| `gaps.analyticalLimitations` | string | YES | Plain text paragraph |

### Coverage Row Object

| Key | Type | Required | Format |
|-----|------|----------|--------|
| `domain` | string | YES | `"Corporate Comms"`, `"Regulatory Filings"`, etc. |
| `coverageLevel` | string | YES | CSS class: `"full"`, `"good"`, `"limited"` |
| `coverageLabel` | string | YES | `"Full"`, `"Good"`, `"Limited"` |
| `freshness` | string | YES | Date or period |
| `confidence` | string | YES | `"High (audited)"`, `"Medium (consensus range wide)"`, `"Low (narrative-driven)"` |
| `confidenceClass` | string | YES | CSS class: `"td-green"`, `"td-amber"`, `""` |

**Standard 10 domains:** Corporate Comms, Regulatory Filings, Broker Research, Competitor Data, Economic Data, Alternative Data, Academic Research, Media & Social, Governance, Ownership Data

---

## Section 14: Technical Analysis

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `technicalAnalysis.date` | string | YES | `"16 February 2026"` |
| `technicalAnalysis.period` | string | YES | `"1 Year"` |
| `technicalAnalysis.source` | string | YES | `"Continuum Technical Intelligence"` |
| `technicalAnalysis.regime` | string | YES | `"Uptrend"`, `"Downtrend"`, `"Range"` |
| `technicalAnalysis.clarity` | string | YES | `"Clear"`, `"Mixed"`, `"Unclear"` |
| `technicalAnalysis.price.current` | number | YES | Current price |
| `technicalAnalysis.price.currency` | string | YES | `"A$"` |
| `technicalAnalysis.movingAverages.ma50.value` | number | YES | 50-day MA |
| `technicalAnalysis.movingAverages.ma200.value` | number | YES | 200-day MA |
| `technicalAnalysis.relativePerformance.vsIndex.stockReturn` | number | YES | 12-month stock return % |
| `technicalAnalysis.relativePerformance.vsIndex.indexReturn` | number | YES | **MUST NOT be 0** — use ~6.5 default |
| `technicalAnalysis.relativePerformance.vsIndex.relativeReturn` | number | YES | stockReturn - indexReturn |

---

## Section 15: Hero Sub-Object (position_in_range)

This is nested under `hero.position_in_range`. Drives the scenario range chart.

| Field | Type | Required | Format | Breaks If Wrong |
|-------|------|----------|--------|----------------|
| `hero.position_in_range.current_price` | number | YES | `52.74` | Chart has no reference line |
| `hero.position_in_range.worlds` | array | YES | Exactly 4 world objects | Chart renders wrong |
| `hero.position_in_range.note` | string | NO | Explanatory note | |

### World Object

| Key | Type | Required | Format | Breaks If Wrong |
|-----|------|----------|--------|----------------|
| `label` | string | YES | Descriptive: `"Commodity Rout"`, `"China Drag"` — **NOT** `"N1 Bull"` | Meaningless labels |
| `price` | number | YES | `35` or `35.00` — **MUST be numeric** | `parseFloat()` returns `NaN`, bar has no position |
| `gap_pct` | number | NO | 0-1 float. Frontend ignores this — it calculates position from prices. | Not used by frontend |

**CRITICAL:** Frontend parses `price` via `parseFloat()`. String prices like `"$35.00"` will fail.
Frontend calculates bar position as: `((price - min) / (max - min)) * 100`

---

## Section 16: Footer

| Field | Type | Required | Format |
|-------|------|----------|--------|
| `footer.disclaimer` | string | YES | Standard disclaimer text |
| `footer.domainCount` | string | YES | `"10 of 10"` — must reflect actual `gaps.coverageRows` count |
| `footer.hypothesesCount` | string | YES | `"4 Active"` or `"4 Pending"` — must reflect actual hypotheses count |

---

## Section 17: Index File (`_index.json`)

The index is a lightweight version for the home page. Generated by stripping heavy fields.

**Included fields per ticker:**
`ticker`, `tickerFull`, `company`, `sector`, `price`, `currency`, `featuredMetrics`, `skew`, `hypotheses` (slim — no `supporting`/`contradicting`/`requires`)

**Excluded fields:** `evidence`, `narrative`, `identity.overview`, `technicalAnalysis`, `discriminators`, `tripwires`, `gaps`

**Size constraint:** Index must be < 30% of total research data size.

---

## Encoding Rules

1. **No emoji** — Remove all Unicode emoji codepoints from all string values
2. **No mojibake** — No `\u00e2\u0080` sequences (curly quote encoding errors)
3. **ASCII-safe HTML** — Use HTML entities for special characters: `&ndash;`, `&mdash;`, `&bull;`, `&uarr;`, `&darr;`, `&rarr;`, `&amp;`
4. **UTF-8 clean** — All files saved as UTF-8 without BOM

---

## Scaffold vs Initiated

A **scaffold** stock (pre-initiation) has placeholder data:
- `footer.hypothesesCount` = `"4 Pending"`
- `hypotheses[i].score` = `"?"`
- `heroMetrics` has only 3 items
- `identity.rows` has only 3-5 rows
- Verdict scores have `scoreColor: "var(--text-muted)"`

An **initiated** stock (post-Claude analysis) must pass all 18 validation rules above.

Deep validation checks (rules 1-18) apply only to initiated stocks.

---

## Section 18: System Control Fields

Fields prefixed with `_` are system-managed. They are not rendered in the UI and do not need to be present in scaffold files unless noted.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `_deepResearch` | boolean | NO | absent (false) | Controls inclusion in the Deep Research page. Set `true` on tickers with full deep research coverage. Omit entirely for scaffold and stub tickers -- absence is treated as false. |
| `_overcorrection` | object\|null | NO | `null` | Populated by `api/refresh.py` when a single-day price move exceeds the overcorrection threshold. |
| `_alertState` | string | NO | `"NORMAL"` | Alert state string, written alongside `_overcorrection`. Values: `"NORMAL"`, `"OVERCORRECTION"`. |
| `current_price` | number | NO | -- | Live price written by the `live-prices` workflow. Not present on scaffold files. |
| `last_price_update` | string | NO | -- | ISO 8601 timestamp of last live-price update. |
