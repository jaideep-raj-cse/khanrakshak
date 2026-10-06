// Single source of truth for "today" in the demo. Overdue state must always
// be calculated from (dueDate vs DEMO_NOW), never hardcoded on a record —
// seeded due dates are deliberately placed before and after this date so
// overdue/escalated states appear naturally rather than as a fixed label.
export const DEMO_NOW = new Date();

const CLOSED_LIKE_STATUSES = new Set(['VERIFIED', 'CLOSED']);

export function parseDate(iso) {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Calendar-day math for deadlines. A corrective action due on D is on time
// through the end of D and is 1 day overdue on D+1. The overdue badge, the
// days-remaining label and the escalation engine all use this one definition,
// so they can never disagree (the old midnight-vs-now comparison flagged an
// action as overdue on its due date while other code called it "due today").
export function calendarDaysPastDue(dueDateIso, now = DEMO_NOW) {
  const due = parseDate(dueDateIso);
  if (!due) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

export function calendarDaysOverdue(dueDateIso, now = DEMO_NOW) {
  const diff = calendarDaysPastDue(dueDateIso, now);
  return diff === null ? 0 : Math.max(0, diff);
}

export function isOverdue(dueDateIso, status, now = DEMO_NOW) {
  if (CLOSED_LIKE_STATUSES.has(status)) return false;
  return calendarDaysOverdue(dueDateIso, now) > 0;
}

export function daysBetween(fromIso, toDate = DEMO_NOW) {
  const from = parseDate(fromIso);
  if (!from) return null;
  const ms = toDate.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// Returns an ISO date string (YYYY-MM-DD) `days` after `fromDate`.
export function addDaysISO(fromDate, days) {
  const d = new Date(fromDate.getTime());
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(date = DEMO_NOW) {
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Local calendar date (YYYY-MM-DD). todayISO() above slices the UTC string, which is the
// previous/next day for a few hours either side of local midnight (e.g. IST = UTC+5:30);
// records that are shown back as a calendar date use this instead.
export function localDateISO(date = DEMO_NOW) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
