// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsRisks } from './ws-risks.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsRisks -- guard clauses
// ============================================================================

describe('renderWsRisks -- guard clauses', () => {
  it('returns empty-state section when data is null', () => {
    const html = renderWsRisks(null);
    expect(html).toContain('ws-section--risks');
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when data is undefined', () => {
    const html = renderWsRisks(undefined);
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when risks property is missing', () => {
    const html = renderWsRisks({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-section__empty');
  });

  it('has section id ws-risks', () => {
    const html = renderWsRisks(null);
    expect(html).toContain('id="ws-risks"');
  });
});

// ============================================================================
// renderWsRisks -- structure
// ============================================================================

describe('renderWsRisks -- structure', () => {
  it('renders a section element with correct classes', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('class="ws-section ws-section--risks"');
    expect(html).toContain('id="ws-risks"');
  });

  it('renders §04 Risks heading', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('\u00a704 Risks');
  });

  it('renders the headline from BHP fixture', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain(bhpFixture.risks.headline.substring(0, 30));
  });

  it('does not render headline element when headline is absent', () => {
    const data = { risks: { items: [] } };
    const html = renderWsRisks(data);
    expect(html).not.toContain('ws-section__headline');
  });

  it('renders ws-risk-table', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('ws-risk-table');
  });

  it('renders table header columns', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('<th>Risk</th>');
    expect(html).toContain('<th>Impact</th>');
    expect(html).toContain('<th>Probability</th>');
    expect(html).toContain('<th>Decision relevance</th>');
  });

  it('renders empty tbody when items array is missing', () => {
    const data = { risks: { headline: 'Test', items: null } };
    const html = renderWsRisks(data);
    expect(html).toContain('<tbody>');
    expect(html).not.toContain('ws-risk-row');
  });
});

// ============================================================================
// renderWsRisks -- rows
// ============================================================================

describe('renderWsRisks -- rows', () => {
  it('renders all 5 risk rows from BHP fixture', () => {
    const html = renderWsRisks(bhpFixture);
    const rowCount = (html.match(/class="ws-risk-row"/g) || []).length;
    expect(rowCount).toBe(bhpFixture.risks.items.length);
  });

  it('renders China steel demand undershoots risk', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('China steel demand undershoots');
  });

  it('applies high class for High impact', () => {
    const html = renderWsRisks(bhpFixture);
    // First two BHP risks have High impact
    expect(html).toContain('ws-risk-level--high');
  });

  it('applies medium class for Medium impact', () => {
    const html = renderWsRisks(bhpFixture);
    // Last three BHP risks have Medium impact
    expect(html).toContain('ws-risk-level--medium');
  });

  it('applies low class for Low probability', () => {
    const html = renderWsRisks(bhpFixture);
    // 'Growth spend outruns returns discipline' has probability: 'Low'
    expect(html).toContain('ws-risk-level--low');
  });

  it('Low-Medium probability class does not contain a dash', () => {
    const html = renderWsRisks(bhpFixture);
    // 'Escondida grade or throughput disappointment' has probability: 'Low-Medium'
    // After normalisation should be 'lowmedium' not 'low-medium'
    expect(html).not.toContain('ws-risk-level--low-medium');
    expect(html).toContain('ws-risk-level--lowmedium');
  });

  it('preserves strong tags in decision_relevance via sanitiser', () => {
    const html = renderWsRisks(bhpFixture);
    // First BHP risk contains <strong>US$90/t</strong>
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
  });

  it('strips script tags from decision_relevance (XSS)', () => {
    const data = {
      risks: {
        items: [{
          risk: 'Test risk',
          impact: 'High',
          probability: 'Low',
          decision_relevance: '<script>alert("xss")</script>Relevant text'
        }]
      }
    };
    const html = renderWsRisks(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Relevant text');
  });

  it('escapes risk name to prevent XSS', () => {
    const data = {
      risks: {
        items: [{
          risk: '<img onerror="x">',
          impact: 'Medium',
          probability: 'Medium',
          decision_relevance: 'Safe'
        }]
      }
    };
    const html = renderWsRisks(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('returns safe output when risks.items is missing', () => {
    const data = { risks: { headline: 'Some headline' } };
    const html = renderWsRisks(data);
    expect(html).toContain('id="ws-risks"');
    expect(html).not.toContain('ws-risk-row');
  });

  it('handles item with empty decision_relevance gracefully', () => {
    const data = {
      risks: {
        items: [{ risk: 'Test', impact: 'Medium', probability: 'Low', decision_relevance: '' }]
      }
    };
    const html = renderWsRisks(data);
    expect(html).toContain('ws-risk-row');
    expect(html).toContain('ws-risk-row__relevance');
  });

  it('renders ws-risk-row__name, __impact, __prob, __relevance cells', () => {
    const html = renderWsRisks(bhpFixture);
    expect(html).toContain('ws-risk-row__name');
    expect(html).toContain('ws-risk-row__impact');
    expect(html).toContain('ws-risk-row__prob');
    expect(html).toContain('ws-risk-row__relevance');
  });
});
