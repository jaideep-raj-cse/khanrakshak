// Contractor domain logic (Step 5). Pages stay thin: everything that can be wrong —
// scope, derived statuses, counts, filtering, trend buckets, management rules — lives
// here so it can be tested in Node without a browser.
//
// Data model note: the seeded contractor record has no "contract status", "work area",
// "open violations" or "safety incidents" fields, and there is no incident log. Rather
// than change the data architecture, these are DERIVED at read time:
//
//   workArea          = contractor.serviceType
//   contractStatus    = from contractStart / contractEnd (Active · Expiring Soon · Expired ·
//                       Upcoming), or Suspended if a manager suspended it
//   openViolations    = linked issues (Issue.contractorId) whose status is not CLOSED
//   safetyIncidents   = linked issues (any status) that are Safety-domain findings OR
//                       severity 4–5 — i.e. isSafetyIncident() below
//
// Role rules (WHAT: data/roles.js PERMISSIONS · WHERE: services/accessService.js):
//   Field Officer       view contractors at assigned mines (read-only)
//   Mine Manager        view + manage contractors at its mine(s)
//   Compliance Officer  view all (read-only)
//   Administrator       view + manage all
import { ROLE_DETAILS, can } from '../data/roles';
import { getCategoryGroup } from '../data/constants';
import {
  getContractors,
  getContractorById,
  getMines,
  getIssuesWithRelations,
  updateContractor,
} from './dataService';
import { getAssignedMineIds, canViewMine, canViewIssue } from './accessService';
import { logAuditEvent, getAuditLog } from './auditService';
import { calendarDaysPastDue, formatDate, DEMO_NOW } from '../utils/date';

export const CONTRACT_STATUS = {
  ACTIVE: 'ACTIVE',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  UPCOMING: 'UPCOMING',
  SUSPENDED: 'SUSPENDED',
};

export const CONTRACT_EXPIRY_WARNING_DAYS = 60;
export const LICENCE_EXPIRY_WARNING_DAYS = 30;
export const REMARKS_MAX_LENGTH = 500;

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
const CLOSED_ISSUE_STATUSES = new Set(['CLOSED']);

// --- Date helpers ------------------------------------------------------------

