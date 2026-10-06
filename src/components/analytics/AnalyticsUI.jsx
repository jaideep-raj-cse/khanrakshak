import React from 'react';
import { NavLink } from 'react-router-dom';
import { BarChart3, RotateCcw } from 'lucide-react';
import FilterSelect from '../ui/FilterSelect';
import EmptyState from '../ui/EmptyState';
import { formatDate } from '../../utils/date';

// --- Page chrome ---------------------------------------------------------------------------------------

export function AnalyticsTabs({ search }) {
  const link = ({ isActive }) =>
    `h-9 px-3 inline-flex items-center text-sm border-b-2 -mb-px ${
      isActive ? 'border-amber text-text-primary font-medium' : 'border-transparent text-text-secondary hover:text-text-primary'
    }`;
  return (
    <nav aria-label="Analytics sections" className="flex gap-1 border-b border-border mb-5">
      <NavLink to={{ pathname: '/analytics', search }} end className={link}>
        Risk Intelligence
      </NavLink>
      <NavLink to={{ pathname: '/analytics/risk-engine', search }} className={link}>
        Risk Engine
      </NavLink>
    </nav>
  );
}

const dateInputClass =
  'bg-bg border border-border rounded-input h-9 px-2 text-sm text-text-primary outline-none focus:border-amber';

/**
 * Date range + Mine + Category. Controlled: `filters` is the RESOLVED set from the service, and
 * every change goes up through onChange(patch) — the page owns the URL.
 */
export function AnalyticsFilters({ filters, options, onChange, onReset, isDefault }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Analytics filters">
        <FilterSelect label="Range" value={filters.preset} onChange={(preset) => onChange({ preset })} options={options.presets} />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary text-xs uppercase tracking-wide">From</span>
          <input
            type="date"
            value={filters.from}
            min={options.dataStart}
            max={filters.to}
            onChange={(e) => e.target.value && onChange({ preset: 'CUSTOM', from: e.target.value, to: filters.to })}
            className={dateInputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary text-xs uppercase tracking-wide">To</span>
          <input
            type="date"
            value={filters.to}
            min={filters.from}
            max={options.today}
            onChange={(e) => e.target.value && onChange({ preset: 'CUSTOM', from: filters.from, to: e.target.value })}
            className={dateInputClass}
          />
        </label>
        <FilterSelect label="Mine" value={filters.mineId} onChange={(mineId) => onChange({ mineId })} options={options.mines} />
        <FilterSelect label="Category" value={filters.category} onChange={(category) => onChange({ category })} options={options.categories} />
        {!isDefault && (
          <button
            onClick={onReset}
            className="h-9 px-3 rounded-btn text-sm text-text-secondary hover:text-text-primary hover:bg-elevated inline-flex items-center gap-1.5"
          >
            <RotateCcw size={13} aria-hidden="true" /> Reset filters
          </button>
        )}
      </div>
      <p className="text-xs text-text-secondary mt-2">
        Showing {formatDate(filters.from)} – {formatDate(filters.to)}.
        {filters.notes.map((n) => (
          <span key={n} role="status" className="text-risk-moderate ml-2">
            {n}
          </span>
        ))}
      </p>
    </div>
  );
}

// --- Chart card ----------------------------------------------------------------------------------------

/**
 * A titled card around one chart. `empty` replaces the chart with an empty state (so a filter that
 * matches nothing says so instead of drawing a blank plot). `table` is the same data as text —
 * a chart is not readable by everyone, and it lets any number be checked exactly.
 */
export function ChartCard({ id, title, subtitle, empty, ariaLabel, table, footer, children, className = '' }) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      data-testid={id}
      data-state={empty ? 'empty' : 'populated'}
      className={`bg-surface border border-border rounded-card overflow-hidden flex flex-col ${className}`}
    >
      <header className="px-4 pt-3 pb-2 border-b border-border bg-elevated">
        <h2 id={`${id}-title`} className="text-sm font-semibold">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-text-secondary mt-0.5">{subtitle}</p>}
      </header>
      <div className="p-4 flex-1">
        {empty ? (
          <EmptyState icon={BarChart3} title={empty.title} description={empty.description} />
        ) : (
          <>
            <div role="img" aria-label={ariaLabel}>
              {children}
            </div>
            {footer}
          </>
        )}
      </div>
      {!empty && table && (
        <details className="border-t border-border px-4 py-2 text-xs">
          <summary className="cursor-pointer text-text-secondary hover:text-text-primary select-none">View data table</summary>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left" data-testid={`${id}-table`}>
              <thead>
                <tr className="text-text-secondary">
                  {table.columns.map((c) => (
                    <th key={c.key} scope="col" className="font-medium py-1 pr-4 whitespace-nowrap">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i} className="border-t border-elevated">
                    {table.columns.map((c) => (
                      <td key={c.key} className="py-1 pr-4 font-mono whitespace-nowrap">
                        {row[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

// --- Legend + tooltip ----------------------------------------------------------------------------------

/** Colour swatch + label + count for risk-level charts. Labels carry the meaning, not colour alone. */
export function LevelLegend({ levels, unit }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs" aria-label="Legend">
      {levels.map((l) => (
        <li key={l.level} className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} aria-hidden="true" />
          <span className="text-text-secondary">{l.label}</span>
          <span className="font-mono">
            {l.count}
            {unit ? ` ${unit}` : ''} ({l.pct}%)
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dark-theme tooltip shell. `render(payload, label)` returns the body; Recharts passes the rest. */
export function ChartTooltip({ active, payload, label, render }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-bg border border-border-strong rounded-card px-3 py-2 text-xs shadow-modal max-w-xs">
      {render(payload, label)}
    </div>
  );
}

export function TipRow({ color, name, value }) {
  return (
    <div className="flex items-center justify-between gap-4 mt-0.5">
      <span className="inline-flex items-center gap-1.5 text-text-secondary">
        {color && <span className="w-2 h-2 rounded-sm" style={{ background: color }} aria-hidden="true" />}
        {name}
      </span>
      <span className="font-mono text-text-primary">{value}</span>
    </div>
  );
}

export const stepLabel = (days) => (days === 1 ? 'Daily' : days === 7 ? 'Weekly' : `Every ${days} days`);
