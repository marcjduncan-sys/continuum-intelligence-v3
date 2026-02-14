/**
 * Price-Narrative Inference Engine v1.0
 * 
 * Detects price dislocations and dynamically adjusts hypothesis weights
 * based on market-implied narrative shifts.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const PNE_CONFIG = {
  // Price dislocation thresholds
  Z_SCORE_CRITICAL: 3.0,
  Z_SCORE_HIGH: 2.0,
  Z_SCORE_MODERATE: 1.5,
  
  DRAWDOWN_CRITICAL: 0.30,
  DRAWDOWN_HIGH: 0.20,
  DRAWDOWN_MODERATE: 0.10,
  
  VOLUME_CRITICAL: 3.0,
  VOLUME_HIGH: 2.0,
  VOLUME_MODERATE: 1.5,
  
  // Weight blending
  LT_WEIGHT_INFLUENCE: 0.60,  // Long-term (research-based)
  ST_WEIGHT_INFLUENCE: 0.40,  // Short-term (market-implied)
  
  // Hypothesis sensitivity to price moves
  HYPOTHESIS_SENSITIVITY: {
    T1: { up: 0.8, down: 1.2 },  // Growth — sensitive to downside
    T2: { up: 0.6, down: 0.9 },  // Valuation — less sensitive
    T3: { up: 1.0, down: 1.5 },  // Competition — very sensitive to downside
    T4: { up: 1.2, down: 1.8 }   // Moat — extremely sensitive to downside
  }
};

// ============================================================================
// LAYER 1: PRICE DISLOCATION DETECTION
// ============================================================================

const PriceDislocationDetector = {
  /**
   * Calculate Z-score for today's return
   */
  calculateZScore(todayReturn, historicalReturns) {
    const avg = historicalReturns.reduce((a, b) => a + b, 0) / historicalReturns.length;
    const variance = historicalReturns.reduce((sum, r) => sum + Math.pow(r - avg, 2), 0) / historicalReturns.length;
    const stdDev = Math.sqrt(variance);
    return (todayReturn - avg) / stdDev;
  },

  /**
   * Calculate position within 52-week range
   */
  getRangePosition(current, low52, high52) {
    return (current - low52) / (high52 - low52);
  },

  /**
   * Detect price dislocation severity
   */
  detectDislocation(ticker, priceData) {
    const {
      currentPrice,
      previousPrice,
      priceAtReview,
      peakPrice,
      low52Week,
      high52Week,
      todayVolume,
      avgVolume20d,
      historicalReturns,
      consecutiveDownDays
    } = priceData;

    const todayReturn = (currentPrice - previousPrice) / previousPrice;
    const zScore = this.calculateZScore(todayReturn, historicalReturns);
    const drawdownFromPeak = (peakPrice - currentPrice) / peakPrice;
    const drawdownFromReview = (priceAtReview - currentPrice) / priceAtReview;
    const volumeRatio = todayVolume / avgVolume20d;
    const rangePosition = this.getRangePosition(currentPrice, low52Week, high52Week);

    // Determine severity
    let severity = 'NORMAL';
    if (Math.abs(zScore) >= PNE_CONFIG.Z_SCORE_CRITICAL || 
        drawdownFromPeak >= PNE_CONFIG.DRAWDOWN_CRITICAL ||
        volumeRatio >= PNE_CONFIG.VOLUME_CRITICAL) {
      severity = 'CRITICAL';
    } else if (Math.abs(zScore) >= PNE_CONFIG.Z_SCORE_HIGH || 
               drawdownFromPeak >= PNE_CONFIG.DRAWDOWN_HIGH ||
               volumeRatio >= PNE_CONFIG.VOLUME_HIGH) {
      severity = 'HIGH';
    } else if (Math.abs(zScore) >= PNE_CONFIG.Z_SCORE_MODERATE || 
               drawdownFromPeak >= PNE_CONFIG.DRAWDOWN_MODERATE ||
               volumeRatio >= PNE_CONFIG.VOLUME_MODERATE) {
      severity = 'MODERATE';
    }

    // Detect pattern
    const pattern = this.detectPattern(todayReturn, volumeRatio, consecutiveDownDays, rangePosition);

    return {
      ticker,
      timestamp: new Date().toISOString(),
      severity,
      metrics: {
        zScore: Math.round(zScore * 100) / 100,
        todayReturn: Math.round(todayReturn * 10000) / 100,
        drawdownFromPeak: Math.round(drawdownFromPeak * 10000) / 100,
        drawdownFromReview: Math.round(drawdownFromReview * 10000) / 100,
        volumeRatio: Math.round(volumeRatio * 100) / 100,
        rangePosition: Math.round(rangePosition * 100) / 100,
        consecutiveDownDays
      },
      pattern,
      requiresAction: severity !== 'NORMAL'
    };
  },

  /**
   * Detect price pattern type
   */
  detectPattern(todayReturn, volumeRatio, consecutiveDownDays, rangePosition) {
    if (todayReturn < -0.05 && volumeRatio > 2) {
      return 'GAP_DOWN';  // Large drop on high volume
    }
    if (consecutiveDownDays >= 5 && rangePosition < 0.3) {
      return 'DISTRIBUTION';  // Sustained selling into weakness
    }
    if (todayReturn < -0.08 && volumeRatio > 3) {
      return 'CAPITULATION';  // Panic selling
    }
    if (consecutiveDownDays >= 3) {
      return 'STEADY_DECLINE';  // Persistent weakness
    }
    if (Math.abs(todayReturn) < 0.02 && volumeRatio > 1.5) {
      return 'VOLUME_NOISE';  // High volume, small move
    }
    return 'NORMAL';
  }
};

