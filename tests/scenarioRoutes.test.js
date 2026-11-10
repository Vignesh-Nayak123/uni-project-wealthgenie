import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createTwinRouter } from '../backend/src/routes/twin.routes.js';
import { createScenariosRouter } from '../backend/src/routes/scenarios.routes.js';

const requireFromBackend = createRequire(
  new URL('../backend/package.json', import.meta.url)
);
const express = requireFromBackend('express');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ASSESSMENT_ID = '33333333-3333-4333-8333-333333333333';
const SCENARIO_A = '44444444-4444-4444-8444-444444444444';
const SCENARIO_B = '55555555-5555-4555-8555-555555555555';
const NOW = '2026-10-27T09:00:00.000Z';

const BASELINE_INPUTS = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  accessibleSavings: 200000,
  goal: 'other',
  emiPayments: 0,
  emiIncludedInExpenses: true,
  unexpectedExpense: 0,
  monthlySavingsCapacity: null,
  targetAmount: null,
  currentGoalSavings: 0,
  goalTimelineMonths: null,
};

const SCENARIO_INPUTS = {
  ...BASELINE_INPUTS,
  monthlyExpenses: 50000,
  unexpectedExpense: 25000,
};

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

function scenarioRow(overrides = {}) {
  return {
    id: SCENARIO_A,
    user_id: USER_ID,
    name: 'Scenario A',
    baseline_assessment_id: null,
    baseline_inputs: BASELINE_INPUTS,
    scenario_inputs: SCENARIO_INPUTS,
    thresholds: {
      lowMandatoryCoverageMonths: 3,
      highEmiBurdenPct: 40,
    },
    as_of_date: '2026-10-27',
    result: { comparison: { metrics: [] } },
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function defaultResponder(state) {
  if (state.table === 'financial_assessments' && state.method === 'select') {
    return { data: { id: ASSESSMENT_ID }, error: null };
  }

  if (state.table === 'financial_scenarios' && state.method === 'select') {
    if (state.filters.length === 0) {
      return { data: [scenarioRow()], error: null };
    }
    return { data: scenarioRow(), error: null };
  }

  if (state.method === 'insert') {
    return {
      data: {
        ...scenarioRow(),
        ...state.payload,
        id: SCENARIO_A,
        created_at: NOW,
        updated_at: NOW,
      },
      error: null,
    };
  }

  if (state.method === 'update') {
    return {
      data: { ...scenarioRow(), ...state.payload, updated_at: NOW },
      error: null,
    };
  }

  if (state.method === 'delete') {
    return { data: [{ id: SCENARIO_A }], error: null };
  }

  return { data: null, error: null };
}

async function withServer(client, run, { requireAuth } = {}) {
  const app = express();
  app.use(express.json());

  const injectUser = (req, res, next) => {
    req.user = { id: USER_ID, email: 'user@example.com' };
    req.supabase = client;
    next();
  };

  app.use(
    '/api/twin',
    createTwinRouter({ requireAuth: requireAuth || injectUser })
  );
  app.use(
    '/api/scenarios',
    createScenariosRouter({ requireAuth: requireAuth || injectUser })
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

function createPayload(overrides = {}) {
  return {
    name: 'Test scenario',
    baseline: BASELINE_INPUTS,
    scenario: {
      monthlyExpenses: 50000,
      unexpectedExpense: 25000,
    },
    asOfDate: '2026-10-27',
    ...overrides,
  };
}

describe('Digital Twin preview route', () => {
  it('returns independent baseline and scenario results with a comparison', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/twin/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseline: BASELINE_INPUTS,
          scenario: {
            monthlyExpenses: 50000,
            unexpectedExpense: 25000,
          },
          asOfDate: '2026-10-27',
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.baseline.metrics.monthlySurplus, 60000);
      assert.equal(body.scenario.metrics.monthlySurplus, 50000);
      assert.equal(body.baseline.metrics.unexpectedExpense, 0);
      assert.equal(body.scenario.metrics.unexpectedExpense, 25000);
      const surplus = body.comparison.metrics.find(
        (item) => item.key === 'monthlySurplus'
      );
      assert.equal(surplus.difference, -10000);
      assert.match(body.estimateNotice, /not a prediction/i);
    });
  });

  it('rejects invalid monetary input with a 400', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/twin/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseline: { ...BASELINE_INPUTS, monthlyIncome: -1 },
        }),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /Monthly income must be zero or greater/);
    });
  });

  it('returns 401 when authentication is rejected', async () => {
    const client = createFakeClient(defaultResponder);
    const rejectAuth = (req, res) => {
      res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    };

    await withServer(
      client,
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/twin/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseline: BASELINE_INPUTS }),
        });

        assert.equal(res.status, 401);
      },
      { requireAuth: rejectAuth }
    );
  });
});

