# Project Memory - Continuum Intelligence v2

## Project Overview
Continuum Intelligence is an institutional-grade equity research platform focusing on Narrative Intelligence and the Analysis of Competing Hypotheses (ACH).

## Core Capabilities
- **Investor Briefing PDF Generator**: `scripts/generate-investor-briefing.py`
    - High-density, 6-page institutional reports.
    - Robust logic for "sparse stocks" (synthesis of milestones, diagnostic frameworks, and macro regimes).
    - Direct linking from UI: `public/reports/{TICKER}-investor-briefing.pdf`.
- **Web UI**: `index.html` (Main Dashboard), `stock.html` (Stock Detail).
    - Real-time signal tracking and narrative weighting.

## Commands
- **PDF Generation**:
    - Single Stock: `python scripts/generate-investor-briefing.py WOW`
    - All Stocks: `python scripts/generate-investor-briefing.py --all`
- **Frontend Development**: Static HTML/JS. No build step required for core UI.

## Coding Patterns
- **PDF Densification**: Never leave large blank areas. If `evidence_items` or `financials` are missing, use synthesis helpers in `generate-investor-briefing.py` to fill the page with qualitative methodology or research agendas.
- **UI Interaction**: Use direct navigation for file downloads to avoid popup blockers.
- **Data Model**: Data is stored in `data/stocks/` as JSON. The Phase 2 model prioritizes `weighted_inconsistency` (lower is stronger) and dominant narrative identification.

## Recent Milestone
- Fixed "Investor Briefing" button popup blocking by implementing direct static PDF linking.
- Implemented "Infinite Density" strategy for PDFs (6-page guaranteed institutional quality).
