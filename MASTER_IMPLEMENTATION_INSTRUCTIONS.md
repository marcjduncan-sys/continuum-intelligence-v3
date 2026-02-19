# Continuum Intelligence v2: Master Implementation Instructions

**Date:** 19 February 2026
**Status:** AUTHORITATIVE. This document supersedes ALL previous instruction sets, phase sequences, and developer briefs. If you have read prior instructions from earlier sessions, discard them. Follow this document only.

---

## Read Order

Read these specification documents in this exact order before writing any code:

1. **SECTION02_REDESIGN.md** – The three-layer narrative architecture. This is the intellectual foundation. It defines how macro, sector, and company layers combine into a weighted composite sentiment. All formulas, thresholds, and display specs are here.

2. **ASX200_SECTOR_NARRATIVE_MODELS.md** – Complete sector/sub-sector taxonomy for the entire ASX 200. Every GICS classification has a Narrative Model with factor mappings, data sources, default weights, threshold tables, and breakeven applicability. The onboarding process for adding any new stock is at the end.

3. **NARRATIVE_FRAMEWORK_V3.md** – The ACH (Analysis of Competing Hypotheses) methodology that governs the company-level (Layer 2) hypothesis scoring. Disconfirmation-based ranking, evidence matrix, rows-before-columns evaluation, price-as-evidence rules, overcorrection detection.

4. **DEV1_V2_TA_INTEGRATION.md** – Technical implementation spec for the price-as-evidence engine, volume confirmation, technical level integration, and the daily recalculation pipeline.

5. **NARRATIVE_TIMELINE_SPEC.md** – The narrative timeline visualisation. Daily history logging schema and chart specification.

6. **COMPETING_HYPOTHESES_BRIEF.md** – Visual/UI fixes for the hypothesis display (floating point errors, colour coding).

**Hierarchy rule:** Where any document conflicts with another, the higher-numbered document in this list loses. SECTION02_REDESIGN.md wins on all matters of architecture, formulas, and weights. NARRATIVE_FRAMEWORK_V3.md wins on all matters of ACH methodology and evidence evaluation. The two do not conflict because SECTION02_REDESIGN governs the three-layer structure and composite calculation, while NARRATIVE_FRAMEWORK_V3 governs how the company-level hypotheses (Layer 2 only) are scored internally.

**Superseded documents (do NOT follow these):**
- THESIS_SKEW_MATHEMATICAL_FIX.md – replaced by the composite sentiment calculation in SECTION02_REDESIGN.md
- SECTOR_OVERLAY_FRAMEWORK.md – replaced by ASX200_SECTOR_NARRATIVE_MODELS.md
- NARRATIVE_ENGINE_BRIEF.md – replaced by NARRATIVE_FRAMEWORK_V3.md + SECTION02_REDESIGN.md combined
- Any prior "Phase 1-7" instruction sets from earlier sessions

**Errata chain (apply in order, later errata supersede earlier):**
- ERRATA_001_MACRO_WEIGHTS.md – compresses Macro Signal to -50/+50, reduces w_macro across all stocks
- ERRATA_002_IDIO_AMPLIFICATION.md – establishes the 40/60 rule (external cap 40%, research floor 60%), four-component weights, sqrt Idio Signal amplification, technical signal placeholder at w_tech = 0.10. **This is the authoritative weight table.**

---

## What You Are Building

A narrative intelligence engine that works like an institutional quant desk's factor attribution model, but applied to narratives instead of returns. Every stock in the ASX 200 coverage universe gets a daily-updated sentiment score decomposed into three layers:

```
Overall_Sentiment = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_tech x Tech_Signal) + (w_company x Company_Signal)

Where:
  w_macro + w_sector + w_tech + w_company = 1.0
  w_macro + w_sector + w_tech <= 0.40     (external cap – the 40/60 rule)
  w_company >= 0.60                        (research floor)
  Macro_Signal ranges -50 to +50
  Sector_Signal ranges -100 to +100
  Tech_Signal ranges -50 to +50 (= 0 until TA agent live, w_tech = 0.10 reserved)
  Company_Signal ranges -80 to +80 (sqrt-amplified from T1-vs-T2 dominance)
  Overall_Sentiment ranges approx -80 to +80
  Weights are stock-specific, per ERRATA_002_IDIO_AMPLIFICATION.md
```

