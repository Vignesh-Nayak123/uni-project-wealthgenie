import {
  initAccount,
  buy,
  sell,
  portfolio,
  history,
} from './simulationService.js';
import { listInstruments } from './priceProvider.js';
import { marketFeed } from '../marketData/upstoxFeed.js';
import * as replay from './replayService.js';

async function run(res, fn) {
  try {
    const result = await fn();
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ status: 'error', error: err.message });
  }
}

// req.user is set by requireAuth; every account is scoped to the verified user.
const accountOf = (req) => req.user.id;

export async function init(req, res) {
  await run(res, () => initAccount(accountOf(req)));
}

export async function buyOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => buy(symbol, quantity, { allowStale: Boolean(allowStale), accountId: accountOf(req) }));
}

export async function sellOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => sell(symbol, quantity, { allowStale: Boolean(allowStale), accountId: accountOf(req) }));
}

export function getPortfolio(req, res) {
  run(res, () => portfolio(accountOf(req)));
}

export function getHistory(req, res) {
  run(res, () => history(accountOf(req)));
}

export function getInstruments(req, res) {
  const instruments = listInstruments();
  const anyLive = instruments.some((item) => item.isLive);
  res.json({
    instruments,
    marketFeed: marketFeed.getStatus(),
    note: anyLive
      ? 'Live Upstox V3 prices are shown where available; any remaining fixture price is explicitly labelled simulated.'
      : 'No live Upstox tick is available yet. Prices shown are the clearly-labelled simulation fixture, not real market data.',
  });
}

export async function replayStart(req, res) { await run(res, () => replay.start(accountOf(req))); }
export async function replayGet(req, res) { await run(res, () => replay.get(accountOf(req))); }
export async function replayNext(req, res) { await run(res, () => replay.next(accountOf(req))); }
export async function replayTrade(req, res) {
  const { side, quantity } = req.body || {};
  await run(res, () => replay.trade(side, quantity, accountOf(req)));
}
export function replayHold(req, res) { res.json(replay.hold()); }
