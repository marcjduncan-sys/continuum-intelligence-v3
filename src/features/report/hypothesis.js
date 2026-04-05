// Hypothesis section renderers
// Extracted from report-sections.js without logic changes

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
  const worlds = (data.hero && data.hero.position_in_range && data.hero.position_in_range.worlds) || [];
  const currency = data.currency || 'A$';

  // Map hypotheses to case classes and labels: BULL, BASE, BEAR, SWING
  const caseClasses = [];
  const caseLabels = [];
  let bullIndex = -1, baseIndex = -1, bearIndex = -1, swingIndex = -1;

  for (let i = 0; i < data.hypotheses.length; i++) {
    const h = data.hypotheses[i];
    let caseClass = null;
    let caseLabel = null;

    if (h.direction === 'upside' && bullIndex === -1) {
      caseClass = 'bull';
      caseLabel = 'BULL';
      bullIndex = i;
    } else if (h.direction === 'neutral' && baseIndex === -1) {
      caseClass = 'base';
      caseLabel = 'BASE';
      baseIndex = i;
    } else if (h.direction === 'downside' && bearIndex === -1) {
      caseClass = 'bear';
      caseLabel = 'BEAR';
      bearIndex = i;
    } else if (h.direction === 'downside' && swingIndex === -1) {
      caseClass = 'swing';
      caseLabel = 'SWING';
      swingIndex = i;
    } else if (h.direction === 'neutral' && swingIndex === -1) {
      caseClass = 'swing';
      caseLabel = 'SWING';
      swingIndex = i;
    } else {
      // Fallback for remaining cases
      caseClass = 'swing';
      caseLabel = 'SWING';
    }

    caseClasses.push(caseClass);
    caseLabels.push(caseLabel);
  }

  // Render ACH case cards
  for (let i = 0; i < data.hypotheses.length; i++) {
    const h = data.hypotheses[i];
    const normScore = norm[i];
    const scorePct = normScore + '%';
    const caseClass = caseClasses[i] || 'swing';
    const caseLabel = caseLabels[i] || 'SWING';

    // Get price target from worlds by matching case class to world label
    let priceTarget = '';
    for (let w = 0; w < worlds.length; w++) {
      const world = worlds[w];
      const worldLabelLower = (world.label || '').toLowerCase();
      if (worldLabelLower.indexOf(caseClass) >= 0) {
        priceTarget = currency + world.price;
        break;
      }
    }

    // Extract title without tier prefix
    let displayTitle = (h.title || '');
    const tierMatch = (h.tier || '').toUpperCase().match(/^[NT]\d+/);
    if (tierMatch && displayTitle.indexOf(':') >= 0) {
      const parts = displayTitle.split(':');
      displayTitle = parts.slice(1).join(':').trim();
    } else if (tierMatch) {
      displayTitle = displayTitle.replace(/^[NT]\d+[\s:]*/, '').trim();
    }

    // Truncate description to ~200 chars
    const descShort = h.description && h.description.length > 200
      ? h.description.substring(0, 200) + '...'
      : h.description;

    // Build evidence items (supporting)
    let supportingHtml = '';
    if (h.supporting && h.supporting.length > 0) {
      supportingHtml = '<div class="ev-items">';
      for (let s = 0; s < h.supporting.length; s++) {
        supportingHtml += '<div class="ev-item"><span class="ev-bullet for">&#9650;</span><span>' + h.supporting[s] + '</span></div>';
      }
      supportingHtml += '</div>';
    }

    // Build evidence items (contradicting/against)
    let contradictingHtml = '';
    if (h.contradicting && h.contradicting.length > 0) {
      contradictingHtml = '<div class="ev-items">';
      for (let c = 0; c < h.contradicting.length; c++) {
        contradictingHtml += '<div class="ev-item"><span class="ev-bullet against">&#9660;</span><span>' + h.contradicting[c] + '</span></div>';
      }
      contradictingHtml += '</div>';
    }

    // Calculate EWP contribution (this hypothesis's share of total)
    const ewpTotal = data.hero && data.hero.position_in_range && data.hero.position_in_range.current_price
      ? data.hero.position_in_range.current_price
      : '';
    const contributionValue = ewpTotal ? (normScore / 100 * ewpTotal).toFixed(2) : '';
    const contributionText = contributionValue ? currency + contributionValue : '';

    cardsHtml += '<div class="ach-case ' + caseClass + '">' +
      '<div class="ach-case-head">' +
        '<div class="ach-case-icon">' + caseLabel + '</div>' +
        '<div>' +
          '<div class="ach-case-label">' + caseLabel + ' Case</div>' +
          '<div class="ach-case-title">' + displayTitle + '</div>' +
          '<div class="ach-case-bluf">' + descShort + '</div>' +
        '</div>' +
        '<div class="ach-case-meta">' +
          '<div class="ach-price-target">' + priceTarget + '</div>' +
          '<div class="ach-probability">' + normScore + '% weight</div>' +
        '</div>' +
      '</div>' +
      '<div class="ach-evidence">' +
        '<div class="ach-ev-col">' +
          '<div class="ach-ev-head for"><span class="ev-dot"></span>Evidence For</div>' +
          supportingHtml +
        '</div>' +
        '<div class="ach-ev-col">' +
          '<div class="ach-ev-head against"><span class="ev-dot"></span>Evidence Against</div>' +
          contradictingHtml +
        '</div>' +
      '</div>' +
      '<div class="ach-contribution">' +
        '<span class="contrib-label">EWP Contribution</span>' +
        '<div class="contrib-track"><div class="contrib-fill" style="width:' + scorePct + '"></div></div>' +
        '<span class="contrib-weight">' + contributionText + ' of ' + (ewpTotal ? currency + ewpTotal.toFixed(2) : '') + '</span>' +
      '</div>' +
    '</div>';
  }

  return '<div class="report-section" id="' + t + '-hypotheses">' +
    '<div class="section-header">' +
      '<div>' +
        '<div class="eyebrow">ACH Framework - Section 02</div>' +
        '<h2 class="sec-title">Competing Hypotheses</h2>' +
        '<p class="sec-sub">Four cases. Evidence for and against each. Probability weights feed the Evidence Weighted Price.</p>' +
      '</div>' +
    '</div>' +
    '<div class="ach-grid">' +
    cardsHtml +
    '</div>' +
  '</div>';
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