This replaces the current broken bull-minus-bear summation that produced the WDS -42 DOWNSIDE contradiction.

---

## Phase 1: Data Infrastructure

**Goal:** Build the data pipeline that feeds all three narrative layers. Nothing else works without this.

### Step 1.1: Macro/Sector Factor Data Fetcher

Create `scripts/fetch-macro-factors.js` (or Python equivalent).

This script runs daily at 06:30 AM AEST (before the main pipeline) and produces `data/macro-factors.json`.

**Automated daily fetches (Yahoo Finance API or yfinance):**

| Factor | Ticker | Used By |
|--------|--------|---------|
| ASX 200 | ^AXJO | All stocks (macro layer) |
| Brent Crude | BZ=F | Energy stocks |
| WTI Crude | CL=F | Energy stocks |
| Iron Ore 62% Fe | TIO=F | Iron ore miners |
| Gold USD | GC=F | Gold miners |
| Copper LME | HG=F | Copper miners |
| Aluminium | ALI=F | Aluminium stocks |
| Natural Gas | NG=F | Energy, chemicals |
| AUD/USD | AUDUSD=X | All internationally exposed |
| US 10yr yield | ^TNX | Tech, growth stocks |
| NASDAQ | ^IXIC | Tech/SaaS stocks |
| VIX | ^VIX | All stocks (risk sentiment) |

**Derived calculations (compute after fetching):**
- Gold AUD = GC=F / AUDUSD=X
- AU yield curve 2s10s = AU 10yr minus AU 2yr (source: RBA, or proxy)
- Each factor needs: close, change_5d (%), change_20d (%)

**Semi-automated (update when published, store in same file):**
- RBA cash rate and trajectory (event-driven)
- AU 10yr bond yield (RBA)
- China manufacturing PMI (monthly, NBS)
- Consumer confidence (monthly, Westpac-Melbourne Institute)
- AU unemployment rate (monthly, ABS)
- System credit growth (monthly, APRA)
- Thermal coal price (weekly, manual)
- Coking coal price (weekly, manual)
- Uranium spot price (weekly, manual)
- Lithium spodumene/carbonate (weekly, manual)

**Output schema:** See the `data/macro-factors.json` specification in ASX200_SECTOR_NARRATIVE_MODELS.md. Copy that schema exactly.

**Missing data handling:** If a fetch fails, use prior day's value and set `"stale": true`. If stale > 5 trading days, degrade that stock's sector weight by 50% (redistribute to idiosyncratic) and display an amber warning.

### Step 1.2: Stock Configuration Files

For each stock in the coverage universe, create or update `data/stocks/{TICKER}.json` to include:

```json
{
  "ticker": "WDS",
  "name": "Woodside Energy Group",
  "gics_sub_industry": "Oil & Gas Exploration & Production",
  "narrative_model": "ENERGY_OIL_GAS",
  "narrative_weights": {
    "macro": 0.15,
    "sector": 0.55,
    "idio": 0.30
  },
  "commodity_overlay": {
    "primary_commodity": "brent",
    "breakeven": 35,
    "breakeven_unit": "USD/boe",
    "breakeven_source": "FY25 annual report",
    "breakeven_confidence": "HIGH",
    "sensitivity": "+$1/bbl Brent ≈ +$180M FCF",
    "thresholds": {
      "strong_bearish": 45,
      "bearish": 60,
      "neutral": 75,
      "bullish": 90
    }
  },
  "hypotheses": [
    {
      "id": "H1",
      "name": "LNG Growth",
      "sentiment": "BULLISH",
      "survival_score": 29,
      "rank": 1
    }
  ]
}
```

Use the Narrative Model assignments from ASX200_SECTOR_NARRATIVE_MODELS.md. Look up each stock's GICS sub-industry, map to the corresponding model, and populate the config with that model's default weights, threshold table, and breakeven configuration.

**CRITICAL – Revised weights (Errata 001):** The default weights in ASX200_SECTOR_NARRATIVE_MODELS.md and SECTION02_REDESIGN.md have been superseded. Use ERRATA_001_MACRO_WEIGHTS.md for the authoritative weight table. Key principle: w_macro never exceeds 0.15 for any stock. Company-dominant stocks (DRO, PME, GYG, SIG, OCL, RFG) use w_macro = 0.05, w_sector = 0.03-0.05, w_idio = 0.90-0.92. The macro layer is context, not a driver.

