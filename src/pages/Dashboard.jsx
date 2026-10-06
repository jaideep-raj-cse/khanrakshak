import React, { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Mountain,
  ClipboardList,
  AlertTriangle,
  ShieldAlert,
  Clock,
  ShieldCheck,
  Bell,
  Info,
  TriangleAlert,
  Inbox,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import KpiCard from '../components/ui/KpiCard';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import RiskBadge from '../components/ui/RiskBadge';
import { ChartCard } from '../components/analytics/AnalyticsUI';
import { LevelColumnChart, ComplianceTrendChart } from '../components/analytics/Charts';
import { useRole } from '../context/RoleContext';
import { useStorageVersion } from '../utils/useStorageVersion';
import { getDashboardData } from '../services/dashboardService';
import { ROLES } from '../data/roles';
import { formatDate } from '../utils/date';

const ROLE_TAGLINE = {
  [ROLES.FIELD_OFFICER]: 'Your assigned mines and the inspections you have raised.',
  [ROLES.MINE_MANAGER]: "Your mine's issues and the corrective actions awaiting your response.",
  [ROLES.COMPLIANCE_OFFICER]: 'Items pending verification and closure across regions.',
  [ROLES.ADMINISTRATOR]: 'System-wide view across mines, users, and contractors.',
};

const NOTIF_ICON = { info: Info, warning: TriangleAlert, critical: AlertTriangle };
const NOTIF_COLOR = { info: '#F59E0B', warning: '#EA580C', critical: '#EF4444' };

function formatTimestamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const NO_DATA = {
  title: 'No data for this view',
  description: 'Nothing in scope yet — the chart will fill in once there is activity to show.',
};
const NOT_ENOUGH_HISTORY = {
  title: 'Not enough history yet',
  description: 'A trend needs at least two dates. Check back once more time has passed, or see Analytics for the full history.',
};

export default function Dashboard() {
  const { role, roleDetails } = useRole();
  const navigate = useNavigate();
  // Recomputes whenever LocalStorage changes — in this tab (e.g. a corrective action actioned on
  // another page, then navigating back here) or another tab — so the Dashboard never shows a stale
  // snapshot without a manual refresh. See utils/useStorageVersion.js.
  const storageVersion = useStorageVersion();
  const data = useMemo(() => getDashboardData(role), [role, storageVersion]);
  const { kpis, riskDistribution, complianceTrend, recentAlerts, recentInspections, mineRiskOverview, highRiskMines } =
    data;

  const trendEmpty =
    complianceTrend.length < 2
      ? NOT_ENOUGH_HISTORY
      : complianceTrend.every((p) => p.openIssues === 0)
      ? NO_DATA
      : null;
  const latestCompliance = [...complianceTrend].reverse().find((p) => p.compliancePct !== null);

  const mineColumns = [
    {
      key: 'name',
      label: 'Mine',
      render: (m) => (
        <div>
          <div className="text-sm font-medium">{m.name}</div>
          <div className="text-xs font-mono text-text-secondary">{m.id} · {m.region}</div>
        </div>
      ),
    },
    { key: 'riskLevel', label: 'Risk', render: (m) => <RiskBadge level={m.riskLevel} /> },
    { key: 'riskScore', label: 'Score', align: 'right', mono: true, render: (m) => m.riskScore },
    { key: 'openIssues', label: 'Open Issues', align: 'right', mono: true },
    { key: 'compliancePct', label: 'Compliance %', align: 'right', mono: true, render: (m) => `${m.compliancePct}%` },
  ];

  return (
    <div>
      <PageHeader title={`Welcome, ${roleDetails?.demoUser.name ?? 'there'}`} subtitle={ROLE_TAGLINE[role]} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <KpiCard label="Total Mines" value={kpis.totalMines} icon={Mountain} accent="neutral" />
        <KpiCard
          label="Active Inspections"
          value={kpis.activeInspections}
          icon={ClipboardList}
          accent="neutral"
          hint="finding not yet closed"
        />
        <KpiCard
          label="Open Violations"
          value={kpis.openViolations}
          icon={AlertTriangle}
          accent={kpis.openViolations > 0 ? 'amber' : 'low'}
        />
        <KpiCard
          label="High / Critical Issues"
          value={kpis.highCriticalIssues}
          icon={ShieldAlert}
          accent={kpis.highCriticalIssues > 0 ? 'critical' : 'low'}
        />
        <KpiCard
          label="Overdue Corrective Actions"
          value={kpis.hasActionAccess ? kpis.overdueCorrectiveActions : '—'}
          icon={Clock}
          accent={kpis.hasActionAccess ? (kpis.overdueCorrectiveActions > 0 ? 'critical' : 'low') : 'neutral'}
          hint={kpis.hasActionAccess ? undefined : 'Not visible to your role'}
        />
        <KpiCard
          label="Overall Compliance %"
          value={`${kpis.overallCompliancePct}%`}
          icon={ShieldCheck}
          accent={kpis.overallCompliancePct >= 80 ? 'low' : kpis.overallCompliancePct >= 60 ? 'amber' : 'critical'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <ChartCard
          id="dashboard-risk-distribution"
          title="Risk Distribution"
          subtitle={`Open issues in your scope, as of ${formatDate(data.asOf)}`}
          empty={riskDistribution.total === 0 ? NO_DATA : null}
          ariaLabel={`Column chart of open issues by risk level: ${riskDistribution.levels
            .map((l) => `${l.label} ${l.count}`)
            .join(', ')}`}
          table={{
            columns: [
              { key: 'level', label: 'Risk level' },
              { key: 'count', label: 'Issues' },
              { key: 'share', label: 'Share' },
            ],
            rows: riskDistribution.levels.map((l) => ({ level: l.label, count: l.count, share: `${l.pct}%` })),
          }}
        >
          <LevelColumnChart levels={riskDistribution.levels} unit="Issues" yLabel="Open issues" />
        </ChartCard>

        <ChartCard
          id="dashboard-compliance-trend"
          title="Compliance Trend"
          subtitle={`Last ${complianceTrend.length > 1 ? Math.max(1, Math.round((new Date(complianceTrend.at(-1).date) - new Date(complianceTrend[0].date)) / 86400000)) : 0} days, reconstructed from dated records${
            latestCompliance ? ` · latest ${latestCompliance.compliancePct}%` : ''
          }`}
          empty={trendEmpty}
          ariaLabel={`Line chart of compliance percentage over time, latest ${latestCompliance?.compliancePct ?? 'no data'} percent`}
          table={{
            columns: [
              { key: 'date', label: 'Date' },
              { key: 'compliance', label: 'Compliance %' },
              { key: 'open', label: 'Open issues' },
            ],
            rows: complianceTrend.map((p) => ({
              date: p.date,
              compliance: p.compliancePct === null ? '—' : `${p.compliancePct}%`,
              open: p.openIssues,
            })),
          }}
        >
          <ComplianceTrendChart points={complianceTrend} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card
          title="Recent Alerts"
          action={
            <Link to="/notifications" className="text-xs text-amber hover:underline">
              View all
            </Link>
          }
        >
          {recentAlerts.length === 0 ? (
            <EmptyState icon={Bell} title="No alerts yet" description="Alerts addressed to your role will appear here." />
          ) : (
            <div className="divide-y divide-elevated -m-4">
              {recentAlerts.map((n) => {
                const Icon = NOTIF_ICON[n.type] ?? Info;
                const color = NOTIF_COLOR[n.type] ?? NOTIF_COLOR.info;
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3">
                    <div
                      className="w-7 h-7 rounded-btn flex items-center justify-center shrink-0 border"
                      style={{ borderColor: color, backgroundColor: `${color}1F` }}
                    >
                      <Icon size={13} style={{ color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{n.title}</div>
                      <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">{n.description}</p>
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

        <Card
          title="Recent Inspections"
          action={
            <Link to="/inspections" className="text-xs text-amber hover:underline">
              View all
            </Link>
          }
        >
          {recentInspections.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No inspections yet"
              description="Submitted inspections will appear here."
            />
          ) : (
            <div className="divide-y divide-elevated -m-4">
              {recentInspections.map((i) => (
                <button
                  key={i.id}
                  onClick={() => i.issue && navigate(`/issues/${i.issue.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-elevated"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{i.category}</div>
                    <div className="text-xs text-text-secondary font-mono truncate">
                      {i.mine?.name ?? i.mineId} · {i.inspectionType}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-secondary font-mono">{formatDate(i.date)}</span>
                    {i.issue && i.issue.status !== 'CLOSED' ? (
                      <span className="text-[11px] font-mono uppercase tracking-wide text-amber">Active</span>
                    ) : (
                      <span className="text-[11px] font-mono uppercase tracking-wide text-risk-low">Closed</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mb-4">
        <Card title="Mine Risk Overview">
          {mineRiskOverview.length === 0 ? (
            <EmptyState
              icon={Mountain}
              title="No mines in your scope"
              description="No mine is currently assigned to your role."
            />
          ) : (
            <div className="-m-4">
              <DataTable
                columns={mineColumns}
                rows={mineRiskOverview}
                getRowKey={(m) => m.id}
                onRowClick={(m) => navigate(`/mines/${m.id}`)}
                emptyState={{ icon: Mountain, title: 'No mines in your scope' }}
              />
            </div>
          )}
        </Card>
      </div>

      <div>
        <Card title="High-Risk Mines">
          {highRiskMines.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="No mines at High or Critical risk"
              description="Every mine in your scope is currently rated Low or Medium risk."
            />
          ) : (
            <div className="divide-y divide-border -m-4">
              {highRiskMines.map((mine) => (
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
          )}
        </Card>
      </div>
    </div>
  );
}
