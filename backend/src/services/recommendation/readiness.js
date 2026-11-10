/**
 * WealthGenie recommendation engine — deterministic financial-readiness math.
 *
 * Builds on backend/src/utils/financialAssessment.js (assessFinances) so the
 * surplus/savings calculations match the assessment engine exactly, then adds
 * the ratios the recommendation engine needs. Every number carries an
 * explanation string for the user.
 */

import { assessFinances, GOAL_CATEGORIES } from '../../utils/financialAssessment.js';

export const READINESS_VERSION = '1.0.0';

// Transparent, configurable readiness thresholds — named exports so they are
// easy to adjust later (and visible in tests), never buried in conditions.
export const THRESHOLDS = Object.freeze({
  EMERGENCY_MIN_MONTHS: 3,        // generally-accepted minimum emergency cushion
  EMERGENCY_COMFORT_MONTHS: 6,    // generally-accepted comfortable cushion
  DEBT_BURDEN_SAFE_PCT: 35,       // share of income going to loan payments
  DEBT_BURDEN_HIGH_PCT: 50,       // above this, investing is deprioritized
  SAVINGS_RATE_GOOD_PCT: 20,      // share of income saved each month
  MIN_INVESTABLE_MONTHLY: 500,    // smallest meaningful monthly SIP-style amount
});

function pct(value, base) {
  if (!base || base <= 0) return null;
  return Math.round(((value / base) * 100) * 10) / 10;
}

/**
 * Risk capacity — derived from the user's actual financial position,
 * independent from their stated risk tolerance.
 * Deterministic scoring 1–5 (aligned with the 5-level scale used for
 * tolerance): income stability, positive surplus, emergency coverage and
 * meaningful debt burden all contribute transparent, fixed-weight points.
 */
function assessRiskCapacity(profile, readinessCore, debtBurdenPct) {
  const factors = [];
  let score = 0;

  const stabilityPoints = profile.incomeStability === 'stable' ? 1
    : profile.incomeStability === 'variable' ? 0.5
      : profile.incomeStability === 'irregular' ? 0
        : 0;
  score += stabilityPoints;
  factors.push({
    factor: 'Income stability',
    detail: 'Stable income adds a full point; variable half; irregular none (0–1).',
    points: stabilityPoints,
  });

  const surplusPoints = readinessCore.monthlySurplus > 0 ? 1 : 0;
  score += surplusPoints;
  factors.push({
    factor: 'Positive monthly surplus',
    detail: readinessCore.monthlySurplus > 0
      ? 'A positive surplus adds one point (0–1).'
      : 'No positive surplus this month (0 of 1).',
    points: surplusPoints,
  });

  const efc = readinessCore.emergencyFundCoverageMonths;
  const emergencyPoints = efc === null ? 0
    : efc >= THRESHOLDS.EMERGENCY_MIN_MONTHS ? 1
      : efc > 0 ? 0.5
        : 0;
  score += emergencyPoints;
  factors.push({
    factor: 'Emergency coverage',
    detail: `Full point at ≥${THRESHOLDS.EMERGENCY_MIN_MONTHS} months covered, half point above zero (0–1).`,
    points: emergencyPoints,
  });

  const debtPoints = debtBurdenPct === null ? 1
    : debtBurdenPct <= THRESHOLDS.DEBT_BURDEN_SAFE_PCT ? 1
      : debtBurdenPct < THRESHOLDS.DEBT_BURDEN_HIGH_PCT ? 0.5
        : 0;
  score += debtPoints;
  factors.push({
    factor: 'Debt burden',
    detail: debtBurdenPct === null
      ? 'No known loan payments, so no burden penalty (full point assumed).'
      : `Full point at ≤${THRESHOLDS.DEBT_BURDEN_SAFE_PCT}% of income, half point below ${THRESHOLDS.DEBT_BURDEN_HIGH_PCT}% (0–1). Currently ${debtBurdenPct}%.`,
    points: debtPoints,
  });

  const capacity = Math.max(1, Math.min(5, Math.round(score) || 1));
  return {
    level: capacity,
    score: Math.round(score * 100) / 100, // raw 0–4 before rounding
    maxRaw: 4,
    factors,
    note: 'Risk capacity is derived from financial facts; it may differ from the user’s stated risk tolerance, and the engine uses the lower of the two when both exist.',
  };
}

/**
 * Compute readiness from the normalized profile.
 * Missing material inputs degrade to explicit nulls and `unknown[]` flags
 * rather than assumed values.
 */
