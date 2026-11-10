import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('Financial Assessment API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const { createApp } = await import('../backend/src/app.js?assessment-api');
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('POST /api/assessment returns a calculated assessment', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: 'retirement',
        emiPayments: 10000,
        emiIncludedInExpenses: false,
        monthlySavingsCapacity: 15000,
        targetAmount: 300000,
        currentGoalSavings: 50000,
        goalTimelineMonths: 24,
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.metrics.monthlyOutflows, 50000);
    assert.equal(body.metrics.monthlySurplus, 50000);
    assert.equal(body.goalProjection.estimatedMonths, 17);
    assert.match(body.disclaimer, /Educational financial information only/);
  });

  it('POST /api/assessment returns 400 for missing required fields', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyIncome: 50000 }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Monthly expenses is required/);
  });

  it('POST /api/assessment returns 400 for an invalid goal', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyIncome: 50000,
        monthlyExpenses: 20000,
        accessibleSavings: 100000,
        goal: 'not-a-real-goal',
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Unsupported financial goal/);
  });

  it('POST /api/assessment returns 400 for a zero goal target', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyIncome: 50000,
        monthlyExpenses: 20000,
        accessibleSavings: 100000,
        goal: 'other',
        targetAmount: 0,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Goal target amount must be greater than zero/);
  });

  it('POST /api/assessment returns 400 for a fractional goal timeline', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyIncome: 50000,
        monthlyExpenses: 20000,
        accessibleSavings: 100000,
        goal: 'other',
        targetAmount: 100000,
        goalTimelineMonths: 12.5,
      }),
    });

    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Goal timeline in months must be a whole number/);
  });
});
