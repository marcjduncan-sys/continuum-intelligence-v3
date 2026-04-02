// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsThesis } from './ws-thesis.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsThesis', () => {
  it('renders a section with id ws-thesis', () => {
    const html = renderWsThesis(bhpFixture);
    expect(html).toContain('id="ws-thesis"');
  });

  it('renders the §01 Thesis heading', () => {
    const html = renderWsThesis(bhpFixture);
    expect(html).toContain('§01 Thesis');
  });

  it('renders the headline text', () => {
    const html = renderWsThesis(bhpFixture);
    expect(html).toContain('BHP is no longer just an iron ore valuation');
  });

  it('renders a fragment of the bluf text', () => {
    const html = renderWsThesis(bhpFixture);
    expect(html).toContain('market is paying for durable cash flow');
  });

  it('preserves strong tags in bluf after sanitisation', () => {
    const html = renderWsThesis(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const blufEl = div.querySelector('.ws-thesis__bluf');
    expect(blufEl).not.toBeNull();
    expect(blufEl.querySelectorAll('strong').length).toBeGreaterThan(0);
  });

  it('renders a fragment of the narrative text', () => {
    const html = renderWsThesis(bhpFixture);
    expect(html).toContain('What changed in the story is earnings mix');
  });

  it('renders all three decision frame conditions as list items', () => {
    const html = renderWsThesis(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const items = div.querySelectorAll('.ws-thesis__conditions-list li');
    expect(items.length).toBe(3);
  });

  it('preserves strong tags in decision frame condition items', () => {
    const html = renderWsThesis(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const items = div.querySelectorAll('.ws-thesis__conditions-list li');
    const hasStrong = Array.from(items).some(li => li.querySelector('strong') !== null);
    expect(hasStrong).toBe(true);
  });

  it('returns safe output when thesis key is missing', () => {
    const html = renderWsThesis({ scenarios: [] });
    expect(html).toContain('id="ws-thesis"');
    expect(html).toContain('unavailable');
  });

  it('returns safe output when data is null', () => {
    const html = renderWsThesis(null);
    expect(html).toContain('id="ws-thesis"');
  });

  it('renders without conditions block when decision_frame_conditions is empty', () => {
    const data = {
      thesis: {
        headline: 'Test headline',
        bluf: '<strong>Bluf</strong>',
        narrative: 'Narrative text.',
        decision_frame_conditions: []
      }
    };
    const html = renderWsThesis(data);
    expect(html).not.toContain('ws-thesis__conditions-list');
  });

  it('strips script tags from bluf (XSS protection)', () => {
    const data = {
      thesis: {
        headline: 'Headline',
        bluf: '<script>alert("xss")</script>Safe text',
        narrative: 'Narrative',
        decision_frame_conditions: []
      }
    };
    const html = renderWsThesis(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Safe text');
  });
});