// ============================================================================
// LAYER 2: NARRATIVE INFERENCE
// ============================================================================

const NarrativeInferenceEngine = {
  /**
   * Price-to-Narrative inference matrix
   * Maps price patterns to likely active hypotheses
   */
  INFERENCE_MATRIX: {
    GAP_DOWN: {
      highVolume: { primary: 'T3', secondary: 'T2', confidence: 0.80 },
      lowVolume: { primary: 'T2', secondary: null, confidence: 0.60 }
    },
    DISTRIBUTION: {
      newLows: { primary: 'T4', secondary: 'T3', confidence: 0.70 },
      holdingSupport: { primary: 'T2', secondary: null, confidence: 0.65 }
    },
    CAPITULATION: {
      any: { primary: 'T3', secondary: 'T4', confidence: 0.75, note: 'multi-hypothesis reset' }
    },
    STEADY_DECLINE: {
      any: { primary: 'T2', secondary: 'T3', confidence: 0.60 }
    }
  },

  /**
   * Infer which hypothesis is driving price based on stock characteristics
   */
  inferNarrative(ticker, dislocation, stockCharacteristics, newsContext = []) {
    const { pattern, metrics } = dislocation;
    const { highMultiple, growthStock, hasAIExposure } = stockCharacteristics;

    // Base inference from pattern
    let inference = this.getBaseInference(pattern, metrics.volumeRatio);

    // Adjust for stock characteristics
    if (highMultiple && metrics.drawdownFromPeak > 0.20) {
      // High multiple stocks experiencing drawdown = valuation narrative
      inference.secondary = inference.primary;
      inference.primary = 'T2';
    }

    if (hasAIExposure && metrics.todayReturn < -0.05) {
      // AI stock dropping = either T3 (AI competition) or T4 reversal (AI moat questioned)
      if (inference.primary === 'T4') {
        // Market reversing view on AI as moat
        inference.contradicted = 'T4';
        inference.primary = 'T3';
      }
    }

    if (growthStock && metrics.consecutiveDownDays > 5) {
      // Sustained decline in growth stock = growth/margin fears
      inference.primary = 'T1';  // T1 is often growth-oriented
      inference.tone = 'negative';
    }

    // Incorporate news context if available
    if (newsContext.length > 0) {
      inference = this.adjustForNews(inference, newsContext);
    }

    return {
      ticker,
      timestamp: new Date().toISOString(),
      primaryHypothesis: inference.primary,
      secondaryHypothesis: inference.secondary || null,
      contradictedHypothesis: inference.contradicted || null,
      confidence: inference.confidence,
      reasoning: this.generateReasoning(inference, dislocation, stockCharacteristics),
      priceDirection: metrics.todayReturn < 0 ? 'DOWN' : 'UP',
      magnitude: dislocation.severity
    };
  },

  /**
   * Get base inference from pattern
   */
  getBaseInference(pattern, volumeRatio) {
    const matrix = this.INFERENCE_MATRIX[pattern] || this.INFERENCE_MATRIX.STEADY_DECLINE;
    const volumeType = volumeRatio > 2 ? 'highVolume' : 'lowVolume';
    return matrix[volumeType] || matrix.any || matrix.newLows || matrix.holdingSupport;
  },

  /**
   * Adjust inference based on news context
   */
  adjustForNews(inference, newsContext) {
    // Look for keywords in news
    const newsText = newsContext.map(n => n.title + ' ' + n.summary).join(' ').toLowerCase();
    
    if (newsText.includes('earnings') || newsText.includes('guidance') || newsText.includes('revenue')) {
      inference.primary = 'T1';  // Growth/margin related
    }
    if (newsText.includes('competitor') || newsText.includes('competition') || newsText.includes('market share')) {
      inference.primary = 'T3';
    }
    if (newsText.includes('valuation') || newsText.includes('multiple') || newsText.includes('expensive')) {
      inference.primary = 'T2';
    }
    if (newsText.includes('ai') || newsText.includes('artificial intelligence') || newsText.includes('technology')) {
      if (newsText.includes('threat') || newsText.includes('competition') || newsText.includes('disruption')) {
        inference.primary = 'T3';
        inference.contradicted = 'T4';
      }
    }

    return inference;
  },

  /**
   * Generate human-readable reasoning
   */
  generateReasoning(inference, dislocation, characteristics) {
    const reasons = [];
    
    if (dislocation.pattern === 'GAP_DOWN') {
      reasons.push(`Large gap down (${dislocation.metrics.todayReturn}%) on high volume suggests shock event`);
    }
    if (dislocation.metrics.drawdownFromPeak > 0.30) {
      reasons.push(`Severe drawdown (${dislocation.metrics.drawdownFromPeak}%) from peak indicates narrative regime change`);
    }
    if (characteristics.highMultiple && dislocation.metrics.todayReturn < 0) {
      reasons.push(`High multiple stock declining = valuation compression narrative`);
    }
    if (inference.contradicted) {
      reasons.push(`Previous bull thesis (${inference.contradicted}) being contradicted by price action`);
    }

    return reasons.join('. ');
  }
};

