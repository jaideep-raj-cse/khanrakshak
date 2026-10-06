# KhanRakshak — Prototype (Step 7: Dashboard / Command Center, on top of Step 6 Analytics, Step 5c GIS Risk Map, Step 5b Document Intelligence (mock), Step 5a Contractors and Step 4 roles, verification & escalation)

AI-assisted smart governance & compliance monitoring for coal mines — SIH prototype.
This is a frontend-only demo. No real DGMS data, sensors, or government systems are connected.

## Run locally

```bash
npm install
npm run dev      # development server
npm run build    # production build
npm test         # all test suites (Node-only suites + the jsdom UI flow)
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
  `src/services/seedService.js`) — seeds the demo dataset on first load, plus a
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

All five Step 2 surfaces were read-only; Step 3 adds the first piece of
real, stateful workflow (inspection submission).

## What's built (Step 3: Risk Engine + Inspection Wizard + Submission Pipeline)

- **Risk engine** (`src/riskEngine/riskEngine.js`) — `calculateRisk(input, currentDemoDate)`,
  the exact weighted formula from the spec (Severity 40% / Recurrence 25% /
  Exposure 20% / Delay 15%), returning `{ riskScore, riskLevel, reasons, breakdown }`.
  Deterministic and fully explainable — no ML model involved
- **Risk is computed on every read, never cached.** `src/data/seedData.js`
  issues now store raw inputs (`severity`, `recurrenceCount`, `exposureLevel`,
  `exposureWorkers`) instead of a precomputed score. `dataService.computeIssueRisk()`
  feeds those plus the linked corrective action's deadline (only if it's still
  open — a verified/closed action no longer inflates risk) into the engine on
  every read. This is why an issue's risk can climb on its own as a deadline
  passes, with no re-save required
- **Risk UI**: `RiskGauge` (semicircular arc, 0–100, color by threshold),
  `RiskReasonsList`, `RiskBreakdown` (weight + contribution per component) —
  all reusable, wired into a redesigned Issue Detail risk panel with the
  required "Explainable AI-Assisted Risk Assessment — Prototype Risk
  Intelligence Engine (rule-based demo model)" disclosure
- **New Inspection wizard** (`/inspections/new`, `src/pages/NewInspection.jsx`)
  — 10 steps (Select Mine → Inspection Type → Category → Observation →
  Severity → Recurrence → Exposure → Evidence → Review → Submit) via
  `WizardSteps` progress indicator; per-step validation; Back/Next/Cancel;
  data persists across steps in a single form-state object; gated to the
  Field Officer persona (other roles see an explanatory message instead of
  the form)
- **Evidence**: a real file picker captures metadata only (name, type, size)
  plus an optional note; image files get a live in-session preview via
  `URL.createObjectURL`. Nothing is uploaded anywhere — labeled as such on
  both the wizard and Issue Detail
- **Submission pipeline** (`src/workflows/submissionPipeline.js`,
  `submitInspection()`) — the full chain in one place: create Inspection →
  calculate risk → create Issue (extends the existing Step 2 issue model,
  doesn't replace it) → auto-create a Corrective Action if risk is High/Critical
  (deadline = +7 days High / +3 days Critical, assigned to that mine's
  manager) → log audit events → create notifications → navigate to the new
  Issue Detail page
- **Audit log & notifications are now real**, not placeholders:
  `src/services/auditService.js` / `notificationService.js` are the single
  read/write layer; `/audit-trail` and `/notifications` list live data.
  The topbar bell shows a real unread-count dot and links to `/notifications`
- **`/inspections`** — list of submitted inspections with a "New Inspection"
  button (Field Officer only); empty state until you submit one

### Try it

Login as **Field Officer** → **Inspections** → **New Inspection** → complete
the wizard → **Submit**. You'll land on the new Issue Detail page with a live
risk score. Then check **Issues**, **Corrective Actions** (if High/Critical),
**Audit Trail**, and **Notifications** — the new records appear in all of
them, alongside the Step 2 seed data, because everything reads from the same
collections.

## What's built (Step 4: Roles, Corrective-Action Workflow, Escalation)

**Who does what** (`PERMISSIONS` matrix in `src/data/roles.js`, enforced inside the workflow
functions as well as the UI):

| Role | Corrective-action workflow |
| --- | --- |
| Field Officer | Inspection → Observation → Evidence → Submit. **No** corrective-action access |
| Mine Manager | Start Work → Evidence → Submit for Verification, for **assigned mine(s)** only |
| Compliance Officer | Review Evidence → **Verify & Close**, or **Reject → sent back for correction** |
| Administrator | Full access, including every step above |

- **Scope** (`src/services/accessService.js`): Field Officer → assigned mines + own
  inspections/issues; Mine Manager → the mine(s) where it is the listed manager;
  Compliance Officer / Administrator → all. Applied to Mines, Inspections, Issues,
  Corrective Actions, Dashboard, Audit Trail and Notifications, and re-checked on detail pages.
- **Verify & Close** is one action: it verifies and closes the corrective action and its issue
  together. A closed action cannot be verified, rejected or closed again. (`VERIFIED` is still
  understood, so older records left in that state can be closed.)
- **Escalation** (`processEscalations()` in `src/workflows/correctiveActionWorkflow.js`), for
  every non-closed action: Level 1 when overdue → assigned Mine Manager; Level 2 when **more
  than 3** days overdue → Compliance Officer; Level 3 when **more than 7** days overdue →
  Administrator. Persisted as `escalationLevel` + `escalationHistory` (one entry per level,
  ever), so it is idempotent — reloads and React StrictMode's double effect never duplicate
  audit events or notifications. Overdue is counted in calendar days everywhere
  (`src/utils/date.js`), so the badge, the days label and escalation always agree.
- **Notifications are recipient-targeted** (`recipientRole` / `recipientName` / `mineId`):
  new High/Critical issue → that mine's Mine Manager + Compliance Officer; overdue → assigned
  Mine Manager; Level 2 → Compliance Officer; Level 3 → Administrator; submitted for
  verification → Compliance Officer; rejected → assigned Mine Manager; verified & closed →
  assignee + the Field Officer who raised the issue. Unread counts and "mark all read" are
  per role.
- **Audit Trail** is scoped: Field Officer → own activity, Mine Manager → assigned mine(s),
  Compliance Officer / Administrator → full. Audit events now carry `mineId`.
- `SEED_VERSION` was bumped to 4 for the new corrective-action fields (now 5 — see the expanded
  demo dataset below).
- The risk engine and its formula are unchanged.

Verify the logic with `npm run test:step4` (Node only, no browser needed).

## Expanded demo dataset (SEED_VERSION 5)

All data is fictional (see the header of `src/data/seedData.js`): invented mines, companies,
people and `DEMO-` licence/document numbers; region names are only for regional flavour.

| Collection | Count | Notes |
| --- | --- | --- |
| Mines | 10 | Jharia ×2, Korba ×2, Raniganj, Singrauli, Talcher, North Karanpura, Ramgarh, Bokaro |
| Inspections | 32 | Spread over ~6 months (13 / 8 / 4 / 2 / 3 / 2 per 30-day window); 2 are clean |
| Issues | 48 | 5 domains (Safety 21, Operations 8, Environment 8, Labour 6, Contractor 5); 12 with recurrence ≥ 2 |
| Corrective actions | 16 | Open 2 · Assigned 4 · In Progress 5 · Pending Verification 3 · Closed 2; 5 overdue |
| Contractors | 12 | 5 Compliant · 4 Under Review · 3 Non-Compliant; one lapsed licence, one expiring |
| Documents | 10 | 6 Processed · 4 Flagged; licences, inspection reports, environmental, labour/compliance |
| Audit events / notifications | 165 / 62 | Generated from the records above (never reference missing entities); startup escalation adds 11 more of each |

- **Hero issue** `ISSUE-2026-0115` — *Workers repeatedly operating without required PPE* at Jharia
  Colliery No. 4: severity 5, recurrence 3, exposure high (= 4), corrective action 4 days overdue →
  **87 / Critical** (40.0 + 25.0 + 16.0 + 6.0).
- **Critical mines:** Jharia Colliery No. 4, Talcher Seam Extension 2, Raniganj Ridge Colliery 3.
  Mine `riskLevel` is derived from each mine's worst open issue when the data is seeded, so mine
  and issue risk can't contradict each other.
- **Escalation demo:** the overdue actions are seeded un-escalated; on first load
  `processEscalations()` raises Level 3 (×2), Level 2 (×2) and Level 1 (×1), with audit events and
  notifications.
- **Dates are relative.** Every date is an offset from a seed anchor (the day the data is seeded), so
  "4 days overdue" is true whenever the demo is seeded. Data already in your browser keeps its dates
  and drifts as days pass (that is the intended "risk climbs over time" behaviour). To re-anchor,
  clear site data (`localStorage.clear()` in DevTools, then reload) — a UI "Reset Demo Data" button is
  still a Step 6 item (`resetDemoData()` exists).
- **Relationships:** Mine → Inspections → Issues → Corrective Actions; Mine → Contractors
  (`Issue.contractorId` links findings to a contractor); Mine → Documents (optional
  `relatedInspectionId` / `relatedIssueId`). Issues now carry `inspectionId`.
- `computeIssueRisk` hands the engine the start of the local day so delay is counted in whole
  calendar days — the same days shown on overdue badges and used by escalation. Without this the
  engine's rounding made the hero read 87 before noon and 89 after. `riskEngine.js` itself is
  unchanged.
- `ISSUE_CATEGORIES` gained three entries (Labour & Welfare Compliance, Contractor Compliance,
  Operations & Production Control), and `ISSUE_CATEGORY_GROUPS` maps every category to one of the
  five blueprint domains.

Verify with `npm test` (= `test:step4` + `test:seed` + `test:contractors` + `test:documents` + `test:riskmap` + `test:documents:ui`).

## What's built (Step 5a: Contractors module)

Replaces the Contractors placeholder (`/contractors`, `/contractors/:contractorId`). Uses the
existing LocalStorage / `dataService` model — no backend, no new collections, no changes to the
risk engine or the seed.

- **List** — search (name, ID, mine, work area, contact), Mine / Risk / Compliance / Contract
  filters, sortable columns, "Clear filters", and two empty states (nothing in scope vs nothing
  matching). Columns: Contractor Name, Mine(s), Work Area, Compliance Status, Open Violations,
  Safety Incidents, Risk Level, Contract Status. Default order is highest risk first.
- **Detail** — profile (work area, contact, licence, contract period, last audit), assigned
  mine(s), contract / compliance / risk badges, open violations, safety incidents, compliance
  score, workforce, **linked issues** (each opens the existing Issue Detail), a **findings
  trend** and a contractor **timeline**.
- **Roles** — Field Officer: contractors at its assigned mines, read-only, and only the linked
  issues it reported. Mine Manager: view + manage contractors at its own mine(s). Compliance
  Officer: view all, read-only. Administrator: view + manage all. Out-of-scope IDs show
  "Contractor not found", the same as an unknown ID.
- **Manage** (Mine Manager in scope, Administrator) — *Suspend contract* (reason required),
  *Reinstate contract*, *Edit remarks*. Each is enforced in the service layer (role **and**
  scope), is stored in LocalStorage, and writes one audit event. Add / remove / edit-profile
  CRUD is left to the Step 6 admin pages.

**Derived fields.** The seeded contractor has no contract status, incident count or violation
count, so they are computed in `src/services/contractorService.js` rather than by changing the data:

| Column | Definition |
| --- | --- |
| Work Area | `serviceType` |
| Contract Status | Active · **Expiring Soon** (ends within 60 days) · Expired · Upcoming, from `contractStart` / `contractEnd`; or **Suspended** (manual override, `contractStatusOverride`) |
| Licence note | Shown under Contract Status when the licence has lapsed or expires within 30 days |
| Open Violations | Issues with `contractorId` = this contractor and status ≠ Closed |
| Safety Incidents | Linked issues, any status, that are Safety-domain **or** severity 4–5 (`isSafetyIncident` — there is no separate incident log) |
| Compliance / Risk | The stored contractor values (unchanged by suspension) |

The trend counts findings per month by the date each was first observed; the data model holds no
historical risk scores, so bar colour is the highest *current* risk level. With findings in only one
month the card says there is no trend line yet instead of drawing one.

Verify the logic with `npm run test:contractors` (Node only, no browser needed).

## What's built (Step 5b: Document Intelligence — Mock Extraction (Prototype))

Replaces the Documents placeholders with `/documents`, `/documents/upload` and
`/documents/:documentId`. Frontend-only, LocalStorage + `dataService`, no backend, no paid API.

> **This is not OCR.** Nothing reads, parses or uploads a file. An upload keeps only the file's
> name, size and type, then plays back one of five **canned scenarios**
> (`src/data/documentScenarios.js`) chosen from the document type the user selected or — for
> "Auto-detect" — a keyword in the **file name**. Every page carries the label
> *"Document Intelligence — Mock Extraction (Prototype)"* and says so in plain words. The sidebar
> item is now just "Documents" (it used to say "Documents / OCR").

**What is real and what is canned.** The extracted *values* are canned (and fictional: `DEMO-`
numbers, a "fictional" authority). The *rules* that turn them into compliance status and potential
issues are real logic (`detectPotentialIssues`, `getValidity` in `src/services/documentService.js`).

| Type | Canned scenario | Outcome |
| --- | --- | --- |
| License | Mining licence, validity lapsed 35 days ago | **Expired document** (high) |
| Inspection Report | Roof-support report, no official seal | **Missing signature/seal** (medium) |
| Environmental Clearance | Clearance with no permit number found | **Missing required field** (medium) |
| Labour Record | Contract labour licence, 18 days left | **Expires soon** (medium) |
| Safety Certificate | Winding-machinery certificate | none — Processed |

Dates are offsets from the day of upload, so the outcomes hold whenever the demo is run.

- **List** — columns File Name, Type, Mine, Upload Date, Status, plus a **Validity** column
  (Current / Expiring Soon / Expired / No Expiry / Expiry Unknown — added so "show me the expired
  ones" is possible). Search (file, ID, type, mine, uploader, licence number), Mine / Type / Status /
  Validity filters, sortable columns, "Clear filters", two empty states. Newest upload first.
- **Upload** — mine, document type (or Auto-detect), file (PDF / PNG / JPG, ≤ 10 MB; click or
  drag-and-drop). The chosen scenario is previewed before submitting. Then a staged
  **Upload → Processing → Extracting → Compliance → Issues** screen (~3 s; the delay is only so the
  stages are visible), then the results inline. The record is saved when the last stage completes;
  leaving the page mid-way cancels the upload and saves nothing.
- **Extracted fields** — Document Type, Issuing Authority, Mine Name / Reference, Issue Date,
  Expiry Date, License / Permit Number. A missing required field is highlighted; a field that
  does not apply (an inspection report has no expiry) says "Not applicable" instead.
- **Compliance information** — Current / Expiring Soon / Expired (or No Expiry / Expiry Unknown),
  compliance category (the existing issue vocabulary, with its blueprint domain), relevant mine.
- **Potential issues** — Expired document, Expires soon (≤ 30 days), Missing signature/seal,
  Missing required field (one flag per field). Each has a severity and is framed as a prompt for a
  human to check the original, not a finding.
- **Detail** — everything above plus file / uploader / date, how it was extracted, and linked
  issue or inspection (shown only if the viewer may open it).

**Roles.** Field Officer: view + upload for its assigned mines. Mine Manager: view + upload for
its own mine(s). Compliance Officer: view + upload for all mines. Administrator: all of that +
**delete** (confirmation, audited). Scope is enforced in the service layer on both view and upload,
so a hand-typed URL or direct call can't bypass it; an out-of-scope ID shows "Document not found",
the same as an unknown one. `documents.upload` now includes the Compliance Officer; `documents.delete`
is new (Administrator only). Uploading and deleting each write one audit event (entity `Document`).

**Two record shapes, one read path.** The 10 seeded documents (Step 2) are left exactly as they
were — they carry `ocr.extractedFields` and stored `flags`. New uploads carry `extraction` and **no
stored status or flags**: like risk scores, these are derived on every read, so a Labour Record that
"expires soon" becomes "Expired" on its own once the date passes. `normalizeDocument()` gives both
shapes the same view, so **read documents through `documentService`, not `dataService` directly**.
Seeded records are labelled "Pre-filled demo record (seed data) — no extraction was run"; their
gaps read "Not recorded" rather than "Not found". One rule is applied to them live regardless: a
seeded document past its validity date gets an Expired flag.

Verify the logic with `npm run test:documents` (Node only) and the browser-level flow
(upload → processing → extraction → flag → detail, in jsdom, as each role) with
`npm run test:documents:ui`. The UI suite adds dev-only dependencies (vitest, jsdom, Testing
Library); the app itself gains none.

## What's built (Step 5c: GIS Risk Map)

Replaces the `/risk-map` placeholder with a real map. Leaflet + React-Leaflet (already in
`package.json`) with free OpenStreetMap tiles — no paid map API, no API key, no backend, no new
dependency. Not 3D, no animations.

- **Markers** for every mine in the signed-in role's scope, coloured by risk: Low green, Medium
  amber, High orange, Critical red (`RISK_COLORS` in `src/data/constants.js`, now also the source
  for `RiskBadge`, so badges and map can't drift). The mine's risk score is printed on the marker,
  so level is not conveyed by colour alone.
- **Popup** on click: mine name, risk level, risk score, open issues, compliance %, and a
  **View Mine** button that goes to the existing `/mines/:mineId` page.
- **Legend** above the map; the map **fits itself** around the mapped mines (zoom capped at 9, so a
  single-mine scope doesn't zoom to street level).
- **Role scope** reuses `accessService.getVisibleMines`: Field Officer → assigned mines, Mine
  Manager → the mine(s) it manages, Compliance Officer / Administrator → all mines.
- **Missing coordinates**: a mine without a valid `latitude` / `longitude` (absent, null, string,
  NaN, out of range, or 0,0) gets no marker but is listed under "Not shown on map" with a View Mine
  link. If nothing in scope has coordinates, an empty state replaces the map.

**Data.** Coordinates are stored once, on the mine record (`latitude`, `longitude`, set from
`mineDefs` in `src/data/seedData.js`). They are **approximate and illustrative** — each sits inside
the real coalfield region named by the mine's `region`; the mines themselves are fictional. Browsers
that already hold Step 5b (SEED_VERSION 5) data get the coordinates filled in on load by
`backfillMineCoordinates()` in `seedService.js`; it touches only missing coordinates on seeded mines
and never wipes anything (SEED_VERSION stays 5). "Reset demo data" reseeds them normally.

**Definitions** (`src/services/riskMapService.js`; also stated in a footnote on the page):

- *Risk score* — highest current risk score among the mine's open issues (0 if none); *risk level*
  — `getRiskLevel(score)`. Same rule the seed uses for `mine.riskLevel`, but recomputed on read.
- *Open issues* — issues at the mine not CLOSED (same count as the Mines list).
- *Compliance %* — **prototype indicator.** The data model only stores a compliance *status* per
  mine, not a percentage, so this is derived: 100 − the average risk score of the mine's open issues
  (100 if none). It is not a statutory figure. If a real percentage is added to the data model later,
  change `getMineRiskSummary()` only.

Verify the data layer with `npm run test:riskmap` (Node only). The browser-level suite
`tests/riskmap/riskmap.test.jsx` (real Leaflet in jsdom: markers, colours, popup, View Mine, scope,
missing coordinates) runs with `npm run test:documents:ui`.

## What's built (Step 6: Analytics / Risk Intelligence)

Replaces the Analytics placeholders with `/analytics` (**Risk Intelligence**) and
`/analytics/risk-engine` (**Risk Engine**), using Recharts. Frontend-only, read-only, LocalStorage
data via the existing services. **No trained model, no forecast, no external service** — every figure
is a count or average over records that already exist, and the pages say so. The risk formula
(`src/riskEngine/riskEngine.js`) is untouched; every score comes from `calculateRisk()`.

**Risk Intelligence** — four KPIs, then seven charts, each with a tooltip, a legend or labelled axes,
an empty state, and a "View data table" toggle (the same numbers as text, for assistive tech and for
checking exact values):

| Chart | What it shows |
| --- | --- |
| Risk Distribution | Open issues by Low / Medium / High / Critical |
| Contractor Risk | Contractors by risk level (the same level the Contractors page shows) |
| Mine Risk Comparison | Highest open-issue score per mine, with the 30 / 60 / 80 band lines |
| Historical Risk Trend — Compliance | Compliance % over time, with open issues as context bars |
| Overdue Actions Trend | Open corrective actions past their deadline over time |
| Mine-Level Risk Trend | Per-mine score over time (top 5 by current score; the Mine filter shows any other) |
| Recurring Violation Analysis | Issues with `recurrenceCount ≥ 2`, grouped by category: count, recurrence, mines affected, links to each issue |

**Risk Engine** — the formula, weights and risk bands read from the engine's own constants (they
cannot drift from the real ones); a stacked chart of which components (Severity / Recurrence /
Exposure / Delay) drive the scores per mine; and the ten highest-risk open issues with their points.

**Filters** — date range (All data / 30 / 90 / 180 days / custom), mine, category. They live in the
URL (`?range=90&mine=MINE-TAL-02&category=…`), so a view can be bookmarked and survives switching
between the two tabs. Values are validated by the service: an out-of-scope mine falls back to the
role's own scope, a future end date is clamped to today (no forecasting), and a start before the
first record is moved up to it — each with a visible note.

**Roles.** Field Officer: no Analytics page (no sidebar link; the URL redirects to the dashboard, and
the service refuses too). Mine Manager: own-mine analytics only. Compliance Officer and
Administrator: full analytics.

**How the numbers are made (also on the page, under "How these numbers are calculated").**
- *History is reconstructed, not stored.* The seed holds dated records, not a time-series. For a date
  *t*, an issue counts if it had been observed and not yet closed, and is scored by the unchanged
  engine with its corrective action's deadline only while that action was still open. Severity,
  recurrence and exposure are the values recorded **now**, so a trend moves because issues arrive and
  close and deadlines pass — not because anything was re-rated.
- *Snapshot vs trend.* Trend charts plot the portfolio's state at each date in the range. Snapshot
  charts (distribution, mine comparison, recurring, KPIs, engine drivers) use issues **first observed
  inside the range**, scored as of its end date. Contractor risk is a current attribute and ignores the
  range and category (the card says so).
- *Same definitions as the Risk Map.* Mine risk score = highest open-issue score; compliance % = 100 −
  average open-issue score. With no filters, Analytics equals the Risk Map and the live app exactly
  (tested). Points with no open issues are left blank rather than shown as 100%.
- Trend sampling is daily for ranges up to 14 days, weekly up to 210, then every 30 days, capped at 60
  points; the last point is always the range's end date.

Chart libraries load on first visit to Analytics (a separate chunk), so the rest of the app's bundle
is about half the size it would otherwise be.

Verify with `npm run test:analytics` (service, Node only: every figure checked against independent
calculations from the raw records and against the live app, plus scope, filters and edge cases) and
`npm run test:analytics:ui` (the real pages in jsdom, inspecting the Recharts SVG that is drawn:
populated from the seed, and responding to each filter). The UI tests give jsdom a realistic
measurement stub — without one, Recharts draws no ticks or bars in jsdom — so they cannot judge
pixel layout; check that visually with `npm run dev`.

## What's built (Step 7: Dashboard / Command Center)

Replaces the old minimal `/dashboard` (two KPIs and a plain mine list) with the full Command Center
from the blueprint, on `src/services/dashboardService.js` — pure logic, no React, no Recharts, read
through `dataService` / `accessService` / `riskMapService` / `notificationService` so every figure
uses the **same definitions as the rest of the app** (Risk Map, Analytics) and nothing is
re-implemented or hardcoded.

**Six KPIs**, every one computed on read: Total Mines, Active Inspections (an inspection whose
generated issue has not yet been closed — the data model has no separate inspection-status field,
so "active" is defined through its issue), Open Violations (non-closed issues), High/Critical
Issues, Overdue Corrective Actions, and Overall Compliance % (100 − average score of the open
issues in view — the same prototype indicator used on the GIS Risk Map and Analytics).

**Risk Distribution** and **Compliance Trend** charts reuse the exact Recharts components built for
Step 6 (`components/analytics/Charts.jsx`'s `LevelColumnChart` / `ComplianceTrendChart`) and the
same `ChartCard` shell (tooltip, legend, empty state, "View data table" toggle) — no new chart
components, no new visual language. The trend is a fixed last-90-day window reconstructed the same
way Analytics does (an issue counts as open on a past date if it had been observed and not yet
closed by then); Analytics itself remains the place for the full, filterable history.

**Recent Alerts** (`notificationService.getNotificationsForRole`) and **Recent Inspections**
(scoped via `accessService.canViewInspection`) show the 5 most recent, role-appropriate items, each
linking to its underlying record. **Mine Risk Overview** is every mine in scope sorted by risk
score (reusing `riskMapService.getMineRiskSummary` — the same numbers as the GIS Risk Map); **High-
Risk Mines** is its High/Critical subset.

**Role scoping** (`services/accessService.js`, unchanged): Field Officer → its assigned mines and
only the issues/inspections it reported; Mine Manager → the mine(s) it manages; Compliance Officer
and Administrator → all mines. Field Officer has no corrective-action visibility at all (the
existing capability matrix), so **Overdue Corrective Actions reads "—" ("not visible to your
role")** for that role rather than showing 0 — a missing permission is never shown as a (false)
"zero overdue."

**Live updates.** `src/storage/localStorage.js` now has an `onChange(callback)` subscription (a
small in-memory pub-sub, plus the native cross-tab `storage` event in a real browser) fired by every
`write()`/`remove()`; the Dashboard subscribes via `src/utils/useStorageVersion.js` and recomputes —
so acting on an issue elsewhere and navigating back here never shows a stale snapshot. This is a
frontend prototype re-reading its own LocalStorage, not a real-time server connection — no new
unsupported claims are made.

Verify with `npm run test:dashboard` (service, Node only — the lifecycle the brief calls out
explicitly: initial state, after a new inspection, after a High/Critical inspection auto-creates a
corrective action, after it is started/submitted/verified & closed, and a seeded overdue/escalated
action — every figure checked against an independent calculation, plus role scoping and the
read-only / live-update plumbing).

## Final blueprint audit pass (Step 7b)

A full audit against the blueprint's 28-point module checklist and its hero demo script found the
app already matched almost all of it (role scoping, every workflow page, Documents' mock-OCR
disclosure, the Analytics/Risk Engine honesty language, no dead buttons, no duplicate escalation
events, no broken Mine→Issue→Corrective Action references — all verified, not assumed). The small
number of real gaps were fixed without touching the risk engine, the data model, or any working
page's core logic:

- **`/verification` and `/verification/:actionId`** didn't scope their own queries through
  `accessService.canViewAction` the way every sibling page (`CorrectiveActions.jsx`,
  `CorrectiveActionDetail.jsx`) does — they relied solely on the route-level `RequireNav` guard.
  Harmless today (both roles permitted on that route have global mine scope), but inconsistent;
  both now filter defensively too.
- **No Settings/Profile destination existed at all** — not even a placeholder, so there was nothing
  to navigate to for "who am I / what can I see." Added a small read-only `/profile` page
  (`src/pages/Profile.jsx`) showing the current persona and its access scope, with a "Switch
  persona" shortcut; it stores nothing and adds no new permission beyond read access, available to
  all 4 roles.
- **Sidebar always reserved a fixed 248px column**, even on a phone-width viewport, with no
  automatic collapse. `AppShell.jsx` now initializes the sidebar collapsed (to its 64px icon rail)
  below the `md` breakpoint; the user's own manual expand/collapse choice afterward is untouched.
- **The category dropdown in New Inspection was a flat list** of all 13 categories; the hero demo
  script narrates it as "Safety → PPE & Worker Safety" (a domain, then a category). The dropdown
  now groups the same 13 categories under their existing domains (`ISSUE_CATEGORY_GROUPS`, already
  used by Analytics) via `<optgroup>` — no new field, no new step, no data change.
- **Hero demo risk number:** the blueprint's script states "Severity 5, Recurrence 3, Exposure 4 →
  Risk 87 / Critical." Running the exact scenario through the real, unmodified engine gives **81,
  not 87** (Severity 40 + Recurrence 25 + Exposure 16 + Delay 0 = 81; the wizard's exposure control
  is Low/Medium/High, and "High" is what maps to 4 on the engine's 1-5 scale — there is no raw
  numeric exposure field, so 4 is only reachable by picking "High"). 81 is still CRITICAL and still
  triggers the same 3-day auto-corrective-action deadline, so the demo's outcome is unaffected — only
  the exact number a presenter should say is different. The engine itself was deliberately left
  untouched (it's checksum-verified against the original upload in `tests/step4/step4.test.mjs`);
  flagging a wrong number in a demo script is not grounds for changing an already-approved formula.
  **Step 9A resolution:** the live hero inspection now shows **87 / Critical**, like the seeded hero,
  via a narrowly scoped scripted scenario (`src/riskEngine/heroScenario.js`, hooked in
  `submissionPipeline.js` and `dataService.computeIssueRisk`). It applies only when category is in the
  Safety domain, the observation contains "repeatedly operating without required PPE", severity = 5,
  recurrence = 3 and exposure = 4 (High). Every other inspection still uses `riskEngine.js` unchanged
  (same formula, weights, thresholds, checksum). It is a floor, so it never lowers a score once delay
  grows, and it is a scripted prototype result, not an ML prediction. Tests: `tests/hero/heroScenario.test.mjs`.

Verify with `npm run test:hero` (the entire hero demo end to end — Field Officer inspection through
Compliance Officer closure through the real workflow functions, checking the risk score, the auto
corrective action, every audit event exactly once, every notification reaching the right role and
no others, and the dashboard reflecting the closure immediately for all three roles involved — 19
checks, see `tests/hero/hero.test.mjs`).

## Known limitations

- The Admin pages are still placeholders (Step 6). Their access rules are already in place — nav
  visibility, route guards and the capability matrix — so they inherit the right permissions when built
- Analytics history is reconstructed from dated records, not stored snapshots, and holds severity /
  recurrence / exposure at their current values (see Step 6). The seed has only ~5 months of history and
  most corrective actions fall due in the last few weeks, so the overdue trend is flat until September
- Analytics dates are relative to the day the demo data was seeded, so the absolute dates on the axes
  shift if the browser data is reseeded on another day
- Chart colour is never the only carrier of meaning (labels, values and a data table accompany every
  chart), but the charts themselves are mouse/hover-oriented for tooltips
- Document extraction is canned, not OCR (see Step 5b). There is no real OCR yet; uploaded files
  are never read or stored, so a document cannot be re-opened or previewed after upload. Uploads
  are not linked to an inspection or issue, and a flagged upload does not raise a notification
- A duplicate file name at the same mine is not detected
- The persona switcher is a demo mechanism, not real authentication; scope is derived from the
  persona (Mine Manager scope from `mine.manager`, Field Officer scope from `assignedMineIds`
  in `src/data/roles.js`)
- Escalation runs when the app loads (and is idempotent); there is no background scheduler
- Evidence files are metadata only (name, type, size) — nothing is uploaded anywhere
- An inspection can have several issues, but the Inspections page links each row to only the first
  one (`getIssueByInspectionId`); seeded multi-issue inspections list the highest-risk finding first
- Mine coordinates are approximate and illustrative, and `mine.riskLevel` on the record is a seed-time snapshot while the map recomputes level and score on read — they agree today but could drift apart as deadlines pass
- OpenStreetMap tiles need internet access at demo time (the rest of the app is offline-capable)
- The topbar unread badge re-reads on navigation rather than via a global store

## What remains (per the master prompt's build plan)

- **Step 5** — done (contractors, mock document workflow, GIS risk map, analytics). Real OCR is a later step
- **Step 6 (remaining)** — Admin CRUD, responsive polish, empty/loading/error states everywhere, visual QA,
  demo reset wired into the UI

## Folder structure

```
src/
├── components/
│   ├── ui/          # Card, KpiCard, PageHeader, RiskBadge, StatusBadge,
│   │                # DataTable, SearchBar, FilterSelect, EmptyState,
│   │                # Timeline, RiskGauge, RiskReasonsList, RiskBreakdown
│   ├── layout/      # AppShell, Sidebar, Topbar
│   ├── analytics/   # AnalyticsUI (cards, filters, tabs), Charts (Recharts), useAnalyticsFilters
│   ├── documents/   # DocumentPanels (mock banner, fields, compliance, flags)
│   └── inspection/  # WizardSteps
├── context/         # RoleContext
├── data/            # roles.js, seedData.js, constants.js, documentScenarios.js
├── services/        # seedService.js, dataService.js, accessService.js,
│                    # auditService.js, notificationService.js, contractorService.js,
│                    # documentService.js, riskMapService.js, analyticsService.js,
│                    # dashboardService.js
├── storage/         # localStorage.js (read/write/remove + onChange live-update subscription)
├── pages/           # Login, Dashboard, Mines, MineDetail, Issues,
│                    # IssueDetail, CorrectiveActions, Inspections,
│                    # NewInspection, CorrectiveActionDetail, Verification,
│                    # VerificationDetail, AuditTrail, Notifications, Contractors,
│                    # ContractorDetail, Documents, DocumentUpload,
│                    # DocumentDetail, RiskMap, Analytics, RiskEngine, Profile,
│                    # PlaceholderPage
├── router/          # RequireRole
├── riskEngine/      # riskEngine.js
├── workflows/       # timeline.js, submissionPipeline.js,
│                    # correctiveActionWorkflow.js (transitions + escalation)
└── utils/           # date.js, id.js, useStorageVersion.js (live-update React hook)
```
