// snapshot.js — Snapshot data builder and page renderers
// Extracted from index.html without logic changes

import { STOCK_DATA, SNAPSHOT_DATA, SNAPSHOT_ORDER } from '../lib/state.js';
import { normaliseScores, computeSkewScore } from '../lib/dom.js';
import { renderPDFDownload } from './report-sections.js';
import { prepareHypotheses } from './report-sections.js';
import { on } from '../lib/data-events.js';
import { renderedSnapshots } from '../lib/router.js';

export function buildSnapshotFromStock(ticker) {
  var stock = STOCK_DATA[ticker];
  if (!stock) return null;

  // 1. Clone hypotheses  --  already sorted by prepareHypotheses (disconfirmation ranking)
  var hyps = [];
  for (var i = 0; i < stock.hypotheses.length; i++) {
    var h = stock.hypotheses[i];
    hyps.push({
      originalTier: h.tier,
      direction: h.direction,
      title: h.title.replace(/^N\d+:\s*/, ''),
      statusClass: h.statusClass,
      statusText: h.statusText,
      score: parseInt(h.score) || 0,
      scoreMeta: h.scoreMeta,
      description: h.description
    });
  }
  // Note: not re-sorting  --  prepareHypotheses already ranked by fewest contradictions (v3 framework)

  // Build original tier -> new position mapping
  var tierMap = {};
  for (var i = 0; i < hyps.length; i++) {
    tierMap[hyps[i].originalTier] = i;
  }

  // Build N-reference remapper for snapshot text fields
  var snapRemapN = function(text) {
    if (!text || typeof text !== 'string') return text;
    return text.replace(/\bN([1-4])\b/g, function(m, n) {
      var oldTier = 'n' + n;
      var newIdx = tierMap[oldTier];
      return newIdx !== undefined ? 'N' + (newIdx + 1) : m;
    });
  };

  // 2. Normalise scores to 100% with v3 floor/ceiling
  var normScores = normaliseScores(hyps);

  // 3. Direction -> CSS class mappings
  var dirCls = { upside: 'snap-upside', downside: 'snap-downside', neutral: 'snap-neutral' };
  var dirSbCls = { upside: 'snap-sb-upside', downside: 'snap-sb-downside', neutral: 'snap-sb-neutral' };
  var dirColor = { upside: 'var(--signal-green)', downside: 'var(--signal-red)', neutral: 'var(--signal-amber)' };
  var dirScoreCls = { upside: 'priced', downside: 'high', neutral: 'medium' };
  var statusTagMap = { priced: 'snap-tag-priced', accumulating: 'snap-tag-accumulating', active: 'snap-tag-tail', minimal: 'snap-tag-minimal' };

  // Parse direction and label from scoreMeta
  function parseDirMeta(meta) {
    if (!meta) return { direction: 'flat', dirLabel: '&rarr; Steady' };
    var label = meta.replace(/^[^&]*/, '').trim();
    if (!label) label = meta;
    if (meta.indexOf('&uarr;') >= 0) return { direction: 'up', dirLabel: label };
    if (meta.indexOf('&darr;') >= 0) return { direction: 'down', dirLabel: label };
    return { direction: 'flat', dirLabel: label };
  }

  // 4. Build survival bar
  var survivalBar = [];
  var survivalLegend = [];
  for (var i = 0; i < hyps.length; i++) {
    survivalBar.push({
      cls: dirSbCls[hyps[i].direction] || 'snap-sb-neutral',
      width: normScores[i] + '%',
      label: 'N' + (i + 1) + ': ' + normScores[i] + '%'
    });
    survivalLegend.push({
      color: dirColor[hyps[i].direction] || 'var(--signal-amber)',
      label: hyps[i].title
    });
  }

  // 5. Build hypothesis cards
  var snapHyps = [];
  for (var i = 0; i < hyps.length; i++) {
    var dm = parseDirMeta(hyps[i].scoreMeta);
    var desc = hyps[i].description;
    if (desc.length > 200) desc = desc.substring(0, 197) + '...';
    snapHyps.push({
      cls: dirCls[hyps[i].direction] || 'snap-neutral',
      label: 'N' + (i + 1) + ': ' + hyps[i].title,
      statusTag: statusTagMap[hyps[i].statusClass] || 'snap-tag-minimal',
      statusText: hyps[i].statusText,
      desc: desc,
      score: normScores[i] + '%',
      scoreCls: dirScoreCls[hyps[i].direction] || 'medium',
      direction: dm.direction,
      dirLabel: dm.dirLabel
    });
  }

  // 6. Build evidence matrix from evidence card tags
  var matrixHeaders = ['Domain'];
  for (var i = 0; i < hyps.length; i++) {
    matrixHeaders.push('N' + (i + 1) + ' ' + hyps[i].title.substring(0, 12));
  }

  var matrixRows = [];
  var cards = stock.evidence && stock.evidence.cards ? stock.evidence.cards : [];
  var maxCards = Math.min(cards.length, 8);
  for (var c = 0; c < maxCards; c++) {
    var card = cards[c];
    var cells = [];
    for (var h2 = 0; h2 < hyps.length; h2++) {
      cells.push({ cls: 'snap-signal-neutral', text: '&mdash;' });
    }
    if (card.tags) {
      for (var t = 0; t < card.tags.length; t++) {
        var tag = card.tags[t];
        var tierMatch = tag.text.match(/N(\d)/);
        if (tierMatch) {
          var origTier = 'n' + tierMatch[1];
          var newPos = tierMap[origTier];
          if (newPos !== undefined) {
            if (tag.class === 'strong') {
              cells[newPos] = { cls: 'snap-signal-strong-support', text: '&#9650;&#9650;' };
            } else if (tag.class === 'supports') {
              cells[newPos] = { cls: 'snap-signal-support', text: '&#9650;' };
            } else if (tag.class === 'contradicts') {
              cells[newPos] = { cls: 'snap-signal-contradict', text: '&#9660;' };
            }
          }
        }
      }
    }
    var domainName = card.title.replace(/^\d+\.\s*/, '');
    var epistemic = card.epistemicLabel || '';
    if (epistemic.indexOf('/') >= 0) epistemic = epistemic.split('/')[0].trim();
    matrixRows.push({ domain: domainName, epistemic: epistemic, cells: cells });
  }

  // 7. Build discriminators
  var snapDiscrim = [];
  var discRows = stock.discriminators && stock.discriminators.rows ? stock.discriminators.rows : [];
  for (var d = 0; d < Math.min(discRows.length, 4); d++) {
    var disc = discRows[d];
    snapDiscrim.push({
      level: disc.diagnosticity,
      cls: disc.diagnosticityClass.replace('disc-', ''),
      text: snapRemapN(disc.evidence)
    });
  }

  // Non-discriminating chips
  var ndText = stock.discriminators && stock.discriminators.nonDiscriminating ? stock.discriminators.nonDiscriminating : '';
  var ndChips = [];
  if (typeof ndText === 'string') {
    var parts = ndText.split('&bull;');
    for (var p = 0; p < Math.min(parts.length, 5); p++) {
      var chip = parts[p].replace(/<[^>]+>/g, '').trim();
      if (chip) ndChips.push(chip);
    }
  }

  // 8. Build tripwires
  var snapTripwires = [];
  var tripCards = stock.tripwires && stock.tripwires.cards ? stock.tripwires.cards : [];
  for (var tc2 = 0; tc2 < Math.min(tripCards.length, 4); tc2++) {
    var tw = tripCards[tc2];
    var conds = [];
    for (var co = 0; co < tw.conditions.length; co++) {
      var cond = tw.conditions[co];
      var icon = cond.valence === 'positive' ? '&#9650;' : '&#9660;';
      var iconCls = cond.valence === 'positive' ? 'up' : 'down';
      var condText = snapRemapN(cond.if.replace(/^If\s+/i, ''));
      var thenShort = snapRemapN(cond.then.split('.')[0]);
      conds.push({ icon: icon, iconCls: iconCls, text: condText + ' &rarr; ' + thenShort });
    }
    snapTripwires.push({ date: tw.date, name: tw.name.replace(/\s*&mdash;.*/, ''), conditions: conds });
  }

  // 9. Evidence coverage
  var snapCoverage = [];
  var coverageRows = stock.gaps && stock.gaps.coverageRows ? stock.gaps.coverageRows : [];
  for (var g = 0; g < Math.min(coverageRows.length, 8); g++) {
    var gr = coverageRows[g];
    var sCls = gr.coverageLevel === 'full' || gr.coverageLevel === 'good' ? 'snap-gap-full' :
              gr.coverageLevel === 'partial' ? 'snap-gap-partial' : 'snap-gap-limited';
    snapCoverage.push({ domain: gr.domain, status: gr.coverageLabel.toUpperCase(), cls: sCls });
  }

  // 10. Questions from gaps
  var snapQuestions = [];
  var couldntAssess = stock.gaps && stock.gaps.couldntAssess ? stock.gaps.couldntAssess : [];
  for (var q = 0; q < Math.min(couldntAssess.length, 3); q++) {
    snapQuestions.push(couldntAssess[q].replace(/<[^>]+>/g, ''));
  }

  // 11. Price metrics from heroMetrics
  var priceMetrics = [];
  for (var m = 0; m < stock.heroMetrics.length; m++) {
    priceMetrics.push({
      label: stock.heroMetrics[m].label,
      value: stock.heroMetrics[m].value,
      cls: stock.heroMetrics[m].colorClass || ''
    });
  }

  // 12. Skew badge  --  derived from computed score, not static data
  var skewComputed = stock._skew || computeSkewScore(stock);
  var skewBadge = skewComputed.direction === 'downside' ? '&#9660; DOWNSIDE' :
                  skewComputed.direction === 'upside' ? '&#9650; UPSIDE' : '&#9670; BALANCED';

  // 13. Date formatting
  var dateStr = stock.date;
  var dateMatch = dateStr.match(/(\d+)\s+(\w+)\s+(\d+)/);
  if (dateMatch) dateStr = dateMatch[1] + ' ' + dateMatch[2].toUpperCase().substring(0, 3) + ' ' + dateMatch[3];

  return {
    ticker: stock.ticker,
    tickerFull: stock.tickerFull,
    company: stock.company,
    sector: stock.sector,
    sectorSub: stock.sectorSub,
    price: stock._livePrice || stock.price,
    currency: stock.currency,
    date: dateStr,
    version: 'v1.0',
    reportId: stock.reportId,
    priceMetrics: priceMetrics,
    riskSkew: { direction: skewComputed.direction, badge: skewBadge, rationale: stock.skew.rationale, computed: skewComputed },
    narrative: { text: stock.narrative.theNarrative || '', verdict: stock.verdict.text || '' },
    survivalBar: survivalBar,
    survivalLegend: survivalLegend,
    hypotheses: snapHyps,
    evidenceMatrix: { headers: matrixHeaders, rows: matrixRows },
    discriminators: snapDiscrim,
    nonDiscriminating: ndChips,
    tripwires: snapTripwires,
    evidenceCoverage: snapCoverage,
    questions: snapQuestions,
    technicalAnalysis: stock.technicalAnalysis ? {
      regime: stock.technicalAnalysis.regime,
      trend: stock.technicalAnalysis.trend.direction + ' (' + stock.technicalAnalysis.trend.duration + ')',
      ma50: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.movingAverages.ma50.value.toFixed(2),
      ma200: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.movingAverages.ma200.value.toFixed(2),
      vsMa50: stock.technicalAnalysis.movingAverages.priceVsMa50.toFixed(1) + '%',
      vsMa200: stock.technicalAnalysis.movingAverages.priceVsMa200.toFixed(1) + '%',
      support: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.keyLevels.support.price.toFixed(2),
      resistance: stock.technicalAnalysis.price.currency + stock.technicalAnalysis.keyLevels.resistance.price.toFixed(2),
      rangePosition: 'Lower ' + stock.technicalAnalysis.meanReversion.rangePosition + '%',
      crossover: stock.technicalAnalysis.movingAverages.crossover ? stock.technicalAnalysis.movingAverages.crossover.type + ' (' + stock.technicalAnalysis.movingAverages.crossover.date + ')' : null
    } : null,
    footerDisclaimer: 'This report does not constitute personal financial advice. Continuum Intelligence synthesises cross-domain evidence using ACH methodology. All data sourced from ASX filings, broker consensus, and publicly available data as at report date. Hypothesis scores reflect editorial assessment.',
    footerMeta: [
      { label: 'ID: ' + stock.reportId },
      { label: 'MODE: Narrative Intelligence' },
      { label: 'NEXT: Mar 2026' }
    ]
  };
}

