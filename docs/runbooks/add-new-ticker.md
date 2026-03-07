# Runbook: Add a New ASX Ticker

Use this runbook when adding a new stock to the **canonical** Continuum Intelligence coverage set. This is distinct from the in-session "+ Add Stock" UI flow, which is ephemeral (data persists only in localStorage and is not committed to git).

---

## Pre-flight

- Confirm the ticker is listed on the ASX and resolves on Yahoo Finance as `TICKER.AX`
- Confirm the company name and sector classification
- Run `git pull origin main` -- GitHub Actions commits to `_index.json` on every scheduled run
- Check `data/research/_index.json` to confirm the ticker is not already present

---

## Step 1 -- Call the scaffold endpoint

`POST /api/stocks/add` auto-detects company metadata from Yahoo Finance, builds the research scaffold, and writes all required files to Railway's ephemeral disk:

```bash
curl -X POST https://imaginative-vision-production-16cb.up.railway.app/api/stocks/add \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CI_API_KEY" \
  -d '{"ticker": "TICKER"}'
```

**Expected response (HTTP 200):**
```json
{
  "status": "added",
  "ticker": "TICKER",
  "company": "Company Name",
  "sector": "Sector",
  "industry": "Industry",
  "price": 1.23,
  "currency": "A$"
}
```

**If HTTP 400:** Yahoo Finance could not resolve `TICKER.AX`. Confirm the ticker is valid.
**If HTTP 409:** The ticker already exists in the research data.
**If HTTP 401:** `CI_API_KEY` is missing or wrong. Check the Railway environment variable.

---

## Step 2 -- Retrieve the generated research JSON

The API writes `data/research/TICKER.json` to Railway's disk. Pull it to your local working copy via the `/data/` serve endpoint:

```bash
curl https://imaginative-vision-production-16cb.up.railway.app/data/research/TICKER.json \
  > data/research/TICKER.json
```

Verify the file is valid JSON and contains the expected structure (top-level `ticker`, `company`, `hypotheses` array with four entries, `hero`, `evidence`, `narrative`).

**Note:** The generated scaffold is a starting point. Hypothesis base weights and narrative content will be placeholders. These should be reviewed and updated before the ticker is considered fully initiated.

---

## Step 3 -- Update `data/research/_index.json`

The API also updates `_index.json` on Railway's disk, but do not pull the whole file from Railway (it may have diverged from the local copy due to concurrent GitHub Actions commits). Add the entry manually:

```json
"TICKER": {
  "ticker": "TICKER",
  "tickerFull": "TICKER.AX",
  "company": "Company Name",
  "sector": "Sector",
  "sectorSub": "",
  "skew": "BALANCED",
  "date": "",
  "price": null
}
```

Do not add a `_indexOnly` flag -- `src/main.js` sets it at runtime.

---

## Step 4 -- Update `data/reference.json`

Add an entry with the fields you have. Leave unknown fields **absent** -- do not add null placeholders for analyst consensus fields (`analystTarget`, `analystBuys`, `analystHolds`, `analystSells`, `analystCount`, `epsTrailing`, `epsForward`, `divPerShare`):

```json
"TICKER": {
  "sharesOutstanding": 123456789,
  "reportingCurrency": "AUD",
  "_anchors": {
    "price": 1.23,
    "marketCap": 152000000
  }
}
```

Fill in additional fields (`revenue`, `revenueGrowth`, `ebitdaMargin`, etc.) where known from published financials.

---

## Step 5 -- Update `data/config/tickers.json`

Add an entry under `"tickers"`. The scaffold generates defaults; review `analysisConfig.baseWeights` before committing -- these drive the DNE hypothesis weighting for this stock.

**Owner to confirm:** The documented process for setting initial `baseWeights` per hypothesis has not been formalised. The scaffold provides equal-weight defaults. An analyst should set these before the ticker is visible in production.

Update `_updated` to today's date.

---

## Step 6 -- Update `data/freshness.json`

Add a minimal entry. The scaffold writes one to Railway's disk, but retrieving just the new entry (without overwriting existing entries) is not yet scripted.

**Owner to confirm:** Add a procedure here for extracting the single freshness entry from Railway or constructing it manually from the scaffold output.

---

## Step 6a -- Set deep research flag (if applicable)

If the new ticker has full deep research coverage, add `_deepResearch: true` to `data/research/TICKER.json`. Omit the field entirely for scaffold and stub tickers (absence is treated as false).

---

## Step 7 -- Commit and push

```bash
git add data/research/TICKER.json \
        data/research/_index.json \
        data/reference.json \
        data/config/tickers.json \
        data/freshness.json
git commit -m "feat(coverage): add TICKER to canonical coverage"
git push
```

Monitor the GitHub Actions deploy at https://github.com/marcjduncan-sys/continuum-intelligence-v3/actions.

---

## Step 8 -- Verify

1. After the deploy workflow completes, navigate to `#report-TICKER` on the live site and confirm the report page renders
2. Confirm the ticker appears in the Research home table
3. Trigger a manual refresh from the UI and confirm it completes (this validates the Railway pipeline can process the new ticker)
4. After the next scheduled `live-prices` workflow run, confirm the ticker appears in `data/live-prices.json`

---

## Notes

- **Railway disk is ephemeral.** Files written by `/api/stocks/add` on Railway are reset on the next Railway redeploy. Only git-committed files are authoritative.
- **Do not use `/api/refresh/TICKER` to scaffold new tickers.** That endpoint requires the research JSON to already exist; it returns 404 otherwise.
- **`REFERENCE_DATA` embedded in `index.html`** is a known defect covering fewer tickers than `_index.json`. It does not need to be updated when adding a new ticker.
- **GitHub Actions owns `_index.json` for existing entries.** Do not edit existing entries in that file from a stale local copy.
