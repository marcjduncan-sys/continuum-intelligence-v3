// home.js – Home page renderers and initialization
// Extracted from index.html without logic changes

import { STOCK_DATA, FRESHNESS_DATA, REFERENCE_DATA, FEATURED_ORDER, COMING_SOON } from '../lib/state.js';
import { computeSkewScore } from '../lib/dom.js';
import { on } from '../lib/data-events.js';
import { formatDateAEST, truncateAtWord } from '../lib/format.js';

let coverageSortDir = 0; // 0 = unsorted (default), 1 = desc (bearish first), -1 = asc (bullish first)

// Archetypes where null P/E and Div Yield are structurally expected (not a data failure)
const NULLABLE_PE_ARCHETYPES = { explorer: true, developer: true };

function _getArchetype(ticker) {
  if (!REFERENCE_DATA || !REFERENCE_DATA[ticker]) return null;
  return REFERENCE_DATA[ticker].archetype || null;
}

function isDataPending(data) {
  const metrics = data.featuredMetrics || [];
  if (metrics.length === 0) return true;

  const archetype = _getArchetype(data.ticker);

  // For explorer/developer archetypes, only check Mkt Cap and Drawdown (the structurally available metrics)
  if (archetype && NULLABLE_PE_ARCHETYPES[archetype]) {
    let hasMktCap = false;
    let hasDrawdown = false;
    for (let i = 0; i < metrics.length; i++) {
      const v = metrics[i].value;
      const filled = v && v !== 'N/A' && v !== '--';
      if (metrics[i].label === 'Mkt Cap' && filled) hasMktCap = true;
      if (metrics[i].label === 'Drawdown' && filled) hasDrawdown = true;
    }
    return !hasMktCap && !hasDrawdown;
  }

  // Default: pending if all but one metric are N/A
  const naCount = metrics.filter(function(m) {
    return !m.value || m.value === 'N/A' || m.value === '--';
  }).length;
  return naCount >= metrics.length - 1;
}

export function renderFeaturedCard(data) {
  if (isDataPending(data)) {
    return '<div class="featured-card skew-neutral fc-pending" data-ticker-card="' + data.ticker + '" onclick="navigate(\'report-' + data.ticker + '\')" tabindex="0" role="link">' +
      '<div class="fc-top">' +
        '<div>' +
          '<div class="fc-ticker">' + (data.tickerFull || data.ticker) + '</div>' +
          '<div class="fc-company">' + data.company + '</div>' +
          '<div class="fc-sector">' + data.sector + '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fc-pending-msg">Analysis pending</div>' +
    '</div>';
  }
  const skew = data._skew || computeSkewScore(data);
  const dir = skew.direction;
  const scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  const scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;

  let metricsHtml = '';
  const _metrics = data.featuredMetrics || [];
  for (let i = 0; i < _metrics.length; i++) {
    const m = _metrics[i];
    const colorStyle = m.color ? ' style="color:' + m.color + '"' : '';
    metricsHtml += '<div><div class="fc-metric-label">' + m.label + '</div><div class="fc-metric-value"' + colorStyle + '>' + m.value + '</div></div>';
  }

  const priceColor = data.featuredPriceColor || '';
  const priceStyle = priceColor ? ' style="color: ' + priceColor + '"' : '';

  return '<div class="featured-card skew-' + dir + '" data-ticker-card="' + data.ticker + '" onclick="navigate(\'report-' + data.ticker + '\')" tabindex="0" role="link" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'report-' + data.ticker + '\')}">' +
    '<div class="fc-top">' +
      '<div>' +
        '<div class="fc-ticker">' + (data.tickerFull || data.ticker) + '</div>' +
        '<div class="fc-company">' + data.company + '</div>' +
        '<div class="fc-sector">' + data.sector + (data.sectorSub ? ' &bull; ' + data.sectorSub : '') + '</div>' +
      '</div>' +
      '<div class="fc-price"' + priceStyle + '>' +
        '<span style="font-size:0.8rem; color:var(--text-muted)">' + data.currency + '</span>' + parseFloat(data._livePrice || data.price).toFixed(2) +
      '</div>' +
    '</div>' +
    '<div class="fc-metrics">' + metricsHtml + '</div>' +
    '<div class="fc-skew">' +
      '<div class="skew-bar-track" style="width:48px;height:6px">' +
        '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
        '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
      '</div>' +
      '<span class="skew-score ' + scoreCls + '" style="font-size:0.7rem">' + scoreLabel + '</span>' +
      '<span class="fc-skew-rationale">' + truncateAtWord(data.featuredRationale, 110) + '</span>' +
    '</div>' +
    '<div class="fc-date">' + formatDateAEST(data.date) + renderFreshnessBadge(data.ticker) + renderCatalystTag(data.ticker) + '</div>' +
  '</div>';
}

