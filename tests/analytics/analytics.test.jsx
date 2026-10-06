// Run from the project root:  npm run test:analytics:ui   (or `npm run test:documents:ui` = all jsdom suites)
// Drives the REAL Analytics pages (App + router + RoleProvider, with StrictMode, exactly as main.jsx
// wires them) in jsdom and inspects the Recharts SVG that is actually drawn: are the charts populated
// from the seed, and do they change when the filters change?
import React from 'react';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { render, screen, within, waitFor, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import App from '../../src/App.jsx';
import { RoleProvider } from '../../src/context/RoleContext.jsx';
import { ensureSeeded } from '../../src/services/seedService.js';
import { getAnalytics, getRiskEngineData } from '../../src/services/analyticsService.js';
import { ROLES } from '../../src/data/roles.js';

beforeAll(() => {
  // jsdom has no layout engine. Recharts' ResponsiveContainer needs ResizeObserver to exist; it draws
  // at its `initialDimension` until it is told otherwise.
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  // ...and on mount it re-measures its container, which jsdom reports as 0 x 0 (so nothing would be
  // drawn). Give the CHART CONTAINER a plausible size, as a laid-out browser would. Everything else
  // must NOT claim that size: Recharts measures tick labels with a hidden <span>, and if every span
  // were 560 px wide it would discard all the ticks and draw no bars. Text gets a text-sized box.
  const size = { width: 560, height: 300 };
  const isChartBox = (el) => el.classList?.contains('recharts-responsive-container') || el.classList?.contains('recharts-wrapper');
  const textBox = (el) => ({ width: (el.textContent ?? '').length * 6, height: 12 });
  const dim = (key) => function () { return isChartBox(this) ? size[key] : textBox(this)[key]; };
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: dim('width') });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: dim('height') });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: dim('width') });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: dim('height') });
  HTMLElement.prototype.getBoundingClientRect = function () {
    const b = isChartBox(this) ? size : textBox(this);
    return { ...b, x: 0, y: 0, top: 0, left: 0, right: b.width, bottom: b.height, toJSON() {} };
  };
});

let lastLocation;
function LocationSpy() {
  lastLocation = useLocation();
  return null;
}

function open(path, role) {
  window.localStorage.clear();
  ensureSeeded();
  window.localStorage.setItem('khanrakshak:currentRole', JSON.stringify(role));
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <RoleProvider>
          <LocationSpy />
          <App />
        </RoleProvider>
      </MemoryRouter>
    </React.StrictMode>
  );
}

const CHARTS = ['chart-risk-distribution', 'chart-contractor-risk', 'chart-mine-comparison', 'chart-compliance-trend', 'chart-overdue-trend', 'chart-mine-trend', 'chart-recurring'];
const card = (id) => screen.getByTestId(id);
const state = (id) => card(id).getAttribute('data-state');
const tableRows = (id) => within(screen.getByTestId(`${id}-table`)).getAllByRole('row').slice(1).map((r) => [...r.querySelectorAll('td')].map((td) => td.textContent));
// Rectangles actually DRAWN (Recharts draws nothing for a zero-height bar, so this equals the number of
// non-zero values — which the service lets us predict exactly).
const drawn = (id) => card(id).querySelectorAll('.recharts-rectangle').length;
const barPaths = (id) => [...card(id).querySelectorAll('.recharts-rectangle')];
const yTicks = (id) => card(id).querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick-value').length;
const nonZero = (rows, keys) => rows.reduce((n, r) => n + keys.filter((k) => Number(r[k]) > 0).length, 0);
// A drawn line has real coordinates in its path; an empty/NaN path means the series had no usable data.
const curves = (id) => [...card(id).querySelectorAll('.recharts-line-curve')];
const hasRealPath = (el) => /^M\s*-?\d+(\.\d+)?[ ,]+-?\d+(\.\d+)?/.test(el.getAttribute('d') ?? '') && !/NaN/.test(el.getAttribute('d')) && el.getAttribute('d').length > 60;
const dots = (id) => card(id).querySelectorAll('.recharts-line-dots circle').length;
const legendItems = (id) => [...card(id).querySelectorAll('.recharts-legend-item-text')].map((e) => e.textContent);
const kpi = (label) => {
  const el = within(screen.getByTestId('kpis')).getByText(label);
  return el.closest('div.bg-surface').querySelector('.font-mono').textContent;
};
const ready = async () => screen.findByRole('heading', { name: 'Risk Intelligence', level: 1 }, { timeout: 8000 });

beforeEach(() => cleanup());

