// Local storage for the app. IndexedDB when available, with an in-memory fallback so the app still
// works (without persistence) in private windows or when storage is blocked. Nothing leaves the device.

export const SCHEMA_VERSION = 1;
const DB_NAME = 'lifting-tracker';
const STORES = { meta: 'key', sessions: 'id', sets: 'id', bodyweights: 'id' };

function memoryStore() {
  const data = { meta: new Map(), sessions: new Map(), sets: new Map(), bodyweights: new Map() };
  const keyOf = (store, rec) => rec[STORES[store]];
  return {
    persistent: false,
    async get(store, key) { return structuredClone(data[store].get(key) ?? null); },
    async getAll(store) { return structuredClone([...data[store].values()]); },
    async put(store, rec) { data[store].set(keyOf(store, rec), structuredClone(rec)); },
    async putMany(store, recs) { for (const r of recs) data[store].set(keyOf(store, r), structuredClone(r)); },
    async delete(store, key) { data[store].delete(key); },
    async replaceAll(snapshot) {
      for (const s of Object.keys(STORES)) data[s].clear();
      for (const [s, recs] of Object.entries(snapshot)) for (const r of recs) data[s].set(keyOf(s, r), structuredClone(r));
    },
    async clearAll() { for (const s of Object.keys(STORES)) data[s].clear(); },
  };
}

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
function txDone(tx) {
  return new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('Transaction aborted')); });
}

export async function openStore() {
  try {
    if (typeof indexedDB === 'undefined') return memoryStore();
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, SCHEMA_VERSION);
      open.onupgradeneeded = () => {
        const d = open.result;
        for (const [name, keyPath] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
      open.onblocked = () => reject(new Error('Database blocked'));
    });
    return {
      persistent: true,
      async get(store, key) { return (await req(db.transaction(store).objectStore(store).get(key))) ?? null; },
      async getAll(store) { return req(db.transaction(store).objectStore(store).getAll()); },
      async put(store, rec) { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(rec); await txDone(tx); },
      async putMany(store, recs) { const tx = db.transaction(store, 'readwrite'); for (const r of recs) tx.objectStore(store).put(r); await txDone(tx); },
      async delete(store, key) { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); await txDone(tx); },
      // One transaction across every store: an import either fully applies or not at all.
      async replaceAll(snapshot) {
        const names = Object.keys(STORES);
        const tx = db.transaction(names, 'readwrite');
        for (const n of names) tx.objectStore(n).clear();
        for (const [n, recs] of Object.entries(snapshot)) for (const r of recs) tx.objectStore(n).put(r);
        await txDone(tx);
      },
      async clearAll() { const names = Object.keys(STORES); const tx = db.transaction(names, 'readwrite'); for (const n of names) tx.objectStore(n).clear(); await txDone(tx); },
    };
  } catch (err) {
    console.warn('IndexedDB unavailable, using memory only:', err);
    return memoryStore();
  }
}

/** Ask the browser not to evict our data under storage pressure. Returns true/false/null (unsupported). */
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}
