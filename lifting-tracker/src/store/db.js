// Local storage for the app. IndexedDB when available, with an in-memory fallback so the app still
// works (without persistence) in private windows or when storage is blocked. Nothing leaves the device.

export const SCHEMA_VERSION = 1;
const DB_NAME = 'lifting-tracker';
const STORES = { meta: 'key', sessions: 'id', sets: 'id', bodyweights: 'id' };

export function staleDataError() {
  const error = new RangeError('Data changed in another tab. This view was refreshed. Review it and try again; reopen a changed set or recreate an import preview.');
  error.code = 'STALE_DATA';
  return error;
}

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
    async updateMeta(key, update) {
      const current = structuredClone(data.meta.get(key)?.value ?? null);
      const next = update(current);
      if (next === undefined) return current;
      data.meta.set(key, structuredClone({ key, value: next }));
      return structuredClone(next);
    },
    async replaceProgramme(expected, next, draftKeys, { sessions = [], sets = [], check = () => {} } = {}) {
      if (JSON.stringify(data.meta.get('programme')?.value ?? null) !== expected) throw staleDataError();
      check(Object.fromEntries(Object.entries(data).map(([s, rows]) => [s, structuredClone([...rows.values()])])));
      if (next == null) data.meta.delete('programme'); else data.meta.set('programme', structuredClone({ key: 'programme', value: next }));
      for (const key of draftKeys) data.meta.delete(key);
      for (const rec of sessions) data.sessions.set(rec.id, structuredClone(rec));
      for (const rec of sets) data.sets.set(rec.id, structuredClone(rec));
    },
    // Write records into several stores as one unit (all or nothing).
    async putAll(batch) { for (const [s, recs] of Object.entries(batch)) for (const r of recs) data[s].set(keyOf(s, r), structuredClone(r)); },
    async deleteAndPut(del, batch, check = () => {}) {
      check(Object.fromEntries(Object.entries(data).map(([s, rows]) => [s, structuredClone([...rows.values()])])));
      for (const [s, keys] of Object.entries(del)) for (const k of keys) data[s].delete(k);
      for (const [s, recs] of Object.entries(batch)) for (const r of recs) data[s].set(keyOf(s, r), structuredClone(r));
    },
    async replaceAll(snapshot, check = () => {}) {
      check(Object.fromEntries(Object.entries(data).map(([s, rows]) => [s, structuredClone([...rows.values()])])));
      for (const s of Object.keys(STORES)) data[s].clear();
      for (const [s, recs] of Object.entries(snapshot)) for (const r of recs) data[s].set(keyOf(s, r), structuredClone(r));
    },
    async clearAll(check = () => {}) {
      check(Object.fromEntries(Object.entries(data).map(([s, rows]) => [s, structuredClone([...rows.values()])])));
      for (const s of Object.keys(STORES)) data[s].clear();
    },
  };
}

function req(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
// Run synchronous writes inside a transaction; a throw aborts it so nothing half-applies.
async function applyTx(tx, fn) {
  const done = txDone(tx);
  done.catch(() => {});
  try { fn(); } catch (err) { try { tx.abort(); } catch { /* already finished */ } throw err; }
  await done;
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
      // The callback must be synchronous: the read and write stay in the same readwrite transaction.
      async updateMeta(key, update) {
        const tx = db.transaction('meta', 'readwrite');
        const done = txDone(tx);
        done.catch(() => {});
        let result;
        try {
          const object = tx.objectStore('meta');
          const current = await req(object.get(key));
          result = update(current?.value ?? null);
          if (result !== undefined) object.put({ key, value: result });
        } catch (err) {
          try { tx.abort(); } catch { /* transaction already finished */ }
          throw err;
        }
        await done;
        return result === undefined ? null : result;
      },
      async replaceProgramme(expected, next, draftKeys, { sessions = [], sets = [], check = () => {} } = {}) {
        const tx = db.transaction(Object.keys(STORES), 'readwrite');
        const done = txDone(tx);
        done.catch(() => {});
        try {
          const object = tx.objectStore('meta');
          const current = await req(object.get('programme'));
          if (JSON.stringify(current?.value ?? null) !== expected) throw staleDataError();
          const names = Object.keys(STORES);
          check(Object.fromEntries(await Promise.all(names.map(async (name) => [name, await req(tx.objectStore(name).getAll())]))));
          if (next == null) object.delete('programme'); else object.put({ key: 'programme', value: next });
          for (const key of draftKeys) object.delete(key);
          for (const rec of sessions) tx.objectStore('sessions').put(rec);
          for (const rec of sets) tx.objectStore('sets').put(rec);
        } catch (err) {
          try { tx.abort(); } catch { /* transaction already finished */ }
          throw err;
        }
        await done;
      },
      // Several stores in one transaction: either every write lands or none does.
      async putAll(batch) {
        const tx = db.transaction(Object.keys(batch), 'readwrite');
        await applyTx(tx, () => { for (const [s, recs] of Object.entries(batch)) for (const r of recs) tx.objectStore(s).put(r); });
      },
      async deleteAndPut(del, batch, check = null) {
        const names = check ? Object.keys(STORES) : [...new Set([...Object.keys(del), ...Object.keys(batch)])];
        const tx = db.transaction(names, 'readwrite');
        const done = txDone(tx); done.catch(() => {});
        try {
          if (check) check(Object.fromEntries(await Promise.all(names.map(async (name) => [name, await req(tx.objectStore(name).getAll())]))));
          for (const [s, keys] of Object.entries(del)) for (const k of keys) tx.objectStore(s).delete(k);
          for (const [s, recs] of Object.entries(batch)) for (const r of recs) tx.objectStore(s).put(r);
        } catch (err) { try { tx.abort(); } catch { /* transaction already finished */ } throw err; }
        await done;
      },
      // One transaction across every store: an import either fully applies or not at all.
      async replaceAll(snapshot, check = () => {}) {
        const names = Object.keys(STORES);
        const tx = db.transaction(names, 'readwrite');
        const done = txDone(tx); done.catch(() => {});
        try {
          const current = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await req(tx.objectStore(name).getAll())])));
          check(current);
          for (const n of names) tx.objectStore(n).clear();
          for (const [n, recs] of Object.entries(snapshot)) for (const r of recs) tx.objectStore(n).put(r);
        } catch (err) { try { tx.abort(); } catch { /* transaction already finished */ } throw err; }
        await done;
      },
      async clearAll(check = () => {}) {
        const names = Object.keys(STORES), tx = db.transaction(names, 'readwrite');
        const done = txDone(tx); done.catch(() => {});
        try {
          const current = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await req(tx.objectStore(name).getAll())])));
          check(current);
          for (const n of names) tx.objectStore(n).clear();
        } catch (err) { try { tx.abort(); } catch { /* transaction already finished */ } throw err; }
        await done;
      },
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
