import { useEffect, useState } from 'react';
import { storage } from '../storage/localStorage';

/**
 * Bumps a counter whenever LocalStorage changes through storage.write()/remove() — in this tab
 * (a corrective action actioned on another page, then navigating back here) or another tab/window
 * (storage's native cross-tab event). Pages that read demo data straight from LocalStorage on every
 * render (no local component state) can include this counter in a useMemo's dependency list to stay
 * current without a manual refresh.
 *
 * This is a frontend prototype re-reading its own LocalStorage, not a real-time server connection.
 */
export function useStorageVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const unsubscribe = storage.onChange(() => setVersion((v) => v + 1));
    return unsubscribe;
  }, []);
  return version;
}
