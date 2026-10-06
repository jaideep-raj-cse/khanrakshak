import React, { useMemo } from 'react';
import { History } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import DataTable from '../components/ui/DataTable';
import { getAuditLog } from '../services/auditService';
import { canViewAuditEvent } from '../services/accessService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AuditTrail() {
  const { role } = useRole();
  const events = useMemo(() => getAuditLog().filter((e) => canViewAuditEvent(role, e)), [role]);
  const scopeNote =
    role === ROLES.FIELD_OFFICER
      ? ' · showing your own activity'
      : role === ROLES.MINE_MANAGER
      ? ' · showing your assigned mine(s)'
      : '';

  const columns = [
    {
      key: 'timestamp',
      label: 'Timestamp',
      mono: true,
      render: (e) => <span className="font-mono text-xs text-text-secondary">{formatTimestamp(e.timestamp)}</span>,
    },
    { key: 'action', label: 'Action' },
    {
      key: 'entity',
      label: 'Entity',
      mono: true,
      render: (e) => (
        <span className="font-mono text-xs">
          {e.entity} · {e.entityId}
        </span>
      ),
    },
    {
      key: 'actor',
      label: 'Actor',
      render: (e) => (
        <div>
          <div className="text-sm">{e.actor}</div>
          <div className="text-xs text-text-secondary">{e.role}</div>
        </div>
      ),
    },
    { key: 'description', label: 'Description' },
  ];

  return (
    <div>
      <PageHeader
        title="Audit Trail"
        subtitle={`${events.length} event${events.length === 1 ? '' : 's'} recorded this session${scopeNote}`}
      />

      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <DataTable
          columns={columns}
          rows={events}
          getRowKey={(e) => e.id}
          emptyState={{
            icon: History,
            title: 'No audit events yet',
            description:
              'Every inspection, issue, risk calculation, and corrective action creates an audit event here as it happens.',
          }}
        />
      </div>
    </div>
  );
}
