/**
 * WealthGenie recommendation engine — deterministic suitability and ranking.
 *
 * Pipeline:
 *   1. Urgent financial priorities (emergency cushion, debt burden, surplus).
 *   2. Hard eligibility filter per category (transparent exclusion reasons).
 *   3. Transparent weighted scoring of eligible categories.
 *   4. Deterministic ordering (score desc, then stable lexical id order).
 *   5. Explicit `no-suitable` outcome when nothing is currently suitable.
 *
 * Everything here is pure and reproducible: identical inputs produce byte-for-
 * byte identical ranking. The LLM narrator (narrator.js) only reshapes these
 * results into plain language — it never changes them.
 */

import {
  CATEGORY_RISK_SCALE,
  CATEGORIES,
  LIQUIDITY,
  validateProductMetadata,
} from './categories.js';
import { ENGINE_VERSION } from './profileInput.js';
import { THRESHOLDS } from './readiness.js';

export const SCORING_WEIGHTS = Object.freeze({
  horizonFit: 0.3,
  riskFit: 0.25,
  liquidityFit: 0.2,
  goalAlignment: 0.25,
});

function goalCategories(profile) {
  const goals = (profile.goals || []).map((g) => g.goal).filter(Boolean);
  return new Set(goals.length > 0 ? goals : ['other']);
}

function goalAlignment(profile, category) {
  const wanted = goalCategories(profile);
  const scores = [];
  for (const goal of wanted) {
    // Emergency-fund goals map naturally onto instant liquidity.
    if (goal === 'emergency_fund' && category.liquidity === LIQUIDITY.INSTANT) {
      scores.push(1);
    } else if (goal === 'debt_repayment') {
      // Debt-repayment is not an investment goal for these categories: the
      // engine treats it as a priority instead of a category fit.
      scores.push(0.2);
    } else if (category.servesGoals.includes(goal)) {
      scores.push(1);
    } else {
      scores.push(0.3);
    }
  }
  if (scores.length === 0) return { factor: 0.5, reason: 'No goals provided; neutral alignment (0.5).' };
  const factor = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100;
  return { factor, reason: `Matched ${category.servesGoals.filter((g) => wanted.has(g)).length} of ${wanted.size} stated goal kinds.` };
}

function horizonFactor(profile, category) {
  const horizon = profile.investmentHorizonMonths;
  if (horizon === null) {
    return { factor: 0.5, reason: 'Horizon unknown; neutral score (0.5). Provide an investment horizon for a sharper ranking.' };
  }
  const { minHorizonMonths: min, maxHorizonMonths: max, horizonAnchorMonths: anchor } = category;
  if (min !== null && horizon < min) {
    return { factor: 0, reason: `Horizon below category minimum (${min} months before typical access).` };
  }
  if (max !== null && horizon > max) {
    return { factor: 0.4, reason: `Horizon extends beyond the typical range for this category (up to ${max} months).` };
  }
  // Distance to the anchor, full credit within ±50% of the anchor.
  const band = Math.max(1, anchor * 0.5);
  const distance = Math.abs(horizon - anchor);
  const factor = Math.max(0, 1 - distance / (band * 2));
  return {
    factor: Math.round(factor * 100) / 100,
    reason: factor >= 0.99
      ? 'Horizon sits squarely in this category’s typical band.'
      : `Horizon is within range but ${Math.round(distance)} months from the typical band centre`,
  };
}

function riskFactor(profile, riskCapacity, category) {
  const capacityLevel = riskCapacity.level;           // 1–5 derived
  const tolerance = profile.riskTolerance ?? capacityLevel; // 1–5 stated
  const effective = Math.min(tolerance, capacityLevel); // lower of the two governs
  const categoryLevel = Math.min(5, category.riskometerLevel); // 6 → 5 for capacity comparison
  const range = 4;
  const distance = Math.abs(effective - categoryLevel);
  const factor = Math.max(0, 1 - distance / range);
  const detail = distance === 0
    ? 'Risk level matches both stated tolerance and derived capacity.'
    : `Risk band distance ${distance} from the lower of stated tolerance (${tolerance}) and derived capacity (${capacityLevel}).`;
  return { effective, factor: Math.round(factor * 100) / 100, detail };
}

