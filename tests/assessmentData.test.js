import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessmentInsertRow,
  mapAssessmentRow,
} from '../backend/src/utils/assessmentData.js';

function sampleAssessment() {
  return {
    assessmentVersion: '1.0.0',
    goal: 'retirement',
    metrics: {
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 200000,
      emiPayments: 10000,
      emiIncludedInExpenses: false,
      monthlySavingsCapacity: 15000,
    },
    goalProjection: {
      targetAmount: 300000,
      currentGoalSavings: 50000,
      requestedTimelineMonths: 24,
    },
  };
}

describe('assessment row mapping', () => {
  it('derives user_id from the verified identity, not the request body', () => {
    const row = assessmentInsertRow(
      {
        user_id: 'attacker-controlled-id',
        currentGoalSavings: 999,
      },
      sampleAssessment(),
      'verified-user-id'
    );

    assert.equal(row.user_id, 'verified-user-id');
    assert.notEqual(row.user_id, 'attacker-controlled-id');
  });

  it('maps assessment metrics into typed columns and keeps the full result', () => {
    const assessment = sampleAssessment();
    const row = assessmentInsertRow({}, assessment, 'verified-user-id');

    assert.equal(row.assessment_version, '1.0.0');
    assert.equal(row.goal, 'retirement');
    assert.equal(row.monthly_income, 100000);
    assert.equal(row.monthly_expenses, 40000);
    assert.equal(row.accessible_savings, 200000);
    assert.equal(row.emi_payments, 10000);
    assert.equal(row.emi_included_in_expenses, false);
    assert.equal(row.monthly_savings_capacity, 15000);
    assert.equal(row.target_amount, 300000);
    assert.equal(row.current_goal_savings, 50000);
    assert.equal(row.goal_timeline_months, 24);
    assert.deepEqual(row.result, assessment);
  });

  it('normalises the raw current goal savings fallback', () => {
    const assessment = { ...sampleAssessment(), goalProjection: null };

    const blank = assessmentInsertRow(
      { currentGoalSavings: '' },
      assessment,
      'verified-user-id'
    );
    const numericString = assessmentInsertRow(
      { currentGoalSavings: '50000' },
      assessment,
      'verified-user-id'
    );

    assert.equal(blank.current_goal_savings, 0);
    assert.equal(blank.target_amount, null);
    assert.equal(blank.goal_timeline_months, null);
    assert.equal(numericString.current_goal_savings, 50000);
  });

  it('maps a database row back to the API shape', () => {
    const mapped = mapAssessmentRow({
      id: 'assessment-1',
      goal: 'retirement',
      assessment_version: '1.0.0',
      monthly_income: '100000.00',
      monthly_expenses: '40000.00',
      accessible_savings: '200000.00',
      emi_payments: '10000.00',
      emi_included_in_expenses: false,
      monthly_savings_capacity: '15000.00',
      target_amount: '300000.00',
      current_goal_savings: '50000.00',
      goal_timeline_months: 24,
      result: sampleAssessment(),
      created_at: '2026-10-27T09:00:00.000Z',
    });

    assert.equal(mapped.id, 'assessment-1');
    assert.equal(mapped.assessmentVersion, '1.0.0');
    assert.equal(mapped.inputs.monthlyIncome, 100000);
    assert.equal(mapped.inputs.monthlyExpenses, 40000);
    assert.equal(mapped.inputs.accessibleSavings, 200000);
    assert.equal(mapped.inputs.emiPayments, 10000);
    assert.equal(mapped.inputs.targetAmount, 300000);
    assert.equal(mapped.inputs.goalTimelineMonths, 24);
    assert.equal(mapped.result.goal, 'retirement');
  });

  it('keeps null optional numeric columns as null', () => {
    const mapped = mapAssessmentRow({
      id: 'assessment-2',
      goal: 'other',
      assessment_version: '1.0.0',
      monthly_income: '0.00',
      monthly_expenses: '0.00',
      accessible_savings: '0.00',
      emi_payments: '0.00',
      emi_included_in_expenses: true,
      monthly_savings_capacity: null,
      target_amount: null,
      current_goal_savings: '0.00',
      goal_timeline_months: null,
      result: { goal: 'other' },
      created_at: '2026-10-27T09:00:00.000Z',
    });

    assert.equal(mapped.inputs.monthlySavingsCapacity, null);
    assert.equal(mapped.inputs.targetAmount, null);
    assert.equal(mapped.inputs.goalTimelineMonths, null);
  });
});
