// Central read layer for the demo data model. Pages should go through these
// functions rather than reading storage.KEYS directly, so relationship logic
// (mine → issues → corrective actions) lives in one place.
import { storage } from '../storage/localStorage';
import { isOverdue } from '../utils/date';

const CLOSED_ISSUE_STATUSES = new Set(['CLOSED']);
const CLOSED_ACTION_STATUSES = new Set(['VERIFIED', 'CLOSED']);

export function getMines() {
  return storage.read(storage.KEYS.MINES, []);
}

export function getMineById(mineId) {
  return getMines().find((m) => m.id === mineId) ?? null;
}

export function getIssues() {
  return storage.read(storage.KEYS.ISSUES, []);
}

export function getIssueById(issueId) {
  return getIssues().find((i) => i.id === issueId) ?? null;
}

export function getIssuesByMine(mineId) {
  return getIssues().filter((i) => i.mineId === mineId);
}

export function getCorrectiveActions() {
  return storage.read(storage.KEYS.CORRECTIVE_ACTIONS, []);
}

export function getCorrectiveActionById(actionId) {
  return getCorrectiveActions().find((a) => a.id === actionId) ?? null;
}

export function getCorrectiveActionsByIssue(issueId) {
  return getCorrectiveActions().filter((a) => a.issueId === issueId);
}

export function getCorrectiveActionsByMine(mineId) {
  return getCorrectiveActions().filter((a) => a.mineId === mineId);
}

// --- Derived/join helpers -------------------------------------------------

export function getOpenIssueCount(mineId) {
  return getIssuesByMine(mineId).filter((i) => !CLOSED_ISSUE_STATUSES.has(i.status)).length;
}

export function getPendingActionCount(mineId) {
  return getCorrectiveActionsByMine(mineId).filter((a) => !CLOSED_ACTION_STATUSES.has(a.status))
    .length;
}

export function getOverdueActionCount(mineId) {
  return getCorrectiveActionsByMine(mineId).filter((a) => isOverdue(a.dueDate, a.status)).length;
}

// Attaches computed counts to a mine record without mutating storage.
export function withMineStats(mine) {
  return {
    ...mine,
    openIssues: getOpenIssueCount(mine.id),
    pendingActions: getPendingActionCount(mine.id),
    overdueActions: getOverdueActionCount(mine.id),
  };
}

export function getMinesWithStats() {
  return getMines().map(withMineStats);
}

// Attaches the mine and (if any) corrective action to an issue.
export function getIssueWithRelations(issueId) {
  const issue = getIssueById(issueId);
  if (!issue) return null;
  return {
    ...issue,
    mine: getMineById(issue.mineId),
    correctiveAction: issue.correctiveActionId
      ? getCorrectiveActionById(issue.correctiveActionId)
      : null,
  };
}

export function getIssuesWithRelations() {
  return getIssues().map((issue) => ({
    ...issue,
    mine: getMineById(issue.mineId),
    overdue: issue.correctiveActionId
      ? isOverdue(getCorrectiveActionById(issue.correctiveActionId)?.dueDate, issue.status)
      : false,
  }));
}

export function getCorrectiveActionsWithRelations() {
  return getCorrectiveActions().map((action) => ({
    ...action,
    mine: getMineById(action.mineId),
    issue: getIssueById(action.issueId),
    overdue: isOverdue(action.dueDate, action.status),
  }));
}
