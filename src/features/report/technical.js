// Technical analysis section renderers
// Extracted from report-sections.js without logic changes

import { RS_HDR } from './shared.js';
import { svgCoord, formatPrice, formatPercent, formatSignedPercent, formatRatio } from '../../lib/format.js';

export function computeMA(arr, period) {
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += arr[j];
    result.push(sum / period);
  }
  return result;
}

export function renderTAChart(data) {
  const ta = data.technicalAnalysis;
  const live = data._liveChart;
  const liveTA = data._liveTA;

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const C = {
    bg: isLight ? '#FFFFFF' : '#0D1726',
    grid: isLight ? '#E2E8F0' : '#1E3050',
    axisText: isLight ? '#718096' : '#566882',
    price: isLight ? '#1A1F2E' : '#E8EDF4',
    priceGradA: isLight ? '#1A1F2E' : '#E8EDF4',
    hlBand: isLight ? '#1A1F2E' : '#E8EDF4',
    legendText: isLight ? '#4A5568' : '#8B9AB8',
    dot: isLight ? '#1A1F2E' : '#E8EDF4',
    dotStroke: isLight ? '#FFFFFF' : '#0D1726',
    support: '#3DAA6D',
    resistance: '#D45555',
    ma50: '#D4A03C',
    ma200: '#4A8ECC'
  };

  const useLive = live && live.bars && live.bars.length > 100;
  const bars = useLive ? live.bars : null;
  const closes = useLive ? bars.map(function(b){ return b.close; }) : data.priceHistory;
  const highs = useLive ? bars.map(function(b){ return b.high; }) : null;
  const lows = useLive ? bars.map(function(b){ return b.low; }) : null;

  if (!closes || closes.length < 20) return '';

  const n = closes.length;
  const ma50Arr = useLive && liveTA ? liveTA.ma50Arr : computeMA(closes, 50);
  const ma200Arr = useLive && liveTA ? liveTA.ma200Arr : computeMA(closes, 200);

  const chartTitle = useLive ? (n > 500 ? '3' : n > 250 ? '2' : '1') + '-Year Daily Price &amp; Moving Averages' : '12-Month Daily Price &amp; Moving Averages';
  const liveLabel = useLive ? '<span class="ta-chart-live-badge">LIVE</span>' : '<span class="ta-chart-static-badge">STATIC</span>';

  const W = 960, H = 380;
  const padL = 62, padR = 16, padT = 28, padB = 44;
  const cW = W - padL - padR;
  const cH = H - padT - padB;

  const allVals = closes.slice();
  if (highs) for (var i = 0; i < n; i++) { if (highs[i] != null) allVals.push(highs[i]); }
  if (lows) for (var i = 0; i < n; i++) { if (lows[i] != null) allVals.push(lows[i]); }
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] !== null) allVals.push(ma50Arr[i]);
    if (ma200Arr[i] !== null) allVals.push(ma200Arr[i]);
  }
  let pMin = Math.min.apply(null, allVals);
  let pMax = Math.max.apply(null, allVals);
  let pRange = pMax - pMin;
  pMin -= pRange * 0.05;
  pMax += pRange * 0.05;
  pRange = pMax - pMin;

  function xPos(idx) { return padL + (idx / (n - 1)) * cW; }
  function yPos(val) { return padT + (1 - (val - pMin) / pRange) * cH; }

  const taKl = ta && ta.keyLevels ? ta.keyLevels : {};
  const supportPrice = taKl.support ? parseFloat(taKl.support.price) || null : null;
  const resistPrice = taKl.resistance ? parseFloat(taKl.resistance.price) || null : null;
  const curPrice = parseFloat(useLive && live.currentPrice ? live.currentPrice : data.price) || 0;
  const cur = data.currency;

  let svg = '<svg class="ta-chart-svg" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
  svg += '<rect x="' + padL + '" y="' + padT + '" width="' + cW + '" height="' + cH + '" fill="' + C.bg + '" rx="2"/>';

  const gridStep = pRange / 5;
  const magnitude = Math.pow(10, Math.floor(Math.log10(gridStep)));
  const niceSteps = [1, 2, 2.5, 5, 10];
  let bestStep = magnitude;
  for (let s = 0; s < niceSteps.length; s++) {
    if (niceSteps[s] * magnitude >= gridStep) { bestStep = niceSteps[s] * magnitude; break; }
  }
  for (let gv = Math.ceil(pMin / bestStep) * bestStep; gv <= pMax; gv += bestStep) {
    const gy = yPos(gv);
    if (gy < padT || gy > padT + cH) continue;
    svg += '<line x1="' + padL + '" y1="' + svgCoord(gy) + '" x2="' + (padL + cW) + '" y2="' + svgCoord(gy) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    svg += '<text x="' + (padL - 8) + '" y="' + svgCoord(gy + 3.5) + '" text-anchor="end" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="9">' + cur + formatPrice(gv, gv >= 100 ? 0 : 2) + '</text>';
  }

  if (supportPrice && supportPrice >= pMin && supportPrice <= pMax) {
    const sy = yPos(supportPrice);
    svg += '<line x1="' + padL + '" y1="' + svgCoord(sy) + '" x2="' + (padL + cW) + '" y2="' + svgCoord(sy) + '" stroke="' + C.support + '" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + svgCoord(sy - 4) + '" fill="' + C.support + '" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">S ' + cur + formatPrice(supportPrice) + '</text>';
  }
  if (resistPrice && resistPrice >= pMin && resistPrice <= pMax) {
    const ry = yPos(resistPrice);
    svg += '<line x1="' + padL + '" y1="' + svgCoord(ry) + '" x2="' + (padL + cW) + '" y2="' + svgCoord(ry) + '" stroke="' + C.resistance + '" stroke-width="0.8" stroke-dasharray="6,4" opacity="0.6"/>';
    svg += '<text x="' + (padL + 4) + '" y="' + svgCoord(ry - 4) + '" fill="' + C.resistance + '" font-family="JetBrains Mono, monospace" font-size="7.5" opacity="0.8">R ' + cur + formatPrice(resistPrice) + '</text>';
  }

  if (highs && lows) {
    let hlUpper = '', hlLower = '';
    for (var i = 0; i < n; i++) {
      if (highs[i] == null || lows[i] == null) continue;
      const x = svgCoord(xPos(i));
      hlUpper += (hlUpper === '' ? 'M' : 'L') + x + ',' + svgCoord(yPos(highs[i]));
      hlLower = x + ',' + svgCoord(yPos(lows[i])) + (hlLower === '' ? '' : 'L' + hlLower);
    }
    if (hlUpper && hlLower) {
      svg += '<path d="' + hlUpper + 'L' + hlLower + 'Z" fill="' + C.hlBand + '" opacity="' + (isLight ? '0.08' : '0.06') + '"/>';
    }
  }

  let ma200Path = '';
  for (var i = 0; i < n; i++) {
    if (ma200Arr[i] === null) continue;
    ma200Path += (ma200Path === '' ? 'M' : 'L') + svgCoord(xPos(i)) + ',' + svgCoord(yPos(ma200Arr[i]));
  }
  if (ma200Path) svg += '<path d="' + ma200Path + '" fill="none" stroke="' + C.ma200 + '" stroke-width="1.3" opacity="0.8"/>';

  let ma50Path = '';
  for (var i = 0; i < n; i++) {
    if (ma50Arr[i] === null) continue;
    ma50Path += (ma50Path === '' ? 'M' : 'L') + svgCoord(xPos(i)) + ',' + svgCoord(yPos(ma50Arr[i]));
  }
  if (ma50Path) svg += '<path d="' + ma50Path + '" fill="none" stroke="' + C.ma50 + '" stroke-width="1.3" opacity="0.8"/>';

  let pricePath = 'M' + svgCoord(xPos(0)) + ',' + svgCoord(yPos(closes[0]));
  for (var i = 1; i < n; i++) pricePath += 'L' + svgCoord(xPos(i)) + ',' + svgCoord(yPos(closes[i]));
  const areaPath = pricePath + 'L' + svgCoord(xPos(n-1)) + ',' + (padT+cH) + 'L' + svgCoord(xPos(0)) + ',' + (padT+cH) + 'Z';
  svg += '<defs><linearGradient id="priceGrad-' + data.ticker + '" x1="0" y1="0" x2="0" y2="1">';
  svg += '<stop offset="0%" stop-color="' + C.priceGradA + '" stop-opacity="' + (isLight ? '0.1' : '0.08') + '"/>';
  svg += '<stop offset="100%" stop-color="' + C.priceGradA + '" stop-opacity="0.01"/>';
  svg += '</linearGradient></defs>';
  svg += '<path d="' + areaPath + '" fill="url(#priceGrad-' + data.ticker + ')"/>';

  svg += '<path d="' + pricePath + '" fill="none" stroke="' + C.price + '" stroke-width="1.4"/>';

  const lastX = xPos(n - 1), lastY = yPos(closes[n-1]);
  svg += '<circle cx="' + svgCoord(lastX) + '" cy="' + svgCoord(lastY) + '" r="3.5" fill="' + C.dot + '" stroke="' + C.dotStroke + '" stroke-width="1.5"/>';
  const labelX = lastX + 8 > W - padR - 60 ? lastX - 65 : lastX + 8;
  svg += '<text x="' + svgCoord(labelX) + '" y="' + svgCoord(lastY + 3) + '" fill="' + C.dot + '" font-family="JetBrains Mono, monospace" font-size="9" font-weight="600">' + cur + formatPrice(curPrice) + '</text>';

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (useLive) {
    let lastMonth = -1, lastYear = -1;
    const step = Math.max(1, Math.floor(n / 36));
    for (var i = 0; i < n; i += step) {
      const d = bars[i].date;
      const mm = d.getMonth(), yy = d.getFullYear();
      if (mm === lastMonth && yy === lastYear) continue;
      lastMonth = mm; lastYear = yy;
      var lx = xPos(i);
      if (lx < padL + 15 || lx > padL + cW - 15) continue;
      var label = monthNames[mm];
      if (mm === 0 || (i < step * 2)) label += " '" + String(yy).slice(2);
      svg += '<text x="' + svgCoord(lx) + '" y="' + (padT + cH + 22) + '" text-anchor="middle" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="7.5">' + label + '</text>';
      svg += '<line x1="' + svgCoord(lx) + '" y1="' + (padT + cH) + '" x2="' + svgCoord(lx) + '" y2="' + (padT + cH + 4) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    }
  } else {
    const reportDate = new Date(data.date);
    const tradingDaysPerMonth = n / 12;
    for (let m = 0; m <= 11; m++) {
      let idx = Math.round(m * tradingDaysPerMonth);
      if (idx >= n) idx = n - 1;
      const labelDate = new Date(reportDate);
      labelDate.setMonth(labelDate.getMonth() - (11 - m));
      var label = monthNames[labelDate.getMonth()];
      if (labelDate.getMonth() === 0) label += " '" + String(labelDate.getFullYear()).slice(2);
      var lx = xPos(idx);
      if (lx < padL + 15 || lx > padL + cW - 15) continue;
      svg += '<text x="' + svgCoord(lx) + '" y="' + (padT + cH + 22) + '" text-anchor="middle" fill="' + C.axisText + '" font-family="JetBrains Mono, monospace" font-size="7.5">' + label + '</text>';
      svg += '<line x1="' + svgCoord(lx) + '" y1="' + (padT + cH) + '" x2="' + svgCoord(lx) + '" y2="' + (padT + cH + 4) + '" stroke="' + C.grid + '" stroke-width="0.5"/>';
    }
  }

  let lx0 = padL + 8;
  svg += '<circle cx="' + lx0 + '" cy="14" r="3" fill="' + C.dot + '"/>';
  svg += '<text x="' + (lx0+8) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Price</text>';
  if (highs) {
    svg += '<rect x="' + (lx0+44) + '" y="10" width="16" height="8" rx="1" fill="' + C.hlBand + '" opacity="0.12"/>';
    svg += '<text x="' + (lx0+64) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">High/Low</text>';
    lx0 += 56;
  }
  svg += '<line x1="' + (lx0+52) + '" y1="14" x2="' + (lx0+68) + '" y2="14" stroke="' + C.ma50 + '" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+72) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">50d MA</text>';
  svg += '<line x1="' + (lx0+112) + '" y1="14" x2="' + (lx0+128) + '" y2="14" stroke="' + C.ma200 + '" stroke-width="1.5"/>';
  svg += '<text x="' + (lx0+132) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">200d MA</text>';
  svg += '<line x1="' + (lx0+182) + '" y1="14" x2="' + (lx0+198) + '" y2="14" stroke="' + C.support + '" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+202) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Support</text>';
  svg += '<line x1="' + (lx0+242) + '" y1="14" x2="' + (lx0+258) + '" y2="14" stroke="' + C.resistance + '" stroke-width="1" stroke-dasharray="4,3"/>';
  svg += '<text x="' + (lx0+262) + '" y="17" fill="' + C.legendText + '" font-family="Inter, sans-serif" font-size="8">Resistance</text>';

  svg += '</svg>';

  return '<div class="ta-chart-container">' +
    '<div class="ta-chart-header"><div class="ta-chart-title">' + chartTitle + '</div>' + liveLabel + '</div>' +
    svg +
  '</div>';
}

