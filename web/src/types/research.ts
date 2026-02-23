export interface StockPrice {
  ticker: string
  price: number
  change: number
  change_pct: number
  volume?: number
  timestamp?: string
}

export interface LivePrices {
  [ticker: string]: StockPrice
}

export interface HypothesisScore {
  label: string
  survival_score: number
  status: 'VERY_LOW' | 'LOW' | 'MODERATE' | 'HIGH'
  weighted_inconsistency: number
  // Extended fields present in research JSON (absent on older/auto-generated stocks)
  description?: string
  plain_english?: string
  what_to_watch?: string
  upside?: string | null
  risk_plain?: string
}

export interface ThreeLayerSignal {
  date: string
  macro_signal: number
  sector_signal: number
  idio_signal: number
  overall_sentiment: number
  sentiment_label: 'STRONG_DOWNSIDE' | 'DOWNSIDE' | 'NEUTRAL' | 'UPSIDE' | 'STRONG_UPSIDE'
  // RBA context fields (populated by calc-macro-signal + calc-composite-sentiment)
  rba_rate?: number | null
  rba_trajectory_label?: string | null
  rba_stale?: boolean
}

export interface StockData {
  ticker: string
  tickerFull?: string
  company: string
  sector: string
  current_price: number
  price?: number
  currency: string
  dominant: string
  confidence: string
  alert_state: 'NORMAL' | 'ALERT' | 'FLIP'
  date: string
  reportId: string
  hypotheses: {
    [key: string]: HypothesisScore
  }
  three_layer_signal: ThreeLayerSignal
  narrative_weights: {
    macro: number
    sector: number
    tech: number
    company: number
  }
  identity: {
    overview: string
    rows: [string, any, string?][][]
  }
  narrative: {
    theNarrative: string
    priceImplication: {
      label: string
      content: string
    }
    evidenceCheck: string
    narrativeStability: string
  }
  evidence: {
    intro: string
    cards: Array<{
      title: string
      epistemicLabel: string
      epistemicClass: string
      finding: string
      tension?: string
      source: string
      tags: Array<{
        text: string
        class: string
      }>
      table?: {
        headers: string[]
        rows: string[][]
      }
    }>
    alignmentSummary?: any
  }
  discriminators: {
    intro: string
    rows: Array<{
      diagnosticity: string
      diagnosticityClass: string
      evidence: string
      discriminatesBetween: string
      currentReading: string
      readingClass: string
    }>
    nonDiscriminating: string
  }
  tripwires: {
    intro: string
    cards: Array<{
      date: string
      name: string
      source: string
      conditions: Array<{
        if: string
        then: string
        valence: string
      }>
    }>
  }
  gaps: {
    coverageRows: Array<{
      domain: string
      coverageLevel: string
      coverageLabel: string
      freshness: string
      confidence: string
      confidenceClass?: string
    }>
    couldntAssess: string[]
    analyticalLimitations: string
  }
  technicalAnalysis?: {
    date: string
    period: string
    source: string
    regime: string
    clarity: string
    price: {
      current: number
      currency: string
    }
    trend: {
      direction: string
      duration: string
      structure: string
    }
    keyLevels: {
      support: { price: number; method: string }
      resistance: { price: number; method: string }
      fiftyTwoWeekHigh: { price: number; date: string }
      fiftyTwoWeekLow: { price: number; date: string }
    }
    movingAverages: {
      ma50: { value: number; date: string }
      ma200: { value: number; date: string }
      priceVsMa50: number
      priceVsMa200: number
      crossover?: {
        type: string
        date: string
        description: string
      }
    }
    volatility: {
      latestRangePercent: number
      avgDailyRangePercent30: number
      avgDailyRangePercent90: number
      latestDailyRange: { high: number; low: number }
    }
    volume: {
      latestVs20DayAvg: number
      latestDate: string
      priorSpikes?: Array<{
        period: string
        ratio: number
        context: string
      }>
    }
    meanReversion: {
      rangeLow: number
      rangeHigh: number
      rangePosition: number
      vsMa50: number
      vsMa200: number
    }
    relativePerformance?: {
      vsIndex: { name: string; period: string; stockReturn: number; indexReturn: number; relativeReturn: number }
      vsSector: { name: string; stockReturn: number; sectorReturn: number; relativeReturn: number }
    }
    inflectionPoints?: Array<{
      date: string
      price: number
      event: string
    }>
  }
  priceHistory: number[]
  footer: {
    domainCount: string
    hypothesesCount: string
    disclaimer: string
  }
}
