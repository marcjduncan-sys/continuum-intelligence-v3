# CODING INSTRUCTION: Continuum Intelligence v2 Quantitative Hypothesis Framework

You are building the quantitative hypothesis display layer for the Continuum Intelligence equity research platform. This is a React (TypeScript) application. You will build: type definitions, pure computation functions, a validation layer, four display widgets, an audit drawer, a narrative tension indicator, and three test fixtures that prove generalisation.

Read this entire document before writing any code.

---

## ARCHITECTURE RULE (NON-NEGOTIABLE)

The research pipeline produces a single canonical hypothesis state per stock: `n` weights summing to 1.0. Every metric, label, classification, and display element you build is a **deterministic derivation** from these weights. You must never silently produce a different probability vector. You must never allow any widget to display weights that differ from the canonical input. If a formula says the label is "Contested," the display says "Contested" -- there is no analyst override of computed labels.

---

## PART 1: TYPE DEFINITIONS

Create file: `src/types.ts`

```typescript
// ── Enums and Literals ──

export type Stance = "BULLISH" | "NEUTRAL" | "BEARISH";
export type Arrow = "UP" | "FLAT" | "DOWN";
export type EvidenceQuality = "HIGH" | "MEDIUM" | "LOW";

export type EvidenceDomain =
  | "Regulatory"
  | "Economic"
  | "Academic"
  | "Competitor"
  | "Broker"
  | "Governance"
  | "Ownership"
  | "Alternative"
  | "Corporate"
  | "Media";

export type DominanceLabel = "Dominant" | "Contested" | "Diffuse" | "Leading";
export type ConvictionLabel = "Uninformative" | "Low" | "Moderate" | "High";
export type SkewLabel = "Constructive" | "Leaning Constructive" | "Balanced" | "Leaning Downside" | "Downside";
export type ProximityLabel = "Stable" | "Watchable" | "Elevated" | "Fragile";
export type MomentumLabel = "Building" | "Strengthening" | "Fading" | "Priced" | "Watching" | "Stable";
export type TensionLabel = "CONTESTED LEAD" | "FRAGILE MOMENTUM" | "BEAR REGIME" | "RAPID SHIFT, LOW CONVICTION" | "CLEAR SIGNAL";
export type TensionColour = "amber" | "red" | "green";

// ── Data Model ──

export interface Hypothesis {
  code: string;               // "T1", "T2", etc.
  name: string;               // Short noun-phrase, e.g., "Copper Supercycle"
  stance: Stance;             // Immutable after creation
  p: number;                  // Canonical weight, 0 < p < 1
  p_prior: number | null;     // Prior period weight. null only on first-ever coverage with no history.
  short: string;              // One-sentence thesis statement
  requires: string[];         // Conditions that must hold
  supportingEvidence: string[];    // Evidence item IDs
  contradictingEvidence: string[]; // Evidence item IDs
}

export interface EvidenceItem {
  id: string;
  title: string;
  domain: EvidenceDomain;
  quality: EvidenceQuality;
  date: string;                    // ISO date
  dir: Record<string, -1 | 0 | 1>; // Direction vs each hypothesis code
  contribution: Record<string, number> | null; // Delta log-odds per hypothesis
  source: string;
  freshness: "Current" | "Recent" | "Dated";
}

export interface Tripwire {
  id: string;
  timeframe: string;          // "FEB 2026", "ONGOING", etc.
  title: string;
  condition_good: string;
  effect_good: string;
  condition_bad: string;
  effect_bad: string;
  cadence: string;
  source: string;
  currentReading: string | null;
  proximity: "CLEAR" | "APPROACHING" | "AT_THRESHOLD" | "BREACHED" | null;
}

export interface StockMeta {
  hypothesisVintage: number;
  vintageDate: string;
  priorVintageDate: string | null;
  domainsCovered: number;
  domainsTotal: 10;
  analystNote: string | null;
}

export interface StockModel {
  stock: {
    name: string;
    ticker: string;
    exchange: string;
    sector: string;
    asOf: string;
    price: string;
    currency: string;
  };
  hypotheses: Hypothesis[];
  constructiveCodes: string[];
  downsideCodes: string[];
  tripwires: Tripwire[];
  evidence: EvidenceItem[];
  meta: StockMeta;
}

// ── Derived Metric Outputs ──

export interface HypothesisStatus {
  arrow: Arrow;
  label: MomentumLabel;
}

export interface DerivedMetrics {
  n: number;
  sorted: Hypothesis[];            // Hypotheses sorted descending by p
  gap: number;                     // p_1 - p_2
  ratio: number;                   // p_1 / p_2
  hhi: number;
  hhiUniform: number;
  hhiRatio: number;
  dominance: DominanceLabel;
  conviction: number;              // 0..1
  convictionLabel: ConvictionLabel;
  constructiveMass: number;
  downsideMass: number;
  skew: number;
  skewScore: number;               // 0..100
  skewLabel: SkewLabel;
  transitionProximity: number;     // 0..1
  proximityLabel: ProximityLabel;
  statuses: Record<string, HypothesisStatus>; // keyed by hypothesis code
  tension: TensionSignal | null;
}

export interface TensionSignal {
  label: TensionLabel;
  colour: TensionColour;
  message: string;
}
```

