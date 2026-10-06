// KhanRakshak Risk Engine
// -----------------------
// Explainable risk intelligence engine — an AI-assisted RULE-BASED risk
// assessment. It is intentionally transparent and deterministic: it is NOT a
// trained ML model, and the same inputs always give the same score. Every
// score can be traced back to the four weighted components below.
//
// FORMULA (blueprint):
//
//   Risk Score = Severity   x 40%
//              + Recurrence x 25%
//              + Exposure   x 20%
//              + Delay      x 15%
//
// Each component is first NORMALIZED to a 0-100 sub-score, then multiplied by
// its weight. Because the weights sum to 100%, the result is on a 0-100 scale.
//
// NORMALIZATION (each raw input -> 0..100):
//   Severity   : rated 1-5                       -> (severity / 5) x 100
//   Recurrence : count of PRIOR occurrences,     -> (min(count, 3) / 3) x 100
//                capped at 3 (3+ = chronic)
//   Exposure   : rated 1-5                       -> (exposure / 5) x 100
//                (legacy low/medium/high levels from the inspection wizard map
//                 to 2 / 3 / 4 on the same 1-5 scale)
//   Delay      : whole days an OPEN corrective   -> min(daysOverdue x 10, 100)
//                action is past its deadline       (0 if not overdue / no action)
//
// Note: with these weights the maximum score WITHOUT any delay is 85, so a
// score above 85 always includes some overdue-corrective-action delay.
//
// RISK LEVELS (applied to the final score rounded to a whole number):
//    0 - 30   Low
//   31 - 60   Medium
//   61 - 80   High
//   81 - 100  Critical
//
// IMPORTANT: risk is meant to be recalculated on read (see
// services/dataService.js#computeIssueRisk), not cached at creation time —
// that's what lets an open corrective action's overdue state visibly push
// an issue's risk up as the demo clock moves forward.

// Component weights (sum = 1.0). Order matches the blueprint formula.
export const RISK_WEIGHTS = {
  severity: 0.4,
  recurrence: 0.25,
  exposure: 0.2,
  delay: 0.15,
};

// Upper bound (inclusive) of each level band, checked in ascending order.
// `level` is the stable code used by badges, filters and stored records — the
// 'MODERATE' code is kept for compatibility with existing data and UI; the
// blueprint's display name for that band is `label: 'Medium'`.
export const RISK_LEVEL_THRESHOLDS = [
  { max: 30, level: 'LOW', label: 'Low' },
  { max: 60, level: 'MODERATE', label: 'Medium' },
  { max: 80, level: 'HIGH', label: 'High' },
  { max: 100, level: 'CRITICAL', label: 'Critical' },
];

// Normalization constants (see NORMALIZATION above).
const SEVERITY_MAX = 5;
const EXPOSURE_MAX = 5;
const RECURRENCE_CAP = 3; // prior occurrences at/above this count as 100
const DELAY_POINTS_PER_DAY = 10; // 10 days overdue -> delay sub-score of 100

// Legacy exposure levels (Low/Medium/High in the inspection wizard) expressed
// on the 1-5 exposure scale.
const EXPOSURE_LEVEL_TO_SCALE = { low: 2, medium: 3, high: 4 };