**For the existing 18 coverage stocks:** Update their existing JSONs with the new fields.
**For new stocks being added:** Follow the onboarding process at the end of ASX200_SECTOR_NARRATIVE_MODELS.md.

### Step 1.3: Daily History Logging

Create the history logging function immediately. For each stock, append a daily snapshot to `data/stocks/{TICKER}-history.json` containing:

```json
{
  "date": "2026-02-19",
  "price": 25.40,
  "daily_change_pct": -1.2,
  "volume_ratio": 1.15,
  "macro_signal": 15,
  "sector_signal": 34,
  "idio_signal": 5,
  "overall_sentiment": 23,
  "hypotheses": [
    { "id": "H1", "name": "LNG Growth", "sentiment": "BULLISH", "survival_score": 29, "rank": 1 }
  ],
  "dominant_narrative": "H1",
  "narrative_flip": false,
  "events": [],
  "overcorrection_active": false,
  "reconstructed": false
}
```

Wire this into the daily GitHub Action. Every day without logging is lost data. Start immediately.

### Step 1.4: 60-Day Backfill

Use historical price data to retroactively calculate what scores would have been. Run the price-as-evidence classification rules backwards through 60 days of daily prices. Mark all backfilled entries with `"reconstructed": true`. This gives charts initial shape.

**Commit and push Phase 1 before proceeding.**

---

## Phase 2: Three-Layer Signal Calculators

**Goal:** Build the three signal calculators that produce the composite sentiment.

### Step 2.1: Macro Signal Calculator

Create `scripts/calc-macro-signal.js`.

Inputs: `data/macro-factors.json`
Output: A single Macro_Signal value from -100 to +100, stored in each stock's JSON.

**Calculation (revised per Errata 001 – compressed range):**
```
ASX 200 momentum score:
  20d return > +8%   → +15
  20d return +3-8%   → +8
  20d return -3-+3%  → 0
  20d return -8--3%  → -8
  20d return < -8%   → -15

Risk sentiment score:
  VIX < 13           → +8
  VIX 13-18          → +4
  VIX 18-25          → 0
  VIX 25-32          → -8
  VIX > 32           → -15

AUD direction score:
  AUD 20d change > +5%  → +7
  AUD 20d change -5-+5% → 0
  AUD 20d change < -5%  → -7

RBA policy score:
  Cutting aggressively (>75bp remaining) → +8
  Cutting gradually (25-75bp remaining)  → +4
  On hold                                → 0
  Hiking                                 → -8

China PMI score:
  PMI > 52   → +7
  PMI 50-52  → +4
  PMI 48-50  → -4
  PMI < 48   → -10

Macro_Signal = ASX_score + Risk_score + AUD_score + RBA_score + China_score
Capped at -50 and +50.  (NOT -100/+100. Macro is context, not conviction.)
```

**Calibration check:** Normal benign conditions (ASX +3%, VIX 19, AUD +4%, RBA cutting gradually, PMI 50.5) should produce Macro_Signal of +12 to +18. If it produces >25, the bands are too generous. Only genuine extremes (GFC, dot-com peak) should push beyond +/-35.

The Macro Signal is the same for all stocks on any given day. Calculate once, apply everywhere.

### Step 2.2: Sector Signal Calculator

Create `scripts/calc-sector-signal.js`.

Inputs: `data/macro-factors.json`, each stock's `narrative_model` and `commodity_overlay` config.
Output: A Sector_Signal value from -100 to +100, specific to each stock.

**For commodity stocks (models with breakeven = Yes):**

```
Step A: Calculate position_score from current price vs threshold table.
  Read the stock's thresholds from config.
  Map current commodity price to zone:
    Below strong_bearish threshold → -80
    Between strong_bearish and bearish → -30
    Between bearish and neutral → 0
    Between neutral and bullish → +40
    Above bullish → +70
  (Interpolate linearly within zones for precision.)

Step B: Calculate momentum_score.
  momentum_score = (5d_return * 0.4 + 20d_return * 0.6) * 1000
  Cap at -50 and +50.

Step C: Combine.
  Sector_Signal = position_score * 0.7 + momentum_score * 0.3
  Cap at -100 and +100.
```

