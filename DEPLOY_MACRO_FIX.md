# URGENT: Deploy Corrected Macro Factors

**Priority:** IMMEDIATE. Every stock page is showing wrong RBA data. This affects macro signals, sector signals, and all downstream calculations.

## What Is Wrong

The platform currently shows:
```
RBA 4.10% (cutting gradually)
```

The actual position as of 3 February 2026:
```
RBA 3.85% (hiking)
```

The RBA hiked +25bps from 3.60% to 3.85% on 3 February 2026, citing persistent inflation that "picked up materially in the second half of 2025." Markets are pricing a 77% chance of another hike in May to 4.10%. This is the OPPOSITE of the "cutting gradually" shown on every stock page.

This error affects:
- Macro signal for ALL stocks (RBA component swings from +4 to -8, net -12 points)
- Sector signals for banks (CBA, NAB) and property (GMG) which use rate cycle as primary factor
- Narrative summaries referencing rate environment
- Forecast agent outputs that used stale RBA data
- Any display text showing "4.10%" or "cutting gradually"

## Step 1: Replace macro-factors.json

Copy the contents of `macro-factors-CORRECTED.json` (provided alongside this document) into `data/macro-factors.json` in the repo. This file contains:

- RBA: 3.85%, hiking, with full rate history 2025-2026
- ASX 200: 9,026 as of 23 Feb close (was showing 9,101)
- AUD/USD: 0.7098 (was showing 0.7066)
- VIX: 19.09 (was showing 19.6)
- Macro Signal: +4 NEUTRAL (was +16 POSITIVE)
- ASX 200 12-month return: +6.86% (SINGLE VALUE for all stocks)
- Sector impact notes for banks, property, consumer, resources, tech
- US tariff status: 15% global tariff imposed 22 Feb

## Step 2: Find and Replace ALL Instances of Stale RBA Data

Search the ENTIRE codebase for:
- `4.10%` in the context of RBA/cash rate → replace with `3.85%`
- `cutting gradually` → replace with `hiking`
- `cutting` in the context of RBA direction → replace with `hiking`
- Any hardcoded RBA rate display text

Specifically check:
- All stock JSON files (`data/stocks/*.json`) for hardcoded RBA references
- All HTML template files for hardcoded "4.10%" or "cutting gradually"
- The market context bar rendering code
- The narrative summary generation templates
- Any sector signal calculation code that references RBA direction

## Step 3: Recalculate Macro Signal for All Stocks

The macro signal calculation changes:

**OLD (wrong):**
```
ASX200 +3.2% 1mo = +8
VIX 19.6 = 0
AUD +4.6% = 0
RBA cutting gradually = +4
China PMI 50.5 = +4
Macro Signal = +16 (POSITIVE)
```

**NEW (correct):**
```
ASX200 +0.88% 1mo = 0  (change: was +3.2%, now +0.88% which is within -3 to +3% band)
VIX 19.09 = 0
AUD +4.80% = 0
RBA hiking = -8  (change: was +4, now -8)
China PMI 50.5 = +4
Macro Signal = -4 (NEUTRAL, bordering NEGATIVE)
```

Wait - let me recalculate with the correct bands from ERRATA_001:
- ASX200 1mo change: The index was ~8,947 a month ago (late Jan), now 9,026. That's roughly +0.88%. Band: -3% to +3% = 0
- VIX 19.09: Band 18-25 = 0
- AUD 1mo change: +4.80%. Band: -5% to +5% = 0
- RBA hiking: Band = -8
- China PMI 50.5: Band 50-52 = +4

**Macro Signal = 0 + 0 + 0 + (-8) + 4 = -4**
**Macro Signal Label: NEUTRAL** (within -8 to +8 range)

This is a massive shift from +16 (POSITIVE) to -4 (NEUTRAL). The green POSITIVE badge on every stock page needs to become an amber NEUTRAL badge.

## Step 4: Update Market Context Bar Display

Every stock page shows:
```
MARKET CONTEXT  MACRO +12  ASX200 9,101 +3.2% 1mo  AUD/USD 0.7066 +4.6%  VIX 19.6  RBA 4.10% (cutting gradually)
```

Must change to:
```
MARKET CONTEXT  [NEUTRAL badge]  ASX200 9,026 +0.88% 1mo  AUD/USD 0.7098 +4.80%  VIX 19.09  RBA 3.85% (hiking)
```

Per BUGFIX_001, the macro context bar should show a qualitative badge (NEUTRAL in amber), not the numeric signal value. If the numeric display is still there, replace it with the badge.

## Step 5: Recalculate Sector Signals for Rate-Sensitive Stocks

The following stocks have rate cycle as a primary or significant sector factor:

**Banks (CBA, NAB):** Rate hiking is mixed for banks - positive for net interest margins, negative for credit growth. The sector signal calculation should reflect "hiking" not "cutting gradually". Check the sector model for BANKING_RATE_CYCLE in ASX200_SECTOR_NARRATIVE_MODELS.md.

**Property/REITs (GMG):** Rate hiking is unambiguously negative for REITs - compresses valuations, raises discount rates, slows housing activity. Sector signal should swing bearish.

**Consumer discretionary:** Rate hiking reduces disposable income. Sector signal should be more negative than it currently shows.

## Step 6: Fix Benchmark Return for Relative Performance Tables

Per BUGFIX_003: The ASX 200 12-month benchmark return must be the SAME number on every stock page. Currently it shows +4.2% for BHP and -2.3% for DRO. The correct value is +6.86% (from Trading Economics as of 23 Feb 2026).

The benchmark return comes from `macro-factors.json` → `benchmark_returns.asx200_12m`. Every stock page reads this single value. Do NOT calculate it per-stock from different start dates.

## Step 7: Commit and Push to Both Repos

```bash
# In the website repo (the one that deploys to GitHub Pages)
cd C:\Users\User\continuum-website
git add data/macro-factors.json
git add -A  # catch any other files that reference RBA data
git commit -m "URGENT: Fix stale RBA data - rate is 3.85% hiking, not 4.10% cutting. Recalculate all macro signals."
git push origin main

# If there is a second repo (continuum-platform)
cd C:\Users\User\continuum-platform
git add data/macro-factors.json
git add -A
git commit -m "URGENT: Fix stale RBA data - rate is 3.85% hiking, not 4.10% cutting. Recalculate all macro signals."
git push origin main
```

## Verification

After deployment:

- [ ] Every stock page shows "RBA 3.85% (hiking)" not "RBA 4.10% (cutting gradually)"
- [ ] Market context badge shows NEUTRAL (amber) not POSITIVE (green)
- [ ] ASX 200 level shows 9,026 not 9,101
- [ ] AUD/USD shows 0.7098 not 0.7066
- [ ] VIX shows 19.09 not 19.6
- [ ] BHP Relative Performance table shows ASX 200 12m return = +6.86%
- [ ] DRO Relative Performance table shows ASX 200 12m return = +6.86% (same number as BHP)
- [ ] CBA and NAB sector signals have been recalculated for hiking environment
- [ ] No instance of "cutting gradually" exists anywhere in the codebase
- [ ] No instance of "4.10%" in RBA context exists anywhere in the codebase

## Do Not Proceed Until

All verification items pass. This is the single most impactful data error on the platform - it cascades into every stock's macro signal, every rate-sensitive stock's sector signal, and every narrative summary that references the rate environment.
