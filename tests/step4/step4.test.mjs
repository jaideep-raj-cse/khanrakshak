// Run from the project root:  npm run test:step4
// Exercises the real workflow/service code with a stubbed localStorage.
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES, ROLE_DETAILS, can, canAccess } = await imp('data/roles.js');
const { storage } = await imp('storage/localStorage.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const { getAuditLog } = await imp('services/auditService.js');
const notif = await imp('services/notificationService.js');
const access = await imp('services/accessService.js');
const { submitInspection } = await imp('workflows/submissionPipeline.js');
const wf = await imp('workflows/correctiveActionWorkflow.js');
const { isOverdue, calendarDaysOverdue } = await imp('utils/date.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
function throws(fn) { try { fn(); return null; } catch (e) { return e.message; } }
function section(t) { console.log(`\n== ${t}`); }

const FO = ROLES.FIELD_OFFICER, MM = ROLES.MINE_MANAGER, CO = ROLES.COMPLIANCE_OFFICER, AD = ROLES.ADMINISTRATOR;
const name = (r) => ROLE_DETAILS[r].demoUser.name;
const inspector = (roleId = FO) => ({ name: name(roleId), role: ROLE_DETAILS[roleId].name, roleId });

// Fixed clock for the time-based tests
const NOW = new Date(2026, 8, 30, 11, 30); // 30 Sep 2026, 11:30 local
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n));

globalThis.__store.clear();
// Seed dates are relative to an anchor; pin it to the test clock so the overdue
// scenarios are identical whenever the suite runs.
ensureSeeded(NOW);

// -------------------------------------------------------------------------
section('Permission matrix');
check('FO cannot start/submit/verify/reject/close', !wf.roleCan('START_PROGRESS', FO) && !wf.roleCan('SUBMIT_FOR_VERIFICATION', FO) && !wf.roleCan('VERIFY', FO) && !wf.roleCan('REJECT', FO) && !wf.roleCan('CLOSE', FO));
check('MM can start + submit; cannot verify/reject/close', wf.roleCan('START_PROGRESS', MM) && wf.roleCan('SUBMIT_FOR_VERIFICATION', MM) && !wf.roleCan('VERIFY', MM) && !wf.roleCan('REJECT', MM) && !wf.roleCan('CLOSE', MM));
check('CO can verify/reject/close; cannot start/submit', wf.roleCan('VERIFY', CO) && wf.roleCan('REJECT', CO) && wf.roleCan('CLOSE', CO) && !wf.roleCan('START_PROGRESS', CO) && !wf.roleCan('SUBMIT_FOR_VERIFICATION', CO));
check('Admin can do every step', ['START_PROGRESS','SUBMIT_FOR_VERIFICATION','VERIFY','REJECT','CLOSE'].every((k) => wf.roleCan(k, AD)));
check('Only FO can create inspections', can('inspection.create', FO) && !can('inspection.create', MM) && !can('inspection.create', CO));
check('Nav: FO has no Corrective Actions/Verification/Analytics/Admin', !canAccess('correctiveActions', FO) && !canAccess('verification', FO) && !canAccess('analytics', FO) && !canAccess('admin', FO));
check('Nav: FO can see contractors, documents, risk map, audit', canAccess('contractors', FO) && canAccess('documents', FO) && canAccess('riskMap', FO) && canAccess('auditTrail', FO));
check('Nav: MM has Corrective Actions + audit, not Verification/Admin', canAccess('correctiveActions', MM) && canAccess('auditTrail', MM) && !canAccess('verification', MM) && !canAccess('admin', MM));
check('Nav: CO has Verification + analytics, not Admin', canAccess('verification', CO) && canAccess('analytics', CO) && !canAccess('admin', CO));
check('Nav: Admin sees everything', ['correctiveActions','verification','analytics','auditTrail','admin','contractors'].every((n) => canAccess(n, AD)));

