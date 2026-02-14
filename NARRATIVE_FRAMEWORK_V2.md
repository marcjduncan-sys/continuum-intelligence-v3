# Narrative Framework v2.0 — Price-Responsive Intelligence

## The Problem

Current framework state (PME example):
| Hypothesis | Static Weight | Market Reality |
|------------|---------------|----------------|
| T1: US Expansion | 60% | Still winning contracts, but market doesn't care |
| T2: Valuation Mean-Reversion | 35% | **This is the active narrative** — multiple compression |
| T3: Competitive Disruption | 20% | **Should be 40%+** — AI fears driving the sell-off |
| T4: AI Amplifies Moat | 50% | **Contradicted** — AI now seen as threat, not ally |

**Price action:** -51% from peak, -8% single day on high volume  
**Framework response:** None — static weights unchanged  
**Result:** Framework appears disconnected from market reality

---

## The Solution: Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 3: COMMENTARY ENGINE                                     │
│  Generate text that reflects market-implied narrative shifts    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 2: DYNAMIC HYPOTHESIS WEIGHTING                          │
│  Bayesian updating based on price-narrative correlation         │
│  Short-term (price-driven) vs Long-term (fundamental) tracks    │
└─────────────────────────────────────────────────────────────────┘
                              ▲
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 1: PRICE DISLOCATION DETECTION                           │
│  Statistical significance testing + Volume confirmation         │
│  Pattern recognition (gap down, distribution, capitulation)     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Price Dislocation Detection

### Statistical Measures

```javascript
const PRICE_DISLOCATION = {
  // 1. Z-Score of daily return
  dailyMoveZScore: (todayReturn, avgReturn, stdDev) => {
    return (todayReturn - avgReturn) / stdDev;
  },
  
  // 2. Position within 52-week range
  rangePosition: (current, low, high) => {
    return (current - low) / (high - low); // 0 = at low, 1 = at high
  },
  
  // 3. Volume confirmation
  volumeConfirmation: (todayVolume, avgVolume) => {
    return todayVolume / avgVolume;
  },
  
  // 4. Consecutive down days (distribution pattern)
  distributionPattern: (priceHistory) => {
    // Detect sustained selling vs. one-off moves
  },
  
  // 5. Drawdown severity
  drawdownSeverity: (current, peak) => {
    return (peak - current) / peak;
  }
};
```

### Dislocation Classification

| Severity | Z-Score | Drawdown | Volume | Classification |
|----------|---------|----------|--------|----------------|
| CRITICAL | > 3.0 | > 30% | > 3x avg | **Narrative regime change** |
| HIGH | 2.0-3.0 | 20-30% | > 2x avg | **Significant narrative shift** |
| MODERATE | 1.5-2.0 | 10-20% | > 1.5x avg | **Narrative tension building** |
| NORMAL | < 1.5 | < 10% | Normal | No adjustment needed |

---

## Layer 2: Dynamic Hypothesis Weighting

### The Core Innovation: Market-Implied Probabilities

Traditional framework: Analyst assigns weights based on fundamental research  
**New framework:** Weights are a **blend** of:
- **Long-term weights (LT):** Fundamental research-based (60% influence)
- **Short-term weights (ST):** Market-implied from price action (40% influence)

### Bayesian Updating Formula

```javascript
function updateHypothesisWeights(currentWeights, priceDislocation, newsFlow) {
  // 1. Detect which hypothesis is being confirmed/contradicted by price
  const priceImplication = inferNarrativeFromPrice(priceDislocation, newsFlow);
  
  // 2. Calculate market-implied shift
  const marketImpliedShift = calculateMarketImplication(priceImplication);
  
  // 3. Blend long-term and short-term views
  const newWeights = {};
  for (const [hypothesis, weight] of Object.entries(currentWeights)) {
    const ltWeight = weight.longTerm;
    const stWeight = weight.shortTerm;
    
    // Adjust short-term weight based on price confirmation
    const confirmation = getPriceConfirmation(hypothesis, priceDislocation);
    const adjustedST = adjustShortTermWeight(stWeight, confirmation, marketImpliedShift);
    
    // Blend: 60% fundamental, 40% market-implied
    newWeights[hypothesis] = {
      longTerm: ltWeight,
      shortTerm: adjustedST,
      blended: (ltWeight * 0.6) + (adjustedST * 0.4),
      confidence: calculateConfidence(ltWeight, adjustedST, confirmation)
    };
  }
  
  return newWeights;
}
```

### Price-to-Narrative Inference Matrix

| Price Pattern | Volume | Likely Active Hypothesis | Confidence |
|---------------|--------|-------------------------|------------|
| Large gap down on news | High | T3 (Competitive threat realized) | High |
| Steady decline, no news | Low-Moderate | T2 (Valuation mean-reversion) | Medium |
| Sharp drop on earnings | Very High | T1 (Growth/margin miss) | High |
| Distribution over weeks | Moderate | T4 (Thesis reversal) | Medium |
| Capitulation sell-off | Extreme | Multi-hypothesis reset | Medium |

