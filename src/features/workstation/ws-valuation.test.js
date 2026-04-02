// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsValuation } from './ws-valuation.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsValuation', () => {
  it('renders a section with id ws-valuation', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('id="ws-valuation"');
  });

  it('renders the §03 Valuation heading', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('§03 Valuation');
  });

  it('renders the headline text', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('iron ore still drives the fastest valuation swing');
  });

  it('renders 4 bridge bars for BHP', () => {
    const html = renderWsValuation(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const bars = div.querySelectorAll('.ws-bridge-bar');
    expect(bars.length).toBe(4);
  });

  it('gives the Bear bar the "bad" style modifier class', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('ws-bridge-bar--bad');
  });

  it('gives the Bull bar the "good" style modifier class', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('ws-bridge-bar--good');
  });

  it('gives the Base bar the "base" style modifier class', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('ws-bridge-bar--base');
  });

  it('gives the Stretch bar a width of 100% (highest price)', () => {
    const html = renderWsValuation(bhpFixture);
    // Stretch is A$68 which is the max -- should be 100%
    expect(html).toContain('width:100%');
  });

  it('gives the Bear bar a width less than 100%', () => {
    const html = renderWsValuation(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const bars = div.querySelectorAll('.ws-bridge-bar');
    const bearBar = Array.from(bars).find(b => b.classList.contains('ws-bridge-bar--bad'));
    expect(bearBar).not.toBeNull();
    const fill = bearBar.querySelector('.ws-bridge-bar__fill');
    // Bear price is 44/68 = 64.7% -- width should be 65% not 100%
    expect(fill.style.width).not.toBe('100%');
  });

  it('renders a fragment of the narrative text', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('share price still reacts first to iron ore');
  });

  it('preserves strong tags in the valuation narrative', () => {
    const html = renderWsValuation(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const narrative = div.querySelector('.ws-valuation__narrative');
    expect(narrative).not.toBeNull();
    expect(narrative.querySelectorAll('strong').length).toBeGreaterThan(0);
  });

  it('renders 5 sensitivity table rows for BHP', () => {
    const html = renderWsValuation(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const rows = div.querySelectorAll('.ws-sensitivity tbody tr');
    expect(rows.length).toBe(5);
  });

  it('renders the Iron ore driver row in the sensitivity table', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('Iron ore realised price');
  });

  it('renders the Copper driver row in the sensitivity table', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('Copper realised price');
  });

  it('renders the sensitivity table footnote', () => {
    const html = renderWsValuation(bhpFixture);
    expect(html).toContain('ws-sensitivity__footnote');
    expect(html).toContain('house-model framing');
  });

  it('returns safe output when valuation key is missing', () => {
    const html = renderWsValuation({ scenarios: [] });
    expect(html).toContain('id="ws-valuation"');
    expect(html).toContain('unavailable');
  });

  it('returns safe output when data is null', () => {
    const html = renderWsValuation(null);
    expect(html).toContain('id="ws-valuation"');
  });

  it('strips script tags from narrative (XSS protection)', () => {
    const data = {
      valuation: {
        headline: 'Headline',
        bridge: [],
        narrative: '<script>alert("xss")</script>Safe narrative text',
        sensitivities: [],
        footnote: ''
      }
    };
    const html = renderWsValuation(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Safe narrative text');
  });
});
