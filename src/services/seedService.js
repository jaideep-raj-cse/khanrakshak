import { storage } from '../storage/localStorage';
import {
  SEED_VERSION,
  seedMines,
  seedInspections,
  seedIssues,
  seedCorrectiveActions,
  seedContractors,
  seedDocuments,
  seedAuditLog,
  seedNotifications,
} from '../data/seedData';

const COLLECTIONS = [
  [storage.KEYS.MINES, seedMines],
  [storage.KEYS.INSPECTIONS, seedInspections],
  [storage.KEYS.ISSUES, seedIssues],
  [storage.KEYS.CORRECTIVE_ACTIONS, seedCorrectiveActions],
  [storage.KEYS.CONTRACTORS, seedContractors],
  [storage.KEYS.DOCUMENTS, seedDocuments],
  [storage.KEYS.AUDIT_LOG, seedAuditLog],
  [storage.KEYS.NOTIFICATIONS, seedNotifications],
];

// Ensures LocalStorage has the seeded demo dataset. Runs once per app load;
// if the seed version on disk is older than SEED_VERSION, everything is
// reseeded so schema changes during development don't leave stale shapes.
export function ensureSeeded() {
  const storedVersion = storage.read(storage.KEYS.SEED_VERSION, null);
  if (storedVersion === SEED_VERSION) return;

  COLLECTIONS.forEach(([key, seed]) => storage.write(key, seed));
  storage.write(storage.KEYS.SEED_VERSION, SEED_VERSION);
}

// "Reset Demo Data" utility — restores the original seeded state and clears
// any role/session selection so the demo can be replayed from a clean slate.
export function resetDemoData() {
  COLLECTIONS.forEach(([key, seed]) => storage.write(key, seed));
  storage.write(storage.KEYS.SEED_VERSION, SEED_VERSION);
  storage.remove(storage.KEYS.CURRENT_ROLE);
  storage.remove(storage.KEYS.CURRENT_USER);
}
