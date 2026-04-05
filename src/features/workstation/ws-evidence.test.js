// @vitest-environment jsdom
import { renderWsEvidence } from './ws-evidence.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsEvidence -- guard clauses
// ============================================================================

describe('renderWsEvidence -- guard clauses', () => {
  it('returns empty-state section when data is null', () => {
    const html = renderWsEvidence(null);
    expect(html).toContain('ws-section--evidence');
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when data is undefined', () => {
    const html = renderWsEvidence(undefined);
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when evidence property is missing', () => {
    const html = renderWsEvidence({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-section__empty');
  });

  it('has section id ws-evidence', () => {
    const html = renderWsEvidence(null);
    expect(html).toContain('id="ws-evidence"');
  });
});

// ============================================================================
// renderWsEvidence -- structure
// ============================================================================

describe('renderWsEvidence -- structure', () => {
  it('renders a section element with correct classes', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('class="ws-section ws-section--evidence"');
    expect(html).toContain('id="ws-evidence"');
  });

  it('renders 05 Evidence heading', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('05 / Evidence');
  });

  it('renders the headline from BHP fixture', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain(bhpFixture.evidence.headline.substring(0, 30));
  });

  it('does not render headline element when headline is absent', () => {
    const data = { evidence: { items: [] } };
    const html = renderWsEvidence(data);
    expect(html).not.toContain('ws-section__headline');
  });

  it('renders ws-evidence__items container', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('ws-evidence__items');
  });

  it('renders empty items container when items array is missing', () => {
    const data = { evidence: { headline: 'Test', items: null } };
    const html = renderWsEvidence(data);
    expect(html).toContain('ws-evidence__items');
    expect(html).not.toContain('ws-evidence-item"');
  });
});

// ============================================================================
// renderWsEvidence -- items
// ============================================================================

describe('renderWsEvidence -- items', () => {
  it('renders all 5 evidence items from BHP fixture', () => {
    const html = renderWsEvidence(bhpFixture);
    const itemCount = (html.match(/class="ws-evidence-item"/g) || []).length;
    expect(itemCount).toBe(bhpFixture.evidence.items.length);
  });

  it('renders category label for first item (Observed)', () => {
    const html = renderWsEvidence(bhpFixture);
    const item = bhpFixture.evidence.items[0];
    expect(html).toContain('ws-evidence-item__category');
    expect(html).toContain(item.category);
  });

  it('renders category label for Inference item', () => {
    const html = renderWsEvidence(bhpFixture);
    const inferenceItem = bhpFixture.evidence.items.find(i => i.category === 'Inference');
    expect(inferenceItem).toBeDefined();
    expect(html).toContain('Inference');
  });

  it('renders category label for Tripwire item', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('Tripwire');
  });

  it('renders quality tag for each item', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('ws-quality-tag');
  });

  it('maps High quality to blue colour class', () => {
    const html = renderWsEvidence(bhpFixture);
    // BHP has multiple High quality items
    expect(html).toContain('ws-quality-tag--blue');
  });

  it('maps Needs market proof to amber colour class', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('ws-quality-tag--amber');
  });

  it('maps Critical to red colour class', () => {
    const html = renderWsEvidence(bhpFixture);
    // BHP Tripwire item has quality: Critical
    expect(html).toContain('ws-quality-tag--red');
  });

  it('preserves strong tags in item text via sanitiser', () => {
    const html = renderWsEvidence(bhpFixture);
    // All BHP evidence items contain <strong> tags
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
  });

  it('renders item text in ws-evidence-item__text container', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('ws-evidence-item__text');
  });

  it('renders item header with both category and quality tag', () => {
    const html = renderWsEvidence(bhpFixture);
    expect(html).toContain('ws-evidence-item__header');
  });

  it('does not render raw HTML tags in category field (escapes plain text)', () => {
    const data = {
      evidence: {
        items: [{ category: '<script>bad</script>', text: 'safe', quality: 'Low' }]
      }
    };
    const html = renderWsEvidence(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('does not render raw script tags in quality field', () => {
    const data = {
      evidence: {
        items: [{ category: 'Observed', text: 'safe', quality: '<img onerror="x">' }]
      }
    };
    const html = renderWsEvidence(data);
    expect(html).not.toContain('<img');
  });

  it('strips disallowed HTML from text field but preserves strong', () => {
    const data = {
      evidence: {
        items: [{ category: 'Observed', text: '<strong>good</strong><script>bad</script>', quality: 'High quality' }]
      }
    };
    const html = renderWsEvidence(data);
    expect(html).toContain('<strong>good</strong>');
    expect(html).not.toContain('<script>');
  });

  it('handles item with empty text gracefully', () => {
    const data = {
      evidence: {
        items: [{ category: 'Observed', text: '', quality: 'Low' }]
      }
    };
    const html = renderWsEvidence(data);
    expect(html).toContain('ws-evidence-item');
  });

  it('handles item with missing quality gracefully', () => {
    const data = {
      evidence: {
        items: [{ category: 'Observed', text: 'Some text' }]
      }
    };
    const html = renderWsEvidence(data);
    expect(html).toContain('ws-quality-tag--');
  });
});
