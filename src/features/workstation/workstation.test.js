// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderWorkstationPage, renderWorkstation } from './workstation.js';
import bhpFixture from '../../../data/workstation/BHP.json';

// ============================================================================
// renderWorkstationPage -- guard clauses
// ============================================================================

describe('renderWorkstationPage -- guard clauses', () => {
  it('returns empty-state wrapper when data is null', () => {
    const html = renderWorkstationPage(null);
    expect(html).toContain('workstation-page');
    expect(html).toContain('workstation-page--empty');
  });

  it('returns empty-state wrapper when data is undefined', () => {
    const html = renderWorkstationPage(undefined);
    expect(html).toContain('workstation-page--empty');
  });
});

// ============================================================================
// renderWorkstationPage -- top-level structure (BHP fixture)
// ============================================================================

describe('renderWorkstationPage -- top-level structure', () => {
  it('wraps output in .workstation-page with data-ticker attribute', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="workstation-page"');
    expect(html).toContain('data-ticker="BHP"');
  });

  it('renders ws-topbar header', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-topbar"');
  });

  it('renders topbar with ticker symbol', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-topbar__ticker');
    expect(html).toContain('BHP');
  });

  it('renders ws-subnav nav element', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-subnav"');
  });

  it('renders ws-hero container', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-hero"');
  });

  it('renders ws-workspace two-column container', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-workspace"');
  });

  it('renders ws-workspace__left column', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-workspace__left"');
  });

  it('renders ws-workspace__right column', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-workspace__right"');
  });
});

// ============================================================================
// renderWorkstationPage -- subnav anchors
// ============================================================================

describe('renderWorkstationPage -- subnav anchors', () => {
  it('subnav includes anchor for each of the 8 sections', () => {
    const html = renderWorkstationPage(bhpFixture);
    const anchors = [
      '#ws-thesis',
      '#ws-scenarios',
      '#ws-valuation',
      '#ws-risks',
      '#ws-evidence',
      '#ws-revisions',
      '#ws-deep-research',
      '#ws-quality'
    ];
    anchors.forEach(anchor => {
      expect(html).toContain('href="' + anchor + '"');
    });
  });

  it('subnav has exactly 8 section anchor links', () => {
    const html = renderWorkstationPage(bhpFixture);
    const linkMatches = html.match(/class="ws-subnav__link"/g) || [];
    expect(linkMatches.length).toBe(8);
  });
});

// ============================================================================
// renderWorkstationPage -- all 8 section IDs present
// ============================================================================

describe('renderWorkstationPage -- 8 section IDs present', () => {
  it('renders id="ws-thesis"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-thesis"');
  });

  it('renders id="ws-scenarios"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-scenarios"');
  });

  it('renders id="ws-valuation"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-valuation"');
  });

  it('renders id="ws-risks"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-risks"');
  });

  it('renders id="ws-evidence"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-evidence"');
  });

  it('renders id="ws-revisions"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-revisions"');
  });

  it('renders id="ws-deep-research"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-deep-research"');
  });

  it('renders id="ws-quality"', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-quality"');
  });

  it('all 8 section IDs present in single assertion', () => {
    const html = renderWorkstationPage(bhpFixture);
    const ids = [
      'ws-thesis', 'ws-scenarios', 'ws-valuation', 'ws-risks',
      'ws-evidence', 'ws-revisions', 'ws-deep-research', 'ws-quality'
    ];
    ids.forEach(id => {
      expect(html).toContain('id="' + id + '"');
    });
  });
});

// ============================================================================
// renderWorkstationPage -- decision strip: 8 cells, EWP
// ============================================================================

