// Run from the project root:  npm run test:documents
// Exercises the real document service / data layer with a stubbed localStorage (same harness as
// the Step 4, seed and contractor suites). The pages are thin wrappers over this logic; the
// browser-level flow is covered by tests/documents/flow.test.jsx (npm run test:documents:ui).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { ROLES, ROLE_DETAILS, can, canAccess } = await imp('data/roles.js');
const { ensureSeeded } = await imp('services/seedService.js');
const data = await imp('services/dataService.js');
const access = await imp('services/accessService.js');
const { getAuditLog } = await imp('services/auditService.js');
const ds = await imp('services/documentService.js');
const { DOCUMENT_SCENARIOS, MOCK_ENGINE_LABEL } = await imp('data/documentScenarios.js');
const { DOCUMENT_TYPES, DOCUMENT_TYPE_UPLOAD_OPTIONS, DOCUMENT_STATUS_OPTIONS } = await imp('data/constants.js');

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
const dayOffset = (n, base = NOW) => iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() + n));
const plusDays = (n) => new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + n, 11, 30);
const fresh = () => { globalThis.__store.clear(); ensureSeeded(NOW); };
const ids = (rows) => rows.map((r) => r.id);
const pdf = (fileName, size = 120 * 1024) => ({ name: fileName, size, type: 'application/pdf' });
const field = (doc, key) => doc.fieldList.find((f) => f.key === key);
const codes = (doc) => doc.flags.map((f) => f.code);
const upload = (over = {}) =>
  ds.uploadDocument({ file: pdf('x.pdf'), mineId: 'MINE-TAL-02', documentType: 'LICENSE', actor: name(FO), role: FO, now: NOW, ...over });

fresh();

// ---------------------------------------------------------------------------
section('Permissions & navigation');
check('All four roles can open Documents and view documents', [FO, MM, CO, AD].every((r) => canAccess('documents', r) && can('documents.view', r)));
check('All four roles can upload documents (Compliance Officer added in Step 5b)', [FO, MM, CO, AD].every((r) => can('documents.upload', r)));
check('Only the Administrator can delete documents', can('documents.delete', AD) && !can('documents.delete', FO) && !can('documents.delete', MM) && !can('documents.delete', CO));
check('Upload form offers Auto + the five document types', same(DOCUMENT_TYPE_UPLOAD_OPTIONS.map((o) => o.value), ['AUTO', 'LICENSE', 'INSPECTION_REPORT', 'ENVIRONMENTAL', 'LABOUR_COMPLIANCE', 'SAFETY_CERTIFICATE']));
check('Type labels are License / Inspection Report / Environmental Clearance / Labour Record / Safety Certificate',
  same(Object.values(DOCUMENT_TYPES).map((t) => t.label), ['License', 'Inspection Report', 'Environmental Clearance', 'Labour Record', 'Safety Certificate']));
check('Status filter has Processed and Flagged', same(DOCUMENT_STATUS_OPTIONS.map((o) => o.value), ['ALL', 'PROCESSED', 'FLAGGED']));

// ---------------------------------------------------------------------------
section('Scenario selection — by selected type or file-name pattern');
check('Exactly five canned scenarios, one per document type', Object.keys(DOCUMENT_SCENARIOS).length === 5 && same(Object.keys(DOCUMENT_SCENARIOS), Object.keys(DOCUMENT_TYPES)));
check('A selected type wins and is reported as SELECTED_TYPE', Object.keys(DOCUMENT_TYPES).every((t) => { const d = ds.detectScenario({ fileName: 'whatever.pdf', documentType: t }); return d && d.scenario.documentType === t && d.basis === 'SELECTED_TYPE'; }));
check('A selected type overrides a contradicting file name', ds.detectScenario({ fileName: 'Environmental_Clearance.pdf', documentType: 'LICENSE' }).scenario.documentType === 'LICENSE');
const auto = (fileName) => ds.detectScenario({ fileName, documentType: 'AUTO' });
check('Auto: "JHR04_Mining_Lease_Scan.pdf" → License', auto('JHR04_Mining_Lease_Scan.pdf')?.scenario.documentType === 'LICENSE' && auto('JHR04_Mining_Lease_Scan.pdf').basis === 'FILENAME_PATTERN');
check('Auto: "Statutory_Inspection_Report_Q3.pdf" → Inspection Report', auto('Statutory_Inspection_Report_Q3.pdf')?.scenario.documentType === 'INSPECTION_REPORT');
check('Auto: underscore-separated "TAL02_EC_Compliance.pdf" → Environmental (the "EC" token is found)', auto('TAL02_EC_Compliance.pdf')?.scenario.documentType === 'ENVIRONMENTAL');
check('Auto: "Contract_Labour_Licence_Register.pdf" → Labour Record (not License)', auto('Contract_Labour_Licence_Register.pdf')?.scenario.documentType === 'LABOUR_COMPLIANCE');
check('Auto: "Shotfirer_Competency_Certificates.jpg" → Safety Certificate', auto('Shotfirer_Competency_Certificates.jpg')?.scenario.documentType === 'SAFETY_CERTIFICATE');
check('Auto: "Environmental_Clearance_Certificate.pdf" → Environmental (not Safety)', auto('Environmental_Clearance_Certificate.pdf')?.scenario.documentType === 'ENVIRONMENTAL');
check('Auto: an unrecognisable name ("scan_0001.pdf") matches nothing', auto('scan_0001.pdf') === null && auto('') === null && auto(undefined) === null);
check('Auto: matching is case-insensitive', auto('MINING LEASE.PDF')?.scenario.documentType === 'LICENSE');
check('An unknown explicit type matches nothing', ds.detectScenario({ fileName: 'a.pdf', documentType: 'NOPE' }) === null);

