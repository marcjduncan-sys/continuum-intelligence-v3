# Project Memory - Continuum Intelligence v2

## Project Overview
Continuum Intelligence is an institutional-grade equity research platform for ASX-listed equities. It uses Narrative Intelligence and the Analysis of Competing Hypotheses (ACH) to generate research that targets the top 1% of Goldman Sachs analyst quality. The platform explicitly does NOT set price targets.

## Architecture
- **Single-page app**: `index.html` (~16,000 lines) contains all UI, CSS, data, and JS for the main dashboard
- **Stock detail**: `stock.html` for individual stock deep-dives
- **Static data**: `data/stocks/` and `data/research/` store JSON per ticker
- **REFERENCE_DATA**: Hardcoded anchor data (shares outstanding, EPS, analyst consensus fields) in `index.html` starting ~line 9850. The `analystTarget` fields are retained but NOT rendered anywhere
- **ContinuumDynamics engine**: ~line 13923 in `index.html`. Computes derived metrics from live price + REFERENCE_DATA, hydrates STOCK_DATA so rendered text stays current
- **COVERAGE_DATA**: Built from STOCK_DATA at page load (~line 13883). Used by portfolio module. Now reads `_livePrice` fallback for current pricing
- **Live data**: `LiveData` module fetches market data, patches `STOCK_DATA[ticker]._livePrice`, triggers `ContinuumDynamics.onPriceUpdate()`
- **PDF generator**: `scripts/generate-investor-briefing.py` (6-page institutional reports)
- **Content refresh**: `scripts/refresh-content.js` (Claude API calls for narrative generation)
- **No build step**: Static HTML/JS, no bundler

## Key Design Decisions
- **No analyst price targets displayed**: Platform position is "We do not set price targets." All rendering of analyst targets removed (commit 7a0669c). REFERENCE_DATA retains the fields for potential future evidence domain scoring only.
- **Goldman-quality prose**: System prompts enforce Australian English, ban LLM verbal tics ("delve", "leverage", "notably", "landscape", "robust", "bolster", "underscores"), prohibit em-dashes, require quantified claims with dates/numbers/catalysts in every sentence. Boilerplate detection rejects generic what_to_watch fields.
- **10 evidence domains in Section 04**: All 10 domains (including Leadership/Governance #9 and Ownership/Capital Flows #10) render within Section 04: Primary Evidence Domains. They are NOT separate sections.
- **8 total sections**: 01-Dashboard, 02-Hypotheses, 03-Narratives, 04-Evidence Domains, 05-Discriminators, 06-Tripwires, 07-Gaps, 08-Technical
- **Short positions supported**: Portfolio module handles negative units as shorts. Alignment logic accounts for position direction (short + downside skew = aligned). PnL calculated correctly for both directions.

## Commands
- **PDF Generation**:
    - Single Stock: `python scripts/generate-investor-briefing.py WOW`
    - All Stocks: `python scripts/generate-investor-briefing.py --all`
- **Frontend Development**: Static HTML/JS. No build step required.

## Coding Patterns
- **PDF densification**: Never leave large blank areas. Use synthesis helpers for sparse stocks.
- **UI interaction**: Direct navigation for file downloads (avoids popup blockers).
- **Data model**: JSON in `data/stocks/`. Phase 2 model prioritises `weighted_inconsistency` (lower is stronger) and dominant narrative identification.
- **Prose sanitisation**: `sanitiseProse()` in both JS and Python strips HTML, em-dashes (to semicolons), en-dashes (to commas), markdown formatting, bullet points.
- **Boilerplate rejection**: `validateNarrativeQuality()` in refresh-content.js rejects generic what_to_watch and narrative text before applying to stock data.

## Git
- **Remote**: `https://github.com/marcjduncan-sys/continuum-intelligence-v2.git`
- **Branch**: `main`
- **Push from user's Windows machine**: `cd C:\Users\User\continuum-intelligence-v2 && git push origin main` (VM cannot authenticate to GitHub via HTTPS)

## Recent Commits (newest first)
- `df978a9` fix(portfolio): live pricing and short position alignment
- `7a0669c` fix(ui): remove analyst price targets from all rendering surfaces
- `23a8272` fix(ui): merge all 10 evidence domains into Section 04, renumber sections
- `d95ad25` feat(prose): institutional-quality narrative with Australian English, boilerplate rejection, and sanitisation
- `e86de4f` feat(engine): upgrade scoring engine to institutional calibre
