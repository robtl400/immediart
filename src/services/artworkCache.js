/**
 * IndexedDB cache for Met API responses
 * Stores: 'ids' (search result ID arrays, TTL 24h)
 *         'artworks' (artwork objects, TTL 7d)
 */

const DB_NAME = 'immediart-cache';
const DB_VERSION = 1;
const TTL_IDS = 86400000;      // 24 hours
const TTL_ARTWORKS = 604800000; // 7 days

// Module-level singleton — open once, reuse across all calls
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('ids')) {
          db.createObjectStore('ids', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('artworks')) {
          db.createObjectStore('artworks', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        const db = event.target.result;
        // Cleanup expired entries on open (fire and forget)
        cleanupExpired(db);
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null; // Allow retry
        reject(request.error);
      };
    } catch (err) {
      dbPromise = null;
      reject(err);
    }
  });

  return dbPromise;
}

function cleanupExpired(db) {
  const now = Date.now();
  for (const storeName of ['ids', 'artworks']) {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.openCursor();
      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        if (now > cursor.value.expiresAt) {
          cursor.delete();
        }
        cursor.continue();
      };
    } catch {
      // Swallow — cleanup is best-effort
    }
  }
}

async function getFromStore(storeName, key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(storeName, 'readonly');
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

async function setInStore(storeName, key, data, ttl) {
  try {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put({ key, data, expiresAt: Date.now() + ttl });
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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

export async function clearCache() {
  try {
    const db = await openDB();
    for (const storeName of ['ids', 'artworks']) {
      await new Promise((resolve) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => resolve(); // Swallow
      });
    }
  } catch {
    // Swallow
  }
}
