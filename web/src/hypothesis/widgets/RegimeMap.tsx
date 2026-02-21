'use client'

import type { DerivedMetrics, StockModel, Stance, Tripwire } from '../types'

// ── Colour maps ───────────────────────────────────────────────────────────────

const STANCE_BG: Record<Stance, string> = {
  BULLISH: 'bg-emerald-500/20',
  BEARISH: 'bg-red-500/20',
  NEUTRAL: 'bg-amber-500/20',
}

const STANCE_TEXT: Record<Stance, string> = {
  BULLISH: 'text-emerald-400',
  BEARISH: 'text-red-400',
  NEUTRAL: 'text-amber-400',
}

function contestabilityStyle(transitionProximity: number): {
  bg: string
  text: string
} {
  if (transitionProximity < 0.3)  return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' }
  if (transitionProximity < 0.6)  return { bg: 'bg-amber-500/20',   text: 'text-amber-400'   }
  return { bg: 'bg-red-500/20', text: 'text-red-400' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function RegimeCell({
  label,
  value,
  subValue,
  bg,
  text,
}: {
  label: string
  value: string
  subValue: string
  bg: string
  text: string
}) {
  return (
    <div className={`${bg} rounded-lg p-2.5`}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-sm font-semibold ${text}`}>{value}</p>
      <p className="text-[10px] text-slate-500 mt-0.5">{subValue}</p>
    </div>
  )
}

function TripwireCard({ tw }: { tw: Tripwire }) {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/50">
      {/* Header row */}
      <div className="flex items-start gap-2 mb-3">
        <span className="text-[10px] font-bold bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded shrink-0">
          {tw.timeframe}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-200">{tw.title}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{tw.cadence}</p>
        </div>
      </div>

      {/* Two-column body */}
      <div className="grid grid-cols-2 gap-2 divide-x divide-slate-700/50">
        {/* Constructive side */}
        <div className="pr-2">
          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider mb-1">
            IF CONSTRUCTIVE
          </p>
          <p className="text-[10px] text-slate-300 leading-relaxed mb-1.5">{tw.condition_good}</p>
          <p className="text-[10px] text-emerald-400 leading-relaxed">
            &#8594; {tw.effect_good}
          </p>
        </div>

        {/* Adverse side */}
        <div className="pl-2">
          <p className="text-[9px] font-bold text-red-500 uppercase tracking-wider mb-1">
            IF ADVERSE
          </p>
          <p className="text-[10px] text-slate-300 leading-relaxed mb-1.5">{tw.condition_bad}</p>
          <p className="text-[10px] text-red-400 leading-relaxed">
            &#8594; {tw.effect_bad}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  metrics: DerivedMetrics
  model: StockModel
}

export function RegimeMap({ metrics, model }: Props) {
  const { sorted, gap, transitionProximity, proximityLabel } = metrics
  const lead = sorted[0]
  const challenger = sorted[1]
  const contest = contestabilityStyle(transitionProximity)
  const gapPts = Math.round(gap * 100)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-200">Regime Transition Map</span>
        <span className="text-xs text-slate-500">Pre-committed triggers</span>
      </div>

      {/* Regime bar */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <RegimeCell
          label="Current regime"
          value={lead.code}
          subValue={lead.name}
          bg={STANCE_BG[lead.stance]}
          text={STANCE_TEXT[lead.stance]}
        />
        <RegimeCell
          label="Challenger"
          value={challenger.code}
          subValue={challenger.name}
          bg={STANCE_BG[challenger.stance]}
          text={STANCE_TEXT[challenger.stance]}
        />
        <RegimeCell
          label="Contestability"
          value={proximityLabel}
          subValue={`${gapPts} pt gap`}
          bg={contest.bg}
          text={contest.text}
        />
      </div>

      {/* Tripwire cards */}
      <div className="flex flex-col gap-3">
        {model.tripwires.map(tw => (
          <TripwireCard key={tw.id} tw={tw} />
        ))}
      </div>
    </div>
  )
}
