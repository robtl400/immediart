// Web Storage access that never throws. A sandboxed frame or a locked-down
// private mode throws on the `localStorage` accessor itself, a full quota
// throws on write; callers get a value or a verdict instead.
//
//   readStorage(kind, key)  → the stored string, null on a miss, undefined
//                             when the storage is unusable
//   writeStorage(kind, key, value) → whether the write landed
//
// `kind` names the global ('localStorage' | 'sessionStorage') so the accessor
// is touched inside the guard.

export const readStorage = (kind, key) => {
  try { return globalThis[kind].getItem(key); } catch { return undefined; }
};

export const writeStorage = (kind, key, value) => {
  try { globalThis[kind].setItem(key, value); return true; } catch { return false; }
};
