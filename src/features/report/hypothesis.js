// Hypothesis section renderers
// Extracted from report-sections.js without logic changes

import { RS_HDR } from './shared.js';
import { normaliseScores, computeSkewScore, _inferPolarity } from '../../lib/dom.js';

export function renderSkewBar(data) {
  if (!data.skew && !data._skew && (!data.hypotheses || !data.hypotheses.length)) return '';
  const skew = data._skew || computeSkewScore(data);
  const dir = skew.direction;
  const arrow = dir === 'downside' ? '&#9660; DOWNSIDE' : dir === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';
  const scoreCls = skew.score > 5 ? 'positive' : skew.score < -5 ? 'negative' : 'neutral';
  const scoreLabel = (skew.score > 0 ? '+' : '') + skew.score;
  const rationale = (data.skew && data.skew.rationale) || '';

  return '<div class="risk-skew-bar">' +
    '<div class="rsb-inner">' +
      '<span class="rsb-label">Thesis Skew</span>' +
      '<span class="skew-badge ' + dir + '">' + arrow + '</span>' +
      '<div class="skew-bar-track" style="width:80px;height:10px;margin:0 4px">' +
        '<div class="skew-bar-bull" style="width:' + skew.bull + '%"></div>' +
        '<div class="skew-bar-bear" style="width:' + skew.bear + '%"></div>' +
      '</div>' +
      '<span class="skew-score ' + scoreCls + '">' + scoreLabel + '</span>' +
      '<span class="rsb-rationale">' + rationale + '</span>' +
    '</div>' +
  '</div>';
}

function _dirTextToCls(dirText, polarity) {
  if (!dirText) return null;
  var t = dirText.toLowerCase();

  // Steady states are always amber
  if (t.indexOf('steady') >= 0 || t.indexOf('contained') >= 0 || t.indexOf('stable') >= 0 || t.indexOf('base') >= 0 || t.indexOf('awaiting') >= 0 || t.indexOf('watching') >= 0 || t.indexOf('priced') >= 0) return 'dir-neutral';

  var isRising = t.indexOf('rising') >= 0 || t.indexOf('upside') >= 0 || t.indexOf('building') >= 0 || t.indexOf('confirmed') >= 0;
  var isFalling = t.indexOf('falling') >= 0 || t.indexOf('downside') >= 0 || t.indexOf('declining') >= 0;
  if (!isRising && !isFalling) return null;

  // Neutral polarity: direction is informational only, always amber
  if (polarity === 'neutral' || !polarity) return 'dir-neutral';

  // For bearish narratives, invert: rising risk = bad (red), falling risk = good (green)
  var isBearish = polarity === 'downside';
  if (isBearish) return isRising ? 'dir-down' : 'dir-up';
  return isRising ? 'dir-up' : 'dir-down';
}

export function renderVerdict(data) {
  const v = data.verdict;
  if (!v || !v.scores || !v.scores.length) return '';
  const skewDir = (data.skew && data.skew.direction) || '';
  const vtCls = skewDir === 'upside' ? ' vt-positive' : skewDir === 'downside' ? ' vt-negative' : '';
  const hyps = data.hypotheses || [];
  const norm = (hyps.length)
    ? normaliseScores(hyps)
    : normaliseScores(v.scores);

  let scoresHtml = '';
  for (let i = 0; i < v.scores.length; i++) {
    const s = v.scores[i];
    // _dirCls is pre-computed by prepareHypotheses -- single source of truth
    const dirCls = s._dirCls || 'dir-neutral';
    const dirAttr = ' data-dir="' + dirCls + '"';
    scoresHtml += '<div class="vs-item ' + dirCls + '"' + dirAttr + '>' +
      '<div class="vs-label">' + (s.label || '') + '</div>' +
      '<div class="vs-score">' + (norm[i] != null ? norm[i] : 0) + '%</div>' +
      '<div class="vs-direction">' + (s.dirArrow || '') + ' ' + (s.dirText || '') + '</div>' +
    '</div>';
  }

  return '<div class="verdict-section">' +
    '<div class="verdict-inner">' +
      '<div class="verdict-text' + vtCls + '">' + (v.text || '') + '</div>' +
      '<div class="verdict-scores">' + scoresHtml + '</div>' +
    '</div>' +
  '</div>';
}