### PME Case Study — What Should Happen

**Initial State (Feb 10, 2026):**
```javascript
PME.hypotheses = {
  T1: { lt: 60, st: 60, blended: 60 }, // US Expansion
  T2: { lt: 35, st: 35, blended: 35 }, // Valuation mean-reversion
  T3: { lt: 20, st: 20, blended: 20 }, // Competitive disruption
  T4: { lt: 50, st: 50, blended: 50 }  // AI Amplifies Moat
};
```

**Price Dislocation Detected (Feb 13, 2026):**
- Price: A$118.22 (was A$162.64 at review, A$336 at peak)
- Single-day move: -8.36%
- Z-score: 2.8 (HIGH severity)
- Drawdown: -51% from peak, -27% from review date
- Volume: 1.46M (2.1x average)
- Pattern: Accelerating decline, new lows

**News Context:**
- No specific PME news
- Broader AI sell-off in market
- DeepSeek concerns affecting high-multiple tech

**Market Inference:**
```javascript
priceImplication = {
  activeNarrative: 'T3', // Competitive disruption fears
  secondaryNarrative: 'T2', // Valuation compression
  contradictedNarrative: 'T4', // AI no longer seen as moat amplifier
  confidence: 0.75
};
```

**Updated Weights:**
```javascript
PME.hypotheses = {
  T1: { lt: 60, st: 45, blended: 54, confidence: 'MEDIUM' },
  T2: { lt: 35, st: 55, blended: 43, confidence: 'HIGH' }, // Market saying valuation matters now
  T3: { lt: 20, st: 60, blended: 36, confidence: 'HIGH' }, // AI fear dominant
  T4: { lt: 50, st: 15, blended: 36, confidence: 'LOW' }   // Market has reversed view
};
```

---

## Layer 3: Market-Responsive Commentary

### Narrative Status Indicator

```javascript
const narrativeStatus = {
  // Compare blended weights to long-term weights
  divergence: calculateDivergence(blended, longTerm),
  
  // Classify the divergence
  classification: {
    ALIGNED: 'Market and research aligned',
    TENSION: 'Market questioning research view',
    DIVERGENT: 'Market contradicts research view',
    REGIME_CHANGE: 'Narrative regime shift in progress'
  },
  
  // Generate appropriate commentary
  commentary: generateCommentary(classification, priceDislocation)
};
```

### Example Commentary for PME

**Current (Static) Commentary:**
> "The market narrative is dominated by a single tension: extraordinary business quality vs extreme valuation. At 163x trailing P/E, the stock prices in years of flawless execution."

**Market-Responsive Commentary:**
> "**⚠️ NARRATIVE REGIME SHIFT DETECTED** — The market has repriced PME aggressively, with shares down 51% from peak and -27% since our last review. 
>
> **Market-Implied Narrative (High Confidence):** The dominant fear has shifted from 'valuation too high' to 'AI as competitive threat.' The market is treating T4 (AI Amplifies Moat) as **contradicted** — implied weight has collapsed from 50% to ~15%. 
>
> **Tension:** Our fundamental research still supports T4 at 50%, but price action suggests the market believes competitors (including AI-native entrants) will erode PME's cloud-native advantage. 
>
> **Research vs. Market Divergence:**
> - T2 (Valuation): Research 35% → Market 55% ✓ (Converging — market agrees multiple too high)
> - T3 (Competition): Research 20% → Market 60% ⚠️ (Major divergence — we see minimal evidence)
> - T4 (AI Moat): Research 50% → Market 15% ⚠️ (Major divergence — market now sees AI as threat)
>
> **Implication:** Either (a) the market is overreacting to AI fears and creating entry opportunity, or (b) we're underestimating competitive threat velocity. Given the magnitude of price dislocation, this warrants immediate review of competitive dynamics."

---

## Implementation Architecture

### File Structure

```
scripts/
├── price-dislocation.js       # Layer 1: Statistical detection
├── narrative-inference.js     # Layer 2: Price→narrative mapping
├── hypothesis-updater.js      # Weight blending engine
├── commentary-generator.js    # Layer 3: Market-responsive text
└── framework-v2-integration.js # Main orchestrator

data/
├── dislocation-events.json    # History of detected dislocations
├── hypothesis-weights.json    # Current short/long-term weights
└── narrative-regimes.json     # Detected regime changes
```

### Key Functions

