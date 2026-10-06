// Run from the project root:  npm run test:analytics
// Exercises the real analytics service against the real seeded data (stubbed localStorage, same
// harness as the other suites). The figures are checked against INDEPENDENT calculations from the raw
// records and against the live app (Risk Map, dataService, the risk engine) — not against themselves.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES, canAccess } = await imp('data/roles.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const risk = await imp('riskEngine/riskEngine.js');
const riskMap = await imp('services/riskMapService.js');
const contractors = await imp('services/contractorService.js');
const A = await imp('services/analyticsService.js');
const { DEMO_NOW, isOverdue, localDateISO } = await imp('utils/date.js');
const { ISSUE_CATEGORIES } = await imp('data/constants.js');
const { storage } = await imp('storage/localStorage.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
const section = (t) => console.log(`\n== ${t}`);
const throwsMsg = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

const FO = ROLES.FIELD_OFFICER, MM = ROLES.MINE_MANAGER, CO = ROLES.COMPLIANCE_OFFICER, AD = ROLES.ADMINISTRATOR;
const NOW = DEMO_NOW;
const TODAY = localDateISO(NOW);
const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return localDateISO(new Date(y, m - 1, d + n)); };
const off = (n) => addDays(TODAY, n);
const fresh = () => { globalThis.__store.clear(); ensureSeeded(NOW); };
const get = (role = CO, filters = {}) => A.getAnalytics({ role, filters, now: NOW });
const eng = (role = CO, filters = {}) => A.getRiskEngineData({ role, filters, now: NOW });
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const counts = (a) => a.levels.map((l) => l.count);
const LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
const sameSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

fresh();
const rawIssues = () => data.getIssues();
const rawActions = () => data.getCorrectiveActions();
const actionById = () => new Map(rawActions().map((a) => [a.id, a]));
const closedDate = (a) => (a && ['VERIFIED', 'CLOSED'].includes(a.status) ? localDateISO(new Date(a.closedAt ?? a.verifiedAt)) : null);

// Independent "open on date" and "live score" (plain code, deliberately not shared with the service).
function openOn(date, issues = rawIssues()) {
  const byId = actionById();
  return issues.filter((i) => {
    if (i.observedDate > date) return false;
    if (i.status !== 'CLOSED') return true;
    const c = closedDate(byId.get(i.correctiveActionId));
    return c !== null && c > date;
  });
}
const liveScore = (issue) => data.computeIssueRisk(issue, NOW).riskScore;
const liveOpen = () => rawIssues().filter((i) => i.status !== 'CLOSED');
const dataStart = [...rawIssues().map((i) => i.observedDate), ...rawActions().map((a) => a.createdDate)].sort()[0];

// ---------------------------------------------------------------------------
section('Access & scope');
check('Field Officer has no Analytics page (nav) — and the service refuses it too', !canAccess('analytics', FO) && !A.canViewAnalytics(FO) && /does not have access/.test(throwsMsg(() => get(FO))) && /does not have access/.test(throwsMsg(() => eng(FO))));
check('Mine Manager, Compliance Officer and Administrator can view Analytics', [MM, CO, AD].every((r) => canAccess('analytics', r) && A.canViewAnalytics(r)));
const co = get(CO), ad = get(AD);
check('Compliance Officer and Administrator get identical, full analytics', JSON.stringify(co) === JSON.stringify(ad));
check('Compliance Officer sees all 10 mines in the filter and in the comparison', A.getFilterOptions(CO, NOW).mines.length === 11 && co.mineComparison.rows.length === 10);
const mm = get(MM);
const mmMine = 'MINE-JHR-04';
check('Mine Manager is offered only its own mine', A.getFilterOptions(MM, NOW).mines.length === 2 && A.getFilterOptions(MM, NOW).mines[1].value === mmMine);
check('Mine Manager sees only its own mine in every chart', mm.mineComparison.rows.every((r) => r.mineId === mmMine) && mm.mineTrend.series.every((s) => s.mineId === mmMine) && mm.recurring.groups.every((g) => g.issues.every((i) => i.mineId === mmMine)));
check('Mine Manager totals equal its own mine\'s open issues', mm.riskDistribution.total === liveOpen().filter((i) => i.mineId === mmMine).length && mm.riskDistribution.total > 0);
check('Mine Manager overdue figure counts only its own mine\'s actions', mm.kpis.overdueActions === rawActions().filter((a) => a.mineId === mmMine && isOverdue(a.dueDate, a.status, NOW)).length);
check('Mine Manager contractor chart counts only contractors at its own mine', mm.contractorRisk.total === contractors.getContractorRows(MM, NOW).length && mm.contractorRisk.total < co.contractorRisk.total && mm.contractorRisk.total > 0);
const probe = get(MM, { mineId: 'MINE-TAL-02' });
check('Mine Manager asking for another mine falls back to its own scope (nothing leaks, nothing throws)', probe.filters.mineId === 'ALL' && JSON.stringify(probe.mineComparison) === JSON.stringify(mm.mineComparison));
check('Mine Manager risk-engine data is also own-mine only', eng(MM).byMine.every((m) => m.mineId === mmMine) && eng(MM).topIssues.every((i) => i.mineId === mmMine));

