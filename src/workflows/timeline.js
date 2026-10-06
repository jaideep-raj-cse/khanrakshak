// Builds an audit-style timeline for an issue from the actual state of the
// issue and its corrective action, rather than a hardcoded per-record list.
// This keeps the timeline honest: if the underlying record changes, the
// timeline changes with it. This is the same shape the full Audit Trail
// (Step 4) will read from.
import { formatDate, isOverdue } from '../utils/date';
import { getRiskLevelLabel } from '../riskEngine/riskEngine';

export function buildIssueTimeline(issue, correctiveAction) {
  if (!issue) return [];

  const events = [];

  events.push({
    date: issue.observedDate,
    actor: issue.reportedBy,
    role: issue.reportedByRole,
    action: 'Issue Created',
    description: `${issue.category} issue logged during a field inspection.`,
  });

  events.push({
    date: issue.observedDate,
    actor: 'AI-Assisted Risk Assessment',
    role: 'Prototype Risk Intelligence Engine',
    action: 'Risk Calculated',
    description: `Assessed as ${getRiskLevelLabel(issue.riskLevel)} (${issue.riskScore}/100) — rule-based demonstration model.`,
  });

  if (correctiveAction) {
    events.push({
      date: correctiveAction.createdDate,
      actor: 'System',
      role: 'Workflow',
      action: 'Corrective Action Created',
      description: `${correctiveAction.id} assigned to ${correctiveAction.assignee} (${correctiveAction.assigneeRole}).`,
    });

    if (isOverdue(correctiveAction.dueDate, correctiveAction.status)) {
      events.push({
        date: correctiveAction.dueDate,
        actor: 'System',
        role: 'Workflow',
        action: 'Corrective Action Overdue',
        description: `Deadline passed without verification — escalation triggered.`,
      });
    }

    if (correctiveAction.status === 'VERIFIED' || correctiveAction.status === 'CLOSED') {
      events.push({
        date: correctiveAction.dueDate,
        actor: 'Compliance Officer',
        role: 'Verification',
        description: 'Remediation reviewed and approved.',
        action: 'Verification Approved',
      });
    }
  }

  if (issue.status === 'ESCALATED') {
    events.push({
      date: correctiveAction?.dueDate ?? issue.observedDate,
      actor: 'System',
      role: 'Workflow',
      action: 'Issue Escalated',
      description: 'Overdue corrective action escalated for management attention.',
    });
  }

  if (issue.status === 'CLOSED') {
    events.push({
      date: correctiveAction?.dueDate ?? issue.observedDate,
      actor: 'Compliance Officer',
      role: 'Verification',
      action: 'Issue Closed',
      description: 'Corrective action verified; issue closed with audit trail complete.',
    });
  }

  return events
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => ({ ...e, displayDate: formatDate(e.date) }));
}

// Step 4: a corrective-action-scoped timeline built from the actual
// persisted lifecycle timestamps (startedAt/submittedAt/verifiedAt/
// rejectedAt/closedAt/escalationHistory) rather than inferred from status alone,
// so the Corrective Action Detail page shows a precise history even across
// a reject → rework → resubmit cycle.
export function buildCorrectiveActionTimeline(action, issue) {
  if (!action) return [];

  const events = [];
  const dateOf = (iso) => (iso ? iso.slice(0, 10) : null);

  events.push({
    date: action.createdDate,
    actor: 'System',
    role: 'Workflow',
    action: 'Corrective Action Created',
    description: `${action.id} assigned to ${action.assignee} (${action.assigneeRole}), due ${formatDate(action.dueDate)}.`,
  });

  if (action.startedAt) {
    events.push({
      date: dateOf(action.startedAt),
      actor: action.startedBy,
      role: 'Workflow',
      action: 'Corrective Action Status Changed',
      description: 'Moved to In Progress.',
    });
  }

  if (action.rejectedAt) {
    events.push({
      date: dateOf(action.rejectedAt),
      actor: action.rejectedBy,
      role: 'Compliance Officer',
      action: 'Corrective Action Rejected / Reopened',
      description: action.rejectionReason ?? 'Rejected and returned to In Progress.',
    });
  }

  if (action.submittedAt) {
    events.push({
      date: dateOf(action.submittedAt),
      actor: action.submittedBy,
      role: 'Workflow',
      action: 'Submitted for Verification',
      description: action.completionNotes ?? 'Submitted for compliance review.',
    });
  }

  (action.escalationHistory ?? []).forEach((entry) => {
    events.push({
      date: dateOf(entry.triggeredAt),
      actor: 'System',
      role: 'Workflow',
      action: entry.level === 1 ? 'Overdue — Escalation Level 1' : `Escalated — Level ${entry.level}`,
      description: `${entry.overdueDays} day${entry.overdueDays === 1 ? '' : 's'} overdue; raised to ${entry.recipientLabel}.`,
    });
  });

  if (action.verifiedAt) {
    events.push({
      date: dateOf(action.verifiedAt),
      actor: action.verifiedBy,
      role: 'Compliance Officer',
      action: 'Corrective Action Verified',
      description: action.verificationNotes ?? 'Reviewed and accepted by human compliance review.',
    });
  }

  if (action.closedAt) {
    events.push({
      date: dateOf(action.closedAt),
      actor: action.closedBy,
      role: 'Compliance Officer',
      action: 'Corrective Action Closed',
      description: 'Closed following successful verification.',
    });
  }

  return events
    .filter((e) => e.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((e) => ({ ...e, displayDate: formatDate(e.date) }));
}
