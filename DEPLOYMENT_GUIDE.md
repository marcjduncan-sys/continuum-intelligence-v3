# Narrative Framework v2.0 — Deployment Guide

## 🎯 What You're Deploying

A **top 0.1% institutional-grade** price-narrative engine that:
- ✅ Detects price dislocations automatically
- ✅ Adjusts hypothesis weights based on market-implied narratives
- ✅ Generates Goldman Sachs/UBS-quality commentary
- ✅ Creates alerts when research contradicts market views
- ✅ Updates the website dynamically via GitHub Actions

---

## 📋 Your Action Checklist

### Step 1: Add Script Tags to index.html

**File:** `index.html`  
**Location:** Before closing `</body>` tag

Add these lines:
```html
<!-- Narrative Framework v2.0 -->
<script src="scripts/price-narrative-engine.js"></script>
<script src="scripts/institutional-commentary-engine.js"></script>
<script src="scripts/narrative-framework-integration.js"></script>
```

**Exact placement:** Find `</body>` near the end of the file and add the lines just before it.

---

### Step 2: Commit All New Files

Run these commands in your terminal:

```bash
cd continuum-website

# Add all new files
git add scripts/price-narrative-engine.js
git add scripts/institutional-commentary-engine.js
git add scripts/narrative-framework-integration.js
git add scripts/run-automated-analysis.js
git add scripts/apply-narrative-updates.js
git add scripts/test-institutional.js
git add scripts/pme-case-study.js
git add scripts/pme-institutional-demo.js
git add .github/workflows/narrative-analysis.yml

# Add documentation
git add NARRATIVE_FRAMEWORK_V2.md
git add TOP_0.1pct_FRAMEWORK.md

# Commit
git commit -m "Add Narrative Framework v2.0 — price-responsive hypothesis weights and institutional commentary"

# Push to GitHub
git push origin main
```

---

### Step 3: Enable GitHub Actions

1. Go to your repository on GitHub: `https://github.com/marcjduncan-sys/continuum-intelligence`
2. Click the **"Actions"** tab
3. You may see a prompt saying "Workflows aren't being run on this forked repository"
4. Click **"I understand my workflows, go ahead and enable them"**

The workflow will now run automatically twice daily (7 AM and 7 PM UTC).

---

### Step 4: Test the Integration Locally

Open `index.html` in your browser and check the console:

```javascript
// Check that engines loaded
console.log(typeof PriceNarrativeEngine);        // Should print "object"
console.log(typeof InstitutionalCommentaryEngine); // Should print "object"
console.log(typeof NFI);                          // Should print "object"

// Run manual analysis on PME
NFI.refreshAnalysis('PME');

// Check the results
NFI.getAnalysis('PME');
```

You should see:
- Analysis running
- Dislocation detected (CRITICAL for PME)
- UI updating with alert banner and weight breakdown

---

### Step 5: Test the GitHub Actions Workflow (Manual)

1. Go to **Actions** tab on GitHub
2. Click **"Narrative Framework Analysis"** in the left sidebar
3. Click **"Run workflow"** button
4. Use default values:
   - tickers: `all`
   - severity_threshold: `MODERATE`
5. Click **"Run workflow"**

The workflow will:
- Analyze all 12 stocks
- Update `data/narrative-analysis.json`
- Update `index.html` if critical dislocations found
- Create GitHub issues for CRITICAL dislocations

---

## 📁 Files Added (What We Created)

### Core Engine Files
| File | Purpose | Required? |
|------|---------|-----------|
| `scripts/price-narrative-engine.js` | Price dislocation detection & weight calculation | ✅ Yes |
| `scripts/institutional-commentary-engine.js` | Institutional-grade commentary generation | ✅ Yes |
| `scripts/narrative-framework-integration.js` | UI integration & visualization | ✅ Yes |

### Automation Files
| File | Purpose | Required? |
|------|---------|-----------|
| `.github/workflows/narrative-analysis.yml` | GitHub Actions automation | ✅ Yes |
| `scripts/run-automated-analysis.js` | Analysis runner for CI/CD | ✅ Yes |
| `scripts/apply-narrative-updates.js` | Applies updates to index.html | ✅ Yes |

### Testing Files
| File | Purpose | Required? |
|------|---------|-----------|
| `scripts/test-institutional.js` | Test the institutional engine | ❌ Optional |
| `scripts/pme-case-study.js` | PME demonstration | ❌ Optional |
| `scripts/pme-institutional-demo.js` | Full PME demo | ❌ Optional |

### Documentation
| File | Purpose |
|------|---------|
| `NARRATIVE_FRAMEWORK_V2.md` | Architecture documentation |
| `TOP_0.1pct_FRAMEWORK.md` | Technical specification |
| `DEPLOYMENT_GUIDE.md` | This file |

---

## 🔍 What You'll See After Deployment

### 1. Dislocation Alert Banners
When a stock has a significant price move, you'll see:

```
🔴 Price Dislocation — CRITICAL
-8.36% move | Z: -2.33 | Vol: 2.11x | DISTRIBUTION

Market-implied: T2 dominant (80% confidence)
[View Full Analysis] [Research vs Market]
```

### 2. Hypothesis Weight Breakdown
Each hypothesis card will show:

