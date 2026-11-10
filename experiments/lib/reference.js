/**
 * Independent reference calculations for the Phase 4 evaluation.
 *
 * These functions deliberately do NOT import the assessment or Digital Twin
 * maths. They re-implement the documented rules from raw inputs so that the
 * experiment compares the engine against an independent reference rather than
 * against itself.
 *
 * The reference is still an implementation written by the same project. It is
 * a second implementation of the written formulas, not an external oracle.
 */

export const CORE_METRIC_KEYS = Object.freeze([
  'monthlyIncome',
  'monthlyExpenses',
  'accessibleSavings',
  'emiPayments',
  'emiIncludedInExpenses',
  'unexpectedExpense',
  'monthlyOutflows',
  'monthlySurplus',
  'savingsRatePct',
  'livingExpenseCoverageMonths',
  'mandatoryOutflowCoverageMonths',
  'emiBurdenPct',
  'postShockSavings',
  'unfundedShock',
]);

export const EXPLANATION_METRIC_KEYS = Object.freeze([
  ...CORE_METRIC_KEYS,
  'expenseCoverageMonths',
]);

export const GOAL_FIELD_KEYS = Object.freeze([
  'targetAmount',
  'currentGoalSavings',
  'remainingAmount',
  'assumedMonthlyContribution',
  'estimatedMonths',
  'unreachable',
  'requestedTimelineMonths',
  'requiredMonthlyContributionForTimeline',
  'onTrackForRequestedTimeline',
  'goalAchieved',
  'estimatedCompletionDate',
]);

export const COMPARISON_METRIC_DEFINITIONS = Object.freeze([
  { key: 'monthlyIncome', kind: 'currency' },
  { key: 'monthlyExpenses', kind: 'currency' },
  { key: 'monthlyOutflows', kind: 'currency' },
  { key: 'monthlySurplus', kind: 'currency' },
  { key: 'savingsRatePct', kind: 'percent' },
  { key: 'accessibleSavings', kind: 'currency' },
  { key: 'unexpectedExpense', kind: 'currency' },
  { key: 'postShockSavings', kind: 'currency' },
  { key: 'unfundedShock', kind: 'currency' },
  { key: 'livingExpenseCoverageMonths', kind: 'months' },
  { key: 'mandatoryOutflowCoverageMonths', kind: 'months' },
  { key: 'emiPayments', kind: 'currency' },
  { key: 'emiBurdenPct', kind: 'percent' },
]);

export const COMPARISON_GOAL_KEYS = Object.freeze([
  'targetAmount',
  'currentGoalSavings',
  'remainingAmount',
  'assumedMonthlyContribution',
  'estimatedMonths',
  'completionDate',
  'goalAchieved',
  'onTrackForRequestedTimeline',
]);

export const RECOMMENDATION_SEVERITY = Object.freeze({
  deficit: 'critical',
  break_even: 'warning',
  low_mandatory_coverage: 'warning',
  high_emi_burden: 'warning',
  unfunded_shock: 'critical',
  unaffordable_goal_contribution: 'warning',
  goal_achieved: 'positive',
});

export const RECOMMENDATION_IDS = Object.freeze(
  Object.keys(RECOMMENDATION_SEVERITY)
);

