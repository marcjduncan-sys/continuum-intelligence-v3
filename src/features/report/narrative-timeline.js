// Narrative timeline chart renderers
// Extracted from report-sections.js without logic changes

import { STOCK_DATA } from '../../lib/state.js';
import { RS_HDR } from './shared.js';
import { formatPrice } from '../../lib/format.js';

// Narrative Timeline Chart (Phase 6)

const HISTORY_CACHE = {};

function loadNarrativeHistory(ticker, callback) {
  if (HISTORY_CACHE[ticker]) {
    callback(HISTORY_CACHE[ticker]);
    return;
  }
  const url = 'data/stocks/' + ticker + '-history.json';
  const xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        const data = JSON.parse(xhr.responseText);
        HISTORY_CACHE[ticker] = data;
        callback(data);
      } catch (e) {
        console.warn('[NarrativeTimeline] Failed to parse history for', ticker);
        callback(null);
      }
    } else {
      callback(null);
    }
  };
  xhr.onerror = function() { callback(null); };
  xhr.send();
}

export function renderNarrativeTimeline(data) {
  const t = data.ticker.toLowerCase();
  return '<div class="report-section narrative-timeline-section" id="' + t + '-narrative-timeline">' +
    RS_HDR('Timeline', 'Narrative Evolution') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">How hypothesis survival scores and price have moved over time</div>' +
    '<div class="nt-chart-container">' +
      '<div class="nt-chart-header">' +
        '<div class="nt-chart-title">Price &amp; Hypothesis Survival Scores</div>' +
        '<div class="nt-chart-badge">60-DAY HISTORY</div>' +
      '</div>' +
      '<div class="nt-chart-canvas-wrap" id="nt-wrap-' + data.ticker + '">' +
        '<div class="nt-chart-loading" id="nt-loading-' + data.ticker + '">' +
          '<div class="spinner"></div> Loading timeline data&hellip;' +
        '</div>' +
        '<canvas id="nt-canvas-' + data.ticker + '" style="display:none"></canvas>' +
      '</div>' +
      '<div class="nt-flip-legend" id="nt-legend-' + data.ticker + '"></div>' +
    '</div>' +
    '</div>' +
  '</div>';
}

const NT_COLORS = {
  price: '#8B95A5',
  hypotheses: [
    { bg: 'rgba(61, 170, 109, 0.15)', border: '#3DAA6D', label: '#3DAA6D' },
    { bg: 'rgba(74, 142, 204, 0.12)', border: '#4A8ECC', label: '#4A8ECC' },
    { bg: 'rgba(212, 160, 60, 0.12)', border: '#D4A03C', label: '#D4A03C' },
    { bg: 'rgba(224, 93, 93, 0.10)', border: '#E05D5D', label: '#E05D5D' }
  ],
  flip: '#D4A03C',
  overcorrection: '#E05D5D',
  grid: 'rgba(139, 149, 165, 0.1)'
};

