/**
 * Deliberately invalid and deliberately valid inputs for robustness checks.
 *
 * Every invalid case must be rejected with a specific, non-empty error message.
 * A rejected case is never silently coerced to zero. Valid cases must be
 * accepted so the validation is not merely over-rejecting.
 */

import {
  buildTwinPreview,
  calculateTwin,
  normalizeTwinThresholds,
} from '../../backend/src/utils/financialTwin.js';

const VALID = Object.freeze({
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  accessibleSavings: 200000,
  goal: 'other',
});

export const INVALID_CASES = Object.freeze([
  {
    id: 'negative-income',
    target: 'calculateTwin',
    field: 'monthlyIncome',
    payload: { ...VALID, monthlyIncome: -1 },
    expected: /Monthly income must be zero or greater/,
  },
  {
    id: 'negative-expenses',
    target: 'calculateTwin',
    field: 'monthlyExpenses',
    payload: { ...VALID, monthlyExpenses: -1 },
    expected: /Monthly expenses must be zero or greater/,
  },
  {
    id: 'negative-savings',
    target: 'calculateTwin',
    field: 'accessibleSavings',
    payload: { ...VALID, accessibleSavings: -1 },
    expected: /Accessible savings must be zero or greater/,
  },
  {
    id: 'negative-emi',
    target: 'calculateTwin',
    field: 'emiPayments',
    payload: { ...VALID, emiPayments: -1 },
    expected: /EMI payments must be zero or greater/,
  },
  {
    id: 'negative-unexpected-expense',
    target: 'calculateTwin',
    field: 'unexpectedExpense',
    payload: { ...VALID, unexpectedExpense: -1 },
    expected: /Unexpected one-time expense must be zero or greater/,
  },
  {
    id: 'negative-savings-capacity',
    target: 'calculateTwin',
    field: 'monthlySavingsCapacity',
    payload: { ...VALID, monthlySavingsCapacity: -1 },
    expected: /Monthly savings capacity must be zero or greater/,
  },
  {
    id: 'negative-current-goal-savings',
    target: 'calculateTwin',
    field: 'currentGoalSavings',
    payload: { ...VALID, currentGoalSavings: -1 },
    expected: /Current goal savings must be zero or greater/,
  },
  {
    id: 'negative-target',
    target: 'calculateTwin',
    field: 'targetAmount',
    payload: { ...VALID, targetAmount: -1 },
    expected: /Goal target amount must be zero or greater/,
  },
  {
    id: 'nan-income',
    target: 'calculateTwin',
    field: 'monthlyIncome',
    payload: { ...VALID, monthlyIncome: Number.NaN },
    expected: /Monthly income must be a valid number/,
  },
  {
    id: 'infinite-expenses',
    target: 'calculateTwin',
    field: 'monthlyExpenses',
    payload: { ...VALID, monthlyExpenses: Number.POSITIVE_INFINITY },
    expected: /Monthly expenses must be a valid number/,
  },
  {
    id: 'negative-infinite-savings',
    target: 'calculateTwin',
    field: 'accessibleSavings',
    payload: { ...VALID, accessibleSavings: Number.NEGATIVE_INFINITY },
    expected: /Accessible savings must be a valid number/,
  },
  {
    id: 'non-numeric-emi',
    target: 'calculateTwin',
    field: 'emiPayments',
    payload: { ...VALID, emiPayments: 'not-a-number' },
    expected: /EMI payments must be a valid number/,
  },
  {
    id: 'boolean-income',
    target: 'calculateTwin',
    field: 'monthlyIncome',
    payload: { ...VALID, monthlyIncome: true },
    expected: /Monthly income must be a valid number/,
  },
  {
    id: 'blank-income',
    target: 'calculateTwin',
    field: 'monthlyIncome',
    payload: { ...VALID, monthlyIncome: '   ' },
    expected: /Monthly income is required/,
  },
  {
    id: 'missing-income',
    target: 'calculateTwin',
    field: 'monthlyIncome',
    payload: { monthlyExpenses: 1, accessibleSavings: 1, goal: 'other' },
    expected: /Monthly income is required/,
  },
  {
    id: 'missing-expenses',
    target: 'calculateTwin',
    field: 'monthlyExpenses',
    payload: { monthlyIncome: 1, accessibleSavings: 1, goal: 'other' },
    expected: /Monthly expenses is required/,
  },
  {
    id: 'missing-savings',
    target: 'calculateTwin',
    field: 'accessibleSavings',
    payload: { monthlyIncome: 1, monthlyExpenses: 1, goal: 'other' },
    expected: /Accessible savings is required/,
  },
  {
    id: 'missing-goal',
    target: 'calculateTwin',
    field: 'goal',
    payload: { monthlyIncome: 1, monthlyExpenses: 1, accessibleSavings: 1 },
    expected: /Financial goal is required/,
  },
  {
    id: 'unsupported-goal',
    target: 'calculateTwin',
    field: 'goal',
    payload: { ...VALID, goal: 'crypto' },
    expected: /Unsupported financial goal/,
  },
  {
    id: 'zero-target',
    target: 'calculateTwin',
    field: 'targetAmount',
    payload: { ...VALID, targetAmount: 0 },
    expected: /Goal target amount must be greater than zero when provided/,
  },
  {
    id: 'fractional-timeline',
    target: 'calculateTwin',
    field: 'goalTimelineMonths',
    payload: { ...VALID, goalTimelineMonths: 12.5 },
    expected: /Goal timeline in months must be a whole number/,
  },
  {
    id: 'zero-timeline',
    target: 'calculateTwin',
    field: 'goalTimelineMonths',
    payload: { ...VALID, goalTimelineMonths: 0 },
    expected: /Goal timeline in months must be greater than zero/,
  },
  {
    id: 'non-boolean-emi-included',
    target: 'calculateTwin',
    field: 'emiIncludedInExpenses',
    payload: { ...VALID, emiIncludedInExpenses: 'yes' },
    expected: /emiIncludedInExpenses must be a boolean/,
  },
  {
    id: 'invalid-calendar-date',
    target: 'calculateTwin',
    field: 'asOfDate',
    payload: VALID,
    options: { asOfDate: '2026-02-30' },
    expected: /As-of date is not a valid calendar date/,
  },
  {
    id: 'invalid-date-format',
    target: 'calculateTwin',
    field: 'asOfDate',
    payload: VALID,
    options: { asOfDate: '27-10-2026' },
    expected: /As-of date must use YYYY-MM-DD format/,
  },
  {
    id: 'zero-low-coverage-threshold',
    target: 'normalizeTwinThresholds',
    field: 'thresholds.lowMandatoryCoverageMonths',
    payload: { lowMandatoryCoverageMonths: 0 },
    expected: /Low mandatory-outflow coverage threshold must be greater than zero/,
  },
  {
    id: 'negative-high-emi-threshold',
    target: 'normalizeTwinThresholds',
    field: 'thresholds.highEmiBurdenPct',
    payload: { highEmiBurdenPct: -1 },
    expected: /High EMI burden threshold must be greater than zero/,
  },
  {
    id: 'non-numeric-high-emi-threshold',
    target: 'normalizeTwinThresholds',
    field: 'thresholds.highEmiBurdenPct',
    payload: { highEmiBurdenPct: 'x' },
    expected: /High EMI burden threshold must be a valid number/,
  },
  {
    id: 'non-object-thresholds',
    target: 'normalizeTwinThresholds',
    field: 'thresholds',
    payload: 'x',
    expected: /Thresholds must be an object/,
  },
  {
    id: 'missing-baseline',
    target: 'buildTwinPreview',
    field: 'baseline',
    payload: {},
    expected: /Baseline input must be an object/,
  },
  {
    id: 'non-object-scenario',
    target: 'buildTwinPreview',
    field: 'scenario',
    payload: { baseline: VALID, scenario: 'x' },
    expected: /Scenario input must be an object/,
  },
]);

