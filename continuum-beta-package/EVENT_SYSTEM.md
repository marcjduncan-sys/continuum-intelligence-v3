# Continuum Event-Reactive System

This document describes the automated event detection and narrative update system for Continuum Intelligence.

## Overview

The system transforms Continuum from a **price-reactive** research platform to an **event-reactive** platform by:

1. **Scraping** market data and ASX announcements twice daily
2. **Classifying** events by type and severity
3. **Generating** narrative updates automatically
4. **Deploying** updated research to the website

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Yahoo Finance  │────▶│  Price Scraper  │────▶│   Price Data    │
│   (Delayed)     │     │                 │     │   (JSON)        │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                         │
┌─────────────────┐     ┌─────────────────┐              │
│  ASX Announce   │────▶│  Event Scraper  │──────────────┘
│    (RSS/API)    │     │                 │
└─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │ Event Classifier│
                        │  - Earnings     │
                        │  - Management   │
                        │  - M&A          │
                        │  - Macro        │
                        │  - Analyst      │
                        │  - Regulatory   │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   Narrative     │
                        │   Generator     │
                        │  (Templates)    │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │   HTML Updater  │
                        │   (index.html)  │
                        └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  GitHub Pages   │
                        │    Deploy       │
                        └─────────────────┘
```

## Schedule

The system runs **twice daily**:

| Time (AEDT) | Time (UTC) | Purpose |
|-------------|------------|---------|
| 12:30 PM | 1:30 AM | Midday market update |
| 6:30 PM | 7:30 AM | After-market close, full refresh |

Manual triggers available via GitHub Actions "Run workflow".

## Event Classification

### Priority Order

1. **Earnings** - Quarterly/annual results, guidance changes
2. **Management** - CEO/CFO changes, board appointments
3. **M&A** - Acquisitions, divestments, capital raisings
4. **Macro** - RBA rates, commodity prices, economic data
5. **Analyst** - Upgrades, downgrades, target changes
6. **Regulatory** - ACCC actions, ASIC investigations, fines

### Severity Levels

| Level | Criteria | Action |
|-------|----------|--------|
| **HIGH** | CEO change, profit warning, major acquisition, regulatory fine >$50M | Immediate narrative update + notification |
| **MEDIUM** | Earnings miss/beat, guidance change, analyst downgrade | Queue for next update cycle |
| **LOW** | Routine announcements, minor board changes | Log only, no immediate action |

## What Updates Automatically

### Price-Dependent (Every Run)
- ✅ Current share price
- ✅ Market cap (recomputed)
- ✅ P/E ratios (recomputed)
- ✅ Drawdown % vs 52-week high
- ✅ Price change %
- ✅ 52-week range
- ✅ Volume

### Event-Dependent (When Detected)
- ✅ Freshness status (OK/MODERATE/HIGH/CRITICAL)
- ✅ Urgency score (0-100)
- ✅ Verdict text addendums
- ✅ Evidence card updates
- ✅ Hypothesis score adjustments
- ✅ Catalyst/tripwire dates

### What Still Requires Manual Intervention
- ❌ Deep qualitative analysis (new thesis development)
- ❌ New stock coverage addition
- ❌ Methodology changes
- ❌ Major structural rewrites

## Data Files

```
data/
├── latest-prices.json          # Current market data
├── events/
│   ├── events-2026-02-12.json  # Daily event log
│   └── events-2026-02-11.json
├── events-log.json             # Rolling 30-day event history
├── pending-updates.json        # Queued narrative updates
└── last-update-report.json     # Summary of last run
```

## Scripts

| Script | Purpose | Trigger |
|--------|---------|---------|
| `event-scraper.js` | Fetch prices & announcements | GitHub Actions (2x daily) |
| `narrative-generator.js` | Generate text updates | After scraper completes |
| `update-html.js` | Apply updates to index.html | When narratives ready |

## Freshness Monitoring

The system calculates an **urgency score** (0-100) based on:

- Days since last review
- Price dislocation from last review
- Pending catalyst proximity
- Unprocessed high-impact events

**Badges:**
- 🟢 **OK** - Urgency 0-15
- 🟡 **MODERATE** - Urgency 16-35
- 🟠 **HIGH** - Urgency 36-60
- 🔴 **CRITICAL** - Urgency 61-100

## Notifications

High-impact events trigger:
1. GitHub Issue creation (with event details)
2. Update to `pending-updates.json`
3. Next-run HTML regeneration

## Coverage Universe

Currently monitoring 12 ASX stocks:
- WOW, XRO, WTC, DRO, PME, GYG
- CSL, MQG, GMG, WDS, SIG, FMG

## Cost

This system uses **free data sources**:
- Yahoo Finance API (delayed 15-20 min)
- ASX RSS feeds (public)
- GitHub Actions (free tier: 2,000 min/month)

**Estimated usage:** ~100 min/month (well within free tier)

## Future Enhancements

### Phase 2 (Next)
- [ ] LLM-powered narrative generation (Claude API)
- [ ] Broker research RSS aggregation
- [ ] Email alerts for high-impact events
- [ ] Historical event impact analysis

### Phase 3
- [ ] Real-time WebSocket price feeds
- [ ] User watchlists with custom alerts
- [ ] PDF report auto-generation
- [ ] API endpoint for external access

## Troubleshooting

### Workflow Failures

Check GitHub Actions logs for:
- Rate limiting (add delays between requests)
- RSS feed changes (update parser)
- JSON parsing errors (validate data structure)

### Missing Events

If announcements aren't detected:
1. Verify ticker symbols match ASX codes
2. Check RSS feed is accessible
3. Review `events-log.json` for parsing errors

### Stale Data

If prices aren't updating:
1. Check Yahoo Finance API accessibility
2. Verify `latest-prices.json` is being written
3. Check GitHub Actions schedule is active

## Maintenance

### Monthly
- Review event classification accuracy
- Update keyword patterns for new event types
- Check data file sizes (rotate if >10MB)

### Quarterly
- Review coverage universe (add/remove tickers)
- Update narrative templates based on feedback
- Assess LLM integration readiness

## Contact

For issues or enhancement requests:
- Create a GitHub Issue
- Tag with `event-system` label

---

**Last Updated:** 2026-02-12  
**System Version:** 1.0.0
