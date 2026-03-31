/**
 * Portfolio state machine (BEAD-018).
 *
 * Formalises all valid states and transitions for the portfolio subsystem.
 * Consumers subscribe via onStateChange() instead of polling or reading
 * implicit DOM state. Invalid transitions throw with a clear message.
 */

const STATES = Object.freeze({
  EMPTY: 'EMPTY',
  LOADING: 'LOADING',
  READY: 'READY',
  EDITING: 'EDITING',
  SYNCING: 'SYNCING',
  ERROR: 'ERROR',
});

const TRANSITIONS = Object.freeze({
  [STATES.EMPTY]:   [STATES.LOADING],
  [STATES.LOADING]: [STATES.READY, STATES.ERROR, STATES.EMPTY],
  [STATES.READY]:   [STATES.EDITING, STATES.LOADING, STATES.SYNCING, STATES.EMPTY],
  [STATES.EDITING]: [STATES.SYNCING, STATES.READY],
  [STATES.SYNCING]: [STATES.READY, STATES.ERROR],
  [STATES.ERROR]:   [STATES.LOADING, STATES.EMPTY],
});

const _DEV = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const _listeners = new Set();

let _currentState = STATES.EMPTY;

function getState() {
  return _currentState;
}

function transition(newState) {
  const allowed = TRANSITIONS[_currentState];
  if (!allowed || !allowed.includes(newState)) {
    const msg = 'Invalid portfolio transition: ' + _currentState +
      ' -> ' + newState + '. Allowed: ' + (allowed ? allowed.join(', ') : 'none');
    console.error('[Portfolio State] ' + msg);
    throw new Error(msg);
  }

  const prev = _currentState;
  _currentState = newState;

  if (_DEV) {
    console.log('[Portfolio State] ' + prev + ' -> ' + newState);
  }

  _listeners.forEach(function(fn) {
    try { fn(newState, prev); } catch (e) { console.error('[Portfolio State] listener error:', e); }
  });
}

function onStateChange(fn) {
  _listeners.add(fn);
  return function() { _listeners.delete(fn); };
}

function resetForTesting() {
  _currentState = STATES.EMPTY;
  _listeners.clear();
}

export { STATES, getState, transition, onStateChange, resetForTesting };