export const VALID_CASES = Object.freeze([
  {
    id: 'minimal-valid',
    target: 'calculateTwin',
    payload: { ...VALID },
  },
  {
    id: 'all-zero-valid',
    target: 'calculateTwin',
    payload: {
      monthlyIncome: 0,
      monthlyExpenses: 0,
      accessibleSavings: 0,
      goal: 'other',
    },
  },
  {
    id: 'optional-null-valid',
    target: 'calculateTwin',
    payload: {
      ...VALID,
      emiPayments: null,
      unexpectedExpense: null,
      monthlySavingsCapacity: null,
      targetAmount: null,
      currentGoalSavings: null,
      goalTimelineMonths: null,
    },
  },
  {
    id: 'leap-day-valid',
    target: 'calculateTwin',
    payload: VALID,
    options: { asOfDate: '2024-02-29' },
  },
  {
    id: 'fractional-amounts-valid',
    target: 'calculateTwin',
    payload: {
      ...VALID,
      monthlyIncome: 100000.5,
      monthlyExpenses: 40000.25,
      accessibleSavings: 200000.75,
      targetAmount: 0.01,
      monthlySavingsCapacity: 0.01,
    },
  },
]);

function runCase(testCase) {
  switch (testCase.target) {
    case 'calculateTwin':
      return calculateTwin(testCase.payload, testCase.options || {});
    case 'buildTwinPreview':
      return buildTwinPreview(testCase.payload);
    case 'normalizeTwinThresholds':
      return normalizeTwinThresholds(testCase.payload);
    default:
      throw new Error(`Unknown validation target: ${testCase.target}`);
  }
}

