// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderWsHeroSummary } from './ws-hero-summary.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsHeroSummary', () => {
  it('renders bottom line text fragment', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('BHP is investable because');
  });

  it('preserves strong tags in bottom_line after sanitisation', () => {
    const html = renderWsHeroSummary(bhpFixture);
    // The bottom_line wraps key phrase in <strong>
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
  });

  it('renders why_now text fragment', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('Copper contributed 51%');
  });

  it('renders decision_rule text fragment', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('Own size while');
  });

  it('renders what_matters_most text', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('China macro stimulus');
    expect(html).toContain('What matters most');
  });

  it('renders all 4 summary row labels', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('Bottom line');
    expect(html).toContain('Why now');
    expect(html).toContain('Decision rule');
    expect(html).toContain('What matters most');
  });

  it('renders 4 watchlist items for BHP', () => {
    const html = renderWsHeroSummary(bhpFixture);
    const matches = html.match(/class="ws-watchlist-item"/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(4);
  });

  it('maps severity High to colour class red', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('ws-severity--red');
  });

  it('maps severity Supportive to colour class blue', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('ws-severity--blue');
  });

  it('maps severity Medium to colour class amber', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('ws-severity--amber');
  });

  it('preserves strong tags in watchlist description', () => {
    const html = renderWsHeroSummary(bhpFixture);
    // Capital return item: "BHP still runs a <strong>minimum 50% payout policy</strong>"
    expect(html).toContain('minimum 50% payout policy');
    // Strong tag should survive sanitisation
    const capitalReturnSection = html.indexOf('Capital return');
    const strongAfter = html.indexOf('<strong>', capitalReturnSection);
    expect(strongAfter).toBeGreaterThan(capitalReturnSection);
  });

  it('strips script tags from watchlist description', () => {
    const data = {
      ...bhpFixture,
      watchlist: [
        {
          label: 'Malicious',
          description: 'Safe text <script>evil()</script> more text',
          severity: 'High'
        }
      ]
    };
    const html = renderWsHeroSummary(data);
    // The <script> tag itself must be stripped
    expect(html).not.toContain('<script');
    expect(html).not.toContain('</script>');
    // Text nodes outside the stripped tags are preserved (sanitiser strips tags, not text)
    expect(html).toContain('Safe text');
    expect(html).toContain('more text');
  });

  it('strips arbitrary HTML from LLM summary fields', () => {
    const data = {
      ...bhpFixture,
      summary: {
        ...bhpFixture.summary,
        bottom_line: 'Good text <img src=x onerror=alert(1)> end'
      }
    };
    const html = renderWsHeroSummary(data);
    expect(html).not.toContain('<img');
    expect(html).not.toContain('onerror');
    expect(html).toContain('Good text');
    expect(html).toContain('end');
  });

  it('wraps output in ws-hero-summary div', () => {
    const html = renderWsHeroSummary(bhpFixture);
    expect(html).toContain('class="ws-hero-summary"');
    expect(html.startsWith('<div class="ws-hero-summary">')).toBe(true);
  });

  it('returns safe empty shell when data is null', () => {
    const html = renderWsHeroSummary(null);
    expect(html).toContain('ws-hero-summary');
    expect(html).not.toContain('<script');
  });

  it('returns safe output when summary is missing', () => {
    const html = renderWsHeroSummary({ watchlist: [] });
    expect(html).toContain('ws-hero-summary');
  });

  it('renders empty watchlist section when watchlist is absent', () => {
    const html = renderWsHeroSummary({ summary: bhpFixture.summary });
    expect(html).toContain('ws-watchlist');
    expect(html).not.toContain('ws-watchlist-item');
  });
});
