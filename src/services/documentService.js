// Document Intelligence domain logic (Step 5b) — MOCK extraction, no OCR, no backend.
// Pages stay thin: scope, normalisation, issue rules, upload and delete live here so they can
// be tested in Node without a browser.
//
// HONESTY RULE: nothing here reads a file. Upload keeps only the file's name / size / type, then
// plays back a canned scenario (data/documentScenarios.js) chosen from the document type the user
// picked or from a keyword in the file name. The potential-issue rules below are real logic, but
// they run over those canned values.
//
// Two record shapes live in the same collection:
//   • Seeded demo records (Step 2) — carry `ocr.extractedFields` and stored `flags`.
//   • New uploads — carry `extraction` ({ mode: 'MOCK', fields, signals, ... }) and NO stored
//     status or flags: like risk scores, they are derived on every read (normalizeDocument), so an
//     "expires soon" document becomes "expired" on its own once the date passes.
// Always read documents through this module, never straight from dataService, so both shapes
// look the same to the UI.
//
// Role rules (WHAT: data/roles.js PERMISSIONS · WHERE: services/accessService.js):
//   Field Officer       view + upload for its assigned mines
//   Mine Manager        view + upload for its own mine(s)
//   Compliance Officer  view + upload for all mines
//   Administrator       view + upload for all mines, and delete
import { ROLE_DETAILS, can } from '../data/roles';
import { DOCUMENT_TYPES, getDocumentTypeLabel, getCategoryGroup } from '../data/constants';
import {
  DOCUMENT_SCENARIOS,
  DETECTION_ORDER,
  MOCK_ENGINE_LABEL,
  MOCK_AUTHORITY,
} from '../data/documentScenarios';
import {
  getDocuments,
  getDocumentById,
  addDocument,
  removeDocument,
  getMines,
  getMineById,
  getIssueById,
  getInspections,
} from './dataService';
import { canViewMine, canViewIssue, canViewInspection, getVisibleMines } from './accessService';
import { logAuditEvent } from './auditService';
import { nextId } from '../utils/id';
import { calendarDaysPastDue, formatDate, localDateISO, DEMO_NOW } from '../utils/date';

export const VALIDITY = {
  CURRENT: 'CURRENT',
  EXPIRING_SOON: 'EXPIRING_SOON',
  EXPIRED: 'EXPIRED',
  NO_EXPIRY: 'NO_EXPIRY',
  UNKNOWN: 'UNKNOWN',
};

export const EXPIRY_WARNING_DAYS = 30;
export const ACCEPTED_EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg'];
export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

// The six extracted fields, in display order.
export const FIELD_DEFS = [
  { key: 'documentType', label: 'Document Type', kind: 'text' },
  { key: 'issuingAuthority', label: 'Issuing Authority', kind: 'text' },
  { key: 'mineReference', label: 'Mine Name / Reference', kind: 'text' },
  { key: 'issueDate', label: 'Issue Date', kind: 'date' },
  { key: 'expiryDate', label: 'Expiry Date', kind: 'date' },
  { key: 'licenseNumber', label: 'License / Permit Number', kind: 'text' },
];

const FIELD_LABEL = Object.fromEntries(FIELD_DEFS.map((f) => [f.key, f.label]));
const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

