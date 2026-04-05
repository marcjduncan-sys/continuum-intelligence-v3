// @vitest-environment jsdom
import { renderWsScenarios } from './ws-scenarios.js';
import bhpFixture from '../../../data/workstation/BHP.json';

describe('renderWsScenarios', () => {
  it('renders a section with id ws-scenarios', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('id="ws-scenarios"');
  });

  it('renders the 02 Scenarios heading', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('02 / Scenarios');
  });

  it('renders all 4 BHP scenario cards', () => {
    const html = renderWsScenarios(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const cards = div.querySelectorAll('.ws-scenario-card');
    expect(cards.length).toBe(4);
  });

  it('renders a card with the bull CSS modifier class', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('ws-scenario-card--bull');
  });

  it('renders a card with the base CSS modifier class', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('ws-scenario-card--base');
  });

  it('renders a card with the bear CSS modifier class', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('ws-scenario-card--bear');
  });

  it('renders a card with the stretch CSS modifier class', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('ws-scenario-card--stretch');
  });

  it('displays probabilities as whole-number percentages', () => {
    const html = renderWsScenarios(bhpFixture);
    // Base case is 45%, Bull is 25%, Bear is 20%, Stretch is 10%
    expect(html).toContain('45%');
    expect(html).toContain('25%');
    expect(html).toContain('20%');
    expect(html).toContain('10%');
  });

  it('renders target prices with currency symbol', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('A$56.00');
    expect(html).toContain('A$63.00');
    expect(html).toContain('A$44.00');
    expect(html).toContain('A$68.00');
  });

  it('preserves strong tags in scenario descriptions', () => {
    const html = renderWsScenarios(bhpFixture);
    const div = document.createElement('div');
    div.innerHTML = html;
    const descs = div.querySelectorAll('.ws-scenario-card__desc');
    const hasStrong = Array.from(descs).some(d => d.querySelector('strong') !== null);
    expect(hasStrong).toBe(true);
  });

  it('renders an EWP footnote containing the expected weighted price', () => {
    const html = renderWsScenarios(bhpFixture);
    // EWP = 0.25*63 + 0.45*56 + 0.20*44 + 0.10*68 = 15.75 + 25.2 + 8.8 + 6.8 = 56.55
    expect(html).toContain('A$56.55');
  });

  it('renders the EWP footnote paragraph', () => {
    const html = renderWsScenarios(bhpFixture);
    expect(html).toContain('ws-scenarios__footnote');
    expect(html).toContain('Weighted outcome:');
  });

  it('sorts scenarios in bull, base, bear, stretch order', () => {
    const html = renderWsScenarios(bhpFixture);
    const bullIdx = html.indexOf('ws-scenario-card--bull');
    const baseIdx = html.indexOf('ws-scenario-card--base');
    const bearIdx = html.indexOf('ws-scenario-card--bear');
    const stretchIdx = html.indexOf('ws-scenario-card--stretch');
    expect(bullIdx).toBeLessThan(baseIdx);
    expect(baseIdx).toBeLessThan(bearIdx);
    expect(bearIdx).toBeLessThan(stretchIdx);
  });

  it('returns safe output when scenarios array is empty', () => {
    const html = renderWsScenarios({ scenarios: [] });
    expect(html).toContain('id="ws-scenarios"');
    expect(html).not.toContain('ws-scenario-card');
  });

  it('returns safe output when data is null', () => {
    const html = renderWsScenarios(null);
    expect(html).toContain('id="ws-scenarios"');
  });

  it('strips img tags from descriptions (XSS protection)', () => {
    const data = {
      scenarios: [
        {
          case_name: 'Base',
          probability: 1.0,
          target_price: 56,
          currency: 'A$',
          description: '<img src="x" onerror="alert(1)">Safe text',
          style: 'base'
        }
      ]
    };
    const html = renderWsScenarios(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('Safe text');
  });
});
