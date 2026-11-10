/**
 * WealthGenie recommendation engine — financial-profile collection and
 * validation.
 *
 * Reuses the transparent assessment validators from
 * backend/src/utils/financialAssessment.js so that the recommendation engine
 * and the financial assessment always interpret the user's numbers the same
 * way (including the EMI double-counting guard).
 *
 * Behaviour contract:
 * - Missing OPTIONAL material fields are NOT treated as zero. They are
 *   recorded in `missing[]` so the API/UI can ask for them and the engine can
 *   degrade explicitly. Fields that materially change recommendations are also
 *   flagged `material: true`.
 * - Invalid, negative or unrealistic values throw a readable error (HTTP 400).
 * - Zero income is valid (e.g. students); downstream rules handle it safely.
 */

import {
  validateNonNegativeNumber,
  validatePositiveNumber,
} from '../../utils/financialAssessment.js';

export const ENGINE_VERSION = '1.0.0';

export const INCOME_STABILITY = Object.freeze(['stable', 'variable', 'irregular']);
export const RISK_TOLERANCE_LEVELS = Object.freeze([1, 2, 3, 4, 5]);
export const RISK_TOLERANCE_LABELS = Object.freeze({
  1: 'Very low — losses would be very hard to accept',
  2: 'Low — small dips are acceptable, large losses are not',
  3: 'Moderate — medium-term ups and downs are acceptable',
  4: 'High — sustained drawdowns are acceptable if the horizon is long',
  5: 'Very high — full long-term volatility is acceptable',
});

function clampRiskLevel(value, label, { defaultValue = null } = {}) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  const level = Number(value);
  if (!Number.isInteger(level) || level < 1 || level > 5) {
    throw new Error(`${label} must be a whole number between 1 and 5.`);
  }
  return level;
}

function normalizeMonthly(value, label, missing, material = true) {
  if (value === undefined || value === null || value === '') {
    missing.push({ field: label, material });
    return null;
  }
  return validateNonNegativeNumber(value, label);
}

const GOAL_KIND_ALIASES = Object.freeze({
  emergency: 'emergency_fund',
  emergency_fund: 'emergency_fund',
  security: 'emergency_fund',
  savings: 'emergency_fund',
  debt: 'debt_repayment',
  debt_repayment: 'debt_repayment',
  loan_repayment: 'debt_repayment',
  retirement: 'retirement',
  home: 'home_purchase',
  house: 'home_purchase',
  home_purchase: 'home_purchase',
  education: 'education',
  child_education: 'education',
  wealth: 'wealth_building',
  wealth_building: 'wealth_building',
  investing: 'wealth_building',
  milestone: 'other',
  other: 'other',
});

