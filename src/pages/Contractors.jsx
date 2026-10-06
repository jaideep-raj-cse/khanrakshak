import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardHat } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import RiskBadge from '../components/ui/RiskBadge';
import StatusBadge from '../components/ui/StatusBadge';
import { getContractorRows, filterContractors } from '../services/contractorService';
import { getVisibleMines } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import {
  RISK_LEVEL_OPTIONS,
  MINE_COMPLIANCE_OPTIONS,
  CONTRACT_STATUS_OPTIONS,
  buildMineFilterOptions,
} from '../data/constants';

const RISK_ORDER = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
const NO_FILTERS = { search: '', mineId: 'ALL', riskLevel: 'ALL', complianceStatus: 'ALL', contractStatus: 'ALL' };

function subtitleFor(role, count) {
  const noun = `contractor${count === 1 ? '' : 's'}`;
  if (role === ROLES.FIELD_OFFICER) return `${count} ${noun} at your assigned mines (read-only)`;
  if (role === ROLES.MINE_MANAGER) return `${count} ${noun} at your assigned mine(s)`;
  if (role === ROLES.COMPLIANCE_OFFICER) return `${count} ${noun} across all mines (read-only)`;
  return `${count} ${noun} across all mines`;
}

export default function Contractors() {
  const navigate = useNavigate();
  const { role } = useRole();
  const rows = useMemo(() => getContractorRows(role), [role]);
  const mineOptions = useMemo(() => buildMineFilterOptions(getVisibleMines(role)), [role]);

  const [filters, setFilters] = useState(NO_FILTERS);
  const set = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(() => filterContractors(rows, filters), [rows, filters]);
  const hasActiveFilters = Object.keys(NO_FILTERS).some((k) => filters[k] !== NO_FILTERS[k]);

  const columns = [
    {
      key: 'name',
      label: 'Contractor Name',
      sortable: true,
      sortValue: (c) => c.name.toLowerCase(),
      render: (c) => (
        <div>
          <div className="text-sm font-medium">{c.name}</div>
          <div className="text-xs font-mono text-text-secondary">{c.id}</div>
        </div>
      ),
    },
    {
      key: 'mineNames',
      label: 'Mine(s)',
      sortable: true,
      sortValue: (c) => c.mineNames.toLowerCase(),
      render: (c) => <span className="text-sm">{c.mineNames || '—'}</span>,
    },
    {
      key: 'workArea',
      label: 'Work Area',
      sortable: true,
      sortValue: (c) => c.workArea.toLowerCase(),
      render: (c) => <span className="text-sm">{c.workArea}</span>,
    },
    {
      key: 'complianceStatus',
      label: 'Compliance Status',
      sortable: true,
      render: (c) => <StatusBadge status={c.complianceStatus} />,
    },
    {
      key: 'openViolations',
      label: 'Open Violations',
      align: 'right',
      sortable: true,
      render: (c) => (
        <span className={`font-mono ${c.openViolations > 0 ? 'text-amber' : 'text-text-secondary'}`}>
          {c.openViolations}
        </span>
      ),
    },
    {
      key: 'safetyIncidents',
      label: 'Safety Incidents',
      align: 'right',
      sortable: true,
      render: (c) => (
        <span className={`font-mono ${c.safetyIncidents > 0 ? 'text-risk-high' : 'text-text-secondary'}`}>
          {c.safetyIncidents}
        </span>
      ),
    },
    {
      key: 'riskLevel',
      label: 'Risk Level',
      sortable: true,
      sortValue: (c) => RISK_ORDER[c.riskLevel] ?? 0,
      render: (c) => <RiskBadge level={c.riskLevel} />,
    },
    {
      key: 'contractStatus',
      label: 'Contract Status',
      sortable: true,
      render: (c) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={c.contractStatus} />
          {/* A contract can be Active while the licence has lapsed — surface it. */}
          {c.licence.needsAttention && (
            <span
              className={`text-[11px] ${c.licence.status === 'LAPSED' ? 'text-risk-critical' : 'text-risk-moderate'}`}
            >
              {c.licence.short}
            </span>
          )}
        </div>
      ),
    },
  ];

  const emptyState =
    rows.length === 0
      ? {
          icon: HardHat,
          title: 'No contractors in your scope',
          description: 'There are no contractors registered at the mines you can access.',
        }
      : {
          icon: HardHat,
          title: 'No contractors match your filters',
          description: 'Try clearing the search or filter selections above.',
        };

  return (
    <div>
      <PageHeader title="Contractors" subtitle={subtitleFor(role, rows.length)} />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar
          value={filters.search}
          onChange={set('search')}
          placeholder="Search contractor, mine, or work area…"
          className="w-72"
        />
        <FilterSelect label="Mine" value={filters.mineId} onChange={set('mineId')} options={mineOptions} />
        <FilterSelect label="Risk" value={filters.riskLevel} onChange={set('riskLevel')} options={RISK_LEVEL_OPTIONS} />
        <FilterSelect
          label="Compliance"
          value={filters.complianceStatus}
          onChange={set('complianceStatus')}
          options={MINE_COMPLIANCE_OPTIONS}
        />
        <FilterSelect
          label="Contract"
          value={filters.contractStatus}
          onChange={set('contractStatus')}
          options={CONTRACT_STATUS_OPTIONS}
        />
        {hasActiveFilters && (
          <button
            onClick={() => setFilters(NO_FILTERS)}
            className="h-9 px-3 rounded-btn text-sm text-text-secondary hover:text-text-primary hover:bg-elevated"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={filtered}
          getRowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/contractors/${c.id}`)}
          emptyState={emptyState}
        />
      </div>
    </div>
  );
}
