import Link from 'next/link'
import { Badge } from '@/components/ui'
import type { StockData } from '@/types/research'

interface StockTileProps {
  stock: StockData
  tier: 'free' | 'pro'
}

function sentimentVariant(label: string): 'teal' | 'default' | 'red' | 'amber' {
  if (label?.includes('UPSIDE')) return 'teal'
  if (label?.includes('DOWNSIDE')) return 'red'
  if (label === 'NEUTRAL') return 'default'
  return 'default'
}

function alertVariant(alertState: string): string {
  if (alertState === 'FLIP') return 'flip'
  if (alertState === 'ALERT') return 'alert'
  return ''
}

function priceChangeColor(change: number): string {
  if (change > 0) return 'var(--signal-green)'
  if (change < 0) return 'var(--signal-red)'
  return 'var(--text-muted)'
}

export function StockTile({ stock, tier }: StockTileProps) {
  const href = tier === 'pro' ? `/app/research/${stock.ticker}` : '/pricing'
  const sentiment = stock.three_layer_signal?.sentiment_label
  const change = stock.three_layer_signal?.overall_sentiment ?? 0
  const alertState = stock.alert_state

  return (
    <>
      <Link href={href} className={`stock-tile ${alertVariant(alertState)}`}>
        <div className="tile-header">
          <div>
            <div className="tile-ticker">{stock.ticker}</div>
            <div className="tile-company">{stock.company}</div>
          </div>
          <div className="tile-right">
            {stock.current_price > 0 && (
              <div className="tile-price">A${stock.current_price.toFixed(2)}</div>
            )}
            {alertState !== 'NORMAL' && (
              <Badge variant={alertState === 'FLIP' ? 'red' : 'amber'} className="tile-alert-badge">
                {alertState}
              </Badge>
            )}
          </div>
        </div>
        <div className="tile-footer">
          <span className="tile-sector">{stock.sector}</span>
          {sentiment && (
            <Badge variant={sentimentVariant(sentiment)}>
              {sentiment.replace('_', ' ')}
            </Badge>
          )}
          {tier === 'free' && (
            <span className="tile-lock-hint">Pro →</span>
          )}
        </div>
      </Link>
      <style>{`
        .stock-tile {
          display: block;
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: var(--space-md) var(--space-lg);
          transition: border-color 0.15s, background 0.15s;
          cursor: pointer;
        }
        .stock-tile:hover { border-color: rgba(34,184,167,0.4); background: var(--bg-elevated); }
        .stock-tile.flip { border-color: rgba(224,92,92,0.4); }
        .stock-tile.alert { border-color: rgba(196,154,60,0.4); }
        .tile-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--space-sm); }
        .tile-ticker { font-size: 16px; font-weight: 700; color: var(--text-primary); }
        .tile-company { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
        .tile-right { text-align: right; }
        .tile-price { font-size: 15px; font-weight: 600; color: var(--text-primary); font-variant-numeric: tabular-nums; }
        .tile-alert-badge { margin-top: 4px; }
        .tile-footer { display: flex; align-items: center; gap: var(--space-sm); flex-wrap: wrap; }
        .tile-sector { font-size: 11px; color: var(--text-muted); flex: 1; }
        .tile-lock-hint { font-size: 11px; color: var(--text-muted); margin-left: auto; }
      `}</style>
    </>
  )
}
