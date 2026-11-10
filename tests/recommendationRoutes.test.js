// Deterministic test setup: keep the narrator in its unconfigured fallback so
// route tests never trigger a real Gemini call round-trip. This must happen
// before env.js loads .env, so the route module is imported dynamically below.
process.env.GEMINI_API_KEY = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const requireFromBackend = createRequire(
  new URL('../backend/package.json', import.meta.url)
);
const express = requireFromBackend('express');

const { createRecommendationsRouter } = await import(
  '../backend/src/routes/recommendations.routes.js'
);

const USER_ID = '22222222-2222-4222-8222-222222222222';

function createFakeClient(responder) {
  const calls = [];

  return {
    calls,
    from(table) {
      const state = { table, method: null, filters: [], columns: null, order: null };
      const builder = {
        select(columns) {
          state.method = state.method || 'select';
          state.columns = columns;
          return builder;
        },
        order(column) {
          state.order = { column };
          return builder;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return builder;
        },
        then(resolve, reject) {
          calls.push(state);
          return Promise.resolve(responder(state)).then(resolve, reject);
        },
      };
      return builder;
    },
  };
}

function goalsResponder(state) {
  if (state.table === 'financial_goals' && state.method === 'select') {
    return {
      data: [
        {
          title: 'Retirement corpus',
          category: 'Retirement',
          target_amount: '5000000',
          target_date: '2046-01-01',
        },
      ],
      error: null,
    };
  }
  return { data: [], error: null };
}

function failingGoalsResponder() {
  return { data: null, error: { message: 'RLS violation', code: '42501' } };
}

const GOOD_PROFILE = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  emiPayments: 10000,
  emiIncludedInExpenses: true,
  accessibleSavings: 600000,
  incomeStability: 'stable',
  riskTolerance: 4,
  investmentHorizonMonths: 180,
  liquidityNeedMonths: 3,
};

async function withServer(client, run, { requireAuth } = {}) {
  const app = express();
  app.use(express.json());

  const injectUser = (req, res, next) => {
    req.user = { id: USER_ID, email: 'user@example.com' };
    req.supabase = client;
    next();
  };

  app.use(
    '/api/recommendations',
    createRecommendationsRouter({ requireAuth: requireAuth || injectUser })
  );

  const server = app.listen(0);
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe('POST /api/recommendations authorization', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const client = createFakeClient(goalsResponder);

    await withServer(
      client,
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: GOOD_PROFILE }),
        });
        assert.equal(res.status, 401);
        const body = await res.json();
        assert.match(body.error, /sign in/i);
        // Nothing may be computed on behalf of an unknown user.
        assert.equal(client.calls.length, 0);
      },
      {
        requireAuth: (req, res, next) => {
          if (!req.headers.authorization) {
            return res.status(401).json({ error: 'Sign in to use personalized guidance.' });
          }
          next();
        },
      }
    );
  });
});

describe('POST /api/recommendations happy path', () => {
  it('returns readiness, ranked categories, exclusions and a disclaimer', async () => {
    const client = createFakeClient(goalsResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: GOOD_PROFILE }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();

      assert.equal(body.success, true);
      assert.equal(body.engineVersion, '1.0.0');
      // Payload contract: profileSummary exposes the risk label + readiness state.
      assert.ok(typeof body.profileSummary.riskProfile === 'string');
      assert.ok(['ready', 'cautious', 'invest-later'].includes(body.profileSummary.readinessStatus));
      // EMI sits inside expenses, so surplus is not double-counted: 100000-40000.
      assert.equal(body.readiness.core.monthlySurplus, 60000);
      assert.equal(body.readiness.debtBurdenPct, 10);
      assert.ok(body.readiness.riskCapacity.level >= 1 && body.readiness.riskCapacity.level <= 5);

      const ranked = body.categoryRecommendations.map((r) => r.score);
      assert.deepEqual(
        ranked,
        [...ranked].sort((a, b) => b - a),
        'ranking must be sorted by score descending'
      );
      assert.ok(body.categoryRecommendations.every((r) => r.scoreBreakdown && r.reasons && r.risks));
      // Fund-stage meta block always answers explicitly where the data came from.
      assert.ok(['connected', 'unavailable'].includes(body.funds.status));
      assert.ok(Array.isArray(body.recommendations));
      for (const fund of body.recommendations) {
        assert.ok(fund.schemeCode && fund.schemeName);
        assert.ok(fund.scoreBreakdown && fund.reasons);
        assert.ok(Array.isArray(fund.riskWarnings));
        assert.ok(fund.historicalMetrics, 'historical metrics must always be present');
      }

      assert.ok(Array.isArray(body.excluded));
      assert.ok(body.excluded.every((e) => typeof e.reason === 'string' && e.reason.length > 0));
      assert.ok(Array.isArray(body.priorities));
      assert.ok(typeof body.disclaimer === 'string');
      // Saved goals must be loaded through the RLS-scoped caller client.
      const goalsCall = client.calls.find((c) => c.table === 'financial_goals');
      assert.ok(goalsCall, 'the route must reuse saved goals via req.supabase');
      // Deterministic explanation is always present.
      assert.equal(body.explanation.source, 'deterministic');
      assert.ok(body.explanation.text.length > 0);
      assert.equal(body.explanation.generative.source, 'unconfigured');
      // Retirement goal (2046) feeds goal alignment.
      const retirementEntry = body.categoryRecommendations.find((r) => r.categoryId === 'retirement-oriented');
      if (retirementEntry) {
        assert.ok(retirementEntry.scoreBreakdown.goalAlignment.factor >= 0.5);
      }
    });
  });

  it('degrades gracefully when saved goals cannot be loaded', async () => {
    const client = createFakeClient(failingGoalsResponder);

    await withServer(client, async (baseUrl) => {
      // A saved-goal load failure must degrade into a note, never a 500.
      const res = await fetch(`${baseUrl}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...GOOD_PROFILE, goals: [] } }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.notes.some((n) => /Saved goals could not be loaded/i.test(n)));
      assert.ok(
        body.categoryRecommendations.length > 0 ||
        body.outcome.status === 'no-suitable-investment-now'
      );
    });
  });

  it('rejects an invalid profile with a readable 400', async () => {
    const client = createFakeClient(goalsResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { ...GOOD_PROFILE, monthlyIncome: -500 } }),
      });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /Monthly income must be zero or greater/);
      assert.equal(client.calls.length, 0, 'a rejected profile must not touch the database');
    });
  });

  it('accepts missing profile fields and reports them instead of failing', async () => {
    const client = createFakeClient(goalsResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: { monthlyIncome: 60000 } }),
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      const missingFields = body.missingMaterial.map((m) => m.field);
      assert.ok(missingFields.includes('Monthly expenses'));
      assert.ok(missingFields.includes('Risk tolerance'));
      // Market-risk categories stay excluded while coverage is unknown.
      assert.ok(body.excluded.some((e) => e.categoryId === 'equity-index-fund'));
    });
  });
});

