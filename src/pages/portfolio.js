// portfolio.js – Portfolio engine
// Extracted from index.html without logic changes

import { STOCK_DATA, REFERENCE_DATA, TC_DATA } from '../lib/state.js';
import { computeSkewScore, normaliseScores } from '../lib/dom.js';
import { buildCoverageData } from './home.js';
import { on } from '../lib/data-events.js';
import { API_BASE } from '../lib/api-config.js';
import { formatPrice, formatPercent, formatSignedPercent } from '../lib/format.js';

// Coverage data matching portal reports (built dynamically from STOCK_DATA)
let COVERAGE_DATA = null;

/* ------------------------------------------------------------------ */
/*  Pure helpers – gross-exposure alignment engine                     */
/* ------------------------------------------------------------------ */

/** Signed exposure: positive for longs, negative for shorts */
export function calculateExposureDollar(position) {
  if (!position.currentPrice) return 0;
  return position.units * position.currentPrice;
}

/** Sum of |exposure| across all positions with valid prices */
export function calculateGrossExposure(positions) {
  let total = 0;
  for (let i = 0; i < positions.length; i++) {
    total += Math.abs(calculateExposureDollar(positions[i]));
  }
  return total;
}

/** Weight as % of gross exposure (always positive) */
export function calculateCurrentWeightPct(absExposure, grossExposure) {
  return grossExposure > 0 ? (absExposure / grossExposure) * 100 : 0;
}

/**
 * Binary directional alignment.
 * positionDirection: 'long' | 'short'
 * evidenceSkew: 'upside' | 'downside' | 'balanced' | null
 */
export function classifyAlignment(positionDirection, evidenceSkew) {
  if (!evidenceSkew) return { label: 'Not covered', cls: 'not-covered' };
  if (evidenceSkew === 'balanced') return { label: 'Neutral', cls: 'neutral' };
  if (positionDirection === 'long') {
    if (evidenceSkew === 'upside') return { label: 'Aligned', cls: 'aligned' };
    return { label: 'Contradictory', cls: 'contradicts' };
  }
  // short
  if (evidenceSkew === 'downside') return { label: 'Aligned', cls: 'aligned' };
  return { label: 'Contradictory', cls: 'contradicts' };
}

function getCoverageData() {
  if (!COVERAGE_DATA) COVERAGE_DATA = buildCoverageData();
  return COVERAGE_DATA;
}

function getTcData() {
  return TC_DATA;
}