describe('Risk Intelligence — populated from the seed (Compliance Officer)', () => {
  it('renders every chart with data, labelled as descriptive analytics', async () => {
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    expect(screen.getByText(/descriptive, from recorded demo data — not a forecast/)).toBeTruthy();
    CHARTS.forEach((id) => expect(state(id), id).toBe('populated'));
    // each chart is announced to assistive tech with a summary
    CHARTS.forEach((id) => expect(card(id).querySelector('[role="img"]').getAttribute('aria-label').length).toBeGreaterThan(20));
  });

  it('draws the right marks: bars per level / mine, lines, ticks, legends', async () => {
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const exp = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER });
    // bars: exactly one drawn rectangle per non-zero value
    expect(drawn('chart-risk-distribution')).toBe(nonZero(exp.riskDistribution.levels, ['count']));
    expect(drawn('chart-risk-distribution')).toBe(4);
    expect(drawn('chart-contractor-risk')).toBe(nonZero(exp.contractorRisk.levels, ['count']));
    expect(drawn('chart-mine-comparison')).toBe(10);
    expect(barPaths('chart-mine-comparison').every((p) => /^M/.test(p.getAttribute('d') ?? '') && !/NaN/.test(p.getAttribute('d')))).toBe(true);
    expect(drawn('chart-compliance-trend')).toBe(nonZero(exp.complianceTrend, ['openIssues']));
    expect(drawn('chart-compliance-trend')).toBeGreaterThanOrEqual(24);
    expect(drawn('chart-overdue-trend')).toBe(nonZero(exp.overdueTrend, ['overdue']));
    expect(drawn('chart-overdue-trend')).toBeGreaterThanOrEqual(1);
    expect(drawn('chart-recurring')).toBe(nonZero(exp.recurring.groups, ['twoPrior', 'threePlusPrior']));
    expect(card('chart-recurring').querySelectorAll('.recharts-bar-rectangle').length).toBe(18); // 9 groups x 2 series (zeros are empty)
    // lines: real coordinates, one dot per weekly point
    expect(curves('chart-compliance-trend')).toHaveLength(1);
    expect(curves('chart-compliance-trend').every(hasRealPath)).toBe(true);
    expect(dots('chart-compliance-trend')).toBe(exp.complianceTrend.length);
    expect(curves('chart-overdue-trend')).toHaveLength(1);
    expect(curves('chart-overdue-trend').every(hasRealPath)).toBe(true);
    expect(dots('chart-overdue-trend')).toBe(exp.overdueTrend.length);
    expect(curves('chart-mine-trend')).toHaveLength(5);
    expect(curves('chart-mine-trend').every(hasRealPath)).toBe(true);
    // axes have labelled ticks
    ['chart-risk-distribution', 'chart-mine-comparison', 'chart-compliance-trend', 'chart-overdue-trend', 'chart-mine-trend', 'chart-recurring'].forEach((id) => expect(yTicks(id), id).toBeGreaterThan(2));
    // legends
    expect(legendItems('chart-compliance-trend')).toEqual(['Open issues', 'Compliance %']);
    expect(legendItems('chart-overdue-trend')).toEqual(['Overdue actions', 'Open actions (all)']);
    expect(legendItems('chart-recurring')).toEqual(['2 prior occurrences', '3+ prior occurrences']);
    expect(legendItems('chart-mine-trend')).toHaveLength(5);
    ['Low', 'Medium', 'High', 'Critical'].forEach((l) => expect(within(card('chart-risk-distribution')).getByText(l, { selector: 'li span' })).toBeTruthy());
    // axis titles
    expect(within(card('chart-mine-comparison')).getByText(/Risk score \(highest open issue, 0–100\)/)).toBeTruthy();
    expect(within(card('chart-risk-distribution')).getByText('Open issues', { selector: 'text, tspan' })).toBeTruthy();
    expect(within(card('chart-compliance-trend')).getByText('Compliance %', { selector: 'text, tspan' })).toBeTruthy();
  });

  it('shows the same numbers as the service in the data tables and KPIs', async () => {
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const exp = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER });
    expect(tableRows('chart-risk-distribution').map((r) => r[1])).toEqual(exp.riskDistribution.levels.map((l) => String(l.count)));
    expect(tableRows('chart-mine-comparison').map((r) => [r[0], r[1]])).toEqual(exp.mineComparison.rows.map((r) => [r.name, String(r.riskScore)]));
    expect(tableRows('chart-compliance-trend')).toHaveLength(exp.complianceTrend.length);
    expect(tableRows('chart-overdue-trend').at(-1)[1]).toBe(String(exp.kpis.overdueActions));
    expect(tableRows('chart-recurring').reduce((s, r) => s + Number(r[2]), 0)).toBe(12);
    expect(tableRows('chart-contractor-risk').map((r) => r[1])).toEqual(exp.contractorRisk.levels.map((l) => String(l.count)));
    expect(kpi('Open issues')).toBe(String(exp.kpis.openIssues));
    expect(kpi('Average risk score')).toBe(String(exp.kpis.averageRisk));
    expect(kpi('High + Critical')).toBe(String(exp.kpis.highCritical));
    expect(kpi('Overdue actions')).toBe(String(exp.kpis.overdueActions));
  });

  it('lists recurring violation groups with category, count, recurrence and links to the issues', async () => {
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const groups = screen.getAllByTestId('recurring-group');
    expect(groups).toHaveLength(9);
    expect(groups[0].textContent).toMatch(/Contractor Compliance/);
    expect(groups[0].textContent).toMatch(/3 issues · up to 2 prior occurrences/);
    const link = within(groups[0]).getAllByRole('link')[0];
    expect(link.getAttribute('href')).toMatch(/^\/issues\/ISSUE-/);
  });

  it('shows a tooltip with details when hovering a chart', async () => {
    const { container } = open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const wrapper = card('chart-mine-comparison').querySelector('.recharts-wrapper');
    fireEvent.mouseMove(wrapper, { clientX: 300, clientY: 40 });
    const tip = await waitFor(() => {
      const el = card('chart-mine-comparison').querySelector('.recharts-tooltip-wrapper');
      expect(el && el.textContent).toMatch(/Risk score/);
      return el;
    });
    expect(tip.textContent).toMatch(/Open issues/);
    expect(tip.textContent).toMatch(/Compliance/);
  });
});

