// =============================================================================
// KhanRakshak demo dataset
// =============================================================================
// ALL DATA IN THIS FILE IS FICTIONAL DEMONSTRATION DATA created for this SIH
// prototype. Mine names, companies, contractors, people, licence numbers and
// documents are invented. Region names (Jharia, Raniganj, Korba, Singrauli,
// Talcher, North Karanpura, Ramgarh, Bokaro) are used only for regional flavour;
// nothing here represents a real mine, operator, DGMS record, or government
// document. Licence / document numbers carry a "DEMO-" prefix on purpose.
//
// Relational shape (every foreign key below is validated by tests/seed):
//
//   Mine (1) ──< Inspection (N) ──< Issue (N) ──< CorrectiveAction (0..1 per issue)
//   Mine (1) ──< Contractor (N)  ·· Issue.contractorId (optional)
//   Mine (1) ──< Document (N)    ·· Document.relatedInspectionId / relatedIssueId (optional)
//   Inspection / Issue / CorrectiveAction ──< AuditEvent (via entity + entityId, always with mineId)
//   Issue / CorrectiveAction / Inspection ──< Notification (via entityType + entityId)
//
// Counts shown on Mines / Dashboard are always derived from these collections
// (src/services/dataService.js), never stored on the mine record.
//
// DATES ARE RELATIVE. Overdue state is computed against "today" (utils/date.js),
// so every date below is written as an offset in days from a seed anchor
// (default: the day the demo data is seeded). That keeps the demo scenarios exact
// — e.g. the hero issue's corrective action is always 4 days overdue — whenever
// the data is (re)seeded. Offsets for the original Step 2 records are calibrated
// so that on 1 Oct 2026 they equal their original absolute dates.
//
// Corrective actions are seeded with escalationLevel 0 / empty history, exactly
// like the original seed: processEscalations() (run at app start) raises the
// escalation events live, which is itself part of the demo.

import { DEMO_NOW } from '../utils/date';
import { ROLES } from './roles';
import { calculateRisk, getRiskLevel, getRiskLevelLabel } from '../riskEngine/riskEngine';

// v5: expanded dataset (10 mines / 32 inspections / 48 issues / 16 corrective
// actions / 12 contractors / 10 documents + derived audit log and notifications),
// date offsets relative to a seed anchor, issues carry inspectionId, and
// contractors / documents are populated. Bumping the version reseeds browsers
// holding older data.
export const SEED_VERSION = 5;

const FIELD_OFFICER = 'Field Officer';
const MINE_MANAGER = 'Mine Manager';
const COMPLIANCE_OFFICER = 'Compliance Officer';
const CO_NAME = 'Deepak Singh'; // matches the Compliance Officer demo persona
const ADMIN_ROLE = 'Administrator';

// Contractor compliance score → status / risk band. A simple, documented rule so
// a contractor's three signals can never contradict each other.
//   >= 85  Compliant      / Low
//   70-84  Under Review   / Medium
//   50-69  Non-Compliant  / High
//   <  50  Non-Compliant  / Critical
function contractorBand(score) {
  if (score >= 85) return { complianceStatus: 'COMPLIANT', riskLevel: 'LOW' };
  if (score >= 70) return { complianceStatus: 'UNDER_REVIEW', riskLevel: 'MODERATE' };
  if (score >= 50) return { complianceStatus: 'NON_COMPLIANT', riskLevel: 'HIGH' };
  return { complianceStatus: 'NON_COMPLIANT', riskLevel: 'CRITICAL' };
}

