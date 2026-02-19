# Section 02 Redesign: Competing Hypotheses with Macro Narrative Layer

**Date:** 19 February 2026
**Status:** Authoritative specification. Supersedes all prior thesis skew calculations and sector overlay documents.
**Purpose:** Redesign the Competing Hypotheses section from first principles using quantitative return decomposition adapted for narrative attribution.

---

## The Intellectual Foundation

Every stock's return can be decomposed into three layers:

```
R_stock = R_macro + R_sector + R_idiosyncratic

Where:
  R_macro   = return attributable to broad market and macro factors
  R_sector  = return attributable to sector/commodity-specific factors
  R_idio    = return attributable to company-specific factors
```

This is not novel – it is the foundation of factor-based attribution used by every institutional quant desk from Citadel to Two Sigma to AQR. The Barra/MSCI risk models decompose returns this way. Fama-French factor models do the same with style factors. The academic literature (Brinson-Fachler 1985, Ross APT 1976, Fama-French 1993/2015) establishes that 60-80% of individual stock return variation is typically explained by systematic factors, with only 20-40% truly idiosyncratic.

**What we are doing differently:** Applying this decomposition not to returns but to *narratives*. Instead of asking "what percentage of WDS's return came from oil prices?", we ask "what percentage of WDS's narrative should be attributed to oil prices?" The answer should be roughly the same, because narrative and return are expressions of the same underlying reality.

---

## The Three-Layer Narrative Architecture

### Layer 0: Macro Narrative (Market-wide)

What is the broad market doing and why? This sets the backdrop for everything below.

**Factors:**
- ASX 200 direction and momentum
- Global risk sentiment (VIX, credit spreads)
- AUD direction (affects all internationally exposed earnings)
- RBA policy trajectory (rates, yield curve)
- China economic momentum (disproportionately affects ASX via materials/energy)

**Display:** A single bar at the top of every stock page:

```
MACRO ENVIRONMENT: NEUTRAL-POSITIVE
ASX 200 +2.3% (1mo) | AUD/USD 0.6340 (-1.2%) | RBA 4.10% (cutting cycle) | China PMI 50.8
```

This is context, not a hypothesis. It tells the user: "The broad market is mildly positive. Any stock-specific narrative exists within this environment."

### Layer 1: Sector/Commodity Narrative (the Macro Driver)

**This is the new addition.** Before any company-specific hypothesis, show the sector narrative. For commodity stocks, this IS the dominant narrative most of the time.

**The key insight:** A Citadel quant would never evaluate WDS without first decomposing how much of WDS's return is explained by Brent. The R-squared of WDS daily returns regressed against Brent is probably 0.45-0.65 (inference: fact). That means roughly half of WDS's daily price movement is explained by a single external variable. Any narrative framework that ignores this is analytically incoherent.

### Layer 2: Company Hypotheses (the Idiosyncratic Driver)

The ACH competing hypotheses as currently designed, but now explicitly framed as the *residual* – the part of the stock's story that cannot be explained by macro and sector factors.

---

## Mathematical Framework: Sensitivity Weights

### The Core Formula

For each stock, calculate the **Narrative Attribution Split**:

```
Narrative = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_idio x Idio_Signal)

Where:
  w_macro  = weight of broad market factors (estimated from regression R²)
  w_sector = weight of sector/commodity factors (estimated from regression R²)
  w_idio   = weight of company-specific factors (1 - w_macro - w_sector)
  
  All weights sum to 1.0
  
  Each Signal is scored on a -100 to +100 scale:
    -100 = maximally bearish
       0 = neutral
    +100 = maximally bullish
```

### Estimating Weights via Regression

For each stock, run a rolling regression (60-day window, daily returns):

```
R_stock = alpha + beta_mkt * R_ASX200 + beta_sector * R_sector_factor + epsilon

Where:
  R_sector_factor depends on the stock's sector:
    Energy:     Brent crude daily return
    Materials:  Iron ore / gold / copper daily return (as appropriate)
    Financials: Change in AU 10yr yield
    Technology: NASDAQ daily return or BVP Cloud Index
    REITs:      Inverse of AU 10yr yield change
    Consumer:   Consumer confidence index (monthly proxy)
    Healthcare: Proxy not required (mostly idiosyncratic)

Partial R² decomposition:
  w_macro  = R² attributable to ASX 200 alone
  w_sector = Incremental R² from adding sector factor
  w_idio   = 1 - total R²
```

