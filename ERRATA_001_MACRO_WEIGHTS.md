# Errata 001: Macro Signal Overweighting Fix

**Date:** 19 February 2026
**Applies to:** MASTER_IMPLEMENTATION_INSTRUCTIONS.md (Step 2.1, Step 2.4), SECTION02_REDESIGN.md (weight table), ASX200_SECTOR_NARRATIVE_MODELS.md (default weights)
**Status:** MANDATORY. Apply these corrections before any further implementation.

---

## Problem Statement

With today's market conditions (ASX 200 +3.2% 1mo, VIX 19.6, AUD +4.6%, RBA cutting gradually), the Macro Signal produces +40 to +50. This is a benign, mildly positive environment, not euphoria. The signal is too loud because:

1. Each component's scoring bands are too generous for normal conditions
2. Components stack additively without dampening
3. The resulting high signal, even multiplied by modest w_macro, dominates the composite for company-driven stocks

Observed on live site: DRO shows Macro (+4) out of total +7 = 57% macro contribution. BHP shows Macro (+6) out of total -6. For a defence contract company with zero commodity/rate sensitivity and 60% retail register, macro should contribute 5-15% of total sentiment, not 57%.

---

## Fix A: Compress the Macro Signal Scoring

**REPLACE** the Macro Signal calculation in MASTER_IMPLEMENTATION_INSTRUCTIONS.md Step 2.1 with:

```
ASX 200 momentum score:
  20d return > +8%   --> +15
  20d return +3-8%   --> +8
  20d return -3-+3%  --> 0
  20d return -8--3%  --> -8
  20d return < -8%   --> -15

Risk sentiment score:
  VIX < 13           --> +8
  VIX 13-18          --> +4
  VIX 18-25          --> 0
  VIX 25-32          --> -8
  VIX > 32           --> -15

AUD direction score:
  AUD 20d change > +5%  --> +7
  AUD 20d change -5-+5% --> 0
  AUD 20d change < -5%  --> -7

RBA policy score:
  Cutting aggressively (>75bp remaining) --> +8
  Cutting gradually (25-75bp remaining)  --> +4
  On hold                                --> 0
  Hiking                                 --> -8

China PMI score:
  PMI > 52   --> +7
  PMI 50-52  --> +4
  PMI 48-50  --> -4
  PMI < 48   --> -10

Macro_Signal = ASX_score + Risk_score + AUD_score + RBA_score + China_score
Capped at -50 and +50.  (NOT -100/+100)
```

**Design rationale:**

