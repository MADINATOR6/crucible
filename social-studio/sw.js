// Offline app shell. Caches only this app's own files; API calls (api.anthropic.com) and any
// other origin are never cached. Cleanup only touches caches with this app's prefix.
const VERSION = 'ss-v1';
const PREFIX = 'ss-';
const SHELL = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
  'src/app.js', 'src/ui.js', 'src/db.js', 'src/csv.js', 'src/importer.js', 'src/pipeline.js', 'src/scout.js', 'src/insights.js', 'src/sample.js',
  'src/views/setup.js', 'src/views/scout.js', 'src/views/plan.js', 'src/views/pipeline.js', 'src/views/results.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // never touch API calls
  // Network first so edits show up; fall back to the cached shell offline.
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
