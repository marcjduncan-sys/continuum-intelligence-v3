// Price drivers section renderers
// Extracted from report-sections.js without logic changes

import { RS_HDR } from './shared.js';
import { API_BASE } from '../../lib/api-config.js';
import { formatSignedPercent } from '../../lib/format.js';

// ---------------------------------------------------------------------------
// Section 10: Price Drivers (embedded research JSON)
// ---------------------------------------------------------------------------


export function renderPriceDrivers(data) {
  if (!data.priceDrivers) return '';
  const pd = data.priceDrivers;
  if (pd.error) return '';

  const ds = pd.driver_stack || {};
  const pa = pd.price_action_summary || {};
  const msc = pd.macro_sector_context || {};
  const eq = pd.evidence_quality || {};
  const ba = pd.broker_activity || {};
  const ss = pd.social_signal || {};
  const conf = pd.confidence || 'moderate';
  let primary = pd.primary_driver || '';
  const ticker = data.ticker || '';

  if (!primary && ds.primary && ds.primary.length > 0) primary = ds.primary[0];
  if (!primary) return '';

  const confCls = conf === 'very_high' || conf === 'high' ? 'pd-conf-high' : conf === 'moderate' ? 'pd-conf-mod' : 'pd-conf-low';
  const dateStr = _formatDriverDate(pd.analysis_date);

  // Performance grid helper
  function _fmtCell(val) {
    if (val == null) return '<span class="pd-perf-cell pd-perf-flat">N/A</span>';
    const cls = val > 0.1 ? 'pd-perf-up' : val < -0.1 ? 'pd-perf-down' : 'pd-perf-flat';
    return '<span class="pd-perf-cell ' + cls + '">' + formatSignedPercent(val) + '</span>';
  }

  // Performance grid
  const gridHtml =
    '<div class="pd-perf-grid">' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-header"></span><span class="pd-perf-cell pd-perf-header">2D</span><span class="pd-perf-cell pd-perf-header">5D</span><span class="pd-perf-cell pd-perf-header">10D</span></div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">' + ticker + '</span>' + _fmtCell(pa.price_change_2d_pct) + _fmtCell(pa.price_change_5d_pct) + _fmtCell(pa.price_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">ASX 200</span>' + _fmtCell(pa.asx200_change_2d_pct) + _fmtCell(pa.asx200_change_5d_pct) + _fmtCell(pa.asx200_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">Relative</span>' + _fmtCell(pa.relative_2d_pct) + _fmtCell(pa.relative_5d_pct) + _fmtCell(pa.relative_10d_pct) + '</div>' +
    '</div>';

  // Broker alerts
  let brokerHtml = '';
  const upgrades = ba.recent_upgrades || [];
  const downgrades = ba.recent_downgrades || [];
  for (let u = 0; u < upgrades.length && u < 2; u++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-upgrade">\u2191 UPGRADE: ' + _truncate(upgrades[u], 200) + '</div>';
  }
  for (let dg = 0; dg < downgrades.length && dg < 2; dg++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-downgrade">\u2193 DOWNGRADE: ' + _truncate(downgrades[dg], 200) + '</div>';
  }

  // Social badge
  let socialHtml = '';
  const hcAct = ss.hotcopper_activity || '';
  if (hcAct === 'elevated') socialHtml = '<span class="pd-social pd-social-elevated">HC: Elevated</span>';
  else if (hcAct === 'quiet') socialHtml = '<span class="pd-social pd-social-quiet">HC: Quiet</span>';

  const MAX = 250;
  const bullets = [];
  bullets.push('<b>Primary driver:</b> ' + _truncate(primary, MAX));

  const secondaries = ds.secondary || [];
  if (secondaries.length > 0) {
    bullets.push('<b>Secondary:</b> ' + _truncate(secondaries.join('; '), MAX));
  }

  const peerText = msc.peer_moves_summary || '';
  const macroText = msc.commodity_or_rate_context || '';
  if (peerText && macroText) {
    bullets.push('<b>Peer and macro context:</b> ' + _truncate(peerText + '. ' + macroText, MAX));
  } else if (peerText) {
    bullets.push('<b>Peer context:</b> ' + _truncate(peerText, MAX));
  } else if (macroText) {
    bullets.push('<b>Macro context:</b> ' + _truncate(macroText, MAX));
  } else {
    const amps = ds.amplifiers || [];
    if (amps.length > 0) {
      bullets.push('<b>Amplifiers:</b> ' + _truncate(amps.join('; '), MAX));
    }
  }

  const rejected = ds.rejected || [];
  if (rejected.length > 0) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rejected.slice(0, 3).join('; '), MAX));
  }

  if (eq.key_gap) {
    bullets.push('<b>Confidence (' + conf.replace(/_/g, ' ') + '):</b> ' + _truncate(eq.key_gap, MAX));
  }

  let bulletsHtml = '<ul class="pd-bullets">';
  for (let i = 0; i < bullets.length; i++) {
    bulletsHtml += '<li>' + bullets[i] + '</li>';
  }
  bulletsHtml += '</ul>';

  const t = data.ticker.toLowerCase();
  return '<div class="report-section" id="' + t + '-price-drivers-embedded">' +
    RS_HDR('Section 10', 'Price Drivers') +
    '<div class="rs-body">' +
      '<div class="pd-block">' +
        '<div class="pd-header">' +
          '<span class="pd-label">WHAT DROVE THE PRICE</span>' +
          '<span class="pd-conf ' + confCls + '">' + conf.replace(/_/g, ' ') + '</span>' +
          socialHtml +
          (dateStr ? '<span class="pd-date">' + dateStr + '</span>' : '') +
        '</div>' +
        gridHtml +
        brokerHtml +
        bulletsHtml +
      '</div>' +
    '</div></div>';
}

