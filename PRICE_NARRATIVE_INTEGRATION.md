# Price-Narrative Engine Integration Guide

## Overview

This guide shows how to integrate the Price-Narrative Inference Engine into the Continuum website so that hypothesis weights and commentary dynamically respond to price dislocations.

---

## Quick Start

### 1. Include the Script

Add to `index.html` before closing `</body>`:

```html
<!-- Price-Narrative Engine -->
<script src="scripts/price-narrative-engine.js"></script>
<script src="scripts/pme-case-study.js"></script>
```

### 2. Initialize on Page Load

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Load latest prices
  const priceData = await fetch('data/live-prices.json').then(r => r.json());
  
  // Analyze each stock
  for (const ticker of ['PME', 'XRO', 'CSL', 'WOW', 'WTC', 'DRO', 'GYG', 'MQG', 'GMG', 'WDS', 'SIG', 'FMG']) {
    const stockData = STOCK_DATA[ticker];
    const tickerPriceData = buildPriceData(ticker, priceData, stockData);
    
    const analysis = PriceNarrativeEngine.analyze(ticker, stockData, tickerPriceData);
    
    if (analysis.shouldUpdate) {
      // Update the UI with dynamic weights
      updateHypothesisDisplay(ticker, analysis);
      showDislocationAlert(ticker, analysis);
    }
  }
});
```

### 3. Build Price Data Helper

```javascript
function buildPriceData(ticker, livePrices, stockData) {
  const price = livePrices.prices[ticker];
  const history = stockData.priceHistory || [];
  
  // Calculate historical returns
  const returns = [];
  for (let i = 1; i < Math.min(history.length, 30); i++) {
    returns.push((history[i] - history[i-1]) / history[i-1]);
  }
  
  // Count consecutive down days
  let consecutiveDown = 0;
  for (let i = history.length - 1; i > 0; i--) {
    if (history[i] < history[i-1]) consecutiveDown++;
    else break;
  }
  
  return {
    currentPrice: price.p,
    previousPrice: price.pc,
    priceAtReview: parseFloat(stockData.price) || price.p,
    peakPrice: Math.max(...history),
    low52Week: Math.min(...history),
    high52Week: Math.max(...history),
    todayVolume: price.v,
    avgVolume20d: price.v / (price.v > 1000000 ? 2 : 0.8), // Approximate
    historicalReturns: returns,
    consecutiveDownDays: consecutiveDown
  };
}
```

---

## UI Integration

### Hypothesis Card Updates

Update the hypothesis rendering to show dynamic weights:

```javascript
function renderHypothesisCard(hypothesis, ticker) {
  const hasDynamic = hypothesis._dynamicWeights;
  const weight = hasDynamic ? hypothesis._dynamicWeights.blended : parseInt(hypothesis.score);
  const confidence = hasDynamic ? hypothesis._dynamicWeights.confidence : 'HIGH';
  
  const confidenceIcon = {
    'HIGH': '🟢',
    'MEDIUM': '🟡',
    'LOW': '🔴'
  }[confidence];
  
  const divergenceWarning = hasDynamic && Math.abs(hypothesis._dynamicWeights.longTerm - hypothesis._dynamicWeights.shortTerm) > 25
    ? `<span class="divergence-badge" title="Research: ${hypothesis._dynamicWeights.longTerm}%, Market: ${hypothesis._dynamicWeights.shortTerm}%">⚠️ Divergence</span>`
    : '';
  
  return `
    <div class="hypothesis-card tier-${hypothesis.tier}">
      <div class="hypothesis-header">
        <span class="confidence-icon">${confidenceIcon}</span>
        <h4>${hypothesis.title}</h4>
        <span class="weight-badge">${weight}%</span>
        ${divergenceWarning}
      </div>
      ${hasDynamic ? `
        <div class="weight-breakdown">
          <div class="weight-bar">
            <div class="weight-lt" style="width:${hypothesis._dynamicWeights.longTerm}%"></div>
            <div class="weight-st" style="width:${hypothesis._dynamicWeights.shortTerm - hypothesis._dynamicWeights.longTerm}%"></div>
          </div>
          <div class="weight-labels">
            <span>Research: ${hypothesis._dynamicWeights.longTerm}%</span>
            <span>Market: ${hypothesis._dynamicWeights.shortTerm}%</span>
          </div>
        </div>
      ` : ''}
      <p class="description">${hypothesis.description}</p>
    </div>
  `;
}
```

### Dislocation Alert Banner

```javascript
function showDislocationAlert(ticker, analysis) {
  if (analysis.dislocation.severity === 'NORMAL') return;
  
  const colors = {
    'CRITICAL': '#D45555',
    'HIGH': '#D4A03C',
    'MODERATE': '#4A8ECC'
  };
  
  const alert = document.createElement('div');
  alert.className = 'dislocation-alert';
  alert.style.cssText = `
    background: ${colors[analysis.dislocation.severity]};
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    margin: 16px 0;
    font-family: var(--font-ui);
  `;
  
  alert.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong>🚨 Price Dislocation — ${analysis.dislocation.severity}</strong>
        <div style="font-size:0.85rem;opacity:0.9;margin-top:4px;">
          ${analysis.dislocation.metrics.todayReturn}% today | 
          ${analysis.dislocation.metrics.drawdownFromPeak}% from peak |
          Market implying: ${analysis.inference.primaryHypothesis}
        </div>
      </div>
      <button onclick="showNarrativeModal('${ticker}')" 
              style="background:white;color:${colors[analysis.dislocation.severity]};
                     border:none;padding:6px 12px;border-radius:4px;
                     cursor:pointer;font-weight:600;">
        View Analysis
      </button>
    </div>
  `;
  
  // Insert at top of stock report
  const report = document.querySelector(`#page-report-${ticker}`);
  if (report) report.insertBefore(alert, report.firstChild);
}
```

### Narrative Modal

```javascript
function showNarrativeModal(ticker) {
  const stockData = STOCK_DATA[ticker];
  const analysis = stockData._lastAnalysis;
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content" style="max-width:700px;">
      <div class="modal-header">
        <h2>${ticker} — Narrative Analysis</h2>
        <button onclick="this.closest('.modal-overlay').remove()">&times;</button>
      </div>
      <div class="modal-body">
        <pre style="white-space:pre-wrap;font-family:var(--font-ui);font-size:0.9rem;line-height:1.6;">
${analysis.commentary.summary}
        </pre>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}