export const DEFAULT_THRESHOLDS = Object.freeze({
  lowMandatoryCoverageMonths: 3,
  highEmiBurdenPct: 40,
});

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function daysInMonth(year, monthIndex) {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [
    31,
    leap ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return days[monthIndex];
}

/**
 * Round a positive ratio up to a whole month while tolerating binary
 * floating-point noise. This is a separate implementation from the engine's
 * numerator/denominator helper.
 */
export function ceilMonthsIndependent(value) {
  if (!(value > 0)) return 0;
  if (value < 1) return 1;

  const tolerance = 1e-9 * value;
  return Math.ceil(value - tolerance);
}

/**
 * Add whole calendar months using the documented month-end clamp rule.
 * Implemented with an explicit day table instead of Date arithmetic.
 */
export function addMonthsClampedIndependent(startDate, months) {
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('Projected months must be a non-negative whole number.');
  }

  const [year, month, day] = String(startDate).split('-').map(Number);
  const totalMonths = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonthIndex = totalMonths % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonthIndex));

  return [
    String(targetYear).padStart(4, '0'),
    String(targetMonthIndex + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-');
}

export function referenceMetrics(input = {}) {
  const monthlyIncome = Number(input.monthlyIncome);
  const monthlyExpenses = Number(input.monthlyExpenses);
  const accessibleSavings = Number(input.accessibleSavings);
  const emiPayments = isMissing(input.emiPayments) ? 0 : Number(input.emiPayments);
  const emiIncludedInExpenses = isMissing(input.emiIncludedInExpenses)
    ? true
    : Boolean(input.emiIncludedInExpenses);
  const unexpectedExpense = isMissing(input.unexpectedExpense)
    ? 0
    : Number(input.unexpectedExpense);

  const monthlyOutflows =
    monthlyExpenses + (emiIncludedInExpenses ? 0 : emiPayments);
  const monthlySurplus = monthlyIncome - monthlyOutflows;
  const savingsRatePct =
    monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : null;
  const livingExpenseCoverageMonths =
    monthlyExpenses > 0 ? accessibleSavings / monthlyExpenses : null;
  const mandatoryOutflowCoverageMonths =
    monthlyOutflows > 0 ? accessibleSavings / monthlyOutflows : null;
  const emiBurdenPct =
    monthlyIncome > 0 ? (emiPayments / monthlyIncome) * 100 : null;
  const postShockSavings = Math.max(0, accessibleSavings - unexpectedExpense);
  const unfundedShock = Math.max(0, unexpectedExpense - accessibleSavings);

  return {
    monthlyIncome,
    monthlyExpenses,
    accessibleSavings,
    emiPayments,
    emiIncludedInExpenses,
    unexpectedExpense,
    monthlyOutflows,
    monthlySurplus,
    savingsRatePct,
    livingExpenseCoverageMonths,
    // Compatibility alias exposed by the engine.
    expenseCoverageMonths: livingExpenseCoverageMonths,
    mandatoryOutflowCoverageMonths,
    emiBurdenPct,
    postShockSavings,
    unfundedShock,
  };
}

export function referenceGoal(input = {}, asOfDate) {
  const targetAmount = isMissing(input.targetAmount)
    ? null
    : Number(input.targetAmount);
  const currentGoalSavings = isMissing(input.currentGoalSavings)
    ? 0
    : Number(input.currentGoalSavings);
  const monthlySavingsCapacity = isMissing(input.monthlySavingsCapacity)
    ? null
    : Number(input.monthlySavingsCapacity);
  const goalTimelineMonths = isMissing(input.goalTimelineMonths)
    ? null
    : Number(input.goalTimelineMonths);

  const { monthlySurplus } = referenceMetrics(input);
  const assumedMonthlyContribution =
    monthlySavingsCapacity !== null
      ? monthlySavingsCapacity
      : Math.max(0, monthlySurplus);

  const remainingAmount =
    targetAmount === null ? null : Math.max(0, targetAmount - currentGoalSavings);

  let estimatedMonths = null;
  if (remainingAmount === 0) {
    estimatedMonths = 0;
  } else if (remainingAmount !== null && assumedMonthlyContribution > 0) {
    estimatedMonths = ceilMonthsIndependent(
      remainingAmount / assumedMonthlyContribution
    );
  }

  const unreachable =
    remainingAmount === null
      ? null
      : remainingAmount > 0 && estimatedMonths === null;

  const requiredMonthlyContributionForTimeline =
    goalTimelineMonths !== null
      ? remainingAmount === 0
        ? 0
        : remainingAmount === null
          ? null
          : ceilMonthsIndependent(remainingAmount / goalTimelineMonths)
      : null;

  const onTrackForRequestedTimeline =
    goalTimelineMonths !== null && estimatedMonths !== null
      ? estimatedMonths <= goalTimelineMonths
      : null;

  return {
    targetAmount,
    currentGoalSavings,
    remainingAmount,
    assumedMonthlyContribution,
    estimatedMonths,
    unreachable,
    requestedTimelineMonths: goalTimelineMonths,
    requiredMonthlyContributionForTimeline,
    onTrackForRequestedTimeline,
    goalAchieved:
      targetAmount === null ? null : currentGoalSavings >= targetAmount,
    estimatedCompletionDate:
      estimatedMonths === null
        ? null
        : addMonthsClampedIndependent(asOfDate, estimatedMonths),
  };
}

export function referenceRecommendationIds(
  metrics,
  goal,
  thresholds = DEFAULT_THRESHOLDS
) {
  const lowCoverage =
    thresholds.lowMandatoryCoverageMonths ??
    DEFAULT_THRESHOLDS.lowMandatoryCoverageMonths;
  const highEmi =
    thresholds.highEmiBurdenPct ?? DEFAULT_THRESHOLDS.highEmiBurdenPct;

  const ids = [];

  if (metrics.monthlySurplus < 0) {
    ids.push('deficit');
  } else if (metrics.monthlySurplus === 0) {
    ids.push('break_even');
  }

  if (
    metrics.mandatoryOutflowCoverageMonths !== null &&
    metrics.mandatoryOutflowCoverageMonths < lowCoverage
  ) {
    ids.push('low_mandatory_coverage');
  }

  if (metrics.emiBurdenPct !== null && metrics.emiBurdenPct > highEmi) {
    ids.push('high_emi_burden');
  }

  if (metrics.unexpectedExpense > metrics.accessibleSavings) {
    ids.push('unfunded_shock');
  }

  if (
    goal.assumedMonthlyContribution > 0 &&
    goal.assumedMonthlyContribution > metrics.monthlySurplus
  ) {
    ids.push('unaffordable_goal_contribution');
  }

  if (goal.goalAchieved === true) {
    ids.push('goal_achieved');
  }

  return ids;
}

function compareNumber(key, kind, baselineValue, scenarioValue) {
  const baseline = numberOrNull(baselineValue);
  const scenario = numberOrNull(scenarioValue);
  const hasBoth = baseline !== null && scenario !== null;
  const difference = hasBoth ? scenario - baseline : null;

  return {
    key,
    kind,
    baseline,
    scenario,
    difference,
    percentageChange:
      hasBoth && baseline !== 0
        ? (difference / Math.abs(baseline)) * 100
        : null,
    percentagePointDifference:
      kind === 'percent' && hasBoth ? scenario - baseline : null,
  };
}

export function referenceComparison(baselineInput, scenarioInput, asOfDate) {
  const baselineMetrics = referenceMetrics(baselineInput);
  const scenarioMetrics = referenceMetrics(scenarioInput);
  const baselineGoal = referenceGoal(baselineInput, asOfDate);
  const scenarioGoal = referenceGoal(scenarioInput, asOfDate);

  const metrics = COMPARISON_METRIC_DEFINITIONS.map(({ key, kind }) =>
    compareNumber(
      key,
      kind,
      baselineMetrics[key],
      scenarioMetrics[key]
    )
  );

  const goalProjection = {
    targetAmount: compareNumber(
      'targetAmount',
      'currency',
      baselineGoal.targetAmount,
      scenarioGoal.targetAmount
    ),
    currentGoalSavings: compareNumber(
      'currentGoalSavings',
      'currency',
      baselineGoal.currentGoalSavings,
      scenarioGoal.currentGoalSavings
    ),
    remainingAmount: compareNumber(
      'remainingAmount',
      'currency',
      baselineGoal.remainingAmount,
      scenarioGoal.remainingAmount
    ),
    assumedMonthlyContribution: compareNumber(
      'assumedMonthlyContribution',
      'currency',
      baselineGoal.assumedMonthlyContribution,
      scenarioGoal.assumedMonthlyContribution
    ),
    estimatedMonths: compareNumber(
      'estimatedMonths',
      'months',
      baselineGoal.estimatedMonths,
      scenarioGoal.estimatedMonths
    ),
    completionDate: {
      baseline: baselineGoal.estimatedCompletionDate ?? null,
      scenario: scenarioGoal.estimatedCompletionDate ?? null,
      differenceMonths:
        Number.isFinite(baselineGoal.estimatedMonths) &&
        Number.isFinite(scenarioGoal.estimatedMonths)
          ? scenarioGoal.estimatedMonths - baselineGoal.estimatedMonths
          : null,
      direction:
        Number.isFinite(baselineGoal.estimatedMonths) &&
        Number.isFinite(scenarioGoal.estimatedMonths)
          ? scenarioGoal.estimatedMonths < baselineGoal.estimatedMonths
            ? 'earlier'
            : scenarioGoal.estimatedMonths > baselineGoal.estimatedMonths
              ? 'later'
              : 'same'
          : null,
    },
    goalAchieved: {
      baseline: baselineGoal.goalAchieved ?? null,
      scenario: scenarioGoal.goalAchieved ?? null,
      changed:
        baselineGoal.goalAchieved !== null &&
        scenarioGoal.goalAchieved !== null
          ? baselineGoal.goalAchieved !== scenarioGoal.goalAchieved
          : false,
    },
    onTrackForRequestedTimeline: {
      baseline: baselineGoal.onTrackForRequestedTimeline ?? null,
      scenario: scenarioGoal.onTrackForRequestedTimeline ?? null,
      changed:
        baselineGoal.onTrackForRequestedTimeline !== null &&
        scenarioGoal.onTrackForRequestedTimeline !== null
          ? baselineGoal.onTrackForRequestedTimeline !==
            scenarioGoal.onTrackForRequestedTimeline
          : false,
    },
  };

  return {
    baselineMetrics,
    scenarioMetrics,
    baselineGoal,
    scenarioGoal,
    metrics,
    goalProjection,
  };
}
