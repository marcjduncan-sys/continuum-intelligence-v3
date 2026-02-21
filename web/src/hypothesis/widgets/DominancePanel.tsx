'use client'

import type { DerivedMetrics, DominanceLabel } from '../types'

// ── Colour maps ───────────────────────────────────────────────────────────────

const BADGE_STYLE: Record<DominanceLabel, string> = {
  Dominant: 'bg-emerald-500/20 text-emerald-400',
  Contested: 'bg-amber-500/20 text-amber-400',
  Diffuse:   'bg-red-500/20 text-red-400',
  Leading:   'bg-blue-500/20 text-blue-400',
}

// ── Helper ────────────────────────────────────────────────────────────────────

function interpretationText(
  label: DominanceLabel,
  code: string,
  gap: number,
): string {
  switch (label) {
    case 'Dominant':
      return `${code} commands the narrative with ${gap} points of daylight. Evidence strongly concentrated.`
    case 'Contested':
      return `Narrative is contested. ${code} leads by only ${gap} points – insufficient for high-conviction positioning.`
    case 'Diffuse':
      return `Evidence has not separated the hypotheses. Near-uniform distribution. Await catalyst before positioning.`
    case 'Leading':
      return `${code} leads but has not broken away. ${gap} point gap warrants moderate conviction only.`
  }
}

// ── Sub-component ─────────────────────────────────────────────────────────────

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-200">{value}</p>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  metrics: DerivedMetrics
}

export function DominancePanel({ metrics }: Props) {
  const {
    sorted,
    gap,
    ratio,
    hhi,
    dominance,
    conviction,
    convictionLabel,
  } = metrics

  const lead = sorted[0]
  const challenger = sorted[1]
  const gapPts = Math.round(gap * 100)

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-200">Dominance</span>
        <span className={`text-xs font-bold px-2 py-0.5 rounded ${BADGE_STYLE[dominance]}`}>
          {dominance}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-4">
        <MetricRow
          label="Lead"
          value={`${lead.code} · ${lead.name}`}
        />
        <MetricRow
          label="Challenger"
          value={`${challenger.code} · ${challenger.name}`}
        />
        <MetricRow
          label="Top gap"
          value={`${gapPts} pts`}
        />
        <MetricRow
          label="Ratio"
          value={`${ratio.toFixed(2)}×`}
        />
        <MetricRow
          label="HHI"
          value={hhi.toFixed(3)}
        />
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Conviction</p>
          <p className="text-sm font-semibold text-slate-200">
            {conviction.toFixed(2)}{' '}
            <span className="text-xs font-normal text-slate-400">({convictionLabel})</span>
          </p>
        </div>
      </div>

      {/* Interpretation box */}
      <div className="bg-slate-800/50 rounded-lg px-3 py-2.5">
        <p className="text-xs text-slate-400 leading-relaxed">
          {interpretationText(dominance, lead.code, gapPts)}
        </p>
      </div>
    </div>
  )
}