section('Scope');
check('MM scope = its own mine only (derived from mine.manager)', JSON.stringify(access.getAssignedMineIds(MM)) === JSON.stringify(['MINE-JHR-04']));
check('FO scope = assigned mines (not Singrauli)', access.canViewMine(FO, 'MINE-TAL-02') && !access.canViewMine(FO, 'MINE-SNG-07'));
check('CO / Admin see all mines', access.getAssignedMineIds(CO) === null && access.getAssignedMineIds(AD) === null);
check('FO cannot view any corrective action', !access.canViewAction(FO, data.getCorrectiveActionById('CA-2026-0041')));
check('MM can view Jharia CA, not Talcher CA', access.canViewAction(MM, data.getCorrectiveActionById('CA-2026-0041')) && !access.canViewAction(MM, data.getCorrectiveActionById('CA-2026-0022')));

// -------------------------------------------------------------------------
section('1. Field Officer submits inspection');
const hi = { mineId: 'MINE-JHR-04', inspectionType: 'Routine Inspection', category: 'Ventilation & Air Quality', observation: 'Main fan belt slipping at intake.', severity: 5, recurrenceCount: 2, exposureLevel: 'high', exposureWorkers: 20, evidence: null };
check('Mine Manager cannot create an inspection', /permission/.test(throws(() => submitInspection({ ...hi, inspector: inspector(MM) })) ?? ''));
check('Compliance Officer cannot create an inspection', /permission/.test(throws(() => submitInspection({ ...hi, inspector: inspector(CO) })) ?? ''));
check('FO cannot inspect an unassigned mine', /assigned/.test(throws(() => submitInspection({ ...hi, mineId: 'MINE-SNG-07', inspector: inspector(FO) })) ?? ''));
const r1 = submitInspection({ ...hi, inspector: inspector(FO) });
check('Inspection + issue created', !!r1.inspection?.id && !!r1.issue?.id, JSON.stringify(r1.inspection?.id));
console.log(`        risk: ${r1.risk.riskLevel} ${r1.risk.riskScore}/100`);

section('2. High/Critical risk creates a corrective action');
const ca1 = r1.correctiveAction;
check('Corrective action auto-created', !!ca1 && ['HIGH', 'CRITICAL'].includes(ca1.priorityRisk));
check('Assigned to that mine\'s manager', ca1?.assignee === 'Sunita Rao' && ca1?.assigneeRole === 'Mine Manager');
check('Starts with escalationLevel 0 / empty history? (not set until overdue)', (data.getCorrectiveActionById(ca1.id).escalationLevel ?? 0) === 0);

section('11a. Notifications from submission');
const mmInbox = () => notif.getNotificationsForRole(MM);
const coInbox = () => notif.getNotificationsForRole(CO);
check('MM got "New … Risk Issue"', mmInbox().some((n) => /^New .* Risk Issue$/.test(n.title) && n.entityId === r1.issue.id));
check('CO got "New … Risk Issue"', coInbox().some((n) => /^New .* Risk Issue$/.test(n.title) && n.entityId === r1.issue.id));
check('MM got auto-assigned CA notification', mmInbox().some((n) => n.title === 'Corrective Action Auto-Assigned' && n.entityId === ca1.id));
check('FO inbox has none of these', notif.getNotificationsForRole(FO).every((n) => n.entityId !== r1.issue.id && n.entityId !== ca1.id));
check('Admin inbox has none of these', notif.getNotificationsForRole(AD).every((n) => n.entityId !== r1.issue.id && n.entityId !== ca1.id));

section('3. Mine Manager can start / update');
check('FO cannot start', /permission/.test(throws(() => wf.startProgress({ actionId: ca1.id, actor: name(FO), role: FO })) ?? ''));
check('CO cannot start', /permission/.test(throws(() => wf.startProgress({ actionId: ca1.id, actor: name(CO), role: CO })) ?? ''));
check('MM cannot act on another mine\'s CA (CA-2026-0023, Talcher)', /outside your assigned/.test(throws(() => wf.startProgress({ actionId: 'CA-2026-0023', actor: name(MM), role: MM })) ?? ''));
wf.startProgress({ actionId: ca1.id, actor: name(MM), role: MM });
check('MM start → IN_PROGRESS', data.getCorrectiveActionById(ca1.id).status === 'IN_PROGRESS');
check('Cannot start twice', /cannot be started/.test(throws(() => wf.startProgress({ actionId: ca1.id, actor: name(MM), role: MM })) ?? ''));

