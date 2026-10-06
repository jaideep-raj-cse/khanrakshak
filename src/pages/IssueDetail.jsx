import React, { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning, ShieldQuestion } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import StatusBadge from '../components/ui/StatusBadge';
import EscalationBadge from '../components/ui/EscalationBadge';
import Timeline from '../components/ui/Timeline';
import EmptyState from '../components/ui/EmptyState';
import RiskGauge from '../components/ui/RiskGauge';
import RiskReasonsList from '../components/ui/RiskReasonsList';
import RiskBreakdown from '../components/ui/RiskBreakdown';
import { getIssueWithRelations } from '../services/dataService';
import { canViewIssue } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { can } from '../data/roles';
import { getRiskLevelLabel } from '../riskEngine/riskEngine';
import { buildIssueTimeline } from '../workflows/timeline';
import { computeDaysInfo, getEscalationLevel } from '../workflows/correctiveActionWorkflow';
import { formatDate, isOverdue } from '../utils/date';

export default function IssueDetail() {
  const { issueId } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();
  // Roles without corrective-action access (Field Officer) see the summary
  // read-only, with no link into the corrective-action workflow.
  const canOpenAction = can('ca.view', role);

  const issue = useMemo(() => getIssueWithRelations(issueId), [issueId]);
  const timeline = useMemo(
    () => (issue ? buildIssueTimeline(issue, issue.correctiveAction) : []),
    [issue]
  );

  if (!issue || !canViewIssue(role, issue)) {
    return (
      <div>
        <button
          onClick={() => navigate('/issues')}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
        >
          <ArrowLeft size={15} /> Back to Issues
        </button>
        <EmptyState title="Issue not found" description={`No issue matches ID ${issueId}.`} />
      </div>
    );
  }

  const overdue = issue.correctiveAction
    ? isOverdue(issue.correctiveAction.dueDate, issue.correctiveAction.status)
    : false;

  return (
    <div>
      <button
        onClick={() => navigate('/issues')}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={15} /> Back to Issues
      </button>

      <PageHeader
        title={issue.title}
        subtitle={
          <span className="font-mono text-xs">
            {issue.id} ·{' '}
            {issue.mine ? (
              <Link to={`/mines/${issue.mine.id}`} className="hover:text-amber">
                {issue.mine.name}
              </Link>
            ) : (
              '—'
            )}{' '}
            · {issue.category}
          </span>
        }
        action={<StatusBadge status={issue.status} overdue={overdue} />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card title="Description">
            <p className="text-sm text-text-secondary leading-relaxed">{issue.description}</p>
          </Card>

          <Card title="Evidence">
            {issue.evidence ? (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-btn bg-elevated border border-border flex items-center justify-center shrink-0">
                  <FileWarning size={16} className="text-text-secondary" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{issue.evidence.fileName}</div>
                  <div className="text-xs text-text-secondary font-mono">
                    {issue.evidence.fileType || 'unknown type'}
                    {issue.evidence.fileSizeKB ? ` · ${issue.evidence.fileSizeKB} KB` : ''}
                  </div>
                  {issue.evidence.note && (
                    <p className="text-xs text-text-secondary mt-2">{issue.evidence.note}</p>
                  )}
                  <p className="text-[11px] text-text-muted mt-2">
                    Prototype evidence record — file metadata only, not uploaded to any server.
                  </p>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={FileWarning}
                title="No evidence attached"
                description="No photo or document evidence was captured for this observation."
              />
            )}
          </Card>

          <Card title="Timeline">
            <Timeline events={timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Explainable AI-Assisted Risk Assessment">
            <div className="flex flex-col items-center py-2">
              <RiskGauge score={issue.riskScore} level={issue.riskLevel} />
            </div>

            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                Risk Reasons
              </div>
              <RiskReasonsList reasons={issue.riskReasons} />
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                Weight Breakdown
              </div>
              <RiskBreakdown
                breakdown={issue.riskBreakdown}
                score={issue.riskScore}
                levelLabel={getRiskLevelLabel(issue.riskLevel)}
              />
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-start gap-2 text-[11px] text-text-muted">
              <ShieldQuestion size={14} className="shrink-0 mt-0.5" />
              <span>
                Prototype Risk Intelligence Engine — rule-based demonstration model. Recalculated
                live from Severity/Recurrence/Exposure/Delay each time this page is opened; not a
                trained machine-learning model.
              </span>
            </div>
          </Card>

          <Card title="Corrective Action">
            {issue.correctiveAction ? (
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  {canOpenAction ? (
                    <Link
                      to={`/corrective-actions/${issue.correctiveAction.id}`}
                      className="font-medium hover:text-amber"
                    >
                      {issue.correctiveAction.title}
                    </Link>
                  ) : (
                    <span className="font-medium">{issue.correctiveAction.title}</span>
                  )}
                  {getEscalationLevel(issue.correctiveAction) > 0 && (
                    <EscalationBadge level={getEscalationLevel(issue.correctiveAction)} />
                  )}
                </div>
                <div className="text-xs font-mono text-text-secondary">{issue.correctiveAction.id}</div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-text-secondary">Status</span>
                  <StatusBadge status={issue.correctiveAction.status} overdue={overdue} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Assignee</span>
                  <span className="text-xs">
                    {issue.correctiveAction.assignee} · {issue.correctiveAction.assigneeRole}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Deadline</span>
                  <span className={`text-xs font-mono ${overdue ? 'text-risk-critical' : ''}`}>
                    {formatDate(issue.correctiveAction.dueDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Days Remaining / Overdue</span>
                  <span className={`text-xs font-mono ${overdue ? 'text-risk-critical' : ''}`}>
                    {computeDaysInfo(issue.correctiveAction).label}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-secondary">Verification</span>
                  <span className="text-xs">
                    {issue.correctiveAction.status === 'VERIFIED' && `Verified by ${issue.correctiveAction.verifiedBy}`}
                    {issue.correctiveAction.status === 'CLOSED' && `Closed by ${issue.correctiveAction.closedBy}`}
                    {issue.correctiveAction.status === 'SUBMITTED_FOR_VERIFICATION' && 'Pending'}
                    {!['VERIFIED', 'CLOSED', 'SUBMITTED_FOR_VERIFICATION'].includes(issue.correctiveAction.status) &&
                      'Not yet submitted'}
                  </span>
                </div>
                {canOpenAction && (
                  <div className="pt-2">
                    <Link
                      to={`/corrective-actions/${issue.correctiveAction.id}`}
                      className="text-xs text-amber hover:underline"
                    >
                      Open full corrective action workflow →
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                title="No corrective action yet"
                description="This issue has not reached the risk threshold that automatically generates a corrective action."
              />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
