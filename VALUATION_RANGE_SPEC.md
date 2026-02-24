# Valuation Range Engine Specification

**Date:** 20 February 2026
**Status:** AUTHORITATIVE. This document defines the valuation range feature end-to-end: data layer, computation engine, forecast agent, and UI rendering.
**Dependencies:** Requires BUGFIX_002 (correct Company Signal) and ERRATA_002 (40/60 rule) to be implemented first.

---

## What We Are Building

A valuation range – not a price target – that gives the user a visual anchor for "where could this stock reasonably trade given the weight of evidence." The range is informed by three inputs and displayed as a sliding bar with colour-coded zones.

**Why a range, not a target:** Street analysts publish point estimates (e.g. "target $35.00") that imply false precision and suffer from anchoring inertia. Once published, targets rarely move until forced by results. Our range:

- Width communicates conviction (tight = converging evidence, wide = high uncertainty)
- Moves daily as inputs change (prices, multiples, narratives, commodity factors)
- Decomposes visually into "what history says" and "what the narrative implies"
- Never pretends a single number captures fair value

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    VALUATION RANGE OUTPUT                     │
│                                                              │
│   ◄──── RED ────►◄──── AMBER ────►◄──── GREEN ────►         │
│   $24.00          $28.50           $33.00          $38.00    │
│                          ▲                                   │
│                     Current: $31.70                           │
│                                                              │
│   Downside zone     Fair value zone     Upside zone          │
└──────────────────────────┬──────────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
    ┌─────────▼──┐  ┌──────▼─────┐  ┌──▼──────────────┐
    │ HISTORICAL  │  │ RELATIVE   │  │ FORECAST AGENT   │
    │ RANGE       │  │ VALUATION  │  │                  │
    │             │  │            │  │ Company guidance  │
    │ Own-stock   │  │ vs Sector  │  │ Narrative inputs  │
    │ multiples   │  │ (80%)      │  │ Hypothesis-driven │
    │ 3yr range   │  │ vs Market  │  │ re-rating adj     │
    │             │  │ (20%)      │  │                  │
    │ P/E, EV/    │  │            │  │ Produces forward  │
    │ EBITDA, P/B │  │ Mean-      │  │ valuation range   │
    │             │  │ reversion  │  │ with confidence    │
    │             │  │ gravity    │  │                  │
    └─────────────┘  └────────────┘  └──────────────────┘
