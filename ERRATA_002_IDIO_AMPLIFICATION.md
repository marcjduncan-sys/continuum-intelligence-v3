# Errata 002: The 40/60 Rule – External Cap and Idio Amplification

**Date:** 19 February 2026
**Applies to:** MASTER_IMPLEMENTATION_INSTRUCTIONS.md (Steps 2.2, 2.3, 2.4), SECTION02_REDESIGN.md (weight table), ERRATA_001_MACRO_WEIGHTS.md (weight table)
**Status:** MANDATORY. Supersedes all prior weight tables and the Idio Signal calculation.

---

## Problem Statement

Phase 2 verification passed the individual gate tests (WDS +11 UPSIDE, DRO +4 NEUTRAL) but revealed a structural flaw: commodity stocks have 70-92% of their composite driven by the sector signal. Two iron ore miners with opposite company narratives produce nearly identical composites. The company research – the entire point of the platform – is being suppressed.

This is a stock research tool. External factors provide context. Company-specific analysis provides differentiation and insight. The weighting must reflect this product reality.

---

## The 40/60 Rule

**External factors (macro + sector + technical combined) never exceed 40% of the composite weight. Company-specific research always gets at least 60%.**

This is a hard architectural constraint, not a guideline. It applies to every stock, including pure-play commodity names.

**Rationale:** If a user wants pure iron ore price exposure, they buy a futures contract. They are looking at FMG on this platform because they want to understand what FMG specifically is doing within that iron ore environment. The 60% floor guarantees the research always matters.

---

## Four-Component Weight Architecture

The composite now has four components instead of three:

```
Overall_Sentiment = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_tech x Tech_Signal) + (w_company x Company_Signal)

Where:
  w_macro + w_sector + w_tech + w_company = 1.00
  w_macro + w_sector + w_tech <= 0.40   (external cap)
  w_company >= 0.60                      (research floor)
```

The Technical component (w_tech) is the TA agent's reserved allocation. Until the TA agent is live, Tech_Signal = 0 and the technical weight contributes nothing. But the weight is reserved from day one so that when the TA agent comes online, it has a guaranteed seat at the table without requiring a weight rebalance.

---

## Authoritative Weight Table

This table supersedes ALL prior weight tables in SECTION02_REDESIGN.md, ERRATA_001_MACRO_WEIGHTS.md, ASX200_SECTOR_NARRATIVE_MODELS.md, and MASTER_IMPLEMENTATION_INSTRUCTIONS.md.

### Tier 1: Commodity Pure Play

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| FMG   | 0.05    | 0.25     | 0.10   | 0.60      | 0.40          | Iron ore 62% Fe |
| WDS   | 0.05    | 0.25     | 0.10   | 0.60      | 0.40          | Brent / JKM LNG |
| HRZ   | 0.05    | 0.25     | 0.10   | 0.60      | 0.40          | Gold (AUD) |

These stocks hit the 40% external cap. Commodity price genuinely drives 50-60% of return variance, but we deliberately allocate less to ensure the company research differentiates.

### Tier 2: Diversified Miners

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| BHP   | 0.05    | 0.20     | 0.10   | 0.65      | 0.35          | Iron ore + copper blend |
| RIO   | 0.05    | 0.20     | 0.10   | 0.65      | 0.35          | Iron ore + copper + aluminium |

More diversified operations create more idiosyncratic divergence from any single commodity. Higher company weight reflects this.

### Tier 3: Rate/Cycle Sensitive

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| CBA   | 0.08    | 0.17     | 0.10   | 0.65      | 0.35          | AU 10yr yield, yield curve |
| NAB   | 0.08    | 0.17     | 0.10   | 0.65      | 0.35          | AU 10yr yield, yield curve |
| GMG   | 0.08    | 0.17     | 0.10   | 0.65      | 0.35          | AU 10yr yield (inverted) |

Banks are rate-sensitive but franchise value, credit quality, and capital management create genuine company-level divergence. Higher macro weight (0.08) than commodity stocks because rate policy is a true macro variable, not a sector factor.

### Tier 4: Tech / SaaS

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| XRO   | 0.05    | 0.10     | 0.10   | 0.75      | 0.25          | NASDAQ / AUD |
| WTC   | 0.05    | 0.10     | 0.10   | 0.75      | 0.25          | Global trade volumes |

NASDAQ sentiment and growth discount rates matter but these are execution stories. Product adoption, ARR growth, and unit economics drive the thesis.

### Tier 5: Consumer / Defensive

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| WOW   | 0.05    | 0.05     | 0.10   | 0.80      | 0.20          | CPI / consumer confidence |
| GYG   | 0.05    | 0.05     | 0.10   | 0.80      | 0.20          | Consumer discretionary |
| RFG   | 0.05    | 0.05     | 0.10   | 0.80      | 0.20          | Consumer discretionary |