// ---------------------------------------------------------------------------
section('Mock extraction — canned values, real issue rules');
const mine = data.getMineById('MINE-TAL-02');
const extractFor = (type) => ds.runMockExtraction({ scenario: DOCUMENT_SCENARIOS[type], mine, sequence: 11, now: NOW, basis: 'SELECTED_TYPE' });
const viewFor = (type, at = NOW) => ds.normalizeDocument({ id: 'DOC-T', mineId: mine.id, documentType: type, fileName: 'f.pdf', extraction: extractFor(type) }, at);

const ex = extractFor('LICENSE');
check('Extraction is labelled MOCK and says it is not OCR', ex.mode === 'MOCK' && ex.engine === MOCK_ENGINE_LABEL && /not OCR/.test(ex.engine));
check('Extraction yields exactly the six required field keys', same(Object.keys(ex.fields), ['documentType', 'issuingAuthority', 'mineReference', 'issueDate', 'expiryDate', 'licenseNumber']));
check('Mine reference comes from the selected mine; number is DEMO-prefixed; authority is labelled fictional',
  ex.fields.mineReference === `${mine.name} (${mine.id})` && ex.fields.licenseNumber === 'DEMO-ML-TAL02-0011' && /fictional/.test(ex.fields.issuingAuthority));
check('Extraction is deterministic for the same inputs', JSON.stringify(extractFor('LICENSE')) === JSON.stringify(ex));
check('Field display order is Type, Authority, Mine, Issue, Expiry, Number', same(viewFor('LICENSE').fieldList.map((f) => f.label), ['Document Type', 'Issuing Authority', 'Mine Name / Reference', 'Issue Date', 'Expiry Date', 'License / Permit Number']) && viewFor('LICENSE').fieldList[0].label === 'Document Type' && viewFor('LICENSE').fieldList[5].label === 'License / Permit Number');

const lic = viewFor('LICENSE');
check('License → Expired: validity EXPIRED, 35 days ago, one high "Expired document" flag, status FLAGGED',
  lic.validity.status === 'EXPIRED' && lic.validity.daysRemaining === -35 && lic.status === 'FLAGGED' && same(codes(lic), ['EXPIRED']) && lic.flags[0].severity === 'high' && lic.flags[0].title === 'Expired document' && /35 days ago/.test(lic.flags[0].message));
check('License expiry date is exactly 35 days before the upload date', lic.fieldList.find((f) => f.key === 'expiryDate').raw === dayOffset(-35));

const insp = viewFor('INSPECTION_REPORT');
check('Inspection Report → Missing signature/seal (seal), medium; validity "No expiry"; expiry shown as Not applicable',
  same(codes(insp), ['MISSING_SIGNATURE_SEAL']) && insp.flags[0].severity === 'medium' && /official seal/.test(insp.flags[0].message) && !/signature or/.test(insp.flags[0].message)
  && insp.validity.status === 'NO_EXPIRY' && field(insp, 'expiryDate').found === false && field(insp, 'expiryDate').required === false && field(insp, 'expiryDate').missingText === 'Not applicable');