export function computeReadiness(profile) {
  const usableIncome = profile.monthlyIncome ?? 0;
  const usableExpenses = profile.monthlyExpenses ?? 0;
  const usableSavings = profile.accessibleSavings ?? 0;

  // Reuse the shared assessment engine for the core metrics (same EMI
  // double-counting guard as GET /api/assessment).
  const usingFallback = profile.monthlyIncome === null || profile.monthlyExpenses === null;
  const core = usingFallback ? null : assessFinances({
    monthlyIncome: usableIncome,
    monthlyExpenses: usableExpenses,
    accessibleSavings: usableSavings,
    emiPayments: profile.emiPayments,
    emiIncludedInExpenses: profile.emiIncludedInExpenses,
    goal: GOAL_CATEGORIES.WEALTH_BUILDING,
    monthlySavingsCapacity: profile.monthlySavingsCapacity,
  });

  const unknown = [];
  if (usingFallback) {
    unknown.push(
      ...(profile.monthlyIncome === null ? ['monthly_income'] : []),
      ...(profile.monthlyExpenses === null ? ['monthly_expenses'] : []),
    );
  }

  let readinessCore;
  if (core) {
    readinessCore = {
      monthlySurplus: core.metrics.monthlySurplus,
      monthlyOutflows: core.metrics.monthlyOutflows,
      savingsRatePct: core.metrics.savingsRatePct,
      emergencyFundCoverageMonths: core.metrics.emergencyFundCoverageMonths,
    };
  } else {
    // Degrade honestly when material inputs are missing.
    readinessCore = {
      monthlySurplus: null,
      monthlyOutflows: null,
      savingsRatePct: null,
      emergencyFundCoverageMonths: null,
    };
  }

  // Debt-payment burden relative to income (only when EMIs are known).
  const debtBurdenPct = pct(profile.emiPayments, usableIncome);

  // Investable surplus: positive monthly surplus after essentials and the
  // short-term top-up the emergency fund still needs (transparent shortfall).
  let investableSurplusPerMonth = null;
  const efc = readinessCore.emergencyFundCoverageMonths;
  if (readinessCore.monthlySurplus !== null) {
    let shortfall = 0;
    if (efc !== null && efc < THRESHOLDS.EMERGENCY_MIN_MONTHS && usableExpenses > 0) {
      shortfall = Math.max(0, usableExpenses * THRESHOLDS.EMERGENCY_MIN_MONTHS - usableSavings);
    }
    investableSurplusPerMonth = Math.max(0, readinessCore.monthlySurplus);
    // Cap what is channelled to investments while the emergency fund is being
    // built: half the surplus tops up the cushion first (transparent, symmetric
    // illustration of keeping a cushion).
    if (shortfall > 0 && readinessCore.monthlySurplus > 0) {
      investableSurplusPerMonth = Math.max(
        0,
        Math.min(readinessCore.monthlySurplus, readinessCore.monthlySurplus / 2),
      );
    }
  }

  const riskCapacity = assessRiskCapacity(profile, readinessCore, debtBurdenPct);

  // Each calculation is accompanied by an explanation for the user.
  const calculations = [
    {
      id: 'monthly-surplus',
      label: 'Monthly surplus',
      value: readinessCore.monthlySurplus,
      explanation: profile.emiIncludedInExpenses && profile.emiPayments > 0
        ? 'Income minus monthly expenses. Loan payments were already counted inside your expenses, so they are not subtracted again.'
        : 'Income minus monthly expenses and loan payments (which you marked as separate).',
    },
    {
      id: 'savings-rate',
      label: 'Savings rate',
      value: readinessCore.savingsRatePct,
      explanation: 'Monthly surplus divided by monthly income, shown as a percentage. Not calculated when income is zero.',
      units: '%',
    },
    {
      id: 'emergency-coverage',
      label: 'Emergency fund coverage',
      value: readinessCore.emergencyFundCoverageMonths,
      explanation: 'Accessible savings divided by monthly essential expenses — how many months of life the cushion covers.',
      units: 'months',
    },
    {
      id: 'debt-burden',
      label: 'Debt-payment burden',
      value: debtBurdenPct,
      explanation: 'Monthly loan payments divided by monthly income, shown as a percentage. Calculated only when loan payments are known.',
      units: '%',
    },
    {
      id: 'investable-surplus',
      label: 'Available investable surplus',
      value: investableSurplusPerMonth,
      explanation: shortfallNote(THRESHOLDS.EMERGENCY_MIN_MONTHS, efc, readinessCore.monthlySurplus),
    },
  ];

  return {
    readinessVersion: READINESS_VERSION,
    core: readinessCore,
    debtBurdenPct,
    investableSurplusPerMonth,
    riskCapacity,
    thresholds: THRESHOLDS,
    usingFallbackInputs: usingFallback,
    unknown,
    calculations,
  };
}

function shortfallNote(minMonths, efcColumnValue, surplus) {
  const coverageText = efcColumnValue === null ? 'emergency coverage is unknown' : `emergency coverage is ${efcColumnValue} month(s)`;
  if (surplus === null) return 'No investable surplus can be computed until monthly income and expenses are known.';
  if (efcColumnValue !== null && efcColumnValue < minMonths && surplus > 0) {
    return `${coverageText}. Until the cushion reaches ${minMonths} months, at least half of the positive surplus is shown as reserved for the emergency fund, so only the rest is treated as investable.`;
  }
  return `${coverageText}. The full positive monthly surplus is treated as potentially investable.`;
}
