import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import EscalationBadge from '../components/ui/EscalationBadge';
import { getCorrectiveActionsWithRelations } from '../services/dataService';
import { canViewAction, getVisibleMines } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ACTION_STATUS_OPTIONS, RISK_LEVEL_OPTIONS, buildMineFilterOptions } from '../data/constants';
import { formatDate } from '../utils/date';
import { getEscalationLevel } from '../workflows/correctiveActionWorkflow';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

// Step 4 quick filters layered on top of the existing status/risk/mine
// filters — Overdue and Escalated are computed states, not stored statuses,
// so they're handled as an extra client-side toggle rather than a fifth
// ACTION_STATUS_OPTIONS entry.
const QUICK_FILTERS = [
  { value: 'ALL', label: 'All' },
  { value: 'OVERDUE', label: 'Overdue' },
  { value: 'ESCALATED', label: 'Escalated' },
];

export default function CorrectiveActions() {
  const navigate = useNavigate();
  const { role } = useRole();
  const actions = useMemo(
    () =>
      getCorrectiveActionsWithRelations()
        .filter((a) => canViewAction(role, a))
        .map((a) => {
          const escalationLevel = getEscalationLevel(a);
          return { ...a, escalationLevel, escalated: escalationLevel > 0 };
        }),
    [role]
  );
  const mineOptions = useMemo(() => buildMineFilterOptions(getVisibleMines(role)), [role]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [mineFilter, setMineFilter] = useState('ALL');
  const [quickFilter, setQuickFilter] = useState('ALL');

  const filtered = actions.filter((action) => {
    const matchesSearch =
      !search ||
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || action.status === statusFilter;
    const matchesRisk = riskFilter === 'ALL' || action.priorityRisk === riskFilter;
    const matchesMine = mineFilter === 'ALL' || action.mineId === mineFilter;
    const matchesQuick =
      quickFilter === 'ALL' ||
      (quickFilter === 'OVERDUE' && action.overdue) ||
      (quickFilter === 'ESCALATED' && action.escalated);
    return matchesSearch && matchesStatus && matchesRisk && matchesMine && matchesQuick;
  });

  const overdueCount = actions.filter((a) => a.overdue).length;
  const escalatedCount = actions.filter((a) => a.escalated).length;

  const columns = [
    {
      key: 'title',
      label: 'Corrective Action',
      sortable: true,
      render: (a) => (
        <div>
          <div className="text-sm font-medium max-w-xs truncate flex items-center gap-2">
            {a.title}
            {a.escalated && <EscalationBadge level={a.escalationLevel} />}
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
      key: 'priorityRisk',
      label: 'Priority',
      sortable: true,
      sortValue: (a) => RISK_ORDER[a.priorityRisk] ?? 0,
      render: (a) => <RiskBadge level={a.priorityRisk} />,
    },
    {
      key: 'assignee',
      label: 'Assignee',
      sortable: true,
      render: (a) => (
        <div className="text-sm">
          {a.assignee}
          <div className="text-xs text-text-secondary">{a.assigneeRole}</div>
        </div>
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
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (a) => <StatusBadge status={a.status} overdue={a.overdue} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Corrective Actions"
        subtitle={`${actions.length} actions tracked${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}${
          escalatedCount > 0 ? ` · ${escalatedCount} escalated` : ''
        }`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search action or ID…" className="w-72" />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={ACTION_STATUS_OPTIONS} />
        <FilterSelect label="Priority" value={riskFilter} onChange={setRiskFilter} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect label="Mine" value={mineFilter} onChange={setMineFilter} options={mineOptions} />
        <FilterSelect label="Show" value={quickFilter} onChange={setQuickFilter} options={QUICK_FILTERS} />
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(a) => a.id}
          onRowClick={(a) => navigate(`/corrective-actions/${a.id}`)}
          emptyState={{
            icon: Wrench,
            title: 'No corrective actions match your filters',
            description: 'Try clearing the search or filter selections above.',
          }}
        />
      </div>

      <p className="text-xs text-text-muted mt-3">
        Click a row to open the full corrective action workflow. Mine Managers start work and
        submit evidence for verification; the Compliance Officer verifies &amp; closes or sends it
        back from the <span className="text-text-secondary">Verification &amp; Closure</span> queue.
        Overdue actions escalate automatically: Level 1 when overdue, Level 2 (Compliance Officer)
        after 3 days, Level 3 (Administrator) after 7.
      </p>
    </div>
  );
}
