# BUGFIX 001A: Hypothesis Identity vs Dominance

**Date:** 20 February 2026
**Applies to:** BUGFIX_001_SCORING_AND_DISPLAY.md (Bug 1 only)
**Status:** MANDATORY. Corrects Bug 1 fix. Bug 2 and Bug 3 fixes in BUGFIX_001 remain unchanged.

---

## Correction

BUGFIX_001 Bug 1 instructed: "sort hypotheses by survival_score descending, re-assign T1/T2/T3/T4 labels." This is wrong. Hypothesis labels are permanent identifiers, not rank positions.

---

## The Rule

**Hypothesis identifiers (T1, T2, T3, T4) are permanent.** They are assigned when the hypothesis is created and never change. T1 Erosion is always T1 Erosion, even if its score drops to 5%.

**Dominance is dynamic.** The hypothesis with the highest survival score holds the dominant position. When a different hypothesis overtakes the current dominant, that is a **narrative flip** – the most important signal the platform tracks.

These are two different concepts:

| Concept | Changes? | Example |
|---------|----------|---------|
| Hypothesis ID (T1, T2, T3, T4) | Never | T1 is always "Erosion" |
| Hypothesis score | Every cycle | T1 Erosion drops from 40% to 25% |
| Dominant narrative | On crossover | T3 Turnaround overtakes T1 Erosion |

---

## Display Rules

### Hypothesis List (stock detail page)

Always display in original creation order (T1, T2, T3, T4). The dominant hypothesis gets a visual marker:

```
  T1 Erosion       25%  (BEARISH)   ↑ Rising
  T2 Regulatory    21%  (BEARISH)   ↑ Rising
  T3 Turnaround    36%  (BULLISH)   ↑ Rising    ★ DOMINANT
  T4 Disruption    18%  (BEARISH)   → Steady
```

### Dominant Narrative Line (above hypothesis list)

```
DOMINANT NARRATIVE:  T3 Turnaround (BULLISH, 36%)
  Previously dominant: T1 Erosion – overtaken 14 Feb 2026
```

### Company Research Line (sentiment decomposition)

```
Company Research       -23 ▼  (red)
  3 bear / 1 bull • Dominant: T3 Turnaround (BULLISH, 36%) leads but outweighed
```

### Index Page

Add a Dominant column or integrate into existing display:

| ASX | Company | Price | Sentiment | Company | Dominant | Updated |
|-----|---------|-------|-----------|---------|----------|---------|
| WOW | Woolworths | A$31.96 | -22 ↓ | -23 ↓ | T3 Turnaround | 20 Feb |

---

## Narrative Flip Detection

A narrative flip occurs when the dominant hypothesis changes. The detection logic:

```javascript
// After score normalisation (every cycle)
const currentDominant = hypotheses.reduce((max, h) => 
  h.survival_score > max.survival_score ? h : max
);

if (currentDominant.id !== previousDominant.id) {
  // NARRATIVE FLIP
  logNarrativeFlip(ticker, date, {
    new_dominant: currentDominant,      // e.g. { id: "T3", name: "Turnaround", score: 36 }
    old_dominant: previousDominant,      // e.g. { id: "T1", name: "Erosion", score: 25 }
    trigger: latestEvidence,
    price_on_day: currentPrice,
    volume_on_day: currentVolume
  });
}

// Store for next cycle comparison
previousDominant = currentDominant;
```

### What Gets Logged in History

```json
{
  "date": "2026-02-14",
  "narrative_flip": true,
  "flip_detail": {
    "new_dominant_id": "T3",
    "new_dominant_name": "Turnaround",
    "new_dominant_score": 36,
    "new_dominant_sentiment": "BULLISH",
    "old_dominant_id": "T1",
    "old_dominant_name": "Erosion",
    "old_dominant_score": 25,
    "old_dominant_sentiment": "BEARISH",
    "trigger_evidence": "1H FY26 results preview: consensus expects margin improvement",
    "price": 31.96,
    "volume_ratio": 1.4
  }
}
```

---

## Timeline Chart Implications

The narrative timeline chart (Phase 6) shows:

- One line per hypothesis (T1, T2, T3, T4), permanently labelled and coloured by sentiment
- Lines cross when dominance changes
- A vertical dashed marker at each crossover point, labelled: "T3 overtakes T1"
- The crossover IS the narrative flip – it's visually obvious as the lines crossing
- Hover/click on the crossover marker shows the flip detail (old/new dominant, trigger, price)

