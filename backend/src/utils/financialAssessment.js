/**
 * WealthGenie - Transparent Financial Assessment
 *
 * Rule-based educational assessment. All amounts are monthly INR figures
 * unless stated otherwise. This is not regulated financial advice.
 */

export const ASSESSMENT_VERSION = '1.0.0';

export const GOAL_CATEGORIES = Object.freeze({
  EMERGENCY_FUND: 'emergency_fund',
  DEBT_REPAYMENT: 'debt_repayment',
  RETIREMENT: 'retirement',
  HOME_PURCHASE: 'home_purchase',
  EDUCATION: 'education',
  WEALTH_BUILDING: 'wealth_building',
  OTHER: 'other',
});

export const GOAL_CATEGORY_VALUES = Object.freeze(Object.values(GOAL_CATEGORIES));

const GOAL_ALIASES = Object.freeze({
  emergency: GOAL_CATEGORIES.EMERGENCY_FUND,
  emergency_fund: GOAL_CATEGORIES.EMERGENCY_FUND,
  debt: GOAL_CATEGORIES.DEBT_REPAYMENT,
  debt_repayment: GOAL_CATEGORIES.DEBT_REPAYMENT,
  loan_repayment: GOAL_CATEGORIES.DEBT_REPAYMENT,
  retirement: GOAL_CATEGORIES.RETIREMENT,
  home: GOAL_CATEGORIES.HOME_PURCHASE,
  house: GOAL_CATEGORIES.HOME_PURCHASE,
  home_purchase: GOAL_CATEGORIES.HOME_PURCHASE,
  education: GOAL_CATEGORIES.EDUCATION,
  child_education: GOAL_CATEGORIES.EDUCATION,
  wealth: GOAL_CATEGORIES.WEALTH_BUILDING,
  wealth_building: GOAL_CATEGORIES.WEALTH_BUILDING,
  investing: GOAL_CATEGORIES.WEALTH_BUILDING,
  other: GOAL_CATEGORIES.OTHER,
});

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

/**
 * Round a positive ratio up to a whole month while ignoring binary
 * floating-point noise such as 0.07 / 0.01 === 7.000000000000001.
 */
export function ceilMonths(numerator, denominator) {
  const ratio = numerator / denominator;
  const nearest = Math.round(ratio);
  const tolerance = 1e-9 * Math.max(1, Math.abs(ratio));

  if (nearest >= 1 && Math.abs(ratio - nearest) <= tolerance) {
    return nearest;
  }

  return Math.ceil(ratio);
}

