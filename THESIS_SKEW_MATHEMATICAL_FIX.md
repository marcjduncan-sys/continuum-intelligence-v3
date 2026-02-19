# Thesis Skew Calculation – Mathematical Rework

**Date:** 19 February 2026
**Supersedes:** Thesis skew calculation in NARRATIVE_FRAMEWORK_V3.md Section "Principle 5"
**Problem:** Simple bull-minus-bear summation produces absurd results when multiple bearish (or bullish) hypotheses fragment the alternative view.

---

## The Problem Demonstrated

### WDS.AX Current State

```
T1: LNG Growth (BULLISH)     29%  ↑ Rising
T2: Exec Risk (BEARISH)      25%  → Awaiting
T3: Value Trap (BEARISH)     25%  → Steady
T4: Stranded (BEARISH)       21%  → Steady
```

### Current (flawed) calculation

```
Bullish total:  29
Bearish total:  25 + 25 + 21 = 71
Thesis skew:    29 - 71 = -42
Display:        DOWNSIDE (red) with -42
```

This says WDS has a massive bearish skew. But the dominant narrative is bullish and rising, confirmed by price. The -42 is an artefact of having three separate bearish hypotheses rather than one. If you collapsed T2, T3, T4 into a single "Downside Scenario" at 71%, the skew would be the same, but the signal would feel different – and that inconsistency reveals the flaw.

### Why simple summation fails

The four hypotheses are a probability distribution, not a poll. They represent: "there is a 29% chance the bullish thesis is correct, 25% chance it's execution risk, 25% chance it's a value trap, 21% chance assets are stranded."

Summing the bearish probabilities treats three independent failure modes as a unified bearish view. But they are mutually exclusive – WDS cannot simultaneously be an execution risk AND a value trap AND have stranded assets. Only one of these bearish scenarios can be true. The downside is not 71%. The downside is, at most, the probability of any single bearish scenario being correct – which is 25%.

---

## Solution: Dominance-Weighted Sentiment Scoring

### Method

Instead of summing all bullish vs all bearish, the skew calculation should reflect:

1. **The strength of the dominant narrative** (how far T1 leads T2)
2. **The fragmentation of the alternative view** (are alternatives concentrated or dispersed)
3. **The directional balance adjusted for concentration**

### Formula

```
// Step 1: Identify dominant narrative sentiment
dominant_sentiment = T1.sentiment  // BULLISH or BEARISH

// Step 2: Calculate dominance margin
// How much T1 leads the strongest alternative
dominance_margin = T1.score - T2.score

// Step 3: Calculate the Herfindahl-style concentration index
// for each sentiment direction
// This measures whether the bearish (or bullish) view is
// concentrated in one hypothesis or fragmented across many

bullish_scores = [scores of all BULLISH hypotheses]
bearish_scores = [scores of all BEARISH hypotheses]

// Effective bullish weight = largest single bullish hypothesis score
// adjusted by how concentrated the bullish view is
bullish_effective = max(bullish_scores) * (1 + concentration_bonus(bullish_scores))

// Effective bearish weight = largest single bearish hypothesis score  
// adjusted by how concentrated the bearish view is
bearish_effective = max(bearish_scores) * (1 + concentration_bonus(bearish_scores))

// Step 4: Calculate skew from effective weights
thesis_skew = bullish_effective - bearish_effective

// Concentration bonus function:
// If all bearish probability is in one hypothesis, bonus = 0.5 (strong signal)
// If bearish probability is evenly split across 3, bonus = 0.0 (fragmented)
function concentration_bonus(scores):
    if scores.length == 0: return 0
    if scores.length == 1: return 0.5
    total = sum(scores)
    if total == 0: return 0
    shares = [s / total for s in scores]
    hhi = sum(s^2 for s in shares)  // Herfindahl index: 1/n for equal, 1.0 for monopoly
    min_hhi = 1 / scores.length
    // Normalise to 0-0.5 range
    return 0.5 * (hhi - min_hhi) / (1.0 - min_hhi)
```

### WDS.AX Recalculated

```
Bullish hypotheses: [29]
Bearish hypotheses: [25, 25, 21]

Bullish effective:
  max = 29
  concentration_bonus: only 1 bullish hypothesis, bonus = 0.5
  bullish_effective = 29 * 1.5 = 43.5

Bearish effective:
  max = 25
  concentration_bonus:
    total = 71
    shares = [0.352, 0.352, 0.296]
    hhi = 0.124 + 0.124 + 0.088 = 0.336
    min_hhi = 1/3 = 0.333
    normalised = 0.5 * (0.336 - 0.333) / (1.0 - 0.333) = 0.5 * 0.003/0.667 = 0.002
  bearish_effective = 25 * 1.002 = 25.05

Thesis skew = 43.5 - 25.05 = +18.5
Display: UPSIDE (green) with +18
```

This correctly reflects: the dominant narrative is bullish, the bearish alternatives are fragmented and none individually stronger than the bull case.

### Cross-Check: Would This Produce Wrong Results?

