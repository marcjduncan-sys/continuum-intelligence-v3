'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'

interface NavItem {
  label: string
  href: string
  proOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Research', href: '/app' },
  { label: 'Portfolio', href: '/app/portfolio', proOnly: true },
  { label: 'Comparator', href: '/app/thesis', proOnly: true },
  { label: 'Chat', href: '/app/chat', proOnly: true },
]

interface SidebarProps {
  tier: 'free' | 'pro'
}

export function Sidebar({ tier }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      <aside className="sidebar">
        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => {
            const locked = item.proOnly && tier === 'free'
            const active = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href))

            return (
              <Link
                key={item.href}
                href={locked ? '/pricing' : item.href}
                className={clsx('sidebar-item', active && 'sidebar-item-active', locked && 'sidebar-item-locked')}
                title={locked ? 'Professional plan required' : undefined}
              >
                {item.label}
                {locked && <span className="sidebar-lock" aria-label="Pro only">🔒</span>}
              </Link>
            )
          })}
        </nav>
        <div className="sidebar-footer">
          <Link href="/account" className="sidebar-account">Account</Link>
        </div>
      </aside>
      <style>{`
        .sidebar {
          width: 200px;
          flex-shrink: 0;
          background: var(--bg-surface);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          min-height: calc(100vh - 56px);
          padding: var(--space-lg) 0;
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: 0 var(--space-md);
          flex: 1;
        }
        .sidebar-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 9px var(--space-md);
          border-radius: 6px;
          font-size: 14px;
          color: var(--text-secondary);
          transition: background 0.12s, color 0.12s;
        }
        .sidebar-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .sidebar-item-active { background: rgba(34,184,167,0.12); color: var(--accent-teal); font-weight: 500; }
        .sidebar-item-locked { opacity: 0.5; }
        .sidebar-lock { font-size: 10px; }
        .sidebar-footer { padding: var(--space-md); border-top: 1px solid var(--border); }
        .sidebar-account { font-size: 13px; color: var(--text-muted); padding: 6px var(--space-md); border-radius: 6px; display: block; }
        .sidebar-account:hover { background: var(--bg-elevated); color: var(--text-secondary); }
      `}</style>
    </>
  )
}