section('4. Mine Manager submits for verification');
check('FO cannot submit', /permission/.test(throws(() => wf.submitForVerification({ actionId: ca1.id, actor: name(FO), role: FO, completionNotes: 'x' })) ?? ''));
check('Completion notes required', /Completion notes/.test(throws(() => wf.submitForVerification({ actionId: ca1.id, actor: name(MM), role: MM, completionNotes: '  ' })) ?? ''));
wf.submitForVerification({ actionId: ca1.id, actor: name(MM), role: MM, completionNotes: 'Belt replaced and tensioned.', evidence: { fileName: 'belt_after.jpg', fileType: 'image/jpeg', fileSizeKB: 210, note: 'after repair' } });
check('MM submit → SUBMITTED_FOR_VERIFICATION with evidence', data.getCorrectiveActionById(ca1.id).status === 'SUBMITTED_FOR_VERIFICATION' && data.getCorrectiveActionById(ca1.id).evidence?.fileName === 'belt_after.jpg');
check('Compliance Officer notified "Verification Required"', coInbox().some((n) => n.title === 'Verification Required' && n.entityId === ca1.id));
check('MM is NOT sent the verification-required alert', mmInbox().every((n) => !(n.title === 'Verification Required' && n.entityId === ca1.id)));
check('Cannot submit again while already submitted', /In Progress/.test(throws(() => wf.submitForVerification({ actionId: ca1.id, actor: name(MM), role: MM, completionNotes: 'again' })) ?? ''));

section('5/6. Compliance Officer verifies and rejects');
check('MM cannot verify', /permission/.test(throws(() => wf.verifyAction({ actionId: ca1.id, actor: name(MM), role: MM })) ?? ''));
check('FO cannot verify', /permission/.test(throws(() => wf.verifyAction({ actionId: ca1.id, actor: name(FO), role: FO })) ?? ''));
check('MM cannot reject', /permission/.test(throws(() => wf.rejectAction({ actionId: ca1.id, actor: name(MM), role: MM, rejectionReason: 'no' })) ?? ''));
check('Reject requires a reason', /reason is required/.test(throws(() => wf.rejectAction({ actionId: ca1.id, actor: name(CO), role: CO, rejectionReason: ' ' })) ?? ''));
wf.rejectAction({ actionId: ca1.id, actor: name(CO), role: CO, rejectionReason: 'Photo does not show tension gauge.', additionalInstructions: 'Re-submit with gauge photo.' });
let a = data.getCorrectiveActionById(ca1.id);
check('Reject → back to IN_PROGRESS with reason recorded', a.status === 'IN_PROGRESS' && a.rejectionReason.includes('gauge') && a.rejectedBy === name(CO));
check('Reject notifies assigned MM (correction required)', mmInbox().some((n) => /Rejected/.test(n.title) && n.entityId === ca1.id));
check('Reject does NOT notify the Field Officer', notif.getNotificationsForRole(FO).every((n) => !(/Rejected/.test(n.title) && n.entityId === ca1.id)));
check('Cannot reject a non-submitted action', /submitted for verification/.test(throws(() => wf.rejectAction({ actionId: ca1.id, actor: name(CO), role: CO, rejectionReason: 'x' })) ?? ''));
// rework + resubmit + verify
wf.submitForVerification({ actionId: ca1.id, actor: name(MM), role: MM, completionNotes: 'Added gauge photo.', evidence: { fileName: 'gauge.jpg', fileType: 'image/jpeg', fileSizeKB: 88, note: null } });
wf.verifyAction({ actionId: ca1.id, actor: name(CO), role: CO, verificationNotes: 'Gauge reading within spec.' });
a = data.getCorrectiveActionById(ca1.id);
check('Verify & Close → status CLOSED, verified + closed stamps set', a.status === 'CLOSED' && a.verifiedBy === name(CO) && a.closedBy === name(CO) && !!a.verifiedAt && !!a.closedAt);
check('Linked issue closed', data.getIssueById(r1.issue.id).status === 'CLOSED');
check('Closure notifies assignee (MM)', mmInbox().some((n) => n.title === 'Corrective Action Verified & Closed' && n.entityId === ca1.id));
check('Closure notifies reporting Field Officer', notif.getNotificationsForRole(FO).some((n) => n.title === 'Corrective Action Verified & Closed' && n.entityId === ca1.id));
check('Closure does NOT notify Compliance/Admin', coInbox().every((n) => !(n.title === 'Corrective Action Verified & Closed' && n.entityId === ca1.id)) && notif.getNotificationsForRole(AD).every((n) => n.entityId !== ca1.id));

