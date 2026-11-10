/**
 * WealthGenie - Personalized Investment Planner calculations.
 *
 * Conventions
 * -----------
 * - `monthlyContribution` is invested at the END of each month (ordinary
 *   annuity). This is deliberate: the first contribution earns no return in
 *   month 1, and the last contribution earns no return in month n.
 * - `annualReturnPct` is an assumed EFFECTIVE annual return. It is converted
 *   to an effective monthly rate with r = (1 + annualReturn)^(1/12) - 1.
 * - The future value of a constant monthly contribution is:
 *     r != 0: FV = C * (((1 + r)^n - 1) / r)
 *     r == 0: FV = C * n
 * - These are hypothetical illustrations, not forecasts. No taxes, fees,
 *   inflation, volatility, or changing income are modelled.
 */

import { formatINR } from './formatters.js';

export const CONTRIBUTION_TIMING = 'end_of_month';

// Uses the same 3-month heuristic as the Digital Twin's
// DEFAULT_TWIN_THRESHOLDS.lowMandatoryCoverageMonths. The coverage value itself
// comes from the saved assessment (accessible savings / monthly expenses), so
// the planner can warn without an extra API round-trip. The threshold is a
// heuristic, not a universal rule.
export const EMERGENCY_COVERAGE_THRESHOLD_MONTHS = 3;

export const MAX_MONTHLY_CONTRIBUTION = 10000000;

function assertFiniteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return numeric;
}

function toFiniteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function assertNonNegative(value, label) {
  const numeric = assertFiniteNumber(value, label);
  if (numeric < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }
  return numeric;
}

function assertWholeMonths(value) {
  const numeric = assertFiniteNumber(value, 'Months');
  if (!Number.isInteger(numeric)) {
    throw new Error('Months must be a whole number.');
  }
  if (numeric < 0) {
    throw new Error('Months must be zero or greater.');
  }
  return numeric;
}

/**
 * Convert an assumed effective annual return into an effective monthly rate.
 * @param {number} annualReturnPct e.g. 8 for 8% per year
 * @returns {number} effective monthly rate, e.g. 0.006434...
 */
export function annualToMonthlyRate(annualReturnPct) {
  const annual = assertFiniteNumber(annualReturnPct, 'Annual return');
  if (annual <= -100) {
    throw new Error('Annual return must be greater than -100%.');
  }
  return Math.pow(1 + annual / 100, 1 / 12) - 1;
}

/**
 * Project the future value of a constant end-of-month contribution.
 * @param {object} input
 * @param {number} input.monthlyContribution
 * @param {number} input.annualReturnPct assumed effective annual return
 * @param {number} input.months number of monthly contributions
 */
export function futureValue({ monthlyContribution, annualReturnPct, months }) {
  const contribution = assertNonNegative(
    monthlyContribution,
    'Monthly contribution'
  );
  const monthCount = assertWholeMonths(months);
  const annualReturn = assertFiniteNumber(annualReturnPct, 'Annual return');
  const monthlyRate = annualToMonthlyRate(annualReturn);
  const totalContributions = contribution * monthCount;

  let projectedValue = 0;
  if (monthCount > 0 && contribution > 0) {
    projectedValue =
      monthlyRate === 0
        ? totalContributions
        : contribution *
          ((Math.pow(1 + monthlyRate, monthCount) - 1) / monthlyRate);
  }

  return {
    monthlyContribution: contribution,
    annualReturnPct: annualReturn,
    monthlyRate,
    months: monthCount,
    totalContributions,
    futureValue: projectedValue,
    gain: projectedValue - totalContributions,
    contributionTiming: CONTRIBUTION_TIMING,
  };
}

/**
 * Apply a single hypothetical decline to a projected end value.
 * This is not a path simulation and is not a forecast.
 * @param {object} input
 * @param {number} input.projectedValue
 * @param {number} input.declinePct 0-100
 */
