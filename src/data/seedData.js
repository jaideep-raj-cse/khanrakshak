// All data in this file is fictional demonstration data created for this
// SIH prototype. Names, mine IDs, locations, and personnel are illustrative
// only and do not represent real DGMS records, real mines, or real people.
//
// Relational shape:
//   Mine (1) ──< Issue (N) ──< CorrectiveAction (0..1 per issue, for now)
// Every issue carries a mineId; every corrective action carries both an
// issueId and a mineId, so counts shown on Mines/Dashboard are always
// derived from these collections (see src/services/dataService.js) rather
// than hand-maintained on the mine record itself.

export const SEED_VERSION = 2;

export const seedMines = [
  {
    id: 'MINE-JHR-04',
    name: 'Jharia Colliery No. 4',
    region: 'Jharia, Jharkhand',
    status: 'ACTIVE',
    riskLevel: 'HIGH',
    complianceStatus: 'NON_COMPLIANT',
    lastInspection: '2026-09-18',
    manager: 'Sunita Rao',
  },
  {
    id: 'MINE-KOR-11',
    name: 'Korba Opencast Block 11',
    region: 'Korba, Chhattisgarh',
    status: 'ACTIVE',
    riskLevel: 'MODERATE',
    complianceStatus: 'UNDER_REVIEW',
    lastInspection: '2026-09-21',
    manager: 'Ramesh Yadav',
  },
  {
    id: 'MINE-TAL-02',
    name: 'Talcher Seam Extension 2',
    region: 'Talcher, Odisha',
    status: 'ACTIVE',
    riskLevel: 'CRITICAL',
    complianceStatus: 'NON_COMPLIANT',
    lastInspection: '2026-09-10',
    manager: 'Manoj Behera',
  },
  {
    id: 'MINE-SNG-07',
    name: 'Singrauli Underground 7',
    region: 'Singrauli, Madhya Pradesh',
    status: 'ACTIVE',
    riskLevel: 'LOW',
    complianceStatus: 'COMPLIANT',
    lastInspection: '2026-09-24',
    manager: 'Kavita Mishra',
  },
];

