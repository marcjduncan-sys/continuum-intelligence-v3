// home.js — Home page renderers and initialization
// Extracted from index.html without logic changes

import { STOCK_DATA, FRESHNESS_DATA, FEATURED_ORDER, COMING_SOON } from '../lib/state.js';
import { computeSkewScore } from '../lib/dom.js';
import { on } from '../lib/data-events.js';

var coverageSortDir = 0; // 0 = unsorted (default), 1 = desc (bearish first), -1 = asc (bullish first)

export function renderFeaturedCard(data) {
  var skew = data._skew || computeSkewScore(data);
  var dir = skew.direction;
  var scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  var scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;

  var metricsHtml = '';
  for (var i = 0; i < data.featuredMetrics.length; i++) {
    var m = data.featuredMetrics[i];
    var colorStyle = m.color ? ' style="color:' + m.color + '"' : '';
    metricsHtml += '<div><div class="fc-metric-label">' + m.label + '</div><div class="fc-metric-value"' + colorStyle + '>' + m.value + '</div></div>';
  }

  var priceColor = data.featuredPriceColor || '';
  var priceStyle = priceColor ? ' style="color: ' + priceColor + '"' : '';

  return '<div class="featured-card skew-' + dir + '" data-ticker-card="' + data.ticker + '" onclick="navigate(\'report-' + data.ticker + '\')" tabindex="0" role="link" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'report-' + data.ticker + '\')}">' +
    '<div class="fc-top">' +
      '<div>' +
        '<div class="fc-ticker">' + data.tickerFull + '</div>' +
        '<div class="fc-company">' + data.company + '</div>' +
        '<div class="fc-sector">' + data.sector + ' &bull; ' + data.sectorSub + '</div>' +
      '</div>' +
      '<div class="fc-price"' + priceStyle + '>' +
        '<span style="font-size:0.8rem; color:var(--text-muted)">' + data.currency + '</span>' + data.price +
      '</div>' +
    '</div>' +
    '<div class="fc-metrics">' + metricsHtml + '</div>' +
    '<div class="fc-skew">' +
      '<div class="skew-bar-track" style="width:48px;height:6px">' +
        '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
        '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
      '</div>' +
      '<span class="skew-score ' + scoreCls + '" style="font-size:0.7rem">' + scoreLabel + '</span>' +
      '<span class="fc-skew-rationale">' + data.featuredRationale + '</span>' +
    '</div>' +
    '<div class="fc-date">' + data.date + renderFreshnessBadge(data.ticker) + renderCatalystTag(data.ticker) + '</div>' +
  '</div>';
}

export function renderFreshnessBadge(ticker) {
  if (typeof FRESHNESS_DATA === 'undefined' || !FRESHNESS_DATA[ticker]) return '';
  var f = FRESHNESS_DATA[ticker];
  var cls = 'fb-' + f.badge;
  var label = f.daysSinceReview + 'd ago';
  if (f.badge === 'ok') label = 'Current';
  return ' <span class="freshness-badge ' + cls + '">' + label + '</span>';
}

export function renderCatalystTag(ticker) {
  if (typeof FRESHNESS_DATA === 'undefined' || !FRESHNESS_DATA[ticker]) return '';
  var f = FRESHNESS_DATA[ticker];
  if (!f.nearestCatalyst) return '';
  var cls = f.nearestCatalystDays !== null && f.nearestCatalystDays <= 7 ? ' ct-imminent' : '';
  var daysLabel = f.nearestCatalystDays !== null
    ? (f.nearestCatalystDays <= 0 ? 'NOW' : f.nearestCatalystDays + 'd')
    : '';
  return ' <span class="catalyst-tag' + cls + '">' + f.nearestCatalyst + (daysLabel ? ' &bull; ' + daysLabel : '') + '</span>';
}

