import React, { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileWarning, ShieldQuestion } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import Timeline from '../components/ui/Timeline';
import EmptyState from '../components/ui/EmptyState';
import { getIssueWithRelations } from '../services/dataService';
import { buildIssueTimeline } from '../workflows/timeline';
import { formatDate, isOverdue } from '../utils/date';

const RISK_GAUGE_COLOR = {
  LOW: '#10B981',
  MODERATE: '#D97706',
  HIGH: '#EA580C',
  CRITICAL: '#EF4444',
};

export default function IssueDetail() {
  const { issueId } = useParams();
  const navigate = useNavigate();

  const issue = useMemo(() => getIssueWithRelations(issueId), [issueId]);
  const timeline = useMemo(
    () => (issue ? buildIssueTimeline(issue, issue.correctiveAction) : []),
    [issue]
  );

  if (!issue) {
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

  const gaugeColor = RISK_GAUGE_COLOR[issue.riskLevel] ?? RISK_GAUGE_COLOR.LOW;
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
            <EmptyState
              icon={FileWarning}
              title="Evidence capture arrives with the inspection workflow"
              description="Step 3 adds photo/document evidence upload as part of the inspection wizard. This issue was seeded as demonstration data for Step 2."
            />
          </Card>

          <Card title="Timeline">
            <Timeline events={timeline} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="AI-Assisted Risk Assessment">
            <div className="flex flex-col items-center py-2">
              <div
                className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-4 mb-2"
                style={{ borderColor: gaugeColor }}
              >
                <span className="font-mono text-3xl font-bold" style={{ color: gaugeColor }}>
                  {issue.riskScore}
                </span>
                <span className="text-[10px] text-text-secondary">/ 100</span>
              </div>
              <RiskBadge level={issue.riskLevel} />
            </div>

            <div className="mt-4 pt-3 border-t border-border">
              <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">
                Risk Reasons
              </div>
              <ul className="space-y-1.5">
                {issue.riskReasons.map((reason, idx) => (
                  <li key={idx} className="text-xs text-text-secondary flex gap-2">
                    <span className="text-amber">•</span>
                    {reason}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex items-start gap-2 text-[11px] text-text-muted">
              <ShieldQuestion size={14} className="shrink-0 mt-0.5" />
              <span>
                Prototype Risk Intelligence Engine — rule-based demonstration model. Seeded
                values shown for Step 2; the live Severity/Recurrence/Exposure/Delay engine is
                built in Step 3.
              </span>
            </div>
          </Card>

          <Card title="Corrective Action">
            {issue.correctiveAction ? (
              <div className="space-y-2 text-sm">
                <div className="font-medium">{issue.correctiveAction.title}</div>
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
