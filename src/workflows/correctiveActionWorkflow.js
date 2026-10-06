// KhanRakshak — Corrective Action Compliance Lifecycle
// ---------------------------------------------------------------------------
// Single source of truth for corrective-action status transitions, the
// escalation model, and the audit + notification side-effects that go with
// each. Pages call these functions rather than mutating records directly, so
// the lifecycle rules only live in one place.
//
// Who does what:
//   Field Officer       Inspection → Observation → Evidence → Submit
//                       (no corrective-action execution rights)
//   Mine Manager        Start Work → Evidence → Submit for Verification
//   Compliance Officer  Review Evidence → Verify & Close
//                                       OR Reject → sent back for correction
//   Administrator       full access (may also perform every step above)
//
// Lifecycle:
//   Open → Assigned → In Progress → Submitted for Verification → Closed
// Rejection path:
//   Submitted for Verification → (Rejected, recorded) → In Progress → Submitted…
//
// "Rejected" is not a persisted status — it is a workflow outcome. The record
// returns to IN_PROGRESS and carries rejectedAt/rejectedBy/rejectionReason.
// "Verified" is now transient: verifyAction() verifies AND closes in one step
// ("Verify & Close"). The VERIFIED status is still understood (and closeAction
// still exists) so records left in that state by earlier builds can be closed.

import {
  getCorrectiveActionById,
  getCorrectiveActions,
  updateCorrectiveAction,
  getIssueById,
  updateIssue,
} from '../services/dataService';
import { logAuditEvent } from '../services/auditService';
import { createNotification } from '../services/notificationService';
import { canViewMine } from '../services/accessService';
import { calendarDaysOverdue, calendarDaysPastDue, DEMO_NOW } from '../utils/date';
import { ROLES, ROLE_DETAILS, can } from '../data/roles';

export const CA_STATUS = {
  OPEN: 'OPEN',
  ASSIGNED: 'ASSIGNED',
  IN_PROGRESS: 'IN_PROGRESS',
  SUBMITTED_FOR_VERIFICATION: 'SUBMITTED_FOR_VERIFICATION',
  VERIFIED: 'VERIFIED',
  CLOSED: 'CLOSED',
};

const CLOSED_LIKE = new Set([CA_STATUS.VERIFIED, CA_STATUS.CLOSED]);

// --- Permissions ------------------------------------------------------------
// Enforced here (not just in the UI) so a role cannot bypass the rule by
// calling the workflow function directly or navigating straight to a URL.
const ACTION_PERMISSION = {
  START_PROGRESS: 'ca.start',
  SUBMIT_FOR_VERIFICATION: 'ca.submit',
  VERIFY: 'ca.verify',
  REJECT: 'ca.reject',
  CLOSE: 'ca.close',
};

export function roleCan(actionKey, role) {
  const permission = ACTION_PERMISSION[actionKey];
  return permission ? can(permission, role) : false;
}

function assertRole(actionKey, role) {
  if (!roleCan(actionKey, role)) {
    throw new Error('You do not have permission to perform this action.');
  }
}

// Mine Manager may only act on corrective actions at its assigned mine(s).
function assertScope(role, action) {
  if (!canViewMine(role, action.mineId)) {
    throw new Error('This corrective action is outside your assigned mine(s).');
  }
}

function roleLabel(role) {
  return ROLE_DETAILS[role]?.name ?? role;
}

function nowIso() {
  return new Date().toISOString();
}

function reporterOf(action) {
  return getIssueById(action.issueId)?.reportedBy ?? null;
}

// --- Overdue / days-remaining ------------------------------------------------

/**
 * @returns {{ overdue: boolean, overdueDays: number, daysRemaining: number|null, label: string }}
 */
export function computeDaysInfo(action, now = DEMO_NOW) {
  if (!action) return { overdue: false, overdueDays: 0, daysRemaining: null, label: '—' };

  if (CLOSED_LIKE.has(action.status)) {
    return { overdue: false, overdueDays: 0, daysRemaining: null, label: 'Completed' };
  }

  const diff = calendarDaysPastDue(action.dueDate, now); // today - due; > 0 once overdue
  if (diff === null) return { overdue: false, overdueDays: 0, daysRemaining: null, label: '—' };

  if (diff > 0) {
    return {
      overdue: true,
      overdueDays: diff,
      daysRemaining: null,
      label: `${diff} day${diff === 1 ? '' : 's'} overdue`,
    };
  }
  if (diff === 0) {
    return { overdue: false, overdueDays: 0, daysRemaining: 0, label: 'Due today' };
  }
  const remaining = -diff;
  return {
    overdue: false,
    overdueDays: 0,
    daysRemaining: remaining,
    label: `${remaining} day${remaining === 1 ? '' : 's'} remaining`,
  };
}

