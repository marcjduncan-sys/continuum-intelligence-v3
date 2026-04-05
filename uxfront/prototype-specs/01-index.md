# Prototype Spec: 01-index.html (Home / Research)

## Topbar
- Height: 52px, sticky, white/97% opacity
- Logo: 26x26px blue gradient mark "CI", "Continuum Intelligence" 13px font-weight:800
- Search: max-width 560px, ⌘K kbd hint
- Actions: bell icon, Portfolio btn, Comparator btn, "PM Dashboard" primary btn

## Capability Strip
- Section label "PLATFORM" (9px uppercase)
- Chips: Research (active), Deep Research, Portfolio Intelligence, Thesis Comparator, PM Dashboard
- Divider (1px)
- Section label "INTEGRATIONS"
- Chips: Bloomberg Terminal (live/green dot), Risk Engine (soon/amber), Team Chat (soon), Execution (soon), News Feed (soon)

## Market Bar
- Height: 32px, white background
- ASX CLOSED status dot (red), label, next open text
- Market indices: XJO, XMJ, XHJ, XFJ with value and % change
- Timestamp, REFRESH button

## Content Layout
- `.workstation` grid: `minmax(0,1fr) 360px` with 14px gap
- Left: `content-col` with: platform-header card, featured reports section, coverage table section, announcements section
- Right: `right-rail` sticky with: Alerts & Signals card, Conviction Snapshot card, Watchlist card

## Platform Header Card
- White surface, border, 16px radius, shadow
- Top row: 42px CI mark, "Continuum Intelligence" 17px, "Independent Cross-Domain..." subtitle, badge strip
- Badges: "ACH Methodology" (blue), "EWP Framework" (blue), "Institutional Grade", "No Conflicts"
- 5-col ribbon: Coverage, High Conviction (dark cell), Upside Skew (green), Downside Skew (red), Last Refresh

## Featured Reports Section
- Eyebrow "Latest Research", title "Featured Reports"
- 2-col card grid (`.cards-grid`)
- 6 cards: BHP, CSL, MQG, XRO, GMG, WOW
- Card: ticker badge (gradient), verdict tag, name/sector, bluf text, skew badge, price/change

## Coverage Table
- Eyebrow "Coverage Universe", title "All Covered Stocks"
- Columns: Stock, Sector, Price, 1D, Verdict, Thesis Skew, Confidence (bar), Updated, Actions
- Footer: "View all 21 stocks" link + Sort buttons

## Announcements Section
- Eyebrow "Market Intelligence", title "Latest ASX Announcements"
- 5 items: BHP, CSL, GMG, WOW, XRO

## Right Rail
- Alerts & Signals (5 items)
- High Conviction Skews (7 items: GMG, CSL, XRO, FMG, BHP, WOW, PME)
- Watchlist (5 items: BHP, CSL, GMG, FMG, XRO)

## Footer
- 4-col: brand+tagline, Platform links, Analytics links, Company links
- Disclaimer text, copyright

## Chat Panel
- ABSENT on this page