The Macro Signal now ranges from -50 to +50, not -100 to +100. This is deliberate. Macro is context, not conviction. The theoretical maximum (+45) requires everything to be firing simultaneously: ASX surging, VIX at decade lows, AUD screaming higher, aggressive rate cuts, China booming. That happens perhaps once every 5-7 years. Normal benign conditions (today's market) should produce +10 to +20.

**Today's market recalculated:**
- ASX +3.2% (1mo) = +8
- VIX 19.6 = 0
- AUD +4.6% = 0 (within +/-5% band)
- RBA cutting gradually = +4
- China PMI (assume 50.5) = +4
- **Macro_Signal = +16**

That is a mildly positive macro backdrop. Correct.

**Stress test – March 2020 conditions:**
- ASX -25% (1mo) = -15
- VIX 65 = -15
- AUD -12% = -7
- RBA emergency cuts = +8
- China PMI 35 = -10
- **Macro_Signal = -39**

Severe stress, but not maxed. Correct – even in crisis, macro alone shouldn't drive the full -50 because the emergency rate response partially offsets.

**Stress test – euphoria conditions:**
- ASX +12% (1mo) = +15
- VIX 11 = +8
- AUD +7% = +7
- RBA cutting 100bp = +8
- China PMI 54 = +7
- **Macro_Signal = +45**

Near-maximum. Rare. Correct.

---

## Fix B: Revised Weight Table

**REPLACE** the weight table in SECTION02_REDESIGN.md and the corresponding weights in MASTER_IMPLEMENTATION_INSTRUCTIONS.md with:

### Tier 1: Commodity-Dominated (R_sector explains >40% of return variance)

| Stock | w_macro | w_sector | w_idio | Primary Sector Factor | Rationale |
|-------|---------|----------|--------|----------------------|-----------|
| WDS   | 0.10    | 0.55     | 0.35   | Brent / JKM LNG     | Pure play LNG producer |
| FMG   | 0.08    | 0.60     | 0.32   | Iron ore 62% Fe      | Single commodity, pure play |
| HRZ   | 0.05    | 0.65     | 0.30   | Gold (AUD)           | Pre-production gold, almost entirely gold price |

### Tier 2: Commodity-Significant (R_sector explains 25-40%)

| Stock | w_macro | w_sector | w_idio | Primary Sector Factor | Rationale |
|-------|---------|----------|--------|----------------------|-----------|
| RIO   | 0.10    | 0.50     | 0.40   | Iron ore + copper    | Diversified but iron ore dominant |
| BHP   | 0.10    | 0.45     | 0.45   | Iron ore + copper    | Most diversified miner |

### Tier 3: Rate/Cycle Sensitive (R_sector explains 20-35%)

| Stock | w_macro | w_sector | w_idio | Primary Sector Factor | Rationale |
|-------|---------|----------|--------|----------------------|-----------|
| CBA   | 0.15    | 0.35     | 0.50   | AU 10yr yield        | Major bank, rate cycle matters but franchise dominates |
| NAB   | 0.15    | 0.35     | 0.50   | AU 10yr yield        | Major bank |
| GMG   | 0.12    | 0.30     | 0.58   | AU 10yr yield (inv)  | REIT/developer, rate-sensitive but execution story |

### Tier 4: Moderate External Sensitivity (R_sector explains 10-25%)

| Stock | w_macro | w_sector | w_idio | Primary Sector Factor | Rationale |
|-------|---------|----------|--------|----------------------|-----------|
| XRO   | 0.10    | 0.20     | 0.70   | NASDAQ / AUD         | SaaS, global but strong company drivers |
| WTC   | 0.10    | 0.15     | 0.75   | Global trade volumes | Logistics tech, trade-exposed but execution story |
| WOW   | 0.08    | 0.07     | 0.85   | CPI / consumer conf  | Defensive staple, minimal external sensitivity |
| CSL   | 0.08    | 0.07     | 0.85   | AUD/USD              | Translation effect only, business is idiosyncratic |

### Tier 5: Company-Dominant (R_sector explains <10%)

| Stock | w_macro | w_sector | w_idio | Primary Sector Factor | Rationale |
|-------|---------|----------|--------|----------------------|-----------|
| PME   | 0.05    | 0.03     | 0.92   | (minimal)            | Medtech pure play, product adoption driven |
| DRO   | 0.05    | 0.03     | 0.92   | Defence budget       | Contract-driven, 60% retail register, lumpy |
| GYG   | 0.05    | 0.05     | 0.90   | Consumer disc        | Fast food, idiosyncratic growth story |
| SIG   | 0.05    | 0.05     | 0.90   | PBS policy           | Pharmacy, regulatory-driven not macro |
| OCL   | 0.05    | 0.03     | 0.92   | Govt IT spend        | Gov contracts, execution-driven |
| RFG   | 0.05    | 0.05     | 0.90   | Consumer disc        | QSR franchise, execution story |

### Key Changes from Prior Table

| Stock | Old w_macro | New w_macro | Old w_sector | New w_sector | Old w_idio | New w_idio |
|-------|------------|------------|-------------|-------------|-----------|-----------|
| DRO   | 0.10       | **0.05**   | 0.15        | **0.03**    | 0.75      | **0.92**  |
| PME   | 0.15       | **0.05**   | 0.05        | **0.03**    | 0.80      | **0.92**  |
| GYG   | 0.15       | **0.05**   | 0.10        | **0.05**    | 0.75      | **0.90**  |
| SIG   | 0.15       | **0.05**   | 0.10        | **0.05**    | 0.75      | **0.90**  |
| OCL   | 0.15       | **0.05**   | 0.10        | **0.03**    | 0.75      | **0.92**  |
| RFG   | 0.15       | **0.05**   | 0.10        | **0.05**    | 0.75      | **0.90**  |
| WOW   | 0.20       | **0.08**   | 0.10        | **0.07**    | 0.70      | **0.85**  |
| CSL   | 0.15       | **0.08**   | 0.10        | **0.07**    | 0.75      | **0.85**  |
| WTC   | 0.20       | **0.10**   | 0.20        | **0.15**    | 0.60      | **0.75**  |
| WDS   | 0.15       | **0.10**   | 0.55        | 0.55        | 0.30      | **0.35**  |
| BHP   | 0.15       | **0.10**   | 0.45        | 0.45        | 0.40      | **0.45**  |
| RIO   | 0.15       | **0.10**   | 0.50        | 0.50        | 0.35      | **0.40**  |
| CBA   | 0.25       | **0.15**   | 0.35        | 0.35        | 0.40      | **0.50**  |
| NAB   | 0.25       | **0.15**   | 0.35        | 0.35        | 0.40      | **0.50**  |
| GMG   | 0.20       | **0.12**   | 0.30        | 0.30        | 0.50      | **0.58**  |
| XRO   | 0.20       | **0.10**   | 0.25        | **0.20**    | 0.55      | **0.70**  |
| FMG   | 0.10       | **0.08**   | 0.60        | 0.60        | 0.30      | **0.32**  |
| HRZ   | 0.05       | 0.05       | 0.65        | 0.65        | 0.30      | 0.30      |

### Design Principle

w_macro should never exceed 0.15 for any stock. The macro environment is context, not a driver. Even for banks where rate policy genuinely matters, the rate cycle is captured in the sector signal (Layer 1), not the macro signal (Layer 0). The macro layer captures only the broad market beta and risk environment.

The general rule: if a stock's return variance is 70%+ idiosyncratic, w_macro + w_sector should sum to no more than 0.10. For commodity stocks where sector genuinely dominates, w_macro + w_sector can reach 0.65-0.70, but w_macro itself stays at 0.05-0.10.

---

## Fix C: Updated Verification Test

**REPLACE** the WDS verification test in MASTER_IMPLEMENTATION_INSTRUCTIONS.md Step 2.4 with:

```
Verification test: Run WDS with these inputs:
  Macro_Signal: +16 (mildly positive, ASX up, RBA cutting)
  Sector_Signal: +34 (Brent $72.40, breakeven $35, 107% margin, but declining 1mo)
  Idio_Signal: +5 (T1 BULLISH 29% vs T2 BEARISH 25%)
  Weights: 0.10 / 0.55 / 0.35

  Expected: (0.10 x 16) + (0.55 x 34) + (0.35 x 5) = 1.6 + 18.7 + 1.75 = +22 (UPSIDE)
  Contribution: Macro (+2) | Sector (+19) | Company (+2)
  Macro is 9% of total. Sector is 83%. Company is 9%. Correct for a pure-play LNG producer.

Verification test: Run DRO with these inputs:
  Macro_Signal: +16
  Sector_Signal: 0 (defence budget is structural, not cyclical)
  Idio_Signal: +5 (T1 BULLISH 29% vs T2 26%, narrow lead)
  Weights: 0.05 / 0.03 / 0.92

  Expected: (0.05 x 16) + (0.03 x 0) + (0.92 x 5) = 0.8 + 0 + 4.6 = +5 (NEUTRAL)
  Contribution: Macro (+1) | Sector (0) | Company (+5)
  Macro is 17% of total. Company is 83%. Correct for a contract-driven defence company.

If DRO shows Macro contributing >25% of total sentiment, the weights are wrong.
```

---

## Fix D: Default Weights in ASX200_SECTOR_NARRATIVE_MODELS.md

Update the default weights in each Narrative Model to reflect the compressed macro range:

| Model Category | Old Default w_macro | New Default w_macro |
|---------------|--------------------|--------------------|
| ENERGY_*      | 0.15               | 0.10               |
| MATERIALS_*   | 0.10               | 0.08               |
| INDUSTRIALS_* | 0.10-0.20          | 0.05-0.10          |
| CONSUMER_*    | 0.15-0.25          | 0.05-0.08          |
| HEALTHCARE_*  | 0.15-0.20          | 0.05-0.08          |
| FINANCIALS_*  | 0.20-0.25          | 0.10-0.15          |
| IT_*          | 0.20               | 0.08-0.10          |
| COMMS_*       | 0.20               | 0.08-0.10          |
| UTILITIES_*   | 0.15-0.20          | 0.08-0.10          |
| REIT_*        | 0.20-0.25          | 0.10-0.12          |
| COMPANY_DOMINANT | 0.20            | 0.05               |
| INDUSTRIALS_DEFENCE | 0.10        | 0.05               |

The offsetting increase goes to w_idio in every case. Sector weights are largely unchanged because the sector signals were already appropriately calibrated.

---

## Summary of Changes

1. **Macro Signal range compressed from -100/+100 to -50/+50.** Tighter scoring bands mean normal conditions produce +10 to +20, not +40 to +50. Only genuine extremes (GFC-level stress, dot-com euphoria) push the signal beyond +/-35.

2. **w_macro reduced across all stocks.** Maximum 0.15 (banks only). Company-dominant stocks drop to 0.05. The macro layer is context, not a driver.

3. **Combined effect:** For DRO, macro contribution drops from +4 (57% of total) to +1 (17% of total). For BHP, macro drops from +6 to +2. For WDS, macro stays small at +2. The signal now correctly reflects that DRO is driven by contracts, WDS by oil, BHP by iron ore, and none of them primarily by the VIX or the ASX 200 index.

---

## Instructions to Developer

> Read ERRATA_001_MACRO_WEIGHTS.md. This patches the Macro Signal calculation and weight table in MASTER_IMPLEMENTATION_INSTRUCTIONS.md. Apply all four fixes (A through D) before proceeding with implementation. The errata values supersede the original document wherever they conflict.
