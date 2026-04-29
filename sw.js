// sw.js — Sub-X OS service worker
// VERSION: v6 — bumped to force full cache clear on all clients
const CACHE = 'subx-v6';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './base.css',
  './timer.css',
  './panels.css',
  './modals.css',
  './alg-trainer.css',
  './utils.js',
  './storage.js',
  './scramble.js',
  './timer.js',
  './sessions.js',
  './stats.js',
  './settings.js',
  './alg-data.js',
  './alg-trainer.js',
  './trainer.html',
  './app.js',
];

// Install: cache all assets
self.addEventListener('install', e => {
  // skipWaiting forces the new SW to activate immediately
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
});

// Activate: delete ALL old caches (subx-v1, subx-v2, etc.)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim()) // take control of all open pages immediately
  );
});

// Fetch: serve from cache, fall back to network
self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request)
      .then(cached => cached || fetch(e.request))
  );
});