function liquidityFactor(profile, category) {
  if (profile.liquidityNeedMonths === null) {
    return { factor: 0.6, reason: 'Liquidity need unknown; mildly conservative default (0.6).' };
  }
  const redemptionMonths = { [LIQUIDITY.INSTANT]: 0, [LIQUIDITY.DAYS]: 0.25, [LIQUIDITY.WEEKS]: 1, [LIQUIDITY.MONTHS]: 3 }[category.liquidity];
  if (profile.liquidityNeedMonths <= redemptionMonths) {
    return { factor: 1, reason: `Access speed (${category.liquidity}) fits the stated need to reach money within ${profile.liquidityNeedMonths} month(s).` };
  }
  const factor = Math.max(0, 1 - (profile.liquidityNeedMonths - redemptionMonths) / 6);
  return { factor: Math.round(factor * 100) / 100, reason: `Withdrawal processing (~${redemptionMonths} month(s)) is slower than the stated ${profile.liquidityNeedMonths}-month liquidity need.` };
}

/** Urgent priorities ahead of any category suggestion. */
function buildPriorities(profile, readiness) {
  const priorities = [];
  const core = readiness.core;
  const efc = core.emergencyFundCoverageMonths;
  const effectiveExpenses = core.monthlyOutflows ?? null;

  if (efc !== null && efc < THRESHOLDS.EMERGENCY_MIN_MONTHS && effectiveExpenses > 0) {
    const targetMonths = profile.emergencyFundTargetMonths ?? THRESHOLDS.EMERGENCY_MIN_MONTHS;
    const fillTarget = effectiveExpenses * (efc >= 0 ? targetMonths : 0);
    const shortfall = Math.max(0, Math.round(fillTarget - (profile.accessibleSavings ?? 0)));
    priorities.push({
      id: 'emergency-fund-building',
      urgency: efc < 1 ? 'high' : 'medium',
      title: 'Build the emergency cushion first',
      detail: `Accessible savings cover about ${efc.toFixed(1)} months of expenses. A common practice is to hold ${targetMonths}–${THRESHOLDS.EMERGENCY_COMFORT_MONTHS} months; the shortfall to ${targetMonths} months is roughly ₹${shortfall.toLocaleString('en-IN')}.`,
      guidanceCategory: 'savings-account',
    });
  }

  if (readiness.debtBurdenPct !== null && readiness.debtBurdenPct > THRESHOLDS.DEBT_BURDEN_SAFE_PCT) {
    priorities.push({
      id: 'debt-burden-high',
      urgency: readiness.debtBurdenPct > THRESHOLDS.DEBT_BURDEN_HIGH_PCT ? 'high' : 'medium',
      title: 'Loan payments take a large share of income',
      detail: `Monthly loan payments equal about ${readiness.debtBurdenPct}% of income (informational only — the engine does not factor interest rates). Compare this with your loan interest costs before adding investments.`,
    });
  }

  if (core.monthlySurplus !== null && core.monthlySurplus < 0) {
    priorities.push({
      id: 'negative-surplus',
      urgency: 'high',
      title: 'Outflows currently exceed income',
      detail: 'No investable surplus exists this month. Investment suggestions are paused until the budget is rebalanced.',
    });
  }

  return priorities;
}

function scoreCategory(profile, readiness, category) {
  const horizon = horizonFactor(profile, category);
  const risk = riskFactor(profile, readiness.riskCapacity, category);
  const liquidity = liquidityFactor(profile, category);
  const goal = goalAlignment(profile, category);

  const breakdown = {
    horizonFit: { weight: SCORING_WEIGHTS.horizonFit, factor: horizon.factor, reason: horizon.reason },
    riskFit: { weight: SCORING_WEIGHTS.riskFit, factor: risk.factor, reason: risk.detail },
    liquidityFit: { weight: SCORING_WEIGHTS.liquidityFit, factor: liquidity.factor, reason: liquidity.reason },
    goalAlignment: { weight: SCORING_WEIGHTS.goalAlignment, factor: goal.factor, reason: goal.reason },
  };
  const score = Math.round(
    (horizon.factor * SCORING_WEIGHTS.horizonFit
      + risk.factor * SCORING_WEIGHTS.riskFit
      + liquidity.factor * SCORING_WEIGHTS.liquidityFit
      + goal.factor * SCORING_WEIGHTS.goalAlignment) * 10000,
  ) / 10000;

  return { score, breakdown, effectiveRiskLevel: risk.effective };
}

