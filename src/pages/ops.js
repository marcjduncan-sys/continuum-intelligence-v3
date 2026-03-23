// ============================================================
// OPS.JS -- PM Operations Dashboard (BEAD-001 / D6-4)
// URL-only route (/ops). No visible nav link in v1.
// 4 UI states: loading, zero-data, data-present, error.
// ============================================================

import { API_BASE } from '../lib/api-config.js';

const OPS_PERIODS = [
  { label: '1d', days: 1 },
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
];

let _currentDays = 7;

// --- Fetch ---

async function _fetchDashboard(days) {
  const secret = localStorage.getItem('ci_ops_secret') || '';
  const resp = await fetch(`${API_BASE}/api/ops/pm-dashboard?days=${days}`, {
    headers: { 'X-Ops-Secret': secret },
  });
  if (resp.status === 401) {
    throw new Error('Unauthorised: invalid or missing ops secret');
  }
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status}`);
  }
  return resp.json();
}

// --- Render helpers ---

function _metricCard(label, value, sub) {
  return `<div class="ops-metric">
    <div class="ops-metric-value">${value}</div>
    <div class="ops-metric-label">${label}</div>
    ${sub ? `<div class="ops-metric-sub">${sub}</div>` : ''}
  </div>`;
}

function _statusBadge(status) {
  const cls = status === 'normal' ? 'ops-badge--ok'
    : status === 'quiet' ? 'ops-badge--warn'
    : 'ops-badge--err';
  return `<span class="ops-badge ${cls}">${status}</span>`;
}

function _renderTimeseries(label, data) {
  if (!data || data.length === 0) return '';
  const max = Math.max(...data.map(d => d.count), 1);
  const bars = data.map(d => {
    const pct = Math.round((d.count / max) * 100);
    return `<div class="ops-bar-col" title="${d.date}: ${d.count}">
      <div class="ops-bar" style="height:${Math.max(pct, 2)}%"></div>
      <div class="ops-bar-label">${d.date.slice(5)}</div>
    </div>`;
  }).join('');
  return `<div class="ops-section">
    <h3 class="ops-section-title">${label}</h3>
    <div class="ops-bar-chart">${bars}</div>
  </div>`;
}

function _renderBreakdownTable(label, rows, keyCol, valCol) {
  if (!rows || rows.length === 0) return '';
  const trs = rows.map(r =>
    `<tr><td>${r[keyCol]}</td><td class="ops-num">${r[valCol]}</td></tr>`
  ).join('');
  return `<div class="ops-section">
    <h3 class="ops-section-title">${label}</h3>
    <table class="ops-table"><tbody>${trs}</tbody></table>
  </div>`;
}

function _renderEvents(events) {
  if (!events || events.length === 0) return '';
  const trs = events.map(ev => {
    const ts = ev.timestamp ? new Date(ev.timestamp).toLocaleString() : '--';
    return `<tr>
      <td><span class="ops-event-type ops-event-type--${ev.type}">${ev.type}</span></td>
      <td>${ts}</td>
      <td>${ev.detail || ''}</td>
    </tr>`;
  }).join('');
  return `<div class="ops-section">
    <h3 class="ops-section-title">Latest Events</h3>
    <table class="ops-table ops-events-table">
      <thead><tr><th>Type</th><th>Time</th><th>Detail</th></tr></thead>
      <tbody>${trs}</tbody>
    </table>
  </div>`;
}

// --- States ---

function _renderLoading() {
  return '<div class="ops-state ops-state--loading"><div class="ops-spinner"></div><p>Loading dashboard data...</p></div>';
}

function _renderError(msg) {
  return `<div class="ops-state ops-state--error">
    <p class="ops-error-title">Failed to load dashboard</p>
    <p class="ops-error-detail">${msg}</p>
    <button class="ops-retry-btn" onclick="window._opsRetry && window._opsRetry()">Retry</button>
  </div>`;
}

function _renderZeroState(reason) {
  return `<div class="ops-state ops-state--zero">
    <p class="ops-zero-title">No PM activity</p>
    <p class="ops-zero-detail">${reason || 'No data in selected window'}</p>
  </div>`;
}

function _renderData(data) {
  const s = data.summary;
  const st = data.status;

  const header = `<div class="ops-header">
    <h2 class="ops-title">PM Operations Dashboard</h2>
    <div class="ops-header-meta">
      ${_statusBadge(st.traffic_status)}
      <span class="ops-generated">Generated: ${new Date(data.generated_at).toLocaleString()}</span>
    </div>
  </div>`;

  const metrics = `<div class="ops-metrics-grid">
    ${_metricCard('PM Requests', s.pm_requests)}
    ${_metricCard('Handoffs', s.handoffs)}
    ${_metricCard('Decisions', s.decisions)}
    ${_metricCard('Insights', s.insights)}
    ${_metricCard('Active Portfolios', s.active_portfolios)}
    ${_metricCard('Active Tickers', s.active_tickers)}
  </div>`;

  const ts = data.timeseries;
  const timeseries = _renderTimeseries('PM Requests / Day', ts.requests_by_day)
    + _renderTimeseries('Handoffs / Day', ts.handoffs_by_day);

  const bd = data.breakdowns;
  const breakdowns =
    _renderBreakdownTable('Handoffs by Route', bd.handoffs_by_route.map(r => ({
      key: `${r.source} → ${r.destination}`, count: r.count
    })), 'key', 'count')
    + _renderBreakdownTable('Decisions by Action', bd.decisions_by_action, 'action_type', 'count')
    + _renderBreakdownTable('Insights by Type', bd.insights_by_type, 'insight_type', 'count')
    + _renderBreakdownTable('Context Modes', bd.context_modes, 'mode', 'count')
    + _renderBreakdownTable('Top Tickers', bd.top_tickers, 'ticker', 'mention_count')
    + _renderBreakdownTable('Top Portfolios', bd.top_portfolios, 'portfolio_id', 'request_count');

  const events = _renderEvents(data.latest_events);

  return header + metrics + timeseries
    + '<div class="ops-breakdowns-grid">' + breakdowns + '</div>'
    + events;
}

// --- Period selector ---

function _renderPeriodSelector() {
  const buttons = OPS_PERIODS.map(p =>
    `<button class="ops-period-btn${p.days === _currentDays ? ' ops-period-btn--active' : ''}"
            data-days="${p.days}">${p.label}</button>`
  ).join('');
  return `<div class="ops-period-selector">${buttons}</div>`;
}

// --- Main render ---

async function _loadAndRender(container) {
  container.innerHTML = _renderPeriodSelector() + _renderLoading();

  try {
    const data = await _fetchDashboard(_currentDays);
    if (!data.status.has_data) {
      container.innerHTML = _renderPeriodSelector() + _renderZeroState(data.status.zero_state_reason);
    } else {
      container.innerHTML = _renderPeriodSelector() + _renderData(data);
    }
  } catch (err) {
    container.innerHTML = _renderPeriodSelector() + _renderError(err.message || 'Unknown error');
  }

  // Wire period buttons
  container.querySelectorAll('.ops-period-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentDays = parseInt(btn.dataset.days, 10);
      _loadAndRender(container);
    });
  });
}

/**
 * Render the ops dashboard page. Called by router on hash === 'ops'.
 */
export function renderOpsPage() {
  const container = document.getElementById('page-ops');
  if (!container) return;

  window._opsRetry = () => _loadAndRender(container);
  _loadAndRender(container);
}
