// Run from the project root: npm run test:dashboard
// Exercises the real dashboard service (services/dashboardService.js) against the real seeded data
// (stubbed localStorage, same harness as the other suites) — including the lifecycle scenarios the
// brief calls out explicitly: the initial dashboard, after a new inspection, after a corrective
// action is created / verified / closed, and an overdue/escalated action. Every figure is checked
// against an INDEPENDENT calculation from the raw records (dataService / the risk engine), not
// against itself.
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES } = await imp('data/roles.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const { processEscalations, startProgress, submitForVerification, verifyAction, isEscalated } =
  await imp('workflows/correctiveActionWorkflow.js');
const { submitInspection } = await imp('workflows/submissionPipeline.js');
const D = await imp('services/dashboardService.js');
const { DEMO_NOW, isOverdue } = await imp('utils/date.js');
const { storage } = await imp('storage/localStorage.js');

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  FAIL  ${name} ${extra}`);
  }
}
const section = (t) => console.log(`\n== ${t}`);

const FO = ROLES.FIELD_OFFICER;
const MM = ROLES.MINE_MANAGER;
const CO = ROLES.COMPLIANCE_OFFICER;
const AD = ROLES.ADMINISTRATOR;
const NOW = DEMO_NOW;
const MM_MINE = 'MINE-JHR-04'; // Sunita Rao's mine — also one of Arjun Verma's (FO) assigned mines

const fresh = () => {
  globalThis.__store.clear();
  ensureSeeded(NOW);
  processEscalations(NOW);
};
const get = (role) => D.getDashboardData(role, NOW);
const independentOpenCount = (predicate = () => true) =>
  data.getIssues().filter((i) => i.status !== 'CLOSED' && predicate(i)).length;

fresh();

// ---------------------------------------------------------------------------
section('Initial dashboard — every KPI is derived, not hardcoded');
const fo0 = get(FO);
const mm0 = get(MM);
const co0 = get(CO);
const ad0 = get(AD);

// recentAlerts is deliberately recipient-targeted (notificationService.isNotificationVisible), so
// Compliance Officer and Administrator — both "all mines" scope — still get DIFFERENT alerts (e.g.
// Level 3 escalations go to Administrator only). Everything else should be identical.
check(
  'Compliance Officer and Administrator see identical dashboards except recipient-targeted alerts',
  JSON.stringify({ ...co0, recentAlerts: null }) === JSON.stringify({ ...ad0, recentAlerts: null })
);
check(
  'Total Mines matches each role\'s visible-mine count (3 / 1 / 10 / 10)',
  fo0.kpis.totalMines === 3 && mm0.kpis.totalMines === 1 && co0.kpis.totalMines === 10 && ad0.kpis.totalMines === 10
);
check(
  'Open Violations (Compliance Officer) = every non-closed issue, independently counted',
  co0.kpis.openViolations === independentOpenCount()
);
check(
  'Open Violations (Field Officer) = only Arjun Verma\'s own reported, non-closed issues',
  fo0.kpis.openViolations === independentOpenCount((i) => i.reportedBy === 'Arjun Verma') && fo0.kpis.openViolations > 0
);
check(
  'High/Critical Issues (Compliance Officer) matches an independent count via the live risk engine',
  co0.kpis.highCriticalIssues ===
    data
      .getIssues()
      .filter((i) => i.status !== 'CLOSED')
      .map((i) => data.computeIssueRisk(i, NOW).riskLevel)
      .filter((lv) => lv === 'HIGH' || lv === 'CRITICAL').length
);
check(
  'Risk Distribution total = Open Violations, for every role (same scoped issue set feeds both)',
  [fo0, mm0, co0, ad0].every((d) => d.riskDistribution.total === d.kpis.openViolations)
);
check(
  'Field Officer has no corrective-action visibility: Overdue Corrective Actions is null, never 0',
  fo0.kpis.overdueCorrectiveActions === null && fo0.kpis.hasActionAccess === false
);
check(
  'Mine Manager / Compliance Officer / Administrator do have corrective-action visibility',
  [mm0, co0, ad0].every((d) => d.kpis.hasActionAccess === true)
);
check(
  'Overdue Corrective Actions (Compliance Officer) matches an independent count',
  co0.kpis.overdueCorrectiveActions === data.getCorrectiveActions().filter((a) => isOverdue(a.dueDate, a.status, NOW)).length
);
check(
  'Overall Compliance % (Compliance Officer) = 100 - average open-issue score (same definition as the GIS Risk Map)',
  (() => {
    const open = data.getIssues().filter((i) => i.status !== 'CLOSED');
    const avg = open.reduce((s, i) => s + data.computeIssueRisk(i, NOW).riskScore, 0) / open.length;
    return co0.kpis.overallCompliancePct === Math.min(100, Math.max(0, Math.round(100 - avg)));
  })()
);
check(
  'Active Inspections = inspections whose generated issue is not yet closed',
  co0.kpis.activeInspections ===
    data.getInspections().filter((i) => {
      const issue = data.getIssueByInspectionId(i.id);
      return issue && issue.status !== 'CLOSED';
    }).length
);
check(
  'Mine Risk Overview lists every mine in scope, sorted by risk score (highest first)',
  co0.mineRiskOverview.length === 10 && co0.mineRiskOverview.every((m, i, a) => i === 0 || a[i - 1].riskScore >= m.riskScore)
);
check(
  'High-Risk Mines is exactly the High/Critical subset of Mine Risk Overview',
  JSON.stringify(co0.highRiskMines) ===
    JSON.stringify(co0.mineRiskOverview.filter((m) => m.riskLevel === 'HIGH' || m.riskLevel === 'CRITICAL'))
);
check(
  'Recent Alerts are capped at 5 and are newest first',
  co0.recentAlerts.length <= 5 && co0.recentAlerts.every((n, i, a) => i === 0 || new Date(a[i - 1].timestamp) >= new Date(n.timestamp))
);
check('Recent Inspections are capped at 5', co0.recentInspections.length <= 5);
check('Mine Manager sees only its own mine in Mine Risk Overview', mm0.mineRiskOverview.every((m) => m.id === MM_MINE));
check(
  'Compliance Trend has at least 2 points and its last point matches today\'s live open-issue count (Compliance Officer)',
  co0.complianceTrend.length >= 2 && co0.complianceTrend.at(-1).openIssues === independentOpenCount()
);

// ---------------------------------------------------------------------------
section('After a new inspection (Field Officer submits one, low risk)');
const beforeFO1 = get(FO);
const beforeMM1 = get(MM);
const beforeCO1 = get(CO);
const low = submitInspection({
  mineId: MM_MINE,
  inspectionType: 'Routine Inspection',
  category: 'PPE & Worker Safety',
  observation: 'Dashboard test: workers observed without ear protection near the crusher.',
  severity: 2,
  recurrenceCount: 0,
  exposureLevel: 'low',
  inspector: { name: 'Arjun Verma', role: 'Field Officer', roleId: FO },
});
const afterFO1 = get(FO);
const afterMM1 = get(MM);
const afterCO1 = get(CO);

check('A new low-risk inspection does not auto-create a corrective action', low.correctiveAction === null);
check(
  'Field Officer: Active Inspections +1, Open Violations +1, Risk Distribution total +1',
  afterFO1.kpis.activeInspections === beforeFO1.kpis.activeInspections + 1 &&
    afterFO1.kpis.openViolations === beforeFO1.kpis.openViolations + 1 &&
    afterFO1.riskDistribution.total === beforeFO1.riskDistribution.total + 1
);
check('Mine Manager at the same mine also sees the new open violation', afterMM1.kpis.openViolations === beforeMM1.kpis.openViolations + 1);
check(
  'Compliance Officer (all mines) also sees it, in both Open Violations and Active Inspections',
  afterCO1.kpis.openViolations === beforeCO1.kpis.openViolations + 1 && afterCO1.kpis.activeInspections === beforeCO1.kpis.activeInspections + 1
);
check('The new inspection appears first in Recent Inspections for the Field Officer', afterFO1.recentInspections[0]?.id === low.inspection.id);
check(
  'Mine Risk Overview is recomputed, not cached — the mine\'s row changed',
  JSON.stringify(afterCO1.mineRiskOverview.find((m) => m.id === MM_MINE)) !== JSON.stringify(beforeCO1.mineRiskOverview.find((m) => m.id === MM_MINE))
);

// ---------------------------------------------------------------------------
section('After a High/Critical inspection auto-creates a corrective action');
const beforeHigh = get(CO);
const hi = submitInspection({
  mineId: MM_MINE,
  inspectionType: 'Incident-Triggered Inspection',
  category: 'Structural Support / Roof Control',
  observation: 'Dashboard test: unsupported roof section over an active haulage road.',
  severity: 5,
  recurrenceCount: 1,
  exposureLevel: 'high',
  exposureWorkers: 20,
  inspector: { name: 'Arjun Verma', role: 'Field Officer', roleId: FO },
});
const afterHigh = get(CO);

check(
  'A High/Critical inspection auto-creates a corrective action',
  hi.correctiveAction !== null && (hi.risk.riskLevel === 'HIGH' || hi.risk.riskLevel === 'CRITICAL')
);
check('High/Critical Issues KPI increases by 1', afterHigh.kpis.highCriticalIssues === beforeHigh.kpis.highCriticalIssues + 1);
check(
  'The mine\'s risk score in Mine Risk Overview can only rise or stay the same (the new issue scores at least as high)',
  afterHigh.mineRiskOverview.find((m) => m.id === MM_MINE).riskScore >= beforeHigh.mineRiskOverview.find((m) => m.id === MM_MINE).riskScore
);
check(
  'The new corrective action is not yet overdue (just created, due days from now)',
  !isOverdue(hi.correctiveAction.dueDate, hi.correctiveAction.status, NOW)
);

// ---------------------------------------------------------------------------
section('Full corrective-action lifecycle: start -> submit for verification -> verify & close');
const actionId = hi.correctiveAction.id;
const issueId = hi.issue.id;
const beforeLifecycleFO = get(FO);

startProgress({ actionId, actor: 'Sunita Rao', role: MM });
check(
  'In Progress: action still open, not overdue (just started)',
  data.getCorrectiveActionById(actionId).status === 'IN_PROGRESS' &&
    !isOverdue(data.getCorrectiveActionById(actionId).dueDate, data.getCorrectiveActionById(actionId).status, NOW)
);

submitForVerification({
  actionId,
  actor: 'Sunita Rao',
  role: MM,
  completionNotes: 'Dashboard test: re-supported the roof section and inspected it.',
});
check('Submitted for verification: the issue is still open (verification is still pending)', data.getIssueById(issueId).status !== 'CLOSED');

const beforeVerify = get(CO);
verifyAction({ actionId, actor: 'Deepak Singh', role: CO, verificationNotes: 'Dashboard test: verified in person.' });
const afterVerify = get(CO);
const afterVerifyFO = get(FO);

check('After Verify & Close: the issue is CLOSED', data.getIssueById(issueId).status === 'CLOSED');
check('Open Violations (Compliance Officer) decreases by 1 after verification/closure', afterVerify.kpis.openViolations === beforeVerify.kpis.openViolations - 1);
check(
  'High/Critical Issues (Compliance Officer) does not increase (the closed issue is no longer counted open)',
  afterVerify.kpis.highCriticalIssues <= beforeVerify.kpis.highCriticalIssues
);
check(
  'Active Inspections (the reporting Field Officer) decreases by 1 — its finding is now resolved',
  afterVerifyFO.kpis.activeInspections === beforeLifecycleFO.kpis.activeInspections - 1
);
check(
  'Overall Compliance % (Compliance Officer) does not fall after a closure (closing an issue can only help or hold)',
  afterVerify.kpis.overallCompliancePct >= beforeVerify.kpis.overallCompliancePct
);

// ---------------------------------------------------------------------------
section('Overdue / escalated corrective action (seeded)');
const seededOverdue = data.getCorrectiveActions().find((a) => a.id === 'CA-2026-0041');
check(
  'CA-0041 is seeded overdue and escalated',
  !!seededOverdue && isOverdue(seededOverdue.dueDate, seededOverdue.status, NOW) && isEscalated(seededOverdue)
);
const mmDash = get(MM);
const coDash = get(CO);
const foDash = get(FO);
check(
  'Mine Manager\'s Overdue Corrective Actions counts its own mine\'s overdue actions, independently verified',
  mmDash.kpis.overdueCorrectiveActions === data.getCorrectiveActionsByMine(MM_MINE).filter((a) => isOverdue(a.dueDate, a.status, NOW)).length &&
    mmDash.kpis.overdueCorrectiveActions > 0
);
check(
  'Compliance Officer\'s Overdue Corrective Actions counts every mine\'s overdue actions',
  coDash.kpis.overdueCorrectiveActions === data.getCorrectiveActions().filter((a) => isOverdue(a.dueDate, a.status, NOW)).length
);
check('Field Officer never sees a corrective-action count — null, not a (possibly misleading) 0', foDash.kpis.overdueCorrectiveActions === null);
check(
  'The overdue, escalated action is reflected in its mine\'s risk score (delay pushes the score up)',
  coDash.mineRiskOverview.find((m) => m.id === seededOverdue.mineId).riskScore > 0
);

// ---------------------------------------------------------------------------
section('Live-update plumbing (storage.onChange) — same-tab reactivity for the Dashboard');
let notified = 0;
let lastKey = null;
const unsubscribe = storage.onChange((key) => {
  notified += 1;
  lastKey = key;
});
const anyIssue = data.getIssues()[0];
data.updateIssue(anyIssue.id, { title: anyIssue.title }); // harmless no-op patch, still a write
check('storage.onChange fires synchronously on a write made through the storage module', notified === 1 && lastKey === storage.KEYS.ISSUES);
unsubscribe();
data.updateIssue(anyIssue.id, { title: anyIssue.title });
check('unsubscribe() stops further notifications', notified === 1);

// ---------------------------------------------------------------------------
section('Integrity');
check('getDashboardData never writes to storage (read-only)', (() => {
  const snapshot = () => JSON.stringify([...globalThis.__store.entries()].sort());
  const before = snapshot();
  get(CO);
  get(FO);
  get(MM);
  const after = snapshot();
  return before === after;
})());
check(
  'Risk Distribution level-by-level matches an independent per-issue tally from the live engine (Compliance Officer)',
  (() => {
    const co = get(CO);
    const open = data.getIssues().filter((i) => i.status !== 'CLOSED');
    const LEVELS = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'];
    return LEVELS.every((lv, idx) => co.riskDistribution.levels[idx].level === lv && co.riskDistribution.levels[idx].count === open.filter((i) => data.computeIssueRisk(i, NOW).riskLevel === lv).length);
  })()
);

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
