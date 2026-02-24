# Continuum Intelligence v2 -- Quantitative Hypothesis Framework

## Master Specification for LLM Research Pipeline

Version: 2.0
Date: 21 February 2026
Status: Implementation-ready
Author: DH Capital Partners / Continuum Labs

---

## 1. Purpose and Contract

This document is the single authoritative specification for how Continuum Intelligence produces, derives, classifies, and displays hypothesis assessments for any stock. It replaces all prior qualitative approaches to hypothesis weighting and dominance labelling.

### 1.1 The Contract

The research pipeline produces exactly one output per stock: a **canonical hypothesis state** consisting of `n` weights summing to 1.0. Every metric, label, classification, and display element downstream is a deterministic derivation from this state. No component of the system may silently produce a different probability vector or override the canonical weights.

### 1.2 What This Replaces

The prior process assigned qualitative percentage weights (e.g., "34%") and subjective status labels (e.g., "Building") without formal rules for classification, dominance, or risk balance. This specification makes every output rule-driven and auditable.

---

## 2. Data Model

### 2.1 Stock Model (Root Object)

Every stock under coverage carries this structure. All fields are required unless marked optional.

```
StockModel {
  stock: {
    name: string               // "BHP Group"
    ticker: string             // "BHP.AX"
    exchange: string           // "ASX"
    sector: string             // "Materials"
    asOf: ISO date string      // "2026-02-16"
    price: string              // "A$53.33"
    currency: string           // "AUD"
  }
  hypotheses: Hypothesis[]     // minimum 3, maximum 6
  constructiveCodes: string[]  // codes of BULLISH + NEUTRAL hypotheses
  downsideCodes: string[]      // codes of BEARISH hypotheses
  tripwires: Tripwire[]        // minimum 2, no maximum
  evidence: EvidenceItem[]     // all assessed evidence
  meta: {
    hypothesisVintage: integer // version number, starts at 1
    vintageDate: ISO date      // date this hypothesis set was established
    priorVintageDate: ISO date | null
    domainsCovered: integer    // out of 10
    domainsTotal: 10
    analystNote: string | null // optional free-text on coverage status
  }
}
```

### 2.2 Hypothesis

```
Hypothesis {
  code: string                 // "T1", "T2", etc. Sequential.
  name: string                 // "Copper Supercycle" -- short, noun-phrase
  stance: "BULLISH" | "NEUTRAL" | "BEARISH"  // set at creation, does not change
  p: float                     // 0.0 < p < 1.0, canonical weight
  p_prior: float | null        // weight at prior assessment (for delta calculation)
  status: {
    label: string              // derived mechanically, see Section 4.4
    arrow: "UP" | "FLAT" | "DOWN"  // derived mechanically, see Section 4.4
  }
  short: string                // one-sentence thesis statement
  requires: string[]           // conditions that must hold for this thesis
  supportingEvidence: string[] // evidence item IDs
  contradictingEvidence: string[] // evidence item IDs
}
```

**Constraints:**
- `sum(p for all hypotheses) = 1.0` (enforce with normalisation; reject inputs where raw sum deviates from 1.0 by more than 0.01)
- Each `p_i > 0` (no hypothesis may have zero weight while active)
- `stance` is immutable after hypothesis creation. If a bearish thesis becomes the dominant narrative, it is still labelled BEARISH -- the weight rising is the signal, not a stance change.
- `code` values are sequential within a vintage. When a hypothesis is replaced, the new one takes the next available code (e.g., if T4 is retired, the replacement is T5, not a reused T4).

### 2.3 Evidence Item

```
EvidenceItem {
  id: string                   // unique, e.g., "e1", "e2"
  title: string                // descriptive summary of the evidence
  domain: EvidenceDomain       // one of the 10 domains (see Section 2.5)
  quality: "HIGH" | "MEDIUM" | "LOW"  // epistemic quality tag
  date: ISO date string        // date the evidence was observed or published
  dir: Record<string, -1 | 0 | 1>  // direction vs each hypothesis code
  contribution: Record<string, float> | null  // delta log-odds per hypothesis (engine-populated)
  source: string               // attribution
  freshness: "Current" | "Recent" | "Dated"  // Current = <30d, Recent = 30-90d, Dated = >90d
}
```

### 2.4 Tripwire

