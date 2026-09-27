// Builds an audit-style timeline for an issue from the actual state of the
// issue and its corrective action, rather than a hardcoded per-record list.
// This keeps the timeline honest: if the underlying record changes, the
// timeline changes with it. This is the same shape the full Audit Trail
// (Step 4) will read from.
import { formatDate, isOverdue } from '../utils/date';

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
    description: `Assessed as ${issue.riskLevel} (${issue.riskScore}/100) — rule-based demonstration model.`,
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
