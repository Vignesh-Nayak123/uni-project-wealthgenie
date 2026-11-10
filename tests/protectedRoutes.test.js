import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Force the backend into its unconfigured-auth state for this test process.
// Empty strings count as explicitly set, so the loader will not overwrite them
// with values from backend/.env.
process.env.SUPABASE_URL = '';
process.env.SUPABASE_PUBLISHABLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';

describe('protected routes fail closed when auth is not configured', () => {
  let server;
  let baseUrl;

  before(async () => {
    const { createApp } = await import('../backend/src/app.js?protected-routes');
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

  for (const path of ['/api/profile', '/api/assessments', '/api/goals', '/api/scenarios']) {
    it(`GET ${path} returns 503 auth_not_configured`, async () => {
      const res = await fetch(`${baseUrl}${path}`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.code, 'auth_not_configured');
    });
  }

  it('POST /api/goals also requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/goals`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', targetAmount: 1000 }),
    });

    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'auth_not_configured');
  });

  it('POST /api/twin/preview also requires authentication', async () => {
    const res = await fetch(`${baseUrl}/api/twin/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        baseline: {
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 200000,
          goal: 'retirement',
        },
      }),
    });

    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.code, 'auth_not_configured');
  });

  it('keeps the public assessment calculation route available', async () => {
    const res = await fetch(`${baseUrl}/api/assessment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyIncome: 100000,
        monthlyExpenses: 40000,
        accessibleSavings: 200000,
        goal: 'retirement',
      }),
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.metrics.monthlySurplus, 60000);
  });
});