export function renderSnapshotListCard(data) {
  return '<div class="snapshot-card" onclick="navigate(\'snapshot-' + data.ticker + '\')" tabindex="0" role="link" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();navigate(\'snapshot-' + data.ticker + '\')}">' +
    '<div class="sc-top">' +
      '<div>' +
        '<div class="sc-ticker">' + data.tickerFull + '</div>' +
        '<div class="sc-company">' + data.company + '</div>' +
        '<div class="sc-sector">' + data.sector + ' &bull; ' + data.sectorSub + '</div>' +
      '</div>' +
      '<div class="sc-price"><span class="sc-price-currency">' + data.currency + '</span>' + data.price + '</div>' +
    '</div>' +
    '<div class="sc-meta">' +
      data.priceMetrics.slice(0, 4).map(function(m) {
        return '<div class="sc-meta-item">' + m.label + ': <span class="sc-meta-value">' + m.value + '</span></div>';
      }).join('') +
    '</div>' +
    '<div class="sc-skew">' +
      (data.riskSkew.computed ?
        '<div class="skew-bar-track" style="width:48px;height:6px">' +
          '<div class="skew-bar-bull" style="width:' + data.riskSkew.computed.bull + '%"></div>' +
          '<div class="skew-bar-bear" style="width:' + data.riskSkew.computed.bear + '%"></div>' +
        '</div>' +
        '<span class="skew-score ' + (data.riskSkew.computed.score > 5 ? 'positive' : data.riskSkew.computed.score < -5 ? 'negative' : 'neutral') + '" style="font-size:0.7rem">' + (data.riskSkew.computed.score > 0 ? '+' : '') + data.riskSkew.computed.score + '</span>'
        : '<span class="skew-badge ' + data.riskSkew.direction + '">' + data.riskSkew.badge + '</span>') +
      '<span class="sc-skew-rationale">' + data.riskSkew.rationale.substring(0, 120) + '&hellip;</span>' +
    '</div>' +
  '</div>';
}

