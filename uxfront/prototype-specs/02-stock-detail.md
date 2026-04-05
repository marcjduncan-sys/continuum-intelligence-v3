# Prototype Spec: 02-stock-detail.html (Stock Detail / Report)

## Topbar
- Same as home but with context breadcrumb: "Module: BHP Group · Back to Research"

## Capability Strip
- Platform: Research, Deep Research, Portfolio Intelligence, Thesis Comparator, Analyst Chat, PM Dashboard
- Integrations: Bloomberg Terminal, Risk Engine, Team Chat, Execution, News Feed
- "Analyst Chat" chip shown as active on report page

## Subnav (3rd sticky row)
- Items: Overview, ACH Cases, Evidence, Domains, Risks, Catalysts
- Active: Overview
- Right side: refresh/updated info

## Content Layout
- `.workstation` grid: `minmax(0,1fr) 520px` with 16px gap
- Left: content-col with sections
- Right: inline `.chat-panel` (520px)

## Decision Ribbon (Hero)
- 52x52 badge, company name (22px), meta (sector, exchange, market cap)
- Verdict tag (UPSIDE green), live price + change
- EWP Strip (4-col grid): Bull price, Base price, Bear price, EWP Gap
- EWP methodology footnote
- 5-col stats row: P/E, Div Yield, Revenue Growth, EBITDA Margin, Market Cap

## ACH Cases Section
- Title "Hypotheses · Analysis of Competing Hypotheses"
- 4 cards: Bull (green tint), Base (blue tint), Bear (red tint), Swing (violet tint)
- Each card: icon, label, title, bluf | price target + probability weight
- Evidence grid (2-col): Evidence For / Evidence Against
- EWP contribution bar

## EWP Derivation
- Dark header: "Evidence Weighted Price -- Derivation", A$61.20 value
- 4-col: Bull, Base, Bear, Swing case contributions
- Formula footnote

## Evidence Domains
- 10 domain cards in 2-col grid
- Domain name, score, bar, summary

## Risk Register
- 5 risk items: Critical/High/Medium/Low/Low
- Risk icon (coloured), label, body, badge

## Catalyst Calendar
- Table: Date, Event, ACH Case, EWP Impact, Probability

## Chat Panel (Right Column, 520px)
- Eyebrow "AI Research Intelligence"
- Title "Research Analyst", context tag "BHP -- EWP A$61.20"
- Sub: "Evidence-grounded analysis..."
- Tabs: Analyst (active, blue), PM (amber), Strategist (violet)
- Context bar: BHP, Iron Ore, China, Copper chips
- Message stream (Analyst messages + citations)
- Suggestion chips
- Composer with textarea + send button

## Chat Panel Note
- PRESENT on report pages (this is the page where it appears)
- Background: white/light surface
- NOT the legacy dark `.analyst-panel` overlay