export function renderCoverageRow(data) {
  var skew = data._skew || computeSkewScore(data);
  var scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  var scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;

  // Tooltip hypothesis breakdown
  var tooltipRows = '';
  for (var i = 0; i < skew.hypotheses.length; i++) {
    var h = skew.hypotheses[i];
    var dotCls = h.direction === 'upside' ? 'up' : h.direction === 'downside' ? 'down' : 'neutral';
    tooltipRows += '<div class="skew-tooltip-row">' +
      '<span class="skew-tooltip-dot ' + dotCls + '"></span>' +
      '<span>' + h.title + '</span>' +
      '<span class="skew-tooltip-weight">' + h.weight + '%</span>' +
    '</div>';
  }
  var tooltipHtml = '<div class="skew-tooltip">' +
    '<div class="skew-tooltip-title">Hypothesis Weights</div>' +
    tooltipRows +
    '<div class="skew-tooltip-rationale">' + data.skew.rationale.substring(0, 160) + (data.skew.rationale.length > 160 ? '&hellip;' : '') + '</div>' +
  '</div>';

  // Format date as short form: "10 Feb 2026"
  var dateParts = data.date.split(' ');
  var shortDate = dateParts[0] + ' ' + (dateParts[1] ? dateParts[1].substring(0, 3) : '') + ' ' + (dateParts[2] || '');

  return '<tr data-skew-score="' + skew.score + '" onclick="navigate(\'report-' + data.ticker + '\')" tabindex="0" role="link" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'report-' + data.ticker + '\')}">' +
    '<td class="td-ticker">' + data.ticker + '</td>' +
    '<td>' + data.company + '</td>' +
    '<td>' + data.sector + '</td>' +
    '<td class="td-price">' + data.currency + (data._livePrice || data.price) + '</td>' +
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
  var dir = stub.skew || 'balanced';
  var bull = dir === 'upside' ? 65 : dir === 'downside' ? 35 : 50;
  var bear = 100 - bull;
  var score = bull - bear;
  var scoreCls = score > 5 ? 'positive' : score < -5 ? 'negative' : 'neutral';
  var scoreLabel = (score > 0 ? '+' : '') + score;

  return '<tr class="stub" data-skew-score="' + score + '">' +
    '<td class="td-ticker">' + stub.ticker + '</td>' +
    '<td>' + stub.company + '</td>' +
    '<td>' + stub.sector + '</td>' +
    '<td class="td-price">' + (stub.currency || 'A$') + stub.price + '</td>' +
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
  var tbody = document.getElementById('coverage-body');
  if (!tbody) return;
  var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));
  var arrow = document.getElementById('skew-sort-arrow');

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
    var sa = parseInt(a.getAttribute('data-skew-score')) || 0;
    var sb = parseInt(b.getAttribute('data-skew-score')) || 0;
    return coverageSortDir === 1 ? sa - sb : sb - sa; // desc: bearish first (lowest score), asc: bullish first (highest score)
  });

  if (arrow) {
    arrow.className = 'sort-arrow active';
    arrow.innerHTML = coverageSortDir === 1 ? '&#9660;' : '&#9650;';
  }

  // Re-append in sorted order
  for (var i = 0; i < rows.length; i++) {
    tbody.appendChild(rows[i]);
  }
}

export function buildCoverageData() {
  var coverageData = {};
  var tickers = Object.keys(STOCK_DATA);
  for (var i = 0; i < tickers.length; i++) {
    var t = tickers[i];
    var d = STOCK_DATA[t];
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
  var input = document.getElementById('home-stock-search');
  var results = document.getElementById('home-search-results');
  if (!input || !results) return;

  input.addEventListener('input', function() {
    var q = this.value.trim().toLowerCase();
    if (!q) { results.style.display = 'none'; results.innerHTML = ''; return; }
    var matches = [];
    for (var ticker in STOCK_DATA) {
      var s = STOCK_DATA[ticker];
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
    var html = '';
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
  var featuredGrid = document.getElementById('featured-grid');
  if (featuredGrid) {
    featuredGrid.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      if (STOCK_DATA[ticker]) {
        featuredGrid.innerHTML += renderFeaturedCard(STOCK_DATA[ticker]);
      }
    });
  }

  // Populate coverage table
  var coverageBody = document.getElementById('coverage-body');
  if (coverageBody) {
    coverageBody.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      if (STOCK_DATA[ticker]) {
        coverageBody.innerHTML += renderCoverageRow(STOCK_DATA[ticker]);
      }
    });
    COMING_SOON.forEach(function(stub) {
      coverageBody.innerHTML += renderComingSoonRow(stub);
    });
  }

  // Populate footer research links
  var footerLinks = document.getElementById('footer-research-links');
  if (footerLinks) {
    footerLinks.innerHTML = '';
    FEATURED_ORDER.forEach(function(ticker) {
      var d = STOCK_DATA[ticker];
      if (d) {
        footerLinks.innerHTML += '<a href="#report-' + ticker + '" onclick="navigate(\'report-' + ticker + '\')">' + d.company + ' (' + d.tickerFull + ')</a>';
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
  var homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  var tbody = document.getElementById('coverage-body');
  if (!tbody) return;

  var stock = STOCK_DATA[ticker];
  if (!stock) return;

  var rows = tbody.querySelectorAll('tr');
  for (var i = 0; i < rows.length; i++) {
    var tickerCell = rows[i].querySelector('.td-ticker');
    if (tickerCell && tickerCell.textContent.trim() === ticker) {
      var temp = document.createElement('tbody');
      temp.innerHTML = renderCoverageRow(stock);
      if (temp.firstElementChild) {
        tbody.replaceChild(temp.firstElementChild, rows[i]);
      }
      return;
    }
  }
}

function _updateFeaturedCard(ticker) {
  var homePage = document.getElementById('page-home');
  if (!homePage || !homePage.classList.contains('active')) return;

  var stock = STOCK_DATA[ticker];
  if (!stock) return;

  var card = document.querySelector('[data-ticker-card="' + ticker + '"]');
  if (!card) return;

  var temp = document.createElement('div');
  temp.innerHTML = renderFeaturedCard(stock);
  if (temp.firstElementChild) {
    card.parentNode.replaceChild(temp.firstElementChild, card);
  }
}
