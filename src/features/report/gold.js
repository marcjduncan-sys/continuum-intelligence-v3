// Gold analysis section renderers
// Extracted from report-sections.js without logic changes

import { RS_HDR } from './shared.js';

// ---------------------------------------------------------------------------
// Section 09: Gold Agent Discovery (conditional -- gold stocks only)
// ---------------------------------------------------------------------------

export function renderGoldDiscovery(data) {
  if (!data.goldAgent) return '';
  try { return _renderGoldDiscoveryInner(data); } catch (err) {
    console.error('[GoldDiscovery] Render error for ' + data.ticker + ':', err);
    return '';
  }
}

function _renderGoldAssets(ga) {
  const assets = ga.assets;
  if (!assets || !assets.length) return '';

  let rows = '';
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    rows += '<tr>' +
      '<td>' + (a.name || 'N/A') + '</td>' +
      '<td>' + (a.country || 'N/A') + '</td>' +
      '<td>' + (a.ownership_pct != null ? a.ownership_pct + '%' : '100%') + '</td>' +
      '<td>' + (a.stage || 'N/A') + '</td>' +
      '<td>' + (a.deposit_type || 'N/A') + '</td>' +
      '<td>' + (a.mining_method || 'N/A') + '</td>' +
      '<td>' + (a.annual_production_koz != null ? a.annual_production_koz + ' koz' : 'N/A') + '</td>' +
      '<td>' + (a.reserve_grade_gt != null ? a.reserve_grade_gt + ' g/t' : 'N/A') + '</td>' +
      '<td>' + (a.mine_life_years != null ? a.mine_life_years + ' yr' : 'N/A') + '</td>' +
      '<td>' + (a.aisc_per_oz_usd != null ? 'US$' + a.aisc_per_oz_usd.toLocaleString() : 'N/A') + '</td>' +
    '</tr>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Asset Portfolio</div>' +
    '<div class="ga-evidence-scroll">' +
    '<table class="ga-metrics-table ga-assets-table"><thead><tr>' +
      '<th>Asset</th><th>Country</th><th>Own%</th><th>Stage</th>' +
      '<th>Deposit</th><th>Method</th>' +
      '<th>Production</th><th>Grade</th><th>Mine Life</th><th>AISC</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '</div></div>';
}

function _renderGoldValuation(ga) {
  const v = ga.valuation;
  if (!v) return '';
  const base = v.screening_nav_usd_m;
  const up = v.upside_nav_usd_m;
  const down = v.downside_nav_usd_m;
  if (base == null && up == null && down == null) return '';

  const fmt = function(n) { return n != null ? 'US$' + n.toLocaleString() + 'm' : 'N/A'; };

  const navCards =
    '<div class="ga-val-grid">' +
      '<div class="ga-val-card ga-val-down"><div class="ga-val-label">Downside NAV</div><div class="ga-val-num">' + fmt(down) + '</div></div>' +
      '<div class="ga-val-card ga-val-base"><div class="ga-val-label">Base NAV</div><div class="ga-val-num">' + fmt(base) + '</div></div>' +
      '<div class="ga-val-card ga-val-up"><div class="ga-val-label">Upside NAV</div><div class="ga-val-num">' + fmt(up) + '</div></div>' +
    '</div>';

  const multiples = [];
  if (v.p_nav != null) multiples.push(['P/NAV', v.p_nav + 'x']);
  if (v.ev_per_reserve_oz_usd != null) multiples.push(['EV/Reserve oz', 'US$' + v.ev_per_reserve_oz_usd.toLocaleString()]);
  if (v.ev_per_resource_oz_usd != null) multiples.push(['EV/Resource oz', 'US$' + v.ev_per_resource_oz_usd.toLocaleString()]);
  if (v.ev_per_production_oz_usd != null) multiples.push(['EV/Production oz', 'US$' + v.ev_per_production_oz_usd.toLocaleString()]);
  if (v.fcf_yield_spot_pct != null) multiples.push(['FCF Yield (spot)', v.fcf_yield_spot_pct + '%']);

  let multiplesHtml = '';
  if (multiples.length > 0) {
    let mRows = '';
    for (let i = 0; i < multiples.length; i++) {
      mRows += '<tr><td class="ga-metric-name">' + multiples[i][0] + '</td><td class="ga-metric-val">' + multiples[i][1] + '</td></tr>';
    }
    multiplesHtml = '<table class="ga-metrics-table"><tbody>' + mRows + '</tbody></table>';
  }

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Valuation Scenarios</div>' +
    navCards + multiplesHtml +
  '</div>';
}

