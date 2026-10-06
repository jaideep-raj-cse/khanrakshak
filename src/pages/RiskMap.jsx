import React, { useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import Card from '../components/ui/Card';
import RiskBadge from '../components/ui/RiskBadge';
import EmptyState from '../components/ui/EmptyState';
import { getRiskMapData, mineDetailPath, RISK_LEGEND } from '../services/riskMapService';
import { useRole } from '../context/RoleContext';
import { ROLES } from '../data/roles';

// OpenStreetMap standard tiles — free, no API key. The attribution is required by OSM.
const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

// Roughly central India; only the starting view before the map fits itself to the mines.
const FALLBACK_CENTER = [22.5, 84.5];
const FALLBACK_ZOOM = 5;
// Keeps a single-mine view (e.g. a Mine Manager) from zooming to street level.
const FIT_OPTIONS = { padding: [56, 56], maxZoom: 9 };

// A divIcon (plain HTML) instead of Leaflet's default image marker: no image assets for the
// bundler to mis-resolve, and the risk score is printed on the marker so the level is not
// conveyed by colour alone. Styles for .kr-risk-marker live in index.css.
function buildIcon(row) {
  return L.divIcon({
    className: 'kr-risk-marker',
    html: `<span data-risk-level="${row.riskLevel}" style="background:${row.color}">${row.riskScore}</span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -19],
  });
}

// Fits/centres the map around the mapped mines whenever that set changes (e.g. role switch).
function FitToMines({ bounds }) {
  const map = useMap();
  const key = bounds ? bounds.flat().join(',') : '';
  useEffect(() => {
    if (!bounds) return;
    const size = map.getSize();
    if (!size.x || !size.y) {
      // Container not laid out yet (hidden / zero-size): centre only, fitBounds would fail.
      map.setView(L.latLngBounds(bounds).getCenter(), 7);
      return;
    }
    map.fitBounds(bounds, FIT_OPTIONS);
    // `key` is the stable identity of `bounds`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function Stat({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-6 py-1">
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className="text-sm font-mono">{children}</dd>
    </div>
  );
}

function MinePopup({ row }) {
  const navigate = useNavigate();
  return (
    <div className="min-w-[210px]">
      <div className="text-sm font-semibold leading-snug">{row.name}</div>
      <div className="text-[11px] font-mono text-text-secondary mt-0.5">
        {row.id} · {row.region}
      </div>
      <dl className="mt-2 border-t border-border pt-1.5">
        <Stat label="Risk level">
          <RiskBadge level={row.riskLevel} />
        </Stat>
        <Stat label="Risk score">{row.riskScore} / 100</Stat>
        <Stat label="Open issues">{row.openIssues}</Stat>
        <Stat label="Compliance">{row.compliancePct}%</Stat>
      </dl>
      <button
        type="button"
        onClick={() => navigate(mineDetailPath(row.id))}
        className="mt-3 w-full h-8 rounded-btn bg-amber-base hover:bg-amber-active text-white text-xs font-semibold"
      >
        View Mine
      </button>
    </div>
  );
}

function Legend() {
  return (
    <section
      aria-label="Risk map legend"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 mb-3 bg-surface border border-border rounded-card"
    >
      <span className="text-xs font-semibold tracking-wide">Risk level</span>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {RISK_LEGEND.map((item) => (
          <li key={item.level} className="flex items-center gap-1.5 text-xs">
            <span
              data-legend-level={item.level}
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </li>
        ))}
      </ul>
      <span className="text-xs text-text-secondary sm:ml-auto">Marker number = mine risk score (0–100)</span>
    </section>
  );
}

function UnmappedMines({ rows }) {
  if (!rows.length) return null;
  return (
    <Card title={`Not shown on map (${rows.length})`} className="mt-4">
      <p className="text-xs text-text-secondary mb-2">
        These mines have no valid coordinates on record, so they cannot be placed on the map.
      </p>
      <ul className="divide-y divide-elevated">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{row.name}</div>
              <div className="text-xs font-mono text-text-secondary">
                {row.id} · {row.region} · Coordinates not available
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <RiskBadge level={row.riskLevel} />
              <Link to={mineDetailPath(row.id)} className="text-xs text-amber hover:underline">
                View Mine
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function RiskMap() {
  const { role } = useRole();
  const { total, mapped, unmapped, bounds } = useMemo(() => getRiskMapData(role), [role]);
  const icons = useMemo(() => new Map(mapped.map((row) => [row.id, buildIcon(row)])), [mapped]);

  const isGlobal = role === ROLES.COMPLIANCE_OFFICER || role === ROLES.ADMINISTRATOR;
  const subtitle = isGlobal
    ? `${total} mines under active monitoring`
    : `${total} assigned mine${total === 1 ? '' : 's'}`;
  const placed = unmapped.length ? ` · ${mapped.length} placed on map` : '';

  return (
    <div>
      <PageHeader title="Risk Map" subtitle={`${subtitle}${placed}`} />

      {total === 0 ? (
        <div className="bg-surface border border-border rounded-card">
          <EmptyState
            icon={MapPin}
            title="No mines in your scope"
            description="There are no mines assigned to this role, so there is nothing to show on the map."
          />
        </div>
      ) : (
        <>
          <Legend />

          {mapped.length === 0 ? (
            <div className="bg-surface border border-border rounded-card">
              <EmptyState
                icon={MapPin}
                title="No mine coordinates available"
                description="None of the mines in your scope has valid coordinates, so the map cannot be drawn. They are listed below."
              />
            </div>
          ) : (
            // `relative z-0` gives the map its own stacking context so Leaflet's panes and
            // controls (z-index up to 1000) can never paint over the top bar or modals.
            <div
              role="region"
              aria-label="Mine risk map"
              className="relative z-0 overflow-hidden border border-border rounded-card"
              style={{ height: 'min(640px, calc(100vh - 300px))', minHeight: 420 }}
            >
              <MapContainer center={FALLBACK_CENTER} zoom={FALLBACK_ZOOM} className="h-full w-full">
                <TileLayer url={OSM_URL} attribution={OSM_ATTRIBUTION} maxZoom={19} />
                <FitToMines bounds={bounds} />
                {mapped.map((row) => (
                  <Marker
                    key={row.id}
                    position={[row.latitude, row.longitude]}
                    icon={icons.get(row.id)}
                    title={`${row.name} — ${row.riskLabel} risk`}
                    alt={`${row.name}, ${row.riskLabel} risk`}
                    riseOnHover
                  >
                    <Popup className="kr-popup" minWidth={230} maxWidth={280}>
                      <MinePopup row={row} />
                    </Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
          )}

          <UnmappedMines rows={unmapped} />

          <p className="text-[11px] text-text-muted mt-3 max-w-3xl">
            Prototype data: mine locations are approximate and illustrative, and the mines are fictional. Risk
            score is the highest current score among a mine&apos;s open issues. Compliance % is a prototype
            indicator (100 minus the average open-issue risk score), not a statutory figure. The map tiles
            below are loaded from OpenStreetMap and need an internet connection to display — the rest of this
            app works fully offline.
          </p>
        </>
      )}
    </div>
  );
}
