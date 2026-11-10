/**
 * WealthGenie - Financial Digital Twin
 *
 * A deterministic, rule-based what-if calculator built on top of the existing
 * assessment engine's validation helpers and month-rounding utility. It does
 * not use an ML model and it does not change the existing assessment API.
 *
 * All monetary amounts are monthly INR figures unless explicitly labelled as
 * one-time amounts. Results are illustrative estimates, not predictions.
 */

import {
  validateGoal,
  validateNonNegativeNumber,
  validatePositiveNumber,
  ceilMonths,
} from './financialAssessment.js';

export const TWIN_VERSION = '1.0.0';

export const DEFAULT_TWIN_THRESHOLDS = Object.freeze({
  lowMandatoryCoverageMonths: 3,
  highEmiBurdenPct: 40,
});

export const COMPLETION_DATE_RULE =
  'Whole calendar months are added to the as-of date. If the as-of day does not exist in the target month, the date is clamped to that month\'s last day (for example, 31 January + 1 month = 28 or 29 February).';

export const ESTIMATE_NOTICE =
  'A scenario is an illustrative estimate calculated from the inputs supplied. It is not a prediction of future outcomes, a guarantee, or regulated financial advice.';

const TIMELINE_ALIASES = ['goalTimelineMonths', 'desiredTimelineMonths', 'timelineMonths'];

const GLOBAL_ASSUMPTIONS = Object.freeze([
  'All monetary amounts are monthly INR figures unless explicitly labelled as one-time amounts.',
  'No investment returns, interest, inflation, taxes, or future income changes are modelled.',
  'Recommendations use configurable heuristic thresholds and are educational, not universal financial rules.',
  'A scenario is a what-if estimate based on the inputs supplied, not a prediction of future outcomes.',
]);

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function firstProvided(...values) {
  return values.find((value) => !isMissing(value));
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

/**
 * Validate and normalise a complete Digital Twin input object.
 * Invalid values are rejected; optional missing values receive documented
 * defaults. Invalid values are never silently replaced with zero.
 */
export function normalizeTwinInputs(input = {}) {
  assertPlainObject(input, 'Digital twin input');

  const monthlyIncome = validateNonNegativeNumber(
    input.monthlyIncome,
    'Monthly income'
  );
  const monthlyExpenses = validateNonNegativeNumber(
    input.monthlyExpenses,
    'Monthly expenses'
  );
  const accessibleSavings = validateNonNegativeNumber(
    input.accessibleSavings,
    'Accessible savings'
  );
  const goal = validateGoal(input.goal);

  const emiPayments = validateNonNegativeNumber(
    input.emiPayments,
    'EMI payments',
    { allowMissing: true }
  ) ?? 0;

  const emiIncludedInExpenses = input.emiIncludedInExpenses ?? true;
  if (typeof emiIncludedInExpenses !== 'boolean') {
    throw new Error('emiIncludedInExpenses must be a boolean.');
  }

  const unexpectedExpense = validateNonNegativeNumber(
    input.unexpectedExpense,
    'Unexpected one-time expense',
    { allowMissing: true }
  ) ?? 0;

  const monthlySavingsCapacity = validateNonNegativeNumber(
    input.monthlySavingsCapacity,
    'Monthly savings capacity',
    { allowMissing: true }
  );

  const targetAmount = validateNonNegativeNumber(
    input.targetAmount,
    'Goal target amount',
    { allowMissing: true }
  );

  if (targetAmount === 0) {
    throw new Error('Goal target amount must be greater than zero when provided.');
  }

  const currentGoalSavings = validateNonNegativeNumber(
    input.currentGoalSavings,
    'Current goal savings',
    { allowMissing: true }
  ) ?? 0;

  const goalTimelineMonths = validatePositiveNumber(
    firstProvided(...TIMELINE_ALIASES.map((key) => input[key])),
    'Goal timeline in months',
    { allowMissing: true }
  );

  if (goalTimelineMonths !== null && !Number.isInteger(goalTimelineMonths)) {
    throw new Error('Goal timeline in months must be a whole number.');
  }

  return {
    monthlyIncome,
    monthlyExpenses,
    accessibleSavings,
    goal,
    emiPayments,
    emiIncludedInExpenses,
    unexpectedExpense,
    monthlySavingsCapacity,
    targetAmount,
    currentGoalSavings,
    goalTimelineMonths,
  };
}

/**
 * Configurable heuristic thresholds. They are deliberately explicit so the UI
 * can label them as heuristics rather than universal financial rules.
 */
export function normalizeTwinThresholds(thresholds = {}) {
  if (thresholds === undefined || thresholds === null) {
    thresholds = {};
  }
  assertPlainObject(thresholds, 'Thresholds');

  const lowMandatoryCoverageMonths = isMissing(
    thresholds.lowMandatoryCoverageMonths
  )
    ? DEFAULT_TWIN_THRESHOLDS.lowMandatoryCoverageMonths
    : validatePositiveNumber(
        thresholds.lowMandatoryCoverageMonths,
        'Low mandatory-outflow coverage threshold'
      );

  const highEmiBurdenPct = isMissing(thresholds.highEmiBurdenPct)
    ? DEFAULT_TWIN_THRESHOLDS.highEmiBurdenPct
    : validatePositiveNumber(
        thresholds.highEmiBurdenPct,
        'High EMI burden threshold'
      );

  return {
    lowMandatoryCoverageMonths,
    highEmiBurdenPct,
    isHeuristic: true,
    note:
      'These thresholds are configurable heuristics, not universal financial rules. Adjust them to your circumstances.',
  };
}

/**
 * Validate an ISO calendar date and return it as YYYY-MM-DD. Missing values
 * resolve to today's UTC date so projections are reproducible for a given day.
 */
export function resolveAsOfDate(value) {
  if (isMissing(value)) {
    return new Date().toISOString().slice(0, 10);
  }

  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new Error('As-of date must use YYYY-MM-DD format.');
  }

  const trimmed = value.trim();
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== trimmed
  ) {
    throw new Error('As-of date is not a valid calendar date.');
  }

  return trimmed;
}