describe('renderWorkstationPage -- decision strip', () => {
  it('renders decision strip container', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-decision-strip"');
  });

  it('renders exactly 8 decision strip cells (one ws-strip-cell__label per cell)', () => {
    // Each of the 8 cells emits exactly one ws-strip-cell__label div.
    // Counting this is more reliable than counting the outer cell divs.
    const html = renderWorkstationPage(bhpFixture);
    const cellLabels = html.match(/class="ws-strip-cell__label"/g) || [];
    expect(cellLabels.length).toBe(8);
  });

  it('renders EWP cell with class ws-strip-cell--ewp', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-strip-cell--ewp');
  });

  it('renders EWP computed from BHP scenarios as A$56.55', () => {
    // BHP: 0.25*63 + 0.45*56 + 0.20*44 + 0.10*68 = 15.75 + 25.2 + 8.8 + 6.8 = 56.55
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('A$56.55');
  });

  it('renders spot price cell with data-ws-spot attribute', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('data-ws-spot="52.56"');
  });

  it('renders EWP vs spot percentage block', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('data-ws-ewp-pct');
  });
});

// ============================================================================
// renderWorkstationPage -- chat panel present
// ============================================================================

describe('renderWorkstationPage -- chat panel', () => {
  it('renders aside element with id ws-chat', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('id="ws-chat"');
  });

  it('renders ws-chat__messages container', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('class="ws-chat__messages"');
  });

  it('renders all 6 chat messages from BHP fixture', () => {
    const html = renderWorkstationPage(bhpFixture);
    // Each message emits class="ws-chat-msg ws-chat-msg--{role}"
    const msgMatches = html.match(/class="ws-chat-msg /g) || [];
    expect(msgMatches.length).toBe(6);
  });

  it('renders chat stats bar with 3 stat cells', () => {
    const html = renderWorkstationPage(bhpFixture);
    const statMatches = html.match(/class="ws-chat__stat"/g) || [];
    expect(statMatches.length).toBe(3);
  });

  it('renders chat filter tabs', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-chat__filters');
    expect(html).toContain('data-thread="all"');
  });

  it('renders suggested question in chat panel', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-chat__suggested');
    expect(html).toContain(bhpFixture.chat_seed.suggested_question);
  });

  it('chat panel is inside the right workspace column', () => {
    const html = renderWorkstationPage(bhpFixture);
    const rightColStart = html.indexOf('ws-workspace__right');
    const chatStart = html.indexOf('id="ws-chat"');
    expect(rightColStart).toBeGreaterThan(-1);
    expect(chatStart).toBeGreaterThan(rightColStart);
  });
});

// ============================================================================
// renderWorkstationPage -- hero identity and summary
// ============================================================================

describe('renderWorkstationPage -- hero identity and summary', () => {
  it('renders ticker badge in hero', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-ticker-badge');
    expect(html).toContain('>BHP<');
  });

  it('renders company name in hero', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('BHP Group');
  });

  it('renders verdict rating tag', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-tag');
    expect(html).toContain('Accumulate');
  });

  it('renders confidence percentage tag', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('76% confidence');
  });

  it('renders hero summary section', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-hero-summary');
    expect(html).toContain('ws-summary-table');
  });
});

// ============================================================================
// renderWorkstationPage -- section content spot checks
// ============================================================================

describe('renderWorkstationPage -- section content spot checks', () => {
  it('thesis section contains BLUF text', () => {
    const html = renderWorkstationPage(bhpFixture);
    // BLUF starts with "At A$52.56..." after strong tag
    expect(html).toContain('ws-thesis__bluf');
    expect(html).toContain('At A$52.56');
  });

  it('scenarios section contains bull and base cards', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-scenario-card--bull');
    expect(html).toContain('ws-scenario-card--base');
  });

  it('valuation section contains bridge bars', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-bridge-bar');
  });

  it('risks section contains risk table', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-risk-table');
  });

  it('evidence section contains Observed category', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-evidence-item');
    expect(html).toContain('Observed');
  });

  it('revisions section contains direction column', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-revision-row');
  });

  it('deep research section contains expand button', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('data-ws-expand="deep-research"');
  });

  it('quality section contains tile grid', () => {
    const html = renderWorkstationPage(bhpFixture);
    expect(html).toContain('ws-quality__tiles');
    expect(html).toContain('ws-quality-tile');
  });
});

// ============================================================================
// renderWorkstationPage -- section ordering in left column
// ============================================================================