function canonicalGoalKind(raw) {
  const key = String(raw || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return GOAL_KIND_ALIASES[key] ?? 'other';
}

function normalizeGoals(rawGoals) {
  if (!Array.isArray(rawGoals)) return [];
  return rawGoals
    .filter((g) => g && typeof g === 'object')
    .map((g, index) => {
      const title = typeof g.title === 'string' ? g.title.trim() : '';
      const goal = canonicalGoalKind(typeof g.goal === 'string' ? g.goal : undefined);
      const amount = g.targetAmount === undefined || g.targetAmount === null || g.targetAmount === '' ? null : validatePositiveNumber(g.targetAmount, `Goal ${index + 1} target amount`);
      return {
        index,
        title: title || `Goal ${index + 1}`,
        goal,
        targetAmount: amount,
        monthsRemaining: g.monthsRemaining === undefined || g.monthsRemaining === null || g.monthsRemaining === ''
          ? null
          : validateNonNegativeNumber(g.monthsRemaining, `Goal ${index + 1} months remaining`),
      };
    });
}

/**
 * Validate and normalize the financial profile used by the engine.
 * @returns {{ normalized: object, missing: Array<{field:string, material:boolean}> }}
 */
export function normalizeProfileInput(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Profile must be an object.');
  }

  const missing = [];
  const notes = [];

  const monthlyIncome = normalizeMonthly(input.monthlyIncome, 'Monthly income', missing, true);
  if (monthlyIncome !== null && monthlyIncome > 10_000_000) {
    throw new Error('Monthly income above ₹1,00,00,000 is not accepted. Please check the figure.');
  }

  const monthlyExpenses = normalizeMonthly(input.monthlyExpenses, 'Monthly expenses', missing, true);
  // Consistency guard only applies when income is known and non-zero:
  // zero-income profiles (e.g. students) can legitimately have expenses.
  if (monthlyIncome !== null && monthlyIncome > 0 && monthlyExpenses !== null && monthlyExpenses > monthlyIncome * 100) {
    throw new Error('Monthly expenses look inconsistent with income. Please re-check your entries.');
  }

  let emiPayments = 0;
  if (input.emiPayments !== undefined && input.emiPayments !== null && input.emiPayments !== '') {
    emiPayments = validateNonNegativeNumber(input.emiPayments, 'Monthly loan payments');
  }
  const emiIncludedInExpenses = input.emiIncludedInExpenses ?? true;
  if (typeof emiIncludedInExpenses !== 'boolean') {
    throw new Error('emiIncludedInExpenses must be a boolean.');
  }
  if (emiIncludedInExpenses && emiPayments > 0) {
    notes.push(
      'EMI/loan payments are assumed to be included in monthly expenses and were not subtracted again.'
    );
  }

  const accessibleSavings = normalizeMonthly(input.accessibleSavings, 'Accessible (liquid) savings', missing, true);
  if (accessibleSavings !== null && accessibleSavings > 1_000_000_000) {
    throw new Error('Accessible savings above ₹100 crore is not accepted. Please check the figure.');
  }

  let debtOutstanding = 0;
  if (input.debtOutstanding !== undefined && input.debtOutstanding !== null && input.debtOutstanding !== '') {
    debtOutstanding = validateNonNegativeNumber(input.debtOutstanding, 'Outstanding debt');
  }

  let existingInvestments = 0;
  if (input.existingInvestments !== undefined && input.existingInvestments !== null && input.existingInvestments !== '') {
    existingInvestments = validateNonNegativeNumber(input.existingInvestments, 'Existing investments');
  }

  let monthlySavingsCapacity = null;
  if (input.monthlySavingsCapacity !== undefined && input.monthlySavingsCapacity !== null && input.monthlySavingsCapacity !== '') {
    monthlySavingsCapacity = validateNonNegativeNumber(input.monthlySavingsCapacity, 'Monthly savings capacity');
  }

  // Horizon: months remaining until the money is likely needed.
  const horizonMonths =
    input.investmentHorizonMonths === undefined || input.investmentHorizonMonths === null || input.investmentHorizonMonths === ''
      ? null
      : validatePositiveNumber(input.investmentHorizonMonths, 'Investment horizon (months)');

  // Risk tolerance is what the user says they can accept (their stated risk
  // attitude). Risk capacity is derived separately in readiness.js from
  // income stability, surplus and emergency coverage.
  const riskTolerance = clampRiskLevel(input.riskTolerance, 'Risk tolerance');

  let riskToleranceLabel = null;
  if (riskTolerance === null) {
    missing.push({ field: 'Risk tolerance', material: true });
  } else {
    riskToleranceLabel = input.riskToleranceLabel || RISK_TOLERANCE_LABELS[riskTolerance];
  }

  let incomeStability = null;
  if (typeof input.incomeStability === 'string' && input.incomeStability.trim() !== '') {
    const stability = input.incomeStability.trim().toLowerCase();
    if (!INCOME_STABILITY.includes(stability)) {
      throw new Error(`Income stability must be one of: ${INCOME_STABILITY.join(', ')}.`);
    }
    incomeStability = stability;
  } else {
    missing.push({ field: 'Income stability', material: true });
  }

  // liquidityNeedMonths: how quickly the user may need to turn investments
  // back into cash for a suitable emergency.
  let liquidityNeedMonths = null;
  if (input.liquidityNeedMonths !== undefined && input.liquidityNeedMonths !== null && input.liquidityNeedMonths !== '') {
    liquidityNeedMonths = validatePositiveNumber(input.liquidityNeedMonths, 'Liquidity need (months)');
  }

  return {
    normalized: {
      monthlyIncome,
      monthlyExpenses,
      emiPayments,
      emiIncludedInExpenses,
      accessibleSavings,
      debtOutstanding,
      existingInvestments,
      monthlySavingsCapacity,
      emergencyFundTargetMonths:
        input.emergencyFundTargetMonths === undefined || input.emergencyFundTargetMonths === null || input.emergencyFundTargetMonths === ''
          ? null
          : validatePositiveNumber(input.emergencyFundTargetMonths, 'Emergency fund target (months)'),
      investmentHorizonMonths: horizonMonths,
      riskTolerance,
      riskToleranceLabel,
      incomeStability,
      liquidityNeedMonths,
      goals: normalizeGoals(input.goals),
      dependents: Array.isArray(input.dependents) ? input.dependents.length : 0,
    },
    missing,
    notes,
  };
}