export function renderFreshnessBadge(ticker) {
  if (typeof FRESHNESS_DATA === 'undefined' || !FRESHNESS_DATA[ticker]) return '';
  const f = FRESHNESS_DATA[ticker];
  const cls = 'fb-' + f.badge;
  let label = f.daysSinceReview === 9999 ? 'Unknown' : f.daysSinceReview + 'd ago';
  if (f.badge === 'ok') label = 'Current';
  return ' <span class="freshness-badge ' + cls + '">' + label + '</span>';
}

export function renderCatalystTag(ticker) {
  if (typeof FRESHNESS_DATA === 'undefined' || !FRESHNESS_DATA[ticker]) return '';
  const f = FRESHNESS_DATA[ticker];
  if (!f.nearestCatalyst) return '';
  const cls = f.nearestCatalystDays !== null && f.nearestCatalystDays <= 7 ? ' ct-imminent' : '';
  const daysLabel = f.nearestCatalystDays !== null
    ? (f.nearestCatalystDays <= 0 ? 'NOW' : f.nearestCatalystDays + 'd')
    : '';
  return ' <span class="catalyst-tag' + cls + '">' + f.nearestCatalyst + (daysLabel ? ' &bull; ' + daysLabel : '') + '</span>';
}

export function renderCoverageRow(data) {
  const skew = data._skew || computeSkewScore(data);
  const scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  const scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;

  // Tooltip hypothesis breakdown
  let tooltipRows = '';
  for (let i = 0; i < skew.hypotheses.length; i++) {
    const h = skew.hypotheses[i];
    const dotCls = h.direction === 'upside' ? 'up' : h.direction === 'downside' ? 'down' : 'neutral';
    tooltipRows += '<div class="skew-tooltip-row">' +
      '<span class="skew-tooltip-dot ' + dotCls + '"></span>' +
      '<span>' + h.title + '</span>' +
      '<span class="skew-tooltip-weight">' + h.weight + '%</span>' +
    '</div>';
  }
  const _rationale = (data.skew && data.skew.rationale) ? data.skew.rationale : '';
  const tooltipHtml = '<div class="skew-tooltip">' +
    '<div class="skew-tooltip-title">Hypothesis Weights</div>' +
    tooltipRows +
    (_rationale ? '<div class="skew-tooltip-rationale">' + _rationale.substring(0, 160) + (_rationale.length > 160 ? '&hellip;' : '') + '</div>' : '') +
  '</div>';

  const shortDate = formatDateAEST(data.date);

  return '<tr data-skew-score="' + skew.score + '" onclick="navigate(\'report-' + data.ticker + '\')" tabindex="0" role="link" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'report-' + data.ticker + '\')}">' +
    '<td class="td-ticker">' + data.ticker + '</td>' +
    '<td>' + data.company + '</td>' +
    '<td>' + data.sector + '</td>' +
    '<td class="td-price">' + data.currency + parseFloat(data._livePrice || data.price).toFixed(2) + '</td>' +
    '<td>' +
      '<div class="skew-cell">' +
        '<div class="skew-bar-track">' +
          '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
          '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
        '</div>' +
        '<span class="skew-score ' + scoreCls + '">' + scoreLabel + '</span>' +
        tooltipHtml +
      '</div>' +
    '</td>' +
    '<td class="td-date">' + shortDate + '</td>' +
    '<td>' + renderFreshnessBadge(data.ticker) + renderCatalystTag(data.ticker) + '</td>' +
  '</tr>';
}

