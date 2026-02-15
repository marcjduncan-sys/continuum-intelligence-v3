# Continuum Scripts

Automation scripts for the Continuum Intelligence research platform.

## Files

| Script | Description | Run Frequency |
|--------|-------------|---------------|
| `event-scraper.js` | Fetches prices from Yahoo Finance and ASX announcements | 2x daily (GitHub Actions) |
| `narrative-generator.js` | Generates narrative text updates based on detected events | After scraper |
| `update-html.js` | Applies updates to `index.html` | After narrative generator |

## Manual Execution

```bash
# Run scraper
node scripts/event-scraper.js

# Generate narratives
node scripts/narrative-generator.js

# Update HTML
node scripts/update-html.js
```

## Local Development

```bash
# Install dependencies (none required - pure Node.js)

# Run all steps
node scripts/event-scraper.js && node scripts/narrative-generator.js && node scripts/update-html.js
```

## Data Flow

1. **Scraper** outputs → `data/latest-prices.json` + `data/events/`
2. **Generator** reads prices/events → outputs `data/pending-updates.json`
3. **Updater** reads all data → modifies `index.html`

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success, no updates needed |
| 100 | Success, updates generated |
| 1 | Error |