function toFiniteNumber(value, label) {
  if (typeof value === 'boolean') {
    throw new Error(`${label} must be a valid number.`);
  }

  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new Error(`${label} must be a valid number.`);
  }

  const numeric = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a valid number.`);
  }

  return numeric;
}

export function validateNonNegativeNumber(
  value,
  label,
  { allowMissing = false } = {}
) {
  if (isMissing(value)) {
    if (allowMissing) return null;
    throw new Error(`${label} is required.`);
  }

  const numeric = toFiniteNumber(value, label);
  if (numeric < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return numeric;
}

export function validatePositiveNumber(
  value,
  label,
  { allowMissing = false } = {}
) {
  if (isMissing(value)) {
    if (allowMissing) return null;
    throw new Error(`${label} is required.`);
  }

  const numeric = toFiniteNumber(value, label);
  if (numeric <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }

  return numeric;
}

export function validateGoal(goal) {
  if (isMissing(goal)) {
    throw new Error('Financial goal is required.');
  }

  if (typeof goal !== 'string') {
    throw new Error('Financial goal must be a string.');
  }

  const key = goal.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const category = GOAL_ALIASES[key];

  if (!category) {
    throw new Error(
      `Unsupported financial goal "${goal}". Supported goals: ${GOAL_CATEGORY_VALUES.join(', ')}.`
    );
  }

  return category;
}

/**
 * Assess a user's financial position using transparent rules.
 * All amounts are in INR. This is educational guidance, not
 * regulated financial advice or a prediction of investment returns.
 */
export function assessFinances(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Assessment input must be an object.');
  }

  const monthlyIncome = validateNonNegativeNumber(
    input.monthlyIncome, 'Monthly income'
  );
  const monthlyExpenses = validateNonNegativeNumber(
    input.monthlyExpenses, 'Monthly expenses'
  );
  const accessibleSavings = validateNonNegativeNumber(
    input.accessibleSavings, 'Accessible savings'
  );

  const goal = validateGoal(input.goal);

  const emiPayments = validateNonNegativeNumber(
    input.emiPayments, 'EMI payments',
    { allowMissing: true }
  ) ?? 0;

  const emiIncludedInExpenses = input.emiIncludedInExpenses ?? true;
  if (typeof emiIncludedInExpenses !== 'boolean') {
    throw new Error('emiIncludedInExpenses must be a boolean.');
  }

  const monthlyOutflows = monthlyExpenses +
    (emiIncludedInExpenses ? 0 : emiPayments);

  const monthlySurplus = monthlyIncome - monthlyOutflows;
  const savingsRate = monthlyIncome > 0
    ? (monthlySurplus / monthlyIncome) * 100
    : null;

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
    firstProvided(
      input.goalTimelineMonths,
      input.desiredTimelineMonths,
      input.timelineMonths
    ),
    'Goal timeline in months',
    { allowMissing: true }
  );

  if (goalTimelineMonths !== null && !Number.isInteger(goalTimelineMonths)) {
    throw new Error('Goal timeline in months must be a whole number.');
  }

  const emergencyFundCoverageMonths = monthlyExpenses > 0
    ? accessibleSavings / monthlyExpenses
    : null;

  const warnings = [];
  const recommendations = [];

  if (monthlySurplus < 0) {
    warnings.push('Your stated monthly outflows exceed your income.');
    recommendations.push(
      'Review expenses and debt obligations before committing to new investments.'
    );
  } else if (monthlySurplus === 0) {
    warnings.push('Your current budget has no monthly surplus.');
    recommendations.push(
      'Review your budget to see whether you can create a sustainable monthly surplus.'
    );
  }

  if (monthlyIncome === 0) {
    warnings.push('Savings rate cannot be calculated because income is zero.');
  }

  if (monthlyExpenses === 0) {
    warnings.push(
      'Expense coverage cannot be calculated because monthly expenses are zero.'
    );
  }

  if (accessibleSavings === 0) {
    recommendations.push(
      'Consider building accessible emergency savings before taking on additional investment risk.'
    );
  } else if (
    emergencyFundCoverageMonths !== null &&
    emergencyFundCoverageMonths < 3
  ) {
    recommendations.push(
      `Your accessible savings cover about ${emergencyFundCoverageMonths.toFixed(1)} months of expenses. Consider whether a larger emergency cushion would suit your circumstances.`
    );
  }

  if (
    monthlySavingsCapacity !== null &&
    monthlySavingsCapacity > Math.max(0, monthlySurplus)
  ) {
    warnings.push(
      'Your stated savings capacity exceeds your calculated monthly surplus. Check your inputs and budget.'
    );
  }

  if (
    goal === GOAL_CATEGORIES.EMERGENCY_FUND &&
    emergencyFundCoverageMonths !== null
  ) {
    recommendations.push(
      'Review how much emergency savings would suit your essential expenses, dependants, and income stability.'
    );
  }

  if (goal === GOAL_CATEGORIES.DEBT_REPAYMENT && emiPayments > 0) {
    recommendations.push(
      'Review your debt interest rates, outstanding balances, and repayment terms before choosing a repayment priority.'
    );
  }

  let goalProjection = null;

  if (targetAmount !== null) {
    const remainingAmount = Math.max(
      0, targetAmount - currentGoalSavings
    );

    const contribution = monthlySavingsCapacity ??
      Math.max(0, monthlySurplus);

    let estimatedMonths = null;

    if (remainingAmount === 0) {
      estimatedMonths = 0;
    } else if (contribution > 0) {
      estimatedMonths = ceilMonths(remainingAmount, contribution);
    }

    const requiredMonthlyContributionForTimeline =
      goalTimelineMonths !== null
        ? remainingAmount === 0
          ? 0
          : ceilMonths(remainingAmount, goalTimelineMonths)
        : null;

    goalProjection = {
      targetAmount,
      currentGoalSavings,
      remainingAmount,
      assumedMonthlyContribution: contribution,
      estimatedMonths,
      requestedTimelineMonths: goalTimelineMonths,
      requiredMonthlyContributionForTimeline,
      onTrackForRequestedTimeline:
        goalTimelineMonths !== null && estimatedMonths !== null
          ? estimatedMonths <= goalTimelineMonths
          : null,
      assumptions: [
        'No investment returns or interest are included.',
        'Contributions are assumed to remain constant.',
        'The estimate is a mathematical illustration, not a guarantee.'
      ]
    };

    if (currentGoalSavings > targetAmount) {
      warnings.push(
        'Your current goal savings exceed the stated target amount.'
      );
    }

    if (estimatedMonths === null && remainingAmount > 0) {
      recommendations.push(
        'Enter a realistic positive monthly contribution to estimate your goal timeline.'
      );
    } else if (
      goalTimelineMonths !== null &&
      estimatedMonths !== null &&
      estimatedMonths > goalTimelineMonths
    ) {
      recommendations.push(
        `Your current contribution estimate may not meet your desired timeline. About ${requiredMonthlyContributionForTimeline} per month would be needed to reach the target within ${goalTimelineMonths} months, before any returns.`
      );
    }
  } else {
    recommendations.push(
      'Add a goal target amount to estimate a goal timeline.'
    );
  }

  const assumptions = [
    'All amounts are treated as monthly INR figures unless stated otherwise.',
    emiIncludedInExpenses
      ? 'EMI payments are assumed to already be included in monthly expenses, so they are not added again.'
      : 'EMI payments are added separately to monthly expenses.',
    'Savings rate is monthly surplus divided by monthly income.',
    'Expense coverage is accessible savings divided by monthly expenses.',
    monthlySavingsCapacity === null
      ? 'Goal projections assume the full positive monthly surplus is saved each month.'
      : 'Goal projections use your stated monthly savings capacity.',
    'No investment returns, taxes, inflation, or interest are modelled in this assessment.'
  ];

  if (targetAmount === null) {
    assumptions.push(
      'No goal target amount was provided, so no goal timeline was estimated.'
    );
  }

  return {
    assessmentVersion: ASSESSMENT_VERSION,
    currency: 'INR',
    goal,
    metrics: {
      monthlyIncome,
      monthlyExpenses,
      emiPayments,
      emiIncludedInExpenses,
      monthlyOutflows,
      accessibleSavings,
      monthlySurplus,
      savingsRatePct: savingsRate,
      emergencyFundCoverageMonths,
      expenseCoverageMonths: emergencyFundCoverageMonths,
      monthlySavingsCapacity
    },
    goalProjection,
    warnings,
    recommendations,
    assumptions,
    disclaimer:
      'Educational financial information only. Estimates depend on the information supplied and are not a guarantee or personalized regulated investment advice.'
  };
}
