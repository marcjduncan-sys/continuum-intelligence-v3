// data-events.js — Lightweight event bus for STOCK_DATA change propagation
// Parent/dependant pattern: hydrate() emits, page modules listen.

/** @type {{ [event: string]: Function[] }} */
var _listeners = {};

/**
 * Subscribe to an event.
 * @param {string} event
 * @param {Function} fn
 */
export function on(event, fn) {
  (_listeners[event] = _listeners[event] || []).push(fn);
}

/**
 * Unsubscribe from an event.
 * @param {string} event
 * @param {Function} fn
 */
export function off(event, fn) {
  var arr = _listeners[event];
  if (arr) _listeners[event] = arr.filter(function(f) { return f !== fn; });
}

/**
 * Emit an event to all subscribers.
 * @param {string} event
 * @param {*} data
 */
export function emit(event, data) {
  var arr = _listeners[event];
  if (arr) {
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](data); } catch (e) { console.warn('[DataEvents]', e); }
    }
  }
}
