// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We need to mock MarketFeed before importing ws-live-price.js
// because the module calls MarketFeed.addPriceListener at import time.
// We do this via vi.mock.

vi.mock('../../services/market-feed.js', () => {
  const listeners = [];
  return {
    MarketFeed: {
      addPriceListener: vi.fn((fn) => { listeners.push(fn); }),
      removePriceListener: vi.fn((fn) => {
        const idx = listeners.indexOf(fn);
        if (idx >= 0) listeners.splice(idx, 1);
      }),
      _getListeners: () => listeners
    }
  };
});

// Mock state
vi.mock('../../lib/state.js', () => ({
  getWorkstation: vi.fn()
}));

import { initWorkstationLivePrice, destroyWorkstationLivePrice, _testTriggerPriceUpdate } from './ws-live-price.js';
import { MarketFeed } from '../../services/market-feed.js';
import { getWorkstation } from '../../lib/state.js';

const bhpData = {
  decision_strip: { spot_price: { value: 52.56, currency: 'A$' } },
  scenarios: [
    { probability: 0.25, target_price: 63 },
    { probability: 0.45, target_price: 56 },
    { probability: 0.20, target_price: 44 },
    { probability: 0.10, target_price: 68 }
  ]
};

describe('initWorkstationLivePrice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    destroyWorkstationLivePrice();
  });

  it('registers a listener with MarketFeed', () => {
    initWorkstationLivePrice('BHP');
    expect(MarketFeed.addPriceListener).toHaveBeenCalledTimes(1);
  });

  it('registers exactly one listener even when called twice', () => {
    initWorkstationLivePrice('BHP');
    initWorkstationLivePrice('BHP');
    // Second call removes first, then adds new one
    expect(MarketFeed.removePriceListener).toHaveBeenCalledTimes(1);
    expect(MarketFeed.addPriceListener).toHaveBeenCalledTimes(2);
  });
});

describe('destroyWorkstationLivePrice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes the registered listener', () => {
    initWorkstationLivePrice('BHP');
    destroyWorkstationLivePrice();
    expect(MarketFeed.removePriceListener).toHaveBeenCalledTimes(1);
  });

  it('is safe to call when no listener is registered', () => {
    expect(() => destroyWorkstationLivePrice()).not.toThrow();
  });
});

describe('price callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    destroyWorkstationLivePrice();
    // Set up a fake workstation page in the DOM
    document.body.innerHTML = `
      <div id="page-workstation-BHP" class="page active">
        <div class="ws-strip-cell--spot">
          <div class="ws-strip-cell__value" data-ws-spot="52.56">A$52.56</div>
        </div>
        <div class="ws-strip-cell--ewp">
          <div class="ws-strip-cell__ewp-vs-spot" data-ws-ewp-pct="7.6">+7.6% vs spot</div>
        </div>
      </div>
    `;
    getWorkstation.mockReturnValue(bhpData);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('is a no-op when ticker does not match', () => {
    initWorkstationLivePrice('BHP');
    _testTriggerPriceUpdate('CBA', 99.00);
    const spotEl = document.querySelector('[data-ws-spot]');
    expect(spotEl.textContent).toBe('A$52.56'); // unchanged
  });

  it('is a no-op when workstation page is not active', () => {
    // Remove 'active' class
    document.getElementById('page-workstation-BHP').classList.remove('active');
    initWorkstationLivePrice('BHP');
    _testTriggerPriceUpdate('BHP', 55.00);
    const spotEl = document.querySelector('[data-ws-spot]');
    expect(spotEl.textContent).toBe('A$52.56'); // unchanged
  });

  it('patches spot price when workstation is active and ticker matches', () => {
    initWorkstationLivePrice('BHP');
    _testTriggerPriceUpdate('BHP', 54.00);
    const spotEl = document.querySelector('[data-ws-spot]');
    expect(spotEl.textContent).toBe('A$54.00');
  });

  it('recalculates EWP-vs-spot percentage on price update', () => {
    initWorkstationLivePrice('BHP');
    // EWP = 0.25*63 + 0.45*56 + 0.20*44 + 0.10*68 = 56.55
    // New spot = 54.00, EWP-vs-spot = (56.55 - 54.00) / 54.00 * 100 = +4.7%
    _testTriggerPriceUpdate('BHP', 54.00);
    const ewpPctEl = document.querySelector('[data-ws-ewp-pct]');
    expect(ewpPctEl.textContent).toContain('vs spot');
    expect(ewpPctEl.textContent).toContain('+');
  });

  it('updates data-ws-ewp-pct attribute', () => {
    initWorkstationLivePrice('BHP');
    _testTriggerPriceUpdate('BHP', 54.00);
    const ewpPctEl = document.querySelector('[data-ws-ewp-pct]');
    const pct = parseFloat(ewpPctEl.dataset.wsEwpPct);
    expect(pct).toBeCloseTo(4.7, 0);
  });
});
