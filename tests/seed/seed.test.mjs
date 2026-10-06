// Run from the project root:  npm run test:seed
// Verifies the expanded demo dataset: scale, relationships, scenarios, risk.
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { storage } = await imp('storage/localStorage.js');
const { ensureSeeded } = await imp('services/seedService.js');
const { SEED_VERSION, buildSeedData } = await imp('data/seedData.js');
const data = await imp('services/dataService.js');
const { getAuditLog } = await imp('services/auditService.js');
const { getNotifications } = await imp('services/notificationService.js');
const wf = await imp('workflows/correctiveActionWorkflow.js');
const { ISSUE_CATEGORIES, INSPECTION_TYPES, ISSUE_CATEGORY_GROUPS, getCategoryGroup } = await imp('data/constants.js');
const { calculateRisk } = await imp('riskEngine/riskEngine.js');
const { ROLES } = await imp('data/roles.js');
const access = await imp('services/accessService.js');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`); };
const section = (t) => console.log(`\n== ${t}`);
const uniq = (arr) => new Set(arr).size === arr.length;
const by = (arr, f) => arr.reduce((a, x) => { const k = f(x); a[k] = (a[k] ?? 0) + 1; return a; }, {});

globalThis.__store.clear();
ensureSeeded(); // anchored to "now", like the real app
const startedAt = new Date().toISOString();
wf.processEscalations(); // app-start behaviour

const mines = data.getMines();
const inspections = data.getInspections();
const issues = data.getIssues();
const actions = data.getCorrectiveActions();
const contractors = data.getContractors();
const documents = data.getDocuments();
const audit = getAuditLog();
const notifs = getNotifications();
const issuesRel = data.getIssuesWithRelations();
const actionsRel = data.getCorrectiveActionsWithRelations();
const minesStats = data.getMinesWithStats();

section('Scale');
check(`seed version is 5`, SEED_VERSION === 5 && storage.read(storage.KEYS.SEED_VERSION) === 5);
check('10 mines', mines.length === 10);
check('32 inspections', inspections.length === 32);
check('48 issues', issues.length === 48);
check('16 corrective actions', actions.length === 16);
check('12 contractors', contractors.length === 12);
check('10 documents (8–10 required)', documents.length === 10);
check('audit log and notifications populated', audit.length >= 100 && notifs.length >= 40, `${audit.length}/${notifs.length}`);
check('ids unique in every collection', [mines, inspections, issues, actions, contractors, documents, audit, notifs].every((c) => uniq(c.map((r) => r.id))));
const regions = new Set(mines.map((m) => m.region.split(',')[0]));
check('all eight coal regions represented', ['Jharia', 'Raniganj', 'Korba', 'Singrauli', 'Talcher', 'North Karanpura', 'Ramgarh', 'Bokaro'].every((r) => regions.has(r)), [...regions].join());

section('Relationships (no broken foreign keys)');
const mineIds = new Set(mines.map((m) => m.id));
const inspById = Object.fromEntries(inspections.map((i) => [i.id, i]));
const issueById = Object.fromEntries(issues.map((i) => [i.id, i]));
const caById = Object.fromEntries(actions.map((a) => [a.id, a]));
const contractorById = Object.fromEntries(contractors.map((c) => [c.id, c]));
const mineById = Object.fromEntries(mines.map((m) => [m.id, m]));
check('every inspection → a mine', inspections.every((i) => mineIds.has(i.mineId)));
check('every issue → a mine and an inspection at the SAME mine, same date, same inspector', issues.every((i) => { const n = inspById[i.inspectionId]; return n && n.mineId === i.mineId && n.date === i.observedDate && n.inspector === i.reportedBy; }));
check('every corrective action → an issue at the same mine', actions.every((a) => issueById[a.issueId] && issueById[a.issueId].mineId === a.mineId));
check('issue ↔ corrective action links are bidirectional, max one per issue', actions.every((a) => issueById[a.issueId].correctiveActionId === a.id) && issues.every((i) => !i.correctiveActionId || caById[i.correctiveActionId]?.issueId === i.id) && uniq(actions.map((a) => a.issueId)));
check('corrective action assignee is the mine manager', actions.every((a) => a.assignee === mineById[a.mineId].manager));
check('every contractor → a mine; every mine has at least one except the intentional KOR-17 empty state', contractors.every((c) => mineIds.has(c.mineId)) && mines.filter((m) => !contractors.some((c) => c.mineId === m.id)).map((m) => m.id).join() === 'MINE-KOR-17');
check('issue.contractorId → real contractor at the same mine', issues.filter((i) => i.contractorId).length >= 5 && issues.filter((i) => i.contractorId).every((i) => contractorById[i.contractorId]?.mineId === i.mineId));
check('every document → a mine; related inspection/issue exist at that mine', documents.every((d) => mineIds.has(d.mineId) && (!d.relatedInspectionId || inspById[d.relatedInspectionId]?.mineId === d.mineId) && (!d.relatedIssueId || issueById[d.relatedIssueId]?.mineId === d.mineId)));
check('every mine has inspections and issues', mines.every((m) => inspections.some((i) => i.mineId === m.id) && issues.some((i) => i.mineId === m.id)));
const entityExists = (e) => ({ Inspection: inspById, Issue: issueById, 'Corrective Action': caById }[e.entity]?.[e.entityId]);
const entityMine = (e) => entityExists(e)?.mineId;
check('every audit event → an existing entity, carrying that entity\'s mineId', audit.every((e) => entityExists(e) && e.mineId === entityMine(e)));
check('every notification → an existing entity at the right mine', notifs.every((n) => { const rec = ({ Inspection: inspById, Issue: issueById, CorrectiveAction: caById })[n.entityType]?.[n.entityId]; return rec && rec.mineId === n.mineId && n.recipientRole; }));
const auditHas = (id, action) => audit.some((e) => e.entityId === id && e.action === action);
check('every inspection has "Inspection Submitted"; every issue has "Issue Created" + "Risk Calculated"', inspections.every((i) => auditHas(i.id, 'Inspection Submitted')) && issues.every((i) => auditHas(i.id, 'Issue Created') && auditHas(i.id, 'Risk Calculated')));
check('every corrective action has a creation audit event; closed ones have Verified + Closed', actions.every((a) => auditHas(a.id, 'Corrective Action Auto-Assigned (Risk-Triggered)') || auditHas(a.id, 'Corrective Action Created')) && actions.filter((a) => a.status === 'CLOSED').every((a) => auditHas(a.id, 'Corrective Action Verified') && auditHas(a.id, 'Corrective Action Closed')));
check('closed issue ⇔ closed corrective action', issues.every((i) => (i.status === 'CLOSED') === (i.correctiveActionId ? caById[i.correctiveActionId].status === 'CLOSED' : false)));
check('audit ids ascend with time (log stored newest-first)', audit.every((e, k) => k === 0 || (audit[k - 1].timestamp >= e.timestamp && audit[k - 1].id > e.id)));

section('Vocabulary and categories');
check('issue + inspection categories come from ISSUE_CATEGORIES; inspection types from INSPECTION_TYPES', issues.every((i) => ISSUE_CATEGORIES.includes(i.category)) && inspections.every((i) => ISSUE_CATEGORIES.includes(i.category) && INSPECTION_TYPES.includes(i.inspectionType)));
check('every ISSUE_CATEGORIES entry belongs to exactly one domain', ISSUE_CATEGORIES.every((c) => Object.values(ISSUE_CATEGORY_GROUPS).filter((g) => g.includes(c)).length === 1));
const domains = by(issues, (i) => getCategoryGroup(i.category));
console.log('       issues by domain:', JSON.stringify(domains));
check('Safety, Environment, Labour, Contractor, Operations all present (≥4 each)', ['Safety', 'Environment', 'Labour', 'Contractor', 'Operations'].every((d) => (domains[d] ?? 0) >= 4));
check('exactly two clean inspections (no findings)', inspections.filter((i) => !issues.some((x) => x.inspectionId === i.id)).length === 2);

section('Inspections span ~6 months');
const daysAgo = (iso) => Math.round((new Date().setHours(0, 0, 0, 0) - new Date(`${iso}T00:00:00`).getTime()) / 864e5);
const ages = inspections.map((i) => daysAgo(i.date));
const windows = by(ages, (a) => Math.floor(a / 30));
console.log('       inspections per 30-day window (0 = most recent):', JSON.stringify(windows));
check('oldest 150–180 days ago, newest within the last 10 days', Math.max(...ages) >= 150 && Math.max(...ages) <= 180 && Math.min(...ages) <= 10, `${Math.min(...ages)}..${Math.max(...ages)}`);
check('all six 30-day windows contain inspections', [0, 1, 2, 3, 4, 5].every((w) => windows[w] > 0));
check('mine.lastInspection = that mine\'s newest inspection', mines.every((m) => m.lastInspection === inspections.filter((i) => i.mineId === m.id).map((i) => i.date).sort().pop()));

section('Hero issue — "Workers repeatedly operating without required PPE"');
const hero = data.getIssueWithRelations('ISSUE-2026-0115');
check('hero exists with the exact title', hero?.title === 'Workers repeatedly operating without required PPE');
check('severity 5, recurrence 3, exposure high (= 4 on the 1–5 scale)', hero.severity === 5 && hero.recurrenceCount === 3 && hero.exposureLevel === 'high');
check('engine produces 87 / CRITICAL', hero.riskScore === 87 && hero.riskLevel === 'CRITICAL', `${hero.riskScore} ${hero.riskLevel}`);
check('breakdown: 40.0 + 25.0 + 16.0 + 6.0 (4 days overdue)', hero.riskBreakdown.severity.contribution === 40 && hero.riskBreakdown.recurrence.contribution === 25 && hero.riskBreakdown.exposure.contribution === 16 && hero.riskBreakdown.delay.input === 4 && hero.riskBreakdown.delay.contribution === 6);
check('its corrective action is open (in progress) and 4 days overdue', hero.correctiveAction.status === 'IN_PROGRESS' && wf.computeDaysInfo(hero.correctiveAction).overdueDays === 4);
check('hero is at Jharia Colliery No. 4, reported by the Field Officer persona', hero.mineId === 'MINE-JHR-04' && hero.reportedBy === 'Arjun Verma');
// Stable all day, on any seed date
for (const [y, mo, d, h, mi] of [[2026, 9, 1, 0, 5], [2026, 9, 1, 13, 40], [2027, 2, 14, 23, 50]]) {
  const anchor = new Date(y, mo, d, h, mi);
  globalThis.__store.clear();
  ensureSeeded(anchor);
  const r = data.computeIssueRisk(data.getIssueById('ISSUE-2026-0115'), anchor);
  check(`hero = 87 CRITICAL when seeded and read on ${anchor.toDateString()} at ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`, r.riskScore === 87 && r.riskLevel === 'CRITICAL', String(r.riskScore));
}
// Pure engine, raw inputs, as in the blueprint
check('engine alone: sev 5 / rec 3 / exposure 4 / 4 days overdue → 87 Critical', (() => { const r = calculateRisk({ severity: 5, recurrenceCount: 3, exposure: 4, correctiveActionDeadline: '2026-09-27' }, new Date(2026, 9, 1)); return r.riskScore === 87 && r.riskLevel === 'CRITICAL'; })());
// restore the default seed for the remaining checks
globalThis.__store.clear();
ensureSeeded();
wf.processEscalations();

section('Risk distribution and critical mines');
const mineRisk = by(minesStats, (m) => m.riskLevel);
const issueRisk = by(issuesRel, (i) => i.riskLevel);
console.log('       mines by risk :', JSON.stringify(mineRisk));
console.log('       issues by risk:', JSON.stringify(issueRisk));
check('at least 2 Critical mines (3 seeded)', (mineRisk.CRITICAL ?? 0) >= 2, JSON.stringify(mineRisk));
check('Critical mines are Jharia 4, Talcher 2, Raniganj 3', ['MINE-JHR-04', 'MINE-TAL-02', 'MINE-RAN-03'].every((id) => mineById[id].riskLevel === 'CRITICAL'));
check('every level is represented and the shape is a pyramid (Low+Medium ≥ High+Critical)', ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].every((l) => mineRisk[l] > 0) && (mineRisk.LOW + mineRisk.MODERATE) >= (mineRisk.HIGH + mineRisk.CRITICAL));
check('stored mine riskLevel = worst open issue as computed by the engine now', mines.every((m) => { const open = issuesRel.filter((i) => i.mineId === m.id && i.status !== 'CLOSED'); const order = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 }; return open.length && open.reduce((a, i) => (order[i.riskLevel] > order[a] ? i.riskLevel : a), 'LOW') === m.riskLevel; }));
check('issues: spread across all four levels, most are Low/Medium (long tail)', ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].every((l) => issueRisk[l] > 0) && (issueRisk.LOW + issueRisk.MODERATE) > (issueRisk.HIGH + issueRisk.CRITICAL) * 2);
check('compliance status mix: Non-Compliant / Under Review / Compliant all present; Critical mines are Non-Compliant', ['NON_COMPLIANT', 'UNDER_REVIEW', 'COMPLIANT'].every((s) => mines.some((m) => m.complianceStatus === s)) && mines.filter((m) => m.riskLevel === 'CRITICAL').every((m) => m.complianceStatus === 'NON_COMPLIANT'));
check('pipeline rule: no issue that scores High/Critical at creation lacks a corrective action', issues.every((i) => { const r = calculateRisk({ severity: i.severity, recurrenceCount: i.recurrenceCount, exposureLevel: i.exposureLevel, exposureWorkers: i.exposureWorkers, correctiveActionDeadline: null }); return !['HIGH', 'CRITICAL'].includes(r.riskLevel) || i.correctiveActionId; }));

section('Recurring violations');
const recurring = issues.filter((i) => i.recurrenceCount >= 2);
console.log(`       recurrenceCount ≥ 2: ${recurring.length} issues; ≥ 3: ${issues.filter((i) => i.recurrenceCount >= 3).length}`);
check('at least 10 issues with recurrenceCount ≥ 2 (12 seeded)', recurring.length >= 10);
check('recurring issues span several mines and include chronic (3) cases', new Set(recurring.map((i) => i.mineId)).size >= 6 && issues.filter((i) => i.recurrenceCount === 3).length >= 3);
check('recurring issues show the engine\'s "Repeated violation" reason', issuesRel.filter((i) => i.recurrenceCount >= 2).every((i) => i.riskReasons.some((r) => /Repeated violation/.test(r))));

section('Corrective-action lifecycle, deadlines and overdue');
const status = by(actions, (a) => a.status);
console.log('       by status:', JSON.stringify(status));
check('Open, Assigned, In Progress, Pending Verification and Closed all present', ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'SUBMITTED_FOR_VERIFICATION', 'CLOSED'].every((s) => status[s] > 0));
check('status counts 2 / 4 / 5 / 3 / 2', status.OPEN === 2 && status.ASSIGNED === 4 && status.IN_PROGRESS === 5 && status.SUBMITTED_FOR_VERIFICATION === 3 && status.CLOSED === 2);
check('lifecycle stamps match status (started / submitted+evidence+notes / verified+closed)', actions.every((a) => (['IN_PROGRESS', 'SUBMITTED_FOR_VERIFICATION', 'CLOSED'].includes(a.status) ? true : !a.startedAt) && (a.status === 'SUBMITTED_FOR_VERIFICATION' || a.status === 'CLOSED' ? !!a.submittedAt && !!a.completionNotes && !!a.evidence : !a.submittedAt) && (a.status === 'CLOSED' ? !!a.verifiedAt && !!a.closedAt && a.closedBy : !a.closedAt)));
check('deadlines are realistic (every action due 1–30 days after creation)', actions.every((a) => { const d = (new Date(a.dueDate) - new Date(a.createdDate)) / 864e5; return d >= 1 && d <= 30; }));
const overdue = actionsRel.filter((a) => a.overdue);
console.log('       overdue:', overdue.map((a) => `${a.id}(+${wf.computeDaysInfo(a).overdueDays}d, L${wf.getEscalationLevel(a)})`).join(' '));
check('at least 4 overdue actions (5 seeded)', overdue.length >= 4);
check('overdue set is exactly 0041, 0022, 0055 (hero), 0049, 0056 and none is closed', JSON.stringify(overdue.map((a) => a.id).sort()) === JSON.stringify(['CA-2026-0022', 'CA-2026-0041', 'CA-2026-0049', 'CA-2026-0055', 'CA-2026-0056']));
check('escalation levels cover L1, L2 and L3 after startup processing', [1, 2, 3].every((l) => overdue.some((a) => wf.getEscalationLevel(a) === l)));
check('seeded actions start un-escalated (escalationLevel 0, empty history) — startup raises them live', (() => { const fresh = buildSeedData().correctiveActions; return fresh.every((a) => a.escalationLevel === 0 && a.escalationHistory.length === 0); })());
check('pending-verification actions are on time (verification queue is not already overdue)', actions.filter((a) => a.status === 'SUBMITTED_FOR_VERIFICATION').every((a) => !wf.computeDaysInfo(a).overdue));
check('rework loop is demonstrated (CA-0054 rejected once, then resubmitted)', (() => { const a = caById['CA-2026-0054']; return a.rejectedAt && a.submittedAt > a.rejectedAt && auditHas('CA-2026-0054', 'Corrective Action Rejected / Reopened'); })());
check('startup escalation wrote audit events + notifications for each raised level', audit.filter((e) => /Escalat|Overdue/.test(e.action)).length === 11 && notifs.filter((n) => n.timestamp >= startedAt && /Overdue|Escalation Level/.test(n.title)).length === 11);

section('Dashboard / Mines numbers (Compliance Officer / Administrator view)');
const openIssues = issues.filter((i) => i.status !== 'CLOSED').length;
const pending = actionsRel.filter((a) => !['VERIFIED', 'CLOSED'].includes(a.status)).length;
console.log(`       open issues ${openIssues} · high/critical mines ${minesStats.filter((m) => ['HIGH', 'CRITICAL'].includes(m.riskLevel)).length} · pending actions ${pending} · awaiting verification ${status.SUBMITTED_FOR_VERIFICATION} · escalated ${actionsRel.filter((a) => wf.isEscalated(a)).length}`);
check('Dashboard KPIs are meaningful: 46 open issues, 5 high/critical mines, 14 pending, 3 awaiting verification, 5 escalated', openIssues === 46 && minesStats.filter((m) => ['HIGH', 'CRITICAL'].includes(m.riskLevel)).length === 5 && pending === 14 && status.SUBMITTED_FOR_VERIFICATION === 3 && actionsRel.filter((a) => wf.isEscalated(a)).length === 5);
check('per-mine derived stats add up to the global totals', minesStats.reduce((s, m) => s + m.openIssues, 0) === openIssues && minesStats.reduce((s, m) => s + m.pendingActions, 0) === pending && minesStats.reduce((s, m) => s + m.overdueActions, 0) === overdue.length);
check('Mine Detail has content for every mine (issues, inspections)', mines.every((m) => data.getIssuesByMine(m.id).length > 0 && data.getInspectionsByMine(m.id).length > 0));

section('Persona views (existing access rules still hold)');
const view = (role) => ({ mines: access.getVisibleMines(role).length, insp: inspections.filter((i) => access.canViewInspection(role, i)).length, issues: issues.filter((i) => access.canViewIssue(role, i)).length, actions: actions.filter((a) => access.canViewAction(role, a)).length });
const FO = view(ROLES.FIELD_OFFICER), MM = view(ROLES.MINE_MANAGER), CO = view(ROLES.COMPLIANCE_OFFICER);
console.log('       FO', JSON.stringify(FO), 'MM', JSON.stringify(MM), 'CO', JSON.stringify(CO));
check('Field Officer (Arjun): 3 mines, 14 inspections, 19 issues, 0 actions', FO.mines === 3 && FO.insp === 14 && FO.issues === 19 && FO.actions === 0);
check('Mine Manager (Sunita): Jharia 4 only — 1 mine, 6 inspections, 8 issues, 3 actions', MM.mines === 1 && MM.insp === 6 && MM.issues === 8 && MM.actions === 3);
check('Compliance Officer / Admin: everything (10 / 32 / 48 / 16)', CO.mines === 10 && CO.insp === 32 && CO.issues === 48 && CO.actions === 16);

section('Contractors');
const cStatus = by(contractors, (c) => c.complianceStatus);
const cRisk = by(contractors, (c) => c.riskLevel);
console.log('       compliance:', JSON.stringify(cStatus), ' risk:', JSON.stringify(cRisk));
check('mixed compliance: 5 Compliant / 4 Under Review / 3 Non-Compliant', cStatus.COMPLIANT === 5 && cStatus.UNDER_REVIEW === 4 && cStatus.NON_COMPLIANT === 3);
check('mixed risk: all four levels present', ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].every((l) => cRisk[l] > 0));
const today = new Date().toISOString().slice(0, 10);
check('one lapsed licence and one expiring within 30 days', contractors.filter((c) => c.licenseValidTill < today).length === 1 && contractors.filter((c) => c.licenseValidTill >= today && daysAgo(c.licenseValidTill) >= -30).length === 1);
check('weakest contractors are the ones tied to contractor-category findings', ['CTR-2026-0004', 'CTR-2026-0003', 'CTR-2026-0005'].every((id) => contractorById[id].complianceStatus === 'NON_COMPLIANT' && issues.some((i) => i.contractorId === id)));
check('contract dates are coherent (start < end, audit in the past)', contractors.every((c) => c.contractStart < c.contractEnd && c.lastAuditDate <= today));

section('Documents');
const dStatus = by(documents, (d) => d.status);
const dType = by(documents, (d) => d.documentType);
console.log('       status:', JSON.stringify(dStatus), ' type:', JSON.stringify(dType));
check('Processed and Flagged both present (6 / 4)', dStatus.PROCESSED === 6 && dStatus.FLAGGED === 4);
check('licences, inspection reports, environmental, labour/compliance all present', ['LICENSE', 'INSPECTION_REPORT', 'ENVIRONMENTAL', 'LABOUR_COMPLIANCE'].every((t) => dType[t] > 0));
check('flagged documents carry flags; processed ones carry none', documents.every((d) => (d.status === 'FLAGGED') === d.flags.length > 0));
check('flagged documents tie back to the findings they relate to', documents.filter((d) => d.status === 'FLAGGED').every((d) => !!d.relatedIssueId));
check('OCR metadata present; lower confidence on flagged documents', documents.every((d) => d.ocr.confidence > 0 && d.ocr.pageCount > 0 && d.ocr.extractedFields) && Math.max(...documents.filter((d) => d.status === 'FLAGGED').map((d) => d.ocr.confidence)) < Math.min(...documents.filter((d) => d.status === 'PROCESSED').map((d) => d.ocr.confidence)));

section('Clearly fictional');
check('every licence / document number is DEMO-prefixed and every authority is labelled fictional', contractors.every((c) => c.licenseNumber.startsWith('DEMO-')) && documents.every((d) => d.ocr.extractedFields.documentNumber.startsWith('DEMO-') && /fictional/.test(d.ocr.extractedFields.issuingAuthority) && d.fileName.includes('DEMO')));

section('Original Step 2 records preserved');
const ORIGINAL_ISSUES = {
  'ISSUE-2026-0091': [5, 1, 'high', 14], 'ISSUE-2026-0088': [4, 0, 'high', 22], 'ISSUE-2026-0079': [3, 0, 'medium', 8],
  'ISSUE-2026-0102': [3, 0, 'low', 2], 'ISSUE-2026-0065': [5, 2, 'high', 25], 'ISSUE-2026-0066': [5, 0, 'high', 30],
  'ISSUE-2026-0070': [4, 0, 'medium', 5], 'ISSUE-2026-0072': [2, 0, 'low', 0], 'ISSUE-2026-0075': [1, 0, 'low', 1],
};
check('9 original issues keep severity / recurrence / exposure / workers', Object.entries(ORIGINAL_ISSUES).every(([id, [s, r, e, w]]) => { const i = issueById[id]; return i && i.severity === s && i.recurrenceCount === r && i.exposureLevel === e && i.exposureWorkers === w; }));
check('original issue ↔ corrective action pairs unchanged', [['ISSUE-2026-0091', 'CA-2026-0041'], ['ISSUE-2026-0088', 'CA-2026-0038'], ['ISSUE-2026-0102', 'CA-2026-0050'], ['ISSUE-2026-0065', 'CA-2026-0022'], ['ISSUE-2026-0066', 'CA-2026-0023'], ['ISSUE-2026-0070', 'CA-2026-0028']].every(([i, c]) => issueById[i].correctiveActionId === c));
check('original corrective-action statuses unchanged', [['CA-2026-0041', 'IN_PROGRESS'], ['CA-2026-0038', 'ASSIGNED'], ['CA-2026-0050', 'IN_PROGRESS'], ['CA-2026-0022', 'IN_PROGRESS'], ['CA-2026-0023', 'ASSIGNED'], ['CA-2026-0028', 'CLOSED']].every(([id, s]) => caById[id].status === s));
check('original four mines keep id / name / manager', [['MINE-JHR-04', 'Jharia Colliery No. 4', 'Sunita Rao'], ['MINE-KOR-11', 'Korba Opencast Block 11', 'Ramesh Yadav'], ['MINE-TAL-02', 'Talcher Seam Extension 2', 'Manoj Behera'], ['MINE-SNG-07', 'Singrauli Underground 7', 'Kavita Mishra']].every(([id, n, m]) => mineById[id].name === n && mineById[id].manager === m));
check('dates are relative: re-seeding at another anchor shifts every date consistently (hero CA always 4 days overdue)', (() => { const anchor = new Date(2026, 0, 10, 15, 0); const a = buildSeedData(anchor); const ca = a.correctiveActions.find((c) => c.id === 'CA-2026-0055'); const due = new Date(`${ca.dueDate}T00:00:00`); return Math.round((new Date(2026, 0, 10) - due) / 864e5) === 4 && a.inspections.every((x) => x.date <= '2026-01-09') && a.inspections.length === 32 && a.issues.length === 48; })());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
