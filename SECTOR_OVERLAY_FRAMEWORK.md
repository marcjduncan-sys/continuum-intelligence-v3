# Sector Overlay Framework – Commodity and Macro Drivers

**Date:** 19 February 2026
**Supplements:** NARRATIVE_FRAMEWORK_V3.md
**Problem:** The narrative engine evaluates all stocks on company-specific evidence only. For resource, energy, financial, and currency-exposed stocks, the dominant driver is often external (commodity price, interest rate, FX). Ignoring this produces incoherent narratives.

---

## The Principle

For every stock in the coverage universe, the engine must answer: **What percentage of this stock's price movement is explained by external factors vs company-specific factors?**

For WDS, the answer is roughly 60-70% external (Brent/LNG prices), 30-40% company-specific (execution, costs, project delivery). For PME, it's perhaps 10% external (USD/AUD, healthcare spending trends), 90% company-specific. The narrative engine must weight its evidence accordingly.

---

## Sector Classification and External Drivers

### Tier 1: Commodity-Dominated (>50% of price driven by external factors)

These stocks are primarily instruments for expressing a commodity or macro view. Company-specific analysis matters, but the commodity price is the dominant variable.

| Stock | External Driver(s) | Proxy | Sensitivity |
|-------|-------------------|-------|-------------|
| WDS | Brent crude, JKM (Asia LNG spot), TTF (Europe gas) | Brent front-month, JKM futures | HIGH – management guides breakeven mid-30s USD/boe. Every $10/bbl above breakeven flows almost directly to FCF |
| FMG | Iron ore 62% Fe CFR China | SGX iron ore futures | VERY HIGH – near pure-play iron ore. Cost position ~$18-20/wmt means massive operating leverage above $80/t |
| RIO | Iron ore 62% Fe, copper, aluminium | SGX iron ore, LME copper, LME aluminium | HIGH – iron ore dominant (~60% of earnings), copper growing with resolution of Mongolia, aluminium via Pacific |
| HRZ | Gold price (AUD) | COMEX gold / LBMA PM fix / AUD gold | HIGH – exploration-stage, value is entirely a function of resource size x gold price |

### Tier 2: Macro-Sensitive (30-50% external)

Company fundamentals matter significantly, but a macro variable creates a strong tailwind or headwind that the narrative engine cannot ignore.

| Stock | External Driver(s) | Proxy | Sensitivity |
|-------|-------------------|-------|-------------|
| CBA | RBA cash rate, yield curve (10yr-2yr spread), system credit growth | RBA rate, AU 10yr bond, APRA credit data | HIGH – NIM expands/contracts with rate cycle. Credit growth drives volume. |
| NAB | RBA cash rate, yield curve, business credit specifically | Same as CBA plus business lending indicators | HIGH – more business-weighted than CBA, so business credit cycle matters more |
| GMG | Bond yields (AU and US 10yr), industrial cap rates, logistics demand | AU/US 10yr, NCREIF industrial, global trade volumes | MEDIUM-HIGH – development pipeline valued as spread over risk-free rate. Rising yields compress asset values. |
| XRO | USD/AUD (majority US/UK revenue), SaaS valuation multiples (risk sentiment) | AUD/USD spot, BVP Cloud Index or similar | MEDIUM – FX translation on ~70% offshore revenue. Valuation multiple expands/contracts with growth sentiment. |
| WTC | USD/AUD, global trade volumes, freight rates | AUD/USD, Baltic Dry Index, container throughput data | MEDIUM – earnings tied to global goods movement. Trade disruption is both risk and opportunity. |

### Tier 3: Company-Dominant (<30% external)

External factors matter at the margin but company-specific execution and competitive dynamics dominate the thesis.

