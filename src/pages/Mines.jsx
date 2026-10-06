import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mountain } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import { getMinesWithStats } from '../services/dataService';
import { canViewMine } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { RISK_LEVEL_OPTIONS, MINE_COMPLIANCE_OPTIONS } from '../data/constants';
import { formatDate } from '../utils/date';

export default function Mines() {
  const navigate = useNavigate();
  const { role } = useRole();
  const mines = useMemo(() => getMinesWithStats().filter((m) => canViewMine(role, m.id)), [role]);

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [complianceFilter, setComplianceFilter] = useState('ALL');

  const filtered = mines.filter((mine) => {
    const matchesSearch =
      !search ||
      mine.name.toLowerCase().includes(search.toLowerCase()) ||
      mine.id.toLowerCase().includes(search.toLowerCase()) ||
      mine.region.toLowerCase().includes(search.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || mine.riskLevel === riskFilter;
    const matchesCompliance = complianceFilter === 'ALL' || mine.complianceStatus === complianceFilter;
    return matchesSearch && matchesRisk && matchesCompliance;
  });

  const columns = [
    {
      key: 'name',
      label: 'Mine',
      sortable: true,
      render: (m) => (
        <div>
          <div className="text-sm font-medium">{m.name}</div>
          <div className="text-xs font-mono text-text-secondary">{m.id}</div>
        </div>
      ),
    },
    { key: 'region', label: 'Location', sortable: true },
    {
      key: 'complianceStatus',
      label: 'Compliance',
      sortable: true,
      render: (m) => <StatusBadge status={m.complianceStatus} />,
    },
    {
      key: 'riskLevel',
      label: 'Risk Level',
      sortable: true,
      sortValue: (m) => ({ LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 }[m.riskLevel] ?? 0),
      render: (m) => <RiskBadge level={m.riskLevel} />,
    },
    {
      key: 'openIssues',
      label: 'Open Issues',
      align: 'right',
      sortable: true,
      mono: true,
      render: (m) => <span className="font-mono">{m.openIssues}</span>,
    },
    {
      key: 'pendingActions',
      label: 'Pending Actions',
      align: 'right',
      sortable: true,
      mono: true,
      render: (m) => (
        <span className="font-mono">
          {m.pendingActions}
          {m.overdueActions > 0 && (
            <span className="text-risk-critical ml-1">({m.overdueActions} overdue)</span>
          )}
        </span>
      ),
    },
    {
      key: 'lastInspection',
      label: 'Last Inspection',
      align: 'right',
      sortable: true,
      mono: true,
      render: (m) => <span className="font-mono text-xs text-text-secondary">{formatDate(m.lastInspection)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Mines"
        subtitle={
          role === ROLES.COMPLIANCE_OFFICER || role === ROLES.ADMINISTRATOR
            ? `${mines.length} mines under active monitoring`
            : `${mines.length} assigned mine${mines.length === 1 ? '' : 's'}`
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar value={search} onChange={setSearch} placeholder="Search mine, ID, or region…" className="w-72" />
        <FilterSelect label="Risk" value={riskFilter} onChange={setRiskFilter} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect
          label="Compliance"
          value={complianceFilter}
          onChange={setComplianceFilter}
          options={MINE_COMPLIANCE_OPTIONS}
        />
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(m) => m.id}
          onRowClick={(m) => navigate(`/mines/${m.id}`)}
          emptyState={{
            icon: Mountain,
            title: 'No mines match your filters',
            description: 'Try clearing the search or filter selections above.',
          }}
        />
      </div>
    </div>
  );
}
