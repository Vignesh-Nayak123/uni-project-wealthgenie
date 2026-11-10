import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRIBUTION_TIMING,
  EMERGENCY_COVERAGE_THRESHOLD_MONTHS,
  annualToMonthlyRate,
  applyDownside,
  buildDownsideScenarios,
  buildInvestmentWarnings,
  buildReturnScenarios,
  extractPlannerSnapshot,
  futureValue,
  goalFundingComparison,
  suggestedMonthlyContribution,
} from '../frontend/src/utils/investmentProjection.js';

function close(actual, expected, tolerance = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

describe('Investment projection', () => {
  describe('annualToMonthlyRate', () => {
    it('converts an effective annual return into an effective monthly rate', () => {
      const rate = annualToMonthlyRate(12);
      close(rate, 0.009488792934583046);
      close(Math.pow(1 + rate, 12), 1.12);
    });

    it('returns zero for a zero annual return', () => {
      assert.equal(annualToMonthlyRate(0), 0);
    });

    it('rejects invalid annual returns', () => {
      assert.throws(() => annualToMonthlyRate(-100), /greater than -100/);
      assert.throws(() => annualToMonthlyRate(Number.NaN), /finite/);
    });
  });

  describe('futureValue', () => {
    it('uses the ordinary-annuity formula with end-of-month contributions', () => {
      const result = futureValue({
        monthlyContribution: 5000,
        annualReturnPct: 12,
        months: 12,
      });

      close(result.futureValue, 63232.48954176594);
      assert.equal(result.totalContributions, 60000);
      close(result.gain, 3232.48954176594);
      assert.equal(result.months, 12);
      assert.equal(result.contributionTiming, CONTRIBUTION_TIMING);
      assert.equal(CONTRIBUTION_TIMING, 'end_of_month');
    });

    it('returns contributions unchanged when the assumed return is zero', () => {
      const result = futureValue({
        monthlyContribution: 5000,
        annualReturnPct: 0,
        months: 12,
      });

      assert.equal(result.monthlyRate, 0);
      assert.equal(result.futureValue, 60000);
      assert.equal(result.totalContributions, 60000);
      assert.equal(result.gain, 0);
    });

    it('does not add a return to a single end-of-month contribution', () => {
      const result = futureValue({
        monthlyContribution: 1000,
        annualReturnPct: 12,
        months: 1,
      });

      assert.equal(result.futureValue, 1000);
      assert.equal(result.gain, 0);
    });

    it('matches an independently calculated ten-year projection', () => {
      const result = futureValue({
        monthlyContribution: 10000,
        annualReturnPct: 8,
        months: 120,
      });

      close(result.futureValue, 1801242.731940156, 1e-6);
      assert.equal(result.totalContributions, 1200000);
    });

    it('handles zero months and zero contributions', () => {
      assert.equal(
        futureValue({
          monthlyContribution: 5000,
          annualReturnPct: 12,
          months: 0,
        }).futureValue,
        0
      );
      assert.equal(
        futureValue({
          monthlyContribution: 0,
          annualReturnPct: 12,
          months: 12,
        }).futureValue,
        0
      );
    });

    it('rejects invalid inputs', () => {
      assert.throws(
        () =>
          futureValue({
            monthlyContribution: -1,
            annualReturnPct: 12,
            months: 12,
          }),
        /zero or greater/
      );
      assert.throws(
        () =>
          futureValue({
            monthlyContribution: 5000,
            annualReturnPct: 12,
            months: 1.5,
          }),
        /whole number/
      );
      assert.throws(
        () =>
          futureValue({
            monthlyContribution: 5000,
            annualReturnPct: 12,
            months: -1,
          }),
        /zero or greater/
      );
      assert.throws(
        () =>
          futureValue({
            monthlyContribution: 5000,
            annualReturnPct: Number.NaN,
            months: 12,
          }),
        /finite/
      );
      assert.throws(
        () =>
          futureValue({
            monthlyContribution: 5000,
            annualReturnPct: -100,
            months: 12,
          }),
        /greater than -100/
      );
    });
  });

  describe('applyDownside', () => {
    it('applies a single decline to the projected value', () => {
      const result = applyDownside({
        projectedValue: 100000,
        declinePct: 20,
      });

      assert.equal(result.downsideValue, 80000);
      assert.equal(result.loss, 20000);
      assert.equal(result.lossPct, 20);
    });

    it('handles zero and total declines', () => {
      assert.equal(
        applyDownside({ projectedValue: 100000, declinePct: 0 })
          .downsideValue,
        100000
      );
      assert.equal(
        applyDownside({ projectedValue: 100000, declinePct: 100 })
          .downsideValue,
        0
      );
    });

    it('rejects declines outside 0-100', () => {
      assert.throws(
        () => applyDownside({ projectedValue: 100000, declinePct: -1 }),
        /between 0 and 100/
      );
      assert.throws(
        () => applyDownside({ projectedValue: 100000, declinePct: 101 }),
        /between 0 and 100/
      );
    });
  });

  describe('extractPlannerSnapshot', () => {
    it('returns null when no assessment metrics exist', () => {
      assert.equal(extractPlannerSnapshot(null), null);
      assert.equal(extractPlannerSnapshot({}), null);
      assert.equal(extractPlannerSnapshot({ result: {} }), null);
    });

    it('extracts cash-flow, resilience, and goal data from an assessment', () => {
      const snapshot = extractPlannerSnapshot({
        id: 'assessment-1',
        createdAt: '2026-10-27T10:00:00.000Z',
        goal: 'retirement',
        result: {
          goal: 'retirement',
          metrics: {
            monthlyIncome: 100000,
            monthlyOutflows: 40000,
            monthlySurplus: 60000,
            accessibleSavings: 200000,
            emergencyFundCoverageMonths: 5,
            expenseCoverageMonths: 5,
            emiIncludedInExpenses: true,
          },
          goalProjection: {
            targetAmount: 300000,
            currentGoalSavings: 50000,
            remainingAmount: 250000,
            requestedTimelineMonths: 24,
            requiredMonthlyContributionForTimeline: 10417,
            assumedMonthlyContribution: 15000,
          },
        },
      });

      assert.equal(snapshot.assessmentId, 'assessment-1');
      assert.equal(snapshot.goal, 'retirement');
      assert.equal(snapshot.monthlyIncome, 100000);
      assert.equal(snapshot.monthlyOutflows, 40000);
      assert.equal(snapshot.monthlySurplus, 60000);
      assert.equal(snapshot.accessibleSavings, 200000);
      assert.equal(snapshot.emergencyCoverageMonths, 5);
      assert.equal(snapshot.targetAmount, 300000);
      assert.equal(snapshot.currentGoalSavings, 50000);
      assert.equal(snapshot.remainingAmount, 250000);
      assert.equal(snapshot.goalTimelineMonths, 24);
      assert.equal(snapshot.requiredMonthlyContributionForTimeline, 10417);
    });

    it('falls back to expense coverage and handles a missing goal projection', () => {
      const snapshot = extractPlannerSnapshot({
        result: {
          metrics: {
            monthlyIncome: 50000,
            monthlyOutflows: 20000,
            monthlySurplus: 30000,
            accessibleSavings: 40000,
            expenseCoverageMonths: 2,
            emiIncludedInExpenses: false,
          },
        },
      });

      assert.equal(snapshot.emergencyCoverageMonths, 2);
      assert.equal(snapshot.targetAmount, null);
      assert.equal(snapshot.currentGoalSavings, 0);
      assert.equal(snapshot.goalTimelineMonths, null);
      assert.equal(snapshot.emiIncludedInExpenses, false);
    });

    it('preserves unavailable metrics as null instead of inventing zero', () => {
      const snapshot = extractPlannerSnapshot({
        result: {
          metrics: {
            monthlyIncome: 50000,
            monthlyOutflows: 20000,
            monthlySurplus: null,
            accessibleSavings: undefined,
            emergencyFundCoverageMonths: null,
            emiIncludedInExpenses: true,
          },
        },
      });

      assert.equal(snapshot.monthlySurplus, null);
      assert.equal(snapshot.accessibleSavings, null);
      assert.equal(snapshot.emergencyCoverageMonths, null);
    });
  });

  describe('buildInvestmentWarnings', () => {
    it('warns when the contribution exceeds the monthly surplus', () => {
      const warnings = buildInvestmentWarnings({
        monthlyContribution: 20000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: 5,
      });

      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].id, 'contribution_exceeds_surplus');
      assert.equal(warnings[0].severity, 'critical');
      assert.match(warnings[0].message, /exceeds/);
    });

    it('warns when the contribution uses the entire surplus', () => {
      const warnings = buildInvestmentWarnings({
        monthlyContribution: 15000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: 5,
      });

      assert.equal(warnings.length, 1);
      assert.equal(warnings[0].id, 'full_surplus');
      assert.equal(warnings[0].severity, 'warning');
    });

    it('warns when there is no positive surplus', () => {
      const zero = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: 0,
        emergencyCoverageMonths: 5,
      });
      const negative = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: -10000,
        emergencyCoverageMonths: 5,
      });

      assert.equal(zero[0].id, 'no_surplus');
      assert.equal(negative[0].id, 'no_surplus');
    });

    it('warns below the emergency-coverage threshold and not at it', () => {
      const below = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: 2,
      });
      const at = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: EMERGENCY_COVERAGE_THRESHOLD_MONTHS,
      });

      assert.ok(
        below.some((warning) => warning.id === 'low_emergency_coverage')
      );
      assert.equal(at.length, 0);
      assert.equal(EMERGENCY_COVERAGE_THRESHOLD_MONTHS, 3);
    });

    it('does not invent a coverage warning when coverage is unavailable', () => {
      const warnings = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: null,
      });

      assert.equal(warnings.length, 0);
    });

    it('does not invent a surplus warning when surplus is unavailable', () => {
      const missing = buildInvestmentWarnings({
        monthlyContribution: 5000,
        monthlySurplus: null,
        emergencyCoverageMonths: 5,
      });
      const undefinedSurplus = buildInvestmentWarnings({
        monthlyContribution: 5000,
        emergencyCoverageMonths: 5,
      });

      assert.equal(missing.length, 0);
      assert.equal(undefinedSurplus.length, 0);
    });

    it('can report a surplus conflict and low coverage together', () => {
      const warnings = buildInvestmentWarnings({
        monthlyContribution: 20000,
        monthlySurplus: 15000,
        emergencyCoverageMonths: 1,
      });

      assert.equal(warnings.length, 2);
      assert.deepEqual(
        warnings.map((warning) => warning.id),
        ['contribution_exceeds_surplus', 'low_emergency_coverage']
      );
    });

    it('does not warn about zero contribution with no surplus', () => {
      assert.equal(
        buildInvestmentWarnings({
          monthlyContribution: 0,
          monthlySurplus: 0,
          emergencyCoverageMonths: 5,
        }).length,
        0
      );
    });
  });

  describe('goalFundingComparison', () => {
    it('compares current goal savings plus the projected corpus at the goal timeline', () => {
      const result = goalFundingComparison({
        targetAmount: 100000,
        currentGoalSavings: 20000,
        monthlyContribution: 5000,
        annualReturnPct: 0,
        goalTimelineMonths: 12,
        plannerHorizonMonths: 120,
      });

      assert.equal(result.monthsUsed, 12);
      assert.equal(result.horizonSource, 'goal_timeline');
      assert.equal(result.projectedFutureValue, 60000);
      assert.equal(result.projectedFunding, 80000);
      assert.equal(result.gap, 20000);
      assert.equal(result.surplus, 0);
      assert.equal(result.coveragePct, 80);
    });

    it('falls back to the planner horizon when no goal timeline exists', () => {
      const result = goalFundingComparison({
        targetAmount: 100000,
        currentGoalSavings: 20000,
        monthlyContribution: 5000,
        annualReturnPct: 0,
        goalTimelineMonths: null,
        plannerHorizonMonths: 24,
      });

      assert.equal(result.monthsUsed, 24);
      assert.equal(result.horizonSource, 'planner_horizon');
      assert.equal(result.projectedFutureValue, 120000);
      assert.equal(result.gap, 0);
      assert.equal(result.surplus, 40000);
      assert.equal(result.coveragePct, 100);
    });

    it('handles a goal that is already funded', () => {
      const result = goalFundingComparison({
        targetAmount: 50000,
        currentGoalSavings: 60000,
        monthlyContribution: 5000,
        annualReturnPct: 0,
        goalTimelineMonths: 12,
        plannerHorizonMonths: 12,
      });

      assert.equal(result.remainingAmount, 0);
      assert.equal(result.gap, 0);
      assert.equal(result.surplus, 70000);
    });

    it('returns null without a positive target', () => {
      assert.equal(
        goalFundingComparison({
          targetAmount: null,
          monthlyContribution: 5000,
          annualReturnPct: 8,
          plannerHorizonMonths: 12,
        }),
        null
      );
      assert.equal(
        goalFundingComparison({
          targetAmount: 0,
          monthlyContribution: 5000,
          annualReturnPct: 8,
          plannerHorizonMonths: 12,
        }),
        null
      );
    });

    it('applies a hypothetical decline before comparing with the goal', () => {
      const result = goalFundingComparison({
        targetAmount: 100000,
        currentGoalSavings: 20000,
        monthlyContribution: 5000,
        annualReturnPct: 0,
        goalTimelineMonths: 12,
        plannerHorizonMonths: 12,
        declinePct: 20,
      });

      assert.equal(result.projectedFutureValueBeforeDecline, 60000);
      assert.equal(result.projectedFutureValue, 48000);
      assert.equal(result.projectedFunding, 68000);
      assert.equal(result.gap, 32000);
      assert.equal(result.coveragePct, 68);
    });

    it('keeps the end-of-month convention at a one-month goal horizon', () => {
      const result = goalFundingComparison({
        targetAmount: 100000,
        currentGoalSavings: 0,
        monthlyContribution: 1000,
        annualReturnPct: 12,
        goalTimelineMonths: 1,
        plannerHorizonMonths: 12,
      });

      assert.equal(result.projectedFutureValue, 1000);
    });
  });

  describe('suggestedMonthlyContribution', () => {
    it('starts at half the surplus, capped and rounded conservatively', () => {
      assert.equal(suggestedMonthlyContribution(30000), 5000);
      assert.equal(suggestedMonthlyContribution(8000), 4000);
      assert.equal(suggestedMonthlyContribution(600), 300);
      assert.equal(suggestedMonthlyContribution(100), 0);
    });

    it('returns zero without a positive surplus', () => {
      assert.equal(suggestedMonthlyContribution(0), 0);
      assert.equal(suggestedMonthlyContribution(-100), 0);
      assert.equal(suggestedMonthlyContribution(Number.NaN), 0);
    });
  });

  describe('scenario rows', () => {
    it('builds no-growth, lower, and user return assumptions', () => {
      const rows = buildReturnScenarios({
        monthlyContribution: 5000,
        annualReturnPct: 12,
        months: 12,
      });

      assert.deepEqual(
        rows.map((row) => row.annualReturnPct),
        [0, 8, 12]
      );
      assert.equal(rows[0].futureValue, 60000);
      close(rows[1].futureValue, 62169.432402576196);
      close(rows[2].futureValue, 63232.48954176594);
    });

    it('removes duplicate return assumptions', () => {
      const rows = buildReturnScenarios({
        monthlyContribution: 5000,
        annualReturnPct: 0,
        months: 12,
      });

      assert.deepEqual(
        rows.map((row) => row.annualReturnPct),
        [0]
      );
    });

    it('builds 10/20/30 and custom decline rows without duplicates', () => {
      const standard = buildDownsideScenarios({
        projectedValue: 100000,
        selectedDeclinePct: 20,
      });
      const custom = buildDownsideScenarios({
        projectedValue: 100000,
        selectedDeclinePct: 15,
      });

      assert.deepEqual(
        standard.map((row) => row.declinePct),
        [10, 20, 30]
      );
      assert.equal(standard[0].downsideValue, 90000);
      assert.equal(standard[1].downsideValue, 80000);
      assert.equal(standard[2].downsideValue, 70000);
      assert.deepEqual(
        custom.map((row) => row.declinePct),
        [10, 15, 20, 30]
      );
    });
  });
});
