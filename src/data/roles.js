// Demo role definitions. Role switching here is a prototype mechanism for
// showing role-aware UI — it is NOT real authentication or authorization.

export const ROLES = {
  FIELD_OFFICER: 'FIELD_OFFICER',
  MINE_MANAGER: 'MINE_MANAGER',
  COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER',
  ADMINISTRATOR: 'ADMINISTRATOR',
};

export const ROLE_DETAILS = {
  [ROLES.FIELD_OFFICER]: {
    id: ROLES.FIELD_OFFICER,
    name: 'Field Officer',
    description: 'Conducts inspections and raises issues from the field.',
    // Demo assignment: the mines where this persona has seeded inspections.
    // (Mine Manager scope is derived from mine.manager instead — see
    // services/accessService.js. Compliance Officer / Administrator are global.)
    demoUser: {
      name: 'Arjun Verma',
      title: 'Field Officer, Zone 3',
      assignedMineIds: ['MINE-JHR-04', 'MINE-KOR-11', 'MINE-TAL-02'],
    },
  },
  [ROLES.MINE_MANAGER]: {
    id: ROLES.MINE_MANAGER,
    name: 'Mine Manager',
    description: 'Responds to issues and manages corrective actions on site.',
    demoUser: { name: 'Sunita Rao', title: 'Manager, Jharia Colliery' },
  },
  [ROLES.COMPLIANCE_OFFICER]: {
    id: ROLES.COMPLIANCE_OFFICER,
    name: 'Compliance Officer',
    description: 'Verifies remediation and approves closure of violations.',
    demoUser: { name: 'Deepak Singh', title: 'Compliance Officer, Central Region' },
  },
  [ROLES.ADMINISTRATOR]: {
    id: ROLES.ADMINISTRATOR,
    name: 'Administrator',
    description: 'System-wide access to mines, users, and contractors.',
    demoUser: { name: 'Priya Nair', title: 'System Administrator' },
  },
};

export const ROLE_LIST = Object.values(ROLE_DETAILS);

// Navigation matrix: which sidebar sections each role can see.
// Keyed by nav item id (see components/layout/Sidebar.jsx). Pages that are
// still placeholders (contractors, documents, risk map, analytics, admin) are
// listed so their access rules are already correct when they are built.
//
// Scope (which mines/records a role sees inside a page) is NOT decided here —
// see services/accessService.js.
const ALL = [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR];

export const NAV_PERMISSIONS = {
  dashboard: ALL,
  mines: ALL, // scoped: Field Officer / Mine Manager see assigned mines only
  inspections: ALL, // scoped: Field Officer sees own; Mine Manager sees assigned mine(s)
  // Field Officer keeps READ-ONLY access to issues they reported, because
  // submitting an inspection lands on that issue's detail page.
  issues: ALL,
  // Corrective-action execution belongs to the Mine Manager; oversight to
  // Compliance Officer / Administrator. Field Officer has no corrective-action
  // access.
  correctiveActions: [ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  verification: [ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  contractors: ALL,
  documents: ALL,
  riskMap: ALL, // scoped: Field Officer / Mine Manager see assigned mines only
  analytics: [ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  auditTrail: ALL, // scoped: see accessService.canViewAuditEvent
  notifications: ALL, // recipient-targeted: see accessService.isNotificationVisible
  profile: ALL, // read-only persona summary + switch-persona shortcut
  admin: [ROLES.ADMINISTRATOR],
};

export function canAccess(navId, role) {
  const allowed = NAV_PERMISSIONS[navId];
  if (!allowed) return true;
  return allowed.includes(role);
}

// Capability matrix — WHAT a role may do (as opposed to where it may navigate).
// Workflow functions enforce these directly, so a role cannot bypass the rule
// by calling the function or typing a URL. Scope (WHICH mines) is enforced
// separately by services/accessService.js.
const FO = ROLES.FIELD_OFFICER;
const MM = ROLES.MINE_MANAGER;
const CO = ROLES.COMPLIANCE_OFFICER;
const AD = ROLES.ADMINISTRATOR;

export const PERMISSIONS = {
  // Inspections
  'inspection.create': [FO],
  'inspection.evidence.upload': [FO],
  // Corrective actions
  'ca.view': [MM, CO, AD],
  'ca.start': [MM, AD],
  'ca.submit': [MM, AD],
  'ca.evidence.upload': [MM, AD],
  'ca.verify': [CO, AD],
  'ca.reject': [CO, AD],
  'ca.close': [CO, AD],
  // Escalations
  'escalation.view': [MM, CO, AD],
  'escalation.manage': [CO, AD],
  // Modules added after Step 4 — recorded here so each step inherits the right rules
  'contractors.view': [FO, MM, CO, AD],
  'contractors.manage': [MM, AD],
  // Step 5b — Document Intelligence (mock extraction). Every role may upload and view
  // documents within its own scope (see services/documentService.js); only the
  // Administrator may delete one.
  'documents.view': [FO, MM, CO, AD],
  'documents.upload': [FO, MM, CO, AD],
  'documents.delete': [AD],
  'gis.view': [FO, MM, CO, AD],
  'analytics.own': [FO, MM], // basic / own-mine statistics
  'analytics.full': [CO, AD],
  'audit.view.scoped': [FO, MM],
  'audit.view.full': [CO, AD],
  'users.manage': [AD],
  'mines.manage': [AD],
};

export function can(permission, role) {
  const allowed = PERMISSIONS[permission];
  return !!allowed && allowed.includes(role);
}
