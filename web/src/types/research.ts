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
}

export interface StockData {
  ticker: string
  company: string
  sector: string
  current_price: number
  dominant: string
  confidence: string
  alert_state: 'NORMAL' | 'ALERT' | 'FLIP'
  hypotheses: {
    T1: HypothesisScore
    T2: HypothesisScore
    T3: HypothesisScore
    T4: HypothesisScore
  }
  three_layer_signal: ThreeLayerSignal
  narrative_weights: {
    macro: number
    sector: number
    tech: number
    company: number
  }
}
