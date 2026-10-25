// Offline cache. Cache-first for the app shell and data catalogues; bump VERSION when files change.
// Only same-origin GET requests are handled; nothing is ever sent to another site.
// The 3D library (vendor/three) and body model (assets/body.glb), about 3.3 MB, are not installed up front: the fetch
// handler caches them the first time a 3D view opens, and they work offline from then on.
const VERSION = 'lt-v11';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-192.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'styles/app.css',
  'data/exercises.json', 'data/plates.json',
  'src/ui/app.js', 'src/ui/state.js', 'src/ui/dom.js', 'src/ui/charts.js', 'src/ui/heatmap.js', 'src/ui/heatmap-body.js', 'assets/body-front.webp', 'assets/body-back.webp', 'src/ui/barbell.js', 'src/ui/example-data.js', 'src/ui/rest-timer.js',
  'src/ui/views/train.js', 'src/ui/views/muscles.js', 'src/ui/views/progress.js', 'src/ui/views/plates.js', 'src/ui/views/data.js', 'src/ui/views/meet.js', 'src/ui/views/plan.js',
  'src/core/units.js', 'src/core/e1rm.js', 'src/core/sets.js', 'src/core/prs.js', 'src/core/weeks.js', 'src/core/muscles.js', 'src/core/schedule.js', 'src/core/lifts.js', 'src/core/rpe.js', 'src/core/attempts.js', 'src/core/rpe-chart.js',
  'src/plates/loading.js', 'src/plates/tolerance.js', 'src/core/coach.js', 'src/core/request.js', 'src/core/generator.js', 'src/core/athlete.js', 'src/core/template.js', 'src/import/xlsx.js', 'src/import/programme.js', 'src/store/db.js', 'src/store/backup.js', 'src/store/programme-schema.js',
  'src/core/session.js', 'src/core/progress.js',
  'src/ui/heatmap3d.js', 'src/ui/barbell3d.js',
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
  // Offline and not cached: pages fall back to the app; anything else fails, so a missing 3D file rejects cleanly
  // (the view then shows the 2D map) instead of receiving index.html as JavaScript.
  }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
