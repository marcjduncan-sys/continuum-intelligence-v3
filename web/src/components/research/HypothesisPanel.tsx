import { Badge } from '@/components/ui'
import type { HypothesisScore } from '@/types/research'
import { computeAllMetrics } from '@/hypothesis/compute'
import type { StockModel, Hypothesis, TensionSignal, DominanceLabel } from '@/hypothesis/types'

interface HypothesisPanelProps {
  hypotheses: Record<string, HypothesisScore>
  dominant: string
}

// ─── Adapter: stock JSON → StockModel ─────────────────────────────────────────
//
// survival_scores are ACH inconsistency-weighted scores on an open scale —
// they do NOT sum to 1.0. Normalise before feeding the compute engine.

function buildModel(hypotheses: Record<string, HypothesisScore>): StockModel {
  const codes = Object.keys(hypotheses).sort()
  const total = codes.reduce((sum, c) => sum + (hypotheses[c]?.survival_score ?? 0), 0)

  const hyps: Hypothesis[] = codes.map(code => {
    const h = hypotheses[code]
    const p = total > 0 ? h.survival_score / total : 1 / codes.length
    return {
      code,
      name: h.label,
      short: h.label.split(/\s+/).slice(0, 3).join(' '),
      stance: h.upside != null ? 'BULLISH' : 'BEARISH',
      p,
      p_prior: null,
      requires: [],
      supportingEvidence: [],
      contradictingEvidence: [],
    }
  })

  const constructiveCodes = hyps.filter(h => h.stance !== 'BEARISH').map(h => h.code)
  const downsideCodes     = hyps.filter(h => h.stance === 'BEARISH').map(h => h.code)

  // Edge-case guard: every hypothesis needs a partition
  if (constructiveCodes.length === 0) constructiveCodes.push(hyps[0].code)
  if (downsideCodes.length === 0)     downsideCodes.push(hyps[hyps.length - 1].code)

  return {
    stock: { name: '', ticker: '', exchange: '', sector: '', asOf: '', price: '', currency: '' },
    hypotheses: hyps,
    constructiveCodes,
    downsideCodes,
    evidence: [],
    // Dummy tripwires to satisfy validate() minimum — not displayed here
    tripwires: [
      { id: '_', timeframe: '', title: '', condition_good: '', effect_good: '', condition_bad: '', effect_bad: '', cadence: '', source: '', currentReading: null, proximity: null },
      { id: '__', timeframe: '', title: '', condition_good: '', effect_good: '', condition_bad: '', effect_bad: '', cadence: '', source: '', currentReading: null, proximity: null },
    ],
    meta: { hypothesisVintage: 1, vintageDate: '', priorVintageDate: null, domainsCovered: 0, domainsTotal: 10, analystNote: null },
  }
}

// ─── Colour helpers — existing CSS variables only ─────────────────────────────

function dominanceColor(label: DominanceLabel): string {
  switch (label) {
    case 'Dominant':  return 'var(--signal-green)'
    case 'Contested': return 'var(--signal-amber)'
    case 'Diffuse':   return 'var(--signal-red)'
    case 'Leading':   return 'var(--accent-teal)'
  }
}

function tensionBg(t: TensionSignal): string {
  switch (t.colour) {
    case 'amber': return 'rgba(212,160,60,0.10)'
    case 'red':   return 'rgba(212,85,85,0.10)'
    case 'green': return 'rgba(61,170,109,0.10)'
  }
}
function tensionBorderColor(t: TensionSignal): string {
  switch (t.colour) {
    case 'amber': return 'var(--signal-amber)'
    case 'red':   return 'var(--signal-red)'
    case 'green': return 'var(--signal-green)'
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'Building':
    case 'Strengthening': return 'var(--signal-green)'
    case 'Fading':
    case 'Watching':      return 'var(--signal-red)'
    case 'Priced':        return 'var(--signal-amber)'
    default:              return 'var(--text-muted)'
  }
}