export function evaluateValidation() {
  const invalidRows = INVALID_CASES.map((testCase) => {
    let rejected = false;
    let message = '';

    try {
      runCase(testCase);
    } catch (error) {
      rejected = true;
      message = error?.message || '';
    }

    const messageMatches =
      rejected &&
      (!testCase.expected || testCase.expected.test(message));
    const messageQuality =
      rejected &&
      typeof message === 'string' &&
      message.trim().length > 0 &&
      !/undefined|\[object Object\]/.test(message);
    const pass = rejected && messageMatches && messageQuality;

    return {
      caseId: testCase.id,
      target: testCase.target,
      field: testCase.field,
      expectedMessage: testCase.expected
        ? String(testCase.expected)
        : '',
      rejected,
      errorMessage: message,
      messageMatches,
      messageQuality,
      pass,
    };
  });

  const validRows = VALID_CASES.map((testCase) => {
    let accepted = false;
    let message = '';

    try {
      runCase(testCase);
      accepted = true;
    } catch (error) {
      message = error?.message || '';
    }

    return {
      caseId: testCase.id,
      target: testCase.target,
      accepted,
      errorMessage: message,
      pass: accepted,
    };
  });

  const invalidPassed = invalidRows.filter((row) => row.pass).length;
  const rejectedCount = invalidRows.filter((row) => row.rejected).length;
  const messageMatchCount = invalidRows.filter(
    (row) => row.messageMatches
  ).length;
  const validAccepted = validRows.filter((row) => row.pass).length;

  return {
    invalid: {
      rows: invalidRows,
      total: invalidRows.length,
      rejected: rejectedCount,
      correctMessage: messageMatchCount,
      passed: invalidPassed,
      failed: invalidRows.length - invalidPassed,
      rejectionRate: rejectedCount / invalidRows.length,
      correctMessageRate: messageMatchCount / invalidRows.length,
      passRate: invalidPassed / invalidRows.length,
    },
    valid: {
      rows: validRows,
      total: validRows.length,
      accepted: validAccepted,
      failed: validRows.length - validAccepted,
      acceptanceRate: validAccepted / validRows.length,
    },
    failures: [
      ...invalidRows
        .filter((row) => !row.pass)
        .map((row) => ({ category: 'invalid_input', ...row })),
      ...validRows
        .filter((row) => !row.pass)
        .map((row) => ({ category: 'valid_input', ...row })),
    ],
  };
}
