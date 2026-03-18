/**
 * Service Worker — Continuum Intelligence V3
 *
 * Self-clearing: removes all caches and unregisters itself.
 * The previous caching SW caused stale asset issues after deploys
 * (cache-first JS served old bundle hashes deleted from server).
 *
 * Cache version: v2 (bump to force browser to re-download this file)
 */
const CACHE_VERSION = 'v2';

// Clear all caches on activate
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(key => caches.delete(key))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister())
  );
});