```

---

## CSS Styling

```css
/* Dislocation Alert */
.dislocation-alert {
  animation: slideDown 0.3s ease;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Hypothesis Weight Breakdown */
.weight-breakdown {
  margin: 12px 0;
}

.weight-bar {
  height: 8px;
  background: var(--bg-surface-alt);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
}

.weight-lt {
  background: var(--accent-teal);
  transition: width 0.3s ease;
}

.weight-st {
  background: var(--accent-gold);
  transition: width 0.3s ease;
}

.weight-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.divergence-badge {
  background: var(--signal-amber);
  color: #000;
  font-size: 0.65rem;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

/* Confidence Icons */
.confidence-icon {
  font-size: 0.8rem;
  margin-right: 6px;
}
```

---

## Integration with Event System

The Price-Narrative Engine should integrate with the existing event-scraper:

```javascript
// In event-scraper.js
async function processPriceUpdate(ticker, newPriceData) {
  // 1. Update live-prices.json
  await updatePriceFile(ticker, newPriceData);
  
  // 2. Check for dislocation
  const stockData = STOCK_DATA[ticker];
  const analysis = PriceNarrativeEngine.analyze(ticker, stockData, newPriceData);
  
  // 3. If significant, trigger narrative update
  if (analysis.shouldUpdate) {
    // Update hypothesis weights
    PriceNarrativeEngine.applyAnalysis(stockData, analysis);
    
    // Generate new commentary
    await updateNarrativeCommentary(ticker, analysis);
    
    // Create GitHub issue if critical
    if (analysis.dislocation.severity === 'CRITICAL') {
      await createDislocationIssue(ticker, analysis);
    }
    
    // Update HTML
    await regenerateHTML();
  }
}
```

---

## GitHub Actions Integration

Add to `.github/workflows/price-narrative.yml`:

```yaml
name: Price-Narrative Analysis

on:
  schedule:
    - cron: '0 2,8 * * *'  # Twice daily
  workflow_dispatch:

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Run Price-Narrative Analysis
        run: node scripts/run-narrative-analysis.js
      
      - name: Commit changes
        run: |
          git config user.name "Narrative Bot"
          git config user.email "bot@continuum.intelligence"
          git add data/hypothesis-weights.json
          git add data/dislocation-events.json
          git commit -m "Update narrative weights from price dislocation analysis" || true
          git push
```

---

## Testing

### Run the PME Case Study

```bash
cd continuum-website
node scripts/pme-case-study.js
```

Or in browser console:
```javascript
PME_CASE_STUDY.run();
PME_CASE_STUDY.compare();
```

### Manual Test

```javascript
// Test with any ticker
const testData = {
  currentPrice: 100,
  previousPrice: 110,
  priceAtReview: 150,
  peakPrice: 200,
  low52Week: 90,
  high52Week: 200,
  todayVolume: 1000000,
  avgVolume20d: 500000,
  historicalReturns: Array(20).fill(0).map(() => (Math.random() - 0.5) * 0.02),
  consecutiveDownDays: 3
};

const result = PriceNarrativeEngine.analyze('TEST', STOCK_DATA.PME, testData);
console.log(result);
```

---

## Data Persistence

### hypothesis-weights.json

Store dynamic weights separately from STOCK_DATA:

```json
{
  "PME": {
    "lastUpdated": "2026-02-13T09:28:00Z",
    "dislocationSeverity": "HIGH",
    "weights": {
      "T1": {"longTerm": 60, "shortTerm": 45, "blended": 54, "confidence": "MEDIUM"},
      "T2": {"longTerm": 35, "shortTerm": 55, "blended": 43, "confidence": "HIGH"},
      "T3": {"longTerm": 20, "shortTerm": 60, "blended": 36, "confidence": "HIGH"},
      "T4": {"longTerm": 50, "shortTerm": 15, "blended": 36, "confidence": "LOW"}
    }
  }
}
```

### dislocation-events.json

Log all detected dislocations:

```json
{
  "events": [
    {
      "ticker": "PME",
      "timestamp": "2026-02-13T09:28:00Z",
      "severity": "HIGH",
      "metrics": {"zScore": 2.8, "drawdownFromPeak": 0.51, "volumeRatio": 2.1},
      "inference": {"primaryHypothesis": "T3", "confidence": 0.75}
    }
  ]
}
```

---

## Monitoring Dashboard

Add a monitoring page to track all stocks:

```javascript
// narrative-dashboard.js
function renderNarrativeDashboard() {
  const stocks = Object.keys(STOCK_DATA);
  
  return `
    <table class="narrative-dashboard">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Price</th>
          <th>Dislocation</th>
          <th>Primary Narrative</th>
          <th>Max Divergence</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${stocks.map(ticker => {
          const data = STOCK_DATA[ticker];
          const analysis = data._lastAnalysis;
          if (!analysis) return '';
          
          return `
            <tr class="severity-${analysis.dislocation.severity.toLowerCase()}">
              <td>${ticker}</td>
              <td>$${data.price}</td>
              <td>${analysis.dislocation.severity}</td>
              <td>${analysis.inference.primaryHypothesis}</td>
              <td>${getMaxDivergence(analysis.weights)}pts</td>
              <td><button onclick="showNarrativeModal('${ticker}')">View</button></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}
```

---

## Summary

This integration gives the Continuum framework:

1. **Statistical price dislocation detection** — No more missing 50% drops
2. **Market-implied narrative inference** — What is the market actually saying?
3. **Dynamic hypothesis weights** — Research 60% / Market 40% blend
4. **Divergence highlighting** — Where does research contradict the market?
5. **Actionable commentary** — What should we do about it?

The result: A framework that respects market-generated information while maintaining fundamental rigor.
