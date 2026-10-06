export const RISK_LEVEL_OPTIONS = [
  { value: 'ALL', label: 'All Risk Levels' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MODERATE', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

// Risk-level colours — the single source for RiskBadge and the GIS Risk Map markers/legend.
// Level codes match riskEngine (MODERATE is displayed as "Medium").
export const RISK_COLORS = {
  LOW: '#10B981', // green
  MODERATE: '#D97706', // amber
  HIGH: '#EA580C', // orange
  CRITICAL: '#EF4444', // red
};

export const MINE_COMPLIANCE_OPTIONS = [
  { value: 'ALL', label: 'All Compliance' },
  { value: 'COMPLIANT', label: 'Compliant' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'NON_COMPLIANT', label: 'Non-Compliant' },
];

// Contractors (Step 5). Compliance filter reuses MINE_COMPLIANCE_OPTIONS — contractors use
// the same Compliant / Under Review / Non-Compliant vocabulary.
// Contract status is DERIVED from the contract dates (plus a manual Suspended override),
// see services/contractorService.js.
export const CONTRACT_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Contract Statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

export const ISSUE_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'ESCALATED', label: 'Escalated' },
  { value: 'CLOSED', label: 'Closed' },
];

export const ACTION_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'OPEN', label: 'Open' },
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'SUBMITTED_FOR_VERIFICATION', label: 'Submitted for Verification' },
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CLOSED', label: 'Closed' },
];

export function buildMineFilterOptions(mines) {
  return [
    { value: 'ALL', label: 'All Mines' },
    ...mines.map((m) => ({ value: m.id, label: m.name })),
  ];
}

// --- Inspection Wizard vocabulary (Step 3) ---------------------------------
// Reuses exactly the compliance categories already established by the Step 2
// seed data, per the instruction not to invent unrelated categories.
export const ISSUE_CATEGORIES = [
  'Ventilation & Air Quality',
  'Structural Support / Roof Control',
  'PPE & Worker Safety',
  'Electrical Safety',
  'Water Management / Inundation Risk',
  'Explosives & Blasting',
  'Fire Safety',
  'Statutory Documentation',
  'Machinery & Equipment Safety',
  'Environmental Compliance',
  // Added with the expanded demo dataset so the blueprint's Labour / Contractor /
  // Operations domains have real categories (appended; existing order unchanged).
  'Labour & Welfare Compliance',
  'Contractor Compliance',
  'Operations & Production Control',
];

// Blueprint governance domains → the category vocabulary above. Every
// ISSUE_CATEGORIES entry belongs to exactly one domain; analytics / future
// filters can group by domain without a second taxonomy on the records.
export const ISSUE_CATEGORY_GROUPS = {
  Safety: [
    'Ventilation & Air Quality',
    'Structural Support / Roof Control',
    'PPE & Worker Safety',
    'Electrical Safety',
    'Water Management / Inundation Risk',
    'Explosives & Blasting',
    'Fire Safety',
    'Machinery & Equipment Safety',
  ],
  Environment: ['Environmental Compliance'],
  Labour: ['Labour & Welfare Compliance'],
  Contractor: ['Contractor Compliance'],
  Operations: ['Statutory Documentation', 'Operations & Production Control'],
};

export function getCategoryGroup(category) {
  const hit = Object.entries(ISSUE_CATEGORY_GROUPS).find(([, cats]) => cats.includes(category));
  return hit ? hit[0] : null;
}

export const INSPECTION_TYPES = [
  'Routine Inspection',
  'Statutory Inspection',
  'Follow-up Inspection',
  'Incident-Triggered Inspection',
];

export const SEVERITY_OPTIONS = [
  { value: 1, label: '1 — Minor' },
  { value: 2, label: '2 — Low' },
  { value: 3, label: '3 — Moderate' },
  { value: 4, label: '4 — High' },
  { value: 5, label: '5 — Severe' },
];

export const EXPOSURE_LEVEL_OPTIONS = [
  { value: 'low', label: 'Low — limited/occasional access' },
  { value: 'medium', label: 'Medium — routine work area' },
  { value: 'high', label: 'High — active/high-traffic work zone' },
];


// --- Document Intelligence (Step 5b — MOCK extraction, no OCR) ---------------
// Document types. LICENSE / INSPECTION_REPORT / ENVIRONMENTAL / LABOUR_COMPLIANCE are the keys
// the seed already uses; SAFETY_CERTIFICATE is new. `expires` = the document normally carries an
// expiry date, so a missing one is a "missing required field" (inspection reports don't expire).
export const DOCUMENT_TYPES = {
  LICENSE: { label: 'License', expires: true },
  INSPECTION_REPORT: { label: 'Inspection Report', expires: false },
  ENVIRONMENTAL: { label: 'Environmental Clearance', expires: true },
  LABOUR_COMPLIANCE: { label: 'Labour Record', expires: true },
  SAFETY_CERTIFICATE: { label: 'Safety Certificate', expires: true },
};

export function getDocumentTypeLabel(type) {
  return DOCUMENT_TYPES[type]?.label ?? type ?? 'Unknown';
}

export const DOCUMENT_TYPE_FILTER_OPTIONS = [
  { value: 'ALL', label: 'All Types' },
  ...Object.entries(DOCUMENT_TYPES).map(([value, t]) => ({ value, label: t.label })),
];

// Upload form: "Auto" picks the canned scenario from the file name.
export const DOCUMENT_TYPE_UPLOAD_OPTIONS = [
  { value: 'AUTO', label: 'Auto-detect from file name' },
  ...Object.entries(DOCUMENT_TYPES).map(([value, t]) => ({ value, label: t.label })),
];

export const DOCUMENT_STATUS_OPTIONS = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'PROCESSED', label: 'Processed' },
  { value: 'FLAGGED', label: 'Flagged' },
];

// Validity is DERIVED from the expiry date at read time (services/documentService.js).
export const DOCUMENT_VALIDITY_OPTIONS = [
  { value: 'ALL', label: 'All Validity' },
  { value: 'CURRENT', label: 'Current' },
  { value: 'EXPIRING_SOON', label: 'Expiring Soon' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'NO_EXPIRY', label: 'No Expiry' },
  { value: 'UNKNOWN', label: 'Expiry Unknown' },
];
