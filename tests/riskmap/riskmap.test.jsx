// Run from the project root:  npm run test:documents:ui   (vitest picks up every tests/**/*.test.jsx)
// Drives the REAL /risk-map page (App + router + RoleProvider, as main.jsx wires them) with the
// real Leaflet / React-Leaflet in jsdom: markers, colours, popup, "View Mine" navigation, role
// scope and missing coordinates. The Node suite (npm run test:riskmap) covers the same rules at
// the data layer.
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { render, screen, within, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../../src/App.jsx';
import { RoleProvider } from '../../src/context/RoleContext.jsx';
import { ensureSeeded } from '../../src/services/seedService.js';
import { getMines } from '../../src/services/dataService.js';
import { ROLES } from '../../src/data/roles.js';

// jsdom has no layout, so Leaflet would see a 0x0 map. Give every element a size.
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 });
});

function open(role, mutateMines) {
  window.localStorage.clear();
  ensureSeeded();
  if (mutateMines) window.localStorage.setItem('khanrakshak:mines', JSON.stringify(mutateMines(getMines())));
  window.localStorage.setItem('khanrakshak:currentRole', JSON.stringify(role));
  return render(
    <React.StrictMode>
      <MemoryRouter initialEntries={['/risk-map']}>
        <RoleProvider>
          <App />
        </RoleProvider>
      </MemoryRouter>
    </React.StrictMode>
  );
}

const markers = () => Array.from(document.querySelectorAll('.leaflet-container .leaflet-marker-icon'));
const markerFor = (name) => markers().find((m) => (m.getAttribute('title') ?? '').startsWith(name));
const dot = (marker) => marker.querySelector('span[data-risk-level]');
// jsdom serialises colours as rgb(); compare through a throw-away element.
const rgb = (hex) => {
  const el = document.createElement('div');
  el.style.color = hex;
  return el.style.color;
};

beforeEach(() => cleanup());

describe('Risk Map — all mines (Compliance Officer)', () => {
  it('replaces the placeholder with a real map showing all 10 seeded mines', async () => {
    open(ROLES.COMPLIANCE_OFFICER);
    expect(await screen.findByRole('heading', { name: 'Risk Map' })).toBeTruthy();
    expect(screen.queryByText(/Step 5/)).toBeNull(); // PlaceholderPage copy is gone
    await waitFor(() => expect(markers()).toHaveLength(10));
    expect(document.body.textContent).toMatch(/OpenStreetMap/); // tile attribution
  });

  it('colours markers Low green / Medium amber / High orange / Critical red, with a legend', async () => {
    open(ROLES.COMPLIANCE_OFFICER);
    await waitFor(() => expect(markers()).toHaveLength(10));
    const expected = {
      LOW: ['#10B981', 2],
      MODERATE: ['#D97706', 3],
      HIGH: ['#EA580C', 2],
      CRITICAL: ['#EF4444', 3],
    };
    for (const [level, [hex, count]] of Object.entries(expected)) {
      const dots = markers().map(dot).filter((d) => d.dataset.riskLevel === level);
      expect(dots).toHaveLength(count);
      dots.forEach((d) => expect(d.style.backgroundColor).toBe(rgb(hex)));
    }
    const legend = screen.getByRole('region', { name: 'Risk map legend' });
    ['Low', 'Medium', 'High', 'Critical'].forEach((l) => expect(within(legend).getByText(l)).toBeTruthy());
  });

  it('opens a popup with name, risk level, score, open issues, compliance % and View Mine', async () => {
    open(ROLES.COMPLIANCE_OFFICER);
    await waitFor(() => expect(markers()).toHaveLength(10));
    fireEvent.click(markerFor('Jharia Colliery No. 4'));
    const popup = await waitFor(() => {
      const el = document.querySelector('.leaflet-popup');
      expect(el).toBeTruthy();
      return el;
    });
    const p = within(popup);
    expect(p.getByText('Jharia Colliery No. 4')).toBeTruthy();
    expect(p.getByText('Critical')).toBeTruthy();
    expect(p.getByText('Risk score')).toBeTruthy();
    expect(p.getByText('87 / 100')).toBeTruthy();
    expect(p.getByText('Open issues')).toBeTruthy();
    expect(p.getByText('8')).toBeTruthy();
    expect(p.getByText('Compliance')).toBeTruthy();
    expect(popup.textContent).toMatch(/\d+%/);
    expect(p.getByRole('button', { name: 'View Mine' })).toBeTruthy();
  });

  it('"View Mine" navigates to the existing Mine Detail page', async () => {
    open(ROLES.COMPLIANCE_OFFICER);
    await waitFor(() => expect(markers()).toHaveLength(10));
    fireEvent.click(markerFor('Talcher Seam Extension 2'));
    const button = await screen.findByRole('button', { name: 'View Mine' });
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Talcher Seam Extension 2' })).toBeTruthy();
    expect(screen.getByText(/Back to Mines/)).toBeTruthy();
    expect(screen.getByText(/MINE-TAL-02/)).toBeTruthy();
  });
});

describe('Risk Map — role scope', () => {
  it('Field Officer sees only its 3 permitted mines', async () => {
    open(ROLES.FIELD_OFFICER);
    await waitFor(() => expect(markers()).toHaveLength(3));
    const titles = markers().map((m) => m.getAttribute('title'));
    ['Jharia Colliery No. 4', 'Korba Opencast Block 11', 'Talcher Seam Extension 2'].forEach((n) =>
      expect(titles.some((t) => t.startsWith(n))).toBe(true)
    );
    expect(markerFor('Singrauli Underground 7')).toBeUndefined();
    expect(screen.getByText(/3 assigned mines/)).toBeTruthy();
  });

  it('Mine Manager sees only the mine it manages', async () => {
    open(ROLES.MINE_MANAGER);
    await waitFor(() => expect(markers()).toHaveLength(1));
    expect(markerFor('Jharia Colliery No. 4')).toBeTruthy();
    expect(screen.getByText(/1 assigned mine\b/)).toBeTruthy();
  });

  it('Administrator sees all 10', async () => {
    open(ROLES.ADMINISTRATOR);
    await waitFor(() => expect(markers()).toHaveLength(10));
  });
});

describe('Risk Map — missing coordinates', () => {
  it('lists mines without coordinates instead of dropping them or crashing', async () => {
    open(ROLES.COMPLIANCE_OFFICER, (mines) =>
      mines.map((m, i) => (i < 2 ? { ...m, latitude: null, longitude: null } : m))
    );
    await waitFor(() => expect(markers()).toHaveLength(8));
    expect(screen.getByText('Not shown on map (2)')).toBeTruthy();
    expect(screen.getAllByText(/Coordinates not available/)).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'View Mine' })).toHaveLength(2);
  });

  it('shows an empty state (and no map) when no mine in scope has coordinates', async () => {
    open(ROLES.FIELD_OFFICER, (mines) => mines.map((m) => ({ ...m, latitude: undefined, longitude: undefined })));
    expect(await screen.findByText('No mine coordinates available')).toBeTruthy();
    expect(document.querySelector('.leaflet-container')).toBeNull();
    expect(screen.getByText('Not shown on map (3)')).toBeTruthy();
  });
});