const env = viewFor('ENVIRONMENTAL');
check('Environmental Clearance → Missing required field: License / Permit Number (one flag, medium); validity Current',
  same(codes(env), ['MISSING_FIELD']) && env.flags[0].field === 'licenseNumber' && env.flags[0].title === 'Missing required field: License / Permit Number' && env.validity.status === 'CURRENT');
check('…and the missing field is shown as required / Not found in the field list', field(env, 'licenseNumber').found === false && field(env, 'licenseNumber').required === true && field(env, 'licenseNumber').missingText === 'Not found');

const lab = viewFor('LABOUR_COMPLIANCE');
check('Labour Record → Expires soon (18 days), medium', lab.validity.status === 'EXPIRING_SOON' && lab.validity.daysRemaining === 18 && same(codes(lab), ['EXPIRING_SOON']) && lab.flags[0].severity === 'medium');

const saf = viewFor('SAFETY_CERTIFICATE');
check('Safety Certificate → clean: Processed, Current, no flags', saf.status === 'PROCESSED' && saf.flagCount === 0 && saf.validity.status === 'CURRENT');
check('Every scenario carries a compliance category in the existing issue vocabulary, with a domain',
  Object.keys(DOCUMENT_TYPES).every((t) => { const v = viewFor(t); return v.category && v.categoryGroup; }));
check('Categories: Environmental → Environment domain, Labour → Labour domain, Inspection → Safety domain',
  env.categoryGroup === 'Environment' && lab.categoryGroup === 'Labour' && insp.categoryGroup === 'Safety');

section('Issue rules in isolation');
const rule = (over) => ds.detectPotentialIssues({
  fields: { documentType: 'License', issuingAuthority: 'A', mineReference: 'M', issueDate: '2026-01-01', expiryDate: '2027-01-01', licenseNumber: 'N', ...over.fields },
  signals: over.signals ?? { signature: true, seal: true },
  documentType: over.documentType ?? 'LICENSE',
  validity: ds.getValidity(over.fields?.expiryDate === undefined ? '2027-01-01' : over.fields.expiryDate, over.expiryRequired ?? true, NOW),
});
check('Complete, in-date, signed + sealed → no flags', rule({}).length === 0);
check('Signature AND seal both missing → one combined flag', (() => { const f = rule({ signals: { signature: false, seal: false } }); return f.length === 1 && /signature or official seal/.test(f[0].message); })());
check('Signature missing only → "authorised signature"', (() => { const f = rule({ signals: { signature: false, seal: true } }); return f.length === 1 && /authorised signature/.test(f[0].message); })());
check('Signals not assessed (null) never raise a flag', rule({ signals: { signature: null, seal: null } }).length === 0);
check('Every blank required field is flagged separately (authority + number)', (() => { const f = rule({ fields: { issuingAuthority: '', licenseNumber: null } }); return f.length === 2 && f.every((x) => x.code === 'MISSING_FIELD'); })());
check('Missing expiry on an expiring type → UNKNOWN validity AND a missing-field flag', (() => { const f = rule({ fields: { expiryDate: null } }); return f.some((x) => x.field === 'expiryDate'); })() && ds.getValidity(null, true, NOW).status === 'UNKNOWN');
check('Missing expiry on an inspection report is fine', rule({ documentType: 'INSPECTION_REPORT', fields: { expiryDate: null }, expiryRequired: false }).length === 0);
check('Flags are ordered by severity (high before medium)', (() => { const f = rule({ fields: { expiryDate: dayOffset(-3), licenseNumber: null }, signals: { signature: true, seal: false } }); return f[0].severity === 'high' && f.slice(1).every((x) => x.severity === 'medium'); })());
check('Validity boundaries: expires today / in 30 days / in 31 days / yesterday',
  ds.getValidity(dayOffset(0), true, NOW).status === 'EXPIRING_SOON' && ds.getValidity(dayOffset(0), true, NOW).label === 'Expires today'
  && ds.getValidity(dayOffset(30), true, NOW).status === 'EXPIRING_SOON' && ds.getValidity(dayOffset(31), true, NOW).status === 'CURRENT' && ds.getValidity(dayOffset(-1), true, NOW).status === 'EXPIRED');

