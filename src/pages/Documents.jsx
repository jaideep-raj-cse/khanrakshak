import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Upload } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import SearchBar from '../components/ui/SearchBar';
import FilterSelect from '../components/ui/FilterSelect';
import DataTable from '../components/ui/DataTable';
import StatusBadge from '../components/ui/StatusBadge';
import { MockExtractionBanner } from '../components/documents/DocumentPanels';
import { getDocumentRows, filterDocuments } from '../services/documentService';
import { getVisibleMines } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES, can } from '../data/roles';
import {
  DOCUMENT_TYPE_FILTER_OPTIONS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_VALIDITY_OPTIONS,
  buildMineFilterOptions,
} from '../data/constants';
import { formatDate } from '../utils/date';

const NO_FILTERS = { search: '', mineId: 'ALL', documentType: 'ALL', status: 'ALL', validity: 'ALL' };
// Most urgent validity first when sorted ascending.
const VALIDITY_ORDER = { EXPIRED: 0, EXPIRING_SOON: 1, UNKNOWN: 2, CURRENT: 3, NO_EXPIRY: 4 };

function subtitleFor(role, rows) {
  const noun = `document${rows.length === 1 ? '' : 's'}`;
  const flagged = rows.filter((r) => r.status === 'FLAGGED').length;
  const tail = flagged > 0 ? ` · ${flagged} flagged` : '';
  if (role === ROLES.FIELD_OFFICER) return `${rows.length} ${noun} at your assigned mines${tail}`;
  if (role === ROLES.MINE_MANAGER) return `${rows.length} ${noun} at your assigned mine(s)${tail}`;
  return `${rows.length} ${noun} across all mines${tail}`;
}

export default function Documents() {
  const navigate = useNavigate();
  const location = useLocation();
  const { role } = useRole();
  const rows = useMemo(() => getDocumentRows(role), [role]);
  const mineOptions = useMemo(() => buildMineFilterOptions(getVisibleMines(role)), [role]);
  const notice = location.state?.notice;

  const [filters, setFilters] = useState(NO_FILTERS);
  const set = (key) => (value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const filtered = useMemo(() => filterDocuments(rows, filters), [rows, filters]);
  const hasActiveFilters = Object.keys(NO_FILTERS).some((k) => filters[k] !== NO_FILTERS[k]);

  const columns = [
    {
      key: 'fileName',
      label: 'File Name',
      sortable: true,
      sortValue: (d) => d.fileName.toLowerCase(),
      render: (d) => (
        <div>
          <Link
            to={`/documents/${d.id}`}
            onClick={(e) => e.stopPropagation()}
            className="text-sm font-medium block max-w-xs truncate hover:text-amber"
          >
            {d.fileName}
          </Link>
          <div className="text-xs font-mono text-text-secondary">{d.id}</div>
        </div>
      ),
    },
    {
      key: 'typeLabel',
      label: 'Type',
      sortable: true,
      sortValue: (d) => d.typeLabel.toLowerCase(),
      render: (d) => <span className="text-sm">{d.typeLabel}</span>,
    },
    {
      key: 'mineName',
      label: 'Mine',
      sortable: true,
      sortValue: (d) => d.mineName.toLowerCase(),
      render: (d) => <span className="text-sm">{d.mineName}</span>,
    },
    {
      key: 'uploadedDate',
      label: 'Upload Date',
      sortable: true,
      render: (d) => <span className="font-mono text-xs text-text-secondary">{formatDate(d.uploadedDate)}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (d) => d.topSeverityRank,
      render: (d) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={d.status} />
          {d.flagCount > 0 && (
            <span className="text-[11px] text-text-secondary">
              {d.flagCount} potential issue{d.flagCount === 1 ? '' : 's'}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'validityStatus',
      label: 'Validity',
      sortable: true,
      sortValue: (d) => VALIDITY_ORDER[d.validityStatus] ?? 9,
      render: (d) => <StatusBadge status={d.validityStatus} />,
    },
  ];

  const emptyState =
    rows.length === 0
      ? {
          icon: FileText,
          title: 'No documents in your scope',
          description: 'No documents have been uploaded for the mines you can access yet.',
        }
      : {
          icon: FileText,
          title: 'No documents match your filters',
          description: 'Try clearing the search or filter selections above.',
        };

  return (
    <div>
      <PageHeader
        title="Documents"
        subtitle={subtitleFor(role, rows)}
        action={
          can('documents.upload', role) && (
            <Link
              to="/documents/upload"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-btn text-sm bg-amber text-surface font-medium hover:bg-amber-base"
            >
              <Upload size={15} aria-hidden="true" /> Upload document
            </Link>
          )
        }
      />

      <MockExtractionBanner />

      {notice && (
        <p className="text-xs text-risk-low mb-3" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <SearchBar
          value={filters.search}
          onChange={set('search')}
          placeholder="Search file, mine, type, or number…"
          className="w-72"
        />
        <FilterSelect label="Mine" value={filters.mineId} onChange={set('mineId')} options={mineOptions} />
        <FilterSelect label="Type" value={filters.documentType} onChange={set('documentType')} options={DOCUMENT_TYPE_FILTER_OPTIONS} />
        <FilterSelect label="Status" value={filters.status} onChange={set('status')} options={DOCUMENT_STATUS_OPTIONS} />
        <FilterSelect label="Validity" value={filters.validity} onChange={set('validity')} options={DOCUMENT_VALIDITY_OPTIONS} />
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
          getRowKey={(d) => d.id}
          onRowClick={(d) => navigate(`/documents/${d.id}`)}
          emptyState={emptyState}
        />
      </div>
    </div>
  );
}
