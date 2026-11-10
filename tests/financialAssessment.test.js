import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessFinances,
  validateGoal,
  GOAL_CATEGORIES,
} from '../backend/src/utils/financialAssessment.js';

describe('Financial Assessment', () => {
  describe('core calculations', () => {
    it('calculates surplus, savings rate, expense coverage, and goal projection', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.RETIREMENT,
        monthlySavingsCapacity: 15000,
        targetAmount: 300000,
        currentGoalSavings: 50000,
        goalTimelineMonths: 24,
      });

      assert.equal(result.currency, 'INR');
      assert.equal(result.goal, 'retirement');
      assert.equal(result.metrics.monthlyOutflows, 40000);
      assert.equal(result.metrics.monthlySurplus, 60000);
      assert.equal(result.metrics.savingsRatePct, 60);
      assert.equal(result.metrics.emergencyFundCoverageMonths, 5);
      assert.equal(result.metrics.expenseCoverageMonths, 5);

      assert.equal(result.goalProjection.remainingAmount, 250000);
      assert.equal(result.goalProjection.estimatedMonths, 17);
      assert.equal(result.goalProjection.requiredMonthlyContributionForTimeline, 10417);
      assert.equal(result.goalProjection.onTrackForRequestedTimeline, true);
      assert.equal(result.warnings.length, 0);
      assert.ok(Array.isArray(result.recommendations));
      assert.ok(result.assumptions.length > 0);
      assert.match(result.disclaimer, /Educational financial information only/);
    });

    it('handles zero income without dividing by zero', () => {
      const result = assessFinances({
        monthlyIncome: 0,
        monthlyExpenses: 10000,
        accessibleSavings: 5000,
        goal: GOAL_CATEGORIES.EMERGENCY_FUND,
      });

      assert.equal(result.metrics.savingsRatePct, null);
      assert.equal(result.metrics.monthlySurplus, -10000);
      assert.equal(result.metrics.emergencyFundCoverageMonths, 0.5);
      assert.ok(result.warnings.some((warning) => /income is zero/i.test(warning)));
    });

    it('flags a negative monthly surplus', () => {
      const result = assessFinances({
        monthlyIncome: 30000,
        monthlyExpenses: 40000,
        accessibleSavings: 50000,
        goal: GOAL_CATEGORIES.DEBT_REPAYMENT,
      });

      assert.equal(result.metrics.monthlySurplus, -10000);
      assert.ok(result.warnings.some((warning) => /exceed your income/i.test(warning)));
      assert.ok(result.recommendations.length > 0);
    });

    it('returns null expense coverage when monthly expenses are zero', () => {
      const result = assessFinances({
        monthlyIncome: 50000,
        monthlyExpenses: 0,
        accessibleSavings: 100000,
        goal: GOAL_CATEGORIES.OTHER,
      });

      assert.equal(result.metrics.expenseCoverageMonths, null);
      assert.ok(result.warnings.some((warning) => /expenses are zero/i.test(warning)));
    });

    it('supports missing optional inputs with transparent assumptions', () => {
      const result = assessFinances({
        monthlyIncome: 60000,
        monthlyExpenses: 30000,
        accessibleSavings: 90000,
        goal: GOAL_CATEGORIES.EDUCATION,
      });

      assert.equal(result.metrics.emiPayments, 0);
      assert.equal(result.metrics.emiIncludedInExpenses, true);
      assert.equal(result.metrics.monthlySavingsCapacity, null);
      assert.equal(result.goalProjection, null);
      assert.ok(result.recommendations.some((item) => /target amount/i.test(item)));
      assert.ok(result.assumptions.some((item) => /full positive monthly surplus/i.test(item)));
      assert.ok(result.assumptions.some((item) => /No goal target amount/i.test(item)));
    });

    it('accepts numeric strings and normalises them to numbers', () => {
      const result = assessFinances({
        monthlyIncome: '100000',
        monthlyExpenses: '40000',
        accessibleSavings: '200000',
        goal: 'retirement',
        monthlySavingsCapacity: '15000',
        targetAmount: '300000',
        currentGoalSavings: '50000',
        goalTimelineMonths: '24',
      });

      assert.equal(result.metrics.monthlyIncome, 100000);
      assert.equal(result.metrics.monthlyExpenses, 40000);
      assert.equal(result.metrics.accessibleSavings, 200000);
      assert.equal(result.metrics.monthlySavingsCapacity, 15000);
      assert.equal(result.goalProjection.targetAmount, 300000);
      assert.equal(result.goalProjection.currentGoalSavings, 50000);
      assert.equal(result.goalProjection.requestedTimelineMonths, 24);
      assert.equal(result.goalProjection.estimatedMonths, 17);
    });

    it('handles zero income and zero expenses without dividing by zero', () => {
      const result = assessFinances({
        monthlyIncome: 0,
        monthlyExpenses: 0,
        accessibleSavings: 0,
        goal: GOAL_CATEGORIES.OTHER,
      });

      assert.equal(result.metrics.monthlySurplus, 0);
      assert.equal(result.metrics.savingsRatePct, null);
      assert.equal(result.metrics.emergencyFundCoverageMonths, null);
      assert.ok(result.warnings.some((warning) => /no monthly surplus/i.test(warning)));
      assert.ok(result.warnings.some((warning) => /income is zero/i.test(warning)));
      assert.ok(result.warnings.some((warning) => /expenses are zero/i.test(warning)));
    });

    it('warns when stated savings capacity exceeds the calculated surplus', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 70000,
      });

      assert.equal(result.metrics.monthlySurplus, 60000);
      assert.ok(
        result.warnings.some((warning) => /savings capacity exceeds/i.test(warning))
      );
    });
  });

  describe('EMI handling', () => {
    it('does not double-count EMI already included in expenses', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: GOAL_CATEGORIES.OTHER,
        emiPayments: 10000,
        emiIncludedInExpenses: true,
      });

      assert.equal(result.metrics.monthlyOutflows, 40000);
      assert.equal(result.metrics.monthlySurplus, 60000);
      assert.ok(result.assumptions.some((item) => /not added again/i.test(item)));
    });

    it('adds EMI separately when it is not included in expenses', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: GOAL_CATEGORIES.OTHER,
        emiPayments: 10000,
        emiIncludedInExpenses: false,
      });

      assert.equal(result.metrics.monthlyOutflows, 50000);
      assert.equal(result.metrics.monthlySurplus, 50000);
      assert.equal(result.metrics.savingsRatePct, 50);
      assert.ok(result.assumptions.some((item) => /added separately/i.test(item)));
    });

    it('keeps expense coverage based on expenses when EMI is paid separately', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        emiPayments: 10000,
        emiIncludedInExpenses: false,
      });

      assert.equal(result.metrics.monthlyOutflows, 50000);
      // Documented definition: coverage uses monthly expenses, not total outflows.
      assert.equal(result.metrics.expenseCoverageMonths, 5);
      assert.equal(result.metrics.emergencyFundCoverageMonths, 5);
    });
  });

  describe('goal projections', () => {
    it('reports a goal as met when current savings cover the target', () => {
      const result = assessFinances({
        monthlyIncome: 80000,
        monthlyExpenses: 30000,
        accessibleSavings: 100000,
        goal: GOAL_CATEGORIES.OTHER,
        targetAmount: 100000,
        currentGoalSavings: 120000,
      });

      assert.equal(result.goalProjection.remainingAmount, 0);
      assert.equal(result.goalProjection.estimatedMonths, 0);
      assert.ok(result.warnings.some((item) => /exceed the stated target/i.test(item)));
    });

    it('does not invent a timeline when there is no positive contribution', () => {
      const result = assessFinances({
        monthlyIncome: 50000,
        monthlyExpenses: 50000,
        accessibleSavings: 50000,
        goal: GOAL_CATEGORIES.OTHER,
        targetAmount: 100000,
      });

      assert.equal(result.goalProjection.assumedMonthlyContribution, 0);
      assert.equal(result.goalProjection.estimatedMonths, null);
      assert.ok(result.recommendations.some((item) => /positive monthly contribution/i.test(item)));
    });

    it('identifies a timeline gap and required monthly contribution', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.WEALTH_BUILDING,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
        goalTimelineMonths: 10,
      });

      assert.equal(result.goalProjection.estimatedMonths, 20);
      assert.equal(result.goalProjection.requiredMonthlyContributionForTimeline, 10000);
      assert.equal(result.goalProjection.onTrackForRequestedTimeline, false);
      assert.ok(result.recommendations.some((item) => /desired timeline/i.test(item)));
    });

    it('uses an explicit desiredTimelineMonths alias', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
        desiredTimelineMonths: 10,
      });

      assert.equal(result.goalProjection.requestedTimelineMonths, 10);
    });

    it('falls back to a timeline alias when the preferred field is blank', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
        goalTimelineMonths: '',
        desiredTimelineMonths: 10,
      });

      assert.equal(result.goalProjection.requestedTimelineMonths, 10);
      assert.equal(result.goalProjection.requiredMonthlyContributionForTimeline, 10000);
    });

    it('treats a whitespace-only preferred timeline as missing', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
        goalTimelineMonths: '   ',
        desiredTimelineMonths: 10,
      });

      assert.equal(result.goalProjection.requestedTimelineMonths, 10);
    });

    it('uses the timelineMonths alias when the other timeline fields are absent', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
        timelineMonths: 20,
      });

      assert.equal(result.goalProjection.requestedTimelineMonths, 20);
      assert.equal(result.goalProjection.requiredMonthlyContributionForTimeline, 5000);
    });

    it('respects an explicit zero savings capacity instead of assuming the surplus', () => {
      const result = assessFinances({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 0,
        targetAmount: 100000,
      });

      assert.equal(result.goalProjection.assumedMonthlyContribution, 0);
      assert.equal(result.goalProjection.estimatedMonths, null);
      assert.ok(
        result.recommendations.some((item) => /positive monthly contribution/i.test(item))
      );
    });

    it('does not overstate whole months because of floating-point noise', () => {
      const result = assessFinances({
        monthlyIncome: 1,
        monthlyExpenses: 0,
        accessibleSavings: 0,
        goal: GOAL_CATEGORIES.OTHER,
        monthlySavingsCapacity: 0.01,
        targetAmount: 0.07,
      });

      assert.equal(result.goalProjection.remainingAmount, 0.07);
      assert.equal(result.goalProjection.assumedMonthlyContribution, 0.01);
      assert.equal(result.goalProjection.estimatedMonths, 7);
    });
  });

  describe('validation', () => {
    const valid = {
      monthlyIncome: 50000,
      monthlyExpenses: 20000,
      accessibleSavings: 100000,
      goal: GOAL_CATEGORIES.OTHER,
    };

    it('requires an object input', () => {
      assert.throws(() => assessFinances(null), /must be an object/);
      assert.throws(() => assessFinances([]), /must be an object/);
    });

    it('requires monthly income, expenses, accessible savings, and goal', () => {
      assert.throws(() => assessFinances({}), /Monthly income is required/);
      assert.throws(
        () => assessFinances({ monthlyIncome: 50000 }),
        /Monthly expenses is required/
      );
      assert.throws(
        () => assessFinances({ monthlyIncome: 50000, monthlyExpenses: 20000 }),
        /Accessible savings is required/
      );
      assert.throws(
        () => assessFinances({ monthlyIncome: 50000, monthlyExpenses: 20000, accessibleSavings: 1 }),
        /Financial goal is required/
      );
    });

    it('rejects negative and non-finite required numbers', () => {
      assert.throws(
        () => assessFinances({ ...valid, monthlyIncome: -1 }),
        /Monthly income must be zero or greater/
      );
      assert.throws(
        () => assessFinances({ ...valid, monthlyIncome: NaN }),
        /Monthly income must be a valid number/
      );
      assert.throws(
        () => assessFinances({ ...valid, monthlyExpenses: Infinity }),
        /Monthly expenses must be a valid number/
      );
      assert.throws(
        () => assessFinances({ ...valid, accessibleSavings: 'not-a-number' }),
        /Accessible savings must be a valid number/
      );
    });

    it('rejects invalid optional values', () => {
      assert.throws(
        () => assessFinances({ ...valid, emiPayments: -100 }),
        /EMI payments must be zero or greater/
      );
      assert.throws(
        () => assessFinances({ ...valid, emiIncludedInExpenses: 'yes' }),
        /emiIncludedInExpenses must be a boolean/
      );
      assert.throws(
        () => assessFinances({ ...valid, targetAmount: -1 }),
        /Goal target amount must be zero or greater/
      );
      assert.throws(
        () => assessFinances({ ...valid, goalTimelineMonths: 0 }),
        /Goal timeline in months must be greater than zero/
      );
    });

    it('rejects a zero goal target when one is provided', () => {
      assert.throws(
        () => assessFinances({ ...valid, targetAmount: 0 }),
        /Goal target amount must be greater than zero/
      );
    });

    it('rejects a fractional goal timeline because months are whole units', () => {
      assert.throws(
        () =>
          assessFinances({
            ...valid,
            targetAmount: 100000,
            goalTimelineMonths: 12.5,
          }),
        /Goal timeline in months must be a whole number/
      );
    });

    it('validates and normalises goal categories', () => {
      assert.equal(validateGoal('Emergency Fund'), GOAL_CATEGORIES.EMERGENCY_FUND);
      assert.equal(validateGoal('debt-repayment'), GOAL_CATEGORIES.DEBT_REPAYMENT);
      assert.equal(validateGoal('home'), GOAL_CATEGORIES.HOME_PURCHASE);
      assert.throws(() => validateGoal('holiday'), /Unsupported financial goal/);
    });
  });
});