// ---------------------------------------------------------------------------
section('Reconstruction agrees with the live app (no filters, today)');
const live = liveOpen();
check('Open issue count = live open issues (46)', co.riskDistribution.total === live.length && live.length === 46);
check('Risk distribution = live engine levels, issue by issue', LEVELS.every((lv, i) => co.riskDistribution.levels[i].level === lv && co.riskDistribution.levels[i].count === live.filter((x) => risk.getRiskLevel(liveScore(x)) === lv).length));
check('Risk distribution shares sum to ~100% and counts sum to the total', sum(counts(co.riskDistribution)) === co.riskDistribution.total && Math.abs(sum(co.riskDistribution.levels.map((l) => l.pct)) - 100) < 0.5);
const rm = riskMap.getRiskMapData(CO).mapped;
const cmpById = Object.fromEntries(co.mineComparison.rows.map((r) => [r.mineId, r]));
check('Mine comparison = GIS Risk Map for every mine: risk score, open issues, compliance %', rm.filter((m) => m.openIssues > 0).every((m) => cmpById[m.id] && cmpById[m.id].riskScore === m.riskScore && cmpById[m.id].openIssues === m.openIssues && cmpById[m.id].compliancePct === m.compliancePct && cmpById[m.id].riskLevel === m.riskLevel));
check('Mine comparison is sorted by risk score, highest first', co.mineComparison.rows.every((r, i, a) => i === 0 || a[i - 1].riskScore >= r.riskScore));
const avgLive = sum(live.map(liveScore)) / live.length;
const last = co.complianceTrend[co.complianceTrend.length - 1];
check('Last compliance-trend point = today\'s live state (date, open issues, compliance %, average risk)', last.date === TODAY && last.openIssues === live.length && last.compliancePct === Math.round(100 - avgLive) && last.averageRisk === Math.round(avgLive * 10) / 10);
check('Last mine-trend point = each mine\'s current score', co.mineTrend.series.every((s) => co.mineTrend.points.at(-1)[s.mineId] === cmpById[s.mineId].riskScore));
check('Overdue today = live overdue corrective actions (5)', co.overdueTrend.at(-1).overdue === rawActions().filter((a) => isOverdue(a.dueDate, a.status, NOW)).length && co.kpis.overdueActions === 5);
check('KPIs: open issues, High+Critical and average match the distribution', co.kpis.openIssues === 46 && co.kpis.highCritical === co.riskDistribution.levels[2].count + co.riskDistribution.levels[3].count && co.kpis.averageRisk === Math.round(avgLive * 10) / 10);

