import Link from 'next/link'
import { Button } from '@/components/ui'

export default function LandingPage() {
  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-inner">
          <span className="landing-logo">Continuum Intelligence</span>
          <div className="landing-nav-links">
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-in">Sign In</Link>
            <Link href="/sign-up" className="landing-cta-btn">Start Free</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-badge">18 ASX stocks · Updated 5× daily</div>
          <h1 className="hero-headline">
            Institutional-grade equity research.<br />
            <span className="hero-headline-accent">Powered by AI.</span>
          </h1>
          <p className="hero-sub">
            Continuum Intelligence applies Analysis of Competing Hypotheses to 18 ASX-listed stocks — ranking rival narratives by consistency with all available evidence, updated automatically after market close.
          </p>
          <div className="hero-actions">
            <Link href="/sign-up">
              <Button size="lg">Start for free</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="secondary" size="lg">View plans</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="features">
        <div className="features-inner">
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3>Dynamic Narrative Engine</h3>
            <p>Competing hypotheses ranked by weighted evidence consistency. Watch narratives shift in real time as price and news data arrives.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Three-Layer Signal</h3>
            <p>Macro environment, sector dynamics, and company-specific idiosyncratic signals combined into a single composite sentiment score.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🤖</div>
            <h3>AI Research Analyst</h3>
            <p>Ask questions about any covered stock. The AI retrieves relevant evidence passages and synthesises an institutional-quality response.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔔</div>
            <h3>Narrative Flip Alerts</h3>
            <p>Get notified when a dominant hypothesis is under pressure or flips — before the market consensus catches up.</p>
          </div>
        </div>
      </section>

      {/* Coverage strip */}
      <section className="coverage">
        <div className="coverage-inner">
          <h2>18 ASX stocks covered</h2>
          <div className="ticker-grid">
            {['PME','XRO','WTC','DRO','CSL','GMG','CBA','NAB','MQG','FMG','BHP','RIO','WDS','WOR','GYG','SIG','OCL','DXS'].map(t => (
              <span key={t} className="ticker-chip">{t}</span>
            ))}
          </div>
          <p className="coverage-sub">Technology · Healthcare · Mining · Energy · Financials · REITs · Consumer</p>
        </div>
      </section>

      {/* CTA */}
      <section className="final-cta">
        <div className="final-cta-inner">
          <h2>Start your research edge today.</h2>
          <p>Free access includes the full stock index. Professional unlocks research depth, AI chat, and portfolio analysis.</p>
          <div className="hero-actions">
            <Link href="/sign-up">
              <Button size="lg">Create free account</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="lg">Compare plans →</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <span>© 2026 Continuum Intelligence · DH Capital</span>
          <div className="footer-links">
            <Link href="/pricing">Pricing</Link>
            <Link href="/sign-in">Sign In</Link>
          </div>
        </div>
      </footer>

      <style>{`
        .landing { background: var(--bg-page); color: var(--text-primary); min-height: 100vh; }

        /* Nav */
        .landing-nav { position: sticky; top: 0; z-index: 100; background: rgba(11,18,32,0.92); backdrop-filter: blur(12px); border-bottom: 1px solid var(--border); }
        .landing-nav-inner { max-width: 1100px; margin: 0 auto; padding: 0 var(--space-xl); height: 60px; display: flex; align-items: center; justify-content: space-between; }
        .landing-logo { font-size: 16px; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; }
        .landing-nav-links { display: flex; align-items: center; gap: var(--space-lg); font-size: 14px; color: var(--text-secondary); }
        .landing-nav-links a:hover { color: var(--text-primary); }
        .landing-cta-btn { background: var(--accent-teal); color: #0B1220; padding: 7px 16px; border-radius: 6px; font-weight: 600; font-size: 13px; transition: opacity 0.15s; }
        .landing-cta-btn:hover { opacity: 0.9; }

        /* Hero */
        .hero { padding: 96px var(--space-xl) 80px; }
        .hero-inner { max-width: 780px; margin: 0 auto; text-align: center; }
        .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(34,184,167,0.1); color: var(--accent-teal); border: 1px solid rgba(34,184,167,0.25); padding: 5px 14px; border-radius: 20px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: var(--space-xl); }
        .hero-headline { font-size: clamp(36px, 5vw, 56px); font-weight: 700; line-height: 1.15; letter-spacing: -0.02em; margin-bottom: var(--space-lg); }
        .hero-headline-accent { color: var(--accent-teal); }
        .hero-sub { font-size: 18px; line-height: 1.7; color: var(--text-secondary); max-width: 600px; margin: 0 auto var(--space-2xl); }
        .hero-actions { display: flex; gap: var(--space-md); justify-content: center; flex-wrap: wrap; }

        /* Features */
        .features { padding: 80px var(--space-xl); background: var(--bg-surface); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
        .features-inner { max-width: 1100px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: var(--space-xl); }
        .feature-card { padding: var(--space-lg); }
        .feature-icon { font-size: 28px; margin-bottom: var(--space-md); }
        .feature-card h3 { font-size: 16px; font-weight: 600; margin-bottom: var(--space-sm); color: var(--text-primary); }
        .feature-card p { font-size: 14px; line-height: 1.65; color: var(--text-secondary); }

        /* Coverage */
        .coverage { padding: 80px var(--space-xl); }
        .coverage-inner { max-width: 800px; margin: 0 auto; text-align: center; }
        .coverage-inner h2 { font-size: 28px; font-weight: 700; margin-bottom: var(--space-xl); }
        .ticker-grid { display: flex; flex-wrap: wrap; gap: var(--space-sm); justify-content: center; margin-bottom: var(--space-lg); }
        .ticker-chip { background: var(--bg-elevated); border: 1px solid var(--border); padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; font-family: var(--font-ui); color: var(--text-secondary); letter-spacing: 0.03em; }
        .coverage-sub { font-size: 13px; color: var(--text-muted); }

        /* Final CTA */
        .final-cta { padding: 96px var(--space-xl); background: var(--bg-surface); border-top: 1px solid var(--border); }
        .final-cta-inner { max-width: 600px; margin: 0 auto; text-align: center; }
        .final-cta-inner h2 { font-size: 36px; font-weight: 700; margin-bottom: var(--space-md); letter-spacing: -0.02em; }
        .final-cta-inner p { font-size: 16px; color: var(--text-secondary); margin-bottom: var(--space-2xl); line-height: 1.65; }

        /* Footer */
        .landing-footer { border-top: 1px solid var(--border); padding: var(--space-xl); }
        .landing-footer-inner { max-width: 1100px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--text-muted); flex-wrap: wrap; gap: var(--space-md); }
        .footer-links { display: flex; gap: var(--space-lg); }
        .footer-links a:hover { color: var(--text-secondary); }
      `}</style>
    </div>
  )
}
