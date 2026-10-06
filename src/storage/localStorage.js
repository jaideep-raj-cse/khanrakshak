// Central LocalStorage access layer.
// Every read/write to browser storage in the app should go through here,
// so the rest of the codebase never touches window.localStorage directly.

const NAMESPACE = 'khanrakshak';

const KEYS = {
  CURRENT_ROLE: `${NAMESPACE}:currentRole`,
  CURRENT_USER: `${NAMESPACE}:currentUser`,
  MINES: `${NAMESPACE}:mines`,
  INSPECTIONS: `${NAMESPACE}:inspections`,
  OBSERVATIONS: `${NAMESPACE}:observations`,
  ISSUES: `${NAMESPACE}:issues`,
  CORRECTIVE_ACTIONS: `${NAMESPACE}:correctiveActions`,
  CONTRACTORS: `${NAMESPACE}:contractors`,
  DOCUMENTS: `${NAMESPACE}:documents`,
  AUDIT_LOG: `${NAMESPACE}:auditLog`,
  NOTIFICATIONS: `${NAMESPACE}:notifications`,
  SEED_VERSION: `${NAMESPACE}:seedVersion`,
};

// Live-update support: the browser's native 'storage' event only fires in OTHER tabs, never in the
// tab that made the write. Pages that want to react to a change made elsewhere in THIS tab (e.g. the
// Dashboard, after a corrective action is actioned on another page and the user navigates back)
// subscribe via onChange() below. Same-tab notification is a plain in-memory pub-sub (no DOM event
// needed), so it works identically in the browser and in the Node test harness; cross-tab notices
// additionally forward the native 'storage' event when running in a real browser.
const listeners = new Set();

function notifyChange(key) {
  listeners.forEach((callback) => {
    try {
      callback(key);
    } catch (err) {
      console.error('[storage] onChange listener threw', err);
    }
  });
}

/**
 * Subscribe to any write/remove made through this module — in this tab, and (in a real browser)
 * in other tabs/windows too. Returns an unsubscribe function.
 * @param {(key: string|null) => void} callback
 */
function onChange(callback) {
  listeners.add(callback);
  let removeNativeListener = () => {};
  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const otherTabHandler = (e) => callback(e?.key ?? null);
    window.addEventListener('storage', otherTabHandler);
    removeNativeListener = () => window.removeEventListener('storage', otherTabHandler);
  }
  return () => {
    listeners.delete(callback);
    removeNativeListener();
  };
}

function read(key, fallback = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[storage] failed to read ${key}`, err);
    return fallback;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    notifyChange(key);
    return true;
  } catch (err) {
    console.error(`[storage] failed to write ${key}`, err);
    return false;
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
    notifyChange(key);
  } catch (err) {
    console.error(`[storage] failed to remove ${key}`, err);
  }
}

function clearAll() {
  Object.values(KEYS).forEach(remove);
}

export const storage = { read, write, remove, clearAll, onChange, KEYS };