```javascript
// price-dislocation.js
function detectPriceDislocation(ticker, priceData, volumeData) {
  return {
    severity: 'CRITICAL' | 'HIGH' | 'MODERATE' | 'NORMAL',
    zScore: number,
    drawdownPct: number,
    volumeRatio: number,
    pattern: 'GAP_DOWN' | 'DISTRIBUTION' | 'CAPITULATION' | 'STEADY_DECLINE',
    timestamp: ISOString
  };
}

// narrative-inference.js
function inferNarrativeFromPrice(dislocation, newsContext, historicalPatterns) {
  return {
    primaryHypothesis: 'T1' | 'T2' | 'T3' | 'T4',
    secondaryHypothesis: 'T1' | 'T2' | 'T3' | 'T4' | null,
    contradictedHypothesis: 'T1' | 'T2' | 'T3' | 'T4' | null,
    confidence: 0.0-1.0,
    reasoning: string
  };
}

// hypothesis-updater.js
function calculateDynamicWeights(baseWeights, marketImplication, dislocation) {
  return {
    T1: { lt, st, blended, confidence },
    T2: { lt, st, blended, confidence },
    T3: { lt, st, blended, confidence },
    T4: { lt, st, blended, confidence }
  };
}

// commentary-generator.js
function generateMarketResponsiveCommentary(stockData, dynamicWeights, dislocation) {
  return {
    summary: string,
    divergenceAnalysis: string,
    recommendation: string,
    urgency: 'IMMEDIATE' | 'HIGH' | 'MODERATE' | 'LOW'
  };
}
```

---

## Visual Representation

### Hypothesis Dashboard — PME Example

```
┌────────────────────────────────────────────────────────────────────┐
│  PME.AX — Pro Medicus                    [ALERT: Regime Shift]     │
├────────────────────────────────────────────────────────────────────┤
│  PRICE DISLOCATION                                                 │
│  Current: A$118.22  │  Review: A$162.64  │  Peak: A$336.00        │
│  Drawdown: -27% since review  │  -51% from peak                    │
│  Severity: HIGH (Z: 2.8, Vol: 2.1x)                                │
├────────────────────────────────────────────────────────────────────┤
│  HYPOTHESIS WEIGHTS          Research │ Market │ Blended │ Conf    │
│  ─────────────────────────────────────────────────────────────────│
│  T1: US Expansion        ████████░░░    60%  │   45%  │   54%  │ 🟡  │
│  T2: Valuation Mean-Rev  █████░░░░░░    35%  │   55%  │   43%  │ 🟢  │
│  T3: Competitive Disrupt ███░░░░░░░░    20%  │   60%  │   36%  │ 🔴  │
│  T4: AI Amplifies Moat   ████████░░░    50%  │   15%  │   36%  │ 🔴  │
├────────────────────────────────────────────────────────────────────┤
│  ⚠️  DIVERGENCES DETECTED                                          │
│  • T3: Research significantly underestimates vs. market (40pt gap) │
│  • T4: Research contradicts market view (35pt gap)                 │
├────────────────────────────────────────────────────────────────────┤
│  MARKET-IMPLIED NARRATIVE                                          │
│  "AI has shifted from moat amplifier to competitive threat.        │
│   High-multiple PME vulnerable to AI-native imaging entrants."     │
├────────────────────────────────────────────────────────────────────┤
│  RECOMMENDED ACTIONS                                               │
│  [Review Competitive Landscape] [Update T4 Evidence] [Deep Dive]   │
└────────────────────────────────────────────────────────────────────┘
```

---

## Integration with Existing Event System

The Narrative Framework v2 integrates with the existing event-reactive system:

```javascript
// When event-scraper detects ASX announcement
onNewAnnouncement(event) {
  // 1. Classify event by hypothesis relevance
  const affectedHypotheses = classifyEvent(event);
  
  // 2. Check for price response
  const priceResponse = getPriceResponse(event.ticker, event.time);
  
  // 3. Update narrative inference
  updateNarrativeInference(event.ticker, affectedHypotheses, priceResponse);
  
  // 4. Regenerate commentary if significant
  if (priceResponse.significance > MODERATE) {
    regenerateCommentary(event.ticker);
  }
}

// When price dislocation detected (regardless of news)
onPriceDislocation(ticker, dislocation) {
  // 1. Check for news catalyst
  const newsContext = searchNews(ticker, dislocation.timeWindow);
  
  // 2. Infer narrative from price alone
  const inference = inferNarrativeFromPrice(dislocation, newsContext);
  
  // 3. Update hypothesis weights
  updateDynamicWeights(ticker, inference);
  
  // 4. Generate alert
  createNarrativeAlert(ticker, dislocation, inference);
}
```

---

## Success Metrics

The framework is successful when:

1. **Hypothesis weights respond to price dislocations within 24 hours**
2. **Commentary reflects market-implied narrative shifts**
3. **Research vs. market divergence is surfaced prominently**
4. **False positives (price noise) don't trigger narrative changes**
5. **Framework credibility increases** — users see it as "reading the market" not just "stating the obvious"

---

## Next Steps

1. ✅ **Design complete** — Architecture documented
2. 🔄 **Implement Layer 1** — Price dislocation detection
3. ⏳ **Implement Layer 2** — Dynamic weight calculation
4. ⏳ **Implement Layer 3** — Commentary generation
5. ⏳ **Test with PME case study**
6. ⏳ **Deploy to all 12 stocks**

---

**Document Version:** 1.0  
**Author:** Kimi (in collaboration with user feedback)  
**Date:** February 14, 2026  
**Status:** Design Complete — Ready for Implementation