function _renderGoldPeers(ga) {
  const pf = ga.peer_frame;
  if (!pf) return '';

  const v = ga.valuation || {};
  const pNav = v.p_nav;
  const medianPNav = pf.peer_median_p_nav;
  const discount = pf.p_nav_discount_premium_pct;
  const comment = pf.relative_valuation_comment || '';
  const peers = pf.peer_group || [];

  if (!medianPNav && !comment) return '';

  const discountColor = discount != null
    ? (discount < 0 ? 'var(--signal-green)' : discount > 0 ? 'var(--signal-red)' : 'var(--text-primary)')
    : '';
  const discountText = discount != null
    ? (discount > 0 ? '+' : '') + discount + '% vs peers'
    : '';

  let metricsHtml = '<div class="ga-peer-metrics">';
  if (pNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Company P/NAV</div><div class="ga-cost-value">' + pNav + 'x</div></div>';
  if (medianPNav != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Peer Median P/NAV</div><div class="ga-cost-value">' + medianPNav + 'x</div></div>';
  if (discount != null) metricsHtml += '<div class="ga-cost-cell"><div class="ga-cost-label">Discount / Premium</div><div class="ga-cost-value" style="color:' + discountColor + '">' + discountText + '</div></div>';
  metricsHtml += '</div>';

  const peersHtml = peers.length > 0
    ? '<div class="ga-peer-group"><span class="ga-cost-label">Peer group:</span> ' + peers.join(', ') + '</div>'
    : '';

  const commentHtml = comment
    ? '<div class="rs-text" style="margin-top:8px">' + comment + '</div>'
    : '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Peer Comparison</div>' +
    metricsHtml + peersHtml + commentHtml +
  '</div>';
}

function _renderGoldSensitivities(ga) {
  const sens = ga.sensitivities;
  if (!sens) return '';

  const v = ga.valuation || {};
  const baseNav = v.ic_nav_usd_m || v.screening_nav_usd_m;
  if (!baseNav) return '';

  const scenarios = [
    ['Gold price +15%', sens.gold_price_up_15_nav_usd_m],
    ['Gold price -15%', sens.gold_price_down_15_nav_usd_m],
    ['FX +5%', sens.fx_plus_5pct_nav_usd_m],
    ['Recovery -2pt', sens.recovery_minus_2pt_nav_usd_m],
    ['Capex +15%', sens.capex_plus_15pct_nav_usd_m],
    ['6-month delay', sens.delay_6m_nav_usd_m]
  ];

  let hasAny = false;
  let rows = '';
  for (let i = 0; i < scenarios.length; i++) {
    const nav = scenarios[i][1];
    if (nav == null) continue;
    hasAny = true;
    const pctChange = Math.round((nav - baseNav) / baseNav * 100);
    const color = pctChange >= 0 ? 'var(--signal-green)' : 'var(--signal-red)';
    const sign = pctChange >= 0 ? '+' : '';
    rows += '<tr>' +
      '<td>' + scenarios[i][0] + '</td>' +
      '<td>US$' + nav.toLocaleString() + 'm</td>' +
      '<td style="color:' + color + '">' + sign + pctChange + '%</td>' +
    '</tr>';
  }

  if (!hasAny) return '';

  return '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Sensitivity Analysis</div>' +
    '<table class="ga-metrics-table"><thead><tr>' +
      '<th>Scenario</th><th>NAV</th><th>Change</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
  '</div>';
}

function _renderGoldDiscoveryInner(data) {
  const t = data.ticker.toLowerCase();
  const ga = data.goldAgent;

  // Normalise both raw (gold_agent.py) and flattened schemas
  const skew = ga.skew_score != null ? ga.skew_score : (ga.scorecard ? ga.scorecard.skew_score : 0);
  const verdict = ga.verdict || ga.executive_summary || '';
  const bull = (ga.hypothesis && ga.hypothesis.bull) || (ga.investment_view && ga.investment_view.bull_case) || '';
  const bear = (ga.hypothesis && ga.hypothesis.bear) || (ga.investment_view && ga.investment_view.bear_case) || '';
  const trigger = ga.monitoring_trigger || (ga.investment_view && ga.investment_view.monitoring_trigger) || '';
  const km = ga.key_metrics || {};
  const aisc = km.aisc_per_oz != null ? km.aisc_per_oz : km.aisc_per_oz_usd;
  const netCash = km.net_cash_debt_aud_m != null ? km.net_cash_debt_aud_m : km.net_cash_debt_usd_m;

  // ---- Scorecard ----
  const skewColor = skew >= 55 ? 'var(--signal-green)' : skew <= 45 ? 'var(--signal-red)' : 'var(--signal-amber)';
  const stageBadge = ga.company_stage
    ? '<div class="ga-score-card"><div class="ga-score-label">Stage</div>' +
        '<div class="ga-score-value ga-stage-value">' + ga.company_stage.replace(/_/g, ' ') + '</div></div>'
    : '';

  const scorecardHtml =
    '<div class="ga-scorecard">' +
      '<div class="ga-score-card ga-score-skew" style="border-color:' + skewColor + '">' +
        '<div class="ga-score-label">Skew</div>' +
        '<div class="ga-score-value" style="color:' + skewColor + '">' + skew + '</div>' +
      '</div>' +
      stageBadge +
    '</div>';

  // ---- Verdict ----
  const verdictHtml = '<div class="ga-verdict">' +
    '<div class="rs-subtitle">Verdict</div>' +
    '<div class="rs-text">' + verdict + '</div>' +
  '</div>';

  // ---- Investment View (Bull / Bear) ----
  const viewHtml = '<div class="ga-view-grid">' +
    '<div class="ga-view-col ga-view-bull">' +
      '<div class="ga-view-label">Bull Case</div>' +
      '<div class="rs-text">' + bull + '</div>' +
    '</div>' +
    '<div class="ga-view-col ga-view-bear">' +
      '<div class="ga-view-label">Bear Case</div>' +
      '<div class="rs-text">' + bear + '</div>' +
    '</div>' +
  '</div>';

  // ---- Cost Structure (3x2 grid) ----
  const goldPrice = (km.gold_price_assumption_usd_per_oz || 2900);
  const aiscUsd = km.aisc_per_oz_usd || aisc;
  const margin = (aiscUsd && goldPrice) ? Math.round((goldPrice - aiscUsd) / goldPrice * 100) : null;

  const costItems = [
    ['AISC (per oz)', aisc != null ? ('A$' + aisc.toLocaleString()) : 'N/A'],
    ['Cash Cost (per oz)', km.cash_cost_per_oz_usd != null ? ('US$' + km.cash_cost_per_oz_usd.toLocaleString()) : 'N/A'],
    ['Production', km.production_koz_annual ? (km.production_koz_annual.toLocaleString() + ' koz/yr') : 'N/A'],
    ['Mine Life', km.mine_life_years ? (km.mine_life_years + ' years') : 'N/A'],
    ['Reserve Grade', km.reserve_grade_gt ? (km.reserve_grade_gt + ' g/t') : 'N/A'],
    ['Net Cash / (Debt)', netCash != null ? ('A$' + netCash.toLocaleString() + 'm') : 'N/A']
  ];

  let costGrid = '';
  for (let c = 0; c < costItems.length; c++) {
    costGrid += '<div class="ga-cost-cell">' +
      '<div class="ga-cost-label">' + costItems[c][0] + '</div>' +
      '<div class="ga-cost-value">' + costItems[c][1] + '</div>' +
    '</div>';
  }

  const marginHtml = margin != null
    ? '<div class="ga-margin-bar">' +
        '<span class="ga-margin-label">Margin at spot:</span> ' +
        '<span class="ga-margin-value" style="color:' + (margin > 30 ? 'var(--signal-green)' : margin > 15 ? 'var(--signal-amber)' : 'var(--signal-red)') + '">' + margin + '%</span>' +
      '</div>'
    : '';

  const metricsHtml = '<div class="ga-sub-panel">' +
    '<div class="rs-subtitle">Cost Structure</div>' +
    marginHtml +
    '<div class="ga-cost-grid">' + costGrid + '</div>' +
  '</div>';

  // ---- Evidence ----
  let evidenceRows = '';
  const ev = ga.evidence || [];
  for (let e = 0; e < ev.length; e++) {
    const item = ev[e];
    evidenceRows += '<tr>' +
      '<td class="ga-ev-label">' + item.label + '</td>' +
      '<td class="ga-ev-finding">' + item.finding + '</td>' +
      '<td class="ga-ev-source">' + item.source + '</td>' +
    '</tr>';
  }
  const evidenceHtml = '<div class="rs-subtitle">Evidence Base</div>' +
    '<div class="ga-evidence-scroll">' +
    '<table class="ga-evidence-table"><thead><tr>' +
      '<th>Label</th><th>Finding</th><th>Source</th>' +
    '</tr></thead><tbody>' + evidenceRows + '</tbody></table>' +
    '</div>';

  // ---- Monitoring Trigger ----
  let triggerHtml = '';
  if (trigger) {
    triggerHtml = '<div class="ga-trigger">' +
      '<div class="rs-subtitle">Monitoring Trigger</div>' +
      '<div class="rs-text">' + trigger + '</div>' +
    '</div>';
  }

  // ---- Information Gaps ----
  let gapsHtml = '';
  const gaps = ga.information_gaps || [];
  if (gaps.length > 0) {
    let gapItems = '';
    for (let g = 0; g < gaps.length; g++) {
      gapItems += '<li class="ga-gap-item">' + gaps[g] + '</li>';
    }
    gapsHtml = '<div class="ga-gaps">' +
      '<div class="rs-subtitle">Information Gaps</div>' +
      '<ul class="ga-gap-list">' + gapItems + '</ul>' +
    '</div>';
  }

  // ---- Analysis date ----
  const dateHtml = '<div class="ga-date">Analysis date: ' + ga.analysis_date + '</div>';

  return '<div class="report-section" id="' + t + '-gold-analysis">' +
    RS_HDR('Section 02 / Gold', 'Gold Analysis') +
    '<div class="rs-body">' +
      scorecardHtml +
      verdictHtml +
      viewHtml +
      _renderGoldAssets(ga) +
      metricsHtml +
      _renderGoldValuation(ga) +
      _renderGoldPeers(ga) +
      _renderGoldSensitivities(ga) +
      evidenceHtml +
      triggerHtml +
      gapsHtml +
      dateHtml +
    '</div></div>';
}



// ---------------------------------------------------------------------------
// Section 11: Gold Analysis (embedded research JSON)
// ---------------------------------------------------------------------------

export function renderGoldSection(data) {
  if (!data.goldAnalysis) return '';
  const t = data.ticker.toLowerCase();
  const ga = data.goldAnalysis;

  // Executive summary
  let execHtml = '';
  if (ga.executive_summary) {
    execHtml =
      '<div class="rs-subtitle">Executive Summary</div>' +
      '<div class="rs-text">' + ga.executive_summary + '</div>';
  }

  // Investment view: bull/base/bear scenario table
  let viewHtml = '';
  const iv = ga.investment_view;
  if (iv) {
    viewHtml =
      '<div class="rs-subtitle">Investment View</div>' +
      '<table class="identity-table">' +
        '<thead><tr><th>Scenario</th><th>Thesis</th></tr></thead>' +
        '<tbody>' +
          (iv.bull_case ? '<tr><td class="td-label">Bull</td><td>' + iv.bull_case + '</td></tr>' : '') +
          (iv.base_case ? '<tr><td class="td-label">Base</td><td>' + iv.base_case + '</td></tr>' : '') +
          (iv.bear_case ? '<tr><td class="td-label">Bear</td><td>' + iv.bear_case + '</td></tr>' : '') +
        '</tbody>' +
      '</table>';
    if (iv.monitoring_trigger) {
      viewHtml += '<div class="callout"><div class="callout-label">Monitoring Trigger</div><div class="rs-text">' + iv.monitoring_trigger + '</div></div>';
    }
  }

  // Key metrics
  let metricsHtml = '';
  const km = ga.key_metrics;
  if (km) {
    let metricRows = '';
    const metricPairs = [
      ['AISC (per oz)', km.aisc_per_oz != null ? ('A$' + km.aisc_per_oz.toLocaleString()) : null],
      ['Production', km.production_koz_annual ? (km.production_koz_annual.toLocaleString() + ' koz/yr') : null],
      ['Reserve Grade', km.reserve_grade_gt ? (km.reserve_grade_gt + ' g/t') : null],
      ['Mine Life', km.mine_life_years ? (km.mine_life_years + ' years') : null],
      ['Net Cash / (Debt)', km.net_cash_debt_aud_m != null ? ('A$' + km.net_cash_debt_aud_m.toLocaleString() + 'm') : null],
      ['Gold Price Assumption', km.gold_price_assumption_usd_per_oz ? ('US$' + km.gold_price_assumption_usd_per_oz.toLocaleString()) : null]
    ];
    for (var i = 0; i < metricPairs.length; i++) {
      if (metricPairs[i][1] != null) {
        metricRows += '<tr><td class="td-label">' + metricPairs[i][0] + '</td><td>' + metricPairs[i][1] + '</td></tr>';
      }
    }
    if (metricRows) {
      metricsHtml =
        '<div class="rs-subtitle">Key Metrics</div>' +
        '<table class="identity-table"><thead><tr><th>Metric</th><th>Value</th></tr></thead>' +
        '<tbody>' + metricRows + '</tbody></table>';
    }
  }

  // Assets table
  let assetsHtml = '';
  const assets = ga.assets;
  if (assets && assets.length > 0) {
    let assetRows = '';
    for (var i = 0; i < assets.length; i++) {
      const a = assets[i];
      assetRows += '<tr>' +
        '<td>' + (a.name || 'N/A') + '</td>' +
        '<td>' + (a.stage || 'N/A') + '</td>' +
        '<td>' + (a.annual_production_koz != null ? a.annual_production_koz + ' koz' : 'N/A') + '</td>' +
        '<td>' + (a.reserve_grade_gt != null ? a.reserve_grade_gt + ' g/t' : 'N/A') + '</td>' +
        '<td>' + (a.aisc_per_oz_usd != null ? 'US$' + a.aisc_per_oz_usd.toLocaleString() : 'N/A') + '</td>' +
      '</tr>';
    }
    assetsHtml =
      '<div class="rs-subtitle">Asset Portfolio</div>' +
      '<div class="ga-evidence-scroll">' +
      '<table class="ga-metrics-table ga-assets-table"><thead><tr>' +
        '<th>Asset</th><th>Stage</th><th>Production</th><th>Grade</th><th>AISC</th>' +
      '</tr></thead><tbody>' + assetRows + '</tbody></table></div>';
  }

  // Quality scorecard
  let scorecardHtml = '';
  const sc = ga.quality_scorecard || ga.scorecard;
  if (sc) {
    let scItems = '';
    const scKeys = Object.keys(sc);
    for (var i = 0; i < scKeys.length; i++) {
      const key = scKeys[i];
      const val = sc[key];
      if (typeof val === 'object') continue;
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
      scItems += '<tr><td class="td-label">' + label + '</td><td>' + val + '</td></tr>';
    }
    if (scItems) {
      scorecardHtml =
        '<div class="rs-subtitle">Quality Scorecard</div>' +
        '<table class="identity-table"><thead><tr><th>Criterion</th><th>Rating</th></tr></thead>' +
        '<tbody>' + scItems + '</tbody></table>';
    }
  }

  // Risks
  let risksHtml = '';
  const risks = ga.risks || [];
  if (risks.length > 0) {
    let riskItems = '';
    for (var i = 0; i < risks.length; i++) {
      riskItems += '<li>' + risks[i] + '</li>';
    }
    risksHtml =
      '<div class="rs-subtitle">Key Risks</div>' +
      '<ul class="hc-list contradicts">' + riskItems + '</ul>';
  }

  // Recommendation
  let recoHtml = '';
  if (ga.recommendation) {
    recoHtml =
      '<div class="callout">' +
        '<div class="callout-label">Recommendation</div>' +
        '<div class="rs-text">' + ga.recommendation + '</div>' +
      '</div>';
  }

  return '<div class="report-section" id="' + t + '-gold-section">' +
    RS_HDR('Section 11', 'Gold Analysis') +
    '<div class="rs-body">' +
      execHtml +
      viewHtml +
      metricsHtml +
      assetsHtml +
      scorecardHtml +
      risksHtml +
      recoHtml +
    '</div></div>';
}