Minimal external sensitivity. These businesses are driven by execution, competitive position, and management quality.

### Tier 6: Company-Dominant

| Stock | w_macro | w_sector | w_tech | w_company | External Total | Primary Factor |
|-------|---------|----------|--------|-----------|---------------|----------------|
| PME   | 0.03    | 0.02     | 0.10   | 0.85      | 0.15          | (minimal) |
| DRO   | 0.03    | 0.02     | 0.10   | 0.85      | 0.15          | Defence budget (structural) |
| CSL   | 0.05    | 0.05     | 0.10   | 0.80      | 0.20          | AUD/USD translation |
| SIG   | 0.03    | 0.02     | 0.10   | 0.85      | 0.15          | PBS policy |
| OCL   | 0.03    | 0.02     | 0.10   | 0.85      | 0.15          | Govt IT spend |

Almost entirely idiosyncratic. Product pipeline, contract wins, regulatory decisions, and management execution dominate. External factors are background noise.

---

## Default Weights for New Stocks (ASX 200 Expansion)

When onboarding new stocks via the taxonomy in ASX200_SECTOR_NARRATIVE_MODELS.md, use these defaults by model category:

| Model Category | w_macro | w_sector | w_tech | w_company |
|---------------|---------|----------|--------|-----------|
| ENERGY_* | 0.05 | 0.25 | 0.10 | 0.60 |
| MATERIALS_IRON_ORE | 0.05 | 0.25 | 0.10 | 0.60 |
| MATERIALS_GOLD | 0.05 | 0.25 | 0.10 | 0.60 |
| MATERIALS_COPPER | 0.05 | 0.25 | 0.10 | 0.60 |
| MATERIALS_LITHIUM | 0.05 | 0.25 | 0.10 | 0.60 |
| MATERIALS_DIVERSIFIED_MINING | 0.05 | 0.20 | 0.10 | 0.65 |
| MATERIALS_CHEMICALS_PACKAGING | 0.05 | 0.10 | 0.10 | 0.75 |
| FINANCIALS_MAJOR_BANKS | 0.08 | 0.17 | 0.10 | 0.65 |
| FINANCIALS_INSURERS | 0.05 | 0.15 | 0.10 | 0.70 |
| FINANCIALS_DIVERSIFIED_ASSET_MGMT | 0.05 | 0.10 | 0.10 | 0.75 |
| REIT_* | 0.08 | 0.17 | 0.10 | 0.65 |
| IT_SOFTWARE_SAAS | 0.05 | 0.10 | 0.10 | 0.75 |
| COMMS_TELCO | 0.05 | 0.10 | 0.10 | 0.75 |
| COMMS_MEDIA_DIGITAL | 0.05 | 0.05 | 0.10 | 0.80 |
| CONSUMER_DISC_* | 0.05 | 0.05 | 0.10 | 0.80 |
| CONSUMER_STAPLES_* | 0.05 | 0.05 | 0.10 | 0.80 |
| HEALTHCARE_* | 0.05 | 0.05 | 0.10 | 0.80 |
| UTILITIES_* | 0.05 | 0.15 | 0.10 | 0.70 |
| INDUSTRIALS_INFRASTRUCTURE | 0.05 | 0.15 | 0.10 | 0.70 |
| INDUSTRIALS_ENGINEERING_CONSTRUCTION | 0.05 | 0.10 | 0.10 | 0.75 |
| INDUSTRIALS_DEFENCE | 0.03 | 0.02 | 0.10 | 0.85 |
| INDUSTRIALS_GENERAL | 0.03 | 0.02 | 0.10 | 0.85 |
| COMPANY_DOMINANT | 0.03 | 0.02 | 0.10 | 0.85 |

**Rule:** No stock's w_macro + w_sector + w_tech may exceed 0.40. If regression calibration suggests higher external weights, cap at 0.40 and redistribute to w_company.

---

## Idio Signal Amplification: Square-Root Scaling

**REPLACE** the linear Idio Signal calculation in MASTER_IMPLEMENTATION_INSTRUCTIONS.md Step 2.3 with:

### Old Calculation (REMOVE)

```
Idio_Signal = (T1_lead / max_possible_lead) x 100
```

### New Calculation (IMPLEMENT)

```
T1 = highest-scoring hypothesis
T2 = second-highest hypothesis
T1_lead = T1.survival_score - T2.survival_score
max_possible_lead = 75  (ceiling 80 minus floor 5)

Idio_Signal = sign(T1.sentiment) x sqrt(T1_lead / max_possible_lead) x 80

Where sign(T1.sentiment):
  BULLISH  → +1
  BEARISH  → -1
  NEUTRAL  → 0

Cap at -80 and +80.
```

