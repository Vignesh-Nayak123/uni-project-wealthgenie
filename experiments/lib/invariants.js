/**
 * Directional invariants for the scenario usefulness evaluation.
 *
 * These checks hold under the documented assumptions: one input changes at a
 * time by a non-negative amount, all other inputs stay constant, the as-of date
 * and thresholds are unchanged, and no display rounding is applied. They are
 * mathematical properties of the implemented model, not evidence of real-world
 * financial improvement.
 */

import { calculateTwin } from '../../backend/src/utils/financialTwin.js';
import { nearlyEqual } from './metrics.js';
import { roundTo } from './rng.js';

export const INVARIANT_DEFINITIONS = Object.freeze([
  {
    id: 'income_up_surplus_non_decreasing',
    description:
      'Increasing monthly income, all else equal, must not reduce monthly surplus.',
    assumption: 'Delta is non-negative and no other input changes.',
  },
  {
    id: 'expenses_up_surplus_non_increasing',
    description:
      'Increasing monthly expenses, all else equal, must not increase monthly surplus.',
    assumption:
      'Delta is non-negative. When EMI is included in expenses, expenses remain the outflow base.',
  },
  {
    id: 'savings_up_coverage_non_decreasing',
    description:
      'Increasing accessible savings, all else equal, must not reduce living-expense coverage.',
    assumption:
      'Applies only when monthly living expenses are positive; coverage is undefined when E = 0.',
  },
  {
    id: 'shock_up_post_shock_non_increasing',
    description:
      'Increasing the one-time unexpected expense, all else equal, must not increase post-shock savings.',
    assumption:
      'The shock is applied once to accessible savings and never to monthly surplus.',
  },
  {
    id: 'contribution_up_months_non_increasing',
    description:
      'Increasing a positive goal contribution must not increase the projected months to an unfunded goal.',
    assumption:
      'Applies only when a target amount is set. An unreachable goal (no positive contribution) is treated as infinite months.',
  },
  {
    id: 'emi_included_up_surplus_unchanged',
    description:
      'When EMI is already included in expenses, increasing EMI must not change outflows or surplus.',
    assumption:
      'Applies only when emiIncludedInExpenses is true, because EMI is already inside E.',
  },
  {
    id: 'emi_separate_up_surplus_non_increasing',
    description:
      'When EMI is paid separately, increasing EMI must not increase monthly surplus.',
    assumption:
      'Applies only when emiIncludedInExpenses is false, because EMI is then added to O.',
  },
]);

function toleranceFor(left, right) {
  return 1e-9 * Math.max(1, Math.abs(left), Math.abs(right));
}

