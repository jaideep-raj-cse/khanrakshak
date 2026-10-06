// Record-level SCOPE rules — which mines and records a role may see.
// (WHAT a role may do lives in the PERMISSIONS matrix in data/roles.js.)
//
//   Field Officer      → assigned mines; sees only inspections/issues/audit
//                        events it created itself
//   Mine Manager       → mine(s) where it is the listed manager
//   Compliance Officer → all mines
//   Administrator      → all mines
//
// This is a demo mechanism keyed off the persona, not real authorization.
import { ROLES, ROLE_DETAILS } from '../data/roles';
import { getMines } from './dataService';

export function getPersonaName(role) {
  return ROLE_DETAILS[role]?.demoUser?.name ?? null;
}

function hasGlobalScope(role) {
  return role === ROLES.COMPLIANCE_OFFICER || role === ROLES.ADMINISTRATOR;
}

/** @returns {string[]|null} mine ids the role may see, or null for "all mines". */
export function getAssignedMineIds(role) {
  if (hasGlobalScope(role)) return null;
  if (role === ROLES.FIELD_OFFICER) {
    return ROLE_DETAILS[role]?.demoUser?.assignedMineIds ?? [];
  }
  if (role === ROLES.MINE_MANAGER) {
    const name = getPersonaName(role);
    return getMines()
      .filter((m) => m.manager === name)
      .map((m) => m.id);
  }
  return [];
}

export function canViewMine(role, mineId) {
  const ids = getAssignedMineIds(role);
  return ids === null || ids.includes(mineId);
}

export function getVisibleMines(role) {
  return getMines().filter((m) => canViewMine(role, m.id));
}

// Field Officer: only issues it reported. Mine Manager: issues at assigned
// mines. Compliance Officer / Administrator: everything.
export function canViewIssue(role, issue) {
  if (!issue) return false;
  if (hasGlobalScope(role)) return true;
  if (role === ROLES.FIELD_OFFICER) return issue.reportedBy === getPersonaName(role);
  return canViewMine(role, issue.mineId);
}

// Field Officer: only its own inspections. Mine Manager: assigned mine(s).
export function canViewInspection(role, inspection) {
  if (!inspection) return false;
  if (hasGlobalScope(role)) return true;
  if (role === ROLES.FIELD_OFFICER) return inspection.inspector === getPersonaName(role);
  return canViewMine(role, inspection.mineId);
}

// Field Officer has no corrective-action access at all (see PERMISSIONS).
export function canViewAction(role, action) {
  if (!action) return false;
  if (hasGlobalScope(role)) return true;
  if (role === ROLES.FIELD_OFFICER) return false;
  return canViewMine(role, action.mineId);
}

// Scoped audit visibility. Compliance Officer / Administrator: everything.
// Mine Manager: events tagged with an assigned mine. Field Officer: events it
// performed itself. Events with no mineId (legacy) are global-scope only.
export function canViewAuditEvent(role, event) {
  if (!event) return false;
  if (hasGlobalScope(role)) return true;
  if (role === ROLES.FIELD_OFFICER) return event.actor === getPersonaName(role);
  if (role === ROLES.MINE_MANAGER) return !!event.mineId && canViewMine(role, event.mineId);
  return false;
}

// Notifications are recipient-targeted. A notification carries
// recipientRole (required) and optionally recipientName (a specific person)
// and mineId. Records with no recipientRole are treated as broadcast.
export function isNotificationVisible(notification, role) {
  if (!notification.recipientRole) return true;
  if (notification.recipientRole !== role) return false;
  const scoped = role === ROLES.FIELD_OFFICER || role === ROLES.MINE_MANAGER;
  if (!scoped) return true;
  if (notification.recipientName) return notification.recipientName === getPersonaName(role);
  if (notification.mineId) return canViewMine(role, notification.mineId);
  return true;
}
