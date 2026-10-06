// Data layer for the Dashboard ("Command Center", /dashboard). Pure logic, no React, no Recharts —
// mirrors services/analyticsService.js and services/riskMapService.js so every number here uses the
// SAME definitions and the SAME risk engine; nothing is recomputed with a different rule.
//
// THIS IS DESCRIPTIVE, FROM EXISTING RECORDS — a frontend prototype over LocalStorage demo data.
// There is no trained model, no forecast and no real-time feed. "Updates live" means "recomputed on
// every read, including when another part of this browser tab changes LocalStorage" — not a server
// push or a real connection to any mine system.
//
// ── DEFINITIONS (same as the GIS Risk Map / Analytics, so the pages can't disagree) ─────────────
//   Open violation      An issue whose status is not CLOSED.
//   Mine risk score     Highest score among a mine's open issues (0 if none) — riskMapService.
//   Compliance %        100 − average score of the open issues in view (a prototype indicator; the
//                        data stores only a compliance STATUS per mine, not a percentage).
//   Active inspection   An inspection whose generated issue has not yet been closed. Every
//                        inspection in this app creates exactly one issue (see
//                        workflows/submissionPipeline.js); there is no separate inspection-status
//                        field in the data model, so "active" is defined through that issue.
//
// ── ROLE SCOPING (same rule as the rest of the app — see services/accessService.js) ──────────────
//   Field Officer      → its assigned mines, and only the issues/inspections IT reported
//   Mine Manager       → the mine(s) it manages
//   Compliance Officer → all mines
//   Administrator      → all mines
// Field Officer has no corrective-action visibility at all (capability matrix, data/roles.js:
// PERMISSIONS['ca.view']). The Overdue Corrective Actions KPI is reported as "not visible to your
// role" (null) rather than 0 for that role, so a missing permission is never shown as "zero
// overdue" — that would be a false compliance signal, not a real count.
import { getVisibleMines, canViewIssue, canViewAction, canViewInspection } from './accessService';
import {
  getIssues,
  getCorrectiveActions,
  getInspections,
  getIssueByInspectionId,
  getMineById,
  computeIssueRisk,
} from './dataService';
import { getMineRiskSummary } from './riskMapService';
import { getNotificationsForRole } from './notificationService';
import { calculateRisk, getRiskLevel, getRiskLevelLabel } from '../riskEngine/riskEngine';
import { RISK_COLORS } from '../data/constants';
import { can } from '../data/roles';
import { isOverdue, localDateISO, parseDate, DEMO_NOW } from '../utils/date';

export const LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const CLOSED_ACTION_STATUSES = new Set(['VERIFIED', 'CLOSED']);
// Fixed trend window for the dashboard widget — Analytics (/analytics) has the full, filterable
// history; this card is meant to be a quick, at-a-glance read, not a second analytics page.
const TREND_WINDOW_DAYS = 90;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const RECENT_LIMIT = 5;

const round1 = (n) => Math.round(n * 10) / 10;
const average = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const clampPct = (n) => Math.min(100, Math.max(0, Math.round(n)));