**Scenario A: Strong concentrated bearish view**
```
T1: Bear Thesis (BEARISH)    55%
T2: Bull Case (BULLISH)      25%
T3: Neutral (NEUTRAL)        12%
T4: Wild Card (NEUTRAL)       8%

Bearish effective: 55 * 1.5 = 82.5 (single hypothesis, max concentration)
Bullish effective: 25 * 1.5 = 37.5 (single hypothesis)
Neutral: split evenly, 10 each side -> bullish 37.5+10=47.5, bearish 82.5+10=92.5

Skew = 47.5 - 92.5 = -45
Display: DOWNSIDE (red) with -45 ✓ Correct
```

**Scenario B: Even split, genuine uncertainty**
```
T1: Bull (BULLISH)           28%
T2: Bear (BEARISH)           27%
T3: Bear Alt (BEARISH)       25%
T4: Neutral (NEUTRAL)        20%

Bullish effective: 28 * 1.5 = 42
Bearish effective:
  max = 27
  shares = [0.519, 0.481], hhi = 0.269+0.231 = 0.500
  min_hhi = 0.5, normalised bonus = 0
  bearish_effective = 27 * 1.0 = 27
Neutral: 10 each side -> bullish 52, bearish 37

Skew = 52 - 37 = +15
Display: UPSIDE (green) with +15
```

Hmm – this still shows upside even though T2+T3 = 52% bearish. But the dominant narrative IS bullish. T1 leads. The bearish view is split between two distinct scenarios. This is the correct analytical read: the single strongest explanation is bullish, even though there are multiple ways it could go wrong. The user sees +15 UPSIDE and can also see that T2+T3 collectively represent significant risk – that context is in the hypothesis display, not the skew number.

**Scenario C: Overwhelming bearish consensus**
```
T1: Bear (BEARISH)           45%
T2: Bear Alt (BEARISH)       30%
T3: Bull (BULLISH)           15%
T4: Neutral (NEUTRAL)        10%

Bearish effective:
  max = 45
  shares = [0.6, 0.4], hhi = 0.36+0.16 = 0.52
  min_hhi = 0.5, bonus = 0.5*(0.52-0.5)/(1-0.5) = 0.02
  bearish_effective = 45 * 1.02 = 45.9
Bullish effective: 15 * 1.5 = 22.5
Neutral: 5 each side -> bullish 27.5, bearish 50.9

Skew = 27.5 - 50.9 = -23.4
Display: DOWNSIDE (red) with -23 ✓ Correct
```

---

## Handling NEUTRAL Hypotheses

NEUTRAL hypotheses (e.g. M&A, corporate event) could go either way. The current framework splits them equally. A better approach:

```
For NEUTRAL hypotheses:
  If the stock price is above its 200-day MA: allocate 60% to bullish, 40% to bearish
  If below 200-day MA: allocate 40% to bullish, 60% to bearish
  If within 2% of 200-day MA: split 50/50
```

This grounds the neutral allocation in observable market behaviour rather than an arbitrary 50/50.

---

## Simplified Version (if the above is too complex for initial implementation)

If the Herfindahl approach is too much for v1, use this simpler method that captures the same insight:

```
// The skew is driven by T1's sentiment and how far it leads T2
// Not by summing all hypotheses

dominant_score = T1.score
challenger_score = T2.score
margin = dominant_score - challenger_score

if T1.sentiment == "BULLISH":
    thesis_skew = +margin * 2  // Scale to make the number meaningful
    // Cap at +/-(dominant_score) so it can't exceed the T1 weight
    thesis_skew = min(thesis_skew, dominant_score)
    
if T1.sentiment == "BEARISH":
    thesis_skew = -margin * 2
    thesis_skew = max(thesis_skew, -dominant_score)

// WDS example: margin = 29-25 = 4, skew = +8
// Display: UPSIDE (green) with +8
// Reads as: "modestly bullish, T1 leads by a slim margin"
```

This is less mathematically rigorous but captures the core insight: the skew should reflect the competition between T1 and T2, not a vote across all hypotheses.

---

## Display Thresholds (updated)

```
Skew > +20:    "STRONG UPSIDE" (bright green)
Skew +5 to +20: "UPSIDE" (green)
Skew -5 to +5:  "NEUTRAL" (amber)
Skew -5 to -20: "DOWNSIDE" (red)
Skew < -20:     "STRONG DOWNSIDE" (bright red)
```

---

## Implementation Priority

1. Replace the current bull-minus-bear summation with the dominance-weighted method (or the simplified version for v1)
2. Update the thesis skew display to use the new thresholds
3. Verify against all 18 coverage stocks that the skew now makes intuitive sense when read alongside the hypothesis scores
4. Add to the daily recalculation pipeline

---

## Key Principle

The thesis skew answers the question: **"Is the market's dominant view of this stock positive or negative, and how strongly?"**

It does NOT answer: **"If you count all the ways this could go wrong, do they outnumber the ways it could go right?"**

The first question is analytically useful. The second is a counting exercise that penalises uncertainty and always biases toward whichever direction has fewer hypotheses, regardless of their individual strength.
