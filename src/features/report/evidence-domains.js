// Evidence Domains grid renderer
// Renders 10 domain cards with scores and confidence bars from data.evidence.cards

export function renderEvidenceDomains(data) {
  const ev = data.evidence;
  if (!ev || !ev.cards || !ev.cards.length) return '';
  const t = data.ticker.toLowerCase();

  let cardsHtml = '';
  for (let i = 0; i < ev.cards.length; i++) {
    const card = ev.cards[i];

    // Map epistemic class to score display
    const epClass = (card.epistemicClass || '').toLowerCase();
    let scoreLabel = card.epistemicLabel || 'Neutral';
    let scoreCls = 'neu';

    if (epClass.indexOf('confirm') >= 0 || epClass.indexOf('strong') >= 0 || epClass.indexOf('verified') >= 0) {
      scoreCls = 'pos';
      scoreLabel = '+' + scoreLabel;
    } else if (epClass.indexOf('contested') >= 0 || epClass.indexOf('motivated') >= 0 || epClass.indexOf('weak') >= 0) {
      scoreCls = 'neg';
      scoreLabel = '\u2212' + scoreLabel;
    } else if (epClass.indexOf('emerging') >= 0 || epClass.indexOf('mixed') >= 0 || epClass.indexOf('inconclusive') >= 0) {
      scoreCls = 'amb';
      scoreLabel = '~' + scoreLabel;
    } else {
      scoreCls = 'neu';
      scoreLabel = '= ' + scoreLabel;
    }

    // Derive a bar width from the score width if available, otherwise use a heuristic
    let barWidth = 50;
    if (card.scoreWidth) {
      barWidth = parseInt(card.scoreWidth, 10) || 50;
    } else if (card.score) {
      const numScore = parseFloat(card.score);
      if (!isNaN(numScore)) {
        barWidth = Math.min(100, Math.max(10, Math.round(numScore)));
      }
    }

    // Clean title: strip leading number and dot
    let title = (card.title || '').replace(/^\d+\.\s*/, '');

    // Extract a short summary from finding (first sentence or 150 chars)
    let summary = card.finding || '';
    const firstSentence = summary.match(/^[^.!?]*[.!?]/);
    if (firstSentence && firstSentence[0].length < 200) {
      summary = firstSentence[0];
    } else if (summary.length > 150) {
      summary = summary.substring(0, 150) + '...';
    }

    cardsHtml += '<div class="domain-card">' +
      '<div class="domain-head">' +
        '<span class="domain-name">' + title + '</span>' +
        '<span class="domain-score ' + scoreCls + '">' + scoreLabel + '</span>' +
      '</div>' +
      '<div class="domain-bar-track"><div class="domain-bar-fill ' + scoreCls + '" style="width:' + barWidth + '%"></div></div>' +
      '<div class="domain-summary">' + summary + '</div>' +
    '</div>';
  }

  return '<section class="section" id="' + t + '-evidence-domains">' +
    '<div class="section-header">' +
      '<div>' +
        '<div class="eyebrow">Evidence Mapping &middot; Section 03</div>' +
        '<h2 class="sec-title">Domain Scores</h2>' +
        '<p class="sec-sub">Evidence quality and direction across ' + ev.cards.length + ' analytical domains. Each domain feeds the ACH case weights.</p>' +
      '</div>' +
    '</div>' +
    '<div class="domain-grid">' + cardsHtml + '</div>' +
  '</section>';
}
