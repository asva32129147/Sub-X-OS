// sw.js — service worker, enables offline use
const CACHE = 'subx-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './base.css',
  './timer.css',
  './panels.css',
  './modals.css',
  './utils.js',
  './storage.js',
  './scramble.js',
  './timer.js',
  './sessions.js',
  './stats.js',
  './settings.js',
  './app.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