export function setupUploadZone() {
  const zone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  if (!zone || !fileInput) return;

  zone.addEventListener('click', function() { fileInput.click(); });
  zone.addEventListener('dragover', function(e) { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', function() { zone.classList.remove('dragover'); });
  zone.addEventListener('drop', function(e) {
    e.preventDefault();
    zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });
}

export function handleFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const reader = new FileReader();

  if (ext === 'csv') {
    reader.onload = function(e) {
      const rows = parseCSV(e.target.result);
      processPortfolioData(rows);
    };
    reader.readAsText(file);
  } else {
    // Lazy-load SheetJS on demand for Excel files
    reader.onload = function(e) {
      const processExcel = function() {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = window.XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const rows = window.XLSX.utils.sheet_to_json(sheet);
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
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(function(h) { return h.trim(); });
  return lines.slice(1).map(function(line) {
    const vals = line.split(',').map(function(v) { return v.trim(); });
    const obj = {};
    headers.forEach(function(h, i) { obj[h] = vals[i] || ''; });
    return obj;
  });
}

export function normalizeTicker(raw) {
  if (!raw) return '';
  return raw.toString().toUpperCase().replace(/\.AX$/i, '').trim();
}

export function getCol(row, names) {
  for (let ni = 0; ni < names.length; ni++) {
    var n = names[ni];
    const keys = Object.keys(row);
    const match = keys.find(function(k) {
      return k.toLowerCase().replace(/[^a-z]/g, '') === n.toLowerCase().replace(/[^a-z]/g, '');
    });
    if (match && row[match] !== undefined && row[match] !== '') return row[match];
  }
  return null;
}

export function processPortfolioData(rows) {
  const coverageData = getCoverageData();
  const positions = [];
  for (let ri = 0; ri < rows.length; ri++) {
    const row = rows[ri];
    const ticker = normalizeTicker(getCol(row, ['Ticker', 'ASX', 'ASXCode', 'Code', 'Symbol', 'Stock']));
    const units = parseFloat(getCol(row, ['Units', 'Quantity', 'Qty', 'Shares', 'Volume']));
    const avgCost = parseFloat(getCol(row, ['AvgCost', 'AverageCost', 'CostBasis', 'Cost', 'Price', 'BuyPrice', 'AvgPrice']));

    if (!ticker || isNaN(units) || isNaN(avgCost)) continue;

    const covered = coverageData[ticker];
    const currentPrice = covered ? covered.price : null;
    const company = covered ? covered.company : ticker;
    const skew = covered ? covered.skew : null;

    const marketValue = currentPrice ? units * currentPrice : null;
    const costBasis = units * avgCost;
    const pnlDollar = marketValue !== null ? marketValue - costBasis : null;
    const pnlPercent = costBasis > 0 && pnlDollar !== null ? (pnlDollar / costBasis) * 100 : null;

    positions.push({ ticker: ticker, company: company, units: units, avgCost: avgCost, currentPrice: currentPrice, marketValue: marketValue, costBasis: costBasis, pnlDollar: pnlDollar, pnlPercent: pnlPercent, skew: skew });
  }

  if (positions.length === 0) {
    alert('No valid positions found. Expected columns: Ticker, Units, Avg Cost');
    return;
  }

  /* Calculate gross-exposure-based weights */
  const grossExposure = calculateGrossExposure(positions);
  positions.forEach(function(p) {
    p.exposureDollar = calculateExposureDollar(p);
    p.weight = calculateCurrentWeightPct(Math.abs(p.exposureDollar), grossExposure);
    const dir = p.units >= 0 ? 'long' : 'short';
    p.alignment = classifyAlignment(dir, p.skew);
  });

  savePortfolio(positions);
  renderPortfolio(positions, grossExposure);
  _syncPortfolioToPMDatabase(positions, grossExposure);
}

/** @deprecated Use classifyAlignment() instead. Kept for backward compatibility. */
export function deriveAlignment(skew, weight, isShort) {
  const dir = isShort ? 'short' : 'long';
  return classifyAlignment(dir, skew);
}

export function renderPortfolio(positions, grossExposure) {
  const body = document.getElementById('portfolioBody');
  const table = document.getElementById('portfolioTable');
  const summary = document.getElementById('portfolioSummary');
  const actions = document.getElementById('portfolioActions');
  const zone = document.getElementById('uploadZone');

  body.innerHTML = '';

  positions.sort(function(a, b) { return Math.abs(b.exposureDollar || b.marketValue || 0) - Math.abs(a.exposureDollar || a.marketValue || 0); });

  for (let pi = 0; pi < positions.length; pi++) {
    const p = positions[pi];
    const tr = document.createElement('tr');
    const coverageData = getCoverageData();
    if (coverageData[p.ticker]) {
      tr.setAttribute('onclick', "navigate('report-" + p.ticker + "')");
    }

    const pnlClass = p.pnlDollar >= 0 ? 'td-pnl-pos' : 'td-pnl-neg';
    const skewBadge = p.skew ? '<span class="skew-badge ' + p.skew + '">' + (p.skew === 'upside' ? '&#9650; UPSIDE' : p.skew === 'downside' ? '&#9660; DOWNSIDE' : '&#9670; BALANCED') + '</span>' : '<span style="color:var(--text-muted)">N/A</span>';

    const expDollar = p.exposureDollar != null ? p.exposureDollar : (p.marketValue || 0);
    const expSign = expDollar >= 0 ? '+' : '';
    const expFormatted = p.currentPrice ? expSign + 'A$' + formatNum(expDollar, 0) : 'N/A';

    tr.innerHTML =
      '<td class="td-ticker">' + p.ticker + '</td>' +
      '<td>' + p.company + '</td>' +
      '<td class="td-mono">' + formatNum(p.units, 0) + '</td>' +
      '<td class="td-mono">A$' + formatNum(p.avgCost, 2) + '</td>' +
      '<td class="td-mono">' + (p.currentPrice ? 'A$' + formatNum(p.currentPrice, 2) : 'N/A') + '</td>' +
      '<td class="' + pnlClass + '">' + (p.pnlDollar !== null ? (p.pnlDollar >= 0 ? '+' : '') + 'A$' + formatNum(p.pnlDollar, 0) : 'N/A') + '</td>' +
      '<td class="' + pnlClass + '">' + (p.pnlPercent !== null ? (p.pnlPercent >= 0 ? '+' : '') + formatNum(p.pnlPercent, 1) + '%' : 'N/A') + '</td>' +
      '<td class="td-mono">' + expFormatted + '</td>' +
      '<td class="td-mono">' + formatNum(p.weight, 1) + '%</td>' +
      '<td>' + skewBadge + '</td>' +
      '<td><span class="alignment-badge ' + p.alignment.cls + '">' + p.alignment.label + '</span></td>';

    body.appendChild(tr);
  }

  /* Footer row */
  let totalLong = 0, totalShortAbs = 0;
  positions.forEach(function(p) {
    const exp = p.exposureDollar != null ? p.exposureDollar : (p.marketValue || 0);
    if (exp >= 0) totalLong += exp;
    else totalShortAbs += Math.abs(exp);
  });
  const netExposure = totalLong - totalShortAbs;
  const grossCalc = totalLong + totalShortAbs;

  const footer = document.createElement('tr');
  footer.className = 'portfolio-footer';
  footer.innerHTML =
    '<td colspan="8" class="portfolio-footer-summary">' +
      'Long: A$' + formatNum(totalLong, 0) +
      ' &nbsp;|&nbsp; Short: A$' + formatNum(totalShortAbs, 0) +
      ' &nbsp;|&nbsp; Net: A$' + formatNum(netExposure, 0) +
      ' &nbsp;|&nbsp; Gross: A$' + formatNum(grossCalc, 0) +
    '</td>' +
    '<td class="td-mono portfolio-footer-summary">100.0%</td>' +
    '<td colspan="2"></td>';
  body.appendChild(footer);

  /* Summary */
  const totalPnL = positions.reduce(function(s, p) { return s + (p.pnlDollar || 0); }, 0);
  const totalCost = positions.reduce(function(s, p) { return s + p.costBasis; }, 0);
  const totalPnLPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;

  let alignedWeight = 0, contraWeight = 0, neutralWeight = 0;
  positions.forEach(function(p) {
    if (p.alignment.cls === 'aligned') alignedWeight += p.weight;
    else if (p.alignment.cls === 'contradicts') contraWeight += p.weight;
    else neutralWeight += p.weight;
  });

  document.getElementById('summaryPositions').textContent = String(positions.length);
  // Reset async-populated fields to "--" (will be updated when analytics arrive)
  const concResetEl = document.getElementById('summaryConcentration');
  if (concResetEl) { concResetEl.textContent = '--'; concResetEl.className = 'portfolio-summary-value'; }
  const flagsResetEl = document.getElementById('summaryFlags');
  if (flagsResetEl) flagsResetEl.textContent = '--';
  // Hide stale concentration detail until fresh analytics arrive
  const concDetailEl = document.getElementById('portConcentrationDetail');
  if (concDetailEl) concDetailEl.style.display = 'none';
  document.getElementById('summaryNet').textContent = 'A$' + formatNum(netExposure, 0);
  document.getElementById('summaryGross').textContent = 'A$' + formatNum(grossCalc, 0);
  const pnlEl = document.getElementById('summaryPnL');
  pnlEl.textContent = (totalPnL >= 0 ? '+' : '') + 'A$' + formatNum(totalPnL, 0) + ' (' + (totalPnLPct >= 0 ? '+' : '') + formatNum(totalPnLPct, 1) + '%)';
  pnlEl.className = 'portfolio-summary-value ' + (totalPnL >= 0 ? 'positive' : 'negative');
  document.getElementById('summaryAligned').textContent = formatNum(alignedWeight, 1) + '%';
  document.getElementById('summaryContra').textContent = formatNum(contraWeight, 1) + '%';

  /* Show/hide elements */
  zone.style.display = 'none';
  table.style.display = '';
  summary.style.display = '';
  actions.style.display = '';

  /* Render diagnostics, reweighting, and alerts */
  renderPortfolioDiagnostics(positions, grossExposure);
  renderReweighting(positions, grossExposure);
  renderMandateBreaches(positions, grossExposure);
}

export function renderPortfolioFromSaved(positions) {
  const grossExposure = calculateGrossExposure(positions);
  positions.forEach(function(p) {
    p.exposureDollar = calculateExposureDollar(p);
    p.weight = calculateCurrentWeightPct(Math.abs(p.exposureDollar), grossExposure);
    const dir = p.units >= 0 ? 'long' : 'short';
    p.alignment = classifyAlignment(dir, p.skew);
  });
  renderPortfolio(positions, grossExposure);
  // Ensure PM database has current portfolio state (handles page refresh,
  // live price updates, and recovery from failed initial sync)
  _syncPortfolioToPMDatabase(positions, grossExposure);
}

export function formatNum(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  const abs = Math.abs(n);
  if (abs >= 1000000) return formatPrice(n / 1000000, 1) + 'M';
  if (abs >= 1000) return n.toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return formatPrice(n, decimals);
}

export function renderPortfolioDiagnostics(positions, grossExposure) {
  const diagnosticsEl = document.getElementById('portfolioDiagnostics');
  if (!diagnosticsEl) return;
  diagnosticsEl.style.display = '';

  const TC_DATA = getTcData();
  const hypothesisValues = { n1: 0, n2: 0, n3: 0, n4: 0, unknown: 0 };

  positions.forEach(function(p) {
    const data = TC_DATA[p.ticker];
    const absVal = Math.abs(p.marketValue || 0);
    if (!data) {
      hypothesisValues.unknown += absVal;
      return;
    }
    const tier = data.primary === 'uphill' ? 'n2' : data.primary;
    hypothesisValues[tier] += absVal;
  });

  const tiers = ['n1', 'n2', 'n3', 'n4'];
  tiers.forEach(function(tier) {
    const pct = grossExposure > 0 ? (hypothesisValues[tier] / grossExposure) * 100 : 0;
    const segment = document.getElementById('dna' + tier.toUpperCase());
    const pctEl = document.getElementById('pct' + tier.toUpperCase());
    const valEl = document.getElementById('val' + tier.toUpperCase());

    if (segment) {
      segment.style.width = Math.max(pct, 5) + '%';
      segment.style.display = pct > 0 ? 'flex' : 'none';
    }
    if (pctEl) pctEl.textContent = formatNum(pct, 0) + '%';
    if (valEl) valEl.textContent = 'A$' + formatNum(hypothesisValues[tier], 0);
  });

  const maxTier = tiers.reduce(function(a, b) { return hypothesisValues[a] > hypothesisValues[b] ? a : b; });
  const maxPct = grossExposure > 0 ? (hypothesisValues[maxTier] / grossExposure) * 100 : 0;
  const concentrationEl = document.getElementById('portConcentrationAlert');

  if (maxPct > 60) {
    concentrationEl.innerHTML = '<span class="alert-highlight">High concentration risk:</span> ' + formatNum(maxPct, 0) + '% of your book aligns with ' + maxTier.toUpperCase() + '. If this hypothesis is wrong, significant downside.';
  } else if (maxPct > 40) {
    concentrationEl.innerHTML = '<span class="alert-highlight">Moderate concentration:</span> ' + formatNum(maxPct, 0) + '% in ' + maxTier.toUpperCase() + '. Consider diversification across other hypotheses.';
  } else {
    concentrationEl.innerHTML = '<span class="success-highlight">Well diversified</span> across hypotheses. No single scenario dominates your portfolio.';
  }

  const contrarianEl = document.getElementById('portContrarianOpp');
  const contrarianPositions = positions.filter(function(p) {
    const data = TC_DATA[p.ticker];
    return data && data.primary === 'uphill';
  });

  if (contrarianPositions.length > 0) {
    const names = contrarianPositions.slice(0, 3).map(function(p) { return p.ticker; }).join(', ');
    const more = contrarianPositions.length > 3 ? ' +' + (contrarianPositions.length - 3) + ' more' : '';
    contrarianEl.innerHTML = '<strong>' + names + more + '</strong>  --  Your view differs from all four Continuum hypotheses. High conviction required, but potential alpha if correct.';
  } else {
    contrarianEl.innerHTML = 'Your positions generally align with at least one Continuum hypothesis. No extreme contrarian bets detected.';
  }

  const hedgeEl = document.getElementById('portHedgeGaps');
  const missingTiers = tiers.filter(function(tier) { return hypothesisValues[tier] === 0; });

  if (missingTiers.length > 0) {
    const tierNames = { n1: 'N1 (Growth/Recovery)', n2: 'N2 (Base Case)', n3: 'N3 (Downside)', n4: 'N4 (Disruption)' };
    hedgeEl.innerHTML = 'You have <strong>zero exposure</strong> to: ' + missingTiers.map(function(t) { return tierNames[t]; }).join(', ') + '. Consider whether this creates blind spots if these scenarios play out.';
  } else {
    hedgeEl.innerHTML = '<span class="success-highlight">Comprehensive coverage.</span> Your portfolio spans all four hypothesis types.';
  }

  const alignmentEl = document.getElementById('portAlignmentScore');
  const alignedWeight = positions.reduce(function(s, p) { return s + (p.alignment.cls === 'aligned' ? p.weight : 0); }, 0);

  if (alignedWeight > 50) {
    alignmentEl.innerHTML = '<span class="success-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Your book largely reflects our evidence-based view.';
  } else if (alignedWeight > 25) {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Mixed positioning  --  some agreement, some divergence.';
  } else {
    alignmentEl.innerHTML = '<span class="alert-highlight">' + formatNum(alignedWeight, 0) + '% aligned</span> with Continuum. Significant divergence. You may see value we do not (or vice versa).';
  }
}

/**
 * Render mandate compliance flags using the user's personalisation settings.
 * Falls back to house defaults if no personalisation is configured.
 */
export function renderMandateBreaches(positions, grossExposure) {
  const container = document.getElementById('portfolioMandateBreaches');
  if (!container) return;
  if (grossExposure <= 0) { container.style.display = 'none'; return; }

  const ctx = (typeof window.pnGetPersonalisationContext === 'function')
    ? window.pnGetPersonalisationContext() : null;
  const mandate = (ctx && ctx.mandate) ? ctx.mandate : {};

  // Mandate values are stored as whole percentages (15 = 15%); convert to decimals
  const maxSingle = (mandate.maxPositionSize || 15) / 100;
  const maxTop5 = 0.50; // not yet in mandate; house default
  const maxSector = (mandate.sectorCap || 35) / 100;
  const cashMin = (mandate.cashRangeMin || 3) / 100;
  const cashMax = (mandate.cashRangeMax || 25) / 100;

  const isCustom = mandate.maxPositionSize || mandate.sectorCap ||
    mandate.cashRangeMin || mandate.cashRangeMax;

  // Sort positions by absolute exposure descending
  const sorted = positions.slice().sort(function(a, b) {
    return Math.abs(b.exposureDollar || 0) - Math.abs(a.exposureDollar || 0);
  });

  const coverageData = getCoverageData();
  const flags = [];

  // Single-name check
  sorted.forEach(function(p) {
    const wt = Math.abs(p.exposureDollar || 0) / grossExposure;
    if (wt > maxSingle) {
      flags.push({
        severity: 'breach',
        text: p.ticker + ' at ' + formatPercent(wt * 100) + ' exceeds ' + formatPercent(maxSingle * 100, 0) + ' single-name limit'
      });
    }
  });

  // Top 5 check
  let top5Weight = 0;
  for (let i = 0; i < Math.min(5, sorted.length); i++) {
    top5Weight += Math.abs(sorted[i].exposureDollar || 0) / grossExposure;
  }
  if (top5Weight > maxTop5) {
    flags.push({
      severity: 'breach',
      text: 'Top 5 concentration: ' + formatPercent(top5Weight * 100) + ' exceeds ' + formatPercent(maxTop5 * 100, 0) + ' limit'
    });
  }

  // Sector check
  const sectorWeights = {};
  positions.forEach(function(p) {
    const sector = (coverageData[p.ticker] && coverageData[p.ticker].sector) || 'Unclassified';
    if (!sectorWeights[sector]) sectorWeights[sector] = 0;
    sectorWeights[sector] += Math.abs(p.exposureDollar || 0) / grossExposure;
  });
  Object.keys(sectorWeights).forEach(function(s) {
    if (s !== 'Unclassified' && sectorWeights[s] > maxSector) {
      flags.push({
        severity: 'breach',
        text: s + ' sector at ' + formatPercent(sectorWeights[s] * 100) + ' exceeds ' + formatPercent(maxSector * 100, 0) + ' sector limit'
      });
    }
  });

  // Cash check (portfolio page uses 5% notional cash buffer in sync)
  const cashEst = 0.05;
  if (cashEst < cashMin) {
    flags.push({
      severity: 'warning',
      text: 'Estimated cash at ' + formatPercent(cashEst * 100, 0) + ' is below ' + formatPercent(cashMin * 100, 0) + ' minimum'
    });
  }

  // Build HTML
  let html = '<div class="port-mandate-header">' +
    '<div class="port-mandate-title">Mandate Compliance</div>' +
    '<div class="port-mandate-subtitle">' +
      (isCustom ? 'Checked against your personalised mandate'
                : 'Using house defaults. Set your mandate in Personalisation to customise.') +
    '</div>' +
  '</div>';

  if (flags.length === 0) {
    html += '<div class="port-mandate-clear">All position limits within mandate</div>';
  } else {
    html += '<div class="port-mandate-flags">';
    flags.forEach(function(f) {
      const cls = f.severity === 'breach' ? 'port-mandate-flag-breach' : 'port-mandate-flag-warn';
      const icon = f.severity === 'breach' ? '!' : 'i';
      html += '<div class="port-mandate-flag ' + cls + '">' +
        '<span class="port-mandate-flag-icon">' + icon + '</span>' +
        '<span class="port-mandate-flag-msg">' + _escText(f.text) + '</span>' +
      '</div>';
    });
    html += '</div>';
  }

  container.innerHTML = html;
  container.style.display = '';
}

/**
 * Calculate evidence-aligned reweighting scores for portfolio positions.
 * Exported for testability. Pure function – no DOM access.
 *
 * @param {Array} covered - positions filtered to Continuum-covered tickers
 * @param {Object} coverageData - { [ticker]: { skew, price, company } }
 * @param {Object} tcData - TC_DATA object { [ticker]: { n1, n2, n3, n4, primary } }
 * @param {number} grossExposure - sum of abs(exposure) across all portfolio positions
 * @returns {Array} scored positions with suggestedWeight, action, shareAction
 */
export function calculateReweightingScores(covered, coverageData, tcData, grossExposure) {
  const GRACE_PCT = 5.0;
  const baseWeight = covered.length > 0 ? 100 / covered.length : 0;
  const scores = [];

  covered.forEach(function(p) {
    const cd = coverageData[p.ticker];
    const tc = tcData[p.ticker];
    const isShort = p.units < 0;
    let rawScore;

    const contradicting = (!isShort && cd.skew === 'downside') ||
                        (isShort && cd.skew === 'upside');

    if (contradicting) {
      rawScore = 0;
    } else {
      let multiplier = 1.0;
      const aligned = (!isShort && cd.skew === 'upside') ||
                    (isShort && cd.skew === 'downside');
      if (aligned) multiplier = 1.3;

      if (tc) {
        const probs = [tc.n1.prob, tc.n2.prob, tc.n3.prob, tc.n4.prob];
        const maxProb = Math.max.apply(null, probs);
        if (maxProb > 40) multiplier *= 1.05;
        if (tc.primary === 'uphill') multiplier *= 0.9;
      }

      rawScore = baseWeight * multiplier;
    }

    scores.push({
      ticker: p.ticker,
      company: p.company,
      units: p.units,
      currentPrice: p.currentPrice,
      currentWeight: p.weight,
      skew: cd.skew,
      isShort: isShort,
      rawScore: rawScore
    });
  });

  // Normalise: only non-zero scores participate in the denominator
  const totalScore = scores.reduce(function(s, x) { return s + x.rawScore; }, 0);
  scores.forEach(function(s) {
    if (s.rawScore === 0) {
      s.suggestedWeight = 0;
    } else {
      s.suggestedWeight = totalScore > 0 ? (s.rawScore / totalScore) * 100 : 0;
    }
  });

  // Derive action + share amount using uniform 5% grace band
  scores.forEach(function(s) {
    const delta = s.suggestedWeight - s.currentWeight;
    s.delta = delta;

    if (!s.isShort) {
      // Long positions
      if (s.skew === 'downside' && s.currentWeight > 0) {
        s.action = 'Sell';
        s.actionCls = 'sell';
        s.deltaCls = 'reduce';
        s.shareAction = formatNum(Math.abs(s.units), 0);
      } else if (delta > GRACE_PCT) {
        s.action = 'Buy';
        s.actionCls = 'buy';
        s.deltaCls = 'increase';
        s.shareAction = s.currentPrice > 0
          ? formatNum(Math.round(Math.abs(delta / 100) * grossExposure / s.currentPrice), 0)
          : '--';
      } else if (delta < -GRACE_PCT) {
        s.action = 'Sell';
        s.actionCls = 'sell';
        s.deltaCls = 'reduce';
        s.shareAction = s.currentPrice > 0
          ? formatNum(Math.round(Math.abs(delta / 100) * grossExposure / s.currentPrice), 0)
          : '--';
      } else {
        s.action = 'Hold';
        s.actionCls = 'hold';
        s.deltaCls = 'hold';
        s.shareAction = '--';
      }
    } else {
      // Short positions
      if (s.skew === 'upside' && s.currentWeight > 0) {
        s.action = 'Buy to Close';
        s.actionCls = 'close-short';
        s.deltaCls = 'increase';
        s.shareAction = formatNum(Math.abs(s.units), 0);
      } else if (delta > GRACE_PCT) {
        s.action = 'Increase Short';
        s.actionCls = 'increase-short';
        s.deltaCls = 'increase';
        s.shareAction = s.currentPrice > 0
          ? formatNum(Math.round(Math.abs(delta / 100) * grossExposure / s.currentPrice), 0)
          : '--';
      } else if (delta < -GRACE_PCT) {
        s.action = 'Reduce Short';
        s.actionCls = 'reduce-short';
        s.deltaCls = 'reduce';
        s.shareAction = s.currentPrice > 0
          ? formatNum(Math.round(Math.abs(delta / 100) * grossExposure / s.currentPrice), 0)
          : '--';
      } else {
        s.action = 'Hold';
        s.actionCls = 'hold';
        s.deltaCls = 'hold';
        s.shareAction = '--';
      }
    }
  });

  // De minimis: positions under 0.25% of gross get Hold to avoid noise
  const DE_MINIMIS_PCT = 0.25;
  scores.forEach(function(s) {
    if (s.currentWeight < DE_MINIMIS_PCT && s.suggestedWeight < DE_MINIMIS_PCT) {
      s.action = 'Hold';
      s.actionCls = 'hold';
      s.deltaCls = 'hold';
      s.shareAction = 'De minimis';
    }
  });

  // Sort by largest |delta|
  scores.sort(function(a, b) { return Math.abs(b.delta) - Math.abs(a.delta); });

  return scores;
}

export function renderReweighting(positions, grossExposure) {
  const sectionEl = document.getElementById('portfolioReweighting');
  const bodyEl = document.getElementById('reweightBody');
  if (!sectionEl || !bodyEl) return;

  const coverageData = getCoverageData();
  const tcData = getTcData();

  const covered = positions.filter(function(p) { return coverageData[p.ticker]; });
  if (covered.length === 0) {
    sectionEl.style.display = 'none';
    return;
  }

  const scores = calculateReweightingScores(covered, coverageData, tcData, grossExposure);

  let rows = '';
  scores.forEach(function(s) {
    const skewArrow = s.skew === 'upside' ? '&#9650; UPSIDE' :
                    s.skew === 'downside' ? '&#9660; DOWNSIDE' : '&#9670; BALANCED';
    const skewCls = s.skew;

    rows += '<tr>' +
      '<td><span class="rw-ticker">' + s.ticker + '</span></td>' +
      '<td>' + s.company + '</td>' +
      '<td><span class="skew-badge ' + skewCls + '">' + skewArrow + '</span></td>' +
      '<td class="rw-units">' + formatNum(s.units, 0) + '</td>' +
      '<td><span class="rw-pct">' + formatPercent(s.currentWeight) + '</span></td>' +
      '<td><span class="rw-pct">' + formatPercent(s.suggestedWeight) + '</span></td>' +
      '<td><span class="rw-delta ' + s.deltaCls + '">' + formatSignedPercent(s.delta) + '</span></td>' +
      '<td><span class="rw-action ' + s.actionCls + '">' + s.action + '</span></td>' +
      '<td class="rw-shares">' + s.shareAction + '</td>' +
    '</tr>';
  });

  bodyEl.innerHTML =
    '<table class="rw-table">' +
      '<thead><tr>' +
        '<th>Ticker</th>' +
        '<th>Company</th>' +
        '<th>Evidence</th>' +
        '<th>Units</th>' +
        '<th>Current Weight %</th>' +
        '<th>Suggested Weight %</th>' +
        '<th>Delta %</th>' +
        '<th>Rebalance Action</th>' +
        '<th>Shares</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table>' +
    '<p class="rw-helper-note">Current weights are based on gross exposure. Suggested weights reflect evidence alignment across covered names.</p>';

  sectionEl.style.display = '';
}

/* renderChangeAlerts removed -- was hardcoded demo data (XRO, WOW, CSL, WTC).
   Real alerting is handled by thesis-monitor.js and api/insights.py. */

export function savePortfolio(positions) {
  try { localStorage.setItem('continuum-portfolio', JSON.stringify(positions)); } catch(e) { console.error('[Portfolio] Failed to save portfolio to localStorage:', e); }
}

export function loadPortfolio() {
  try { const d = localStorage.getItem('continuum-portfolio'); return d ? JSON.parse(d) : null; } catch(e) { return null; }
}

export function clearPortfolio() {
  localStorage.removeItem('continuum-portfolio');
  _pmPortfolioId = null;
  if (typeof window.pnSetPortfolioId === 'function') {
    window.pnSetPortfolioId('');
  }
  // Notify PM panel that portfolio was cleared
  window.dispatchEvent(new CustomEvent('ci:portfolio:cleared'));
  document.getElementById('uploadZone').style.display = '';
  document.getElementById('portfolioTable').style.display = 'none';
  document.getElementById('portfolioSummary').style.display = 'none';
  document.getElementById('portfolioActions').style.display = 'none';
  document.getElementById('portfolioBody').innerHTML = '';

  /* Hide diagnostics, reweighting, mandate, and alerts */
  const diag = document.getElementById('portfolioDiagnostics');
  const reweight = document.getElementById('portfolioReweighting');
  const mandateEl = document.getElementById('portfolioMandateBreaches');
  if (diag) diag.style.display = 'none';
  if (reweight) reweight.style.display = 'none';
  if (mandateEl) mandateEl.style.display = 'none';
}

/* ------------------------------------------------------------------ */
/*  PM Database sync -- bridge Portfolio page to Phase B backend       */
/* ------------------------------------------------------------------ */

var _pmPortfolioId = null;
let _lastSyncTimestamp = 0;
const _PM_SYNC_COOLDOWN_MS = 30000; // 30s cooldown between syncs

/**
 * Sync the uploaded portfolio to the PM database so PM Chat has access.
 * Fire-and-forget: errors are logged but do not block the UI.
 * Includes a 30-second cooldown to avoid redundant syncs on rapid re-renders.
 */
function _syncPortfolioToPMDatabase(positions, grossExposure) {
  const now = Date.now();
  if (now - _lastSyncTimestamp < _PM_SYNC_COOLDOWN_MS) {
    return; // skip redundant sync
  }
  _lastSyncTimestamp = now;
  const apiBase = API_BASE;
  const apiKey = window.CI_API_KEY || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const guestId = (window.CI_AUTH && window.CI_AUTH.getGuestId) ? window.CI_AUTH.getGuestId() : null;
  let _syncedPortfolioId = null;

  // Only sync positions with valid prices (skip uncovered/unpriced)
  const validPositions = positions.filter(function(p) { return p.currentPrice > 0 && p.units !== 0; });
  if (validPositions.length === 0) return;

  // Calculate total value (gross exposure + notional cash buffer at 5%)
  let totalMV = 0;
  validPositions.forEach(function(p) { totalMV += Math.abs(p.units * p.currentPrice); });
  const cashValue = Math.round(totalMV * 0.05);
  const totalValue = totalMV + cashValue;

  // Build holdings array for the API
  const holdingsPayload = validPositions.map(function(p) {
    const mv = Math.abs(p.units * p.currentPrice);
    const isShort = p.units < 0;
    const coverageData = getCoverageData();
    let sector = null;
    if (coverageData[p.ticker] && coverageData[p.ticker].sector) {
      sector = coverageData[p.ticker].sector;
    }
    return {
      ticker: p.ticker,
      quantity: Math.abs(p.units),
      price: p.currentPrice,
      market_value: mv,
      sector: sector,
      asset_class: 'equity',
      notes: isShort ? 'direction:short' : null
    };
  });

  const snapshotBody = {
    as_of_date: new Date().toISOString().slice(0, 10),
    total_value: totalValue,
    cash_value: cashValue,
    holdings: holdingsPayload,
    notes: 'Synced from Portfolio page upload',
    guest_id: guestId
  };

  // Step 1: ensure portfolio exists (create or reuse)
  // Check if personalisation wizard already created one
  const existingId = _pmPortfolioId || (typeof window.pnGetPortfolioId === 'function' ? window.pnGetPortfolioId() : null);
  const ensurePortfolio = existingId
    ? (function() {
        _pmPortfolioId = existingId;
        if (typeof window.pnSetPortfolioId === 'function') {
          window.pnSetPortfolioId(existingId);
        }
        return Promise.resolve(existingId);
      })()
    : fetch(apiBase + '/api/portfolios', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ name: 'Portfolio', currency: 'AUD', guest_id: guestId })
      })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        _pmPortfolioId = data.id;
        if (typeof window.pnSetPortfolioId === 'function') {
          window.pnSetPortfolioId(_pmPortfolioId);
        }
        window.pnGetPortfolioId = function() { return _pmPortfolioId; };
        return _pmPortfolioId;
      });

  // Step 2: create snapshot
  ensurePortfolio
    .then(function(portfolioId) {
      _syncedPortfolioId = portfolioId;
      return fetch(apiBase + '/api/portfolios/' + portfolioId + '/snapshots', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(snapshotBody)
      });
    })
    .then(function(r) {
      if (r.ok) {
        console.log('[Portfolio] Synced to PM database: ' + validPositions.length + ' holdings');
        // Notify PM panel that portfolio is loaded
        window.dispatchEvent(new CustomEvent('ci:portfolio:synced', {
          detail: { holdings: validPositions.length, totalValue: totalValue }
        }));
        _fetchAndDispatchAnalytics(_syncedPortfolioId);
      } else {
        r.json().then(function(err) {
          console.warn('[Portfolio] PM sync failed:', err);
        }).catch(function() {
          console.warn('[Portfolio] PM sync failed: HTTP ' + r.status);
        });
      }
    })
    .catch(function(err) {
      console.warn('[Portfolio] PM sync error:', err.message || err);
    });
}

