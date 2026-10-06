// Orchestrates the signature KhanRakshak workflow:
//   Inspection → Issue → Risk → Corrective Action (if High/Critical)
//   → Audit Events → Notifications
//
// This is the ONLY place that creates inspections/issues/corrective actions
// from user action — it extends the existing Step 2 data model rather than
// building a parallel one.
import {
  getMineById,
  addInspection,
  addIssue,
  addCorrectiveAction,
  getIssues,
  getCorrectiveActions,
  getInspections,
} from '../services/dataService';
import { calculateRisk } from '../riskEngine/riskEngine';
import { isHeroScenario, applyHeroScenario, HERO_SCENARIO_ID } from '../riskEngine/heroScenario';
import { logAuditEvent } from '../services/auditService';
import { createNotification } from '../services/notificationService';
import { nextId } from '../utils/id';
import { ROLES, can } from '../data/roles';
import { canViewMine } from '../services/accessService';
import { DEMO_NOW, todayISO, addDaysISO } from '../utils/date';

const AUTO_CA_DEADLINE_DAYS = { HIGH: 7, CRITICAL: 3 };

/**
 * @param {Object} input
 * @param {string} input.mineId
 * @param {string} input.inspectionType
 * @param {string} input.category
 * @param {string} input.observation
 * @param {number} input.severity
 * @param {number} input.recurrenceCount
 * @param {'low'|'medium'|'high'} input.exposureLevel
 * @param {number} [input.exposureWorkers]
 * @param {{fileName:string, fileType:string, fileSizeKB:number, note:string}|null} [input.evidence]
 * @param {{name:string, role:string, roleId?:string}} input.inspector
 *   roleId (a ROLES id) lets the pipeline enforce who may create inspections,
 *   and at which mines, instead of relying on the wizard UI alone.
 */