export function applyDownside({ projectedValue, declinePct }) {
  const value = assertNonNegative(projectedValue, 'Projected value');
  const decline = assertFiniteNumber(declinePct, 'Decline percentage');
  if (decline < 0 || decline > 100) {
    throw new Error('Decline percentage must be between 0 and 100.');
  }

  const downsideValue = value * (1 - decline / 100);
  return {
    projectedValue: value,
    declinePct: decline,
    downsideValue,
    loss: value - downsideValue,
    lossPct: decline,
  };
}

/**
 * Extract the planner inputs from a saved assessment row.
 * Returns null when the assessment has no metrics, so the UI can show an
 * honest empty state instead of inventing personal financial values.
 */
export function extractPlannerSnapshot(assessment) {
  const result = assessment?.result;
  const metrics = result?.metrics;
  if (!metrics) return null;

  const projection = result.goalProjection || null;

  return {
    assessmentId: assessment.id || null,
    createdAt: assessment.createdAt || null,
    goal: result.goal || assessment.goal || null,
    monthlyIncome: toFiniteOrNull(metrics.monthlyIncome),
    monthlyOutflows: toFiniteOrNull(metrics.monthlyOutflows),
    monthlySurplus: toFiniteOrNull(metrics.monthlySurplus),
    accessibleSavings: toFiniteOrNull(metrics.accessibleSavings),
    emergencyCoverageMonths: toFiniteOrNull(
      metrics.emergencyFundCoverageMonths ?? metrics.expenseCoverageMonths
    ),
    emiIncludedInExpenses: Boolean(metrics.emiIncludedInExpenses),
    targetAmount: projection?.targetAmount ?? null,
    currentGoalSavings: projection?.currentGoalSavings ?? 0,
    remainingAmount: projection?.remainingAmount ?? null,
    goalTimelineMonths: projection?.requestedTimelineMonths ?? null,
    requiredMonthlyContributionForTimeline:
      projection?.requiredMonthlyContributionForTimeline ?? null,
    assessmentMonthlyContribution:
      projection?.assumedMonthlyContribution ?? null,
  };
}

/**
 * Build the educational warnings shown next to the planner.
 * The planner never silently clamps a contribution; it explains the conflict.
 */
export function buildInvestmentWarnings({
  monthlyContribution,
  monthlySurplus,
  emergencyCoverageMonths,
  coverageThresholdMonths = EMERGENCY_COVERAGE_THRESHOLD_MONTHS,
}) {
  const contribution = Number(monthlyContribution) || 0;
  const surplusKnown =
    monthlySurplus !== null &&
    monthlySurplus !== undefined &&
    monthlySurplus !== '' &&
    Number.isFinite(Number(monthlySurplus));
  const surplus = surplusKnown ? Number(monthlySurplus) : null;
  const threshold = Number(coverageThresholdMonths);
  const warnings = [];

  if (surplusKnown) {
    if (contribution > 0 && surplus <= 0) {
      warnings.push({
        id: 'no_surplus',
        severity: 'critical',
        message: `Your assessment shows no positive monthly surplus, so a ${formatINR(
          contribution
        )} monthly investment is not funded by current cash flow.`,
      });
    } else if (contribution > surplus) {
      warnings.push({
        id: 'contribution_exceeds_surplus',
        severity: 'critical',
        message: `Your planned ${formatINR(
          contribution
        )} monthly investment exceeds your ${formatINR(
          surplus
        )} monthly surplus by ${formatINR(contribution - surplus)}.`,
      });
    } else if (contribution > 0 && contribution === surplus) {
      warnings.push({
        id: 'full_surplus',
        severity: 'warning',
        message: `This allocates your entire ${formatINR(
          surplus
        )} monthly surplus. Consider keeping a buffer for irregular expenses.`,
      });
    }
  }

  if (
    emergencyCoverageMonths !== null &&
    emergencyCoverageMonths !== undefined &&
    Number.isFinite(Number(emergencyCoverageMonths))
  ) {
    const coverage = Number(emergencyCoverageMonths);
    if (coverage < threshold) {
      warnings.push({
        id: 'low_emergency_coverage',
        severity: 'warning',
        message: `Your accessible savings cover ${coverage.toFixed(
          1
        )} months of expenses, below the ${threshold}-month heuristic.`,
      });
    }
  }

  return warnings;
}

