// ============================================================
// SNAPSHOT GENERATOR v1.0
// Dynamically populates the snapshot grid with cards for all
// stocks in SNAPSHOT_ORDER. Designed to run after NFI has
// finished processing so that narrative overlays, weight
// adjustments, and dislocation badges are reflected in the
// snapshot data.
//
// Usage:
//   <script src="scripts/snapshot-generator.js"></script>
//   setTimeout(function() { initSnapshots('snapshot-grid'); }, 1500);
//
// Dependencies:
//   - STOCK_DATA, SNAPSHOT_DATA, SNAPSHOT_ORDER (global)
//   - buildSnapshotFromStock(ticker) (index.html)
//   - renderSnapshotListCard(data) (index.html)
//   - computeSkewScore(data) (index.html)
// ============================================================

(function(global) {
  'use strict';

  /**
   * Rebuild all snapshot data from STOCK_DATA.
   * Called after NFI has had time to mutate weights, inject
   * dislocation alerts, and update narrative text. This ensures
   * snapshot cards reflect the post-NFI state rather than the
   * raw STOCK_DATA values.
   */
  function refreshSnapshotData() {
    if (typeof SNAPSHOT_ORDER === 'undefined' || typeof STOCK_DATA === 'undefined') {
      console.warn('[SnapshotGenerator] SNAPSHOT_ORDER or STOCK_DATA not available');
      return;
    }

    for (var i = 0; i < SNAPSHOT_ORDER.length; i++) {
      var ticker = SNAPSHOT_ORDER[i];
      if (STOCK_DATA[ticker]) {
        // Always rebuild from current STOCK_DATA state
        // This captures NFI weight adjustments and narrative updates
        SNAPSHOT_DATA[ticker] = buildSnapshotFromStock(ticker);
      }
    }

    console.log('[SnapshotGenerator] Rebuilt snapshot data for ' + SNAPSHOT_ORDER.length + ' stocks (post-NFI)');
  }

  /**
   * Render snapshot list cards into the target container.
   * Clears existing content and repopulates from SNAPSHOT_DATA.
   *
   * @param {string} containerId - DOM id of the snapshot grid container
   */
  function renderSnapshotGrid(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      console.warn('[SnapshotGenerator] Container #' + containerId + ' not found');
      return;
    }

    // Clear any existing cards (from inline DOMContentLoaded or previous runs)
    container.innerHTML = '';

    var rendered = 0;
    for (var i = 0; i < SNAPSHOT_ORDER.length; i++) {
      var ticker = SNAPSHOT_ORDER[i];
      if (SNAPSHOT_DATA[ticker]) {
        container.innerHTML += renderSnapshotListCard(SNAPSHOT_DATA[ticker]);
        rendered++;
      }
    }

    console.log('[SnapshotGenerator] Rendered ' + rendered + ' snapshot cards into #' + containerId);
  }

  /**
   * Initialise the snapshot grid.
   * Rebuilds all snapshot data from the current (post-NFI) STOCK_DATA
   * state, then renders cards into the target container.
   *
   * @param {string} containerId - DOM id of the snapshot grid container
   */
  function initSnapshots(containerId) {
    console.log('[SnapshotGenerator] Initialising snapshots...');

    // 1. Rebuild snapshot data from current STOCK_DATA (post-NFI)
    refreshSnapshotData();

    // 2. Render cards into the grid
    renderSnapshotGrid(containerId);

    // 3. Also refresh any already-rendered snapshot detail pages
    //    so that navigating to a snapshot page shows post-NFI data
    if (typeof renderedSnapshots !== 'undefined') {
      renderedSnapshots.clear();
    }

    console.log('[SnapshotGenerator] Initialisation complete');
  }

  // Expose to global scope
  global.initSnapshots = initSnapshots;
  global.refreshSnapshotData = refreshSnapshotData;

})(typeof window !== 'undefined' ? window : this);
