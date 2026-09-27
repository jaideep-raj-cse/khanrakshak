import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import { getCorrectiveActionsWithRelations, getMines } from '../services/dataService';
import { ACTION_STATUS_OPTIONS, RISK_LEVEL_OPTIONS, buildMineFilterOptions } from '../data/constants';
import { formatDate } from '../utils/date';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

export default function CorrectiveActions() {
  const navigate = useNavigate();
  const actions = useMemo(() => getCorrectiveActionsWithRelations(), []);
  const mineOptions = useMemo(() => buildMineFilterOptions(getMines()), []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [mineFilter, setMineFilter] = useState('ALL');

  const filtered = actions.filter((action) => {
    const matchesSearch =
      !search ||
      action.title.toLowerCase().includes(search.toLowerCase()) ||
      action.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || action.status === statusFilter;
    const matchesRisk = riskFilter === 'ALL' || action.priorityRisk === riskFilter;
    const matchesMine = mineFilter === 'ALL' || action.mineId === mineFilter;
    return matchesSearch && matchesStatus && matchesRisk && matchesMine;
  });

  const overdueCount = actions.filter((a) => a.overdue).length;

  const columns = [
    {
      key: 'title',
      label: 'Corrective Action',
      sortable: true,
      render: (a) => (
        <div>
          <div className="text-sm font-medium max-w-xs truncate">{a.title}</div>
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
        subtitle={`${actions.length} actions tracked${overdueCount > 0 ? ` · ${overdueCount} overdue` : ''}`}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search action or ID…" className="w-72" />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={ACTION_STATUS_OPTIONS} />
        <FilterSelect label="Priority" value={riskFilter} onChange={setRiskFilter} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect label="Mine" value={mineFilter} onChange={setMineFilter} options={mineOptions} />
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(a) => a.id}
          onRowClick={(a) => navigate(`/issues/${a.issueId}`)}
          emptyState={{
            icon: Wrench,
            title: 'No corrective actions match your filters',
            description: 'Try clearing the search or filter selections above.',
          }}
        />
      </div>

      <p className="text-xs text-text-muted mt-3">
        Verification and closure actions (approve/reject) are implemented in Step 4. Clicking a
        row opens the related issue, where the full corrective action detail is shown.
      </p>
    </div>
  );
}
