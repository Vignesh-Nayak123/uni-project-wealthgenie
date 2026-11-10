import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createGoalsRouter } from '../backend/src/routes/goals.routes.js';
import { createAssessmentsRouter } from '../backend/src/routes/assessments.routes.js';

const requireFromBackend = createRequire(
  new URL('../backend/package.json', import.meta.url)
);
const express = requireFromBackend('express');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const GOAL_ID = '22222222-2222-4222-8222-222222222222';
const ASSESSMENT_ID = '33333333-3333-4333-8333-333333333333';
const NOW = '2026-10-27T09:00:00.000Z';

function createFakeClient(responder) {
  const calls = [];

  return {
    calls,
    from(table) {
      const state = {
        table,
        method: null,
        filters: [],
        payload: null,
        columns: null,
        options: null,
        range: null,
        order: null,
      };

      const record = () => {
        calls.push(state);
      };

      const builder = {
        select(columns, options) {
          if (!state.method) state.method = 'select';
          state.columns = columns;
          state.options = options;
          return builder;
        },
        order(column, options) {
          state.order = { column, options };
          return builder;
        },
        range(from, to) {
          state.range = { from, to };
          return builder;
        },
        insert(payload) {
          state.method = 'insert';
          state.payload = payload;
          return builder;
        },
        update(payload) {
          state.method = 'update';
          state.payload = payload;
          return builder;
        },
        delete() {
          state.method = 'delete';
          return builder;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return builder;
        },
        single() {
          record();
          return Promise.resolve(responder(state));
        },
        maybeSingle() {
          record();
          return Promise.resolve(responder(state));
        },
        then(resolve, reject) {
          record();
          return Promise.resolve(responder(state)).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

function goalRow(overrides = {}) {
  return {
    id: GOAL_ID,
    title: 'Emergency fund',
    category: 'Security',
    target_amount: '300000.00',
    current_amount: '50000.00',
    target_date: null,
    description: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function assessmentRow(overrides = {}) {
  return {
    id: ASSESSMENT_ID,
    goal: 'retirement',
    assessment_version: '1.0.0',
    monthly_income: '100000.00',
    monthly_expenses: '40000.00',
    accessible_savings: '200000.00',
    emi_payments: '0.00',
    emi_included_in_expenses: true,
    monthly_savings_capacity: null,
    target_amount: null,
    current_goal_savings: '0.00',
    goal_timeline_months: null,
    result: { goal: 'retirement', metrics: { monthlySurplus: 60000 } },
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function defaultResponder(state) {
  if (state.method === 'select') {
    return { data: [], error: null, count: 0 };
  }

  if (state.method === 'insert') {
    return {
      data: {
        ...(state.table === 'financial_goals' ? goalRow() : assessmentRow()),
        ...state.payload,
      },
      error: null,
    };
  }

  if (state.method === 'update') {
    return { data: goalRow(state.payload), error: null };
  }

  if (state.method === 'delete') {
    return { data: [{ id: state.filters[0]?.[1] }], error: null };
  }

  return { data: null, error: null };
}

async function withServer(client, run) {
  const app = express();
  app.use(express.json());

  const injectUser = (req, res, next) => {
    req.user = { id: USER_ID, email: 'user@example.com' };
    req.supabase = client;
    next();
  };

  app.use('/api/goals', createGoalsRouter({ requireAuth: injectUser }));
  app.use(
    '/api/assessments',
    createAssessmentsRouter({ requireAuth: injectUser })
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

describe('goal route ownership', () => {
  it('derives the insert owner from the verified token, not the request body', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/goals`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Emergency fund',
          category: 'Security',
          targetAmount: 300000,
          currentAmount: 50000,
          user_id: 'attacker-controlled-id',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.goal.title, 'Emergency fund');

      const insertCall = client.calls.find((call) => call.method === 'insert');
      assert.ok(insertCall);
      assert.equal(insertCall.payload.user_id, USER_ID);
      assert.notEqual(insertCall.payload.user_id, 'attacker-controlled-id');
    });
  });

  it('scopes goal updates to both the goal id and the verified user id', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/goals/${GOAL_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentAmount: 75000 }),
      });

      assert.equal(res.status, 200);
      const updateCall = client.calls.find((call) => call.method === 'update');
      assert.ok(updateCall);
      assert.deepEqual(updateCall.filters, [
        ['id', GOAL_ID],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('scopes goal deletes to both the goal id and the verified user id', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/goals/${GOAL_ID}`, {
        method: 'DELETE',
      });

      assert.equal(res.status, 200);
      const deleteCall = client.calls.find((call) => call.method === 'delete');
      assert.ok(deleteCall);
      assert.deepEqual(deleteCall.filters, [
        ['id', GOAL_ID],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('returns 404 when an update matches no row owned by the user', async () => {
    const client = createFakeClient((state) => {
      if (state.method === 'update') return { data: null, error: null };
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/goals/${GOAL_ID}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentAmount: 75000 }),
      });

      assert.equal(res.status, 404);
    });
  });

  it('rejects malformed goal ids before touching the database', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/goals/not-a-uuid`, {
        method: 'DELETE',
      });

      assert.equal(res.status, 400);
      assert.equal(client.calls.length, 0);
    });
  });
});

describe('assessment route ownership', () => {
  it('derives the insert owner from the verified token, not the request body', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/assessments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyIncome: 100000,
          monthlyExpenses: 40000,
          accessibleSavings: 200000,
          goal: 'retirement',
          user_id: 'attacker-controlled-id',
        }),
      });

      assert.equal(res.status, 201);
      const insertCall = client.calls.find((call) => call.method === 'insert');
      assert.ok(insertCall);
      assert.equal(insertCall.payload.user_id, USER_ID);
      assert.notEqual(insertCall.payload.user_id, 'attacker-controlled-id');
      assert.equal(insertCall.payload.monthly_income, 100000);
      assert.equal(insertCall.payload.result.metrics.monthlySurplus, 60000);
    });
  });

  it('scopes assessment deletes to both the assessment id and the verified user id', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(
        `${baseUrl}/api/assessments/${ASSESSMENT_ID}`,
        { method: 'DELETE' }
      );

      assert.equal(res.status, 200);
      const deleteCall = client.calls.find((call) => call.method === 'delete');
      assert.ok(deleteCall);
      assert.deepEqual(deleteCall.filters, [
        ['id', ASSESSMENT_ID],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('applies pagination to assessment history queries', async () => {
    const client = createFakeClient((state) => {
      if (state.method === 'select') {
        return { data: [assessmentRow()], error: null, count: 1 };
      }
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/assessments?limit=5&offset=10`);

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.limit, 5);
      assert.equal(body.offset, 10);
      assert.equal(body.count, 1);
      assert.equal(body.assessments.length, 1);

      const selectCall = client.calls.find((call) => call.method === 'select');
      assert.ok(selectCall);
      assert.deepEqual(selectCall.range, { from: 10, to: 14 });
    });
  });
});
