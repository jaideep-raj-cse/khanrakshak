// Central read/write layer for the demo data model. Pages should go through
// these functions rather than reading storage.KEYS directly, so relationship
// logic (mine → issues → corrective actions) and risk computation live in
// one place.
import { storage } from '../storage/localStorage';
import { isOverdue, DEMO_NOW } from '../utils/date';
import { calculateRisk } from '../riskEngine/riskEngine';
import { applyHeroScenario, HERO_SCENARIO_ID } from '../riskEngine/heroScenario';

const CLOSED_ISSUE_STATUSES = new Set(['CLOSED']);
const CLOSED_ACTION_STATUSES = new Set(['VERIFIED', 'CLOSED']);

// --- Mines ------------------------------------------------------------------

export function getMines() {
  return storage.read(storage.KEYS.MINES, []);
}

export function getMineById(mineId) {
  return getMines().find((m) => m.id === mineId) ?? null;
}

// --- Issues -------------------------------------------------------------

export function getIssues() {
  return storage.read(storage.KEYS.ISSUES, []);
}

export function getIssueById(issueId) {
  return getIssues().find((i) => i.id === issueId) ?? null;
}

export function getIssuesByMineRaw(mineId) {
  return getIssues().filter((i) => i.mineId === mineId);
}

export function addIssue(issue) {
  const issues = getIssues();
  const updated = [issue, ...issues];
  storage.write(storage.KEYS.ISSUES, updated);
  return issue;
}

// Step 4: partial update used by the corrective-action workflow when a
// linked issue needs to reflect the lifecycle (e.g. → ESCALATED, → CLOSED).
export function updateIssue(issueId, patch) {
  const issues = getIssues();
  const idx = issues.findIndex((i) => i.id === issueId);
  if (idx === -1) return null;
  const updated = { ...issues[idx], ...patch };
  const next = [...issues];
  next[idx] = updated;
  storage.write(storage.KEYS.ISSUES, next);
  return updated;
}

// --- Corrective Actions ---------------------------------------------------

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

export function addCorrectiveAction(action) {
  const actions = getCorrectiveActions();
  const updated = [action, ...actions];
  storage.write(storage.KEYS.CORRECTIVE_ACTIONS, updated);
  return action;
}

// Step 4: the corrective-action lifecycle (status transitions, verification,
// escalation) is implemented as partial updates through this single
// function, so every workflow function in
// src/workflows/correctiveActionWorkflow.js updates records the same way and
// nothing silently overwrites unrelated fields.
export function updateCorrectiveAction(actionId, patch) {
  const actions = getCorrectiveActions();
  const idx = actions.findIndex((a) => a.id === actionId);
  if (idx === -1) return null;
  const updated = { ...actions[idx], ...patch };
  const next = [...actions];
  next[idx] = updated;
  storage.write(storage.KEYS.CORRECTIVE_ACTIONS, next);
  return updated;
}

// --- Inspections (Step 3) --------------------------------------------------

export function getInspections() {
  return storage.read(storage.KEYS.INSPECTIONS, []);
}

export function getInspectionsByMine(mineId) {
  return getInspections().filter((i) => i.mineId === mineId);
}

export function addInspection(inspection) {
  const inspections = getInspections();
  const updated = [inspection, ...inspections];
  storage.write(storage.KEYS.INSPECTIONS, updated);
  return inspection;
}

export function getIssueByInspectionId(inspectionId) {
  return getIssues().find((i) => i.inspectionId === inspectionId) ?? null;
}

// --- Contractors & Documents --------------------------------------------------

export function getContractors() {
  return storage.read(storage.KEYS.CONTRACTORS, []);
}

export function getContractorById(contractorId) {
  return getContractors().find((c) => c.id === contractorId) ?? null;
}

export function getContractorsByMine(mineId) {
  return getContractors().filter((c) => c.mineId === mineId);
}

// Step 5: partial update for a contractor record (suspend / reinstate / remarks).
// Same shape as updateIssue / updateCorrectiveAction — merges the patch, never
// replaces the record.
export function updateContractor(contractorId, patch) {
  const contractors = getContractors();
  const idx = contractors.findIndex((c) => c.id === contractorId);
  if (idx === -1) return null;
  const updated = { ...contractors[idx], ...patch };
  const next = [...contractors];
  next[idx] = updated;
  storage.write(storage.KEYS.CONTRACTORS, next);
  return updated;
}

export function getDocuments() {
  return storage.read(storage.KEYS.DOCUMENTS, []);
}

export function getDocumentById(documentId) {
  return getDocuments().find((d) => d.id === documentId) ?? null;
}

