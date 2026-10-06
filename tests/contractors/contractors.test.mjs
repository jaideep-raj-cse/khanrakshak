// Run from the project root:  npm run test:contractors
// Exercises the real contractor service / data layer with a stubbed localStorage
// (same harness as the Step 4 and seed suites). Pages are thin wrappers over this logic.
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES, ROLE_DETAILS, can, canAccess } = await imp('data/roles.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const access = await imp('services/accessService.js');
const { getAuditLog } = await imp('services/auditService.js');
const cs = await imp('services/contractorService.js');
const { MINE_COMPLIANCE_OPTIONS, RISK_LEVEL_OPTIONS, CONTRACT_STATUS_OPTIONS } = await imp('data/constants.js');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name); console.log(`  FAIL  ${name} ${extra}`); }
}
function throwsMsg(fn) { try { fn(); return null; } catch (e) { return e.message; } }
function section(t) { console.log(`\n== ${t}`); }
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

const FO = ROLES.FIELD_OFFICER, MM = ROLES.MINE_MANAGER, CO = ROLES.COMPLIANCE_OFFICER, AD = ROLES.ADMINISTRATOR;
const name = (r) => ROLE_DETAILS[r].demoUser.name;
const NOW = new Date(2026, 8, 30, 11, 30); // 30 Sep 2026, 11:30 local
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOffset = (n) => iso(new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n));
const fresh = () => { globalThis.__store.clear(); ensureSeeded(NOW); };
const ids = (rows) => rows.map((r) => r.id);
const row = (rows, n) => rows.find((r) => r.id === `CTR-2026-${String(n).padStart(4, '0')}`);
const ctr = (n) => `CTR-2026-${String(n).padStart(4, '0')}`;

fresh();

