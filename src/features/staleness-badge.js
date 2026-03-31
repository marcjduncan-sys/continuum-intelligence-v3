// staleness-badge.js -- BEAD-005
// Displays a staleness indicator on the report hero when macro drivers
// have moved materially since the narrative was generated.
// Reads _generation_meta from research data, fetches current macro state
// from GET /api/macro/state, computes percentage deviation.

import { API_BASE } from '../lib/api-config.js';
import { formatPrice, formatPercent } from '../lib/format.js';

const _DRIVER_LABELS = {
  brent_crude: 'Brent Crude',
  natural_gas: 'Natural Gas',
  gold: 'Gold',
  copper: 'Copper',
  iron_ore: 'Iron Ore',
};

let _macroStateCache = null;
let _macroStateFetchedAt = 0;
const _CACHE_TTL_MS = 5 * 60 * 1000;


function _fetchMacroState() {
  const now = Date.now();
  if (_macroStateCache && (now - _macroStateFetchedAt) < _CACHE_TTL_MS) {
    return Promise.resolve(_macroStateCache);
  }
  return fetch(API_BASE + '/api/macro/state')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.variables) {
        _macroStateCache = data.variables;
        _macroStateFetchedAt = Date.now();
      }
      return data.variables || {};
    })
    .catch(function () { return {}; });
}


function _findCurrentPrice(macroState, driverKey, driverTicker) {
  // Try matching by Yahoo ticker symbol in macro_prices (FX/commodities)
  // Then try matching by series_id in macro_series (FRED/EIA/RBA)
  const symbolMap = {
    brent_crude: 'BRENT_SPOT',
    gold: 'GOLD',
    copper: 'COPPER',
    iron_ore: 'IRON_ORE',
    natural_gas: null,
  };

  const seriesId = symbolMap[driverKey];
  if (seriesId && macroState[seriesId]) {
    return macroState[seriesId].current;
  }

  // Gold: try XAU/USD from macro_prices as fallback
  if (driverKey === 'gold' && macroState['XAU/USD']) {
    return macroState['XAU/USD'].current;
  }

  // Fallback: iterate looking for a matching symbol or key
  for (const key in macroState) {
    if (key.toLowerCase().indexOf(driverKey.replace(/_/g, '')) >= 0) {
      return macroState[key].current;
    }
  }
  return null;
}


function computeStaleness(generationMeta, macroState) {
  if (!generationMeta || !generationMeta.drivers) return null;

  const drivers = generationMeta.drivers;
  let worst = null;

  for (const key in drivers) {
    const genDriver = drivers[key];
    if (!genDriver || genDriver.value == null) continue;

    const currentPrice = _findCurrentPrice(macroState, key, genDriver.ticker);
    if (currentPrice == null) continue;

    const genValue = parseFloat(genDriver.value);
    if (genValue === 0) continue;

    const pctChange = ((currentPrice - genValue) / Math.abs(genValue)) * 100;
    const absPct = Math.abs(pctChange);

    if (absPct >= 15 && (!worst || absPct > Math.abs(worst.pctChange))) {
      worst = {
        key: key,
        label: _DRIVER_LABELS[key] || key.replace(/_/g, ' '),
        genValue: genValue,
        currentValue: currentPrice,
        pctChange: pctChange,
        absPct: absPct,
      };
    }
  }

  return worst;
}


function renderBadge(staleness) {
  if (!staleness) return '';

  const level = staleness.absPct >= 30 ? 'staleness-red' : 'staleness-amber';
  const sign = staleness.pctChange >= 0 ? '+' : '';
  const genDisplay = formatPrice(staleness.genValue);
  const curDisplay = formatPrice(staleness.currentValue);

  return '<span class="staleness-badge ' + level + '" title="This analysis may not reflect current market conditions">' +
    '<span class="staleness-icon">&#9888;</span> ' +
    staleness.label + ' was ' + genDisplay + ' at generation. Now ' + curDisplay +
    ' (' + sign + formatPercent(staleness.pctChange) + ')' +
  '</span>';
}


export function initStalenessBadge(ticker, data) {
  if (!data || !data._generation_meta) return;

  const containerId = 'staleness-mount-' + ticker.toLowerCase();
  const mount = document.getElementById(containerId);
  if (!mount) return;

  _fetchMacroState().then(function (macroState) {
    const staleness = computeStaleness(data._generation_meta, macroState);
    if (staleness) {
      mount.innerHTML = renderBadge(staleness);
    }
  });
}

export { computeStaleness, renderBadge };
