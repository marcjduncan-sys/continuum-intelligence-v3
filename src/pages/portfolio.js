// portfolio.js — Portfolio engine
// Extracted from index.html without logic changes

import { STOCK_DATA, REFERENCE_DATA, FRESHNESS_DATA } from '../lib/state.js';
import { computeSkewScore, normaliseScores } from '../lib/dom.js';
import { buildCoverageData } from './home.js';
import { on } from '../lib/data-events.js';

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
  var expo = calcWeights(positions);

  savePortfolio(positions);
  renderPortfolio(positions, expo.totalLong, expo);
}

export function deriveAlignment(skew, weight) {
  if (!skew) return { label: 'Not covered', cls: 'not-covered' };
  var isShort = weight < 0;
  if (skew === 'upside') {
    if (isShort) return { label: 'Contradicts skew', cls: 'contradicts' };
    return { label: 'Aligned with skew', cls: 'aligned' };
  }
  if (skew === 'downside') {
    if (isShort) return { label: 'Aligned with skew', cls: 'aligned' };
    if (weight > 15) return { label: 'Exposure exceeds conviction', cls: 'exceeds' };
    return { label: 'Contradicts skew', cls: 'contradicts' };
  }
  if (skew === 'balanced') {
    if (Math.abs(weight) > 15) return { label: 'Exposure exceeds conviction', cls: 'exceeds' };
    return { label: 'Balanced exposure', cls: 'neutral' };
  }
  return { label: 'N/A', cls: 'not-covered' };
}

function calcWeights(positions) {
  var totalLong = 0, totalShortAbs = 0;
  positions.forEach(function(p) {
    if (p.marketValue === null || p.marketValue === undefined) return;
    if (p.marketValue >= 0) totalLong += p.marketValue;
    else totalShortAbs += Math.abs(p.marketValue);
  });
  positions.forEach(function(p) {
    if (p.marketValue === null || p.marketValue === undefined) {
      p.weight = 0;
    } else if (p.marketValue >= 0) {
      p.weight = totalLong > 0 ? (p.marketValue / totalLong) * 100 : 0;
    } else {
      p.weight = totalShortAbs > 0 ? -(Math.abs(p.marketValue) / totalShortAbs) * 100 : 0;
    }
    p.alignment = deriveAlignment(p.skew, p.weight);
  });
  return {
    totalLong: totalLong,
    totalShortAbs: totalShortAbs,
    netExposure: totalLong - totalShortAbs,
    grossExposure: totalLong + totalShortAbs
  };
}

export function renderPortfolio(positions, totalLong, expo) {
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

  var grossExp = expo.grossExposure || 1;
  var alignedDollar = 0, contraDollar = 0, neutralDollar = 0;
  positions.forEach(function(p) {
    var absMV = Math.abs(p.marketValue || 0);
    if (p.alignment.cls === 'aligned') alignedDollar += absMV;
    else if (p.alignment.cls === 'contradicts' || p.alignment.cls === 'exceeds') contraDollar += absMV;
    else neutralDollar += absMV;
  });
  var alignedWeight = (alignedDollar / grossExp) * 100;
  var contraWeight = (contraDollar / grossExp) * 100;
  var neutralWeight = (neutralDollar / grossExp) * 100;

  document.getElementById('summaryLong').textContent = 'A$' + formatNum(expo.totalLong, 0);
  document.getElementById('summaryShort').textContent = 'A$' + formatNum(expo.totalShortAbs, 0);
  document.getElementById('summaryNet').textContent = 'A$' + formatNum(expo.netExposure, 0);
  document.getElementById('summaryGross').textContent = 'A$' + formatNum(expo.grossExposure, 0);
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

  /* Strategy context bar */
  renderStrategyBar();

  /* Render diagnostics, reweighting, and alerts */
  renderPortfolioDiagnostics(positions, expo.grossExposure);
  renderReweighting(positions, expo.totalLong);
  renderChangeAlerts(positions);
}

export function renderPortfolioFromSaved(positions) {
  var expo = calcWeights(positions);
  renderPortfolio(positions, expo.totalLong, expo);
}

