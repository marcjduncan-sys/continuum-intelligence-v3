/**
 * Workstation Section Renderer: 08 Quality
 * Pure function. No DOM. No state imports. Returns an HTML string.
 */

import { sanitiseInlineHtml } from './ws-computed.js';
import { svgCoord } from '../../lib/format.js';

/**
 * Escape plain text for safe use in HTML text nodes and attributes.
 *
 * @param {string|null|undefined} val
 * @returns {string}
 */
function escapeText(val) {
  if (val === null || val === undefined) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render a single quality tile.
 *
 * @param {{ label: string, headline_value: string, description: string }} tile
 * @returns {string}
 */
function renderQualityTile(tile) {
  const label = escapeText(tile.label || '');
  const headlineValue = escapeText(tile.headline_value || '');
  const descHtml = sanitiseInlineHtml(tile.description || '');

  return (
    '<div class="ws-quality-tile">' +
      '<div class="ws-quality-tile__label">' + label + '</div>' +
      '<div class="ws-quality-tile__value">' + headlineValue + '</div>' +
      '<div class="ws-quality-tile__desc">' + descHtml + '</div>' +
    '</div>'
  );
}

/**
 * Compute SVG polyline points string for a single series.
 * Maps datapoint values onto the SVG coordinate space.
 *
 * @param {Array<{value: number}>} datapoints
 * @param {number} minVal  - Minimum value across all series (for normalisation)
 * @param {number} maxVal  - Maximum value across all series (for normalisation)
 * @param {number} viewW   - SVG viewBox width
 * @param {number} viewH   - SVG viewBox height
 * @param {number} padX    - Horizontal padding (left and right)
 * @param {number} padY    - Vertical padding (top and bottom)
 * @returns {string} SVG points attribute value
 */
function buildPolylinePoints(datapoints, minVal, maxVal, viewW, viewH, padX, padY) {
  const n = datapoints.length;
  if (n === 0) return '';

  const chartW = viewW - padX * 2;
  const chartH = viewH - padY * 2;
  const range = maxVal - minVal || 1;

  return datapoints.map((d, i) => {
    const x = n > 1 ? padX + (i / (n - 1)) * chartW : padX + chartW / 2;
    const y = padY + chartH - ((d.value - minVal) / range) * chartH;
    return svgCoord(x) + ',' + svgCoord(y);
  }).join(' ');
}

/**
 * Render an SVG mini-chart from chart series data.
 * Returns empty string if no series data is present.
 *
 * @param {{ series: Array<{label: string, colour: string, datapoints: Array<{period: string, value: number}>}> }} chart
 * @returns {string}
 */
function renderChart(chart) {
  if (!chart || !Array.isArray(chart.series) || chart.series.length === 0) return '';

  const series = chart.series.filter(s => Array.isArray(s.datapoints) && s.datapoints.length > 0);
  if (series.length === 0) return '';

  const viewW = 220;
  const viewH = 70;
  const padX = 8;
  const padY = 8;

  // Normalise across all series combined
  const allValues = series.flatMap(s => s.datapoints.map(d => d.value));
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);

  // X-axis period labels from the first series
  const firstPoints = series[0].datapoints;
  const n = firstPoints.length;
  const chartW = viewW - padX * 2;
  const labelY = viewH - 2;

  const labelsHtml = firstPoints.map((d, i) => {
    const x = n > 1 ? padX + (i / (n - 1)) * chartW : padX + chartW / 2;
    return '<text x="' + svgCoord(x) + '" y="' + labelY + '" text-anchor="middle" font-size="7" fill="#888">' +
      escapeText(d.period) + '</text>';
  }).join('');

  const polylinesHtml = series.map(s => {
    const points = buildPolylinePoints(s.datapoints, minVal, maxVal, viewW, viewH - 12, padX, padY);
    if (!points) return '';
    return '<polyline points="' + points + '" fill="none" stroke="' + escapeText(s.colour) + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />';
  }).join('');

  const legendHtml = series.map(s => {
    return (
      '<span class="ws-quality-legend-item">' +
        '<svg width="12" height="4" aria-hidden="true"><line x1="0" y1="2" x2="12" y2="2" stroke="' +
          escapeText(s.colour) + '" stroke-width="2" /></svg>' +
        escapeText(s.label) +
      '</span>'
    );
  }).join('');

  return (
    '<div class="ws-quality__chart">' +
      '<div class="ws-quality__chart-legend">' + legendHtml + '</div>' +
      '<svg viewBox="0 0 ' + viewW + ' ' + viewH + '" class="ws-quality__svg" aria-hidden="true" preserveAspectRatio="none">' +
        polylinesHtml +
        labelsHtml +
      '</svg>' +
    '</div>'
  );
}

/**
 * Render the 08 Quality section card.
 *
 * @param {object} data - Full workstation payload.
 * @returns {string} HTML string.
 */
export function renderWsQuality(data) {
  if (!data || !data.quality) {
    return '<section class="ws-section ws-section--quality" id="ws-quality"><p class="ws-section__empty">Quality data unavailable.</p></section>';
  }

  const quality = data.quality;
  const headline = quality.headline ? escapeText(quality.headline) : '';
  const tiles = Array.isArray(quality.tiles) ? quality.tiles : [];
  const tilesHtml = tiles.map(renderQualityTile).join('');
  const chartHtml = renderChart(quality.chart);

  return (
    '<section class="ws-section ws-section--quality" id="ws-quality">' +
      '<h2 class="ws-section__heading">08 / Quality</h2>' +
      '<div class="ws-quality">' +
        (headline ? '<p class="ws-section__headline">' + headline + '</p>' : '') +
        '<div class="ws-quality__tiles">' + tilesHtml + '</div>' +
        chartHtml +
      '</div>' +
    '</section>'
  );
}