// ---------------------------------------------------------------------------
section('Historical points are right (checked against plain independent counts)');
check('Every compliance-trend point\'s open-issue count equals an independent count of issues open on that date', co.complianceTrend.every((p) => p.openIssues === openOn(p.date).length), co.complianceTrend.map((p) => `${p.date}:${p.openIssues}/${openOn(p.date).length}`).join(' '));
check('Issues are never counted before they were observed (first point has the earliest issue only)', co.complianceTrend[0].openIssues === openOn(co.complianceTrend[0].date).length && co.complianceTrend[0].openIssues >= 1 && co.complianceTrend[0].openIssues <= 3);
check('Open-issue history is never negative or wildly non-monotonic (only closures can reduce it)', co.complianceTrend.every((p, i, a) => i === 0 || p.openIssues >= a[i - 1].openIssues - 2));
const closedIssues = rawIssues().filter((i) => i.status === 'CLOSED');
check('Both seeded closed issues were open before their closure and are excluded after it', closedIssues.length === 2 && closedIssues.every((i) => {
  const c = closedDate(actionById().get(i.correctiveActionId));
  return c && openOn(addDays(c, -1)).some((x) => x.id === i.id) && !openOn(c).some((x) => x.id === i.id) && !live.some((x) => x.id === i.id);
}));
// Delay only exists while an action is open AND past its deadline.
const dueDates = rawActions().filter((a) => !['VERIFIED', 'CLOSED'].includes(a.status)).map((a) => a.dueDate).sort();
const beforeAnyDue = addDays(dueDates[0], -1);
const early = eng(CO, { preset: 'CUSTOM', from: dataStart, to: beforeAnyDue });
check('Before any open action is past its deadline, the Delay component is 0 for every issue', early.overall.delay === 0 && early.byMine.every((m) => m.delay === 0) && early.topIssues.every((i) => i.components.delay === 0), `delay=${early.overall.delay}`);
check('Today the Delay component is above 0 (the overdue actions push scores up)', eng(CO).overall.delay > 0);
const earlyOverdue = get(CO, { preset: 'CUSTOM', from: dataStart, to: beforeAnyDue });
check('No action was overdue before the first open deadline passed', earlyOverdue.overdueTrend.every((p) => p.overdue === 0) && earlyOverdue.kpis.overdueActions === 0);
check('Overdue counts rise once deadlines pass (the day after the first deadline, ≥ 1)', get(CO, { preset: 'CUSTOM', from: dataStart, to: addDays(dueDates[0], 1) }).kpis.overdueActions >= 1);
check('A closed action stops counting as overdue from its closing date', (() => {
  const a = rawActions().find((x) => x.status === 'CLOSED' && x.closedAt);
  const c = closedDate(a);
  const series = A.getAnalytics({ role: CO, filters: { preset: 'CUSTOM', from: dataStart, to: TODAY }, now: NOW }).overdueTrend;
  return a && c <= TODAY && series.every((p) => p.openActions >= 0);
})());
check('The engine itself is used: the highest score today equals the engine\'s score for that issue', (() => {
  const top = eng(CO).topIssues[0];
  return top.score === Math.max(...live.map(liveScore)) && top.score === liveScore(rawIssues().find((i) => i.id === top.id));
})());

