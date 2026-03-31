/**
 * Boot readiness registry (BEAD-009).
 *
 * Each subsystem registers itself with optional dependencies.
 * Downstream consumers can await readiness via waitFor().
 * Dev mode logs each subsystem state transition.
 *
 * Usage in main.js:
 *   initSubsystem('Auth', initAuth, { critical: true });
 *   initSubsystem('Portfolio', initPortfolioPage, { after: ['Auth'] });
 *
 * Usage in consumer modules:
 *   import { waitFor } from './lib/boot.js';
 *   waitFor('Auth').then(() => { ... });
 */

var _registry = {};
var _waiters = {};
var _DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

/**
 * Register a subsystem in the boot registry.
 * @param {string} name
 * @param {{ critical?: boolean, after?: string[] }} options
 */
function registerSubsystem(name, options) {
  var opts = options || {};
  _registry[name] = {
    critical: opts.critical || false,
    after: opts.after || [],
    status: 'pending',
    error: null
  };
}

/**
 * Mark a subsystem as ready. Resolves any pending waitFor() promises
 * and dispatches a ci:boot:ready CustomEvent.
 * @param {string} name
 */
function markReady(name) {
  var entry = _registry[name];
  if (entry) {
    entry.status = 'ready';
  }
  if (_waiters[name]) {
    _waiters[name].resolve();
  }
  if (_DEV) {
    console.log('[Boot] ' + name + ': READY');
  }
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent('ci:boot:ready', { detail: { subsystem: name } })
    );
  }
}

/**
 * Mark a subsystem as failed. Rejects any pending waitFor() promises.
 * @param {string} name
 * @param {Error} error
 */
function markFailed(name, error) {
  var entry = _registry[name];
  if (entry) {
    entry.status = 'failed';
    entry.error = error;
  }
  if (_waiters[name]) {
    _waiters[name].reject(error);
  }
  if (_DEV) {
    console.error('[Boot] ' + name + ': FAILED', error);
  }
}

/**
 * Wait for a subsystem to become ready.
 * Returns a Promise that resolves when the subsystem is ready,
 * or rejects if the subsystem has already failed.
 * @param {string} name
 * @returns {Promise<void>}
 */
function waitFor(name) {
  var entry = _registry[name];
  if (entry && entry.status === 'ready') {
    return Promise.resolve();
  }
  if (entry && entry.status === 'failed') {
    return Promise.reject(entry.error);
  }

  if (!_waiters[name]) {
    var resolve, reject;
    var promise = new Promise(function (res, rej) {
      resolve = res;
      reject = rej;
    });
    _waiters[name] = { promise: promise, resolve: resolve, reject: reject };
  }
  return _waiters[name].promise;
}

/**
 * Check that all declared dependencies are ready.
 * @param {string} name
 * @returns {boolean}
 */
function checkDependencies(name) {
  var entry = _registry[name];
  if (!entry) return true;

  for (var i = 0; i < entry.after.length; i++) {
    var dep = entry.after[i];
    var depEntry = _registry[dep];
    if (!depEntry || depEntry.status !== 'ready') {
      console.error(
        '[Boot] ' + name + ' requires ' + dep +
        ' but it is ' + (depEntry ? depEntry.status : 'not registered')
      );
      return false;
    }
  }
  return true;
}

/**
 * Register and initialise a subsystem in one call.
 * Wraps the init function in try/catch, checks dependencies,
 * and tracks readiness state.
 *
 * @param {string} name
 * @param {Function} initFn -- the init function to call
 * @param {{ critical?: boolean, after?: string[] }} options
 */
function initSubsystem(name, initFn, options) {
  registerSubsystem(name, options);

  var opts = options || {};
  if (opts.after && opts.after.length > 0) {
    if (!checkDependencies(name)) {
      var depError = new Error(
        name + ': dependency not ready (' + opts.after.join(', ') + ')'
      );
      markFailed(name, depError);
      console.error('[Boot] init' + name + ' skipped: dependency not ready');
      return;
    }
  }

  try {
    initFn();
    markReady(name);
  } catch (error) {
    markFailed(name, error);
    console.error('[Boot] init' + name + ' failed:', error);
  }
}

/**
 * Return current boot status for all registered subsystems.
 * @returns {Object}
 */
function getBootStatus() {
  var status = {};
  var names = Object.keys(_registry);
  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var entry = _registry[name];
    status[name] = {
      status: entry.status,
      critical: entry.critical,
      error: entry.error ? entry.error.message : null
    };
  }
  return status;
}

/**
 * Reset the registry (for testing only).
 */
function _resetForTesting() {
  _registry = {};
  _waiters = {};
}

export {
  registerSubsystem,
  markReady,
  markFailed,
  waitFor,
  checkDependencies,
  initSubsystem,
  getBootStatus,
  _resetForTesting
};
