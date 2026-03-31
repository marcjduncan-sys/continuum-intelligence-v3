// Report section shared utilities

export const RS_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
export function RS_HDR(num, title) {
  return '<div class="rs-header"><div class="rs-header-text">' +
    '<div class="rs-number">' + num + '</div>' +
    '<h2 class="rs-title">' + title + '</h2>' +
    '</div><button class="rs-toggle" onclick="window.toggleSection(this)" aria-label="Toggle section">' + RS_CHEVRON + '</button></div>';
}