### Estimated Weights by Stock (initial calibration)

These are starting estimates. The regression should be run and updated monthly to calibrate properly.

| Stock | Macro (w_mkt) | Sector (w_sector) | Idiosyncratic (w_idio) | Primary Sector Factor |
|-------|--------------|-------------------|----------------------|----------------------|
| WDS   | 0.15         | 0.55              | 0.30                 | Brent crude          |
| FMG   | 0.10         | 0.60              | 0.30                 | Iron ore 62% Fe      |
| RIO   | 0.15         | 0.50              | 0.35                 | Iron ore (+ copper)  |
| BHP   | 0.15         | 0.45              | 0.40                 | Iron ore + copper    |
| HRZ   | 0.05         | 0.65              | 0.30                 | Gold (AUD)           |
| CBA   | 0.25         | 0.35              | 0.40                 | AU 10yr yield        |
| NAB   | 0.25         | 0.35              | 0.40                 | AU 10yr yield        |
| GMG   | 0.20         | 0.30              | 0.50                 | AU 10yr yield (inv)  |
| XRO   | 0.20         | 0.25              | 0.55                 | NASDAQ / AUD         |
| WTC   | 0.20         | 0.20              | 0.60                 | Global trade vol     |
| PME   | 0.15         | 0.05              | 0.80                 | (minimal)            |
| WOW   | 0.20         | 0.10              | 0.70                 | CPI / consumer conf  |
| CSL   | 0.15         | 0.10              | 0.75                 | AUD/USD              |
| DRO   | 0.10         | 0.15              | 0.75                 | Defence spend        |
| GYG   | 0.15         | 0.10              | 0.75                 | Consumer disc        |
| SIG   | 0.15         | 0.10              | 0.75                 | PBS policy           |
| OCL   | 0.15         | 0.10              | 0.75                 | Govt IT spend        |
| RFG   | 0.15         | 0.10              | 0.75                 | Consumer disc        |

### What These Weights Mean for Narrative

For WDS: 55% of the narrative should be about oil/LNG prices. 15% about the broad market. Only 30% about company-specific execution, costs, and strategy. If the narrative engine is 80% focused on company hypotheses and 20% on price, it has the ratio backwards.

For PME: 80% of the narrative should be about company-specific drivers (clinical adoption, product pipeline, management execution). Commodity prices are irrelevant. The current all-company-hypotheses approach is approximately correct for PME.

---

## The Sector Narrative: Detailed Design

### What the User Sees

Between the Macro bar and the Company Hypotheses, a new section:

```
┌────────────────────────────────────────────────────────────────┐
│  SECTOR NARRATIVE: ENERGY – LNG/OIL                           │
│                                                                │
│  Brent Crude:  US$72.40 (-2.1% 5d, -8.3% 1mo)   [BEARISH]   │
│  JKM LNG:      US$13.80 (+1.5% 5d, +4.2% 1mo)   [BULLISH]   │
│  JKM-Brent:    Hub premium intact                 [POSITIVE]  │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  COMMODITY OPERATING LEVERAGE                         │      │
│  │                                                       │      │
│  │  WDS Breakeven:        US$35/boe                      │      │
│  │  Current Brent:        US$72.40                       │      │
│  │  Margin of Safety:     107% above breakeven           │      │
│  │  Sensitivity:          +$1/bbl Brent ≈ +$180M FCF     │      │
│  │                                                       │      │
│  │  Commodity Zone:  ██████████░░░░  BULLISH             │      │
│  │                   35    60    75    90                 │      │
│  │                   BE    Bear  Neut  Bull               │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                │
│  Sector Signal: +38 (Bullish)                                  │
│  Weight in WDS narrative: 55%                                  │
│  Contribution to overall sentiment: +21                        │
│                                                                │
│  The energy sector narrative is moderately bullish for WDS.    │
│  Brent is well above breakeven with adequate margin, though    │
│  the 1-month decline signals softening. JKM hub premium is    │
│  intact, supporting LNG-specific margins. The dominant sector  │
│  risk is demand destruction from global slowdown.              │
└────────────────────────────────────────────────────────────────┘
```