function ordinal(n) {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

// Rounds to one decimal place (used for displayed per-component points).
function round1(n) {
  return Math.round(n * 10) / 10;
}

function findBand(score) {
  return RISK_LEVEL_THRESHOLDS.find((t) => score <= t.max) ?? RISK_LEVEL_THRESHOLDS[RISK_LEVEL_THRESHOLDS.length - 1];
}

// score is expected to be the final, whole-number risk score.
export function getRiskLevel(score) {
  return findBand(score).level;
}

// Blueprint display name for a level code (LOW/MODERATE/HIGH/CRITICAL).
export function getRiskLevelLabel(level) {
  return RISK_LEVEL_THRESHOLDS.find((t) => t.level === level)?.label ?? level;
}

// --- Normalization: raw input -> 0..100 sub-score -----------------------------

function normalizeSeverity(severity) {
  return clamp((Number(severity) || 0) / SEVERITY_MAX, 0, 1) * 100;
}

function normalizeRecurrence(recurrenceCount) {
  return clamp((Number(recurrenceCount) || 0) / RECURRENCE_CAP, 0, 1) * 100;
}

// Returns the exposure rating on the 1-5 scale. An explicit numeric `exposure`
// wins; otherwise the legacy low/medium/high level is mapped onto the scale.
function resolveExposureRating(exposure, exposureLevel) {
  const explicit = Number(exposure);
  if (exposure !== undefined && exposure !== null && exposure !== '' && !Number.isNaN(explicit)) {
    return clamp(explicit, 0, EXPOSURE_MAX);
  }
  return EXPOSURE_LEVEL_TO_SCALE[exposureLevel] ?? EXPOSURE_LEVEL_TO_SCALE.low;
}

function normalizeExposure(exposureRating) {
  return clamp(exposureRating / EXPOSURE_MAX, 0, 1) * 100;
}

function normalizeDelay(daysOverdue) {
  return clamp(daysOverdue * DELAY_POINTS_PER_DAY, 0, 100);
}

// Whole days between two dates. Same rounding as utils/date#daysBetween so the
// "N days overdue" shown across the app agrees with the delay used here.
function daysBetweenDates(later, earlier) {
  const ms = later.getTime() - earlier.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/**
 * calculateRisk — the single source of truth for a risk score.
 *
 * @param {Object} input
 * @param {number} input.severity - 1 to 5
 * @param {number} input.recurrenceCount - number of PRIOR occurrences (0 = first time)
 * @param {number} [input.exposure] - 1 to 5 exposure rating. Takes precedence over exposureLevel.
 * @param {'low'|'medium'|'high'} [input.exposureLevel] - legacy wizard level, used when
 *        `exposure` is not given (mapped to 2 / 3 / 4 on the 1-5 scale)
 * @param {number} [input.exposureWorkers] - worker count, used only for the reason text
 * @param {string|null} [input.correctiveActionDeadline] - ISO date of an OPEN corrective
 *        action's deadline, or null/undefined if none exists (or it's already closed/verified —
 *        callers should not pass a deadline for a closed action; see dataService)
 * @param {Date} [currentDemoDate] - defaults to now
 *
 * @returns {{
 *   riskScore: number, riskLevel: string, riskLevelLabel: string, reasons: string[],
 *   breakdown: Record<'severity'|'recurrence'|'exposure'|'delay',
 *     {input: number, value: number, weight: number, contribution: number, reason: string}>
 * }}
 *   breakdown[x].input        raw input the rule used (e.g. severity 5, 3 prior occurrences)
 *   breakdown[x].value        normalized 0-100 sub-score
 *   breakdown[x].weight       weight as a percentage (40 / 25 / 20 / 15)
 *   breakdown[x].contribution points added to the final score (= value x weight, 1 decimal)
 *   breakdown[x].reason       one-line human-readable explanation of that component
 */
export function calculateRisk(input, currentDemoDate = new Date()) {
  const {
    severity,
    recurrenceCount = 0,
    exposure,
    exposureLevel,
    exposureWorkers,
    correctiveActionDeadline,
  } = input;

  // 1. Normalize every component to 0-100.
  const severityRating = clamp(Number(severity) || 0, 0, SEVERITY_MAX);
  const recurrenceInput = Math.max(0, Number(recurrenceCount) || 0);
  const exposureRating = resolveExposureRating(exposure, exposureLevel);

  let daysOverdue = 0;
  if (correctiveActionDeadline) {
    const deadline = new Date(`${correctiveActionDeadline}T00:00:00`);
    if (!Number.isNaN(deadline.getTime()) && currentDemoDate.getTime() > deadline.getTime()) {
      daysOverdue = Math.max(0, daysBetweenDates(currentDemoDate, deadline));
    }
  }

  const severityScore = normalizeSeverity(severityRating);
  const recurrenceScore = normalizeRecurrence(recurrenceInput);
  const exposureScore = normalizeExposure(exposureRating);
  const delayScore = normalizeDelay(daysOverdue);

  // 2. Apply the weights. Contributions are kept unrounded for the sum so the
  //    final score is rounded exactly once (the small epsilon only guards
  //    against floating-point error landing just under a .5 boundary).
  const contributions = {
    severity: severityScore * RISK_WEIGHTS.severity,
    recurrence: recurrenceScore * RISK_WEIGHTS.recurrence,
    exposure: exposureScore * RISK_WEIGHTS.exposure,
    delay: delayScore * RISK_WEIGHTS.delay,
  };
  const rawScore =
    contributions.severity + contributions.recurrence + contributions.exposure + contributions.delay;

  // 3. Final score (whole number, 0-100) and level band.
  const riskScore = clamp(Math.round(rawScore + 1e-9), 0, 100);
  const band = findBand(riskScore);

  // 4. Short reasons (bulleted on Issue Detail via RiskReasonsList).
  const reasons = [];
  if (severityRating >= 4) reasons.push(`High severity (${severityRating} of ${SEVERITY_MAX})`);
  if (recurrenceInput >= 2) {
    reasons.push(`Repeated violation (${ordinal(recurrenceInput + 1)} occurrence)`);
  }
  if (exposureRating >= 4) {
    reasons.push(
      exposureWorkers ? `High worker exposure (${exposureWorkers} workers)` : 'High worker exposure'
    );
  }
  if (daysOverdue > 0) {
    reasons.push(`Corrective action overdue (+${daysOverdue} days)`);
  }
  if (reasons.length === 0) reasons.push('Within normal risk parameters');

  // 5. Per-component explanation: raw input, normalized value, weight,
  //    points contributed, and a plain-language reason.
  const component = (key, inputValue, normalized, text) => ({
    input: inputValue,
    value: round1(normalized),
    weight: RISK_WEIGHTS[key] * 100,
    contribution: round1(contributions[key]),
    reason: `${text} → ${round1(normalized)}/100 × ${RISK_WEIGHTS[key] * 100}% = +${round1(contributions[key])}`,
  });

  return {
    riskScore,
    riskLevel: band.level,
    riskLevelLabel: band.label,
    reasons,
    breakdown: {
      severity: component(
        'severity',
        severityRating,
        severityScore,
        `Severity ${severityRating} of ${SEVERITY_MAX}`
      ),
      recurrence: component(
        'recurrence',
        recurrenceInput,
        recurrenceScore,
        `${recurrenceInput} prior occurrence${recurrenceInput === 1 ? '' : 's'} (capped at ${RECURRENCE_CAP})`
      ),
      exposure: component(
        'exposure',
        exposureRating,
        exposureScore,
        `Exposure ${exposureRating} of ${EXPOSURE_MAX}`
      ),
      delay: component(
        'delay',
        daysOverdue,
        delayScore,
        daysOverdue > 0
          ? `Corrective action ${daysOverdue} day${daysOverdue === 1 ? '' : 's'} overdue`
          : 'No overdue corrective action'
      ),
    },
  };
}