export function renderComingSoonRow(stub) {
  const dir = stub.skew || 'balanced';
  const bull = dir === 'upside' ? 65 : dir === 'downside' ? 35 : 50;
  const bear = 100 - bull;
  const score = bull - bear;
  const scoreCls = score > 5 ? 'positive' : score < -5 ? 'negative' : 'neutral';
  const scoreLabel = (score > 0 ? '+' : '') + score;

  return '<tr class="stub" data-skew-score="' + score + '">' +
    '<td class="td-ticker">' + stub.ticker + '</td>' +
    '<td>' + stub.company + '</td>' +
    '<td>' + stub.sector + '</td>' +
    '<td class="td-price">' + (stub.currency || 'A$') + parseFloat(stub.price).toFixed(2) + '</td>' +
    '<td>' +
      '<div class="skew-cell">' +
        '<div class="skew-bar-track">' +
          '<div class="skew-bar-bull" style="width:' + bull + '%"></div>' +
          '<div class="skew-bar-bear" style="width:' + bear + '%"></div>' +
        '</div>' +
        '<span class="skew-score ' + scoreCls + '">' + scoreLabel + '</span>' +
      '</div>' +
    '</td>' +
    '<td><span class="coming-soon">Coming Soon</span></td>' +
    '<td></td>' +
  '</tr>';
}

export function sortCoverageTable() {
  const tbody = document.getElementById('coverage-body');
  if (!tbody) return;
  const rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
  const arrow = document.getElementById('skew-sort-arrow');

  // Cycle: unsorted -> desc (bearish first) -> asc (bullish first) -> unsorted
  coverageSortDir = coverageSortDir === 0 ? 1 : coverageSortDir === 1 ? -1 : 0;

  if (coverageSortDir === 0) {
    // Restore default order: re-render
    if (arrow) { arrow.innerHTML = '&#9650;'; arrow.className = 'sort-arrow'; }
    tbody.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      if (STOCK_DATA[ticker]) {
        tbody.innerHTML += renderCoverageRow(STOCK_DATA[ticker]);
      }
    });
    if (typeof COMING_SOON !== 'undefined') {
      COMING_SOON.forEach(function(stub) {
        tbody.innerHTML += renderComingSoonRow(stub);
      });
    }
    return;
  }

  // Sort by data-skew-score attribute
  rows.sort(function(a, b) {
    const sa = parseInt(a.getAttribute('data-skew-score')) || 0;
    const sb = parseInt(b.getAttribute('data-skew-score')) || 0;
    return coverageSortDir === 1 ? sa - sb : sb - sa; // desc: bearish first (lowest score), asc: bullish first (highest score)
  });

  if (arrow) {
    arrow.className = 'sort-arrow active';
    arrow.innerHTML = coverageSortDir === 1 ? '&#9660;' : '&#9650;';
  }

  // Re-append in sorted order
  for (let i = 0; i < rows.length; i++) {
    tbody.appendChild(rows[i]);
  }
}

export function buildCoverageData() {
  const coverageData = {};
  const tickers = Object.keys(STOCK_DATA);
  for (let i = 0; i < tickers.length; i++) {
    const t = tickers[i];
    const d = STOCK_DATA[t];
    coverageData[t] = {
      company: d.company,
      price: d._livePrice || d.price,
      skew: (d._skew || computeSkewScore(d)).direction,
      sector: d.sector
    };
  }
  return coverageData;
}