---

## PART 2: DOMAIN QUALITY CEILING MAP

Create file: `src/domainCeilings.ts`

```typescript
import { EvidenceDomain, EvidenceQuality } from "./types";

const QUALITY_RANK: Record<EvidenceQuality, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

const DOMAIN_CEILING: Record<EvidenceDomain, EvidenceQuality> = {
  Regulatory: "HIGH",
  Economic: "HIGH",
  Academic: "HIGH",
  Competitor: "HIGH",
  Broker: "MEDIUM",
  Governance: "MEDIUM",
  Ownership: "MEDIUM",
  Alternative: "MEDIUM",
  Corporate: "LOW",
  Media: "LOW",
};

export function qualityExceedsCeiling(domain: EvidenceDomain, quality: EvidenceQuality): boolean {
  return QUALITY_RANK[quality] > QUALITY_RANK[DOMAIN_CEILING[domain]];
}

export { DOMAIN_CEILING };
```

Note: Corporate and Media domains have a LOW ceiling. An evidence item from these domains tagged MEDIUM is permitted only if the analyst has corroborated it with an independent source. An item tagged HIGH from these domains is always invalid.

---

## PART 3: VALIDATION

Create file: `src/validate.ts`

This function validates a `StockModel` and returns an array of error strings. An empty array means valid. The caller must reject any model with errors -- do not silently fix problems.

Implement these checks exactly:

1. **Weight sum:** `Math.abs(sum(hypotheses.map(h => h.p)) - 1.0) <= 0.01`. If violated: `"Weight sum ${sum} deviates from 1.0 by more than 0.01"`.
2. **Positive weights:** Every `h.p > 0`. If violated: `"Hypothesis ${h.code} has non-positive weight ${h.p}"`.
3. **Hypothesis count:** `hypotheses.length >= 3 && hypotheses.length <= 6`. If violated: `"Hypothesis count ${n} outside allowed range 3-6"`.
4. **Partition completeness:** The union of `constructiveCodes` and `downsideCodes` must equal the set of all hypothesis codes, with no overlap and no missing codes. If violated: `"Constructive/downside partition does not match hypothesis codes"`.
5. **Partition correctness:** Every code in `constructiveCodes` must have stance BULLISH or NEUTRAL. Every code in `downsideCodes` must have stance BEARISH. If violated: `"${code} has stance ${stance} but is in ${partition} partition"`.
6. **Evidence direction keys:** Every evidence item's `dir` record must have a key for every hypothesis code. If violated: `"Evidence ${e.id} missing direction for hypothesis ${code}"`.
7. **Domain quality ceiling:** No evidence item's quality may exceed its domain ceiling per the map above. If violated: `"Evidence ${e.id} has quality ${quality} exceeding ${domain} ceiling of ${ceiling}"`.
8. **Minimum tripwires:** `tripwires.length >= 2`. If violated: `"Minimum 2 tripwires required, found ${n}"`.

---

## PART 4: PURE COMPUTATION FUNCTIONS

Create file: `src/compute.ts`

Every function in this file is pure: no side effects, no state, no DOM access. Functions take canonical weights (and supporting data where specified) and return derived metrics.

### 4a. Core Metrics

```typescript
export function computeGap(sorted: number[]): number
// sorted[0] - sorted[1]

export function computeHHI(weights: number[]): number
// sum(w^2 for w in weights)

export function computeDominance(p1: number, p2: number, n: number, hhiRatio: number): DominanceLabel
// Evaluate in this order, return first match:
// 1. p1 >= 2/n AND (p1 - p2) >= 0.15 => "Dominant"
// 2. (p1 - p2) < 0.08 => "Contested"
// 3. hhiRatio < 1.06 => "Diffuse"
// 4. else => "Leading"

export function computeConviction(weights: number[]): number
// H = -sum(p * Math.log(p) for p in weights)
// H_max = Math.log(weights.length)
// return 1 - (H / H_max)
// IMPORTANT: use natural log (Math.log), not log2

export function classifyConviction(conviction: number): ConvictionLabel
// < 0.05 => "Uninformative"
// 0.05..0.15 => "Low"
// 0.15..0.35 => "Moderate"
// > 0.35 => "High"
// Boundary values: 0.05 is Low, 0.15 is Moderate, 0.35 is High

export function computeSkew(
  hypotheses: Hypothesis[],
  constructiveCodes: string[],
): { constructiveMass: number; downsideMass: number; skew: number; skewScore: number }
// constructiveMass = sum(h.p where h.code in constructiveCodes)
// downsideMass = 1 - constructiveMass
// skew = constructiveMass - downsideMass
// skewScore = Math.round(50 + 50 * skew)

export function classifySkew(skewScore: number): SkewLabel
// >= 65 => "Constructive"
// 55..64 => "Leaning Constructive"
// 45..54 => "Balanced"
// 36..44 => "Leaning Downside"
// <= 35 => "Downside"
// Boundary values: 65 is Constructive, 55 is Leaning Constructive, 45 is Balanced, 36 is Leaning Downside

export function computeTransitionProximity(gap: number): number
// Math.max(0, Math.min(1, 1 - (gap / 0.15)))

export function classifyProximity(proximity: number): ProximityLabel
// < 0.3 => "Stable"
// 0.3..0.6 => "Watchable"
// 0.6..0.85 => "Elevated"
// > 0.85 => "Fragile"
// Boundary values: 0.3 is Watchable, 0.6 is Elevated, 0.85 is Fragile
```

