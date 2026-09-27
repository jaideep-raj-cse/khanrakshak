import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mountain, AlertTriangle, ShieldAlert, Wrench } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import KpiCard from '../components/ui/KpiCard';
import Card from '../components/ui/Card';
import RiskBadge from '../components/ui/RiskBadge';
import { useRole } from '../context/RoleContext';
import { getMinesWithStats } from '../services/dataService';
import { ROLES } from '../data/roles';

const ROLE_TAGLINE = {
  [ROLES.FIELD_OFFICER]: 'Your assigned mines and open field tasks.',
  [ROLES.MINE_MANAGER]: 'Site issues and corrective actions awaiting your response.',
  [ROLES.COMPLIANCE_OFFICER]: 'Items pending verification and closure across regions.',
  [ROLES.ADMINISTRATOR]: 'System-wide view across mines, users, and contractors.',
};

export default function Dashboard() {
  const { role, roleDetails } = useRole();
  const navigate = useNavigate();
  const mines = useMemo(() => getMinesWithStats(), []);

  const highRiskCount = mines.filter((m) => m.riskLevel === 'HIGH' || m.riskLevel === 'CRITICAL').length;
  const openIssuesTotal = mines.reduce((sum, m) => sum + m.openIssues, 0);
  const pendingActionsTotal = mines.reduce((sum, m) => sum + m.pendingActions, 0);

  return (
    <div>
      <PageHeader
        title={`Welcome, ${roleDetails?.demoUser.name ?? 'there'}`}
        subtitle={ROLE_TAGLINE[role]}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Total Mines" value={mines.length} icon={Mountain} accent="neutral" />
        <KpiCard label="Open Issues" value={openIssuesTotal} icon={AlertTriangle} accent="amber" />
        <KpiCard
          label="High / Critical Risk"
          value={highRiskCount}
          icon={ShieldAlert}
          accent={highRiskCount > 0 ? 'critical' : 'low'}
        />
        <KpiCard
          label="Pending Corrective Actions"
          value={pendingActionsTotal}
          icon={Wrench}
          accent={pendingActionsTotal > 0 ? 'amber' : 'low'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="High-Risk Mines" className="lg:col-span-2">
          <div className="divide-y divide-border -m-4">
            {mines
              .slice()
              .sort((a, b) => b.openIssues - a.openIssues)
              .map((mine) => (
                <button
                  key={mine.id}
                  onClick={() => navigate(`/mines/${mine.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{mine.name}</div>
                    <div className="text-xs text-text-secondary font-mono">{mine.id} · {mine.region}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-secondary">{mine.openIssues} open</span>
                    <RiskBadge level={mine.riskLevel} />
                  </div>
                </button>
              ))}
          </div>
        </Card>

        <Card title="Risk Distribution">
          <div className="space-y-2">
            {['CRITICAL', 'HIGH', 'MODERATE', 'LOW'].map((level) => {
              const count = mines.filter((m) => m.riskLevel === level).length;
              return (
                <div key={level} className="flex items-center justify-between text-sm">
                  <RiskBadge level={level} />
                  <span className="font-mono text-text-secondary">{count}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-4 pt-3 border-t border-border">
            Chart visualizations (donut, trend, comparison) land in a later build step, once
            the inspection → risk pipeline is producing real time-series data.
          </p>
        </Card>
      </div>
    </div>
  );
}
