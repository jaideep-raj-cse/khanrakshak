import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, Wrench, ShieldCheck, Settings } from 'lucide-react';
import { ROLE_LIST } from '../data/roles';
import { useRole } from '../context/RoleContext';

const ROLE_ICONS = {
  FIELD_OFFICER: ClipboardCheck,
  MINE_MANAGER: Wrench,
  COMPLIANCE_OFFICER: ShieldCheck,
  ADMINISTRATOR: Settings,
};

export default function Login() {
  const { setRole } = useRole();
  const navigate = useNavigate();

  const handleSelect = (roleId) => {
    setRole(roleId);
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-12 h-12 rounded-card bg-amber flex items-center justify-center text-surface font-bold text-lg mb-4">
            KR
          </div>
          <h1 className="text-2xl font-semibold">KhanRakshak</h1>
          <p className="text-sm text-text-secondary mt-1 max-w-md">
            AI-assisted smart governance and compliance monitoring for coal mines.
          </p>
          <span className="mt-3 text-[11px] font-mono uppercase tracking-wider text-amber border border-amber/40 bg-amber/10 px-2 py-1 rounded-btn">
            Prototype / Demonstration Data
          </span>
        </div>

        <p className="text-xs text-text-secondary uppercase tracking-wide mb-3 text-center">
          Select a persona to continue
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ROLE_LIST.map((role) => {
            const Icon = ROLE_ICONS[role.id];
            return (
              <button
                key={role.id}
                onClick={() => handleSelect(role.id)}
                className="text-left bg-surface border border-border rounded-card p-5 hover:border-amber transition-colors group"
              >
                <div className="w-9 h-9 rounded-btn bg-elevated flex items-center justify-center mb-3 group-hover:text-amber">
                  <Icon size={18} />
                </div>
                <div className="font-semibold mb-1">{role.name}</div>
                <div className="text-sm text-text-secondary">{role.description}</div>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-text-muted text-center mt-8">
          Role selection is a demo mechanism for this prototype and does not represent real authentication.
        </p>
      </div>
    </div>
  );
}