// --- Escalation ---------------------------------------------------------------
// For every non-closed corrective action:
//   Level 1 — deadline missed (overdue)          → assigned Mine Manager
//   Level 2 — MORE than 3 days overdue           → Compliance Officer
//   Level 3 — MORE than 7 days overdue           → Administrator
//
// Persisted on the record as `escalationLevel` (0–3, only ever increases) and
// `escalationHistory` (one entry per level, ever). processEscalations() is
// idempotent: a level already in the history is never raised again, so
// re-rendering, reloading, or React StrictMode's double-invoked effects cannot
// create duplicate audit events or notifications.

export const ESCALATION_LEVEL_2_AFTER_DAYS = 3;
export const ESCALATION_LEVEL_3_AFTER_DAYS = 7;

export const ESCALATION_LEVELS = {
  1: { label: 'Level 1 — Overdue', recipientRole: ROLES.MINE_MANAGER, recipientLabel: 'Assigned Mine Manager' },
  2: { label: 'Level 2 — Compliance review', recipientRole: ROLES.COMPLIANCE_OFFICER, recipientLabel: 'Compliance Officer' },
  3: { label: 'Level 3 — Administrator', recipientRole: ROLES.ADMINISTRATOR, recipientLabel: 'Administrator' },
};

export function computeEscalationLevel(overdueDays) {
  if (overdueDays > ESCALATION_LEVEL_3_AFTER_DAYS) return 3;
  if (overdueDays > ESCALATION_LEVEL_2_AFTER_DAYS) return 2;
  if (overdueDays > 0) return 1;
  return 0;
}

export function getEscalationLevel(action) {
  if (!action || CLOSED_LIKE.has(action.status)) return 0;
  return action.escalationLevel ?? 0;
}

// An action is "escalated" while it is open and has reached Level 1 or above.
export function isEscalated(action) {
  return getEscalationLevel(action) >= 1;
}

function raiseEscalationSideEffects(action, entry) {
  const level = entry.level;
  const cfg = ESCALATION_LEVELS[level];

  logAuditEvent({
    actor: 'System',
    role: 'Workflow',
    action:
      level === 1
        ? 'Corrective Action Overdue — Escalation Level 1'
        : `Corrective Action Escalated — Level ${level}`,
    entity: 'Corrective Action',
    entityId: action.id,
    mineId: action.mineId,
    description:
      level === 1
        ? `${action.id} passed its deadline (${action.dueDate}) without verification — raised to ${cfg.recipientLabel}.`
        : `${action.id} is ${entry.overdueDays} days overdue (more than ${
            level === 2 ? ESCALATION_LEVEL_2_AFTER_DAYS : ESCALATION_LEVEL_3_AFTER_DAYS
          }) — escalated to ${cfg.recipientLabel}.`,
  });

  createNotification({
    title:
      level === 1
        ? 'Corrective Action Overdue'
        : level === 2
        ? 'Escalation Level 2 — Compliance Review Required'
        : 'Escalation Level 3 — Administrator Attention Required',
    description: `${action.id} (${action.title}) is ${entry.overdueDays} day${
      entry.overdueDays === 1 ? '' : 's'
    } overdue.`,
    type: level === 1 ? 'warning' : 'critical',
    entityType: 'CorrectiveAction',
    entityId: action.id,
    mineId: action.mineId,
    recipientRole: cfg.recipientRole,
    ...(level === 1 ? { recipientName: action.assignee } : {}),
  });

  // Levels 2+ mean the issue itself now needs oversight attention.
  if (level >= 2) {
    const issue = getIssueById(action.issueId);
    if (issue && issue.status !== 'CLOSED' && issue.status !== 'ESCALATED') {
      updateIssue(issue.id, { status: 'ESCALATED' });
    }
  }
}

/**
 * Scans all non-closed corrective actions and raises any escalation level not
 * yet recorded. Safe to call as often as you like. `now` is injectable so the
 * time-based behaviour can be tested.
 * @returns {Array<{actionId:string, level:number}>} levels newly raised by this call
 */
