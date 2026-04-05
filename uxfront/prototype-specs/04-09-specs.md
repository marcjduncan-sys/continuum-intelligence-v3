# Prototype Specs: 04-09

## 04-comparator.html (Thesis Comparator)
- Cap strip: Research, Deep Research, Portfolio Intelligence, Thesis Comparator (active), PM Dashboard | Bloomberg Terminal, Risk Engine
- Layout: Single-col `.page-body` (max-width 1600px) with comp grid + insight grid + chat workstation
- Comparator header: stock selector pills (BHP, CSL, MQG, XRO) + add button
- Comparison grid: 5 cols (label + 4 stocks), rows for Verdict, EWP Gap, Case Weights, Domain Scores
- 3-col insight grid: Pattern Recognition, Cross-Factor Analysis, Portfolio Signal
- Chat panel: 2-col `.comp-workstation`, Analyst tab active (blue)

## 05-deep-research.html (Deep Research -- BHP specific page)
- Cap strip: Research, Deep Research (active), Portfolio Intelligence, Thesis Comparator, Analyst Chat, PM Dashboard | Bloomberg Terminal, Risk Engine, News Feed
- Subnav: same as report (Overview, ACH Cases, Evidence, Domains, Risks, Catalysts)
- Dark hero: `background: linear-gradient(160deg,#1a3958,#0f2438)` -- "Deep Research · BHP Group" badge, title, sub
- Progress tracker: 5 steps (Corpus Injection, ACH Analysis, Evidence Weighting, Risk Assessment, Synthesis)
- Content: essentially same as report page sections but with more detailed evidence focus
- Chat panel: Analyst tab active

## 06-pm-dashboard.html (PM Dashboard)
- Cap strip: Research, Portfolio Intelligence, Thesis Comparator, PM Dashboard (active) | Risk Engine, Execution
- Dark hero: `background: linear-gradient(160deg,#1a3958,#0f2438)` with 4-col KPI grid
  - KPIs: Portfolio AUM (amber), Positions, Conviction Actions, Risk Alerts (red)
- Content sections: PM Alerts (critical/warning/info cards), Decision Log
- Watchlist mini: 3-col grid with ticker/price/EWP gap
- Chat panel: Analyst tab active (blue context tag)

## 07-journal.html (Analyst Journal)
- Cap strip: Research, Deep Research, Portfolio Intelligence, Analyst Journal (active), PM Dashboard
  (Note: "Analyst Journal" replaces "Thesis Comparator" in this prototype's strip)
- Layout: 2-col workstation (content + chat panel)
- Journal list: expandable entries with ticker, category tags, body text
- New entry composer
- Chat panel: Analyst tab active

## 08-personalisation.html (Settings / Personalisation)
- **NO capability strip** shown in this prototype
- Single-col page body (max-width 1100px)
- Page header: eyebrow, 26px title "Personalisation Settings", subtitle
- 2-col settings layout: 220px sticky nav + content
- Nav: Research Profile, Display, Data Sources, Notifications, API Access sections
- Settings sections with form rows (toggles, selects, text inputs)
- No chat panel

## 09-about.html (About)
- **NO capability strip** shown in this prototype
- Full-width `manifesto-hero` (dark blue gradient, text-centered)
- Page body (max-width 1000px) with sections
- Sections: Methodology, Analytical Framework, 10 Evidence Domains, Principles, Differentiation Table, Coverage Universe
- No chat panel
