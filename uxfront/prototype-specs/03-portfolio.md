# Prototype Spec: 03-portfolio.html (Portfolio Intelligence)

## Capability Strip
- Platform: Research, Deep Research, Portfolio Intelligence (active), Thesis Comparator, PM Dashboard
- Integrations: Risk Engine, Execution (no Bloomberg Terminal on this page)

## Content Layout
- `.workstation` grid: `minmax(0,1fr) 520px`

## Portfolio Hero (dark gradient)
- `background: linear-gradient(160deg,#1a3958,#0f2438)`
- Border-radius 18px, padding 22px
- Title "Portfolio EWP Dashboard", sub "Alpha Fund I"
- Action buttons: Export, Add Position (light style)
- 5-col stats: Portfolio Market Value, Portfolio EWP Value (green), Aggregate EWP Gap (green), Upside Positions, Avg Confidence

## Holdings Table
- Section eyebrow "Holdings · 14 Positions", title "Portfolio -- EWP View"
- Cols: Stock, Weight (with bar), Mkt Value, Live Price, EWP, EWP Gap, Verdict, Confidence, actions
- 14 rows

## Portfolio Composition
- 2-col allocation cards: By EWP Verdict, By Sector

## Chat Panel (Right Column) -- PM Tab Active
- Eyebrow "AI Portfolio Intelligence"
- Title "Portfolio Manager", context tag "Alpha Fund I · A$284.6M" (amber)
- Sub: "EWP-driven portfolio construction..."
- Tabs: Analyst, PM (active), Strategist
- Context bar: Full Portfolio, Upside, Downside, Mining, Banking chips
- Message stream with PM analysis
- Suggestions: iron ore sensitivity, EWP gap per risk, cash allocation
- Composer

## Chat Panel Note
- PRESENT on this page (not yet in live app)