```

---

## Component 1: Reference Data Layer

### Stock Financial Anchors

Add a `valuation_anchors` section to each stock's JSON:

```json
{
  "valuation_anchors": {
    "eps_forward": {
      "value": 1.34,
      "period": "FY26E",
      "source": "company_guidance",
      "updated": "2026-02-15"
    },
    "eps_trailing": {
      "value": 1.18,
      "period": "FY25A",
      "source": "annual_report",
      "updated": "2026-02-15"
    },
    "ebitda_forward": {
      "value": 4850,
      "unit": "A$M",
      "period": "FY26E",
      "source": "consensus",
      "updated": "2026-02-15"
    },
    "book_value_per_share": {
      "value": 22.45,
      "period": "FY25A",
      "source": "annual_report",
      "updated": "2026-02-15"
    },
    "shares_outstanding": 1234.5,
    "net_debt": 2100,
    "primary_multiple": "ev_ebitda",
    "secondary_multiple": "pe_forward",
    "sector_multiples": {
      "pe_forward": { "median": 18.5, "p25": 14.2, "p75": 23.1 },
      "ev_ebitda": { "median": 9.8, "p25": 7.5, "p75": 12.4 },
      "pb": { "median": 2.1, "p25": 1.4, "p75": 3.0 }
    },
    "market_multiples": {
      "pe_forward": { "median": 17.2, "p25": 13.5, "p75": 21.8 },
      "ev_ebitda": { "median": 10.5, "p25": 8.0, "p75": 13.2 },
      "pb": { "median": 2.3, "p25": 1.5, "p75": 3.2 }
    }
  }
}
```

### Which Multiple for Which Stock

The primary valuation multiple depends on the business model. Assign per stock:

| Stock Type | Primary Multiple | Secondary Multiple | Rationale |
|-----------|-----------------|-------------------|-----------|
| Miners (FMG, RIO, BHP, HRZ) | EV/EBITDA | P/B | Earnings volatile with commodity cycle, EBITDA closer to cash generation, P/B sets floor |
| Energy (WDS) | EV/EBITDA | P/E Forward | Same as miners, oil price volatility distorts P/E |
| Banks (CBA, NAB) | P/B | P/E Forward | Book value is regulatory capital, the binding constraint. P/E for earnings power |
| REITs (GMG) | P/B (NAV-based) | EV/EBITDA | REITs valued on net asset value |
| Tech/SaaS (XRO, WTC) | P/E Forward | EV/Revenue | High growth justifies earnings multiple, revenue for pre-profit or early-stage |
| Healthcare (PME, CSL) | P/E Forward | EV/EBITDA | Earnings-driven valuation |
| Consumer (WOW, GYG, RFG) | P/E Forward | EV/EBITDA | Earnings visibility, stable margins |
| Defence (DRO) | EV/Revenue | P/E Forward | Lumpy earnings, revenue trajectory more stable |
| Pharma/Biotech (SIG) | P/E Forward | EV/EBITDA | Earnings-driven |
| IT Services (OCL) | P/E Forward | EV/EBITDA | Earnings-driven |

### Data Sources

**For current multiples (fetched daily via Yahoo Finance API):**
- Forward P/E: `forwardPE` field
- Trailing P/E: `trailingPE` field
- EV/EBITDA: `enterpriseToEbitda` field
- P/B: `priceToBook` field
- Market cap: `marketCap` field
- Enterprise value: `enterpriseValue` field

**For historical multiple ranges (derived):**

Yahoo Finance does not provide historical multiple time series directly. Derive them:

```
For each trading day over the past 3 years (750 trading days):
  implied_pe = price_on_day / eps_for_period
  implied_ev_ebitda = (price_on_day * shares + net_debt) / ebitda_for_period
  implied_pb = price_on_day / book_value_per_share

Store the distribution:
  p10 = 10th percentile (low end of historical range)
  p25 = 25th percentile
  p50 = median
  p75 = 75th percentile
  p90 = 90th percentile (high end of historical range)
