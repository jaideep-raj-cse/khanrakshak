// Run from the project root: npm run test:hero   (runs this file after hero.test.mjs)
// Step 9A — the LIVE hero inspection must show 87 / Critical (like the seeded hero), while every other
// inspection keeps going through the unchanged risk engine. Drives the real submitInspection pipeline.
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES } = await imp('data/roles.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const audit = await imp('services/auditService.js');
const notif = await imp('services/notificationService.js');
const wf = await imp('workflows/correctiveActionWorkflow.js');
const { submitInspection } = await imp('workflows/submissionPipeline.js');
const { calculateRisk } = await imp('riskEngine/riskEngine.js');
const { isHeroScenario } = await imp('riskEngine/heroScenario.js');
const { DEMO_NOW, addDaysISO } = await imp('utils/date.js');

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
};
const section = (t) => console.log(`\n== ${t}`);

const FO = ROLES.FIELD_OFFICER, MM = ROLES.MINE_MANAGER, CO = ROLES.COMPLIANCE_OFFICER;
const HERO_TEXT = 'Workers repeatedly operating without required PPE at the Seam 4 loading point.';
const base = {
  mineId: 'MINE-JHR-04',
  inspectionType: 'Routine Inspection',
  category: 'PPE & Worker Safety',
  observation: HERO_TEXT,
  severity: 5,
  recurrenceCount: 3,
  exposureLevel: 'high', // Exposure 4 on the engine's 1-5 scale
  exposureWorkers: 18,
  evidence: { fileName: 'ppe.jpg', fileType: 'image/jpeg', fileSizeKB: 400, note: 'Photo evidence' },
  inspector: { name: 'Arjun Verma', role: 'Field Officer', roleId: FO },
};
const submit = (over = {}) => submitInspection({ ...base, ...over });
const engine = (over = {}) => calculateRisk({ severity: 5, recurrenceCount: 3, exposureLevel: 'high', ...over, correctiveActionDeadline: null }, DEMO_NOW);

globalThis.__store.clear();
ensureSeeded(DEMO_NOW);
wf.processEscalations(DEMO_NOW);

// ---------------------------------------------------------------------------
section('Test 1 — Hero scenario → 87 / Critical (live)');
const hero = submit();
check('submission result: score 87, level CRITICAL', hero.risk.riskScore === 87 && hero.risk.riskLevel === 'CRITICAL', `${hero.risk.riskScore}/${hero.risk.riskLevel}`);
check('issue returned to the UI carries 87 / CRITICAL', hero.issue.riskScore === 87 && hero.issue.riskLevel === 'CRITICAL');
const detail = data.getIssueWithRelations(hero.issue.id); // what Issue Detail renders after submit
check('Issue Detail (re-read from storage) still shows 87 / CRITICAL, not a recomputed 81', detail.riskScore === 87 && detail.riskLevel === 'CRITICAL', `${detail.riskScore}`);
check('Issues list read agrees (87)', data.getIssuesWithRelations().find((i) => i.id === hero.issue.id).riskScore === 87);
check('explainability still works: standard reasons kept + scripted-scenario note added', detail.riskReasons.includes('High severity (5 of 5)') && detail.riskReasons.includes('Repeated violation (4th occurrence)') && detail.riskReasons.some((r) => /hero-demonstration scenario.*not an ML prediction/.test(r)));
check('breakdown still comes from the real engine (40 + 25 + 16 + 0)', detail.riskBreakdown.severity.contribution === 40 && detail.riskBreakdown.recurrence.contribution === 25 && detail.riskBreakdown.exposure.contribution === 16 && detail.riskBreakdown.delay.contribution === 0);
check('wording is case/spacing-insensitive', isHeroScenario({ ...base, observation: 'WORKERS  repeatedly\noperating without REQUIRED ppe' }));

// ---------------------------------------------------------------------------
section('Test 2 — Normal inspections keep using the existing engine');
const cases = [
  ['same values, different wording', { observation: 'Workers found without PPE in an active blasting zone.' }],
  ['legacy hero-test wording (no scripted phrase)', { observation: 'Hero demo: workers found without PPE in an active blasting zone.' }],
  ['hero wording but severity 4', { severity: 4 }],
  ['hero wording but recurrence 2', { recurrenceCount: 2 }],
  ['hero wording but exposure Medium', { exposureLevel: 'medium' }],
  ['hero wording but non-Safety category', { category: 'Statutory Documentation' }],
];
for (const [label, over] of cases) {
  const r = submit(over);
  const expected = engine({ severity: over.severity ?? 5, recurrenceCount: over.recurrenceCount ?? 3, exposureLevel: over.exposureLevel ?? 'high' });
  const issue = data.getIssueById(r.issue.id);
  check(`${label}: not flagged, score = engine (${expected.riskScore}/${expected.riskLevel})`,
    !('scriptedRisk' in issue) && r.risk.riskScore === expected.riskScore && r.risk.riskLevel === expected.riskLevel &&
    data.getIssueWithRelations(r.issue.id).riskScore === expected.riskScore, `got ${r.risk.riskScore}`);
}
check('similar values with different wording is 81 (never auto-87)', submit({ observation: 'Workers without helmets near the haul road.' }).risk.riskScore === 81);
check('engine itself unchanged: severity 5 / recurrence 3 / exposure 4 / no delay = 81', engine().riskScore === 81);

