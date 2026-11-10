import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateTwin } from '../backend/src/utils/financialTwin.js';
import { generateDataset } from '../experiments/lib/dataset.js';
import { evaluateInvariants } from '../experiments/lib/invariants.js';
import {
  chance,
  mulberry32,
  pick,
  randBetween,
  randInt,
  roundTo,
} from '../experiments/lib/rng.js';

const GOALS = Object.freeze([
  'emergency_fund',
  'debt_repayment',
  'retirement',
  'home_purchase',
  'education',
  'wealth_building',
  'other',
]);

const OPTIONS = Object.freeze({ asOfDate: '2026-10-27' });

function randomInput(rng) {
  const monthlyIncome = roundTo(randBetween(rng, 0, 300000), 100);
  const monthlyExpenses = roundTo(randBetween(rng, 0, 300000), 100);
  const accessibleSavings = roundTo(randBetween(rng, 0, 500000), 100);
  const emiPayments = roundTo(randBetween(rng, 0, 100000), 100);
  const emiIncludedInExpenses = chance(rng, 0.5);
  const unexpectedExpense = roundTo(randBetween(rng, 0, 200000), 100);
  const targetAmount = chance(rng, 0.5)
    ? Math.max(1000, roundTo(randBetween(rng, 1000, 1000000), 1000))
    : null;
  const currentGoalSavings =
    targetAmount === null
      ? 0
      : roundTo(randBetween(rng, 0, targetAmount), 100);
  const monthlySavingsCapacity = chance(rng, 0.5)
    ? roundTo(randBetween(rng, 0, 50000), 100)
    : null;
  const goalTimelineMonths = chance(rng, 0.5)
    ? randInt(rng, 1, 60)
    : null;

  return {
    monthlyIncome,
    monthlyExpenses,
    accessibleSavings,
    goal: pick(rng, GOALS),
    emiPayments,
    emiIncludedInExpenses,
    unexpectedExpense,
    monthlySavingsCapacity,
    targetAmount,
    currentGoalSavings,
    goalTimelineMonths,
  };
}

function monthsOrInfinity(value) {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

describe('Phase 4 randomized directional invariants', () => {
  it('holds the documented directional relationships on random valid inputs', () => {
    const rng = mulberry32(987654321);

    for (let index = 0; index < 150; index += 1) {
      const input = randomInput(rng);
      const base = calculateTwin(input, OPTIONS);
      const label = `case ${index}`;

      const incomeUp = calculateTwin(
        { ...input, monthlyIncome: input.monthlyIncome + 1000 },
        OPTIONS
      );
      assert.ok(
        incomeUp.metrics.monthlySurplus >=
          base.metrics.monthlySurplus - 1e-9,
        `${label}: income up reduced surplus`
      );

      const expensesUp = calculateTwin(
        { ...input, monthlyExpenses: input.monthlyExpenses + 1000 },
        OPTIONS
      );
      assert.ok(
        expensesUp.metrics.monthlySurplus <=
          base.metrics.monthlySurplus + 1e-9,
        `${label}: expenses up increased surplus`
      );

      if (base.metrics.monthlyExpenses > 0) {
        const savingsUp = calculateTwin(
          { ...input, accessibleSavings: input.accessibleSavings + 1000 },
          OPTIONS
        );
        assert.ok(
          savingsUp.metrics.livingExpenseCoverageMonths >=
            base.metrics.livingExpenseCoverageMonths - 1e-9,
          `${label}: savings up reduced coverage`
        );
      }

      const shockUp = calculateTwin(
        { ...input, unexpectedExpense: input.unexpectedExpense + 1000 },
        OPTIONS
      );
      assert.ok(
        shockUp.metrics.postShockSavings <=
          base.metrics.postShockSavings + 1e-9,
        `${label}: shock up increased post-shock savings`
      );

      if (base.goalProjection.targetAmount !== null) {
        const contributionUp = calculateTwin(
          {
            ...input,
            monthlySavingsCapacity:
              base.goalProjection.assumedMonthlyContribution + 1000,
          },
          OPTIONS
        );
        assert.ok(
          monthsOrInfinity(contributionUp.goalProjection.estimatedMonths) <=
            monthsOrInfinity(base.goalProjection.estimatedMonths),
          `${label}: contribution up increased projected months`
        );
      }

      const emiUp = calculateTwin(
        { ...input, emiPayments: input.emiPayments + 1000 },
        OPTIONS
      );
      if (input.emiIncludedInExpenses) {
        assert.equal(
          emiUp.metrics.monthlySurplus,
          base.metrics.monthlySurplus,
          `${label}: included EMI changed surplus`
        );
      } else {
        assert.ok(
          emiUp.metrics.monthlySurplus <=
            base.metrics.monthlySurplus + 1e-9,
          `${label}: separate EMI increased surplus`
        );
      }
    }
  });

  it('reports no failures for the seeded dataset invariant suite', () => {
    const dataset = generateDataset({ seed: 555, profiles: 30 });
    const result = evaluateInvariants(dataset.profiles, {
      thresholds: dataset.thresholds,
      asOfDate: dataset.asOfDate,
    });

    assert.equal(result.failures.length, 0);
    assert.equal(result.overall.rate, 1);
    assert.ok(result.overall.applicable > 0);
    assert.ok(result.overall.notApplicable > 0);
  });
});