```

**Important simplification:** For the initial build, use the current financial anchors (EPS, EBITDA, BVPS) as constants across the historical period. This is imprecise – it assumes today's earnings were always the earnings – but it gets the feature live. Phase 2 improvement: use quarterly financials to update the denominator at each reporting date.

**For sector and market averages:**

Seed from current ASX 200 data. Update monthly. The sector averages should reflect the stock's GICS sub-industry peer group. For the initial build, hardcode these in the JSON from publicly available sector average data (S&P Capital IQ, Bloomberg terminal, or aggregated from Yahoo Finance for key peers).

---

## Component 2: Historical Range Computation

### Step 2.1: Own-Stock Multiple Range

Using the 3-year price history and financial anchors:

```javascript
function calculateHistoricalRange(priceHistory, anchors) {
  const primary = anchors.primary_multiple;
  
  // Calculate implied multiples for each historical price point
  const impliedMultiples = priceHistory.map(day => {
    if (primary === 'pe_forward') {
      return day.close / anchors.eps_forward.value;
    } else if (primary === 'ev_ebitda') {
      const ev = (day.close * anchors.shares_outstanding) + anchors.net_debt;
      return ev / anchors.ebitda_forward.value;
    } else if (primary === 'pb') {
      return day.close / anchors.book_value_per_share.value;
    }
  });
  
  // Sort and extract percentiles
  const sorted = [...impliedMultiples].sort((a, b) => a - b);
  const len = sorted.length;
  
  return {
    p10: sorted[Math.floor(len * 0.10)],
    p25: sorted[Math.floor(len * 0.25)],
    p50: sorted[Math.floor(len * 0.50)],
    p75: sorted[Math.floor(len * 0.75)],
    p90: sorted[Math.floor(len * 0.90)],
    current: impliedMultiples[impliedMultiples.length - 1],
    multiple_type: primary
  };
}
```

### Step 2.2: Convert Multiple Range to Price Range

```javascript
function multiplesToPriceRange(multipleRange, anchors) {
  const primary = anchors.primary_multiple;
  
  function multipleToPrice(multiple) {
    if (primary === 'pe_forward') {
      return multiple * anchors.eps_forward.value;
    } else if (primary === 'ev_ebitda') {
      const ev = multiple * anchors.ebitda_forward.value;
      return (ev - anchors.net_debt) / anchors.shares_outstanding;
    } else if (primary === 'pb') {
      return multiple * anchors.book_value_per_share.value;
    }
  }
  
  return {
    low: multipleToPrice(multipleRange.p10),
    low_mid: multipleToPrice(multipleRange.p25),
    mid: multipleToPrice(multipleRange.p50),
    high_mid: multipleToPrice(multipleRange.p75),
    high: multipleToPrice(multipleRange.p90),
    source: 'historical_range'
  };
}
```

---

## Component 3: Relative Valuation Benchmark

Where the stock trades relative to sector and market averages, weighted 80%/20%.

```javascript
function calculateRelativeBenchmark(currentMultiple, sectorMultiples, marketMultiples) {
  // Blended benchmark: 80% sector, 20% market
  const blendedMedian = (sectorMultiples.median * 0.80) + (marketMultiples.median * 0.20);
  const blendedP25 = (sectorMultiples.p25 * 0.80) + (marketMultiples.p25 * 0.20);
  const blendedP75 = (sectorMultiples.p75 * 0.80) + (marketMultiples.p75 * 0.20);
  
  // Premium/discount to blended benchmark
  const premiumDiscount = ((currentMultiple / blendedMedian) - 1) * 100;
  
  // Mean-reversion pull: how far from benchmark
  // Positive = trading at premium, gravity pulls down
  // Negative = trading at discount, gravity pulls up
  const meanReversionForce = -premiumDiscount;
  
  return {
    blended_median: blendedMedian,
    blended_p25: blendedP25,
    blended_p75: blendedP75,
    current_multiple: currentMultiple,
    premium_discount_pct: premiumDiscount,
    mean_reversion_force: meanReversionForce,
    sector_weight: 0.80,
    market_weight: 0.20
  };
}
```

---

## Component 4: Hypothesis-Driven Re-Rating Adjustment

This is where the narrative engine bites into the valuation. The dominant hypothesis direction and the Company Signal strength modify the range.

### Re-Rating Logic

```javascript
function calculateHypothesisAdjustment(hypotheses, Company_Signal, historicalRange) {
  const dominant = hypotheses.reduce((max, h) =>
    h.survival_score > max.survival_score ? h : max
  );
  
  // Company_Signal ranges from -80 to +80 (from weighted sentiment calculation)
  // Normalise to a re-rating factor: -30% to +30%
  const reRatingPct = (Company_Signal / 80) * 0.30;
  
  // The adjustment shifts the CENTRE of the range, not the width
  // A bullish dominant hypothesis with strong conviction shifts the range up
  // A bearish dominant hypothesis shifts it down
  const centreShift = historicalRange.mid * reRatingPct;
  
  // Conviction also affects range WIDTH
  // High conviction (strong Company_Signal) = tighter range
  // Low conviction (weak Company_Signal) = wider range
  const absSignal = Math.abs(Company_Signal);
  const widthMultiplier = 1.0 - (absSignal / 80) * 0.30;
  // At Company_Signal = 0: width = 100% of historical (max uncertainty)
  // At Company_Signal = +/-80: width = 70% of historical (high conviction, tighter range)
  
  const historicalWidth = historicalRange.high - historicalRange.low;
  const adjustedWidth = historicalWidth * widthMultiplier;
  const adjustedMid = historicalRange.mid + centreShift;
  
  return {
    centre_shift: centreShift,
    centre_shift_pct: reRatingPct * 100,
    width_multiplier: widthMultiplier,
    adjusted_low: adjustedMid - (adjustedWidth / 2),
    adjusted_mid: adjustedMid,
    adjusted_high: adjustedMid + (adjustedWidth / 2),
    dominant_hypothesis: dominant.name,
    dominant_sentiment: dominant.sentiment,
    dominant_score: dominant.survival_score,
    company_signal: Company_Signal,
    source: 'hypothesis_adjusted'
  };
}
```

### Re-Rating Examples

**WOW (bearish dominant, Company_Signal = -42):**
```
Historical mid: $30.50
reRatingPct = (-42/80) * 0.30 = -15.75%
centreShift = 30.50 * -0.1575 = -$4.80
adjustedMid = $25.70