// ---------------------------------------------------------------------------
section('Seeded records — normalised, not changed');
fresh();
const seededRaw = data.getDocuments();
const seededViews = ds.getDocumentRows(AD, NOW);
check('All 10 seeded documents normalise; stored seed shape is untouched', seededViews.length === 10 && seededRaw.length === 10 && seededRaw.every((d) => d.ocr && !d.extraction));
check('Seeded: 6 Processed / 4 Flagged (same as the stored statuses)', seededViews.filter((d) => d.status === 'PROCESSED').length === 6 && seededViews.filter((d) => d.status === 'FLAGGED').length === 4);
check('Seeded flags are kept as written (no duplicate "expires soon" flag added)', seededViews.filter((d) => d.status === 'FLAGGED').every((v) => v.flagCount === data.getDocumentById(v.id).flags.length));
const s1 = ds.normalizeDocument(data.getDocumentById('DOC-2026-0001'), NOW);
check('Seeded licence maps number → License / Permit Number, validFrom → Issue Date, validTill → Expiry Date',
  field(s1, 'licenseNumber').raw === 'DEMO-ML-JHR04-0412' && field(s1, 'issueDate').raw === dayOffset(-1400) && field(s1, 'expiryDate').raw === dayOffset(610) && s1.validity.status === 'CURRENT');
const s2 = ds.normalizeDocument(data.getDocumentById('DOC-2026-0002'), NOW);
check('Seeded inspection report: inspectionDate → Issue Date; no expiry → "No expiry"', field(s2, 'issueDate').raw === dayOffset(-61) && s2.validity.status === 'NO_EXPIRY');
check('Seeded records are described as pre-filled, never as extracted by a process', seededViews.every((v) => v.isMock === false && /Pre-filled demo record/.test(v.extractionLabel) && !/OCR/.test(v.extractionLabel.replace(/no extraction/i, ''))));
check('Seeded gaps read "Not recorded" (not "Not found")', seededViews.flatMap((v) => v.fieldList).filter((f) => !f.found).every((f) => f.missingText === 'Not recorded'));
check('Seeded Consent to Operate (12 days left) shows Expiring Soon', ds.normalizeDocument(data.getDocumentById('DOC-2026-0010'), NOW).validity.status === 'EXPIRING_SOON');
// A seeded document whose date passes must pick up an Expired flag on its own.
globalThis.__store.clear(); ensureSeeded(NOW);
const stale = ds.normalizeDocument(data.getDocumentById('DOC-2026-0001'), plusDays(700));
check('A seeded document past its validity gets a live Expired flag and becomes Flagged', stale.validity.status === 'EXPIRED' && stale.status === 'FLAGGED' && codes(stale).includes('EXPIRED'));

// ---------------------------------------------------------------------------
section('Scope — list per role');
fresh();
const mineOf = (rows) => [...new Set(rows.map((r) => r.mineId))].sort();
const foRows = ds.getDocumentRows(FO, NOW), mmRows = ds.getDocumentRows(MM, NOW), coRows = ds.getDocumentRows(CO, NOW), adRows = ds.getDocumentRows(AD, NOW);
check('Compliance Officer and Administrator see all 10 documents', coRows.length === 10 && adRows.length === 10);
check('Field Officer sees only documents at its assigned mines (JHR-04, TAL-02)', same(mineOf(foRows), ['MINE-JHR-04', 'MINE-TAL-02']) && foRows.length === 4, ids(foRows).join());
check('Mine Manager (Sunita Rao) sees only Jharia Colliery No. 4 documents', same(mineOf(mmRows), ['MINE-JHR-04']) && mmRows.length === 2, ids(mmRows).join());
check('Scoped roles never receive an out-of-scope document', foRows.every((r) => access.canViewMine(FO, r.mineId)) && mmRows.every((r) => access.canViewMine(MM, r.mineId)));
check('Default order: newest upload first', coRows.every((r, i) => i === 0 || coRows[i - 1].uploadedDate >= r.uploadedDate));
check('Uploadable mines: scoped for Field Officer / Mine Manager, all 10 for Compliance Officer / Administrator',
  same(ids(ds.getUploadableMines(FO)), ids(access.getVisibleMines(FO))) && ds.getUploadableMines(MM).length === 1 && ds.getUploadableMines(CO).length === 10 && ds.getUploadableMines(AD).length === 10);