function monthsAsNumber(value) {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

export function evaluateInvariants(
  profiles,
  { thresholds, asOfDate } = {}
) {
  const counters = new Map();
  const rows = [];
  const failures = [];

  const record = (id, applicable, pass, detail) => {
    const counter =
      counters.get(id) || { applicable: 0, passed: 0, notApplicable: 0 };

    if (applicable) {
      counter.applicable += 1;
      if (pass) counter.passed += 1;
    } else {
      counter.notApplicable += 1;
    }
    counters.set(id, counter);

    rows.push({
      invariant: id,
      applicable,
      pass: applicable ? pass : null,
      ...detail,
    });

    if (applicable && !pass) {
      failures.push({ invariant: id, ...detail });
    }
  };

  for (const profile of profiles) {
    const effectiveAsOf = profile.asOfDate ?? asOfDate;
    const options = { thresholds, asOfDate: effectiveAsOf };
    const baseline = calculateTwin(profile, options);
    const profileId = profile.id;

    // 1. Income up -> surplus must not fall.
    {
      const delta = Math.max(
        1000,
        roundTo(baseline.metrics.monthlyIncome * 0.1, 100)
      );
      const next = calculateTwin(
        { ...profile, monthlyIncome: baseline.metrics.monthlyIncome + delta },
        options
      );
      const pass =
        next.metrics.monthlySurplus >=
        baseline.metrics.monthlySurplus -
          toleranceFor(
            baseline.metrics.monthlySurplus,
            next.metrics.monthlySurplus
          );

      record('income_up_surplus_non_decreasing', true, pass, {
        profileId,
        metric: 'monthlySurplus',
        delta,
        baselineValue: baseline.metrics.monthlySurplus,
        perturbedValue: next.metrics.monthlySurplus,
        note: '',
      });
    }

    // 2. Expenses up -> surplus must not rise.
    {
      const delta = Math.max(
        1000,
        roundTo(baseline.metrics.monthlyExpenses * 0.1, 100)
      );
      const next = calculateTwin(
        {
          ...profile,
          monthlyExpenses: baseline.metrics.monthlyExpenses + delta,
        },
        options
      );
      const pass =
        next.metrics.monthlySurplus <=
        baseline.metrics.monthlySurplus +
          toleranceFor(
            baseline.metrics.monthlySurplus,
            next.metrics.monthlySurplus
          );

      record('expenses_up_surplus_non_increasing', true, pass, {
        profileId,
        metric: 'monthlySurplus',
        delta,
        baselineValue: baseline.metrics.monthlySurplus,
        perturbedValue: next.metrics.monthlySurplus,
        note: '',
      });
    }

    // 3. Savings up -> living-expense coverage must not fall.
    {
      const applicable = baseline.metrics.monthlyExpenses > 0;
      if (!applicable) {
        record('savings_up_coverage_non_decreasing', false, false, {
          profileId,
          metric: 'livingExpenseCoverageMonths',
          delta: null,
          baselineValue: baseline.metrics.livingExpenseCoverageMonths,
          perturbedValue: null,
          note: 'Not applicable when monthly expenses are zero.',
        });
      } else {
        const delta = Math.max(
          5000,
          roundTo(baseline.metrics.accessibleSavings * 0.25, 100)
        );
        const next = calculateTwin(
          {
            ...profile,
            accessibleSavings: baseline.metrics.accessibleSavings + delta,
          },
          options
        );
        const pass =
          next.metrics.livingExpenseCoverageMonths >=
          baseline.metrics.livingExpenseCoverageMonths -
            toleranceFor(
              baseline.metrics.livingExpenseCoverageMonths,
              next.metrics.livingExpenseCoverageMonths
            );

        record('savings_up_coverage_non_decreasing', true, pass, {
          profileId,
          metric: 'livingExpenseCoverageMonths',
          delta,
          baselineValue: baseline.metrics.livingExpenseCoverageMonths,
          perturbedValue: next.metrics.livingExpenseCoverageMonths,
          note: '',
        });
      }
    }

    // 4. Shock up -> post-shock savings must not rise.
    {
      const delta = Math.max(
        1000,
        roundTo(baseline.metrics.accessibleSavings * 0.25, 100)
      );
      const next = calculateTwin(
        {
          ...profile,
          unexpectedExpense: baseline.metrics.unexpectedExpense + delta,
        },
        options
      );
      const pass =
        next.metrics.postShockSavings <=
        baseline.metrics.postShockSavings +
          toleranceFor(
            baseline.metrics.postShockSavings,
            next.metrics.postShockSavings
          );

      record('shock_up_post_shock_non_increasing', true, pass, {
        profileId,
        metric: 'postShockSavings',
        delta,
        baselineValue: baseline.metrics.postShockSavings,
        perturbedValue: next.metrics.postShockSavings,
        note: '',
      });
    }

    // 5. Contribution up -> months must not rise (null = unreachable).
    {
      const applicable = baseline.goalProjection.targetAmount !== null;
      if (!applicable) {
        record('contribution_up_months_non_increasing', false, false, {
          profileId,
          metric: 'estimatedMonths',
          delta: null,
          baselineValue: null,
          perturbedValue: null,
          note: 'Not applicable when no target amount is set.',
        });
      } else {
        const baseContribution =
          baseline.goalProjection.assumedMonthlyContribution;
        const delta = Math.max(
          1000,
          roundTo(baseContribution * 0.1, 100)
        );
        const next = calculateTwin(
          {
            ...profile,
            monthlySavingsCapacity: baseContribution + delta,
          },
          options
        );
        const baseMonths = monthsAsNumber(
          baseline.goalProjection.estimatedMonths
        );
        const nextMonths = monthsAsNumber(next.goalProjection.estimatedMonths);
        const pass = nextMonths <= baseMonths;

        record('contribution_up_months_non_increasing', true, pass, {
          profileId,
          metric: 'estimatedMonths',
          delta,
          baselineValue:
            baseline.goalProjection.estimatedMonths === null
              ? 'unreachable'
              : baseline.goalProjection.estimatedMonths,
          perturbedValue:
            next.goalProjection.estimatedMonths === null
              ? 'unreachable'
              : next.goalProjection.estimatedMonths,
          note: '',
        });
      }
    }

    // 6. EMI included -> surplus and outflows unchanged.
    {
      const applicable = baseline.metrics.emiIncludedInExpenses === true;
      if (!applicable) {
        record('emi_included_up_surplus_unchanged', false, false, {
          profileId,
          metric: 'monthlySurplus',
          delta: null,
          baselineValue: baseline.metrics.monthlySurplus,
          perturbedValue: null,
          note: 'Not applicable when EMI is paid separately.',
        });
      } else {
        const delta = Math.max(
          1000,
          roundTo(baseline.metrics.emiPayments * 0.1, 100)
        );
        const next = calculateTwin(
          { ...profile, emiPayments: baseline.metrics.emiPayments + delta },
          options
        );
        const pass =
          nearlyEqual(
            next.metrics.monthlyOutflows,
            baseline.metrics.monthlyOutflows
          ) &&
          nearlyEqual(
            next.metrics.monthlySurplus,
            baseline.metrics.monthlySurplus
          );

        record('emi_included_up_surplus_unchanged', true, pass, {
          profileId,
          metric: 'monthlySurplus',
          delta,
          baselineValue: baseline.metrics.monthlySurplus,
          perturbedValue: next.metrics.monthlySurplus,
          note: 'EMI is already inside monthly expenses.',
        });
      }
    }

    // 7. EMI separate -> surplus must not rise.
    {
      const applicable = baseline.metrics.emiIncludedInExpenses === false;
      if (!applicable) {
        record('emi_separate_up_surplus_non_increasing', false, false, {
          profileId,
          metric: 'monthlySurplus',
          delta: null,
          baselineValue: baseline.metrics.monthlySurplus,
          perturbedValue: null,
          note: 'Not applicable when EMI is included in expenses.',
        });
      } else {
        const delta = Math.max(
          1000,
          roundTo(baseline.metrics.emiPayments * 0.1, 100)
        );
        const next = calculateTwin(
          { ...profile, emiPayments: baseline.metrics.emiPayments + delta },
          options
        );
        const pass =
          next.metrics.monthlySurplus <=
          baseline.metrics.monthlySurplus +
            toleranceFor(
              baseline.metrics.monthlySurplus,
              next.metrics.monthlySurplus
            );

        record('emi_separate_up_surplus_non_increasing', true, pass, {
          profileId,
          metric: 'monthlySurplus',
          delta,
          baselineValue: baseline.metrics.monthlySurplus,
          perturbedValue: next.metrics.monthlySurplus,
          note: 'EMI is added to outflows exactly once.',
        });
      }
    }
  }

  const byInvariant = INVARIANT_DEFINITIONS.map((definition) => {
    const counter = counters.get(definition.id) || {
      applicable: 0,
      passed: 0,
      notApplicable: 0,
    };

    return {
      id: definition.id,
      description: definition.description,
      assumption: definition.assumption,
      applicable: counter.applicable,
      passed: counter.passed,
      failed: counter.applicable - counter.passed,
      notApplicable: counter.notApplicable,
      rate:
        counter.applicable === 0
          ? null
          : counter.passed / counter.applicable,
    };
  });

  const totals = byInvariant.reduce(
    (accumulator, item) => ({
      applicable: accumulator.applicable + item.applicable,
      passed: accumulator.passed + item.passed,
      notApplicable: accumulator.notApplicable + item.notApplicable,
    }),
    { applicable: 0, passed: 0, notApplicable: 0 }
  );

  return {
    rows,
    failures,
    byInvariant,
    overall: {
      ...totals,
      total: totals.applicable,
      failed: totals.applicable - totals.passed,
      rate:
        totals.applicable === 0 ? null : totals.passed / totals.applicable,
    },
  };
}
