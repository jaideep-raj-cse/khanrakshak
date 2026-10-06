import { storage } from '../storage/localStorage';
import { SEED_VERSION, buildSeedData } from '../data/seedData';
import { DEMO_NOW } from '../utils/date';

// Seed dates are relative to an anchor day (see data/seedData.js), so the
// collections are built per call. `anchor` defaults to today; tests pin it.
function collectionsFor(anchor) {
  const seed = buildSeedData(anchor);
  return [
    [storage.KEYS.MINES, seed.mines],
    [storage.KEYS.INSPECTIONS, seed.inspections],
    [storage.KEYS.ISSUES, seed.issues],
    [storage.KEYS.CORRECTIVE_ACTIONS, seed.correctiveActions],
    [storage.KEYS.CONTRACTORS, seed.contractors],
    [storage.KEYS.DOCUMENTS, seed.documents],
    [storage.KEYS.AUDIT_LOG, seed.auditLog],
    [storage.KEYS.NOTIFICATIONS, seed.notifications],
  ];
}

const hasCoords = (m) => Number.isFinite(m?.latitude) && Number.isFinite(m?.longitude);

// Mines seeded before the GIS Risk Map existed carry no coordinates. Rather than bump
// SEED_VERSION (which would wipe everything a demo user has since created), copy ONLY the
// missing latitude / longitude from the seed onto stored seeded mines, matched by id. Mines
// that already have coordinates, mines the seed doesn't know, and every other collection are
// left untouched, and nothing is written when there is nothing to fill.
export function backfillMineCoordinates(anchor = DEMO_NOW) {
  const stored = storage.read(storage.KEYS.MINES, null);
  if (!Array.isArray(stored) || stored.every(hasCoords)) return;
  const seedById = new Map(buildSeedData(anchor).mines.map((m) => [m.id, m]));
  let changed = false;
  const next = stored.map((mine) => {
    const seed = seedById.get(mine?.id);
    if (hasCoords(mine) || !hasCoords(seed)) return mine;
    changed = true;
    return { ...mine, latitude: seed.latitude, longitude: seed.longitude };
  });
  if (changed) storage.write(storage.KEYS.MINES, next);
}

// Ensures LocalStorage has the seeded demo dataset. Runs once per app load;
// if the seed version on disk is older than SEED_VERSION, everything is
// reseeded so schema changes during development don't leave stale shapes.
export function ensureSeeded(anchor = DEMO_NOW) {
  const storedVersion = storage.read(storage.KEYS.SEED_VERSION, null);
  if (storedVersion === SEED_VERSION) {
    backfillMineCoordinates(anchor);
    return;
  }

  collectionsFor(anchor).forEach(([key, seed]) => storage.write(key, seed));
  storage.write(storage.KEYS.SEED_VERSION, SEED_VERSION);
}

// "Reset Demo Data" utility — restores the original seeded state (dates
// re-anchored to today) and clears any role/session selection so the demo can
// be replayed from a clean slate.
export function resetDemoData(anchor = DEMO_NOW) {
  collectionsFor(anchor).forEach(([key, seed]) => storage.write(key, seed));
  storage.write(storage.KEYS.SEED_VERSION, SEED_VERSION);
  storage.remove(storage.KEYS.CURRENT_ROLE);
  storage.remove(storage.KEYS.CURRENT_USER);
}