### 4b. Momentum

```typescript
export function computeStatus(
  hypothesis: Hypothesis,
  isLead: boolean,
  n: number,
): HypothesisStatus
```

Logic:
1. Determine `p_prior`. If `hypothesis.p_prior` is null, use `1/n` (uniform).
2. `delta = hypothesis.p - p_prior`
3. Determine arrow:
   - `delta > 0.03` => UP
   - `delta < -0.03` => DOWN
   - else => FLAT
4. Determine label from this exact lookup (no other combinations exist):
   - UP + BULLISH => "Building"
   - UP + NEUTRAL => "Building"
   - UP + BEARISH => "Strengthening"
   - DOWN + BULLISH => "Fading"
   - DOWN + NEUTRAL => "Fading"
   - DOWN + BEARISH => "Fading"
   - FLAT + (isLead = true) => "Priced"
   - FLAT + BEARISH + (isLead = false) => "Watching"
   - FLAT + (not BEARISH) + (isLead = false) => "Stable"

### 4c. Narrative Tension Indicator

```typescript
export function computeTension(
  sorted: Hypothesis[],
  dominance: DominanceLabel,
  conviction: number,
  transitionProximity: number,
  statuses: Record<string, HypothesisStatus>,
  n: number,
): TensionSignal | null
```

Evaluate these conditions **in order**. Return the **first match**. If none match, return null.

**Condition 1 -- CONTESTED LEAD:**
- `sorted[0].p >= 0.30` AND `dominance === "Contested"`
- Return: `{ label: "CONTESTED LEAD", colour: "amber", message: "${sorted[0].name} leads at ${pct}% but ${sorted[1].name} is within ${gap} points. Evidence does not support high-conviction positioning." }`

**Condition 2 -- FRAGILE MOMENTUM:**
- `statuses[sorted[0].code].arrow === "UP"` AND `transitionProximity > 0.60`
- Return: `{ label: "FRAGILE MOMENTUM", colour: "amber", message: "${sorted[0].name} is gaining weight but the regime is fragile. ${gap} point lead could flip on a single catalyst." }`

**Condition 3 -- BEAR REGIME:**
- `sorted[0].stance === "BEARISH"` AND `(dominance === "Dominant" || dominance === "Leading")`
- Return: `{ label: "BEAR REGIME", colour: "red", message: "A bearish thesis (${sorted[0].name}) leads the evidence. Downside is the path of least resistance." }`

**Condition 4 -- RAPID SHIFT, LOW CONVICTION:**
- `conviction < 0.05` AND any hypothesis has `|p - p_prior| > 0.05` (use `1/n` if `p_prior` is null)
- Find the hypothesis with the largest absolute delta. Use its name as `[Tx name]`.
- Return: `{ label: "RAPID SHIFT, LOW CONVICTION", colour: "amber", message: "Evidence is moving fast but overall conviction remains low. ${name} surging on thin evidence base." }`

**Condition 5 -- CLEAR SIGNAL:**
- `dominance === "Dominant"` AND `conviction > 0.35`
- Return: `{ label: "CLEAR SIGNAL", colour: "green", message: "Evidence strongly concentrated on ${sorted[0].name}. ${gap} point lead with high conviction." }`

**Condition 6 -- NONE:** Return `null`.

In all message templates: `pct` = `Math.round(sorted[0].p * 100)`, `gap` = `Math.round((sorted[0].p - sorted[1].p) * 100)`.

### 4d. Master Compute Function

```typescript
export function computeAllMetrics(model: StockModel): DerivedMetrics
```

This is the single entry point. It:
1. Sorts hypotheses descending by `p` (stable sort; tiebreaker = higher code number wins lead, i.e., more recently added).
2. Calls every function above.
3. Returns a complete `DerivedMetrics` object.
4. Must not modify the input `StockModel`.

---

## PART 5: THREE TEST FIXTURES

Create file: `src/fixtures.ts`

You must build three fixtures that prove the system generalises across stock profiles.

### Fixture 1: BHP Group (4 hypotheses, contested, initial coverage)

