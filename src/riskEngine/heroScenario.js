// Scripted SIH hero-demonstration scenario — deliberately kept OUT of riskEngine.js.
//
// The blueprint's hero demo quotes "Workers repeatedly operating without required PPE → 87 / Critical".
// The generic formula gives 81 for those inputs on a brand-new issue (no overdue action yet; the
// seeded hero reaches 87 only because its corrective action is 4 days overdue). This deterministic
// 87/Critical result exists only for the scripted SIH prototype hero demonstration and does not
// represent a trained ML prediction.
//
// It applies ONLY when every condition below holds; any other inspection goes through
// riskEngine.calculateRisk() unchanged. The score is a floor (never lowers a score), so once the hero
// issue's corrective action goes overdue the normal engine's higher score simply takes over.
import { getRiskLevel, getRiskLevelLabel } from './riskEngine';
import { getCategoryGroup } from '../data/constants';

export const HERO_SCENARIO_ID = 'SIH_HERO_PPE';
export const HERO_SCRIPTED_SCORE = 87;

// Blueprint hero wording, matched anywhere in the observation (case/spacing-insensitive).
const HERO_WORDING = /repeatedly\s+operating\s+without\s+required\s+ppe/i;
const EXPOSURE_LEVEL_TO_SCALE = { low: 2, medium: 3, high: 4 }; // same mapping the engine uses

function exposureRating({ exposure, exposureLevel }) {
  if (exposure !== undefined && exposure !== null && exposure !== '' && !Number.isNaN(Number(exposure))) {
    return Number(exposure);
  }
  return EXPOSURE_LEVEL_TO_SCALE[exposureLevel];
}

/** True only for: Safety-domain category + hero wording + severity 5 + recurrence 3 + exposure 4. */
export function isHeroScenario(input) {
  return (
    getCategoryGroup(input?.category) === 'Safety' &&
    HERO_WORDING.test(String(input?.observation ?? '')) &&
    Number(input?.severity) === 5 &&
    Number(input?.recurrenceCount) === 3 &&
    exposureRating(input ?? {}) === 4
  );
}

/** Lifts an engine result to the scripted 87 / Critical; the engine's breakdown is passed through. */
export function applyHeroScenario(risk) {
  const riskScore = Math.max(risk.riskScore, HERO_SCRIPTED_SCORE);
  const riskLevel = getRiskLevel(riskScore);
  return {
    ...risk,
    riskScore,
    riskLevel,
    riskLevelLabel: getRiskLevelLabel(riskLevel),
    reasons: [...risk.reasons, 'Scripted SIH hero-demonstration scenario (prototype result, not an ML prediction)'],
  };
}
