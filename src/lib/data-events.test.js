import { describe, it, expect, vi, beforeEach } from 'vitest';

// Fresh module per test to avoid cross-test listener leakage
let on, off, emit;
beforeEach(async () => {
  // Re-import fresh module each time
  vi.resetModules();
  const mod = await import('./data-events.js');
  on = mod.on;
  off = mod.off;
  emit = mod.emit;
});

describe('data-events', () => {
  it('calls listener when event is emitted', () => {
    const fn = vi.fn();
    on('test:a', fn);
    emit('test:a', { ticker: 'WOW' });
    expect(fn).toHaveBeenCalledWith({ ticker: 'WOW' });
  });

  it('supports multiple listeners for the same event', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    on('test:b', fn1);
    on('test:b', fn2);
    emit('test:b', { x: 1 });
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it('does not throw when emitting to no listeners', () => {
    expect(() => emit('test:none', {})).not.toThrow();
  });

  it('removes listener with off()', () => {
    const fn = vi.fn();
    on('test:c', fn);
    off('test:c', fn);
    emit('test:c', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it('catches listener errors without breaking other listeners', () => {
    const fn1 = vi.fn(() => { throw new Error('boom'); });
    const fn2 = vi.fn();
    on('test:d', fn1);
    on('test:d', fn2);
    emit('test:d', {});
    expect(fn1).toHaveBeenCalled();
    expect(fn2).toHaveBeenCalled();
  });
});