| Stock | External Factor | Sensitivity |
|-------|----------------|-------------|
| PME | USD/AUD, US healthcare policy | LOW – product adoption driven by clinical evidence, not macro |
| WOW | CPI/food inflation, consumer sentiment | LOW-MEDIUM – some margin sensitivity to input costs, but pricing power and execution dominate |
| OCL | Government IT spending, AUD/USD | LOW – contract-based revenue provides visibility |
| DRO | Defence budget allocation, geopolitical tension | LOW-MEDIUM – order book driven by government procurement cycles |
| SIG | PBS policy, generics pricing, consumer health spending | LOW – pharmacy sector relatively defensive |
| GYG | Consumer discretionary spending, food cost inflation | LOW-MEDIUM – growth story is unit rollout, but same-store sales sensitive to consumer wallet |
| RFG | Consumer discretionary, franchisee economics | LOW – structural challenges are company-specific |

---

## How External Drivers Feed the Evidence Matrix

### Data Sources Required

For each external driver, the engine needs a daily data feed:

| Driver | Source | Update Frequency |
|--------|--------|-----------------|
| Brent crude | Yahoo Finance (BZ=F) or similar | Daily close |
| Iron ore 62% Fe | SGX futures or Steel Index | Daily |
| Gold (AUD) | LBMA PM fix x AUD/USD | Daily |
| Copper | LME 3-month | Daily |
| JKM (Asia LNG) | Platts JKM or proxy via LNG ETF | Daily where available |
| RBA cash rate | RBA website | Event-driven (8x per year) |
| AU 10yr bond yield | ASX/Bloomberg | Daily |
| AUD/USD | Yahoo Finance (AUDUSD=X) | Daily |
| Credit growth | APRA monthly banking stats | Monthly |

### External Driver as Evidence

When an external driver moves, it generates an evidence item evaluated against the stock's hypotheses. The same rows-before-columns discipline applies.

**Example: Brent drops 8% in a week for WDS**

```
Evidence item: "Brent crude declined 8.2% over 5 trading days to US$68.40/bbl"
Type: commodity_signal
Diagnosticity: HIGH (for Tier 1 commodity stocks)

Evaluate against WDS hypotheses:
  H1 LNG Growth (BULLISH):     INCONSISTENT – lower oil/LNG prices reduce FCF and project economics
  H2 Exec Risk (BEARISH):      NEUTRAL – execution risk is project-specific, not commodity-driven
  H3 Value Trap (BEARISH):     CONSISTENT – lower commodity prices support the value trap thesis
  H4 Stranded Assets (BEARISH): CONSISTENT – lower prices make marginal projects less viable
```

This single evidence item generates inconsistencies against the bullish thesis and is consistent with two bearish theses. The price-as-evidence rules already capture the stock's price response, but the commodity overlay explains WHY the price moved and allows more precise hypothesis evaluation.

### Weighting by Tier

The sensitivity tier determines how much weight external evidence carries relative to company-specific evidence:

```
Tier 1 (Commodity-Dominated):
  External evidence weight: 1.5x (amplified)
  Company-specific evidence weight: 1.0x (standard)
  
  Rationale: For FMG, iron ore price is more diagnostic than any single 
  company announcement short of a major operational failure.

Tier 2 (Macro-Sensitive):
  External evidence weight: 1.0x (standard)
  Company-specific evidence weight: 1.0x (standard)
  
  Rationale: Both matter roughly equally. CBA's NIM is driven by rates,
  but credit quality and cost management are equally important.

Tier 3 (Company-Dominant):
  External evidence weight: 0.5x (discounted)
  Company-specific evidence weight: 1.0x (standard)
  
  Rationale: PME's thesis lives or dies on clinical adoption and product
  execution, not macro conditions.
```

---

## Commodity Price Thresholds

For Tier 1 stocks, define specific commodity price levels that trigger hypothesis re-evaluation:

### WDS (Energy) – Detailed

WDS is a levered play on global LNG and oil, not "gas" generically. Revenue mix is predominantly LNG plus pipeline gas, with oil and condensate material but secondary. Core assets: NWS and Pluto (WA), with Scarborough and Louisiana LNG adding incremental volumes from 2026.