describe('Filters change the charts', () => {
  it('Mine filter narrows every chart and writes the URL', async () => {
    const user = userEvent.setup();
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    await user.selectOptions(screen.getByLabelText('Mine'), 'MINE-TAL-02');
    const exp = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER, filters: { mineId: 'MINE-TAL-02' } });
    await waitFor(() => expect(kpi('Open issues')).toBe(String(exp.kpis.openIssues)));
    expect(drawn('chart-mine-comparison')).toBe(1);
    expect(card('chart-mine-trend').querySelectorAll('.recharts-line-curve')).toHaveLength(1);
    expect(tableRows('chart-risk-distribution').map((r) => r[1])).toEqual(exp.riskDistribution.levels.map((l) => String(l.count)));
    expect(tableRows('chart-contractor-risk').reduce((s, r) => s + Number(r[1]), 0)).toBe(exp.contractorRisk.total);
    expect(lastLocation.search).toBe('?mine=MINE-TAL-02');
    expect(screen.getByRole('button', { name: /Reset filters/ })).toBeTruthy();
  });

  it('Category filter changes distribution, comparison, recurring and trend — but not contractor risk', async () => {
    const user = userEvent.setup();
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const contractorBefore = tableRows('chart-contractor-risk');
    await user.selectOptions(screen.getByLabelText('Category'), 'Environmental Compliance');
    const exp = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER, filters: { category: 'Environmental Compliance' } });
    await waitFor(() => expect(kpi('Open issues')).toBe(String(exp.kpis.openIssues)));
    expect(exp.kpis.openIssues).toBeLessThan(46);
    expect(tableRows('chart-recurring')).toHaveLength(1);
    expect(tableRows('chart-recurring')[0][0]).toBe('Environmental Compliance');
    expect(tableRows('chart-compliance-trend').at(-1)[2]).toBe(String(exp.kpis.openIssues));
    expect(tableRows('chart-contractor-risk')).toEqual(contractorBefore);
    expect(within(card('chart-contractor-risk')).getByText(/do not apply/)).toBeTruthy();
  });

  it('Date range: presets and custom dates change the snapshot and the number of trend points', async () => {
    const user = userEvent.setup();
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    const allPoints = tableRows('chart-compliance-trend').length;
    await user.selectOptions(screen.getByLabelText('Range'), '30');
    const exp30 = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER, filters: { preset: '30' } });
    await waitFor(() => expect(kpi('Open issues')).toBe(String(exp30.kpis.openIssues)));
    expect(exp30.kpis.openIssues).toBeLessThan(46);
    expect(tableRows('chart-compliance-trend')).toHaveLength(5);
    expect(allPoints).toBeGreaterThan(5);
    expect(lastLocation.search).toBe('?range=30');

    // editing a date (to a DIFFERENT day) switches to a custom range and is honoured
    const [y, m, d] = exp30.filters.from.split('-').map(Number);
    const newFrom = new Date(y, m - 1, d + 10).toISOString().slice(0, 10);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: newFrom } });
    await waitFor(() => expect(screen.getByLabelText('Range').value).toBe('CUSTOM'));
    expect(lastLocation.search).toContain('range=CUSTOM');
    expect(lastLocation.search).toContain(`from=${newFrom}`);
    expect(lastLocation.search).toContain(`to=${exp30.filters.to}`);
    const expCustom = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER, filters: { preset: 'CUSTOM', from: newFrom, to: exp30.filters.to } });
    await waitFor(() => expect(kpi('Open issues')).toBe(String(expCustom.kpis.openIssues)));
    expect(expCustom.kpis.openIssues).toBeLessThan(exp30.kpis.openIssues);
    expect(tableRows('chart-compliance-trend')).toHaveLength(expCustom.complianceTrend.length);
  });

  it('A filter that matches nothing shows empty states instead of blank plots, and Reset restores everything', async () => {
    const user = userEvent.setup();
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    // find a mine+category pair with no issues, using the service
    const mineIds = getAnalytics({ role: ROLES.COMPLIANCE_OFFICER }).mineComparison.rows.map((r) => r.mineId);
    const cats = [...screen.getByLabelText('Category').querySelectorAll('option')].map((o) => o.value).filter((v) => v !== 'ALL');
    const pair = mineIds.flatMap((m) => cats.map((c) => [m, c])).find(([m, c]) => getAnalytics({ role: ROLES.COMPLIANCE_OFFICER, filters: { mineId: m, category: c } }).riskDistribution.total === 0);
    expect(pair).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Mine'), pair[0]);
    await user.selectOptions(screen.getByLabelText('Category'), pair[1]);
    await waitFor(() => expect(state('chart-risk-distribution')).toBe('empty'));
    ['chart-risk-distribution', 'chart-mine-comparison', 'chart-compliance-trend', 'chart-mine-trend', 'chart-recurring'].forEach((id) => expect(state(id), id).toBe('empty'));
    expect(within(card('chart-risk-distribution')).getByText('No data for these filters')).toBeTruthy();
    expect(within(card('chart-recurring')).getByText('No recurring violations')).toBeTruthy();
    expect(kpi('Open issues')).toBe('0');
    expect(kpi('Average risk score')).toBe('—');
    expect(card('chart-risk-distribution').querySelector('details')).toBeNull(); // no empty data table either

    await user.click(screen.getByRole('button', { name: /Reset filters/ }));
    await waitFor(() => expect(state('chart-risk-distribution')).toBe('populated'));
    CHARTS.forEach((id) => expect(state(id), id).toBe('populated'));
    expect(lastLocation.search).toBe('');
  });

  it('A one-day range says there is not enough history for a trend', async () => {
    open('/analytics?range=CUSTOM&from=2026-09-20&to=2026-09-20', ROLES.COMPLIANCE_OFFICER);
    await ready();
    expect(state('chart-compliance-trend')).toBe('empty');
    expect(within(card('chart-compliance-trend')).getByText('Not enough history in this range')).toBeTruthy();
  });

  it('A hand-edited future end date is clamped, with a visible note', async () => {
    open('/analytics?range=CUSTOM&from=2026-01-01&to=2099-01-01', ROLES.COMPLIANCE_OFFICER);
    await ready();
    expect(screen.getAllByRole('status').some((n) => /future dates are not shown/i.test(n.textContent))).toBe(true);
  });
});

