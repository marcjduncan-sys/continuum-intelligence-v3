// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWsDeepResearch } from './ws-deep-research.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsDeepResearch -- guard clauses
// ============================================================================

describe('renderWsDeepResearch -- guard clauses', () => {
  it('returns empty-state section when data is null', () => {
    const html = renderWsDeepResearch(null);
    expect(html).toContain('ws-section--deep-research');
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when data is undefined', () => {
    const html = renderWsDeepResearch(undefined);
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when deep_research property is missing', () => {
    const html = renderWsDeepResearch({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-section__empty');
  });

  it('has section id ws-deep-research', () => {
    const html = renderWsDeepResearch(null);
    expect(html).toContain('id="ws-deep-research"');
  });
});

// ============================================================================
// renderWsDeepResearch -- structure
// ============================================================================

describe('renderWsDeepResearch -- structure', () => {
  it('renders a section element with correct classes', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('class="ws-section ws-section--deep-research"');
    expect(html).toContain('id="ws-deep-research"');
  });

  it('renders 07 Deep Research heading', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('07 / Deep Research');
  });

  it('renders the headline from BHP fixture', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain(bhpFixture.deep_research.headline.substring(0, 30));
  });

  it('does not render headline element when headline is absent', () => {
    const data = { deep_research: { paragraphs: [] } };
    const html = renderWsDeepResearch(data);
    expect(html).not.toContain('ws-section__headline');
  });

  it('renders body container with ws-deep-research__body class', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('ws-deep-research__body');
  });

  it('body container has inline max-height:220px style', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('max-height:220px');
  });

  it('body container has overflow:hidden style', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('overflow:hidden');
  });

  it('renders ws-deep-research__fade overlay element', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('ws-deep-research__fade');
  });

  it('renders expand button', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('ws-deep-research__expand');
    expect(html).toContain('Read more');
  });

  it('expand button has data-ws-expand attribute for post-render hook', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('data-ws-expand="deep-research"');
  });

  it('expand button is a button element with type=button', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
  });
});

// ============================================================================
// renderWsDeepResearch -- paragraphs
// ============================================================================

describe('renderWsDeepResearch -- paragraphs', () => {
  it('renders all 4 paragraphs from BHP fixture', () => {
    const html = renderWsDeepResearch(bhpFixture);
    const paraCount = (html.match(/class="ws-deep-research__para"/g) || []).length;
    expect(paraCount).toBe(bhpFixture.deep_research.paragraphs.length);
  });

  it('renders first paragraph in ws-deep-research__para element', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('ws-deep-research__para');
  });

  it('preserves strong tags in paragraph text via sanitiser', () => {
    const html = renderWsDeepResearch(bhpFixture);
    // All BHP paragraphs start with <strong>
    expect(html).toContain('<strong>');
    expect(html).toContain('</strong>');
  });

  it('preserves br tags in paragraph text', () => {
    const data = {
      deep_research: {
        paragraphs: ['Line one.<br>Line two.']
      }
    };
    const html = renderWsDeepResearch(data);
    expect(html).toContain('<br>');
  });

  it('strips script tags from paragraph text', () => {
    const data = {
      deep_research: {
        paragraphs: ['Good text <script>evil()</script> more text.']
      }
    };
    const html = renderWsDeepResearch(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('evil()');
  });

  it('renders empty body container when paragraphs is empty array', () => {
    const data = { deep_research: { headline: 'Test', paragraphs: [] } };
    const html = renderWsDeepResearch(data);
    expect(html).toContain('ws-deep-research__body');
    expect(html).not.toContain('ws-deep-research__para');
  });

  it('handles missing paragraphs property gracefully', () => {
    const data = { deep_research: { headline: 'Test' } };
    const html = renderWsDeepResearch(data);
    expect(html).toContain('ws-deep-research__body');
  });

  it('renders paragraph content from BHP fixture: Escondida reference', () => {
    const html = renderWsDeepResearch(bhpFixture);
    // Second paragraph references Escondida
    expect(html).toContain('Escondida');
  });

  it('renders paragraph content from BHP fixture: capital allocation reference', () => {
    const html = renderWsDeepResearch(bhpFixture);
    // Fourth paragraph references capital allocation
    expect(html).toContain('capital allocation');
  });

  it('renders paragraph content from BHP fixture: China reference', () => {
    const html = renderWsDeepResearch(bhpFixture);
    expect(html).toContain('China');
  });
});
