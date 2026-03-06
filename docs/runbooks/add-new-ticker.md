# Runbook: Add a New ASX Ticker

Use this runbook when adding a new stock to Continuum Intelligence coverage.

---

## Pre-flight

- Confirm the ticker is listed on the ASX and has a Yahoo Finance listing as `TICKER.AX`
- Confirm the company name and sector classification
- Decide the sector sub-classification (`sectorSub`) if applicable

---

## Step 1 — Add to `_index.json`

Add a summary entry to `data/research/_index.json`. This is the canonical stock list loaded at boot.

```json
"TICKER": {
  "ticker": "TICKER",
  "tickerFull": "TICKER.AX",
  "company": "Company Name",
  "sector": "Sector",
  "sectorSub": "Sub-sector or empty string",
  "skew": "BALANCED",
  "date": "",
  "price": null
}
```

Do not add a `_indexOnly` flag -- `src/main.js` sets that at runtime.

---

## Step 2 — Add to `data/reference.json`

Add a reference entry for fundamental data lookups:

```json
"TICKER": {
  "ticker": "TICKER",
  "tickerFull": "TICKER.AX",
  "company": "Company Name",
  "sector": "Sector",
  "analystTarget": null,
  "sharesOutstanding": null
}
```

Fill in `analystTarget` and `sharesOutstanding` if known. Leave as `null` otherwise -- `ContinuumDynamics` will handle missing values gracefully.

---

## Step 3 — Create the research scaffold

Trigger a scaffold build via the Railway API:

```bash
curl -X POST https://imaginative-vision-production-16cb.up.railway.app/api/refresh/TICKER \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_CI_API_KEY" \
  -d '{}'
```

Poll for completion:

```bash
curl https://imaginative-vision-production-16cb.up.railway.app/api/refresh/TICKER/status
```

When status is `completed`, the full research JSON is available in the response. The UI "+ Add Stock" flow does this automatically -- this step is for adding tickers to the canonical coverage set.

---

## Step 4 — Commit

After the scaffold is generated and returned:
1. Save the response JSON to `data/research/TICKER.json`
2. Commit `data/research/_index.json`, `data/reference.json`, and `data/research/TICKER.json`
3. Push to `main` -- this triggers the GitHub Pages deploy and makes the ticker live

---

## Step 5 — Verify

1. Check GitHub Pages after the deploy workflow completes
2. Navigate to `#report-TICKER` and confirm the report renders
3. Confirm the ticker appears in the Research home table
4. Trigger a manual refresh from the UI and confirm it completes

---

## Notes

- **Do not edit `_index.json` manually** for stocks that are already in coverage -- GitHub Actions owns that file for existing entries.
- `REFERENCE_DATA` embedded in `index.html` is a known defect covering fewer tickers than `_index.json`. It is not the source of truth.
- Live price data (`data/live-prices.json`) is updated by the `live-prices` GitHub Actions workflow. The new ticker will appear there automatically after the next workflow run.
