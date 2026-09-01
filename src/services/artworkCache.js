/**
 * IndexedDB cache for Met API responses
 * Stores: 'ids' (search result ID arrays, TTL 24h)
 *         'artworks' (artwork objects, TTL 7d)
 */

const DB_NAME = 'immediart-cache';
const DB_VERSION = 1;
const TTL_IDS = 86400000;      // 24 hours
const TTL_ARTWORKS = 604800000; // 7 days

// Module-level singleton — open once, reuse across all calls. `liveDb` is the
// connection `dbPromise` resolved to; the handlers that drop a dead handle
// compare against it so a straggler holding an OLDER connection can never
// discard a newer, healthy one (a reopen would then leak the healthy one).
let dbPromise = null;
let liveDb = null;

function dropIfLive(db) {
  if (db === liveDb) { liveDb = null; dbPromise = null; }
}

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('ids')) {
          db.createObjectStore('ids', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('artworks')) {
          db.createObjectStore('artworks', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        // The browser can close this connection behind our back (Safari
        // storage eviction, a discarded-then-restored tab, storage cleared in
        // another tab, a version bump elsewhere). Drop the cached handle so the
        // next call reopens instead of failing forever on a dead connection.
        db.onversionchange = () => { db.close(); dropIfLive(db); };
        db.onclose = () => dropIfLive(db);
        liveDb = db;
        // Cleanup expired entries after open (fire and forget) — deferred off
        // the open path: it cursor-walks both stores, and now that validation
        // rejects are cached too the artworks store can hold thousands of
        // records; don't compete with the splash and first feed paint.
        const idle = globalThis.requestIdleCallback ?? ((fn) => setTimeout(fn, 3000));
        // timeout guarantees the cleanup eventually runs even on a busy page
        idle(() => { lastCleanupAt = Date.now(); cleanupExpired(db); }, { timeout: 10000 });
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null; // Allow retry
        reject(request.error);
      };
    } catch (err) {
      // A synchronous throw (no indexedDB at all, a sandboxed frame) leaves
      // dbPromise as this rejected promise: every later call fast-fails to
      // null without re-attempting an open that can never succeed.
      reject(err);
    }
  });

  return dbPromise;
}

// The artworks store holds every object the app has seen, rejects included,
// so a long-lived install accumulates. Beyond this many live entries the
// soonest-to-expire are dropped first.
const MAX_ARTWORK_ENTRIES = 5000;

function cleanupExpired(db) {
  const now = Date.now();
  for (const storeName of ['ids', 'artworks']) {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const live = []; // { key, expiresAt } of entries kept, for the size cap
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) {
          if (storeName === 'artworks' && live.length > MAX_ARTWORK_ENTRIES) {
            live.sort((a, b) => a.expiresAt - b.expiresAt);
            for (const { key } of live.slice(0, live.length - MAX_ARTWORK_ENTRIES)) store.delete(key);
          }
          return;
        }
        if (now > cursor.value.expiresAt) {
          cursor.delete();
        } else {
          live.push({ key: cursor.key, expiresAt: cursor.value.expiresAt });
        }
        cursor.continue();
      };
    } catch {
      // Swallow — cleanup is best-effort
    }
  }
}

// A standalone install can stay open for days: sweep again when the tab
// comes back into view, at most every few hours.
const CLEANUP_INTERVAL_MS = 6 * 3600 * 1000;
let lastCleanupAt = 0;
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !liveDb) return;
    if (Date.now() - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    lastCleanupAt = Date.now();
    cleanupExpired(liveDb);
  });
}

// Open a transaction on the live connection. A connection the browser has
// already closed throws InvalidStateError here; drop the cached handle so the
// NEXT call reopens (this call still fails, and its caller swallows that).
function transaction(db, storeName, mode) {
  try {
    return db.transaction(storeName, mode);
  } catch (err) {
    if (err?.name === 'InvalidStateError') dropIfLive(db);
    throw err;
  }
}

async function getFromStore(storeName, key) {
  try {
    const db = await openDB();
    // `return await`, not `return`: a synchronous throw inside the executor
    // (a closed connection at db.transaction) becomes a rejected promise, and
    // only an awaited one is caught below — a returned one would escape and
    // turn every cache read into a hard failure until reload.
    return await new Promise((resolve) => {
      const tx = transaction(db, storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => {
        const record = req.result;
        if (!record || Date.now() > record.expiresAt) {
          resolve(null);
        } else {
          resolve(record.data);
        }
      };
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function removeFromStore(storeName, key) {
  try {
    const db = await openDB();
    await /** @type {Promise<void>} */ (new Promise((resolve) => {
      const tx = transaction(db, storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve(); // Swallow — best-effort
    }));
  } catch {
    // Swallow — storage errors are non-fatal
  }
}

async function setInStore(storeName, key, data, ttl) {
  try {
    const db = await openDB();
    await /** @type {Promise<void>} */ (new Promise((resolve, reject) => {
      const tx = transaction(db, storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put({ key, data, expiresAt: Date.now() + ttl });
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  } catch {
    // Swallow — storage errors (quota, private browsing) are non-fatal
  }
}

// Public API

export async function getCachedIDs(key) {
  return getFromStore('ids', key);
}

export async function setCachedIDs(key, ids, ttl = TTL_IDS) {
  await setInStore('ids', key, ids, ttl);
}

export async function getCachedArtwork(id) {
  return getFromStore('artworks', String(id));
}

export async function setCachedArtwork(id, obj, ttl = TTL_ARTWORKS) {
  await setInStore('artworks', String(id), obj, ttl);
}

export async function removeCachedArtwork(id) {
  await removeFromStore('artworks', String(id));
}
