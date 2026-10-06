import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import { getIssuesWithRelations } from '../services/dataService';
import { canViewIssue, getVisibleMines } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { RISK_LEVEL_OPTIONS, ISSUE_STATUS_OPTIONS, buildMineFilterOptions } from '../data/constants';
import { formatDate } from '../utils/date';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };

export default function Issues() {
  const navigate = useNavigate();
  const { role } = useRole();
  const issues = useMemo(() => getIssuesWithRelations().filter((i) => canViewIssue(role, i)), [role]);
  const mineOptions = useMemo(() => buildMineFilterOptions(getVisibleMines(role)), [role]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [mineFilter, setMineFilter] = useState('ALL');

  const filtered = issues.filter((issue) => {
    const matchesSearch =
      !search ||
      issue.title.toLowerCase().includes(search.toLowerCase()) ||
      issue.id.toLowerCase().includes(search.toLowerCase()) ||
      issue.category.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || issue.status === statusFilter;
    const matchesRisk = riskFilter === 'ALL' || issue.riskLevel === riskFilter;
    const matchesMine = mineFilter === 'ALL' || issue.mineId === mineFilter;
    return matchesSearch && matchesStatus && matchesRisk && matchesMine;
  });

  const columns = [
    {
      key: 'title',
      label: 'Issue',
      sortable: true,
      render: (i) => (
        <div>
          <div className="text-sm font-medium max-w-xs truncate">{i.title}</div>
          <div className="text-xs font-mono text-text-secondary">{i.id} · {i.category}</div>
        </div>
      ),
    },
    {
      key: 'mine',
      label: 'Mine',
      sortable: true,
      sortValue: (i) => i.mine?.name ?? '',
      render: (i) => <span className="text-sm">{i.mine?.name ?? '—'}</span>,
    },
    {
      key: 'riskLevel',
      label: 'Risk',
      sortable: true,
      sortValue: (i) => RISK_ORDER[i.riskLevel] ?? 0,
      render: (i) => <RiskBadge level={i.riskLevel} />,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (i) => <StatusBadge status={i.status} overdue={i.overdue} />,
    },
    {
      key: 'observedDate',
      label: 'Observed',
      align: 'right',
      sortable: true,
      mono: true,
      render: (i) => <span className="font-mono text-xs text-text-secondary">{formatDate(i.observedDate)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Issues & Violations"
        subtitle={
          role === ROLES.FIELD_OFFICER
            ? `${issues.length} issues you reported (read-only)`
            : role === ROLES.MINE_MANAGER
            ? `${issues.length} issues at your assigned mine(s)`
            : `${issues.length} issues across all monitored mines`
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search issue, ID, or category…" className="w-72" />
        <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={ISSUE_STATUS_OPTIONS} />
        <FilterSelect label="Risk" value={riskFilter} onChange={setRiskFilter} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect label="Mine" value={mineFilter} onChange={setMineFilter} options={mineOptions} />
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(i) => i.id}
          onRowClick={(i) => navigate(`/issues/${i.id}`)}
          emptyState={{
            icon: AlertTriangle,
            title: 'No issues match your filters',
            description: 'Try clearing the search or filter selections above.',
          }}
        />
      </div>
    </div>
  );
}
