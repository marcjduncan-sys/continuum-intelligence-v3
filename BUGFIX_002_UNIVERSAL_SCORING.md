# BUGFIX 002: Universal Scoring and Display Fix

**Date:** 20 February 2026
**Priority:** BLOCKING. Apply to ALL stocks before any other work.
**Status:** This document supersedes BUGFIX_001 Bug 2 and BUGFIX_001A display ordering. Read this document completely before making any changes.

---

## Context

Three bugs are visible on every stock page. WOW is the reference example but these fixes apply universally across the entire coverage portfolio. Every stock must be recalculated and redisplayed after these changes.

### What Is Wrong (WOW Example)

**Screenshot shows:**
- Overall Sentiment: +25 UPSIDE (green)
- Company Research: +25 (green)
- T1 Erosion: 25% BEARISH
- T2 Regulatory: 21% BEARISH
- T3 Turnaround: 36% BULLISH (marked DOMINANT)
- T4 Disruption: 18% BEARISH

**Three problems:**

1. **Company Signal is wrong.** Three bearish hypotheses total 64% weight. One bullish hypothesis at 36%. The company-level research is net bearish. But Company Research shows +25 (green). The old T1-vs-T2 dominance calculation is still running instead of the weighted sentiment method.

2. **Hypothesis display order is wrong.** Hypotheses display in creation order (T1, T2, T3, T4). The highest-scoring hypothesis (T3 at 36%) is third on the list. The reader has to scan down to find the dominant narrative. Hypotheses should display sorted by score descending, so the dominant narrative is always at the top.

3. **Overall Sentiment is wrong.** Because Company Signal is wrong (+25 instead of approximately -34), the Overall Sentiment is wrong (+25 instead of approximately -33).

---

## Fix 1: Replace Company Signal Calculation

### Where to Find It

Search the codebase for the function that calculates the Company Signal (also called Idio Signal or company_contribution). It currently uses a T1-vs-T2 dominance method that looks something like:

```javascript
// OLD CODE - FIND AND REPLACE THIS
const t1 = hypotheses.sort((a, b) => b.survival_score - a.survival_score)[0];
const t2 = hypotheses.sort((a, b) => b.survival_score - a.survival_score)[1];
const lead = t1.survival_score - t2.survival_score;
const signal = (t1.sentiment === 'BULLISH' ? 1 : -1) * Math.sqrt(lead / 75) * 80;
```

Or it may use a linear version:

```javascript
// OLD CODE - ALSO FIND AND REPLACE THIS
const signal = (t1.sentiment === 'BULLISH' ? 1 : -1) * (lead / 75) * 100;
```

### New Calculation

Replace with the weighted sentiment method that accounts for ALL hypotheses:

```javascript
// NEW CODE - REPLACE THE ABOVE WITH THIS
function calculateCompanySignal(hypotheses) {
  let bullish_weight = 0;
  let bearish_weight = 0;

  hypotheses.forEach(h => {
    if (h.sentiment === 'BULLISH') {
      bullish_weight += h.survival_score;
    } else if (h.sentiment === 'BEARISH') {
      bearish_weight += h.survival_score;
    }
    // NEUTRAL hypotheses contribute to neither side
  });

  // raw_balance ranges from -100 (all bearish) to +100 (all bullish)
  const raw_balance = bullish_weight - bearish_weight;

  // Square-root amplification preserves signal strength at moderate values
  const abs_balance = Math.abs(raw_balance);
  const amplified = Math.sqrt(abs_balance / 100) * 80;

  // Cap at +/- 80
  const Company_Signal = Math.sign(raw_balance) * Math.min(amplified, 80);

  return Company_Signal;
}
```

### Verification for WOW

```
bullish_weight = 36 (T3 Turnaround only)
bearish_weight = 25 + 21 + 18 = 64 (T1 Erosion + T2 Regulatory + T4 Disruption)
raw_balance = 36 - 64 = -28

abs_balance = 28
amplified = sqrt(28 / 100) * 80 = sqrt(0.28) * 80 = 0.5292 * 80 = 42.3

Company_Signal = -1 * min(42.3, 80) = -42.3
```