widthMultiplier = 1.0 - (42/80) * 0.30 = 0.84
historicalWidth = $36.00 - $25.00 = $11.00
adjustedWidth = $11.00 * 0.84 = $9.24

adjustedLow = $25.70 - $4.62 = $21.08
adjustedHigh = $25.70 + $4.62 = $30.32

Current price $31.70 sits ABOVE the adjusted range → RED zone (downside skew)
```

The narrative tells the reader: "Based on where WOW has traded historically and the weight of bearish hypotheses, $31.70 looks expensive. The market is pricing turnaround optimism that 64% of the evidence doesn't support."

**HRZ (bullish dominant, Company_Signal = +25):**
```
Historical mid: $1.10
reRatingPct = (25/80) * 0.30 = +9.4%
centreShift = $1.10 * 0.094 = +$0.10
adjustedMid = $1.20

widthMultiplier = 1.0 - (25/80) * 0.30 = 0.91
historicalWidth = $1.50 - $0.70 = $0.80
adjustedWidth = $0.80 * 0.91 = $0.73

adjustedLow = $1.20 - $0.36 = $0.84
adjustedHigh = $1.20 + $0.36 = $1.56

Current price $1.24 sits in the middle → AMBER zone (fair value)
```

---

## Component 5: Forecast Agent

The forecast agent is a Claude API call that runs at content refresh time (daily, or on-demand). It produces a forward-looking valuation range that incorporates company guidance, narrative context, and current market conditions.

### Agent Prompt

```javascript
const forecastPrompt = `
You are a quantitative equity analyst producing a forward valuation range for ${ticker}.AX.

INPUTS PROVIDED:
- Current price: A$${currentPrice}
- Historical multiple range (3yr): ${primaryMultiple} P10=${p10} / P25=${p25} / P50=${p50} / P75=${p75} / P90=${p90}
- Current ${primaryMultiple}: ${currentMultiple}
- Sector median ${primaryMultiple}: ${sectorMedian} (blended 80% sector, 20% market)
- Premium/discount to sector: ${premiumDiscount}%
- Hypothesis-adjusted range: A$${adjLow} to A$${adjHigh} (midpoint A$${adjMid})
- Dominant hypothesis: ${dominantName} (${dominantSentiment}, ${dominantScore}%)
- Company Signal: ${companySignal} (${companySignal > 0 ? 'net bullish' : 'net bearish'})
- Financial anchors: EPS fwd A$${epsFwd}, EBITDA fwd A$${ebitdaFwd}M, BVPS A$${bvps}

COMPANY GUIDANCE:
${companyGuidance}

RECENT DEVELOPMENTS:
${recentDevelopments}

TASK:
Produce a 12-month forward valuation range with three scenarios:

1. BEAR CASE: Assume the dominant bearish hypothesis plays out. What multiple does the stock trade at? What price does that imply?

2. BASE CASE: Assume the current hypothesis balance holds. Weight the multiples by hypothesis scores (bullish hypotheses pull toward premium multiples, bearish toward discount). What is the probability-weighted fair value range?

3. BULL CASE: Assume the dominant bullish hypothesis plays out. What multiple re-rating is justified? What price does that imply?

CONSTRAINTS:
- Use the stock's primary valuation multiple (${primaryMultiple})
- Bear case multiple must not be below the 3-year P10 unless structural de-rating is justified
- Bull case multiple must not exceed 1.5x the 3-year P90 unless structural re-rating is justified
- Base case must be probability-weighted by hypothesis scores, not a simple average
- Express conviction as HIGH/MEDIUM/LOW for each scenario
- All numbers in AUD

RESPOND IN EXACTLY THIS JSON FORMAT:
{
  "bear_case": {
    "multiple": X.X,
    "implied_price": XX.XX,
    "probability": XX,
    "conviction": "HIGH/MEDIUM/LOW",
    "rationale": "One sentence"
  },
  "base_case": {
    "multiple_low": X.X,
    "multiple_high": X.X,
    "implied_price_low": XX.XX,
    "implied_price_high": XX.XX,
    "probability": XX,
    "conviction": "HIGH/MEDIUM/LOW",
    "rationale": "One sentence"
  },
  "bull_case": {
    "multiple": X.X,
    "implied_price": XX.XX,
    "probability": XX,
    "conviction": "HIGH/MEDIUM/LOW",
    "rationale": "One sentence"
  },
  "range_width_interpretation": "NARROW/MODERATE/WIDE",
  "key_catalyst": "One sentence on what moves the stock from base to bull or bear"
}
`;
```

### Agent Execution

```javascript
async function runForecastAgent(ticker, stockData, macroData) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: buildForecastPrompt(ticker, stockData, macroData) }]
    })
  });
  
  const data = await response.json();
  const text = data.content.map(c => c.text || '').join('');
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}
```

### Storage

Store the forecast agent output in the stock JSON:

```json
{
  "forecast_valuation": {
    "generated_at": "2026-02-20T06:30:00+11:00",
    "primary_multiple": "pe_forward",
    "bear_case": {
      "multiple": 18.5,
      "implied_price": 24.80,
      "probability": 25,
      "conviction": "MEDIUM",
      "rationale": "Margin erosion continues, market de-rates to sector trough"
    },
    "base_case": {
      "multiple_low": 21.0,
      "multiple_high": 24.5,
      "implied_price_low": 28.15,
      "implied_price_high": 32.85,
      "probability": 55,
      "conviction": "MEDIUM",
      "rationale": "Turnaround partially priced, awaiting 1H confirmation"
    },
    "bull_case": {
      "multiple": 28.0,
      "implied_price": 37.50,
      "probability": 20,
      "conviction": "LOW",
      "rationale": "Full turnaround delivery plus Big W profitability inflection"
    },
    "range_width_interpretation": "WIDE",
    "key_catalyst": "1H FY26 results on 25 February are the single most diagnostic event"
  }
}
```

---

## Component 6: Composite Range Assembly

Blend the three inputs into the final displayed range:

```javascript
function assembleValuationRange(historicalPriceRange, relativeBenchmark, forecastAgent, currentPrice) {
  // The forecast agent provides the primary range
  // Historical and relative provide guardrails
  
  const range = {
    low: forecastAgent.bear_case.implied_price,
    fair_low: forecastAgent.base_case.implied_price_low,
    fair_high: forecastAgent.base_case.implied_price_high,
    high: forecastAgent.bull_case.implied_price,
    current_price: currentPrice
  };
  
  // Determine which zone the current price falls in
  if (currentPrice > range.fair_high) {
    // Above fair value range
    const overshoot = (currentPrice - range.fair_high) / (range.high - range.fair_high);
    if (overshoot > 1.0) {
      range.zone = 'DEEP_RED';       // Above bull case
      range.zone_label = 'Significantly above valuation range';
    } else {
      range.zone = 'RED';            // Between fair_high and bull case
      range.zone_label = 'Above fair value – downside skew';
    }
  } else if (currentPrice < range.fair_low) {
    // Below fair value range
    const undershoot = (range.fair_low - currentPrice) / (range.fair_low - range.low);
    if (undershoot > 1.0) {
      range.zone = 'DEEP_GREEN';     // Below bear case
      range.zone_label = 'Significantly below valuation range';
    } else {
      range.zone = 'GREEN';          // Between bear case and fair_low
      range.zone_label = 'Below fair value – upside skew';
    }
  } else {
    range.zone = 'AMBER';            // Within fair value range
    range.zone_label = 'Within fair value range';
  }
  
  // Skew percentage: how far current price is from midpoint as % of range width
  const midpoint = (range.fair_low + range.fair_high) / 2;
  const rangeWidth = range.high - range.low;
  range.skew_pct = ((currentPrice - midpoint) / rangeWidth) * 100;
  
  // Upside/downside to fair value boundaries
  range.upside_to_fair_high = ((range.fair_high / currentPrice) - 1) * 100;
  range.downside_to_fair_low = ((range.fair_low / currentPrice) - 1) * 100;
  range.upside_to_bull = ((range.high / currentPrice) - 1) * 100;
  range.downside_to_bear = ((range.low / currentPrice) - 1) * 100;
  
  return range;
}
```

---

## Component 7: UI Rendering

### Sliding Bar (Stock Detail Page)

Place below the Overall Sentiment section, above the hypothesis list:

```
VALUATION RANGE

  Bear          Fair Value Zone          Bull
  A$24.80  ◄══ A$28.15 ════ A$32.85 ══► A$37.50
  ████████████████████████▲██████████████████████
  RED         GREEN       │      AMBER       RED
                     Current
                     A$31.70

  Zone: WITHIN FAIR VALUE
  Upside to bull case: +18.3%  |  Downside to bear case: -21.8%
  Base case probability: 55%   |  Range width: WIDE (high uncertainty)
  Primary multiple: P/E Forward (current 23.7x vs sector 18.5x median)
  Key catalyst: 1H FY26 results on 25 February