/**
 * Add whole calendar months to a date using the documented month-end rule:
 * clamp the day to the last valid day of the target month.
 */
export function addCalendarMonthsClamped(startDate, months) {
  if (isMissing(startDate)) {
    throw new Error('Start date is required to project a completion date.');
  }
  if (!Number.isInteger(months) || months < 0) {
    throw new Error('Projected months must be a non-negative whole number.');
  }

  const start = resolveAsOfDate(startDate);
  const [year, month, day] = start.split('-').map(Number);
  const targetMonthIndex = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = targetMonthIndex % 12;
  const lastDayOfTargetMonth = new Date(
    Date.UTC(targetYear, targetMonth + 1, 0)
  ).getUTCDate();
  const targetDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(Date.UTC(targetYear, targetMonth, targetDay))
    .toISOString()
    .slice(0, 10);
}

function metricExplanation(label, formula, inputs, reason, assumptions = []) {
  return { label, formula, inputs, assumptions, reason };
}

function recommendation({
  id,
  severity,
  title,
  trigger,
  reason,
  formula,
  inputs,
  assumptions,
  heuristic = false,
  threshold = null,
  suggestedAction,
}) {
  return {
    id,
    severity,
    title,
    trigger,
    reason,
    formula,
    inputs,
    assumptions,
    heuristic,
    threshold,
    suggestedAction,
  };
}

/**
 * Calculate one independent Digital Twin result. The input object is never
 * mutated, so callers can safely reuse the same baseline for many scenarios.
 */
