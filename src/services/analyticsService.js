// Data layer for Analytics / Risk Intelligence (/analytics, /analytics/risk-engine).
// Pure logic — no React, no Recharts — so every number on the page can be verified in Node.
// It only READS existing demo data (dataService / accessService / contractorService); nothing is
// stored here, and the risk formula is never re-implemented: every score comes from
// riskEngine.calculateRisk().
//
// THIS IS DESCRIPTIVE ANALYTICS. There is no trained model and no forecast: every figure is a
// count or average over records that already exist, and future dates are not accepted.
//
// ── HISTORY IS RECONSTRUCTED, NOT STORED ──────────────────────────────────────────────────────
// The seed holds dated records, not a time-series. A trend point for date t is rebuilt from them:
//   • an issue is OPEN on t when it was observed on or before t and had not been closed by t
//     (closure date = its corrective action's closedAt / verifiedAt);
//   • its score on t is calculateRisk() with the issue's inputs and, as the delay input, its
//     corrective action's deadline — but only if that action was still open on t.
// Severity, recurrence and exposure are the values recorded NOW, so a trend moves because issues
// arrive, close and deadlines pass — not because anything was re-rated. The page says so.
//
// ── DEFINITIONS (shared with the GIS Risk Map, so the two pages can't disagree) ──────────────
//   Mine risk score  highest score among the mine's open issues (0 if none)
//   Compliance %     100 − average score of the open issues in view (a prototype indicator; the
//                    data stores only a compliance STATUS). Left blank when nothing is open.
//   At today's date and with no filters, every figure here equals the Risk Map's.
//
// ── WHAT EACH FILTER DOES ─────────────────────────────────────────────────────────────────────
//   Date range  TREND charts (compliance, overdue, mine-level) plot the portfolio's state at
//               each date in the range, using all records up to that date. SNAPSHOT charts (risk
//               distribution, mine comparison, recurring violations, KPIs, risk engine drivers)
//               use issues FIRST OBSERVED inside the range, scored as of the range's end date.
//               Contractor risk is a current attribute and ignores the range.
//   Mine        every chart (contractor risk: contractors working at that mine)
//   Category    every chart except contractor risk (contractors carry no category)
// Scope: Mine Manager → own mine(s) only; Compliance Officer / Administrator → all mines.
// Field Officers have no Analytics page (NAV_PERMISSIONS), and the service refuses them too.
import { canAccess } from '../data/roles';
import { ISSUE_CATEGORIES, RISK_COLORS, getCategoryGroup } from '../data/constants';
import {
  calculateRisk,
  getRiskLevel,
  getRiskLevelLabel,
  RISK_WEIGHTS,
  RISK_LEVEL_THRESHOLDS,
} from '../riskEngine/riskEngine';
import { getIssues, getCorrectiveActions } from './dataService';
import { getVisibleMines } from './accessService';
import { getContractorRows } from './contractorService';
import { calendarDaysOverdue, formatDate, localDateISO, parseDate, DEMO_NOW } from '../utils/date';

export const RANGE_PRESETS = [
  { value: 'ALL', label: 'All data' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '180', label: 'Last 180 days' },
  { value: 'CUSTOM', label: 'Custom range' },
];

