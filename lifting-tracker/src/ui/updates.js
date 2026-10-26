// A waiting worker only takes over after the user chooses to apply it.
export const APP_VERSION = 'lt-v14';

export function createUpdates({ serviceWorker, online = () => true, reload = () => {}, onChange = () => {}, enabled = true } = {}) {
  let registration, requested = false, needsReload = false, controlled = !!serviceWorker?.controller;
  const state = { version: APP_VERSION, status: !enabled ? 'development' : !serviceWorker ? 'unsupported' : 'checking' };
  const status = (value) => { state.status = value; onChange(); };
  const inspect = () => status(needsReload ? 'reload' : registration?.waiting ? 'available' : !online() ? 'offline' : registration?.installing ? 'checking' : 'current');
  const watch = (worker) => {
    let installed = false;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed') { installed = true; inspect(); }
      else if (worker.state === 'redundant' && !installed) status('error');
    });
  };
  state.check = async () => {
    if (!enabled || !serviceWorker) return;
    status('checking');
    try {
      if (!registration) {
        registration = await serviceWorker.register('sw.js');
        registration.addEventListener('updatefound', () => { status('checking'); watch(registration.installing); });
        watch(registration.installing);
      } else await registration.update();
      inspect();
    } catch { status(online() ? 'error' : 'offline'); }
  };
  state.apply = () => {
    if (needsReload) { reload(); return; }
    if (!registration?.waiting) return;
    requested = true;
    registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' });
  };
  if (enabled && serviceWorker) serviceWorker.addEventListener('controllerchange', () => {
    if (requested) { requested = false; reload(); }
    else { needsReload = controlled; controlled = true; inspect(); }
  });
  return state;
}