Then the company contribution displayed on screen:

```
company_contribution = w_company * Company_Signal
                     = 0.80 * -42.3
                     = -33.8
                     → rounds to -34
```

**Company Research must display: -34 (red)**

### Verification for Other Stocks

Run this calculation for EVERY stock in the coverage universe. For each stock:

1. Sum all BULLISH hypothesis scores → bullish_weight
2. Sum all BEARISH hypothesis scores → bearish_weight
3. raw_balance = bullish_weight - bearish_weight
4. Company_Signal = sign(raw_balance) * sqrt(abs(raw_balance) / 100) * 80
5. company_contribution = w_company * Company_Signal

If a stock has 2 bullish (30% + 25% = 55%) and 2 bearish (25% + 20% = 45%):
```
raw_balance = 55 - 45 = +10
Company_Signal = +sqrt(10/100) * 80 = +sqrt(0.10) * 80 = +0.316 * 80 = +25.3
```
Company Research shows +25 (green). Correct – bullish hypotheses outweigh bearish.

If a stock has 1 bullish (80%) and 3 bearish (8% + 7% + 5% = 20%):
```
raw_balance = 80 - 20 = +60
Company_Signal = +sqrt(60/100) * 80 = +sqrt(0.60) * 80 = +0.775 * 80 = +62.0
```
Company Research shows a strong positive. Correct – overwhelmingly bullish.

If a stock has 4 bearish (30% + 28% + 22% + 20% = 100%):
```
raw_balance = 0 - 100 = -100
Company_Signal = -sqrt(100/100) * 80 = -1.0 * 80 = -80
```
Company Research shows -80 (strong red). Correct – unanimously bearish.

---

## Fix 2: Overall Sentiment Recalculation

Once the Company Signal is fixed, the Overall Sentiment must be recalculated:

```javascript
const Overall_Sentiment = 
  (w_macro * Macro_Signal) + 
  (w_sector * Sector_Signal) + 
  (w_tech * Tech_Signal) + 
  (w_company * Company_Signal);
```

### WOW Recalculated

```
Overall_Sentiment = (0.05 * 16) + (0.05 * 0) + (0.10 * 0) + (0.80 * -42.3)
                  = 0.8 + 0 + 0 + (-33.8)
                  = -33.0

External_Environment = 0.8 + 0 + 0 = +1
Company_Research = -33.8 → rounds to -34
Overall = -33 → DOWNSIDE (red)
```

**Overall Sentiment must display: -33 DOWNSIDE (red), not +25 UPSIDE (green)**

---

## Fix 3: Hypothesis Display Order

### Current Behaviour (Wrong)

Hypotheses display in creation order:
```
T1: Structural Margin Erosion   25%  BEARISH
T2: Regulatory Squeeze          21%  BEARISH
T3: Managed Turnaround          36%  BULLISH  ★ DOMINANT
T4: Disruption                  18%  BEARISH
```

The dominant narrative (T3 at 36%) is buried in third position. The reader scans from top to bottom and sees two bearish hypotheses before finding the dominant one.

### Required Behaviour

Hypotheses display sorted by survival score descending. The dominant narrative is always at the top:

```
T3: Managed Turnaround          36%  BULLISH  ★ DOMINANT
T1: Structural Margin Erosion   25%  BEARISH
T2: Regulatory Squeeze          21%  BEARISH
T4: Disruption                  18%  BEARISH
```

### Implementation

**Critical: The hypothesis ID (T1, T2, T3, T4) is permanent and never changes.** Only the DISPLAY ORDER changes. The ID is part of the hypothesis identity – it was assigned at creation and tracks that hypothesis forever.

In the rendering code for the hypothesis list (both the full hypothesis cards on the detail page AND the hypothesis tracker in the sidebar):

```javascript
// Sort hypotheses by survival_score descending FOR DISPLAY ONLY
const displayOrder = [...hypotheses].sort((a, b) => b.survival_score - a.survival_score);

// Render in this order
displayOrder.forEach(h => {
  renderHypothesisCard(h);
  // h.id remains "T1", "T2", etc. – unchanged
  // h.is_dominant is true for the first item (highest score)
});
```