export function initHomeSearch() {
  const input = document.getElementById('home-stock-search');
  const results = document.getElementById('home-search-results');
  if (!input || !results) return;

  input.addEventListener('input', function() {
    const q = this.value.trim().toLowerCase();
    if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
    const matches = [];
    for (const ticker in STOCK_DATA) {
      const s = STOCK_DATA[ticker];
      if (ticker.toLowerCase().includes(q) ||
          (s.company && s.company.toLowerCase().includes(q)) ||
          (s.tickerFull && s.tickerFull.toLowerCase().includes(q))) {
        matches.push(s);
      }
    }
    if (matches.length === 0) {
      results.innerHTML = '<div class="home-search-empty">No stocks found</div>';
      results.style.display = 'block';
      return;
    }
    let html = '';
    matches.slice(0, 8).forEach(function(s) {
      html += '<div class="home-search-result" onclick="navigate(\'report-' + s.ticker + '\');document.getElementById(\'home-stock-search\').value=\'\';document.getElementById(\'home-search-results\').style.display=\'none\'">' +
          '<span class="home-search-result-ticker">' + (s.tickerFull || s.ticker) + '</span>' +
          '<span class="home-search-result-name">' + (s.company || '') + '</span>' +
      '</div>';
    });
    results.innerHTML = html;
    results.style.display = 'block';
  });

  document.addEventListener('click', function(e) {
    if (!input.contains(e.target) && !results.contains(e.target)) {
      results.style.display = 'none';
    }
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { this.value = ''; results.style.display = 'none'; }
  });
}

export function initHomePage() {
  // Populate featured cards
  const featuredGrid = document.getElementById('featured-grid');
  if (featuredGrid) {
    featuredGrid.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      if (STOCK_DATA[ticker]) {
        try { featuredGrid.innerHTML += renderFeaturedCard(STOCK_DATA[ticker]); }
        catch(e) { console.warn('[Home] renderFeaturedCard failed for', ticker, e); }
      }
    });
  }

  // Populate coverage table
  const coverageBody = document.getElementById('coverage-body');
  if (coverageBody) {
    coverageBody.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      if (STOCK_DATA[ticker]) {
        try { coverageBody.innerHTML += renderCoverageRow(STOCK_DATA[ticker]); }
        catch(e) { console.warn('[Home] renderCoverageRow failed for', ticker, e); }
      }
    });
    COMING_SOON.forEach(function(stub) {
      coverageBody.innerHTML += renderComingSoonRow(stub);
    });
  }

  // Populate footer research links
  const footerLinks = document.getElementById('footer-research-links');
  if (footerLinks) {
    footerLinks.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      const d = STOCK_DATA[ticker];
      if (d) {
        footerLinks.innerHTML += '<a href="#report-' + ticker + '" onclick="navigate(\'report-' + ticker + '\')">' + d.company + ' (' + (d.tickerFull || ticker) + ')</a>';
      }
    });
  }

  // Home stock search
  initHomeSearch();

  // Listen for STOCK_DATA changes to keep coverage table and featured cards current
  on('stock:updated', function(evt) {
    _updateCoverageRow(evt.ticker);
    _updateFeaturedCard(evt.ticker);
  });
}

function _updateCoverageRow(ticker) {
  const homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  const tbody = document.getElementById('coverage-body');
  if (!tbody) return;

  const stock = STOCK_DATA[ticker];
  if (!stock) return;

  const rows = tbody.querySelectorAll('tr');
  for (let i = 0; i < rows.length; i++) {
    const tickerCell = rows[i].querySelector('.td-ticker');
    if (tickerCell && tickerCell.textContent.trim() === ticker) {
      const temp = document.createElement('tbody');
      temp.innerHTML = renderCoverageRow(stock);
      if (temp.firstElementChild) {
        tbody.replaceChild(temp.firstElementChild, rows[i]);
      }
      return;
    }
  }
}

function _updateFeaturedCard(ticker) {
  const homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  const stock = STOCK_DATA[ticker];
  if (!stock) return;

  const card = document.querySelector('[data-ticker-card="' + ticker + '"]');
  if (!card) return;

  const temp = document.createElement('div');
  temp.innerHTML = renderFeaturedCard(stock);
  if (temp.firstElementChild) {
    card.parentNode.replaceChild(temp.firstElementChild, card);
  }
}