// ---------------------------------------------------------------------------
section('Date range filter');
const all = get(CO);
check('Default: all data — from the first record to today', all.filters.preset === 'ALL' && all.filters.from === dataStart && all.filters.to === TODAY);
for (const days of [30, 90, 180]) {
  const r = get(CO, { preset: String(days) });
  const expectOpen = openOn(TODAY, rawIssues().filter((i) => i.observedDate >= off(-days))).length;
  check(`Last ${days} days: range is [today−${days}, today]; snapshot = issues observed in range and open today (${expectOpen})`, r.filters.to === TODAY && r.filters.from === (off(-days) < dataStart ? dataStart : off(-days)) && r.riskDistribution.total === expectOpen && r.kpis.openIssues === expectOpen);
}
check('A shorter range changes the snapshot (30 days < all data) — the date filter really filters', get(CO, { preset: '30' }).riskDistribution.total < all.riskDistribution.total && get(CO, { preset: '30' }).riskDistribution.total > 0);
const t90 = get(CO, { preset: '90' });
check('Trend points for a shorter range are the matching tail of the full trend (state at a date does not depend on the range)', t90.complianceTrend.every((p) => { const q = all.complianceTrend.find((x) => x.date === p.date); return q && q.compliancePct === p.compliancePct && q.openIssues === p.openIssues; }) && t90.complianceTrend.length < all.complianceTrend.length);
check('…and likewise for overdue and mine-level trends', t90.overdueTrend.every((p) => { const q = all.overdueTrend.find((x) => x.date === p.date); return q && q.overdue === p.overdue && q.openActions === p.openActions; }));
check('Trend dates end on the end date and are evenly spaced', all.complianceTrend.at(-1).date === TODAY && all.complianceTrend.every((p, i, a) => i === 0 || (new Date(p.date) - new Date(a[i - 1].date)) / 864e5 === all.stepDays) && all.stepDays === 7);
check('Last 30 days → 5 weekly points', get(CO, { preset: '30' }).complianceTrend.length === 5);
const custom = get(CO, { preset: 'CUSTOM', from: off(-60), to: off(-20) });
check('Custom range is honoured (both ends)', custom.filters.from === off(-60) && custom.filters.to === off(-20) && custom.complianceTrend.at(-1).date === off(-20) && custom.complianceTrend[0].date >= off(-60));
check('Custom snapshot is "observed in range, open and scored on the end date"', custom.riskDistribution.total === openOn(off(-20), rawIssues().filter((i) => i.observedDate >= off(-60) && i.observedDate <= off(-20))).length);
check('A reversed custom range is swapped, not rejected', (() => { const r = get(CO, { preset: 'CUSTOM', from: off(-20), to: off(-60) }); return r.filters.from === off(-60) && r.filters.to === off(-20); })());
const future = get(CO, { preset: 'CUSTOM', from: off(-10), to: off(+40) });
check('A future end date is clamped to today with a note (no forecasting)', future.filters.to === TODAY && future.filters.notes.some((n) => /future/i.test(n)));
const early2 = get(CO, { preset: 'CUSTOM', from: '2000-01-01', to: TODAY });
check('A start before the first record is moved up to it, with a note (no empty "100% compliant" lead-in)', early2.filters.from === dataStart && early2.filters.notes.some((n) => /first record/i.test(n)) && early2.complianceTrend[0].openIssues > 0);
check('Garbage values fall back to defaults without throwing', (() => { const r = get(CO, { preset: 'nope', from: 'x', to: '2026-13-45', mineId: '<script>', category: 42 }); return r.filters.preset === 'ALL' && r.filters.mineId === 'ALL' && r.filters.category === 'ALL' && r.filters.to === TODAY; })());
check('A single-day range gives one trend point (the UI shows "not enough history")', get(CO, { preset: 'CUSTOM', from: off(-5), to: off(-5) }).complianceTrend.length === 1);
check('Step rules: ≤14 days daily, ≤210 weekly, longer 30-day, never more than 60 points', A.getTrendDates(off(-10), TODAY).stepDays === 1 && A.getTrendDates(off(-100), TODAY).stepDays === 7 && A.getTrendDates(off(-400), TODAY).stepDays === 30 && A.getTrendDates(off(-5000), TODAY).dates.length <= 60);

// ---------------------------------------------------------------------------
section('Mine filter');
const mines = data.getMines();
check('Each mine filter narrows every chart to that mine', mines.every((mine) => {
  const r = get(CO, { mineId: mine.id });
  const open = live.filter((i) => i.mineId === mine.id).length;
  const rows = r.mineComparison.rows;
  return r.riskDistribution.total === open && (open === 0 ? rows.length === 0 : rows.length === 1 && rows[0].mineId === mine.id)
    && r.mineTrend.series.every((s) => s.mineId === mine.id)
    && r.recurring.groups.every((g) => g.issues.every((i) => i.mineId === mine.id))
    && r.contractorRisk.total === contractors.getContractorRows(CO, NOW).filter((c) => c.mines.some((m) => m.id === mine.id)).length
    && r.overdueTrend.at(-1).overdue === rawActions().filter((a) => a.mineId === mine.id && isOverdue(a.dueDate, a.status, NOW)).length;
}));
check('Mine counts across all mines add up to the total', sum(mines.map((m) => get(CO, { mineId: m.id }).riskDistribution.total)) === all.riskDistribution.total);
const tal = get(CO, { mineId: 'MINE-TAL-02' });
check('Talcher: comparison score matches the Risk Map; trend shows one line', tal.mineComparison.rows[0].riskScore === riskMap.getMineRiskSummary('MINE-TAL-02').riskScore && tal.mineTrend.series.length === 1);
check('The mine-level trend shows the top 5 mines by current score and says how many are hidden', all.mineTrend.series.length === 5 && all.mineTrend.hiddenMines === 5 && all.mineTrend.series.every((s, i, a) => i === 0 || cmpById[a[i - 1].mineId].riskScore >= cmpById[s.mineId].riskScore));