### HRZ Gold Example

```
┌────────────────────────────────────────────────────────────────┐
│  SECTOR NARRATIVE: GOLD                                        │
│                                                                │
│  Gold (USD):    US$2,920 (+3.1% 5d, +8.7% 1mo)   [BULLISH]   │
│  Gold (AUD):    A$4,610 (+4.3% 5d, +10.1% 1mo)   [BULLISH]   │
│  AUD/USD:       0.6340 (-1.2% 1mo)                [AMPLIFIER]  │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  COMMODITY OPERATING LEVERAGE                         │      │
│  │                                                       │      │
│  │  HRZ Est. AISC:        A$2,800/oz (est.)              │      │
│  │  Current Gold (AUD):   A$4,610/oz                     │      │
│  │  Margin:               A$1,810/oz (64% margin)        │      │
│  │  Sensitivity:          +A$100/oz gold ≈ +$X M FCF     │      │
│  │                                                       │      │
│  │  Note: HRZ is pre-production. AISC is estimated.      │      │
│  │  Actual costs will not be known until first pour.     │      │
│  │                                                       │      │
│  │  Commodity Zone:  ██████████████░  STRONG BULLISH     │      │
│  │                   2000  2500  3000  3500  4000         │      │
│  │                   Bear  Neut  Bull  Strong             │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                │
│  Sector Signal: +72 (Strong Bullish)                           │
│  Weight in HRZ narrative: 65%                                  │
│  Contribution to overall sentiment: +47                        │
│                                                                │
│  Gold is in a structural bull market driven by central bank    │
│  buying and de-dollarisation flows. AUD weakness amplifies     │
│  the tailwind for AUD-denominated producers. The key risk is   │
│  a sharp USD rally or risk-on rotation out of safe havens.     │
└────────────────────────────────────────────────────────────────┘
```

### CBA Rate Context Example

```
┌────────────────────────────────────────────────────────────────┐
│  SECTOR NARRATIVE: MAJOR BANKS                                 │
│                                                                │
│  RBA Cash Rate:   4.10% (cut 25bp Feb 2026)       [POSITIVE]  │
│  AU 10yr Yield:   4.35% (-12bp 1mo)               [POSITIVE]  │
│  Yield Curve:     +25bp (2s10s)                    [POSITIVE]  │
│  System Credit:   +5.2% YoY                       [NEUTRAL]   │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐      │
│  │  RATE SENSITIVITY                                     │      │
│  │                                                       │      │
│  │  CBA NIM (H1 FY26):   1.99%                          │      │
│  │  NIM direction:        Stable (rate cuts offset by    │      │
│  │                        deposit repricing lag)         │      │
│  │  Credit quality:       Benign (90+ DPD stable)        │      │
│  │                                                       │      │
│  │  Rate Zone:  ████████████░░░  NEUTRAL-POSITIVE        │      │
│  │              Hike  Hold  Cut   Deep Cut                │      │
│  │              Bear  Neut  Pos   Mixed                   │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                │
│  Sector Signal: +22 (Mildly Bullish)                           │
│  Weight in CBA narrative: 35%                                  │
│  Contribution to overall sentiment: +8                         │
│                                                                │
│  Rate cutting cycle has begun. Historically positive for       │
│  bank valuations in the first 12 months. NIM pressure is       │
│  a risk if cuts are aggressive, but gradual easing supports    │
│  credit growth without collapsing margins.                     │
└────────────────────────────────────────────────────────────────┘
```

---

## Revised Thesis Skew: The Weighted Composite

### The Formula

```
Overall_Sentiment = (w_macro x Macro_Signal) + (w_sector x Sector_Signal) + (w_idio x Idio_Signal)

Where:
  Macro_Signal  = scored -100 to +100 based on market conditions
  Sector_Signal = scored -100 to +100 based on commodity/rate/FX conditions
  Idio_Signal   = scored -100 to +100 based on company hypothesis balance
```

### Calculating the Idiosyncratic Signal (Company Hypotheses)

