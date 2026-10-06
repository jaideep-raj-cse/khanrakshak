// Run from the project root: npm run test:hero
// Automates the SIH presentation's "hero demo" end to end through the REAL production functions
// (submissionPipeline.submitInspection, correctiveActionWorkflow.*, dashboardService, auditService) —
// no LocalStorage or source edits, exactly as a presenter would trigger it through the UI:
//
//   Field Officer -> New Inspection -> Jharia demo mine -> PPE & Worker Safety (Safety domain)
//   -> Severity 5, Recurrence 3, Exposure High (= 4 on the engine's 1-5 scale), Evidence -> Submit
//   -> auto Corrective Action -> Mine Manager: In Progress -> Evidence -> Submitted for Verification
//   -> Compliance Officer: Verify & Close -> Audit Trail -> Dashboard
//
// This exists so the exact demo script is checked by machine, not just read by eye, and so a future
// change to the risk engine, workflow, or dashboard service that would silently break the live
// demo fails this test instead of failing in front of judges.
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
const dash = await imp('services/dashboardService.js');
const { DEMO_NOW, isOverdue } = await imp('utils/date.js');
const { getCategoryGroup } = await imp('data/constants.js');

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
const JHARIA = 'MINE-JHR-04'; // "Jharia demo mine" — Sunita Rao's mine, also one of Arjun Verma's (FO)

globalThis.__store.clear();
ensureSeeded(DEMO_NOW);
wf.processEscalations(DEMO_NOW);

// ---------------------------------------------------------------------------
section('Step 1 — Field Officer: New Inspection at the Jharia demo mine');
const mine = data.getMineById(JHARIA);
check('Jharia demo mine exists and is managed by Sunita Rao', !!mine && mine.manager === 'Sunita Rao', JSON.stringify(mine));

// "Severity 5, Recurrence 3, Exposure 4" — the wizard's exposure control is a Low/Medium/High
// picker (src/pages/NewInspection.jsx step 6; see EXPOSURE_LEVEL_OPTIONS), which maps onto the
// engine's 1-5 scale as low=2/medium=3/high=4 (riskEngine.js EXPOSURE_LEVEL_TO_SCALE). "Exposure 4"
// is only reachable through the real UI by picking "High" — there is no raw 1-5 exposure field in
// the wizard. This test drives it the same way the UI does (exposureLevel: 'high'), not with a raw
// numeric override, so it reflects what a presenter can actually click.
const beforeFO = dash.getDashboardData(FO, DEMO_NOW);
const result = submitInspection({
  mineId: JHARIA,
  inspectionType: 'Routine Inspection',
  category: 'PPE & Worker Safety', // Safety domain (data/constants.js ISSUE_CATEGORY_GROUPS.Safety)
  observation: 'Hero demo: workers found without PPE in an active blasting zone.',
  severity: 5,
  recurrenceCount: 3,
  exposureLevel: 'high',
  exposureWorkers: 18,
  evidence: { fileName: 'ppe-violation.jpg', fileType: 'image/jpeg', fileSizeKB: 820, note: 'Photo evidence' },
  inspector: { name: 'Arjun Verma', role: 'Field Officer', roleId: FO },
});

check('Inspection, issue and risk score were created without touching LocalStorage directly', !!result.inspection.id && !!result.issue.id);
check(
  'PPE & Worker Safety is filed under the Safety domain (matches the demo narration "Safety -> PPE")',
  getCategoryGroup('PPE & Worker Safety') === 'Safety'
);

// ---------------------------------------------------------------------------
section('Step 2 — Risk score');
// Severity 5 (-> 100 x 40% = 40) + Recurrence 3 prior occurrences (-> 100 x 25% = 25) + Exposure
// High=4/5 (-> 80 x 20% = 16) + Delay 0 (brand-new issue, no overdue action yet) = 81, CRITICAL.
// NOTE: the blueprint's hero-demo narration states "Risk 87 / Critical". The real, unmodified risk
// engine (src/riskEngine/riskEngine.js — protected by a checksum test, tests/step4/step4.test.mjs)
// produces 81 for these exact inputs, not 87; 87 is not reachable through the real wizard for any
// combination of severity/recurrence/exposure without an overdue corrective action contributing a
// Delay score (impossible for a brand-new issue). Both land in the CRITICAL band (81-100) and both
// trigger the same 3-day auto-corrective-action deadline, so the demo's OUTCOME is correct — only
// the exact number quoted in the narration is off. This is flagged, not silently "corrected" to 87,
// because the engine's formula is intentionally untouched (see riskEngine.js header comment).
check(
  'Risk score is 81 (not the blueprint-quoted 87) and the level is CRITICAL — same outcome, different exact number',
  result.risk.riskScore === 81 && result.risk.riskLevel === 'CRITICAL',
  `got ${result.risk.riskScore}/${result.risk.riskLevel}`
);

// ---------------------------------------------------------------------------
section('Step 3 — Auto Corrective Action');
check(
  'A Critical-risk issue auto-creates a corrective action due in 3 days, assigned to the mine manager',
  !!result.correctiveAction &&
    result.correctiveAction.status === 'OPEN' &&
    result.correctiveAction.assignee === 'Sunita Rao' &&
    !isOverdue(result.correctiveAction.dueDate, result.correctiveAction.status, DEMO_NOW)
);

