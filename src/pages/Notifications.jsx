import React, { useState } from 'react';
import { Bell, AlertTriangle, Info, TriangleAlert } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { getNotificationsForRole, markAllReadForRole } from '../services/notificationService';
import { useRole } from '../context/RoleContext';

const TYPE_ICON = { info: Info, warning: TriangleAlert, critical: AlertTriangle };
const TYPE_COLOR = { info: '#F59E0B', warning: '#EA580C', critical: '#EF4444' };

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Notifications() {
  const { role } = useRole();
  const [notifications, setNotifications] = useState(() => getNotificationsForRole(role));
  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleMarkAllRead = () => {
    setNotifications(markAllReadForRole(role));
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${notifications.length} total${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}`}
        action={
          notifications.length > 0 &&
          unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="text-sm border border-border rounded-btn px-3 py-1.5 hover:bg-elevated"
            >
              Mark all as read
            </button>
          )
        }
      />

      <Card>
        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No notifications yet"
            description="Notifications addressed to your role appear here — new high-risk issues, corrective-action assignments, verification requests, and overdue escalations."
          />
        ) : (
          <div className="divide-y divide-elevated -m-4">
            {notifications.map((n) => {
              const Icon = TYPE_ICON[n.type] ?? Info;
              const color = TYPE_COLOR[n.type] ?? TYPE_COLOR.info;
              return (
                <div key={n.id} className={`flex items-start gap-3 px-4 py-3 ${!n.read ? 'bg-elevated/40' : ''}`}>
                  <div
                    className="w-8 h-8 rounded-btn flex items-center justify-center shrink-0 border"
                    style={{ borderColor: color, backgroundColor: `${color}1F` }}
                  >
                    <Icon size={15} style={{ color }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-amber shrink-0" />}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{n.description}</p>
                  </div>
                  <span className="text-[11px] font-mono text-text-muted shrink-0">
                    {formatTimestamp(n.timestamp)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
