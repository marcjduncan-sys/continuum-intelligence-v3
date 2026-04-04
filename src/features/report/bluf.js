// BLUF (Bottom Line Up Front) section renderer
// Renders thesis summary paragraph + theme tags from hero.embedded_thesis

import { normaliseScores } from '../../lib/dom.js';

export function renderBLUF(data) {
  const t = data.ticker.toLowerCase();
  const thesis = (data.hero && data.hero.embedded_thesis) || '';
  if (!thesis) return '';

  // Build theme tags from hypotheses
  const hyps = data.hypotheses || [];
  const tagColors = ['green', 'blue', 'amber', 'red', 'violet'];
  let tagsHtml = '';
  if (hyps.length) {
    tagsHtml = '<div class="bluf-tags">';
    for (let i = 0; i < hyps.length; i++) {
      const title = (hyps[i].title || '').replace(/^[NT]\d+[\s:]*/, '').trim();
      // Truncate long titles to first ~40 chars
      const shortTitle = title.length > 40 ? title.substring(0, 40) + '...' : title;
      const color = tagColors[i % tagColors.length];
      tagsHtml += '<span class="tag ' + color + '">' + shortTitle + '</span>';
    }
    tagsHtml += '</div>';
  }

  return '<section class="section" id="' + t + '-bluf">' +
    '<div class="section-header">' +
      '<div>' +
        '<div class="eyebrow">Investment Thesis &middot; Section 01</div>' +
        '<h2 class="sec-title">Bottom Line Up Front</h2>' +
      '</div>' +
    '</div>' +
    '<div class="bluf-text">' + thesis + '</div>' +
    tagsHtml +
  '</section>';
}
