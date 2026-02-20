'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button, Badge } from '@/components/ui'

const PRO_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || 'price_PLACEHOLDER'

async function startCheckout(priceId: string): Promise<void> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ priceId }),
  })
  const data = await res.json() as { url?: string; error?: string }
  if (data.url) {
    window.location.href = data.url
  } else {
    alert(data.error || 'Could not start checkout. Please try again.')
  }
}

export default function PricingPage() {
  const [loading, setLoading] = useState(false)

  const handleUpgrade = async () => {
    setLoading(true)
    try {
      await startCheckout(PRO_PRICE_ID)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pricing-page">
      {/* Nav */}
      <nav className="pricing-nav">
        <div className="pricing-nav-inner">
          <Link href="/" className="pricing-logo">Continuum Intelligence</Link>
          <Link href="/sign-in" className="pricing-signin">Sign In</Link>
        </div>
      </nav>

      {/* Header */}
      <div className="pricing-header">
        <h1>Simple, transparent pricing</h1>
        <p>Start free. Upgrade when you need full research depth.</p>
      </div>

      {/* Plans */}
      <div className="pricing-cards">
        {/* Free */}
        <div className="plan-card">
          <div className="plan-header">
            <Badge variant="muted">Free</Badge>
            <div className="plan-price">$0<span>/month</span></div>
            <p className="plan-tagline">Start exploring coverage</p>
          </div>
          <ul className="plan-features">
            <li className="feature-yes">Stock coverage index (18 stocks)</li>
            <li className="feature-yes">Current price + sector badges</li>
            <li className="feature-yes">Overall sentiment per stock</li>
            <li className="feature-yes">Methodology overview</li>
            <li className="feature-no">Hypothesis detail & evidence</li>
            <li className="feature-no">AI research analyst chat</li>
            <li className="feature-no">Portfolio alignment analysis</li>
            <li className="feature-no">PDF export (LinkedIn carousel)</li>
            <li className="feature-no">Narrative flip alerts</li>
          </ul>
          <Link href="/sign-up">
            <Button variant="secondary" size="lg" className="plan-cta">Create free account</Button>
          </Link>
        </div>

        {/* Professional */}
        <div className="plan-card plan-card-featured">
          <div className="plan-header">
            <Badge variant="teal">Professional</Badge>
            <div className="plan-price">Contact<span> for pricing</span></div>
            <p className="plan-tagline">Full research access</p>
          </div>
          <ul className="plan-features">
            <li className="feature-yes">Everything in Free</li>
            <li className="feature-yes">Full hypothesis scoring & evidence</li>
            <li className="feature-yes">Three-layer signal breakdown</li>
            <li className="feature-yes">AI research analyst chat</li>
            <li className="feature-yes">Portfolio alignment analysis</li>
            <li className="feature-yes">60-day narrative history charts</li>
            <li className="feature-yes">PDF export (LinkedIn carousel)</li>
            <li className="feature-yes">Narrative flip email alerts</li>
            <li className="feature-yes">Priority support</li>
          </ul>
          <Button size="lg" className="plan-cta" loading={loading} onClick={handleUpgrade}>
            Upgrade to Professional
          </Button>
        </div>
      </div>

      {/* Enterprise note */}
      <div className="enterprise-note">
        <p>Need multi-seat institutional access or a custom data feed?</p>
        <Link href="mailto:research@dhcapital.com.au">Contact enterprise sales →</Link>
      </div>

      {/* FAQ */}
      <div className="faq-section">
        <h2>Frequently asked questions</h2>
        <div className="faq-grid">
          <div className="faq-item">
            <h3>What is the ACH methodology?</h3>
            <p>Analysis of Competing Hypotheses evaluates evidence against all plausible explanations simultaneously, rather than confirming a pre-selected thesis. It reduces confirmation bias and produces more robust research conclusions.</p>
          </div>
          <div className="faq-item">
            <h3>How often is data updated?</h3>
            <p>Price data is fetched every 15 minutes during ASX trading hours. The full pipeline — including narrative signals, hypothesis scoring, and composite sentiment — runs 5 times daily, post-market.</p>
          </div>
          <div className="faq-item">
            <h3>Is this financial advice?</h3>
            <p>No. Continuum Intelligence provides research information for informational purposes only. It is not financial advice and should not be relied upon for investment decisions. Always consult a licensed financial adviser.</p>
          </div>
          <div className="faq-item">
            <h3>Can I cancel anytime?</h3>
            <p>Yes. Manage or cancel your subscription at any time from the billing portal in your account settings. You retain Professional access until the end of the billing period.</p>
          </div>
        </div>
      </div>

      <style>{`
        .pricing-page { background: var(--bg-page); color: var(--text-primary); min-height: 100vh; font-family: var(--font-ui); }

        /* Nav */
        .pricing-nav { border-bottom: 1px solid var(--border); padding: 0 var(--space-xl); height: 60px; display: flex; align-items: center; }
        .pricing-nav-inner { max-width: 1100px; margin: 0 auto; width: 100%; display: flex; justify-content: space-between; align-items: center; }
        .pricing-logo { font-size: 15px; font-weight: 600; color: var(--text-primary); }
        .pricing-signin { font-size: 14px; color: var(--text-secondary); }
        .pricing-signin:hover { color: var(--text-primary); }

        /* Header */
        .pricing-header { text-align: center; padding: 72px var(--space-xl) 56px; }
        .pricing-header h1 { font-size: 40px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: var(--space-md); }
        .pricing-header p { font-size: 18px; color: var(--text-secondary); }

        /* Cards */
        .pricing-cards { display: flex; gap: var(--space-xl); justify-content: center; padding: 0 var(--space-xl) 64px; flex-wrap: wrap; max-width: 900px; margin: 0 auto; }
        .plan-card { background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; padding: var(--space-xl); flex: 1; min-width: 300px; max-width: 400px; display: flex; flex-direction: column; gap: var(--space-lg); }
        .plan-card-featured { border-color: var(--accent-teal); box-shadow: 0 0 0 1px var(--accent-teal); }
        .plan-header { display: flex; flex-direction: column; gap: var(--space-sm); }
        .plan-price { font-size: 36px; font-weight: 700; letter-spacing: -0.02em; }
        .plan-price span { font-size: 16px; font-weight: 400; color: var(--text-muted); }
        .plan-tagline { font-size: 14px; color: var(--text-secondary); }

        /* Feature list */
        .plan-features { list-style: none; display: flex; flex-direction: column; gap: var(--space-sm); flex: 1; }
        .plan-features li { font-size: 14px; padding-left: 22px; position: relative; }
        .feature-yes { color: var(--text-primary); }
        .feature-yes::before { content: '✓'; position: absolute; left: 0; color: var(--accent-teal); font-weight: 700; }
        .feature-no { color: var(--text-muted); }
        .feature-no::before { content: '–'; position: absolute; left: 0; color: var(--text-muted); }

        .plan-cta { width: 100%; }

        /* Enterprise */
        .enterprise-note { text-align: center; padding: 0 var(--space-xl) 64px; font-size: 14px; color: var(--text-secondary); }
        .enterprise-note a { color: var(--accent-teal); }

        /* FAQ */
        .faq-section { max-width: 900px; margin: 0 auto; padding: 0 var(--space-xl) 96px; }
        .faq-section h2 { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: var(--space-2xl); }
        .faq-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(380px, 1fr)); gap: var(--space-xl); }
        .faq-item h3 { font-size: 15px; font-weight: 600; margin-bottom: var(--space-sm); }
        .faq-item p { font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
      `}</style>
    </div>
  )
}