```

### Colour Coding

The bar is colour-coded in three zones:

```
  ◄─── GREEN ───►◄────── AMBER ──────►◄─── RED ───►
  Bear case       Fair value low/high    Bull case

  Below fair_low: GREEN (upside skew – stock appears cheap)
  Between fair_low and fair_high: AMBER (fair value – priced)
  Above fair_high: RED (downside skew – stock appears expensive)
```

**Wait – this is inverted from the typical red/green association.** The user's original description says: "if we see upside skew then it is green, Neutral skew then Yellow and above that downside skew in red."

So the colour mapping from the USER'S perspective (what zone the price is in):

| Current Price Location | Zone | Colour | Meaning |
|----------------------|------|--------|---------|
| Below bear case | DEEP GREEN | Dark green | Significantly undervalued |
| Between bear case and fair_low | GREEN | Green | Upside skew – potential opportunity |
| Between fair_low and fair_high | AMBER | Yellow/amber | Fairly valued – neutral |
| Between fair_high and bull case | RED | Red | Downside skew – potentially overvalued |
| Above bull case | DEEP RED | Dark red | Significantly overvalued |

The bar itself is a gradient from green (left/low) through amber (centre) to red (right/high), and the current price marker sits on it showing where the stock sits within that range.

### Price Chart Overlay

On the stock's price chart (the sparkline in the hero section or any expanded chart view), overlay horizontal bands:

```
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ $37.50 (bull case, dashed red)
  ══════════════════════ $32.85 (fair value high, solid amber)
  
     Price line moves here
  
  ══════════════════════ $28.15 (fair value low, solid amber)
  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ $24.80 (bear case, dashed green)