// ---------------------------------------------------------------------------
section('Upload validation');
const v = (over) => ds.validateUploadInput({ role: FO, mineId: 'MINE-TAL-02', file: pdf('Mining_Lease.pdf'), documentType: 'AUTO', ...over });
check('A valid upload passes and reports its scenario + basis', v({}).ok && v({}).scenario.documentType === 'LICENSE' && v({}).basis === 'FILENAME_PATTERN');
check('No mine selected → mine error', v({ mineId: '' }).errors.mine === 'Select the mine this document belongs to.');
check('Unknown mine → error', /does not exist/.test(v({ mineId: 'MINE-NOPE' }).errors.mine));
check('Field Officer cannot upload to a mine outside its assignment', /outside your assigned/.test(v({ mineId: 'MINE-RAN-03' }).errors.mine));
check('Mine Manager cannot upload to another manager\'s mine', /outside your assigned/.test(v({ role: MM, mineId: 'MINE-TAL-02' }).errors.mine));
check('Compliance Officer and Administrator can upload to any mine', v({ role: CO, mineId: 'MINE-RAN-03' }).ok && v({ role: AD, mineId: 'MINE-RAN-03' }).ok);
check('No file → file error; no type error piled on top', (() => { const r = v({ file: null }); return r.errors.file === 'Choose a file to upload.' && !r.errors.type; })());
check('Unsupported extension (.docx / no extension) rejected', /Unsupported file type/.test(v({ file: pdf('Mining_Lease.docx') }).errors.file) && /Unsupported file type/.test(v({ file: pdf('Mining_Lease') }).errors.file));
check('PDF, PNG, JPG and JPEG accepted (any case)', ['a_licence.PDF', 'a_licence.png', 'a_licence.jpg', 'a_licence.JPEG'].every((n) => v({ file: pdf(n) }).ok));
check('Empty file rejected', /empty/.test(v({ file: pdf('Mining_Lease.pdf', 0) }).errors.file));
check('File over 10 MB rejected; exactly 10 MB accepted', /larger than 10 MB/.test(v({ file: pdf('Mining_Lease.pdf', 10 * 1024 * 1024 + 1) }).errors.file) && v({ file: pdf('Mining_Lease.pdf', 10 * 1024 * 1024) }).ok);
check('Auto-detect with an unrecognisable name asks for a type', /could not be recognised/.test(v({ file: pdf('scan_0001.pdf') }).errors.type) && v({ file: pdf('scan_0001.pdf'), documentType: 'SAFETY_CERTIFICATE' }).ok);
check('Invalid explicit type rejected', v({ documentType: 'NOPE' }).errors.type === 'Choose a valid document type.');
check('Validation never saves anything', data.getDocuments().length === 10);

// ---------------------------------------------------------------------------
section('Upload → extraction → flag (end to end, service level)');
fresh();
const auditBefore = getAuditLog().length;
const saved = upload({ file: pdf('TAL02_Mining_Lease_Scan.pdf', 250 * 1024), documentType: 'AUTO' });
check('Upload returns the saved document with a fresh sequential ID', saved.id === 'DOC-2026-0011');
check('Extraction ran from the file-name pattern (License scenario) and is FLAGGED as Expired', saved.documentType === 'LICENSE' && saved.extraction.basis === 'FILENAME_PATTERN' && saved.status === 'FLAGGED' && codes(saved).includes('EXPIRED'));
check('Saved record is first in storage (newest first) and keeps only file metadata (name, size, type)', (() => {
  const raw = data.getDocuments()[0];
  return raw.id === saved.id && raw.fileName === 'TAL02_Mining_Lease_Scan.pdf' && raw.fileSizeKB === 250 && raw.fileType === 'application/pdf' && !('content' in raw) && !('data' in raw) && !('file' in raw);
})());
check('Uploader, role and date are recorded', saved.uploadedBy === name(FO) && saved.uploadedByRole === 'Field Officer' && saved.uploadedDate === dayOffset(0));
check('Derived fields are NOT stored on a new upload (status / flags are computed on read)', (() => { const raw = data.getDocuments()[0]; return raw.status === undefined && raw.flags === undefined; })());
check('Exactly one audit event, tagged with the mine, naming the file and the flag', (() => {
  const log = getAuditLog();
  const e = log[0];
  return log.length === auditBefore + 1 && e.action === 'Document Uploaded' && e.entity === 'Document' && e.entityId === saved.id && e.mineId === 'MINE-TAL-02' && e.actor === name(FO) && /TAL02_Mining_Lease_Scan\.pdf/.test(e.description) && /Expired document/.test(e.description);
})());
check('The upload shows up for the uploader, the Compliance Officer and the Administrator…', ids(ds.getDocumentRows(FO, NOW)).includes(saved.id) && ids(ds.getDocumentRows(CO, NOW)).includes(saved.id) && ids(ds.getDocumentRows(AD, NOW)).includes(saved.id));
check('…but not for a Mine Manager at a different mine', !ids(ds.getDocumentRows(MM, NOW)).includes(saved.id));
check('Sorted newest-first the new upload leads the Field Officer list', ds.getDocumentRows(FO, NOW)[0].id === saved.id);

