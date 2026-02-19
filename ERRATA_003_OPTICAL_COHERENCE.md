# Errata 003: Optical Coherence – Two-Row Sentiment Display

**Date:** 19 February 2026
**Applies to:** MASTER_IMPLEMENTATION_INSTRUCTIONS.md (Step 5.4, Step 5.5), all UI/display specifications
**Status:** MANDATORY. Removes thesis skew entirely. Replaces with two-row sentiment display.

---

## Problem Statement

The legacy Thesis Skew metric uses a bull-minus-bear hypothesis summation that is independent of the four-component composite sentiment. This produces visible contradictions on screen: WOW shows skew -28 (red) alongside sentiment +25 (green). CBA shows skew -30 alongside sentiment +19. The reader sees bearish hypotheses but a green headline number and loses trust in the platform.

Thesis skew is a legacy artefact. The composite sentiment already captures what skew was trying to measure, but does it properly through weighted layer decomposition. The fix is to kill thesis skew and make the composite's internal decomposition visible to the reader.

---

## Change 1: Remove Thesis Skew

Delete all of the following across the entire codebase:

- The `thesis_skew` field from all stock JSON files
- Any `calcThesisSkew()` or equivalent function
- The Thesis Skew column from the coverage index page
- Any thesis skew display, badge, or indicator on stock detail pages
- Any thesis skew references in history logging (replace with `company_signal` and `external_signal`)

Thesis skew no longer exists as a concept in the platform. Do not rename it. Do not repurpose it. Remove it.

---

## Change 2: Two-Row Sentiment Display on Stock Detail Page

Replace the single-line Overall Sentiment display with a two-row decomposition:

### Layout

```
OVERALL SENTIMENT:  +25 UPSIDE (green)

  External Environment   +32  ██████████████████░░░░░░  (green)
    Macro (+2) | Sector (+30) | Tech (0)

  Company Research        -7  ████░░░░░░░░░░░░░░░░░░░░  (red)
    3 of 4 hypotheses bearish | T1: [name] (BEARISH, 34%)
```

### Rules

**Overall Sentiment line:**
- Shows the four-component composite value and label
- Coloured by composite: green if > +8, red if < -8, amber if between
- This is the headline number

**External Environment line:**
- Value = macro_contribution + sector_contribution + tech_contribution
- Coloured independently: green if > +5, red if < -5, amber if between
- Sub-line shows the three external components with values
- Bar is proportional, scaled to max possible external contribution

**Company Research line:**
- Value = company_contribution (which is w_company x Company_Signal)
- Coloured independently: green if > +5, red if < -5, amber if between
- Sub-line shows: "[X] of [Y] hypotheses [bearish/bullish/mixed]" and "T1: [name] ([sentiment], [score]%)"
- Bar is proportional, scaled to max possible company contribution

### Colour Independence

This is critical. Each row is coloured by its OWN value, not by the overall composite. The entire point is to show when they diverge:

| Overall | External | Company | What Reader Sees |
|---------|----------|---------|-----------------|
| Green   | Green    | Green   | Everything aligned bullish |
| Green   | Green    | Red     | Environment carrying a weak company story |
| Red     | Red      | Red     | Everything aligned bearish |
| Red     | Red      | Green   | Good company in a bad environment |
| Amber   | Green    | Red     | External masking company weakness |
| Amber   | Red      | Green   | Good company fighting headwinds |

The divergence cases (rows 2, 4, 5, 6) are the highest-value insights the platform delivers. They tell the reader something the headline number alone would hide.

---

## Change 3: Two-Column Index Page

Replace the current Thesis Skew and Sentiment columns with:

| ASX | Company | Sector | Price | Sentiment | Company | Updated | Status |
|-----|---------|--------|-------|-----------|---------|---------|--------|
| WOW | Woolworths | Consumer Staples | A$31.96 | +25 ↑ | -7 ↓ | 19 Feb | CURRENT |
| CBA | Commonwealth Bank | Financials | A$170.22 | +19 ↑ | -11 ↓ | 19 Feb | CURRENT |
| HRZ | Horizon Minerals | Materials | A$1.24 | +27 ↑ | +18 ↑ | 19 Feb | CURRENT |
| DRO | DroneShield | Defence Technology | A$3.18 | +14 ↑ | +14 ↑ | 19 Feb | CURRENT |

### Column Definitions

**Sentiment column:**
- Shows Overall_Sentiment value
- Arrow: ↑ if positive, ↓ if negative, → if within ±3
- Cell background coloured: green > +8, red < -8, amber between
- This is the composite four-component number

**Company column:**
- Shows the Company Research contribution (w_company x Company_Signal)
- Arrow: ↑ if positive, ↓ if negative, → if within ±3
- Cell background coloured independently: green > +5, red < -5, amber between
- This tells the reader the company-specific research view

### Reader Interpretation at a Glance

The reader scans the index and immediately spots:
- **Both green:** Aligned. Environment and research agree.
- **Green sentiment, red company:** Caution. External factors are propping up a weak company story. Vulnerable to macro/sector reversal.
- **Red sentiment, green company:** Opportunity signal. Good company in a tough environment. May be mispriced if environment improves.
- **Both red:** Avoid. Everything negative.

This two-column pattern IS what thesis skew was trying to convey, but done correctly through the composite framework rather than an independent broken calculation.

---

## Change 4: History Logging Schema Update