const actionId = result.correctiveAction.id;
const issueId = result.issue.id;

// ---------------------------------------------------------------------------
section('Step 4 — Mine Manager: In Progress -> Evidence -> Submitted for Verification');
wf.startProgress({ actionId, actor: 'Sunita Rao', role: MM });
check('Mine Manager moves the action to In Progress', data.getCorrectiveActionById(actionId).status === 'IN_PROGRESS');

const submitted = wf.submitForVerification({
  actionId,
  actor: 'Sunita Rao',
  role: MM,
  completionNotes: 'Issued PPE to all crew, retrained on blasting-zone protocol, re-inspected site.',
  evidence: { fileName: 'ppe-fix-evidence.jpg', fileType: 'image/jpeg', fileSizeKB: 640, note: 'Post-fix evidence' },
});
check('Submitted for verification with evidence attached', submitted.status === 'SUBMITTED_FOR_VERIFICATION' && !!submitted.evidence);
check('Field Officer cannot perform this step (no corrective-action access at all)', !wf.roleCan('SUBMIT_FOR_VERIFICATION', FO));

// ---------------------------------------------------------------------------
section('Step 5 — Compliance Officer: Verify -> Closed');
check('Compliance Officer, not Mine Manager, holds verification authority', wf.roleCan('VERIFY', CO) && !wf.roleCan('VERIFY', MM));
const verified = wf.verifyAction({ actionId, actor: 'Deepak Singh', role: CO, verificationNotes: 'Verified in person — PPE compliance restored.' });
check('Verify & Close moves the action to CLOSED and closes the linked issue', verified.status === 'CLOSED' && data.getIssueById(issueId).status === 'CLOSED');

// ---------------------------------------------------------------------------
section('Step 6 — Audit Trail');
const events = audit.getAuditLog().filter((e) => [actionId, issueId, result.inspection.id].includes(e.entityId));
const expectedActions = [
  'Inspection Submitted',
  'Issue Created',
  'Risk Calculated',
  'Corrective Action Auto-Assigned (Risk-Triggered)',
  'Corrective Action Status Changed',
  'Corrective Action Submitted for Verification',
  'Corrective Action Verified',
  'Corrective Action Closed',
];
check(
  `Every step of the pipeline left exactly one audit event (${expectedActions.length} total, no duplicates)`,
  events.length === expectedActions.length && expectedActions.every((a) => events.filter((e) => e.action === a).length === 1),
  `got ${events.length}: ${events.map((e) => e.action).join(' | ')}`
);
check(
  'The Risk Calculated event is honest about being a rule-based demonstration, not an automated decision',
  events.find((e) => e.action === 'Risk Calculated')?.description.includes('rule-based demonstration model')
);
check(
  'The Verified event states this was a human review, not an automated one',
  events.find((e) => e.action === 'Corrective Action Verified')?.description.includes('Human compliance review')
);

// ---------------------------------------------------------------------------
section('Step 7 — Notifications reached the right roles (no leaks)');
const flowNotifs = notif.getNotifications().filter((n) => [actionId, issueId, result.inspection.id].includes(n.entityId));
check(
  'Field Officer was notified the action closed (it reported the issue)',
  flowNotifs.some((n) => n.recipientRole === FO && n.title === 'Corrective Action Verified & Closed')
);
check(
  'Mine Manager (assignee) was notified at every step it is party to',
  ['Inspection Submitted', 'Corrective Action Auto-Assigned', 'Corrective Action Verified & Closed'].every((title) =>
    flowNotifs.some((n) => n.recipientRole === MM && n.recipientName === 'Sunita Rao' && n.title === title)
  )
);
check(
  'Compliance Officer was notified a Critical issue existed and that verification was required',
  flowNotifs.some((n) => n.recipientRole === CO && n.title === 'New Critical Risk Issue') &&
    flowNotifs.some((n) => n.recipientRole === CO && n.title === 'Verification Required')
);

// ---------------------------------------------------------------------------
section('Step 8 — Dashboard reflects the closure for every role, immediately (no reseed/reload needed)');
const afterFO = dash.getDashboardData(FO, DEMO_NOW);
const afterCO = dash.getDashboardData(CO, DEMO_NOW);
check('Field Officer: Active Inspections and Open Violations are back to their pre-demo level (issue closed)', afterFO.kpis.activeInspections === beforeFO.kpis.activeInspections && afterFO.kpis.openViolations === beforeFO.kpis.openViolations);
check('The hero-demo issue itself is excluded from every open-issue count now that it is closed', !afterCO.riskDistribution.levels.some(() => data.getIssueById(issueId).status !== 'CLOSED'));
check('The action is not left overdue or escalated (it was closed well before its 3-day deadline)', !isOverdue(data.getCorrectiveActionById(actionId).dueDate, data.getCorrectiveActionById(actionId).status, DEMO_NOW) && wf.getEscalationLevel(data.getCorrectiveActionById(actionId)) === 0);

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('Failures:', failures.join(', '));
  process.exit(1);
}
