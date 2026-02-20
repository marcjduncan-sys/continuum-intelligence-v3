'use client'

import { useState } from 'react'
import { Button, Badge, Card } from '@/components/ui'
import type { UserRole } from '@/types/user'

interface BillingStatusProps {
  role: UserRole
  email: string
}

export function BillingStatus({ role, email }: BillingStatusProps) {
  const [portalLoading, setPortalLoading] = useState(false)

  const openPortal = async () => {
    setPortalLoading(true)
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await res.json() as { url?: string; error?: string }
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Unable to open billing portal.')
      }
    } finally {
      setPortalLoading(false)
    }
  }

  return (
    <Card>
      <h2 className="bs-title">Subscription</h2>
      <div className="bs-row">
        <span className="bs-label">Plan</span>
        <Badge variant={role === 'pro' ? 'teal' : 'muted'}>
          {role === 'pro' ? 'Professional' : 'Free'}
        </Badge>
      </div>
      <div className="bs-row">
        <span className="bs-label">Email</span>
        <span className="bs-value">{email}</span>
      </div>
      {role === 'free' ? (
        <div className="bs-upgrade">
          <p>Upgrade to Professional to unlock full research, AI chat, portfolio tools, and PDF export.</p>
          <a href="/pricing">
            <Button>Upgrade to Professional</Button>
          </a>
        </div>
      ) : (
        <div className="bs-portal">
          <p className="bs-portal-note">Manage your subscription, download invoices, or cancel from the billing portal.</p>
          <Button variant="secondary" loading={portalLoading} onClick={openPortal}>
            Open Billing Portal
          </Button>
        </div>
      )}
      <style>{`
        .bs-title { font-size: 16px; font-weight: 600; margin-bottom: var(--space-lg); }
        .bs-row { display: flex; justify-content: space-between; align-items: center; padding: var(--space-sm) 0; border-bottom: 1px solid var(--border); }
        .bs-row:last-of-type { margin-bottom: var(--space-lg); }
        .bs-label { font-size: 13px; color: var(--text-secondary); }
        .bs-value { font-size: 13px; color: var(--text-primary); }
        .bs-upgrade { margin-top: var(--space-lg); }
        .bs-upgrade p { font-size: 14px; color: var(--text-secondary); margin-bottom: var(--space-md); line-height: 1.6; }
        .bs-portal { margin-top: var(--space-lg); }
        .bs-portal-note { font-size: 13px; color: var(--text-secondary); margin-bottom: var(--space-md); }
      `}</style>
    </Card>
  )
}
