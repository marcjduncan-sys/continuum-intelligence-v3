/**
 * Service Worker — Continuum Intelligence V2
 *
 * Cache-first strategy for static assets (CSS, fonts, images).
 * Network-first for research data (to get fresh data when online).
 * Stale-while-revalidate for the main HTML shell.
 */

const CACHE_NAME = 'continuum-v2.3.0';
const RESEARCH_CACHE = 'continuum-research-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/personalisation.css',
  './css/narrative.css',
  './css/fonts.css',
  './fonts/inter-latin.woff2',
  './fonts/source-serif-4-latin.woff2',
  './fonts/jetbrains-mono-latin.woff2',
  './data/research/_index.json',
  './data/config/tickers.json'
];

// Install — pre-cache critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RESEARCH_CACHE)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch — routing strategy based on request type
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip cross-origin requests (CDNs, APIs)
  if (url.origin !== self.location.origin) return;

  // Research data files: network-first (fresh data preferred)
  if (url.pathname.includes('/data/research/') && url.pathname.endsWith('.json')) {
    event.respondWith(networkFirst(event.request, RESEARCH_CACHE));
    return;
  }

  // Live market data endpoint: network-only (never cache)
  if (url.pathname.includes('/data/prices/') || url.pathname.includes('yahoo')) {
    return; // Let browser handle normally
  }

  // Vite dev server paths: network-only (never cache dev modules)
  if (url.pathname.startsWith('/src/') || url.pathname.startsWith('/@vite/') || url.pathname.startsWith('/@fs/') || url.pathname.startsWith('/node_modules/')) {
    return;
  }

  // Static assets (CSS, JS scripts, fonts, images): cache-first
  if (url.pathname.match(/\.(css|js|woff2?|ttf|png|svg|ico|jpg|jpeg|webp)$/)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // HTML pages: stale-while-revalidate
  event.respondWith(staleWhileRevalidate(event.request));
});

// Cache-first: serve from cache, fallback to network
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Network-first: try network, fallback to cache
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

// Stale-while-revalidate: serve cache immediately, update in background
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || new Response('Offline', { status: 503 });
}