// ============================================================================
// LAYER 3: DYNAMIC HYPOTHESIS WEIGHTING
// ============================================================================

const DynamicWeightCalculator = {
  /**
   * Calculate new hypothesis weights based on market inference
   */
  calculateWeights(baseWeights, inference, dislocation) {
    const newWeights = {};
    const sensitivity = PNE_CONFIG.HYPOTHESIS_SENSITIVITY;

    for (const [tier, weight] of Object.entries(baseWeights)) {
      const ltWeight = typeof weight === 'object' ? weight.longTerm : weight;
      let stWeight = typeof weight === 'object' ? weight.shortTerm : weight;

      // Adjust short-term weight based on price confirmation
      const adjustment = this.calculateAdjustment(
        tier, 
        inference, 
        dislocation, 
        sensitivity[tier]
      );

      stWeight = Math.max(5, Math.min(95, stWeight + adjustment));

      // Blend long-term and short-term
      const blended = Math.round(
        (ltWeight * PNE_CONFIG.LT_WEIGHT_INFLUENCE) + 
        (stWeight * PNE_CONFIG.ST_WEIGHT_INFLUENCE)
      );

      // Calculate confidence based on divergence
      const confidence = this.calculateConfidence(ltWeight, stWeight, dislocation.severity);

      newWeights[tier] = {
        longTerm: ltWeight,
        shortTerm: stWeight,
        blended,
        adjustment: Math.round(adjustment),
        confidence
      };
    }

    return newWeights;
  },

  /**
   * Calculate weight adjustment for a hypothesis
   */
  calculateAdjustment(tier, inference, dislocation, sensitivity) {
    let adjustment = 0;
    const isDownMove = dislocation.metrics.todayReturn < 0;
    const magnitude = Math.abs(dislocation.metrics.todayReturn);
    const severityMultiplier = {
      'CRITICAL': 2.0,
      'HIGH': 1.5,
      'MODERATE': 1.0,
      'NORMAL': 0.5
    }[dislocation.severity];

    // Primary hypothesis gets boosted
    if (tier === inference.primaryHypothesis) {
      const sens = isDownMove ? sensitivity.down : sensitivity.up;
      adjustment += magnitude * 100 * sens * severityMultiplier;
    }

    // Secondary hypothesis gets smaller boost
    if (tier === inference.secondaryHypothesis) {
      adjustment += magnitude * 100 * 0.5 * severityMultiplier;
    }

    // Contradicted hypothesis gets reduced
    if (tier === inference.contradictedHypothesis) {
      const sens = isDownMove ? sensitivity.down : sensitivity.up;
      adjustment -= magnitude * 150 * sens * severityMultiplier;
    }

    // Other hypotheses adjust slightly based on market regime
    if (tier !== inference.primaryHypothesis && 
        tier !== inference.secondaryHypothesis &&
        tier !== inference.contradictedHypothesis) {
      // Slight reduction to make room for active narratives
      adjustment -= magnitude * 10;
    }

    return adjustment;
  },

  /**
   * Calculate confidence level
   */
  calculateConfidence(ltWeight, stWeight, severity) {
    const divergence = Math.abs(ltWeight - stWeight);
    
    if (divergence > 40) return 'LOW';
    if (divergence > 25) return 'MEDIUM';
    if (severity === 'CRITICAL') return 'MEDIUM';  // High uncertainty in crisis
    return 'HIGH';
  }
};