### Where This Applies

This display ordering must be applied in ALL of these locations:

1. **Hypothesis cards on stock detail page** – the main list of hypothesis cards (T1 Erosion, T2 Regulatory, etc.). Sort by score descending.

2. **Hypothesis tracker in sidebar** – the small widget on the right showing hypothesis names and scores. Sort by score descending.

3. **Hypothesis summary in the hero section** – the compact display showing "T1 EROSION 25% | T2 REGULATORY 21% | T3 TURNAROUND 36% | T4 DISRUPTION 18%". Sort by score descending so it reads: "T3 TURNAROUND 36% | T1 EROSION 25% | T2 REGULATORY 21% | T4 DISRUPTION 18%"

4. **Company Research sub-line** – "3 bear / 1 bull • Dominant: T3 Turnaround (BULLISH, 36%)" – this should reference the actual dominant hypothesis (highest score), not T1 by default.

5. **Index page** – if hypothesis info is shown, sort by score.

6. **Any API endpoint or JSON output** that returns hypotheses for display should include a `display_order` field or return them pre-sorted by score.

### What Does NOT Change

- The hypothesis `id` field: T1 remains T1 forever
- The hypothesis `created_date`: unchanged
- The history log entries: hypotheses logged in creation order with scores
- The underlying JSON storage: hypotheses stored in creation order
- Timeline chart lines: each line is permanently identified by its hypothesis ID

The sort is a DISPLAY concern only. Data storage remains in creation order.

---

## Fix 4: Dominant Narrative Detection

### Where It Appears

The "DOMINANT NARRATIVE" label above the hypothesis list:

```
DOMINANT NARRATIVE
T3: Managed Turnaround
(BULLISH, 36%)
Previously dominant: T2 – overtaken 2026-01-15
```

### Implementation

```javascript
function getDominantNarrative(hypotheses, previousDominantId) {
  // Find highest-scoring hypothesis
  const dominant = hypotheses.reduce((max, h) => 
    h.survival_score > max.survival_score ? h : max
  );
  
  // Mark dominance
  hypotheses.forEach(h => {
    h.is_dominant = (h.id === dominant.id);
  });
  
  // Detect narrative flip
  const flipped = (previousDominantId && dominant.id !== previousDominantId);
  
  return {
    dominant_id: dominant.id,
    dominant_name: dominant.name,
    dominant_sentiment: dominant.sentiment,
    dominant_score: dominant.survival_score,
    previous_dominant_id: previousDominantId,
    narrative_flip: flipped
  };
}
```

### Narrative Flip Logging

When the dominant hypothesis changes, log it:

```javascript
if (flipped) {
  const flipRecord = {
    date: today,
    new_dominant_id: dominant.id,
    new_dominant_name: dominant.name,
    new_dominant_score: dominant.survival_score,
    new_dominant_sentiment: dominant.sentiment,
    old_dominant_id: previousDominantId,
    old_dominant_name: previousDominant.name,
    old_dominant_score: previousDominant.survival_score,
    old_dominant_sentiment: previousDominant.sentiment,
    trigger_evidence: latestEvidence,
    price_on_day: currentPrice,
    volume_ratio: currentVolumeRatio
  };
  
  // Append to history
  history.push({ ...dailySnapshot, narrative_flip: true, flip_detail: flipRecord });
}
```

---

## Fix 5: Company Research Sub-Line Text

### Current (Wrong)

```
Company Research  +25 ▲  (green)
  3 bear / 1 bull • Dominant: T1: Structural Margin Erosion (BEARISH) leads but outweighed
```

Two errors: the value is wrong (+25 should be -34), and the dominant reference is wrong (T1 is not dominant, T3 is).

### Required

