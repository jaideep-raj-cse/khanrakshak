import React from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts';
import { ChartTooltip, TipRow, LevelLegend } from './AnalyticsUI';
import { getRiskFormula, COMPONENT_KEYS, COMPONENT_LABELS } from '../../services/analyticsService';
import { formatDate } from '../../utils/date';

// Theme (matches tailwind.config.js). Recharts takes plain colour strings, not Tailwind classes.
const AXIS = '#94A3B8';
const GRID = '#334155';
const TEXT = '#F8FAFC';
const CURSOR = { fill: 'rgba(148,163,184,0.08)' };
const tick = { fill: AXIS, fontSize: 11 };
const legendStyle = { fontSize: 12, paddingTop: 8 };
const legendText = (v) => <span style={{ color: '#CBD5E1' }}>{v}</span>;
const trunc = (s, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// `initialDimension` is what the chart uses before the browser has measured the container (and in
// tests, where there is no layout); once measured, the container is fully responsive.
function Box({ height, children }) {
  return (
    <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 560, height }}>
      {children}
    </ResponsiveContainer>
  );
}

const tip = (render) => <ChartTooltip render={render} />;
const rowsHeight = (n, per = 34, extra = 44) => Math.max(180, n * per + extra);

// --- Risk distribution + contractor risk (same shape: four levels) -------------------------------------

export function LevelColumnChart({ levels, unit, yLabel }) {
  return (
    <>
      <Box height={240}>
        <BarChart data={levels} margin={{ top: 22, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={tick} stroke={GRID} />
          <YAxis allowDecimals={false} tick={tick} stroke={GRID} width={36} label={{ value: yLabel, angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11, dx: 4 }} />
          <Tooltip
            cursor={CURSOR}
            content={tip((p) => {
              const r = p[0].payload;
              return (
                <>
                  <div className="font-medium mb-1">{r.label} risk</div>
                  <TipRow color={r.color} name={unit} value={`${r.count} (${r.pct}%)`} />
                  {r.names && r.names.length > 0 && <div className="text-text-secondary mt-1.5">{r.names.slice(0, 6).join(', ')}{r.names.length > 6 ? ` +${r.names.length - 6} more` : ''}</div>}
                </>
              );
            })}
          />
          <Bar dataKey="count" name={unit} isAnimationActive={false} radius={[3, 3, 0, 0]} maxBarSize={72}>
            {levels.map((l) => (
              <Cell key={l.level} fill={l.color} />
            ))}
            <LabelList dataKey="count" position="top" fill={TEXT} fontSize={12} />
          </Bar>
        </BarChart>
      </Box>
      <LevelLegend levels={levels} unit={unit === 'Issues' ? 'issues' : unit.toLowerCase()} />
    </>
  );
}

// --- Mine risk comparison ---------------------------------------------------------------------------------

export function MineComparisonChart({ rows }) {
  const bands = getRiskFormula().bands;
  return (
    <>
      <Box height={rowsHeight(rows.length)}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 40, left: 4, bottom: 18 }} accessibilityLayer>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 30, 60, 80, 100]}
            tick={tick}
            stroke={GRID}
            label={{ value: 'Risk score (highest open issue, 0–100)', position: 'insideBottom', offset: -10, fill: AXIS, fontSize: 11 }}
          />
          <YAxis type="category" dataKey="name" width={176} tick={tick} stroke={GRID} tickFormatter={(t) => trunc(t, 25)} interval={0} />
          {[30, 60, 80].map((x) => (
            <ReferenceLine key={x} x={x} stroke={AXIS} strokeDasharray="4 4" strokeOpacity={0.5} />
          ))}
          <Tooltip
            cursor={CURSOR}
            content={tip((p) => {
              const r = p[0].payload;
              return (
                <>
                  <div className="font-medium">{r.name}</div>
                  <div className="text-text-secondary mb-1">{r.region}</div>
                  <TipRow color={r.color} name="Risk score" value={`${r.riskScore} · ${r.riskLabel}`} />
                  <TipRow name="Open issues" value={r.openIssues} />
                  <TipRow name="Average score" value={r.averageScore} />
                  <TipRow name="Compliance" value={`${r.compliancePct}%`} />
                </>
              );
            })}
          />
          <Bar dataKey="riskScore" name="Risk score" isAnimationActive={false} radius={[0, 3, 3, 0]} barSize={18}>
            {rows.map((r) => (
              <Cell key={r.mineId} fill={r.color} />
            ))}
            <LabelList dataKey="riskScore" position="right" fill={TEXT} fontSize={12} />
          </Bar>
        </BarChart>
      </Box>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs" aria-label="Legend">
        {bands.map((b) => (
          <li key={b.level} className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: b.color }} aria-hidden="true" />
            <span className="text-text-secondary">{b.label}</span>
            <span className="font-mono">
              {b.min}–{b.max}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

// --- Compliance trend --------------------------------------------------------------------------------------

export function ComplianceTrendChart({ points }) {
  return (
    <Box height={290}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick} stroke={GRID} minTickGap={18} />
        <YAxis yAxisId="pct" domain={[0, 100]} tick={tick} stroke={GRID} width={40} label={{ value: 'Compliance %', angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11, dx: 6 }} />
        <YAxis yAxisId="issues" orientation="right" allowDecimals={false} tick={tick} stroke={GRID} width={40} label={{ value: 'Open issues', angle: 90, position: 'insideRight', fill: AXIS, fontSize: 11, dx: -6 }} />
        <Tooltip
          cursor={CURSOR}
          content={tip((p) => {
            const r = p[0].payload;
            return (
              <>
                <div className="font-medium mb-1">{formatDate(r.date)}</div>
                <TipRow color="#F59E0B" name="Compliance" value={r.compliancePct === null ? 'No open issues' : `${r.compliancePct}%`} />
                <TipRow name="Average risk score" value={r.averageRisk ?? '—'} />
                <TipRow name="Open issues" value={r.openIssues} />
                <TipRow name="High + Critical" value={r.highCritical} />
              </>
            );
          })}
        />
        <Legend wrapperStyle={legendStyle} formatter={legendText} />
        <Bar yAxisId="issues" dataKey="openIssues" name="Open issues" fill="#475569" fillOpacity={0.55} maxBarSize={22} isAnimationActive={false} />
        <Line yAxisId="pct" dataKey="compliancePct" name="Compliance %" stroke="#F59E0B" strokeWidth={2.5} dot={{ r: 2.5, fill: '#F59E0B' }} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </Box>
  );
}