// Issue statuses used in this step: OPEN, IN_PROGRESS, ESCALATED, CLOSED.
// Risk score/level/reasons are seeded demonstration values — the rule-based
// risk engine that computes these from an inspection is built in Step 3.
export const seedIssues = [
  {
    id: 'ISSUE-2026-0091',
    mineId: 'MINE-JHR-04',
    category: 'Ventilation & Air Quality',
    title: 'Inadequate secondary ventilation at Seam 4 heading',
    description:
      'Auxiliary ventilation fan at the Seam 4 development heading was found non-operational during inspection, reducing air change rate below the statutory minimum for the working face.',
    status: 'ESCALATED',
    riskLevel: 'CRITICAL',
    riskScore: 87,
    riskReasons: [
      'High severity — 5/5',
      'Repeated violation — 2nd occurrence at this heading',
      'High worker exposure — active development face',
      'Corrective action overdue',
    ],
    observedDate: '2026-09-12',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0041',
  },
  {
    id: 'ISSUE-2026-0088',
    mineId: 'MINE-JHR-04',
    category: 'Structural Support / Roof Control',
    title: 'Roof bolting pattern deviation in Panel 2 gallery',
    description:
      'Roof bolt spacing in Panel 2 gallery exceeds the approved support plan by roughly 20%, identified during a routine strata-control check.',
    status: 'IN_PROGRESS',
    riskLevel: 'HIGH',
    riskScore: 64,
    riskReasons: [
      'High severity — 4/5',
      'First recorded occurrence',
      'Moderate worker exposure — access-controlled gallery',
      'Corrective action within deadline',
    ],
    observedDate: '2026-09-14',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0038',
  },
  {
    id: 'ISSUE-2026-0079',
    mineId: 'MINE-JHR-04',
    category: 'PPE & Worker Safety',
    title: 'Incomplete PPE compliance among contract labour, Shift B',
    description:
      'Spot check of Shift B contract workers at the surface handling area found inconsistent use of respiratory protection in the designated dust zone.',
    status: 'OPEN',
    riskLevel: 'MODERATE',
    riskScore: 41,
    riskReasons: [
      'Moderate severity — 3/5',
      'First recorded occurrence',
      'Moderate worker exposure — dust zone',
      'No corrective action created yet',
    ],
    observedDate: '2026-09-19',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: null,
  },
  {
    id: 'ISSUE-2026-0102',
    mineId: 'MINE-KOR-11',
    category: 'Electrical Safety',
    title: 'Unearthed junction box near conveyor transfer point',
    description:
      'A junction box feeding the overland conveyor transfer point was found without an intact earth connection during the electrical safety round.',
    status: 'IN_PROGRESS',
    riskLevel: 'MODERATE',
    riskScore: 48,
    riskReasons: [
      'Moderate severity — 3/5',
      'First recorded occurrence',
      'Low worker exposure — restricted access point',
      'Corrective action within deadline',
    ],
    observedDate: '2026-09-20',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0050',
  },
  {
    id: 'ISSUE-2026-0065',
    mineId: 'MINE-TAL-02',
    category: 'Water Management / Inundation Risk',
    title: 'Rising water table near Block C bench without active dewatering',
    description:
      'Piezometer readings near the Block C bench show a rising water table trend with the secondary dewatering pump offline for over a week.',
    status: 'ESCALATED',
    riskLevel: 'CRITICAL',
    riskScore: 91,
    riskReasons: [
      'High severity — 5/5',
      'Recurring condition — 3rd consecutive reading',
      'High worker exposure — active bench below water table',
      'Corrective action overdue',
    ],
    observedDate: '2026-09-08',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0022',
  },
  {
    id: 'ISSUE-2026-0066',
    mineId: 'MINE-TAL-02',
    category: 'Explosives & Blasting',
    title: 'Blast exclusion zone marking incomplete on eastern face',
    description:
      'Exclusion zone barricading for the scheduled bench blast on the eastern face was incomplete at the time of the pre-blast safety check.',
    status: 'IN_PROGRESS',
    riskLevel: 'CRITICAL',
    riskScore: 78,
    riskReasons: [
      'High severity — 5/5',
      'First recorded occurrence',
      'High worker exposure — active blast zone',
      'Corrective action within deadline',
    ],
    observedDate: '2026-09-11',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0023',
  },
  {
    id: 'ISSUE-2026-0070',
    mineId: 'MINE-TAL-02',
    category: 'Fire Safety',
    title: 'Expired fire extinguishers at conveyor transfer house',
    description:
      'Three fire extinguishers at the conveyor transfer house were found past their statutory inspection date during the fire-safety audit.',
    status: 'CLOSED',
    riskLevel: 'HIGH',
    riskScore: 58,
    riskReasons: [
      'Moderate-high severity — 4/5',
      'First recorded occurrence',
      'Moderate worker exposure — staffed transfer point',
      'Corrective action verified and closed',
    ],
    observedDate: '2026-09-05',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: 'CA-2026-0028',
  },
  {
    id: 'ISSUE-2026-0072',
    mineId: 'MINE-TAL-02',
    category: 'Statutory Documentation',
    title: 'Competency certificates pending renewal for two shot-firers',
    description:
      'Statutory competency certificates for two shot-firers on the night shift roster are due for renewal within the next inspection cycle.',
    status: 'OPEN',
    riskLevel: 'MODERATE',
    riskScore: 35,
    riskReasons: [
      'Low-moderate severity — 2/5',
      'First recorded occurrence',
      'Administrative — no direct worker exposure',
      'No corrective action created yet',
    ],
    observedDate: '2026-09-16',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: null,
  },
  {
    id: 'ISSUE-2026-0075',
    mineId: 'MINE-TAL-02',
    category: 'Machinery & Equipment Safety',
    title: 'Guard plate missing on workshop bench grinder',
    description:
      'The eye-shield guard on a bench grinder in the maintenance workshop was found missing during a routine equipment check.',
    status: 'OPEN',
    riskLevel: 'LOW',
    riskScore: 18,
    riskReasons: [
      'Low severity — 1/5',
      'First recorded occurrence',
      'Low worker exposure — occasional workshop use',
      'No corrective action created yet',
    ],
    observedDate: '2026-09-22',
    reportedBy: 'Arjun Verma',
    reportedByRole: 'Field Officer',
    correctiveActionId: null,
  },
];

