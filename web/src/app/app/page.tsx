import { getTier } from '@/lib/tier'
import { StockTile } from '@/components/research/StockTile'
import type { StockData, LivePrices } from '@/types/research'

const FASTAPI_URL = process.env.NEXT_PUBLIC_FASTAPI_URL || 'http://localhost:8000'

async function getLivePrices(): Promise<LivePrices> {
  try {
    const res = await fetch(`${FASTAPI_URL}/data/live-prices.json`, {
      next: { revalidate: 60 }, // revalidate every 60 seconds
    })
    if (!res.ok) return {}
    return res.json() as Promise<LivePrices>
  } catch {
    return {}
  }
}

async function getAllStocks(): Promise<StockData[]> {
  try {
    const res = await fetch(`${FASTAPI_URL}/api/tickers`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return []
    const data = await res.json() as { tickers: string[] }
    // Fetch individual stock data in parallel (max 18 stocks)
    const stocks = await Promise.allSettled(
      data.tickers.map(ticker =>
        fetch(`${FASTAPI_URL}/data/stocks/${ticker}.json`, {
          next: { revalidate: 300 },
        }).then(r => r.ok ? r.json() as Promise<StockData> : null)
      )
    )
    return stocks
      .filter((r): r is PromiseFulfilledResult<StockData> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value)
  } catch {
    return []
  }
}

export default async function AppHomePage() {
  const [tier, stocks] = await Promise.all([getTier(), getAllStocks()])

  // Sort: FLIP first, then ALERT, then NORMAL
  const sorted = [...stocks].sort((a, b) => {
    const order = { FLIP: 0, ALERT: 1, NORMAL: 2 }
    return (order[a.alert_state as keyof typeof order] ?? 2) - (order[b.alert_state as keyof typeof order] ?? 2)
  })

  return (
    <>
      <div className="home-page">
        <div className="home-header">
          <h1 className="home-title">Research Coverage</h1>
          <p className="home-sub">{stocks.length} ASX stocks · Hypotheses updated post-market</p>
        </div>

        {tier === 'free' && (
          <div className="free-banner">
            <span>You are on the free plan. Research detail, AI chat, and portfolio tools require a </span>
            <a href="/pricing">Professional subscription</a>.
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="home-empty">
            <p>No stock data available. The pipeline may be running.</p>
          </div>
        ) : (
          <div className="stock-grid">
            {sorted.map(stock => (
              <StockTile key={stock.ticker} stock={stock} tier={tier} />
            ))}
          </div>
        )}
      </div>

      <style>{`
        .home-page { max-width: 1100px; }
        .home-header { margin-bottom: var(--space-xl); }
        .home-title { font-size: 28px; font-weight: 700; margin-bottom: var(--space-xs); }
        .home-sub { font-size: 14px; color: var(--text-muted); }
        .free-banner {
          background: rgba(201,169,110,0.08);
          border: 1px solid rgba(201,169,110,0.2);
          border-radius: 8px;
          padding: var(--space-md) var(--space-lg);
          font-size: 14px;
          color: var(--text-secondary);
          margin-bottom: var(--space-xl);
        }
        .free-banner a { color: var(--accent-teal); font-weight: 500; }
        .stock-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: var(--space-md);
        }
        .home-empty { color: var(--text-muted); font-size: 14px; padding: var(--space-xl) 0; }
      `}</style>
    </>
  )
}
