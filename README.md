# KhanRakshak — Prototype (Step 2: Core Data Surfaces)

AI-assisted smart governance & compliance monitoring for coal mines — SIH prototype.
This is a frontend-only demo. No real DGMS data, sensors, or government systems are connected.

## Run locally

This sandbox has no network access, so dependencies could not be installed or
build-verified here. On your own machine:

```bash
npm install
npm run dev
```

Then open the printed local URL (typically http://localhost:5173).

## What's built (Step 1 of the plan in the master prompt)

- Vite + React + Tailwind CSS project scaffold
- Design tokens in `tailwind.config.js` (colors, radii, fonts) taken from the
  approved palette (spec §7–10), with component styling cues from the Stitch
  design system where they don't involve out-of-scope features (gas telemetry,
  SCADA, sign-off stamps, etc. were intentionally excluded)
- `RoleProvider` (`src/context/RoleContext.jsx`) — demo persona state,
  persisted to LocalStorage, with a role → nav-visibility permission matrix
  (`src/data/roles.js`)
- LocalStorage service (`src/storage/localStorage.js`) — single namespaced
  read/write/remove layer everything else in the app uses
- Seed data + seeding service (`src/data/seedData.js`,
  `src/services/seedService.js`) — seeds 4 demo mines on first load, plus a
  `resetDemoData()` utility for the future "Reset Demo Data" control
- AppShell: role-aware collapsible `Sidebar`, `Topbar` (breadcrumb, search
  placeholder, notification icon, persona indicator, persistent
  "PROTOTYPE / DEMONSTRATION DATA" banner)
- `Login` — four-role persona selection screen
- `Dashboard` — role-personalized shell wired to **real** seeded state (mine
  count, open issues, high/critical risk count, risk distribution, high-risk
  mines list) rather than static numbers
- Full routing foundation for every route in spec §13, gated behind a demo
  `RequireRole` guard; unbuilt routes render an honest "scheduled for Step N"
  placeholder instead of a dead link or fake content

## What's built (Step 2: Core Data Surfaces)

- **Data model** (`src/data/seedData.js`, bumped to `SEED_VERSION = 2`) — 4
  mines, 9 issues, 6 corrective actions, related by `mineId` / `issueId`.
  `openIssues`/`pendingActions`/`overdueActions` are no longer static fields
  on the mine record — they're computed from the issues/actions collections
  (`src/services/dataService.js`), so the counts can never drift out of sync
  with the underlying records
- **`src/services/dataService.js`** — single read/join layer (`getMines*`,
  `getIssues*`, `getCorrectiveActions*`, `*WithRelations`, `withMineStats`)
  that every page reads through, instead of touching LocalStorage directly
- **`src/utils/date.js`** — `DEMO_NOW` + `isOverdue()`; overdue state is
  always calculated from `dueDate` vs. today, never a hardcoded label. Seeded
  due dates intentionally straddle today's date so 3 actions show overdue
- **`src/workflows/timeline.js`** — derives each issue's audit-style timeline
  from its own + its corrective action's actual state (created → risk
  calculated → CA created → overdue/escalated → verified/closed), rather
  than a hand-authored list per record
- **New reusable UI**: `DataTable` (sortable columns, empty state built in),
  `StatusBadge` (tone-based, covers mine compliance + issue + corrective
  action lifecycle), `SearchBar`, `FilterSelect`, `EmptyState`, `Timeline`
- **Mines** (`/mines`) — searchable/filterable/sortable table (risk,
  compliance, open issues, pending/overdue actions, last inspection);
  row click → Mine Detail
- **Mine Detail** (`/mines/:mineId`) — KPI summary, linked Issues list,
  linked Corrective Actions list, honest "Inspection History arrives in
  Step 3" panel
- **Issues & Violations** (`/issues`) — table with status/risk/mine filters
  + search; row click → Issue Detail
- **Issue Detail** (`/issues/:issueId`) — description, risk gauge + reasons
  (seeded demo values, explicitly labeled "Prototype Risk Intelligence
  Engine — rule-based demonstration model, live engine in Step 3"),
  corrective action panel, derived timeline, and an honest "Evidence
  capture arrives with the inspection workflow" placeholder instead of
  fake upload UI
- **Corrective Actions** (`/corrective-actions`) — status/priority/mine
  filters, overdue column computed live; row click opens the parent issue
  (no separate action-detail route exists in the spec's route table)

All five surfaces are read-only in this step — no edit/assign/verify
actions are offered yet, since that workflow belongs to Steps 3–4.

## Known limitations (by design, for this step)

- Risk scores/reasons on issues are seeded, not computed — Step 3 builds the
  actual Severity/Recurrence/Exposure/Delay engine
- No evidence/photo upload yet (Step 3, part of the inspection wizard)
- No verify/reject/close actions yet (Step 4)
- Corrective Actions has no dedicated detail route, per the spec's route
  table — it links back to the parent issue instead

## What remains (per the master prompt's build plan)

- **Step 3** — Inspection wizard + the submission pipeline (inspection →
  observation → issue → risk calculation → corrective action → audit event)
  and the risk engine itself
- **Step 4** — Status transitions, escalation, verification & closure, audit
  trail, notifications
- **Step 5** — Analytics, contractors, GIS risk map, documents/OCR
- **Step 6** — Responsive polish, empty/loading/error states everywhere,
  visual QA, demo reset wired into the UI

## Folder structure

```
src/
├── components/
│   ├── ui/        # Card, KpiCard, PageHeader, RiskBadge, StatusBadge,
│   │              # DataTable, SearchBar, FilterSelect, EmptyState, Timeline
│   └── layout/    # AppShell, Sidebar, Topbar
├── context/       # RoleContext
├── data/          # roles.js, seedData.js, constants.js
├── services/      # seedService.js, dataService.js
├── storage/       # localStorage.js
├── pages/         # Login, Dashboard, Mines, MineDetail, Issues,
│                  # IssueDetail, CorrectiveActions, PlaceholderPage
├── router/        # RequireRole
├── workflows/     # timeline.js (Step 3 adds the inspection pipeline here)
├── riskEngine/    # (Step 3)
├── audit/         # (Step 4)
└── utils/         # date.js
```
