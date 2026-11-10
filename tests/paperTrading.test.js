import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../backend/src/app.js';
import { resetState } from '../backend/src/services/paperTrading/persistence.js';

describe('Paper Trading API', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => await new Promise((resolve) => server.close(resolve)));

  beforeEach(() => resetState());

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
});
