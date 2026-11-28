import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createPaperTradingRouter } from '../backend/src/routes/paperTrading.routes.js';
import { createMemoryStore, resetState } from '../backend/src/services/paperTrading/persistence.js';

// The API stores accounts in Supabase; this suite swaps in an in-memory store.
const store = createMemoryStore();

// express is a backend dependency, not a root one.
const express = createRequire(new URL('../backend/package.json', import.meta.url))('express');

const TEST_USER_ID = '00000000-0000-4000-8000-0000000000aa';

function injectUser(req, res, next) {
  const userId = req.headers['x-test-user'];
  if (!userId) return res.status(401).json({ code: 'unauthorized' });
  req.user = { id: userId };
  return next();
}

describe('Paper Trading API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      // Default every request in this suite to the same signed-in user unless
      // a test opts out with an explicit empty header.
      if (req.headers['x-test-user'] === undefined) req.headers['x-test-user'] = TEST_USER_ID;
      next();
    });
    app.use('/api/paper-trading', createPaperTradingRouter({ requireAuth: injectUser, storeFor: () => store }));
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => await new Promise((resolve) => server.close(resolve)));

  beforeEach(async () => {
    await resetState(TEST_USER_ID, store);
    await resetState('00000000-0000-4000-8000-0000000000bb', store);
  });

  it('init repeated returns exists', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const body = await res.json();
    assert.equal(body.status, 'exists');
  });

  it('buy and portfolio', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TCS', quantity: 2 }) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.account.holdings[0].avgCost, 4100);
  });

  it('insufficient cash', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TCS', quantity: 1000 }) });
    assert.equal(res.status, 400);
  });

  it('invalid quantity', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TCS', quantity: 1.5 }) });
    assert.equal(res.status, 400);
  });

  it('insufficient holdings sell', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    const res = await fetch(`${baseUrl}/api/paper-trading/sell`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TCS', quantity: 1 }) });
    assert.equal(res.status, 400);
  });

  it('weighted avg and pnl', async () => {
    await fetch(`${baseUrl}/api/paper-trading/init`, { method: 'POST' });
    await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'RELIANCE', quantity: 2 }) });
    await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'RELIANCE', quantity: 2 }) });
    const res = await fetch(`${baseUrl}/api/paper-trading/sell`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'RELIANCE', quantity: 1 }) });
    const body = await res.json();
    assert.equal(body.trade.realizedPnl, 0);
  });

  it('requires a signed-in user for account routes', async () => {
    const res = await fetch(`${baseUrl}/api/paper-trading/portfolio`, { headers: { 'x-test-user': '' } });
    assert.equal(res.status, 401);
  });

  it('keeps each user account separate', async () => {
    const other = '00000000-0000-4000-8000-0000000000bb';
    await fetch(`${baseUrl}/api/paper-trading/buy`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol: 'TCS', quantity: 2 }) });
    const mine = await (await fetch(`${baseUrl}/api/paper-trading/portfolio`)).json();
    const theirs = await (await fetch(`${baseUrl}/api/paper-trading/portfolio`, { headers: { 'x-test-user': other } })).json();
    assert.equal(mine.holdings.length, 1);
    assert.equal(theirs.holdings.length, 0);
    assert.equal(theirs.cash, 100000);
  });
});