Update the daily history snapshot schema. Replace `thesis_skew` with the decomposed values:

```json
{
  "date": "2026-02-19",
  "price": 31.96,
  "daily_change_pct": -0.8,
  "volume_ratio": 1.05,
  "overall_sentiment": 25,
  "external_signal": 32,
  "company_signal": -7,
  "macro_contribution": 2,
  "sector_contribution": 30,
  "tech_contribution": 0,
  "company_contribution": -7,
  "hypotheses": [
    { "id": "H1", "name": "Margin Pressure", "sentiment": "BEARISH", "survival_score": 34, "rank": 1 },
    { "id": "H2", "name": "Cost Reset Fails", "sentiment": "BEARISH", "survival_score": 28, "rank": 2 },
    { "id": "H3", "name": "Turnaround Execution", "sentiment": "BULLISH", "survival_score": 22, "rank": 3 },
    { "id": "H4", "name": "Structural Decline", "sentiment": "BEARISH", "survival_score": 16, "rank": 4 }
  ],
  "dominant_narrative": "H1",
  "narrative_flip": false,
  "events": [],
  "overcorrection_active": false,
  "reconstructed": false
}
```

The `external_signal` and `company_signal` fields enable the timeline chart to show both lines over time, making environment-vs-company divergence patterns visible historically.

---

## Change 5: Narrative Summary Auto-Generation

The text summary below the sentiment display should reference the decomposition when external and company diverge. Template logic:

**When aligned (both positive or both negative):**
```
"[Company] sentiment is [UPSIDE/DOWNSIDE] at [value], with external environment and company 
research aligned. [One-line T1 summary]."
```

**When diverging (external positive, company negative):**
```
"[Company] shows overall [UPSIDE/NEUTRAL] sentiment of [value], but company research is 
[DOWNSIDE] at [company_value]. The external environment ([external_value]) is currently 
offsetting [X] of [Y] bearish hypotheses. The dominant thesis is [T1 name]: [one-line summary]. 
If [primary external factor] reverses, the company-level view would dominate."
```

**When diverging (external negative, company positive):**
```
"[Company] shows overall [DOWNSIDE/NEUTRAL] sentiment of [value] despite positive company 
research ([company_value]). Headwinds from [primary external factor] are suppressing the 
[BULLISH] dominant thesis: [T1 name]. [One-line summary]. Improvement in [external factor] 
would unlock the company-level upside."
```

These templates make the divergence explicitly readable. The reader understands WHY the overall number is what it is.

---

## Change 6: Timeline Chart Addition

Add a second line to the narrative timeline chart:

- **Line 1 (existing):** Hypothesis survival scores over time (one line per hypothesis)
- **Line 2 (new):** Two-line overlay showing External Signal and Company Signal over time

The two-line overlay shows when external and company diverge and converge historically. Shade the gap between them: green when aligned, amber when diverging.

---

## Verification Tests

### Test 1: WOW (divergence case – external positive, company negative)

```
Display should show:
  OVERALL SENTIMENT:  +25 UPSIDE (green)
  External Environment   +32 (green)  |  Macro (+2) | Sector (+30) | Tech (0)
  Company Research        -7 (red)    |  3 of 4 hypotheses bearish | T1: Margin Pressure (BEARISH, 34%)

Index page: Sentiment +25 ↑ (green cell) | Company -7 ↓ (red cell)
```

Reader interpretation: "External factors carrying a weak company story. Vulnerable."

### Test 2: HRZ (aligned case – both positive)

```
Display should show:
  OVERALL SENTIMENT:  +27 UPSIDE (green)
  External Environment   +9 (green)   |  Macro (+1) | Sector (+8) | Tech (0)
  Company Research       +18 (green)  |  T1 bullish dominant | T1: Gold Production Ramp (BULLISH, 35%)

Index page: Sentiment +27 ↑ (green cell) | Company +18 ↑ (green cell)
```

Reader interpretation: "Gold helping, company executing. Aligned."

### Test 3: Hypothetical (company positive, external negative)

```
Display should show:
  OVERALL SENTIMENT:  -3 NEUTRAL (amber)
  External Environment  -18 (red)     |  Macro (-5) | Sector (-13) | Tech (0)
  Company Research      +15 (green)   |  T1 bullish dominant | T1: Execution Thesis (BULLISH, 38%)

Index page: Sentiment -3 → (amber cell) | Company +15 ↑ (green cell)
```

Reader interpretation: "Good company in a bad environment. Potential opportunity if macro turns."

### Failure Conditions

- If thesis skew appears anywhere on the platform, the cleanup is incomplete
- If External and Company rows show the same colour when their values have opposite signs, the independent colouring is broken
- If the index page Company column shows the same value as the Sentiment column for any stock, the decomposition is not wired correctly
- If the narrative summary does not reference the divergence when external and company are opposite signs, the template logic is wrong

---

## Instructions to Developer

> Read ERRATA_003_OPTICAL_COHERENCE.md. Three changes:
>
> 1. Remove thesis skew entirely from the codebase (field, calculation, display, index column)
> 2. Implement the two-row sentiment display on stock detail pages (Overall, External Environment, Company Research – each independently coloured)
> 3. Replace the Thesis Skew column on the index page with a Company column showing the company research contribution, independently coloured
>
> The reader must be able to see at a glance when external factors and company research diverge. This is the platform's highest-value insight.