// A compliance category for seeded records (which don't carry one), by document type.
const LEGACY_CATEGORY = {
  LICENSE: 'Statutory Documentation',
  INSPECTION_REPORT: 'Statutory Documentation',
  ENVIRONMENTAL: 'Environmental Compliance',
  LABOUR_COMPLIANCE: 'Labour & Welfare Compliance',
  SAFETY_CERTIFICATE: 'Machinery & Equipment Safety',
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Whole calendar days until the date (negative once it has passed); null if no date.
function daysUntil(iso, now) {
  const past = calendarDaysPastDue(iso, now);
  return past === null ? null : past === 0 ? 0 : -past;
}

function fileExtension(fileName) {
  const match = /\.([a-z0-9]+)$/i.exec((fileName ?? '').trim());
  return match ? match[1].toLowerCase() : '';
}

// "TAL02_EC_Report-2026.pdf" → "tal02 ec report 2026" so \b word boundaries work (an underscore
// is a "word" character to a regex, which would hide the "ec" in "TAL02_EC_Report").
function normaliseFileName(fileName) {
  return (fileName ?? '')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// --- Scenario selection ---------------------------------------------------------

/**
 * Which canned scenario an upload will play back.
 * @param {{fileName?: string, documentType?: string}} input documentType: a DOCUMENT_TYPES key or 'AUTO'
 * @returns {{scenario: object, basis: 'SELECTED_TYPE'|'FILENAME_PATTERN'}|null}
 */
export function detectScenario({ fileName, documentType } = {}) {
  if (documentType && documentType !== 'AUTO') {
    const scenario = DOCUMENT_SCENARIOS[documentType];
    return scenario ? { scenario, basis: 'SELECTED_TYPE' } : null;
  }
  const text = normaliseFileName(fileName);
  if (!text) return null;
  for (const type of DETECTION_ORDER) {
    if (DOCUMENT_SCENARIOS[type].filePattern.test(text)) {
      return { scenario: DOCUMENT_SCENARIOS[type], basis: 'FILENAME_PATTERN' };
    }
  }
  return null;
}

// --- Validity + issue rules ------------------------------------------------------

/**
 * @param {string|null} expiryDate ISO date or null
 * @param {boolean} expiryRequired true when a missing expiry date is a problem rather than normal
 */
export function getValidity(expiryDate, expiryRequired, now = DEMO_NOW) {
  const d = daysUntil(expiryDate, now);
  if (d === null) {
    return expiryRequired
      ? { status: VALIDITY.UNKNOWN, daysRemaining: null, label: 'Expiry date not found' }
      : { status: VALIDITY.NO_EXPIRY, daysRemaining: null, label: 'No expiry date' };
  }
  if (d < 0) {
    return { status: VALIDITY.EXPIRED, daysRemaining: d, label: `Expired ${plural(-d, 'day')} ago` };
  }
  if (d <= EXPIRY_WARNING_DAYS) {
    return {
      status: VALIDITY.EXPIRING_SOON,
      daysRemaining: d,
      label: d === 0 ? 'Expires today' : `Expires in ${plural(d, 'day')}`,
    };
  }
  return { status: VALIDITY.CURRENT, daysRemaining: d, label: `Valid till ${formatDate(expiryDate)}` };
}

/** Field keys a document of this type must have for the extraction to be considered complete. */
export function getRequiredFieldKeys(documentType) {
  const keys = ['documentType', 'issuingAuthority', 'mineReference', 'issueDate', 'licenseNumber'];
  if (DOCUMENT_TYPES[documentType]?.expires) keys.push('expiryDate');
  return keys;
}

const isBlank = (v) => v === null || v === undefined || String(v).trim() === '';

/**
 * The potential-issue rules. Pure: extracted values in, flags out.
 *   Expired document / Expires soon · Missing signature/seal · Missing required field
 * `signals.signature` / `signals.seal`: true = detected, false = not detected, null = not assessed.
 * `includeExpiringSoon` is off for seeded records, which already carry a hand-written flag for it.
 */
export function detectPotentialIssues({ fields, signals, documentType, validity, includeExpiringSoon = true }) {
  const flags = [];

  if (validity.status === VALIDITY.EXPIRED) {
    flags.push({
      code: 'EXPIRED',
      severity: 'high',
      title: 'Expired document',
      message: `${validity.label} (${formatDate(fields.expiryDate)}). Ask the mine for the renewed document before relying on this one.`,
    });
  } else if (validity.status === VALIDITY.EXPIRING_SOON && includeExpiringSoon) {
    flags.push({
      code: 'EXPIRING_SOON',
      severity: 'medium',
      title: 'Expires soon',
      message: `${validity.label} (${formatDate(fields.expiryDate)}). Check that a renewal has been applied for.`,
    });
  }

  if (signals && (signals.signature === false || signals.seal === false)) {
    const missing =
      signals.signature === false && signals.seal === false
        ? 'authorised signature or official seal'
        : signals.signature === false
        ? 'authorised signature'
        : 'official seal';
    flags.push({
      code: 'MISSING_SIGNATURE_SEAL',
      severity: 'medium',
      title: 'Missing signature/seal',
      message: `No ${missing} was found on this document, so it may not be an authentic or final copy.`,
    });
  }

  getRequiredFieldKeys(documentType).forEach((key) => {
    if (isBlank(fields[key])) {
      flags.push({
        code: 'MISSING_FIELD',
        field: key,
        severity: 'medium',
        title: `Missing required field: ${FIELD_LABEL[key]}`,
        message: `${FIELD_LABEL[key]} was not found in the extracted values for a ${getDocumentTypeLabel(documentType)}.`,
      });
    }
  });

  return flags.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// --- Normalisation -------------------------------------------------------------------

function legacyFields(doc, mine) {
  const f = doc.ocr?.extractedFields ?? {};
  return {
    documentType: getDocumentTypeLabel(doc.documentType),
    issuingAuthority: f.issuingAuthority ?? null,
    mineReference: mine ? `${mine.name} (${mine.id})` : doc.mineId,
    issueDate: f.validFrom ?? f.inspectionDate ?? null,
    expiryDate: f.validTill ?? null,
    licenseNumber: f.documentNumber ?? null,
  };
}

function legacyFlags(doc) {
  return (doc.flags ?? []).map((f) => ({
    code: 'SEEDED',
    severity: f.severity ?? 'medium',
    title: 'Review item',
    message: f.message,
  }));
}

function buildView(doc, { minesById, now }) {
  const mine = minesById.get(doc.mineId) ?? null;
  const isMock = doc.extraction?.mode === 'MOCK';
  const fields = isMock ? doc.extraction.fields : legacyFields(doc, mine);
  const signals = isMock ? doc.extraction.signals ?? {} : {};
  const requiredKeys = isMock ? getRequiredFieldKeys(doc.documentType) : [];
  const validity = getValidity(fields.expiryDate, isMock && !!DOCUMENT_TYPES[doc.documentType]?.expires, now);

  let flags;
  if (isMock) {
    flags = detectPotentialIssues({ fields, signals, documentType: doc.documentType, validity });
  } else {
    flags = legacyFlags(doc);
    // Seeded flags are written by hand and would not notice a date passing — the one rule that
    // must never be stale.
    if (validity.status === VALIDITY.EXPIRED) {
      flags = [...detectPotentialIssues({ fields, signals, documentType: doc.documentType, validity }).filter((f) => f.code === 'EXPIRED'), ...flags];
    }
  }

  const missingText = !isMock ? 'Not recorded' : null;
  const fieldList = FIELD_DEFS.map((def) => {
    const raw = fields[def.key] ?? null;
    const found = !isBlank(raw);
    const required = requiredKeys.includes(def.key);
    return {
      key: def.key,
      label: def.label,
      raw,
      found,
      required,
      value: !found ? null : def.kind === 'date' ? formatDate(raw) : String(raw),
      missingText: missingText ?? (required ? 'Not found' : 'Not applicable'),
    };
  });

  const category = isMock ? doc.extraction.complianceCategory : LEGACY_CATEGORY[doc.documentType] ?? null;

  return {
    ...doc,
    isMock,
    source: isMock ? 'MOCK_UPLOAD' : 'SEEDED',
    typeLabel: getDocumentTypeLabel(doc.documentType),
    mine,
    mineName: mine?.name ?? doc.mineId,
    status: flags.length > 0 ? 'FLAGGED' : 'PROCESSED',
    flags,
    flagCount: flags.length,
    topSeverityRank: flags.length ? Math.min(...flags.map((f) => SEVERITY_RANK[f.severity])) : 3,
    validity,
    validityStatus: validity.status,
    category,
    categoryGroup: category ? getCategoryGroup(category) : null,
    fieldList,
    signals,
    extractionLabel: isMock ? doc.extraction.engine : 'Pre-filled demo record (seed data) — no extraction was run',
  };
}

function viewContext(now = DEMO_NOW) {
  return { minesById: new Map(getMines().map((m) => [m.id, m])), now };
}

/** A stored document as the UI sees it (derived status, flags, validity, field list). */
export function normalizeDocument(doc, now = DEMO_NOW) {
  return buildView(doc, viewContext(now));
}

// --- Scope ---------------------------------------------------------------------------

export function canViewDocument(role, doc) {
  return !!doc && can('documents.view', role) && canViewMine(role, doc.mineId);
}

export function canDeleteDocument(role) {
  return can('documents.delete', role);
}

/** Mines this role may upload to (the upload form's mine list). */
export function getUploadableMines(role) {
  return can('documents.upload', role) ? getVisibleMines(role) : [];
}

// --- List ------------------------------------------------------------------------------

/** Documents the role may see, newest upload first. */
export function getDocumentRows(role, now = DEMO_NOW) {
  const ctx = viewContext(now);
  return getDocuments()
    .filter((d) => canViewDocument(role, d))
    .map((d) => buildView(d, ctx))
    .sort((a, b) => (a.uploadedDate < b.uploadedDate ? 1 : a.uploadedDate > b.uploadedDate ? -1 : a.id < b.id ? 1 : -1));
}

/**
 * @param {Object} f
 * @param {string} [f.search] file name, title, id, type, mine, uploader or number
 * @param {string} [f.mineId] 'ALL' or a mine id
 * @param {string} [f.documentType] 'ALL' or a DOCUMENT_TYPES key
 * @param {string} [f.status] 'ALL' | PROCESSED | FLAGGED
 * @param {string} [f.validity] 'ALL' | a VALIDITY value
 */
export function filterDocuments(rows, f = {}) {
  const q = (f.search ?? '').trim().toLowerCase();
  const is = (value, filter) => !filter || filter === 'ALL' || value === filter;
  return rows.filter((row) => {
    const matchesSearch =
      !q ||
      [row.fileName, row.title, row.id, row.typeLabel, row.mineName, row.uploadedBy, row.fieldList.find((x) => x.key === 'licenseNumber')?.raw].some((v) =>
        (v ?? '').toString().toLowerCase().includes(q)
      );
    return (
      matchesSearch &&
      is(row.mineId, f.mineId) &&
      is(row.documentType, f.documentType) &&
      is(row.status, f.status) &&
      is(row.validityStatus, f.validity)
    );
  });
}

// --- Detail ----------------------------------------------------------------------------

/**
 * Everything the detail page needs, or null if the document does not exist or is outside the
 * role's scope (the page shows the same "not found" for both, so scope can't be probed).
 */
export function getDocumentDetail(documentId, role, now = DEMO_NOW) {
  const doc = getDocumentById(documentId);
  if (!doc || !canViewDocument(role, doc)) return null;
  const view = buildView(doc, viewContext(now));

  const issue = doc.relatedIssueId ? getIssueById(doc.relatedIssueId) : null;
  const inspection = doc.relatedInspectionId ? getInspections().find((i) => i.id === doc.relatedInspectionId) ?? null : null;
  const relatedIssue = issue && canViewIssue(role, issue) ? { id: issue.id, title: issue.title } : null;
  const relatedInspection = inspection && canViewInspection(role, inspection) ? { id: inspection.id } : null;
  const hasRelated = !!(issue || inspection);

  return {
    ...view,
    relatedIssue,
    relatedInspection,
    hiddenRelatedCount: (issue && !relatedIssue ? 1 : 0) + (inspection && !relatedInspection ? 1 : 0),
    hasRelated,
    canDelete: canDeleteDocument(role),
  };
}

// --- Upload ------------------------------------------------------------------------------

/**
 * Checks an upload WITHOUT saving anything — the form uses it for inline errors and uploadDocument
 * uses it again, so the rules can't be bypassed by calling the function directly.
 * @param {{role: string, mineId: string, file: {name: string, size: number}|null, documentType: string}} input
 */
export function validateUploadInput({ role, mineId, file, documentType }) {
  const errors = {};

  if (!can('documents.upload', role)) {
    errors.permission = 'You do not have permission to upload documents.';
  }

  if (!mineId) {
    errors.mine = 'Select the mine this document belongs to.';
  } else if (!getMineById(mineId)) {
    errors.mine = 'That mine does not exist.';
  } else if (!canViewMine(role, mineId)) {
    errors.mine = 'That mine is outside your assigned mine(s).';
  }

  if (!file || !file.name) {
    errors.file = 'Choose a file to upload.';
  } else if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file.name))) {
    errors.file = `Unsupported file type. Upload a ${ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(', ')} file.`;
  } else if (!(file.size > 0)) {
    errors.file = 'This file is empty.';
  } else if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.file = `This file is larger than ${MAX_FILE_SIZE_MB} MB.`;
  }

  const detected = detectScenario({ fileName: file?.name, documentType });
  if (!detected && !errors.file) {
    errors.type =
      documentType && documentType !== 'AUTO'
        ? 'Choose a valid document type.'
        : 'The document type could not be recognised from the file name. Choose a type instead.';
  }

  return { ok: Object.keys(errors).length === 0, errors, ...(detected ?? { scenario: null, basis: null }) };
}

