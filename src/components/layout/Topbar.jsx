import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search, Bell, ChevronRight, LogOut } from 'lucide-react';
import { useRole } from '../../context/RoleContext';

function formatSegment(segment) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0) return <span className="text-text-secondary text-sm">Home</span>;

  return (
    <div className="flex items-center gap-1.5 text-sm text-text-secondary min-w-0">
      <span className="hover:text-text-primary">Home</span>
      {segments.map((seg, i) => (
        <React.Fragment key={i}>
          <ChevronRight size={14} className="shrink-0" />
          <span className={i === segments.length - 1 ? 'text-text-primary truncate' : 'truncate'}>
            {formatSegment(seg)}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

export default function Topbar() {
  const { roleDetails, logout } = useRole();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="border-b border-border bg-surface">
      <div className="h-14 px-4 flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <Breadcrumb />
        </div>

        <div className="hidden md:flex items-center gap-2 bg-bg border border-border rounded-input px-3 py-1.5 w-full max-w-sm text-sm text-text-secondary">
          <Search size={15} className="shrink-0" />
          <span className="truncate">Search mines, issues, inspections…</span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            className="relative p-2 rounded-btn text-text-secondary hover:text-text-primary hover:bg-elevated"
            aria-label="Notifications"
          >
            <Bell size={18} />
          </button>

          {roleDetails && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 pl-3 border-l border-border group"
              title="Switch role / persona"
            >
              <div className="text-right leading-tight hidden sm:block">
                <div className="text-sm font-medium">{roleDetails.demoUser.name}</div>
                <div className="text-xs text-text-secondary">{roleDetails.name}</div>
              </div>
              <LogOut size={16} className="text-text-secondary group-hover:text-amber" />
            </button>
          )}
        </div>
      </div>

      <div className="bg-amber/10 border-t border-amber/30 px-4 py-1 text-center">
        <span className="text-[11px] font-mono uppercase tracking-wider text-amber">
          Prototype / Demonstration Data
        </span>
      </div>
    </header>
  );
}
