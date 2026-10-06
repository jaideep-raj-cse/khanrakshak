// Generates the next sequential ID for a given prefix, matching the style
// already used by seeded records (e.g. "ISSUE-2026-0091", "CA-2026-0041").
// Looks at the existing records so newly created ones never collide with
// seed data or with each other.
export function nextId(prefix, existingIds, year = new Date().getFullYear()) {
  const pattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const max = existingIds.reduce((acc, id) => {
    const match = pattern.exec(id);
    if (!match) return acc;
    return Math.max(acc, parseInt(match[1], 10));
  }, 0);
  const next = String(max + 1).padStart(4, '0');
  return `${prefix}-${year}-${next}`;
}
