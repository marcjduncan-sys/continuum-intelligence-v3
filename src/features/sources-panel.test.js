// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderSourcesPanel, renderSourceCard } from './sources-panel.js';

var MOCK_SOURCE = {
  id: 'abc-123',
  source_name: 'Macquarie',
  source_type: 'broker',
  document_date: '2026-03-15',
  created_at: '2026-03-20T10:30:00Z',
  view: {
    aligned_hypothesis: 'N2',
    alignment_confidence: 0.75,
    direction: 'upside',
    price_target: 5.40,
    key_evidence: [
      { point: 'Defence contract pipeline expanding', supports: 'N2' },
      { point: 'Margin recovery on track', supports: 'N2' }
    ],
    key_risks: [
      { point: 'Currency headwind from USD weakness', threatens: 'N3' }
    ],
    summary: 'Macquarie sees ASB as a margin recovery story.'
  }
};

var MOCK_SOURCE_MINIMAL = {
  id: 'def-456',
  source_name: 'My Notes',
  source_type: 'internal',
  created_at: '2026-03-18T08:00:00Z',
  view: {
    aligned_hypothesis: 'MIXED',
    alignment_confidence: null,
    direction: '',
    price_target: null,
    key_evidence: [],
    key_risks: [],
    summary: ''
  }
};

describe('sources-panel', function() {

  describe('renderSourcesPanel', function() {
    it('returns empty string when sources array is empty', function() {
      var html = renderSourcesPanel([], 'ASB');
      expect(html).toBe('');
    });

    it('returns empty string when sources is null', function() {
      var html = renderSourcesPanel(null, 'ASB');
      expect(html).toBe('');
    });

    it('renders correct number of source cards', function() {
      var html = renderSourcesPanel([MOCK_SOURCE, MOCK_SOURCE_MINIMAL], 'ASB');
      var matches = html.match(/class="src-card"/g);
      expect(matches).toHaveLength(2);
    });

    it('shows source count in header', function() {
      var html = renderSourcesPanel([MOCK_SOURCE], 'ASB');
      expect(html).toContain('1 source');

      var html2 = renderSourcesPanel([MOCK_SOURCE, MOCK_SOURCE_MINIMAL], 'ASB');
      expect(html2).toContain('2 sources');
    });

    it('uses correct ticker in panel ID', function() {
      var html = renderSourcesPanel([MOCK_SOURCE], 'ASB');
      expect(html).toContain('id="src-panel-asb"');
    });
  });

  describe('renderSourceCard', function() {
    it('displays source name and type badge', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('Macquarie');
      expect(html).toContain('src-card-type-broker');
    });

    it('displays hypothesis alignment with correct class', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('src-card-hyp-n2');
      expect(html).toContain('N2');
    });

    it('displays confidence as percentage', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('75% confidence');
    });

    it('displays direction', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('src-card-dir-upside');
      expect(html).toContain('upside');
    });

    it('displays summary', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('margin recovery story');
    });

    it('contains evidence items', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('Defence contract pipeline expanding');
      expect(html).toContain('Supports N2');
    });

    it('contains risk items', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('Currency headwind');
      expect(html).toContain('Threatens N3');
    });

    it('displays price target', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('$5.40');
    });

    it('handles missing price target gracefully', function() {
      var html = renderSourceCard(MOCK_SOURCE_MINIMAL);
      expect(html).not.toContain('Price target');
    });

    it('handles MIXED hypothesis', function() {
      var html = renderSourceCard(MOCK_SOURCE_MINIMAL);
      expect(html).toContain('src-card-hyp-mixed');
      expect(html).toContain('MIXED');
    });

    it('includes delete button with source ID', function() {
      var html = renderSourceCard(MOCK_SOURCE);
      expect(html).toContain('src-card-delete');
      expect(html).toContain('data-source-id="abc-123"');
    });

    it('handles source_id field from upload response', function() {
      var source = Object.assign({}, MOCK_SOURCE, { source_id: 'upload-789', id: undefined });
      var html = renderSourceCard(source);
      expect(html).toContain('data-source-id="upload-789"');
    });
  });
});
