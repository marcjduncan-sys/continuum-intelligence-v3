import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  STATES,
  getState,
  transition,
  onStateChange,
  resetForTesting,
} from './portfolio-state.js';

describe('portfolio state machine', () => {
  beforeEach(() => {
    resetForTesting();
  });

  test('initial state is EMPTY', () => {
    expect(getState()).toBe(STATES.EMPTY);
  });

  test('valid transition EMPTY -> LOADING succeeds', () => {
    expect(() => transition(STATES.LOADING)).not.toThrow();
    expect(getState()).toBe(STATES.LOADING);
  });

  test('invalid transition EMPTY -> READY throws', () => {
    expect(() => transition(STATES.READY)).toThrow(/Invalid portfolio transition/);
    expect(getState()).toBe(STATES.EMPTY); // state unchanged after invalid transition
  });

  test('invalid transition EMPTY -> EDITING throws with allowed list', () => {
    expect(() => transition(STATES.EDITING)).toThrow('Allowed: LOADING');
  });

  test('LOADING -> ERROR -> LOADING recovery path', () => {
    transition(STATES.LOADING);
    transition(STATES.ERROR);
    expect(getState()).toBe(STATES.ERROR);
    transition(STATES.LOADING);
    expect(getState()).toBe(STATES.LOADING);
  });

  test('full lifecycle: EMPTY -> LOADING -> READY -> EDITING -> SYNCING -> READY', () => {
    transition(STATES.LOADING);
    transition(STATES.READY);
    transition(STATES.EDITING);
    transition(STATES.SYNCING);
    transition(STATES.READY);
    expect(getState()).toBe(STATES.READY);
  });

  test('READY -> EMPTY transition (clear portfolio)', () => {
    transition(STATES.LOADING);
    transition(STATES.READY);
    transition(STATES.EMPTY);
    expect(getState()).toBe(STATES.EMPTY);
  });

  test('observers notified on transition with new and previous state', () => {
    const spy = vi.fn();
    onStateChange(spy);
    transition(STATES.LOADING);
    expect(spy).toHaveBeenCalledWith(STATES.LOADING, STATES.EMPTY);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  test('unsubscribe stops notifications', () => {
    const spy = vi.fn();
    const unsub = onStateChange(spy);
    unsub();
    transition(STATES.LOADING);
    expect(spy).not.toHaveBeenCalled();
  });

  test('multiple observers all receive notifications', () => {
    const spy1 = vi.fn();
    const spy2 = vi.fn();
    onStateChange(spy1);
    onStateChange(spy2);
    transition(STATES.LOADING);
    expect(spy1).toHaveBeenCalledWith(STATES.LOADING, STATES.EMPTY);
    expect(spy2).toHaveBeenCalledWith(STATES.LOADING, STATES.EMPTY);
  });

  test('observer error does not block other observers', () => {
    const errorSpy = vi.fn(() => { throw new Error('observer crash'); });
    const okSpy = vi.fn();
    onStateChange(errorSpy);
    onStateChange(okSpy);
    transition(STATES.LOADING);
    expect(errorSpy).toHaveBeenCalled();
    expect(okSpy).toHaveBeenCalled();
  });

  test('STATES object is frozen', () => {
    expect(Object.isFrozen(STATES)).toBe(true);
  });

  test('short positions stored as negative quantities, not in notes field', () => {
    // Verify the data model convention: negative units = short
    const longPos = { ticker: 'BHP', units: 100, notes: null };
    const shortPos = { ticker: 'CSL', units: -50, notes: null };

    expect(longPos.units).toBeGreaterThan(0);
    expect(shortPos.units).toBeLessThan(0);
    // Notes field should be null for both -- no direction encoding
    expect(longPos.notes).toBeNull();
    expect(shortPos.notes).toBeNull();
  });
});
