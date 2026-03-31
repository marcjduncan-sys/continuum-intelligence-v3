// @vitest-environment jsdom
import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  registerSubsystem,
  markReady,
  markFailed,
  waitFor,
  checkDependencies,
  initSubsystem,
  getBootStatus,
  _resetForTesting
} from './boot.js';

beforeEach(() => {
  _resetForTesting();
});

describe('boot readiness', () => {
  test('markReady resolves pending waitFor', async () => {
    registerSubsystem('auth', { critical: true });
    const promise = waitFor('auth');
    markReady('auth');
    await expect(promise).resolves.toBeUndefined();
  });

  test('waitFor resolves immediately if subsystem already ready', async () => {
    registerSubsystem('auth');
    markReady('auth');
    await expect(waitFor('auth')).resolves.toBeUndefined();
  });

  test('markFailed rejects pending waitFor', async () => {
    registerSubsystem('auth');
    const promise = waitFor('auth');
    markFailed('auth', new Error('init failed'));
    await expect(promise).rejects.toThrow('init failed');
  });

  test('waitFor rejects immediately if subsystem already failed', async () => {
    registerSubsystem('auth');
    markFailed('auth', new Error('init failed'));
    await expect(waitFor('auth')).rejects.toThrow('init failed');
  });

  test('checkDependencies returns true when all deps ready', () => {
    registerSubsystem('auth');
    markReady('auth');
    registerSubsystem('portfolio', { after: ['auth'] });
    expect(checkDependencies('portfolio')).toBe(true);
  });

  test('checkDependencies returns false when dep not ready', () => {
    registerSubsystem('auth');
    registerSubsystem('portfolio', { after: ['auth'] });
    expect(checkDependencies('portfolio')).toBe(false);
  });

  test('initSubsystem marks subsystem ready on success', () => {
    const fn = vi.fn();
    initSubsystem('home', fn);
    const status = getBootStatus();
    expect(status.home.status).toBe('ready');
    expect(fn).toHaveBeenCalledOnce();
  });

  test('initSubsystem marks subsystem failed on error', () => {
    const fn = vi.fn(() => { throw new Error('broken'); });
    initSubsystem('chat', fn);
    const status = getBootStatus();
    expect(status.chat.status).toBe('failed');
    expect(status.chat.error).toBe('broken');
  });

  test('initSubsystem skips when dependency not ready', () => {
    registerSubsystem('auth');
    const fn = vi.fn();
    initSubsystem('portfolio', fn, { after: ['auth'] });
    expect(fn).not.toHaveBeenCalled();
    const status = getBootStatus();
    expect(status.portfolio.status).toBe('failed');
  });

  test('initSubsystem runs when dependency is ready', () => {
    registerSubsystem('auth');
    markReady('auth');
    const fn = vi.fn();
    initSubsystem('portfolio', fn, { after: ['auth'] });
    expect(fn).toHaveBeenCalledOnce();
    const status = getBootStatus();
    expect(status.portfolio.status).toBe('ready');
  });

  test('non-critical failure does not throw', () => {
    const fn = vi.fn(() => { throw new Error('non-critical'); });
    expect(() => initSubsystem('chat', fn)).not.toThrow();
    const status = getBootStatus();
    expect(status.chat.status).toBe('failed');
  });

  test('getBootStatus returns all registered subsystems', () => {
    registerSubsystem('auth', { critical: true });
    registerSubsystem('chat', { critical: false });
    markReady('auth');
    markFailed('chat', new Error('broken'));
    const status = getBootStatus();
    expect(status.auth).toEqual({ status: 'ready', critical: true, error: null });
    expect(status.chat).toEqual({ status: 'failed', critical: false, error: 'broken' });
  });

  test('ci:boot:ready event fires on markReady', () => {
    registerSubsystem('auth');
    const handler = vi.fn();
    document.addEventListener('ci:boot:ready', handler);
    markReady('auth');
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].detail.subsystem).toBe('auth');
    document.removeEventListener('ci:boot:ready', handler);
  });

  test('full boot sequence with dependency chain', () => {
    const order = [];
    initSubsystem('Auth', () => order.push('Auth'), { critical: true });
    initSubsystem('Home', () => order.push('Home'), { critical: true });
    initSubsystem('Portfolio', () => order.push('Portfolio'), { after: ['Auth'] });
    initSubsystem('PMChat', () => order.push('PMChat'), { after: ['Portfolio'] });
    initSubsystem('Chat', () => order.push('Chat'));
    expect(order).toEqual(['Auth', 'Home', 'Portfolio', 'PMChat', 'Chat']);
  });

  test('dependency chain breaks when upstream fails', () => {
    const order = [];
    const authFn = () => { throw new Error('auth broken'); };
    initSubsystem('Auth', authFn, { critical: true });
    initSubsystem('Portfolio', () => order.push('Portfolio'), { after: ['Auth'] });
    initSubsystem('PMChat', () => order.push('PMChat'), { after: ['Portfolio'] });
    expect(order).toEqual([]);
    const status = getBootStatus();
    expect(status.Auth.status).toBe('failed');
    expect(status.Portfolio.status).toBe('failed');
    expect(status.PMChat.status).toBe('failed');
  });
});
