import { clsx } from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <>
      <button
        className={clsx('btn', variantStyles[variant], sizeStyles[size], className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
        {children}
      </button>
      <style>{`
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-xs);
          border: none;
          border-radius: 6px;
          font-family: var(--font-ui);
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s ease, background 0.15s ease;
          white-space: nowrap;
          text-decoration: none;
        }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-sm { padding: 6px 12px; font-size: 13px; }
        .btn-md { padding: 10px 18px; font-size: 14px; }
        .btn-lg { padding: 14px 24px; font-size: 16px; }
        .btn-primary {
          background: var(--accent-teal);
          color: #0B1220;
        }
        .btn-primary:hover:not(:disabled) { opacity: 0.9; }
        .btn-secondary {
          background: var(--bg-elevated);
          color: var(--text-primary);
          border: 1px solid var(--border);
        }
        .btn-secondary:hover:not(:disabled) { background: rgba(255,255,255,0.08); }
        .btn-ghost {
          background: transparent;
          color: var(--text-secondary);
        }
        .btn-ghost:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-elevated); }
        .btn-danger {
          background: var(--signal-red);
          color: white;
        }
        .btn-danger:hover:not(:disabled) { opacity: 0.9; }
        .btn-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  )
}
