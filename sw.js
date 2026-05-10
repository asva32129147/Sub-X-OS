// sw.js — Sub-X OS service worker — VERSION: v16
const CACHE = 'subx-v16';

const ASSETS = [
  './', './index.html', './trainer.html', './manifest.json',
  './base.css', './timer.css', './panels.css', './modals.css', './alg-trainer.css',
  './utils.js', './storage.js', './scramble.js', './timer.js',
  './sessions.js', './stats.js', './settings.js',
  './alg-data.js', './alg-trainer.js',
  './solve-summary.js', './smartcube.js', './gyro.js',
  './session-manager.js', './universal-import.js',
  './time-attack.js', './cloud-sync.js', './auth-ui.js',
  './app.js',
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  // Don't cache Supabase API calls
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