```typescript
export const BHP_FIXTURE: StockModel = {
  stock: {
    name: "BHP Group",
    ticker: "BHP.AX",
    exchange: "ASX",
    sector: "Materials",
    asOf: "2026-02-16",
    price: "A$53.33",
    currency: "AUD",
  },
  hypotheses: [
    {
      code: "T1", name: "Copper Supercycle", stance: "BULLISH", p: 0.34, p_prior: null,
      short: "Copper transition drives growth; electrification tightens supply.",
      requires: ["Copper > US$4.00/lb", "Escondida debottlenecking delivers", "OZ Minerals integration on track"],
      supportingEvidence: ["e1", "e2", "e7"], contradictingEvidence: [],
    },
    {
      code: "T2", name: "Iron Ore Cash Machine", stance: "NEUTRAL", p: 0.30, p_prior: null,
      short: "WAIO cost leadership sustains dividend floor and buybacks.",
      requires: ["Iron ore > US$100/t", "China infrastructure offsets property weakness"],
      supportingEvidence: ["e1", "e4"], contradictingEvidence: ["e3", "e5"],
    },
    {
      code: "T3", name: "China Property Drag", stance: "BEARISH", p: 0.21, p_prior: null,
      short: "China steel/property weakness compresses iron ore margins.",
      requires: ["China steel production declines > 5%", "Iron ore falls below US$90/t"],
      supportingEvidence: ["e3", "e5"], contradictingEvidence: ["e1"],
    },
    {
      code: "T4", name: "Commodity Cycle Peak", stance: "BEARISH", p: 0.15, p_prior: null,
      short: "Broad commodity downturn plus execution/capex risk hits earnings.",
      requires: ["Global recession", "Multiple commodity prices fall simultaneously"],
      supportingEvidence: ["e3", "e5", "e6"], contradictingEvidence: ["e1", "e2", "e4"],
    },
  ],
  constructiveCodes: ["T1", "T2"],
  downsideCodes: ["T3", "T4"],
  tripwires: [
    {
      id: "tw1", timeframe: "FEB 2026", title: "H1 FY26 Results \u2013 Copper vs Iron Test",
      condition_good: "Copper production exceeds guidance AND iron ore margins stable",
      effect_good: "T1 strengthens; transition thesis validated by delivery",
      condition_bad: "Realised iron ore price < US$95/t OR copper volumes disappoint",
      effect_bad: "T3 strengthens; market reprices toward iron ore vulnerability",
      cadence: "Event-driven (results day)", source: "BHP ASX announcement",
      currentReading: null, proximity: null,
    },
    {
      id: "tw2", timeframe: "LATE CY2026", title: "Jansen Potash \u2013 First Production",
      condition_good: "First saleable tonnes on schedule (late CY2026)",
      effect_good: "Diversification thesis validated; potash hedge becomes real",
      condition_bad: "Delay beyond Q1 2027 OR capex overrun >15%",
      effect_bad: "T4 strengthens via capital allocation / execution risk",
      cadence: "Quarterly production reports", source: "BHP quarterly updates",
      currentReading: null, proximity: null,
    },
    {
      id: "tw3", timeframe: "ONGOING", title: "Iron Ore Price Floor Watch",
      condition_good: "Iron ore sustains > US$100/t through CY2026",
      effect_good: "T2 confirmed; dividend/buyback capacity secure",
      condition_bad: "Iron ore < US$85/t for > 1 quarter",
      effect_bad: "T3 crystallises; demand decline structural; dividend reset risk",
      cadence: "Weekly (SGX/Platts)", source: "SGX futures; Platts IODEX",
      currentReading: null, proximity: null,
    },
  ],
  evidence: [
    { id: "e1", title: "H1 FY26 financials: EBITDA ~US$27B; net debt ~US$12B within target", domain: "Regulatory", quality: "HIGH", date: "2026-02-16", dir: { T1: 1, T2: 1, T3: -1, T4: -1 }, contribution: { T1: 0.12, T2: 0.18, T3: -0.10, T4: -0.14 }, source: "BHP H1 FY26 ASX filing", freshness: "Current" },
    { id: "e2", title: "Copper supply gap forecast (10+ Mt by 2035) \u2013 peer-reviewed", domain: "Academic", quality: "HIGH", date: "2025-10-01", dir: { T1: 1, T2: 0, T3: 0, T4: -1 }, contribution: { T1: 0.22, T2: 0.0, T3: 0.0, T4: -0.18 }, source: "Nature Reviews, Oct 2025", freshness: "Recent" },
    { id: "e3", title: "China housing starts materially down from peak; property investment declining", domain: "Economic", quality: "HIGH", date: "2026-01-31", dir: { T1: 0, T2: -1, T3: 1, T4: 1 }, contribution: { T1: 0.0, T2: -0.16, T3: 0.20, T4: 0.10 }, source: "NBS China, Jan 2026", freshness: "Current" },
    { id: "e4", title: "WAIO C1 costs US$15\u201317/t (first quartile globally)", domain: "Regulatory", quality: "HIGH", date: "2026-02-16", dir: { T1: 0, T2: 1, T3: 0, T4: -1 }, contribution: { T1: 0.0, T2: 0.20, T3: 0.0, T4: -0.12 }, source: "BHP H1 FY26 filing", freshness: "Current" },
    { id: "e5", title: "Simandou potential 60\u2013120 Mtpa supply risk from late 2020s", domain: "Competitor", quality: "MEDIUM", date: "2026-01-15", dir: { T1: 0, T2: -1, T3: 1, T4: 1 }, contribution: { T1: 0.0, T2: -0.06, T3: 0.08, T4: 0.05 }, source: "Rio Tinto investor briefing", freshness: "Current" },
    { id: "e6", title: "Nickel West impairment (US$2.5B) \u2013 cycle / forecasting error", domain: "Regulatory", quality: "HIGH", date: "2024-08-01", dir: { T1: 0, T2: 0, T3: 0, T4: 1 }, contribution: { T1: 0.0, T2: 0.0, T3: 0.0, T4: 0.11 }, source: "BHP FY24 annual report", freshness: "Dated" },
    { id: "e7", title: "OZ Minerals integration on track \u2013 SA copper province (motivated)", domain: "Corporate", quality: "LOW", date: "2026-02-01", dir: { T1: 1, T2: 0, T3: 0, T4: 0 }, contribution: { T1: 0.04, T2: 0.0, T3: 0.0, T4: 0.0 }, source: "BHP investor presentation", freshness: "Current" },
  ],
  meta: {
    hypothesisVintage: 1, vintageDate: "2026-02-16", priorVintageDate: null,
    domainsCovered: 10, domainsTotal: 10, analystNote: null,
  },
};
```

