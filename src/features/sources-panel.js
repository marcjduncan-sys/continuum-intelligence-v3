// sources-panel.js -- External research sources panel for ticker report pages
// Stream C: Research Intelligence Graph (BEAD-006)

import { API_BASE } from '../lib/api-config.js';

const DELETE_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" width="14" height="14">' +
  '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
  '</svg>';

/**
 * Escape HTML entities for safe rendering.
 * @param {string} str
 * @returns {string}
 */
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format a date string for display.
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

/**
 * Map hypothesis identifier to a display class suffix.
 * @param {string} hyp - e.g. "N1", "N2", "T1", "T2"
 * @returns {string}
 */
function hypClass(hyp) {
  if (!hyp) return '';
  const h = hyp.toUpperCase();
  if (h === 'N1' || h === 'T1') return 'n1';
  if (h === 'N2' || h === 'T2') return 'n2';
  if (h === 'N3' || h === 'T3') return 'n3';
  if (h === 'N4' || h === 'T4') return 'n4';
  if (h === 'CONTRARIAN') return 'contrarian';
  return 'mixed';
}

/**
 * Render a single source card HTML.
 * @param {object} source
 * @returns {string}
 */
export function renderSourceCard(source) {
  const view = source.view || {};
  const hyp = view.aligned_hypothesis || 'MIXED';
  const conf = view.alignment_confidence != null ? Math.round(view.alignment_confidence * 100) : null;
  const dir = view.direction || '';
  const evidence = view.key_evidence || [];
  const risks = view.key_risks || [];
  const pt = view.price_target;
  const summary = view.summary || '';

  let html = '<div class="src-card" data-source-id="' + esc(source.source_id || source.id) + '">';

  // Header row
  html += '<div class="src-card-header">';
  html += '<div class="src-card-meta">';
  html += '<span class="src-card-name">' + esc(source.source_name) + '</span>';
  html += '<span class="src-card-type-badge src-card-type-' + esc(source.source_type || 'other') + '">' +
    esc(source.source_type || 'other') + '</span>';
  html += '</div>';
  html += '<div class="src-card-date">' + formatDate(source.document_date || source.created_at) + '</div>';
  html += '</div>';

  // Hypothesis alignment
  html += '<div class="src-card-alignment">';
  html += '<span class="src-card-hyp src-card-hyp-' + hypClass(hyp) + '">' + esc(hyp) + '</span>';
  if (conf !== null) {
    html += '<span class="src-card-confidence">' + conf + '% confidence</span>';
  }
  if (dir) {
    html += '<span class="src-card-direction src-card-dir-' + esc(dir) + '">' + esc(dir) + '</span>';
  }
  html += '</div>';

  // Summary
  if (summary) {
    html += '<div class="src-card-summary">' + esc(summary) + '</div>';
  }

  // Expandable detail
  html += '<details class="src-card-detail">';
  html += '<summary class="src-card-detail-toggle">View evidence and risks</summary>';

  if (evidence.length > 0) {
    html += '<div class="src-card-evidence"><h4>Key Evidence</h4>';
    evidence.forEach(function(item) {
      html += '<div class="src-card-evidence-item">';
      if (item.supports) {
        html += '<span class="src-card-evidence-tag">Supports ' + esc(item.supports) + '</span>';
      }
      html += '<span>' + esc(item.point) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (risks.length > 0) {
    html += '<div class="src-card-risks"><h4>Key Risks</h4>';
    risks.forEach(function(item) {
      html += '<div class="src-card-risk-item">';
      if (item.threatens) {
        html += '<span class="src-card-risk-tag">Threatens ' + esc(item.threatens) + '</span>';
      }
      html += '<span>' + esc(item.point) + '</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (pt != null) {
    html += '<div class="src-card-price-target">Price target: $' + Number(pt).toFixed(2) + '</div>';
  }

  html += '</details>';

  // Delete button
  html += '<button class="src-card-delete" data-source-id="' + esc(source.source_id || source.id) + '" title="Remove this source">' +
    DELETE_ICON_SVG + '</button>';

  html += '</div>';
  return html;
}

/**
 * Render the sources panel HTML.
 * @param {Array} sources - Array of source objects from GET /api/sources/{ticker}
 * @param {string} ticker
 * @returns {string}
 */
export function renderSourcesPanel(sources, ticker) {
  const id = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hasSources = sources && sources.length > 0;

  // When no sources exist the upload zone (src-upload-mount) already serves
  // as the empty state, so we render nothing here to avoid a duplicate block.
  if (!hasSources) return '';

  let html = '<div class="src-panel" id="src-panel-' + id + '">';
  html += '<div class="src-panel-header">';
  html += '<span class="src-panel-count">' + sources.length + ' source' + (sources.length === 1 ? '' : 's') + '</span>';
  html += '</div>';

  // Source cards
  html += '<div class="src-panel-list">';
  const sorted = sources.slice().sort(function(a, b) {
    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
  });
  sorted.forEach(function(source) {
    html += renderSourceCard(source);
  });
  html += '</div>';

  html += '</div>';
  return html;
}

/**
 * Build auth headers for API calls (mirrors chat.js pattern).
 * @returns {{ headers: object, guestParam: string }}
 */
function buildAuth() {
  const headers = { 'X-API-Key': window.CI_API_KEY || '' };
  const token = window.CI_AUTH && window.CI_AUTH.getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;
  let guestParam = '';
  if (!token && window.CI_AUTH && window.CI_AUTH.getGuestId) {
    guestParam = '?guest_id=' + encodeURIComponent(window.CI_AUTH.getGuestId());
  }
  return { headers, guestParam };
}

/**
 * Bind delete button handlers within a container.
 * @param {HTMLElement} container
 * @param {string} ticker
 */
function bindDeleteHandlers(container, ticker) {
  container.querySelectorAll('.src-card-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const sourceId = btn.getAttribute('data-source-id');
      if (!sourceId) return;
      if (!confirm('Remove this source? This cannot be undone.')) return;

      const auth = buildAuth();
      fetch(API_BASE + '/api/sources/' + encodeURIComponent(sourceId) + auth.guestParam, {
        method: 'DELETE',
        headers: auth.headers
      })
      .then(function(res) {
        if (!res.ok) throw new Error('Delete failed');
        const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(sourceId) : sourceId;
        const card = container.querySelector('.src-card[data-source-id="' + escapedId + '"]');
        if (card) card.remove();
        // Update count
        const panel = document.getElementById('src-panel-' + ticker.toLowerCase().replace(/[^a-z0-9]/g, ''));
        if (panel) {
          const remaining = panel.querySelectorAll('.src-card').length;
          const countEl = panel.querySelector('.src-panel-count');
          if (countEl) {
            countEl.textContent = remaining + ' source' + (remaining === 1 ? '' : 's');
          }
          if (remaining === 0) {
            const emptyEl = panel.querySelector('.src-panel-empty');
            const listEl = panel.querySelector('.src-panel-list');
            if (emptyEl) emptyEl.style.display = '';
            if (listEl) listEl.style.display = 'none';
            if (countEl) countEl.textContent = '';
          }
        }
      })
      .catch(function(err) {
        console.warn('[Sources] Delete failed:', err);
        btn.style.color = 'var(--signal-red)';
        setTimeout(function() { btn.style.color = ''; }, 2000);
      });
    });
  });
}

/**
 * Fetch sources from API and render the panel into the DOM.
 * @param {string} ticker
 */
export async function initSourcesPanel(ticker) {
  const mountEl = document.getElementById('src-panel-mount-' + ticker.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (!mountEl) return;

  const auth = buildAuth();
  try {
    const res = await fetch(
      API_BASE + '/api/sources/' + encodeURIComponent(ticker) + auth.guestParam,
      { headers: auth.headers }
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const sources = await res.json();
    mountEl.innerHTML = renderSourcesPanel(sources, ticker);
    bindDeleteHandlers(mountEl, ticker);
  } catch (err) {
    console.warn('[Sources] Failed to load sources for ' + ticker + ':', err);
    mountEl.innerHTML = renderSourcesPanel([], ticker);
  }
}

/**
 * Add a single source to the panel (called after upload completes).
 * @param {object} source - Source data from upload response
 * @param {string} ticker
 */
export function appendSource(source, ticker) {
  const id = ticker.toLowerCase().replace(/[^a-z0-9]/g, '');
  const panel = document.getElementById('src-panel-' + id);

  // If the panel doesn't exist yet (first upload), create it in the mount point.
  if (!panel) {
    const mountEl = document.getElementById('src-panel-mount-' + id);
    if (!mountEl) return;
    mountEl.innerHTML = renderSourcesPanel([source], ticker);
    bindDeleteHandlers(mountEl, ticker);
    return;
  }

  const listEl = panel.querySelector('.src-panel-list');
  const countEl = panel.querySelector('.src-panel-count');

  // Prepend new card
  if (listEl) {
    const temp = document.createElement('div');
    temp.innerHTML = renderSourceCard(source);
    const card = temp.firstChild;
    listEl.insertBefore(card, listEl.firstChild);
    bindDeleteHandlers(listEl, ticker);
  }

  // Update count
  if (countEl) {
    const count = panel.querySelectorAll('.src-card').length;
    countEl.textContent = count + ' source' + (count === 1 ? '' : 's');
  }
}
