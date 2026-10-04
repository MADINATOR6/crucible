// Offline cache. Cache-first for the app shell and data catalogues; bump VERSION when files change.
// Only same-origin GET requests are handled; nothing is ever sent to another site.
const VERSION = 'lt-v1';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'styles/app.css',
  'data/exercises.json', 'data/plates.json',
  'src/ui/app.js', 'src/ui/state.js', 'src/ui/dom.js', 'src/ui/charts.js', 'src/ui/heatmap.js', 'src/ui/barbell.js', 'src/ui/example-data.js', 'src/ui/rest-timer.js',
  'src/ui/views/train.js', 'src/ui/views/muscles.js', 'src/ui/views/progress.js', 'src/ui/views/plates.js', 'src/ui/views/data.js', 'src/ui/views/meet.js',
  'src/core/units.js', 'src/core/e1rm.js', 'src/core/sets.js', 'src/core/prs.js', 'src/core/weeks.js', 'src/core/muscles.js', 'src/core/schedule.js', 'src/core/lifts.js', 'src/core/rpe.js', 'src/core/attempts.js',
  'src/plates/loading.js', 'src/import/xlsx.js', 'src/import/programme.js', 'src/store/db.js', 'src/store/backup.js', 'src/store/programme-schema.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match('index.html'))));
});