**Expected derived metrics for BHP:**
- n = 4
- sorted = [T1, T2, T3, T4]
- gap = 0.04
- ratio = 1.133
- hhi = 0.2722
- hhiUniform = 0.25
- hhiRatio = 1.089
- dominance = "Contested"
- conviction = 0.058
- convictionLabel = "Low"
- constructiveMass = 0.64
- downsideMass = 0.36
- skew = 0.28
- skewScore = 64
- skewLabel = "Leaning Constructive"
- transitionProximity = 0.733
- proximityLabel = "Elevated"
- T1 status: UP / "Building" (delta = 0.34 - 0.25 = 0.09)
- T2 status: UP / "Building" (delta = 0.30 - 0.25 = 0.05)
- T3 status: DOWN / "Fading" (delta = 0.21 - 0.25 = -0.04)
- T4 status: DOWN / "Fading" (delta = 0.15 - 0.25 = -0.10)
- tension = CONTESTED LEAD (amber): "Copper Supercycle leads at 34% but Iron Ore Cash Machine is within 4 points. Evidence does not support high-conviction positioning."

### Fixture 2: Small-Cap Tech (3 hypotheses, dominant, sparse evidence)

Create a fixture named `TECHCO_FIXTURE` representing a small-cap ASX technology company with:
- 3 hypotheses (n=3)
- Weights: [0.55, 0.25, 0.20]
- T1: "Platform Monetisation" (BULLISH, 0.55)
- T2: "Cash Runway Risk" (BEARISH, 0.25)
- T3: "Acqui-hire Exit" (NEUTRAL, 0.20)
- constructiveCodes = ["T1", "T3"], downsideCodes = ["T2"]
- Only 2 evidence items (sparse)
- 2 tripwires
- All p_prior = null (initial coverage, use 1/3 = 0.333...)

**Expected derived metrics:**
- gap = 0.30
- dominance: p1=0.55, 2/n=0.667, so 0.55 < 0.667 => NOT Dominant. gap=0.30 >= 0.08 => NOT Contested. HHI = 0.4050, hhiUniform = 0.333, hhiRatio = 1.216 > 1.06 => NOT Diffuse. Result: **"Leading"**
- conviction = 0.133 (Low)
- constructiveMass = 0.75 (T1 + T3)
- downsideMass = 0.25 (T2)
- skewScore = 75 (Constructive)
- transitionProximity = 0.0 (gap 0.30 >= 0.15, clamped to 0)
- proximityLabel = "Stable"
- T1 status: UP / "Building" (delta = 0.55 - 0.333 = 0.217)
- T2 status: DOWN / "Fading" (delta = 0.25 - 0.333 = -0.083)
- T3 status: DOWN / "Fading" (delta = 0.20 - 0.333 = -0.133)
- tension: check condition 1 (p1=0.55 >= 0.30 but dominance != Contested, skip), check condition 2 (T1 arrow UP and proximity 0.0 <= 0.60, skip), check condition 3 (T1 stance BULLISH not BEARISH, skip), check condition 4 (conviction 0.133 >= 0.05, skip), check condition 5 (dominance != Dominant, skip) => **null (no indicator)**
- Sparse evidence warning should appear in Audit Drawer

