// about.js – About page module

export function initAboutPage() {
  const container = document.getElementById('page-about');
  if (!container) return;

  container.innerHTML =
    '<div class="manifesto-hero">' +
      '<div class="mh-inner">' +
        '<div class="mh-eyebrow">Continuum Intelligence &middot; Est. 2025</div>' +
        '<h1 class="mh-title">The end of the<br><span>sell-side opinion.</span></h1>' +
        '<p class="mh-body">We built Continuum Intelligence because the institutional investment process was broken. Not incrementally broken &mdash; fundamentally broken. Forty-page PDFs. Backward-engineered price targets. Selective evidence. A single, brittle number dressed up as analysis. We replaced all of it with something better: evidence mapping.</p>' +
        '<div class="mh-stats">' +
          '<div class="mh-stat"><div class="mh-stat-v">147+</div><div class="mh-stat-k">Evidence Items per Stock</div></div>' +
          '<div class="mh-stat"><div class="mh-stat-v">4</div><div class="mh-stat-k">ACH Cases per Thesis</div></div>' +
          '<div class="mh-stat"><div class="mh-stat-v">EWP</div><div class="mh-stat-k">Evidence Weighted Price</div></div>' +
          '<div class="mh-stat"><div class="mh-stat-v">Top 1%</div><div class="mh-stat-k">Investor Audience</div></div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="about-body">' +

      '<div class="about-section">' +
        '<div class="as-eyebrow">The Problem</div>' +
        '<h2 class="as-title">Why the existing tools fail the best investors</h2>' +
        '<p class="as-body">The top 1% of institutional investors &mdash; portfolio managers running A$100M+ mandates, senior analysts at tier-one funds &mdash; have access to every terminal, every data feed, and every broker note. And yet, the core analytical process has not changed in 40 years. The sell-side produces a price target. The buy-side either agrees or disagrees. The evidence that drove the conclusion is buried in footnotes, if it appears at all.</p>' +
        '<p class="as-body">The result is a process that is <strong>opinion-heavy and evidence-light</strong>. Price targets are anchored to the analyst\'s prior view. Confidence intervals are invisible. The Bear Case is always a footnote, never a first-class hypothesis. And when the evidence changes, the price target rarely does &mdash; until it is too late.</p>' +
        '<p class="as-body">Continuum Intelligence was built to fix this. Not to add another data feed. Not to add another AI chatbot. To replace the analytical process itself.</p>' +
      '</div>' +

      '<div class="as-divider"></div>' +

      '<div class="about-section">' +
        '<div class="as-eyebrow">The Methodology</div>' +
        '<h2 class="as-title">Analysis of Competing Hypotheses &mdash; adapted for institutional investment</h2>' +
        '<p class="as-body">The ACH methodology was developed by the US intelligence community as a structured analytical technique for evaluating competing hypotheses against a body of evidence. We adapted it for institutional investment research. The result is a framework that forces the analyst to consider all four scenarios &mdash; not just the one they already believe &mdash; and to weight each one by the evidence, not by conviction.</p>' +
        '<div class="method-grid">' +
          '<div class="method-card"><div class="mc-number">01</div><div class="mc-title">Four Named Cases</div><div class="mc-body">Every stock thesis is structured around four competing hypotheses: the <strong>Bull Case</strong>, the <strong>Base Case</strong>, the <strong>Bear Case</strong>, and the <strong>Swing Case</strong>. Each case is a first-class hypothesis with its own price target, probability weight, and evidence mapping.</div></div>' +
          '<div class="method-card"><div class="mc-number">02</div><div class="mc-title">Evidence For / Evidence Against</div><div class="mc-body">Every piece of evidence &mdash; ASX announcements, macro data, quantitative signals, management commentary, industry news &mdash; is classified as supporting or contradicting each case. The balance of evidence across all four cases determines the probability weight assigned to each.</div></div>' +
          '<div class="method-card"><div class="mc-number">03</div><div class="mc-title">The Evidence Weighted Price</div><div class="mc-body">The EWP is the platform\'s core proprietary output. Calculated as the probability-weighted average of the four case price targets: <strong>EWP = (Bull &times; weight) + (Base &times; weight) + (Bear &times; weight) + (Swing &times; weight)</strong>. It updates dynamically as new evidence enters the system.</div></div>' +
          '<div class="method-card"><div class="mc-number">04</div><div class="mc-title">The EWP Gap</div><div class="mc-body">The gap between the live market price and the EWP is the platform\'s primary decision signal. A positive EWP gap indicates the evidence supports a higher price than the market is currently pricing. A negative EWP gap indicates the reverse.</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="as-divider"></div>' +

      '<div class="about-section">' +
        '<div class="as-eyebrow">Design Principles</div>' +
        '<h2 class="as-title">What we believe about how the best investors work</h2>' +
        '<div class="principle-list">' +
          '<div class="principle-item"><div class="pi-icon">&#9878;</div><div><div class="pi-title">Evidence over opinion</div><div class="pi-body">Every output on the platform is derived from evidence, not from the analyst\'s prior view. The EWP is calculated from the evidence balance, not from a DCF model built backward from a conclusion. If the evidence changes, the EWP changes. Automatically.</div></div></div>' +
          '<div class="principle-item"><div class="pi-icon">&#128269;</div><div><div class="pi-title">Transparency over black boxes</div><div class="pi-body">The EWP derivation is fully auditable. Every case weight, every price target, every evidence item is visible. There are no hidden models. The evidence-to-price chain is transparent by design.</div></div></div>' +
          '<div class="principle-item"><div class="pi-icon">&#9889;</div><div><div class="pi-title">Speed over comprehensiveness</div><div class="pi-body">The Home page is designed to answer "what needs my attention?" in under 5 seconds. The Research page answers "what is the evidence gap?" in under 30 seconds. Information density is a feature, not a bug.</div></div></div>' +
          '<div class="principle-item"><div class="pi-icon">&#129309;</div><div><div class="pi-title">Intelligence that compounds</div><div class="pi-body">The AI agents &mdash; Analyst, Portfolio Manager, Strategist &mdash; are not chatbots. They are specialised intelligence agents that understand the ACH framework, the evidence dossier, and the portfolio context. Every response is grounded in evidence and cited back to the specific data point.</div></div></div>' +
        '</div>' +
      '</div>' +

      '<div class="as-divider"></div>' +

      '<div class="about-section">' +
        '<div class="as-eyebrow">Competitive Differentiation</div>' +
        '<h2 class="as-title">Why Continuum is different from every other platform</h2>' +
        '<table class="diff-table">' +
          '<thead><tr><th>Capability</th><th>Continuum Intelligence</th><th>Bloomberg / Refinitiv</th><th>Traditional Sell-Side</th></tr></thead>' +
          '<tbody>' +
            '<tr><td class="diff-label">Evidence-weighted price output</td><td class="diff-check">&#10003; EWP &mdash; core output</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Not available</td></tr>' +
            '<tr><td class="diff-label">Four ACH case structure</td><td class="diff-check">&#10003; Bull / Base / Bear / Swing</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Footnote at best</td></tr>' +
            '<tr><td class="diff-label">Evidence for / against mapping</td><td class="diff-check">&#10003; Per case, per domain</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Selective at best</td></tr>' +
            '<tr><td class="diff-label">Real-time EWP updates</td><td class="diff-check">&#10003; Dynamic on new evidence</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Quarterly at best</td></tr>' +
            '<tr><td class="diff-label">Specialised AI agents (3 roles)</td><td class="diff-check">&#10003; Analyst / PM / Strategist</td><td class="diff-cross">&#10007; Generic AI only</td><td class="diff-cross">&#10007; Not available</td></tr>' +
            '<tr><td class="diff-label">Portfolio EWP gap dashboard</td><td class="diff-check">&#10003; Full portfolio view</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Not available</td></tr>' +
            '<tr><td class="diff-label">Auditable price derivation</td><td class="diff-check">&#10003; Full arithmetic visible</td><td class="diff-cross">&#10007; Not available</td><td class="diff-cross">&#10007; Model hidden</td></tr>' +
          '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="as-divider"></div>' +

      '<div class="about-section">' +
        '<div class="as-eyebrow">The Team</div>' +
        '<h2 class="as-title">Built by investors, for investors</h2>' +
        '<div class="team-grid">' +
          '<div class="team-card"><div class="tc-avatar">MR</div><div class="tc-name">Michael Reid</div><div class="tc-role">Co-Founder &amp; CEO</div><div class="tc-bio">Former Portfolio Manager at a top-tier Australian long/short equity fund. 18 years in institutional investment. Architect of the ACH investment framework.</div></div>' +
          '<div class="team-card"><div class="tc-avatar">SK</div><div class="tc-name">Sarah Kim</div><div class="tc-role">Co-Founder &amp; CTO</div><div class="tc-bio">Former engineering lead at a major financial data platform. Expert in real-time evidence ingestion, NLP classification, and institutional-grade data architecture.</div></div>' +
          '<div class="team-card"><div class="tc-avatar">JT</div><div class="tc-name">James Thornton</div><div class="tc-role">Head of Research</div><div class="tc-bio">Former senior analyst at a bulge-bracket investment bank. Specialist in the ACH methodology and its application to equity research. Oversees the evidence classification framework.</div></div>' +
        '</div>' +
      '</div>' +

      '<div class="cta-block">' +
        '<div class="cta-title">Ready to replace the sell-side opinion?</div>' +
        '<div class="cta-sub">Continuum Intelligence is available to institutional investors by application. Top 1% only.</div>' +
        '<div class="cta-actions">' +
          '<button class="cta-btn primary">Request Access</button>' +
          '<button class="cta-btn">View the Platform</button>' +
        '</div>' +
      '</div>' +

    '</div>';
}