const chosen = upload({ file: pdf('scan_0002.pdf'), documentType: 'SAFETY_CERTIFICATE', actor: name(AD), role: AD, mineId: 'MINE-RAN-03' });
check('Second upload (explicit type, any mine as Administrator) gets the next ID, basis SELECTED_TYPE, and is clean', chosen.id === 'DOC-2026-0012' && chosen.extraction.basis === 'SELECTED_TYPE' && chosen.status === 'PROCESSED' && chosen.flagCount === 0);
check('A clean upload still writes its own audit event ("found no potential issues")', /found no potential issues/.test(getAuditLog()[0].description));
check('uploadDocument re-validates: out-of-scope mine, bad file and missing permission all throw and save nothing', (() => {
  const before = data.getDocuments().length;
  const a = throwsMsg(() => upload({ mineId: 'MINE-RAN-03' }));
  const b = throwsMsg(() => upload({ file: pdf('x.exe') }));
  const c = throwsMsg(() => upload({ role: 'NOBODY' }));
  return /outside your assigned/.test(a) && /Unsupported/.test(b) && /permission/.test(c) && data.getDocuments().length === before;
})());
check('Each of the five types uploads and lands in its expected outcome', (() => {
  fresh();
  const out = Object.keys(DOCUMENT_TYPES).map((t) => upload({ file: pdf('s.pdf'), documentType: t, role: AD, actor: name(AD) }));
  const [l, i, e, lb, s] = out;
  return codes(l)[0] === 'EXPIRED' && codes(i)[0] === 'MISSING_SIGNATURE_SEAL' && codes(e)[0] === 'MISSING_FIELD' && codes(lb)[0] === 'EXPIRING_SOON' && s.flagCount === 0 && new Set(ids(out)).size === 5;
})());

section('Status is derived live (a new upload ages on its own)');
fresh();
const aging = upload({ file: pdf('Contract_Labour_Register.pdf'), documentType: 'AUTO' });
const agingAt = (n) => ds.getDocumentDetail(aging.id, CO, plusDays(n));
check('Labour Record on upload day: Expiring Soon (18 days), flag "Expires soon"', agingAt(0).validity.status === 'EXPIRING_SOON' && codes(agingAt(0)).includes('EXPIRING_SOON'));
check('10 days later: 8 days left', agingAt(10).validity.daysRemaining === 8);
check('25 days later it has become Expired, flagged high, with no stored change', agingAt(25).validity.status === 'EXPIRED' && codes(agingAt(25)).includes('EXPIRED') && !codes(agingAt(25)).includes('EXPIRING_SOON') && data.getDocuments()[0].flags === undefined);

// ---------------------------------------------------------------------------
section('Search & filters');
fresh();
const a = upload({ file: pdf('TAL02_Mining_Lease.pdf'), documentType: 'AUTO', role: AD, actor: name(AD) });
const b = upload({ file: pdf('JHR04_Roof_Inspection.pdf'), documentType: 'AUTO', role: AD, actor: name(AD), mineId: 'MINE-JHR-04' });
const rows = ds.getDocumentRows(AD, NOW);
const f = (o) => ds.filterDocuments(rows, o);
check('No filters → everything', f({}).length === 12 && f({ search: '   ', mineId: 'ALL', documentType: 'ALL', status: 'ALL', validity: 'ALL' }).length === 12);
check('Search by file name (case-insensitive)', ids(f({ search: 'tal02_mining' })).includes(a.id) && f({ search: 'TAL02_MINING' }).length === 1);
check('Search by document ID', ids(f({ search: a.id.toLowerCase() })).join() === a.id);
check('Search by mine name', f({ search: 'jharia' }).every((r) => /jharia/i.test(r.mineName)) && f({ search: 'jharia' }).length >= 3);
check('Search by document type label', f({ search: 'environmental clearance' }).length === 3 && f({ search: 'environmental clearance' }).every((r) => r.documentType === 'ENVIRONMENTAL'));
check('Search by licence / permit number', ids(f({ search: 'DEMO-ML-JHR04-0412' })).join() === 'DOC-2026-0001');
check('Search by uploader', f({ search: 'sunita' }).every((r) => r.uploadedBy === 'Sunita Rao') && f({ search: 'sunita' }).length === 1);
check('Search with no hits → empty', f({ search: 'zzzz-nothing' }).length === 0);
check('Mine filter', f({ mineId: 'MINE-JHR-04' }).length === 3 && f({ mineId: 'MINE-JHR-04' }).every((r) => r.mineId === 'MINE-JHR-04'));
check('Type filter', f({ documentType: 'INSPECTION_REPORT' }).length === 3);
check('Status filter: Flagged / Processed partition the list', f({ status: 'FLAGGED' }).length + f({ status: 'PROCESSED' }).length === 12 && f({ status: 'FLAGGED' }).every((r) => r.flagCount > 0));
check('Validity filter: Expired finds only the uploaded expired licence', ids(f({ validity: 'EXPIRED' })).join() === a.id);
check('Validity filter: Expiring Soon finds the seeded labour + consent documents', f({ validity: 'EXPIRING_SOON' }).length === 2);
check('Filters combine (AND)', ids(f({ mineId: 'MINE-TAL-02', status: 'FLAGGED', search: 'lease' })).join() === a.id);

