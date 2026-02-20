import { notFound } from 'next/navigation'
import { getTier } from '@/lib/tier'
import { ResearchGate, HypothesisPanel, SentimentPanel } from '@/components/research'
import { Badge } from '@/components/ui'
import type { StockData } from '@/types/research'

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

interface Params {
  params: Promise<{ ticker: string }>
}

async function getStockData(ticker: string): Promise<StockData | null> {
  try {
    const res = await fetch(`${FASTAPI_URL}/data/stocks/${ticker}.json`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return null
    return res.json() as Promise<StockData>
  } catch {
    return null
  }
}

function alertBadgeVariant(state: string): 'teal' | 'amber' | 'red' | 'default' {
  if (state === 'FLIP') return 'red'
  if (state === 'ALERT') return 'amber'
  return 'teal'
}

export default async function ResearchPage({ params }: Params) {
  const { ticker } = await params
  const [tier, stock] = await Promise.all([getTier(), getStockData(ticker.toUpperCase())])

  if (!stock) notFound()

  if (tier === 'free') {
    return <ResearchGate ticker={stock.ticker} company={stock.company} />
  }

  const sentiment = stock.three_layer_signal?.sentiment_label
  const overall = stock.three_layer_signal?.overall_sentiment ?? 0

  return (
    <>
      <div className="research-page">
        {/* Header */}
        <div className="rp-header">
          <div className="rp-title-group">
            <h1 className="rp-ticker">{stock.ticker}</h1>
            <div className="rp-company">{stock.company}</div>
            <div className="rp-meta">
              <span className="rp-sector">{stock.sector}</span>
              {stock.alert_state !== 'NORMAL' && (
                <Badge variant={alertBadgeVariant(stock.alert_state)}>{stock.alert_state}</Badge>
              )}
            </div>
          </div>
          <div className="rp-price-group">
            {stock.current_price > 0 && (
              <div className="rp-price">A${stock.current_price.toFixed(2)}</div>
            )}
            {sentiment && (
              <div className="rp-sentiment" style={{ color: overall > 10 ? 'var(--signal-green)' : overall < -10 ? 'var(--signal-red)' : 'var(--text-muted)' }}>
                {overall > 0 ? '+' : ''}{overall} · {sentiment.replace('_', ' ')}
              </div>
            )}
          </div>
        </div>

        {/* Research grid */}
        <div className="rp-grid">
          <div className="rp-col-main">
            {stock.hypotheses && (
              <HypothesisPanel
                hypotheses={stock.hypotheses}
                dominant={stock.dominant}
              />
            )}
          </div>
          <div className="rp-col-side">
            {stock.three_layer_signal && stock.narrative_weights && (
              <SentimentPanel
                signal={stock.three_layer_signal}
                weights={stock.narrative_weights}
              />
            )}
            <div className="rp-meta-card">
              <h3 className="panel-title">Analysis</h3>
              <div className="rp-meta-row">
                <span>Dominant hypothesis</span>
                <strong>{stock.dominant}</strong>
              </div>
              <div className="rp-meta-row">
                <span>Confidence</span>
                <strong>{stock.confidence}</strong>
              </div>
              <div className="rp-meta-row">
                <span>Alert state</span>
                <strong>{stock.alert_state}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .research-page { max-width: 1100px; }
        .rp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2xl); padding-bottom: var(--space-xl); border-bottom: 1px solid var(--border); }
        .rp-title-group { }
        .rp-ticker { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; }
        .rp-company { font-size: 16px; color: var(--text-secondary); margin-top: 2px; }
        .rp-meta { display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-sm); }
        .rp-sector { font-size: 12px; color: var(--text-muted); }
        .rp-price-group { text-align: right; }
        .rp-price { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
        .rp-sentiment { font-size: 13px; font-weight: 600; margin-top: 4px; }
        .rp-grid { display: grid; grid-template-columns: 1fr 340px; gap: var(--space-xl); align-items: start; }
        @media (max-width: 900px) { .rp-grid { grid-template-columns: 1fr; } }
        .rp-col-main { display: flex; flex-direction: column; gap: var(--space-lg); }
        .rp-col-side { display: flex; flex-direction: column; gap: var(--space-lg); }
        .rp-meta-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-lg); }
        .panel-title { font-size: 15px; font-weight: 600; margin-bottom: var(--space-lg); color: var(--text-primary); }
        .rp-meta-row { display: flex; justify-content: space-between; font-size: 13px; padding: var(--space-xs) 0; border-bottom: 1px solid var(--border); }
        .rp-meta-row:last-child { border-bottom: none; }
        .rp-meta-row span { color: var(--text-secondary); }
        .rp-meta-row strong { color: var(--text-primary); }
      `}</style>
    </>
  )
}