export function calculateTwin(input = {}, { thresholds, asOfDate } = {}) {
  assertPlainObject(input, 'Digital twin input');

  const requestedAsOf = asOfDate ?? input.asOfDate;
  const normalized = normalizeTwinInputs(input);
  const effectiveThresholds = normalizeTwinThresholds(thresholds);
  const asOf = resolveAsOfDate(requestedAsOf);

  const {
    monthlyIncome,
    monthlyExpenses,
    accessibleSavings,
    goal,
    emiPayments,
    emiIncludedInExpenses,
    unexpectedExpense,
    monthlySavingsCapacity,
    targetAmount,
    currentGoalSavings,
    goalTimelineMonths,
  } = normalized;

  // O = E + (EMI already included in expenses ? 0 : M)
  const monthlyOutflows =
    monthlyExpenses + (emiIncludedInExpenses ? 0 : emiPayments);

  // P = I - O
  const monthlySurplus = monthlyIncome - monthlyOutflows;

  // P / I * 100, null when income is zero.
  const savingsRatePct =
    monthlyIncome > 0 ? (monthlySurplus / monthlyIncome) * 100 : null;

  // S / E, null when living expenses are zero. This preserves the existing
  // assessment's expense-coverage definition.
  const livingExpenseCoverageMonths =
    monthlyExpenses > 0 ? accessibleSavings / monthlyExpenses : null;

  // S / O, null when mandatory outflows are zero.
  const mandatoryOutflowCoverageMonths =
    monthlyOutflows > 0 ? accessibleSavings / monthlyOutflows : null;

  // M / I * 100, null when income is zero.
  const emiBurdenPct =
    monthlyIncome > 0 ? (emiPayments / monthlyIncome) * 100 : null;

  // max(0, S - U) and max(0, U - S). The shock is applied exactly once.
  const postShockSavings = Math.max(0, accessibleSavings - unexpectedExpense);
  const unfundedShock = Math.max(0, unexpectedExpense - accessibleSavings);

  const goalAchieved =
    targetAmount === null ? null : currentGoalSavings >= targetAmount;

  // remaining = max(0, T - C)
  const remainingAmount =
    targetAmount === null
      ? null
      : Math.max(0, targetAmount - currentGoalSavings);

  // The contribution is used only for the goal timeline. It is never
  // subtracted from monthly surplus a second time.
  const assumedMonthlyContribution =
    monthlySavingsCapacity ?? Math.max(0, monthlySurplus);

  let estimatedMonths = null;
  if (remainingAmount === 0) {
    estimatedMonths = 0;
  } else if (remainingAmount !== null && assumedMonthlyContribution > 0) {
    estimatedMonths = ceilMonths(remainingAmount, assumedMonthlyContribution);
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
          : ceilMonths(remainingAmount, goalTimelineMonths)
      : null;

  const onTrackForRequestedTimeline =
    goalTimelineMonths !== null && estimatedMonths !== null
      ? estimatedMonths <= goalTimelineMonths
      : null;

  const estimatedCompletionDate =
    estimatedMonths === null
      ? null
      : addCalendarMonthsClamped(asOf, estimatedMonths);

  const goalProjection = {
    targetAmount,
    currentGoalSavings,
    remainingAmount,
    assumedMonthlyContribution,
    estimatedMonths,
    unreachable,
    requestedTimelineMonths: goalTimelineMonths,
    requiredMonthlyContributionForTimeline,
    onTrackForRequestedTimeline,
    goalAchieved,
    estimatedCompletionDate,
    asOfDate: asOf,
    completionDateRule: COMPLETION_DATE_RULE,
    assumptions: [
      'No investment returns or interest are included.',
      'Contributions are assumed to remain constant.',
      'The unexpected one-time expense is not deducted from future goal contributions.',
      'The completion date is a mathematical estimate, not a prediction or guarantee.',
    ],
  };

  const metrics = {
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
    // Compatibility alias for consumers that already use the assessment name.
    expenseCoverageMonths: livingExpenseCoverageMonths,
    mandatoryOutflowCoverageMonths,
    emiBurdenPct,
    postShockSavings,
    unfundedShock,
  };

  const recommendations = [];

  if (monthlySurplus < 0) {
    recommendations.push(
      recommendation({
        id: 'deficit',
        severity: 'critical',
        title: 'Monthly deficit',
        trigger: 'P < 0',
        reason:
          'Monthly outflows exceed monthly income, so this scenario has a cash-flow deficit.',
        formula: 'P = I - O',
        inputs: { monthlyIncome, monthlyOutflows, monthlySurplus },
        assumptions: [
          'EMI is counted exactly once through monthly outflows.',
          'All amounts are monthly figures.',
        ],
        suggestedAction:
          'Review expenses and debt obligations before committing to new savings or investments.',
      })
    );
  } else if (monthlySurplus === 0) {
    recommendations.push(
      recommendation({
        id: 'break_even',
        severity: 'warning',
        title: 'Break-even budget',
        trigger: 'P = 0',
        reason:
          'Monthly income exactly covers monthly outflows, leaving no surplus for new goals or unexpected costs.',
        formula: 'P = I - O',
        inputs: { monthlyIncome, monthlyOutflows, monthlySurplus },
        assumptions: ['All amounts are monthly figures.'],
        suggestedAction:
          'Look for a sustainable monthly surplus before adding new financial commitments.',
      })
    );
  }

  if (
    mandatoryOutflowCoverageMonths !== null &&
    mandatoryOutflowCoverageMonths <
      effectiveThresholds.lowMandatoryCoverageMonths
  ) {
    recommendations.push(
      recommendation({
        id: 'low_mandatory_coverage',
        severity: 'warning',
        title: 'Low mandatory-outflow coverage',
        trigger: `S / O < ${effectiveThresholds.lowMandatoryCoverageMonths} months`,
        reason: `Accessible savings cover about ${mandatoryOutflowCoverageMonths.toFixed(
          1
        )} months of mandatory outflows, below the configured heuristic threshold.`,
        formula: 'coverage = S / O',
        inputs: {
          accessibleSavings,
          monthlyOutflows,
          mandatoryOutflowCoverageMonths,
        },
        assumptions: [
          'Mandatory outflows include expenses plus separately paid EMI, if any.',
          'Accessible savings are assumed to be available for emergencies.',
        ],
        heuristic: true,
        threshold: {
          key: 'lowMandatoryCoverageMonths',
          value: effectiveThresholds.lowMandatoryCoverageMonths,
          unit: 'months',
          note: 'Heuristic threshold, not a universal rule.',
        },
        suggestedAction:
          'Consider whether a larger accessible emergency cushion would suit your circumstances.',
      })
    );
  }

  if (
    emiBurdenPct !== null &&
    emiBurdenPct > effectiveThresholds.highEmiBurdenPct
  ) {
    recommendations.push(
      recommendation({
        id: 'high_emi_burden',
        severity: 'warning',
        title: 'High EMI burden',
        trigger: `M / I > ${effectiveThresholds.highEmiBurdenPct}%`,
        reason: `EMI payments equal about ${emiBurdenPct.toFixed(
          1
        )}% of monthly income, above the configured heuristic threshold.`,
        formula: 'EMI burden = M / I × 100',
        inputs: { emiPayments, monthlyIncome, emiBurdenPct },
        assumptions: [
          'EMI burden is measured against income regardless of whether EMI is included in expenses.',
        ],
        heuristic: true,
        threshold: {
          key: 'highEmiBurdenPct',
          value: effectiveThresholds.highEmiBurdenPct,
          unit: '%',
          note: 'Heuristic threshold, not a universal rule.',
        },
        suggestedAction:
          'Review debt interest rates, outstanding balances, and repayment terms before taking on more debt.',
      })
    );
  }

  if (unexpectedExpense > accessibleSavings) {
    recommendations.push(
      recommendation({
        id: 'unfunded_shock',
        severity: 'critical',
        title: 'Unexpected expense is not fully funded',
        trigger: 'U > S',
        reason:
          'The one-time unexpected expense is larger than accessible savings, leaving part of it unfunded.',
        formula: 'unfunded = max(0, U - S)',
        inputs: {
          unexpectedExpense,
          accessibleSavings,
          postShockSavings,
          unfundedShock,
        },
        assumptions: [
          'The unexpected expense is applied once to accessible savings.',
          'No borrowing or asset sales are assumed.',
        ],
        suggestedAction:
          'Plan how the unfunded portion would be covered before treating the scenario as manageable.',
      })
    );
  }

  if (
    assumedMonthlyContribution > 0 &&
    assumedMonthlyContribution > monthlySurplus
  ) {
    recommendations.push(
      recommendation({
        id: 'unaffordable_goal_contribution',
        severity: 'warning',
        title: 'Goal contribution exceeds surplus',
        trigger: 'contribution > P',
        reason:
          'The monthly savings or goal contribution is larger than the scenario surplus, so it may not be sustainable.',
        formula: 'contribution > P',
        inputs: {
          assumedMonthlyContribution,
          monthlySurplus,
          monthlySavingsCapacity,
        },
        assumptions: [
          'The goal contribution is not subtracted from surplus a second time.',
          'The contribution is assumed to remain constant.',
        ],
        suggestedAction:
          'Reduce the planned contribution or increase the surplus before relying on this timeline.',
      })
    );
  }

  if (goalAchieved === true) {
    recommendations.push(
      recommendation({
        id: 'goal_achieved',
        severity: 'positive',
        title: 'Goal already achieved',
        trigger: 'C >= T',
        reason:
          'Current goal savings already meet or exceed the target amount, so no additional contribution is required for this goal.',
        formula: 'remaining = max(0, T - C)',
        inputs: { targetAmount, currentGoalSavings, remainingAmount },
        assumptions: [
          'Current goal savings are assumed to be available for this goal.',
        ],
        suggestedAction:
          'Consider whether the target still matches your plans or whether the surplus can be directed elsewhere.',
      })
    );
  }

  const explanations = {
    metrics: {
      monthlyIncome: metricExplanation(
        'Monthly income',
        'I = monthly income provided',
        { monthlyIncome },
        'Starting point for monthly surplus, savings rate, and EMI burden.'
      ),
      monthlyExpenses: metricExplanation(
        'Monthly living expenses',
        'E = monthly living expenses provided',
        { monthlyExpenses },
        'Used in monthly outflows and living-expense coverage.'
      ),
      accessibleSavings: metricExplanation(
        'Accessible savings',
        'S = accessible savings provided',
        { accessibleSavings },
        'Used for emergency coverage and to absorb an unexpected one-time expense.'
      ),
      emiPayments: metricExplanation(
        'Monthly EMI payments',
        'M = monthly EMI payments provided',
        { emiPayments },
        'Added to outflows only when EMI is not already included in expenses.'
      ),
      emiIncludedInExpenses: metricExplanation(
        'EMI already included in expenses',
        'Boolean flag supplied by the user',
        { emiIncludedInExpenses },
        'Prevents EMI from being counted twice in monthly outflows.'
      ),
      unexpectedExpense: metricExplanation(
        'Unexpected one-time expense',
        'U = one-time expense provided',
        { unexpectedExpense },
        'Applied once against accessible savings to model a financial shock.'
      ),
      monthlyOutflows: metricExplanation(
        'Monthly outflows',
        'O = E + (EMI already included in expenses ? 0 : M)',
        { monthlyExpenses, emiPayments, emiIncludedInExpenses },
        'Total mandatory monthly spending before savings.',
        ['EMI is added at most once.']
      ),
      monthlySurplus: metricExplanation(
        'Monthly surplus',
        'P = I - O',
        { monthlyIncome, monthlyOutflows },
        'Cash left after mandatory monthly outflows.'
      ),
      savingsRatePct: metricExplanation(
        'Savings rate',
        'P / I × 100; null when I = 0',
        { monthlySurplus, monthlyIncome },
        'Share of monthly income retained as surplus.'
      ),
      livingExpenseCoverageMonths: metricExplanation(
        'Living-expense coverage',
        'S / E; null when E = 0',
        { accessibleSavings, monthlyExpenses },
        'How many months of living expenses accessible savings could cover.',
        ['This preserves the existing assessment expense-coverage definition.']
      ),
      expenseCoverageMonths: metricExplanation(
        'Expense coverage (assessment alias)',
        'Alias of livingExpenseCoverageMonths',
        { accessibleSavings, monthlyExpenses },
        'Compatibility alias for consumers of the existing assessment shape.'
      ),
      mandatoryOutflowCoverageMonths: metricExplanation(
        'Mandatory-outflow coverage',
        'S / O; null when O = 0',
        { accessibleSavings, monthlyOutflows },
        'How many months of mandatory outflows accessible savings could cover.'
      ),
      emiBurdenPct: metricExplanation(
        'EMI burden',
        'M / I × 100; null when I = 0',
        { emiPayments, monthlyIncome },
        'Share of monthly income committed to EMI payments.'
      ),
      postShockSavings: metricExplanation(
        'Post-shock accessible savings',
        'max(0, S - U)',
        { accessibleSavings, unexpectedExpense },
        'Accessible savings remaining after the one-time unexpected expense.',
        ['The shock is applied exactly once.']
      ),
      unfundedShock: metricExplanation(
        'Unfunded shock',
        'max(0, U - S)',
        { unexpectedExpense, accessibleSavings },
        'Part of the unexpected expense that accessible savings cannot cover.'
      ),
    },
    goalProjection: metricExplanation(
      'Goal projection',
      'remaining = max(0, T - C); months = 0 if remaining = 0, else ceil(remaining / contribution) when contribution > 0, otherwise unreachable',
      {
        targetAmount,
        currentGoalSavings,
        remainingAmount,
        monthlySavingsCapacity,
        assumedMonthlyContribution,
        estimatedMonths,
        asOfDate: asOf,
      },
      'Estimates how long the remaining goal amount would take at a constant monthly contribution.',
      goalProjection.assumptions
    ),
    goalMetrics: {
      targetAmount: metricExplanation(
        'Goal target amount',
        'T = goal target amount provided',
        { targetAmount },
        'The amount the goal is trying to reach.'
      ),
      currentGoalSavings: metricExplanation(
        'Current goal savings',
        'C = current goal savings provided',
        { currentGoalSavings },
        'The amount already set aside for this goal.'
      ),
      remainingAmount: metricExplanation(
        'Remaining goal amount',
        'remaining = max(0, T - C)',
        { targetAmount, currentGoalSavings, remainingAmount },
        'The part of the target not yet funded.'
      ),
      assumedMonthlyContribution: metricExplanation(
        'Assumed monthly contribution',
        'contribution = monthlySavingsCapacity, or max(0, P) when no capacity is provided',
        { monthlySavingsCapacity, monthlySurplus, assumedMonthlyContribution },
        'The constant monthly amount used to estimate the timeline.'
      ),
      estimatedMonths: metricExplanation(
        'Estimated months to goal',
        '0 if remaining = 0; ceil(remaining / contribution) when contribution > 0; otherwise unreachable',
        { remainingAmount, assumedMonthlyContribution, estimatedMonths },
        'The projected number of whole months needed to fund the remaining amount.'
      ),
      unreachable: metricExplanation(
        'Unreachable flag',
        'unreachable = remaining > 0 and estimatedMonths is null',
        { remainingAmount, estimatedMonths, unreachable },
        'Indicates that no positive contribution is available to fund the goal.'
      ),
      requestedTimelineMonths: metricExplanation(
        'Requested timeline',
        'Requested timeline in whole months, when provided',
        { goalTimelineMonths },
        'Used only to compare the estimate with the desired timeline.'
      ),
      requiredMonthlyContributionForTimeline: metricExplanation(
        'Required monthly contribution for the requested timeline',
        '0 if remaining = 0; otherwise ceil(remaining / requestedTimelineMonths)',
        {
          remainingAmount,
          goalTimelineMonths,
          requiredMonthlyContributionForTimeline,
        },
        'Shows the approximate monthly amount needed to meet the requested timeline, before returns.'
      ),
      onTrackForRequestedTimeline: metricExplanation(
        'On-track flag',
        'estimatedMonths <= requestedTimelineMonths',
        {
          estimatedMonths,
          goalTimelineMonths,
          onTrackForRequestedTimeline,
        },
        'Compares the estimate with the requested timeline.'
      ),
      goalAchieved: metricExplanation(
        'Goal achieved flag',
        'goalAchieved = C >= T',
        { currentGoalSavings, targetAmount, goalAchieved },
        'Indicates whether current goal savings already cover the target.'
      ),
      estimatedCompletionDate: metricExplanation(
        'Estimated completion date',
        'asOfDate + estimatedMonths calendar months, clamped to the last valid day of the target month',
        { asOfDate: asOf, estimatedMonths, estimatedCompletionDate },
        'Projects a calendar date for the estimate using the documented month-end rule.'
      ),
    },
  };

  return {
    twinVersion: TWIN_VERSION,
    currency: 'INR',
    resultType: 'estimate',
    asOfDate: asOf,
    goal,
    inputs: normalized,
    thresholds: effectiveThresholds,
    metrics,
    goalProjection,
    recommendations,
    assumptions: [
      ...GLOBAL_ASSUMPTIONS,
      emiIncludedInExpenses
        ? 'EMI is assumed to already be included in monthly expenses, so it is not added again.'
        : 'EMI is added separately to monthly expenses exactly once.',
      'The unexpected one-time expense is applied once to accessible savings; it is not subtracted from monthly surplus or goal contributions.',
      'Goal contributions are used only to estimate the timeline and are not subtracted from the monthly surplus a second time.',
      monthlySavingsCapacity === null
        ? 'Goal projections assume the full positive monthly surplus is saved each month.'
        : 'Goal projections use the stated monthly savings capacity.',
    ],
    explanations,
    disclaimer:
      'Educational what-if estimate only. Results depend on the information supplied and are not a guarantee, prediction, or personalized regulated investment advice.',
  };
}

const COMPARISON_METRICS = Object.freeze([
  { key: 'monthlyIncome', label: 'Monthly income', kind: 'currency' },
  { key: 'monthlyExpenses', label: 'Monthly expenses', kind: 'currency' },
  { key: 'monthlyOutflows', label: 'Monthly outflows', kind: 'currency' },
  { key: 'monthlySurplus', label: 'Monthly surplus', kind: 'currency' },
  { key: 'savingsRatePct', label: 'Savings rate', kind: 'percent' },
  { key: 'accessibleSavings', label: 'Accessible savings', kind: 'currency' },
  { key: 'unexpectedExpense', label: 'Unexpected one-time expense', kind: 'currency' },
  { key: 'postShockSavings', label: 'Post-shock savings', kind: 'currency' },
  { key: 'unfundedShock', label: 'Unfunded shock', kind: 'currency' },
  {
    key: 'livingExpenseCoverageMonths',
    label: 'Living-expense coverage',
    kind: 'months',
  },
  {
    key: 'mandatoryOutflowCoverageMonths',
    label: 'Mandatory-outflow coverage',
    kind: 'months',
  },
  { key: 'emiPayments', label: 'Monthly EMI', kind: 'currency' },
  { key: 'emiBurdenPct', label: 'EMI burden', kind: 'percent' },
]);

function compareNumber(key, label, kind, baselineValue, scenarioValue) {
  const baseline = Number.isFinite(baselineValue) ? baselineValue : null;
  const scenario = Number.isFinite(scenarioValue) ? scenarioValue : null;
  const hasBoth = baseline !== null && scenario !== null;
  const difference = hasBoth ? scenario - baseline : null;

  return {
    key,
    label,
    kind,
    baseline,
    scenario,
    difference,
    // Percentage change is only meaningful when the baseline is nonzero.
    percentageChange:
      hasBoth && baseline !== 0
        ? (difference / Math.abs(baseline)) * 100
        : null,
    // Rates additionally expose a percentage-point difference.
    percentagePointDifference:
      kind === 'percent' && hasBoth ? scenario - baseline : null,
  };
}

/**
 * Compare a baseline result with an independently calculated scenario result.
 * Absolute difference is always scenario - baseline. Percentage change uses the
 * absolute baseline value and is null when the baseline is zero or unavailable.
 */
export function compareTwinResults(baseline, scenario) {
  if (!baseline || typeof baseline !== 'object' || !baseline.metrics) {
    throw new Error('A baseline Digital Twin result is required for comparison.');
  }
  if (!scenario || typeof scenario !== 'object' || !scenario.metrics) {
    throw new Error('A scenario Digital Twin result is required for comparison.');
  }

  const metrics = COMPARISON_METRICS.map(({ key, label, kind }) =>
    compareNumber(key, label, kind, baseline.metrics[key], scenario.metrics[key])
  );

  const baselineGoal = baseline.goalProjection || {};
  const scenarioGoal = scenario.goalProjection || {};

  const goalProjection = {
    targetAmount: compareNumber(
      'targetAmount',
      'Goal target amount',
      'currency',
      baselineGoal.targetAmount,
      scenarioGoal.targetAmount
    ),
    currentGoalSavings: compareNumber(
      'currentGoalSavings',
      'Current goal savings',
      'currency',
      baselineGoal.currentGoalSavings,
      scenarioGoal.currentGoalSavings
    ),
    remainingAmount: compareNumber(
      'remainingAmount',
      'Remaining goal amount',
      'currency',
      baselineGoal.remainingAmount,
      scenarioGoal.remainingAmount
    ),
    assumedMonthlyContribution: compareNumber(
      'assumedMonthlyContribution',
      'Assumed monthly contribution',
      'currency',
      baselineGoal.assumedMonthlyContribution,
      scenarioGoal.assumedMonthlyContribution
    ),
    estimatedMonths: compareNumber(
      'estimatedMonths',
      'Estimated months to goal',
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
        baselineGoal.goalAchieved !== undefined &&
        scenarioGoal.goalAchieved !== null &&
        scenarioGoal.goalAchieved !== undefined
          ? baselineGoal.goalAchieved !== scenarioGoal.goalAchieved
          : false,
    },
    onTrackForRequestedTimeline: {
      baseline: baselineGoal.onTrackForRequestedTimeline ?? null,
      scenario: scenarioGoal.onTrackForRequestedTimeline ?? null,
      changed:
        baselineGoal.onTrackForRequestedTimeline !== null &&
        baselineGoal.onTrackForRequestedTimeline !== undefined &&
        scenarioGoal.onTrackForRequestedTimeline !== null &&
        scenarioGoal.onTrackForRequestedTimeline !== undefined
          ? baselineGoal.onTrackForRequestedTimeline !==
            scenarioGoal.onTrackForRequestedTimeline
          : false,
    },
  };

  const baselineById = new Map(
    (baseline.recommendations || []).map((item) => [item.id, item])
  );
  const scenarioById = new Map(
    (scenario.recommendations || []).map((item) => [item.id, item])
  );

  const added = (scenario.recommendations || []).filter(
    (item) => !baselineById.has(item.id)
  );
  const resolved = (baseline.recommendations || []).filter(
    (item) => !scenarioById.has(item.id)
  );
  const unchanged = (scenario.recommendations || []).filter((item) =>
    baselineById.has(item.id)
  );
  const severityChanged = (scenario.recommendations || [])
    .filter(
      (item) =>
        baselineById.has(item.id) &&
        baselineById.get(item.id).severity !== item.severity
    )
    .map((item) => ({
      id: item.id,
      title: item.title,
      baselineSeverity: baselineById.get(item.id).severity,
      scenarioSeverity: item.severity,
    }));

  return {
    metrics,
    goalProjection,
    recommendations: {
      added,
      resolved,
      unchanged,
      severityChanged,
    },
  };
}

/**
 * Build a complete preview from a baseline input object and optional scenario
 * overrides. The baseline object is copied and never mutated.
 */
export function buildTwinPreview({
  baseline,
  scenario,
  thresholds,
  asOfDate,
} = {}) {
  assertPlainObject(baseline, 'Baseline input');

  if (
    scenario !== undefined &&
    scenario !== null &&
    (typeof scenario !== 'object' || Array.isArray(scenario))
  ) {
    throw new Error('Scenario input must be an object.');
  }

  const requestedAsOf = asOfDate ?? baseline.asOfDate;
  const baselineInputs = normalizeTwinInputs(baseline);
  const scenarioInputs = normalizeTwinInputs({
    ...baselineInputs,
    ...(scenario || {}),
  });

  const effectiveThresholds = normalizeTwinThresholds(thresholds);
  const effectiveAsOf = resolveAsOfDate(requestedAsOf);

  const baselineResult = calculateTwin(baselineInputs, {
    thresholds: effectiveThresholds,
    asOfDate: effectiveAsOf,
  });
  const scenarioResult = calculateTwin(scenarioInputs, {
    thresholds: effectiveThresholds,
    asOfDate: effectiveAsOf,
  });

  return {
    twinVersion: TWIN_VERSION,
    currency: 'INR',
    resultType: 'estimate',
    asOfDate: effectiveAsOf,
    thresholds: effectiveThresholds,
    baselineInputs,
    scenarioInputs,
    baseline: baselineResult,
    scenario: scenarioResult,
    comparison: compareTwinResults(baselineResult, scenarioResult),
    estimateNotice: ESTIMATE_NOTICE,
    disclaimer: scenarioResult.disclaimer,
  };
}
