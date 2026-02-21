'use client'

import type { DerivedMetrics, StockModel, Hypothesis, Stance, Arrow, MomentumLabel, TensionColour } from '../types'

// ── Colour maps (full class strings required for Tailwind JIT) ─────────────────

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

const STANCE_BAR: Record<Stance, string> = {
  BULLISH: 'bg-emerald-500',
  BEARISH: 'bg-red-500',
  NEUTRAL: 'bg-amber-500',
}

const STATUS_TEXT: Record<MomentumLabel, string> = {
  Building:      'text-emerald-400',
  Strengthening: 'text-blue-400',
  Fading:        'text-red-400',
  Priced:        'text-amber-400',
  Watching:      'text-red-400',
  Stable:        'text-slate-400',
}

const ARROW_CHAR: Record<Arrow, string> = {
  UP:   '↑',
  FLAT: '→',
  DOWN: '↓',
}

const TENSION_BG: Record<TensionColour, string> = {
  amber: 'bg-amber-500/12 border-l-4 border-amber-500',
  red:   'bg-red-500/12 border-l-4 border-red-500',
  green: 'bg-emerald-500/12 border-l-4 border-emerald-500',
}

const TENSION_LABEL_TEXT: Record<TensionColour, string> = {
  amber: 'text-amber-400',
  red:   'text-red-400',
  green: 'text-emerald-400',
}

const TENSION_LABEL_BG: Record<TensionColour, string> = {
  amber: 'bg-amber-500/20 text-amber-400',
  red:   'bg-red-500/20 text-red-400',
  green: 'bg-emerald-500/20 text-emerald-400',
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  metrics: DerivedMetrics
  model: StockModel
  onSelectHypothesis: (h: Hypothesis) => void
}

export function PosteriorVector({ metrics, model: _model, onSelectHypothesis }: Props) {
  const { sorted, tension, statuses } = metrics
  const topP = sorted[0]?.p ?? 1

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-slate-200">Hypothesis Posterior</span>
        <span className="text-[10px] font-bold tracking-widest bg-slate-700 text-slate-400 px-2 py-0.5 rounded">
          CANONICAL
        </span>
      </div>

      {/* Narrative Tension Banner */}
      {tension !== null && (
        <div className={`${TENSION_BG[tension.colour]} rounded px-3 py-2.5 mb-4 flex items-center justify-between gap-3`}>
          <span className={`text-[10px] font-bold tracking-widest px-2 py-0.5 rounded ${TENSION_LABEL_BG[tension.colour]}`}>
            {tension.label}
          </span>
          <span className={`text-xs ${TENSION_LABEL_TEXT[tension.colour]} opacity-80 text-right`}>
            {tension.message}
          </span>
        </div>
      )}

      {/* Hypothesis rows */}
      <div className="flex flex-col gap-2">
        {sorted.map(h => {
          const status = statuses[h.code]
          const arrowChar = status ? ARROW_CHAR[status.arrow] : '→'
          const statusLabel = status?.label ?? 'Stable'
          const barWidth = topP > 0 ? (h.p / topP) * 100 : 0

          return (
            <button
              key={h.code}
              onClick={() => onSelectHypothesis(h)}
              className="w-full text-left rounded-lg px-3 py-2.5 bg-slate-800/50 hover:bg-slate-800 transition-colors"
            >
              {/* Row header */}
              <div className="flex items-start justify-between gap-2 mb-1.5">
                {/* Left: stance badge, name, short */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${STANCE_BG[h.stance]} ${STANCE_TEXT[h.stance]}`}>
                      {h.code}
                    </span>
                    <span className="text-sm font-semibold text-slate-200 truncate">{h.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">{h.short}</p>
                </div>

                {/* Right: status label + arrow, then weight */}
                <div className="flex flex-col items-end shrink-0 ml-2">
                  <span className={`text-[10px] font-medium ${STATUS_TEXT[statusLabel as MomentumLabel] ?? 'text-slate-400'}`}>
                    {statusLabel} {arrowChar}
                  </span>
                  <span className="text-[22px] font-bold tabular-nums text-slate-100 leading-tight">
                    {Math.round(h.p * 100)}%
                  </span>
                </div>
              </div>

              {/* Proportional bar */}
              <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden mt-1">
                <div
                  className={`h-full ${STANCE_BAR[h.stance]} rounded-full transition-all duration-300`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* Footer */}
      <p className="text-[11px] text-slate-600 mt-3">
        Click any hypothesis to open the evidence audit trail
      </p>
    </div>
  )
}