function survivalWidth(score: number): string {
  return `${Math.max(5, Math.round(score * 100))}%`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function HypothesisPanel({ hypotheses, dominant }: HypothesisPanelProps) {
  const model   = buildModel(hypotheses)
  const metrics = computeAllMetrics(model)
  const { dominance, skewScore, skewLabel, tension } = metrics

  return (
    <>
      <div className="hyp-panel">

        {/* Tension signal — only shown when present */}
        {tension && (
          <div className="hyp-tension" style={{
            background: tensionBg(tension),
            borderLeftColor: tensionBorderColor(tension),
          }}>
            <span style={{ color: tensionBorderColor(tension) }}>⚡ {tension.label}</span>
          </div>
        )}

        {/* Panel header with dominance + risk balance summary */}
        <div className="hyp-panel-header">
          <h3 className="panel-title" style={{ marginBottom: 0 }}>Competing Hypotheses</h3>
          <div className="hyp-summary">
            <span className="hyp-dominance-badge" style={{ color: dominanceColor(dominance) }}>
              {dominance}
            </span>
            <span className="hyp-balance-text">
              {skewScore}/100 constructive · {skewLabel}
            </span>
          </div>
        </div>

        {/* Hypothesis list — sorted by normalised posterior (engine order) */}
        <div className="hyp-list">
          {metrics.sorted.map((m, idx) => {
            const hyp = hypotheses[m.code]
            if (!hyp) return null

            const isLead = idx === 0
            const status = metrics.statuses[m.code]?.label ?? 'Stable'

            return (
              <div key={m.code} className={`hyp-item ${isLead ? 'hyp-dominant' : ''}`}>

                {/* Row header */}
                <div className="hyp-header">
                  <div className="hyp-label-group">
                    <span className="hyp-key">{m.code}</span>
                    <span className="hyp-label">{hyp.label}</span>
                    {isLead && <Badge variant="teal">{dominance}</Badge>}
                  </div>
                  <span className="hyp-status-tag" style={{ color: statusColor(status) }}>
                    {status}
                  </span>
                </div>

                {/* Score bar — unchanged visual */}
                <div className="hyp-bar-track">
                  <div className="hyp-bar-fill" style={{ width: survivalWidth(hyp.survival_score) }} />
                </div>
                <div className="hyp-score-row">
                  <span className="hyp-score-label">Survival score</span>
                  <span className="hyp-score-value">{Math.round(hyp.survival_score * 100)}%</span>
                </div>

                {/* Plain English explanation */}
                {hyp.plain_english && (
                  <p className="hyp-plain-english">{hyp.plain_english}</p>
                )}

                {/* Upside scenario (constructive hypotheses) */}
                {hyp.upside && (
                  <div className="hyp-scenario hyp-scenario-up">
                    <span className="hyp-scenario-label">Upside</span>
                    <span>{hyp.upside}</span>
                  </div>
                )}

                {/* Risk scenario (downside hypotheses) */}
                {!hyp.upside && hyp.risk_plain && (
                  <div className="hyp-scenario hyp-scenario-dn">
                    <span className="hyp-scenario-label">Risk</span>
                    <span>{hyp.risk_plain}</span>
                  </div>
                )}

                {/* Watch trigger */}
                {hyp.what_to_watch && (
                  <div className="hyp-watch">
                    <span className="hyp-watch-label">Watch</span>
                    <span>{hyp.what_to_watch}</span>
                  </div>
                )}

              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        /* ── Existing styles — no changes ── */
        .hyp-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-lg); }
        .panel-title { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .hyp-list { display: flex; flex-direction: column; gap: var(--space-md); margin-top: var(--space-lg); }
        .hyp-item { padding: var(--space-md); background: var(--bg-page); border-radius: 6px; border: 1px solid transparent; }
        .hyp-dominant { border-color: rgba(34,184,167,0.3); }
        .hyp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-sm); gap: var(--space-sm); }
        .hyp-label-group { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
        .hyp-key { font-size: 12px; font-weight: 700; color: var(--text-muted); background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; }
        .hyp-label { font-size: 14px; font-weight: 500; color: var(--text-primary); }
        .hyp-bar-track { height: 4px; background: var(--bg-elevated); border-radius: 2px; margin-bottom: var(--space-xs); }
        .hyp-bar-fill { height: 100%; background: var(--accent-teal); border-radius: 2px; transition: width 0.3s ease; }
        .hyp-score-row { display: flex; justify-content: space-between; font-size: 12px; color: var(--text-muted); }
        .hyp-score-value { font-weight: 600; color: var(--text-secondary); }

        /* ── New content additions — design tokens only ── */
        .hyp-tension {
          border-left: 2px solid;
          border-radius: 4px;
          padding: 8px 12px;
          margin-bottom: var(--space-md);
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.04em;
        }
        .hyp-panel-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: var(--space-md);
          flex-wrap: wrap;
        }
        .hyp-summary {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          flex-wrap: wrap;
        }
        .hyp-dominance-badge {
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }
        .hyp-balance-text {
          font-size: 12px;
          color: var(--text-muted);
        }
        .hyp-status-tag {
          font-size: 11px;
          font-weight: 600;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .hyp-plain-english {
          font-size: 12px;
          color: var(--text-secondary);
          line-height: 1.55;
          margin-top: var(--space-sm);
          margin-bottom: 0;
        }
        .hyp-scenario {
          display: flex;
          gap: 6px;
          font-size: 11px;
          line-height: 1.5;
          margin-top: 6px;
          padding: 6px 8px;
          border-radius: 4px;
        }
        .hyp-scenario-up { background: rgba(61,170,109,0.08); color: var(--text-secondary); }
        .hyp-scenario-dn { background: rgba(212,85,85,0.08); color: var(--text-secondary); }
        .hyp-scenario-label {
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          white-space: nowrap;
          padding-top: 1px;
          flex-shrink: 0;
        }
        .hyp-scenario-up .hyp-scenario-label { color: var(--signal-green); }
        .hyp-scenario-dn .hyp-scenario-label { color: var(--signal-red); }
        .hyp-watch {
          display: flex;
          gap: 6px;
          font-size: 11px;
          line-height: 1.5;
          margin-top: 5px;
          color: var(--text-muted);
        }
        .hyp-watch-label {
          font-weight: 700;
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--accent-gold);
          white-space: nowrap;
          padding-top: 1px;
          flex-shrink: 0;
        }
      `}</style>
    </>
  )
}
