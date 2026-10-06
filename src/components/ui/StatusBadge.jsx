import React from 'react';

// Tone → color mapping shared across mine compliance, issue, and corrective
// action statuses. Keeping this generic (tone-based) avoids three near-
// identical badge components.
const TONES = {
  positive: '#10B981',
  progress: '#F59E0B',
  warning: '#EA580C',
  critical: '#EF4444',
  neutral: '#94A3B8',
};

const STATUS_CONFIG = {
  // Mine compliance
  COMPLIANT: { label: 'Compliant', tone: 'positive' },
  UNDER_REVIEW: { label: 'Under Review', tone: 'neutral' },
  NON_COMPLIANT: { label: 'Non-Compliant', tone: 'critical' },
  // Issue lifecycle
  OPEN: { label: 'Open', tone: 'neutral' },
  IN_PROGRESS: { label: 'In Progress', tone: 'progress' },
  ESCALATED: { label: 'Escalated', tone: 'warning' },
  CLOSED: { label: 'Closed', tone: 'positive' },
  // Corrective action lifecycle
  ASSIGNED: { label: 'Assigned', tone: 'progress' },
  SUBMITTED_FOR_VERIFICATION: { label: 'Submitted for Verification', tone: 'warning' },
  VERIFIED: { label: 'Verified', tone: 'positive' },
  // Contractor contract status (derived from contract dates; Suspended is a manual override)
  ACTIVE: { label: 'Active', tone: 'positive' },
  EXPIRING_SOON: { label: 'Expiring Soon', tone: 'progress' },
  EXPIRED: { label: 'Expired', tone: 'critical' },
  UPCOMING: { label: 'Upcoming', tone: 'neutral' },
  SUSPENDED: { label: 'Suspended', tone: 'warning' },
  // Documents (Step 5b). Validity reuses EXPIRING_SOON / EXPIRED above.
  PROCESSED: { label: 'Processed', tone: 'positive' },
  FLAGGED: { label: 'Flagged', tone: 'warning' },
  CURRENT: { label: 'Current', tone: 'positive' },
  NO_EXPIRY: { label: 'No Expiry', tone: 'neutral' },
  UNKNOWN: { label: 'Expiry Unknown', tone: 'progress' },
};

export default function StatusBadge({ status, overdue = false }) {
  const config = STATUS_CONFIG[status] ?? { label: status ?? 'Unknown', tone: 'neutral' };
  const color = overdue ? TONES.critical : TONES[config.tone];
  const label = overdue ? 'Overdue' : config.label;

  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-btn border text-[11px] font-mono uppercase tracking-wide whitespace-nowrap"
      style={{ color, borderColor: color, backgroundColor: `${color}1F` }}
    >
      <span className="w-1.5 h-1.5 shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