describe('saved scenario routes', () => {
  it('creates a scenario owned by the verified token, not the body', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...createPayload(),
          user_id: 'attacker-controlled-id',
        }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.scenario.name, 'Test scenario');

      const insertCall = client.calls.find((call) => call.method === 'insert');
      assert.ok(insertCall);
      assert.equal(insertCall.payload.user_id, USER_ID);
      assert.notEqual(insertCall.payload.user_id, 'attacker-controlled-id');
      assert.equal(
        insertCall.payload.baseline_inputs.monthlyIncome,
        100000
      );
      assert.equal(insertCall.payload.scenario_inputs.monthlyExpenses, 50000);
      assert.equal(insertCall.payload.scenario_inputs.unexpectedExpense, 25000);
      assert.ok(insertCall.payload.result.comparison);
    });
  });

  it('rejects an invalid scenario name before touching the database', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload({ name: '   ' })),
      });

      assert.equal(res.status, 400);
      assert.equal(client.calls.length, 0);
    });
  });

  it('rejects negative scenario inputs instead of storing zero', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          createPayload({ scenario: { accessibleSavings: -500 } })
        ),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /Accessible savings must be zero or greater/);
      assert.equal(client.calls.length, 0);
    });
  });

  it('accepts a baseline assessment only when the user owns it', async () => {
    const ownedClient = createFakeClient(defaultResponder);

    await withServer(ownedClient, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          createPayload({ baselineAssessmentId: ASSESSMENT_ID })
        ),
      });

      assert.equal(res.status, 201);
      const insertCall = ownedClient.calls.find(
        (call) => call.method === 'insert'
      );
      assert.equal(insertCall.payload.baseline_assessment_id, ASSESSMENT_ID);
    });

    const unownedClient = createFakeClient((state) => {
      if (
        state.table === 'financial_assessments' &&
        state.method === 'select'
      ) {
        return { data: null, error: null };
      }
      return defaultResponder(state);
    });

    await withServer(unownedClient, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          createPayload({ baselineAssessmentId: ASSESSMENT_ID })
        ),
      });

      assert.equal(res.status, 400);
      const body = await res.json();
      assert.match(body.error, /Baseline assessment not found/);
      assert.equal(
        unownedClient.calls.some((call) => call.method === 'insert'),
        false
      );
    });
  });

  it('lists scenarios ordered by most recently updated', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.scenarios.length, 1);
      assert.equal(body.scenarios[0].name, 'Scenario A');

      const selectCall = client.calls.find((call) => call.method === 'select');
      assert.deepEqual(selectCall.order, {
        column: 'updated_at',
        options: { ascending: false },
      });
    });
  });

  it('loads a single scenario scoped to the verified user', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`);
      assert.equal(res.status, 200);

      const selectCall = client.calls.find((call) => call.method === 'select');
      assert.deepEqual(selectCall.filters, [
        ['id', SCENARIO_A],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('returns 404 when a scenario is not owned by the user', async () => {
    const client = createFakeClient((state) => {
      if (state.method === 'select') return { data: null, error: null };
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`);
      assert.equal(res.status, 404);
    });
  });

  it('renames a scenario with an owner-scoped update', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed scenario' }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.scenario.name, 'Renamed scenario');

      const updateCall = client.calls.find((call) => call.method === 'update');
      assert.ok(updateCall);
      assert.equal(updateCall.payload.name, 'Renamed scenario');
      assert.ok(updateCall.payload.result.comparison);
      assert.deepEqual(updateCall.filters, [
        ['id', SCENARIO_A],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('recalculates a scenario when its inputs change', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: {
            ...SCENARIO_INPUTS,
            monthlyExpenses: 70000,
          },
        }),
      });

      assert.equal(res.status, 200);
      const updateCall = client.calls.find((call) => call.method === 'update');
      assert.equal(updateCall.payload.scenario_inputs.monthlyExpenses, 70000);
      assert.equal(
        updateCall.payload.result.scenario.metrics.monthlySurplus,
        30000
      );
    });
  });

  it('returns 404 when an update matches no owned row', async () => {
    const client = createFakeClient((state) => {
      if (state.method === 'select') return { data: null, error: null };
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Renamed' }),
      });

      assert.equal(res.status, 404);
      assert.equal(
        client.calls.some((call) => call.method === 'update'),
        false
      );
    });
  });

  it('deletes a scenario with an owner-scoped delete', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`, {
        method: 'DELETE',
      });

      assert.equal(res.status, 200);
      const deleteCall = client.calls.find((call) => call.method === 'delete');
      assert.ok(deleteCall);
      assert.deepEqual(deleteCall.filters, [
        ['id', SCENARIO_A],
        ['user_id', USER_ID],
      ]);
    });
  });

  it('returns 404 when a delete matches no owned row', async () => {
    const client = createFakeClient((state) => {
      if (state.method === 'delete') return { data: [], error: null };
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/${SCENARIO_A}`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 404);
    });
  });

  it('rejects malformed scenario ids before touching the database', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/not-a-uuid`, {
        method: 'DELETE',
      });

      assert.equal(res.status, 400);
      assert.equal(client.calls.length, 0);
    });
  });

  it('compares two owned saved scenarios', async () => {
    const client = createFakeClient((state) => {
      if (state.table === 'financial_scenarios' && state.method === 'select') {
        const id = state.filters.find(([column]) => column === 'id')?.[1];
        if (id === SCENARIO_B) {
          return {
            data: scenarioRow({
              id: SCENARIO_B,
              name: 'Scenario B',
              scenario_inputs: {
                ...SCENARIO_INPUTS,
                monthlyExpenses: 70000,
              },
            }),
            error: null,
          };
        }
        return { data: scenarioRow({ id: SCENARIO_A }), error: null };
      }
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineId: SCENARIO_A,
          scenarioId: SCENARIO_B,
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.baseline.name, 'Scenario A');
      assert.equal(body.scenario.name, 'Scenario B');
      const surplus = body.comparison.metrics.find(
        (item) => item.key === 'monthlySurplus'
      );
      assert.equal(surplus.baseline, 50000);
      assert.equal(surplus.scenario, 30000);
      assert.equal(surplus.difference, -20000);
    });
  });

  it('returns 404 when a compared scenario is missing or not owned', async () => {
    const client = createFakeClient((state) => {
      if (state.table === 'financial_scenarios' && state.method === 'select') {
        const id = state.filters.find(([column]) => column === 'id')?.[1];
        if (id === SCENARIO_B) return { data: null, error: null };
        return { data: scenarioRow(), error: null };
      }
      return defaultResponder(state);
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/scenarios/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineId: SCENARIO_A,
          scenarioId: SCENARIO_B,
        }),
      });

      assert.equal(res.status, 404);
    });
  });

  it('rejects comparing a scenario with itself or with malformed ids', async () => {
    const client = createFakeClient(defaultResponder);

    await withServer(client, async (baseUrl) => {
      const same = await fetch(`${baseUrl}/api/scenarios/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineId: SCENARIO_A,
          scenarioId: SCENARIO_A,
        }),
      });
      assert.equal(same.status, 400);

      const malformed = await fetch(`${baseUrl}/api/scenarios/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baselineId: 'not-a-uuid',
          scenarioId: SCENARIO_B,
        }),
      });
      assert.equal(malformed.status, 400);
      assert.equal(client.calls.length, 0);
    });
  });

  it('returns 401 when authentication is rejected', async () => {
    const client = createFakeClient(defaultResponder);
    const rejectAuth = (req, res) => {
      res.status(401).json({ error: 'Unauthorized', code: 'unauthorized' });
    };

    await withServer(
      client,
      async (baseUrl) => {
        const res = await fetch(`${baseUrl}/api/scenarios`);
        assert.equal(res.status, 401);
      },
      { requireAuth: rejectAuth }
    );
  });
});
