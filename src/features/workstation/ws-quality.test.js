// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsQuality } from './ws-quality.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsQuality -- guard clauses
// ============================================================================

describe('renderWsQuality -- guard clauses', () => {
  it('returns empty-state section when data is null', () => {
    const html = renderWsQuality(null);
    expect(html).toContain('ws-section--quality');
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when data is undefined', () => {
    const html = renderWsQuality(undefined);
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when quality property is missing', () => {
    const html = renderWsQuality({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-section__empty');
  });

  it('has section id ws-quality', () => {
    const html = renderWsQuality(null);
    expect(html).toContain('id="ws-quality"');
  });
});

// ============================================================================
// renderWsQuality -- structure
// ============================================================================

describe('renderWsQuality -- structure', () => {
  it('renders a section element with correct classes', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('class="ws-section ws-section--quality"');
    expect(html).toContain('id="ws-quality"');
  });

  it('renders 08 Quality heading', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('08 / Quality');
  });

  it('renders the headline from BHP fixture', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain(bhpFixture.quality.headline.substring(0, 30));
  });

  it('does not render headline element when headline is absent', () => {
    const data = { quality: { tiles: [] } };
    const html = renderWsQuality(data);
    expect(html).not.toContain('ws-section__headline');
  });

  it('renders ws-quality__tiles container', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('ws-quality__tiles');
  });
});

// ============================================================================
// renderWsQuality -- tiles
// ============================================================================

describe('renderWsQuality -- tiles', () => {
  it('renders all 6 tiles from BHP fixture', () => {
    const html = renderWsQuality(bhpFixture);
    const tileCount = (html.match(/class="ws-quality-tile"/g) || []).length;
    expect(tileCount).toBe(bhpFixture.quality.tiles.length);
  });

  it('renders tile label in ws-quality-tile__label', () => {
    const html = renderWsQuality(bhpFixture);
    const firstTile = bhpFixture.quality.tiles[0];
    expect(html).toContain('ws-quality-tile__label');
    expect(html).toContain(firstTile.label);
  });

  it('renders tile headline_value in ws-quality-tile__value', () => {
    const html = renderWsQuality(bhpFixture);
    const firstTile = bhpFixture.quality.tiles[0];
    expect(html).toContain('ws-quality-tile__value');
    expect(html).toContain(firstTile.headline_value);
  });

  it('renders tile description via sanitiser (strong tags preserved)', () => {
    const html = renderWsQuality(bhpFixture);
    // BHP tile descriptions contain <strong> tags
    expect(html).toContain('ws-quality-tile__desc');
    expect(html).toContain('<strong>');
  });

  it('renders Balance sheet tile correctly', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('Balance sheet');
    expect(html).toContain('US$14.7bn');
  });

  it('renders Dividend framework tile correctly', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('Dividend framework');
    expect(html).toContain('50% minimum');
  });

  it('renders Copper execution tile correctly', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('Copper execution');
    expect(html).toContain('1.9-2.0 Mt');
  });

  it('strips disallowed HTML from tile description', () => {
    const data = {
      quality: {
        tiles: [{ label: 'Test', headline_value: '100', description: '<script>bad</script> valid' }]
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('valid');
  });

  it('escapes tile label to prevent XSS', () => {
    const data = {
      quality: {
        tiles: [{ label: '<img onerror="x">', headline_value: '100', description: 'desc' }]
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('handles empty tiles array', () => {
    const data = { quality: { headline: 'Test', tiles: [] } };
    const html = renderWsQuality(data);
    expect(html).toContain('ws-quality__tiles');
    expect(html).not.toContain('ws-quality-tile"');
  });

  it('handles missing tiles property gracefully', () => {
    const data = { quality: { headline: 'Test' } };
    const html = renderWsQuality(data);
    expect(html).toContain('ws-quality__tiles');
  });
});

// ============================================================================
// renderWsQuality -- SVG chart
// ============================================================================

describe('renderWsQuality -- SVG chart', () => {
  it('renders SVG chart when series data is present', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('<svg');
    expect(html).toContain('ws-quality__svg');
  });

  it('renders ws-quality__chart container when chart present', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('ws-quality__chart');
  });

  it('renders a polyline for each series in BHP fixture', () => {
    const html = renderWsQuality(bhpFixture);
    const polylineCount = (html.match(/<polyline/g) || []).length;
    expect(polylineCount).toBe(bhpFixture.quality.chart.series.length);
  });

  it('polylines use correct stroke colours from fixture', () => {
    const html = renderWsQuality(bhpFixture);
    bhpFixture.quality.chart.series.forEach(s => {
      expect(html).toContain('stroke="' + s.colour + '"');
    });
  });

  it('renders period labels from datapoints', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('FY24');
    expect(html).toContain('FY25');
    expect(html).toContain('FY27e');
  });

  it('renders chart legend with series labels', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('ws-quality-legend-item');
    expect(html).toContain('Copper strategic value');
    expect(html).toContain('Capital return support');
  });

  it('does not render chart when chart property is absent', () => {
    const data = {
      quality: {
        tiles: [{ label: 'Test', headline_value: '100', description: 'desc' }]
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('<svg');
    expect(html).not.toContain('ws-quality__chart');
  });

  it('does not render chart when series array is empty', () => {
    const data = {
      quality: {
        tiles: [],
        chart: { series: [] }
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('<svg');
  });

  it('does not render chart when series have no datapoints', () => {
    const data = {
      quality: {
        tiles: [],
        chart: { series: [{ label: 'Test', colour: '#000', datapoints: [] }] }
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('<svg');
  });

  it('SVG has viewBox attribute', () => {
    const html = renderWsQuality(bhpFixture);
    expect(html).toContain('viewBox=');
  });

  it('SVG polyline has points attribute with numeric coordinates', () => {
    const html = renderWsQuality(bhpFixture);
    // points should contain comma-separated coordinate pairs
    expect(html).toMatch(/points="[\d.,\s]+"/);
  });

  it('escapes series colour to prevent attribute injection', () => {
    const data = {
      quality: {
        tiles: [],
        chart: {
          series: [{
            label: 'Test',
            colour: '" onload="evil()',
            datapoints: [{ period: 'Q1', value: 50 }, { period: 'Q2', value: 60 }]
          }]
        }
      }
    };
    const html = renderWsQuality(data);
    expect(html).not.toContain('onload="evil()');
  });

  it('handles single datapoint per series (no division by zero)', () => {
    const data = {
      quality: {
        tiles: [],
        chart: {
          series: [{
            label: 'Test',
            colour: '#000',
            datapoints: [{ period: 'Q1', value: 50 }]
          }]
        }
      }
    };
    const html = renderWsQuality(data);
    expect(html).toContain('<polyline');
  });

  it('handles series with identical values (no division by zero in normalisation)', () => {
    const data = {
      quality: {
        tiles: [],
        chart: {
          series: [{
            label: 'Flat',
            colour: '#888',
            datapoints: [
              { period: 'Q1', value: 50 },
              { period: 'Q2', value: 50 },
              { period: 'Q3', value: 50 }
            ]
          }]
        }
      }
    };
    const html = renderWsQuality(data);
    expect(html).toContain('<polyline');
  });
});