export function submitInspection(input) {
  const mine = getMineById(input.mineId);
  if (!mine) throw new Error(`Unknown mine: ${input.mineId}`);

  if (input.inspector.roleId) {
    if (!can('inspection.create', input.inspector.roleId)) {
      throw new Error('You do not have permission to create inspections.');
    }
    if (!canViewMine(input.inspector.roleId, input.mineId)) {
      throw new Error('You can only create inspections for your assigned mines.');
    }
  }

  const now = DEMO_NOW;
  const today = todayISO(now);

  // 1. Create Inspection
  const inspectionId = nextId('INSP', getInspections().map((i) => i.id));
  const inspection = {
    id: inspectionId,
    mineId: input.mineId,
    inspectionType: input.inspectionType,
    category: input.category,
    observation: input.observation,
    inspector: input.inspector.name,
    inspectorRole: input.inspector.role,
    date: today,
    createdAt: now.toISOString(),
  };
  addInspection(inspection);

  // 2. Calculate Risk (a brand-new issue has no corrective action yet, so
  // delay is always 0 at this point — that only grows in later on reads).
  const calculated = calculateRisk(
    {
      severity: input.severity,
      recurrenceCount: input.recurrenceCount,
      exposureLevel: input.exposureLevel,
      exposureWorkers: input.exposureWorkers,
      correctiveActionDeadline: null,
    },
    now
  );
  // Only the scripted SIH hero scenario is lifted to 87 / Critical (see riskEngine/heroScenario.js);
  // every other inspection keeps the engine's result exactly as calculated.
  const isHero = isHeroScenario(input);
  const risk = isHero ? applyHeroScenario(calculated) : calculated;

  // Decide up front whether an auto corrective action will be created, so
  // the Issue can be written once with correctiveActionId already set,
  // instead of writing the issue and then patching it.
  const willAutoCreateAction = risk.riskLevel === 'HIGH' || risk.riskLevel === 'CRITICAL';
  const correctiveActionId = willAutoCreateAction
    ? nextId('CA', getCorrectiveActions().map((a) => a.id))
    : null;

  // 3. Create Issue (extends the existing Step 2 issue model — same fields
  // Mines/Issues/CorrectiveActions already read, plus inspectionId + evidence).
  const issueId = nextId('ISSUE', getIssues().map((i) => i.id));
  const issue = {
    id: issueId,
    mineId: input.mineId,
    inspectionId,
    category: input.category,
    title: buildIssueTitle(input.category, input.observation),
    description: input.observation,
    status: 'OPEN',
    severity: input.severity,
    recurrenceCount: input.recurrenceCount,
    exposureLevel: input.exposureLevel,
    exposureWorkers: input.exposureWorkers ?? null,
    evidence: input.evidence ?? null,
    ...(isHero ? { scriptedRisk: HERO_SCENARIO_ID } : {}), // read-time risk honours this (dataService)
    observedDate: today,
    reportedBy: input.inspector.name,
    reportedByRole: input.inspector.role,
    correctiveActionId,
  };
  addIssue(issue);

  logAuditEvent({
    actor: input.inspector.name,
    role: input.inspector.role,
    action: 'Inspection Submitted',
    entity: 'Inspection',
    entityId: inspectionId,
    mineId: input.mineId,
    description: `${input.inspectionType} at ${mine.name} — ${input.category}.`,
  });

  logAuditEvent({
    actor: input.inspector.name,
    role: input.inspector.role,
    action: 'Issue Created',
    entity: 'Issue',
    entityId: issueId,
    mineId: input.mineId,
    description: issue.title,
  });

  logAuditEvent({
    actor: 'AI-Assisted Risk Assessment',
    role: 'Prototype Risk Intelligence Engine',
    action: 'Risk Calculated',
    entity: 'Issue',
    entityId: issueId,
    mineId: input.mineId,
    description: `${risk.riskLevelLabel} (${risk.riskScore}/100) — rule-based demonstration model.`,
  });

  createNotification({
    title: 'Inspection Submitted',
    description: `${input.inspector.name} submitted a ${input.inspectionType.toLowerCase()} at ${mine.name}.`,
    type: 'info',
    entityType: 'Inspection',
    entityId: inspectionId,
    mineId: input.mineId,
    recipientRole: ROLES.MINE_MANAGER,
    recipientName: mine.manager,
  });

  // 4. Auto-create Corrective Action for High/Critical risk
  let correctiveAction = null;
  if (willAutoCreateAction) {
    const deadlineDays = AUTO_CA_DEADLINE_DAYS[risk.riskLevel];
    correctiveAction = {
      id: correctiveActionId,
      issueId,
      mineId: input.mineId,
      title: `Resolve: ${issue.title}`,
      status: 'OPEN',
      priorityRisk: risk.riskLevel,
      assignee: mine.manager,
      assigneeRole: 'Mine Manager',
      createdDate: today,
      dueDate: addDaysISO(now, deadlineDays),
    };
    addCorrectiveAction(correctiveAction);

    logAuditEvent({
      actor: 'System',
      role: 'Workflow',
      action: 'Corrective Action Auto-Assigned (Risk-Triggered)',
      entity: 'Corrective Action',
      entityId: correctiveActionId,
      mineId: input.mineId,
      description: `Auto-created for ${risk.riskLevel} risk issue ${issueId}; assigned to ${mine.manager} (Mine Manager), due ${correctiveAction.dueDate}.`,
    });

    createNotification({
      title: 'Corrective Action Auto-Assigned',
      description: `${correctiveActionId} assigned to ${mine.manager} — due ${correctiveAction.dueDate}.`,
      type: risk.riskLevel === 'CRITICAL' ? 'critical' : 'warning',
      entityType: 'CorrectiveAction',
      entityId: correctiveActionId,
      mineId: input.mineId,
      recipientRole: ROLES.MINE_MANAGER,
      recipientName: mine.manager,
    });
  }

  // New High/Critical issue → the mine's Mine Manager AND the Compliance Officer.
  if (willAutoCreateAction) {
    const alert = {
      title: `New ${risk.riskLevelLabel} Risk Issue`,
      description: `${issue.title} at ${mine.name} scored ${risk.riskScore}/100.`,
      type: risk.riskLevel === 'CRITICAL' ? 'critical' : 'warning',
      entityType: 'Issue',
      entityId: issueId,
      mineId: input.mineId,
    };
    createNotification({ ...alert, recipientRole: ROLES.MINE_MANAGER, recipientName: mine.manager });
    createNotification({ ...alert, recipientRole: ROLES.COMPLIANCE_OFFICER });
  }

  return { inspection, issue: { ...issue, riskScore: risk.riskScore, riskLevel: risk.riskLevel, riskReasons: risk.reasons }, correctiveAction, risk };
}

function buildIssueTitle(category, observation) {
  const trimmed = observation.trim();
  const snippet = trimmed.length > 70 ? `${trimmed.slice(0, 67)}…` : trimmed;
  return `${category} — ${snippet}`;
}