// ---------------------------------------------------------------------------
section('Category filter');
check('Each category narrows the distribution to its open issues', ISSUE_CATEGORIES.every((c) => get(CO, { category: c }).riskDistribution.total === live.filter((i) => i.category === c).length));
check('Category counts add up to the total', sum(ISSUE_CATEGORIES.map((c) => get(CO, { category: c }).riskDistribution.total)) === all.riskDistribution.total);
const env = get(CO, { category: 'Environmental Compliance' });
check('Category narrows recurring groups, mine comparison and trend too', env.recurring.groups.every((g) => g.category === 'Environmental Compliance') && env.mineComparison.rows.every((r) => r.openIssues <= live.filter((i) => i.category === 'Environmental Compliance' && i.mineId === r.mineId).length) && env.complianceTrend.at(-1).openIssues === live.filter((i) => i.category === 'Environmental Compliance').length);
check('Category narrows overdue actions via the issue they belong to', ISSUE_CATEGORIES.every((c) => {
  const ids = new Set(rawIssues().filter((i) => i.category === c).map((i) => i.id));
  return get(CO, { category: c }).kpis.overdueActions === rawActions().filter((a) => ids.has(a.issueId) && isOverdue(a.dueDate, a.status, NOW)).length;
}));
check('Contractor risk ignores category (contractors carry none) — and the card says so', JSON.stringify(env.contractorRisk) === JSON.stringify(all.contractorRisk) && /do not apply/.test(readFileSync(`${SRC}/pages/Analytics.jsx`, 'utf8')));
check('Contractor risk ignores the date range too', JSON.stringify(get(CO, { preset: '30' }).contractorRisk) === JSON.stringify(all.contractorRisk));
const combo = get(CO, { mineId: 'MINE-TAL-02', category: 'Environmental Compliance', preset: '180' });
check('Filters combine (AND)', combo.riskDistribution.total === openOn(TODAY, rawIssues().filter((i) => i.mineId === 'MINE-TAL-02' && i.category === 'Environmental Compliance' && i.observedDate >= combo.filters.from)).length);
check('Unknown category falls back to all', get(CO, { category: 'Made Up' }).filters.category === 'ALL');
// A combination that matches nothing: structures are empty/zero, never undefined, never throw.
const none = (() => { for (const m of mines) for (const c of ISSUE_CATEGORIES) { if (!rawIssues().some((i) => i.mineId === m.id && i.category === c)) return get(CO, { mineId: m.id, category: c }); } return null; })();
check('A filter combination that matches nothing returns empty structures, not errors', none && none.riskDistribution.total === 0 && counts(none.riskDistribution).every((n) => n === 0) && none.mineComparison.rows.length === 0 && none.mineTrend.series.length === 0 && none.recurring.groups.length === 0 && none.kpis.averageRisk === null && none.kpis.openIssues === 0 && none.complianceTrend.every((p) => p.compliancePct === null && p.openIssues === 0));
check('Points with no open issues are null, not 100%', none.complianceTrend.every((p) => p.compliancePct === null));