describe('renderWorkstationPage -- section ordering', () => {
  it('thesis appears before scenarios in HTML output', () => {
    const html = renderWorkstationPage(bhpFixture);
    const thesisIdx = html.indexOf('id="ws-thesis"');
    const scenariosIdx = html.indexOf('id="ws-scenarios"');
    expect(thesisIdx).toBeLessThan(scenariosIdx);
  });

  it('quality section appears last among the 8 sections', () => {
    const html = renderWorkstationPage(bhpFixture);
    const sectionIds = [
      'ws-thesis', 'ws-scenarios', 'ws-valuation', 'ws-risks',
      'ws-evidence', 'ws-revisions', 'ws-deep-research', 'ws-quality'
    ];
    const positions = sectionIds.map(id => html.indexOf('id="' + id + '"'));
    const qualityIdx = positions[positions.length - 1];
    const otherMaxIdx = Math.max(...positions.slice(0, -1));
    expect(qualityIdx).toBeGreaterThan(otherMaxIdx);
  });

  it('chat panel appears after the left column sections', () => {
    const html = renderWorkstationPage(bhpFixture);
    const qualityIdx = html.indexOf('id="ws-quality"');
    const chatIdx = html.indexOf('id="ws-chat"');
    // Chat is in the right column; in HTML string order it may interleave,
    // but it must be inside ws-workspace__right which comes after ws-workspace__left.
    const leftColIdx = html.indexOf('class="ws-workspace__left"');
    const rightColIdx = html.indexOf('class="ws-workspace__right"');
    expect(leftColIdx).toBeLessThan(rightColIdx);
    expect(chatIdx).toBeGreaterThan(rightColIdx);
  });
});

// ============================================================================
// renderWorkstation -- integration (assembled layout)
// ============================================================================

describe('renderWorkstation -- integration', () => {
  it('returns the workstation-page wrapper', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="workstation-page"');
  });

  it('contains the ws-topbar element', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-topbar"');
  });

  it('renders the BHP ticker in the topbar', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('<span class="ws-topbar__ticker">BHP</span>');
  });

  it('renders the BHP Group company name in the topbar', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('<span class="ws-topbar__company">BHP Group</span>');
  });

  it('contains the ws-subnav element', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-subnav"');
  });

  it('subnav has exactly 8 section links', () => {
    const html = renderWorkstation(bhpFixture);
    const matches = html.match(/class="ws-subnav__link"/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBe(8);
  });

  it('contains the ws-hero-band element', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-hero-band"');
  });

  it('contains ws-hero-identity from renderWsHeroIdentity', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-hero-identity"');
  });

  it('contains ws-decision-strip from renderWsDecisionStrip', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-decision-strip"');
  });

  it('contains ws-hero-summary from renderWsHeroSummary', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-hero-summary"');
  });

  it('contains the ws-thesis section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-thesis"');
  });

  it('contains the ws-scenarios section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-scenarios"');
  });

  it('contains the ws-valuation section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-valuation"');
  });

  it('contains the ws-risks section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-risks"');
  });

  it('contains the ws-evidence section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-evidence"');
  });

  it('contains the ws-revisions section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-revisions"');
  });

  it('contains the ws-deep-research section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-deep-research"');
  });

  it('contains the ws-quality section', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('id="ws-quality"');
  });

  it('contains the ws-chat panel', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-chat"');
  });

  it('contains the ws-workspace__main column', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-workspace__main"');
  });

  it('contains the ws-workspace__chat column', () => {
    const html = renderWorkstation(bhpFixture);
    expect(html).toContain('class="ws-workspace__chat"');
  });

  it('returns an error div when data is null', () => {
    const html = renderWorkstation(null);
    expect(html).toContain('class="ws-error"');
    expect(html).toContain('No workstation data available.');
  });

  it('returns an error div when data.identity is missing', () => {
    const html = renderWorkstation({ verdict: {} });
    expect(html).toContain('class="ws-error"');
  });

  it('all 8 section headings are present in the output', () => {
    const html = renderWorkstation(bhpFixture);
    const headings = html.match(/class="ws-section__heading"/g);
    expect(headings).not.toBeNull();
    expect(headings.length).toBe(8);
  });
});