```

Fill between the two solid amber lines with a light amber wash. Fill between the lower amber and green dashed line with a light green wash. Fill between the upper amber and red dashed line with a light red wash. The user can instantly see whether the price is trending into the green, amber, or red zone.

### Sidebar Widget

In the stock detail page sidebar (next to the Hypothesis Tracker), add a compact valuation summary:

```
VALUATION RANGE
  Bear:  A$24.80
  Fair:  A$28.15 – A$32.85
  Bull:  A$37.50
  Zone:  AMBER (fair value)
  
  ████████████▲█████████
```

### Index Page Integration

Add a Zone column to the coverage index:

| ASX | Company | Price | Sentiment | Company | Zone | Updated |
|-----|---------|-------|-----------|---------|------|---------|
| WOW | Woolworths | A$31.70 | -33 ↓ | -34 ↓ | RED | 20 Feb |
| HRZ | Horizon | A$1.24 | +27 ↑ | +18 ↑ | AMBER | 20 Feb |
| DRO | DroneShield | A$3.18 | +14 ↑ | +14 ↑ | GREEN | 20 Feb |

The Zone column is colour-coded (green/amber/red cell background). The reader scans the index and immediately spots: red zone = potentially overvalued, green zone = potential opportunity. Combined with the Sentiment and Company columns, this gives a three-dimensional view at a glance.

---

## Daily Pipeline Integration

### Refresh Sequence

Add to the daily pipeline (after composite sentiment is calculated):

```
Step 8 (new): For each stock:
  a. Fetch current multiples from Yahoo Finance API
  b. Calculate historical multiple range from 3yr price history + anchors
  c. Calculate relative benchmark (sector 80% / market 20%)
  d. Run forecast agent (Claude API call)
  e. Assemble composite valuation range
  f. Determine zone (green/amber/red) based on current price position
  g. Store in stock JSON under valuation_range
  h. Update sidebar widget and index page zone column
