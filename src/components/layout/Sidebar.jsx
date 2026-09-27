import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Mountain,
  ClipboardList,
  AlertTriangle,
  Wrench,
  ShieldCheck,
  HardHat,
  FileText,
  Map,
  BarChart3,
  History,
  Bell,
  Settings,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { useRole } from '../../context/RoleContext';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Command Center', to: '/dashboard', icon: LayoutDashboard },
  { id: 'mines', label: 'Mines', to: '/mines', icon: Mountain },
  { id: 'inspections', label: 'Inspections', to: '/inspections', icon: ClipboardList },
  { id: 'issues', label: 'Issues & Violations', to: '/issues', icon: AlertTriangle },
  { id: 'correctiveActions', label: 'Corrective Actions', to: '/corrective-actions', icon: Wrench },
  { id: 'verification', label: 'Verification & Closure', to: '/verification', icon: ShieldCheck },
  { id: 'contractors', label: 'Contractors', to: '/contractors', icon: HardHat },
  { id: 'documents', label: 'Documents / OCR', to: '/documents', icon: FileText },
  { id: 'riskMap', label: 'Risk Map', to: '/risk-map', icon: Map },
  { id: 'analytics', label: 'Analytics', to: '/analytics', icon: BarChart3 },
  { id: 'auditTrail', label: 'Audit Trail', to: '/audit-trail', icon: History },
  { id: 'notifications', label: 'Notifications', to: '/notifications', icon: Bell },
  { id: 'admin', label: 'Admin', to: '/admin/users', icon: Settings },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { canAccess } = useRole();

  return (
    <aside
      className={`h-full shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-150 ${
        collapsed ? 'w-[64px]' : 'w-[248px]'
      }`}
    >
      <div className="h-14 flex items-center justify-between px-3 border-b border-border">
        {!collapsed && (
          <Link
            to="/dashboard"
            className="flex items-center gap-2 min-w-0"
            title="Go to Dashboard"
            aria-label="Go to Dashboard"
          >
            <div className="w-7 h-7 rounded-btn bg-amber flex items-center justify-center text-surface font-bold text-sm shrink-0">
              KR
            </div>
            <span className="font-semibold text-sm truncate">KhanRakshak</span>
          </Link>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-btn text-text-secondary hover:text-text-primary hover:bg-elevated shrink-0"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {NAV_ITEMS.filter((item) => canAccess(item.id)).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-2.5 py-2 rounded-btn text-sm transition-colors ${
                  isActive
                    ? 'bg-elevated text-amber border-l-2 border-amber -ml-0.5 pl-[9px]'
                    : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <Icon size={18} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
