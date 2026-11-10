import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createLearningProgressRouter } from '../backend/src/routes/learningProgress.routes.js';
import {
  mergeLearningProgress,
  validateLearningProgressPayload,
} from '../backend/src/utils/learningProgress.js';

const requireFromBackend = createRequire(
  new URL('../backend/package.json', import.meta.url)
);
const express = requireFromBackend('express');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '99999999-9999-4999-8999-999999999999';
const NOW = '2026-10-28T09:00:00.000Z';

function createFakeClient(initialRow = null) {
  const calls = [];
  let stored = initialRow;

  return {
    calls,
    get stored() {
      return stored;
    },
    from(table) {
      const state = {
        table,
        method: null,
        filters: [],
        payload: null,
        options: null,
      };

      const record = () => calls.push(state);

      const builder = {
        select() {
          if (!state.method) state.method = 'select';
          return builder;
        },
        eq(column, value) {
          state.filters.push([column, value]);
          return builder;
        },
        upsert(payload, options) {
          state.method = 'upsert';
          state.payload = payload;
          state.options = options;
          return builder;
        },
        delete() {
          state.method = 'delete';
          return builder;
        },
        maybeSingle() {
          record();
          return Promise.resolve({ data: stored, error: null });
        },
        single() {
          record();
          if (state.method === 'upsert') {
            stored = {
              ...(stored || {}),
              ...state.payload,
              created_at: stored?.created_at || NOW,
              updated_at: NOW,
            };
          }
          return Promise.resolve({ data: stored, error: null });
        },
        then(resolve, reject) {
          record();
          if (state.method === 'delete') {
            stored = null;
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: stored, error: null }).then(resolve, reject);
        },
      };

      return builder;
    },
  };
}

async function withServer(client, run) {
  const app = express();
  app.use(express.json());

  const injectUser = (req, res, next) => {
    req.user = { id: USER_ID, email: 'user@example.com' };
    req.supabase = client;
    next();
  };

  app.use(
    '/api/learn/progress',
    createLearningProgressRouter({ requireAuth: injectUser })
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

describe('learning progress validation', () => {
  it('accepts known concepts and valid quiz scores', () => {
    const progress = validateLearningProgressPayload({
      completedConceptIds: ['expenses', 'income'],
      quizProgress: {
        income: { correct: 3, total: 3, completed: true, updatedAt: NOW },
      },
    });

    assert.deepEqual(progress.completedConceptIds, ['income', 'expenses']);
    assert.equal(progress.quizProgress.income.correct, 3);
  });

  it('rejects unknown concepts and impossible scores', () => {
    assert.throws(
      () => validateLearningProgressPayload({ completedConceptIds: ['made-up'] }),
      /Unknown concept id/
    );
    assert.throws(
      () =>
        validateLearningProgressPayload({
          quizProgress: { income: { correct: 4, total: 3 } },
        }),
      /Invalid quiz progress/
    );
    assert.throws(
      () =>
        validateLearningProgressPayload({
          quizProgress: { 'not-a-concept': { correct: 1, total: 3 } },
        }),
      /Unknown quiz concept id/
    );
  });

  it('merges completed concepts and keeps the best quiz attempt', () => {
    const merged = mergeLearningProgress(
      {
        completedConceptIds: ['income'],
        quizProgress: { income: { correct: 1, total: 3, completed: false } },
      },
      {
        completedConceptIds: ['expenses'],
        quizProgress: { income: { correct: 3, total: 3, completed: true } },
      }
    );

    assert.deepEqual(merged.completedConceptIds, ['income', 'expenses']);
    assert.equal(merged.quizProgress.income.correct, 3);
    assert.equal(merged.quizProgress.income.completed, true);
  });

  it('never replaces a better score with a worse later attempt', () => {
    const merged = mergeLearningProgress(
      {
        completedConceptIds: [],
        quizProgress: { income: { correct: 3, total: 3, completed: true } },
      },
      {
        completedConceptIds: [],
        quizProgress: { income: { correct: 0, total: 3, completed: false } },
      }
    );

    assert.equal(merged.quizProgress.income.correct, 3);
  });
});

describe('learning progress API ownership', () => {
  it('returns an empty snapshot when the user has no row', async () => {
    const client = createFakeClient(null);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/learn/progress`);
      assert.equal(res.status, 200);

      const body = await res.json();
      assert.deepEqual(body.progress.completedConceptIds, []);
      assert.deepEqual(body.progress.quizProgress, {});

      const select = client.calls.find((call) => call.method === 'select');
      assert.deepEqual(select.filters, [['user_id', USER_ID]]);
    });
  });

  it('writes the owner from the verified token, never from the body', async () => {
    const client = createFakeClient(null);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/learn/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedConceptIds: ['income'],
          quizProgress: { income: { correct: 3, total: 3 } },
          user_id: OTHER_USER_ID,
        }),
      });

      assert.equal(res.status, 200);
      const upsert = client.calls.find((call) => call.method === 'upsert');
      assert.equal(upsert.table, 'learning_progress');
      assert.equal(upsert.payload.user_id, USER_ID);
      assert.notEqual(upsert.payload.user_id, OTHER_USER_ID);
      assert.deepEqual(upsert.options, { onConflict: 'user_id' });
    });
  });

  it('merges browser progress into the stored account snapshot', async () => {
    const client = createFakeClient({
      user_id: USER_ID,
      completed_concept_ids: ['income'],
      quiz_progress: {
        income: { correct: 1, total: 3, completed: false, updatedAt: NOW },
      },
      created_at: NOW,
      updated_at: NOW,
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/learn/progress/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          completedConceptIds: ['income', 'expenses'],
          quizProgress: { income: { correct: 3, total: 3 } },
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.progress.completedConceptIds, ['income', 'expenses']);
      assert.equal(body.progress.quizProgress.income.correct, 3);

      assert.deepEqual(
        client.stored.completed_concept_ids,
        ['income', 'expenses']
      );
    });
  });

  it('scopes deletes to the verified user', async () => {
    const client = createFakeClient({
      user_id: USER_ID,
      completed_concept_ids: ['income'],
      quiz_progress: {},
    });

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/learn/progress`, {
        method: 'DELETE',
      });
      assert.equal(res.status, 200);

      const del = client.calls.find((call) => call.method === 'delete');
      assert.deepEqual(del.filters, [['user_id', USER_ID]]);
      assert.equal(client.stored, null);
    });
  });

  it('rejects an unknown concept with HTTP 400 and writes nothing', async () => {
    const client = createFakeClient(null);

    await withServer(client, async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/learn/progress`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completedConceptIds: ['not-real'] }),
      });

      assert.equal(res.status, 400);
      assert.equal(
        client.calls.some((call) => call.method === 'upsert'),
        false
      );
    });
  });
});

describe('learning progress migration', () => {
  it('defines ownership, constraints, indexes and row-level security', async () => {
    const sql = await readFile(
      new URL(
        '../supabase/migrations/20261028120000_learning_progress.sql',
        import.meta.url
      ),
      'utf8'
    );

    assert.match(sql, /user_id uuid primary key references auth\.users \(id\) on delete cascade/);
    assert.match(sql, /enable row level security/);
    assert.match(sql, /learning_progress_select_own/);
    assert.match(sql, /learning_progress_insert_own/);
    assert.match(sql, /learning_progress_update_own/);
    assert.match(sql, /learning_progress_delete_own/);
    assert.match(sql, /\(select auth\.uid\(\)\) = user_id/);
    assert.match(sql, /learning_progress_updated_at_idx/);
    assert.match(sql, /revoke all on public\.learning_progress from anon/);
  });
});