export function formatNum(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  var abs = Math.abs(n);
  if (abs >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (abs >= 1000) return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

function getPersonalisationFund() {
  try {
    var raw = localStorage.getItem('continuum_personalisation_profile');
    if (!raw) return null;
    var data = JSON.parse(raw);
    if (!data || data.version !== 2) return null;
    return (data.state && data.state.fund) ? data.state.fund : null;
  } catch (e) { return null; }
}

function renderStrategyBar() {
  var el = document.getElementById('portfolioStrategyBar');
  if (!el) return;
  var fund = getPersonalisationFund();
  if (!fund || (!fund.strategy && !fund.geography && !fund.benchmark)) {
    el.style.display = 'none';
    return;
  }
  el.innerHTML =
    (fund.strategy ? '<div class="port-sb-item"><span class="port-sb-label">Strategy</span><span class="port-sb-value">' + fund.strategy + '</span></div>' : '') +
    (fund.geography ? '<div class="port-sb-item"><span class="port-sb-label">Geography</span><span class="port-sb-value">' + fund.geography + '</span></div>' : '') +
    (fund.benchmark ? '<div class="port-sb-item"><span class="port-sb-label">Benchmark</span><span class="port-sb-value">' + fund.benchmark + '</span></div>' : '') +
    '<div class="port-sb-item"><span class="port-sb-label">Risk Budget</span><span class="port-sb-value">' + (fund.riskBudget || 10) + '% TE</span></div>';
  el.style.display = '';
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
  var diagGross = positions.reduce(function(s, p) { return s + Math.abs(p.marketValue || 0); }, 0);
  var alignedDollarDiag = positions.reduce(function(s, p) { return s + (p.alignment.cls === 'aligned' ? Math.abs(p.marketValue || 0) : 0); }, 0);
  var alignedWeight = diagGross > 0 ? (alignedDollarDiag / diagGross) * 100 : 0;

  if (alignedWeight > 50) {
    alignmentEl.innerHTML = '<span class="success-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Your book largely reflects our evidence-based view.';
  } else if (alignedWeight > 25) {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Mixed positioning  --  some agreement, some divergence.';
  } else {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Significant divergence. You may see value we do not (or vice versa).';
  }
}

// Extract the bolded stability label from narrativeStability prose
function getSkewStability(ticker) {
  var stock = STOCK_DATA[ticker];
  if (!stock || !stock.narrative || !stock.narrative.narrativeStability) return null;
  var raw = stock.narrative.narrativeStability;
  var match = raw.match(/^<strong>(.*?)<\/strong>/i);
  if (match) return match[1].replace(/\.$/, '').trim();
  // Fallback: first clause before period
  var first = raw.replace(/<[^>]+>/g, '').split(/\.\s/)[0];
  return first.length > 35 ? first.slice(0, 35) + '\u2026' : first;
}

function getSkewMomentum(ticker) {
  var stock = STOCK_DATA[ticker];
  if (!stock || !stock.hero) return null;
  var prev = (stock.hero.previousSkew || '').toLowerCase();
  var curr = (stock.hero.skew || '').toLowerCase();
  if (!prev || !curr || prev === curr) return 'stable';
  if (prev === 'downside' && curr === 'upside') return 'strongly-improving';
  if ((prev === 'downside' && curr === 'balanced') ||
      (prev === 'balanced' && curr === 'upside')) return 'improving';
  if (prev === 'upside' && curr === 'downside') return 'strongly-weakening';
  if ((prev === 'upside' && curr === 'balanced') ||
      (prev === 'balanced' && curr === 'downside')) return 'weakening';
  return 'stable';
}

function stabilityClass(label) {
  if (!label) return 'rw-stab-none';
  var l = label.toLowerCase();
  if (l.includes('high') || l === 'stable' || l.includes('very stable')) return 'rw-stab-high';
  if (l.includes('low') || l.includes('unstable') || l.includes('shift') || l.includes('weak')) return 'rw-stab-low';
  return 'rw-stab-mid'; // moderate / fairly stable / etc.
}

export function renderReweighting(positions, totalValue) {
  var sectionEl = document.getElementById('portfolioReweighting');
  var bodyEl = document.getElementById('reweightBody');
  if (!sectionEl || !bodyEl) return;

  if (positions.length === 0) {
    sectionEl.style.display = 'none';
    return;
  }

  var coverageData = getCoverageData();
  var TC_DATA = getTcData();

  // Separate covered from uncovered
  var covered = positions.filter(function(p) { return coverageData[p.ticker]; });
  var uncovered = positions.filter(function(p) { return !coverageData[p.ticker]; });

  // Calculate evidence scores — long-only model, shorts processed separately
  var longs = covered.filter(function(p) { return p.units >= 0; });
  var shorts = covered.filter(function(p) { return p.units < 0; });
  var baseWeight = longs.length > 0 ? 100 / longs.length : 0;

  var scores = [];

  longs.forEach(function(p) {
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
      if (maxProb > 40) multiplier *= 1.05;
      if (tc.primary === 'uphill') multiplier *= 0.9;
    }

    scores.push({
      ticker: p.ticker,
      company: p.company,
      units: p.units,
      currentPrice: p.currentPrice,
      currentWeight: p.weight,
      skew: cd.skew,
      rawScore: baseWeight * multiplier,
      stability: getSkewStability(p.ticker),
      covered: true
    });
  });

  // Normalize suggested weights to 100% (longs only)
  var totalScore = scores.reduce(function(s, x) { return s + x.rawScore; }, 0);
  scores.forEach(function(s) {
    s.suggestedWeight = totalScore > 0 ? (s.rawScore / totalScore) * 100 : 0;
  });

  // Append covered shorts (outside the weight model)
  shorts.forEach(function(p) {
    var cd = coverageData[p.ticker];
    scores.push({
      ticker: p.ticker,
      company: p.company,
      units: p.units,
      currentPrice: p.currentPrice,
      currentWeight: p.weight,
      skew: cd.skew,
      rawScore: 0,
      suggestedWeight: 0,
      stability: getSkewStability(p.ticker),
      covered: true
    });
  });

  // Append uncovered positions at the bottom
  uncovered.forEach(function(p) {
    scores.push({
      ticker: p.ticker,
      company: p.company,
      units: p.units,
      currentPrice: p.currentPrice,
      currentWeight: p.weight,
      skew: null,
      rawScore: 0,
      suggestedWeight: 0,
      stability: null,
      covered: false
    });
  });

  // Sort: covered longs (by delta desc), covered shorts, uncovered last
  scores.sort(function(a, b) {
    if (a.covered !== b.covered) return a.covered ? -1 : 1;
    var aShort = a.units < 0, bShort = b.units < 0;
    if (aShort !== bShort) return aShort ? 1 : -1;
    return Math.abs(b.suggestedWeight - b.currentWeight) - Math.abs(a.suggestedWeight - a.currentWeight);
  });

  // Strategy context header
  var fund = getPersonalisationFund();
  var strategyHtml = '';
  if (fund && (fund.strategy || fund.geography || fund.benchmark)) {
    strategyHtml = '<div class="rw-strategy-context">' +
      (fund.strategy ? '<span class="rw-sc-pill"><span class="rw-sc-label">Strategy</span><span class="rw-sc-value">' + fund.strategy + '</span></span>' : '') +
      (fund.geography ? '<span class="rw-sc-pill"><span class="rw-sc-label">Geography</span><span class="rw-sc-value">' + fund.geography + '</span></span>' : '') +
      (fund.benchmark ? '<span class="rw-sc-pill"><span class="rw-sc-label">Benchmark</span><span class="rw-sc-value">' + fund.benchmark + '</span></span>' : '') +
      '<span class="rw-sc-pill"><span class="rw-sc-label">Risk Budget</span><span class="rw-sc-value">' + (fund.riskBudget || 10) + '% TE</span></span>' +
    '</div>';
  }

  // Render table rows
  var rows = '';
  scores.forEach(function(s) {
    var isShort = s.units < 0;
    var action, actionCls, deltaCls, sharesDisplay, delta;

    if (!s.covered) {
      // Uncovered: no research data, show position details only
      rows += '<tr class="rw-row-uncovered">' +
        '<td><span class="rw-ticker">' + s.ticker + '</span></td>' +
        '<td>' + s.company + '</td>' +
        '<td><span style="color:var(--text-muted);font-size:0.72rem">No coverage</span></td>' +
        '<td class="rw-units">' + formatNum(s.units, 0) + '</td>' +
        '<td><span class="rw-pct">' + s.currentWeight.toFixed(1) + '%</span></td>' +
        '<td colspan="3" style="color:var(--text-muted);font-size:0.72rem;text-align:center">Not in Continuum coverage</td>' +
        '<td class="rw-shares">--</td>' +
        '<td style="color:var(--text-muted)">--</td>' +
      '</tr>';
      return;
    }

    if (isShort) {
      // Short positions are outside the long-only weight model.
      // Determine action from alignment instead of delta.
      var shortAligned = (s.skew === 'downside' || s.skew === 'balanced');
      sharesDisplay = '--';
      if (shortAligned) {
        action = 'Hold';
        actionCls = 'hold';
        deltaCls = 'hold';
      } else {
        // Short in an upside-skew stock: suggest covering
        action = 'Cover';
        actionCls = 'sell';
        deltaCls = 'reduce';
        if (s.currentPrice && s.currentPrice > 0) {
          sharesDisplay = Math.abs(s.units).toLocaleString('en-AU');
        }
      }
    } else {
      delta = s.suggestedWeight - s.currentWeight;

      // Skew-gated action logic: evidence direction constrains allowable actions
      if (s.skew === 'balanced') {
        // No directional conviction — never add or cut a long position
        action = 'Hold';
        actionCls = 'hold';
        deltaCls = 'hold';
        sharesDisplay = '--';
      } else if (s.skew === 'downside') {
        // Downside skew: never initiate or add. Only reduce if overweight, else hold.
        if (delta < -2) {
          action = 'Sell';
          actionCls = 'sell';
          deltaCls = 'reduce';
        } else {
          action = 'Hold';
          actionCls = 'hold';
          deltaCls = 'hold';
          sharesDisplay = '--';
        }
      } else {
        // Upside skew: full delta logic applies
        if (delta > 2) {
          action = 'Buy';
          actionCls = 'buy';
          deltaCls = 'increase';
        } else if (delta < -2) {
          action = 'Sell';
          actionCls = 'sell';
          deltaCls = 'reduce';
        } else {
          action = 'Hold';
          actionCls = 'hold';
          deltaCls = 'hold';
        }
      }

      // Share amount: |delta%| * totalValue / price = shares to trade
      if (!sharesDisplay) sharesDisplay = '--';
      if (action !== 'Hold' && s.currentPrice && s.currentPrice > 0) {
        var deltaValue = Math.abs(delta / 100) * totalValue;
        sharesDisplay = Math.round(deltaValue / s.currentPrice).toLocaleString('en-AU');
      }
    }

    var skewArrow = s.skew === 'upside' ? '&#9650; UPSIDE' :
                    s.skew === 'downside' ? '&#9660; DOWNSIDE' : '&#9670; BALANCED';
    var skewCls = s.skew;
    // For short positions the long-only weight model doesn't apply
    var suggestedCell = isShort
      ? '<span style="color:var(--text-muted)">--</span>'
      : '<span class="rw-pct">' + s.suggestedWeight.toFixed(1) + '%</span>';
    var deltaCell = isShort
      ? '<span class="rw-delta hold">SHORT</span>'
      : '<span class="rw-delta ' + deltaCls + '">' + (delta >= 0 ? '+' : '') + delta.toFixed(1) + '%</span>';

    // Conviction (narrative stability) + skew momentum arrow
    var stabLabel = s.stability || '--';
    var stabCls = stabilityClass(s.stability);
    var momentum = s.covered ? getSkewMomentum(s.ticker) : null;
    var momentumHtml = '';
    if (momentum && momentum !== 'stable') {
      var mArrow = momentum === 'strongly-improving' ? '&#8648;' :
                   momentum === 'improving'          ? '&#8593;' :
                   momentum === 'strongly-weakening' ? '&#8650;' : '&#8595;';
      var mCls = momentum.includes('improving') ? 'rw-mom-up' : 'rw-mom-down';
      momentumHtml = ' <span class="' + mCls + '">' + mArrow + '</span>';
    }
    var convictionCell = '<span class="rw-stability ' + stabCls + '">' + stabLabel + '</span>' + momentumHtml;

    rows += '<tr>' +
      '<td><span class="rw-ticker">' + s.ticker + '</span></td>' +
      '<td>' + s.company + '</td>' +
      '<td><span class="skew-badge ' + skewCls + '">' + skewArrow + '</span></td>' +
      '<td class="rw-units">' + formatNum(s.units, 0) + '</td>' +
      '<td><span class="rw-pct">' + s.currentWeight.toFixed(1) + '%</span></td>' +
      '<td>' + suggestedCell + '</td>' +
      '<td>' + deltaCell + '</td>' +
      '<td><span class="rw-action ' + actionCls + '">' + action + '</span></td>' +
      '<td class="rw-shares">' + sharesDisplay + '</td>' +
      '<td>' + convictionCell + '</td>' +
    '</tr>';
  });

  bodyEl.innerHTML =
    strategyHtml +
    '<table class="rw-table">' +
      '<thead><tr>' +
        '<th>Ticker</th>' +
        '<th>Company</th>' +
        '<th>Evidence</th>' +
        '<th>Units</th>' +
        '<th>Current</th>' +
        '<th>Suggested</th>' +
        '<th>Delta</th>' +
        '<th>Action</th>' +
        '<th>Share Amount</th>' +
        '<th>Conviction</th>' +
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

  for (var i = 0; i < positions.length; i++) {
    var p = positions[i];
    var ticker = p.ticker;
    var sd = STOCK_DATA[ticker];
    if (!sd) continue;

    var fd = FRESHNESS_DATA[ticker];
    var weightPct = Math.abs(Math.round(p.weight || 0));
    var weightStr = 'Affects ' + weightPct + '% of portfolio';

    // 1. OVERCORRECTION (critical)
    if (sd._alertState === 'OVERCORRECTION' && sd._overcorrection && sd._overcorrection.active) {
      var oc = sd._overcorrection;
      var dirLabel = oc.direction === 'up' ? 'upside' : 'downside';
      alerts.push({
        type: 'critical',
        icon: '\uD83D\uDD34',
        title: ticker + ': ' + dirLabel + ' overcorrection signal',
        text: oc.message || '',
        ticker: ticker,
        time: 'Triggered ' + (oc.triggerDate || ''),
        impact: weightStr + ' \u00B7 Review by ' + (oc.reviewDate || '')
      });
      continue;
    }

    // 2. CATALYST DUE/OVERDUE
    if (fd && fd.nearestCatalystDays !== undefined &&
        fd.nearestCatalystDays <= 7 && fd.nearestCatalystDays >= -14) {
      var days = fd.nearestCatalystDays;
      var dayStr = days < 0
        ? Math.abs(days) + (Math.abs(days) === 1 ? ' day' : ' days') + ' overdue'
        : days === 0 ? 'today'
        : 'in ' + days + (days === 1 ? ' day' : ' days');
      alerts.push({
        type: 'warning',
        icon: '\uD83D\uDFE1',
        title: ticker + ': catalyst ' + (days < 0 ? 'overdue' : 'approaching'),
        text: (fd.nearestCatalyst || '') + ' \u00B7 ' + (fd.nearestCatalystDate || ''),
        ticker: ticker,
        time: dayStr,
        impact: weightStr
      });
      continue;
    }

    // 3. STALE THESIS
    if (fd && fd.status === 'STALE') {
      alerts.push({
        type: 'warning',
        icon: '\uD83D\uDFE1',
        title: ticker + ': thesis stale',
        text: 'Last reviewed ' + (fd.reviewDate || '') + '. ' + (fd.nearestCatalyst || '') + ' may have passed.',
        ticker: ticker,
        time: fd.reviewDate || '',
        impact: weightStr
      });
      continue;
    }

    // 4. SKEW MOMENTUM
    var hero = sd.hero || {};
    var prevSkew = (hero.previousSkew || '').toLowerCase();
    var currSkew = (hero.skew || '').toLowerCase();
    if (prevSkew && currSkew && prevSkew !== currSkew) {
      alerts.push({
        type: 'info',
        icon: '\uD83D\uDD35',
        title: ticker + ': skew direction changed',
        text: (hero.previousSkew || '') + ' \u2192 ' + (hero.skew || ''),
        ticker: ticker,
        time: '',
        impact: weightStr
      });
    }
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
            (a.time ? '<span>\u23F1 ' + a.time + '</span>' : '') +
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

  /* Hide diagnostics, reweighting, alerts, and strategy bar */
  var diag = document.getElementById('portfolioDiagnostics');
  var reweight = document.getElementById('portfolioReweighting');
  var alertsEl = document.getElementById('changeAlertsSection');
  var strategyBar = document.getElementById('portfolioStrategyBar');
  if (diag) diag.style.display = 'none';
  if (reweight) reweight.style.display = 'none';
  if (alertsEl) alertsEl.style.display = 'none';
  if (strategyBar) strategyBar.style.display = 'none';
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
  var skew = stock._skew || computeSkewScore(stock);
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

  // Listen for STOCK_DATA changes to refresh portfolio with live prices
  on('stock:updated', function() {
    COVERAGE_DATA = null; // invalidate stale cache

    var page = document.getElementById('page-portfolio');
    if (!page || !page.classList.contains('active')) return;

    var positions = loadPortfolio();
    if (!positions || positions.length === 0) return;

    // Recalculate prices and P&L from fresh STOCK_DATA
    var coverageData = getCoverageData();
    for (var i = 0; i < positions.length; i++) {
      var p = positions[i];
      var covered = coverageData[p.ticker];
      if (covered) {
        p.currentPrice = covered.price;
        p.marketValue = p.currentPrice ? p.units * p.currentPrice : null;
        p.costBasis = p.units * p.avgCost;
        p.pnlDollar = p.marketValue !== null ? p.marketValue - p.costBasis : null;
        p.pnlPercent = p.costBasis > 0 && p.pnlDollar !== null ? (p.pnlDollar / p.costBasis) * 100 : null;
        p.skew = covered.skew;
      }
    }
    var expo = calcWeights(positions);

    savePortfolio(positions);
    renderPortfolio(positions, expo.totalLong, expo);
  });
}
