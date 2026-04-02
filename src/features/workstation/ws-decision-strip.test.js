// @vitest-environment jsdom

import { describe, it, expect } from 'vitest';
import { renderWsDecisionStrip } from './ws-decision-strip.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsDecisionStrip', () => {
  it('renders 8 cells total', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    // Match only outer cell divs -- class starts with ws-strip-cell followed by a space or closing quote,
    // not the BEM child elements (ws-strip-cell__label etc.)
    const matches = html.match(/class="ws-strip-cell(?:\s|")/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(8);
  });

  it('renders spot price value (52.56)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('52.56');
  });

  it('renders spot cell with data-ws-spot attribute', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('data-ws-spot=');
    expect(html).toContain('ws-strip-cell--spot');
  });

  it('renders EWP value A$56.55', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    // EWP = 0.25*63 + 0.45*56 + 0.20*44 + 0.10*68 = 56.55
    expect(html).toContain('56.55');
    expect(html).toContain('ws-strip-cell--ewp');
  });

  it('renders EWP vs spot percentage element with data-ws-ewp-pct', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('data-ws-ewp-pct');
    expect(html).toContain('ws-strip-cell__ewp-vs-spot');
  });

  it('EWP vs spot percentage is positive (approx +7.6%)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    // (56.55 - 52.56) / 52.56 * 100 = ~7.595 -> +7.6%
    expect(html).toContain('+7.6%');
  });

  it('renders base case value (A$56.00)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('ws-strip-cell--base');
    expect(html).toContain('56.00');
  });

  it('renders bull case value (A$63.00)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('ws-strip-cell--bull');
    expect(html).toContain('63.00');
  });

  it('renders bear case value (A$44.00)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('ws-strip-cell--bear');
    expect(html).toContain('44.00');
  });

  it('renders forward yield display value (3.7)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('3.7');
    expect(html).toContain('Yield (fwd)');
  });

  it('renders key lever text (Copper)', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('Key lever');
    expect(html).toContain('Copper');
  });

  it('renders next catalyst text', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('Next catalyst');
    expect(html).toContain('China + copper');
  });

  it('wraps output in ws-decision-strip div', () => {
    const html = renderWsDecisionStrip(bhpFixture);
    expect(html).toContain('class="ws-decision-strip"');
    expect(html.startsWith('<div class="ws-decision-strip">')).toBe(true);
  });

  it('returns safe empty shell when data is null', () => {
    const html = renderWsDecisionStrip(null);
    expect(html).toContain('ws-decision-strip');
    expect(html).not.toContain('<script');
  });

  it('returns safe output when decision_strip is missing', () => {
    const html = renderWsDecisionStrip({ scenarios: bhpFixture.scenarios });
    expect(html).toContain('ws-decision-strip');
    expect(html).not.toContain('<script');
  });

  it('renders -- for EWP value when scenarios have null target_price', () => {
    const data = {
      ...bhpFixture,
      scenarios: [
        { case_name: 'Base', probability: 0.5, target_price: null, currency: 'A$', style: 'base' },
        { case_name: 'Bull', probability: 0.5, target_price: null, currency: 'A$', style: 'bull' }
      ]
    };
    const html = renderWsDecisionStrip(data);
    // EWP cell should show '--' (formatPriceWithCurrency receives null)
    expect(html).toContain('ws-strip-cell--ewp');
    // No ewp-vs-spot block rendered
    expect(html).not.toContain('ws-strip-cell__ewp-vs-spot');
  });

  it('omits ewp-vs-spot element when EWP cannot be computed', () => {
    const data = { ...bhpFixture, scenarios: [] };
    const html = renderWsDecisionStrip(data);
    expect(html).not.toContain('ws-strip-cell__ewp-vs-spot');
  });
});
