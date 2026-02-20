import { UserButton } from '@clerk/nextjs'
import Link from 'next/link'
import { Badge } from '@/components/ui'
import { getTier } from '@/lib/tier'

export async function Topbar() {
  const tier = await getTier()

  return (
    <>
      <header className="topbar">
        <div className="topbar-left">
          <Link href="/app" className="topbar-brand">
            Continuum Intelligence
          </Link>
        </div>
        <div className="topbar-right">
          {tier === 'free' && (
            <Link href="/pricing" className="topbar-upgrade">
              Upgrade to Pro
            </Link>
          )}
          {tier === 'pro' && (
            <Badge variant="teal">Professional</Badge>
          )}
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>
      <style>{`
        .topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          height: 56px;
          background: rgba(11,18,32,0.92);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-xl);
        }
        .topbar-brand {
          font-size: 15px;
          font-weight: 600;
          color: var(--text-primary);
          letter-spacing: -0.01em;
        }
        .topbar-right {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }
        .topbar-upgrade {
          font-size: 13px;
          font-weight: 600;
          color: var(--accent-teal);
          border: 1px solid rgba(34,184,167,0.3);
          padding: 5px 12px;
          border-radius: 6px;
          transition: background 0.15s;
        }
        .topbar-upgrade:hover {
          background: rgba(34,184,167,0.1);
        }
      `}</style>
    </>
  )
}
