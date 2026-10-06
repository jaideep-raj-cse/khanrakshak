import React, { useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ClipboardList, AlertTriangle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import KpiCard from '../components/ui/KpiCard';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import {
  getMineById,
  getIssuesByMine,
  getCorrectiveActionsByMine,
  withMineStats,
} from '../services/dataService';
import { formatDate, isOverdue } from '../utils/date';
import { canViewMine, canViewIssue } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { can } from '../data/roles';

export default function MineDetail() {
  const { mineId } = useParams();
  const navigate = useNavigate();
  const { role } = useRole();

  const mine = useMemo(() => {
    const base = getMineById(mineId);
    return base ? withMineStats(base) : null;
  }, [mineId]);

  // Field Officer sees only the issues it reported; it has no corrective-action access.
  const showActions = can('ca.view', role);
  const issues = useMemo(() => getIssuesByMine(mineId).filter((i) => canViewIssue(role, i)), [mineId, role]);
  const actions = useMemo(() => (showActions ? getCorrectiveActionsByMine(mineId) : []), [mineId, showActions]);

  if (!mine || !canViewMine(role, mineId)) {
    return (
      <div>
        <button
          onClick={() => navigate('/mines')}
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
        >
          <ArrowLeft size={15} /> Back to Mines
        </button>
        <EmptyState title="Mine not found" description={`No mine matches ID ${mineId}.`} />
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate('/mines')}
        className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4"
      >
        <ArrowLeft size={15} /> Back to Mines
      </button>

      <PageHeader
        title={mine.name}
        subtitle={`${mine.id} · ${mine.region} · Manager: ${mine.manager}`}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={mine.complianceStatus} />
            <RiskBadge level={mine.riskLevel} />
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Open Issues" value={mine.openIssues} accent={mine.openIssues > 0 ? 'amber' : 'low'} />
        {showActions && (
          <>
            <KpiCard
              label="Pending Corrective Actions"
              value={mine.pendingActions}
              accent={mine.pendingActions > 0 ? 'amber' : 'low'}
            />
            <KpiCard
              label="Overdue Actions"
              value={mine.overdueActions}
              accent={mine.overdueActions > 0 ? 'critical' : 'low'}
            />
          </>
        )}
        <KpiCard label="Last Inspection" value={formatDate(mine.lastInspection)} accent="neutral" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Issues at this Mine">
          {issues.length === 0 ? (
            <EmptyState
              icon={AlertTriangle}
              title="No issues recorded"
              description="No violations have been logged at this mine yet."
            />
          ) : (
            <div className="divide-y divide-elevated -m-4">
              {issues.map((issue) => (
                <Link
                  key={issue.id}
                  to={`/issues/${issue.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{issue.title}</div>
                    <div className="text-xs font-mono text-text-secondary">
                      {issue.id} · {issue.category}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={issue.status} />
                    <RiskBadge level={issue.riskLevel} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {showActions && (
        <Card title="Corrective Actions">
          {actions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No corrective actions"
              description="High and critical issues automatically generate a corrective action once created."
            />
          ) : (
            <div className="divide-y divide-elevated -m-4">
              {actions.map((action) => (
                <Link
                  key={action.id}
                  to={`/issues/${action.issueId}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{action.title}</div>
                    <div className="text-xs font-mono text-text-secondary">
                      {action.id} · Due {formatDate(action.dueDate)} · {action.assignee}
                    </div>
                  </div>
                  <StatusBadge status={action.status} overdue={isOverdue(action.dueDate, action.status)} />
                </Link>
              ))}
            </div>
          )}
        </Card>
        )}
      </div>

      <Card title="Inspection History" className="mt-4">
        <EmptyState
          icon={ClipboardList}
          title="Inspection history arrives in Step 3"
          description="Once the inspection wizard and submission pipeline are built, every inspection conducted at this mine will be listed here."
        />
      </Card>
    </div>
  );
}
