import { Badge } from '@/components/ui'
import type { HypothesisScore } from '@/types/research'

interface HypothesisPanelProps {
  hypotheses: Record<string, HypothesisScore>
  dominant: string
}

function statusVariant(status: string): 'teal' | 'green' | 'amber' | 'red' | 'muted' {
  switch (status) {
    case 'HIGH': return 'teal'
    case 'MODERATE': return 'green'
    case 'LOW': return 'amber'
    case 'VERY_LOW': return 'red'
    default: return 'muted'
  }
}

function survivalWidth(score: number): string {
  return `${Math.max(5, Math.round(score * 100))}%`
}

export function HypothesisPanel({ hypotheses, dominant }: HypothesisPanelProps) {
  const entries = Object.entries(hypotheses).sort(([, a], [, b]) => b.survival_score - a.survival_score)

  return (
    <>
      <div className="hyp-panel">
        <h3 className="panel-title">Competing Hypotheses</h3>
        <div className="hyp-list">
          {entries.map(([key, hyp]) => (
            <div key={key} className={`hyp-item ${key === dominant ? 'hyp-dominant' : ''}`}>
              <div className="hyp-header">
                <div className="hyp-label-group">
                  <span className="hyp-key">{key}</span>
                  <span className="hyp-label">{hyp.label}</span>
                  {key === dominant && <Badge variant="teal">Dominant</Badge>}
                </div>
                <Badge variant={statusVariant(hyp.status)}>{hyp.status}</Badge>
              </div>
              <div className="hyp-bar-track">
                <div className="hyp-bar-fill" style={{ width: survivalWidth(hyp.survival_score) }} />
              </div>
              <div className="hyp-score-row">
                <span className="hyp-score-label">Survival score</span>
                <span className="hyp-score-value">{Math.round(hyp.survival_score * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .hyp-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-lg); }
        .panel-title { font-size: 15px; font-weight: 600; margin-bottom: var(--space-lg); color: var(--text-primary); }
        .hyp-list { display: flex; flex-direction: column; gap: var(--space-md); }
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
      `}</style>
    </>
  )
}
