// portfolio.js — Portfolio engine
// Extracted from index.html without logic changes

import { STOCK_DATA, REFERENCE_DATA } from '../lib/state.js';
import { computeSkewScore, normaliseScores } from '../lib/dom.js';
import { buildCoverageData } from './home.js';

// Coverage data matching portal reports (built dynamically from STOCK_DATA)
var COVERAGE_DATA = null;

function getCoverageData() {
  if (!COVERAGE_DATA) COVERAGE_DATA = buildCoverageData();
  return COVERAGE_DATA;
}

// TC_DATA is imported from thesis.js but to avoid circular dependency,
// we access it via the window global set by thesis.js
function getTcData() {
  // TC_DATA is defined in thesis.js and also remains on window from index.html
  return window.TC_DATA || {};
}

export function setupUploadZone() {
  var zone = document.getElementById('uploadZone');
  var fileInput = document.getElementById('fileInput');
  if (!zone || !fileInput) return;

  zone.addEventListener('click', function() { fileInput.click(); });
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    var file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });
}

export function handleFile(file) {
  var ext = file.name.split('.').pop().toLowerCase();
  var reader = new FileReader();

  if (ext === 'csv') {
    reader.onload = function(e) {
      var rows = parseCSV(e.target.result);
      processPortfolioData(rows);
    };
    reader.readAsText(file);
  } else {
    // Lazy-load SheetJS on demand for Excel files
    reader.onload = function(e) {
      var processExcel = function() {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = window.XLSX.read(data, { type: 'array' });
          var sheet = workbook.Sheets[workbook.SheetNames[0]];
          var rows = window.XLSX.utils.sheet_to_json(sheet);
          processPortfolioData(rows);
        } catch (err) {
          alert('Could not read Excel file. Please check the format and try again.');
        }
      };
      if (typeof window.XLSX !== 'undefined') {
        processExcel();
      } else if (typeof window.loadSheetJS === 'function') {
        window.loadSheetJS(processExcel);
      } else {
        alert('Excel parsing library failed to load. Please try a CSV file instead.');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

export function parseCSV(text) {
  var lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  var headers = lines[0].split(',').map(function(h) { return h.trim(); });
  return lines.slice(1).map(function(line) {
    var vals = line.split(',').map(function(v) { return v.trim(); });
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = vals[i] || ''; });
    return obj;
  });
}

export function normalizeTicker(raw) {
  if (!raw) return '';
  return raw.toString().toUpperCase().replace(/\.AX$/i, '').trim();
}

export function getCol(row, names) {
  for (var ni = 0; ni < names.length; ni++) {
    var n = names[ni];
    var keys = Object.keys(row);
    var match = keys.find(function(k) {
      return k.toLowerCase().replace(/[^a-z]/g, '') === n.toLowerCase().replace(/[^a-z]/g, '');
    });
    if (match && row[match] !== undefined && row[match] !== '') return row[match];
  }
  return null;
}

export function processPortfolioData(rows) {
  var coverageData = getCoverageData();
  var positions = [];
  for (var ri = 0; ri < rows.length; ri++) {
    var row = rows[ri];
    var ticker = normalizeTicker(getCol(row, ['Ticker', 'ASX', 'ASXCode', 'Code', 'Symbol', 'Stock']));
    var units = parseFloat(getCol(row, ['Units', 'Quantity', 'Qty', 'Shares', 'Volume']));
    var avgCost = parseFloat(getCol(row, ['AvgCost', 'AverageCost', 'CostBasis', 'Cost', 'Price', 'BuyPrice', 'AvgPrice']));

    if (!ticker || isNaN(units) || isNaN(avgCost)) continue;

    var covered = coverageData[ticker];
    var currentPrice = covered ? covered.price : null;
    var company = covered ? covered.company : ticker;
    var skew = covered ? covered.skew : null;

    var marketValue = currentPrice ? units * currentPrice : null;
    var costBasis = units * avgCost;
    var pnlDollar = marketValue !== null ? marketValue - costBasis : null;
    var pnlPercent = costBasis > 0 && pnlDollar !== null ? (pnlDollar / costBasis) * 100 : null;

    positions.push({ ticker: ticker, company: company, units: units, avgCost: avgCost, currentPrice: currentPrice, marketValue: marketValue, costBasis: costBasis, pnlDollar: pnlDollar, pnlPercent: pnlPercent, skew: skew });
  }

  if (positions.length === 0) {
    alert('No valid positions found. Expected columns: Ticker, Units, Avg Cost');
    return;
  }

  /* Calculate weights */
  var totalValue = positions.reduce(function(s, p) { return s + (p.marketValue || 0); }, 0);
  positions.forEach(function(p) {
    p.weight = totalValue > 0 && p.marketValue ? (p.marketValue / totalValue) * 100 : 0;
    p.alignment = deriveAlignment(p.skew, p.weight);
  });

  savePortfolio(positions);
  renderPortfolio(positions, totalValue);
}

export function deriveAlignment(skew, weight) {
  if (!skew) return { label: 'Not covered', cls: 'not-covered' };
  if (skew === 'upside') return { label: 'Aligned with skew', cls: 'aligned' };
  if (skew === 'downside') {
    if (weight > 15) return { label: 'Exposure exceeds conviction', cls: 'exceeds' };
    return { label: 'Contradicts skew', cls: 'contradicts' };
  }
  if (skew === 'balanced') {
    if (weight > 15) return { label: 'Exposure exceeds conviction', cls: 'exceeds' };
    return { label: 'Balanced exposure', cls: 'neutral' };
  }
  return { label: 'N/A', cls: 'not-covered' };
}

export function renderPortfolio(positions, totalValue) {
  var body = document.getElementById('portfolioBody');
  var table = document.getElementById('portfolioTable');
  var summary = document.getElementById('portfolioSummary');
  var actions = document.getElementById('portfolioActions');
  var zone = document.getElementById('uploadZone');

  body.innerHTML = '';

  positions.sort(function(a, b) { return (b.marketValue || 0) - (a.marketValue || 0); });

  for (var pi = 0; pi < positions.length; pi++) {
    var p = positions[pi];
    var tr = document.createElement('tr');
    var coverageData = getCoverageData();
    if (coverageData[p.ticker]) {
      tr.setAttribute('onclick', "navigate('report-" + p.ticker + "')");
    }

    var pnlClass = p.pnlDollar >= 0 ? 'td-pnl-pos' : 'td-pnl-neg';
    var skewBadge = p.skew ? '<span class="skew-badge ' + p.skew + '">' + (p.skew === 'upside' ? '&#9650; UPSIDE' : p.skew === 'downside' ? '&#9660; DOWNSIDE' : '&#9670; BALANCED') + '</span>' : '<span style="color:var(--text-muted)">N/A</span>';

    tr.innerHTML =
      '<td class="td-ticker">' + p.ticker + '</td>' +
      '<td>' + p.company + '</td>' +
      '<td class="td-mono">' + formatNum(p.units, 0) + '</td>' +
      '<td class="td-mono">A$' + formatNum(p.avgCost, 2) + '</td>' +
      '<td class="td-mono">' + (p.currentPrice ? 'A$' + formatNum(p.currentPrice, 2) : 'N/A') + '</td>' +
      '<td class="' + pnlClass + '">' + (p.pnlDollar !== null ? (p.pnlDollar >= 0 ? '+' : '') + 'A$' + formatNum(p.pnlDollar, 0) : 'N/A') + '</td>' +
      '<td class="' + pnlClass + '">' + (p.pnlPercent !== null ? (p.pnlPercent >= 0 ? '+' : '') + formatNum(p.pnlPercent, 1) + '%' : 'N/A') + '</td>' +
      '<td class="td-mono">' + formatNum(p.weight, 1) + '%</td>' +
      '<td>' + skewBadge + '</td>' +
      '<td><span class="alignment-badge ' + p.alignment.cls + '">' + p.alignment.label + '</span></td>';

    body.appendChild(tr);
  }

  /* Summary */
  var totalPnL = positions.reduce(function(s, p) { return s + (p.pnlDollar || 0); }, 0);
  var totalCost = positions.reduce(function(s, p) { return s + p.costBasis; }, 0);
  var totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  var alignedWeight = 0, contraWeight = 0, neutralWeight = 0;
  positions.forEach(function(p) {
    if (p.alignment.cls === 'aligned') alignedWeight += p.weight;
    else if (p.alignment.cls === 'contradicts' || p.alignment.cls === 'exceeds') contraWeight += p.weight;
    else neutralWeight += p.weight;
  });

  document.getElementById('summaryValue').textContent = 'A$' + formatNum(totalValue, 0);
  var pnlEl = document.getElementById('summaryPnL');
  pnlEl.textContent = (totalPnL >= 0 ? '+' : '') + 'A$' + formatNum(totalPnL, 0) + ' (' + (totalPnLPct >= 0 ? '+' : '') + formatNum(totalPnLPct, 1) + '%)';
  pnlEl.className = 'portfolio-summary-value ' + (totalPnL >= 0 ? 'positive' : 'negative');
  document.getElementById('summaryAligned').textContent = formatNum(alignedWeight, 1) + '%';
  document.getElementById('summaryContra').textContent = formatNum(contraWeight, 1) + '%';
  document.getElementById('summaryNeutral').textContent = formatNum(neutralWeight, 1) + '%';

  /* Show/hide elements */
  zone.style.display = 'none';
  table.style.display = '';
  summary.style.display = '';
  actions.style.display = '';

  /* Render diagnostics, reweighting, and alerts */
  renderPortfolioDiagnostics(positions, totalValue);
  renderReweighting(positions, totalValue);
  renderChangeAlerts(positions);
}

export function renderPortfolioFromSaved(positions) {
  var totalValue = positions.reduce(function(s, p) { return s + (p.marketValue || 0); }, 0);
  renderPortfolio(positions, totalValue);
}

export function formatNum(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  var abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

export function renderPortfolioDiagnostics(positions, totalValue) {
  var diagnosticsEl = document.getElementById('portfolioDiagnostics');
  if (!diagnosticsEl) return;
  diagnosticsEl.style.display = '';

  var TC_DATA = getTcData();
  var hypothesisValues = { n1: 0, n2: 0, n3: 0, n4: 0, unknown: 0 };

  positions.forEach(function(p) {
    var data = TC_DATA[p.ticker];
    if (!data) {
      hypothesisValues.unknown += (p.marketValue || 0);
      return;
    }
    var tier = data.primary === 'uphill' ? 'n2' : data.primary;
    hypothesisValues[tier] += (p.marketValue || 0);
  });

  var tiers = ['n1', 'n2', 'n3', 'n4'];
  tiers.forEach(function(tier) {
    var pct = totalValue > 0 ? (hypothesisValues[tier] / totalValue) * 100 : 0;
    var segment = document.getElementById('dna' + tier.toUpperCase());
    var pctEl = document.getElementById('pct' + tier.toUpperCase());
    var valEl = document.getElementById('val' + tier.toUpperCase());

    if (segment) {
      segment.style.width = Math.max(pct, 5) + '%';
      segment.style.display = pct > 0 ? 'flex' : 'none';
    }
    if (pctEl) pctEl.textContent = formatNum(pct, 0) + '%';
    if (valEl) valEl.textContent = 'A$' + formatNum(hypothesisValues[tier], 0);
  });

  var maxTier = tiers.reduce(function(a, b) { return hypothesisValues[a] > hypothesisValues[b] ? a : b; });
  var maxPct = totalValue > 0 ? (hypothesisValues[maxTier] / totalValue) * 100 : 0;
  var concentrationEl = document.getElementById('portConcentrationAlert');

  if (maxPct > 60) {
    concentrationEl.innerHTML = '<span class="alert-highlight">High concentration risk:</span> ' + formatNum(maxPct, 0) + '% of your book aligns with ' + maxTier.toUpperCase() + '. If this hypothesis is wrong, significant downside.';
  } else if (maxPct > 40) {
    concentrationEl.innerHTML = '<span class="alert-highlight">Moderate concentration:</span> ' + formatNum(maxPct, 0) + '% in ' + maxTier.toUpperCase() + '. Consider diversification across other hypotheses.';
  } else {
    concentrationEl.innerHTML = '<span class="success-highlight">Well diversified</span> across hypotheses. No single scenario dominates your portfolio.';
  }

  var contrarianEl = document.getElementById('portContrarianOpp');
  var contrarianPositions = positions.filter(function(p) {
    var data = TC_DATA[p.ticker];
    return data && data.primary === 'uphill';
  });

  if (contrarianPositions.length > 0) {
    var names = contrarianPositions.slice(0, 3).map(function(p) { return p.ticker; }).join(', ');
    var more = contrarianPositions.length > 3 ? ' +' + (contrarianPositions.length - 3) + ' more' : '';
    contrarianEl.innerHTML = '<strong>' + names + more + '</strong>  --  Your view differs from all four Continuum hypotheses. High conviction required, but potential alpha if correct.';
  } else {
    contrarianEl.innerHTML = 'Your positions generally align with at least one Continuum hypothesis. No extreme contrarian bets detected.';
  }

  var hedgeEl = document.getElementById('portHedgeGaps');
  var missingTiers = tiers.filter(function(tier) { return hypothesisValues[tier] === 0; });

  if (missingTiers.length > 0) {
    var tierNames = { n1: 'N1 (Growth/Recovery)', n2: 'N2 (Base Case)', n3: 'N3 (Downside)', n4: 'N4 (Disruption)' };
    hedgeEl.innerHTML = 'You have <strong>zero exposure</strong> to: ' + missingTiers.map(function(t) { return tierNames[t]; }).join(', ') + '. Consider whether this creates blind spots if these scenarios play out.';
  } else {
    hedgeEl.innerHTML = '<span class="success-highlight">Comprehensive coverage.</span> Your portfolio spans all four hypothesis types.';
  }

  var alignmentEl = document.getElementById('portAlignmentScore');
  var alignedWeight = positions.reduce(function(s, p) { return s + (p.alignment.cls === 'aligned' ? p.weight : 0); }, 0);

  if (alignedWeight > 50) {
    alignmentEl.innerHTML = '<span class="success-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Your book largely reflects our evidence-based view.';
  } else if (alignedWeight > 25) {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Mixed positioning  --  some agreement, some divergence.';
  } else {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Significant divergence. You may see value we do not (or vice versa).';
  }
}

export function renderReweighting(positions, totalValue) {
  var sectionEl = document.getElementById('portfolioReweighting');
  var bodyEl = document.getElementById('reweightBody');
  if (!sectionEl || !bodyEl) return;

  var coverageData = getCoverageData();
  var TC_DATA = getTcData();

  // Only show for covered positions
  var covered = positions.filter(function(p) { return coverageData[p.ticker]; });
  if (covered.length === 0) {
    sectionEl.style.display = 'none';
    return;
  }

  // Calculate evidence scores
  var scores = [];
  var baseWeight = 100 / covered.length;

  covered.forEach(function(p) {
    var cd = coverageData[p.ticker];
    var tc = TC_DATA[p.ticker];

    // Conviction multiplier based on skew direction
    var multiplier = 1.0;
    if (cd.skew === 'upside') multiplier = 1.3;
    else if (cd.skew === 'downside') multiplier = 0.7;

    // Adjust for hypothesis strength from TC_DATA
    if (tc) {
      var probs = [tc.n1.prob, tc.n2.prob, tc.n3.prob, tc.n4.prob];
      var maxProb = Math.max.apply(null, probs);
      // High conviction in dominant thesis = slight boost
      if (maxProb > 40) multiplier *= 1.05;
      // Contrarian / uphill = slight reduction
      if (tc.primary === 'uphill') multiplier *= 0.9;
    }

    scores.push({
      ticker: p.ticker,
      company: p.company,
      currentWeight: p.weight,
      skew: cd.skew,
      rawScore: baseWeight * multiplier
    });
  });

  // Normalize suggested weights to 100%
  var totalScore = scores.reduce(function(s, x) { return s + x.rawScore; }, 0);
  scores.forEach(function(s) {
    s.suggestedWeight = (s.rawScore / totalScore) * 100;
  });

  // Sort by largest delta
  scores.sort(function(a, b) { return Math.abs(b.suggestedWeight - b.currentWeight) - Math.abs(a.suggestedWeight - a.currentWeight); });

  // Render table
  var rows = '';
  scores.forEach(function(s) {
    var delta = s.suggestedWeight - s.currentWeight;
    var absDelta = Math.abs(delta);
    var action, actionCls, deltaCls;

    if (delta > 2) {
      action = 'Increase';
      actionCls = 'increase';
      deltaCls = 'increase';
    } else if (delta < -2) {
      action = 'Reduce';
      actionCls = 'reduce';
      deltaCls = 'reduce';
    } else {
      action = 'Hold';
      actionCls = 'hold';
      deltaCls = 'hold';
    }

    var skewArrow = s.skew === 'upside' ? '&#9650; UPSIDE' :
                    s.skew === 'downside' ? '&#9660; DOWNSIDE' : '&#9670; BALANCED';
    var skewCls = s.skew;

    var maxBar = Math.max(s.currentWeight, s.suggestedWeight, 1);

    rows += '<tr>' +
      '<td><span class="rw-ticker">' + s.ticker + '</span></td>' +
      '<td>' + s.company + '</td>' +
      '<td><span class="skew-badge ' + skewCls + '">' + skewArrow + '</span></td>' +
      '<td><span class="rw-pct">' + s.currentWeight.toFixed(1) + '%</span></td>' +
      '<td><span class="rw-pct">' + s.suggestedWeight.toFixed(1) + '%</span></td>' +
      '<td><span class="rw-delta ' + deltaCls + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</span></td>' +
      '<td><span class="rw-action ' + actionCls + '">' + action + '</span></td>' +
    '</tr>';
  });

  bodyEl.innerHTML =
    '<table class="rw-table">' +
      '<thead><tr>' +
        '<th>Ticker</th>' +
        '<th>Company</th>' +
        '<th>Evidence</th>' +
        '<th>Current</th>' +
        '<th>Suggested</th>' +
        '<th>Delta</th>' +
        '<th>Action</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>';

  sectionEl.style.display = '';
}

export function renderChangeAlerts(positions) {
  var sectionEl = document.getElementById('changeAlertsSection');
  var feedEl = document.getElementById('changeAlertsFeed');
  var emptyEl = document.getElementById('changeAlertsEmpty');

  if (!sectionEl) return;
  sectionEl.style.display = '';

  var alerts = [];
  var tickers = positions.map(function(p) { return p.ticker; });

  if (tickers.includes('XRO')) {
    alerts.push({
      type: 'critical',
      icon: '\uD83D\uDD34',
      title: 'XRO: N3 Probability Increased',
      text: 'AI disruption thesis strengthened following Claude 4 announcement. N3 (Execution Failure) raised from 35% -> 42%.',
      ticker: 'XRO',
      time: '2 hours ago',
      impact: 'Affects 15% of portfolio'
    });
  }

  if (tickers.includes('WOW')) {
    alerts.push({
      type: 'warning',
      icon: '\uD83D\uDFE1',
      title: 'WOW: Earnings Preview',
      text: 'Q1 FY26 results due Feb 25. Consensus expects 11.8% EBIT growth vs management guidance of "mid-to-high single digits". Watch for N1/N2 inflection.',
      ticker: 'WOW',
      time: '1 day ago',
      impact: 'Affects 12% of portfolio'
    });
  }

  if (tickers.includes('CSL')) {
    alerts.push({
      type: 'info',
      icon: '\uD83D\uDD35',
      title: 'CSL: Plasma Collection Update',
      text: 'Weekly collection data shows continued normalization. N1 (Recovery) probability stable at 45%. No change to thesis.',
      ticker: 'CSL',
      time: '3 days ago',
      impact: 'Affects 20% of portfolio'
    });
  }

  if (tickers.includes('WTC')) {
    alerts.push({
      type: 'critical',
      icon: '\uD83D\uDD34',
      title: 'WTC: Governance Concerns Escalate',
      text: 'Additional board member resignation. N3 (Governance Risk) elevated from 30% -> 35%. Review position sizing.',
      ticker: 'WTC',
      time: '4 hours ago',
      impact: 'Affects 8% of portfolio'
    });
  }

  if (alerts.length < 2) {
    alerts.push({
      type: 'info',
      icon: '\uD83D\uDCCA',
      title: 'Market: ASX 200 Volatility Elevated',
      text: 'VIX-equivalent at 18-month high. Consider position sizing across all hypotheses.',
      ticker: 'MARKET',
      time: '5 hours ago',
      impact: 'Broad market'
    });
  }

  if (alerts.length > 0 && feedEl) {
    feedEl.innerHTML = alerts.map(function(a) {
      return '<div class="change-alert-item ' + a.type + '">' +
        '<div class="change-alert-icon">' + a.icon + '</div>' +
        '<div class="change-alert-content">' +
          '<div class="change-alert-title">' + a.title + '</div>' +
          '<div class="change-alert-text">' + a.text + '</div>' +
          '<div class="change-alert-meta">' +
            '<span class="change-alert-ticker">' + a.ticker + '</span>' +
            '<span>\u23F1 ' + a.time + '</span>' +
            '<span>\uD83D\uDCBC ' + a.impact + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    feedEl.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
  } else if (emptyEl) {
    if (feedEl) feedEl.style.display = 'none';
    emptyEl.style.display = '';
  }
}

export function savePortfolio(positions) {
  try { localStorage.setItem('continuum-portfolio', JSON.stringify(positions)); } catch(e) {}
}

export function loadPortfolio() {
  try { var d = localStorage.getItem('continuum-portfolio'); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

export function clearPortfolio() {
  localStorage.removeItem('continuum-portfolio');
  document.getElementById('uploadZone').style.display = '';
  document.getElementById('portfolioTable').style.display = 'none';
  document.getElementById('portfolioSummary').style.display = 'none';
  document.getElementById('portfolioActions').style.display = 'none';
  document.getElementById('portfolioBody').innerHTML = '';

  /* Hide diagnostics, reweighting, and alerts */
  var diag = document.getElementById('portfolioDiagnostics');
  var reweight = document.getElementById('portfolioReweighting');
  var alertsEl = document.getElementById('changeAlertsSection');
  if (diag) diag.style.display = 'none';
  if (reweight) reweight.style.display = 'none';
  if (alertsEl) alertsEl.style.display = 'none';
}

export function populateSidebar(ticker) {
  var sidebarId = ticker.toLowerCase() + '-sidebar';
  var sidebar = document.getElementById(sidebarId);
  if (!sidebar) return;

  // Don't re-populate if already filled
  if (sidebar.children.length > 0) return;

  var stock = STOCK_DATA[ticker];
  if (!stock) return;

  // Extract N1-N4 directly from STOCK_DATA (not DOM)
  var hypotheses = [];
  if (stock.hypotheses && stock.hypotheses.length > 0) {
    var norm = normaliseScores(stock.hypotheses);
    for (var i = 0; i < stock.hypotheses.length; i++) {
      var h = stock.hypotheses[i];
      hypotheses.push({
        dirClass: h.dirClass || 'dir-neutral',
        label: (h.title || '').replace(/^N\d+:\s*/, ''),
        score: norm[i] + '%'
      });
    }
  }

  // Compute skew from data
  var skew = computeSkewScore(stock);
  var skewDir = skew.direction || 'balanced';
  var skewLabel = skewDir.toUpperCase();
  var skewScoreNum = skew.score || 0;
  var skewScoreStr = (skewScoreNum > 0 ? '+' : '') + skewScoreNum;

  // Three-layer signal data
  var tls = stock.three_layer_signal || {};
  var macSig = tls.macro_signal || 0;
  var secSig = tls.sector_signal || 0;
  var macCls = macSig > 10 ? 'dir-up' : macSig < -10 ? 'dir-down' : 'dir-neutral';
  var secCls = secSig > 10 ? 'dir-up' : secSig < -10 ? 'dir-down' : 'dir-neutral';

  // P/E and Revenue Growth from REFERENCE_DATA / heroMetrics
  var ref = (typeof REFERENCE_DATA !== 'undefined') ? REFERENCE_DATA[ticker] : null;
  var peValue = ' -- ';
  var revGrowthValue = ' -- ';

  // Try heroMetrics first (live-hydrated values)
  if (stock.heroMetrics) {
    for (var mi = 0; mi < stock.heroMetrics.length; mi++) {
      var mLabel = (stock.heroMetrics[mi].label || '').toLowerCase();
      if (mLabel === 'fwd p/e' || mLabel === 'p/e') {
        peValue = stock.heroMetrics[mi].value;
      }
      if (mLabel === 'rev growth' || mLabel === 'revenue growth') {
        revGrowthValue = stock.heroMetrics[mi].value;
      }
    }
  }
  // Fallback to REFERENCE_DATA
  if (ref) {
    if (peValue === ' -- ' && ref.epsForward) {
      var currentP = parseFloat(stock._livePrice || stock.price || stock.current_price || 0);
      if (currentP > 0) peValue = (currentP / ref.epsForward).toFixed(1) + 'x';
    }
    if (revGrowthValue === ' -- ' && ref.revenueGrowth != null) {
      revGrowthValue = (ref.revenueGrowth > 0 ? '+' : '') + ref.revenueGrowth + '%';
    }
  }

  // Price and change
  var livePrice = parseFloat(stock._livePrice || stock.price || stock.current_price || 0);
  var ph = stock.priceHistory;
  var changePct = null;
  if (ph && ph.length >= 2) {
    changePct = ((ph[ph.length - 1] - ph[ph.length - 2]) / ph[ph.length - 2] * 100);
  } else if (stock.freshness && stock.freshness.pricePctChange != null) {
    changePct = stock.freshness.pricePctChange;
  }

  // Valuation Range
  var vr = null;
  var vrBear = 0, vrFair = 0, vrBull = 0, vrZone = '', vrZoneCls = '';
  var vrToBull = '', vrToBear = '';
  // Prefer hero.position_in_range.worlds (full data)
  if (stock.hero && stock.hero.position_in_range && stock.hero.position_in_range.worlds &&
      stock.hero.position_in_range.worlds.length >= 4) {
    var w = stock.hero.position_in_range.worlds;
    vrBear = parseFloat(w[1].price) || 0;
    vrFair = (parseFloat(w[1].price) + parseFloat(w[2].price)) / 2;
    vrBull = parseFloat(w[3].price) || 0;
    vr = { low: vrBear, mid: vrFair, high: vrBull };
  } else if (stock.valuation_range) {
    vr = stock.valuation_range;
    vrBear = vr.low;
    vrFair = vr.mid;
    vrBull = vr.high;
  }

  if (vr && livePrice > 0) {
    if (livePrice < vrBear)      { vrZone = 'RED';   vrZoneCls = 'red'; }
    else if (livePrice > vrFair) { vrZone = 'GREEN'; vrZoneCls = 'green'; }
    else                         { vrZone = 'AMBER'; vrZoneCls = 'amber'; }

    vrToBull = ((vrBull / livePrice - 1) * 100).toFixed(1);
    vrToBear = ((vrBear / livePrice - 1) * 100).toFixed(1);
  }

  // Build HTML
  var html = '';

  // 1. Stock ID
  html += '<div class="hs-stock-id">' +
    '<div class="hs-stock-ticker">' + (stock.tickerFull || stock.ticker || ticker) + '</div>' +
    '<div class="hs-price-row">';
  if (livePrice > 0) {
    html += '<span class="hs-price">A$' + livePrice.toFixed(2) + '</span>';
  }
  if (changePct !== null) {
    var chgCls = changePct >= 0 ? 'pos' : 'neg';
    html += '<span class="hs-change-badge ' + chgCls + '">' +
      (changePct >= 0 ? '+' : '') + changePct.toFixed(1) + '%</span>';
  }
  html += '</div>' +
    '<div class="hs-stock-name">' + (stock.company || '') + '</div>' +
  '</div>';

  // 2. DRIVER TRACKER heading + hypothesis items
  html += '<div class="hs-section-head">Driver Tracker</div>';
  hypotheses.forEach(function(h) {
    html += '<div class="hs-item">' +
      '<div class="hs-dot ' + h.dirClass + '"></div>' +
      '<div class="hs-label">' + h.label + '</div>' +
      '<div class="hs-score ' + h.dirClass + '">' + h.score + '</div>' +
    '</div>';
  });

  // 3. RISK SKEW subheading
  html += '<div class="hs-subhead">Risk Skew</div>';

  // 4. OVERALL SKEW
  html += '<div class="hs-overall-skew">' +
    '<span class="hs-skew-dir ' + skewDir + '">' + skewLabel + '</span>' +
    '<span class="hs-skew-score ' + skewDir + '">' + skewScoreStr + '</span>' +
  '</div>';

  // 5. EXT. ENVIRONMENT
  html += '<div class="hs-subhead">Ext. Environment</div>' +
    '<div class="hs-env-row">' +
      '<div class="hs-dot ' + macCls + '"></div>' +
      '<span class="hs-env-label">Macro</span>' +
      '<span class="hs-env-score">' + (macSig > 0 ? '+' : '') + macSig + '</span>' +
    '</div>' +
    '<div class="hs-env-row">' +
      '<div class="hs-dot ' + secCls + '"></div>' +
      '<span class="hs-env-label">Sector</span>' +
      '<span class="hs-env-score">' + (secSig > 0 ? '+' : '') + secSig + '</span>' +
    '</div>';

  // 6. COMPANY
  html += '<div class="hs-subhead">Company</div>' +
    '<div class="hs-company-row">' +
      '<span class="hs-company-label">P/E</span>' +
      '<span class="hs-company-value">' + peValue + '</span>' +
    '</div>' +
    '<div class="hs-company-row">' +
      '<span class="hs-company-label">Rev Growth</span>' +
      '<span class="hs-company-value">' + revGrowthValue + '</span>' +
    '</div>';

  // 7. VALUATION RANGE
  if (vr && livePrice > 0) {
    var vrRange = vrBull - vrBear || 1;
    var vrCurrPct = Math.min(100, Math.max(0, ((livePrice - vrBear) / vrRange * 100))).toFixed(1);

    html += '<div class="hs-section-head">Valuation Range</div>' +
      '<div class="hs-val-section">' +
        '<div class="hs-val-header">' +
          '<span class="hs-val-zone ' + vrZoneCls + '">' + vrZone + '</span>' +
        '</div>' +
        '<div class="hs-val-levels">' +
          '<span>Bear<br>A$' + vrBear.toFixed(2) + '</span>' +
          '<span>Fair<br>A$' + vrFair.toFixed(2) + '</span>' +
          '<span>Bull<br>A$' + vrBull.toFixed(2) + '</span>' +
        '</div>' +
        '<div class="hs-val-bar">' +
          '<div class="hs-val-marker" style="left:' + vrCurrPct + '%"></div>' +
        '</div>' +
        '<div class="hs-val-distances">' +
          '<span class="neg">' + vrToBear + '% to bear</span>' +
          '<span class="pos">+' + vrToBull + '% to bull</span>' +
        '</div>' +
      '</div>';
  }

  sidebar.innerHTML = html;
}

export function initPortfolioPage() {
  setupUploadZone();
  var savedPortfolio = loadPortfolio();
  if (savedPortfolio && savedPortfolio.length > 0) {
    renderPortfolioFromSaved(savedPortfolio);
  }
}