// Whole calendar days from `now` until the date (negative once it has passed).
function daysUntil(iso, now) {
  const past = calendarDaysPastDue(iso, now);
  // 0 - past would give -0 on the due date itself; normalise so 0 stays 0.
  return past === null ? null : past === 0 ? 0 : -past;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// --- Derived status ---------------------------------------------------------

export function getContractStatus(contractor, now = DEMO_NOW) {
  if (contractor.contractStatusOverride === CONTRACT_STATUS.SUSPENDED) return CONTRACT_STATUS.SUSPENDED;
  const untilStart = daysUntil(contractor.contractStart, now);
  if (untilStart !== null && untilStart > 0) return CONTRACT_STATUS.UPCOMING;
  const untilEnd = daysUntil(contractor.contractEnd, now);
  if (untilEnd === null) return CONTRACT_STATUS.ACTIVE;
  if (untilEnd < 0) return CONTRACT_STATUS.EXPIRED;
  if (untilEnd <= CONTRACT_EXPIRY_WARNING_DAYS) return CONTRACT_STATUS.EXPIRING_SOON;
  return CONTRACT_STATUS.ACTIVE;
}

/** Days until the contract ends (negative if it already ended); null if no end date. */
export function getContractDaysRemaining(contractor, now = DEMO_NOW) {
  return daysUntil(contractor.contractEnd, now);
}

/**
 * Licence validity is reported next to the contract status because a contract can be
 * "Active" while the contractor's licence has lapsed — the case an officer most needs to see.
 * @returns {{status:'VALID'|'EXPIRING'|'LAPSED'|'UNKNOWN', daysRemaining:number|null,
 *            label:string, short:string|null, needsAttention:boolean}}
 */
export function getLicenceStatus(contractor, now = DEMO_NOW) {
  const d = daysUntil(contractor.licenseValidTill, now);
  if (d === null) {
    return { status: 'UNKNOWN', daysRemaining: null, label: 'No licence date on record', short: null, needsAttention: false };
  }
  if (d < 0) {
    return {
      status: 'LAPSED',
      daysRemaining: d,
      label: `Lapsed ${plural(-d, 'day')} ago`,
      short: 'Licence lapsed',
      needsAttention: true,
    };
  }
  if (d <= LICENCE_EXPIRY_WARNING_DAYS) {
    return {
      status: 'EXPIRING',
      daysRemaining: d,
      label: d === 0 ? 'Expires today' : `Expires in ${plural(d, 'day')}`,
      short: d === 0 ? 'Licence expires today' : `Licence expires in ${plural(d, 'day')}`,
      needsAttention: true,
    };
  }
  return {
    status: 'VALID',
    daysRemaining: d,
    label: `Valid till ${formatDate(contractor.licenseValidTill)}`,
    short: null,
    needsAttention: false,
  };
}

// --- Findings → counts --------------------------------------------------------

/**
 * The prototype has no separate incident log, so a "safety incident" is a linked finding
 * that is either in the Safety governance domain or rated severity 4–5. Change this one
 * predicate to change the definition everywhere.
 */
export function isSafetyIncident(issue) {
  return getCategoryGroup(issue.category) === 'Safety' || issue.severity >= 4;
}

export function summariseFindings(issues) {
  const open = issues.filter((i) => !CLOSED_ISSUE_STATUSES.has(i.status));
  const peakOpen = open.reduce((best, i) => (!best || i.riskScore > best.riskScore ? i : best), null);
  return {
    totalFindings: issues.length,
    openViolations: open.length,
    safetyIncidents: issues.filter(isSafetyIncident).length,
    peakOpenRiskScore: peakOpen ? peakOpen.riskScore : null,
    peakOpenRiskLevel: peakOpen ? peakOpen.riskLevel : null,
  };
}

/** All issues linked to a contractor (computed risk attached), regardless of viewer scope. */
export function getLinkedIssues(contractorId) {
  return getIssuesWithRelations().filter((i) => i.contractorId === contractorId);
}

// --- Scope -------------------------------------------------------------------

/** Mines a contractor works at. Seed data has one mine each; the model allows several. */
export function getContractorMineIds(contractor) {
  const ids = Array.isArray(contractor.mineIds) && contractor.mineIds.length ? contractor.mineIds : [contractor.mineId];
  return [...new Set(ids.filter(Boolean))];
}

export function canViewContractor(role, contractor) {
  if (!contractor || !can('contractors.view', role)) return false;
  if (getAssignedMineIds(role) === null) return true; // Compliance Officer / Administrator
  return getContractorMineIds(contractor).some((mineId) => canViewMine(role, mineId));
}

/** Mine Manager: only contractors at its own mine(s). Administrator: all. Others: never. */
export function canManageContractor(role, contractor) {
  return can('contractors.manage', role) && canViewContractor(role, contractor);
}

// --- List rows ---------------------------------------------------------------

function buildRow(contractor, issues, minesById, now) {
  const mines = getContractorMineIds(contractor).map((id) => ({ id, name: minesById.get(id)?.name ?? id }));
  const stats = summariseFindings(issues);
  return {
    ...contractor,
    mines,
    mineNames: mines.map((m) => m.name).join(', '),
    workArea: contractor.serviceType ?? '—',
    contractStatus: getContractStatus(contractor, now),
    contractDaysRemaining: getContractDaysRemaining(contractor, now),
    licence: getLicenceStatus(contractor, now),
    ...stats,
  };
}

/** Default list order: highest risk first, then most open violations, then name. */
export function compareContractorsByAttention(a, b) {
  return (
    (RISK_ORDER[b.riskLevel] ?? 0) - (RISK_ORDER[a.riskLevel] ?? 0) ||
    b.openViolations - a.openViolations ||
    a.name.localeCompare(b.name)
  );
}

/** Contractors the role may see, with derived columns, ordered by attention needed. */
export function getContractorRows(role, now = DEMO_NOW) {
  const minesById = new Map(getMines().map((m) => [m.id, m]));
  const issuesByContractor = new Map();
  getIssuesWithRelations().forEach((issue) => {
    if (!issue.contractorId) return;
    if (!issuesByContractor.has(issue.contractorId)) issuesByContractor.set(issue.contractorId, []);
    issuesByContractor.get(issue.contractorId).push(issue);
  });

  return getContractors()
    .filter((c) => canViewContractor(role, c))
    .map((c) => buildRow(c, issuesByContractor.get(c.id) ?? [], minesById, now))
    .sort(compareContractorsByAttention);
}

/**
 * @param {Object} f
 * @param {string} [f.search] name, id, mine, work area or contact person
 * @param {string} [f.mineId] 'ALL' or a mine id
 * @param {string} [f.riskLevel] 'ALL' | LOW | MODERATE | HIGH | CRITICAL
 * @param {string} [f.complianceStatus] 'ALL' | COMPLIANT | UNDER_REVIEW | NON_COMPLIANT
 * @param {string} [f.contractStatus] 'ALL' | a CONTRACT_STATUS value
 */
export function filterContractors(rows, f = {}) {
  const q = (f.search ?? '').trim().toLowerCase();
  const is = (value, filter) => !filter || filter === 'ALL' || value === filter;
  return rows.filter((row) => {
    const matchesSearch =
      !q ||
      [row.name, row.id, row.mineNames, row.workArea, row.contactPerson].some((v) => (v ?? '').toLowerCase().includes(q));
    const matchesMine = !f.mineId || f.mineId === 'ALL' || row.mines.some((m) => m.id === f.mineId);
    return (
      matchesSearch &&
      matchesMine &&
      is(row.riskLevel, f.riskLevel) &&
      is(row.complianceStatus, f.complianceStatus) &&
      is(row.contractStatus, f.contractStatus)
    );
  });
}

// --- Detail ------------------------------------------------------------------

/**
 * Everything the detail page needs, or null if the contractor does not exist or is outside
 * the role's scope (the page shows the same "not found" for both, so scope can't be probed).
 *
 * `linkedIssues` is what this role may open (Field Officer: only issues it reported — the
 * existing canViewIssue rule). Counts always cover ALL linked issues, because they are facts
 * about the contractor; `hiddenIssueCount` tells the page how many are outside the viewer's access.
 */
export function getContractorDetail(contractorId, role, now = DEMO_NOW) {
  const contractor = getContractorById(contractorId);
  if (!contractor || !canViewContractor(role, contractor)) return null;

  const minesById = new Map(getMines().map((m) => [m.id, m]));
  const allIssues = getLinkedIssues(contractorId);
  const row = buildRow(contractor, allIssues, minesById, now);
  const linkedIssues = allIssues.filter((i) => canViewIssue(role, i));

  return {
    ...row,
    linkedIssues,
    hiddenIssueCount: allIssues.length - linkedIssues.length,
    trend: getFindingsTrend(allIssues, now),
    canManage: canManageContractor(role, contractor),
  };
}

// --- Findings trend ----------------------------------------------------------

/**
 * Findings per calendar month over the last `months` months, by the date each finding was
 * first observed. The data model holds no historical risk scores, so `peakLevel` is the
 * highest CURRENT risk level among that month's findings — not the risk at the time.
 */
export function getFindingsTrend(issues, now = DEMO_NOW, months = 6) {
  const buckets = [];
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-IN', { month: 'short' }),
      fullLabel: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }),
      findings: 0,
      safetyIncidents: 0,
      peakScore: null,
      peakLevel: null,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));
  let outsideWindow = 0;

  issues.forEach((issue) => {
    const bucket = byKey.get((issue.observedDate ?? '').slice(0, 7));
    if (!bucket) {
      outsideWindow += 1;
      return;
    }
    bucket.findings += 1;
    if (isSafetyIncident(issue)) bucket.safetyIncidents += 1;
    if (bucket.peakScore === null || issue.riskScore > bucket.peakScore) {
      bucket.peakScore = issue.riskScore;
      bucket.peakLevel = issue.riskLevel;
    }
  });

  const monthsWithFindings = buckets.filter((b) => b.findings > 0).length;
  return {
    months: buckets,
    maxFindings: Math.max(0, ...buckets.map((b) => b.findings)),
    monthsWithFindings,
    outsideWindow,
    // A trend needs at least two data points.
    hasTrend: monthsWithFindings >= 2,
  };
}