// Corrective action lifecycle: OPEN → ASSIGNED → IN_PROGRESS →
// SUBMITTED_FOR_VERIFICATION → VERIFIED → CLOSED.
// dueDate values are deliberately seeded before/after today's demo date so
// overdue state is computed, never hardcoded (see src/utils/date.js).
export const seedCorrectiveActions = [
  {
    id: 'CA-2026-0041',
    issueId: 'ISSUE-2026-0091',
    mineId: 'MINE-JHR-04',
    title: 'Restore auxiliary ventilation fan at Seam 4 heading',
    status: 'IN_PROGRESS',
    priorityRisk: 'CRITICAL',
    assignee: 'Sunita Rao',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-12',
    dueDate: '2026-09-20',
  },
  {
    id: 'CA-2026-0038',
    issueId: 'ISSUE-2026-0088',
    mineId: 'MINE-JHR-04',
    title: 'Correct roof bolt spacing to approved support plan, Panel 2',
    status: 'ASSIGNED',
    priorityRisk: 'HIGH',
    assignee: 'Sunita Rao',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-14',
    dueDate: '2026-10-05',
  },
  {
    id: 'CA-2026-0050',
    issueId: 'ISSUE-2026-0102',
    mineId: 'MINE-KOR-11',
    title: 'Re-earth junction box at conveyor transfer point',
    status: 'IN_PROGRESS',
    priorityRisk: 'MODERATE',
    assignee: 'Ramesh Yadav',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-20',
    dueDate: '2026-10-10',
  },
  {
    id: 'CA-2026-0022',
    issueId: 'ISSUE-2026-0065',
    mineId: 'MINE-TAL-02',
    title: 'Restore secondary dewatering pump at Block C bench',
    status: 'IN_PROGRESS',
    priorityRisk: 'CRITICAL',
    assignee: 'Manoj Behera',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-08',
    dueDate: '2026-09-18',
  },
  {
    id: 'CA-2026-0023',
    issueId: 'ISSUE-2026-0066',
    mineId: 'MINE-TAL-02',
    title: 'Complete blast exclusion zone barricading, eastern face',
    status: 'ASSIGNED',
    priorityRisk: 'CRITICAL',
    assignee: 'Manoj Behera',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-11',
    dueDate: '2026-10-02',
  },
  {
    id: 'CA-2026-0028',
    issueId: 'ISSUE-2026-0070',
    mineId: 'MINE-TAL-02',
    title: 'Replace and recertify fire extinguishers, transfer house',
    status: 'CLOSED',
    priorityRisk: 'HIGH',
    assignee: 'Manoj Behera',
    assigneeRole: 'Mine Manager',
    createdDate: '2026-09-05',
    dueDate: '2026-09-15',
  },
];

// Empty demo collections — populated in later build steps (inspections in
// Step 3; contractors/documents in Step 5; audit log/notifications get their
// dedicated UI in Step 4, though the audit trail is derived from the records
// above starting this step — see src/workflows/timeline.js).
export const seedInspections = [];
export const seedContractors = [];
export const seedDocuments = [];
export const seedAuditLog = [];
export const seedNotifications = [];