This is the platform's signature visualisation. The permanent hypothesis identifiers make crossovers meaningful and trackable. If identifiers were reassigned on every ranking change, crossovers would be invisible.

---

## Stock JSON Schema Update

Each hypothesis in the stock JSON keeps its permanent ID:

```json
{
  "hypotheses": [
    {
      "id": "T1",
      "name": "Erosion",
      "sentiment": "BEARISH",
      "survival_score": 25,
      "created_date": "2026-01-15",
      "is_dominant": false
    },
    {
      "id": "T2",
      "name": "Regulatory",
      "sentiment": "BEARISH",
      "survival_score": 21,
      "created_date": "2026-01-15",
      "is_dominant": false
    },
    {
      "id": "T3",
      "name": "Turnaround",
      "sentiment": "BULLISH",
      "survival_score": 36,
      "created_date": "2026-01-15",
      "is_dominant": true
    },
    {
      "id": "T4",
      "name": "Disruption",
      "sentiment": "BEARISH",
      "survival_score": 18,
      "created_date": "2026-01-15",
      "is_dominant": false
    }
  ],
  "dominant_narrative_id": "T3",
  "previous_dominant_id": "T1",
  "last_flip_date": "2026-02-14"
}
```

The `id` field never changes. The `is_dominant` boolean and `dominant_narrative_id` field update when crossovers occur.

---

## Interaction with Company Signal (Bug 2 Fix – UNCHANGED)

The weighted sentiment calculation from BUGFIX_001 Bug 2 is unaffected by this correction. It uses hypothesis sentiments and scores, not labels or ranks:

```javascript
let bullish_weight = 0;
let bearish_weight = 0;

hypotheses.forEach(h => {
  if (h.sentiment === 'BULLISH') bullish_weight += h.survival_score;
  else if (h.sentiment === 'BEARISH') bearish_weight += h.survival_score;
});

const raw_balance = bullish_weight - bearish_weight;
const amplified = Math.sqrt(Math.abs(raw_balance) / 100) * 80;
const Company_Signal = Math.sign(raw_balance) * Math.min(amplified, 80);
```

This produces the same result regardless of hypothesis ordering or labelling. WOW still calculates to Company_Signal = -42.3, company_contribution = -34.

---

## Verification

### WOW After All Fixes (Bugfix 001 + 001A)

```
Market Context: [green badge: POSITIVE] | ASX200 9,101 +3.2% 1mo | ...

OVERALL SENTIMENT:  -22 ▼  DOWNSIDE (red)

  External Environment    +1 ▶  (amber)
    Macro (+1) • Sector (+0) • Tech (+0)

  Company Research       -23 ▼  (red)
    3 bear / 1 bull • Dominant: T3 Turnaround (BULLISH, 36%) leads but outweighed

DOMINANT NARRATIVE:  T3 Turnaround (BULLISH, 36%)
  Previously dominant: T1 Erosion – overtaken 14 Feb 2026

  T1 Erosion       25%  (BEARISH)   ↑ Rising
  T2 Regulatory    21%  (BEARISH)   ↑ Rising
  T3 Turnaround    36%  (BULLISH)   ↑ Rising    ★ DOMINANT
  T4 Disruption    18%  (BEARISH)   → Steady
```

### Failure Conditions

- If hypothesis labels change when scores change, the identity system is broken
- If hypotheses are reordered by score instead of displayed in creation order, the display is wrong
- If the dominant marker does not move to the highest-scoring hypothesis, dominance detection is broken
- If the timeline chart lines change colour or label when crossovers occur, the permanent identity is not implemented

---

## Instructions to Developer

> Read BUGFIX_001A_HYPOTHESIS_IDENTITY.md. This corrects Bug 1 in BUGFIX_001:
>
> - Hypothesis IDs (T1, T2, T3, T4) are PERMANENT. Never reassign them.
> - Hypotheses always display in creation order, not score order.
> - The highest-scoring hypothesis is marked as DOMINANT with a star/badge.
> - When dominance changes (crossover), log as a narrative flip with full detail.
> - Bug 2 (weighted Company Signal) and Bug 3 (macro context badge) from BUGFIX_001 remain unchanged.