// --- Timeline ----------------------------------------------------------------

const REGISTER = { actor: 'System', role: 'Contractor Register' };

/**
 * Local calendar date (YYYY-MM-DD) of an ISO timestamp. Slicing the UTC string would show the
 * previous day for events logged just after local midnight (e.g. 00:00–05:30 in IST).
 */
export function toLocalISODate(isoTimestamp) {
  if (!isoTimestamp) return null;
  const d = new Date(isoTimestamp);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Audit-style history, oldest first (same convention as the issue / action timelines). */
export function buildContractorTimeline(contractor, issues, now = DEMO_NOW) {
  if (!contractor) return [];
  const events = [];
  const started = daysUntil(contractor.contractStart, now);

  if (contractor.contractStart && started !== null && started <= 0) {
    events.push({
      date: contractor.contractStart,
      ...REGISTER,
      action: 'Contract Started',
      description: `${contractor.serviceType} contract began; runs to ${formatDate(contractor.contractEnd)}.`,
    });
  }

  if (contractor.lastAuditDate) {
    events.push({
      date: contractor.lastAuditDate,
      ...REGISTER,
      action: 'Compliance Audit Recorded',
      description: `Last recorded audit. Compliance score ${contractor.complianceScore}/100.`,
    });
  }

  if (getLicenceStatus(contractor, now).status === 'LAPSED') {
    events.push({
      date: contractor.licenseValidTill,
      ...REGISTER,
      action: 'Licence Lapsed',
      description: `${contractor.licenseNumber} passed its validity date without a recorded renewal.`,
    });
  }

  issues.forEach((issue) => {
    events.push({
      date: issue.observedDate,
      actor: issue.reportedBy,
      role: issue.reportedByRole,
      action: 'Finding Logged',
      description: `${issue.id} — ${issue.title}`,
    });
  });

  // The audit log is stored newest-first; walk it oldest-first so events on the same day
  // (suspend then reinstate) keep their real order through the stable sort below.
  [...getAuditLog()]
    .reverse()
    .filter((e) => e.entity === 'Contractor' && e.entityId === contractor.id)
    .forEach((e) => {
      events.push({
        date: toLocalISODate(e.timestamp),
        sortAt: e.timestamp,
        actor: e.actor,
        role: e.role,
        action: e.action,
        description: e.description,
      });
    });

  const untilEnd = daysUntil(contractor.contractEnd, now);
  if (untilEnd !== null && untilEnd < 0) {
    events.push({
      date: contractor.contractEnd,
      ...REGISTER,
      action: 'Contract Ended',
      description: 'Contract end date passed.',
    });
  }

  return events
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.sortAt ?? a.date) - new Date(b.sortAt ?? b.date))
    .map(({ sortAt, ...e }) => ({ ...e, displayDate: formatDate(e.date) }));
}

