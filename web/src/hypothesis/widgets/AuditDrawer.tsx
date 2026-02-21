'use client'

import type {
  Hypothesis,
  DerivedMetrics,
  StockModel,
  EvidenceItem,
  EvidenceQuality,
  Arrow,
  MomentumLabel,
} from '../types'

// ── Colour helpers ─────────────────────────────────────────────────────────────

const QUALITY_STYLE: Record<EvidenceQuality, string> = {
  HIGH:   'bg-blue-500/20 text-blue-400',
  MEDIUM: 'bg-slate-700 text-slate-400',
  LOW:    'bg-slate-800 text-slate-500',
}

const ARROW_CHAR: Record<Arrow, string> = {
  UP:   '↑',
  FLAT: '→',
  DOWN: '↓',
}

// ── MetricBox ─────────────────────────────────────────────────────────────────

function MetricBox({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-800/50 rounded px-2 py-1.5 text-center">
      <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
      <p className={`text-xs font-semibold mt-0.5 ${accent ?? 'text-slate-200'}`}>{value}</p>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  hypothesis: Hypothesis | null
  metrics: DerivedMetrics
  model: StockModel
  onClose: () => void
}

export function AuditDrawer({ hypothesis, metrics, model, onClose }: Props) {
  if (!hypothesis) return null

  const code = hypothesis.code
  const status = metrics.statuses[code]
  const arrowChar = status ? ARROW_CHAR[status.arrow] : '→'
  const statusLabel: MomentumLabel = status?.label ?? 'Stable'

  // Partition evidence
  const diagnostic: EvidenceItem[] = []
  const nonDiagnostic: EvidenceItem[] = []

  for (const e of model.evidence) {
    const dir = e.dir[code]
    if (dir !== 0) {
      diagnostic.push(e)
    } else {
      nonDiagnostic.push(e)
    }
  }

  // Sort diagnostic by |contribution| descending
  const sortedDiagnostic = [...diagnostic].sort((a, b) => {
    const absA = Math.abs(a.contribution?.[code] ?? 0)
    const absB = Math.abs(b.contribution?.[code] ?? 0)
    return absB - absA
  })

  const sparseEvidence = model.evidence.length < 3

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-[420px] bg-slate-900 border-l border-slate-800 z-50 overflow-y-auto">

        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-5 py-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0 pr-3">
              <p className="text-[10px] font-bold tracking-[0.15em] text-slate-500 uppercase mb-1.5">
                Show Your Working
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                  hypothesis.stance === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                  hypothesis.stance === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                  'bg-amber-500/20 text-amber-400'
                }`}>
                  {hypothesis.code}
                </span>
                <span className="text-base font-bold text-slate-100">{hypothesis.name}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded shrink-0"
              aria-label="Close audit drawer"
            >
              ✕
            </button>
          </div>

          {/* Three metric boxes */}
          <div className="grid grid-cols-3 gap-2 mt-3">
            <MetricBox
              label="Weight"
              value={`${Math.round(hypothesis.p * 100)}%`}
            />
            <MetricBox
              label="Stance"
              value={hypothesis.stance}
              accent={
                hypothesis.stance === 'BULLISH' ? 'text-emerald-400' :
                hypothesis.stance === 'BEARISH' ? 'text-red-400' :
                'text-amber-400'
              }
            />
            <MetricBox
              label="Status"
              value={`${arrowChar} ${statusLabel}`}
            />
          </div>
        </div>

        {/* Sparse evidence warning */}
        {sparseEvidence && (
          <div className="mx-5 mt-4 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
            <p className="text-xs text-amber-400 font-semibold">
              LIMITED EVIDENCE: {model.evidence.length} items assessed. Weights reflect preliminary assessment.
            </p>
          </div>
        )}

        {/* Diagnostic evidence section */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">
            Diagnostic Evidence ({sortedDiagnostic.length} items)
          </p>

          <div className="flex flex-col gap-2">
            {sortedDiagnostic.map(e => {
              const dir = e.dir[code] as -1 | 1
              const contrib = e.contribution?.[code] ?? null
              const isSupporting = dir === 1

              return (
                <div
                  key={e.id}
                  className={`rounded-lg px-3 py-2.5 border ${
                    isSupporting
                      ? 'bg-emerald-500/15 border-emerald-500/20'
                      : 'bg-red-500/15 border-red-500/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <p className="text-xs font-medium text-slate-200 leading-snug flex-1 min-w-0">
                      {e.title}
                    </p>
                    {contrib !== null && (
                      <span className={`text-xs font-mono font-semibold shrink-0 ${
                        contrib >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}>
                        {contrib >= 0 ? '+' : ''}{contrib.toFixed(2)} &#916;log-odds
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                      isSupporting
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isSupporting ? 'Supports' : 'Contradicts'}
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${QUALITY_STYLE[e.quality]}`}>
                      {e.quality}
                    </span>
                    <span className="text-[9px] text-slate-500">{e.domain}</span>
                    <span className="text-[9px] text-slate-600">{e.date}</span>
                  </div>
                </div>
              )
            })}

            {sortedDiagnostic.length === 0 && (
              <p className="text-xs text-slate-500 italic">No diagnostic evidence for this hypothesis.</p>
            )}
          </div>
        </div>

        {/* Non-diagnostic section */}
        {nonDiagnostic.length > 0 && (
          <div className="px-5 pt-2 pb-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">
              Non-diagnostic ({nonDiagnostic.length} items)
            </p>

            <div className="flex flex-col gap-2 opacity-50">
              {nonDiagnostic.map(e => (
                <div
                  key={e.id}
                  className="rounded-lg px-3 py-2.5 bg-slate-800/30 border border-slate-700/30"
                >
                  <p className="text-xs font-medium text-slate-300 leading-snug mb-1.5">{e.title}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${QUALITY_STYLE[e.quality]}`}>
                      {e.quality}
                    </span>
                    <span className="text-[9px] text-slate-500">{e.domain}</span>
                    <span className="text-[9px] text-slate-600">{e.date}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 pb-6 pt-2">
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Contributions are &#916;log-odds derived from evidence quality and direction.
            Non-diagnostic items (neutral direction) have no discriminatory value.
          </p>
        </div>
      </div>
    </>
  )
}