**For rate-sensitive stocks (banks, insurers, REITs):**

```
Rate trajectory score:
  Cutting aggressively (>75bp priced) → +40
  Cutting gradually (25-75bp priced) → +25
  On hold → 0
  Hiking gradually → -25
  Hiking aggressively → -40

Yield curve score (2s10s spread):
  > +100bp → +30
  +50 to +100bp → +15
  0 to +50bp → 0
  -50 to 0bp → -20
  < -50bp → -35

Credit growth score (system YoY):
  > +8% → +30
  +4 to +8% → +15
  0 to +4% → 0
  -4 to 0% → -20
  < -4% → -30

Sector_Signal = Rate_score * 0.40 + Curve_score * 0.30 + Credit_score * 0.30
```

**IMPORTANT for REITs:** The rate sensitivity is INVERTED. Rising yields are bearish for REITs, bullish for banks (NIM expansion). The REIT models in ASX200_SECTOR_NARRATIVE_MODELS.md specify this. Multiply the Rate_score by -1 for REIT stocks.

**For tech/SaaS stocks:**

```
NASDAQ momentum score:
  20d return > +10% → +50
  20d return +3-10% → +20
  20d return -3-+3% → 0
  20d return -10--3% → -20
  20d return < -10% → -50

US 10yr yield direction score:
  Yield falling > 20bp (1mo) → +25 (growth discount rate falling)
  Yield stable → 0
  Yield rising > 20bp (1mo) → -25 (growth multiples compressing)

Sector_Signal = NASDAQ_score * 0.65 + Yield_score * 0.35
```

**For diversified miners (BHP, RIO, S32):**

Use the `revenue_commodity_split` from the stock's config. Calculate the Sector Signal for each commodity sub-model, then blend:

```
Sector_Signal = sum(commodity_weight_i x Commodity_Signal_i)
```

Example for BHP: 0.50 x Iron_Ore_Signal + 0.25 x Copper_Signal + 0.15 x Coal_Signal + 0.10 x Other

**For COMPANY_DOMINANT model stocks (PME, CSL, DRO, GYG, etc.):**

Sector_Signal = 0 (or a minimal contribution from the broad sector index). These stocks are driven by idiosyncratic factors. The low w_sector weight (0.05-0.15) ensures the sector layer contributes almost nothing to the composite.

### Step 2.3: Idiosyncratic Signal Calculator (Company Hypotheses)

Create `scripts/calc-idio-signal.js`.

Inputs: Each stock's hypothesis array (survival scores and sentiments).
Output: An Idio_Signal value from -100 to +100.

**Calculation (T1-vs-T2 dominance method):**

```
T1 = highest-scoring hypothesis
T2 = second-highest hypothesis
T1_lead = T1.survival_score - T2.survival_score
max_possible_lead = 75  (ceiling 80 minus floor 5)

if T1.sentiment == "BULLISH":
    Idio_Signal = +(T1_lead / max_possible_lead) * 100
elif T1.sentiment == "BEARISH":
    Idio_Signal = -(T1_lead / max_possible_lead) * 100
elif T1.sentiment == "NEUTRAL":
    Idio_Signal = 0

Cap at -80 and +80.
```

This replaces the old bull-minus-bear summation. The T1-vs-T2 dominance method correctly handles asymmetric hypothesis counts (e.g. 1 bullish vs 3 bearish hypotheses) without the -42 error.

### Step 2.4: Composite Sentiment Calculator

Create `scripts/calc-composite-sentiment.js`.

Inputs: Macro_Signal, Sector_Signal, Idio_Signal, stock's narrative_weights.
Output: Overall_Sentiment value from -100 to +100.

```
Overall_Sentiment = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_idio x Idio_Signal)

Round to nearest integer.

Display mapping:
  > +30   → STRONG UPSIDE (dark green)
  +10-+30 → UPSIDE (green)
  -10-+10 → NEUTRAL (amber)
  -30--10 → DOWNSIDE (red)
  < -30   → STRONG DOWNSIDE (dark red)

Also store the contribution breakdown:
  macro_contribution = round(w_macro x Macro_Signal)
  sector_contribution = round(w_sector x Sector_Signal)
  idio_contribution = round(w_idio x Idio_Signal)
```

