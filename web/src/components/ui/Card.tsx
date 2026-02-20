import { clsx } from 'clsx'

interface CardProps {
  children: React.ReactNode
  className?: string
  elevated?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const paddingMap = {
  none: '0',
  sm: 'var(--space-md)',
  md: 'var(--space-lg)',
  lg: 'var(--space-xl)',
}

export function Card({ children, className, elevated = false, padding = 'md' }: CardProps) {
  return (
    <>
      <div
        className={clsx('card', elevated && 'card-elevated', className)}
        style={{ padding: paddingMap[padding] }}
      >
        {children}
      </div>
      <style>{`
        .card {
          background: var(--bg-surface);
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .card-elevated {
          background: var(--bg-elevated);
        }
      `}</style>
    </>
  )
}