section('7. Closed action cannot be verified again');
check('verify closed → error', /already closed/.test(throws(() => wf.verifyAction({ actionId: ca1.id, actor: name(CO), role: CO })) ?? ''));
check('verify closed as Admin → error', /already closed/.test(throws(() => wf.verifyAction({ actionId: ca1.id, actor: name(AD), role: AD })) ?? ''));
check('reject closed → error', /already closed/.test(throws(() => wf.rejectAction({ actionId: ca1.id, actor: name(CO), role: CO, rejectionReason: 'x' })) ?? ''));
check('close closed → error', /already closed/.test(throws(() => wf.closeAction({ actionId: ca1.id, actor: name(CO), role: CO })) ?? ''));
const auditCountAfterClose = getAuditLog().length;
throws(() => wf.verifyAction({ actionId: ca1.id, actor: name(CO), role: CO }));
check('failed re-verify wrote no audit event', getAuditLog().length === auditCountAfterClose);

// -------------------------------------------------------------------------
section('8. Overdue action escalates (seed data anchored at the test clock, 30 Sep 2026)');
const before = { audit: getAuditLog().length, notifs: notif.getNotifications().length };
const raised1 = wf.processEscalations(NOW);
const c41 = data.getCorrectiveActionById('CA-2026-0041'); // 11 days overdue
const c22 = data.getCorrectiveActionById('CA-2026-0022'); // 13 days overdue
const c38 = data.getCorrectiveActionById('CA-2026-0038'); // due in 4 days → not overdue
const c28 = data.getCorrectiveActionById('CA-2026-0028'); // closed, past its due date
check('CA-0041 (11d overdue) → Level 3, history [1,2,3]', c41.escalationLevel === 3 && c41.escalationHistory.map((h) => h.level).join() === '1,2,3', JSON.stringify(c41.escalationHistory?.map((h) => h.level)));
check('CA-0022 (13d overdue) → Level 3, history [1,2,3]', c22.escalationLevel === 3 && c22.escalationHistory.map((h) => h.level).join() === '1,2,3');
check('CA-0038 (not overdue) → Level 0, no history', (c38.escalationLevel ?? 0) === 0 && (c38.escalationHistory ?? []).length === 0);
check('CA-0028 (closed, past due) → not escalated', (c28.escalationLevel ?? 0) === 0 && (c28.escalationHistory ?? []).length === 0);
// Seeded overdue actions: 0041 (L3) + 0022 (L3) + hero 0055 (L2) + 0049 (L2) + 0056 (L1) = 3+3+2+2+1
check('Exactly 11 levels raised across the 5 seeded overdue actions', raised1.length === 11, String(raised1.length));
const lvl = (id) => data.getCorrectiveActionById(id).escalationLevel;
check('Seeded escalation mix: L3 ×2 (0041, 0022), L2 ×2 (hero 0055, 0049), L1 ×1 (0056)', lvl('CA-2026-0041') === 3 && lvl('CA-2026-0022') === 3 && lvl('CA-2026-0055') === 2 && lvl('CA-2026-0049') === 2 && lvl('CA-2026-0056') === 1);
check('Escalated issues flipped to ESCALATED (incl. hero issue)', ['ISSUE-2026-0091', 'ISSUE-2026-0065', 'ISSUE-2026-0115', 'ISSUE-2026-0105'].every((id) => data.getIssueById(id).status === 'ESCALATED'));