**Verification test after building:** Run WDS with these inputs:
- Macro_Signal: +16 (mildly positive – ASX up, RBA cutting)
- Sector_Signal: +34 (Brent $72.40, breakeven $35, 107% margin, but declining 1mo)
- Idio_Signal: +5 (T1 BULLISH 29% vs T2 BEARISH 25%)
- Weights: 0.10 / 0.55 / 0.35

Expected output: Overall_Sentiment = (0.10 x 16) + (0.55 x 34) + (0.35 x 5) = 1.6 + 18.7 + 1.75 = +22 (UPSIDE, green)
Contribution: Macro (+2) | Sector (+19) | Company (+2). Sector is 83% of total. Correct for a pure-play LNG producer.

**Second verification test:** Run DRO with these inputs:
- Macro_Signal: +16
- Sector_Signal: 0 (defence budget is structural, not cyclical)
- Idio_Signal: +5 (T1 BULLISH 29% vs T2 26%, narrow lead)
- Weights: 0.05 / 0.03 / 0.92

Expected output: Overall_Sentiment = (0.05 x 16) + (0.03 x 0) + (0.92 x 5) = 0.8 + 0 + 4.6 = +5 (NEUTRAL, amber)
Contribution: Macro (+1) | Sector (0) | Company (+5). Company is 83% of total. Correct for a contract-driven defence company.

**Failure condition:** If DRO shows Macro contributing >25% of total sentiment, the weights are wrong. If WDS shows Macro contributing >15% of total, the weights are wrong.

**Commit and push Phase 2.**

---

## Phase 3: Price-as-Evidence Engine

**Goal:** Make hypothesis survival scores responsive to daily market data. This is what makes the company layer (Layer 2) dynamic.

### Step 3.1: Daily Price Classification

Create `scripts/price-evidence-engine.js`.

For each stock daily:

```
Daily move classification:
  Within +/- 2%  → NOISE (no evidence item)
  +/- 2% to 5%  → NOTABLE (score adjustment +/- 2)
  +/- 5% to 10% → SIGNIFICANT (score adjustment +/- 5)
  Beyond +/- 10% → MATERIAL (score adjustment +/- 10, mandatory review flag)
```

"Aligned hypotheses" means:
- Negative price move → increase BEARISH hypothesis scores, decrease BULLISH
- Positive price move → increase BULLISH hypothesis scores, decrease BEARISH
- NEUTRAL hypotheses unaffected unless move > 10% (then half adjustment)

### Step 3.2: Volume Confirmation

All score adjustments are multiplied by a volume factor:

```
Volume vs 20-day average:
  > 200%    → 2.0x
  150-200%  → 1.5x
  80-150%   → 1.0x
  50-80%    → 0.7x
  < 50%     → 0.3x
```

### Step 3.3: Cumulative Move Detection

Track rolling windows:

```
5-day cumulative beyond +/- 10%  → Short-term dislocation, amplify daily by 1.5x
20-day cumulative beyond +/- 20% → Structural shift, flag for narrative re-evaluation
60-day cumulative beyond +/- 30% → Secular trend change, full recalibration
```

### Step 3.4: Results Day Amplifier

When a stock reports earnings (detect via events calendar):

```
Results day move > 5% drop  → BEARISH hypotheses +8, BULLISH -5
Results day move > 5% rise  → BULLISH +8, BEARISH -5
Results day move +/- 2%     → In-line, confirms T1, no change
Results day move 2-5%       → Standard daily classification
```

Results-day evidence gets 2x weight (higher information content).

### Step 3.5: Evidence Matrix Evaluation

When new evidence arrives (price or otherwise), evaluate it against ALL hypotheses before updating scores. This is the rows-before-columns rule from ACH methodology.

For each evidence item:
1. Score as C (Consistent), I (Inconsistent), or N (Neutral) against every hypothesis
2. Update inconsistency counts
3. Recalculate survival scores
4. Normalise: scores sum to 100, floor 5, ceiling 80
5. Re-rank: highest score = T1
6. If T1 changed, log as narrative flip