```javascript
function companyResearchSubLine(hypotheses, Company_Signal) {
  const dominant = hypotheses.reduce((max, h) => 
    h.survival_score > max.survival_score ? h : max
  );
  
  const bullCount = hypotheses.filter(h => h.sentiment === 'BULLISH').length;
  const bearCount = hypotheses.filter(h => h.sentiment === 'BEARISH').length;
  const neutralCount = hypotheses.filter(h => h.sentiment === 'NEUTRAL').length;
  
  // Build count string
  const parts = [];
  if (bearCount > 0) parts.push(`${bearCount} bear`);
  if (bullCount > 0) parts.push(`${bullCount} bull`);
  if (neutralCount > 0) parts.push(`${neutralCount} neutral`);
  const countStr = parts.join(' / ');
  
  // Determine if dominant is outweighed
  const bullWeight = hypotheses
    .filter(h => h.sentiment === 'BULLISH')
    .reduce((sum, h) => sum + h.survival_score, 0);
  const bearWeight = hypotheses
    .filter(h => h.sentiment === 'BEARISH')
    .reduce((sum, h) => sum + h.survival_score, 0);
  
  let outweighed = false;
  if (dominant.sentiment === 'BULLISH' && bearWeight > bullWeight) outweighed = true;
  if (dominant.sentiment === 'BEARISH' && bullWeight > bearWeight) outweighed = true;
  
  const dominantStr = `Dominant: ${dominant.id}: ${dominant.name} (${dominant.sentiment}, ${dominant.survival_score}%)`;
  const suffix = outweighed ? ' leads but outweighed' : '';
  
  return `${countStr} • ${dominantStr}${suffix}`;
}
```

### WOW Output

```
3 bear / 1 bull • Dominant: T3: Managed Turnaround (BULLISH, 36%) leads but outweighed
```

This is correct: T3 Turnaround has the highest individual score but the combined bearish weight (64%) outweighs it.

---

## Complete WOW Display After All Fixes

```
MARKET CONTEXT:  [NEUTRAL badge]  ASX200 9,101 +3.2% 1mo | AUD/USD 0.7066 +4.6% | VIX 19.6 | RBA 4.10% (cutting gradually)

OVERALL SENTIMENT:  -33 ▼  DOWNSIDE (red)

  External Environment    +1 ▶  (amber)
    Macro (+1) • Sector (+0) • Tech (+0)

  Company Research       -34 ▼  (red)
    3 bear / 1 bull • Dominant: T3: Managed Turnaround (BULLISH, 36%) leads but outweighed

DOMINANT NARRATIVE
  T3: Managed Turnaround (BULLISH, 36%)
  Previously dominant: T2 – overtaken 2026-01-15

Hypotheses (sorted by score descending):

  T3: Managed Turnaround     36%  BULLISH   → Awaiting 1H FY26  ★ DOMINANT
  T1: Structural Margin Erosion  25%  BEARISH   ↑ Rising
  T2: Regulatory Squeeze     21%  BEARISH   ↑ Rising
  T4: Disruption             18%  BEARISH   → Steady

Sidebar Hypothesis Tracker:
  ● T3 Turnaround    36%
  ● T1 Erosion       25%
  ● T2 Regulatory    21%
  ● T4 Disruption    18%

Hero Section Summary:
  T3 TURNAROUND 36% | T1 EROSION 25% | T2 REGULATORY 21% | T4 DISRUPTION 18%
```

### Reader Interpretation

"The dominant narrative is a turnaround thesis at 36%, but three bearish hypotheses collectively represent 64% of the weight. Company research is decidedly negative at -34. External environment is neutral (+1). Overall sentiment is DOWNSIDE at -33. The 1H results on 25 February are the key diagnostic event – if they confirm margin recovery, T3 strengthens and sentiment shifts. If they disappoint, T1 Erosion reclaims dominance."

The numbers, colours, labels, and hypothesis order all tell the same story.

---

## Applying to ALL Stocks

This is not a WOW-specific fix. Every stock in the coverage universe must be recalculated and redisplayed.

### Step-by-Step for the Developer

1. **Find the Company Signal / Idio Signal calculation function.** There should be one function that calculates this for all stocks. Replace it with the weighted sentiment method (Fix 1 above).

2. **Find the Overall Sentiment calculation.** It should already use the four-component formula. After fixing the Company Signal, the Overall Sentiment will automatically be correct. Verify it recalculates.

