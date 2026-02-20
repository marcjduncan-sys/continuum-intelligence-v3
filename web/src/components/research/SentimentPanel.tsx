import type { ThreeLayerSignal } from '@/types/research'

interface SentimentPanelProps {
  signal: ThreeLayerSignal
  weights: {
    macro: number
    sector: number
    tech: number
    company: number
  }
}

function signalColor(value: number): string {
  if (value > 10) return 'var(--signal-green)'
  if (value < -10) return 'var(--signal-red)'
  return 'var(--text-muted)'
}

function signalLabel(value: number): string {
  if (value > 30) return 'Strong Upside'
  if (value > 10) return 'Upside'
  if (value < -30) return 'Strong Downside'
  if (value < -10) return 'Downside'
  return 'Neutral'
}

function barWidth(value: number, maxAbs: number = 50): string {
  return `${Math.min(100, Math.round((Math.abs(value) / maxAbs) * 100))}%`
}

export function SentimentPanel({ signal, weights }: SentimentPanelProps) {
  const rows = [
    { label: 'External Environment', value: signal.macro_signal, weight: weights.macro + weights.sector, description: 'Macro + Sector' },
    { label: 'Company Research', value: signal.idio_signal, weight: weights.company, description: 'Idiosyncratic signals' },
    { label: 'Overall Sentiment', value: signal.overall_sentiment, weight: 1, description: 'Composite score', isTotal: true },
  ]

  return (
    <>
      <div className="sentiment-panel">
        <h3 className="panel-title">Three-Layer Signal</h3>
        <div className="signal-date">As of {signal.date}</div>
        <div className="signal-rows">
          {rows.map(row => (
            <div key={row.label} className={`signal-row ${row.isTotal ? 'signal-total' : ''}`}>
              <div className="signal-row-header">
                <span className="signal-row-label">{row.label}</span>
                <span className="signal-row-desc">{row.description}</span>
              </div>
              <div className="signal-bar-row">
                <div className="signal-bar-track">
                  <div
                    className={`signal-bar-fill ${row.value >= 0 ? 'positive' : 'negative'}`}
                    style={{ width: barWidth(row.value), float: row.value >= 0 ? 'right' : 'left' }}
                  />
                </div>
                <div className="signal-value-group">
                  <span className="signal-value" style={{ color: signalColor(row.value) }}>
                    {row.value > 0 ? '+' : ''}{row.value}
                  </span>
                  <span className="signal-label-text" style={{ color: signalColor(row.value) }}>
                    {signalLabel(row.value)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        .sentiment-panel { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-lg); }
        .signal-date { font-size: 11px; color: var(--text-muted); margin-bottom: var(--space-lg); margin-top: -8px; }
        .signal-rows { display: flex; flex-direction: column; gap: var(--space-md); }
        .signal-row { padding: var(--space-sm) 0; }
        .signal-total { border-top: 1px solid var(--border); padding-top: var(--space-md); margin-top: var(--space-xs); }
        .signal-row-header { display: flex; justify-content: space-between; margin-bottom: var(--space-xs); }
        .signal-row-label { font-size: 13px; font-weight: 500; color: var(--text-primary); }
        .signal-row-desc { font-size: 11px; color: var(--text-muted); }
        .signal-bar-row { display: flex; align-items: center; gap: var(--space-md); }
        .signal-bar-track { flex: 1; height: 6px; background: var(--bg-elevated); border-radius: 3px; overflow: hidden; }
        .signal-bar-fill { height: 100%; border-radius: 3px; }
        .signal-bar-fill.positive { background: var(--signal-green); }
        .signal-bar-fill.negative { background: var(--signal-red); }
        .signal-value-group { display: flex; align-items: center; gap: var(--space-sm); min-width: 120px; }
        .signal-value { font-size: 16px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .signal-label-text { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.04em; }
      `}</style>
    </>
  )
}