// --- Overdue actions trend ---------------------------------------------------------------------------------

export function OverdueTrendChart({ points }) {
  return (
    <Box height={290}>
      <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick} stroke={GRID} minTickGap={18} />
        <YAxis allowDecimals={false} tick={tick} stroke={GRID} width={40} label={{ value: 'Corrective actions', angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11, dx: 6 }} />
        <Tooltip
          cursor={CURSOR}
          content={tip((p) => {
            const r = p[0].payload;
            return (
              <>
                <div className="font-medium mb-1">{formatDate(r.date)}</div>
                <TipRow color="#EF4444" name="Overdue" value={r.overdue} />
                <TipRow color="#38BDF8" name="Open actions" value={r.openActions} />
              </>
            );
          })}
        />
        <Legend wrapperStyle={legendStyle} formatter={legendText} />
        <Bar dataKey="overdue" name="Overdue actions" fill="#EF4444" maxBarSize={22} isAnimationActive={false} />
        <Line dataKey="openActions" name="Open actions (all)" stroke="#38BDF8" strokeWidth={2} dot={{ r: 2, fill: '#38BDF8' }} isAnimationActive={false} />
      </ComposedChart>
    </Box>
  );
}

// --- Mine-level trend --------------------------------------------------------------------------------------

export function MineTrendChart({ series, points }) {
  return (
    <Box height={320}>
      <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 4 }} accessibilityLayer>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={tick} stroke={GRID} minTickGap={18} />
        <YAxis domain={[0, 100]} ticks={[0, 30, 60, 80, 100]} tick={tick} stroke={GRID} width={40} label={{ value: 'Risk score', angle: -90, position: 'insideLeft', fill: AXIS, fontSize: 11, dx: 6 }} />
        {[30, 60, 80].map((y) => (
          <ReferenceLine key={y} y={y} stroke={AXIS} strokeDasharray="4 4" strokeOpacity={0.4} />
        ))}
        <Tooltip
          content={tip((p, label) => (
            <>
              <div className="font-medium mb-1">{formatDate(p[0].payload.date)}</div>
              {p.map((entry) => (
                <TipRow key={entry.dataKey} color={entry.color} name={trunc(entry.name, 28)} value={entry.value ?? 'no records yet'} />
              ))}
            </>
          ))}
        />
        <Legend wrapperStyle={legendStyle} formatter={legendText} />
        {series.map((s) => (
          <Line key={s.mineId} dataKey={s.mineId} name={s.name} stroke={s.color} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </Box>
  );
}

// --- Recurring violations ----------------------------------------------------------------------------------

export function RecurringChart({ groups }) {
  return (
    <Box height={rowsHeight(groups.length, 32, 70)}>
      <BarChart data={groups} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 18 }} accessibilityLayer>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={tick} stroke={GRID} label={{ value: 'Recurring issues', position: 'insideBottom', offset: -10, fill: AXIS, fontSize: 11 }} />
        <YAxis type="category" dataKey="category" width={222} tick={tick} stroke={GRID} tickFormatter={(t) => trunc(t, 38)} interval={0} />
        <Tooltip
          cursor={CURSOR}
          content={tip((p) => {
            const g = p[0].payload;
            return (
              <>
                <div className="font-medium">{g.category}</div>
                <div className="text-text-secondary mb-1">{g.domain} domain</div>
                <TipRow name="Recurring issues" value={g.count} />
                <TipRow color="#F59E0B" name="2 prior occurrences" value={g.twoPrior} />
                <TipRow color="#EF4444" name="3+ prior occurrences" value={g.threePlusPrior} />
                <TipRow name="Mines affected" value={g.mines.length} />
              </>
            );
          })}
        />
        <Legend wrapperStyle={legendStyle} formatter={legendText} />
        <Bar dataKey="twoPrior" name="2 prior occurrences" stackId="r" fill="#F59E0B" isAnimationActive={false} barSize={16} />
        <Bar dataKey="threePlusPrior" name="3+ prior occurrences" stackId="r" fill="#EF4444" isAnimationActive={false} barSize={16} />
      </BarChart>
    </Box>
  );
}

