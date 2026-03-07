/**
 * deep-research.js -- Deep Research listing page
 *
 * Extracted from index.html lines ~14505-14741.
 * Renders the Deep Research tile grid with sort controls.
 * Tickers with `_deepResearch: true` in their research JSON are included.
 *
 * Depends on:
 *   - STOCK_DATA from state.js
 *   - navigate() from router.js (or window.navigate global)
 */

import { STOCK_DATA } from '../lib/state.js';
import { escapeHtml } from '../lib/dom.js';

var SECTOR_ORDER = ['Consumer Staples', 'Consumer Discretionary', 'Financials', 'Health Care',
    'Information Technology', 'Industrials', 'Materials', 'Energy', 'Real Estate', 'Communication Services'];

function stripHtml(html) {
    var tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return tmp.textContent || tmp.innerText || '';
}

function truncate(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    var cut = text.lastIndexOf(' ', maxLen);
    if (cut < maxLen * 0.6) cut = maxLen;
    return text.substring(0, cut) + '\u2026';
}

function extractTileData(ticker) {
    var sd = STOCK_DATA[ticker];
    if (!sd) return null;

    var company = sd.company || ticker;
    var sector = sd.sector || '';
    var sectorSub = sd.sectorSub || '';

    // Thesis excerpt: use verdict text (strip HTML), fall back to featuredRationale
    var thesisRaw = '';
    if (sd.verdict && sd.verdict.text) thesisRaw = stripHtml(sd.verdict.text);
    else if (sd.featuredRationale) thesisRaw = sd.featuredRationale;
    var thesis = truncate(thesisRaw, 220);

    // Skew direction
    var skewDir = 'balanced';
    if (sd.skew && sd.skew.direction) skewDir = sd.skew.direction.toLowerCase();
    if (skewDir !== 'upside' && skewDir !== 'downside') skewDir = 'balanced';

    // Hypothesis scores for weight bars
    var hyps = [];
    if (sd.hypotheses && Array.isArray(sd.hypotheses)) {
        for (var i = 0; i < sd.hypotheses.length; i++) {
            var h = sd.hypotheses[i];
            hyps.push({
                label: h.title || ('N' + (i + 1)),
                score: parseInt(h.score, 10) || 0,
                direction: (h.direction || 'neutral').toLowerCase()
            });
        }
    } else if (sd.verdict && sd.verdict.scores) {
        for (var j = 0; j < sd.verdict.scores.length; j++) {
            var vs = sd.verdict.scores[j];
            hyps.push({
                label: vs.label || ('N' + (j + 1)),
                score: parseInt(vs.score, 10) || 0,
                direction: vs.scoreColor === 'var(--signal-green)' ? 'upside' : vs.scoreColor === 'var(--signal-red)' ? 'downside' : 'neutral'
            });
        }
    }

    // Evidence domain count (only available if full research loaded)
    var evidenceCount = null;
    if (sd.evidence && sd.evidence.cards) evidenceCount = sd.evidence.cards.length;

    var hypCount = hyps.length || 4;

    // Next decision point
    var nextEvent = null;
    var nextDate = null;
    if (sd.hero && sd.hero.next_decision_point) {
        nextEvent = sd.hero.next_decision_point.event || null;
        nextDate = sd.hero.next_decision_point.date || null;
    }

    var domainCount = null;
    if (sd.footer && sd.footer.domainCount) domainCount = sd.footer.domainCount;

    return {
        ticker: ticker,
        company: company,
        sector: sector,
        sectorSub: sectorSub,
        thesis: thesis,
        skewDir: skewDir,
        hyps: hyps,
        hypCount: hypCount,
        evidenceCount: evidenceCount,
        domainCount: domainCount,
        nextEvent: nextEvent,
        nextDate: nextDate
    };
}

