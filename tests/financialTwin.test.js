import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TWIN_THRESHOLDS,
  addCalendarMonthsClamped,
  buildTwinPreview,
  calculateTwin,
  compareTwinResults,
  normalizeTwinThresholds,
} from '../backend/src/utils/financialTwin.js';

const BASE = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  accessibleSavings: 200000,
  goal: 'other',
};

function recommendationIds(result) {
  return result.recommendations.map((item) => item.id);
}

describe('Financial Digital Twin', () => {
  describe('mandatory formulas', () => {
    it('calculates outflows, surplus, rates, coverage, shock, and goal metrics', () => {
      const result = calculateTwin(
        {
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 200000,
          goal: 'emergency_fund',
          emiPayments: 10000,
          emiIncludedInExpenses: false,
          unexpectedExpense: 50000,
          monthlySavingsCapacity: 15000,
          targetAmount: 300000,
          currentGoalSavings: 50000,
          goalTimelineMonths: 24,
        },
        { asOfDate: '2026-01-31' }
      );

      assert.equal(result.currency, 'INR');
      assert.equal(result.resultType, 'estimate');
      assert.equal(result.metrics.monthlyOutflows, 50000);
      assert.equal(result.metrics.monthlySurplus, 50000);
      assert.equal(result.metrics.savingsRatePct, 50);
      assert.equal(result.metrics.livingExpenseCoverageMonths, 5);
      assert.equal(result.metrics.expenseCoverageMonths, 5);
      assert.equal(result.metrics.mandatoryOutflowCoverageMonths, 4);
      assert.equal(result.metrics.emiBurdenPct, 10);
      assert.equal(result.metrics.postShockSavings, 150000);
      assert.equal(result.metrics.unfundedShock, 0);

      assert.equal(result.goalProjection.remainingAmount, 250000);
      assert.equal(result.goalProjection.assumedMonthlyContribution, 15000);
      assert.equal(result.goalProjection.estimatedMonths, 17);
      assert.equal(result.goalProjection.unreachable, false);
      assert.equal(result.goalProjection.estimatedCompletionDate, '2027-06-30');
      assert.equal(result.goalProjection.onTrackForRequestedTimeline, true);
    });

    it('does not double-count EMI that is already in expenses', () => {
      const result = calculateTwin({
        ...BASE,
        emiPayments: 10000,
        emiIncludedInExpenses: true,
      });

      assert.equal(result.metrics.monthlyOutflows, 40000);
      assert.equal(result.metrics.monthlySurplus, 60000);
      // EMI burden is still measured against income, but it is not added twice.
      assert.equal(result.metrics.emiBurdenPct, 10);
      assert.ok(
        result.assumptions.some((item) => /not added again/i.test(item))
      );
    });

    it('adds separately paid EMI exactly once', () => {
      const result = calculateTwin({
        ...BASE,
        emiPayments: 10000,
        emiIncludedInExpenses: false,
      });

      assert.equal(result.metrics.monthlyOutflows, 50000);
      assert.equal(result.metrics.monthlySurplus, 50000);
      assert.equal(result.metrics.savingsRatePct, 50);
    });

    it('returns null rates when income is zero', () => {
      const result = calculateTwin({
        monthlyIncome: 0,
        monthlyExpenses: 10000,
        accessibleSavings: 5000,
        goal: 'other',
      });

      assert.equal(result.metrics.savingsRatePct, null);
      assert.equal(result.metrics.emiBurdenPct, null);
      assert.equal(result.metrics.monthlySurplus, -10000);
    });

    it('returns null living coverage when expenses are zero', () => {
      const result = calculateTwin({
        monthlyIncome: 50000,
        monthlyExpenses: 0,
        accessibleSavings: 100000,
        goal: 'other',
      });

      assert.equal(result.metrics.livingExpenseCoverageMonths, null);
      assert.equal(result.metrics.expenseCoverageMonths, null);
      assert.equal(result.metrics.mandatoryOutflowCoverageMonths, null);
    });

    it('returns null mandatory coverage when mandatory outflows are zero', () => {
      const result = calculateTwin({
        monthlyIncome: 50000,
        monthlyExpenses: 0,
        accessibleSavings: 100000,
        goal: 'other',
        emiPayments: 0,
      });

      assert.equal(result.metrics.mandatoryOutflowCoverageMonths, null);
    });

    it('caps post-shock savings and reports an unfunded shock', () => {
      const result = calculateTwin({
        ...BASE,
        accessibleSavings: 50000,
        unexpectedExpense: 80000,
      });

      assert.equal(result.metrics.postShockSavings, 0);
      assert.equal(result.metrics.unfundedShock, 30000);
      assert.ok(recommendationIds(result).includes('unfunded_shock'));
    });

    it('does not subtract the goal contribution from surplus a second time', () => {
      const result = calculateTwin({
        ...BASE,
        monthlySavingsCapacity: 15000,
        targetAmount: 300000,
        currentGoalSavings: 50000,
      });

      assert.equal(result.metrics.monthlySurplus, 60000);
      assert.equal(result.goalProjection.remainingAmount, 250000);
      assert.equal(result.goalProjection.assumedMonthlyContribution, 15000);
      assert.equal(result.goalProjection.estimatedMonths, 17);
    });
  });

  describe('goal timelines and dates', () => {
    it('reports an achieved goal with zero months and the as-of date', () => {
      const result = calculateTwin(
        {
          ...BASE,
          targetAmount: 100000,
          currentGoalSavings: 120000,
        },
        { asOfDate: '2026-10-27' }
      );

      assert.equal(result.goalProjection.remainingAmount, 0);
      assert.equal(result.goalProjection.estimatedMonths, 0);
      assert.equal(result.goalProjection.unreachable, false);
      assert.equal(result.goalProjection.goalAchieved, true);
      assert.equal(result.goalProjection.estimatedCompletionDate, '2026-10-27');
      assert.ok(recommendationIds(result).includes('goal_achieved'));
    });

    it('marks a goal unreachable when there is no positive contribution', () => {
      const result = calculateTwin({
        monthlyIncome: 50000,
        monthlyExpenses: 50000,
        accessibleSavings: 50000,
        goal: 'other',
        targetAmount: 100000,
      });

      assert.equal(result.goalProjection.assumedMonthlyContribution, 0);
      assert.equal(result.goalProjection.estimatedMonths, null);
      assert.equal(result.goalProjection.unreachable, true);
      assert.equal(result.goalProjection.estimatedCompletionDate, null);
    });

    it('ignores floating-point noise when rounding whole months', () => {
      const result = calculateTwin({
        monthlyIncome: 1,
        monthlyExpenses: 0,
        accessibleSavings: 0,
        goal: 'other',
        monthlySavingsCapacity: 0.01,
        targetAmount: 0.07,
      });

      assert.equal(result.goalProjection.remainingAmount, 0.07);
      assert.equal(result.goalProjection.estimatedMonths, 7);
    });

    it('uses the documented month-end clamp rule', () => {
      assert.equal(addCalendarMonthsClamped('2024-01-31', 1), '2024-02-29');
      assert.equal(addCalendarMonthsClamped('2025-01-31', 1), '2025-02-28');
      assert.equal(addCalendarMonthsClamped('2026-08-31', 1), '2026-09-30');
      assert.equal(addCalendarMonthsClamped('2026-01-15', 2), '2026-03-15');
      assert.equal(addCalendarMonthsClamped('2026-01-31', 0), '2026-01-31');
    });

    it('projects completion dates with the month-end clamp', () => {
      const result = calculateTwin(
        {
          monthlyIncome: 50000,
          monthlyExpenses: 0,
          accessibleSavings: 0,
          goal: 'other',
          monthlySavingsCapacity: 10000,
          targetAmount: 100000,
        },
        { asOfDate: '2024-01-31' }
      );

      assert.equal(result.goalProjection.estimatedMonths, 10);
      assert.equal(result.goalProjection.estimatedCompletionDate, '2024-11-30');
    });
  });

  describe('recommendation triggers and heuristic boundaries', () => {
    it('triggers a deficit when surplus is negative and break-even at zero', () => {
      const deficit = calculateTwin({
        monthlyIncome: 30000,
        monthlyExpenses: 40000,
        accessibleSavings: 50000,
        goal: 'other',
      });
      assert.ok(recommendationIds(deficit).includes('deficit'));

      const breakEven = calculateTwin({
        monthlyIncome: 40000,
        monthlyExpenses: 40000,
        accessibleSavings: 50000,
        goal: 'other',
      });
      assert.ok(recommendationIds(breakEven).includes('break_even'));
      assert.ok(!recommendationIds(breakEven).includes('deficit'));
    });

    it('does not trigger low coverage at exactly three months but does below it', () => {
      const exactlyThree = calculateTwin({
        monthlyIncome: 200000,
        monthlyExpenses: 100000,
        accessibleSavings: 300000,
        goal: 'other',
      });
      assert.equal(exactlyThree.metrics.mandatoryOutflowCoverageMonths, 3);
      assert.ok(
        !recommendationIds(exactlyThree).includes('low_mandatory_coverage')
      );

      const belowThree = calculateTwin({
        monthlyIncome: 200000,
        monthlyExpenses: 100000,
        accessibleSavings: 299900,
        goal: 'other',
      });
      assert.ok(
        recommendationIds(belowThree).includes('low_mandatory_coverage')
      );
    });

    it('does not trigger high EMI at exactly 40% but does above it', () => {
      const exactlyForty = calculateTwin({
        monthlyIncome: 100000,
        monthlyExpenses: 10000,
        accessibleSavings: 100000,
        goal: 'other',
        emiPayments: 40000,
      });
      assert.equal(exactlyForty.metrics.emiBurdenPct, 40);
      assert.ok(!recommendationIds(exactlyForty).includes('high_emi_burden'));

      const aboveForty = calculateTwin({
        monthlyIncome: 100000,
        monthlyExpenses: 10000,
        accessibleSavings: 100000,
        goal: 'other',
        emiPayments: 40001,
      });
      assert.ok(recommendationIds(aboveForty).includes('high_emi_burden'));
    });

    it('uses configurable thresholds and labels them as heuristics', () => {
      const result = calculateTwin(
        {
          monthlyIncome: 200000,
          monthlyExpenses: 100000,
          accessibleSavings: 400000,
          goal: 'other',
          emiPayments: 10001,
        },
        {
          thresholds: {
            lowMandatoryCoverageMonths: 6,
            highEmiBurdenPct: 5,
          },
        }
      );

      assert.equal(result.thresholds.lowMandatoryCoverageMonths, 6);
      assert.equal(result.thresholds.highEmiBurdenPct, 5);
      assert.equal(result.thresholds.isHeuristic, true);
      assert.ok(recommendationIds(result).includes('low_mandatory_coverage'));
      assert.ok(recommendationIds(result).includes('high_emi_burden'));
      const low = result.recommendations.find(
        (item) => item.id === 'low_mandatory_coverage'
      );
      assert.equal(low.heuristic, true);
      assert.equal(low.threshold.value, 6);
    });

    it('flags a goal contribution larger than the surplus', () => {
      const result = calculateTwin({
        ...BASE,
        monthlySavingsCapacity: 70000,
        targetAmount: 100000,
      });

      assert.equal(result.metrics.monthlySurplus, 60000);
      assert.ok(
        recommendationIds(result).includes('unaffordable_goal_contribution')
      );
    });

    it('flags an unaffordable contribution even without a goal target', () => {
      const result = calculateTwin({
        ...BASE,
        monthlySavingsCapacity: 70000,
      });

      assert.equal(result.goalProjection.targetAmount, null);
      assert.ok(
        recommendationIds(result).includes('unaffordable_goal_contribution')
      );
    });

    it('attaches formula, inputs, assumptions, and reason to every recommendation', () => {
      const result = calculateTwin({
        monthlyIncome: 30000,
        monthlyExpenses: 40000,
        accessibleSavings: 10000,
        goal: 'other',
        emiPayments: 20000,
        emiIncludedInExpenses: false,
        unexpectedExpense: 50000,
        monthlySavingsCapacity: 20000,
        targetAmount: 100000,
      });

      assert.ok(result.recommendations.length >= 5);
      for (const item of result.recommendations) {
        assert.equal(typeof item.id, 'string');
        assert.equal(typeof item.trigger, 'string');
        assert.equal(typeof item.formula, 'string');
        assert.equal(typeof item.reason, 'string');
        assert.equal(typeof item.inputs, 'object');
        assert.ok(Array.isArray(item.assumptions));
      }
    });
  });

  describe('explainability', () => {
    it('attaches an explanation to every metric and the goal projection', () => {
      const result = calculateTwin({
        ...BASE,
        targetAmount: 100000,
        monthlySavingsCapacity: 5000,
      });

      for (const key of Object.keys(result.metrics)) {
        const explanation = result.explanations.metrics[key];
        assert.ok(explanation, `missing explanation for ${key}`);
        assert.equal(typeof explanation.formula, 'string');
        assert.equal(typeof explanation.reason, 'string');
        assert.equal(typeof explanation.inputs, 'object');
        assert.ok(Array.isArray(explanation.assumptions));
      }

      const goal = result.explanations.goalProjection;
      assert.ok(goal);
      assert.match(goal.formula, /remaining/);
      assert.equal(typeof goal.reason, 'string');
      assert.ok(Array.isArray(goal.assumptions));

      const goalMetricKeys = [
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
      ];
      for (const key of goalMetricKeys) {
        const explanation = result.explanations.goalMetrics[key];
        assert.ok(explanation, `missing goal explanation for ${key}`);
        assert.equal(typeof explanation.formula, 'string');
        assert.equal(typeof explanation.reason, 'string');
        assert.equal(typeof explanation.inputs, 'object');
        assert.ok(Array.isArray(explanation.assumptions));
      }
    });

    it('states that scenarios are estimates, not predictions', () => {
      const result = calculateTwin(BASE);
      assert.match(result.disclaimer, /not a guarantee, prediction/i);
      assert.ok(
        result.assumptions.some((item) => /not a prediction/i.test(item))
      );
    });
  });

  describe('scenario comparison', () => {
    it('compares absolute, percentage, and percentage-point differences', () => {
      const baseline = calculateTwin(BASE);
      const scenario = calculateTwin({
        ...BASE,
        monthlyExpenses: 50000,
      });
      const comparison = compareTwinResults(baseline, scenario);

      const surplus = comparison.metrics.find(
        (item) => item.key === 'monthlySurplus'
      );
      assert.equal(surplus.baseline, 60000);
      assert.equal(surplus.scenario, 50000);
      assert.equal(surplus.difference, -10000);
      assert.ok(Math.abs(surplus.percentageChange + 16.6666666667) < 1e-9);

      const savingsRate = comparison.metrics.find(
        (item) => item.key === 'savingsRatePct'
      );
      assert.equal(savingsRate.difference, -10);
      assert.equal(savingsRate.percentagePointDifference, -10);
      assert.ok(Math.abs(savingsRate.percentageChange + 16.6666666667) < 1e-9);
    });

    it('returns a null percentage change when the baseline is zero', () => {
      const baseline = calculateTwin({
        monthlyIncome: 40000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: 'other',
      });
      const scenario = calculateTwin({
        monthlyIncome: 50000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: 'other',
      });
      const comparison = compareTwinResults(baseline, scenario);
      const surplus = comparison.metrics.find(
        (item) => item.key === 'monthlySurplus'
      );

      assert.equal(surplus.baseline, 0);
      assert.equal(surplus.difference, 10000);
      assert.equal(surplus.percentageChange, null);
    });

    it('uses the absolute baseline value for percentage change', () => {
      const baseline = calculateTwin({
        monthlyIncome: 30000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: 'other',
      });
      const scenario = calculateTwin({
        monthlyIncome: 40000,
        monthlyExpenses: 40000,
        accessibleSavings: 100000,
        goal: 'other',
      });
      const comparison = compareTwinResults(baseline, scenario);
      const surplus = comparison.metrics.find(
        (item) => item.key === 'monthlySurplus'
      );

      assert.equal(surplus.baseline, -10000);
      assert.equal(surplus.difference, 10000);
      assert.equal(surplus.percentageChange, 100);
    });

    it('returns null differences when either side is unavailable', () => {
      const baseline = calculateTwin({
        monthlyIncome: 0,
        monthlyExpenses: 10000,
        accessibleSavings: 5000,
        goal: 'other',
      });
      const scenario = calculateTwin({
        monthlyIncome: 50000,
        monthlyExpenses: 10000,
        accessibleSavings: 5000,
        goal: 'other',
      });
      const comparison = compareTwinResults(baseline, scenario);
      const savingsRate = comparison.metrics.find(
        (item) => item.key === 'savingsRatePct'
      );

      assert.equal(savingsRate.baseline, null);
      assert.equal(savingsRate.scenario, 80);
      assert.equal(savingsRate.difference, null);
      assert.equal(savingsRate.percentageChange, null);
      assert.equal(savingsRate.percentagePointDifference, null);
    });

    it('compares goal timelines and completion-date direction', () => {
      const baseline = calculateTwin({
        ...BASE,
        monthlySavingsCapacity: 5000,
        targetAmount: 100000,
      });
      const scenario = calculateTwin({
        ...BASE,
        monthlySavingsCapacity: 10000,
        targetAmount: 100000,
      });
      const comparison = compareTwinResults(baseline, scenario);

      assert.equal(comparison.goalProjection.estimatedMonths.baseline, 20);
      assert.equal(comparison.goalProjection.estimatedMonths.scenario, 10);
      assert.equal(comparison.goalProjection.estimatedMonths.difference, -10);
      assert.equal(comparison.goalProjection.completionDate.direction, 'earlier');
    });

    it('reports added and resolved recommendations', () => {
      const baseline = calculateTwin({
        monthlyIncome: 30000,
        monthlyExpenses: 40000,
        accessibleSavings: 50000,
        goal: 'other',
      });
      const scenario = calculateTwin({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 500000,
        goal: 'other',
      });
      const comparison = compareTwinResults(baseline, scenario);

      assert.deepEqual(comparison.recommendations.added, []);
      const resolvedIds = comparison.recommendations.resolved.map(
        (item) => item.id
      );
      assert.ok(resolvedIds.includes('deficit'));
      assert.ok(resolvedIds.includes('low_mandatory_coverage'));
    });

    it('requires both results', () => {
      assert.throws(() => compareTwinResults(null, {}), /baseline/i);
      assert.throws(
        () => compareTwinResults({ metrics: {} }, null),
        /scenario/i
      );
    });
  });

  describe('preview building', () => {
    it('calculates baseline and scenario independently without mutating baseline', () => {
      const baseline = { ...BASE };
      const snapshot = JSON.parse(JSON.stringify(baseline));
      const preview = buildTwinPreview({
        baseline,
        scenario: {
          monthlyIncome: 150000,
          monthlyExpenses: 60000,
          accessibleSavings: 300000,
          unexpectedExpense: 25000,
        },
        asOfDate: '2026-10-27',
      });

      assert.deepEqual(baseline, snapshot);
      assert.equal(preview.baseline.metrics.monthlySurplus, 60000);
      assert.equal(preview.scenario.metrics.monthlySurplus, 90000);
      assert.equal(preview.scenario.metrics.unexpectedExpense, 25000);
      assert.equal(preview.baseline.metrics.unexpectedExpense, 0);
      assert.equal(preview.comparison.metrics.find((m) => m.key === 'monthlySurplus').difference, 30000);
    });

    it('defaults the scenario to an unchanged copy of the baseline', () => {
      const preview = buildTwinPreview({
        baseline: BASE,
        asOfDate: '2026-10-27',
      });

      assert.deepEqual(preview.baseline.metrics, preview.scenario.metrics);
      assert.equal(
        preview.comparison.metrics.find((m) => m.key === 'monthlySurplus')
          .difference,
        0
      );
    });
  });

  describe('validation', () => {
    it('requires a plain input object', () => {
      assert.throws(() => calculateTwin(null), /must be an object/);
      assert.throws(() => calculateTwin([]), /must be an object/);
    });

    it('requires income, expenses, savings, and goal', () => {
      assert.throws(() => calculateTwin({}), /Monthly income is required/);
      assert.throws(
        () => calculateTwin({ monthlyIncome: 1 }),
        /Monthly expenses is required/
      );
      assert.throws(
        () => calculateTwin({ monthlyIncome: 1, monthlyExpenses: 1 }),
        /Accessible savings is required/
      );
      assert.throws(
        () =>
          calculateTwin({
            monthlyIncome: 1,
            monthlyExpenses: 1,
            accessibleSavings: 1,
          }),
        /Financial goal is required/
      );
    });

    it('rejects negative and non-finite monetary values', () => {
      assert.throws(
        () => calculateTwin({ ...BASE, monthlyIncome: -1 }),
        /Monthly income must be zero or greater/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, monthlyExpenses: NaN }),
        /Monthly expenses must be a valid number/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, accessibleSavings: Infinity }),
        /Accessible savings must be a valid number/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, unexpectedExpense: -1 }),
        /Unexpected one-time expense must be zero or greater/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, emiPayments: 'not-a-number' }),
        /EMI payments must be a valid number/
      );
    });

    it('rejects invalid optional fields instead of replacing them with zero', () => {
      assert.throws(
        () => calculateTwin({ ...BASE, emiIncludedInExpenses: 'yes' }),
        /emiIncludedInExpenses must be a boolean/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, targetAmount: 0 }),
        /Goal target amount must be greater than zero/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, goalTimelineMonths: 12.5 }),
        /Goal timeline in months must be a whole number/
      );
      assert.throws(
        () => calculateTwin({ ...BASE, goalTimelineMonths: 0 }),
        /Goal timeline in months must be greater than zero/
      );
    });

    it('rejects invalid as-of dates', () => {
      assert.throws(
        () => calculateTwin(BASE, { asOfDate: '2026-02-30' }),
        /not a valid calendar date/
      );
      assert.throws(
        () => calculateTwin(BASE, { asOfDate: '27-10-2026' }),
        /YYYY-MM-DD/
      );
    });

    it('validates configurable thresholds', () => {
      assert.equal(
        normalizeTwinThresholds({}).lowMandatoryCoverageMonths,
        DEFAULT_TWIN_THRESHOLDS.lowMandatoryCoverageMonths
      );
      assert.throws(
        () => normalizeTwinThresholds({ lowMandatoryCoverageMonths: 0 }),
        /must be greater than zero/
      );
      assert.throws(
        () => normalizeTwinThresholds({ highEmiBurdenPct: -1 }),
        /must be greater than zero/
      );
      assert.throws(
        () => normalizeTwinThresholds({ highEmiBurdenPct: 'x' }),
        /must be a valid number/
      );
      assert.throws(() => normalizeTwinThresholds('x'), /must be an object/);
    });

    it('requires a baseline object for previews and a scenario object when provided', () => {
      assert.throws(() => buildTwinPreview({}), /Baseline input must be an object/);
      assert.throws(
        () => buildTwinPreview({ baseline: BASE, scenario: 'x' }),
        /Scenario input must be an object/
      );
    });
  });
});