// ---------------------------------------------------------------------------
section('Test 3 — Existing seeded hero is untouched');
const seeded = data.getIssueWithRelations('ISSUE-2026-0115');
check('seeded hero is still 87 / CRITICAL', seeded.riskScore === 87 && seeded.riskLevel === 'CRITICAL');
check('seeded hero is not flagged and keeps its natural breakdown (delay +6 from 4 days overdue)', !('scriptedRisk' in data.getIssueById('ISSUE-2026-0115')) && seeded.riskBreakdown.delay.contribution === 6 && !seeded.riskReasons.some((r) => /hero-demonstration/.test(r)));

// ---------------------------------------------------------------------------
section('Test 4 — Hero submission still auto-creates a Critical corrective action, due in 3 days');
const ca = hero.correctiveAction;
check('corrective action exists, OPEN, priority CRITICAL, assigned to the Mine Manager', !!ca && ca.status === 'OPEN' && ca.priorityRisk === 'CRITICAL' && ca.assignee === 'Sunita Rao');
check('deadline = created date + 3 days', ca.dueDate === addDaysISO(DEMO_NOW, 3));
check('issue is linked to the action', data.getIssueById(hero.issue.id).correctiveActionId === ca.id);
const events = audit.getAuditLog().filter((e) => [hero.issue.id, ca.id, hero.inspection.id].includes(e.entityId));
check('audit: Risk Calculated says Critical (87/100) and stays honest about being rule-based', events.some((e) => e.action === 'Risk Calculated' && /Critical \(87\/100\)/.test(e.description) && e.description.includes('rule-based demonstration model')));
check('audit: auto-assignment event written', events.some((e) => e.action === 'Corrective Action Auto-Assigned (Risk-Triggered)'));
const ns = notif.getNotifications().filter((n) => [hero.issue.id, ca.id, hero.inspection.id].includes(n.entityId));
check('Mine Manager notified (critical, 87/100) and Compliance Officer notified', ns.some((n) => n.recipientRole === MM && n.recipientName === 'Sunita Rao' && n.type === 'critical' && /87\/100/.test(n.description)) && ns.some((n) => n.recipientRole === CO && n.title === 'New Critical Risk Issue'));

// ---------------------------------------------------------------------------
section('Test 5 — Hero lifecycle still works end to end (compact; full version is in hero.test.mjs)');
wf.startProgress({ actionId: ca.id, actor: 'Sunita Rao', role: MM });
check('Mine Manager: In Progress', data.getCorrectiveActionById(ca.id).status === 'IN_PROGRESS');
const sub = wf.submitForVerification({ actionId: ca.id, actor: 'Sunita Rao', role: MM, completionNotes: 'PPE issued and crew retrained.', evidence: { fileName: 'fix.jpg', fileType: 'image/jpeg', fileSizeKB: 300, note: 'Post-fix' } });
check('Mine Manager: evidence attached → Pending Verification', sub.status === 'SUBMITTED_FOR_VERIFICATION' && !!sub.evidence);
check('Compliance Officer (not Mine Manager) holds verification authority', wf.roleCan('VERIFY', CO) && !wf.roleCan('VERIFY', MM));
const done = wf.verifyAction({ actionId: ca.id, actor: 'Deepak Singh', role: CO, verificationNotes: 'Verified in person.' });
check('Compliance Officer: Verify → action CLOSED and issue CLOSED', done.status === 'CLOSED' && data.getIssueById(hero.issue.id).status === 'CLOSED');

// ---------------------------------------------------------------------------
section('Overdue: the scripted score is a floor, so the normal engine takes over once delay grows');
globalThis.__store.clear();
ensureSeeded(DEMO_NOW);
const h2 = submit();
const flagged = data.getIssueById(h2.issue.id);
const later = new Date(DEMO_NOW.getFullYear(), DEMO_NOW.getMonth(), DEMO_NOW.getDate() + 8); // 5 days past the +3d deadline
const scripted = data.computeIssueRisk(flagged, later);
const { scriptedRisk, ...plain } = flagged;
const natural = data.computeIssueRisk(plain, later);
check(`5 days overdue: scripted = natural engine score (${natural.riskScore}) — never pinned or lowered`, scripted.riskScore === natural.riskScore && natural.riskScore > 87, `${scripted.riskScore} vs ${natural.riskScore}`);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) { console.log('Failures:', failures.join(', ')); process.exit(1); }
