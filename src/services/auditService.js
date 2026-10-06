import { storage } from '../storage/localStorage';
import { nextId } from '../utils/id';

// Every important state-changing operation in the app should call
// logAuditEvent() exactly once. This is the ONLY place audit records are
// written, so there is a single audit system, not a parallel one per feature.

export function getAuditLog() {
  return storage.read(storage.KEYS.AUDIT_LOG, []);
}

/**
 * @param {Object} entry
 * @param {string} entry.actor - display name of who/what performed the action
 * @param {string} entry.role - their role at the time
 * @param {string} entry.action - short verb phrase, e.g. "Issue Created"
 * @param {string} entry.entity - entity type, e.g. "Issue", "Corrective Action"
 * @param {string} entry.entityId
 * @param {string} entry.description
 */
export function logAuditEvent(entry) {
  const log = getAuditLog();
  const record = {
    id: nextId('AUD', log.map((e) => e.id)),
    timestamp: new Date().toISOString(),
    ...entry,
  };
  storage.write(storage.KEYS.AUDIT_LOG, [record, ...log]);
  return record;
}
