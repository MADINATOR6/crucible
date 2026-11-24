// IndexedDB wrapper. Stores: kv (settings, API key), findings (research log + trends + niches),
// items (content from idea to measured), posts (imported measurements), imports (file log), runs (scout log).
const DB = 'social-studio', VERSION = 1, STORES = ['findings', 'items', 'posts', 'imports', 'runs'];
let dbp;

function open() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Storage aborted (is the device full?)'));
  });
}

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const getKv = key => tx('kv', 'readonly', s => s.get(key));
export const setKv = (key, value) => tx('kv', 'readwrite', s => s.put(value, key));
export const all = store => tx(store, 'readonly', s => s.getAll()).then(r => r || []);
export const put = (store, obj) => tx(store, 'readwrite', s => s.put(obj)).then(() => obj);
export const del = (store, id) => tx(store, 'readwrite', s => s.delete(id));
export const clear = store => tx(store, 'readwrite', s => s.clear());

export async function exportAll() {
  const out = { app: 'social-studio', version: VERSION, exported: new Date().toISOString(), profile: await getKv('profile') };
  for (const s of STORES) out[s] = await all(s);
  return out; // API key deliberately not exported
}

const REQUIRED = { findings: ['id', 'kind', 'title'], items: ['id', 'title', 'stage', 'platform'], posts: ['id', 'platform', 'metrics'], imports: ['id', 'at', 'platform'], runs: ['id', 'started'] };

// Throws with a reason, and writes nothing, unless the whole backup is valid.
export function validateBackup(data) {
  if (data?.app !== 'social-studio') throw new Error('Not a Social Studio backup file.');
  if (data.version !== VERSION) throw new Error(`Backup version ${data.version} is not supported (this app reads version ${VERSION}).`);
  if (data.profile != null && (typeof data.profile !== 'object' || !Array.isArray(data.profile.goals) || !Array.isArray(data.profile.platforms))) throw new Error('The backup profile is incomplete.');
  const PLATFORMS = ['tiktok', 'instagram', 'youtube'];
  const badPlatform = v => !PLATFORMS.includes(v);
  if (data.profile && data.profile.platforms.some(badPlatform)) throw new Error('The backup lists an unknown platform.');
  for (const s of ['items', 'posts', 'imports']) if ((data[s] || []).some(o => o?.platform != null && badPlatform(o.platform))) throw new Error(`Backup ${s} contain an unknown platform.`);
  const badMetrics = m => typeof m !== 'object' || m === null || Object.values(m).some(v => v !== null && typeof v !== 'number');
  if ((data.posts || []).some(o => badMetrics(o.metrics)) || (data.items || []).some(o => o.metrics != null && badMetrics(o.metrics))) throw new Error('Backup metrics must be numbers.');
  const numOrNull = v => v == null || typeof v === 'number';
  if ((data.runs || []).some(o => typeof o.started !== 'string' || !numOrNull(o.kept) || !numOrNull(o.dropped) || (o.usage != null && (typeof o.usage !== 'object' || !Object.values(o.usage).every(numOrNull)))))
    throw new Error('Backup scout runs have invalid fields.');
  for (const k of ['count', 'linked']) if ((data.imports || []).some(o => o?.[k] != null && typeof o[k] !== 'number')) throw new Error('Backup imports have invalid counts.');
  for (const s of STORES) {
    if (data[s] == null) continue;
    if (!Array.isArray(data[s])) throw new Error(`"${s}" in the backup is not a list.`);
    data[s].forEach((o, n) => {
      const missing = REQUIRED[s].filter(k => o?.[k] == null || o[k] === '');
      if (missing.length) throw new Error(`Backup ${s} #${n + 1} is missing ${missing.join(', ')}.`);
    });
  }
}

export async function importAll(data) {
  validateBackup(data);
  const db = await open();
  await new Promise((resolve, reject) => {
    const t = db.transaction(['kv', ...STORES], 'readwrite');
    if (data.profile) t.objectStore('kv').put(data.profile, 'profile');
    for (const s of STORES) for (const o of data[s] || []) t.objectStore(s).put(o);
    t.oncomplete = resolve;
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Restore aborted; nothing was changed.'));
  });
}
