import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
// Minimal browser localStorage stub
const store = new Map();
globalThis.window = {
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  },
};
globalThis.__store = store;
