import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  goalInsertRow,
  goalUpdateRow,
  mapGoalRow,
  validateGoalCreate,
  validateGoalUpdate,
} from '../backend/src/utils/goals.js';

describe('goal validation', () => {
  it('accepts a valid goal and normalises fields', () => {
    const goal = validateGoalCreate({
      title: '  Emergency fund  ',
      category: 'security',
      targetAmount: '300000',
      currentAmount: '50000',
      targetDate: '2027-12-31',
      description: '  Six months of expenses  ',
    });

    assert.equal(goal.title, 'Emergency fund');
    assert.equal(goal.category, 'Security');
    assert.equal(goal.targetAmount, 300000);
    assert.equal(goal.currentAmount, 50000);
    assert.equal(goal.targetDate, '2027-12-31');
    assert.equal(goal.description, 'Six months of expenses');
  });

  it('defaults current amount to zero and category to Other', () => {
    const goal = validateGoalCreate({
      title: 'Travel',
      targetAmount: 45000,
    });

    assert.equal(goal.currentAmount, 0);
    assert.equal(goal.category, 'Other');
    assert.equal(goal.targetDate, null);
    assert.equal(goal.description, null);
  });

  it('rejects a missing title', () => {
    assert.throws(
      () => validateGoalCreate({ title: '   ', targetAmount: 1000 }),
      /Goal title is required/
    );
  });

  it('rejects an unsupported category', () => {
    assert.throws(
      () =>
        validateGoalCreate({
          title: 'Goal',
          category: 'Yacht',
          targetAmount: 1000,
        }),
      /Goal category must be one of/
    );
  });

  it('rejects a non-positive target amount', () => {
    assert.throws(
      () => validateGoalCreate({ title: 'Goal', targetAmount: 0 }),
      /Target amount must be greater than zero/
    );
  });

  it('rejects a negative current amount', () => {
    assert.throws(
      () =>
        validateGoalCreate({
          title: 'Goal',
          targetAmount: 1000,
          currentAmount: -1,
        }),
      /Current amount must be zero or greater/
    );
  });

  it('rejects an invalid calendar date', () => {
    assert.throws(
      () =>
        validateGoalCreate({
          title: 'Goal',
          targetAmount: 1000,
          targetDate: '2027-02-31',
        }),
      /not a valid calendar date/
    );
  });

  it('rejects a date in the wrong format', () => {
    assert.throws(
      () =>
        validateGoalCreate({
          title: 'Goal',
          targetAmount: 1000,
          targetDate: '31/12/2027',
        }),
      /YYYY-MM-DD/
    );
  });

  it('requires at least one field for updates', () => {
    assert.throws(() => validateGoalUpdate({}), /at least one goal field/);
  });

  it('supports partial updates', () => {
    const updates = validateGoalUpdate({ currentAmount: 75000 });
    assert.deepEqual(updates, { currentAmount: 75000 });
  });
});

describe('goal row mapping', () => {
  it('uses the verified user id and ignores a browser-supplied user id', () => {
    const row = goalInsertRow(
      {
        title: 'Goal',
        category: 'Security',
        targetAmount: 1000,
        currentAmount: 0,
        targetDate: null,
        description: null,
        user_id: 'attacker-controlled-id',
      },
      'verified-user-id'
    );

    assert.equal(row.user_id, 'verified-user-id');
    assert.notEqual(row.user_id, 'attacker-controlled-id');
  });

  it('maps snake_case update fields', () => {
    const row = goalUpdateRow({
      title: 'New title',
      targetAmount: 2500,
      currentAmount: 500,
      targetDate: '2028-01-01',
      description: null,
    });

    assert.deepEqual(row, {
      title: 'New title',
      target_amount: 2500,
      current_amount: 500,
      target_date: '2028-01-01',
      description: null,
    });
  });

  it('maps a database row to the API shape', () => {
    const mapped = mapGoalRow({
      id: 'goal-1',
      title: 'Emergency fund',
      category: 'Security',
      target_amount: '300000.00',
      current_amount: '50000.00',
      target_date: '2027-12-31',
      description: null,
      created_at: '2026-10-27T09:00:00.000Z',
      updated_at: '2026-10-27T09:00:00.000Z',
    });

    assert.equal(mapped.id, 'goal-1');
    assert.equal(mapped.targetAmount, 300000);
    assert.equal(mapped.currentAmount, 50000);
    assert.equal(mapped.description, '');
    assert.equal(mapped.targetDate, '2027-12-31');
  });
});
