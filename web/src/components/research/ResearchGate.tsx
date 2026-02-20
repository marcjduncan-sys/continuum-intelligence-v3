import Link from 'next/link'
import { Button } from '@/components/ui'

interface ResearchGateProps {
  ticker: string
  company: string
}

export function ResearchGate({ ticker, company }: ResearchGateProps) {
  return (
    <>
      <div className="gate-overlay">
        <div className="gate-card">
          <div className="gate-lock">🔒</div>
          <h2>Professional plan required</h2>
          <p>
            Full research for <strong>{company} ({ticker})</strong> — including hypothesis scoring, evidence matrix, three-layer signal breakdown, and 60-day narrative history — is available on the Professional plan.
          </p>
          <div className="gate-actions">
            <Link href="/pricing">
              <Button size="lg">Upgrade to Professional</Button>
            </Link>
            <Link href="/app">
              <Button variant="ghost" size="md">Back to coverage</Button>
            </Link>
          </div>
          <p className="gate-free-note">Free plan: full stock index, current prices, sentiment badges.</p>
        </div>
      </div>
      <style>{`
        .gate-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          padding: var(--space-2xl) var(--space-xl);
        }
        .gate-card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: var(--space-2xl);
          max-width: 480px;
          text-align: center;
        }
        .gate-lock { font-size: 40px; margin-bottom: var(--space-lg); }
        .gate-card h2 { font-size: 22px; font-weight: 700; margin-bottom: var(--space-md); }
        .gate-card p { font-size: 14px; line-height: 1.65; color: var(--text-secondary); margin-bottom: var(--space-xl); }
        .gate-actions { display: flex; flex-direction: column; gap: var(--space-sm); align-items: center; margin-bottom: var(--space-lg); }
        .gate-free-note { font-size: 12px; color: var(--text-muted); margin-top: 0; }
      `}</style>
    </>
  )
}