```
Tripwire {
  id: string
  timeframe: string            // "FEB 2026", "ONGOING", "Q3 CY2026"
  title: string                // descriptive name
  condition_good: string       // measurable constructive condition
  effect_good: string          // which hypothesis strengthens and why
  condition_bad: string        // measurable adverse condition
  effect_bad: string           // which hypothesis strengthens and why
  cadence: string              // monitoring frequency
  source: string               // data source for monitoring
  currentReading: string | null  // latest observed value (optional, for v2.1)
  proximity: "CLEAR" | "APPROACHING" | "AT_THRESHOLD" | "BREACHED" | null  // optional, for v2.1
}
```

### 2.5 Evidence Domains

Exactly 10 domains. Every evidence item must belong to exactly one. The hierarchy is fixed and determines the quality floor (an item's quality cannot exceed its domain ceiling).

| # | Domain | Code | Quality Ceiling | Nature |
|---|--------|------|----------------|--------|
| 1 | Regulatory Filings | `Regulatory` | HIGH | Statutory, audited, under oath |
| 2 | Economic Data | `Economic` | HIGH | Government statistics, market prices |
| 3 | Academic Research | `Academic` | HIGH | Peer-reviewed, base rates |
| 4 | Competitor Disclosures | `Competitor` | HIGH | Independent third-party filings |
| 5 | Broker Research | `Broker` | MEDIUM | Consensus, subject to conflicts |
| 6 | Leadership & Governance | `Governance` | MEDIUM | Board composition, ISS/Glass Lewis |
| 7 | Ownership & Capital Flows | `Ownership` | MEDIUM | Registry, substantial holders |
| 8 | Alternative Data | `Alternative` | MEDIUM | Satellite, shipping, web traffic |
| 9 | Corporate Communications | `Corporate` | LOW | Motivated, management-curated |
| 10 | Media & Social | `Media` | LOW | Noise, narrative-driven |

**Rule:** An evidence item from a LOW-ceiling domain (Corporate, Media) cannot be tagged HIGH quality. It can be tagged LOW or MEDIUM (if corroborated by an independent source). An item from a HIGH-ceiling domain can be tagged HIGH, MEDIUM, or LOW depending on specificity and timeliness.

---

## 3. Hypothesis Governance

### 3.1 Hypothesis Count

Minimum 3, maximum 6 per stock. The default is 4. Use 3 when the competitive narrative is genuinely three-sided. Use 5 or 6 only when a fourth or fifth thesis is independently diagnostic (not a variant of an existing hypothesis).

**Test for independence:** A hypothesis is independent if there exists at least one evidence item that is inconsistent with it but consistent with all other hypotheses. If no such item exists or can be reasonably anticipated, the hypothesis is not independent -- merge it with the nearest alternative.

### 3.2 Hypothesis Design Rules

1. **Mutually exclusive:** No two hypotheses may describe the same outcome. "Copper supercycle" and "electrification demand surge" are the same thesis -- merge them.
2. **Collectively exhaustive:** The hypothesis set must cover the plausible outcome space. If a reasonable investor could articulate a thesis not captured by the set, the set is incomplete.
3. **Stance assignment:** BULLISH = the thesis, if true, implies the stock is undervalued at the current price. NEUTRAL = fairly valued. BEARISH = overvalued or facing material downside. Stance is assigned once and does not change.
4. **Constructive/downside partition:** `constructiveCodes` = all BULLISH + NEUTRAL codes. `downsideCodes` = all BEARISH codes. This partition is mechanical from stance assignment -- no manual override.

### 3.3 Hypothesis Evolution (Vintage System)

Hypotheses are not permanent. When a genuinely new thesis emerges that is not captured by the existing set:

1. Retire the hypothesis with the lowest weight, provided it has been below 10% for two consecutive assessment periods.
2. If no hypothesis qualifies for retirement, expand the set by one (up to the maximum of 6).
3. Assign the new hypothesis the next sequential code (never reuse a retired code).
4. Increment `hypothesisVintage` by 1.
5. Record the `vintageDate`.
6. Re-normalise all weights to sum to 1.0.
7. The time series displays a visible version boundary at the vintage change.

**Retirement without replacement:** A hypothesis may be retired without adding a new one if the evidence conclusively disconfirms it (zero inconsistency count against all remaining hypotheses in the ACH matrix). Minimum hypothesis count of 3 still applies.

---

## 4. Derived Metrics (Formulae)

All formulae below take the canonical weights `p = [p_1, p_2, ..., p_n]` as sole input. Weights are always sorted descending (`p_1 >= p_2 >= ... >= p_n`) before computation. No formula modifies the weights.

### 4.1 Dominance Classification

**Inputs:**
- `p_1` = highest weight
- `p_2` = second highest weight
- `n` = number of active hypotheses
- `gap = p_1 - p_2`
- `HHI = sum(p_i^2 for all i)`
- `HHI_uniform = 1/n`
- `HHI_ratio = HHI / HHI_uniform`

**Classification (evaluate in order, first match wins):**

| Label | Condition | Decision Meaning |
|-------|-----------|-----------------|
| **Dominant** | `p_1 >= 2/n` AND `gap >= 0.15` | One thesis commands the narrative. High-conviction positioning possible. |
| **Contested** | `gap < 0.08` | Top two theses too close to distinguish. Do not overweight either. |
| **Diffuse** | `HHI_ratio < 1.06` | Near-uniform. Evidence has not separated the hypotheses. Wait for catalyst. |
| **Leading** | none of the above | Front-runner exists but hasn't broken away. Moderate conviction only. |

**Why these thresholds:**
- `2/n` scales the dominance bar with hypothesis count. For n=3 it requires 67%, for n=4 it requires 50%, for n=5 it requires 40%. A hypothesis must carry at least twice its fair share.
- `0.15` (15 points) is the minimum gap for high-conviction positioning regardless of `n`. This is a constant of the decision environment.
- `0.08` (8 points) is the minimum gap for meaningful differentiation. Below this, the difference is within the noise band of the scoring process.
- `1.06` means HHI is within 6% of uniform. The weights are effectively indistinguishable from "we don't know."

### 4.2 Conviction Score

Normalised Shannon entropy, inverted to measure information content.

```
H = -sum(p_i * ln(p_i) for all i)
H_max = ln(n)
conviction = 1 - (H / H_max)
```

Range: 0.0 (uniform, no information) to 1.0 (single hypothesis at 100%).

**Classification:**

| Conviction | Label | Decision Implication |
|-----------|-------|---------------------|
| < 0.05 | Uninformative | Evidence has not separated hypotheses. No basis for positioning. |
| 0.05 -- 0.15 | Low | Direction emerging. Monitor; do not position on hypothesis alone. |
| 0.15 -- 0.35 | Moderate | Meaningful separation. Position with hedges. |
| > 0.35 | High | Strong evidential separation. Supports high-conviction positioning. |

### 4.3 Risk Balance and Skew

```
constructive_mass = sum(p_i where hypothesis stance in {BULLISH, NEUTRAL})
downside_mass = sum(p_i where hypothesis stance = BEARISH)
skew = constructive_mass - downside_mass
skew_score = round(50 + 50 * skew)
```

`skew_score` range: 0 (all mass on bearish hypotheses) to 100 (all mass on constructive hypotheses). 50 = perfectly balanced.

**Classification:**

| Skew Score | Label |
|-----------|-------|
| >= 65 | Constructive |
| 55 -- 64 | Leaning Constructive |
| 45 -- 54 | Balanced |
| 36 -- 44 | Leaning Downside |
| <= 35 | Downside |

### 4.4 Momentum (Status Arrow and Label)

Requires `p_prior` (weight at the prior assessment period) for each hypothesis.

```
delta_p = p - p_prior
```

| Condition | Arrow | Label Options |
|-----------|-------|--------------|
| `delta_p > +0.03` | UP | Building, Strengthening |
| `delta_p < -0.03` | DOWN | Fading, Weakening |
| `abs(delta_p) <= 0.03` | FLAT | Stable, Priced, Watching |

**Label selection rules:**
- If arrow = UP and stance = BULLISH: "Building"
- If arrow = UP and stance = BEARISH: "Strengthening" (a bearish thesis gaining weight is alarming, not positive -- the label must not sound optimistic)
- If arrow = UP and stance = NEUTRAL: "Building"
- If arrow = DOWN and stance = BULLISH: "Fading"
- If arrow = DOWN and stance = BEARISH: "Fading"
- If arrow = DOWN and stance = NEUTRAL: "Fading"
- If arrow = FLAT and `p_1 = p` (this is the lead hypothesis): "Priced"
- If arrow = FLAT and stance = BEARISH: "Watching"
- If arrow = FLAT and not lead: "Stable"

For initial coverage where no prior exists, set `p_prior = 1/n` (uniform) for all hypotheses and apply the same rules. This is a deliberate design choice: initial coverage shows arrows reflecting deviation from a "no view" baseline. A stock where all hypotheses show FLAT on day one means the analyst assessed the evidence and concluded it is genuinely evenly distributed -- that is a meaningful signal, not a default state. Users should expect to see movement on initial coverage; it communicates that the analyst has formed a directional view from the evidence.

### 4.5 Transition Proximity

How close the current regime is to flipping (the lead hypothesis changing).

```
transition_proximity = max(0, min(1, 1 - (gap / 0.15)))
```

Range: 0.0 (gap >= 15 points, regime is stable) to 1.0 (gap = 0, regime change imminent).

**Classification:**

| Proximity | Label |
|----------|-------|
| < 0.3 | Stable |
| 0.3 -- 0.6 | Watchable |
| 0.6 -- 0.85 | Elevated |
| > 0.85 | Fragile |

### 4.6 Narrative Tension Indicator

A pattern-match on existing derived metrics that surfaces the single most decision-relevant structural signal. Displayed at the top of the Posterior Vector widget. No new calculations -- only combinations of metrics from Sections 4.1 through 4.5.

**Evaluate conditions in order. Display the first match only. If no condition matches, display nothing.**

| Priority | Condition | Label | Colour | Message Template |
|----------|-----------|-------|--------|-----------------|
| 1 | Lead hypothesis `p_1 >= 0.30` AND classification = Contested | CONTESTED LEAD | Amber | "[T1 name] leads at [X]% but [T2 name] is within [gap] points. Evidence does not support high-conviction positioning." |
| 2 | Lead hypothesis `delta_p > 0.03` (building) AND `transition_proximity > 0.60` | FRAGILE MOMENTUM | Amber | "[T1 name] is gaining weight but the regime is fragile. [Gap] point lead could flip on a single catalyst." |
| 3 | Lead hypothesis stance = BEARISH AND classification in {Dominant, Leading} | BEAR REGIME | Red | "A bearish thesis ([T1 name]) leads the evidence. Downside is the path of least resistance." |
| 4 | `conviction < 0.05` AND any hypothesis has `delta_p > 0.05` | RAPID SHIFT, LOW CONVICTION | Amber | "Evidence is moving fast but overall conviction remains low. [Tx name] surging on thin evidence base." |
| 5 | Classification = Dominant AND `conviction > 0.35` | CLEAR SIGNAL | Green | "Evidence strongly concentrated on [T1 name]. [Gap] point lead with high conviction." |
| 6 | None of the above | -- | -- | No indicator displayed. |

**Design rules:**
- Only one indicator fires at a time. No stacking.
- The indicator is a banner, not a tooltip. It must be visible before the user reads any hypothesis row.
- Amber = caution, the signal is structurally ambiguous. Red = warning, the evidence leans adversely. Green = confirmation, the signal is clear.
- Messages are generated mechanically from the template by substituting metric values and hypothesis names. No free-text analyst override.

**Acceptance tests:**
- BHP fixture [0.34, 0.30, 0.21, 0.15], classification = Contested, p_1 = 0.34 >= 0.30: fires CONTESTED LEAD. Message: "Copper Supercycle leads at 34% but Iron Ore Cash Machine is within 4 points. Evidence does not support high-conviction positioning."
- Fixture [0.55, 0.20, 0.15, 0.10], classification = Dominant, conviction = 0.38: fires CLEAR SIGNAL. Message: "Evidence strongly concentrated on [name]. 35 point lead with high conviction."
- Fixture [0.35, 0.33, 0.20, 0.12] where T1 stance = BEARISH, classification = Contested: fires CONTESTED LEAD (priority 1 beats priority 3).
- Fixture [0.40, 0.25, 0.20, 0.15] where T1 stance = BEARISH, classification = Leading: fires BEAR REGIME.
- Fixture [0.26, 0.25, 0.25, 0.24] where conviction = 0.001 and T3 delta_p = +0.06: fires RAPID SHIFT, LOW CONVICTION.
- Fixture [0.40, 0.25, 0.20, 0.15] where T1 stance = BULLISH, classification = Leading, conviction = 0.12: no indicator fires.

---

## 5. Widget Specifications

Four widgets render the canonical state. Each widget computes derived metrics only. No widget displays a probability vector that differs from the canonical weights.

### 5.1 Widget 1: Posterior Vector

**Purpose:** Display the canonical hypothesis weights with stance, momentum, and audit access.

**Content:**
- Header: "Hypothesis Posterior" with "CANONICAL" badge
- Narrative Tension Indicator (Section 4.6): banner between header and hypothesis rows. Only displayed when a condition fires. Colour-coded amber/red/green. Full message text visible without interaction.
- For each hypothesis (sorted descending by weight):
  - Code badge (colour-coded by stance: green = BULLISH, amber = NEUTRAL, red = BEARISH)
  - Name
  - Status label and arrow (derived per Section 4.4)
  - Weight as percentage (integer, e.g., "34%")
  - Proportional bar (width relative to highest weight, NOT relative to 100%)
  - One-line thesis summary
- Footer: "Click any hypothesis to open the evidence audit trail"

**Interaction:** Clicking a hypothesis row opens the Audit Drawer (Section 5.5).

### 5.2 Widget 2: Dominance Panel

**Purpose:** Classify the narrative structure and communicate contestability.

**Content:**
- Header: "Dominance" with classification badge (Section 4.1)
- Metrics grid:
  - Lead hypothesis (code + name)
  - Challenger (code + name)
  - Top gap (integer points)
  - Ratio (p1/p2, two decimal places)
  - HHI (three decimal places)
  - Conviction (Section 4.2, two decimal places + label)
  - Structure description (e.g., "Two-horse (T1+T2 = 64%)")
- Interpretation text: one sentence, mechanically selected based on classification label. Sentences:
  - Dominant: "[Lead code] commands the narrative with [gap] points of daylight. Evidence strongly concentrated."
  - Contested: "Narrative is contested. [Lead code] leads by only [gap] points -- insufficient for high-conviction positioning."
  - Diffuse: "Evidence has not separated the hypotheses. Near-uniform distribution. Await catalyst before positioning."
  - Leading: "[Lead code] leads but has not broken away. [Gap] point gap warrants moderate conviction only."

### 5.3 Widget 3: Risk Balance

**Purpose:** Show the directional lean of the evidence and produce a single-number risk score.

**Content:**
- Header: "Risk Balance" with skew score (0--100) prominently displayed
- Two bars:
  - Constructive mass (labelled with hypothesis codes, e.g., "T1+T2"): percentage + bar
  - Downside mass (labelled with hypothesis codes, e.g., "T3+T4"): percentage + bar
- Skew value: signed integer points (e.g., "+28 pts")
- Skew label (Section 4.3)
- Interpretation text: one sentence, mechanically selected. Sentences:
  - Constructive (>= 65): "Constructive balance. Downside mass at [X]% is [material/manageable] but not dominant."
  - Leaning Constructive (55--64): "Favourable balance, but downside still material at [X]%."
  - Balanced (45--54): "Balanced. Evidence does not favour either direction."
  - Leaning Downside (36--44): "Leaning downside. Bear theses carry [X]% of evidence weight."
  - Downside (<= 35): "Downside-heavy. Evidence favours bear theses. Constructive case requires new catalysts."

### 5.4 Widget 4: Regime Transition Map

**Purpose:** Display pre-committed tripwires as a state machine showing what would cause the lead hypothesis to change.

**Content:**
- Header: "Regime Transition Map" with "Pre-committed triggers" subtitle
- Current regime bar:
  - Current regime: lead hypothesis code + name
  - Challenger: second hypothesis code + name
  - Contestability: transition proximity label + gap in points (Section 4.5)
- Tripwire cards (one per tripwire):
  - Timeframe badge
  - Title
  - Two columns: "IF CONSTRUCTIVE" (condition + effect) and "IF ADVERSE" (condition + effect)
  - Cadence footnote
  - Source footnote

**No calculations.** This widget is pure display of structured, pre-committed rules. The tripwire content is authored by the research pipeline at coverage initiation and updated at hypothesis vintage changes.

### 5.5 Audit Drawer

**Purpose:** Show the evidence trail behind a specific hypothesis. This is the product's moat.

**Trigger:** Click on any hypothesis row in the Posterior Vector widget.

**Content:**
- Header: "SHOW YOUR WORKING" + hypothesis code, name, stance, weight, status
- Diagnostic evidence list (items where `dir[code] != 0`), sorted by absolute contribution (highest first):
  - Evidence title
  - Direction: "Supports" (green) or "Contradicts" (red)
  - Quality badge (HIGH/MEDIUM/LOW with colour)
  - Domain label
  - Date
  - Contribution value (delta log-odds, if populated by engine)
- Non-diagnostic evidence list (items where `dir[code] = 0`), dimmed:
  - Evidence title, quality, domain, date
  - No contribution value (these items do not affect this hypothesis)

---

## 6. Edge Cases and Validation Rules

The system must handle every case below without manual intervention.

### 6.1 Weight Normalisation

If the sum of raw weights deviates from 1.0 by more than 0.01, reject the input and log an error. Do not silently normalise bad inputs -- this catches upstream pipeline errors.

If the sum deviates by 0.01 or less (floating-point rounding), normalise by dividing each weight by the sum.

### 6.2 Tied Weights

If `p_1 = p_2` (exact tie at the top):
- `gap = 0`
- Classification = Contested
- Transition proximity = 1.0
- Lead hypothesis = the one with the higher code number (more recently added), as a tiebreaker. This is arbitrary but deterministic.

### 6.3 Single Dominant Hypothesis

If `p_1 > 0.70`:
- Likely classified Dominant (gap will almost certainly exceed 0.15)
- Conviction will be high
- Skew score will be extreme
- Interpretation should not add false uncertainty. The evidence is clear.

### 6.4 All Hypotheses Near-Uniform

If all weights are within 2 points of `1/n`:
- Classification = Diffuse
- Conviction near zero
- Skew score near 50
- The product honestly communicates "evidence has not separated the hypotheses."

### 6.5 Hypothesis Addition (n Changes)

When a hypothesis is added:
- All `HHI_uniform`, dominance thresholds (`2/n`), and initial-coverage baselines (`1/n`) recalculate automatically.
- Prior-period comparisons use the prior hypothesis set and are not directly comparable. The vintage boundary is displayed.

### 6.6 Hypothesis Retirement (n Changes)

When a hypothesis is retired:
- Its weight is redistributed proportionally to remaining hypotheses before normalisation.
- All derived metrics recalculate.
- The vintage boundary is displayed.

### 6.7 Initial Coverage (No Prior Data)

- `p_prior` for all hypotheses = `1/n`
- Momentum calculation proceeds normally. A hypothesis at 34% on initial coverage with uniform prior of 25% shows `delta_p = +0.09`, arrow = UP.
- Tripwires are required at coverage initiation. Minimum 2.
- `hypothesisVintage = 1`

### 6.8 Sparse Evidence

If fewer than 3 evidence items are assessed:
- All widgets render normally (the weights are still canonical).
- The Audit Drawer shows a prominent warning: "LIMITED EVIDENCE: [n] items assessed. Weights reflect preliminary assessment."
- The Dominance Panel appends: "Evidence base insufficient for high-confidence classification."

---

## 7. Implementation Sequence

Build in this order. Each step has a clear acceptance test.

### Step 1: Data Model and Types

Implement the type definitions from Section 2 exactly. Write a validator function that:
- Confirms hypothesis weights sum to 1.0 (within tolerance)
- Confirms all weights > 0
- Confirms hypothesis count is 3--6
- Confirms `constructiveCodes` + `downsideCodes` = all hypothesis codes
- Confirms every evidence item's `dir` record has a key for every hypothesis code
- Confirms evidence quality does not exceed domain ceiling

**Acceptance test:** Validator passes for the BHP fixture. Validator rejects a fixture with weights summing to 0.95, a fixture with a hypothesis at p=0, and a fixture with a Corporate-domain evidence item tagged HIGH.

### Step 2: Derived Metric Functions

Implement Sections 4.1 through 4.5 as pure functions that take `p[]` and return the metric. No side effects. No state.

**Acceptance tests (using BHP fixture [0.34, 0.30, 0.21, 0.15]):**
- `dominanceLabel` returns "Contested"
- `gap` returns 0.04
- `HHI` returns 0.2722
- `conviction` returns 0.058 (approximately)
- `skew_score` returns 64
- `transition_proximity` returns 0.733

**Additional acceptance tests (boundary cases):**
- `[0.55, 0.20, 0.15, 0.10]` returns "Dominant" (p1=0.55 >= 2/4=0.50, gap=0.35 >= 0.15)
- `[0.36, 0.34, 0.20, 0.10]` returns "Contested" (gap=0.02 < 0.08)
- `[0.26, 0.25, 0.25, 0.24]` returns "Diffuse" (HHI=0.2502, HHI_ratio=1.001 < 1.06)
- `[0.40, 0.25, 0.20, 0.15]` returns "Leading" (p1=0.40 < 0.50, gap=0.15, not Contested, not Diffuse)
- Three-hypothesis case `[0.50, 0.30, 0.20]`: "Leading" (p1=0.50 < 2/3=0.667, gap=0.20 >= 0.15, not Contested, HHI_ratio > 1.06)
- Three-hypothesis case `[0.70, 0.20, 0.10]`: "Dominant" (p1=0.70 >= 0.667, gap=0.50 >= 0.15)

### Step 2b: Narrative Tension Indicator

Implement Section 4.6 as a pure function that takes the full set of derived metrics and returns either a tension signal (label, colour, message) or null.

**Acceptance tests:**
- BHP fixture [0.34, 0.30, 0.21, 0.15], Contested: returns CONTESTED LEAD (amber)
- [0.55, 0.20, 0.15, 0.10], Dominant, conviction=0.38: returns CLEAR SIGNAL (green)
- [0.40, 0.25, 0.20, 0.15], T1 stance BEARISH, Leading: returns BEAR REGIME (red)
- [0.26, 0.25, 0.25, 0.24], conviction=0.001, one hypothesis delta_p=+0.06: returns RAPID SHIFT, LOW CONVICTION (amber)
- [0.40, 0.25, 0.20, 0.15], T1 stance BULLISH, Leading, conviction=0.12: returns null (no indicator)

### Step 3: Momentum Calculation

Implement Section 4.4 status arrow and label derivation.

**Acceptance tests:**
- Hypothesis with p=0.34, p_prior=0.25, stance=BULLISH: arrow=UP, label="Building"
- Hypothesis with p=0.15, p_prior=0.20, stance=BEARISH: arrow=DOWN, label="Fading"
- Hypothesis with p=0.30, p_prior=0.28, stance=NEUTRAL, is lead: arrow=FLAT, label="Priced"
- Hypothesis with p=0.21, p_prior=0.22, stance=BEARISH, not lead: arrow=FLAT, label="Watching"
- Hypothesis with p=0.35, p_prior=0.28, stance=BEARISH: arrow=UP, label="Strengthening"

### Step 4: Widget Components

Build the four widgets per Section 5. Each widget receives the `StockModel` object and computes derived metrics internally using the functions from Step 2.

**Acceptance test:** Render the BHP fixture. Visually confirm:
- Posterior vector shows [T1 34%, T2 30%, T3 21%, T4 15%] in descending order
- Dominance panel shows "CONTESTED" badge, gap = 4 pts, HHI = 0.272
- Risk balance shows skew score = 64, constructive = 64%, downside = 36%
- Regime map shows T1 as current regime, T2 as challenger, contestability = HIGH

### Step 5: Audit Drawer

Build per Section 5.5. Must open on hypothesis click and display evidence sorted by contribution magnitude.

**Acceptance test:** Click T1 in BHP fixture. Drawer shows 4 diagnostic items (e1, e2, e7 support; none contradict) and 3 non-diagnostic items (e3, e4, e5, e6 where dir.T1 = 0). Items sorted by absolute contribution descending.

### Step 6: Validation Boundary Cases

Test all edge cases from Section 6. Confirm the system handles ties, single dominance, uniform weights, sparse evidence, and hypothesis count changes without errors or manual intervention.

### Step 7: Second Fixture

Create a second stock fixture with a materially different profile to confirm generalisation. Suggested: a small-cap technology stock with 3 hypotheses, one dominant, limited evidence. Confirm all widgets render correctly and classifications make sense.

### Step 8: Third Fixture

Create a third stock fixture with 5 hypotheses, diffuse weights, and a recent vintage change. Confirm the system handles `n != 4`, the vintage boundary display, and diffuse classification.

---

## 8. What This Document Does Not Cover

The following are explicitly out of scope for this specification. They are separate workstreams.

- **How canonical weights are produced.** This document specifies what happens after weights exist. The scoring engine (Bayesian, Heuer matrix, analyst judgment, or hybrid) is a separate specification.
- **Data ingestion and evidence collection.** How evidence items are sourced, de-duplicated, and tagged is a pipeline concern.
- **Market-implied prior calibration.** If a two-layer view (canonical weights vs model posterior) is added later, the prior derivation formula is a separate specification.
- **Real-time price feeds.** The `stock.price` field is a snapshot. Live pricing integration is a platform concern.
- **User permissions and access control.** Who can view or modify a stock's canonical state.

---

## 9. Prohibitions

These are hard rules. Violations are bugs, not judgment calls.

1. **No widget may display a probability vector that differs from canonical weights.** If a widget needs to show a different analytical lens (e.g., a Bayesian model posterior), it must be labelled as a separate, optional view and must not replace the canonical display.
2. **No derived metric may use inputs other than the canonical weights.** Price data, volume, volatility, and market data do not enter the classification formulae. They may appear in evidence items and tripwires, but not in the derived metrics.
3. **No classification label may be manually overridden.** If the formula says "Contested," the display says "Contested." If the analyst disagrees, the remedy is to update the canonical weights, which will change the classification mechanically.
4. **No hypothesis may have its stance changed after creation.** If the market environment changes such that a previously bearish thesis is now constructive, retire the old hypothesis and create a new one with the correct stance under the vintage system.
5. **No tripwire may be set retroactively.** Tripwires are authored at coverage initiation or at vintage changes, before the events they monitor. Adding a tripwire after the event it describes has occurred is rationalisation, not discipline.
6. **Never use em-dashes in any output.** Use en-dashes or restructure.
7. **Australian English throughout.** Analyse, colour, organisation, favour, defence.
8. **No silent normalisation of bad weight inputs.** Reject and log. Force the upstream pipeline to fix the error.

---

## Appendix A: BHP Fixture (Reference Implementation)

Use this fixture for all acceptance testing. Canonical weights: [0.34, 0.30, 0.21, 0.15].

Expected derived metrics:
- Dominance: Contested (gap = 4 pts, p1 = 0.34 < 0.50)
- HHI: 0.2722
- HHI_ratio: 1.089
- Conviction: 0.058 (Low)
- Constructive mass: 64% (T1 + T2)
- Downside mass: 36% (T3 + T4)
- Skew: +28 pts
- Skew score: 64 (Leaning Constructive)
- Transition proximity: 0.733 (Elevated)
- T1 status: arrow UP, label "Building" (p=0.34 vs prior 0.25)
- T2 status: arrow FLAT, label "Priced" (p=0.30 vs prior 0.25, delta=0.05 > 0.03 so actually UP, label "Building" -- unless prior is set differently)

**Note on BHP status arrows with uniform prior:** With uniform prior of 0.25 (1/4), the derived status for each hypothesis is:
- T1: p=0.34, delta=+0.09, arrow=UP, label="Building" (BULLISH + UP)
- T2: p=0.30, delta=+0.05, arrow=UP, label="Building" (NEUTRAL + UP)
- T3: p=0.21, delta=-0.04, arrow=DOWN, label="Fading" (BEARISH + DOWN)
- T4: p=0.15, delta=-0.10, arrow=DOWN, label="Fading" (BEARISH + DOWN)

This differs from the current report display (which shows T2 as "Priced" FLAT and T3 as "Watching" FLAT). The uniform-prior approach is correct for the v2 system: on initial coverage, the evidence has pulled T1 and T2 above baseline and pushed T3 and T4 below it. The arrows reflect this honestly. Subsequent assessment periods will use the prior period's canonical weights as `p_prior`, and the arrows will then reflect period-over-period movement rather than deviation from uniform.

**Narrative Tension Indicator for BHP fixture:** p_1 = 0.34 >= 0.30 AND classification = Contested. Fires: CONTESTED LEAD. Message: "Copper Supercycle leads at 34% but Iron Ore Cash Machine is within 4 points. Evidence does not support high-conviction positioning."

---

## Appendix B: Quick Reference Card

For any stock, given canonical weights `p = [p_1, ..., p_n]` sorted descending:

```
gap             = p_1 - p_2
HHI             = sum(p_i^2)
HHI_ratio       = HHI / (1/n)
conviction      = 1 - (-sum(p_i * ln(p_i)) / ln(n))
constructive    = sum(p_i where stance in {BULLISH, NEUTRAL})
downside        = sum(p_i where stance = BEARISH)
skew            = constructive - downside
skew_score      = round(50 + 50 * skew)
proximity       = clamp(0, 1, 1 - gap/0.15)

dominance:
  if p_1 >= 2/n AND gap >= 0.15    -> Dominant
  elif gap < 0.08                   -> Contested
  elif HHI_ratio < 1.06            -> Diffuse
  else                              -> Leading

momentum (per hypothesis):
  delta = p - p_prior
  if delta > +0.03   -> UP
  elif delta < -0.03 -> DOWN
  else               -> FLAT
```

Six numbers. One label. One tension signal. All deterministic. All auditable.

```
narrative tension (first match wins):
  if p_1 >= 0.30 AND dominance = Contested       -> CONTESTED LEAD (amber)
  elif delta_p_1 > 0.03 AND proximity > 0.60      -> FRAGILE MOMENTUM (amber)
  elif stance_1 = BEARISH AND dominance in
       {Dominant, Leading}                         -> BEAR REGIME (red)
  elif conviction < 0.05 AND any delta_p > 0.05   -> RAPID SHIFT (amber)
  elif dominance = Dominant AND conviction > 0.35  -> CLEAR SIGNAL (green)
  else                                             -> none
```
