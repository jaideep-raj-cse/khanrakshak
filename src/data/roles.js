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
    demoUser: { name: 'Arjun Verma', title: 'Field Officer, Zone 3' },
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
// Keyed by nav item id (see components/layout/Sidebar.jsx).
export const NAV_PERMISSIONS = {
  dashboard: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  mines: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  inspections: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  issues: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  correctiveActions: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  verification: [ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  contractors: [ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  documents: [ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  riskMap: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  analytics: [ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  auditTrail: [ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  notifications: [ROLES.FIELD_OFFICER, ROLES.MINE_MANAGER, ROLES.COMPLIANCE_OFFICER, ROLES.ADMINISTRATOR],
  admin: [ROLES.ADMINISTRATOR],
};

export function canAccess(navId, role) {
  const allowed = NAV_PERMISSIONS[navId];
  if (!allowed) return true;
  return allowed.includes(role);
}
