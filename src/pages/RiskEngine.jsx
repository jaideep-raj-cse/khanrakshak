import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import RiskBadge from '../components/ui/RiskBadge';
import DataTable from '../components/ui/DataTable';
import { AnalyticsTabs, AnalyticsFilters, ChartCard } from '../components/analytics/AnalyticsUI';
import { useAnalyticsFilters, isDefaultFilters } from '../components/analytics/useAnalyticsFilters';
import { DriversChart, DRIVER_COLORS } from '../components/analytics/Charts';
import { getRiskEngineData, getFilterOptions, COMPONENT_KEYS, COMPONENT_LABELS } from '../services/analyticsService';
import { useRole } from '../context/RoleContext';
import { formatDate } from '../utils/date';

const NO_MATCH = {
  title: 'No open issues for these filters',
  description: 'Nothing matches the current date range, mine and category. Widen the range or reset the filters.',
};

export default function RiskEngine() {
  const { role } = useRole();
  const { raw, search, apply, reset } = useAnalyticsFilters();
  const options = useMemo(() => getFilterOptions(role), [role]);
  const data = useMemo(() => getRiskEngineData({ role, filters: raw }), [role, search]); // eslint-disable-line react-hooks/exhaustive-deps
  const { filters, formula, overall, byMine, topIssues } = data;
  const to = formatDate(filters.to);
  const range = `${formatDate(filters.from)} – ${to}`;
  const formulaText = formula.components.map((c) => `${c.label} × ${c.weightPct}%`).join(' + ');

  const columns = [
    {
      key: 'title',
      label: 'Issue',
      render: (i) => (
        <div>
          <Link to={`/issues/${i.id}`} onClick={(e) => e.stopPropagation()} className="text-sm hover:text-amber">
            {i.title}
          </Link>
          <div className="text-xs font-mono text-text-secondary">{i.id}</div>
        </div>
      ),
    },
    { key: 'mineName', label: 'Mine', render: (i) => <span className="text-sm">{i.mineName}</span> },
    { key: 'category', label: 'Category', render: (i) => <span className="text-xs text-text-secondary">{i.category}</span> },
    {
      key: 'score',
      label: 'Score',
      sortable: true,
      sortValue: (i) => i.score,
      render: (i) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-sm">{i.score}</span>
          <RiskBadge level={i.level} />
        </span>
      ),
    },
    ...COMPONENT_KEYS.map((k) => ({
      key: k,
      label: COMPONENT_LABELS[k],
      sortable: true,
      sortValue: (i) => i.components[k],
      render: (i) => <span className="font-mono text-xs">{i.components[k]}</span>,
    })),
  ];

  return (
    <div>
      <PageHeader
        title="Risk Engine"
        subtitle="How a risk score is calculated, and what drives the scores in view · rule-based and explainable — not a trained model"
      />
      <AnalyticsTabs search={search} />
      <AnalyticsFilters
        filters={filters}
        options={options}
        onChange={(patch) => apply(filters, patch)}
        onReset={reset}
        isDefault={isDefaultFilters(filters)}
      />

      <Card title="Scoring formula">
        <p className="font-mono text-sm text-amber" data-testid="formula">
          Risk Score = {formulaText}
        </p>
        <p className="text-xs text-text-secondary mt-1">
          Each input is first turned into a 0–100 sub-score, then multiplied by its weight, so the result is on a 0–100 scale. The same inputs always give the same score.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
          {formula.components.map((c) => (
            <div key={c.key} className="border border-border rounded-card p-3" data-testid={`weight-${c.key}`}>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DRIVER_COLORS[c.key] }} aria-hidden="true" />
                <span className="text-sm font-medium">{c.label}</span>
                <span className="ml-auto font-mono text-sm">{c.weightPct}%</span>
              </div>
              <p className="text-xs text-text-secondary mt-1.5">{c.rule}</p>
            </div>
          ))}
        </div>
        <h3 className="text-xs font-semibold mt-5 mb-2">Risk levels</h3>
        <ul className="flex flex-wrap gap-3" data-testid="bands">
          {formula.bands.map((b) => (
            <li key={b.level} className="inline-flex items-center gap-2 border border-border rounded-card px-3 py-1.5 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} aria-hidden="true" />
              <span className="font-medium">{b.label}</span>
              <span className="font-mono text-text-secondary">
                {b.min}–{b.max}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-text-secondary mt-3">
          With these weights the highest possible score without any delay is 85, so a score above 85 always includes an overdue corrective action.
        </p>
      </Card>

      <div className="mt-4">
        <ChartCard
          id="chart-drivers"
          title="What drives the scores in view"
          subtitle={`Average points each component adds to a mine's open issues · issues first observed ${range}, scored as of ${to}`}
          empty={overall.count === 0 ? NO_MATCH : null}
          ariaLabel={`Stacked bar chart of average risk points by component for ${byMine.map((m) => m.name).join(', ')}`}
          footer={
            <dl className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 border-t border-border pt-3" data-testid="driver-totals">
              <div>
                <dt className="text-xs text-text-secondary">All {overall.count} open issues</dt>
                <dd className="font-mono text-lg">{overall.averageScore}</dd>
              </div>
              {COMPONENT_KEYS.map((k) => (
                <div key={k}>
                  <dt className="text-xs text-text-secondary inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background: DRIVER_COLORS[k] }} aria-hidden="true" />
                    {COMPONENT_LABELS[k]}
                  </dt>
                  <dd className="font-mono text-lg">{overall[k]} pts</dd>
                </div>
              ))}
            </dl>
          }
          table={{
            columns: [
              { key: 'name', label: 'Mine' },
              { key: 'count', label: 'Open issues' },
              { key: 'avg', label: 'Avg score' },
              ...COMPONENT_KEYS.map((k) => ({ key: k, label: COMPONENT_LABELS[k] })),
            ],
            rows: byMine.map((m) => ({ name: m.name, count: m.count, avg: m.averageScore, severity: m.severity, recurrence: m.recurrence, exposure: m.exposure, delay: m.delay })),
          }}
        >
          <DriversChart rows={byMine} />
        </ChartCard>
        <p className="text-xs text-text-secondary mt-2">The engine rounds each issue's final score to a whole number while component points keep one decimal, so a row's components can differ from its average score by up to about half a point.</p>
      </div>

      <div className="mt-4">
        <Card title={`Highest-risk open issues (top ${Math.min(10, topIssues.length) || 10})`}>
          <div className="-m-4">
            <DataTable
              columns={columns}
              rows={topIssues}
              getRowKey={(i) => i.id}
              emptyState={{ title: NO_MATCH.title, description: NO_MATCH.description }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
