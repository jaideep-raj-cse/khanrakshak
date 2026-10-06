// =============================================================================
// Document Intelligence — CANNED extraction scenarios (Step 5b)
// =============================================================================
// THIS IS NOT OCR. No file is read, parsed or sent anywhere. When a document is
// "uploaded", the app only looks at the document type the user picked (or, for
// "Auto-detect", a keyword pattern in the FILE NAME) and plays back one of the five
// pre-written scenarios below. Everything in a scenario — numbers, dates, the
// missing seal — is invented demonstration data; the licence / permit numbers carry
// a DEMO- prefix and the issuing authority is labelled fictional.
//
// Each scenario is deliberately built to trigger a DIFFERENT outcome so the whole
// workflow can be demonstrated:
//
//   LICENSE             → validity lapsed            (Expired document)
//   INSPECTION_REPORT   → official seal missing      (Missing signature/seal)
//   ENVIRONMENTAL       → permit number not found    (Missing required field)
//   LABOUR_COMPLIANCE   → expires within 30 days     (Expires soon)
//   SAFETY_CERTIFICATE  → nothing wrong              (Processed, no flags)
//
// The potential-issue RULES (services/documentService.js → detectPotentialIssues) are
// real logic that runs over the extracted values; only the extracted values are canned.
//
// Dates are offsets in days from the day of upload, so "expired 35 days ago" is always
// true whenever the demo is run.

export const MOCK_ENGINE_LABEL = 'Mock extraction (canned scenario) — not OCR';
export const MOCK_AUTHORITY = 'Demo Regulatory Authority (fictional)';

export const DOCUMENT_SCENARIOS = {
  LICENSE: {
    id: 'SCN-LICENSE',
    documentType: 'LICENSE',
    label: 'Mining licence — validity lapsed',
    numberPrefix: 'DEMO-ML',
    issueOffsetDays: -1500,
    expiryOffsetDays: -35,
    signature: true,
    seal: true,
    missingFields: [],
    complianceCategory: 'Statutory Documentation',
    // Matched against the lower-cased file name with punctuation turned into spaces.
    filePattern: /licen[cs]e|lease|permit|\bml\b/,
  },
  INSPECTION_REPORT: {
    id: 'SCN-INSPECTION',
    documentType: 'INSPECTION_REPORT',
    label: 'Roof-support inspection report — official seal missing',
    numberPrefix: 'DEMO-SIR',
    issueOffsetDays: -4,
    expiryOffsetDays: null, // inspection reports do not expire
    signature: true,
    seal: false,
    missingFields: [],
    complianceCategory: 'Structural Support / Roof Control',
    filePattern: /inspect|survey|audit|\bsir\b|\bdgms\b/,
  },
  ENVIRONMENTAL: {
    id: 'SCN-ENVIRONMENTAL',
    documentType: 'ENVIRONMENTAL',
    label: 'Environmental clearance — permit number not found',
    numberPrefix: 'DEMO-EC',
    issueOffsetDays: -400,
    expiryOffsetDays: 520,
    signature: true,
    seal: true,
    missingFields: ['licenseNumber'],
    complianceCategory: 'Environmental Compliance',
    filePattern: /environment|\bec\b|clearance|pollution|consent|\bcto\b|dust|emission|effluent/,
  },
  LABOUR_COMPLIANCE: {
    id: 'SCN-LABOUR',
    documentType: 'LABOUR_COMPLIANCE',
    label: 'Contract labour licence — expires soon',
    numberPrefix: 'DEMO-CLR',
    issueOffsetDays: -340,
    expiryOffsetDays: 18,
    signature: true,
    seal: true,
    missingFields: [],
    complianceCategory: 'Labour & Welfare Compliance',
    filePattern: /labou?r|wage|attendance|worker|muster|register|workforce/,
  },
  SAFETY_CERTIFICATE: {
    id: 'SCN-SAFETY',
    documentType: 'SAFETY_CERTIFICATE',
    label: 'Winding-machinery safety certificate — no issues',
    numberPrefix: 'DEMO-SFC',
    issueOffsetDays: -120,
    expiryOffsetDays: 245,
    signature: true,
    seal: true,
    missingFields: [],
    complianceCategory: 'Machinery & Equipment Safety',
    filePattern: /safety|competency|shot ?firer|fitness|certificate|\bsfc\b/,
  },
};

// "Auto-detect" checks the most specific vocabularies first and the generic ones last, because
// words like "licence" and "certificate" turn up in many file names ("Contract Labour Licence"
// is a labour record, "Environmental Clearance Certificate" is an environmental one).
export const DETECTION_ORDER = [
  'ENVIRONMENTAL',
  'LABOUR_COMPLIANCE',
  'SAFETY_CERTIFICATE',
  'INSPECTION_REPORT',
  'LICENSE',
];