### Step 3.6: Score Normalisation

After all adjustments every cycle:

```
1. Apply evidence-based adjustments to raw scores
2. Enforce floor (5) and ceiling (80)
3. Normalise: score_i = (score_i / sum_all_scores) * 100
4. Re-rank hypotheses by score descending
5. If T1 changed → log narrative flip with trigger evidence
6. Calculate Idio_Signal from new T1/T2 scores
7. Recalculate Overall_Sentiment
```

**Commit and push Phase 3.**

---

## Phase 4: Overcorrection Detection

**Goal:** Detect when markets overcorrect and flag it without blindly chasing momentum.

### Step 4.1: Triggers

Assess overcorrection when:
- Single-day move > 10%
- 5-day cumulative > 15%
- Price move > 2x estimated fundamental impact

### Step 4.2: Amber Evidence Items

When overcorrection detected, generate an AMBER evidence item (not bullish, not bearish). This is a monitoring flag, not a signal reversal. The price evidence still stands.

### Step 4.3: 5-Day Review

```
After 5 trading days:
  > 50% reversed  → Confirm overcorrection, increase mean-reversion weight
  25-50% reversed → Inconclusive, extend 5 days
  < 25% reversed  → Fundamental, remove flag, add +3 to aligned hypotheses
```

### Step 4.4: Display

Amber banner on stock page when active: "Potential overcorrection detected – price move of X% may exceed fundamental impact. Monitoring for mean reversion."

**Commit and push Phase 4.**

---

## Phase 5: Display and UI

**Goal:** The frontend accurately represents the three-layer architecture.

### Step 5.1: Macro Context Bar (Layer 0)

At the top of every stock page:

```
MACRO: [LABEL] | ASX [+X.X%] (1mo) | AUD [X.XXXX] | RBA [X.XX%] ([trajectory])
```

Colour: Green if Macro_Signal > +15, Red if < -15, Amber otherwise.
This is identical across all stock pages on a given day.

### Step 5.2: Sector Narrative Panel (Layer 1)

Below the macro bar, above company hypotheses. Content varies by Narrative Model.

**For commodity stocks:** Show commodity prices with 5d/1mo changes, operating leverage gauge (breakeven vs current price with margin and sensitivity), sector signal with contribution.

**For rate-sensitive stocks:** Show RBA rate, 10yr yield, yield curve, credit growth. Same signal and contribution format.

**For tech stocks:** Show NASDAQ momentum, US 10yr direction. Same format.

**For COMPANY_DOMINANT stocks:** Minimal panel. One-line sector context only.

Display templates are fully specified in SECTION02_REDESIGN.md. Copy those layouts.

### Step 5.3: Company Hypotheses Panel (Layer 2)

The existing hypothesis display, now explicitly labelled as the idiosyncratic layer.

Fix all existing display issues:
- Round all percentages to 1 decimal max (no floating point errors like 38.999999%)
- Colour code: BULLISH = green, BEARISH = red, NEUTRAL = amber
- T1 visually prominent (larger card, bolder)
- Each hypothesis shows: name, sentiment colour, score%, directional arrow (vs prior day)
- T1 additionally shows: "What would change" trigger
- Plain English one-line summary per hypothesis

### Step 5.4: Composite Sentiment Display

Replace the current broken thesis skew display with:

```
OVERALL SENTIMENT: +23 UPSIDE (green)

████░░ Macro (+2) | ████████████░░ Sector (+19) | ██░░ Company (+2)
```

The contribution bar shows visually how much each layer is contributing. The user immediately sees that for WDS, the sector (oil prices) is doing most of the work.

### Step 5.5: Evidence Section

Each evidence item shows:
- Date
- Description (plain English)
- Sentiment: red/green/amber bullet
- Diagnosticity badge: HIGH / MEDIUM / LOW
- Source badge: STATUTORY / PRICE / ANNOUNCEMENT / COMMODITY / BROKER / MANAGEMENT

Sort by diagnosticity (HIGH first), then recency.

### Step 5.6: Research vs Market Divergence

```
Research View: [from non-price evidence] %
Market View:   [from price evidence] %
Divergence:    [difference] points

If divergence > 10 points → amber flag: "Research and market views diverging materially"
```