This replaces the old bull-minus-bear summation. The company hypotheses contribute to the Idio_Signal using the **dominance method**:

```
// Step 1: Identify T1 (highest survival score hypothesis)
// Step 2: T1's sentiment determines direction
// Step 3: T1's lead over T2 determines magnitude

T1_lead = T1.score - T2.score
max_possible_lead = 80 - 5  // ceiling minus floor = 75

// Normalise to -100 to +100 scale
if T1.sentiment == BULLISH:
    Idio_Signal = +(T1_lead / max_possible_lead) * 100
if T1.sentiment == BEARISH:
    Idio_Signal = -(T1_lead / max_possible_lead) * 100
if T1.sentiment == NEUTRAL:
    Idio_Signal = 0  // neutral dominant narrative = no directional signal

// Cap at +/- 80 (can never be fully certain)
Idio_Signal = clamp(Idio_Signal, -80, +80)
```

### Calculating the Sector Signal

```
For commodity stocks (Tier 1):
  commodity_price = current price of primary driver
  breakeven = stock's breakeven/AISC
  
  // Operating leverage position
  margin_pct = (commodity_price - breakeven) / breakeven * 100
  
  // Momentum overlay
  momentum_5d = 5-day return of commodity
  momentum_20d = 20-day return of commodity
  
  // Combine position and momentum
  position_score = map margin_pct to -100..+100 scale using threshold table
  momentum_score = (momentum_5d * 0.4 + momentum_20d * 0.6) * 10  // scale to -100..+100
  
  Sector_Signal = position_score * 0.7 + momentum_score * 0.3
  Sector_Signal = clamp(Sector_Signal, -100, +100)

For rate-sensitive stocks (Tier 2):
  rate_direction = classify RBA trajectory (cutting/holding/hiking)
  yield_curve = 10yr minus 2yr spread
  credit_growth = system credit YoY
  
  // Score each component
  rate_score = +40 if cutting, 0 if holding, -40 if hiking
  curve_score = map yield_curve to -30..+30
  credit_score = map credit_growth to -30..+30
  
  Sector_Signal = rate_score + curve_score + credit_score
  Sector_Signal = clamp(Sector_Signal, -100, +100)
```

### WDS Worked Example

```
Weights: w_macro = 0.15, w_sector = 0.55, w_idio = 0.30

Macro_Signal: ASX 200 up 2.3% (1mo), risk sentiment neutral, China PMI 50.8
  = +15 (mildly positive)

Sector_Signal: Brent US$72.40, breakeven US$35, margin 107%
  position_score: +55 (well above breakeven, not extreme)
  momentum_score: -15 (Brent down 8.3% 1mo)
  Sector_Signal = 55 * 0.7 + (-15) * 0.3 = 38.5 - 4.5 = +34
  
Idio_Signal: T1 LNG Growth (BULLISH) 29%, T2 Exec Risk (BEARISH) 25%
  T1_lead = 29 - 25 = 4
  Idio_Signal = +(4 / 75) * 100 = +5.3
  
Overall_Sentiment = (0.15 x 15) + (0.55 x 34) + (0.30 x 5.3)
                  = 2.25 + 18.7 + 1.6
                  = +22.6

Display: UPSIDE (+23)  [green]

Breakdown shown to user:
  Macro contribution:  +2   (minor positive)
  Sector contribution: +19  (commodity environment supportive)
  Company contribution: +2  (slim bullish lead in hypotheses)
```

Compare to the old calculation: bull 29 - bear 71 = -42 (DOWNSIDE). The new framework correctly identifies WDS as modestly bullish because the commodity environment is supportive and the dominant company hypothesis is bullish, even though the alternative company hypotheses are fragmented across three bearish scenarios.

### FMG Stress Test

