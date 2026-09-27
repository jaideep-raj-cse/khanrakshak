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