### Fixture 3: Five-Hypothesis Diffuse (5 hypotheses, near-uniform, vintage 2)

Create a fixture named `DIFFUSE_FIXTURE` representing a mid-cap ASX industrial with:
- 5 hypotheses (n=5)
- Weights: [0.22, 0.21, 0.20, 0.19, 0.18]
- Stances: BULLISH, NEUTRAL, BEARISH, BEARISH, BULLISH
- constructiveCodes = [T1, T2, T5], downsideCodes = [T3, T4]
- p_prior for all = [0.20, 0.20, 0.20, 0.20, 0.20] (prior period, not initial)
- hypothesisVintage = 2 (indicating a previous vintage change)
- At least 5 evidence items
- 3 tripwires

**Expected derived metrics:**
- gap = 0.01
- dominance: p1=0.22, 2/n=0.40, so NOT Dominant. gap=0.01 < 0.08 => **"Contested"**
- HHI = 0.2010, hhiUniform = 0.20, hhiRatio = 1.005 (which is also < 1.06, but Contested is checked first and wins)
- conviction = 0.003 (Uninformative)
- constructiveMass = 0.22 + 0.21 + 0.18 = 0.61
- downsideMass = 0.20 + 0.19 = 0.39
- skewScore = 61 (Leaning Constructive)
- transitionProximity = 0.933 (Fragile)
- All statuses FLAT (all deltas <= 0.03)
- tension: check condition 1 (p1=0.22 < 0.30, skip), check condition 2 (no UP arrows, skip), check condition 3 (T1 BULLISH not BEARISH, skip), check condition 4 (conviction 0.003 < 0.05 but need delta > 0.05 -- max delta is 0.02, skip) => **null (no indicator)**

This fixture proves: n=5 works, Contested fires on tiny gaps, near-uniform weights produce near-zero conviction, vintage > 1 renders, and the tension indicator correctly returns null when no condition is met.

---

## PART 6: AUTOMATED TESTS

Create file: `src/compute.test.ts`

Write unit tests for every pure function. At minimum, cover:

### Dominance classification (10 cases):
1. `[0.34, 0.30, 0.21, 0.15]` n=4 => "Contested"
2. `[0.55, 0.20, 0.15, 0.10]` n=4 => "Dominant"
3. `[0.36, 0.34, 0.20, 0.10]` n=4 => "Contested"
4. `[0.26, 0.25, 0.25, 0.24]` n=4 => "Diffuse"
5. `[0.40, 0.25, 0.20, 0.15]` n=4 => "Leading"
6. `[0.50, 0.30, 0.20]` n=3 => "Leading" (p1=0.50 < 2/3=0.667)
7. `[0.70, 0.20, 0.10]` n=3 => "Dominant" (p1=0.70 >= 0.667, gap=0.50)
8. `[0.22, 0.21, 0.20, 0.19, 0.18]` n=5 => "Contested" (gap=0.01)
9. `[0.45, 0.30, 0.15, 0.10]` n=4 => "Leading" (p1=0.45 < 0.50, gap=0.15 but not >= 2/n)
10. `[0.35, 0.35, 0.20, 0.10]` n=4 => "Contested" (gap=0.00)

### Conviction (4 cases):
1. `[0.25, 0.25, 0.25, 0.25]` => 0.0
2. `[0.34, 0.30, 0.21, 0.15]` => ~0.058
3. `[0.70, 0.20, 0.10]` => approximately 0.206 (verify with calculation)
4. `[0.97, 0.01, 0.01, 0.01]` => high value, > 0.60

### Skew (3 cases using BHP, TECHCO, DIFFUSE fixtures):
1. BHP: skewScore = 64
2. TECHCO: skewScore = 75
3. DIFFUSE: skewScore = 61

### Momentum (5 cases from Part 4b):
1. p=0.34, p_prior=0.25, BULLISH, isLead=true => UP / "Building"
2. p=0.15, p_prior=0.25, BEARISH, isLead=false => DOWN / "Fading"
3. p=0.30, p_prior=0.28, NEUTRAL, isLead=true => FLAT / "Priced"
4. p=0.21, p_prior=0.22, BEARISH, isLead=false => FLAT / "Watching"
5. p=0.35, p_prior=0.28, BEARISH, isLead=true => UP / "Strengthening"

### Tension indicator (6 cases):
1. BHP fixture => CONTESTED LEAD (amber)
2. Construct a state with p=[0.55, 0.20, 0.15, 0.10], Dominant, conviction=0.38 => CLEAR SIGNAL (green)
3. Construct a state with T1 BEARISH, Leading => BEAR REGIME (red)
4. Construct a state with conviction < 0.05 and one delta > 0.05 => RAPID SHIFT (amber)
5. Construct a state with T1 UP arrow and proximity > 0.60 but NOT Contested => FRAGILE MOMENTUM (amber)
6. DIFFUSE fixture => null

