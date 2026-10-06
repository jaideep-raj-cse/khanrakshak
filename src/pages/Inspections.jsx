import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { getInspections, getMineById, getIssueByInspectionId } from '../services/dataService';
import { canViewInspection } from '../services/accessService';
import { formatDate } from '../utils/date';

export default function Inspections() {
  const { role } = useRole();
  const navigate = useNavigate();

  const inspections = useMemo(() => {
    return getInspections()
      .filter((inspection) => canViewInspection(role, inspection))
      .map((inspection) => ({
        ...inspection,
        mine: getMineById(inspection.mineId),
        issue: getIssueByInspectionId(inspection.id),
      }));
  }, [role]);

  const columns = [
    {
      key: 'id',
      label: 'Inspection',
      render: (i) => (
        <div>
          <div className="text-sm font-medium">{i.category}</div>
          <div className="text-xs font-mono text-text-secondary">{i.id}</div>
        </div>
      ),
    },
    { key: 'mine', label: 'Mine', render: (i) => i.mine?.name ?? '—' },
    { key: 'inspectionType', label: 'Type' },
    { key: 'inspector', label: 'Inspector' },
    {
      key: 'date',
      label: 'Date',
      align: 'right',
      render: (i) => <span className="font-mono text-xs text-text-secondary">{formatDate(i.date)}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inspections"
        subtitle={`${inspections.length} inspection${inspections.length === 1 ? '' : 's'} ${
          role === ROLES.FIELD_OFFICER ? 'submitted by you' : 'submitted'
        }`}
        action={
          role === ROLES.FIELD_OFFICER && (
            <button
              onClick={() => navigate('/inspections/new')}
              className="flex items-center gap-1.5 bg-amber text-surface font-semibold text-sm px-4 py-2 rounded-btn hover:opacity-90"
            >
              <Plus size={15} /> New Inspection
            </button>
          )
        }
      />

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={inspections}
          getRowKey={(i) => i.id}
          onRowClick={(i) => i.issue && navigate(`/issues/${i.issue.id}`)}
          emptyState={{
            icon: ClipboardList,
            title: 'No inspections submitted yet',
            description:
              role === ROLES.FIELD_OFFICER
                ? 'Start a new inspection to see it — and the issue and risk assessment it generates — appear here.'
                : 'Field Officers submit inspections from the field. Submitted inspections and the issues they generate will appear here.',
          }}
        />
      </div>
    </div>
  );
}