describe('Role access', () => {
  it('Mine Manager: own-mine analytics only', async () => {
    open('/analytics', ROLES.MINE_MANAGER);
    await ready();
    expect(screen.getByText(/Own-mine analytics · Jharia Colliery No. 4/)).toBeTruthy();
    const mineSelect = screen.getByLabelText('Mine');
    expect([...mineSelect.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['My Mine', 'Jharia Colliery No. 4']);
    expect(tableRows('chart-mine-comparison').map((r) => r[0])).toEqual(['Jharia Colliery No. 4']);
    expect(drawn('chart-mine-comparison')).toBe(1);
    const exp = getAnalytics({ role: ROLES.MINE_MANAGER });
    expect(kpi('Open issues')).toBe(String(exp.kpis.openIssues));
    expect(Number(kpi('Open issues'))).toBeLessThan(46);
    expect(state('chart-risk-distribution')).toBe('populated');
    expect(state('chart-compliance-trend')).toBe('populated');
  });

  it('Mine Manager cannot reach another mine by editing the URL', async () => {
    open('/analytics?mine=MINE-TAL-02', ROLES.MINE_MANAGER);
    await ready();
    expect(screen.getByLabelText('Mine').value).toBe('ALL');
    expect(tableRows('chart-mine-comparison').map((r) => r[0])).toEqual(['Jharia Colliery No. 4']);
  });

  it('Field Officer has no Analytics page: no sidebar link, and the URL redirects to the dashboard', async () => {
    open('/analytics', ROLES.FIELD_OFFICER);
    await waitFor(() => expect(lastLocation.pathname).toBe('/dashboard'));
    expect(screen.queryByRole('heading', { name: 'Risk Intelligence' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Analytics' })).toBeNull();
    expect(lastLocation.pathname).toBe('/dashboard');
    cleanup();
    open('/analytics/risk-engine', ROLES.FIELD_OFFICER);
    await waitFor(() => expect(lastLocation.pathname).toBe('/dashboard'));
  });

  it('Administrator gets the same full analytics as the Compliance Officer', async () => {
    open('/analytics', ROLES.ADMINISTRATOR);
    await ready();
    expect(drawn('chart-mine-comparison')).toBe(10);
    expect(kpi('Open issues')).toBe('46');
  });
});

describe('Risk Engine page', () => {
  it('shows the formula and bands from the engine, the driver chart and the top issues', async () => {
    open('/analytics/risk-engine', ROLES.COMPLIANCE_OFFICER);
    await screen.findByRole('heading', { name: 'Risk Engine', level: 1 }, { timeout: 8000 });
    expect(screen.getByText(/not a trained model/)).toBeTruthy();
    expect(screen.getByTestId('formula').textContent).toBe('Risk Score = Severity × 40% + Recurrence × 25% + Exposure × 20% + Delay × 15%');
    expect(screen.getByTestId('bands').textContent.replace(/\s/g, '')).toBe('Low0–30Medium31–60High61–80Critical81–100');
    expect(state('chart-drivers')).toBe('populated');
    const expAll = getRiskEngineData({ role: ROLES.COMPLIANCE_OFFICER });
    expect(drawn('chart-drivers')).toBe(nonZero(expAll.byMine, ['severity', 'recurrence', 'exposure', 'delay']));
    expect(drawn('chart-drivers')).toBeGreaterThan(30);
    expect(legendItems('chart-drivers')).toEqual(['Severity', 'Recurrence', 'Exposure', 'Delay']);
    const exp = getRiskEngineData({ role: ROLES.COMPLIANCE_OFFICER });
    expect(within(screen.getByTestId('driver-totals')).getByText(String(exp.overall.averageScore))).toBeTruthy();
    const topRows = within(screen.getByText(/Highest-risk open issues \(top 10\)/).closest('div.bg-surface')).getAllByRole('row').slice(1);
    expect(topRows).toHaveLength(10);
    expect(topRows[0].textContent).toContain(exp.topIssues[0].id);
  });

  it('keeps the filters when switching tabs, and applies them to the engine page', async () => {
    const user = userEvent.setup();
    open('/analytics', ROLES.COMPLIANCE_OFFICER);
    await ready();
    await user.selectOptions(screen.getByLabelText('Mine'), 'MINE-TAL-02');
    await user.click(screen.getByRole('link', { name: 'Risk Engine' }));
    await screen.findByRole('heading', { name: 'Risk Engine', level: 1 }, { timeout: 8000 });
    expect(lastLocation.pathname).toBe('/analytics/risk-engine');
    expect(lastLocation.search).toBe('?mine=MINE-TAL-02');
    expect(screen.getByLabelText('Mine').value).toBe('MINE-TAL-02');
    const exp = getRiskEngineData({ role: ROLES.COMPLIANCE_OFFICER, filters: { mineId: 'MINE-TAL-02' } });
    expect(drawn('chart-drivers')).toBe(nonZero(exp.byMine, ['severity', 'recurrence', 'exposure', 'delay']));
    expect(exp.byMine).toHaveLength(1);
    expect(within(screen.getByTestId('driver-totals')).getByText(`All ${exp.overall.count} open issues`)).toBeTruthy();
    await user.click(screen.getByRole('link', { name: 'Risk Intelligence' }));
    await ready();
    expect(screen.getByLabelText('Mine').value).toBe('MINE-TAL-02');
  });

  it('Mine Manager sees only its own mine on the engine page', async () => {
    open('/analytics/risk-engine', ROLES.MINE_MANAGER);
    await screen.findByRole('heading', { name: 'Risk Engine', level: 1 }, { timeout: 8000 });
    const exp = getRiskEngineData({ role: ROLES.MINE_MANAGER });
    expect(exp.byMine).toHaveLength(1);
    expect(drawn('chart-drivers')).toBe(nonZero(exp.byMine, ['severity', 'recurrence', 'exposure', 'delay']));
  });
});
