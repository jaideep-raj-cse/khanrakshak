import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import EscalationBadge from '../components/ui/EscalationBadge';
import { getCorrectiveActionsWithRelations, getMines } from '../services/dataService';
import { canViewAction } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { RISK_LEVEL_OPTIONS, buildMineFilterOptions } from '../data/constants';
import { formatDate } from '../utils/date';
import { computeDaysInfo, getEscalationLevel } from '../workflows/correctiveActionWorkflow';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

// Step 4: /verification queue. Route access is gated to Compliance Officer /
// Administrator by RequireNav in App.jsx (see also NAV_PERMISSIONS.verification
// in src/data/roles.js). Both of those roles have global mine scope today, so the
// extra canViewAction() filter below is defense-in-depth (keeps this page
// consistent with CorrectiveActions.jsx / CorrectiveActionDetail.jsx, which all
// scope defensively rather than relying solely on the route guard) — it changes
// nothing visible under the current role set.
export default function Verification() {
  const navigate = useNavigate();
  const { role } = useRole();
  const mineOptions = useMemo(() => buildMineFilterOptions(getMines()), []);

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [mineFilter, setMineFilter] = useState('ALL');

  const queue = useMemo(() => {
    return getCorrectiveActionsWithRelations()
      .filter((a) => a.status === 'SUBMITTED_FOR_VERIFICATION' && canViewAction(role, a))
      .map((a) => ({ ...a, ...computeDaysInfo(a), escalationLevel: getEscalationLevel(a) }));
  }, [role]);

  const filtered = queue.filter((action) => {
    const matchesSearch =
      !search ||
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.id.toLowerCase().includes(search.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || action.priorityRisk === riskFilter;
    const matchesMine = mineFilter === 'ALL' || action.mineId === mineFilter;
    return matchesSearch && matchesRisk && matchesMine;
  });

  const columns = [
    {
      key: 'title',
      label: 'Corrective Action',
      sortable: true,
      render: (a) => (
        <div>
          <div className="text-sm font-medium max-w-xs truncate flex items-center gap-2">
            {a.title}
            {a.escalationLevel > 0 && <EscalationBadge level={a.escalationLevel} />}
          </div>
          <div className="text-xs font-mono text-text-secondary">
            {a.id} · {a.issueId}
          </div>
        </div>
      ),
    },
    {
      key: 'mine',
      label: 'Mine',
      sortable: true,
      sortValue: (a) => a.mine?.name ?? '',
      render: (a) => <span className="text-sm">{a.mine?.name ?? '—'}</span>,
    },
    {
      key: 'issue',
      label: 'Issue',
      render: (a) => <span className="text-xs font-mono text-text-secondary">{a.issue?.category ?? '—'}</span>,
    },
    {
      key: 'priorityRisk',
      label: 'Risk',
      sortable: true,
      sortValue: (a) => RISK_ORDER[a.priorityRisk] ?? 0,
      render: (a) => <RiskBadge level={a.priorityRisk} />,
    },
    {
      key: 'assignee',
      label: 'Assigned To',
      sortable: true,
      render: (a) => <span className="text-sm">{a.assignee}</span>,
    },
    {
      key: 'submittedAt',
      label: 'Submitted',
      align: 'right',
      sortable: true,
      render: (a) => (
        <span className="font-mono text-xs text-text-secondary">
          {a.submittedAt ? formatDate(a.submittedAt.slice(0, 10)) : '—'}
        </span>
      ),
    },
    {
      key: 'dueDate',
      label: 'Deadline',
      align: 'right',
      sortable: true,
      render: (a) => (
        <span className={`font-mono text-xs ${a.overdue ? 'text-risk-critical' : 'text-text-secondary'}`}>
          {formatDate(a.dueDate)}
        </span>
      ),
    },
    {
      key: 'action',
      label: 'Action',
      align: 'right',
      render: (a) => (
        <button
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/verification/${a.id}`);
          }}
          className="h-8 px-3 rounded-btn bg-amber text-surface text-xs font-medium hover:bg-amber-hover"
        >
          Review
        </button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Verification & Closure"
        subtitle={`${queue.length} corrective action${queue.length === 1 ? '' : 's'} awaiting verification`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search action or ID…" className="w-72" />
        <FilterSelect label="Risk" value={riskFilter} onChange={setRiskFilter} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect label="Mine" value={mineFilter} onChange={setMineFilter} options={mineOptions} />
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(a) => a.id}
          onRowClick={(a) => navigate(`/verification/${a.id}`)}
          emptyState={{
            icon: ShieldCheck,
            title: 'No corrective actions awaiting verification.',
            description: 'Submitted corrective actions will appear here for Compliance Officer review.',
          }}
        />
      </div>

      <p className="text-xs text-text-muted mt-3">
        Verification is a human compliance decision, reviewed against the original issue, risk
        assessment, and submitted evidence — not an automated approval.
      </p>
    </div>
  );
}