export function processEscalations(now = DEMO_NOW) {
  const raised = [];

  getCorrectiveActions().forEach((action) => {
    if (CLOSED_LIKE.has(action.status)) return;

    const overdueDays = calendarDaysOverdue(action.dueDate, now);
    const target = computeEscalationLevel(overdueDays);
    const history = action.escalationHistory ?? [];
    const recorded = new Set(history.map((h) => h.level));
    const current = Math.max(action.escalationLevel ?? 0, ...recorded);

    if (target <= current) return;

    // Record each newly-crossed level once (a first load can cross several
    // at once, e.g. an action already 10 days overdue). Each level has its
    // own recipient, so each gets its own history entry + notification.
    const newEntries = [];
    for (let level = current + 1; level <= target; level += 1) {
      if (recorded.has(level)) continue;
      newEntries.push({
        level,
        triggeredAt: now.toISOString(),
        overdueDays,
        recipientRole: ESCALATION_LEVELS[level].recipientRole,
        recipientLabel: ESCALATION_LEVELS[level].recipientLabel,
      });
    }

    // Persist first, then emit side effects — so the record can never be
    // left showing a level whose events were raised twice.
    const updated = updateCorrectiveAction(action.id, {
      escalationLevel: target,
      escalationHistory: [...history, ...newEntries],
    });

    newEntries.forEach((entry) => {
      raiseEscalationSideEffects(updated ?? action, entry);
      raised.push({ actionId: action.id, level: entry.level });
    });
  });

  return raised;
}

// --- Transitions ---------------------------------------------------------------

export function startProgress({ actionId, actor, role }) {
  assertRole('START_PROGRESS', role);
  const action = getCorrectiveActionById(actionId);
  if (!action) throw new Error('Corrective action not found.');
  assertScope(role, action);
  if (![CA_STATUS.OPEN, CA_STATUS.ASSIGNED].includes(action.status)) {
    throw new Error('This corrective action cannot be started from its current status.');
  }

  const fromLabel = action.status === CA_STATUS.ASSIGNED ? 'Assigned' : 'Open';
  const updated = updateCorrectiveAction(actionId, {
    status: CA_STATUS.IN_PROGRESS,
    startedAt: nowIso(),
    startedBy: actor,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Status Changed',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `Corrective Action Status Changed: ${fromLabel} → In Progress`,
  });

  // Let the Field Officer who raised the finding know work has begun.
  const reporter = reporterOf(action);
  createNotification({
    title: 'Corrective Action Started',
    description: `${actionId} moved to In Progress by ${actor}.`,
    type: 'info',
    entityType: 'CorrectiveAction',
    entityId: actionId,
    mineId: action.mineId,
    recipientRole: ROLES.FIELD_OFFICER,
    ...(reporter ? { recipientName: reporter } : {}),
  });

  return updated;
}

export function submitForVerification({ actionId, actor, role, completionNotes, evidence, remarks }) {
  assertRole('SUBMIT_FOR_VERIFICATION', role);
  const action = getCorrectiveActionById(actionId);
  if (!action) throw new Error('Corrective action not found.');
  assertScope(role, action);
  if (action.status !== CA_STATUS.IN_PROGRESS) {
    throw new Error('Only a corrective action that is In Progress can be submitted for verification.');
  }
  if (!completionNotes || !completionNotes.trim()) {
    throw new Error('Completion notes are required before submitting for verification.');
  }

  const updated = updateCorrectiveAction(actionId, {
    status: CA_STATUS.SUBMITTED_FOR_VERIFICATION,
    submittedAt: nowIso(),
    submittedBy: actor,
    completionNotes: completionNotes.trim(),
    remarks: remarks?.trim() || null,
    evidence: evidence || null,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Submitted for Verification',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `${actionId} submitted for verification by ${actor}.`,
  });

  createNotification({
    title: 'Verification Required',
    description: `${actionId} was submitted by ${actor} with evidence and is awaiting Compliance Officer review.`,
    type: 'warning',
    entityType: 'CorrectiveAction',
    entityId: actionId,
    mineId: action.mineId,
    recipientRole: ROLES.COMPLIANCE_OFFICER,
  });

  return updated;
}

function assertReviewable(action, verb) {
  if (action.status === CA_STATUS.CLOSED) {
    throw new Error(`This corrective action is already closed and cannot be ${verb} again.`);
  }
  if (action.status === CA_STATUS.VERIFIED) {
    throw new Error(`This corrective action was already verified and cannot be ${verb} again.`);
  }
  if (action.status !== CA_STATUS.SUBMITTED_FOR_VERIFICATION) {
    throw new Error(`Only a corrective action submitted for verification can be ${verb}.`);
  }
}