### Validation (5 cases):
1. BHP fixture => no errors
2. Weights summing to 0.95 => error
3. One weight = 0 => error
4. Corporate domain evidence tagged HIGH => error
5. Only 1 tripwire => error

---

## PART 7: WIDGET COMPONENTS

Create four widget components and one audit drawer. Use React with TypeScript. Style with Tailwind utility classes. Use a dark theme.

### Colour System

Define these as constants and use them consistently:

- Background: slate-950 / #0B0F1A
- Card: slate-900 / #111827
- Card border: slate-800 / #1E293B
- Text primary: slate-200 / #E2E8F0
- Text muted: slate-400 / #94A3B8
- Text dim: slate-500 / #64748B
- Accent: blue-500 / #3B82F6
- BULLISH: emerald-500 / #10B981
- NEUTRAL: amber-500 / #F59E0B
- BEARISH: red-500 / #EF4444
- Tension amber: amber-500 / #F59E0B
- Tension red: red-500 / #EF4444
- Tension green: emerald-500 / #10B981

### Widget 1: PosteriorVector

Props: `{ metrics: DerivedMetrics; model: StockModel; onSelectHypothesis: (h: Hypothesis) => void }`

Structure:
1. Card header: "Hypothesis Posterior" left-aligned, "CANONICAL" badge right-aligned
2. **Narrative Tension Banner** (if `metrics.tension !== null`): Full-width banner below header, above hypothesis rows. Background = tension colour at 12% opacity. Left border = solid tension colour. Text = tension message. Label badge = tension label in tension colour. If tension is null, do not render this element at all.
3. Hypothesis rows (one per hypothesis, sorted by `metrics.sorted`):
   - Clickable (calls `onSelectHypothesis`)
   - Left side: stance-coloured code badge, hypothesis name, one-line `short` text
   - Right side: status label, status arrow character (↑/→/↓), weight as integer percentage in large font
   - Below text: proportional bar. Width = `(h.p / metrics.sorted[0].p) * 100%`. Colour = stance colour. Rendered on a 6px track with dark background.
4. Footer text: "Click any hypothesis to open the evidence audit trail"

### Widget 2: DominancePanel

Props: `{ metrics: DerivedMetrics }`

Structure:
1. Card header: "Dominance" left-aligned, dominance label badge right-aligned (colour: Dominant=green, Contested=amber, Diffuse=red, Leading=blue)
2. Metrics grid (2 columns):
   - Lead: code + name
   - Challenger: code + name
   - Top gap: integer points
   - Ratio: p1/p2 to 2 decimal places with multiplication sign
   - HHI: 3 decimal places
   - Conviction: value to 2 decimal places + convictionLabel in parentheses
3. Interpretation text in muted box: use the mechanically-selected sentence based on dominance label:
   - Dominant: "[code] commands the narrative with [gap] points of daylight. Evidence strongly concentrated."
   - Contested: "Narrative is contested. [code] leads by only [gap] points \u2013 insufficient for high-conviction positioning."
   - Diffuse: "Evidence has not separated the hypotheses. Near-uniform distribution. Await catalyst before positioning."
   - Leading: "[code] leads but has not broken away. [gap] point gap warrants moderate conviction only."

### Widget 3: RiskBalance

Props: `{ metrics: DerivedMetrics; model: StockModel }`

Structure:
1. Card header: "Risk Balance" left-aligned, skew score prominently displayed right-aligned (large font, colour: >= 60 green, <= 40 red, else amber). Format: "[score]/100".
2. Two horizontal bars side by side:
   - Constructive (labelled with codes joined by +): bar filled to constructive mass percentage, green, with percentage value
   - Downside (labelled with codes joined by +): bar filled to downside mass percentage, red, with percentage value
3. Skew display: signed integer points ("+28 pts" format), skew label
4. Interpretation text in muted box: mechanically selected sentence based on skew label:
   - Constructive: "Constructive balance. Downside mass at [X]% is manageable but not negligible."
   - Leaning Constructive: "Favourable balance, but downside still material at [X]%."
   - Balanced: "Balanced. Evidence does not favour either direction."
   - Leaning Downside: "Leaning downside. Bear theses carry [X]% of evidence weight."
   - Downside: "Downside-heavy. Evidence favours bear theses. Constructive case requires new catalysts."

### Widget 4: RegimeMap

Props: `{ metrics: DerivedMetrics; model: StockModel }`

Structure:
1. Card header: "Regime Transition Map" left-aligned, "Pre-committed triggers" right-aligned in muted text
2. Regime bar (horizontal, three columns):
   - Current regime: lead hypothesis code + name (coloured by stance)
   - Challenger: second hypothesis code + name (coloured by stance)
   - Contestability: proximity label + gap in points (colour: < 0.3 green, 0.3-0.6 amber, > 0.6 red)