function renderTile(d) {
    var badgeCls = 'badge-' + d.skewDir;
    var badgeText = d.skewDir === 'downside' ? 'Downside' : d.skewDir === 'upside' ? 'Upside' : 'Balanced';

    var barHtml = '';
    var legendHtml = '';
    var totalScore = 0;
    for (var i = 0; i < d.hyps.length; i++) totalScore += d.hyps[i].score;
    if (totalScore === 0) totalScore = 100;
    for (var j = 0; j < d.hyps.length; j++) {
        var h = d.hyps[j];
        var pct = Math.round((h.score / totalScore) * 100);
        var segCls = h.direction === 'upside' ? 'seg-upside' : h.direction === 'downside' ? 'seg-downside' : 'seg-neutral';
        var dotColor = h.direction === 'upside' ? 'var(--signal-green)' : h.direction === 'downside' ? 'var(--signal-red)' : 'var(--signal-amber)';
        barHtml += '<div class="dr-hyp-seg ' + segCls + '" style="width:' + pct + '%"></div>';
        legendHtml += '<span class="dr-hyp-label"><span class="dr-hyp-dot" style="background:' + dotColor + '"></span>' + escapeHtml(h.label) + ' ' + h.score + '%</span>';
    }

    var evidenceHtml = '';
    if (d.domainCount) {
        evidenceHtml = '<span class="dr-evidence"><span class="dr-evidence-count">' + escapeHtml(String(d.domainCount)) + '</span> domains &bull; ' + d.hypCount + ' hypotheses</span>';
    } else if (d.evidenceCount) {
        evidenceHtml = '<span class="dr-evidence"><span class="dr-evidence-count">' + d.evidenceCount + '/10</span> domains &bull; ' + d.hypCount + ' hypotheses</span>';
    } else {
        evidenceHtml = '<span class="dr-evidence">' + d.hypCount + ' hypotheses</span>';
    }

    var catalystHtml = '';
    if (d.nextEvent && d.nextDate) {
        catalystHtml = '<span class="dr-catalyst"><span class="dr-catalyst-event">' + escapeHtml(d.nextEvent) + '</span> &bull; ' + escapeHtml(d.nextDate) + '</span>';
    }

    return '<div class="dr-tile dr-skew-' + d.skewDir + '" tabindex="0" role="link" ' +
        'onclick="(window.navigate||function(p){window.location.hash=p})(\'deep-report-' + d.ticker + '\')" ' +
        'onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();(window.navigate||function(p){window.location.hash=p})(\'deep-report-' + d.ticker + '\')}">' +
        '<div class="dr-header">' +
            '<div>' +
                '<div class="dr-ticker">' + escapeHtml(d.ticker) + '</div>' +
                '<div class="dr-company">' + escapeHtml(d.company) + '</div>' +
                (d.sector ? '<span class="dr-sector">' + escapeHtml(d.sector) + (d.sectorSub ? ' &bull; ' + escapeHtml(d.sectorSub) : '') + '</span>' : '') +
            '</div>' +
            '<span class="dr-skew-badge ' + badgeCls + '">' + badgeText + '</span>' +
        '</div>' +
        '<div class="dr-thesis">' + escapeHtml(d.thesis) + '</div>' +
        '<div class="dr-hyp-bars">' + barHtml + '</div>' +
        '<div class="dr-hyp-legend">' + legendHtml + '</div>' +
        '<div class="dr-footer">' + evidenceHtml + catalystHtml + '</div>' +
    '</div>';
}

function generateTiles(containerId, sortBy) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var deepTickers = Object.keys(STOCK_DATA).filter(function(t) { return STOCK_DATA[t]._deepResearch === true; });
    var tiles = [];
    for (var i = 0; i < deepTickers.length; i++) {
        var t = deepTickers[i];
        if (!STOCK_DATA[t]) continue;
        var d = extractTileData(t);
        if (d) tiles.push(d);
    }

    sortBy = sortBy || 'ticker';
    if (sortBy === 'ticker') {
        tiles.sort(function(a, b) { return a.ticker.localeCompare(b.ticker); });
    } else if (sortBy === 'sector') {
        tiles.sort(function(a, b) {
            var ai = SECTOR_ORDER.indexOf(a.sector); if (ai < 0) ai = 99;
            var bi = SECTOR_ORDER.indexOf(b.sector); if (bi < 0) bi = 99;
            if (ai !== bi) return ai - bi;
            return a.ticker.localeCompare(b.ticker);
        });
    } else if (sortBy === 'skew') {
        var skewRank = { downside: 0, balanced: 1, upside: 2 };
        tiles.sort(function(a, b) {
            var sa = skewRank[a.skewDir] !== undefined ? skewRank[a.skewDir] : 1;
            var sb = skewRank[b.skewDir] !== undefined ? skewRank[b.skewDir] : 1;
            if (sa !== sb) return sa - sb;
            return a.ticker.localeCompare(b.ticker);
        });
    }

    var gridEl = container.querySelector('.dr-grid');
    if (!gridEl) return;
    var html = '';
    for (var j = 0; j < tiles.length; j++) html += renderTile(tiles[j]);
    gridEl.innerHTML = html;

    console.log('[DeepResearch] Rendered ' + tiles.length + ' tiles (sorted by ' + sortBy + ')');
}

export function initDeepResearch(containerId) {
    console.log('[DeepResearch] Initialising #' + containerId + '...');
    var container = document.getElementById(containerId);
    if (!container) { console.warn('[DeepResearch] Container not found'); return; }

    container.innerHTML =
        '<div class="dr-sort-controls">' +
            '<button class="dr-sort-btn active" data-sort="ticker">A&ndash;Z</button>' +
            '<button class="dr-sort-btn" data-sort="sector">Sector</button>' +
            '<button class="dr-sort-btn" data-sort="skew">Skew</button>' +
        '</div>' +
        '<div class="dr-grid"></div>';

    var buttons = container.querySelectorAll('.dr-sort-btn');
    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function() {
            var sortBy = this.getAttribute('data-sort');
            for (var b = 0; b < buttons.length; b++) buttons[b].classList.remove('active');
            this.classList.add('active');
            generateTiles(containerId, sortBy);
        });
    }

    generateTiles(containerId, 'ticker');
    console.log('[DeepResearch] Initialisation complete');
}