/**
 * Compare the projected investment corpus with the selected goal.
 * Current goal savings are kept separate from accessible (emergency) savings.
 * They are added at their saved value and are not assumed to grow, so the
 * comparison does not double-count them or credit unearned returns.
 * A hypothetical decline can be applied to the projected corpus before the
 * comparison, so the downside section can show its effect on the goal gap.
 */
export function goalFundingComparison({
  targetAmount,
  currentGoalSavings = 0,
  monthlyContribution,
  annualReturnPct,
  goalTimelineMonths = null,
  plannerHorizonMonths,
  declinePct = 0,
}) {
  if (targetAmount === null || targetAmount === undefined) return null;

  const target = assertFiniteNumber(targetAmount, 'Goal target');
  if (target <= 0) return null;

  const current = Math.max(0, Number(currentGoalSavings) || 0);
  const goalMonths =
    goalTimelineMonths === null || goalTimelineMonths === undefined
      ? null
      : assertWholeMonths(goalTimelineMonths);
  const plannerMonths = assertWholeMonths(plannerHorizonMonths);
  const usesGoalTimeline = goalMonths !== null && goalMonths > 0;
  const monthsUsed = usesGoalTimeline ? goalMonths : plannerMonths;

  const projection = futureValue({
    monthlyContribution,
    annualReturnPct,
    months: monthsUsed,
  });
  const downside = applyDownside({
    projectedValue: projection.futureValue,
    declinePct,
  });

  const remaining = Math.max(0, target - current);
  const projectedFunding = current + downside.downsideValue;
  const gap = Math.max(0, target - projectedFunding);
  const surplus = Math.max(0, projectedFunding - target);

  return {
    targetAmount: target,
    currentGoalSavings: current,
    remainingAmount: remaining,
    monthsUsed,
    horizonSource: usesGoalTimeline ? 'goal_timeline' : 'planner_horizon',
    projectedFutureValue: downside.downsideValue,
    projectedFutureValueBeforeDecline: projection.futureValue,
    declinePct: downside.declinePct,
    projectedFunding,
    gap,
    surplus,
    coveragePct:
      target > 0 ? Math.min(100, (projectedFunding / target) * 100) : null,
  };
}

/**
 * A conservative starting contribution: half the positive surplus, rounded
 * down to the nearest ₹100 and capped at ₹5,000. The user can change it.
 * This intentionally does not default to the entire surplus.
 */
export function suggestedMonthlyContribution(monthlySurplus) {
  const surplus = Number(monthlySurplus);
  if (!Number.isFinite(surplus) || surplus <= 0) return 0;

  const half = surplus * 0.5;
  const rounded = Math.floor(half / 100) * 100;
  return Math.min(5000, Math.max(0, rounded));
}

/**
 * Build the alternative-return rows: no growth, a lower assumption, and the
 * user's assumption. Duplicate rates are removed.
 */
export function buildReturnScenarios({
  monthlyContribution,
  annualReturnPct,
  months,
}) {
  const annual = assertFiniteNumber(annualReturnPct, 'Annual return');
  const rates = Array.from(
    new Set(
      [0, annual, Math.max(0, annual - 4)].map(
        (rate) => Math.round(rate * 100) / 100
      )
    )
  ).sort((a, b) => a - b);

  return rates.map((rate) => ({
    annualReturnPct: rate,
    ...futureValue({ monthlyContribution, annualReturnPct: rate, months }),
  }));
}

/**
 * Build the downside rows: 10%, 20%, 30%, and the selected decline.
 * Duplicate declines are removed.
 */
export function buildDownsideScenarios({
  projectedValue,
  selectedDeclinePct,
}) {
  const selected = assertFiniteNumber(
    selectedDeclinePct,
    'Decline percentage'
  );
  const declines = Array.from(
    new Set([10, 20, 30, selected])
  ).sort((a, b) => a - b);

  return declines.map((declinePct) => ({
    declinePct,
    ...applyDownside({ projectedValue, declinePct }),
  }));
}