// ---------------------------------------------------------------------------
section('Detail — scope & content');
fresh();
const doc3 = ds.getDocumentDetail('DOC-2026-0003', CO, NOW);
check('Compliance Officer opens any document (with fields, validity, flags, mine, category)', doc3 && doc3.fieldList.length === 6 && doc3.mine?.id === 'MINE-JHR-12' && doc3.category && doc3.flagCount === 2);
check('Unknown ID → null', ds.getDocumentDetail('DOC-9999', AD, NOW) === null);
check('Out-of-scope documents are null for the Field Officer and Mine Manager (same as "not found")', ds.getDocumentDetail('DOC-2026-0003', FO, NOW) === null && ds.getDocumentDetail('DOC-2026-0004', MM, NOW) === null);
check('In-scope documents open for the Field Officer and Mine Manager', ds.getDocumentDetail('DOC-2026-0004', FO, NOW)?.id === 'DOC-2026-0004' && ds.getDocumentDetail('DOC-2026-0001', MM, NOW)?.id === 'DOC-2026-0001');
check('Linked issue is shown only to roles that may open that issue', ds.getDocumentRows(AD, NOW).every((d) => {
  return [FO, MM, CO, AD].every((r) => {
    const det = ds.getDocumentDetail(d.id, r, NOW);
    if (!det) return true;
    const issue = d.relatedIssueId ? data.getIssueById(d.relatedIssueId) : null;
    return (det.relatedIssue !== null) === !!(issue && access.canViewIssue(r, issue));
  });
}));
check('Hidden linked records are counted, not named', (() => {
  const det = ds.getDocumentDetail('DOC-2026-0004', FO, NOW); // EC report: issue 0103 was reported by someone else
  const issue = data.getIssueById('ISSUE-2026-0103');
  return access.canViewIssue(FO, issue) ? det.hiddenRelatedCount === 0 : det.hiddenRelatedCount === 1 && det.relatedIssue === null;
})());
check('Only the Administrator gets canDelete', ds.getDocumentDetail('DOC-2026-0001', AD, NOW).canDelete === true && ds.getDocumentDetail('DOC-2026-0001', CO, NOW).canDelete === false && ds.getDocumentDetail('DOC-2026-0001', MM, NOW).canDelete === false);
check('A new upload opens at its own detail with the extraction basis recorded', (() => { const up = upload({ file: pdf('Env.pdf'), documentType: 'ENVIRONMENTAL' }); const d = ds.getDocumentDetail(up.id, FO, NOW); return d.isMock && d.extraction.scenarioLabel === DOCUMENT_SCENARIOS.ENVIRONMENTAL.label && d.extractionLabel === MOCK_ENGINE_LABEL; })());

// ---------------------------------------------------------------------------
section('Delete (Administrator only)');
fresh();
const victim = upload({ file: pdf('Mining_Lease.pdf'), documentType: 'AUTO' });
check('Field Officer, Mine Manager and Compliance Officer cannot delete', [FO, MM, CO].every((r) => /Only an Administrator/.test(throwsMsg(() => ds.deleteDocument({ documentId: victim.id, actor: name(r), role: r })))) && data.getDocumentById(victim.id) !== null);
const logLen = getAuditLog().length;
check('Administrator deletes it', ds.deleteDocument({ documentId: victim.id, actor: name(AD), role: AD }) === true && data.getDocumentById(victim.id) === null && data.getDocuments().length === 10);
check('Delete writes one audit event with the mine', (() => { const e = getAuditLog()[0]; return getAuditLog().length === logLen + 1 && e.action === 'Document Deleted' && e.entityId === victim.id && e.mineId === 'MINE-TAL-02'; })());
check('Deleting an unknown document throws', /not found/.test(throwsMsg(() => ds.deleteDocument({ documentId: 'DOC-9999', actor: name(AD), role: AD }))));
check('Administrator can delete a seeded document too', ds.deleteDocument({ documentId: 'DOC-2026-0008', actor: name(AD), role: AD }) && data.getDocuments().length === 9);
check('removeDocument returns false for unknown ids and addDocument prepends', data.removeDocument('nope') === false && (() => { data.addDocument({ id: 'DOC-X', mineId: 'MINE-TAL-02', documentType: 'LICENSE' }); return data.getDocuments()[0].id === 'DOC-X'; })());