### Step 5.7: Narrative History

Show last 5 T1 changes:
```
[Date]: T1 changed from [old] to [new]
        Trigger: [evidence item]
```

**Commit and push Phase 5.**

---

## Phase 6: Narrative Timeline Chart

**Goal:** Visualise how competing hypotheses evolve over time.

### Step 6.1: Multi-Line Chart

One line per hypothesis, coloured by sentiment (green/red/amber). Y-axis: survival score (0-80). X-axis: time. Use Chart.js or equivalent.

Place below the Competing Hypotheses section.

### Step 6.2: Three-Layer Stacked Contribution Chart

A secondary chart showing the Macro/Sector/Company contributions to Overall Sentiment over time. Three coloured areas stacked. The user sees: "In February, commodity tailwind drove the sentiment. In March, it reversed."

### Step 6.3: Annotations

- Vertical dashed lines at narrative flip points, labelled "T1: [Old] → [New]"
- Event markers: Earnings (E), Announcements (A), Material price moves (P), Overcorrection (O)
- Clickable: shows date, scores, trigger, price/volume on that day

### Step 6.4: Controls

Time range buttons: 30D, 90D, 6M, 1Y, All.
Toggle lines on/off via legend.
Mobile: simplify to T1 and T2 lines only.

**Commit and push Phase 6.**

---

## Phase 7: Daily Pipeline Automation

**Goal:** Everything runs automatically, every trading day.

### Step 7.1: GitHub Action Schedule

Daily at 06:30 AM AEST (UTC+11):

```
1. Run fetch-macro-factors.js
   → Produces data/macro-factors.json with all commodity/macro/FX data

2. Run fetch-prices.js (existing)
   → Updates data/live-prices.json with ASX stock prices

3. For each stock in coverage universe:
   a. Run calc-macro-signal.js → Macro_Signal
   b. Run calc-sector-signal.js → Sector_Signal
   c. Run price-evidence-engine.js → classify daily move, update evidence, adjust hypothesis scores
   d. Run score normalisation → renormalise, re-rank, check for flips
   e. Run calc-idio-signal.js → Idio_Signal from updated T1/T2
   f. Run calc-composite-sentiment.js → Overall_Sentiment with contributions
   g. Check overcorrection conditions → flag or resolve
   h. Append daily snapshot to {TICKER}-history.json

4. Commit all updated JSONs
5. Trigger site rebuild
```

### Step 7.2: TA Signal Ingestion Interface

Build the interface for external technical analysis signals. Read from `data/ta-signals/{TICKER}.json` if files exist. Incorporate as evidence items in the hypothesis scoring. Feature flag to enable/disable.

Signal schema (from DEV1_V2_TA_INTEGRATION.md):
```json
{
  "source": "ta_agent",
  "ticker": "WOW",
  "date": "2026-02-19T16:00:00+11:00",
  "signals": [
    {
      "type": "technical_signal",
      "indicator": "RSI_14",
      "value": 28.3,
      "interpretation": "OVERSOLD",
      "confidence": 0.82,
      "description": "RSI(14) at 28.3, below 30 for 3 consecutive days",
      "sentiment": "BULLISH",
      "suggested_score_impact": 3
    }
  ]
}
```

### Step 7.3: Monthly Regression Calibration

On the 1st of each month, run the weight calibration regression for each stock with >= 60 trading days of history:

```python
R_stock = alpha + beta_mkt * R_ASX200 + beta_sector * R_sector_factor + epsilon

Partial R² decomposition:
  r2_mkt = R² from ASX 200 alone
  r2_sector = total R² - r2_mkt
  r2_idio = 1 - total R²

Normalise (floor 0.05 each component).
Blend with model defaults: final = 0.70 * regression + 0.30 * default.
Update narrative_weights in stock config.
```

Override rules:
- Never let w_macro + w_sector > 0.85 (min 15% idiosyncratic)
- Never let w_idio < 0.15
- If regression w_sector < 0.10 for a Tier 1 commodity stock, flag for manual review

**Commit and push Phase 7.**

---

## Adding New Stocks

When expanding the coverage universe (up to full ASX 200):