// --- Management actions ------------------------------------------------------
// Local-storage only (no backend). Each action re-checks role AND scope itself, so a role
// can't bypass the UI by calling the function, and each writes one audit event.

function roleLabel(role) {
  return ROLE_DETAILS[role]?.name ?? role;
}

function loadManageable(contractorId, role) {
  if (!can('contractors.manage', role)) {
    throw new Error('You do not have permission to manage contractors.');
  }
  const contractor = getContractorById(contractorId);
  if (!contractor) throw new Error('Contractor not found.');
  if (!canViewContractor(role, contractor)) {
    throw new Error('This contractor is outside your assigned mine(s).');
  }
  return contractor;
}

function audit(contractor, { actor, role, action, description }) {
  logAuditEvent({
    actor,
    role: roleLabel(role),
    action,
    entity: 'Contractor',
    entityId: contractor.id,
    mineId: contractor.mineId,
    description,
  });
}

export function suspendContract({ contractorId, actor, role, reason }) {
  const contractor = loadManageable(contractorId, role);
  if (contractor.contractStatusOverride === CONTRACT_STATUS.SUSPENDED) {
    throw new Error('This contract is already suspended.');
  }
  const trimmed = (reason ?? '').trim();
  if (!trimmed) throw new Error('A reason is required to suspend a contract.');
  if (trimmed.length > REMARKS_MAX_LENGTH) {
    throw new Error(`Keep the reason under ${REMARKS_MAX_LENGTH} characters.`);
  }

  const updated = updateContractor(contractorId, {
    contractStatusOverride: CONTRACT_STATUS.SUSPENDED,
    suspension: { reason: trimmed, by: actor, role: roleLabel(role), at: new Date().toISOString() },
  });
  audit(contractor, {
    actor,
    role,
    action: 'Contract Suspended',
    description: `${contractor.name} contract suspended by ${actor}. Reason: ${trimmed}`,
  });
  return updated;
}

export function reinstateContract({ contractorId, actor, role }) {
  const contractor = loadManageable(contractorId, role);
  if (contractor.contractStatusOverride !== CONTRACT_STATUS.SUSPENDED) {
    throw new Error('Only a suspended contract can be reinstated.');
  }
  const updated = updateContractor(contractorId, { contractStatusOverride: null, suspension: null });
  audit(contractor, {
    actor,
    role,
    action: 'Contract Reinstated',
    description: `${contractor.name} contract reinstated by ${actor}.`,
  });
  return updated;
}

export function updateContractorRemarks({ contractorId, actor, role, remarks }) {
  const contractor = loadManageable(contractorId, role);
  const trimmed = (remarks ?? '').trim();
  if (trimmed.length > REMARKS_MAX_LENGTH) {
    throw new Error(`Keep remarks under ${REMARKS_MAX_LENGTH} characters.`);
  }
  const updated = updateContractor(contractorId, { remarks: trimmed });
  audit(contractor, {
    actor,
    role,
    action: 'Contractor Remarks Updated',
    description: `Remarks on ${contractor.name} updated by ${actor}.`,
  });
  return updated;
}