export function renderHypotheses(data) {
  if (!data.hypotheses || !data.hypotheses.length) return '';
  const t = data.ticker.toLowerCase();
  let cardsHtml = '';
  const norm = normaliseScores(data.hypotheses);

  for (let i = 0; i < data.hypotheses.length; i++) {
    const h = data.hypotheses[i];
    const normScore = norm[i] + '%';
    const normWidth = norm[i] + '%';

    let requiresHtml = '';
    if (h.requires && h.requires.length > 0) {
      requiresHtml = '<div class="hc-subtitle">Requires</div><ul class="hc-list requires">';
      for (let r = 0; r < h.requires.length; r++) {
        requiresHtml += '<li>' + h.requires[r] + '</li>';
      }
      requiresHtml += '</ul>';
    }

    let supportHtml = '';
    if (h.supporting && h.supporting.length > 0) {
      supportHtml = '<div class="hc-subtitle">' + h.supportingLabel + '</div><ul class="hc-list supports">';
      for (let s = 0; s < h.supporting.length; s++) {
        supportHtml += '<li>' + h.supporting[s] + '</li>';
      }
      supportHtml += '</ul>';
    }

    let contradictHtml = '';
    if (h.contradicting && h.contradicting.length > 0) {
      contradictHtml = '<div class="hc-subtitle">' + h.contradictingLabel + '</div><ul class="hc-list contradicts">';
      for (let c = 0; c < h.contradicting.length; c++) {
        contradictHtml += '<li>' + h.contradicting[c] + '</li>';
      }
      contradictHtml += '</ul>';
    }

    const tierMatch = (h.tier || '').toUpperCase().match(/^[NT]\d+/);
    let displayTitle = (h.title || '');
    if (tierMatch && !/^[NT]\d+[:\s]/i.test(displayTitle)) {
      displayTitle = tierMatch[0] + ': ' + displayTitle;
    }

    const dominantCls = (i === 0) ? ' dominant' : '';
    cardsHtml += '<div class="hyp-card ' + h.dirClass + dominantCls + '">' +
      '<div class="hc-header"><div class="hc-title">' + displayTitle + '</div><div class="hc-status ' + h.statusClass + '">' + h.statusText + '</div></div>' +
      '<div class="hc-score-row"><div class="hc-score-number">' + normScore + '</div><div class="hc-score-bar"><div class="hc-score-fill" style="width:' + normWidth + '"></div></div><div class="hc-score-meta">' + h.scoreMeta + '</div></div>' +
      '<p class="hc-desc">' + h.description + '</p>' +
      requiresHtml +
      supportHtml +
      contradictHtml +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-hypotheses">' +
    RS_HDR('Section 02', 'Competing Hypotheses') +
    '<div class="rs-body">' +
    cardsHtml +
  '</div></div>';
}

export function prepareHypotheses(data) {
  if (data._hypothesesPrepared) return;
  data._hypothesesPrepared = true;
  if (!data.hypotheses || !data.hypotheses.length) return;

  const dirMap = { upside: 'dir-up', downside: 'dir-down', neutral: 'dir-neutral' };
  const colorMap = { 'dir-up': 'var(--green)', 'dir-down': 'var(--red)', 'dir-neutral': 'var(--amber)' };

  const hyps = data.hypotheses;

  // No sort. The JSON stores hypotheses in canonical N1→N4 order and is the
  // source of truth. Sorting in place would permanently reorder STOCK_DATA,
  // stranding JSON-embedded N-labels (e.g. "N2: Structural Margin Erosion")
  // at the wrong array positions and diverging from the LLM context in ingest.py.

  // Enrich direction class -- do not rename tiers or titles.
  for (var i = 0; i < hyps.length; i++) {
    hyps[i].dirClass = dirMap[hyps[i].direction] || 'dir-neutral';
  }

  // Apply direction colours to verdict scores without renaming labels.
  // Also compute _dirCls (composite direction class) once for all rendering surfaces.
  if (data.verdict && data.verdict.scores) {
    for (var i = 0; i < data.verdict.scores.length; i++) {
      var vs = data.verdict.scores[i];
      // scoreColor: match by raw score value to hypothesis polarity
      if (hyps[i]) {
        vs.scoreColor = colorMap[hyps[i].dirClass] || vs.scoreColor;
      }
      // _dirCls: composite direction class (good/bad for the stock)
      if (vs.dirColor) {
        // Explicit colour set by backend -- map to CSS class
        if (vs.dirColor.indexOf('green') >= 0) vs._dirCls = 'dir-up';
        else if (vs.dirColor.indexOf('red') >= 0) vs._dirCls = 'dir-down';
        else vs._dirCls = 'dir-neutral';
      } else {
        var polarity = vs.polarity || (hyps[i] ? hyps[i].direction : null) || _inferPolarity(vs.label) || 'neutral';
        vs._dirCls = _dirTextToCls(vs.dirText, polarity) || (hyps[i] ? hyps[i].dirClass || 'dir-neutral' : 'dir-neutral');
      }
    }
  }

  // Rebuild alignmentSummary column headers to match sorted display order.
  if (data.evidence && data.evidence.alignmentSummary && typeof data.evidence.alignmentSummary === 'object') {
    const as = data.evidence.alignmentSummary;
    if (Array.isArray(as.headers) && as.headers.length >= 5 && as.rows) {
      const nonNCount = as.headers.length - hyps.length;
      const newHeaders = as.headers.slice(0, nonNCount);
      for (var i = 0; i < hyps.length; i++) {
        newHeaders.push(hyps[i].title.substring(0, 18));
      }
      as.headers = newHeaders;
    }
  }
}

export function renderOvercorrectionBanner(data) {
  const oc = data._overcorrection;
  if (!oc || !oc.active) return '';
  const cls = oc.reviewResult && oc.reviewResult.confirmed ? ' confirmed' : '';
  const label = oc.reviewResult && oc.reviewResult.confirmed
    ? '&#10004; Overcorrection Confirmed'
    : '&#9888; Possible Overcorrection Detected';
  const message = oc.message || 'Price move exceeded threshold  --  scores under review.';
  let reviewHtml = oc.reviewDate
    ? '<div class="oc-review">5-day review scheduled: ' + oc.reviewDate + '</div>'
    : '';
  if (oc.reviewResult) {
    reviewHtml = '<div class="oc-review">' + oc.reviewResult.message + '</div>';
  }
  return '<div class="overcorrection-banner' + cls + '">' +
    '<div class="oc-label">' + label + '</div>' +
    '<div class="oc-message">' + message + '</div>' +
    reviewHtml +
  '</div>';
}