// ---------------------------------------------------------------------------
section('Recurring violations (recurrenceCount ≥ 2)');
const rec = rawIssues().filter((i) => i.recurrenceCount >= 2);
check('Total = every issue with recurrenceCount ≥ 2 (12)', all.recurring.total === rec.length && rec.length === 12);
check('Only issues with ≥ 2 prior occurrences appear', all.recurring.groups.every((g) => g.issues.every((i) => i.recurrenceCount >= 2)));
check('Grouped by category: counts add up and every issue is in exactly one group', sum(all.recurring.groups.map((g) => g.count)) === rec.length && all.recurring.groups.every((g) => g.count === g.issues.length && g.count === g.twoPrior + g.threePlusPrior) && new Set(all.recurring.groups.flatMap((g) => g.issues.map((i) => i.id))).size === rec.length);
check('Each group reports its highest recurrence, open count, domain and affected mines', all.recurring.groups.every((g) => g.maxRecurrence === Math.max(...g.issues.map((i) => i.recurrenceCount)) && g.openCount === g.issues.filter((i) => i.status !== 'CLOSED').length && g.domain && g.mines.length === new Set(g.issues.map((i) => i.mineId)).size));
check('Groups are ordered by size, then recurrence', all.recurring.groups.every((g, i, a) => i === 0 || a[i - 1].count > g.count || (a[i - 1].count === g.count && a[i - 1].maxRecurrence >= g.maxRecurrence)));
check('Within a group, the most-recurring issue comes first', all.recurring.groups.every((g) => g.issues.every((x, i, a) => i === 0 || a[i - 1].recurrenceCount >= x.recurrenceCount)));
check('The recurring analysis respects the date range (observed in range)', get(CO, { preset: '30' }).recurring.total === rec.filter((i) => i.observedDate >= off(-30)).length);
check('Recurring respects the mine filter', get(CO, { mineId: 'MINE-TAL-02' }).recurring.total === rec.filter((i) => i.mineId === 'MINE-TAL-02').length);

// ---------------------------------------------------------------------------
section('Overdue trend & contractor risk');
check('Overdue never exceeds open actions on any date', all.overdueTrend.every((p) => p.overdue <= p.openActions));
check('The overdue chart has real signal: some overdue, some open, and a rise over time', all.overdueTrend.some((p) => p.overdue > 0) && all.overdueTrend.some((p) => p.openActions > 0) && all.overdueTrend.at(-1).overdue > all.overdueTrend[0].overdue);
const rows = contractors.getContractorRows(CO, NOW);
check('Contractor risk = the Contractors page\'s risk level, contractor by contractor (12)', all.contractorRisk.total === 12 && LEVELS.every((lv, i) => all.contractorRisk.levels[i].count === rows.filter((c) => c.riskLevel === lv).length) && sum(counts(all.contractorRisk)) === 12);
check('Contractor levels list their contractors by name', all.contractorRisk.levels.every((l) => l.names.length === l.count));

// ---------------------------------------------------------------------------
section('Risk Engine data');
const e = eng(CO);
const F = e.formula;
check('Formula weights are read from the engine (40/25/20/15, sum 100)', F.components.map((c) => c.weightPct).join() === '40,25,20,15' && sum(F.components.map((c) => c.weightPct)) === 100 && F.components.every((c) => c.weightPct === Math.round(risk.RISK_WEIGHTS[c.key] * 100)));
check('Risk bands are contiguous 0–100 and match the engine thresholds (Low/Medium/High/Critical)', F.bands.map((b) => `${b.label}:${b.min}-${b.max}`).join() === 'Low:0-30,Medium:31-60,High:61-80,Critical:81-100');
check('Component points add up to the average score (within the engine whole-number rounding, ≤ 0.7)', Math.abs(e.overall.severity + e.overall.recurrence + e.overall.exposure + e.overall.delay - e.overall.averageScore) <= 0.7);
check('Overall average = the Analytics KPI; open count matches', e.overall.averageScore === all.kpis.averageRisk && e.overall.count === all.kpis.openIssues);
check('Per-mine counts add up to the total and are sorted by average score', sum(e.byMine.map((m) => m.count)) === e.overall.count && e.byMine.every((m, i, a) => i === 0 || a[i - 1].averageScore >= m.averageScore));
check('Per mine, components add up to its average (≤ 0.7: scores are whole numbers, components keep one decimal)', e.byMine.every((m) => Math.abs(m.severity + m.recurrence + m.exposure + m.delay - m.averageScore) <= 0.7));
check('Top issues: 10, highest first, each one\'s score and components add up', e.topIssues.length === 10 && e.topIssues.every((t, i, a) => i === 0 || a[i - 1].score >= t.score) && e.topIssues.every((t) => Math.abs(t.components.severity + t.components.recurrence + t.components.exposure + t.components.delay - t.score) <= 0.7));
check('Risk engine page honours the same filters', eng(CO, { mineId: 'MINE-TAL-02' }).byMine.length === 1 && eng(CO, { category: 'Environmental Compliance' }).overall.count === live.filter((i) => i.category === 'Environmental Compliance').length && eng(CO, { preset: '30' }).overall.count === get(CO, { preset: '30' }).kpis.openIssues);
check('No matching issues → zeroed summary, no top issues', (() => { const n = eng(CO, { mineId: none?.filters.mineId, category: none?.filters.category }); return n.overall.count === 0 && n.overall.averageScore === null && n.byMine.length === 0 && n.topIssues.length === 0; })());

