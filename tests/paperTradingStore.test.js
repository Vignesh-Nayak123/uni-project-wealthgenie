import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPaperTradingRouter } from '../backend/src/routes/paperTrading.routes.js';
import {
  createSupabaseStore,
  PAPER_TRADING_TABLE,
} from '../backend/src/services/paperTrading/persistence.js';

const express = createRequire(new URL('../backend/package.json', import.meta.url))('express');

const USER_ID = '00000000-0000-4000-8000-0000000000cc';
const COLUMN_DEFAULTS = { cash: 100000, holdings: {}, history: [], replay_session: null };

/**
 * Minimal stand-in for the supabase-js query builder covering the calls the
 * store makes. It behaves like PostgREST: upserts merge only the columns sent,
 * missing columns take the table defaults, and numerics come back as strings.
 */
function createFakeSupabase() {
  const rows = new Map();
  const fake = { rows, tables: new Set(), failWith: null };

  fake.from = (table) => {
    fake.tables.add(table);
    const q = { filters: {} };
    const result = (value) => Promise.resolve(fake.failWith ? { data: null, error: fake.failWith } : value);
    const builder = {
      select(columns) { q.op = q.op || 'select'; q.columns = columns; return builder; },
      eq(column, value) {
        q.filters[column] = value;
        if (q.op === 'delete') {
          if (!fake.failWith) rows.delete(value);
          return result({ data: null, error: null });
        }
        return builder;
      },
      maybeSingle() {
        const row = rows.get(q.filters.user_id);
        if (!row) return result({ data: null, error: null });
        const picked = {};
        for (const col of q.columns.split(',').map((c) => c.trim())) {
          picked[col] = col === 'cash' ? String(row[col]) : structuredClone(row[col]);
        }
        return result({ data: picked, error: null });
      },
      upsert(row, options) {
        assert.equal(options?.onConflict, 'user_id');
        if (!fake.failWith) {
          const existing = rows.get(row.user_id) || { ...COLUMN_DEFAULTS };
          rows.set(row.user_id, { ...existing, ...structuredClone(row) });
        }
        return result({ data: null, error: null });
      },
      delete() { q.op = 'delete'; return builder; },
    };
    return builder;
  };

  return fake;
}

function injectUser(req, res, next) {
  req.user = { id: USER_ID };
  next();
}

async function startApp(storeFor) {
  const app = express();
  app.use(express.json());
  app.use('/api/paper-trading', createPaperTradingRouter({ requireAuth: injectUser, storeFor }));
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, baseUrl: `http://127.0.0.1:${server.address().port}/api/paper-trading` });
    });
  });
}

const post = (url, body) => fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

describe('Paper trading Supabase store', () => {
  let fake;
  let server;
  let baseUrl;

  before(async () => {
    fake = createFakeSupabase();
    // A fresh store per request, like the real router (one client per token).
    ({ server, baseUrl } = await startApp(() => createSupabaseStore(fake)));
  });

  after(async () => await new Promise((resolve) => server.close(resolve)));

  it('writes the account to the paper_trading_accounts row', async () => {
    fake.failWith = null;
    fake.rows.clear();
    const res = await post(`${baseUrl}/buy`, { symbol: 'TCS', quantity: 2 });
    assert.equal(res.status, 200);

    assert.ok(fake.tables.has(PAPER_TRADING_TABLE));
    const row = fake.rows.get(USER_ID);
    assert.equal(row.cash, 91800);
    assert.equal(row.holdings.TCS.quantity, 2);
    assert.equal(row.history.length, 1);
    assert.equal(row.history[0].type, 'BUY');
  });

  it('reads the portfolio back from the database (survives a restart)', async () => {
    // A second app with its own store instance shares nothing in memory.
    const other = await startApp(() => createSupabaseStore(fake));
    try {
      const body = await (await fetch(`${other.baseUrl}/portfolio`)).json();
      assert.equal(body.cash, 91800);
      assert.equal(typeof body.cash, 'number');
      assert.equal(body.holdings[0].symbol, 'TCS');
      assert.equal(body.holdings[0].quantity, 2);
    } finally {
      await new Promise((resolve) => other.server.close(resolve));
    }
  });

  it('saving the replay session never overwrites the account columns', async () => {
    await post(`${baseUrl}/replay/start`);
    await post(`${baseUrl}/replay/next`);
    const trade = await (await post(`${baseUrl}/replay/trade`, { side: 'buy', quantity: 1 })).json();
    assert.equal(trade.status, 'success');

    const row = fake.rows.get(USER_ID);
    assert.equal(row.holdings.TCS.quantity, 2, 'live-market holding kept');
    assert.ok(row.holdings.NIFTYBEES, 'replay holding added');
    assert.equal(row.replay_session.currentIndex, 1);
    assert.equal(row.replay_session.revealed, undefined, 'only the cursor is stored');

    const session = await (await fetch(`${baseUrl}/replay`)).json();
    assert.equal(session.currentIndex, 1);
    assert.equal(session.revealed.length, 2);
    assert.equal(session.current.close, trade.trade.price);
  });

  it('answers 503 with a clear code when the table has not been created', async () => {
    fake.failWith = { code: 'PGRST205', message: "Could not find the table 'public.paper_trading_accounts'" };
    try {
      const res = await fetch(`${baseUrl}/portfolio`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.equal(body.code, 'database_not_initialized');
    } finally {
      fake.failWith = null;
    }
  });

  it('answers 500 (not 400) for other database failures', async () => {
    fake.failWith = { code: '08006', message: 'connection failure' };
    try {
      const res = await post(`${baseUrl}/buy`, { symbol: 'TCS', quantity: 1 });
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.code, 'database_error');
    } finally {
      fake.failWith = null;
    }
  });
});