**Pricing mechanisms:**
- Long-term LNG contracts indexed to oil (Brent/JCC), often with a lag between oil price moves and realised LNG price
- Growing share of LNG sold at hub indices: JKM (Asia) and TTF/NBP (Europe) – approximately 25% of volumes hub-linked in H1 2025, earning a small premium to oil-linked sales
- Crude oil and condensate sold at/around Brent/Dated benchmarks
- Management "designs" the revenue risk profile by optimising the contract mix between oil-linked and hub-linked LNG
- Portfolio breakeven guided at mid-30s USD/boe for 2026-27

**Key external prices (in order of importance):**
1. Brent front-month and curve shape (proxy for oil-linked LNG revenue)
2. JKM (Asia LNG spot) – direct exposure on hub-linked contracts
3. TTF/NBP (Europe gas) – secondary hub exposure
4. JKM vs TTF vs Brent spread – determines whether hub-linked volumes earn premium or discount

```json
{
  "ticker": "WDS",
  "commodity_overlay": {
    "tier": 1,
    "primary_driver": "brent_crude",
    "secondary_drivers": ["jkm_lng", "ttf_gas"],
    "pricing_note": "~75% oil-linked LNG, ~25% hub-linked LNG, plus crude/condensate at Brent",
    "breakeven_usd_boe": 35,
    "thresholds": {
      "strong_bullish": { "brent_above": 90, "jkm_premium_to_oil": true, "note": "Exceptional FCF, hub premium amplifies margins, Scarborough economics compelling" },
      "bullish": { "brent_above": 75, "note": "Healthy margins, growth projects funded from cash flow, dividend well covered" },
      "neutral": { "brent_range": [60, 75], "note": "Adequate returns, projects proceed but less margin for error on execution" },
      "bearish": { "brent_below": 60, "note": "Margins compressed, project FIDs at risk, Louisiana LNG economics questioned" },
      "strong_bearish": { "brent_below": 45, "note": "Approaching breakeven on marginal assets, dividend at risk, stranded asset thesis gains weight" }
    },
    "sensitivity_indicators": [
      "Brent front-month and curve shape",
      "JKM vs Brent spread (hub premium/discount)",
      "Woodside disclosed hub exposure % (rising = more vol, more upside optionality)",
      "Updated breakeven guidance from CMD/investor materials"
    ],
    "factor_profile": "High beta to global energy (oil + LNG) with project-execution risk overlay (Scarborough, Louisiana LNG, clean ammonia). Less sensitive to domestic AU gas policy than smaller producers due to diversified markets and long-term contracts."
  }
}
```

### FMG (Iron Ore)

```json
{
  "ticker": "FMG",
  "commodity_overlay": {
    "tier": 1,
    "primary_driver": "iron_ore_62fe",
    "thresholds": {
      "strong_bullish": { "above": 140, "note": "Exceptional cash generation, >$10B FCF potential" },
      "bullish": { "above": 110, "note": "Strong margins, dividend well supported" },
      "neutral": { "range": [90, 110], "note": "Healthy but normalising" },
      "bearish": { "below": 90, "note": "Margin pressure, green energy capex harder to fund" },
      "strong_bearish": { "below": 70, "note": "Cost position tested, dividend at risk" }
    }
  }
}
```

### RIO (Diversified)

```json
{
  "ticker": "RIO",
  "commodity_overlay": {
    "tier": 1,
    "primary_driver": "iron_ore_62fe",
    "secondary_drivers": ["copper_lme", "aluminium_lme"],
    "thresholds": {
      "iron_ore": {
        "bullish_above": 110,
        "neutral_range": [85, 110],
        "bearish_below": 85
      },
      "copper": {
        "bullish_above": 10000,
        "neutral_range": [8000, 10000],
        "bearish_below": 8000
      }
    }
  }
}
```

---

## Display: Commodity Context Panel

For Tier 1 and Tier 2 stocks, add a panel to the stock page showing the external driver context:

```
┌─────────────────────────────────────────────────┐
│  COMMODITY CONTEXT                               │
│                                                   │
│  Brent Crude:  US$72.40  (-2.1% 5d)  [NEUTRAL]  │
│  JKM LNG:      US$13.80  (+1.5% 5d)  [BULLISH]  │
│  WDS Breakeven: US$35/boe                        │
│                                                   │
│  Commodity Zone: NEUTRAL                          │
│  WDS is trading in a neutral commodity            │
│  environment. Current prices support adequate     │
│  margins but do not drive upside re-rating.       │
└─────────────────────────────────────────────────┘
```

