// @vitest-environment jsdom
import { renderWsRevisions } from './ws-revisions.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWsRevisions -- guard clauses
// ============================================================================

describe('renderWsRevisions -- guard clauses', () => {
  it('returns empty-state section when data is null', () => {
    const html = renderWsRevisions(null);
    expect(html).toContain('ws-section--revisions');
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when data is undefined', () => {
    const html = renderWsRevisions(undefined);
    expect(html).toContain('ws-section__empty');
  });

  it('returns empty-state section when revisions property is missing', () => {
    const html = renderWsRevisions({ identity: { ticker: 'XYZ' } });
    expect(html).toContain('ws-section__empty');
  });

  it('has section id ws-revisions', () => {
    const html = renderWsRevisions(null);
    expect(html).toContain('id="ws-revisions"');
  });
});

// ============================================================================
// renderWsRevisions -- structure
// ============================================================================

describe('renderWsRevisions -- structure', () => {
  it('renders a section element with correct classes', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain('class="ws-section ws-section--revisions"');
    expect(html).toContain('id="ws-revisions"');
  });

  it('renders 06 Revisions heading', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain('06 / Revisions');
  });

  it('renders the headline from BHP fixture', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain(bhpFixture.revisions.headline.substring(0, 30));
  });

  it('does not render headline element when headline is absent', () => {
    const data = { revisions: { items: [] } };
    const html = renderWsRevisions(data);
    expect(html).not.toContain('ws-section__headline');
  });

  it('renders ws-revisions__table container', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain('ws-revisions__table');
  });

  it('renders column header row', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain('ws-revision-header');
    expect(html).toContain('Previous view');
    expect(html).toContain('Current view');
  });

  it('renders empty table when items array is missing', () => {
    const data = { revisions: { headline: 'Test', items: null } };
    const html = renderWsRevisions(data);
    expect(html).toContain('ws-revisions__table');
    expect(html).not.toContain('ws-revision-row"');
  });
});

// ============================================================================
// renderWsRevisions -- rows
// ============================================================================

describe('renderWsRevisions -- rows', () => {
  it('renders all 5 revision rows from BHP fixture', () => {
    const html = renderWsRevisions(bhpFixture);
    const rowCount = (html.match(/class="ws-revision-row"/g) || []).length;
    expect(rowCount).toBe(bhpFixture.revisions.items.length);
  });

  it('renders item name in ws-revision-row__item', () => {
    const html = renderWsRevisions(bhpFixture);
    const firstItem = bhpFixture.revisions.items[0];
    expect(html).toContain('ws-revision-row__item');
    expect(html).toContain(firstItem.item);
  });

  it('renders previous view text', () => {
    const html = renderWsRevisions(bhpFixture);
    const firstItem = bhpFixture.revisions.items[0];
    expect(html).toContain('ws-revision-row__previous');
    expect(html).toContain(firstItem.previous_view);
  });

  it('renders current view text', () => {
    const html = renderWsRevisions(bhpFixture);
    const firstItem = bhpFixture.revisions.items[0];
    expect(html).toContain('ws-revision-row__current');
    expect(html).toContain(firstItem.current_view);
  });

  it('applies pos class to current view for positive direction', () => {
    const html = renderWsRevisions(bhpFixture);
    // BHP has 4 positive direction revisions
    expect(html).toContain('ws-revision-row__current--pos');
  });

  it('applies neu class to current view for neutral direction', () => {
    const html = renderWsRevisions(bhpFixture);
    // BHP has 1 neutral direction revision (China read-through)
    expect(html).toContain('ws-revision-row__current--neu');
  });

  it('applies neg class to current view for negative direction', () => {
    const data = {
      revisions: {
        items: [{ item: 'Test', previous_view: 'Good', current_view: 'Worse', direction: 'negative', rationale: 'Reason' }]
      }
    };
    const html = renderWsRevisions(data);
    expect(html).toContain('ws-revision-row__current--neg');
  });

  it('applies empty class for unknown direction', () => {
    const data = {
      revisions: {
        items: [{ item: 'Test', previous_view: 'Old', current_view: 'New', direction: 'sideways', rationale: 'Reason' }]
      }
    };
    const html = renderWsRevisions(data);
    expect(html).toContain('ws-revision-row__current--');
  });

  it('renders rationale via sanitiser (strong tags preserved)', () => {
    const html = renderWsRevisions(bhpFixture);
    // BHP rationale for capital returns item contains strong tags
    const capitalItem = bhpFixture.revisions.items.find(i => i.item === 'Capital returns');
    expect(capitalItem).toBeDefined();
    expect(html).toContain('<strong>');
    expect(html).toContain('ws-revision-row__rationale');
  });

  it('strips disallowed HTML from rationale field', () => {
    const data = {
      revisions: {
        items: [{ item: 'Test', previous_view: 'Old', current_view: 'New', direction: 'positive', rationale: '<script>bad</script> valid text' }]
      }
    };
    const html = renderWsRevisions(data);
    expect(html).not.toContain('<script>');
    expect(html).toContain('valid text');
  });

  it('escapes item name to prevent XSS', () => {
    const data = {
      revisions: {
        items: [{ item: '<img onerror="x">', previous_view: 'Old', current_view: 'New', direction: 'positive', rationale: '' }]
      }
    };
    const html = renderWsRevisions(data);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('handles item with missing direction gracefully', () => {
    const data = {
      revisions: {
        items: [{ item: 'Test', previous_view: 'Old', current_view: 'New', rationale: '' }]
      }
    };
    const html = renderWsRevisions(data);
    expect(html).toContain('ws-revision-row');
  });

  it('renders House EWP revision row from BHP fixture', () => {
    const html = renderWsRevisions(bhpFixture);
    expect(html).toContain('House EWP');
    expect(html).toContain('A$54.20');
    expect(html).toContain('A$56.55');
  });
});
