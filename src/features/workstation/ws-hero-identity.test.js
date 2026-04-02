// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderWsHeroIdentity } from './ws-hero-identity.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsHeroIdentity', () => {
  it('renders BHP ticker badge', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('ws-ticker-badge');
    expect(html).toContain('BHP');
  });

  it('renders BHP company name in h1', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('<h1 class="ws-company-name">BHP Group</h1>');
  });

  it('renders exchange string', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('ASX: BHP');
  });

  it('renders sector string', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('Diversified mining');
  });

  it('renders rating tag with correct BEM class (accumulate)', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('ws-tag--accumulate');
  });

  it('renders rating text in tag', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('>Accumulate<');
  });

  it('renders skew tag with skew text', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('ws-tag--skew');
    expect(html).toContain('Moderate upside');
  });

  it('renders confidence percentage', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('76');
    expect(html).toContain('confidence');
    expect(html).toContain('ws-tag--confidence');
  });

  it('renders formatted date containing April and 2026', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('April');
    expect(html).toContain('2026');
  });

  it('renders formatted date as 2 April 2026', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('2 April 2026');
  });

  it('wraps output in ws-hero-identity div', () => {
    const html = renderWsHeroIdentity(bhpFixture);
    expect(html).toContain('class="ws-hero-identity"');
    expect(html.startsWith('<div class="ws-hero-identity">')).toBe(true);
  });

  it('returns safe empty shell when data is null', () => {
    const html = renderWsHeroIdentity(null);
    expect(html).toContain('ws-hero-identity');
    expect(html).not.toContain('<script');
  });

  it('returns safe empty shell when data.identity is missing', () => {
    const html = renderWsHeroIdentity({ verdict: { rating: 'Hold' } });
    expect(html).toContain('ws-hero-identity');
    expect(html).not.toContain('<h1');
  });

  it('handles multi-word rating slug (e.g. strong-buy)', () => {
    const data = {
      ...bhpFixture,
      verdict: { rating: 'Strong Buy', skew: 'High upside', confidence_pct: 90 }
    };
    const html = renderWsHeroIdentity(data);
    expect(html).toContain('ws-tag--strong-buy');
  });

  it('escapes special characters in company name', () => {
    const data = {
      ...bhpFixture,
      identity: { ...bhpFixture.identity, company_name: 'A&B <Corp>' }
    };
    const html = renderWsHeroIdentity(data);
    expect(html).toContain('A&amp;B &lt;Corp&gt;');
    expect(html).not.toContain('<Corp>');
  });
});