/**
 * The mock extraction itself: plays back a canned scenario for a mine. Pure and deterministic —
 * the same scenario, mine, sequence number and date always give the same result.
 */
export function runMockExtraction({ scenario, mine, sequence, now = DEMO_NOW, basis }) {
  const dateAt = (offset) =>
    offset === null ? null : localDateISO(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  const mineCode = mine.id.replace(/^MINE-/, '').replace(/-/g, '');

  const fields = {
    documentType: getDocumentTypeLabel(scenario.documentType),
    issuingAuthority: MOCK_AUTHORITY,
    mineReference: `${mine.name} (${mine.id})`,
    issueDate: dateAt(scenario.issueOffsetDays),
    expiryDate: dateAt(scenario.expiryOffsetDays),
    licenseNumber: `${scenario.numberPrefix}-${mineCode}-${String(sequence).padStart(4, '0')}`,
  };
  scenario.missingFields.forEach((key) => {
    fields[key] = null;
  });

  return {
    mode: 'MOCK',
    engine: MOCK_ENGINE_LABEL,
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    basis,
    extractedAt: now.toISOString(),
    fields,
    signals: { signature: scenario.signature, seal: scenario.seal },
    complianceCategory: scenario.complianceCategory,
  };
}

/**
 * Saves an upload and its mock extraction (LocalStorage only) and writes one audit event.
 * Only the file's name, size and type are kept — its contents are never read.
 * @returns the saved document as the UI sees it
 */
export function uploadDocument({ file, mineId, documentType = 'AUTO', actor, role, now = DEMO_NOW }) {
  const check = validateUploadInput({ role, mineId, file, documentType });
  if (!check.ok) throw new Error(Object.values(check.errors)[0]);

  const mine = getMineById(mineId);
  const id = nextId('DOC', getDocuments().map((d) => d.id), now.getFullYear());
  const sequence = parseInt(id.split('-').pop(), 10);
  const extraction = runMockExtraction({ scenario: check.scenario, mine, sequence, now, basis: check.basis });
  const extension = fileExtension(file.name);

  const record = {
    id,
    mineId,
    title: `${getDocumentTypeLabel(check.scenario.documentType)} — ${mine.name}`,
    documentType: check.scenario.documentType,
    fileName: file.name.trim(),
    fileType: file.type || MIME_BY_EXTENSION[extension],
    fileSizeKB: Math.max(1, Math.round(file.size / 1024)),
    uploadedBy: actor,
    uploadedByRole: ROLE_DETAILS[role]?.name ?? role,
    uploadedDate: localDateISO(now),
    extraction,
    relatedInspectionId: null,
    relatedIssueId: null,
  };
  addDocument(record);

  const view = normalizeDocument(record, now);
  logAuditEvent({
    actor,
    role: ROLE_DETAILS[role]?.name ?? role,
    action: 'Document Uploaded',
    entity: 'Document',
    entityId: id,
    mineId,
    description:
      `${record.fileName} uploaded to ${mine.name} by ${actor}. Mock extraction ("${extraction.scenarioLabel}") ` +
      (view.flagCount > 0
        ? `found ${plural(view.flagCount, 'potential issue')}: ${view.flags.map((f) => f.title).join('; ')}.`
        : 'found no potential issues.'),
  });
  return view;
}

// --- Delete ------------------------------------------------------------------------------

export function deleteDocument({ documentId, actor, role }) {
  if (!can('documents.delete', role)) throw new Error('Only an Administrator can delete documents.');
  const doc = getDocumentById(documentId);
  if (!doc) throw new Error('Document not found.');
  removeDocument(documentId);
  logAuditEvent({
    actor,
    role: ROLE_DETAILS[role]?.name ?? role,
    action: 'Document Deleted',
    entity: 'Document',
    entityId: documentId,
    mineId: doc.mineId,
    description: `${doc.fileName} was deleted by ${actor}.`,
  });
  return true;
}
