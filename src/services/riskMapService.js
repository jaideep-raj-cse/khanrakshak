// Data layer for the GIS Risk Map (/risk-map). Pure logic, no React and no Leaflet, so it can be
// verified in Node. It reads existing mine / issue data through dataService + accessService —
// nothing is duplicated or stored here.
//
// DEFINITIONS (shown on the page as well, so the demo is honest about them)
//
//   Risk score      Highest current risk score among the mine's OPEN issues (0 if none). This is
//                   the same rule the seed uses to set each mine's stored riskLevel, but it is
//                   recomputed on read (via dataService.getIssuesByMine → riskEngine) so the
//                   score and level can never disagree with each other.
//   Risk level      riskEngine.getRiskLevel(score)  → LOW / MODERATE ("Medium") / HIGH / CRITICAL.
//   Open issues     Issues at the mine whose status is not CLOSED (same as the Mines list).
//   Compliance %    PROTOTYPE INDICATOR. The data model stores only a compliance STATUS per
//                   mine (Compliant / Under Review / Non-Compliant), not a percentage, so this is
//                   derived: 100 − average risk score of the mine's open issues (100 when there
//                   are none). Higher is better. It is a different lens from the risk score
//                   (average burden across all open issues vs. the single worst one).
//
// Scope comes from accessService.getVisibleMines: Field Officer → assigned mines, Mine Manager →
// the mine(s) it manages, Compliance Officer / Administrator → all mines.
import { getIssuesByMine } from './dataService';
import { getVisibleMines } from './accessService';
import { getRiskLevel, getRiskLevelLabel } from '../riskEngine/riskEngine';
import { RISK_COLORS } from '../data/constants';

// Display order for the legend (low → critical).
export const RISK_LEGEND = ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].map((level) => ({
  level,
  label: getRiskLevelLabel(level),
  color: RISK_COLORS[level],
}));

export function mineDetailPath(mineId) {
  return `/mines/${mineId}`;
}

/**
 * A usable map position: two finite NUMBERS in range. Strings, null, undefined, NaN and
 * Infinity are rejected (Number('') === 0 would otherwise sneak a blank field onto the equator),
 * and so is the exact 0,0 pair, which is a placeholder rather than a mine location.
 */
export function hasValidCoordinates(mine) {
  const lat = mine?.latitude;
  const lng = mine?.longitude;
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

const clampPct = (n) => Math.min(100, Math.max(0, Math.round(n)));

/** Risk / compliance / open-issue figures for one mine, computed from its issues. */
export function getMineRiskSummary(mineId) {
  const open = getIssuesByMine(mineId).filter((i) => i.status !== 'CLOSED');
  const scores = open.map((i) => Number(i.riskScore) || 0);
  const riskScore = scores.length ? Math.max(...scores) : 0;
  const average = scores.length ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0;
  const riskLevel = getRiskLevel(riskScore);
  return {
    riskScore,
    riskLevel,
    riskLabel: getRiskLevelLabel(riskLevel),
    color: RISK_COLORS[riskLevel],
    openIssues: open.length,
    compliancePct: clampPct(100 - average),
  };
}

/** Map bounds ([[south, west], [north, east]]) around the given mines, or null if none. */
export function getMapBounds(mines) {
  const pts = mines.filter(hasValidCoordinates);
  if (!pts.length) return null;
  const lats = pts.map((m) => m.latitude);
  const lngs = pts.map((m) => m.longitude);
  return [
    [Math.min(...lats), Math.min(...lngs)],
    [Math.max(...lats), Math.max(...lngs)],
  ];
}

/**
 * Everything the Risk Map page needs for a role.
 *   total     mines the role may see
 *   mapped    those with valid coordinates (these get markers)
 *   unmapped  those without (listed beside the map instead of silently dropped)
 *   bounds    bounds around the mapped mines, or null
 */
export function getRiskMapData(role) {
  const rows = getVisibleMines(role).map((mine) => ({
    id: mine.id,
    name: mine.name,
    region: mine.region,
    manager: mine.manager,
    complianceStatus: mine.complianceStatus,
    latitude: mine.latitude,
    longitude: mine.longitude,
    ...getMineRiskSummary(mine.id),
  }));
  const mapped = rows.filter(hasValidCoordinates);
  const unmapped = rows.filter((r) => !hasValidCoordinates(r));
  return { total: rows.length, mapped, unmapped, bounds: getMapBounds(mapped) };
}
