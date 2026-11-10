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

export async function init(req, res) {
  await run(res, () => initAccount());
}

export async function buyOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => buy(symbol, quantity, { allowStale: Boolean(allowStale) }));
}

export async function sellOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => sell(symbol, quantity, { allowStale: Boolean(allowStale) }));
}

export function getPortfolio(req, res) {
  run(res, () => portfolio());
}

export function getHistory(req, res) {
  run(res, () => history());
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

export async function replayStart(req, res) { await run(res, () => replay.start()); }
export async function replayGet(req, res) { await run(res, () => replay.get()); }
export async function replayNext(req, res) { await run(res, () => replay.next()); }
export async function replayTrade(req, res) {
  const { side, quantity } = req.body || {};
  await run(res, () => replay.trade(side, quantity));
}
export function replayHold(req, res) { res.json(replay.hold()); }