export function renderPriceDriversPlaceholder(ticker) {
  return '<div id="price-drivers-' + ticker + '" class="pd-container"></div>';
}

function _formatDriverDate(isoDate) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + '-' + months[d.getMonth()] + '-' + String(d.getFullYear()).slice(2);
}

function _truncate(text, maxLen) {
  if (!text) return '';
  const s = String(text).trim();
  if (s.length <= maxLen) return s;
  const cut = s.substring(0, maxLen);
  const lastDot = cut.lastIndexOf('. ');
  if (lastDot > maxLen * 0.5) return cut.substring(0, lastDot + 1);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.6) return cut.substring(0, lastSpace) + '.';
  return cut + '.';
}

export function renderPriceDriversContent(container, driverData) {
  if (!driverData || driverData.error) {
    container.style.display = 'none';
    return;
  }

  const ds = driverData.driver_stack || {};
  const rc = driverData.ranked_conclusion || {};
  const rt = driverData.report_text || {};
  const pa = driverData.price_action_summary || {};
  const eq = driverData.evidence_quality || {};
  const ba = driverData.broker_activity || {};
  const ss = driverData.social_signal || {};
  const meta = driverData.agent_metadata || {};
  const conf = driverData.confidence || rc.overall_confidence || 'moderate';
  const confCls = conf === 'very_high' || conf === 'high' ? 'pd-conf-high' : conf === 'moderate' ? 'pd-conf-mod' : 'pd-conf-low';
  const dateStr = _formatDriverDate(driverData.analysis_date || meta.analysis_date);
  const ticker = driverData.ticker || '';

  // Performance grid helper
  function _fmtCell(val) {
    if (val == null) return '<span class="pd-perf-cell pd-perf-flat">N/A</span>';
    const cls = val > 0.1 ? 'pd-perf-up' : val < -0.1 ? 'pd-perf-down' : 'pd-perf-flat';
    return '<span class="pd-perf-cell ' + cls + '">' + formatSignedPercent(val) + '</span>';
  }

  // Performance grid
  const gridHtml =
    '<div class="pd-perf-grid">' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-header"></span><span class="pd-perf-cell pd-perf-header">2D</span><span class="pd-perf-cell pd-perf-header">5D</span><span class="pd-perf-cell pd-perf-header">10D</span></div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">' + ticker + '</span>' + _fmtCell(pa.price_change_2d_pct) + _fmtCell(pa.price_change_5d_pct) + _fmtCell(pa.price_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">ASX 200</span>' + _fmtCell(pa.asx200_change_2d_pct) + _fmtCell(pa.asx200_change_5d_pct) + _fmtCell(pa.asx200_change_10d_pct) + '</div>' +
      '<div class="pd-perf-row"><span class="pd-perf-cell pd-perf-label">Relative</span>' + _fmtCell(pa.relative_2d_pct) + _fmtCell(pa.relative_5d_pct) + _fmtCell(pa.relative_10d_pct) + '</div>' +
    '</div>';

  // Broker alerts
  let brokerHtml = '';
  const upgrades = ba.recent_upgrades || [];
  const downgrades = ba.recent_downgrades || [];
  for (let u = 0; u < upgrades.length && u < 2; u++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-upgrade">\u2191 UPGRADE: ' + _truncate(upgrades[u], 200) + '</div>';
  }
  for (let dg = 0; dg < downgrades.length && dg < 2; dg++) {
    brokerHtml += '<div class="pd-broker-alert pd-broker-downgrade">\u2193 DOWNGRADE: ' + _truncate(downgrades[dg], 200) + '</div>';
  }

  // Social badge
  let socialHtml = '';
  const hcAct = ss.hotcopper_activity || '';
  if (hcAct === 'elevated') socialHtml = '<span class="pd-social pd-social-elevated">HC: Elevated</span>';
  else if (hcAct === 'quiet') socialHtml = '<span class="pd-social pd-social-quiet">HC: Quiet</span>';

  // Build 5 bullets from available data (new or old schema)
  const MAX = 250;
  const bullets = [];

  // Bullet 1: Primary driver
  let primary = driverData.primary_driver || rc.most_likely_primary_driver || '';
  if (!primary && ds.primary && ds.primary.length > 0) primary = ds.primary[0];
  if (!primary && rt.primary_driver_paragraph) primary = _truncate(rt.primary_driver_paragraph, MAX);
  if (primary) {
    bullets.push('<b>Primary driver:</b> ' + _truncate(primary, MAX));
  }

  // Bullet 2: Secondary drivers
  const secondaries = ds.secondary || rc.secondary_drivers || [];
  if (secondaries.length > 0) {
    bullets.push('<b>Secondary:</b> ' + _truncate(secondaries.join('; '), MAX));
  } else if (rt.secondary_drivers_paragraph) {
    bullets.push('<b>Secondary:</b> ' + _truncate(rt.secondary_drivers_paragraph, MAX));
  }

  // Bullet 3: Peer and macro context or amplifiers
  const msc = driverData.macro_sector_context || {};
  const peerText = msc.peer_moves_summary || '';
  const macroText = msc.commodity_or_rate_context || '';
  if (peerText && macroText) {
    bullets.push('<b>Peer and macro context:</b> ' + _truncate(peerText + '. ' + macroText, MAX));
  } else if (peerText) {
    bullets.push('<b>Peer context:</b> ' + _truncate(peerText, MAX));
  } else if (macroText) {
    bullets.push('<b>Macro context:</b> ' + _truncate(macroText, MAX));
  }
  if (!peerText && !macroText) {
    const amps = ds.amplifiers || rc.amplifiers || [];
    if (amps.length > 0) {
      bullets.push('<b>Amplifiers:</b> ' + _truncate(amps.join('; '), MAX));
    }
  }

  // Bullet 4: Ruled out
  const rejected = ds.rejected || rc.rejected_explanations || [];
  if (rejected.length > 0) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rejected.slice(0, 3).join('; '), MAX));
  } else if (rt.rejected_explanations_paragraph) {
    bullets.push('<b>Ruled out:</b> ' + _truncate(rt.rejected_explanations_paragraph, MAX));
  }

  // Bullet 5: Confidence rationale
  let rationale = '';
  if (eq.key_gap) {
    rationale = eq.key_gap;
  } else if (rc.confidence_rationale) {
    rationale = rc.confidence_rationale;
  } else if (rt.final_judgement_paragraph) {
    rationale = _truncate(rt.final_judgement_paragraph, MAX);
  }
  if (rationale) {
    bullets.push('<b>Confidence (' + conf.replace(/_/g, ' ') + '):</b> ' + _truncate(rationale, MAX));
  }

  if (bullets.length === 0) {
    container.style.display = 'none';
    return;
  }

  let bulletsHtml = '<ul class="pd-bullets">';
  for (let i = 0; i < bullets.length; i++) {
    bulletsHtml += '<li>' + bullets[i] + '</li>';
  }
  bulletsHtml += '</ul>';

  container.innerHTML =
    '<div class="pd-block">' +
      '<div class="pd-header">' +
        '<span class="pd-label">WHAT DROVE THE PRICE</span>' +
        '<span class="pd-conf ' + confCls + '">' + conf.replace(/_/g, ' ') + '</span>' +
        socialHtml +
        (dateStr ? '<span class="pd-date">' + dateStr + '</span>' : '') +
      '</div>' +
      gridHtml +
      brokerHtml +
      bulletsHtml +
    '</div>';
}

export function fetchPriceDrivers(ticker, force) {
  const container = document.getElementById('price-drivers-' + ticker);
  if (!container) return;

  const baseUrl = API_BASE;
  const apiKey = window.CI_API_KEY || '';

  const headers = { 'Accept': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;

  // /latest serves cache only; /{ticker} runs fresh analysis
  const endpoint = force
    ? '/api/agents/drivers/' + ticker
    : '/api/agents/drivers/' + ticker + '/latest';

  fetch(baseUrl + endpoint, { headers: headers })
    .then(function(resp) {
      if (!resp.ok) {
        container.style.display = 'none';
        return null;
      }
      return resp.json();
    })
    .then(function(data) {
      if (data) renderPriceDriversContent(container, data);
    })
    .catch(function() {
      container.style.display = 'none';
    });
}