export function getDocumentsByMine(mineId) {
  return getDocuments().filter((d) => d.mineId === mineId);
}

// Step 5b: new documents go on the front (newest first, like issues / actions).
export function addDocument(document) {
  storage.write(storage.KEYS.DOCUMENTS, [document, ...getDocuments()]);
  return document;
}

export function removeDocument(documentId) {
  const documents = getDocuments();
  const next = documents.filter((d) => d.id !== documentId);
  if (next.length === documents.length) return false;
  storage.write(storage.KEYS.DOCUMENTS, next);
  return true;
}

// --- Derived/join helpers ---------------------------------------------------

export function getOpenIssueCount(mineId) {
  return getIssuesByMineRaw(mineId).filter((i) => !CLOSED_ISSUE_STATUSES.has(i.status)).length;
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

export function getMineManager(mineId) {
  const mine = getMineById(mineId);
  return mine ? { name: mine.manager, role: 'Mine Manager' } : null;
}

// --- Risk computation (Step 3) ----------------------------------------------
// Risk is never stored on the issue — it's computed fresh every time it's
// read, using the issue's raw inputs plus its corrective action's deadline
// (only if that action is still open). This is what lets an issue's risk
// climb on its own once a deadline passes, without anything re-saving it.
export function computeIssueRisk(issue, currentDemoDate = DEMO_NOW) {
  // The engine counts delay as fractional days from the deadline's midnight and
  // rounds, so a mid-afternoon clock would add a day (4 days overdue → 5 after
  // noon) and disagree with the calendar-day "N days overdue" shown on badges
  // and used by escalation. Handing it the START of the local day makes the
  // delay whole calendar days everywhere. The risk formula itself is untouched.
  const asOfDay = new Date(
    currentDemoDate.getFullYear(),
    currentDemoDate.getMonth(),
    currentDemoDate.getDate()
  );
  const correctiveAction = issue.correctiveActionId
    ? getCorrectiveActionById(issue.correctiveActionId)
    : null;
  const openCorrectiveActionDeadline =
    correctiveAction && !CLOSED_ACTION_STATUSES.has(correctiveAction.status)
      ? correctiveAction.dueDate
      : null;

  const result = calculateRisk(
    {
      severity: issue.severity,
      recurrenceCount: issue.recurrenceCount,
      exposureLevel: issue.exposureLevel,
      exposureWorkers: issue.exposureWorkers,
      correctiveActionDeadline: openCorrectiveActionDeadline,
    },
    asOfDay
  );

  // Issues created by the scripted SIH hero scenario keep their 87 / Critical on every read, not
  // just at submit time. All other issues (incl. the seeded hero) are untouched.
  const risk = issue.scriptedRisk === HERO_SCENARIO_ID ? applyHeroScenario(result) : result;
  return { ...risk, correctiveAction };
}

// Attaches the mine, computed risk, and (if any) corrective action to an issue.
export function getIssueWithRelations(issueId) {
  const issue = getIssueById(issueId);
  if (!issue) return null;
  const { correctiveAction, ...risk } = computeIssueRisk(issue);
  return {
    ...issue,
    mine: getMineById(issue.mineId),
    correctiveAction,
    riskScore: risk.riskScore,
    riskLevel: risk.riskLevel,
    riskReasons: risk.reasons,
    riskBreakdown: risk.breakdown,
  };
}

export function getIssuesWithRelations() {
  return getIssues().map((issue) => {
    const { correctiveAction, ...risk } = computeIssueRisk(issue);
    return {
      ...issue,
      mine: getMineById(issue.mineId),
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      riskReasons: risk.reasons,
      overdue: correctiveAction ? isOverdue(correctiveAction.dueDate, correctiveAction.status) : false,
    };
  });
}

// Mine Detail's issue list — same computed risk fields as getIssueWithRelations,
// scoped to one mine.
export function getIssuesByMine(mineId) {
  return getIssuesByMineRaw(mineId).map((issue) => {
    const { correctiveAction, ...risk } = computeIssueRisk(issue);
    return {
      ...issue,
      riskScore: risk.riskScore,
      riskLevel: risk.riskLevel,
      riskReasons: risk.reasons,
      overdue: correctiveAction ? isOverdue(correctiveAction.dueDate, correctiveAction.status) : false,
    };
  });
}

export function getCorrectiveActionsWithRelations() {
  return getCorrectiveActions().map((action) => ({
    ...action,
    mine: getMineById(action.mineId),
    issue: getIssueById(action.issueId),
    overdue: isOverdue(action.dueDate, action.status),
  }));
}
