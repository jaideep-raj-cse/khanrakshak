// Per-role visibility on a fresh seed + app-startup behaviour.
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES, can } = await imp('data/roles.js');
const { storage } = await imp('storage/localStorage.js');
const { ensureSeeded } = await imp('services/seedService.js');
const { SEED_VERSION } = await imp('data/seedData.js');
const data = await imp('services/dataService.js');
const access = await imp('services/accessService.js');
const notif = await imp('services/notificationService.js');
const { getAuditLog } = await imp('services/auditService.js');
const wf = await imp('workflows/correctiveActionWorkflow.js');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`); };
const FO = ROLES.FIELD_OFFICER, MM = ROLES.MINE_MANAGER, CO = ROLES.COMPLIANCE_OFFICER, AD = ROLES.ADMINISTRATOR;

console.log('\n== Startup: old v3 browser data is reseeded to the new shape');
globalThis.__store.clear();
storage.write(storage.KEYS.SEED_VERSION, 3);
storage.write(storage.KEYS.CORRECTIVE_ACTIONS, [{ id: 'CA-OLD', status: 'IN_PROGRESS', escalated: true, overdueNotifiedAt: 'x' }]);
ensureSeeded();
check(`seed version is now ${SEED_VERSION}`, storage.read(storage.KEYS.SEED_VERSION) === SEED_VERSION && SEED_VERSION === 5);
check('old-shape records are gone; seeds carry escalationLevel + escalationHistory', !data.getCorrectiveActionById('CA-OLD') && data.getCorrectiveActions().every((a) => a.escalationLevel === 0 && Array.isArray(a.escalationHistory) && a.escalationHistory.length === 0 && !('escalated' in a)));

console.log('\n== Startup: RoleProvider effect = ensureSeeded + processEscalations, run twice (React StrictMode)');
const startupAt = new Date().toISOString();
const first = wf.processEscalations();
const auditAfterFirst = getAuditLog().length, notifAfterFirst = notif.getNotifications().length;
const second = wf.processEscalations();
const SEEDED_OVERDUE = ['CA-2026-0041', 'CA-2026-0022', 'CA-2026-0055', 'CA-2026-0049', 'CA-2026-0056'];
check('first run escalates exactly the five overdue seeded actions', first.length === 11 && first.every((r) => SEEDED_OVERDUE.includes(r.actionId)) && new Set(first.map((r) => r.actionId)).size === 5, JSON.stringify(first));
check('second (StrictMode) run creates nothing', second.length === 0 && getAuditLog().length === auditAfterFirst && notif.getNotifications().length === notifAfterFirst);

console.log('\n== Fresh-seed visibility per role (what each page will list)');
const view = (role) => ({
  mines: access.getVisibleMines(role).length,
  issues: data.getIssues().filter((i) => access.canViewIssue(role, i)).length,
  actions: data.getCorrectiveActions().filter((a) => access.canViewAction(role, a)).length,
});
const v = { FO: view(FO), MM: view(MM), CO: view(CO), AD: view(AD) };
console.log('       ', JSON.stringify(v));
check('Field Officer: 3 assigned mines, its 19 reported issues, 0 corrective actions', v.FO.mines === 3 && v.FO.issues === 19 && v.FO.actions === 0);
check('Mine Manager (Sunita): 1 mine, 8 issues, 3 corrective actions', v.MM.mines === 1 && v.MM.issues === 8 && v.MM.actions === 3);
check('Compliance Officer: everything (10 / 48 / 16)', v.CO.mines === 10 && v.CO.issues === 48 && v.CO.actions === 16);
check('Administrator: everything (10 / 48 / 16)', v.AD.mines === 10 && v.AD.issues === 48 && v.AD.actions === 16);
check('Dashboard corrective-action KPIs only for roles with CA access', !can('ca.view', FO) && can('ca.view', MM) && can('ca.view', CO) && can('ca.view', AD));

console.log('\n== Fresh-seed inboxes after startup escalation');
const inbox = (r) => notif.getNotificationsForRole(r);
const esc = (r) => inbox(r).filter((n) => n.entityType === 'CorrectiveAction' && n.timestamp >= startupAt && /Overdue|Escalation Level/.test(n.title));
check('Mine Manager (Sunita) gets the Level 1 overdue notice for her mine\'s overdue actions only (CA-0041, hero CA-0055)', esc(MM).length === 2 && esc(MM).every((n) => n.title === 'Corrective Action Overdue' && ['CA-2026-0041', 'CA-2026-0055'].includes(n.entityId)), JSON.stringify(esc(MM).map((n) => n.entityId)));
check('Compliance Officer gets 4 Level-2 notices (0041, 0022, 0055, 0049)', esc(CO).length === 4 && esc(CO).every((t) => /Level 2/.test(t.title)));
check('Administrator gets 2 Level-3 notices (0041, 0022)', esc(AD).length === 2 && esc(AD).every((t) => /Level 3/.test(t.title)));
check('Field Officer receives no escalation notices', esc(FO).length === 0);
check('Every persona has a seeded inbox with unread items', [FO, MM, CO].every((r) => inbox(r).length > 0 && notif.getUnreadCountForRole(r) > 0));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
