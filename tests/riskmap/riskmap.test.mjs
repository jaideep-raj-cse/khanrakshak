// Run from the project root:  npm run test:riskmap
// Verifies the GIS Risk Map data layer (src/services/riskMapService.js) without a browser:
// every seeded mine has coordinates, marker colours follow risk, popup figures come from the
// existing data, "View Mine" targets real mines, role scope is respected, missing coordinates
// are handled, and old browser data is back-filled without being wiped.
import { fileURLToPath } from 'node:url';
const SRC = fileURLToPath(new URL('../../src', import.meta.url));
const imp = (p) => import(`${SRC}/${p}`);

const { storage } = await imp('storage/localStorage.js');
const { ensureSeeded, backfillMineCoordinates } = await imp('services/seedService.js');
const { SEED_VERSION } = await imp('data/seedData.js');
const data = await imp('services/dataService.js');
const access = await imp('services/accessService.js');
const { ROLES } = await imp('data/roles.js');
const { RISK_COLORS } = await imp('data/constants.js');
const { getRiskLevel } = await imp('riskEngine/riskEngine.js');
const map = await imp('services/riskMapService.js');

let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${n} ${c ? '' : x}`); };
const section = (t) => console.log(`\n== ${t}`);
const ids = (rows) => rows.map((r) => r.id).sort();
const fresh = () => { globalThis.__store.clear(); ensureSeeded(); };
const ALL_IDS = ['BKR-06', 'JHR-04', 'JHR-12', 'KOR-11', 'KOR-17', 'NKP-05', 'RAN-03', 'RMG-09', 'SNG-07', 'TAL-02'].map((c) => `MINE-${c}`);

fresh();
const mines = data.getMines();

section('1. All seeded mines carry coordinates');
check('10 seeded mines', mines.length === 10);
check('every mine has valid latitude / longitude', mines.every(map.hasValidCoordinates));
check('coordinates sit inside India\'s bounding box', mines.every((m) => m.latitude > 8 && m.latitude < 37 && m.longitude > 68 && m.longitude < 98));
check('no two mines share a position (markers never stack exactly)', new Set(mines.map((m) => `${m.latitude},${m.longitude}`)).size === 10);
const dist = (a, b) => Math.hypot((a.latitude - b.latitude) * 111, (a.longitude - b.longitude) * 102);
const byId = Object.fromEntries(mines.map((m) => [m.id, m]));
check('the two Jharia mines are a few km apart (distinguishable at region zoom)', dist(byId['MINE-JHR-04'], byId['MINE-JHR-12']) > 2);
check('the two Korba mines are a few km apart', dist(byId['MINE-KOR-11'], byId['MINE-KOR-17']) > 2);
check('SEED_VERSION is unchanged (5) — no reseed, no data wipe', SEED_VERSION === 5 && storage.read(storage.KEYS.SEED_VERSION) === 5);

section('2. Compliance Officer / Administrator see every mine on the map');
for (const role of [ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR]) {
  const d = map.getRiskMapData(role);
  check(`${role}: 10 visible, 10 mapped, 0 unmapped`, d.total === 10 && d.mapped.length === 10 && d.unmapped.length === 0);
  check(`${role}: all 10 seeded mine ids present`, JSON.stringify(ids(d.mapped)) === JSON.stringify(ALL_IDS));
}
const all = map.getRiskMapData(ROLES.ADMINISTRATOR);

section('3. Marker colours follow risk (Low green / Medium amber / High orange / Critical red)');
check('palette is green / amber / orange / red', RISK_COLORS.LOW === '#10B981' && RISK_COLORS.MODERATE === '#D97706' && RISK_COLORS.HIGH === '#EA580C' && RISK_COLORS.CRITICAL === '#EF4444');
check('four distinct colours', new Set(Object.values(RISK_COLORS)).size === 4);
check('every marker colour = colour of its risk level', all.mapped.every((r) => r.color === RISK_COLORS[r.riskLevel]));
check('every level is derived from the score (riskEngine bands)', all.mapped.every((r) => r.riskLevel === getRiskLevel(r.riskScore)));
const levelsPresent = new Set(all.mapped.map((r) => r.riskLevel));
check('the seed exercises all four colours on the map', ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'].every((l) => levelsPresent.has(l)), [...levelsPresent].join());
const expected = { 'MINE-JHR-04': 'CRITICAL', 'MINE-TAL-02': 'CRITICAL', 'MINE-RAN-03': 'CRITICAL', 'MINE-NKP-05': 'HIGH', 'MINE-JHR-12': 'HIGH', 'MINE-KOR-11': 'MODERATE', 'MINE-RMG-09': 'MODERATE', 'MINE-BKR-06': 'MODERATE', 'MINE-SNG-07': 'LOW', 'MINE-KOR-17': 'LOW' };
check('per-mine colours: 3 red, 2 orange, 3 amber, 2 green', all.mapped.every((r) => r.riskLevel === expected[r.id]), all.mapped.map((r) => `${r.id}:${r.riskLevel}`).join(' '));
check('map level agrees with the level stored on each mine (Mines list / Mine Detail)', all.mapped.every((r) => r.riskLevel === byId[r.id].riskLevel));
check('legend lists Low, Medium, High, Critical with the same colours', JSON.stringify(map.RISK_LEGEND.map((l) => [l.label, l.color])) === JSON.stringify([['Low', '#10B981'], ['Medium', '#D97706'], ['High', '#EA580C'], ['Critical', '#EF4444']]));

section('4. Popup content comes from the existing data');
const stats = Object.fromEntries(data.getMinesWithStats().map((m) => [m.id, m]));
check('every popup row has name, level, score, open issues, compliance %', all.mapped.every((r) => r.name && r.riskLabel && Number.isInteger(r.riskScore) && Number.isInteger(r.openIssues) && Number.isInteger(r.compliancePct)));
check('name matches the mine record', all.mapped.every((r) => r.name === byId[r.id].name));
check('open issues = the same count the Mines list shows', all.mapped.every((r) => r.openIssues === stats[r.id].openIssues));
check('risk score = highest open-issue score from the risk engine', all.mapped.every((r) => { const open = data.getIssuesByMine(r.id).filter((i) => i.status !== 'CLOSED'); return r.riskScore === (open.length ? Math.max(...open.map((i) => i.riskScore)) : 0); }));
check('risk score and compliance % are 0–100', all.mapped.every((r) => r.riskScore >= 0 && r.riskScore <= 100 && r.compliancePct >= 0 && r.compliancePct <= 100));
check('compliance % is higher for Compliant mines than Non-Compliant ones', Math.min(...all.mapped.filter((r) => r.complianceStatus === 'COMPLIANT').map((r) => r.compliancePct)) > Math.max(...all.mapped.filter((r) => r.complianceStatus === 'NON_COMPLIANT').map((r) => r.compliancePct)));

section('5. "View Mine" navigates to the existing Mine Detail route');
check('path is /mines/:mineId', map.mineDetailPath('MINE-JHR-04') === '/mines/MINE-JHR-04');
check('every marker\'s path resolves to a real mine', all.mapped.every((r) => data.getMineById(map.mineDetailPath(r.id).split('/').pop())));
check('every marker\'s Mine Detail is openable by the role seeing the marker (canViewMine)', all.mapped.every((r) => access.canViewMine(ROLES.ADMINISTRATOR, r.id)));

section('6. Role scope');
const fo = map.getRiskMapData(ROLES.FIELD_OFFICER);
const mm = map.getRiskMapData(ROLES.MINE_MANAGER);
check('Field Officer → its 3 permitted mines only', JSON.stringify(ids(fo.mapped)) === JSON.stringify(['MINE-JHR-04', 'MINE-KOR-11', 'MINE-TAL-02']) && fo.total === 3);
check('Mine Manager (Sunita Rao) → only the mine it manages', JSON.stringify(ids(mm.mapped)) === JSON.stringify(['MINE-JHR-04']) && mm.total === 1);
check('scoped roles see exactly accessService.getVisibleMines', JSON.stringify(ids(fo.mapped)) === JSON.stringify(access.getVisibleMines(ROLES.FIELD_OFFICER).map((m) => m.id).sort()));
check('no scoped marker is outside the role\'s scope', [...fo.mapped].every((r) => access.canViewMine(ROLES.FIELD_OFFICER, r.id)) && mm.mapped.every((r) => access.canViewMine(ROLES.MINE_MANAGER, r.id)));
check('scoped roles do not leak other mines (7 / 9 hidden)', !ids(fo.mapped).includes('MINE-SNG-07') && !ids(mm.mapped).includes('MINE-TAL-02'));
check('a single-mine scope still yields bounds (page caps the zoom)', mm.bounds !== null && mm.bounds[0][0] === mm.bounds[1][0]);
check('a scoped mine shows the same figures as the global view', JSON.stringify(mm.mapped[0]) === JSON.stringify(all.mapped.find((r) => r.id === 'MINE-JHR-04')));
check('an unknown role sees nothing and does not throw', (() => { const d = map.getRiskMapData('NOPE'); return d.total === 0 && d.mapped.length === 0 && d.bounds === null; })());

section('6b. Route wiring');
{
  const { readFileSync } = await import('node:fs');
  const app = readFileSync(`${SRC}/App.jsx`, 'utf8');
  check('/risk-map no longer uses PlaceholderPage', !/path="\/risk-map"[^\n]*PlaceholderPage/.test(app));
  check('/risk-map renders <RiskMap /> behind the riskMap nav permission', /path="\/risk-map"[^\n]*navId="riskMap"[^\n]*<RiskMap \/>/.test(app));
  check('Analytics is a real page now (Step 6), not a placeholder', /path="\/analytics"[^\n]*<Analytics \/>/.test(app) && !/path="\/analytics"[^\n]*PlaceholderPage/.test(app));
  const page = readFileSync(`${SRC}/pages/RiskMap.jsx`, 'utf8');
  check('uses OpenStreetMap tiles and no paid map API / key', page.includes('tile.openstreetmap.org') && !/mapbox|googleapis\.com\/maps|api[_-]?key|access_token/i.test(page));
  check('no browser/network calls added (no fetch / axios)', !/\bfetch\(|axios/.test(page));
}

section('7. Fit / centre around the seeded coordinates');
const b = all.bounds;
check('bounds enclose every mapped mine', all.mapped.every((r) => r.latitude >= b[0][0] && r.latitude <= b[1][0] && r.longitude >= b[0][1] && r.longitude <= b[1][1]));
check('bounds are tight (touched by real mines, not padded)', all.mapped.some((r) => r.latitude === b[0][0]) && all.mapped.some((r) => r.latitude === b[1][0]) && all.mapped.some((r) => r.longitude === b[0][1]) && all.mapped.some((r) => r.longitude === b[1][1]));
check('bounds ignore mines without coordinates', JSON.stringify(map.getMapBounds([{ latitude: 10, longitude: 20 }, { latitude: null, longitude: 5 }, { latitude: 12, longitude: 22 }])) === JSON.stringify([[10, 20], [12, 22]]));
check('no mines → null bounds', map.getMapBounds([]) === null && map.getMapBounds([{ latitude: 'x', longitude: 1 }]) === null);

section('8. Missing / invalid coordinates are handled gracefully');
const V = map.hasValidCoordinates;
check('valid pair accepted', V({ latitude: 23.7, longitude: 86.4 }));
check('missing / null / undefined rejected', !V({}) && !V({ latitude: null, longitude: null }) && !V({ latitude: 23.7 }) && !V({ longitude: 86.4 }) && !V(null) && !V(undefined));
check('strings (incl. blank) rejected', !V({ latitude: '23.7', longitude: '86.4' }) && !V({ latitude: '', longitude: '' }));
check('NaN / Infinity rejected', !V({ latitude: NaN, longitude: 80 }) && !V({ latitude: 20, longitude: Infinity }));
check('out-of-range rejected', !V({ latitude: 91, longitude: 80 }) && !V({ latitude: 20, longitude: -181 }));
check('0,0 placeholder rejected', !V({ latitude: 0, longitude: 0 }));
check('real zero on one axis still accepted', V({ latitude: 0, longitude: 80 }));
{
  const stored = data.getMines().map((m) => ({ ...m }));
  delete stored[0].latitude; delete stored[0].longitude; // JHR-04: fields absent
  stored[1].latitude = null; stored[1].longitude = null; // KOR-11: null
  stored[2].latitude = '20.95'; stored[2].longitude = '85.21'; // TAL-02: strings
  storage.write(storage.KEYS.MINES, stored);
  let d, threw = false;
  try { d = map.getRiskMapData(ROLES.ADMINISTRATOR); } catch { threw = true; }
  check('page data builds without throwing', !threw);
  check('7 mapped, 3 unmapped — nothing dropped silently', d.mapped.length === 7 && d.unmapped.length === 3 && d.total === 10);
  check('unmapped = exactly the 3 broken mines, and they keep their risk figures', JSON.stringify(ids(d.unmapped)) === JSON.stringify(['MINE-JHR-04', 'MINE-KOR-11', 'MINE-TAL-02']) && d.unmapped.every((r) => r.riskLevel && Number.isInteger(r.riskScore)));
  check('bounds are computed from the 7 mapped mines only', d.bounds !== null && d.mapped.every((r) => r.latitude >= d.bounds[0][0] && r.latitude <= d.bounds[1][0]));
  const fo2 = map.getRiskMapData(ROLES.FIELD_OFFICER);
  check('scope + missing coordinates combine (Field Officer: 0 mapped, 3 listed)', fo2.total === 3 && fo2.mapped.length === 0 && fo2.unmapped.length === 3 && fo2.bounds === null);
  const noneStored = data.getMines().map((m) => ({ ...m, latitude: undefined, longitude: undefined }));
  storage.write(storage.KEYS.MINES, noneStored);
  const dn = map.getRiskMapData(ROLES.ADMINISTRATOR);
  check('all coordinates missing → 0 mapped, 10 listed, null bounds', dn.mapped.length === 0 && dn.unmapped.length === 10 && dn.bounds === null);
}

section('9. Figures are live, not copied');
fresh();
{
  const before = map.getRiskMapData(ROLES.ADMINISTRATOR).mapped.find((r) => r.id === 'MINE-SNG-07');
  check('SNG-07 starts with 1 open issue', before.openIssues === 1 && before.riskLevel === 'LOW');
  const issue = data.getIssuesByMine('MINE-SNG-07').find((i) => i.status !== 'CLOSED');
  data.updateIssue(issue.id, { status: 'CLOSED' });
  const after = map.getRiskMapData(ROLES.ADMINISTRATOR).mapped.find((r) => r.id === 'MINE-SNG-07');
  check('closing its issue → 0 open, score 0, still Low, compliance 100%', after.openIssues === 0 && after.riskScore === 0 && after.riskLevel === 'LOW' && after.compliancePct === 100);
  const j = data.getIssuesByMine('MINE-JHR-04').filter((i) => i.status !== 'CLOSED').sort((a, c) => c.riskScore - a.riskScore);
  data.updateIssue(j[0].id, { status: 'CLOSED' });
  const jr = map.getRiskMapData(ROLES.ADMINISTRATOR).mapped.find((r) => r.id === 'MINE-JHR-04');
  check('closing JHR-04\'s worst issue lowers its score to the next-worst', jr.riskScore === j[1].riskScore && jr.openIssues === j.length - 1);
}

section('10. Browsers holding earlier (v5) data get coordinates without a reset');
fresh();
{
  const original = data.getMines();
  // Simulate a browser seeded before this step: no coordinates, plus user-made changes elsewhere.
  const old = original.map(({ latitude, longitude, ...rest }) => rest);
  old[3] = { ...old[3], manager: 'Edited Manager' };
  old.push({ id: 'MINE-USER-01', name: 'User Added Mine', region: 'Somewhere', manager: 'X', status: 'ACTIVE', riskLevel: 'LOW', complianceStatus: 'COMPLIANT', lastInspection: null });
  storage.write(storage.KEYS.MINES, old);
  const issuesBefore = JSON.stringify(data.getIssues());
  ensureSeeded();
  const after = data.getMines();
  const get = (id) => after.find((m) => m.id === id);
  check('all 10 seeded mines regain their coordinates', original.every((o) => get(o.id).latitude === o.latitude && get(o.id).longitude === o.longitude));
  check('a user edit on a mine survives (manager stays "Edited Manager")', get(old[3].id).manager === 'Edited Manager');
  check('a mine unknown to the seed is left alone (no coordinates invented)', get('MINE-USER-01') && !('latitude' in get('MINE-USER-01')));
  check('it lands in the "not shown on map" list rather than crashing the page', map.getRiskMapData(ROLES.ADMINISTRATOR).unmapped.some((r) => r.id === 'MINE-USER-01'));
  check('issues and every other collection are untouched', JSON.stringify(data.getIssues()) === issuesBefore);
  check('seed version stays 5', storage.read(storage.KEYS.SEED_VERSION) === 5);
  const raw = globalThis.__store.get(storage.KEYS.MINES);
  backfillMineCoordinates();
  check('running it again changes nothing (idempotent)', globalThis.__store.get(storage.KEYS.MINES) === raw);
  const withCoords = original.map((o) => ({ ...o, latitude: 1.5, longitude: 2.5 }));
  storage.write(storage.KEYS.MINES, withCoords);
  backfillMineCoordinates();
  check('existing coordinates are never overwritten', data.getMines().every((m) => m.latitude === 1.5 && m.longitude === 2.5));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