// Notifies the original assignee and the Field Officer who raised the issue.
function notifyClosed(action, actor) {
  const base = {
    title: 'Corrective Action Verified & Closed',
    description: `${action.id} (${action.title}) was verified and closed by ${actor}.`,
    type: 'info',
    entityType: 'CorrectiveAction',
    entityId: action.id,
    mineId: action.mineId,
  };
  createNotification({
    ...base,
    recipientRole: ROLES.MINE_MANAGER,
    recipientName: action.assignee,
  });
  const reporter = reporterOf(action);
  createNotification({
    ...base,
    recipientRole: ROLES.FIELD_OFFICER,
    ...(reporter ? { recipientName: reporter } : {}),
  });
}

/**
 * "Verify & Close" — the Compliance Officer's (or Administrator's) approval.
 * Verifies the submission and closes the corrective action in one step.
 */
export function verifyAction({ actionId, actor, role, verificationNotes }) {
  assertRole('VERIFY', role);
  assertRole('CLOSE', role);
  const action = getCorrectiveActionById(actionId);
  if (!action) throw new Error('Corrective action not found.');
  assertScope(role, action);
  assertReviewable(action, 'verified');

  const stamp = nowIso();
  const updated = updateCorrectiveAction(actionId, {
    status: CA_STATUS.CLOSED,
    verifiedAt: stamp,
    verifiedBy: actor,
    verificationNotes: verificationNotes?.trim() || null,
    closedAt: stamp,
    closedBy: actor,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Verified',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `${actionId} verified by ${actor}. Human compliance review — not an automated decision.`,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Closed',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `${actionId} closed by ${actor} following successful verification.`,
  });

  notifyClosed(action, actor);

  const issue = getIssueById(action.issueId);
  if (issue && issue.status !== 'CLOSED') {
    updateIssue(issue.id, { status: 'CLOSED' });
  }

  return updated;
}

export function rejectAction({ actionId, actor, role, rejectionReason, additionalInstructions }) {
  assertRole('REJECT', role);
  const action = getCorrectiveActionById(actionId);
  if (!action) throw new Error('Corrective action not found.');
  assertScope(role, action);
  assertReviewable(action, 'rejected');
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('A rejection reason is required.');
  }

  const updated = updateCorrectiveAction(actionId, {
    status: CA_STATUS.IN_PROGRESS,
    rejectedAt: nowIso(),
    rejectedBy: actor,
    rejectionReason: rejectionReason.trim(),
    additionalInstructions: additionalInstructions?.trim() || null,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Rejected / Reopened',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `${actionId} rejected by ${actor} and sent back for correction: ${rejectionReason.trim()}`,
  });

  // The assigned Mine Manager has to rework it, so they are the recipient.
  createNotification({
    title: 'Corrective Action Rejected — Correction Required',
    description: `${actionId} was rejected by ${actor} and returned to In Progress.`,
    type: 'critical',
    entityType: 'CorrectiveAction',
    entityId: actionId,
    mineId: action.mineId,
    recipientRole: ROLES.MINE_MANAGER,
    recipientName: action.assignee,
  });

  return updated;
}

// Only reachable for records left in VERIFIED by earlier builds — new
// verifications close immediately (see verifyAction).
export function closeAction({ actionId, actor, role }) {
  assertRole('CLOSE', role);
  const action = getCorrectiveActionById(actionId);
  if (!action) throw new Error('Corrective action not found.');
  assertScope(role, action);
  if (action.status === CA_STATUS.CLOSED) {
    throw new Error('This corrective action is already closed.');
  }
  if (action.status !== CA_STATUS.VERIFIED) {
    throw new Error('Only a verified corrective action can be closed.');
  }

  const updated = updateCorrectiveAction(actionId, {
    status: CA_STATUS.CLOSED,
    closedAt: nowIso(),
    closedBy: actor,
  });

  logAuditEvent({
    actor,
    role: roleLabel(role),
    action: 'Corrective Action Closed',
    entity: 'Corrective Action',
    entityId: actionId,
    mineId: action.mineId,
    description: `${actionId} closed by ${actor} following successful verification.`,
  });

  notifyClosed(action, actor);

  const issue = getIssueById(action.issueId);
  if (issue && issue.status !== 'CLOSED') {
    updateIssue(issue.id, { status: 'CLOSED' });
  }

  return updated;
}
