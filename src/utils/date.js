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

export function isOverdue(dueDateIso, status) {
  if (CLOSED_LIKE_STATUSES.has(status)) return false;
  const due = parseDate(dueDateIso);
  if (!due) return false;
  return due.getTime() < DEMO_NOW.getTime();
}

export function daysBetween(fromIso, toDate = DEMO_NOW) {
  const from = parseDate(fromIso);
  if (!from) return null;
  const ms = toDate.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function formatDate(iso) {
  const d = parseDate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