section('Escalation level boundaries (strictly more than 3 / 7 days)');
const daysCases = [ [ 0, 0 ], [ 1, 1 ], [ 3, 1 ], [ 4, 2 ], [ 7, 2 ], [ 8, 3 ] ];
daysCases.forEach(([overdue, expected], i) => {
  const id = `CA-TEST-${i}`;
  data.addCorrectiveAction({ id, issueId: 'ISSUE-2026-0079', mineId: 'MINE-KOR-11', title: `Boundary ${overdue}d`, status: 'IN_PROGRESS', priorityRisk: 'HIGH', assignee: 'Ramesh Yadav', assigneeRole: 'Mine Manager', createdDate: dayOffset(-20), dueDate: dayOffset(-overdue), escalationLevel: 0, escalationHistory: [] });
});
wf.processEscalations(NOW);
daysCases.forEach(([overdue, expected], i) => {
  const got = data.getCorrectiveActionById(`CA-TEST-${i}`).escalationLevel ?? 0;
  check(`${overdue} day(s) overdue → Level ${expected}`, got === expected, `got ${got}`);
});
check('Due today is NOT overdue (badge + escalation agree)', !isOverdue(dayOffset(0), 'IN_PROGRESS', NOW) && wf.computeDaysInfo(data.getCorrectiveActionById('CA-TEST-0'), NOW).label === 'Due today');
check('1 day past due: badge + days-info agree', isOverdue(dayOffset(-1), 'IN_PROGRESS', NOW) && wf.computeDaysInfo(data.getCorrectiveActionById('CA-TEST-1'), NOW).overdueDays === 1);

section('9. Escalation does not duplicate');
const snap = { audit: getAuditLog().length, notifs: notif.getNotifications().length, hist: JSON.stringify(data.getCorrectiveActions().map((x) => [x.id, x.escalationLevel, x.escalationHistory])) };
const again1 = wf.processEscalations(NOW);
const again2 = wf.processEscalations(NOW); // simulates React StrictMode double-invoked effect / page reload
check('Re-running at the same time raises nothing', again1.length === 0 && again2.length === 0);
check('No new audit events', getAuditLog().length === snap.audit);
check('No new notifications', notif.getNotifications().length === snap.notifs);
check('Records unchanged', JSON.stringify(data.getCorrectiveActions().map((x) => [x.id, x.escalationLevel, x.escalationHistory])) === snap.hist);
// time moves on: only the NEW level fires
const LATER = new Date(2026, 9, 5, 9, 0); // 5 Oct — CA-TEST-4 (7d overdue at 30 Sep) is now 12d overdue
const t4before = data.getCorrectiveActionById('CA-TEST-4').escalationHistory.length; // levels 1,2
const raisedLater = wf.processEscalations(LATER).filter((r) => r.actionId === 'CA-TEST-4');
check('Level 2 → 3 later raises ONLY Level 3', raisedLater.length === 1 && raisedLater[0].level === 3 && data.getCorrectiveActionById('CA-TEST-4').escalationHistory.length === t4before + 1);
check('History has each level exactly once', data.getCorrectiveActions().every((x) => { const l = (x.escalationHistory ?? []).map((h) => h.level); return new Set(l).size === l.length; }));
const dupes = (() => { const m = new Map(); getAuditLog().filter((e) => /Escalat|Overdue/.test(e.action)).forEach((e) => m.set(`${e.entityId}|${e.action}`, (m.get(`${e.entityId}|${e.action}`) ?? 0) + 1)); return [...m.values()].filter((c) => c > 1).length; })();
check('No duplicate escalation audit events (same action + entity)', dupes === 0, String(dupes));
// a non-closed action past the deadline, then closed → must stop escalating
data.addCorrectiveAction({ id: 'CA-TEST-CLOSE', issueId: 'ISSUE-2026-0079', mineId: 'MINE-JHR-04', title: 'to be closed', status: 'SUBMITTED_FOR_VERIFICATION', priorityRisk: 'HIGH', assignee: 'Sunita Rao', assigneeRole: 'Mine Manager', createdDate: dayOffset(-20), dueDate: dayOffset(-2), escalationLevel: 0, escalationHistory: [] });
wf.processEscalations(NOW);
check('Submitted-for-verification action still escalates while non-closed', data.getCorrectiveActionById('CA-TEST-CLOSE').escalationLevel === 1);
wf.verifyAction({ actionId: 'CA-TEST-CLOSE', actor: name(CO), role: CO });
const reLater = wf.processEscalations(new Date(2026, 9, 20));
check('Closed action stops escalating', !reLater.some((r) => r.actionId === 'CA-TEST-CLOSE') && data.getCorrectiveActionById('CA-TEST-CLOSE').escalationLevel === 1);