// ============================================================================
// COMMENTARY GENERATOR — Institutional Grade
// ============================================================================

const CommentaryGenerator = {
  /**
   * Generate institutional-grade commentary using TextGenerator
   * Falls back to basic if InstitutionalCommentaryEngine not available
   */
  generateCommentary(ticker, stockData, dynamicWeights, dislocation, inference) {
    // Use institutional engine if available
    if (typeof InstitutionalCommentaryEngine !== 'undefined') {
      const priceData = this.extractPriceData(stockData, dislocation);
      return InstitutionalCommentaryEngine.generateReport(
        ticker, stockData, priceData, dynamicWeights, dislocation, inference
      );
    }
    
    // Fallback to basic generator
    return this.generateBasicCommentary(ticker, stockData, dynamicWeights, dislocation, inference);
  },

  /**
   * Extract price data for institutional engine
   */
  extractPriceData(stockData, dislocation) {
    return {
      currentPrice: stockData.price || dislocation.metrics?.currentPrice || 0,
      previousPrice: stockData._previousPrice || stockData.price || 0,
      priceAtReview: stockData._priceAtReview || stockData.price || 0,
      peakPrice: stockData._peakPrice || Math.max(...(stockData.priceHistory || [stockData.price || 0])),
      low52Week: stockData._low52Week || Math.min(...(stockData.priceHistory || [stockData.price || 0])),
      high52Week: stockData._high52Week || Math.max(...(stockData.priceHistory || [stockData.price || 0])),
      todayVolume: dislocation.metrics?.todayVolume || 0,
      avgVolume20d: dislocation.metrics?.avgVolume20d || 1
    };
  },

  /**
   * Generate basic commentary (fallback)
   */
  generateBasicCommentary(ticker, stockData, dynamicWeights, dislocation, inference) {
    const sections = {
      alert: this.generateAlert(dislocation),
      marketNarrative: this.generateMarketNarrative(inference),
      divergence: this.generateDivergenceAnalysis(dynamicWeights),
      implication: this.generateImplication(dynamicWeights, dislocation),
      recommendation: this.generateRecommendation(dislocation, inference)
    };

    return {
      summary: Object.values(sections).filter(Boolean).join('\n\n'),
      sections,
      urgency: this.calculateUrgency(dislocation, inference),
      lastUpdated: new Date().toISOString()
    };
  },

  generateAlert(dislocation) {
    if (dislocation.severity === 'NORMAL') return '';
    return `**${dislocation.severity} PRICE DISLOCATION** — Z: ${dislocation.metrics.zScore}, Vol: ${dislocation.metrics.volumeRatio}x`;
  },

  generateMarketNarrative(inference) {
    return `Market-implied: ${inference.primaryHypothesis} (confidence: ${(inference.confidence * 100).toFixed(0)}%)`;
  },

  generateDivergenceAnalysis(weights) {
    const divergences = Object.entries(weights)
      .filter(([, w]) => Math.abs(w.longTerm - w.shortTerm) > 20)
      .map(([tier, w]) => `${tier}: ${Math.abs(w.longTerm - w.shortTerm)}pt gap`);
    return divergences.length ? `Divergences: ${divergences.join(', ')}` : 'Views aligned';
  },

  generateImplication(weights, dislocation) {
    const maxGap = Math.max(...Object.values(weights).map(w => Math.abs(w.longTerm - w.shortTerm)));
    return maxGap > 30 ? `Material divergence (${maxGap}pts) warrants review` : 'No urgent action required';
  },

  generateRecommendation(dislocation, inference) {
    if (dislocation.severity === 'CRITICAL') return 'Action: Deep-dive review within 48 hours';
    if (dislocation.severity === 'HIGH') return 'Action: Accelerate review cycle';
    return 'Action: Continue monitoring';
  },

  calculateUrgency(dislocation, inference) {
    if (dislocation.severity === 'CRITICAL') return 'IMMEDIATE';
    if (dislocation.severity === 'HIGH') return 'HIGH';
    return 'LOW';
  }
};

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================