/** Hard eligibility gate → exclusion reasons are explicit, never hidden. */
function filterCategory(profile, readiness, category) {
  const core = readiness.core;
  const efc = core.emergencyFundCoverageMonths;

  if (category.needsEmergencyFundFirst) {
    if (efc === null) {
      return { eligible: false, reason: 'Excluded while emergency coverage is unknown — the engine cannot confirm a cushion exists. Provide accessible savings to unlock.' };
    }
    if (efc <= 0) {
      return { eligible: false, reason: 'Excluded with zero emergency savings; the usual practice is to build a cushion before market-risk investments.' };
    }
    if (efc < 1) {
      return { eligible: false, reason: `Excluded until the emergency cushion covers at least 1 month of expenses (currently ${efc.toFixed(1)}), since market investments can fall when money is suddenly needed.` };
    }
  }

  if (core.monthlySurplus !== null && core.monthlySurplus < 0 && category.riskometerLevel >= 3) {
    return { eligible: false, reason: 'Excluded while monthly outflows exceed income: committing money you do not have to a fluctuating category adds avoidable risk.' };
  }

  if (category.minHorizonMonths !== null) {
    if (profile.investmentHorizonMonths === null) {
      return { eligible: false, reason: `Excluded while the investment horizon is unknown: this category typically needs funds to stay invested ${category.minHorizonMonths}+ months.` };
    }
    if (profile.investmentHorizonMonths < category.minHorizonMonths) {
      return { eligible: false, reason: `Excluded: the stated horizon (${profile.investmentHorizonMonths} months) is shorter than the category’s minimum (${category.minHorizonMonths} months).` };
    }
  }

  if (category.requiresRetirementGoalOrLongHorizon) {
    const hasRetirementGoal = (profile.goals || []).some((g) => g.goal === 'retirement');
    const longHorizon = profile.investmentHorizonMonths !== null && profile.investmentHorizonMonths >= category.minHorizonMonths;
    if (!hasRetirementGoal && !longHorizon) {
      return { eligible: false, reason: 'Excluded: applies when a retirement goal is present or the horizon is very long (120+ months).' };
    }
  }

  // Risk-capacity gate: derived capacity must reach the category band.
  const capacityForCategory = Math.min(5, category.riskometerLevel);
  if (readiness.riskCapacity.level < capacityForCategory - 1) {
    return {
      eligible: false,
      reason: `Excluded: derived risk capacity is level ${readiness.riskCapacity.level} of 5, below the capacity this category usually needs (level ${capacityForCategory}).`,
    };
  }

  return { eligible: true };
}

function buildRecommendationEntry(profile, readiness, category, ranked) {
  const { score, breakdown } = scoreCategory(profile, readiness, category);
  const reasons = [];
  if (breakdown.riskFit.factor >= 0.7) reasons.push(`Risk band "${CATEGORY_RISK_SCALE[category.riskometerLevel]}" (${category.riskometerLevel}/6) matches your profile.`);
  if (breakdown.horizonFit.factor >= 0.7) reasons.push(`Typical access timing (${category.horizonAnchorMonths}-month band centre) fits your stated horizon.`);
  if (breakdown.goalAlignment.factor >= 0.8) reasons.push('Aligns with the goals you stated.');
  if (breakdown.liquidityFit.factor >= 0.8) reasons.push('Access speed fits your liquidity need.');
  if (reasons.length === 0) reasons.push('Eligible but with partial fit across several factors — see the score breakdown.');

  return {
    categoryId: category.id,
    label: category.label,
    description: category.description,
    riskometerLevel: category.riskometerLevel,
    riskometerLabel: CATEGORY_RISK_SCALE[category.riskometerLevel],
    liquidity: category.liquidity,
    score,
    scoreBreakdown: breakdown,
    effectiveRiskLevelUsed: readiness.riskCapacity.level < (profile.riskTolerance ?? 5)
      ? readiness.riskCapacity.level
      : (profile.riskTolerance ?? readiness.riskCapacity.level),
    reasons,
    risks: [...category.risks, category.maxShareNote].filter(Boolean),
    suitabilityConditions: [
      'This is a category-level suggestion, not a product recommendation.',
      'Independently verify any rate, cost and risk disclosures on official sources before investing.',
    ],
    productDataStatus: 'unconnected',
  };
}

