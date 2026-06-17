// sw.js — Sub-X OS service worker — VERSION: v26
const CACHE = 'subx-v26';

const ASSETS = [
  './', './index.html', './manifest.json',
  './subx.css', './alg-trainer.css',
  './utils.js', './storage.js', './scramble.js', './timer.js',
  './sessions.js', './stats.js', './settings.js',
  './alg-data.js', './alg-trainer.js',
  './solve-summary.js', './smartcube.js', './gyro.js',
  './session-manager.js', './universal-import.js',
  './time-attack.js', './cloud-sync.js', './auth-ui.js',
  './virtual-cube.js', './scramble-draw.js',
  './stackmat.js', './app.js',
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
  if (e.request.url.includes('supabase.co') ||
      e.request.url.includes('bootstrap') ||
      e.request.url.includes('cdn.cubing') ||
      e.request.url.includes('fonts.googleapis') ||
      e.request.url.includes('jsdelivr')) return;
  e.respondWith(caches.match(e.request).then(c => c || fetch(e.request)));
});
