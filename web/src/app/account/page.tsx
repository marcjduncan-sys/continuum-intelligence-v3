import { currentUser, auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTier } from '@/lib/tier'
import { BillingStatus } from '@/components/account'
import type { UserRole } from '@/types/user'

export default async function AccountPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const [clerkUser, tier] = await Promise.all([currentUser(), getTier()])
  if (!clerkUser) redirect('/sign-in')

  const email = clerkUser.emailAddresses[0]?.emailAddress ?? ''
  const name = clerkUser.firstName
    ? `${clerkUser.firstName}${clerkUser.lastName ? ' ' + clerkUser.lastName : ''}`
    : email

  const upgraded = false // Checked client-side via URL param

  return (
    <>
      <div className="account-page">
        <div className="account-header">
          <h1 className="account-title">Account</h1>
          <p className="account-sub">{name}</p>
        </div>

        <div className="account-grid">
          <BillingStatus role={tier as UserRole} email={email} />

          <div className="account-info-card">
            <h2>Profile</h2>
            <div className="info-row">
              <span>Name</span>
              <span>{name}</span>
            </div>
            <div className="info-row">
              <span>Email</span>
              <span>{email}</span>
            </div>
            <div className="info-row">
              <span>User ID</span>
              <span className="info-mono">{userId.slice(0, 16)}…</span>
            </div>
          </div>
        </div>

        <div className="account-nav">
          <a href="/app" className="account-nav-link">← Back to Research</a>
        </div>
      </div>

      <style>{`
        .account-page { max-width: 720px; }
        .account-header { margin-bottom: var(--space-2xl); }
        .account-title { font-size: 28px; font-weight: 700; margin-bottom: var(--space-xs); }
        .account-sub { font-size: 14px; color: var(--text-muted); }
        .account-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-xl); margin-bottom: var(--space-xl); }
        @media (max-width: 640px) { .account-grid { grid-template-columns: 1fr; } }
        .account-info-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 8px; padding: var(--space-lg); }
        .account-info-card h2 { font-size: 16px; font-weight: 600; margin-bottom: var(--space-lg); }
        .info-row { display: flex; justify-content: space-between; font-size: 13px; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border); }
        .info-row:last-child { border-bottom: none; }
        .info-row span:first-child { color: var(--text-secondary); }
        .info-row span:last-child { color: var(--text-primary); }
        .info-mono { font-family: monospace; font-size: 11px; }
        .account-nav { padding-top: var(--space-lg); }
        .account-nav-link { font-size: 14px; color: var(--text-secondary); }
        .account-nav-link:hover { color: var(--text-primary); }
      `}</style>
    </>
  )
}