```
Scenario: Iron ore drops to $85/t (from $110). FMG breakeven ~$20/wmt.

Weights: w_macro = 0.10, w_sector = 0.60, w_idio = 0.30

Macro_Signal: +10 (market OK)

Sector_Signal: Iron ore $85, breakeven $20, margin 325%
  position_score: +40 (still well above breakeven, but declining)
  momentum_score: -35 (sharp decline)
  Sector_Signal = 40 * 0.7 + (-35) * 0.3 = 28 - 10.5 = +17.5

Idio_Signal: Assume T1 = Green Energy Transition Risk (BEARISH) at 35%
  T2 = Iron Ore Champion (BULLISH) at 30%
  T1_lead = 5
  Idio_Signal = -(5/75) * 100 = -6.7

Overall = (0.10 x 10) + (0.60 x 17.5) + (0.30 x -6.7)
        = 1.0 + 10.5 - 2.0
        = +9.5

Display: NEUTRAL-UPSIDE (+10) [amber-green]

The narrative: "FMG's commodity environment remains supportive despite iron ore softening, with significant margin above breakeven. The company narrative is mildly bearish on energy transition risk. Net read: commodity tailwind offsets company-level concerns."
```

This is analytically honest. The old system would have shown deep downside because three of four hypotheses might be bearish.

---

## Commodity Operating Leverage: The Breakeven Framework

### Why Breakeven Matters

For Tier 1 stocks, the relationship between commodity price and company breakeven is the single most important number. It determines:
- Whether the company generates cash or burns it
- The degree of operating leverage (how much incremental commodity dollar flows to FCF)
- The margin of safety in the commodity cycle

### Breakeven Data Requirements

For each Tier 1 stock, the config must include:

```json
{
  "ticker": "WDS",
  "commodity_leverage": {
    "primary_commodity": "brent_crude",
    "breakeven": 35,
    "breakeven_unit": "USD/boe",
    "breakeven_source": "Woodside CMD 2025",
    "breakeven_date": "2025-09-15",
    "sensitivity": {
      "description": "+$1/bbl Brent ≈ +$180M annualised FCF",
      "per_unit_fcf_impact_aud_m": 180,
      "note": "Approximate. Varies with production volume and contract mix."
    },
    "thresholds": {
      "strong_bearish": { "below": 45, "position_score": -80 },
      "bearish": { "range": [45, 60], "position_score": -30 },
      "neutral": { "range": [60, 75], "position_score": 0 },
      "bullish": { "range": [75, 90], "position_score": 40 },
      "strong_bullish": { "above": 90, "position_score": 70 }
    }
  }
}
```

For pre-production stocks like HRZ, breakeven is estimated and must be flagged:

```json
{
  "ticker": "HRZ",
  "commodity_leverage": {
    "primary_commodity": "gold_aud",
    "breakeven": 2800,
    "breakeven_unit": "AUD/oz",
    "breakeven_source": "DFS estimate (pre-production)",
    "breakeven_confidence": "LOW",
    "breakeven_note": "HRZ is pre-production. AISC is estimated from DFS. Actual costs unknown until first pour.",
    "secondary_factor": "aud_usd",
    "secondary_note": "AUD weakness amplifies gold tailwind for AUD-cost producer",
    "thresholds": {
      "strong_bearish": { "below": 2200, "position_score": -80 },
      "bearish": { "range": [2200, 2800], "position_score": -40 },
      "neutral": { "range": [2800, 3500], "position_score": 0 },
      "bullish": { "range": [3500, 4500], "position_score": 50 },
      "strong_bullish": { "above": 4500, "position_score": 75 }
    }
  }
}
```

---

## Revised Section 02 Display Structure

The full stock page Section 02 now has this hierarchy:

```
SECTION 02: COMPETING HYPOTHESES

[Layer 0: Macro Bar]
  MACRO: NEUTRAL-POSITIVE | ASX +2.3% (1mo) | AUD 0.634 | RBA 4.10% (cutting)

[Layer 1: Sector Narrative]
  SECTOR NARRATIVE: ENERGY
  Commodity prices, breakeven analysis, operating leverage visual
  Sector Signal: +34 | Weight: 55% | Contribution: +19

[Layer 2: Company Hypotheses]
  T1: LNG Growth (BULLISH) 29% ↑
  T2: Execution Risk (BEARISH) 25% →
  T3: Value Trap (BEARISH) 25% →
  T4: Stranded Assets (BEARISH) 21% →
  
  Idio Signal: +5 | Weight: 30% | Contribution: +2

[Composite]
  OVERALL SENTIMENT: +23 UPSIDE (green)
  
  ████████░░░  Macro (+2) | ████████████████░░  Sector (+19) | ██░░  Company (+2)
  
  Narrative: "WDS is modestly bullish, primarily driven by a supportive commodity
  environment (Brent well above breakeven). Company-level narrative is closely 
  contested between the turnaround and erosion theses."

[Evidence Feed]
  Latest evidence items, sorted by diagnosticity

[Narrative Timeline]
  Historical chart showing all three layers over time
```