### Why Square-Root

With 4 hypotheses sharing 100 points (floor 5, ceiling 80), typical T1-vs-T2 leads are 3-15 points. Linear scaling compresses these into ±4 to ±20, which gets crushed by even modest sector signals. Square-root amplification gives small leads meaningful voice:

| T1 Lead | Old Linear | New Sqrt | Interpretation |
|---------|-----------|---------|---------------|
| 3       | ±4.0      | ±16.0   | Narrow lead, mild conviction |
| 5       | ±6.7      | ±20.7   | Moderate lead |
| 8       | ±10.7     | ±26.1   | Clear lead |
| 12      | ±16.0     | ±32.0   | Strong conviction |
| 15      | ±20.0     | ±35.8   | Dominant narrative |
| 25      | ±33.3     | ±46.2   | Overwhelming |
| 40      | ±53.3     | ±58.4   | Near-certainty |

The curve flattens at high leads (diminishing returns on conviction) and steepens at low leads (amplifying differentiation where it matters most). This is the correct shape: the difference between "T1 leads by 5" and "T1 leads by 3" matters more than the difference between "T1 leads by 40" and "T1 leads by 38".

---

## Composite Calculation Update

**REPLACE** the composite formula in MASTER_IMPLEMENTATION_INSTRUCTIONS.md Step 2.4 with:

```
Overall_Sentiment = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_tech x Tech_Signal) + (w_company x Company_Signal)

Where:
  Macro_Signal ranges -50 to +50 (per Errata 001)
  Sector_Signal ranges -100 to +100
  Tech_Signal ranges -50 to +50 (placeholder, = 0 until TA agent is live)
  Company_Signal = Idio_Signal, ranges -80 to +80 (sqrt-scaled)

Display mapping:
  > +25   → STRONG UPSIDE (dark green)
  +8 to +25  → UPSIDE (green)
  -8 to +8   → NEUTRAL (amber)
  -25 to -8  → DOWNSIDE (red)
  < -25   → STRONG DOWNSIDE (dark red)

Contribution breakdown (display on UI):
  macro_contribution = round(w_macro x Macro_Signal)
  sector_contribution = round(w_sector x Sector_Signal)
  tech_contribution = round(w_tech x Tech_Signal)
  company_contribution = round(w_company x Company_Signal)
```

**Display the four-component contribution bar:**

```
████░░ Macro (+1) | ████████░░ Sector (+9) | ░░ Tech (0) | ████████████████░░ Company (+15)
```

When TA agent is live, the Tech segment will populate. Until then it shows zero.

---

## Updated Verification Tests

### Test 1: WDS (commodity pure play)

```
Inputs:
  Macro_Signal: +16
  Sector_Signal: +34
  Tech_Signal: 0
  Company_Signal (Idio): T1 BULLISH leads by 5 → sqrt(5/75) x 80 = +20.7
  Weights: 0.05 / 0.25 / 0.10 / 0.60

Composite: (0.05 x 16) + (0.25 x 34) + (0.10 x 0) + (0.60 x 20.7)
         = 0.8 + 8.5 + 0 + 12.4 = +22 (UPSIDE)

Contributions: Macro (+1, 5%) | Sector (+9, 41%) | Tech (0) | Company (+12, 55%)
```

Sector provides meaningful context (41%) but company research drives the majority (55%). Two iron ore stocks with different company narratives will diverge.

### Test 2: DRO (company-dominant)

```
Inputs:
  Macro_Signal: +16
  Sector_Signal: 0
  Tech_Signal: 0
  Company_Signal (Idio): T1 BULLISH leads by 3 → sqrt(3/75) x 80 = +16.0
  Weights: 0.03 / 0.02 / 0.10 / 0.85

Composite: (0.03 x 16) + (0.02 x 0) + (0.10 x 0) + (0.85 x 16.0)
         = 0.5 + 0 + 0 + 13.6 = +14 (UPSIDE)

Contributions: Macro (+1, 4%) | Sector (0, 0%) | Tech (0) | Company (+14, 96%)
```

Company research is 96% of the signal. Correct for a contract-driven defence business.

### Test 3: Differentiation (two iron ore miners, same sector, opposite company)

```
Miner A (executing well, T1 BULLISH leads by 10):
  Company_Signal = sqrt(10/75) x 80 = +29.2
  Composite: 0.8 + 8.5 + 0 + (0.60 x 29.2) = 0.8 + 8.5 + 17.5 = +27 (STRONG UPSIDE)

Miner B (distressed, T1 BEARISH leads by 8):
  Company_Signal = -sqrt(8/75) x 80 = -26.1
  Composite: 0.8 + 8.5 + 0 + (0.60 x -26.1) = 0.8 + 8.5 - 15.7 = -6 (NEUTRAL)

Spread: 33 points.
```