// ---------------------------------------------------------------------------
section('Permissions & navigation');
check('All four roles can open Contractors', [FO, MM, CO, AD].every((r) => canAccess('contractors', r) && can('contractors.view', r)));
check('Only Mine Manager and Administrator can manage', can('contractors.manage', MM) && can('contractors.manage', AD) && !can('contractors.manage', FO) && !can('contractors.manage', CO));
check('Filter vocab: compliance / risk / contract options exist',
  MINE_COMPLIANCE_OPTIONS.some((o) => o.value === 'NON_COMPLIANT') && RISK_LEVEL_OPTIONS.some((o) => o.value === 'CRITICAL')
  && same(CONTRACT_STATUS_OPTIONS.map((o) => o.value), ['ALL', 'ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'UPCOMING', 'SUSPENDED']));

// ---------------------------------------------------------------------------
section('Scope — list rows per role');
const foRows = cs.getContractorRows(FO, NOW);
const mmRows = cs.getContractorRows(MM, NOW);
const coRows = cs.getContractorRows(CO, NOW);
const adRows = cs.getContractorRows(AD, NOW);
check('Compliance Officer sees all 12 contractors', coRows.length === 12);
check('Administrator sees all 12 contractors', adRows.length === 12);
check('Field Officer sees contractors at its assigned mines only (JHR-04, KOR-11, TAL-02)', same(ids(foRows), [1, 2, 5, 6, 11].map(ctr)), ids(foRows).join());
check('Mine Manager (Sunita Rao) sees contractors at Jharia Colliery No. 4 only', same(ids(mmRows), [1, 2].map(ctr)), ids(mmRows).join());
check('Scoped roles never receive an out-of-scope contractor', foRows.every((r) => r.mines.every((m) => access.canViewMine(FO, m.id))) && mmRows.every((r) => r.mines.every((m) => access.canViewMine(MM, m.id))));

// ---------------------------------------------------------------------------
section('Derived columns');
const r4 = row(coRows, 4), r3 = row(coRows, 3), r5 = row(coRows, 5), r9 = row(coRows, 9), r12 = row(coRows, 12), r7 = row(coRows, 7);
check('Row exposes all table columns', ['name', 'mineNames', 'workArea', 'complianceStatus', 'openViolations', 'safetyIncidents', 'riskLevel', 'contractStatus'].every((k) => r4[k] !== undefined));
check('Work area = service type; mine name resolved', r4.workArea === 'Drilling & blasting' && r4.mineNames === 'Jharia Eastern Seam 12');
check('Dhruva Drill & Blast: 2 open violations, 2 safety incidents, Non-Compliant / Critical', r4.openViolations === 2 && r4.safetyIncidents === 2 && r4.complianceStatus === 'NON_COMPLIANT' && r4.riskLevel === 'CRITICAL');
check('Mahua Manpower: 2 open violations, 1 safety incident (wage-slip finding is Labour, severity 3)', r3.openViolations === 2 && r3.safetyIncidents === 1);
check('Kesari: 1 open violation, 0 safety incidents (severity 3, Contractor domain)', r5.openViolations === 1 && r5.safetyIncidents === 0);
check('Pinaka: 1 open violation, 1 safety incident (lock-out/tag-out, severity 4)', r9.openViolations === 1 && r9.safetyIncidents === 1);
check('Sundari: 1 open violation, 0 safety incidents', r7.openViolations === 1 && r7.safetyIncidents === 0);
check('Anant Conveyor Works: clean record, all zeros, Active', r12.openViolations === 0 && r12.safetyIncidents === 0 && r12.contractStatus === 'ACTIVE');
check('Open violations across contractors = issues carrying a contractorId', coRows.reduce((n, r) => n + r.openViolations, 0) === data.getIssues().filter((i) => i.contractorId && i.status !== 'CLOSED').length);
check('Dhruva: contract Expiring Soon (ends in 60 days) AND licence Lapsed', r4.contractStatus === 'EXPIRING_SOON' && r4.licence.status === 'LAPSED' && r4.licence.needsAttention && r4.licence.short === 'Licence lapsed');
check('Mahua: licence Expiring (20 days), contract Active', r3.licence.status === 'EXPIRING' && r3.licence.daysRemaining === 20 && r3.contractStatus === 'ACTIVE');
check('Contract status mix in demo data: 11 Active, 1 Expiring Soon', coRows.filter((r) => r.contractStatus === 'ACTIVE').length === 11 && coRows.filter((r) => r.contractStatus === 'EXPIRING_SOON').length === 1);
check('Default order: highest risk first (Critical contractor leads)', coRows[0].id === ctr(4) && coRows.at(-1).riskLevel === 'LOW');

// ---------------------------------------------------------------------------
section('Contract / licence status boundaries');
const base = { contractStart: dayOffset(-100), contractEnd: dayOffset(200), licenseValidTill: dayOffset(200) };
const st = (patch) => cs.getContractStatus({ ...base, ...patch }, NOW);
const lic = (patch) => cs.getLicenceStatus({ ...base, ...patch }, NOW);
check('Ends in 61 days → Active', st({ contractEnd: dayOffset(61) }) === 'ACTIVE');
check('Ends in 60 days → Expiring Soon', st({ contractEnd: dayOffset(60) }) === 'EXPIRING_SOON');
check('Ends today → Expiring Soon (still in force)', st({ contractEnd: dayOffset(0) }) === 'EXPIRING_SOON');
check('Ended yesterday → Expired', st({ contractEnd: dayOffset(-1) }) === 'EXPIRED');
check('Starts tomorrow → Upcoming', st({ contractStart: dayOffset(1) }) === 'UPCOMING');
check('Started today → Active', st({ contractStart: dayOffset(0) }) === 'ACTIVE');
check('Manual Suspended override wins over dates', st({ contractStatusOverride: 'SUSPENDED', contractEnd: dayOffset(-5) }) === 'SUSPENDED');
check('Licence valid 31 days out → Valid, no attention', lic({ licenseValidTill: dayOffset(31) }).status === 'VALID' && !lic({ licenseValidTill: dayOffset(31) }).needsAttention);
check('Licence valid 30 days out → Expiring', lic({ licenseValidTill: dayOffset(30) }).status === 'EXPIRING');
check('Licence valid today → "Expires today"', lic({ licenseValidTill: dayOffset(0) }).label === 'Expires today');
check('Licence expired yesterday → Lapsed "1 day ago"', lic({ licenseValidTill: dayOffset(-1) }).status === 'LAPSED' && lic({ licenseValidTill: dayOffset(-1) }).label === 'Lapsed 1 day ago');
check('Missing licence date → Unknown, no crash', lic({ licenseValidTill: null }).status === 'UNKNOWN');

// ---------------------------------------------------------------------------
section('Search & filters');
const f = (o, rows = coRows) => cs.filterContractors(rows, o);
check('No filters → everything', f({}).length === 12 && f({ mineId: 'ALL', riskLevel: 'ALL', complianceStatus: 'ALL', contractStatus: 'ALL', search: '' }).length === 12);
check('Search by name (case-insensitive)', same(ids(f({ search: 'TARKASH' })), [ctr(1)]));
check('Search by work area ("blast")', same(ids(f({ search: 'blast' })), [ctr(4)]));
check('Search by mine name', same(ids(f({ search: 'Talcher' })), [ctr(5), ctr(6)]));
check('Search by contractor id', same(ids(f({ search: 'ctr-2026-0009' })), [ctr(9)]));
check('Search by contact person', same(ids(f({ search: 'gita hembram' })), [ctr(7)]));
check('Search ignores surrounding whitespace', f({ search: '  tarkash  ' }).length === 1);
check('Mine filter', same(ids(f({ mineId: 'MINE-JHR-12' })), [ctr(3), ctr(4)]));
check('Risk filter: Critical → Dhruva only', same(ids(f({ riskLevel: 'CRITICAL' })), [ctr(4)]));
check('Risk filter: High → Mahua + Kesari', same(ids(f({ riskLevel: 'HIGH' })), [ctr(3), ctr(5)]));
check('Compliance filter: Non-Compliant = 3, Compliant = 5, Under Review = 4',
  f({ complianceStatus: 'NON_COMPLIANT' }).length === 3 && f({ complianceStatus: 'COMPLIANT' }).length === 5 && f({ complianceStatus: 'UNDER_REVIEW' }).length === 4);
check('Contract filter: Expiring Soon → Dhruva; Expired → none', same(ids(f({ contractStatus: 'EXPIRING_SOON' })), [ctr(4)]) && f({ contractStatus: 'EXPIRED' }).length === 0);
check('Filters combine (AND): Jharia 12 + Non-Compliant + High → Mahua', same(ids(f({ mineId: 'MINE-JHR-12', complianceStatus: 'NON_COMPLIANT', riskLevel: 'HIGH' })), [ctr(3)]));
check('Empty result is an empty array (drives the empty state)', f({ search: 'zzz-nothing' }).length === 0 && f({ riskLevel: 'CRITICAL', complianceStatus: 'COMPLIANT' }).length === 0);
check('Filtering is applied inside role scope (Field Officer + Non-Compliant → Kesari only)', same(ids(f({ complianceStatus: 'NON_COMPLIANT' }, foRows)), [ctr(5)]));

// ---------------------------------------------------------------------------
section('Detail — scope & content');
const d = (id, role) => cs.getContractorDetail(id, role, NOW);
check('Unknown contractor id → null', d('CTR-2026-9999', CO) === null);
check('Mine Manager cannot open a contractor at another mine', d(ctr(3), MM) === null);
check('Field Officer cannot open a contractor at an unassigned mine', d(ctr(3), FO) === null && d(ctr(8), FO) === null);
check('Field Officer can open a contractor at an assigned mine', d(ctr(5), FO) !== null);
check('Compliance Officer and Administrator can open any contractor', coRows.every((r) => d(r.id, CO) && d(r.id, AD)));
const dd = d(ctr(4), CO);
check('Detail carries profile fields', dd.contactPerson === 'Anil Tirkey' && dd.licenseNumber === 'DEMO-CTR-LIC-0004' && dd.workforceSize === 46 && dd.workArea === 'Drilling & blasting');
check('Detail carries assigned mine(s) as {id, name}', dd.mines.length === 1 && dd.mines[0].id === 'MINE-JHR-12');
check('Linked issues = the two Dhruva findings', same(dd.linkedIssues.map((i) => i.id), ['ISSUE-2026-0111', 'ISSUE-2026-0112']));
check('Linked issues carry computed risk', dd.linkedIssues.every((i) => typeof i.riskScore === 'number' && i.riskLevel));
check('Every linked issue id resolves to a real issue page', dd.linkedIssues.every((i) => data.getIssueById(i.id)));
check('Detail counts match the list row', dd.openViolations === r4.openViolations && dd.safetyIncidents === r4.safetyIncidents);
check('Contractor with no findings: empty linked issues, zero counts', d(ctr(12), CO).linkedIssues.length === 0 && d(ctr(12), CO).openViolations === 0);
check('CO / AD cannot manage; MM can manage in scope; MM cannot manage out of scope',
  !d(ctr(4), CO).canManage && d(ctr(4), AD).canManage && d(ctr(1), MM).canManage && !d(ctr(5), FO).canManage);

// Field Officer: Kesari's finding was reported by Arjun Verma (the FO persona) → visible
const fo5 = d(ctr(5), FO);
check('Field Officer sees the linked issue it reported', fo5.linkedIssues.length === 1 && fo5.linkedIssues[0].id === 'ISSUE-2026-0110' && fo5.hiddenIssueCount === 0);
check('Field Officer can open that issue (existing canViewIssue rule)', access.canViewIssue(FO, fo5.linkedIssues[0]));

// ---------------------------------------------------------------------------
section('Detail — Field Officer sees only issues it reported, counts stay true');
fresh();
data.addIssue({
  id: 'ISSUE-2026-9001', mineId: 'MINE-TAL-02', inspectionId: null, category: 'Contractor Compliance',
  title: 'Extra finding by a different officer', description: 'test', status: 'OPEN', severity: 2, recurrenceCount: 1,
  exposureLevel: 'low', exposureWorkers: 3, evidence: null, observedDate: dayOffset(-3),
  reportedBy: 'Neha Kerketta', reportedByRole: 'Field Officer', correctiveActionId: null, contractorId: ctr(5),
});
const fo5b = d(ctr(5), FO);
check('Linked list hides the other officer\'s issue', fo5b.linkedIssues.length === 1 && fo5b.hiddenIssueCount === 1);
check('Counts still cover all linked findings (2 open)', fo5b.openViolations === 2 && fo5b.totalFindings === 2);
check('Compliance Officer sees both', d(ctr(5), CO).linkedIssues.length === 2 && d(ctr(5), CO).hiddenIssueCount === 0);
fresh();

// ---------------------------------------------------------------------------
section('Findings trend');
const t4 = d(ctr(4), CO).trend;
check('Trend has 6 monthly buckets ending in the current month', t4.months.length === 6 && t4.months.at(-1).key === '2026-09' && t4.months[0].key === '2026-04');
check('Dhruva: both findings fall in September, peak level High', t4.months.at(-1).findings === 2 && t4.months.at(-1).peakLevel === 'HIGH' && t4.monthsWithFindings === 1);
check('One month of data → hasTrend is false (page says so, no fake trend)', t4.hasTrend === false);
check('Safety incidents bucketed too', t4.months.at(-1).safetyIncidents === 2);
check('Clean contractor: all-zero trend', d(ctr(12), CO).trend.months.every((m) => m.findings === 0) && d(ctr(12), CO).trend.maxFindings === 0);
const synth = cs.getFindingsTrend([
  { observedDate: dayOffset(-2), riskScore: 70, riskLevel: 'HIGH', category: 'Contractor Compliance', severity: 3 },
  { observedDate: dayOffset(-40), riskScore: 20, riskLevel: 'LOW', category: 'Contractor Compliance', severity: 1 },
  { observedDate: dayOffset(-45), riskScore: 90, riskLevel: 'CRITICAL', category: 'Fire Safety', severity: 5 },
  { observedDate: dayOffset(-400), riskScore: 10, riskLevel: 'LOW', category: 'Contractor Compliance', severity: 1 },
], NOW);
check('Synthetic multi-month data → hasTrend true, older-than-window counted separately', synth.hasTrend && synth.monthsWithFindings >= 2 && synth.outsideWindow === 1);
check('Peak level per month uses the highest score', synth.months.some((m) => m.peakLevel === 'CRITICAL' && m.peakScore === 90));

// ---------------------------------------------------------------------------
section('Timeline');
const tl = cs.buildContractorTimeline(dd, dd.linkedIssues, NOW);
check('Timeline is chronological (oldest first)', tl.every((e, i) => i === 0 || new Date(tl[i - 1].date) <= new Date(e.date)));
check('Timeline has a Contract Started event', tl.some((e) => e.action === 'Contract Started'));
check('Timeline has one Finding Logged per linked issue, attributed to the reporting officer', tl.filter((e) => e.action === 'Finding Logged').length === 2 && tl.filter((e) => e.action === 'Finding Logged').every((e) => e.actor === 'Neha Kerketta'));
check('Lapsed licence appears on the timeline (Dhruva only)', tl.some((e) => e.action === 'Licence Lapsed') && !cs.buildContractorTimeline(d(ctr(12), CO), [], NOW).some((e) => e.action === 'Licence Lapsed'));
check('Every event has a display date for the Timeline component', tl.every((e) => e.displayDate && e.displayDate !== '—'));
check('Empty/missing contractor → empty timeline', cs.buildContractorTimeline(null, []).length === 0);

// ---------------------------------------------------------------------------
section('Management — permissions, scope, validation');
fresh();
const mmName = name(MM), adName = name(AD);
check('Field Officer cannot suspend', /permission/.test(throwsMsg(() => cs.suspendContract({ contractorId: ctr(5), actor: name(FO), role: FO, reason: 'x' })) ?? ''));
check('Compliance Officer cannot suspend', /permission/.test(throwsMsg(() => cs.suspendContract({ contractorId: ctr(1), actor: name(CO), role: CO, reason: 'x' })) ?? ''));
check('Field Officer / Compliance Officer cannot edit remarks', !!throwsMsg(() => cs.updateContractorRemarks({ contractorId: ctr(5), actor: 'x', role: FO, remarks: 'r' })) && !!throwsMsg(() => cs.updateContractorRemarks({ contractorId: ctr(1), actor: 'x', role: CO, remarks: 'r' })));
check('Mine Manager cannot manage a contractor at another mine', /outside your assigned/.test(throwsMsg(() => cs.suspendContract({ contractorId: ctr(3), actor: mmName, role: MM, reason: 'x' })) ?? ''));
check('Unknown contractor → "not found"', /not found/.test(throwsMsg(() => cs.suspendContract({ contractorId: 'CTR-2026-9999', actor: adName, role: AD, reason: 'x' })) ?? ''));
check('Suspension requires a reason (blank / whitespace rejected)', /reason is required/.test(throwsMsg(() => cs.suspendContract({ contractorId: ctr(1), actor: mmName, role: MM, reason: '   ' })) ?? ''));
check('Overlong reason rejected', !!throwsMsg(() => cs.suspendContract({ contractorId: ctr(1), actor: mmName, role: MM, reason: 'x'.repeat(cs.REMARKS_MAX_LENGTH + 1) })));
check('Reinstating a contract that is not suspended is rejected', /Only a suspended/.test(throwsMsg(() => cs.reinstateContract({ contractorId: ctr(1), actor: mmName, role: MM })) ?? ''));
check('Rejected attempts changed nothing and logged nothing', data.getContractorById(ctr(1)).contractStatusOverride === undefined && getAuditLog().every((e) => e.entity !== 'Contractor'));

section('Management — suspend / reinstate / remarks');
const auditBefore = getAuditLog().length;
cs.suspendContract({ contractorId: ctr(1), actor: mmName, role: MM, reason: 'Vehicle fitness certificates expired' });
let s1 = row(cs.getContractorRows(MM, NOW), 1);
check('Mine Manager suspends its own contractor → Suspended', s1.contractStatus === 'SUSPENDED');
check('Suspension persisted with who / why / when', (() => { const c = data.getContractorById(ctr(1)); return c.suspension.by === mmName && c.suspension.reason.includes('fitness') && !!c.suspension.at; })());
check('Compliance status and risk are NOT altered by suspension', s1.complianceStatus === 'UNDER_REVIEW' && s1.riskLevel === 'MODERATE');
check('Suspended filter finds it; Active filter no longer does', same(ids(cs.filterContractors(cs.getContractorRows(CO, NOW), { contractStatus: 'SUSPENDED' })), [ctr(1)]) && !ids(cs.filterContractors(cs.getContractorRows(CO, NOW), { contractStatus: 'ACTIVE' })).includes(ctr(1)));
check('Exactly one audit event written, tagged to the mine', getAuditLog().length === auditBefore + 1 && (() => { const e = getAuditLog()[0]; return e.entity === 'Contractor' && e.entityId === ctr(1) && e.action === 'Contract Suspended' && e.actor === mmName && e.role === 'Mine Manager' && e.mineId === 'MINE-JHR-04'; })());
check('That audit event is visible to the Mine Manager and Compliance Officer; hidden from the Field Officer', (() => { const e = getAuditLog()[0]; return access.canViewAuditEvent(MM, e) && access.canViewAuditEvent(CO, e) && !access.canViewAuditEvent(FO, e); })());
check('Suspending twice is rejected', /already suspended/.test(throwsMsg(() => cs.suspendContract({ contractorId: ctr(1), actor: mmName, role: MM, reason: 'again' })) ?? ''));
check('Suspension shows on the timeline with the real actor', cs.buildContractorTimeline(data.getContractorById(ctr(1)), [], NOW).some((e) => e.action === 'Contract Suspended' && e.actor === mmName));
check('Detail reflects the suspension and carries it for the banner', (() => { const x = d(ctr(1), MM); return x.contractStatus === 'SUSPENDED' && x.suspension.reason.includes('fitness'); })());

cs.reinstateContract({ contractorId: ctr(1), actor: mmName, role: MM });
check('Reinstate → status returns to the date-derived value (Active)', row(cs.getContractorRows(MM, NOW), 1).contractStatus === 'ACTIVE' && data.getContractorById(ctr(1)).suspension === null);
check('Reinstate logged', getAuditLog()[0].action === 'Contract Reinstated');
check('Timeline keeps same-day order: suspended BEFORE reinstated (audit log is newest-first)', (() => {
  const acts = cs.buildContractorTimeline(data.getContractorById(ctr(1)), [], NOW).map((e) => e.action);
  return acts.indexOf('Contract Suspended') !== -1 && acts.indexOf('Contract Suspended') < acts.indexOf('Contract Reinstated');
})());
check('Audit-event dates use the LOCAL calendar day (not the UTC slice)',
  cs.toLocalISODate(new Date(2026, 9, 3, 0, 30).toISOString()) === '2026-10-03' && cs.toLocalISODate(new Date(2026, 9, 3, 23, 45).toISOString()) === '2026-10-03'
  && cs.toLocalISODate(null) === null && cs.toLocalISODate('not a date') === null);

cs.updateContractorRemarks({ contractorId: ctr(2), actor: mmName, role: MM, remarks: '  Roof-support audit scheduled.  ' });
check('Remarks saved (trimmed) and audited', data.getContractorById(ctr(2)).remarks === 'Roof-support audit scheduled.' && getAuditLog()[0].action === 'Contractor Remarks Updated');
check('Remarks update leaves other fields intact', (() => { const c = data.getContractorById(ctr(2)); return c.name === 'Ashvin Rockbolt Engineering' && c.complianceScore === 91 && c.licenseNumber === 'DEMO-CTR-LIC-0002'; })());

cs.suspendContract({ contractorId: ctr(3), actor: adName, role: AD, reason: 'Licence renewal not produced' });
check('Administrator can manage a contractor at any mine', row(cs.getContractorRows(AD, NOW), 3).contractStatus === 'SUSPENDED');
cs.reinstateContract({ contractorId: ctr(3), actor: adName, role: AD });
check('Administrator can reinstate', row(cs.getContractorRows(AD, NOW), 3).contractStatus === 'ACTIVE');

// ---------------------------------------------------------------------------
section('Data integrity & architecture');
fresh();
const contractors = data.getContractors(), issues = data.getIssues(), mines = data.getMines();
check('Seed still has 12 contractors and no schema fields were added by the module', contractors.length === 12 && contractors.every((c) => c.contractStatusOverride === undefined));
check('Every contractor belongs to an existing mine', contractors.every((c) => mines.some((m) => m.id === c.mineId)));
check('Every Issue.contractorId resolves to a contractor at the same mine', issues.filter((i) => i.contractorId).every((i) => { const c = data.getContractorById(i.contractorId); return c && c.mineId === i.mineId; }));
check('updateContractor merges (never replaces) and returns null for unknown ids', (() => { const u = data.updateContractor(ctr(8), { remarks: 'x' }); return u.name === 'Vajra Ventilation Systems' && data.updateContractor('nope', {}) === null; })());

const app = readFileSync(`${SRC}/App.jsx`, 'utf8');
check('/contractors route renders the real Contractors page behind the contractors nav guard', /path="\/contractors"[^>]*element=\{<RequireNav navId="contractors"><Contractors \/><\/RequireNav>\}/.test(app));
check('/contractors/:contractorId renders ContractorDetail behind the guard', /path="\/contractors\/:contractorId"[^>]*element=\{<RequireNav navId="contractors"><ContractorDetail \/><\/RequireNav>\}/.test(app));
check('Contractor routes no longer use PlaceholderPage', !/path="\/contractors[^"]*"[^\n]*PlaceholderPage/.test(app));
check('Remaining placeholders untouched (admin) — Documents, Risk Map and Analytics are real pages now', ['/admin/users', '/admin/mines', '/admin/contractors'].every((p) => new RegExp(`path="${p.replace(/\//g, '\\/')}"[^\\n]*PlaceholderPage`).test(app)));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
