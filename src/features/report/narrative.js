// Report narrative section renderer

import { RS_HDR } from './shared.js';

export function renderNarrative(data) {
  const n = data.narrative;
  if (!n) return '';
  const t = data.ticker.toLowerCase();
  const pi = n.priceImplication || {};

  return '<div class="report-section" id="' + t + '-narrative">' +
    RS_HDR('Section 03', 'Dominant Narrative') +
    '<div class="rs-body">' +
    '<div class="rs-subtitle">The Narrative</div>' +
    '<div class="rs-text">' + (n.theNarrative || 'Pending analysis.') + '</div>' +
    (pi.label || pi.content ? '<div class="rs-subtitle">The Price Implication</div>' +
    '<div class="callout">' +
      '<div class="callout-label">' + (pi.label || '') + '</div>' +
      '<div class="rs-text">' + (pi.content || '') + '</div>' +
    '</div>' : '') +
    (n.evidenceCheck ? '<div class="rs-subtitle">The Evidence Check</div>' +
    '<div class="rs-text">' + n.evidenceCheck + '</div>' : '') +
    (n.narrativeStability ? '<div class="rs-subtitle">Narrative Stability</div>' +
    '<div class="rs-text">' + n.narrativeStability + '</div>' : '') +
  '</div></div>';
}
