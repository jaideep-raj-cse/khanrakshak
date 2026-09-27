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
    return true;
  } catch (err) {
    console.error(`[storage] failed to write ${key}`, err);
    return false;
  }
}

function remove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.error(`[storage] failed to remove ${key}`, err);
  }
}

function clearAll() {
  Object.values(KEYS).forEach(remove);
}

export const storage = { read, write, remove, clearAll, KEYS };