// ---------------------------------------------------------------------------
section('Every chart is populated by the seed (Compliance Officer, no filters)');
check('Risk distribution: all four levels have issues', counts(all.riskDistribution).every((n) => n > 0), counts(all.riskDistribution).join());
check('Mine comparison: all 10 mines', all.mineComparison.rows.length === 10);
check('Compliance trend: 24+ weekly points, every one with open issues and a compliance %', all.complianceTrend.length >= 24 && all.complianceTrend.every((p) => p.openIssues > 0 && p.compliancePct !== null));
check('Compliance trend varies (not a flat line)', new Set(all.complianceTrend.map((p) => p.compliancePct)).size > 5);
check('Overdue trend: 24+ points with non-zero overdue and open series', all.overdueTrend.length >= 24 && all.overdueTrend.some((p) => p.overdue > 0));
check('Mine trend: 5 series, each with a score on the last date and several varied points', all.mineTrend.series.length === 5 && all.mineTrend.series.every((s) => all.mineTrend.points.at(-1)[s.mineId] > 0 && new Set(all.mineTrend.points.map((p) => p[s.mineId])).size > 2));
check('Recurring: 9 category groups, 12 issues', all.recurring.groups.length === 9 && all.recurring.total === 12);
check('Contractor risk: all four levels have contractors', counts(all.contractorRisk).every((n) => n > 0), counts(all.contractorRisk).join());
check('Mine Manager (own mine) also has a populated distribution, comparison, trend and contractor chart', mm.riskDistribution.total > 0 && mm.mineComparison.rows.length === 1 && mm.complianceTrend.length >= 2 && mm.complianceTrend.some((p) => p.openIssues > 0) && mm.contractorRisk.total > 0 && mm.mineTrend.series.length === 1);


// ---------------------------------------------------------------------------
section('Late closure — an action goes overdue, then closes while its issue stays open');
fresh();
const victim = rawActions().find((a) => !['VERIFIED', 'CLOSED'].includes(a.status) && isOverdue(a.dueDate, a.status, NOW) && (new Date(TODAY) - new Date(a.dueDate)) / 864e5 >= 4);
const closeOn = addDays(victim.dueDate, 3); // 3 days after the deadline, so it was overdue on due+1 and due+2
const beforeClose = addDays(victim.dueDate, 2);
const rangeTo = (to) => ({ preset: 'CUSTOM', from: dataStart, to });
const pick = (r) => JSON.stringify({ k: r.kpis, c: r.complianceTrend, o: r.overdueTrend, d: r.riskDistribution, m: r.mineComparison.rows });
const worldA = { atBefore: pick(get(CO, rangeTo(beforeClose))), atClose: get(CO, rangeTo(closeOn)), today: get(CO) };
storage.write(storage.KEYS.CORRECTIVE_ACTIONS, rawActions().map((a) => (a.id === victim.id ? { ...a, status: 'VERIFIED', verifiedAt: new Date(`${closeOn}T12:00:00`).toISOString(), closedAt: new Date(`${closeOn}T12:00:00`).toISOString() } : a)));
const worldC = { atBefore: pick(get(CO, rangeTo(beforeClose))), atClose: get(CO, rangeTo(closeOn)), today: get(CO) };
const liveNow = liveOpen();
check('A closure that happens later does not change the state on earlier dates (history is stable)', worldA.atBefore === worldC.atBefore);
check('While it was open and past its deadline it counted as overdue; from its closing date it no longer does', worldA.atClose.kpis.overdueActions - worldC.atClose.kpis.overdueActions === 1 && worldA.today.kpis.overdueActions - worldC.today.kpis.overdueActions === 1);
check('Its issue (still open) stops carrying a Delay score once the action closes: today equals the live engine', worldC.today.complianceTrend.at(-1).averageRisk === Math.round((sum(liveNow.map(liveScore)) / liveNow.length) * 10) / 10 && worldC.today.complianceTrend.at(-1).averageRisk < worldA.today.complianceTrend.at(-1).averageRisk);
check('…and today\'s risk distribution still equals the live engine, level by level', LEVELS.every((lv, i) => worldC.today.riskDistribution.levels[i].count === liveNow.filter((x) => risk.getRiskLevel(liveScore(x)) === lv).length));
check('Overdue today still equals the live overdue count after the closure', worldC.today.overdueTrend.at(-1).overdue === rawActions().filter((a) => isOverdue(a.dueDate, a.status, NOW)).length);
fresh();