// ---------------------------------------------------------------------------
section('Data integrity & architecture');
fresh();
const seed = data.getDocuments();
check('Seed untouched: 10 documents, all with ocr + stored status/flags', seed.length === 10 && seed.every((d) => d.ocr && d.status && Array.isArray(d.flags)));
check('Uploading never changes seeded records', (() => { const before = JSON.stringify(data.getDocuments()); upload({ file: pdf('a_lease.pdf') }); return JSON.stringify(data.getDocuments().slice(1)) === before; })());

const app = readFileSync(`${SRC}/App.jsx`, 'utf8');
check('/documents renders the real Documents page behind the documents nav guard', /path="\/documents"[^>]*element=\{<RequireNav navId="documents"><Documents \/><\/RequireNav>\}/.test(app));
check('/documents/upload renders DocumentUpload behind the guard', /path="\/documents\/upload"[^>]*element=\{<RequireNav navId="documents"><DocumentUpload \/><\/RequireNav>\}/.test(app));
check('/documents/:documentId renders DocumentDetail behind the guard', /path="\/documents\/:documentId"[^>]*element=\{<RequireNav navId="documents"><DocumentDetail \/><\/RequireNav>\}/.test(app));
check('/documents/upload is registered before the :documentId route (so "upload" is never read as an ID)', app.indexOf('path="/documents/upload"') < app.indexOf('path="/documents/:documentId"'));
check('Document routes no longer use PlaceholderPage', !/path="\/documents[^"]*"[^\n]*PlaceholderPage/.test(app));

const sources = ['services/documentService.js', 'components/documents/DocumentPanels.jsx', 'pages/Documents.jsx', 'pages/DocumentUpload.jsx', 'pages/DocumentDetail.jsx', 'data/documentScenarios.js']
  .map((p) => [p, readFileSync(`${SRC}/${p}`, 'utf8')]);
check('No backend, network or file-reading calls anywhere in the module (fetch / XHR / FileReader / .text() / .arrayBuffer())',
  sources.every(([, src]) => !/\bfetch\s*\(|XMLHttpRequest|FileReader|\.arrayBuffer\s*\(|file\.text\s*\(|WebSocket/.test(src.replace(/\/\/.*$/gm, ''))));
check('No OCR library is referenced or installed', sources.every(([, src]) => !/tesseract|textract|vision\.googleapis|azure.*ocr|ocr\.space/i.test(src)) && !/tesseract|ocr/i.test(JSON.stringify(JSON.parse(readFileSync(`${SRC}/../package.json`, 'utf8')).dependencies)));
check('Pages go through documentService / accessService, never storage directly', ['pages/Documents.jsx', 'pages/DocumentUpload.jsx', 'pages/DocumentDetail.jsx', 'components/documents/DocumentPanels.jsx'].every((p) => !/storage\//.test(sources.find(([n]) => n === p)[1]) && !/localStorage/.test(sources.find(([n]) => n === p)[1])));
const panels = sources.find(([n]) => n === 'components/documents/DocumentPanels.jsx')[1];
check('The exact label "Document Intelligence — Mock Extraction (Prototype)" is defined once and used on all three pages',
  /FEATURE_LABEL = 'Document Intelligence — Mock Extraction \(Prototype\)'/.test(panels) && ['pages/Documents.jsx', 'pages/DocumentUpload.jsx', 'pages/DocumentDetail.jsx'].every((p) => /<MockExtractionBanner \/>/.test(sources.find(([n]) => n === p)[1])));
check('The banner states plainly that no OCR is performed and no contents are read', /No OCR is performed and no file contents are read/.test(panels));
check('Sidebar no longer advertises "OCR"', !/OCR/.test(readFileSync(`${SRC}/components/layout/Sidebar.jsx`, 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) { console.log('Failures:\n - ' + failures.join('\n - ')); process.exit(1); }