export function renderSnapshotPage(data) {
  // Price metrics
  var priceMetricsHtml = '';
  for (var i = 0; i < data.priceMetrics.length; i++) {
    var m = data.priceMetrics[i];
    priceMetricsHtml += '<div class="snap-pm-item"><span class="snap-pm-label">' + m.label + '</span><span class="snap-pm-value' + (m.cls ? ' ' + m.cls : '') + '">' + m.value + '</span></div>';
  }

  // Survival bar segments
  var survivalHtml = '';
  for (var i = 0; i < data.survivalBar.length; i++) {
    var s = data.survivalBar[i];
    survivalHtml += '<div class="snap-sb-segment ' + s.cls + '" style="width:' + s.width + '">' + s.label + '</div>';
  }
  var legendHtml = '';
  for (var i = 0; i < data.survivalLegend.length; i++) {
    var l = data.survivalLegend[i];
    legendHtml += '<div class="snap-sl-item"><div class="snap-sl-dot" style="background:' + l.color + '"></div>' + l.label + '</div>';
  }

  // Hypothesis cards
  var hypsHtml = '';
  for (var i = 0; i < data.hypotheses.length; i++) {
    var h = data.hypotheses[i];
    hypsHtml += '<div class="snap-hyp-card ' + h.cls + '">' +
      '<div class="snap-hyp-info">' +
        '<div class="snap-hyp-label">' + h.label + ' <span class="snap-hyp-status-tag ' + h.statusTag + '">' + h.statusText + '</span></div>' +
        '<div class="snap-hyp-desc">' + h.desc + '</div>' +
      '</div>' +
      '<div class="snap-hyp-score-container">' +
        '<div class="snap-hyp-score ' + h.scoreCls + '">' + h.score + '</div>' +
        '<div class="snap-hyp-direction ' + h.direction + '">' + h.dirLabel + '</div>' +
      '</div>' +
    '</div>';
  }

  // Evidence matrix
  var evHeaderHtml = '';
  for (var i = 0; i < data.evidenceMatrix.headers.length; i++) {
    evHeaderHtml += '<div class="snap-ev-cell">' + data.evidenceMatrix.headers[i] + '</div>';
  }
  var evRowsHtml = '';
  for (var i = 0; i < data.evidenceMatrix.rows.length; i++) {
    var row = data.evidenceMatrix.rows[i];
    var cellsHtml = '<div class="snap-ev-cell snap-ev-domain">' + row.domain + ' <span class="snap-ev-epistemic">' + row.epistemic + '</span></div>';
    for (var j = 0; j < row.cells.length; j++) {
      var c = row.cells[j];
      var styleAttr = c.style ? ' style="' + c.style + '"' : '';
      cellsHtml += '<div class="snap-ev-cell snap-ev-signal ' + c.cls + '"' + styleAttr + '>' + c.text + '</div>';
    }
    evRowsHtml += '<div class="snap-ev-matrix-row">' + cellsHtml + '</div>';
  }

  // Discriminators
  var discrimHtml = '';
  for (var i = 0; i < data.discriminators.length; i++) {
    var d = data.discriminators[i];
    discrimHtml += '<div class="snap-discrim-item"><div class="snap-discrim-tag ' + d.cls + '">' + d.level + '</div><div class="snap-discrim-text">' + d.text + '</div></div>';
  }
  var ndChips = '';
  for (var i = 0; i < data.nonDiscriminating.length; i++) {
    ndChips += '<span class="snap-nd-chip">' + data.nonDiscriminating[i] + '</span>';
  }

  // Tripwires
  var tripwiresHtml = '';
  for (var i = 0; i < data.tripwires.length; i++) {
    var tw = data.tripwires[i];
    var condHtml = '';
    for (var j = 0; j < tw.conditions.length; j++) {
      var c = tw.conditions[j];
      condHtml += '<div class="snap-tw-if"><span class="snap-tw-if-icon ' + c.iconCls + '">' + c.icon + '</span><span>' + c.text + '</span></div>';
    }
    tripwiresHtml += '<div class="snap-tripwire-card"><div class="snap-tw-header"><span class="snap-tw-date">' + tw.date + '</span><span class="snap-tw-test-name">' + tw.name + '</span></div><div class="snap-tw-conditions">' + condHtml + '</div></div>';
  }

  // Evidence coverage
  var coverageHtml = '';
  for (var i = 0; i < data.evidenceCoverage.length; i++) {
    var g = data.evidenceCoverage[i];
    coverageHtml += '<div class="snap-gap-row"><span class="snap-gap-domain">' + g.domain + '</span><span class="snap-gap-status ' + g.cls + '">' + g.status + '</span></div>';
  }

  // Questions
  var questionsHtml = '';
  for (var i = 0; i < data.questions.length; i++) {
    questionsHtml += '<div class="snap-question-item">' + data.questions[i] + '</div>';
  }

  // Footer meta
  var footerMetaHtml = '';
  for (var i = 0; i < data.footerMeta.length; i++) {
    footerMetaHtml += '<span class="snap-footer-meta">' + data.footerMeta[i].label + '</span>';
  }

  return '<div class="snap-page">' +
    '<a class="snap-back" href="#snapshots" onclick="navigate(\'snapshots\')">&larr; Back to Snapshots</a>' +
    '<a class="snap-view-full" href="#report-' + data.ticker + '" onclick="navigate(\'report-' + data.ticker + '\')" style="float:right;margin-top:4px">View Full Report &rarr;</a>' +
    '<div class="snap-header">' +
      '<div class="snap-header-left">' +
        '<span class="snap-ticker">' + data.tickerFull + '</span>' +
        '<span class="snap-company-name">' + data.company + '</span>' +
        '<span class="snap-sector-tag">' + data.sector + ' &bull; ' + data.sectorSub + '</span>' +
      '</div>' +
      '<div class="snap-header-right">' +
        '<div class="snap-logo-mark">CONTIN<span class="brand-green">UU</span>M INTE<span class="brand-green">LL</span>IGENCE</div>' +
        '<div class="snap-report-date">' + data.date + ' &bull; ' + data.version + '</div>' +
      '</div>' +
    '</div>' +

    '<div class="snap-price-bar">' +
      '<div><span class="snap-price-currency">' + data.currency + '</span><span class="snap-price-main">' + data.price + '</span></div>' +
      '<div class="snap-price-meta">' + priceMetricsHtml + '</div>' +
    '</div>' +

    '<div class="snap-risk-skew-bar">' +
      '<span class="snap-risk-skew-label">Thesis Skew</span>' +
      '<span class="snap-risk-skew-badge ' + data.riskSkew.direction + '">' + data.riskSkew.badge + '</span>' +
      (data.riskSkew.computed ?
        '<div class="skew-bar-track" style="width:64px;height:7px;margin:0 4px">' +
          '<div class="skew-bar-bull" style="width:' + data.riskSkew.computed.bull + '%"></div>' +
          '<div class="skew-bar-bear" style="width:' + data.riskSkew.computed.bear + '%"></div>' +
        '</div>' +
        '<span class="skew-score ' + (data.riskSkew.computed.score > 5 ? 'positive' : data.riskSkew.computed.score < -5 ? 'negative' : 'neutral') + '" style="font-size:0.78rem">' + (data.riskSkew.computed.score > 0 ? '+' : '') + data.riskSkew.computed.score + '</span>'
        : '') +
      '<span class="snap-risk-skew-rationale">' + data.riskSkew.rationale + '</span>' +
    '</div>' +

    '<div class="snap-main-grid">' +
      // LEFT COLUMN
      '<div class="snap-col">' +
        '<div><div class="snap-section-label">Dominant Narrative</div>' +
          '<div class="snap-narrative-box">' +
            '<div class="snap-narrative-text">' + data.narrative.text + '</div>' +
            '<div class="snap-narrative-verdict">' + data.narrative.verdict + '</div>' +
          '</div>' +
        '</div>' +
        '<div><div class="snap-section-label">Hypothesis Survival</div>' +
          '<div class="snap-survival-bar-container">' +
            '<div class="snap-survival-bar">' + survivalHtml + '</div>' +
            '<div class="snap-survival-legend">' + legendHtml + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="snap-hyp-stack">' + hypsHtml + '</div>' +
      '</div>' +

      // CENTER COLUMN
      '<div class="snap-col">' +
        '<div><div class="snap-section-label">Cross-Domain Evidence Matrix</div>' +
          '<div class="snap-evidence-matrix">' +
            '<div class="snap-ev-matrix-header">' + evHeaderHtml + '</div>' +
            evRowsHtml +
          '</div>' +
        '</div>' +
        '<div><div class="snap-section-label">What Discriminates</div>' +
          '<div class="snap-discrim-box">' +
            discrimHtml +
            '<div class="snap-non-discrim">' +
              '<div class="snap-non-discrim-label">Assessed &amp; Discarded (non-discriminating)</div>' +
              '<div class="snap-non-discrim-items">' + ndChips + '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      // RIGHT COLUMN
      '<div class="snap-col">' +
        '<div><div class="snap-section-label">What We\'re Watching</div>' +
          '<div class="snap-tripwire-list">' + tripwiresHtml + '</div>' +
        '</div>' +
        '<div><div class="snap-section-label">Evidence Coverage</div>' +
          '<div class="snap-gaps-box">' + coverageHtml + '</div>' +
        '</div>' +
        (data.technicalAnalysis ? '<div><div class="snap-section-label">Technical Structure</div>' +
          '<div class="snap-gaps-box">' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">Regime</span><span class="snap-gap-status snap-gap-full">' + data.technicalAnalysis.regime + '</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">Trend</span><span class="snap-gap-status snap-gap-limited">' + data.technicalAnalysis.trend + '</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">50-Day MA</span><span style="font-family:var(--font-data);font-size:0.58rem;color:var(--text-secondary)">' + data.technicalAnalysis.ma50 + ' (' + data.technicalAnalysis.vsMa50 + ')</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">200-Day MA</span><span style="font-family:var(--font-data);font-size:0.58rem;color:var(--text-secondary)">' + data.technicalAnalysis.ma200 + ' (' + data.technicalAnalysis.vsMa200 + ')</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">Support</span><span style="font-family:var(--font-data);font-size:0.58rem;color:var(--signal-green)">' + data.technicalAnalysis.support + '</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">Resistance</span><span style="font-family:var(--font-data);font-size:0.58rem;color:var(--signal-red)">' + data.technicalAnalysis.resistance + '</span></div>' +
            '<div class="snap-gap-row"><span class="snap-gap-domain">Range Position</span><span style="font-family:var(--font-data);font-size:0.58rem;color:var(--signal-red)">' + data.technicalAnalysis.rangePosition + '</span></div>' +
            (data.technicalAnalysis.crossover ? '<div class="snap-gap-row"><span class="snap-gap-domain">Crossover</span><span style="font-family:var(--font-data);font-size:0.5rem;color:var(--signal-red)">' + data.technicalAnalysis.crossover + '</span></div>' : '') +
          '</div>' +
        '</div>' : '') +
        '<div><div class="snap-section-label">Unanswered Questions</div>' +
          '<div class="snap-questions-box">' + questionsHtml + '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="snap-footer">' +
      '<div class="snap-footer-left">' + data.footerDisclaimer + '</div>' +
      '<div class="snap-footer-right">' + footerMetaHtml + '</div>' +
    '</div>' +
    renderPDFDownload(data) +
  '</div>';
}

export function renderSnapshot(ticker) {
  var data = SNAPSHOT_DATA[ticker];
  if (!data) {
    data = buildSnapshotFromStock(ticker);
    if (data) SNAPSHOT_DATA[ticker] = data;
  }
  if (!data) return '<div class="snap-page"><p>Snapshot not available for ' + ticker + '</p></div>';
  return renderSnapshotPage(data);
}

// Listen for STOCK_DATA changes to invalidate stale snapshot data
on('stock:updated', function(evt) {
  if (!SNAPSHOT_DATA[evt.ticker]) return;
  SNAPSHOT_DATA[evt.ticker] = buildSnapshotFromStock(evt.ticker);
  renderedSnapshots.delete(evt.ticker);
});
