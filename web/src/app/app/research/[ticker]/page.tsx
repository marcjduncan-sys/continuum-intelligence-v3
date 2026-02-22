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
    const res = await fetch(`${FASTAPI_URL}/data/research/${ticker}.json`, {
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

        {/* Research Sections 01-10 */}
        <div className="rp-sections">
          {/* 01 Identity */}
          <section className="rp-section" id="identity">
            <div className="section-header">
              <span className="section-num">01</span>
              <h2 className="section-title">Identity & Snapshot</h2>
            </div>
            <div className="section-content">
              <p className="business-overview">{stock.identity?.overview}</p>
            </div>
          </section>

          {/* 02 Hypotheses */}
          <section className="rp-section" id="hypotheses">
            <div className="section-header">
              <span className="section-num">02</span>
              <h2 className="section-title">Competing Hypotheses</h2>
            </div>
            <div className="section-content">
              {stock.hypotheses && (
                <HypothesisPanel
                  hypotheses={stock.hypotheses}
                  dominant={stock.dominant}
                />
              )}
            </div>
          </section>

          {/* 03 Narrative */}
          <section className="rp-section" id="narrative">
            <div className="section-header">
              <span className="section-num">03</span>
              <h2 className="section-title">Dominant Narrative</h2>
            </div>
            <div className="section-content">
              <p className="narrative-text">{stock.narrative?.theNarrative}</p>
            </div>
          </section>

          {/* 04 Evidence */}
          <section className="rp-section" id="evidence">
            <div className="section-header">
              <span className="section-num">04</span>
              <h2 className="section-title">Primary Evidence Domains (1-8)</h2>
            </div>
            <div className="section-content">
              <p className="evidence-intro">{stock.evidence?.intro}</p>
              <div className="evidence-cards">
                {stock.evidence?.cards?.filter(c => parseInt(c.title) <= 8).map((card, i) => (
                  <div key={i} className="evidence-card-stub">
                    <strong>{card.title}</strong>: {card.finding.substring(0, 150)}...
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 05 Leadership */}
          <section className="rp-section" id="leadership">
            <div className="section-header">
              <span className="section-num">05</span>
              <h2 className="section-title">Leadership & Governance</h2>
            </div>
            <div className="section-content">
              {stock.evidence?.cards?.find(c => parseInt(c.title) === 9)?.finding}
            </div>
          </section>

          {/* 06 Ownership */}
          <section className="rp-section" id="ownership">
            <div className="section-header">
              <span className="section-num">06</span>
              <h2 className="section-title">Ownership & Capital Flows</h2>
            </div>
            <div className="section-content">
              {stock.evidence?.cards?.find(c => parseInt(c.title) === 10)?.finding}
            </div>
          </section>

          {/* 07 Discriminators */}
          <section className="rp-section" id="discriminators">
            <div className="section-header">
              <span className="section-num">07</span>
              <h2 className="section-title">What Discriminates</h2>
            </div>
            <div className="section-content">
              <p className="discriminators-intro">{stock.discriminators?.intro}</p>
            </div>
          </section>

          {/* 08 Tripwires */}
          <section className="rp-section" id="tripwires">
            <div className="section-header">
              <span className="section-num">08</span>
              <h2 className="section-title">What We're Watching</h2>
            </div>
            <div className="section-content">
              <p className="tripwires-intro">{stock.tripwires?.intro}</p>
            </div>
          </section>

          {/* 09 Gaps */}
          <section className="rp-section" id="gaps">
            <div className="section-header">
              <span className="section-num">09</span>
              <h2 className="section-title">Evidence Gaps & Integrity</h2>
            </div>
            <div className="section-content">
              <p className="gaps-text">{stock.gaps?.analyticalLimitations}</p>
            </div>
          </section>

          {/* 10 Technical */}
          <section className="rp-section" id="technical">
            <div className="section-header">
              <span className="section-num">10</span>
              <h2 className="section-title">Technical Structure</h2>
            </div>
            <div className="section-content">
              <p className="ta-text">{stock.technicalAnalysis?.regime} - {stock.technicalAnalysis?.trend?.direction}</p>
              {/* Note: In a real implementation, we would add the Chart component here */}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .research-page { max-width: 1100px; margin: 0 auto; padding: var(--space-xl); }
        .rp-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-2xl); padding-bottom: var(--space-xl); border-bottom: 1px solid var(--border); }
        .rp-ticker { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; line-height: 1; }
        .rp-company { font-size: 16px; color: var(--text-secondary); margin-top: 4px; }
        .rp-meta { display: flex; align-items: center; gap: var(--space-sm); margin-top: var(--space-md); }
        .rp-sector { font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .rp-price-group { text-align: right; }
        .rp-price { font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
        .rp-sentiment { font-size: 14px; font-weight: 600; margin-top: 8px; }
        
        .rp-sections { display: flex; flex-direction: column; gap: var(--space-3xl); }
        .rp-section { scroll-margin-top: 100px; }
        .section-header { display: flex; align-items: baseline; gap: var(--space-md); margin-bottom: var(--space-xl); border-bottom: 1px solid var(--border); padding-bottom: var(--space-sm); }
        .section-num { font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); font-weight: 500; }
        .section-title { font-size: 18px; font-weight: 700; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.02em; }
        
        .section-content { font-size: 15px; line-height: 1.6; color: var(--text-secondary); }
        .business-overview, .narrative-text { max-width: 800px; }
        .evidence-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-lg); margin-top: var(--space-lg); }
        .evidence-card-stub { background: var(--bg-surface); border: 1px solid var(--border); padding: var(--space-lg); border-radius: 8px; font-size: 13px; }
        
        @media (max-width: 900px) {
          .rp-header { flex-direction: column; gap: var(--space-lg); }
          .rp-price-group { text-align: left; }
        }
      `}</style>
    </>
  )
}