const PriceNarrativeEngine = {
  /**
   * Main entry point: Analyze a stock for price-narrative dislocation
   */
  analyze(ticker, stockData, priceData, newsContext = []) {
    console.log(`[PNE] Analyzing ${ticker}...`);

    // Step 1: Detect price dislocation
    const dislocation = PriceDislocationDetector.detectDislocation(ticker, priceData);
    console.log(`[PNE] Dislocation severity: ${dislocation.severity}`);

    // Step 2: Infer narrative from price
    const inference = NarrativeInferenceEngine.inferNarrative(
      ticker,
      dislocation,
      stockData.characteristics,
      newsContext
    );
    console.log(`[PNE] Primary narrative: ${inference.primaryHypothesis}`);

    // Step 3: Calculate dynamic weights
    const baseWeights = this.extractBaseWeights(stockData);
    const dynamicWeights = DynamicWeightCalculator.calculateWeights(
      baseWeights,
      inference,
      dislocation
    );
    console.log(`[PNE] Weights calculated`);

    // Step 4: Generate commentary
    const commentary = CommentaryGenerator.generateCommentary(
      ticker,
      stockData,
      dynamicWeights,
      dislocation,
      inference
    );

    // Step 5: Determine if update needed
    const shouldUpdate = dislocation.severity !== 'NORMAL' || 
                        commentary.urgency !== 'LOW';

    return {
      ticker,
      timestamp: new Date().toISOString(),
      dislocation,
      inference,
      weights: dynamicWeights,
      commentary,
      shouldUpdate,
      metadata: {
        engineVersion: '1.0',
        config: PNE_CONFIG
      }
    };
  },

  /**
   * Extract base hypothesis weights from stock data
   */
  extractBaseWeights(stockData) {
    const weights = {};
    if (stockData.hypotheses) {
      stockData.hypotheses.forEach(h => {
        const scoreStr = h.score || '0%';
        weights[h.tier.toUpperCase()] = parseInt(scoreStr);
      });
    }
    return weights;
  },

  /**
   * Apply analysis results to update stock data
   */
  applyAnalysis(stockData, analysis) {
    // Update hypothesis weights
    if (stockData.hypotheses) {
      stockData.hypotheses = stockData.hypotheses.map(h => {
        const tier = h.tier.toUpperCase();
        const dynamic = analysis.weights[tier];
        if (dynamic) {
          return {
            ...h,
            score: `${dynamic.blended}%`,
            scoreWidth: `${dynamic.blended}%`,
            scoreMeta: `${dynamic.confidence === 'LOW' ? '⚠️' : ''} ${h.scoreMeta || ''}`,
            _dynamicWeights: dynamic  // Store for display
          };
        }
        return h;
      });
    }

    // Update narrative
    if (stockData.narrative) {
      stockData.narrative.marketResponsiveCommentary = analysis.commentary.summary;
      stockData.narrative.lastDislocation = analysis.dislocation;
      stockData.narrative.urgency = analysis.commentary.urgency;
    }

    return stockData;
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PriceNarrativeEngine,
    PriceDislocationDetector,
    NarrativeInferenceEngine,
    DynamicWeightCalculator,
    CommentaryGenerator,
    PNE_CONFIG
  };
}

// Browser global
if (typeof window !== 'undefined') {
  window.PriceNarrativeEngine = PriceNarrativeEngine;
}
