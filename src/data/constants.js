export const RISK_LEVEL_OPTIONS = [
  { value: 'ALL', label: 'All Risk Levels' },
  { value: 'CRITICAL', label: 'Critical' },
  { value: 'HIGH', label: 'High' },
  { value: 'MODERATE', label: 'Moderate' },
  { value: 'LOW', label: 'Low' },
];

export const MINE_COMPLIANCE_OPTIONS = [
  { value: 'ALL', label: 'All Compliance' },
  { value: 'COMPLIANT', label: 'Compliant' },
  { value: 'UNDER_REVIEW', label: 'Under Review' },
  { value: 'NON_COMPLIANT', label: 'Non-Compliant' },
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
