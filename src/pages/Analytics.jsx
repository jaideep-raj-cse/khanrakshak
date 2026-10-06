import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Gauge, ShieldAlert, Clock } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import KpiCard from '../components/ui/KpiCard';
import { AnalyticsTabs, AnalyticsFilters, ChartCard, stepLabel } from '../components/analytics/AnalyticsUI';
import { useAnalyticsFilters, isDefaultFilters } from '../components/analytics/useAnalyticsFilters';
import {
  LevelColumnChart,
  MineComparisonChart,
  ComplianceTrendChart,
  OverdueTrendChart,
  MineTrendChart,
  RecurringChart,
} from '../components/analytics/Charts';
import { getAnalytics, getFilterOptions, MAX_TREND_MINES } from '../services/analyticsService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';
import { formatDate } from '../utils/date';

const NO_MATCH = {
  title: 'No data for these filters',
  description: 'Nothing matches the current date range, mine and category. Widen the range or reset the filters.',
};
const NOT_ENOUGH = {
  title: 'Not enough history in this range',
  description: 'A trend needs at least two dates. Choose a longer date range.',
};

function RecurringGroups({ groups }) {
  return (
    <div className="mt-4 border-t border-border pt-3">
      <h3 className="text-xs font-semibold mb-2">Recurring violation groups</h3>
      <ul className="divide-y divide-elevated" data-testid="recurring-groups">
        {groups.map((g) => (
          <li key={g.category} className="py-3" data-testid="recurring-group">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div className="text-sm font-medium">
                {g.category} <span className="text-xs text-text-secondary font-normal">· {g.domain}</span>
              </div>
              <div className="text-xs font-mono text-text-secondary">
                {g.count} issue{g.count === 1 ? '' : 's'} · up to {g.maxRecurrence} prior occurrences · {g.openCount} open
              </div>
            </div>
            <div className="text-xs text-text-secondary mt-0.5">
              {g.mines.length} mine{g.mines.length === 1 ? '' : 's'}: {g.mines.map((m) => m.name).join(', ')}
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {g.issues.map((i) => (
                <li key={i.id} className="text-xs flex items-baseline gap-2">
                  <span className="font-mono text-text-secondary shrink-0">{i.recurrenceCount}×</span>
                  <Link to={`/issues/${i.id}`} className="hover:text-amber">
                    {i.title}
                  </Link>
                  <span className="text-text-secondary shrink-0">· {i.mineName}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Analytics() {
  const { role } = useRole();
  const { raw, search, apply, reset } = useAnalyticsFilters();
  const options = useMemo(() => getFilterOptions(role), [role]);
  const data = useMemo(() => getAnalytics({ role, filters: raw }), [role, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const { filters, kpis } = data;
  const to = formatDate(filters.to);
  const range = `${formatDate(filters.from)} – ${to}`;

  const dist = data.riskDistribution;
  const cmp = data.mineComparison;
  const trend = data.complianceTrend;
  const overdue = data.overdueTrend;
  const mt = data.mineTrend;
  const rec = data.recurring;
  const ctr = data.contractorRisk;

  const trendEmpty = trend.length < 2 ? NOT_ENOUGH : trend.every((p) => p.openIssues === 0) ? NO_MATCH : null;
  const overdueEmpty = overdue.length < 2 ? NOT_ENOUGH : overdue.every((p) => p.openActions === 0) ? { title: 'No corrective actions for these filters', description: 'No action was open on any date in this range.' } : null;
  const mineTrendEmpty = mt.series.length === 0 ? NO_MATCH : mt.points.length < 2 ? NOT_ENOUGH : null;
  const peakOverdue = Math.max(0, ...overdue.map((p) => p.overdue));
  const latest = [...trend].reverse().find((p) => p.compliancePct !== null);

  return (
    <div>
      <PageHeader
        title="Risk Intelligence"
        subtitle={
          role === ROLES.MINE_MANAGER
            ? `Own-mine analytics · ${options.mines[1]?.label ?? 'your mine'} · descriptive, from recorded demo data`
            : 'Analytics across all mines · descriptive, from recorded demo data — not a forecast'
        }
      />
      <AnalyticsTabs search={search} />
      <AnalyticsFilters
        filters={filters}
        options={options}
        onChange={(patch) => apply(filters, patch)}
        onReset={reset}
        isDefault={isDefaultFilters(filters)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="kpis">
        <KpiCard label="Open issues" value={kpis.openIssues} icon={Activity} hint={`observed in range, open on ${to}`} />
        <KpiCard label="Average risk score" value={kpis.averageRisk ?? '—'} icon={Gauge} hint="across open issues in view" />
        <KpiCard label="High + Critical" value={kpis.highCritical} icon={ShieldAlert} accent={kpis.highCritical ? 'high' : 'neutral'} hint="open issues scoring 61 or more" />
        <KpiCard label="Overdue actions" value={kpis.overdueActions} icon={Clock} accent={kpis.overdueActions ? 'critical' : 'neutral'} hint={`past deadline on ${to}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard
          id="chart-risk-distribution"
          title="Risk Distribution"
          subtitle={`Open issues first observed ${range}, scored as of ${to}`}
          empty={dist.total === 0 ? NO_MATCH : null}
          ariaLabel={`Column chart of open issues by risk level: ${dist.levels.map((l) => `${l.label} ${l.count}`).join(', ')}`}
          table={{
            columns: [
              { key: 'level', label: 'Risk level' },
              { key: 'count', label: 'Issues' },
              { key: 'share', label: 'Share' },
            ],
            rows: dist.levels.map((l) => ({ level: l.label, count: l.count, share: `${l.pct}%` })),
          }}
        >
          <LevelColumnChart levels={dist.levels} unit="Issues" yLabel="Open issues" />
        </ChartCard>

        <ChartCard
          id="chart-contractor-risk"
          title="Contractor Risk"
          subtitle="Contractors by current risk level · date range and category do not apply (a contractor's risk level is a current attribute)"
          empty={ctr.total === 0 ? { title: 'No contractors for this mine', description: 'No contractor records match the mine filter.' } : null}
          ariaLabel={`Column chart of contractors by risk level: ${ctr.levels.map((l) => `${l.label} ${l.count}`).join(', ')}`}
          table={{
            columns: [
              { key: 'level', label: 'Risk level' },
              { key: 'count', label: 'Contractors' },
              { key: 'share', label: 'Share' },
            ],
            rows: ctr.levels.map((l) => ({ level: l.label, count: l.count, share: `${l.pct}%` })),
          }}
        >
          <LevelColumnChart levels={ctr.levels} unit="Contractors" yLabel="Contractors" />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          id="chart-mine-comparison"
          title="Mine Risk Comparison"
          subtitle={`Highest open-issue score per mine, as of ${to}${cmp.hiddenMines ? ` · ${cmp.hiddenMines} mine${cmp.hiddenMines === 1 ? '' : 's'} with no matching open issues not shown` : ''}`}
          empty={cmp.rows.length === 0 ? NO_MATCH : null}
          ariaLabel={`Bar chart of mine risk scores: ${cmp.rows.map((r) => `${r.name} ${r.riskScore}`).join(', ')}`}
          table={{
            columns: [
              { key: 'name', label: 'Mine' },
              { key: 'score', label: 'Risk score' },
              { key: 'level', label: 'Level' },
              { key: 'open', label: 'Open issues' },
              { key: 'avg', label: 'Avg score' },
              { key: 'compliance', label: 'Compliance %' },
            ],
            rows: cmp.rows.map((r) => ({ name: r.name, score: r.riskScore, level: r.riskLabel, open: r.openIssues, avg: r.averageScore, compliance: `${r.compliancePct}%` })),
          }}
        >
          <MineComparisonChart rows={cmp.rows} />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        <ChartCard
          id="chart-compliance-trend"
          title="Historical Risk Trend — Compliance"
          subtitle={`${stepLabel(data.stepDays)} · compliance % = 100 − average open-issue score · reconstructed from dated records${latest ? ` · latest ${latest.compliancePct}%` : ''}`}
          empty={trendEmpty}
          ariaLabel={`Line chart of compliance percentage over time, from ${trend[0]?.compliancePct ?? 'no data'} to ${latest?.compliancePct ?? 'no data'} percent`}
          table={{
            columns: [
              { key: 'date', label: 'Date' },
              { key: 'compliance', label: 'Compliance %' },
              { key: 'open', label: 'Open issues' },
              { key: 'avg', label: 'Avg risk' },
              { key: 'hc', label: 'High + Critical' },
            ],
            rows: trend.map((p) => ({ date: p.date, compliance: p.compliancePct === null ? '—' : `${p.compliancePct}%`, open: p.openIssues, avg: p.averageRisk ?? '—', hc: p.highCritical })),
          }}
        >
          <ComplianceTrendChart points={trend} />
        </ChartCard>

        <ChartCard
          id="chart-overdue-trend"
          title="Overdue Actions Trend"
          subtitle={`${stepLabel(data.stepDays)} · open corrective actions past their deadline on each date`}
          empty={overdueEmpty}
          ariaLabel={`Chart of overdue corrective actions over time, peaking at ${peakOverdue}`}
          footer={peakOverdue === 0 ? <p className="text-xs text-text-secondary mt-2">No corrective action was overdue on any of these dates.</p> : null}
          table={{
            columns: [
              { key: 'date', label: 'Date' },
              { key: 'overdue', label: 'Overdue' },
              { key: 'open', label: 'Open actions' },
            ],
            rows: overdue.map((p) => ({ date: p.date, overdue: p.overdue, open: p.openActions })),
          }}
        >
          <OverdueTrendChart points={overdue} />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          id="chart-mine-trend"
          title="Mine-Level Risk Trend"
          subtitle={`${stepLabel(data.stepDays)} · highest open-issue score per mine on each date${mt.hiddenMines ? ` · top ${MAX_TREND_MINES} mines by current score shown (${mt.hiddenMines} more — use the Mine filter)` : ''}`}
          empty={mineTrendEmpty}
          ariaLabel={`Line chart of risk score over time for ${mt.series.map((s) => s.name).join(', ')}`}
          table={{
            columns: [{ key: 'date', label: 'Date' }, ...mt.series.map((s) => ({ key: s.mineId, label: s.name }))],
            rows: mt.points.map((p) => ({ date: p.date, ...Object.fromEntries(mt.series.map((s) => [s.mineId, p[s.mineId] ?? '—'])) })),
          }}
        >
          <MineTrendChart series={mt.series} points={mt.points} />
        </ChartCard>
      </div>

      <div className="mt-4">
        <ChartCard
          id="chart-recurring"
          title="Recurring Violation Analysis"
          subtitle={`Issues with 2 or more prior occurrences, first observed ${range}, grouped by category · ${rec.total} issue${rec.total === 1 ? '' : 's'} in ${rec.groups.length} categor${rec.groups.length === 1 ? 'y' : 'ies'}`}
          empty={rec.groups.length === 0 ? { title: 'No recurring violations', description: 'No issue with 2 or more prior occurrences matches these filters.' } : null}
          ariaLabel={`Bar chart of recurring issues by category: ${rec.groups.map((g) => `${g.category} ${g.count}`).join(', ')}`}
          footer={<RecurringGroups groups={rec.groups} />}
          table={{
            columns: [
              { key: 'category', label: 'Category' },
              { key: 'domain', label: 'Domain' },
              { key: 'count', label: 'Issues' },
              { key: 'max', label: 'Highest recurrence' },
              { key: 'mines', label: 'Mines affected' },
            ],
            rows: rec.groups.map((g) => ({ category: g.category, domain: g.domain, count: g.count, max: g.maxRecurrence, mines: g.mines.length })),
          }}
        >
          <RecurringChart groups={rec.groups} />
        </ChartCard>
      </div>

      <details className="mt-6 bg-surface border border-border rounded-card px-4 py-3 text-xs text-text-secondary">
        <summary className="cursor-pointer text-text-primary text-sm select-none">How these numbers are calculated</summary>
        <ul className="list-disc pl-5 mt-3 space-y-1.5 max-w-3xl">
          <li>
            This is descriptive analytics over the demo records in this browser. There is no trained model and no forecast; future dates are not shown. Risk scores come from the
            rule-based Risk Engine (see the Risk Engine tab).
          </li>
          <li>
            Trend charts are <span className="text-text-primary">reconstructed</span>: for each date, an issue counts if it had been observed and not yet closed, and is scored with its
            corrective action's deadline only while that action was open. Severity, recurrence and exposure are the values recorded now, so trends move because issues arrive and close
            and deadlines pass — not because anything was re-rated.
          </li>
          <li>
            Snapshot charts (distribution, mine comparison, recurring violations, the figures above) use issues first observed inside the date range, scored as of its end date.
            Contractor risk is a current attribute and ignores the range and category.
          </li>
          <li>
            Mine risk score is the highest open-issue score at a mine; compliance % is 100 minus the average open-issue score — the same definitions as the GIS Risk Map. Points with no open
            issues are left blank rather than shown as 100%.
          </li>
          <li>All mines, issues, contractors and dates are fictional, and dates are relative to the day the demo data was loaded.</li>
        </ul>
      </details>
    </div>
  );
}
