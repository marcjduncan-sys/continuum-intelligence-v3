// ============================================================
// HOME-STATE.JS -- Local Home page UI state.
// Not global. Reset on navigation away.
// ============================================================

const homeState = {
  sortColumn: 'attentionScore',
  sortDirection: 'desc',
  filterSignal: 'all',       // all | upside | balanced | downside
  filterStaleness: 'all',    // all | fresh | stale
  filterExtraction: 'all',   // all | ready | stale | failed | missing
  searchQuery: '',
  selectedTicker: null
};

export function getHomeState() { return homeState; }

export function updateHomeState(patch) {
  Object.assign(homeState, patch);
}

export function resetHomeState() {
  Object.assign(homeState, {
    sortColumn: 'attentionScore',
    sortDirection: 'desc',
    filterSignal: 'all',
    filterStaleness: 'all',
    filterExtraction: 'all',
    searchQuery: '',
    selectedTicker: null
  });
}

export function toggleSort(column) {
  if (homeState.sortColumn === column) {
    homeState.sortDirection = homeState.sortDirection === 'desc' ? 'asc' : 'desc';
  } else {
    homeState.sortColumn = column;
    homeState.sortDirection = 'desc';
  }
}
