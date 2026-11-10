import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonthsClampedIndependent,
  ceilMonthsIndependent,
  referenceComparison,
  referenceGoal,
  referenceMetrics,
  referenceRecommendationIds,
} from '../experiments/lib/reference.js';

const BASE_INPUT = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  accessibleSavings: 200000,
  goal: 'other',
};

describe('Phase 4 independent reference calculations', () => {
  describe('metrics', () => {
    it('calculates outflows, surplus, rates, coverage, EMI, and shock', () => {
      const metrics = referenceMetrics({
        ...BASE_INPUT,
        emiPayments: 10000,
        emiIncludedInExpenses: false,
        unexpectedExpense: 50000,
      });

      assert.equal(metrics.monthlyOutflows, 50000);
      assert.equal(metrics.monthlySurplus, 50000);
      assert.equal(metrics.savingsRatePct, 50);
      assert.equal(metrics.livingExpenseCoverageMonths, 5);
      assert.equal(metrics.mandatoryOutflowCoverageMonths, 4);
      assert.equal(metrics.emiBurdenPct, 10);
      assert.equal(metrics.postShockSavings, 150000);
      assert.equal(metrics.unfundedShock, 0);
      assert.equal(
        metrics.expenseCoverageMonths,
        metrics.livingExpenseCoverageMonths
      );
    });

    it('does not add EMI twice when it is already in expenses', () => {
      const metrics = referenceMetrics({
        ...BASE_INPUT,
        emiPayments: 10000,
        emiIncludedInExpenses: true,
      });

      assert.equal(metrics.monthlyOutflows, 40000);
      assert.equal(metrics.monthlySurplus, 60000);
      assert.equal(metrics.emiBurdenPct, 10);
    });

    it('returns null for zero denominators and floors post-shock savings at zero', () => {
      const zero = referenceMetrics({
        monthlyIncome: 0,
        monthlyExpenses: 0,
        accessibleSavings: 0,
      });

      assert.equal(zero.savingsRatePct, null);
      assert.equal(zero.livingExpenseCoverageMonths, null);
      assert.equal(zero.mandatoryOutflowCoverageMonths, null);
      assert.equal(zero.emiBurdenPct, null);

      const shock = referenceMetrics({
        ...BASE_INPUT,
        accessibleSavings: 30000,
        unexpectedExpense: 50000,
      });

      assert.equal(shock.postShockSavings, 0);
      assert.equal(shock.unfundedShock, 20000);
    });
  });

  describe('goal projection', () => {
    it('calculates remaining amount, months, required contribution, and date', () => {
      const goal = referenceGoal(
        {
          ...BASE_INPUT,
          targetAmount: 300000,
          currentGoalSavings: 50000,
          monthlySavingsCapacity: 15000,
          goalTimelineMonths: 24,
        },
        '2026-01-31'
      );

      assert.equal(goal.remainingAmount, 250000);
      assert.equal(goal.assumedMonthlyContribution, 15000);
      assert.equal(goal.estimatedMonths, 17);
      assert.equal(goal.unreachable, false);
      assert.equal(goal.requiredMonthlyContributionForTimeline, 10417);
      assert.equal(goal.onTrackForRequestedTimeline, true);
      assert.equal(goal.goalAchieved, false);
      assert.equal(goal.estimatedCompletionDate, '2027-06-30');
    });

    it('returns zero months and the as-of date for an achieved goal', () => {
      const goal = referenceGoal(
        {
          ...BASE_INPUT,
          targetAmount: 300000,
          currentGoalSavings: 350000,
          monthlySavingsCapacity: 10000,
          goalTimelineMonths: 12,
        },
        '2026-01-31'
      );

      assert.equal(goal.remainingAmount, 0);
      assert.equal(goal.estimatedMonths, 0);
      assert.equal(goal.goalAchieved, true);
      assert.equal(goal.estimatedCompletionDate, '2026-01-31');
    });

    it('marks a positive remaining amount unreachable without a contribution', () => {
      const goal = referenceGoal(
        {
          monthlyIncome: 40000,
          monthlyExpenses: 40000,
          accessibleSavings: 10000,
          goal: 'other',
          targetAmount: 100000,
          monthlySavingsCapacity: 0,
        },
        '2026-01-31'
      );

      assert.equal(goal.remainingAmount, 100000);
      assert.equal(goal.estimatedMonths, null);
      assert.equal(goal.unreachable, true);
      assert.equal(goal.estimatedCompletionDate, null);
    });

    it('tolerates floating-point noise in month rounding', () => {
      const goal = referenceGoal(
        {
          monthlyIncome: 1,
          monthlyExpenses: 0,
          accessibleSavings: 0,
          goal: 'other',
          targetAmount: 0.07,
          monthlySavingsCapacity: 0.01,
        },
        '2026-01-31'
      );

      assert.equal(goal.estimatedMonths, 7);
    });

    it('uses the documented month-end clamp rule', () => {
      assert.equal(
        addMonthsClampedIndependent('2024-01-31', 1),
        '2024-02-29'
      );
      assert.equal(
        addMonthsClampedIndependent('2026-08-31', 1),
        '2026-09-30'
      );
      assert.equal(
        addMonthsClampedIndependent('2024-02-29', 12),
        '2025-02-28'
      );
    });

    it('implements month rounding independently', () => {
      assert.equal(ceilMonthsIndependent(0), 0);
      assert.equal(ceilMonthsIndependent(0.5), 1);
      assert.equal(ceilMonthsIndependent(7.000000000000001), 7);
      assert.equal(ceilMonthsIndependent(7.1), 8);
    });
  });

  describe('recommendation rules', () => {
    const goalFor = (input) => referenceGoal(input, '2026-01-31');

    it('returns no recommendations for a healthy baseline', () => {
      const metrics = referenceMetrics({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 120000,
      });
      const goal = goalFor({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 120000,
      });

      assert.deepEqual(referenceRecommendationIds(metrics, goal), []);
    });

    it('triggers deficit and break-even on the documented boundaries', () => {
      const deficit = referenceMetrics({
        monthlyIncome: 30000,
        monthlyExpenses: 45000,
        accessibleSavings: 20000,
      });
      assert.ok(
        referenceRecommendationIds(
          deficit,
          goalFor({
            monthlyIncome: 30000,
            monthlyExpenses: 45000,
            accessibleSavings: 20000,
          })
        ).includes('deficit')
      );

      const breakEven = referenceMetrics({
        monthlyIncome: 50000,
        monthlyExpenses: 50000,
        accessibleSavings: 100000,
      });
      assert.ok(
        referenceRecommendationIds(
          breakEven,
          goalFor({
            monthlyIncome: 50000,
            monthlyExpenses: 50000,
            accessibleSavings: 100000,
          })
        ).includes('break_even')
      );
    });

    it('uses strict thresholds for coverage and EMI burden', () => {
      const exactlyThree = referenceMetrics({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 120000,
      });
      assert.equal(
        referenceRecommendationIds(
          exactlyThree,
          goalFor({
            monthlyIncome: 100000,
            monthlyExpenses: 40000,
            accessibleSavings: 120000,
          })
        ).includes('low_mandatory_coverage'),
        false
      );

      const belowThree = referenceMetrics({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 119999,
      });
      assert.ok(
        referenceRecommendationIds(
          belowThree,
          goalFor({
            monthlyIncome: 100000,
            monthlyExpenses: 40000,
            accessibleSavings: 119999,
          })
        ).includes('low_mandatory_coverage')
      );

      const exactlyForty = referenceMetrics({
        monthlyIncome: 100000,
        monthlyExpenses: 10000,
        accessibleSavings: 100000,
        emiPayments: 40000,
        emiIncludedInExpenses: false,
      });
      assert.equal(
        referenceRecommendationIds(
          exactlyForty,
          goalFor({
            monthlyIncome: 100000,
            monthlyExpenses: 10000,
            accessibleSavings: 100000,
            emiPayments: 40000,
            emiIncludedInExpenses: false,
          })
        ).includes('high_emi_burden'),
        false
      );

      const aboveForty = referenceMetrics({
        monthlyIncome: 100000,
        monthlyExpenses: 10000,
        accessibleSavings: 100000,
        emiPayments: 40001,
        emiIncludedInExpenses: false,
      });
      assert.ok(
        referenceRecommendationIds(
          aboveForty,
          goalFor({
            monthlyIncome: 100000,
            monthlyExpenses: 10000,
            accessibleSavings: 100000,
            emiPayments: 40001,
            emiIncludedInExpenses: false,
          })
        ).includes('high_emi_burden')
      );
    });

    it('triggers unfunded shock and unaffordable contribution rules', () => {
      const shockInput = {
        monthlyIncome: 80000,
        monthlyExpenses: 40000,
        accessibleSavings: 50000,
        unexpectedExpense: 60000,
      };
      const shockMetrics = referenceMetrics(shockInput);
      assert.ok(
        referenceRecommendationIds(
          shockMetrics,
          goalFor(shockInput)
        ).includes('unfunded_shock')
      );

      const contributionInput = {
        monthlyIncome: 50000,
        monthlyExpenses: 40000,
        accessibleSavings: 10000,
        monthlySavingsCapacity: 20000,
      };
      assert.ok(
        referenceRecommendationIds(
          referenceMetrics(contributionInput),
          goalFor(contributionInput)
        ).includes('unaffordable_goal_contribution')
      );
    });

    it('triggers goal achieved when current savings cover the target', () => {
      const input = {
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        targetAmount: 300000,
        currentGoalSavings: 300000,
        monthlySavingsCapacity: 10000,
      };

      assert.ok(
        referenceRecommendationIds(
          referenceMetrics(input),
          goalFor(input)
        ).includes('goal_achieved')
      );
    });
  });

  describe('comparison', () => {
    it('calculates differences and percentage changes from the baseline', () => {
      const comparison = referenceComparison(
        {
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 200000,
          goal: 'other',
        },
        {
          monthlyIncome: 110000,
          monthlyExpenses: 40000,
          accessibleSavings: 200000,
          goal: 'other',
        },
        '2026-10-27'
      );

      const income = comparison.metrics.find(
        (metric) => metric.key === 'monthlyIncome'
      );
      assert.equal(income.baseline, 100000);
      assert.equal(income.scenario, 110000);
      assert.equal(income.difference, 10000);
      assert.equal(income.percentageChange, 10);

      const surplus = comparison.metrics.find(
        (metric) => metric.key === 'monthlySurplus'
      );
      assert.equal(surplus.difference, 10000);
    });

    it('keeps percentage change null when the baseline is zero or unavailable', () => {
      const comparison = referenceComparison(
        {
          monthlyIncome: 0,
          monthlyExpenses: 0,
          accessibleSavings: 0,
          goal: 'other',
        },
        {
          monthlyIncome: 1000,
          monthlyExpenses: 0,
          accessibleSavings: 0,
          goal: 'other',
        },
        '2026-10-27'
      );

      const income = comparison.metrics.find(
        (metric) => metric.key === 'monthlyIncome'
      );
      assert.equal(income.percentageChange, null);
      assert.equal(income.percentagePointDifference, null);

      const savingsRate = comparison.metrics.find(
        (metric) => metric.key === 'savingsRatePct'
      );
      assert.equal(savingsRate.baseline, null);
      assert.equal(savingsRate.scenario, 100);
      assert.equal(savingsRate.percentageChange, null);
    });

    it('reports earlier goal completion when the contribution increases', () => {
      const comparison = referenceComparison(
        {
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 0,
          goal: 'other',
          targetAmount: 120000,
          monthlySavingsCapacity: 10000,
        },
        {
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 0,
          goal: 'other',
          targetAmount: 120000,
          monthlySavingsCapacity: 20000,
        },
        '2026-10-27'
      );

      assert.equal(comparison.goalProjection.estimatedMonths.difference, -6);
      assert.equal(
        comparison.goalProjection.completionDate.direction,
        'earlier'
      );
    });
  });
});