3. Tripwire cards (one per tripwire from model.tripwires):
   - Header row: timeframe badge (blue), title, cadence in muted text
   - Two-column body split by a vertical border:
     - Left: "IF CONSTRUCTIVE" label (green), condition text, arrow + effect text (green)
     - Right: "IF ADVERSE" label (red), condition text, arrow + effect text (red)

### Widget 5: AuditDrawer

Props: `{ hypothesis: Hypothesis | null; metrics: DerivedMetrics; model: StockModel; onClose: () => void }`

Renders as a slide-in panel from the right (420px wide) with a backdrop overlay. If `hypothesis` is null, render nothing.

Structure:
1. Header:
   - "SHOW YOUR WORKING" in small caps, dim text
   - Hypothesis code badge + name (large)
   - Three metric boxes: Weight (percentage, large), Stance (coloured), Status (arrow + label)
   - Close button (X) top right
2. Diagnostic evidence section:
   - Label: "Diagnostic Evidence ([count] items)"
   - List of evidence items where `dir[hypothesis.code] !== 0`, sorted by `Math.abs(contribution[hypothesis.code])` descending (items without contribution sort to bottom)
   - Each item: title, direction badge ("Supports" green or "Contradicts" red), quality badge (coloured), domain, date, contribution value if present (formatted as "+0.22 Δlog-odds" with sign, coloured green/red)
   - Background tint: supporting items get green at 15% opacity, contradicting items get red at 15% opacity
3. Non-diagnostic evidence section:
   - Label: "Non-diagnostic ([count] items)"
   - List of evidence items where `dir[hypothesis.code] === 0`, rendered at 50% opacity
   - Each item: title, quality, domain, date. No contribution value.
4. Sparse evidence warning: if `model.evidence.length < 3`, show a prominent amber banner: "LIMITED EVIDENCE: [n] items assessed. Weights reflect preliminary assessment."

### Dashboard Layout

Props: `{ model: StockModel }`

Structure:
1. Header bar: "CONTINUUM INTELLIGENCE" small caps label, stock name large, price + ticker + date right-aligned. Gradient underline.
2. Grid (max-width 900px, centred):
   - Row 1: PosteriorVector (full width)
   - Row 2: DominancePanel (left half), RiskBalance (right half)
   - Row 3: RegimeMap (full width)
3. Footer: "Canonical state · [n] evidence items · [domains] domains · [n] hypotheses · No recalculation · Derived metrics only"
4. AuditDrawer: managed by state, opens when a hypothesis is clicked in PosteriorVector.

---

## PART 8: BUILD AND VERIFY SEQUENCE

Execute in this order. Do not skip steps.

1. Implement types (`src/types.ts`)
2. Implement domain ceiling map (`src/domainCeilings.ts`)
3. Implement validation (`src/validate.ts`)
4. Implement all pure computation functions (`src/compute.ts`)
5. Create all three fixtures (`src/fixtures.ts`)
6. Write and run all unit tests (`src/compute.test.ts`). **All tests must pass before proceeding.**
7. Build widget components
8. Render BHP fixture in the dashboard. Visually verify:
   - Posterior vector: T1 34%, T2 30%, T3 21%, T4 15%
   - Tension banner: CONTESTED LEAD (amber) with correct message
   - Dominance: "CONTESTED" badge, gap 4pts, conviction 0.06 (Low)
   - Risk balance: score 64/100, constructive 64%, downside 36%
   - Regime map: T1 current, T2 challenger, contestability Elevated
   - Click T1: audit drawer opens with 3 diagnostic items (e1, e2, e7) and 4 non-diagnostic (e3, e4, e5, e6)
9. Render TECHCO fixture. Visually verify:
   - Dominance: "LEADING" (not Dominant -- 0.55 < 0.667)
   - No tension indicator
   - Skew score: 75 (Constructive)
   - Proximity: Stable (gap 0.30 clamped to 0)
   - Sparse evidence warning in audit drawer
10. Render DIFFUSE fixture. Visually verify:
    - Dominance: "CONTESTED" (gap 0.01)
    - Conviction: 0.003 (Uninformative)
    - No tension indicator
    - All status arrows FLAT
    - 5 hypotheses render correctly in the posterior vector

---

## HARD RULES

1. No widget displays a probability vector different from canonical weights.
2. No derived metric uses inputs other than canonical weights and hypothesis metadata.
3. No classification label can be manually overridden.
4. No em-dashes anywhere. Use en-dashes (\u2013) or restructure sentences.
5. Australian English: analyse, colour, organisation, favour, defence.
6. All interpretation text is mechanically selected from templates. No free-text generation.
7. Validation rejects bad inputs. No silent normalisation.
8. Every function in compute.ts is pure. No side effects. No state. No DOM access.
9. The tension indicator evaluates conditions in priority order and returns the first match only. Never stack multiple indicators.
10. Initial coverage uses uniform prior (1/n) for all hypotheses. No exceptions.