3. **Find every location where hypotheses are rendered** (listed in Fix 3 above – detail page cards, sidebar tracker, hero section, index page). In each location, sort the hypotheses array by survival_score descending before rendering.

4. **Find the dominant narrative detection.** Ensure it picks the highest-scoring hypothesis, not the one labelled T1. Update the Company Research sub-line to reference the actual dominant.

5. **Rebuild all stock pages.** After making the code changes, trigger a full rebuild so every stock page recalculates and redisplays with the corrected logic.

6. **Verify at least 5 stocks manually:**

| Stock | Expected Company Signal Direction | Why |
|-------|----------------------------------|-----|
| WOW   | Negative (approx -34) | 64% bearish vs 36% bullish |
| DRO   | Check hypothesis balance | Sum bullish vs bearish weights |
| HRZ   | Check hypothesis balance | Likely positive if T1 bullish dominant |
| BHP   | Check hypothesis balance | Mixed – verify arithmetic |
| PME   | Check hypothesis balance | Likely positive if T1 bullish |

For each stock: manually sum bullish hypothesis scores, sum bearish hypothesis scores, calculate raw_balance, apply the formula, and verify the displayed Company Research value matches.

### Common Errors to Watch For

- **Forgot to update one rendering location.** The sidebar might still show creation order while the main cards show score order. Check ALL locations listed in Fix 3.
- **Company Signal still positive when it should be negative.** The old T1-vs-T2 code might still be running somewhere, or a cached value is being used. Clear caches and verify the calculation runs fresh.
- **Dominant narrative still references T1 instead of highest scorer.** The getDominantNarrative function must use `reduce` to find the max score, not just read `hypotheses[0]`.
- **Display order changes the underlying data.** The sort MUST be a display-only operation on a copy of the array. The original hypothesis array in the JSON must remain in creation order. Use `[...hypotheses].sort()` not `hypotheses.sort()`.

---

## Files Modified

The developer will need to modify:

1. **Company Signal calculation** – likely in a file named something like `calc-idio-signal.js`, `calc-company-signal.js`, `composite.js`, or similar
2. **Stock page template** – the HTML/JSX/component that renders the hypothesis cards, sidebar tracker, hero section, Company Research line
3. **Index page template** – the coverage table showing all stocks
4. **Dominant narrative logic** – wherever `dominant_narrative_id` or `is_dominant` is set
5. **All stock JSON files** – after recalculation, the stored values will change

---

## Verification Checklist

After applying all fixes, verify each of these is true:

- [ ] WOW Company Research shows approximately -34 (red), not +25
- [ ] WOW Overall Sentiment shows approximately -33 DOWNSIDE (red), not +25 UPSIDE
- [ ] WOW hypotheses display in order: T3 (36%), T1 (25%), T2 (21%), T4 (18%)
- [ ] WOW dominant narrative reads "T3: Managed Turnaround (BULLISH, 36%)"
- [ ] WOW Company Research sub-line reads "3 bear / 1 bull • Dominant: T3: Managed Turnaround (BULLISH, 36%) leads but outweighed"
- [ ] WOW sidebar tracker shows hypotheses sorted by score descending
- [ ] WOW hero section shows hypotheses sorted by score descending
- [ ] At least 4 other stocks verified: Company Signal direction matches hypothesis balance
- [ ] No stock shows Company Research positive (green) when bearish hypothesis weight exceeds bullish
- [ ] No stock shows Company Research negative (red) when bullish hypothesis weight exceeds bearish
- [ ] Hypothesis IDs (T1, T2, T3, T4) have not changed – only display order changed
- [ ] Underlying JSON files store hypotheses in creation order (not score order)
- [ ] Sidebar tracker is sorted by score descending
- [ ] Hero section summary is sorted by score descending
- [ ] Market Context bar shows qualitative badge (NEUTRAL/POSITIVE/NEGATIVE), not numeric score

---

## Do Not Proceed Until

All items in the verification checklist pass. Phase 3 (Price-as-Evidence Engine) depends on correct Company Signal calculations. If the Company Signal is wrong, every downstream calculation built on it will also be wrong.