// -------------------------------------------------------------------------
section('10. Audit events generated');
const log = getAuditLog();
const has = (action, entityId) => log.some((e) => e.action === action && (!entityId || e.entityId === entityId));
check('Inspection Submitted', has('Inspection Submitted', r1.inspection.id));
check('Issue Created + Risk Calculated', has('Issue Created', r1.issue.id) && has('Risk Calculated', r1.issue.id));
check('Auto-assigned event', has('Corrective Action Auto-Assigned (Risk-Triggered)', ca1.id));
check('Status Changed, Submitted, Rejected, Verified, Closed for the walkthrough action', has('Corrective Action Status Changed', ca1.id) && has('Corrective Action Submitted for Verification', ca1.id) && has('Corrective Action Rejected / Reopened', ca1.id) && has('Corrective Action Verified', ca1.id) && has('Corrective Action Closed', ca1.id));
check('Escalation L1/L2/L3 events for CA-2026-0041', has('Corrective Action Overdue — Escalation Level 1', 'CA-2026-0041') && has('Corrective Action Escalated — Level 2', 'CA-2026-0041') && has('Corrective Action Escalated — Level 3', 'CA-2026-0041'));
check('Every audit event carries a mineId', log.every((e) => !!e.mineId), `${log.filter((e) => !e.mineId).length} missing`);
check('Audit actors are correct roles', log.filter((e) => e.entityId === ca1.id && e.action === 'Corrective Action Verified')[0].role === 'Compliance Officer');

section('Audit scoping');
check('CO + Admin see every audit event', log.every((e) => access.canViewAuditEvent(CO, e) && access.canViewAuditEvent(AD, e)));
const mmAudit = log.filter((e) => access.canViewAuditEvent(MM, e));
check('MM sees only Jharia-mine events', mmAudit.length > 0 && mmAudit.every((e) => e.mineId === 'MINE-JHR-04') && mmAudit.length < log.length);
const foAudit = log.filter((e) => access.canViewAuditEvent(FO, e));
check('FO sees only events it performed', foAudit.length > 0 && foAudit.every((e) => e.actor === name(FO)));

section('11b. Escalation notifications reach the right role');
const ofCA = (inbox, id) => inbox.filter((n) => n.entityId === id);
const t41 = (r) => ofCA(notif.getNotificationsForRole(r), 'CA-2026-0041').map((n) => n.title);
check('MM (Sunita) got L1 "Overdue" for CA-0041, nothing for L2/L3', t41(MM).includes('Corrective Action Overdue') && !t41(MM).some((t) => /Escalation Level/.test(t)));
check('CO got L2 for CA-0041 only (not L1/L3)', t41(CO).includes('Escalation Level 2 — Compliance Review Required') && !t41(CO).includes('Corrective Action Overdue') && !t41(CO).some((t) => /Level 3/.test(t)));
check('Admin got L3 for CA-0041 only', t41(AD).includes('Escalation Level 3 — Administrator Attention Required') && !t41(AD).some((t) => /Level 2|Overdue/.test(t)));
check('FO got no escalation notifications', notif.getNotificationsForRole(FO).every((n) => !/Escalation|Overdue/.test(n.title)));
check('Sunita (MM) does NOT see Talcher manager\'s L1 for CA-0022', ofCA(notif.getNotificationsForRole(MM), 'CA-2026-0022').length === 0);
check('CO sees CA-0022 L2', ofCA(notif.getNotificationsForRole(CO), 'CA-2026-0022').some((n) => /Level 2/.test(n.title)));

section('Notification read state is per-recipient');
const coUnread = notif.getUnreadCountForRole(CO), mmUnread = notif.getUnreadCountForRole(MM);
notif.markAllReadForRole(CO);
check('CO clears own inbox', notif.getUnreadCountForRole(CO) === 0 && coUnread > 0);
check('…without clearing MM inbox', notif.getUnreadCountForRole(MM) === mmUnread && mmUnread > 0);

// -------------------------------------------------------------------------
section('Risk engine untouched');
// md5 of src/riskEngine/riskEngine.js exactly as uploaded before Step 4 work began
const ORIGINAL_RISK_ENGINE_MD5 = 'ef19cc3ec70764358ffcdd252cf61ca3';
const md5ok = createHash('md5').update(readFileSync(`${SRC}/riskEngine/riskEngine.js`)).digest('hex') === ORIGINAL_RISK_ENGINE_MD5;
check('riskEngine.js checksum identical to the original upload', md5ok);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