Same commodity environment, opposite company outcomes. The platform shows materially different views. This is the differentiation that makes the research valuable.

### Failure Conditions

- If any stock shows external factors (macro + sector + tech) contributing >45% of the composite magnitude, the weights are wrong.
- If two stocks in the same sector with opposite T1 sentiments produce composites within 10 points of each other, the idio amplification is insufficient.
- If DRO shows macro + sector contributing >10% of total, the company-dominant weights are wrong.

---

## Technical Signal Placeholder

Until the TA agent (DEV2_TA_AGENT_SPEC.md) is live and producing signals:

- Tech_Signal = 0 for all stocks
- w_tech = 0.10 is reserved but contributes nothing to the composite
- The contribution bar shows "Tech (0)" in grey
- When TA signals begin arriving via `data/ta-signals/{TICKER}.json`, they feed into the Tech_Signal calculation using the composite scoring from DEV1_V2_TA_INTEGRATION.md
- No weight rebalance is needed when TA goes live because the allocation was reserved from the start

---

## Monthly Regression Calibration (Updated)

The regression now calibrates four weights instead of three:

```
R_stock = alpha + beta_mkt x R_ASX200 + beta_sector x R_sector_factor + epsilon

Partial R² decomposition:
  r2_mkt = R² from ASX 200 alone
  r2_sector = incremental R² from adding sector factor
  r2_idio = 1 - total R²
  r2_tech is not regressed separately (reserved constant at 0.10)

Map to weights:
  raw_macro = r2_mkt
  raw_sector = r2_sector
  raw_company = r2_idio

Normalise raw_macro + raw_sector to sum to no more than 0.30 (leaving 0.10 for tech, 0.60+ for company):
  If raw_macro + raw_sector > 0.30:
    scale_factor = 0.30 / (raw_macro + raw_sector)
    w_macro = raw_macro x scale_factor
    w_sector = raw_sector x scale_factor
  Else:
    w_macro = raw_macro
    w_sector = raw_sector

  w_tech = 0.10 (always)
  w_company = 1.0 - w_macro - w_sector - w_tech

Enforce:
  w_company >= 0.60
  w_macro + w_sector + w_tech <= 0.40
  w_tech = 0.10 (constant)

Blend with model defaults: final = 0.70 x regression + 0.30 x default.
```

---

## Architecture Summary (Updated)

```
                    ┌──────────────────────────────────────────┐
                    │       OVERALL SENTIMENT (+22)             │
                    │  = Macro + Sector + Tech + Company       │
                    │                                          │
                    │  EXTERNAL (max 40%)  │  RESEARCH (min 60%)│
                    └──────────┬───────────────────────────────┘
                               │
       ┌───────────────────────┼──────────────────────────────┐
       │              │                │                       │
┌──────▼──────┐ ┌─────▼────────┐ ┌─────▼──────┐ ┌────────────▼─────────┐
│ MACRO       │ │ SECTOR       │ │ TECHNICAL  │ │ COMPANY              │
│ (Layer 0)   │ │ (Layer 1)    │ │ (Layer 1b) │ │ (Layer 2)            │
│             │ │              │ │            │ │                      │
│ ASX 200     │ │ Commodity/   │ │ TA Agent   │ │ ACH Hypotheses       │
│ VIX         │ │ Rate/FX      │ │ signals    │ │ T1 vs T2 dominance   │
│ AUD/USD     │ │ factor       │ │ (reserved) │ │ sqrt-amplified       │
│ RBA policy  │ │ per model    │ │            │ │ Price-as-evidence    │
│ China PMI   │ │              │ │            │ │ Volume confirmed     │
│             │ │              │ │            │ │ Overcorrection       │
│ -50 to +50  │ │ -100 to +100 │ │ -50 to +50 │ │ -80 to +80           │
│ w: 0.03-0.08│ │ w: 0.02-0.25 │ │ w: 0.10    │ │ w: 0.60-0.85         │
└─────────────┘ └──────────────┘ └────────────┘ └──────────────────────┘

Constraint: w_macro + w_sector + w_tech <= 0.40
            w_company >= 0.60
```

---

## Instructions to Developer

> Read ERRATA_002_IDIO_AMPLIFICATION.md. This supersedes the weight tables and Idio Signal calculation in all prior documents. Three changes:
>
> 1. Replace the linear Idio Signal scaling with the square-root function
> 2. Update all stock weights per the revised table (four components: macro, sector, tech, company)
> 3. The composite is now four-component with w_tech = 0.10 reserved (Tech_Signal = 0 until TA agent is live)
>
> Rerun Phase 2 verification gates including the new differentiation test: two stocks in the same sector with opposite company narratives must produce composites that differ by at least 20 points.
