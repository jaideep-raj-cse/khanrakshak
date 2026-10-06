import React, { useMemo } from 'react';
import { UserCircle, LogOut, ShieldQuestion } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import { useRole } from '../context/RoleContext';
import { ROLE_DETAILS } from '../data/roles';
import { getAssignedMineIds } from '../services/accessService';
import { getMineById } from '../services/dataService';

// A read-only Profile/Settings surface. There is no account configuration to manage in this
// prototype (no password, email, or notification preferences are stored) — this page exists so
// "who am I / what can I see" has a real destination instead of a dead link, and so switching
// persona is discoverable from somewhere other than the topbar logout icon.
export default function Profile() {
  const { role, roleDetails, logout } = useRole();
  const navigate = useNavigate();

  const scopeLabel = useMemo(() => {
    const ids = getAssignedMineIds(role);
    if (ids === null) return { kind: 'global', mines: [] };
    const mines = ids.map((id) => getMineById(id)).filter(Boolean);
    return { kind: 'scoped', mines };
  }, [role]);

  const handleSwitch = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Profile & Settings" subtitle="Your current demo persona and what it can see." />

      <Card title="Your Persona">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-btn bg-elevated border border-border flex items-center justify-center shrink-0">
            <UserCircle size={22} className="text-text-secondary" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{roleDetails?.demoUser.name}</div>
            <div className="text-xs text-text-secondary">{roleDetails?.demoUser.title}</div>
            <div className="text-xs text-text-muted mt-1">{ROLE_DETAILS[role]?.description}</div>
          </div>
        </div>
        <button
          onClick={handleSwitch}
          className="mt-4 flex items-center gap-1.5 text-sm border border-border rounded-btn px-3 py-2 hover:bg-elevated"
        >
          <LogOut size={14} /> Switch persona
        </button>
      </Card>

      <Card title="Access Scope" className="mt-4">
        {scopeLabel.kind === 'global' ? (
          <p className="text-sm text-text-secondary">All mines, system-wide (Compliance Officer / Administrator scope).</p>
        ) : scopeLabel.mines.length > 0 ? (
          <ul className="space-y-1.5">
            {scopeLabel.mines.map((m) => (
              <li key={m.id} className="text-sm flex items-center justify-between">
                <span>{m.name}</span>
                <span className="text-xs font-mono text-text-secondary">{m.id} · {m.region}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">No mine is currently assigned to this persona.</p>
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2 text-xs text-text-muted">
        <ShieldQuestion size={14} className="shrink-0 mt-0.5" />
        <p>
          Persona switching is a prototype convenience for demonstrating role-based views — it is
          not real authentication, and there are no account settings (password, email, notification
          preferences) to configure in this demo.
        </p>
      </div>
    </div>
  );
}