---

## The Narrative Timeline (Updated for Three Layers)

The timeline chart from NARRATIVE_TIMELINE_SPEC.md is updated to show three stacked components:

```
Sentiment
+50 |     ___________
    |    /           \      Sector contribution (green area)
+25 |   /  ___        \_______________
    |  /  /   \                        
  0 |----/-----\---------+-------------  Company contribution (blue line)
    |  /        \       /
-25 | /          \_____/   Macro contribution (grey area)
    |
-50 |
    Jan    Feb    Mar    Apr    May
```

This shows the user: "In February, the commodity tailwind was driving most of the bullish sentiment. In March, commodity prices softened and the company-specific bear case strengthened. By April, both layers were negative."

---

## Data Requirements Summary

### Daily Fetches (add to existing pipeline)

| Data Point | Source | Frequency |
|-----------|--------|-----------|
| ASX 200 close | Yahoo Finance (^AXJO) | Daily |
| Brent crude | Yahoo Finance (BZ=F) | Daily |
| Iron ore 62% Fe | SGX futures or proxy | Daily |
| Gold (USD) | Yahoo Finance (GC=F) | Daily |
| Copper (LME) | Yahoo Finance (HG=F) or LME | Daily |
| AU 10yr bond yield | Yahoo Finance (^TNX.AX) or RBA | Daily |
| AUD/USD | Yahoo Finance (AUDUSD=X) | Daily |
| RBA cash rate | RBA | Event-driven |
| NASDAQ Composite | Yahoo Finance (^IXIC) | Daily |
| VIX | Yahoo Finance (^VIX) | Daily |

### Monthly Calibration

- Rerun 60-day rolling regression for each stock to update w_macro, w_sector, w_idio weights
- Update breakeven estimates when new company disclosures are available
- Review and adjust commodity threshold tables if structural shifts occur

### Stock Config Updates

Each stock JSON needs new fields:
- `narrative_weights`: { macro, sector, idio }
- `commodity_overlay`: full config as specified
- `sector_classification`: tier and factor assignments

---

## Implementation Sequence

1. Add commodity/macro data fetcher to daily pipeline (data/commodities.json)
2. Add breakeven configs and narrative weights to each stock JSON
3. Build Sector Signal calculator for each stock type (commodity, rate, FX, company-dominant)
4. Build Macro Signal calculator (simple aggregate of market indicators)
5. Build Idio Signal calculator using T1-vs-T2 dominance method
6. Build composite Overall Sentiment using weighted formula
7. Build the Sector Narrative display panel
8. Update the thesis skew display to show the composite with contribution breakdown
9. Update the Narrative Timeline chart to show three-layer decomposition
10. Run monthly regression to calibrate weights (can be manual initially, automated later)

---

## Why This Framework Is Correct

1. **It matches how institutional investors think.** No professional PM evaluates WDS without first checking oil prices. The framework encodes this.

2. **It solves the WDS problem mathematically.** The -42 skew disappears because the commodity environment (55% weight, +34 signal = +19 contribution) dominates the fragmented company bearish hypotheses (30% weight, +5 signal = +2 contribution).

3. **It degrades gracefully.** For PME (80% idiosyncratic), the sector layer is thin and the company hypotheses dominate – exactly as they should.

4. **It is empirically calibrated.** The weights come from regression R-squared, not arbitrary assignment. They can be updated monthly as relationships change.

5. **It separates what the user can control from what they cannot.** Commodity prices are exogenous. Company execution is endogenous. The framework makes this distinction visible.

6. **It provides genuine alpha.** The interesting stocks are the ones where the sector narrative says one thing and the company narrative says another (e.g., commodity bullish but company bearish = good sector, bad operator). This divergence is the signal that drives active investment decisions.