export const LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
export const MAX_TREND_MINES = 5;
const MAX_TREND_POINTS = 60;
const CLOSED_ACTION_STATUSES = new Set(['VERIFIED', 'CLOSED']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Colours for per-mine lines. Deliberately NOT the red/amber/green risk colours, so a line's colour
// identifies a mine and is never mistaken for a risk level.
export const MINE_SERIES_COLORS = ['#F59E0B', '#38BDF8', '#A78BFA', '#34D399', '#F472B6', '#94A3B8'];

export function canViewAnalytics(role) {
  return canAccess('analytics', role);
}

// --- Small date helpers (all ISO YYYY-MM-DD, local calendar days) ---------------------------------

const isIso = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && parseDate(v) !== null;
const startOfDay = (iso) => parseDate(iso);
function addDays(iso, n) {
  const d = parseDate(iso);
  return localDateISO(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
const daysBetweenIso = (from, to) => Math.round((parseDate(to) - parseDate(from)) / 86400000);
const toLocalDate = (timestamp) => localDateISO(new Date(timestamp));
function shortLabel(iso) {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// --- Context: everything the role may see, loaded once per call -------------------------------------

function buildContext(role, now) {
  const mines = getVisibleMines(role);
  const mineIds = new Set(mines.map((m) => m.id));
  const issues = getIssues().filter((i) => mineIds.has(i.mineId));
  const actions = getCorrectiveActions().filter((a) => mineIds.has(a.mineId));
  const actionById = new Map(getCorrectiveActions().map((a) => [a.id, a]));
  const issueById = new Map(getIssues().map((i) => [i.id, i]));
  const dates = [...issues.map((i) => i.observedDate), ...actions.map((a) => a.createdDate)].filter(isIso).sort();
  return {
    today: localDateISO(now),
    mines,
    mineIds,
    issues,
    actions,
    actionById,
    issueById,
    dataStart: dates[0] ?? localDateISO(now),
  };
}

// --- Filters -----------------------------------------------------------------------------------------

/** Filter options the UI offers this role. */
export function getFilterOptions(role, now = DEMO_NOW) {
  const ctx = buildContext(role, now);
  return {
    mines: [{ value: 'ALL', label: ctx.mines.length > 1 ? 'All Mines' : 'My Mine' }, ...ctx.mines.map((m) => ({ value: m.id, label: m.name }))],
    categories: [{ value: 'ALL', label: 'All Categories' }, ...ISSUE_CATEGORIES.map((c) => ({ value: c, label: c }))],
    presets: RANGE_PRESETS,
    today: ctx.today,
    dataStart: ctx.dataStart,
  };
}

/**
 * Turns raw (possibly hand-edited URL) filter values into a safe, canonical set.
 * Never throws: bad values fall back to the default, and anything that was adjusted is listed in
 * `notes` so the page can say so instead of silently showing something else.
 *   • a mine outside the role's scope falls back to "all of the role's mines" (no leak, no error)
 *   • the end date can't be in the future (no forecasting) and the start can't precede the first record
 */
export function resolveFilters(raw = {}, role, now = DEMO_NOW, ctxIn = null) {
  const ctx = ctxIn ?? buildContext(role, now);
  const notes = [];
  const preset = RANGE_PRESETS.some((p) => p.value === raw.preset) ? raw.preset : 'ALL';

  let from;
  let to;
  if (preset === 'CUSTOM') {
    from = isIso(raw.from) ? raw.from : ctx.dataStart;
    to = isIso(raw.to) ? raw.to : ctx.today;
  } else if (preset === 'ALL') {
    from = ctx.dataStart;
    to = ctx.today;
  } else {
    to = ctx.today;
    from = addDays(ctx.today, -Number(preset));
  }
  if (to > ctx.today) {
    to = ctx.today;
    notes.push(`End date moved back to today (${formatDate(ctx.today)}) — future dates are not shown.`);
  }
  if (from > to) [from, to] = [to, from];
  if (from < ctx.dataStart) {
    from = ctx.dataStart;
    if (preset === 'CUSTOM') notes.push(`Start date moved to the first record (${formatDate(ctx.dataStart)}).`);
  }
  if (from > to) from = to;

  const mineId = raw.mineId && ctx.mineIds.has(raw.mineId) ? raw.mineId : 'ALL';
  const category = ISSUE_CATEGORIES.includes(raw.category) ? raw.category : 'ALL';
  return { preset, from, to, mineId, category, notes };
}

/** Trend sample dates: the end date, then back in equal steps while still inside the range. */
export function getTrendDates(from, to) {
  const span = daysBetweenIso(from, to);
  const baseStep = span <= 14 ? 1 : span <= 210 ? 7 : 30;
  const step = Math.max(baseStep, Math.ceil(span / MAX_TREND_POINTS));
  const dates = [];
  for (let d = to; d >= from; d = addDays(d, -step)) dates.push(d);
  return { dates: dates.reverse(), stepDays: step };
}

// --- Point-in-time reconstruction ----------------------------------------------------------------------

/** Local date an action was closed, or null while it is open. Closed with no timestamp = closed at creation. */
function actionClosedOn(action) {
  if (!action || !CLOSED_ACTION_STATUSES.has(action.status)) return null;
  const stamp = action.closedAt ?? action.verifiedAt;
  return stamp ? toLocalDate(stamp) : action.createdDate;
}

/** Local date an issue was closed, or null while it is open. A closed issue with no recorded date counts as never open. */
function issueClosedOn(issue, ctx) {
  if (issue.status !== 'CLOSED') return null;
  return actionClosedOn(ctx.actionById.get(issue.correctiveActionId)) ?? issue.observedDate;
}

function isIssueOpenOn(issue, date, ctx) {
  if (issue.observedDate > date) return false;
  const closed = issueClosedOn(issue, ctx);
  return closed === null || closed > date;
}

/** The issue's risk on `date`, from the unchanged engine (delay only counts while its action was open). */
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
    startOfDay(date)
  );
}

const round1 = (n) => Math.round(n * 10) / 10;
const average = (values) => (values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0);
const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);

function scoped(ctx, filters) {
  const issues = ctx.issues.filter(
    (i) => (filters.mineId === 'ALL' || i.mineId === filters.mineId) && (filters.category === 'ALL' || i.category === filters.category)
  );
  const actions = ctx.actions.filter((a) => {
    if (filters.mineId !== 'ALL' && a.mineId !== filters.mineId) return false;
    if (filters.category === 'ALL') return true;
    return ctx.issueById.get(a.issueId)?.category === filters.category;
  });
  return { issues, actions };
}

/** Open issues in the snapshot set — first observed in the range, open and scored on the end date. */
function snapshotIssues(issues, filters, ctx) {
  return issues
    .filter((i) => i.observedDate >= filters.from && i.observedDate <= filters.to && isIssueOpenOn(i, filters.to, ctx))
    .map((issue) => {
      const risk = scoreIssueOn(issue, filters.to, ctx);
      return { issue, risk, score: risk.riskScore, level: risk.riskLevel };
    });
}

// --- The individual analyses ------------------------------------------------------------------------------

function riskDistribution(snap) {
  const total = snap.length;
  return {
    total,
    levels: LEVELS.map((level) => {
      const count = snap.filter((s) => s.level === level).length;
      return { level, label: getRiskLevelLabel(level), count, pct: pct(count, total), color: RISK_COLORS[level] };
    }),
  };
}

function mineComparison(snap, ctx, filters) {
  const mines = ctx.mines.filter((m) => filters.mineId === 'ALL' || m.id === filters.mineId);
  const rows = mines
    .map((mine) => {
      const own = snap.filter((s) => s.issue.mineId === mine.id);
      if (!own.length) return null;
      const scores = own.map((s) => s.score);
      const riskScore = Math.max(...scores);
      const level = getRiskLevel(riskScore);
      return {
        mineId: mine.id,
        name: mine.name,
        region: mine.region,
        riskScore,
        riskLevel: level,
        riskLabel: getRiskLevelLabel(level),
        color: RISK_COLORS[level],
        openIssues: own.length,
        averageScore: round1(average(scores)),
        compliancePct: Math.min(100, Math.max(0, Math.round(100 - average(scores)))),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.riskScore - a.riskScore || b.openIssues - a.openIssues || a.name.localeCompare(b.name));
  return { rows, hiddenMines: mines.length - rows.length };
}

function complianceTrend(issues, dates, ctx) {
  return dates.map((date) => {
    const scores = issues.filter((i) => isIssueOpenOn(i, date, ctx)).map((i) => scoreIssueOn(i, date, ctx).riskScore);
    const high = scores.filter((s) => getRiskLevel(s) === 'HIGH' || getRiskLevel(s) === 'CRITICAL').length;
    return {
      date,
      label: shortLabel(date),
      openIssues: scores.length,
      highCritical: high,
      averageRisk: scores.length ? round1(average(scores)) : null,
      compliancePct: scores.length ? Math.min(100, Math.max(0, Math.round(100 - average(scores)))) : null,
    };
  });
}

function overdueTrend(actions, dates, ctx) {
  return dates.map((date) => {
    const open = actions.filter((a) => {
      if (a.createdDate > date) return false;
      const closed = actionClosedOn(a);
      return closed === null || closed > date;
    });
    return {
      date,
      label: shortLabel(date),
      openActions: open.length,
      overdue: open.filter((a) => calendarDaysOverdue(a.dueDate, startOfDay(date)) > 0).length,
    };
  });
}

function mineTrend(issues, dates, snap, ctx, filters) {
  const withIssues = ctx.mines.filter((m) => (filters.mineId === 'ALL' || m.id === filters.mineId) && issues.some((i) => i.mineId === m.id));
  const currentScore = (mineId) => Math.max(0, ...snap.filter((s) => s.issue.mineId === mineId).map((s) => s.score));
  const ranked = [...withIssues].sort((a, b) => currentScore(b.id) - currentScore(a.id) || a.name.localeCompare(b.name));
  const shown = ranked.slice(0, MAX_TREND_MINES);
  const series = shown.map((m, idx) => ({ mineId: m.id, name: m.name, color: MINE_SERIES_COLORS[idx % MINE_SERIES_COLORS.length] }));
  const firstSeen = Object.fromEntries(shown.map((m) => [m.id, issues.filter((i) => i.mineId === m.id).map((i) => i.observedDate).sort()[0]]));

  const points = dates.map((date) => {
    const point = { date, label: shortLabel(date) };
    shown.forEach((m) => {
      if (date < firstSeen[m.id]) {
        point[m.id] = null; // before the mine's first record: nothing to show, not a score of 0
        return;
      }
      const scores = issues
        .filter((i) => i.mineId === m.id && isIssueOpenOn(i, date, ctx))
        .map((i) => scoreIssueOn(i, date, ctx).riskScore);
      point[m.id] = scores.length ? Math.max(...scores) : 0;
    });
    return point;
  });
  return { series, points, hiddenMines: ranked.length - shown.length };
}

function recurringViolations(issues, filters, ctx) {
  const minesById = new Map(ctx.mines.map((m) => [m.id, m]));
  const recurring = issues.filter((i) => i.recurrenceCount >= 2 && i.observedDate >= filters.from && i.observedDate <= filters.to);
  const byCategory = new Map();
  recurring.forEach((issue) => {
    if (!byCategory.has(issue.category)) byCategory.set(issue.category, []);
    byCategory.get(issue.category).push(issue);
  });
  const groups = [...byCategory.entries()]
    .map(([category, members]) => {
      const mineIds = [...new Set(members.map((m) => m.mineId))];
      return {
        category,
        domain: getCategoryGroup(category),
        count: members.length,
        twoPrior: members.filter((m) => m.recurrenceCount === 2).length,
        threePlusPrior: members.filter((m) => m.recurrenceCount >= 3).length,
        maxRecurrence: Math.max(...members.map((m) => m.recurrenceCount)),
        openCount: members.filter((m) => m.status !== 'CLOSED').length,
        mines: mineIds.map((id) => ({ id, name: minesById.get(id)?.name ?? id })),
        issues: members
          .map((m) => ({
            id: m.id,
            title: m.title,
            mineId: m.mineId,
            mineName: minesById.get(m.mineId)?.name ?? m.mineId,
            recurrenceCount: m.recurrenceCount,
            status: m.status,
          }))
          .sort((a, b) => b.recurrenceCount - a.recurrenceCount || a.id.localeCompare(b.id)),
      };
    })
    .sort((a, b) => b.count - a.count || b.maxRecurrence - a.maxRecurrence || a.category.localeCompare(b.category));
  return { total: recurring.length, groups };
}

function contractorRisk(role, filters, now) {
  const rows = getContractorRows(role, now).filter(
    (c) => filters.mineId === 'ALL' || (c.mines ?? []).some((m) => m.id === filters.mineId)
  );
  return {
    total: rows.length,
    levels: LEVELS.map((level) => {
      const members = rows.filter((c) => c.riskLevel === level);
      return {
        level,
        label: getRiskLevelLabel(level),
        count: members.length,
        pct: pct(members.length, rows.length),
        color: RISK_COLORS[level],
        names: members.map((c) => c.name),
      };
    }),
  };
}

function assertAllowed(role) {
  if (!canViewAnalytics(role)) throw new Error('Your role does not have access to Analytics.');
}

// --- Public: the Risk Intelligence page --------------------------------------------------------------------

/**
 * Everything /analytics shows, for one role and one set of (raw) filters.
 * @param {{role: string, filters?: {preset?: string, from?: string, to?: string, mineId?: string, category?: string}, now?: Date}} input
 */
export function getAnalytics({ role, filters: rawFilters = {}, now = DEMO_NOW }) {
  assertAllowed(role);
  const ctx = buildContext(role, now);
  const filters = resolveFilters(rawFilters, role, now, ctx);
  const { issues, actions } = scoped(ctx, filters);
  const snap = snapshotIssues(issues, filters, ctx);
  const { dates, stepDays } = getTrendDates(filters.from, filters.to);

  const distribution = riskDistribution(snap);
  const comparison = mineComparison(snap, ctx, filters);
  const trend = complianceTrend(issues, dates, ctx);
  const overdue = overdueTrend(actions, dates, ctx);
  const scores = snap.map((s) => s.score);
  const overdueNow = overdue[overdue.length - 1]?.overdue ?? 0;

  return {
    filters,
    asOf: filters.to,
    stepDays,
    kpis: {
      openIssues: snap.length,
      averageRisk: scores.length ? round1(average(scores)) : null,
      highCritical: snap.filter((s) => s.level === 'HIGH' || s.level === 'CRITICAL').length,
      overdueActions: overdueNow,
      minesInView: comparison.rows.length,
    },
    riskDistribution: distribution,
    mineComparison: comparison,
    complianceTrend: trend,
    overdueTrend: overdue,
    mineTrend: mineTrend(issues, dates, snap, ctx, filters),
    recurring: recurringViolations(issues, filters, ctx),
    contractorRisk: contractorRisk(role, filters, now),
  };
}

// --- Public: the Risk Engine page ----------------------------------------------------------------------------

const COMPONENT_KEYS = ['severity', 'recurrence', 'exposure', 'delay'];
const COMPONENT_LABELS = { severity: 'Severity', recurrence: 'Recurrence', exposure: 'Exposure', delay: 'Delay' };
export { COMPONENT_KEYS, COMPONENT_LABELS };

/** How each raw input becomes a 0–100 sub-score (mirrors the engine's documented rules). */
const NORMALIZATION = {
  severity: 'Rated 1–5, scaled to 0–100 (rating ÷ 5)',
  recurrence: 'Prior occurrences, capped at 3 (3 or more = 100)',
  exposure: 'Rated 1–5, scaled to 0–100 (rating ÷ 5)',
  delay: 'Days the open corrective action is past its deadline × 10, capped at 100',
};

export function getRiskFormula() {
  return {
    components: COMPONENT_KEYS.map((key) => ({
      key,
      label: COMPONENT_LABELS[key],
      weightPct: Math.round(RISK_WEIGHTS[key] * 100),
      rule: NORMALIZATION[key],
    })),
    bands: RISK_LEVEL_THRESHOLDS.map((band, idx) => ({
      level: band.level,
      label: band.label,
      min: idx === 0 ? 0 : RISK_LEVEL_THRESHOLDS[idx - 1].max + 1,
      max: band.max,
      color: RISK_COLORS[band.level],
    })),
  };
}

/**
 * What /analytics/risk-engine shows: the formula (read from the engine's own constants, so it cannot
 * drift) plus which components drive the scores of the issues in view. Same snapshot set and filters
 * as the Risk Intelligence page.
 */
export function getRiskEngineData({ role, filters: rawFilters = {}, now = DEMO_NOW }) {
  assertAllowed(role);
  const ctx = buildContext(role, now);
  const filters = resolveFilters(rawFilters, role, now, ctx);
  const { issues } = scoped(ctx, filters);
  const snap = snapshotIssues(issues, filters, ctx);
  const minesById = new Map(ctx.mines.map((m) => [m.id, m]));

  const contribution = (entries, key) => round1(average(entries.map((s) => s.risk.breakdown[key].contribution)));
  const summarise = (entries) => ({
    count: entries.length,
    averageScore: entries.length ? round1(average(entries.map((s) => s.score))) : null,
    ...Object.fromEntries(COMPONENT_KEYS.map((key) => [key, entries.length ? contribution(entries, key) : 0])),
  });

  const byMine = ctx.mines
    .map((mine) => ({ mineId: mine.id, name: mine.name, ...summarise(snap.filter((s) => s.issue.mineId === mine.id)) }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.averageScore - a.averageScore || a.name.localeCompare(b.name));

  const topIssues = [...snap]
    .sort((a, b) => b.score - a.score || a.issue.id.localeCompare(b.issue.id))
    .slice(0, 10)
    .map((s) => ({
      id: s.issue.id,
      title: s.issue.title,
      mineId: s.issue.mineId,
      mineName: minesById.get(s.issue.mineId)?.name ?? s.issue.mineId,
      category: s.issue.category,
      score: s.score,
      level: s.level,
      label: getRiskLevelLabel(s.level),
      components: Object.fromEntries(COMPONENT_KEYS.map((key) => [key, s.risk.breakdown[key].contribution])),
    }));

  return { filters, asOf: filters.to, formula: getRiskFormula(), overall: summarise(snap), byMine, topIssues };
}
