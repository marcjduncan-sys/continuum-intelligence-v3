import { clsx } from 'clsx'

type BadgeVariant = 'default' | 'teal' | 'gold' | 'red' | 'amber' | 'green' | 'muted'

interface BadgeProps {
  variant?: BadgeVariant
  children: React.ReactNode
  className?: string
}

const variantStyles: Record<BadgeVariant, React.CSSProperties> = {
  default: { background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' },
  teal: { background: 'rgba(34,184,167,0.15)', color: 'var(--accent-teal)' },
  gold: { background: 'rgba(201,169,110,0.15)', color: 'var(--accent-gold)' },
  red: { background: 'rgba(224,92,92,0.15)', color: 'var(--signal-red)' },
  amber: { background: 'rgba(196,154,60,0.15)', color: 'var(--signal-amber)' },
  green: { background: 'rgba(74,158,126,0.15)', color: 'var(--signal-green)' },
  muted: { background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' },
}

export function Badge({ variant = 'default', children, className }: BadgeProps) {
  return (
    <>
      <span className={clsx('badge', className)} style={variantStyles[variant]}>
        {children}
      </span>
      <style>{`
        .badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 4px;
          font-family: var(--font-ui);
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
      `}</style>
    </>
  )
}
