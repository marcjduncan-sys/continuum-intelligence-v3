// @vitest-environment jsdom
/**
 * Home page barrel tests.
 * Tests the new coverage command surface architecture.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  STOCK_DATA, FRESHNESS_DATA, REFERENCE_DATA, WORKSTATION_DATA, WORKSTATION_STATUS, BATCH_STATUS,
  initStockData, initFreshnessData, initReferenceData, initWorkstationData, initWorkstationStatus, updateBatchStatus, resetBatchStatus
} from '../lib/state.js';
import { initHomePage, sortCoverageTable } from './home.js';

// Clean state before each test
beforeEach(() => {
  for (var k in STOCK_DATA) delete STOCK_DATA[k];
  for (var k in FRESHNESS_DATA) delete FRESHNESS_DATA[k];
  for (var k in REFERENCE_DATA) delete REFERENCE_DATA[k];
  for (var k in WORKSTATION_DATA) delete WORKSTATION_DATA[k];
  for (var k in WORKSTATION_STATUS) delete WORKSTATION_STATUS[k];
  resetBatchStatus();

  // Reset DOM
  document.body.innerHTML = '';
});

describe('initHomePage', () => {
  it('does not throw when #page-home container is missing', () => {
    expect(() => initHomePage()).not.toThrow();
  });

  it('does not throw when #page-home exists but STOCK_DATA is empty', () => {
    document.body.innerHTML = '<div id="page-home" class="active"></div>';
    expect(() => initHomePage()).not.toThrow();
  });

  it('renders coverage table inside #page-home', () => {
    document.body.innerHTML = '<div id="page-home" class="active"></div>';
    initStockData({ BHP: { company: 'BHP Group', price: 45, hypotheses: [] } });
    initHomePage();
    const container = document.getElementById('page-home');
    expect(container.innerHTML).toContain('coverage-table');
  });

  it('renders one row per ticker in STOCK_DATA', () => {
    document.body.innerHTML = '<div id="page-home" class="active"></div>';
    initStockData({
      BHP: { company: 'BHP Group', price: 45, hypotheses: [] },
      CBA: { company: 'Commonwealth Bank', price: 130, hypotheses: [] }
    });
    initHomePage();
    const container = document.getElementById('page-home');
    const rows = container.querySelectorAll('tr[data-ticker]');
    expect(rows.length).toBe(2);
  });

  it('renders signal badges with new taxonomy (no bull/bear/neutral text)', () => {
    document.body.innerHTML = '<div id="page-home" class="active"></div>';
    initStockData({
      BHP: { company: 'BHP Group', price: 45, hypotheses: [{ score: 8, direction: 'upside', title: 'Iron ore' }] }
    });
    initHomePage();
    const container = document.getElementById('page-home');
    expect(container.innerHTML).not.toContain('>bull<');
    expect(container.innerHTML).not.toContain('>bear<');
    expect(container.innerHTML).not.toContain('>neutral<');
    // Should use new taxonomy
    expect(container.innerHTML.toLowerCase()).toMatch(/upside|balanced|downside/);
  });

  it('renders filter bar with signal chips', () => {
    document.body.innerHTML = '<div id="page-home" class="active"></div>';
    initHomePage();
    const container = document.getElementById('page-home');
    expect(container.innerHTML).toContain('filter-chip');
    expect(container.innerHTML).toContain('filter-bar');
  });
});

describe('sortCoverageTable', () => {
  it('is exported as a no-op function for backward compatibility', () => {
    expect(typeof sortCoverageTable).toBe('function');
    expect(() => sortCoverageTable()).not.toThrow();
  });
});