```
1. Look up stock's GICS sub-industry (ASX company directory CSV)
2. Map to Narrative Model using the table in ASX200_SECTOR_NARRATIVE_MODELS.md
3. Create stock config JSON with:
   - Narrative model assignment
   - Default weights from that model
   - Commodity overlay (if applicable)
   - Initial hypothesis set (4 hypotheses, stock-specific)
4. Add to the universe definition
5. If unusual or doesn't fit model → override weights, add notes, flag for regression
6. Run regression calibration when 60+ days of history exist
```

No bespoke analysis or architecture changes required per stock. The taxonomy handles it.

---

## Verification Gates

After each phase, verify on the live site before proceeding:

**Phase 1:** `data/macro-factors.json` exists and contains today's data. History files are being appended daily.

**Phase 2:** Run the WDS test case. Overall_Sentiment should be approximately +22 (UPSIDE), not -42. Run CBA – should reflect rate cycle. Run PME – should be dominated by company layer (~80% weight).

**Phase 3:** Create a test scenario: manually set a stock's daily change to -7%. Verify that BEARISH hypothesis scores increase and BULLISH scores decrease after the next pipeline run.

**Phase 4:** Create a test scenario: stock drops 12% in one day. Verify amber overcorrection banner appears.

**Phase 5:** No floating point display errors (no 38.999999%). Colours match sentiments. Contribution breakdown bar renders correctly.

**Phase 6:** Chart renders with at least 60 days of backfilled data. Hypothesis lines are correctly coloured by sentiment.

**Phase 7:** Pipeline runs end-to-end at 06:30 AM AEST. All JSONs updated. Site rebuilds. Total runtime under 5 minutes.

---

## What NOT to Build

- Do not build the full TA Agent (DEV2_TA_AGENT_SPEC.md) yet. That is a separate project.
- Do not build broker execution integration.
- Do not build backtesting infrastructure.
- Do not build intraday analysis.
- Focus exclusively on the daily-frequency three-layer narrative engine described above.

---

## Architecture Summary (one page)

```
                    ┌─────────────────────────────────┐
                    │     OVERALL SENTIMENT (+23)      │
                    │  = Macro + Sector + Company      │
                    └──────────┬──────────────────────┘
                               │
            ┌──────────────────┼──────────────────────┐
            │                  │                       │
    ┌───────▼────────┐ ┌──────▼──────────┐ ┌─────────▼──────────┐
    │  MACRO SIGNAL   │ │ SECTOR SIGNAL   │ │ IDIO SIGNAL        │
    │  (Layer 0)      │ │ (Layer 1)       │ │ (Layer 2)          │
    │                 │ │                 │ │                    │
    │  ASX 200        │ │ Commodity/Rate/ │ │ ACH Hypotheses     │
    │  VIX            │ │ FX factor       │ │ T1 vs T2 dominance │
    │  AUD/USD        │ │ specific to     │ │ Price-as-evidence  │
    │  RBA policy     │ │ each stock's    │ │ Volume confirmed   │
    │  China PMI      │ │ sector model    │ │ Overcorrection     │
    │                 │ │                 │ │                    │
    │  Same for all   │ │ Stock-specific  │ │ Stock-specific     │
    │  stocks daily   │ │ by GICS model   │ │ by evidence matrix │
    └─────────────────┘ └─────────────────┘ └────────────────────┘
            │                  │                       │
            │   w_macro        │   w_sector            │   w_idio
            │   (0.10-0.25)    │   (0.05-0.65)         │   (0.30-0.80)
            │                  │                       │
            └──────────────────┼───────────────────────┘
                               │
                    ┌──────────▼──────────────────────┐
                    │  WEIGHTS from regression         │
                    │  calibrated monthly              │
                    │  stock-specific                  │
                    └─────────────────────────────────┘

Data Pipeline (daily 06:30 AEST):
  macro-factors.json → calc-macro-signal
  macro-factors.json + stock config → calc-sector-signal
  live-prices.json + stock config → price-evidence-engine → score normalisation
  updated scores → calc-idio-signal
  all three signals + weights → calc-composite-sentiment
  append to history → commit → rebuild
```

---

## Start Here

Phase 1, Step 1.1. Build the macro/sector factor data fetcher. Show me the list of tickers you will fetch and the output schema before writing code.