/**
 * Build the complete recommendation result.
 * @param {object} profile normalized profile (profileInput.js)
 * @param {object} readiness readiness payload (readiness.js)
 */
export function buildRecommendations(profile, readiness) {
  const metadataProblems = validateProductMetadata();
  if (metadataProblems.length > 0) throw new Error(`Category registry invalid: ${metadataProblems.join('; ')}`);

  const priorities = buildPriorities(profile, readiness);
  const eligible = [];
  const excluded = [];

  for (const category of CATEGORIES) {
    const filter = filterCategory(profile, readiness, category);
    if (filter.eligible) eligible.push(category);
    else excluded.push({ categoryId: category.id, label: category.label, reason: filter.reason });
  }

  const rankedEntries = eligible
    .map((category) => buildRecommendationEntry(profile, readiness, category))
    .sort((a, b) => (b.score - a.score) || a.categoryId.localeCompare(b.categoryId))
    .map((entry, index) => ({ ...entry, rank: index + 1 }));

  const positiveSurplusKnown = readiness.core.monthlySurplus !== null && readiness.core.monthlySurplus > 0;
  const emergencyOnly = priorities.some((p) => p.id === 'emergency-fund-building');
  const investable = readiness.investableSurplusPerMonth ?? 0;
  const noSuitable =
    rankedEntries.length === 0
    || (investable < THRESHOLDS.MIN_INVESTABLE_MONTHLY && !positiveSurplusKnown);

  let outcome;
  if (noSuitable) {
    outcome = {
      status: 'no-suitable-investment-now',
      headline: rankedEntries.length === 0
        ? 'No investment category is currently suitable from the information provided.'
        : 'No meaningful investable surplus is available yet, so no category is suggested right now.',
    };
  } else {
    outcome = {
      status: 'categories-suggested',
      headline: `${rankedEntries.length} investment categor${rankedEntries.length === 1 ? 'y' : 'ies'} fit the profile as provided.`,
    };
  }

  const missingMaterial = [];
  if (profile.monthlyIncome === null) missingMaterial.push({ field: 'Monthly income', why: 'Surplus, savings rate and risk capacity all depend on it.' });
  if (profile.monthlyExpenses === null) missingMaterial.push({ field: 'Monthly expenses', why: 'Emergency coverage and surplus cannot be computed without it.' });
  if (profile.riskTolerance === null) missingMaterial.push({ field: 'Risk tolerance', why: 'Category risk-bands are matched using the lower of stated tolerance and derived capacity.' });
  if (profile.investmentHorizonMonths === null) missingMaterial.push({ field: 'Investment horizon', why: 'Horizon gates several categories and drives the ranking.' });

  return {
    engineVersion: ENGINE_VERSION,
    priorities,
    recommendations: rankedEntries,
    excluded: excluded.sort((a, b) => a.categoryId.localeCompare(b.categoryId)),
    outcome: {
      ...outcome,
      detail: noSuitable
        ? 'The readiness summary below shows what is currently uncertain or negative; resolving those items usually unlocks category suggestions.'
        : 'Assumptions: points to rates/returns must still be verified on official sources — none are encoded in the engine.',
    },
    missingMaterial,
    scoring: {
      weights: SCORING_WEIGHTS,
      note: 'Weights are fixed and published. Identical inputs always produce the identical ranking.',
    },
  };
}
