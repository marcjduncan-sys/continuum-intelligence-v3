'use client'

import type { DerivedMetrics, StockModel, SkewLabel } from '../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function skewScoreColour(score: number): string {
  if (score >= 60) return 'text-emerald-400'
  if (score <= 40) return 'text-red-400'
  return 'text-amber-400'
}

function interpretationText(skewLabel: SkewLabel, downsidePct: number): string {
  switch (skewLabel) {
    case 'Constructive':
      return `Constructive balance. Downside mass at ${downsidePct}% is manageable but not negligible.`
    case 'Leaning Constructive':
      return `Favourable balance, but downside still material at ${downsidePct}%.`
    case 'Balanced':
      return `Balanced. Evidence does not favour either direction.`
    case 'Leaning Downside':
      return `Leaning downside. Bear theses carry ${downsidePct}% of evidence weight.`
    case 'Downside':
      return `Downside-heavy. Evidence favours bear theses. Constructive case requires new catalysts.`
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  metrics: DerivedMetrics
  model: StockModel
}

export function RiskBalance({ metrics, model }: Props) {
  const {
    constructiveMass,
    downsideMass,
    skew,
    skewScore,
    skewLabel,
  } = metrics

  const constructivePct = Math.round(constructiveMass * 100)
  const downsidePct = Math.round(downsideMass * 100)
  const skewPts = Math.round(skew * 100)
  const skewSign = skewPts >= 0 ? '+' : ''
  const scoreColour = skewScoreColour(skewScore)

  const constructiveLabel = model.constructiveCodes.join('+')
  const downsideLabel = model.downsideCodes.join('+')

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-200">Risk Balance</span>
        <div className="flex items-baseline gap-0.5">
          <span className={`text-2xl font-bold tabular-nums ${scoreColour}`}>
            {skewScore}
          </span>
          <span className="text-xs text-slate-500">/100</span>
        </div>
      </div>

      {/* Constructive bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-400">{constructiveLabel}</span>
          <span className="text-[11px] font-semibold text-emerald-400">{constructivePct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            style={{ width: `${constructivePct}%` }}
          />
        </div>
      </div>

      {/* Downside bar */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] text-slate-400">{downsideLabel}</span>
          <span className="text-[11px] font-semibold text-red-400">{downsidePct}%</span>
        </div>
        <div className="h-2 bg-slate-700 rounded-full overflow-hidden relative">
          <div
            className="h-full bg-red-500 rounded-full transition-all duration-300"
            style={{ width: `${downsidePct}%` }}
          />
        </div>
      </div>

      {/* Skew display */}
      <div className="flex items-center justify-between mb-3">
        <span className={`text-lg font-bold tabular-nums ${scoreColour}`}>
          {skewSign}{skewPts} pts
        </span>
        <span className="text-sm font-medium text-slate-400">{skewLabel}</span>
      </div>

      {/* Interpretation box */}
      <div className="bg-slate-800/50 rounded-lg px-3 py-2.5">
        <p className="text-xs text-slate-400 leading-relaxed">
          {interpretationText(skewLabel, downsidePct)}
        </p>
      </div>
    </div>
  )
}