function addDays(iso, n) {
  const d = parseDate(iso);
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
function shortLabel(iso) {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// --- Scope: the records this role may see on the dashboard ---------------------------------------
function buildScope(role, now) {
  const mines = getVisibleMines(role);
  const mineIds = new Set(mines.map((m) => m.id));
  const allIssues = getIssues();
  const allActions = getCorrectiveActions();
  // Issue scope: mine-level scope AND (for Field Officer) own-reported only — the same predicate
  // Mine Detail / Issues already use.
  const issues = allIssues.filter((i) => mineIds.has(i.mineId) && canViewIssue(role, i));
  // Action scope: Field Officer has none at all (canViewAction is false for every action for that
  // role); Mine Manager / Compliance Officer / Administrator get the usual mine scope.
  const actions = allActions.filter((a) => mineIds.has(a.mineId) && canViewAction(role, a));
  const actionById = new Map(allActions.map((a) => [a.id, a]));
  const dates = [...allIssues.map((i) => i.observedDate), ...allActions.map((a) => a.createdDate)]
    .filter(Boolean)
    .sort();
  return {
    today: localDateISO(now),
    mines,
    issues,
    actions,
    actionById,
    dataStart: dates[0] ?? localDateISO(now),
  };
}

// --- Point-in-time reconstruction for the trend chart ---------------------------------------------
// Same rule as services/analyticsService.js: an issue is open on date D if it had been observed and
// not yet closed by D; its score on D uses its corrective action's deadline only while that action
// was still open on D. Deliberately NOT imported from analyticsService — that service's scope is
// mine-only and refuses Field Officer entirely, while this page scopes Field Officer down to its
// own reported issues and must show every role, so the two cannot share one scoped context. Keep
// the rule itself in sync with analyticsService.js if that formula ever changes.
function actionClosedOn(action) {
  if (!action || !CLOSED_ACTION_STATUSES.has(action.status)) return null;
  const stamp = action.closedAt ?? action.verifiedAt;
  return stamp ? localDateISO(new Date(stamp)) : action.createdDate;
}
function isIssueOpenOn(issue, date, ctx) {
  if (issue.observedDate > date) return false;
  if (issue.status !== 'CLOSED') return true;
  const closed = actionClosedOn(ctx.actionById.get(issue.correctiveActionId));
  return closed !== null && closed > date;
}
function scoreIssueOn(issue, date, ctx) {
  const action = ctx.actionById.get(issue.correctiveActionId);
  const closed = actionClosedOn(action);
  const stillOpen = action && (closed === null || closed > date);
  return calculateRisk(
    {
      severity: issue.severity,
      recurrenceCount: issue.recurrenceCount,
      exposureLevel: issue.exposureLevel,
      exposureWorkers: issue.exposureWorkers,
      correctiveActionDeadline: stillOpen ? action.dueDate : null,
    },
    parseDate(date)
  );
}

function buildRiskDistribution(openWithScores) {
  const total = openWithScores.length;
  return {
    total,
    levels: LEVELS.map((level) => {
      const count = openWithScores.filter((s) => s.level === level).length;
      return { level, label: getRiskLevelLabel(level), count, pct: pct(count, total), color: RISK_COLORS[level] };
    }),
  };
}

function buildComplianceTrend(issues, ctx) {
  const windowStart = addDays(ctx.today, -TREND_WINDOW_DAYS);
  const from = ctx.dataStart > windowStart ? ctx.dataStart : windowStart;
  const span = Math.round((parseDate(ctx.today) - parseDate(from)) / 86400000);
  const step = span <= 14 ? 1 : 7;
  const dates = [];
  for (let d = ctx.today; d >= from; d = addDays(d, -step)) dates.push(d);
  dates.reverse();
  if (dates.length === 0 || dates[dates.length - 1] !== ctx.today) dates.push(ctx.today);

  return dates.map((date) => {
    const scores = issues
      .filter((i) => isIssueOpenOn(i, date, ctx))
      .map((i) => scoreIssueOn(i, date, ctx).riskScore);
    const highCritical = scores.filter((s) => {
      const lv = getRiskLevel(s);
      return lv === 'HIGH' || lv === 'CRITICAL';
    }).length;
    return {
      date,
      label: shortLabel(date),
      openIssues: scores.length,
      highCritical,
      averageRisk: scores.length ? round1(average(scores)) : null,
      compliancePct: scores.length ? clampPct(100 - average(scores)) : null,
    };
  });
}

/**
 * Everything /dashboard shows, for one role.
 * @param {string} role - a ROLES id (see data/roles.js)
 * @param {Date} [now] - defaults to the demo clock; injectable for tests
 */
export function getDashboardData(role, now = DEMO_NOW) {
  const ctx = buildScope(role, now);

  // --- Issues: current (today) snapshot ------------------------------------------------------------
  const openIssues = ctx.issues.filter((i) => i.status !== 'CLOSED');
  const openWithScores = openIssues.map((issue) => {
    const risk = computeIssueRisk(issue, now);
    return { issue, score: risk.riskScore, level: risk.riskLevel };
  });
  const scores = openWithScores.map((s) => s.score);
  const highCriticalCount = openWithScores.filter((s) => s.level === 'HIGH' || s.level === 'CRITICAL').length;
  // 100% when nothing is open in scope (same convention as riskMapService.getMineRiskSummary / the
  // GIS Risk Map and Mine Detail pages for a mine with no open issues).
  const overallCompliancePct = scores.length ? clampPct(100 - average(scores)) : 100;

  // --- Corrective actions --------------------------------------------------------------------------
  const hasActionAccess = can('ca.view', role);
  const overdueActions = hasActionAccess ? ctx.actions.filter((a) => isOverdue(a.dueDate, a.status, now)) : [];

  // --- Inspections: "active" = its generated issue is not yet closed -------------------------------
  const inspections = getInspections()
    .filter((i) => canViewInspection(role, i))
    .map((i) => ({ ...i, mine: getMineById(i.mineId), issue: getIssueByInspectionId(i.id) }));
  const activeInspections = inspections.filter((i) => i.issue && i.issue.status !== 'CLOSED');

  // --- Mines: full scoped overview + the high-risk subset ------------------------------------------
  const mineRows = ctx.mines
    .map((mine) => ({
      id: mine.id,
      name: mine.name,
      region: mine.region,
      manager: mine.manager,
      ...getMineRiskSummary(mine.id),
    }))
    .sort((a, b) => b.riskScore - a.riskScore || b.openIssues - a.openIssues || a.name.localeCompare(b.name));
  const highRiskMines = mineRows.filter((m) => m.riskLevel === 'HIGH' || m.riskLevel === 'CRITICAL');

  // --- Recent activity -------------------------------------------------------------------------------
  const recentInspections = [...inspections]
    .sort((a, b) => (b.date !== a.date ? (b.date > a.date ? 1 : -1) : (b.createdAt ?? '').localeCompare(a.createdAt ?? '')))
    .slice(0, RECENT_LIMIT);
  const recentAlerts = getNotificationsForRole(role).slice(0, RECENT_LIMIT);

  return {
    asOf: ctx.today,
    kpis: {
      totalMines: ctx.mines.length,
      activeInspections: activeInspections.length,
      openViolations: openIssues.length,
      highCriticalIssues: highCriticalCount,
      overdueCorrectiveActions: hasActionAccess ? overdueActions.length : null,
      overallCompliancePct,
      hasActionAccess,
    },
    riskDistribution: buildRiskDistribution(openWithScores),
    complianceTrend: buildComplianceTrend(ctx.issues, ctx),
    recentAlerts,
    recentInspections,
    totalInspectionsInScope: inspections.length,
    mineRiskOverview: mineRows,
    highRiskMines,
  };
}