/**
 * Fetch backend analytics for a portfolio and dispatch event for UI consumption.
 * Fire-and-forget: errors are logged but do not block the UI.
 */
function _fetchAndDispatchAnalytics(portfolioId) {
  const apiBase = API_BASE;
  const apiKey = window.CI_API_KEY || '';
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  fetch(apiBase + '/api/portfolios/' + portfolioId + '/analytics', { headers: headers })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(analytics) {
      console.log('[Portfolio] Analytics received: score=' + analytics.concentration_score + ', flags=' + (analytics.flags || []).length);
      window.dispatchEvent(new CustomEvent('ci:portfolio:analytics', { detail: analytics }));
    })
    .catch(function(err) {
      console.warn('[Portfolio] Analytics fetch failed:', err.message || err);
    });
}

export function populateSidebar(ticker) {
  const sidebarId = ticker.toLowerCase() + '-sidebar';
  const sidebar = document.getElementById(sidebarId);
  if (!sidebar) return;

  // Don't re-populate if already filled
  if (sidebar.children.length > 0) return;

  const stock = STOCK_DATA[ticker];
  if (!stock) return;

  // Extract N1-N4 directly from STOCK_DATA (not DOM)
  const hypotheses = [];
  if (stock.hypotheses && stock.hypotheses.length > 0) {
    const norm = normaliseScores(stock.hypotheses);
    for (let i = 0; i < stock.hypotheses.length; i++) {
      const h = stock.hypotheses[i];
      hypotheses.push({
        dirClass: h.dirClass || 'dir-neutral',
        label: (h.title || '').replace(/^N\d+:\s*/, ''),
        score: norm[i] + '%'
      });
    }
  }

  // Compute skew from data
  const skew = stock._skew || computeSkewScore(stock);
  const skewDir = skew.direction || 'balanced';
  const skewLabel = skewDir.toUpperCase();
  const skewScoreNum = skew.score || 0;
  const skewScoreStr = (skewScoreNum > 0 ? '+' : '') + skewScoreNum;

  // Three-layer signal data
  const tls = stock.three_layer_signal || {};
  const macSig = tls.macro_signal || 0;
  const secSig = tls.sector_signal || 0;
  const macCls = macSig > 10 ? 'dir-up' : macSig < -10 ? 'dir-down' : 'dir-neutral';
  const secCls = secSig > 10 ? 'dir-up' : secSig < -10 ? 'dir-down' : 'dir-neutral';

  // P/E and Revenue Growth from REFERENCE_DATA / heroMetrics
  const ref = (typeof REFERENCE_DATA !== 'undefined') ? REFERENCE_DATA[ticker] : null;
  let peValue = ' -- ';
  let revGrowthValue = ' -- ';

  // Try heroMetrics first (live-hydrated values)
  if (stock.heroMetrics) {
    for (let mi = 0; mi < stock.heroMetrics.length; mi++) {
      const mLabel = (stock.heroMetrics[mi].label || '').toLowerCase();
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
      const currentP = parseFloat(stock._livePrice || stock.price || stock.current_price || 0);
      if (currentP > 0) peValue = formatPrice(currentP / ref.epsForward, 1) + 'x';
    }
    if (revGrowthValue === ' -- ' && ref.revenueGrowth != null) {
      revGrowthValue = (ref.revenueGrowth > 0 ? '+' : '') + ref.revenueGrowth + '%';
    }
  }

  // Price and change
  const livePrice = parseFloat(stock._livePrice || stock.price || stock.current_price || 0);
  const ph = stock.priceHistory;
  let changePct = null;
  if (ph && ph.length >= 2) {
    changePct = ((ph[ph.length - 1] - ph[ph.length - 2]) / ph[ph.length - 2] * 100);
  } else if (stock.freshness && stock.freshness.pricePctChange != null) {
    changePct = stock.freshness.pricePctChange;
  }

  // Build HTML
  let html = '';

  // 1. Stock ID
  html += '<div class="hs-stock-id">' +
    '<div class="hs-stock-ticker">' + (stock.tickerFull || stock.ticker || ticker) + '</div>' +
    '<div class="hs-price-row">';
  if (livePrice > 0) {
    html += '<span class="hs-price">A$' + formatPrice(livePrice) + '</span>';
  }
  if (changePct !== null) {
    const chgCls = changePct >= 0 ? 'pos' : 'neg';
    html += '<span class="hs-change-badge ' + chgCls + '">' +
      formatSignedPercent(changePct) + '</span>';
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

  sidebar.innerHTML = html;
}

export function initPortfolioPage() {
  setupUploadZone();
  const savedPortfolio = loadPortfolio();
  if (savedPortfolio && savedPortfolio.length > 0) {
    renderPortfolioFromSaved(savedPortfolio);
  }

  // Listen for STOCK_DATA changes to refresh portfolio with live prices
  on('stock:updated', function() {
    COVERAGE_DATA = null; // invalidate stale cache

    const page = document.getElementById('page-portfolio');
    if (!page || !page.classList.contains('active')) return;

    const positions = loadPortfolio();
    if (!positions || positions.length === 0) return;

    // Recalculate prices and P&L from fresh STOCK_DATA
    const coverageData = getCoverageData();
    for (let i = 0; i < positions.length; i++) {
      const p = positions[i];
      const covered = coverageData[p.ticker];
      if (covered) {
        p.currentPrice = covered.price;
        p.marketValue = p.currentPrice ? p.units * p.currentPrice : null;
        p.costBasis = p.units * p.avgCost;
        p.pnlDollar = p.marketValue !== null ? p.marketValue - p.costBasis : null;
        p.pnlPercent = p.costBasis > 0 && p.pnlDollar !== null ? (p.pnlDollar / p.costBasis) * 100 : null;
        p.skew = covered.skew;
      }
    }
    const grossExposure = calculateGrossExposure(positions);
    positions.forEach(function(p) {
      p.exposureDollar = calculateExposureDollar(p);
      p.weight = calculateCurrentWeightPct(Math.abs(p.exposureDollar), grossExposure);
      const dir = p.units >= 0 ? 'long' : 'short';
      p.alignment = classifyAlignment(dir, p.skew);
    });

    savePortfolio(positions);
    renderPortfolio(positions, grossExposure);
  });
}

/**
 * Update the summary header with backend analytics data.
 * Called when ci:portfolio:analytics event fires.
 */
export function updateSummaryHeader(analytics) {
  const posEl = document.getElementById('summaryPositions');
  const concEl = document.getElementById('summaryConcentration');
  const flagsEl = document.getElementById('summaryFlags');

  if (!analytics) {
    if (concEl) { concEl.textContent = '--'; concEl.className = 'portfolio-summary-value'; }
    if (flagsEl) flagsEl.textContent = '--';
    return;
  }

  // Position count is set by renderPortfolio() from frontend data (all uploaded rows).
  // Backend position_count may differ (excludes unpriced holdings). Frontend count is kept.

  if (concEl) {
    const score = analytics.concentration_score != null ? Math.round(analytics.concentration_score) : null;
    if (score != null) {
      concEl.textContent = String(score);
      const colorClass = score <= 30 ? 'conc-green' : score <= 60 ? 'conc-amber' : 'conc-red';
      concEl.className = 'portfolio-summary-value ' + colorClass;
    } else {
      concEl.textContent = '--';
      concEl.className = 'portfolio-summary-value';
    }
  }

  if (flagsEl) {
    const flags = analytics.flags || [];
    const warnings = flags.filter(function(f) { return f.severity === 'warning'; }).length;
    const infos = flags.filter(function(f) { return f.severity === 'info'; }).length;
    if (flags.length === 0) {
      flagsEl.innerHTML = '<span class="conc-green">0</span>';
    } else {
      const parts = [];
      if (warnings > 0) parts.push('<span class="conc-amber">' + warnings + '</span>');
      if (infos > 0) parts.push('<span class="conc-muted">' + infos + '</span>');
      flagsEl.innerHTML = parts.join(' / ');
    }
  }
}

/**
 * Render the concentration detail section with backend analytics.
 * Shows max single-name, top 5, top 10, HHI, sector bars, and risk flags.
 */
export function renderConcentrationDetail(analytics) {
  const container = document.getElementById('portConcentrationDetail');
  if (!container) return;

  if (!analytics) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  const conc = analytics.concentration || {};

  const maxEl = document.getElementById('concMaxSingle');
  const top5El = document.getElementById('concTop5');
  const top10El = document.getElementById('concTop10');
  const hhiEl = document.getElementById('concHHI');

  if (maxEl) maxEl.textContent = _fmtWeight(conc.max_single_weight);
  if (top5El) top5El.textContent = _fmtWeight(conc.top5_weight);
  if (top10El) top10El.textContent = _fmtWeight(conc.top10_weight);
  if (hhiEl) hhiEl.textContent = formatPrice(conc.hhi, 3);

  const sectorsEl = document.getElementById('portConcSectors');
  if (sectorsEl && analytics.sector_exposure) {
    const sectors = Object.entries(analytics.sector_exposure);
    if (sectors.length > 0) {
      sectorsEl.innerHTML =
        '<div class="port-conc-section-label">SECTOR EXPOSURE</div>' +
        sectors.map(function(entry) {
          const name = entry[0];
          const weight = entry[1];
          const barWidth = Math.min(weight * 100, 100);
          return '<div class="port-conc-sector-row">' +
            '<div class="port-conc-sector-name">' + _escText(name) + '</div>' +
            '<div class="port-conc-sector-bar-wrap">' +
              '<div class="port-conc-sector-bar" style="width:' + barWidth + '%"></div>' +
            '</div>' +
            '<div class="port-conc-sector-pct">' + _fmtWeight(weight) + '</div>' +
          '</div>';
        }).join('');
    } else {
      sectorsEl.innerHTML = '';
    }
  }

  const flagsEl = document.getElementById('portConcFlags');
  if (flagsEl) {
    const flags = analytics.flags || [];
    if (flags.length === 0) {
      flagsEl.innerHTML = '<div class="port-conc-no-flags">No risk flags triggered</div>';
    } else {
      flagsEl.innerHTML =
        '<div class="port-conc-section-label">RISK FLAGS</div>' +
        flags.map(function(f) {
          const icon = f.severity === 'warning' ? '!' : 'i';
          const cls = f.severity === 'warning' ? 'port-conc-flag-warn' : 'port-conc-flag-info';
          return '<div class="port-conc-flag ' + cls + '">' +
            '<span class="port-conc-flag-icon">' + icon + '</span>' +
            '<span class="port-conc-flag-msg">' + _escText(f.message) + '</span>' +
          '</div>';
        }).join('');
    }
  }
}

function _fmtWeight(w) {
  if (w == null || isNaN(w)) return '--';
  return formatPercent(w * 100);
}

function _escText(str) {
  const d = document.createElement('div');
  d.textContent = str != null ? String(str) : '';
  return d.innerHTML;
}

// Listen for backend analytics to update summary header and concentration detail
window.addEventListener('ci:portfolio:analytics', function(e) {
  updateSummaryHeader(e.detail);
  renderConcentrationDetail(e.detail);
});