```
Hypothesis Weight                    🟡 MEDIUM
[████████████░░░░░░░░]  
Research: 35%  |  Blended: 51%  |  Market: 75%
⚠️ 40pts above research view
```

### 3. Market-Responsive Commentary
A new section appears with dynamic commentary:

```
🎯 Market-Responsive Analysis
Updated: 14/02/2026, 10:30 AM | Severity: CRITICAL | Urgency: IMMEDIATE

Pro Medicus Limited declined 8.36% on heavy volume sharply to fresh lows. 
The severe distribution reflects capitulation-grade positioning...

Action: Initiate deep-dive review within 48 hours
```

### 4. Research vs Market Comparison
Click "Research vs Market" to see:

| Hypothesis | Research | Market | Blended | Gap |
|------------|----------|--------|---------|-----|
| T1 | 60% | 45% | 54% | 15pt |
| T2 | 35% | 75% | 51% | **40pt** 🟠 |
| T3 | 20% | 65% | 38% | **45pt** 🔴 |
| T4 | 50% | 20% | 38% | **30pt** 🟠 |

---

## ⚙️ Configuration Options

You can customize behavior by editing `NFI_CONFIG` in `narrative-framework-integration.js`:

```javascript
const NFI_CONFIG = {
  // Analysis triggers
  AUTO_ANALYZE_ON_LOAD: true,        // Run analysis when page loads
  ANALYZE_DISLOCATION_ONLY: false,   // Only show updates for dislocations
  
  // Display options
  SHOW_WEIGHT_BREAKDOWN: true,       // Show research/market weight bars
  SHOW_DIVERGENCE_BADGES: true,      // Show "40pt gap" badges
  SHOW_DISLOCATION_ALERTS: true,     // Show alert banners
  SHOW_MARKET_COMMENTARY: true,      // Show dynamic commentary
  
  // Divergence thresholds
  DIVERGENCE_MODERATE: 20,           // Yellow badge at 20pts
  DIVERGENCE_MAJOR: 40,              // Red badge at 40pts
  DIVERGENCE_CRITICAL: 50,           // Pulsing red at 50pts
};
```

---

## 🚨 Troubleshooting

### Issue: "Engines not loaded" error in console
**Solution:** Check that script tags are in the correct order:
```html
<script src="scripts/price-narrative-engine.js"></script>
<script src="scripts/institutional-commentary-engine.js"></script>
<script src="scripts/narrative-framework-integration.js"></script>  <!-- This one LAST -->
```

### Issue: No alerts showing
**Solution:** Check that:
1. `AUTO_ANALYZE_ON_LOAD: true` in config
2. Price data is available (check `data/live-prices.json` exists)
3. Check browser console for errors

### Issue: GitHub Actions not running
**Solution:** 
1. Go to Settings → Actions → General
2. Under "Actions permissions", select "Allow all actions and reusable workflows"
3. Enable workflows from the Actions tab

### Issue: Analysis shows all NORMAL
**Solution:** The current PME price (A$118.22) may have been updated in your data. To test:
```javascript
// Force a critical dislocation in console
const testPrice = {
  currentPrice: 80,  // Much lower to trigger CRITICAL
  previousPrice: 118.22,
  priceAtReview: 162.64,
  peakPrice: 336,
  // ... rest of price data
};
NFI.analyzeStock('PME');  // Will use live prices
```

---

## 📊 Monitoring the Framework

### GitHub Actions Runs
- Go to **Actions** tab to see run history
- Green check = success
- Red X = failure (click to see logs)

### Generated Issues
- CRITICAL dislocations automatically create GitHub issues
- Issues are labeled: `price-dislocation`, `critical`, `narrative-framework`
- You'll get email notifications (if enabled in GitHub settings)

### Analysis Data
- `data/narrative-analysis.json` — Full analysis results
- Check this file to see what the engine detected

---

## 🔄 Workflow Schedule

By default, the workflow runs:
- **7:00 AM UTC** — Morning market update
- **7:00 PM UTC** — Evening after-market close

To change this, edit `.github/workflows/narrative-analysis.yml`:
```yaml
on:
  schedule:
    - cron: '0 7 * * *'   # Change these times
    - cron: '0 19 * * *'  # UTC format
```

Use [crontab.guru](https://crontab.guru) to generate custom schedules.

---

## 🎓 Next Steps After Deployment

1. **Monitor first few runs** — Check that analysis is working correctly
2. **Tune sensitivity** — Adjust `DIVERGENCE_*` thresholds if alerts are too frequent/rare
3. **Add custom catalysts** — Edit `institutional-commentary-engine.js` to add stock-specific catalysts
4. **Integrate with chat widget** — Pass narrative context to the research chat API

---

## ✅ Success Criteria

You've successfully deployed when:
- [ ] Script tags added to `index.html`
- [ ] All files committed to GitHub
- [ ] GitHub Actions enabled and running
- [ ] Visiting the site shows dislocation alert for PME (or test ticker)
- [ ] Hypothesis cards show weight breakdown bars
- [ ] "Research vs Market" modal shows divergence table
- [ ] Console shows `[NFI] Integration initialized successfully.`

---

**Need help?** Check the browser console for error messages, or review the test files (`scripts/test-institutional.js`) to see expected behavior.