export function buildSeedData(anchor = DEMO_NOW) {
  const Y = anchor.getFullYear();
  const M = anchor.getMonth();
  const D = anchor.getDate();
  const pad = (n) => String(n).padStart(2, '0');

  // Local calendar date `off` days from the anchor day, as YYYY-MM-DD.
  const iso = (off) => {
    const x = new Date(Y, M, D + off);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  // Timestamp `off` days from the anchor day at a local clock time.
  const stamp = (off, h = 10, min = 0) => new Date(Y, M, D + off, h, min).toISOString();
  // The engine measures delay in whole days from the deadline's midnight, so it
  // is always given the START of the day (see dataService.computeIssueRisk).
  const asOf = new Date(Y, M, D);

  // ---------------------------------------------------------------------------
  // Mines (10). riskLevel is derived below from each mine's open issues, so a
  // mine can never be labelled differently from the risk its own issues carry.
  // ---------------------------------------------------------------------------
  // lat / lng are APPROXIMATE, illustrative coordinates placed inside the real coalfield
  // region named by each mine's `region` (the mines themselves are fictional). They feed the
  // GIS Risk Map and are stored on the mine record as latitude / longitude — the one place
  // coordinates live.
  const mineDefs = [
    // The original four (ids, names, regions, managers unchanged)
    { code: 'JHR-04', name: 'Jharia Colliery No. 4', region: 'Jharia, Jharkhand', compliance: 'NON_COMPLIANT', manager: 'Sunita Rao', lat: 23.7457, lng: 86.414 },
    { code: 'KOR-11', name: 'Korba Opencast Block 11', region: 'Korba, Chhattisgarh', compliance: 'UNDER_REVIEW', manager: 'Ramesh Yadav', lat: 22.351, lng: 82.693 },
    { code: 'TAL-02', name: 'Talcher Seam Extension 2', region: 'Talcher, Odisha', compliance: 'NON_COMPLIANT', manager: 'Manoj Behera', lat: 20.9503, lng: 85.2168 },
    { code: 'SNG-07', name: 'Singrauli Underground 7', region: 'Singrauli, Madhya Pradesh', compliance: 'COMPLIANT', manager: 'Kavita Mishra', lat: 24.1997, lng: 82.6738 },
    // Six new fictional mines
    { code: 'RAN-03', name: 'Raniganj Ridge Colliery 3', region: 'Raniganj, West Bengal', compliance: 'NON_COMPLIANT', manager: 'Debashis Chatterjee', lat: 23.615, lng: 87.129 },
    { code: 'NKP-05', name: 'North Karanpura Block 5', region: 'North Karanpura, Jharkhand', compliance: 'UNDER_REVIEW', manager: 'Alok Prasad', lat: 23.72, lng: 85.05 },
    { code: 'RMG-09', name: 'Ramgarh Basin Opencast 9', region: 'Ramgarh, Jharkhand', compliance: 'UNDER_REVIEW', manager: 'Farhan Qureshi', lat: 23.632, lng: 85.518 },
    { code: 'BKR-06', name: 'Bokaro Valley Colliery 6', region: 'Bokaro, Jharkhand', compliance: 'UNDER_REVIEW', manager: 'Meera Kumari', lat: 23.786, lng: 85.956 },
    { code: 'JHR-12', name: 'Jharia Eastern Seam 12', region: 'Jharia, Jharkhand', compliance: 'NON_COMPLIANT', manager: 'Vikram Oraon', lat: 23.739, lng: 86.456 },
    { code: 'KOR-17', name: 'Korba Ridge Opencast 17', region: 'Korba, Chhattisgarh', compliance: 'COMPLIANT', manager: 'Lakshmi Sahu', lat: 22.392, lng: 82.748 },
  ];
  const mineId = (code) => `MINE-${code}`;
  const managerOf = (code) => mineDefs.find((m) => m.code === code).manager;
  const mineNameOf = (code) => mineDefs.find((m) => m.code === code).name;

  // ---------------------------------------------------------------------------
  // Inspections (32) spread over roughly the previous six months.
  // `ref` is a local handle so issues / documents can point at an inspection
  // before its final sequential id is assigned (ids ascend with date).
  // Two inspections are intentionally clean (no findings).
  // ---------------------------------------------------------------------------
  const ARJUN = 'Arjun Verma'; // Field Officer demo persona (assigned: JHR-04, KOR-11, TAL-02)
  const NEHA = 'Neha Kerketta';
  const SUBRATA = 'Subrata Mondal';
  const RAKESH = 'Rakesh Soren';
  const IMRAN = 'Imran Ansari';

  const ROUTINE = 'Routine Inspection';
  const STATUTORY = 'Statutory Inspection';
  const FOLLOW_UP = 'Follow-up Inspection';
  const INCIDENT = 'Incident-Triggered Inspection';

  const inspectionDefs = [
    // --- Jharia Colliery No. 4 (Arjun Verma) -----------------------------------
    { ref: 'jhr04-165', mine: 'JHR-04', off: -165, type: ROUTINE, by: ARJUN, category: 'Statutory Documentation',
      observation: 'Shift handover register found without the overman countersignature for several shifts. This is a repeat of earlier register lapses.' },
    { ref: 'jhr04-61', mine: 'JHR-04', off: -61, type: STATUTORY, by: ARJUN, category: 'Environmental Compliance',
      observation: 'Statutory round of surface and gallery areas. Haul-road water sprinkling below the approved frequency; a belt conveyor emergency pull-cord was found inoperative.' },
    { ref: 'jhr04-19', mine: 'JHR-04', off: -19, type: ROUTINE, by: ARJUN, category: 'Ventilation & Air Quality',
      observation: 'Auxiliary ventilation fan at the Seam 4 development heading was found non-operational, reducing air change rate below the statutory minimum for the working face.' },
    { ref: 'jhr04-17', mine: 'JHR-04', off: -17, type: ROUTINE, by: ARJUN, category: 'Structural Support / Roof Control',
      observation: 'Roof bolt spacing in Panel 2 gallery exceeds the approved support plan by roughly 20%, identified during a routine strata-control check.' },
    { ref: 'jhr04-12', mine: 'JHR-04', off: -12, type: ROUTINE, by: ARJUN, category: 'PPE & Worker Safety',
      observation: 'Spot check of Shift B contract workers at the surface handling area found inconsistent respiratory protection use; no rest shelter or drinking-water point for the crew.' },
    { ref: 'jhr04-7', mine: 'JHR-04', off: -7, type: FOLLOW_UP, by: ARJUN, category: 'PPE & Worker Safety',
      observation: 'Follow-up on earlier PPE findings: workers at the Seam 4 loading point were again observed operating without helmets and respirators. This is the fourth documented occurrence.' },

    // --- Talcher Seam Extension 2 (Arjun Verma) --------------------------------
    { ref: 'tal-26', mine: 'TAL-02', off: -26, type: STATUTORY, by: ARJUN, category: 'Fire Safety',
      observation: 'Fire-safety audit found three extinguishers at the conveyor transfer house past their statutory inspection date.' },
    { ref: 'tal-23', mine: 'TAL-02', off: -23, type: FOLLOW_UP, by: ARJUN, category: 'Water Management / Inundation Risk',
      observation: 'Piezometer readings near the Block C bench show a rising water table with the secondary dewatering pump offline; treated mine-water discharge pH also above the permitted limit.' },
    { ref: 'tal-20', mine: 'TAL-02', off: -20, type: ROUTINE, by: ARJUN, category: 'Explosives & Blasting',
      observation: 'Pre-blast safety check found the exclusion-zone barricading for the eastern face bench blast incomplete.' },
    { ref: 'tal-15', mine: 'TAL-02', off: -15, type: STATUTORY, by: ARJUN, category: 'Statutory Documentation',
      observation: 'Statutory records check: shot-firer competency certificates due for renewal; periodic medical examinations overdue for night-shift workers.' },
    { ref: 'tal-9', mine: 'TAL-02', off: -9, type: ROUTINE, by: ARJUN, category: 'Contractor Compliance',
      observation: 'Routine equipment check: overburden contractor dumpers operating without recorded reverse-alarm checks; guard missing on a workshop bench grinder.' },

    // --- Korba Opencast Block 11 (Arjun Verma) ---------------------------------
    { ref: 'kor11-101', mine: 'KOR-11', off: -101, type: ROUTINE, by: ARJUN, category: 'Operations & Production Control',
      observation: 'Bench height on the eastern bench deviates from the approved mine plan.' },
    { ref: 'kor11-52', mine: 'KOR-11', off: -52, type: ROUTINE, by: ARJUN, category: 'Machinery & Equipment Safety',
      observation: 'Routine equipment and electrical round. No non-conformities recorded.' },
    { ref: 'kor11-11', mine: 'KOR-11', off: -11, type: ROUTINE, by: ARJUN, category: 'Electrical Safety',
      observation: 'A junction box feeding the overland conveyor transfer point was found without an intact earth connection; haul-road dust suppression below schedule.' },

    // --- Raniganj Ridge Colliery 3 (Subrata Mondal) ----------------------------
    { ref: 'ran-150', mine: 'RAN-03', off: -150, type: INCIDENT, by: SUBRATA, category: 'Water Management / Inundation Risk',
      observation: 'Incident-triggered inspection after a sump pump failure in the old workings during heavy rain; water level was rising toward the haulage road.' },
    { ref: 'ran-75', mine: 'RAN-03', off: -75, type: ROUTINE, by: SUBRATA, category: 'Machinery & Equipment Safety',
      observation: 'Haulage rope inspection record on the main incline is overdue for the current cycle.' },
    { ref: 'ran-40', mine: 'RAN-03', off: -40, type: ROUTINE, by: SUBRATA, category: 'Contractor Compliance',
      observation: 'Housekeeping contractor staff working without gate-pass and ID records; lighting in the underground canteen and rest room is inadequate.' },
    { ref: 'ran-13', mine: 'RAN-03', off: -13, type: STATUTORY, by: SUBRATA, category: 'Structural Support / Roof Control',
      observation: 'Statutory inspection of Panel B: support lines withdrawn ahead of schedule, methane above the alert level at the return airway, and seepage from the dump toe into a drainage channel.' },

    // --- Jharia Eastern Seam 12 (Neha Kerketta) --------------------------------
    { ref: 'jhr12-120', mine: 'JHR-12', off: -120, type: ROUTINE, by: NEHA, category: 'Environmental Compliance',
      observation: 'Dust suppression system at the coal crusher is only partially functional; the same lapse was noted in earlier rounds.' },
    { ref: 'jhr12-82', mine: 'JHR-12', off: -82, type: ROUTINE, by: NEHA, category: 'Operations & Production Control',
      observation: 'Weighbridge dispatch records do not reconcile with the production ledger.' },
    { ref: 'jhr12-47', mine: 'JHR-12', off: -47, type: FOLLOW_UP, by: NEHA, category: 'Structural Support / Roof Control',
      observation: 'Roof convergence readings were not logged for nine consecutive days.' },
    { ref: 'jhr12-9', mine: 'JHR-12', off: -9, type: STATUTORY, by: NEHA, category: 'Contractor Compliance',
      observation: 'Statutory inspection found contractor crews firing rounds without a valid blast permit, no recorded safety induction for the contract crew, and wage-slip and detonator-register gaps.' },

    // --- North Karanpura Block 5 (Rakesh Soren) --------------------------------
    { ref: 'nkp-110', mine: 'NKP-05', off: -110, type: ROUTINE, by: RAKESH, category: 'Environmental Compliance',
      observation: 'Silt trap on the rainwater runoff channel was not desilted ahead of the monsoon.' },
    { ref: 'nkp-58', mine: 'NKP-05', off: -58, type: ROUTINE, by: RAKESH, category: 'Labour & Welfare Compliance',
      observation: 'Overtime hours for the surface loading crew exceed the statutory limit.' },
    { ref: 'nkp-6', mine: 'NKP-05', off: -6, type: STATUTORY, by: RAKESH, category: 'Explosives & Blasting',
      observation: 'Statutory inspection: magazine stock register discrepancy with unmarked safety distances, flameproof enclosure on the main pump motor with missing bolts, and an incomplete blast-hole charging log.' },

    // --- Bokaro Valley Colliery 6 (Neha Kerketta) ------------------------------
    { ref: 'bkr-78', mine: 'BKR-06', off: -78, type: ROUTINE, by: NEHA, category: 'Environmental Compliance',
      observation: 'Sprinkler coverage gap causing fugitive dust at the coal loading siding; explosives permit renewal notice not displayed.' },
    { ref: 'bkr-33', mine: 'BKR-06', off: -33, type: STATUTORY, by: NEHA, category: 'Fire Safety',
      observation: 'Spontaneous heating indications in the coal stack near the old goaf; maintenance contractor did not apply lock-out/tag-out during belt servicing.' },

    // --- Ramgarh Basin Opencast 9 (Rakesh Soren) -------------------------------
    { ref: 'rmg-136', mine: 'RMG-09', off: -136, type: ROUTINE, by: RAKESH, category: 'Labour & Welfare Compliance',
      observation: 'Attendance register entries found back-filled for two weekly offs.' },
    { ref: 'rmg-31', mine: 'RMG-09', off: -31, type: STATUTORY, by: RAKESH, category: 'Environmental Compliance',
      observation: 'Effluent treatment plant overflowed during heavy rain and is running below design capacity; dust masks not issued at the crusher feed hopper.' },

    // --- Korba Ridge Opencast 17 (Imran Ansari) --------------------------------
    { ref: 'kor17-35', mine: 'KOR-17', off: -35, type: ROUTINE, by: IMRAN, category: 'PPE & Worker Safety',
      observation: 'Haul-road spotters wearing reflective vests inconsistently; one shift inspection register entry missing.' },

    // --- Singrauli Underground 7 (Imran Ansari) --------------------------------
    { ref: 'sng07-141', mine: 'SNG-07', off: -141, type: ROUTINE, by: IMRAN, category: 'Statutory Documentation',
      observation: 'Ventilation survey report was filed three days after the due date.' },
    { ref: 'sng07-57', mine: 'SNG-07', off: -57, type: STATUTORY, by: IMRAN, category: 'Ventilation & Air Quality',
      observation: 'Statutory ventilation and gas-monitoring check. No non-conformities recorded.' },
  ];

  // ---------------------------------------------------------------------------
  // Issues (48). Raw risk INPUTS only — risk is computed on read by the engine.
  //   insp  → inspection ref (observedDate / reportedBy / mineId come from it)
  //   exp   → exposure level: low = 2, medium = 3, high = 4 on the engine's 1-5 scale
  //   ca    → corrective action number (see correctiveActionDefs)
  // The nine original Step 2 issues keep their ids, text and inputs verbatim.
  // Issues with no corrective action are Low/Medium-risk findings awaiting triage.
  // ---------------------------------------------------------------------------
  const issueDefs = [
    // ===== Jharia Colliery No. 4 ==================================================
    { id: '0011', insp: 'jhr04-165', cat: 'Statutory Documentation',
      title: 'Shift handover register not countersigned by overman',
      desc: 'Handover register entries for several consecutive shifts carry no overman countersignature. Chronic documentation lapse; raised in earlier rounds as well.',
      sev: 2, rec: 3, exp: 'low', workers: 0, status: 'OPEN' },
    { id: '0022', insp: 'jhr04-61', cat: 'Environmental Compliance',
      title: 'Water sprinkling on Seam 4 haul road below approved frequency',
      desc: 'Haul-road sprinkling is running at roughly half the frequency in the approved dust-control plan, leaving visible dust on the Seam 4 haul road.',
      sev: 3, rec: 1, exp: 'medium', workers: 12, status: 'OPEN' },
    { id: '0023', insp: 'jhr04-61', cat: 'Machinery & Equipment Safety',
      title: 'Emergency pull-cord inoperative on gallery belt conveyor',
      desc: 'The emergency stop pull-cord along the gallery belt conveyor did not trip the drive when tested during the statutory round.',
      sev: 3, rec: 1, exp: 'medium', workers: 9, status: 'OPEN' },
    { id: '0091', insp: 'jhr04-19', cat: 'Ventilation & Air Quality',
      title: 'Inadequate secondary ventilation at Seam 4 heading',
      desc: 'Auxiliary ventilation fan at the Seam 4 development heading was found non-operational during inspection, reducing air change rate below the statutory minimum for the working face.',
      sev: 5, rec: 1, exp: 'high', workers: 14, status: 'ESCALATED', ca: '0041' },
    { id: '0088', insp: 'jhr04-17', cat: 'Structural Support / Roof Control',
      title: 'Roof bolting pattern deviation in Panel 2 gallery',
      desc: 'Roof bolt spacing in Panel 2 gallery exceeds the approved support plan by roughly 20%, identified during a routine strata-control check. The gallery carries a full shift crew during development work.',
      sev: 4, rec: 0, exp: 'high', workers: 22, status: 'IN_PROGRESS', ca: '0038' },
    { id: '0079', insp: 'jhr04-12', cat: 'PPE & Worker Safety',
      title: 'Incomplete PPE compliance among contract labour, Shift B',
      desc: 'Spot check of Shift B contract workers at the surface handling area found inconsistent use of respiratory protection in the designated dust zone.',
      sev: 3, rec: 0, exp: 'medium', workers: 8, status: 'OPEN' },
    { id: '0108', insp: 'jhr04-12', cat: 'Labour & Welfare Compliance',
      title: 'No shaded rest shelter or drinking-water point for contract crew',
      desc: 'Contract crew at the surface handling area have no shaded rest shelter and no drinking-water point within the work zone.',
      sev: 2, rec: 0, exp: 'medium', workers: 8, status: 'OPEN' },
    // BLUEPRINT HERO ISSUE: severity 5 / recurrence 3 / exposure 4 (+ 4 days overdue) = 87 Critical
    { id: '0115', insp: 'jhr04-7', cat: 'PPE & Worker Safety',
      title: 'Workers repeatedly operating without required PPE',
      desc: 'Workers at the Seam 4 loading point were again observed operating without helmets and respirators. This is the fourth documented occurrence after three earlier PPE findings (most recently ISSUE-2026-0079), indicating a systemic supervision gap rather than an isolated lapse.',
      sev: 5, rec: 3, exp: 'high', workers: 26, status: 'ESCALATED', ca: '0055',
      evidence: { fileName: 'seam4_loading_point_ppe_check.jpg', fileType: 'image/jpeg', fileSizeKB: 412, note: 'Three workers at the loading point without helmets or respirators; supervisor not present.' } },

    // ===== Talcher Seam Extension 2 ===============================================
    { id: '0070', insp: 'tal-26', cat: 'Fire Safety',
      title: 'Expired fire extinguishers at conveyor transfer house',
      desc: 'Three fire extinguishers at the conveyor transfer house were found past their statutory inspection date during the fire-safety audit. Replaced and recertified; corrective action verified and closed.',
      sev: 4, rec: 0, exp: 'medium', workers: 5, status: 'CLOSED', ca: '0028' },
    { id: '0065', insp: 'tal-23', cat: 'Water Management / Inundation Risk',
      title: 'Rising water table near Block C bench without active dewatering',
      desc: 'Piezometer readings near the Block C bench show a rising water table trend with the secondary dewatering pump offline for over a week. This is the third consecutive reading showing the same trend.',
      sev: 5, rec: 2, exp: 'high', workers: 25, status: 'ESCALATED', ca: '0022' },
    { id: '0103', insp: 'tal-23', cat: 'Environmental Compliance',
      title: 'Treated mine-water discharge pH above permitted limit at Block C outfall',
      desc: 'Grab samples at the Block C outfall returned a pH above the limit stated in the environmental clearance conditions; treatment dosing needs recalibration.',
      sev: 4, rec: 1, exp: 'medium', workers: 0, status: 'OPEN',
      evidence: { fileName: 'blockC_outfall_ph_readings.pdf', fileType: 'application/pdf', fileSizeKB: 96, note: 'Three consecutive samples above the permitted range.' } },
    { id: '0066', insp: 'tal-20', cat: 'Explosives & Blasting',
      title: 'Blast exclusion zone marking incomplete on eastern face',
      desc: 'Exclusion zone barricading for the scheduled bench blast on the eastern face was incomplete at the time of the pre-blast safety check.',
      sev: 5, rec: 0, exp: 'high', workers: 30, status: 'IN_PROGRESS', ca: '0023' },
    { id: '0072', insp: 'tal-15', cat: 'Statutory Documentation',
      title: 'Competency certificates pending renewal for two shot-firers',
      desc: 'Statutory competency certificates for two shot-firers on the night shift roster are due for renewal within the next inspection cycle. Administrative finding — no direct worker exposure.',
      sev: 2, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },
    { id: '0104', insp: 'tal-15', cat: 'Labour & Welfare Compliance',
      title: 'Periodic medical examination overdue for 11 night-shift workers',
      desc: 'Eleven night-shift workers are past the due date for their periodic medical examination; the same backlog was noted in the previous cycle.',
      sev: 2, rec: 1, exp: 'low', workers: 11, status: 'OPEN' },
    { id: '0075', insp: 'tal-9', cat: 'Machinery & Equipment Safety',
      title: 'Guard plate missing on workshop bench grinder',
      desc: 'The eye-shield guard on a bench grinder in the maintenance workshop was found missing during a routine equipment check.',
      sev: 1, rec: 0, exp: 'low', workers: 1, status: 'OPEN' },
    { id: '0110', insp: 'tal-9', cat: 'Contractor Compliance', contractor: 5,
      title: 'Overburden contractor dumpers running without recorded reverse-alarm checks',
      desc: 'Daily pre-start checks for the overburden contractor dumpers carry no reverse-alarm entries for the past two weeks, a repeat of an earlier finding.',
      sev: 3, rec: 2, exp: 'medium', workers: 14, status: 'OPEN' },

    // ===== Raniganj Ridge Colliery 3 ==============================================
    { id: '0012', insp: 'ran-150', cat: 'Water Management / Inundation Risk',
      title: 'Sump pump failure in old workings during monsoon, water level rising',
      desc: 'The main sump pump in the old workings failed during heavy rain and water rose toward the haulage road. Standby pump installed and alarms tested; corrective action verified and closed.',
      sev: 5, rec: 1, exp: 'high', workers: 12, status: 'CLOSED', ca: '0012' },
    { id: '0021', insp: 'ran-75', cat: 'Machinery & Equipment Safety',
      title: 'Haulage rope inspection record overdue on main incline',
      desc: 'The statutory haulage rope inspection record for the main incline is overdue for the current cycle.',
      sev: 3, rec: 1, exp: 'medium', workers: 10, status: 'OPEN' },
    { id: '0026', insp: 'ran-40', cat: 'Contractor Compliance', contractor: 7,
      title: 'Housekeeping contractor staff without gate-pass and ID records',
      desc: 'Six housekeeping contractor staff were working on site without gate-pass or ID records on file.',
      sev: 2, rec: 1, exp: 'low', workers: 6, status: 'OPEN' },
    { id: '0027', insp: 'ran-40', cat: 'Labour & Welfare Compliance',
      title: 'Inadequate lighting in underground canteen and rest room',
      desc: 'Illumination in the underground canteen and rest room is below the recommended level for a rest area.',
      sev: 2, rec: 0, exp: 'low', workers: 14, status: 'OPEN' },
    { id: '0105', insp: 'ran-13', cat: 'Structural Support / Roof Control',
      title: 'Support lines withdrawn ahead of schedule in Panel B depillaring',
      desc: 'Support lines in the Panel B depillaring area were withdrawn ahead of the approved sequence, leaving an unsupported span above an active working area.',
      sev: 5, rec: 2, exp: 'high', workers: 18, status: 'ESCALATED', ca: '0049',
      evidence: { fileName: 'panelB_support_lines.jpg', fileType: 'image/jpeg', fileSizeKB: 365, note: 'Unsupported span visible above the active depillaring line.' } },
    { id: '0106', insp: 'ran-13', cat: 'Ventilation & Air Quality',
      title: 'Methane reading repeatedly above alert level at Panel B return airway',
      desc: 'Methane at the Panel B return airway has exceeded the alert level on repeated readings over consecutive shifts.',
      sev: 4, rec: 2, exp: 'high', workers: 18, status: 'IN_PROGRESS', ca: '0051' },
    { id: '0107', insp: 'ran-13', cat: 'Environmental Compliance',
      title: 'Seepage from overburden dump toe reaching adjacent drainage channel',
      desc: 'Seepage from the toe of the overburden dump is reaching the adjacent drainage channel with no settling arrangement in place.',
      sev: 3, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },

    // ===== Jharia Eastern Seam 12 =================================================
    { id: '0015', insp: 'jhr12-120', cat: 'Environmental Compliance',
      title: 'Dust suppression system only partially functional at coal crusher',
      desc: 'Only part of the water-spray dust suppression system at the coal crusher is functional. The same lapse was noted in three earlier rounds.',
      sev: 3, rec: 3, exp: 'low', workers: 20, status: 'OPEN' },
    { id: '0018', insp: 'jhr12-82', cat: 'Operations & Production Control',
      title: 'Weighbridge dispatch records do not reconcile with production ledger',
      desc: 'Weighbridge dispatch totals differ from the production ledger for the audited fortnight.',
      sev: 2, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },
    { id: '0025', insp: 'jhr12-47', cat: 'Structural Support / Roof Control',
      title: 'Roof convergence readings not logged for nine consecutive days',
      desc: 'Roof convergence station readings in the development gallery were not logged for nine consecutive days.',
      sev: 3, rec: 1, exp: 'medium', workers: 16, status: 'OPEN' },
    { id: '0111', insp: 'jhr12-9', cat: 'Contractor Compliance', contractor: 4,
      title: 'Drill-and-blast contractor firing rounds without a valid blast permit',
      desc: 'The drill-and-blast contractor fired rounds on two shifts without a valid blast permit, a repeat of an earlier permit finding. The contractor licence is also past its validity date.',
      sev: 4, rec: 2, exp: 'high', workers: 24, status: 'OPEN', ca: '0056',
      evidence: { fileName: 'blast_permit_register_scan.jpg', fileType: 'image/jpeg', fileSizeKB: 288, note: 'Register shows firing entries with no permit number.' } },
    { id: '0112', insp: 'jhr12-9', cat: 'Explosives & Blasting', contractor: 4,
      title: 'Detonator issue register not reconciled with shot-firer log',
      desc: 'Detonator issue entries do not reconcile with the shot-firer log for the last three blast days.',
      sev: 3, rec: 1, exp: 'medium', workers: 6, status: 'OPEN' },
    { id: '0113', insp: 'jhr12-9', cat: 'Contractor Compliance', contractor: 3,
      title: 'Contract crew deployed underground without recorded safety induction',
      desc: 'Thirty contract workers were deployed underground without a recorded safety induction, a repeat of an earlier induction finding.',
      sev: 4, rec: 2, exp: 'high', workers: 30, status: 'OPEN', ca: '0057' },
    { id: '0114', insp: 'jhr12-9', cat: 'Labour & Welfare Compliance', contractor: 3,
      title: 'Contract workers not issued wage slips for last two pay cycles',
      desc: 'Contract workers supplied by the manpower contractor report no wage slips for the last two pay cycles.',
      sev: 3, rec: 1, exp: 'medium', workers: 30, status: 'OPEN' },

    // ===== North Karanpura Block 5 ================================================
    { id: '0016', insp: 'nkp-110', cat: 'Environmental Compliance',
      title: 'Silt trap on rainwater runoff channel not desilted before monsoon',
      desc: 'The silt trap on the main runoff channel was full ahead of the monsoon, allowing silt-laden water to leave the lease area.',
      sev: 3, rec: 0, exp: 'medium', workers: 0, status: 'OPEN' },
    { id: '0024', insp: 'nkp-58', cat: 'Labour & Welfare Compliance',
      title: 'Overtime hours above statutory limit for surface loading crew',
      desc: 'Attendance records show surface loading crew overtime above the statutory weekly limit.',
      sev: 2, rec: 1, exp: 'medium', workers: 16, status: 'OPEN' },
    { id: '0116', insp: 'nkp-6', cat: 'Explosives & Blasting',
      title: 'Magazine stock register discrepancy and unmarked safety distances',
      desc: 'The explosives magazine stock register does not match physical stock, and the statutory safety distances around the magazine are not marked. A repeat of earlier magazine findings.',
      sev: 4, rec: 2, exp: 'high', workers: 8, status: 'IN_PROGRESS', ca: '0053',
      evidence: { fileName: 'magazine_register_page.jpg', fileType: 'image/jpeg', fileSizeKB: 241, note: 'Register balance differs from the physical count.' } },
    { id: '0117', insp: 'nkp-6', cat: 'Electrical Safety',
      title: 'Flameproof enclosure of main pump motor found with missing bolts',
      desc: 'The flameproof enclosure on the main pump motor was found with missing cover bolts, compromising its protection rating.',
      sev: 5, rec: 1, exp: 'high', workers: 12, status: 'IN_PROGRESS', ca: '0054' },
    { id: '0118', insp: 'nkp-6', cat: 'Operations & Production Control',
      title: 'Blast-hole charging log incomplete for three consecutive shifts',
      desc: 'The blast-hole charging log has missing entries for three consecutive shifts.',
      sev: 2, rec: 1, exp: 'low', workers: 6, status: 'OPEN' },

    // ===== Bokaro Valley Colliery 6 ===============================================
    { id: '0019', insp: 'bkr-78', cat: 'Environmental Compliance',
      title: 'Sprinkler coverage gap causing fugitive dust at coal loading siding',
      desc: 'A gap in sprinkler coverage at the coal loading siding is producing fugitive dust during wagon loading.',
      sev: 2, rec: 1, exp: 'low', workers: 10, status: 'OPEN' },
    { id: '0020', insp: 'bkr-78', cat: 'Statutory Documentation',
      title: 'Explosives permit renewal notice not displayed at magazine office',
      desc: 'The current explosives permit renewal notice is not displayed at the magazine office as required.',
      sev: 1, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },
    { id: '0030', insp: 'bkr-33', cat: 'Fire Safety',
      title: 'Spontaneous heating indications in coal stack near old goaf',
      desc: 'Temperature probes and visible haze indicate spontaneous heating in the coal stack adjacent to the old goaf.',
      sev: 4, rec: 1, exp: 'medium', workers: 12, status: 'IN_PROGRESS', ca: '0046' },
    { id: '0031', insp: 'bkr-33', cat: 'Contractor Compliance', contractor: 9,
      title: 'Lock-out/tag-out not applied during belt servicing by maintenance contractor',
      desc: 'The maintenance contractor serviced a belt drive without applying lock-out/tag-out.',
      sev: 4, rec: 1, exp: 'medium', workers: 6, status: 'OPEN' },

    // ===== Korba Opencast Block 11 ================================================
    { id: '0017', insp: 'kor11-101', cat: 'Operations & Production Control',
      title: 'Bench height deviates from approved mine plan on eastern bench',
      desc: 'The eastern bench has been developed above the bench height in the approved mine plan, a repeat of an earlier deviation.',
      sev: 3, rec: 2, exp: 'medium', workers: 12, status: 'OPEN' },
    { id: '0102', insp: 'kor11-11', cat: 'Electrical Safety',
      title: 'Unearthed junction box near conveyor transfer point',
      desc: 'A junction box feeding the overland conveyor transfer point was found without an intact earth connection during the electrical safety round.',
      sev: 3, rec: 0, exp: 'low', workers: 2, status: 'IN_PROGRESS', ca: '0050' },
    { id: '0109', insp: 'kor11-11', cat: 'Environmental Compliance',
      title: 'Haul-road dust suppression frequency below approved schedule',
      desc: 'Haul-road dust suppression is running below the approved schedule during peak dispatch hours.',
      sev: 2, rec: 1, exp: 'medium', workers: 10, status: 'OPEN' },

    // ===== Ramgarh Basin Opencast 9 ===============================================
    { id: '0014', insp: 'rmg-136', cat: 'Labour & Welfare Compliance',
      title: 'Attendance register entries found back-filled for two weekly offs',
      desc: 'Attendance register entries for two weekly offs were found back-filled after the fact.',
      sev: 2, rec: 1, exp: 'low', workers: 0, status: 'OPEN' },
    { id: '0032', insp: 'rmg-31', cat: 'Environmental Compliance',
      title: 'Effluent treatment plant overflow during heavy rain, capacity below design',
      desc: 'The effluent treatment plant overflowed during heavy rain and is operating below its design capacity.',
      sev: 3, rec: 1, exp: 'high', workers: 0, status: 'IN_PROGRESS', ca: '0045' },
    { id: '0033', insp: 'rmg-31', cat: 'PPE & Worker Safety',
      title: 'Dust masks not issued to surface workers at crusher feed hopper',
      desc: 'Surface workers at the crusher feed hopper have not been issued dust masks, a repeat of an earlier finding.',
      sev: 3, rec: 2, exp: 'medium', workers: 22, status: 'OPEN' },

    // ===== Korba Ridge Opencast 17 ================================================
    { id: '0028', insp: 'kor17-35', cat: 'PPE & Worker Safety',
      title: 'Reflective vests worn inconsistently by haul-road spotters',
      desc: 'Haul-road spotters were observed without reflective vests on two of four checks.',
      sev: 2, rec: 0, exp: 'low', workers: 4, status: 'OPEN' },
    { id: '0029', insp: 'kor17-35', cat: 'Statutory Documentation',
      title: 'Mine manager daily inspection register entry missing for one shift',
      desc: 'The mine manager daily inspection register has no entry for one shift in the audited week.',
      sev: 1, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },

    // ===== Singrauli Underground 7 ================================================
    { id: '0013', insp: 'sng07-141', cat: 'Statutory Documentation',
      title: 'Ventilation survey report filed three days late',
      desc: 'The periodic ventilation survey report was filed three days after its due date.',
      sev: 1, rec: 0, exp: 'low', workers: 0, status: 'OPEN' },
  ];

  // ---------------------------------------------------------------------------
  // Corrective actions (16). Lifecycle: OPEN → ASSIGNED → IN_PROGRESS →
  // SUBMITTED_FOR_VERIFICATION → CLOSED.
  //   created / due / started / submitted / closed are day offsets from the anchor.
  //   manual: true → created by the Compliance Officer (Moderate priority), instead
  //           of auto-assigned by the risk-triggered workflow (High / Critical).
  // Status mix:   Open 2 · Assigned 4 · In Progress 5 · Pending Verification 3 · Closed 2
  // Overdue (5):  0041 (+11d) 0022 (+13d) → Level 3 · 0055 hero (+4d) 0049 (+6d) → Level 2
  //               0056 (+2d) → Level 1       (levels are raised live by processEscalations)
  // ---------------------------------------------------------------------------
  const correctiveActionDefs = [
    // --- original six (ids, titles, priorities unchanged) --------------------------
    { id: '0041', issue: '0091', created: -19, due: -11, status: 'IN_PROGRESS', priority: 'CRITICAL', started: -18,
      title: 'Restore auxiliary ventilation fan at Seam 4 heading' },
    { id: '0038', issue: '0088', created: -17, due: 4, status: 'ASSIGNED', priority: 'HIGH',
      title: 'Correct roof bolt spacing to approved support plan, Panel 2' },
    { id: '0050', issue: '0102', created: -11, due: 9, status: 'IN_PROGRESS', priority: 'MODERATE', started: -9, manual: true,
      title: 'Re-earth junction box at conveyor transfer point' },
    { id: '0022', issue: '0065', created: -23, due: -13, status: 'IN_PROGRESS', priority: 'CRITICAL', started: -22,
      title: 'Restore secondary dewatering pump at Block C bench' },
    { id: '0023', issue: '0066', created: -20, due: 1, status: 'ASSIGNED', priority: 'CRITICAL',
      title: 'Complete blast exclusion zone barricading, eastern face' },
    { id: '0028', issue: '0070', created: -26, due: -16, status: 'CLOSED', priority: 'HIGH', started: -25, submitted: -19, closed: -18,
      title: 'Replace and recertify fire extinguishers, transfer house',
      completion: 'Three extinguishers replaced with new units and recertified; inspection tags updated.',
      evidence: { fileName: 'extinguisher_recert_tags.jpg', fileType: 'image/jpeg', fileSizeKB: 190, note: 'New certification tags on all three units.' },
      verification: 'Tags and certificates checked on site against the register.' },
    // --- new ten --------------------------------------------------------------------
    { id: '0055', issue: '0115', created: -7, due: -4, status: 'IN_PROGRESS', priority: 'CRITICAL', started: -6,
      title: 'Enforce mandatory PPE at Seam 4 loading point and re-certify all shift crews' },
    { id: '0049', issue: '0105', created: -13, due: -6, status: 'ASSIGNED', priority: 'HIGH',
      title: 'Reinstate support lines and restore approved depillaring sequence, Panel B' },
    { id: '0051', issue: '0106', created: -13, due: 1, status: 'SUBMITTED_FOR_VERIFICATION', priority: 'HIGH', started: -11, submitted: -3,
      title: 'Restore Panel B return-airway ventilation and verify methane below alert level',
      completion: 'Auxiliary fan relocated and the return-airway methane monitor recalibrated. Readings stayed below the alert level for 72 hours.',
      evidence: { fileName: 'methane_log_72h.pdf', fileType: 'application/pdf', fileSizeKB: 148, note: '72-hour methane readings, Panel B return airway.' } },
    { id: '0012', issue: '0012', created: -150, due: -143, status: 'CLOSED', priority: 'HIGH', started: -149, submitted: -146, closed: -144,
      title: 'Install standby sump pump with float-switch alarms in old workings',
      completion: 'Standby submersible pump installed; float-switch high-level alarms tested at the control room.',
      evidence: { fileName: 'standby_pump_commissioning.jpg', fileType: 'image/jpeg', fileSizeKB: 322, note: 'Commissioning photo with alarm test log.' },
      verification: 'Pump run-tested and alarms witnessed during follow-up.' },
    { id: '0053', issue: '0116', created: -6, due: 8, status: 'ASSIGNED', priority: 'HIGH',
      title: 'Reconcile magazine stock register and mark statutory safety distances' },
    { id: '0054', issue: '0117', created: -6, due: 1, status: 'SUBMITTED_FOR_VERIFICATION', priority: 'HIGH', started: -5,
      firstSubmitted: -3, rejected: -2, submitted: -1,
      rejection: { reason: 'Photo does not show the earth-continuity test reading.', instructions: 'Re-submit with the test instrument display visible.' },
      title: 'Replace missing flameproof enclosure bolts and re-test earthing, main pump motor',
      completion: 'Missing bolts replaced with flameproof-rated fasteners; earth-continuity test repeated and the reading recorded.',
      evidence: { fileName: 'earth_continuity_reading.jpg', fileType: 'image/jpeg', fileSizeKB: 236, note: 'Instrument display visible in frame.' } },
    { id: '0056', issue: '0111', created: -9, due: -2, status: 'OPEN', priority: 'HIGH',
      title: 'Suspend contractor blasting until a valid permit and licence are produced' },
    { id: '0057', issue: '0113', created: -9, due: 5, status: 'OPEN', priority: 'HIGH',
      title: 'Complete documented safety induction for all contract crew before deployment' },
    { id: '0046', issue: '0030', created: -26, due: 4, status: 'IN_PROGRESS', priority: 'MODERATE', started: -20, manual: true,
      title: 'Cool and re-compact coal stack and install temperature monitoring near old goaf' },
    { id: '0045', issue: '0032', created: -24, due: 6, status: 'SUBMITTED_FOR_VERIFICATION', priority: 'MODERATE', started: -20, submitted: -2, manual: true,
      title: 'Restore effluent treatment plant to design capacity and fix overflow weir',
      completion: 'Inlet screen cleaned, second clarifier brought online and the overflow weir raised to the design level.',
      evidence: { fileName: 'etp_after_photos.jpg', fileType: 'image/jpeg', fileSizeKB: 301, note: 'Before/after photos of clarifier and weir.' } },
  ];

  // ---------------------------------------------------------------------------
  // Contractors (12) — fictional companies. Each belongs to one mine
  // (Mine → Contractors). Status / risk follow contractorBand(complianceScore).
  // Mixed states: 5 Compliant · 4 Under Review · 3 Non-Compliant.
  // One licence has lapsed and one is about to; issues point back via contractorId.
  // ---------------------------------------------------------------------------
  const contractorDefs = [
    { n: 1, name: 'Tarkash Haulage Services', mine: 'JHR-04', service: 'Coal haulage & surface transport', score: 80, workforce: 62, lic: 45, start: -420, end: 310, audit: -48, contact: 'Rohit Mahto',
      remarks: 'Vehicle fitness records pending closure; under routine review.' },
    { n: 2, name: 'Ashvin Rockbolt Engineering', mine: 'JHR-04', service: 'Roof support & bolting', score: 91, workforce: 38, lic: 210, start: -700, end: 380, audit: -75, contact: 'Suresh Lohar',
      remarks: 'No open findings.' },
    { n: 3, name: 'Mahua Manpower Solutions', mine: 'JHR-12', service: 'Contract labour supply', score: 58, workforce: 143, lic: 20, start: -300, end: 120, audit: -9, contact: 'Pankaj Munda',
      remarks: 'Induction and wage-slip lapses under corrective action; licence renewal due within 30 days.' },
    { n: 4, name: 'Dhruva Drill & Blast Works', mine: 'JHR-12', service: 'Drilling & blasting', score: 41, workforce: 46, lic: -12, start: -510, end: 60, audit: -9, contact: 'Anil Tirkey',
      remarks: 'Licence lapsed; blasting without a valid permit is under escalation.' },
    { n: 5, name: 'Kesari Overburden Movers', mine: 'TAL-02', service: 'Overburden removal', score: 62, workforce: 96, lic: 120, start: -380, end: 240, audit: -9, contact: 'Bijay Nayak',
      remarks: 'Repeat reverse-alarm check lapses.' },
    { n: 6, name: 'Neelkanth Dewatering Co.', mine: 'TAL-02', service: 'Mine dewatering & pumping', score: 74, workforce: 28, lic: 300, start: -250, end: 400, audit: -23, contact: 'Prasanna Sahoo',
      remarks: 'Pump availability under review after the Block C water-table finding.' },
    { n: 7, name: 'Sundari Housekeeping & Sanitation', mine: 'RAN-03', service: 'Housekeeping & sanitation', score: 78, workforce: 54, lic: 95, start: -200, end: 160, audit: -40, contact: 'Gita Hembram',
      remarks: 'Gate-pass records being regularised.' },
    { n: 8, name: 'Vajra Ventilation Systems', mine: 'NKP-05', service: 'Ventilation fan servicing', score: 93, workforce: 22, lic: 400, start: -330, end: 500, audit: -60, contact: 'Mahesh Kujur',
      remarks: 'No open findings.' },
    { n: 9, name: 'Pinaka Equipment Maintenance', mine: 'BKR-06', service: 'Conveyor & equipment maintenance', score: 71, workforce: 41, lic: 160, start: -260, end: 220, audit: -33, contact: 'Ravi Pandey',
      remarks: 'Lock-out/tag-out discipline under review.' },
    { n: 10, name: 'Gomti Environmental Services', mine: 'RMG-09', service: 'Dust suppression & water sprinkling', score: 89, workforce: 33, lic: 260, start: -190, end: 330, audit: -70, contact: 'Kiran Ekka',
      remarks: 'No open findings.' },
    { n: 11, name: 'Shaurya Security Services', mine: 'KOR-11', service: 'Security & access control', score: 96, workforce: 58, lic: 180, start: -600, end: 270, audit: -85, contact: 'Nitin Sinha',
      remarks: 'No open findings.' },
    { n: 12, name: 'Anant Conveyor Works', mine: 'SNG-07', service: 'Conveyor installation & repair', score: 94, workforce: 36, lic: 340, start: -440, end: 190, audit: -57, contact: 'Harish Dubey',
      remarks: 'No open findings.' },
  ];

  // ---------------------------------------------------------------------------
  // Documents (10) — fictional records for the future Documents / OCR module.
  // type: LICENSE · INSPECTION_REPORT · ENVIRONMENTAL · LABOUR_COMPLIANCE
  // status: PROCESSED (OCR read cleanly) · FLAGGED (OCR found something to review)
  // ---------------------------------------------------------------------------
  const AUTH = 'Demo Regulatory Authority (fictional)';
  const documentDefs = [
    { n: 1, mine: 'JHR-04', title: 'Mining Lease & Operating Licence', type: 'LICENSE', file: 'JHR04_Mining_Lease_DEMO.pdf', kb: 1840, pages: 14,
      by: 'Sunita Rao', role: MINE_MANAGER, up: -130, status: 'PROCESSED', conf: 0.97,
      fields: { documentNumber: 'DEMO-ML-JHR04-0412', issuingAuthority: AUTH, validFrom: iso(-1400), validTill: iso(610) }, flags: [] },
    { n: 2, mine: 'JHR-04', title: 'Statutory Inspection Report', type: 'INSPECTION_REPORT', file: 'JHR04_Statutory_Inspection_DEMO.pdf', kb: 920, pages: 9,
      by: ARJUN, role: FIELD_OFFICER, up: -58, status: 'PROCESSED', conf: 0.95, inspection: 'jhr04-61',
      fields: { documentNumber: 'DEMO-SIR-JHR04-0061', issuingAuthority: AUTH, inspectionDate: iso(-61) }, flags: [] },
    { n: 3, mine: 'JHR-12', title: 'Contract Labour Licence & Worker Register', type: 'LABOUR_COMPLIANCE', file: 'JHR12_Contract_Labour_Register_DEMO.pdf', kb: 1260, pages: 11,
      by: 'Vikram Oraon', role: MINE_MANAGER, up: -6, status: 'FLAGGED', conf: 0.82, issue: '0114',
      fields: { documentNumber: 'DEMO-CLR-JHR12-0233', issuingAuthority: AUTH, validTill: iso(20), registeredHeadcount: 118 },
      flags: [
        { severity: 'high', message: 'Headcount in the register (118) is lower than the workers recorded on site (143).' },
        { severity: 'medium', message: 'Licence validity ends within 30 days.' },
      ] },
    { n: 4, mine: 'TAL-02', title: 'Environmental Clearance — Compliance Status Report', type: 'ENVIRONMENTAL', file: 'TAL02_EC_Compliance_Report_DEMO.pdf', kb: 2210, pages: 18,
      by: 'Manoj Behera', role: MINE_MANAGER, up: -20, status: 'FLAGGED', conf: 0.88, issue: '0103',
      fields: { documentNumber: 'DEMO-EC-TAL02-0087', issuingAuthority: AUTH, validTill: iso(540) },
      flags: [{ severity: 'high', message: 'Reported outfall pH exceeds the range stated in the clearance conditions.' }] },
    { n: 5, mine: 'TAL-02', title: 'Shot-firer Competency Certificates (Night Shift)', type: 'LABOUR_COMPLIANCE', file: 'TAL02_Shotfirer_Certificates_DEMO.pdf', kb: 640, pages: 6,
      by: ARJUN, role: FIELD_OFFICER, up: -14, status: 'FLAGGED', conf: 0.91, issue: '0072',
      fields: { documentNumber: 'DEMO-SFC-TAL02-0019', issuingAuthority: AUTH, certificatesCovered: 6 },
      flags: [{ severity: 'medium', message: 'Two certificates expire within the current inspection cycle.' }] },
    { n: 6, mine: 'RAN-03', title: 'Ventilation Survey Inspection Report', type: 'INSPECTION_REPORT', file: 'RAN03_Ventilation_Survey_DEMO.pdf', kb: 1105, pages: 12,
      by: SUBRATA, role: FIELD_OFFICER, up: -12, status: 'PROCESSED', conf: 0.94, inspection: 'ran-13',
      fields: { documentNumber: 'DEMO-SIR-RAN03-0013', issuingAuthority: AUTH, inspectionDate: iso(-13) }, flags: [] },
    { n: 7, mine: 'NKP-05', title: 'Explosives Storage Licence (Magazine)', type: 'LICENSE', file: 'NKP05_Explosives_Storage_Licence_DEMO.pdf', kb: 780, pages: 5,
      by: 'Alok Prasad', role: MINE_MANAGER, up: -95, status: 'PROCESSED', conf: 0.96,
      fields: { documentNumber: 'DEMO-ESL-NKP05-0150', issuingAuthority: AUTH, validFrom: iso(-165), validTill: iso(200) }, flags: [] },
    { n: 8, mine: 'BKR-06', title: 'Monthly Wage & Attendance Register — Surface Crew', type: 'LABOUR_COMPLIANCE', file: 'BKR06_Wage_Attendance_Register_DEMO.pdf', kb: 1530, pages: 22,
      by: 'Meera Kumari', role: MINE_MANAGER, up: -18, status: 'PROCESSED', conf: 0.93,
      fields: { documentNumber: 'DEMO-WAR-BKR06-0904', issuingAuthority: AUTH, period: 'Previous month' }, flags: [] },
    { n: 9, mine: 'RMG-09', title: 'Ambient Dust Monitoring Report', type: 'ENVIRONMENTAL', file: 'RMG09_Dust_Monitoring_DEMO.pdf', kb: 870, pages: 8,
      by: 'Farhan Qureshi', role: MINE_MANAGER, up: -25, status: 'PROCESSED', conf: 0.95,
      fields: { documentNumber: 'DEMO-ADM-RMG09-0221', issuingAuthority: AUTH, stationsCovered: 4 }, flags: [] },
    { n: 10, mine: 'RAN-03', title: 'Consent to Operate (Pollution Control) — Renewal Copy', type: 'ENVIRONMENTAL', file: 'RAN03_Consent_To_Operate_DEMO.pdf', kb: 560, pages: 4,
      by: 'Debashis Chatterjee', role: MINE_MANAGER, up: -9, status: 'FLAGGED', conf: 0.74, issue: '0107',
      fields: { documentNumber: 'DEMO-CTO-RAN03-0066', issuingAuthority: AUTH, validTill: iso(12) },
      flags: [{ severity: 'medium', message: 'Consent validity ends in 12 days; no renewal acknowledgement found in the document set.' }] },
  ];

  // ===========================================================================
  // Assembly: resolve refs → ids, derive consistent fields, build audit log and
  // notifications from the records above.
  // ===========================================================================
  const pad4 = (n) => String(n).padStart(4, '0');
  const issueId = (n) => `ISSUE-2026-${n}`;
  const caId = (n) => `CA-2026-${n}`;
  const contractorId = (n) => `CTR-2026-${pad4(n)}`;

  // --- Inspections (ids ascend with date; stored newest-first like live inserts)
  const inspectionByRef = Object.fromEntries(inspectionDefs.map((d) => [d.ref, d]));
  const inspectionOrder = inspectionDefs
    .map((d, i) => ({ d, i }))
    .sort((a, b) => a.d.off - b.d.off || a.i - b.i)
    .map((x) => x.d);
  const inspectionIdByRef = {};
  inspectionOrder.forEach((d, idx) => {
    inspectionIdByRef[d.ref] = `INSP-${Y}-${pad4(idx + 1)}`;
  });
  const inspections = inspectionOrder
    .map((d, idx) => ({
      id: inspectionIdByRef[d.ref],
      mineId: mineId(d.mine),
      inspectionType: d.type,
      category: d.category,
      observation: d.observation,
      inspector: d.by,
      inspectorRole: FIELD_OFFICER,
      date: iso(d.off),
      createdAt: stamp(d.off, 9, 30 + (idx % 25)),
    }))
    .reverse();

  // --- Issues
  const issueInput = (i) => ({
    severity: i.severity,
    recurrenceCount: i.recurrenceCount,
    exposureLevel: i.exposureLevel,
    exposureWorkers: i.exposureWorkers,
  });
  const issuesUnsorted = issueDefs.map((d) => {
    const insp = inspectionByRef[d.insp];
    const issue = {
      id: issueId(d.id),
      mineId: mineId(insp.mine),
      inspectionId: inspectionIdByRef[d.insp],
      category: d.cat,
      title: d.title,
      description: d.desc,
      status: d.status,
      severity: d.sev,
      recurrenceCount: d.rec,
      exposureLevel: d.exp,
      exposureWorkers: d.workers,
      evidence: d.evidence ?? null,
      observedDate: iso(insp.off),
      reportedBy: insp.by,
      reportedByRole: FIELD_OFFICER,
      correctiveActionId: d.ca ? caId(d.ca) : null,
    };
    if (d.contractor) issue.contractorId = contractorId(d.contractor);
    return issue;
  });
  const issueById = Object.fromEntries(issuesUnsorted.map((i) => [i.id, i]));
  const creationScore = (issue) =>
    calculateRisk({ ...issueInput(issue), correctiveActionDeadline: null }, asOf);
  // Newest first; within one inspection the highest-risk finding comes first
  // (the Inspections page links each inspection to the first issue it finds).
  const issues = issuesUnsorted.slice().sort((a, b) => {
    if (a.observedDate !== b.observedDate) return a.observedDate < b.observedDate ? 1 : -1;
    const sa = creationScore(a).riskScore;
    const sb = creationScore(b).riskScore;
    return sb - sa || (a.id < b.id ? -1 : 1);
  });

  // --- Corrective actions
  const correctiveActionsUnsorted = correctiveActionDefs.map((d) => {
    const issue = issueById[issueId(d.issue)];
    const code = issue.mineId.replace('MINE-', '');
    const manager = managerOf(code);
    const rec = {
      id: caId(d.id),
      issueId: issue.id,
      mineId: issue.mineId,
      title: d.title,
      status: d.status,
      priorityRisk: d.priority,
      assignee: manager,
      assigneeRole: MINE_MANAGER,
      createdDate: iso(d.created),
      dueDate: iso(d.due),
      escalationLevel: 0,
      escalationHistory: [],
    };
    if (d.started !== undefined) {
      rec.startedAt = stamp(d.started, 11, 20);
      rec.startedBy = manager;
    }
    if (d.rejection) {
      rec.rejectedAt = stamp(d.rejected, 15, 10);
      rec.rejectedBy = CO_NAME;
      rec.rejectionReason = d.rejection.reason;
      rec.additionalInstructions = d.rejection.instructions;
    }
    if (d.submitted !== undefined) {
      rec.submittedAt = stamp(d.submitted, 14, 30);
      rec.submittedBy = manager;
      rec.completionNotes = d.completion;
      rec.remarks = null;
      rec.evidence = d.evidence ?? null;
    }
    if (d.closed !== undefined) {
      const at = stamp(d.closed, 16, 0);
      rec.verifiedAt = at;
      rec.verifiedBy = CO_NAME;
      rec.verificationNotes = d.verification ?? null;
      rec.closedAt = at;
      rec.closedBy = CO_NAME;
    }
    return rec;
  });
  const correctiveActions = correctiveActionsUnsorted
    .slice()
    .sort((a, b) => (a.createdDate !== b.createdDate ? (a.createdDate < b.createdDate ? 1 : -1) : a.id < b.id ? 1 : -1));
  const caById = Object.fromEntries(correctiveActionsUnsorted.map((c) => [c.id, c]));

  // --- Mines: lastInspection = newest inspection; riskLevel = worst risk among
  // the mine's open issues (computed exactly as dataService.computeIssueRisk does).
  const CLOSED_CA = new Set(['VERIFIED', 'CLOSED']);
  const currentScore = (issue) => {
    const ca = issue.correctiveActionId ? caById[issue.correctiveActionId] : null;
    const deadline = ca && !CLOSED_CA.has(ca.status) ? ca.dueDate : null;
    return calculateRisk({ ...issueInput(issue), correctiveActionDeadline: deadline }, asOf).riskScore;
  };
  const mines = mineDefs.map((m) => {
    const id = mineId(m.code);
    const dates = inspectionDefs.filter((d) => d.mine === m.code).map((d) => iso(d.off)).sort();
    const openScores = issuesUnsorted.filter((i) => i.mineId === id && i.status !== 'CLOSED').map(currentScore);
    return {
      id,
      name: m.name,
      region: m.region,
      status: 'ACTIVE',
      latitude: m.lat,
      longitude: m.lng,
      riskLevel: getRiskLevel(openScores.length ? Math.max(...openScores) : 0),
      complianceStatus: m.compliance,
      lastInspection: dates[dates.length - 1] ?? null,
      manager: m.manager,
    };
  });

  // --- Contractors
  const contractors = contractorDefs.map((c) => ({
    id: contractorId(c.n),
    name: c.name,
    mineId: mineId(c.mine),
    serviceType: c.service,
    licenseNumber: `DEMO-CTR-LIC-${pad4(c.n)}`,
    licenseValidTill: iso(c.lic),
    workforceSize: c.workforce,
    complianceScore: c.score,
    ...contractorBand(c.score),
    contractStart: iso(c.start),
    contractEnd: iso(c.end),
    lastAuditDate: iso(c.audit),
    contactPerson: c.contact,
    remarks: c.remarks,
  }));

  // --- Documents
  const documents = documentDefs.map((d) => ({
    id: `DOC-2026-${pad4(d.n)}`,
    mineId: mineId(d.mine),
    title: d.title,
    documentType: d.type,
    fileName: d.file,
    fileType: 'application/pdf',
    fileSizeKB: d.kb,
    uploadedBy: d.by,
    uploadedByRole: d.role,
    uploadedDate: iso(d.up),
    status: d.status,
    ocr: {
      engine: 'Prototype OCR (simulated)',
      confidence: d.conf,
      pageCount: d.pages,
      extractedFields: d.fields,
    },
    flags: d.flags,
    relatedInspectionId: d.inspection ? inspectionIdByRef[d.inspection] : null,
    relatedIssueId: d.issue ? issueId(d.issue) : null,
  }));

  // ---------------------------------------------------------------------------
  // Audit log — one event per real state change, using the same action names the
  // live workflows write, always carrying mineId. Escalation events are NOT
  // seeded: processEscalations() raises them at startup.
  // ---------------------------------------------------------------------------
  const events = [];
  const logEvent = (ts, e) => events.push({ ts, ...e });
  const mineName = (id) => mines.find((m) => m.id === id).name;

  inspectionOrder.forEach((d, idx) => {
    logEvent(inspections.find((i) => i.id === inspectionIdByRef[d.ref]).createdAt, {
      actor: d.by, role: FIELD_OFFICER, action: 'Inspection Submitted', entity: 'Inspection',
      entityId: inspectionIdByRef[d.ref], mineId: mineId(d.mine),
      description: `${d.type} at ${mineName(mineId(d.mine))} — ${d.category}.`,
    });
  });
  issuesUnsorted.forEach((issue) => {
    const insp = inspectionByRef[issueDefs.find((d) => issueId(d.id) === issue.id).insp];
    const base = { entity: 'Issue', entityId: issue.id, mineId: issue.mineId };
    logEvent(stamp(insp.off, 11, 5), { ...base, actor: issue.reportedBy, role: FIELD_OFFICER, action: 'Issue Created', description: issue.title });
    const r = creationScore(issue);
    logEvent(stamp(insp.off, 11, 6), {
      ...base, actor: 'AI-Assisted Risk Assessment', role: 'Prototype Risk Intelligence Engine', action: 'Risk Calculated',
      description: `${r.riskLevelLabel} (${r.riskScore}/100) — rule-based demonstration model.`,
    });
  });
  correctiveActionDefs.forEach((d) => {
    const rec = caById[caId(d.id)];
    const base = { entity: 'Corrective Action', entityId: rec.id, mineId: rec.mineId };
    if (d.manual) {
      logEvent(stamp(d.created, 12, 0), {
        ...base, actor: CO_NAME, role: COMPLIANCE_OFFICER, action: 'Corrective Action Created',
        description: `${rec.id} assigned to ${rec.assignee} (Mine Manager), due ${rec.dueDate}.`,
      });
    } else {
      logEvent(stamp(d.created, 11, 10), {
        ...base, actor: 'System', role: 'Workflow', action: 'Corrective Action Auto-Assigned (Risk-Triggered)',
        description: `Auto-created for ${rec.priorityRisk} risk issue ${rec.issueId}; assigned to ${rec.assignee} (Mine Manager), due ${rec.dueDate}.`,
      });
    }
    if (rec.startedAt) {
      logEvent(rec.startedAt, {
        ...base, actor: rec.assignee, role: MINE_MANAGER, action: 'Corrective Action Status Changed',
        description: 'Corrective Action Status Changed: Open → In Progress',
      });
    }
    const submitEvent = (ts) =>
      logEvent(ts, {
        ...base, actor: rec.assignee, role: MINE_MANAGER, action: 'Corrective Action Submitted for Verification',
        description: `${rec.id} submitted for verification by ${rec.assignee}.`,
      });
    if (d.firstSubmitted !== undefined) submitEvent(stamp(d.firstSubmitted, 14, 30));
    if (rec.rejectedAt) {
      logEvent(rec.rejectedAt, {
        ...base, actor: CO_NAME, role: COMPLIANCE_OFFICER, action: 'Corrective Action Rejected / Reopened',
        description: `${rec.id} rejected by ${CO_NAME} and sent back for correction: ${rec.rejectionReason}`,
      });
    }
    if (rec.submittedAt) submitEvent(rec.submittedAt);
    if (rec.verifiedAt) {
      logEvent(rec.verifiedAt, {
        ...base, actor: CO_NAME, role: COMPLIANCE_OFFICER, action: 'Corrective Action Verified',
        description: `${rec.id} verified by ${CO_NAME}. Human compliance review — not an automated decision.`,
      });
      logEvent(stamp(d.closed, 16, 1), {
        ...base, actor: CO_NAME, role: COMPLIANCE_OFFICER, action: 'Corrective Action Closed',
        description: `${rec.id} closed by ${CO_NAME} following successful verification.`,
      });
    }
  });
  const auditChrono = events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => (a.e.ts < b.e.ts ? -1 : a.e.ts > b.e.ts ? 1 : a.i - b.i))
    .map(({ e }, idx) => ({ id: `AUD-${Y}-${pad4(idx + 1)}`, timestamp: e.ts, ...stripTs(e) }));
  const auditLog = auditChrono.slice().reverse(); // newest first

  // ---------------------------------------------------------------------------
  // Notifications — only the last 30 days (a realistic inbox). Older than 7 days
  // are read; the most recent are unread so every persona has a live inbox.
  // ---------------------------------------------------------------------------
  const notes = [];
  const notify = (off, h, m, n) => {
    if (off < -30) return;
    notes.push({ ts: stamp(off, h, m), read: off < -7, ...n });
  };
  inspectionOrder.forEach((d) => {
    const id = mineId(d.mine);
    notify(d.off, 9, 45, {
      title: 'Inspection Submitted', type: 'info', entityType: 'Inspection', entityId: inspectionIdByRef[d.ref], mineId: id,
      description: `${d.by} submitted a ${d.type.toLowerCase()} at ${mineName(id)}.`,
      recipientRole: ROLES.MINE_MANAGER, recipientName: managerOf(d.mine),
    });
  });
  correctiveActionDefs.forEach((d) => {
    const rec = caById[caId(d.id)];
    const issue = issueById[rec.issueId];
    const common = { entityType: 'CorrectiveAction', entityId: rec.id, mineId: rec.mineId };
    const mgr = { recipientRole: ROLES.MINE_MANAGER, recipientName: rec.assignee };
    const created = creationScore(issue);
    if (!d.manual && (created.riskLevel === 'HIGH' || created.riskLevel === 'CRITICAL')) {
      const alert = {
        title: `New ${created.riskLevelLabel} Risk Issue`, type: created.riskLevel === 'CRITICAL' ? 'critical' : 'warning',
        entityType: 'Issue', entityId: issue.id, mineId: rec.mineId,
        description: `${issue.title} at ${mineName(rec.mineId)} scored ${created.riskScore}/100.`,
      };
      notify(d.created, 11, 12, { ...alert, ...mgr });
      notify(d.created, 11, 13, { ...alert, recipientRole: ROLES.COMPLIANCE_OFFICER });
    }
    notify(d.created, 11, 14, {
      ...common, ...mgr,
      title: d.manual ? 'Corrective Action Assigned' : 'Corrective Action Auto-Assigned',
      type: d.manual ? 'info' : rec.priorityRisk === 'CRITICAL' ? 'critical' : 'warning',
      description: `${rec.id} assigned to ${rec.assignee} — due ${rec.dueDate}.`,
    });
    if (d.started !== undefined) {
      notify(d.started, 11, 21, {
        ...common, title: 'Corrective Action Started', type: 'info',
        description: `${rec.id} moved to In Progress by ${rec.assignee}.`,
        recipientRole: ROLES.FIELD_OFFICER, recipientName: issue.reportedBy,
      });
    }
    const verificationNote = (off) =>
      notify(off, 14, 31, {
        ...common, title: 'Verification Required', type: 'warning', recipientRole: ROLES.COMPLIANCE_OFFICER,
        description: `${rec.id} was submitted by ${rec.assignee} with evidence and is awaiting Compliance Officer review.`,
      });
    if (d.firstSubmitted !== undefined) verificationNote(d.firstSubmitted);
    if (d.rejected !== undefined) {
      notify(d.rejected, 15, 11, {
        ...common, ...mgr, title: 'Corrective Action Rejected — Correction Required', type: 'critical',
        description: `${rec.id} was rejected by ${CO_NAME} and returned to In Progress.`,
      });
    }
    if (d.submitted !== undefined && d.closed === undefined) verificationNote(d.submitted);
    if (d.closed !== undefined) {
      const closed = {
        ...common, title: 'Corrective Action Verified & Closed', type: 'info',
        description: `${rec.id} (${rec.title}) was verified and closed by ${CO_NAME}.`,
      };
      notify(d.closed, 16, 2, { ...closed, ...mgr });
      notify(d.closed, 16, 3, { ...closed, recipientRole: ROLES.FIELD_OFFICER, recipientName: issue.reportedBy });
    }
  });
  const notificationsChrono = notes
    .map((n, i) => ({ n, i }))
    .sort((a, b) => (a.n.ts < b.n.ts ? -1 : a.n.ts > b.n.ts ? 1 : a.i - b.i))
    .map(({ n }, idx) => ({ id: `NOTIF-${Y}-${pad4(idx + 1)}`, timestamp: n.ts, type: 'info', ...stripTs(n) }));
  const notifications = notificationsChrono.slice().reverse(); // newest first

  return { mines, inspections, issues, correctiveActions, contractors, documents, auditLog, notifications };
}

function stripTs({ ts, ...rest }) {
  return rest;
}

// Default dataset, anchored to the day the app loads. seedService calls
// buildSeedData(anchor) directly so tests and "reset" can pin the anchor.
const DEFAULT_SEED = buildSeedData(DEMO_NOW);
export const seedMines = DEFAULT_SEED.mines;
export const seedInspections = DEFAULT_SEED.inspections;
export const seedIssues = DEFAULT_SEED.issues;
export const seedCorrectiveActions = DEFAULT_SEED.correctiveActions;
export const seedContractors = DEFAULT_SEED.contractors;
export const seedDocuments = DEFAULT_SEED.documents;
export const seedAuditLog = DEFAULT_SEED.auditLog;
export const seedNotifications = DEFAULT_SEED.notifications;