export function initNarrativeTimelineChart(ticker) {
  const Chart = window.Chart;
  if (!Chart) {
    console.warn('[NarrativeTimeline] Chart.js not loaded yet');
    return;
  }

  destroyNarrativeTimelineChart(ticker);

  const canvas = document.getElementById('nt-canvas-' + ticker);
  const loading = document.getElementById('nt-loading-' + ticker);
  const legend = document.getElementById('nt-legend-' + ticker);
  if (!canvas) return;

  loadNarrativeHistory(ticker, function(histData) {
    const canvasCheck = document.getElementById('nt-canvas-' + ticker);
    if (!canvasCheck) return;

    if (loading) loading.style.display = 'none';
    canvasCheck.style.display = 'block';

    if (!histData || !histData.entries || histData.entries.length < 2) {
      const wrap = document.getElementById('nt-wrap-' + ticker);
      if (wrap) {
        wrap.innerHTML = '<div class="nt-chart-empty">Insufficient history data for timeline visualisation.<br>Data accumulates daily via the automated pipeline.</div>';
      }
      return;
    }

    const history = histData.entries;
    const flips = histData.flips || [];

    // Canonical ID: map T-prefixed IDs to N-prefixed (same hypotheses, renamed mid-history)
    function canonId(id) {
      if (typeof id === 'string' && id.charAt(0) === 'T') return 'N' + id.slice(1);
      return id;
    }

    // Normalise both history schemas into {N1: score, N2: score, ...} with integer 0-100 scale
    function extractScores(entry) {
      const result = {};
      if (entry.hypotheses) {
        for (var j = 0; j < entry.hypotheses.length; j++) {
          result[canonId(entry.hypotheses[j].id)] = entry.hypotheses[j].survival_score;
        }
      } else if (entry.scores) {
        const keys = Object.keys(entry.scores);
        for (var j = 0; j < keys.length; j++) {
          result[canonId(keys[j])] = Math.round(entry.scores[keys[j]] * 100);
        }
      }
      return result;
    }

    const labels = [];
    const priceData = [];
    const hypDatasets = {};
    const hypIdSet = {};
    const hypIds = [];
    for (var i = 0; i < history.length; i++) {
      var scores = extractScores(history[i]);
      const sKeys = Object.keys(scores);
      for (var h = 0; h < sKeys.length; h++) {
        if (!hypIdSet[sKeys[h]]) {
          hypIdSet[sKeys[h]] = true;
          hypIds.push(sKeys[h]);
        }
      }
    }

    for (var i = 0; i < history.length; i++) {
      const entry = history[i];
      const parts = (entry.date || '').split('-');
      if (parts.length === 3) {
        labels.push(parts[2] + '/' + parts[1]);
      } else {
        labels.push(entry.date || '?');
      }
      priceData.push(entry.price);

      var scores = extractScores(entry);
      for (var h = 0; h < hypIds.length; h++) {
        var hid = hypIds[h];
        if (!hypDatasets[hid]) hypDatasets[hid] = [];
        hypDatasets[hid].push(scores[hid] != null ? scores[hid] : null);
      }
    }

    // Resolve hypothesis names: old-schema rich names first, then STOCK_DATA research fallback
    const hypNames = {};
    for (var i = history.length - 1; i >= 0; i--) {
      if (history[i].hypotheses) {
        for (var h = 0; h < history[i].hypotheses.length; h++) {
          var cid = canonId(history[i].hypotheses[h].id);
          if (!hypNames[cid]) {
            hypNames[cid] = history[i].hypotheses[h].name;
          }
        }
        if (Object.keys(hypNames).length >= hypIds.length) break;
      }
    }
    // Fall back to STOCK_DATA hypotheses (tier/title) for any gaps
    const stockHyps = STOCK_DATA[ticker] && STOCK_DATA[ticker].hypotheses;
    if (stockHyps) {
      for (var h = 0; h < stockHyps.length; h++) {
        var cid = canonId(stockHyps[h].tier || stockHyps[h].id || '');
        if (cid && !hypNames[cid]) {
          hypNames[cid] = stockHyps[h].title || stockHyps[h].name || cid;
        }
      }
    }

    const datasets = [];
    datasets.push({
      label: 'Price',
      data: priceData,
      borderColor: NT_COLORS.price,
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      pointHitRadius: 6,
      yAxisID: 'yPrice',
      tension: 0.3,
      order: 0
    });

    for (var h = 0; h < hypIds.length; h++) {
      var hid = hypIds[h];
      const colorSet = NT_COLORS.hypotheses[h] || NT_COLORS.hypotheses[0];
      datasets.push({
        label: hid + ': ' + (hypNames[hid] || hid),
        data: hypDatasets[hid],
        borderColor: colorSet.border,
        backgroundColor: colorSet.bg,
        borderWidth: 1.5,
        pointRadius: 0,
        pointHitRadius: 6,
        yAxisID: 'yScore',
        fill: true,
        tension: 0.3,
        order: h + 1
      });
    }

    // Filter out false flips caused by T->N rename (same canonical ID)
    const realFlips = [];
    for (var f = 0; f < flips.length; f++) {
      var fl = flips[f];
      const fromId = fl.from && fl.from.id ? canonId(fl.from.id) : null;
      const toId = fl.to && fl.to.id ? canonId(fl.to.id) : null;
      if (fromId !== toId) realFlips.push(fl);
    }

    const flipMarkers = [];
    for (var f = 0; f < realFlips.length; f++) {
      const flip = realFlips[f];
      const flipParts = (flip.date || '').split('-');
      if (flipParts.length === 3) {
        const flipLabel = flipParts[2] + '/' + flipParts[1];
        const flipIdx = labels.indexOf(flipLabel);
        if (flipIdx >= 0) {
          flipMarkers.push({ idx: flipIdx, color: NT_COLORS.flip, dash: [4, 3], width: 1.5 });
        }
      }
    }
    for (var i = 0; i < history.length; i++) {
      if (history[i].overcorrection_active) {
        const ocParts = (history[i].date || '').split('-');
        if (ocParts.length === 3) {
          const ocLabel = ocParts[2] + '/' + ocParts[1];
          const ocIdx = labels.indexOf(ocLabel);
          if (ocIdx >= 0) {
            flipMarkers.push({ idx: ocIdx, color: NT_COLORS.overcorrection, dash: [2, 2], width: 2 });
          }
        }
      }
    }

    const verticalLinePlugin = {
      id: 'ntVerticalLines',
      afterDraw: function(chart) {
        if (!flipMarkers || flipMarkers.length === 0) return;
        const ctx = chart.ctx;
        const xScale = chart.scales.x;
        const yScale = chart.scales.yPrice;
        ctx.save();
        for (let m = 0; m < flipMarkers.length; m++) {
          const marker = flipMarkers[m];
          const xPixel = xScale.getPixelForValue(marker.idx);
          ctx.beginPath();
          ctx.setLineDash(marker.dash);
          ctx.strokeStyle = marker.color;
          ctx.lineWidth = marker.width;
          ctx.moveTo(xPixel, yScale.top);
          ctx.lineTo(xPixel, yScale.bottom);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const textColor = isDark ? '#8B95A5' : '#4A5568';
    const gridColor = isDark ? 'rgba(139, 149, 165, 0.1)' : 'rgba(0, 0, 0, 0.06)';

    const ctx = canvasCheck.getContext('2d');
    try {
    var chart = new Chart(ctx, {
      type: 'line',
      data: { labels: labels, datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              color: textColor,
              font: { family: "'JetBrains Mono', 'SF Mono', monospace", size: 10 },
              boxWidth: 12,
              padding: 12,
              usePointStyle: true,
              pointStyle: 'rectRounded'
            }
          },
          tooltip: {
            backgroundColor: isDark ? 'rgba(11, 18, 32, 0.95)' : 'rgba(255, 255, 255, 0.95)',
            titleColor: isDark ? '#E2E8F0' : '#1A202C',
            bodyColor: isDark ? '#A0AEC0' : '#4A5568',
            borderColor: isDark ? 'rgba(139, 149, 165, 0.2)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            titleFont: { family: "'JetBrains Mono', monospace", size: 11, weight: 'bold' },
            bodyFont: { family: "'JetBrains Mono', monospace", size: 10 },
            padding: 10,
            cornerRadius: 4,
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const value = context.parsed.y;
                if (context.dataset.yAxisID === 'yPrice') {
                  return label + ': $' + formatPrice(value);
                }
                return label + ': ' + (value !== null ? value + '%' : ' -- ');
              }
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12
            }
          },
          yPrice: {
            type: 'linear',
            position: 'left',
            grid: { color: gridColor, drawBorder: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              callback: function(value) { return '$' + formatPrice(value, 0); }
            },
            title: {
              display: true,
              text: 'Price',
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 10, weight: 'bold' }
            }
          },
          yScore: {
            type: 'linear',
            position: 'right',
            min: 0,
            max: 100,
            grid: { display: false },
            ticks: {
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 9 },
              callback: function(value) { return value + '%'; },
              stepSize: 20
            },
            title: {
              display: true,
              text: 'Survival Score',
              color: textColor,
              font: { family: "'JetBrains Mono', monospace", size: 10, weight: 'bold' }
            }
          }
        }
      },
      plugins: [verticalLinePlugin]
    });
    } catch (e) {
      console.error('[NarrativeTimeline] Chart.js init failed for', ticker, e);
      return;
    }

    canvasCheck._ntChart = chart;

    const legendEl = document.getElementById('nt-legend-' + ticker);
    if (legendEl && realFlips.length > 0) {
      legendEl.innerHTML = '';
      for (var f = 0; f < realFlips.length; f++) {
        var fl = realFlips[f];
        const item = document.createElement('div');
        item.className = 'nt-flip-item';
        const marker = document.createElement('span');
        marker.className = 'nt-flip-marker';
        item.appendChild(marker);
        item.appendChild(document.createTextNode(
          ' ' + (fl.date || '') + ': ' + (fl.from && fl.from.id || '?') + ' \u2192 ' + (fl.to && fl.to.id || '?')
        ));
        legendEl.appendChild(item);
      }
    } else if (legendEl) {
      legendEl.style.display = 'none';
    }
  });
}

export function destroyNarrativeTimelineChart(ticker) {
  const Chart = window.Chart;
  const canvas = document.getElementById('nt-canvas-' + ticker);
  if (canvas) {
    if (canvas._ntChart) {
      canvas._ntChart.destroy();
      canvas._ntChart = null;
    }
    const existing = (window.Chart && window.Chart.getChart) ? window.Chart.getChart(canvas) : null;
    if (existing) {
      existing.destroy();
    }
  }
}