```

### Frequency

- Historical range recalculation: daily (price moves change the range boundaries)
- Sector/market benchmarks: monthly update (these are stable)
- Forecast agent: daily run at content refresh, OR triggered by narrative flip, material price move (>5%), or earnings event
- Zone determination: real-time (whenever price updates)

### Staleness Rules

- If forecast agent hasn't run in >5 days, display amber warning: "Valuation range may be stale – last updated [date]"
- If financial anchors (EPS, EBITDA) are >6 months old, flag: "Financial anchors from [period] – update pending"
- If sector multiples are >2 months old, flag for refresh

---

## Investor Briefing PDF Integration

Add a VALUATION RANGE section to Page 5 of the Investor Briefing PDF (between Technical and Gaps, or replace Technical if no TA data exists):

```
VALUATION RANGE                               11pt Bold

Primary Multiple: [P/E Forward / EV/EBITDA / P/B]
Current: [XX.Xx] vs Sector Median: [XX.Xx] ([+/-XX%] premium/discount)

┌──────────────────────────────────────────────────────┐
│  Bear Case    │  Fair Value Zone    │  Bull Case      │
│  A$XX.XX      │  A$XX.XX – A$XX.XX  │  A$XX.XX        │
│  (P/E XX.Xx)  │  (P/E XX.Xx–XX.Xx)  │  (P/E XX.Xx)   │
│  Prob: XX%    │  Prob: XX%          │  Prob: XX%      │
└──────────────────────────────────────────────────────┘

Current Price: A$XX.XX  |  Zone: [GREEN/AMBER/RED]
Range Width: [NARROW/MODERATE/WIDE] – [interpretation]
Key Catalyst: [one sentence]

Hypothesis-driven adjustment: [+/-X%] from historical midpoint
  [Dominant hypothesis] implies [re-rating/de-rating/neutral]
  because [one sentence rationale]
```

---

## What This Produces for the User

1. **Actionable anchoring.** The user sees "WOW trades at $31.70 in the RED zone – above fair value" and knows the weight of evidence suggests caution. No ambiguous "overweight" or "buy" labels.

2. **Conviction transparency.** A wide range says "we're uncertain." A narrow range says "the evidence converges." The user calibrates position sizing accordingly.

3. **Narrative integration.** The hypothesis-driven adjustment shows HOW the competing narratives affect valuation. "If the turnaround thesis plays out, fair value is $37.50. If erosion dominates, $24.80." The user decides which world they believe in.

4. **Daily freshness.** The range moves with the market, with commodity prices, with new evidence. No stale $35.00 target sitting unchanged for 6 months.

5. **Differentiation from street research.** Analysts publish targets. We publish ranges with decomposed conviction. The range width IS the insight – it tells you how much the market doesn't know.

---

## Instructions to Developer

> Read VALUATION_RANGE_SPEC.md. This adds a new feature across four layers:
>
> 1. Add `valuation_anchors` to each stock JSON with financial data (EPS, EBITDA, BVPS, shares, net debt, sector/market multiples)
> 2. Build the range computation engine: historical multiple range from 3yr prices, relative benchmark (80% sector / 20% market), hypothesis-driven re-rating adjustment
> 3. Build the forecast agent: Claude API call that produces bear/base/bull case with probabilities. Runs at content refresh, stores in stock JSON
> 4. Build the UI: sliding bar with green/amber/red zones on stock detail page, horizontal bands on price chart, compact sidebar widget, Zone column on index page
>
> Test with WOW (should show RED zone – price above fair value given bearish hypothesis balance), HRZ (should show AMBER – near fair value), and at least one stock in GREEN zone.