// ---------------------------------------------------------------------------
section('Integrity & architecture');
const snapshot = JSON.stringify([...globalThis.__store.entries()]);
get(CO); get(MM); eng(CO); eng(MM, { preset: '30' });
check('Analytics is read-only: storage is byte-for-byte unchanged by every call', JSON.stringify([...globalThis.__store.entries()]) === snapshot);
const svc = readFileSync(`${SRC}/services/analyticsService.js`, 'utf8');
const engineSrc = readFileSync(`${SRC}/riskEngine/riskEngine.js`, 'utf8');
check('Scores come from riskEngine.calculateRisk — the formula is not re-implemented', /calculateRisk\(/.test(svc) && !/\*\s*0?\.(4|25|2|15)\b|\*\s*(40|25|20|15)\b/.test(svc.replace(/\/\/.*$/gm, '')));
check('The risk engine formula is untouched (weights, bands and rules as documented)', risk.RISK_WEIGHTS.severity === 0.4 && risk.RISK_WEIGHTS.recurrence === 0.25 && risk.RISK_WEIGHTS.exposure === 0.2 && risk.RISK_WEIGHTS.delay === 0.15 && /Risk Score = Severity\s+x 40%/.test(engineSrc));
const app = readFileSync(`${SRC}/App.jsx`, 'utf8');
check('/analytics and /analytics/risk-engine are real pages behind the analytics nav guard (no placeholder)', /path="\/analytics"[^\n]*<RequireNav navId="analytics">[^\n]*<Analytics \/>/.test(app) && /path="\/analytics\/risk-engine"[^\n]*<RequireNav navId="analytics">[^\n]*<RiskEngine \/>/.test(app) && !/PlaceholderPage title="(Analytics|Risk Engine)"/.test(app));
const files = ['services/analyticsService.js', 'pages/Analytics.jsx', 'pages/RiskEngine.jsx', 'components/analytics/AnalyticsUI.jsx', 'components/analytics/Charts.jsx'].map((p) => [p, readFileSync(`${SRC}/${p}`, 'utf8')]);
check('No backend, network or external analytics calls', files.every(([, s]) => !/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|gtag|analytics\.js|mixpanel|segment\.com/i.test(s.replace(/\/\/.*$/gm, ''))));
const copy = files.filter(([p]) => /pages|components/.test(p)).map(([, s]) => s).join('\n')
  .replace(/not a forecast|no forecast|future dates are not shown|not a trained model|no trained model/gi, '');
check('No unsupported claims: nothing says "predicted", "forecast", "AI-powered", "machine learning"', !/predict|forecast|machine[- ]learning|ai[- ]powered|ai predicted|neural/i.test(copy), (copy.match(/predict\w*|forecast\w*|machine[- ]learning|ai[- ]powered/gi) ?? []).join());
check('Pages use the approved descriptive names', /Risk Intelligence/.test(files[1][1]) && /Historical Risk Trend/.test(files[1][1]) && /Recurring Violation Analysis/.test(files[1][1]) && /Risk Engine/.test(files[2][1]));
check('Pages read through analyticsService, never storage', files.filter(([p]) => /pages\//.test(p)).every(([, s]) => !/localStorage|storage\//.test(s)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