export function renderTechnicalAnalysis(data) {
  if (!data.technicalAnalysis) return '';
  const t = data.ticker.toLowerCase();
  const ta = data.technicalAnalysis;
  const trend = ta.trend || {};
  const price = ta.price || {};
  const kl = ta.keyLevels || {};
  const support = kl.support || {};
  const resistance = kl.resistance || {};
  const ma = ta.movingAverages || {};
  const vol = ta.volume || {};
  const vola = ta.volatility || {};
  const mr = ta.meanReversion || {};

  const chartHtml = renderTAChart(data);

  const trendDir = trend.direction || '';
  const regimeHtml = '<div class="ta-regime-bar">' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Regime</div><div class="ta-regime-value">' + (ta.regime || '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Clarity</div><div class="ta-regime-value">' + (ta.clarity || '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Trend</div><div class="ta-regime-value ' + (/down/i.test(trendDir) ? 'ta-down' : /up|recover/i.test(trendDir) ? 'ta-up' : '') + '">' + trendDir + (trend.duration ? ' (' + trend.duration + ')' : '') + '</div></div>' +
    '<div class="ta-regime-item"><div class="ta-regime-label">Structure</div><div class="ta-regime-value">' + (trend.structure || '') + '</div></div>' +
    (support.price != null ? '<div class="ta-regime-item"><div class="ta-regime-label">Support</div><div class="ta-regime-value">' + (price.currency || '') + formatPrice(support.price) + '</div></div>' : '') +
    (resistance.price != null ? '<div class="ta-regime-item"><div class="ta-regime-label">Resistance</div><div class="ta-regime-value">' + (price.currency || '') + formatPrice(resistance.price) + '</div></div>' : '') +
  '</div>';

  const ma50 = ma.ma50 || {};
  const ma200 = ma.ma200 || {};
  const maHtml = (ma50.value != null || ma200.value != null) ? '<div class="rs-subtitle">Moving Averages</div>' +
    '<table class="ta-ma-table"><thead><tr>' +
      '<th>Measure</th><th>Value</th><th>Price vs MA</th><th>Note</th>' +
    '</tr></thead><tbody>' +
    (ma50.value != null ? '<tr>' +
      '<td class="ta-label-cell">50-Day MA</td>' +
      '<td>' + (price.currency || '') + formatPrice(ma50.value) + '</td>' +
      '<td style="color:' + (ma.priceVsMa50 >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(ma.priceVsMa50) + '</td>' +
      '<td>As at ' + (ma50.date || '') + '</td>' +
    '</tr>' : '') +
    (ma200.value != null ? '<tr>' +
      '<td class="ta-label-cell">200-Day MA</td>' +
      '<td>' + (price.currency || '') + formatPrice(ma200.value) + '</td>' +
      '<td style="color:' + (ma.priceVsMa200 >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(ma.priceVsMa200) + '</td>' +
      '<td>As at ' + (ma200.date || '') + '</td>' +
    '</tr>' : '') +
    '</tbody></table>' : '';

  let crossoverHtml = '';
  if (ma.crossover) {
    const cx = ma.crossover;
    crossoverHtml = '<div class="ta-crossover-callout">' +
      '<div class="ta-crossover-label">' + cx.type + '</div>' +
      '<div class="ta-crossover-text">' + cx.description + ' &mdash; ' + cx.date + '</div>' +
    '</div>';
  }

  let inflHtml = '';
  if (ta.inflectionPoints && ta.inflectionPoints.length > 0) {
    let inflRows = '';
    for (let i = 0; i < ta.inflectionPoints.length; i++) {
      const ip = ta.inflectionPoints[i];
      inflRows += '<tr>' +
        '<td class="ta-date-cell">' + ip.date + '</td>' +
        '<td class="ta-price-cell">' + ta.price.currency + formatPrice(ip.price) + '</td>' +
        '<td class="ta-event-cell">' + ip.event + '</td>' +
      '</tr>';
    }
    inflHtml = '<div class="rs-subtitle">Price Inflection Points</div>' +
      '<table class="ta-inflection-table"><thead><tr>' +
        '<th>Date</th><th>Price</th><th>Observation</th>' +
      '</tr></thead><tbody>' + inflRows + '</tbody></table>';
  }

  let volHtml = '';
  if (vol.latestVs20DayAvg != null) {
    volHtml = '<div class="ta-metrics-grid">' +
      '<div class="ta-metric-card">' +
        '<div class="ta-metric-card-title">Volume</div>' +
        '<div class="ta-metric-row"><div class="ta-metric-name">Latest vs 20-day avg</div><div class="ta-metric-val">' + formatRatio(vol.latestVs20DayAvg) + '</div></div>' +
        '<div class="ta-metric-row"><div class="ta-metric-name">Date</div><div class="ta-metric-val">' + (vol.latestDate || '') + '</div></div>';
    if (vol.priorSpikes) {
      for (let v = 0; v < vol.priorSpikes.length; v++) {
        const sp = vol.priorSpikes[v];
        volHtml += '<div class="ta-metric-row"><div class="ta-metric-name">' + (sp.period || '') + '</div><div class="ta-metric-val">' + formatRatio(sp.ratio) + ' <span class="ta-metric-desc">&mdash; ' + (sp.context || '') + '</span></div></div>';
      }
    }
    volHtml += '</div>';
    if (vola.latestRangePercent != null) {
      const latestRange = vola.latestDailyRange || {};
      volHtml +=
        '<div class="ta-metric-card">' +
          '<div class="ta-metric-card-title">Volatility</div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">Latest daily range</div><div class="ta-metric-val">' + formatPercent(vola.latestRangePercent) + '</div></div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">30-day avg range</div><div class="ta-metric-val">' + formatPercent(vola.avgDailyRangePercent30) + '</div></div>' +
          '<div class="ta-metric-row"><div class="ta-metric-name">90-day avg range</div><div class="ta-metric-val">' + formatPercent(vola.avgDailyRangePercent90) + '</div></div>' +
          (latestRange.high != null && latestRange.low != null ? '<div class="ta-metric-row"><div class="ta-metric-name">Latest session</div><div class="ta-metric-val">' + (price.currency || '') + formatPrice(latestRange.high) + ' &ndash; ' + (price.currency || '') + formatPrice(latestRange.low) + '</div></div>' : '') +
        '</div>';
    }
    volHtml += '</div>';
  }

  let mrHtml = '';
  if (mr.rangeHigh != null && mr.rangeLow != null) {
    const rangeSpan = mr.rangeHigh - mr.rangeLow;
    const pricePct = rangeSpan > 0 ? (((price.current || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;
    const ma50Pct = rangeSpan > 0 ? (((ma50.value || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;
    const ma200Pct = rangeSpan > 0 ? (((ma200.value || 0) - mr.rangeLow) / rangeSpan) * 100 : 50;

    mrHtml = '<div class="ta-mr-container">' +
      '<div class="ta-mr-title">Mean Reversion Positioning</div>' +
      '<div class="ta-mr-bar-track">' +
        '<div class="ta-mr-ma200-marker" style="left:' + svgCoord(ma200Pct) + '%"></div>' +
        '<div class="ta-mr-ma50-marker" style="left:' + svgCoord(ma50Pct) + '%"></div>' +
        '<div class="ta-mr-marker" style="left:' + svgCoord(pricePct) + '%"></div>' +
      '</div>' +
      '<div class="ta-mr-bar-labels">' +
        '<span>' + (price.currency || '') + formatPrice(mr.rangeLow) + '</span>' +
        '<span>' + (price.currency || '') + formatPrice(mr.rangeHigh) + '</span>' +
      '</div>' +
      '<div class="ta-mr-legend">' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--red)"></div>Price (' + (price.currency || '') + formatPrice(price.current) + ')</div>' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--amber)"></div>50-Day MA (' + (price.currency || '') + formatPrice(ma50.value) + ')</div>' +
        '<div class="ta-mr-legend-item"><div class="ta-mr-legend-dot" style="background:var(--blue)"></div>200-Day MA (' + (price.currency || '') + formatPrice(ma200.value) + ')</div>' +
    '</div>' +
    '<table class="ta-ma-table" style="margin-top:var(--space-sm)"><thead><tr><th>Measure</th><th>Value</th></tr></thead><tbody>' +
      '<tr><td class="ta-label-cell">vs 50-Day MA</td><td style="color:var(--red)">' + formatPercent(mr.vsMa50) + '</td></tr>' +
      '<tr><td class="ta-label-cell">vs 200-Day MA</td><td style="color:var(--red)">' + formatPercent(mr.vsMa200) + '</td></tr>' +
      '<tr><td class="ta-label-cell">12-Month Range Position</td><td>' + ((mr.rangePosition || 50) <= 50 ? 'Lower ' : 'Upper ') + (mr.rangePosition || 50) + '%</td></tr>' +
    '</tbody></table>' +
  '</div>';
  }

  let relHtml = '';
  if (ta.relativePerformance && ta.relativePerformance.vsIndex && ta.relativePerformance.vsSector) {
    const rp = ta.relativePerformance;
    relHtml = '<div class="rs-subtitle">Relative Performance (' + rp.vsIndex.period + ')</div>' +
      '<table class="ta-rel-table"><thead><tr>' +
        '<th>Benchmark</th><th>Stock Return</th><th>Benchmark Return</th><th>Relative</th>' +
      '</tr></thead><tbody>' +
      '<tr>' +
        '<td style="font-family:var(--font-ui);font-weight:600;color:var(--text)">' + rp.vsIndex.name + '</td>' +
        '<td style="color:' + (rp.vsIndex.stockReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsIndex.stockReturn) + '</td>' +
        '<td style="color:' + (rp.vsIndex.indexReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsIndex.indexReturn) + '</td>' +
        '<td style="color:' + (rp.vsIndex.relativeReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsIndex.relativeReturn) + '</td>' +
      '</tr>' +
      '<tr>' +
        '<td style="font-family:var(--font-ui);font-weight:600;color:var(--text)">' + rp.vsSector.name + '</td>' +
        '<td style="color:' + (rp.vsSector.stockReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsSector.stockReturn) + '</td>' +
        '<td style="color:' + (rp.vsSector.sectorReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsSector.sectorReturn) + '</td>' +
        '<td style="color:' + (rp.vsSector.relativeReturn >= 0 ? 'var(--green)' : 'var(--red)') + '">' + formatSignedPercent(rp.vsSector.relativeReturn) + '</td>' +
      '</tr>' +
      '</tbody></table>';
  }

  const ftw52High = kl.fiftyTwoWeekHigh || {};
  const ftw52Low = kl.fiftyTwoWeekLow || {};
  const levelsHtml = (support.price != null || resistance.price != null) ? '<div class="rs-subtitle">Key Levels</div>' +
    '<table class="ta-ma-table"><thead><tr><th>Level</th><th>Price</th><th>Derivation</th></tr></thead><tbody>' +
    (support.price != null ? '<tr><td class="ta-label-cell">Support</td><td>' + (price.currency || '') + formatPrice(support.price) + '</td><td style="font-family:var(--font-ui)">' + (support.method || '') + '</td></tr>' : '') +
    (resistance.price != null ? '<tr><td class="ta-label-cell">Resistance</td><td>' + (price.currency || '') + formatPrice(resistance.price) + '</td><td style="font-family:var(--font-ui)">' + (resistance.method || '') + '</td></tr>' : '') +
    (ftw52High.price != null ? '<tr><td class="ta-label-cell">52-Week High</td><td>' + (price.currency || '') + formatPrice(ftw52High.price) + '</td><td style="font-family:var(--font-ui)">' + (ftw52High.date || '') + '</td></tr>' : '') +
    (ftw52Low.price != null ? '<tr><td class="ta-label-cell">52-Week Low</td><td>' + (price.currency || '') + formatPrice(ftw52Low.price) + '</td><td style="font-family:var(--font-ui)">' + (ftw52Low.date || '') + '</td></tr>' : '') +
    '</tbody></table>' : '';

  const footerHtml = '<div class="ta-footer">' +
    'Analysis period: ' + (ta.period || '') + ' &bull; Generated: ' + (ta.date || '') + ' &bull; Source: ' + (ta.source || 'Continuum Technical Intelligence') +
  '</div>';

  return '<div class="report-section ta-section" id="' + t + '-technical">' +
    RS_HDR('Section 08', 'Technical Structure') +
    '<div class="rs-body">' +
    chartHtml +
    regimeHtml +
    maHtml +
    crossoverHtml +
    levelsHtml +
    inflHtml +
    volHtml +
    mrHtml +
    relHtml +
    footerHtml +
  '</div></div>';
}