// --- Risk engine: what drives the scores ---------------------------------------------------------------------

export const DRIVER_COLORS = { severity: '#F59E0B', recurrence: '#A78BFA', exposure: '#38BDF8', delay: '#F472B6' };

export function DriversChart({ rows }) {
  return (
    <Box height={rowsHeight(rows.length)}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 18 }} accessibilityLayer>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tick={tick} stroke={GRID} label={{ value: 'Average score of open issues, by component (points)', position: 'insideBottom', offset: -10, fill: AXIS, fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={176} tick={tick} stroke={GRID} tickFormatter={(t) => trunc(t, 25)} interval={0} />
        <Tooltip
          cursor={CURSOR}
          content={tip((p) => {
            const r = p[0].payload;
            return (
              <>
                <div className="font-medium mb-1">{r.name}</div>
                {COMPONENT_KEYS.map((k) => (
                  <TipRow key={k} color={DRIVER_COLORS[k]} name={COMPONENT_LABELS[k]} value={`${r[k]} pts`} />
                ))}
                <TipRow name={`Average of ${r.count} open issue${r.count === 1 ? '' : 's'}`} value={r.averageScore} />
              </>
            );
          })}
        />
        <Legend wrapperStyle={legendStyle} formatter={legendText} />
        {COMPONENT_KEYS.map((k) => (
          <Bar key={k} dataKey={k} name={COMPONENT_LABELS[k]} stackId="s" fill={DRIVER_COLORS[k]} isAnimationActive={false} barSize={16} />
        ))}
      </BarChart>
    </Box>
  );
}