Colour code the commodity zone: green (bullish), red (bearish), amber (neutral).

For financials:
```
┌─────────────────────────────────────────────────┐
│  RATE CONTEXT                                    │
│                                                   │
│  RBA Cash Rate:  4.10%  (held, last cut Feb 26)  │
│  AU 10yr:        4.35%  (-12bp 1mo)              │
│  Yield Curve:    +25bp  (mildly positive)        │
│  System Credit:  +5.2% YoY                       │
│                                                   │
│  Rate Zone: NEUTRAL-BULLISH                       │
│  Rate cuts beginning. Curve normalising.          │
│  Supportive for NIM expansion if cuts are gradual.│
└─────────────────────────────────────────────────┘
```

---

## Integration with Hypothesis Generation

For Tier 1 stocks, the hypothesis set itself should reflect commodity exposure. The current WDS hypotheses are:

```
T1: LNG Growth (BULLISH)
T2: Execution Risk (BEARISH)
T3: Value Trap (BEARISH)
T4: Stranded Assets (BEARISH)
```

These are all company-framed. A better hypothesis set for a commodity-dominated stock:

```
H1: Commodity Tailwind + Execution (BULLISH)
    LNG demand growth, Scarborough on track, Brent sustained above $75.
    This is not just a company story – it requires commodity support.

H2: Execution Delivers but Commodity Headwind (NEUTRAL)
    Projects execute well but LNG/oil prices decline, capping re-rating.
    Good company, wrong cycle.

H3: Commodity Support but Execution Stumbles (NEUTRAL)  
    Prices are fine but Scarborough delays, cost blowouts, or 
    Louisiana LNG complications erode value.

H4: Structural Decline (BEARISH)
    Energy transition accelerates, LNG demand peaks earlier than expected,
    stranded asset risk materialises. Commodity and company both deteriorate.
```

This hypothesis set is more diagnostic because it separates commodity and company drivers. Evidence about oil prices tests H1 vs H2. Evidence about project execution tests H1 vs H3. The matrix becomes genuinely useful.

**For resource stocks, the hypotheses should always separate:**
- Commodity bull + company bull (the dream)
- Commodity bull + company bear (good sector, bad operator)
- Commodity bear + company bull (good operator, wrong cycle)
- Commodity bear + company bear (avoid)

This 2x2 framework is more analytically honest than four company-only narratives.

---

## Implementation Sequence

1. **Add commodity_overlay config to each stock JSON** – tier classification, primary/secondary drivers, thresholds, breakeven levels
2. **Build commodity data fetcher** – daily pull of Brent, iron ore, gold, copper, AU 10yr, AUD/USD, RBA rate into data/commodities.json
3. **Generate commodity evidence items** – classify daily commodity moves using the same noise/notable/significant/material thresholds as price-as-evidence, weighted by tier
4. **Evaluate commodity evidence against hypotheses** – rows-before-columns, same as all other evidence
5. **Restructure hypotheses for Tier 1 stocks** – separate commodity and company drivers into the 2x2 framework
6. **Build the Commodity Context display panel** – show on stock pages for Tier 1 and Tier 2 stocks
7. **Wire into daily pipeline** – commodity data fetch runs before stock analysis so commodity evidence is available

---

## Acceptance Criteria

1. Every stock in the coverage universe has a tier classification and identified external drivers
2. Commodity/macro data is fetched daily and stored in data/commodities.json
3. Commodity moves generate evidence items weighted by tier
4. Tier 1 stock hypotheses reflect the 2x2 commodity/company framework
5. Commodity Context panel displays on Tier 1 and Tier 2 stock pages
6. A material move in Brent visibly affects WDS hypothesis scores within one daily cycle
7. A material move in iron ore visibly affects FMG and RIO hypothesis scores within one daily cycle
