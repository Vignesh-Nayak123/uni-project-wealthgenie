import {
  initAccount,
  buy,
  sell,
  portfolio,
  history,
} from './simulationService.js';
import { listInstruments, listPracticeInstruments } from './priceProvider.js';
import { marketFeed } from '../marketData/upstoxFeed.js';
import * as replay from './replayService.js';
import { virtualMarket, BASE_CANDLE_MS } from './virtualMarket.js';
import { PaperTradingStoreError } from './persistence.js';
import { sendDatabaseError } from '../../utils/databaseErrors.js';

async function run(res, fn) {
  try {
    const result = await fn();
    return res.json(result);
  } catch (err) {
    // Database failures are the server's problem (500/503), not a bad order.
    if (err instanceof PaperTradingStoreError) {
      return sendDatabaseError(res, err.cause, err.message);
    }
    return res.status(400).json({ status: 'error', error: err.message });
  }
}

// req.user is set by requireAuth; every account is scoped to the verified user.
const accountOf = (req) => req.user.id;
// req.paperTradingStore is set by the router (Supabase in the app).
const storeOf = (req) => req.paperTradingStore;

export async function init(req, res) {
  await run(res, () => initAccount(accountOf(req), storeOf(req)));
}

export async function buyOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => buy(symbol, quantity, { allowStale: Boolean(allowStale), accountId: accountOf(req), store: storeOf(req) }));
}

export async function sellOrder(req, res) {
  const { symbol, quantity, allowStale } = req.body || {};
  await run(res, () => sell(symbol, quantity, { allowStale: Boolean(allowStale), accountId: accountOf(req), store: storeOf(req) }));
}

export async function getPortfolio(req, res) {
  await run(res, () => portfolio(accountOf(req), storeOf(req)));
}

export async function getHistory(req, res) {
  await run(res, () => history(accountOf(req), storeOf(req)));
}

export function getInstruments(req, res) {
  const instruments = listInstruments();
  const anyLive = instruments.some((item) => item.isLive);
  res.json({
    instruments,
    practiceInstruments: listPracticeInstruments(),
    marketFeed: marketFeed.getStatus(),
    note: anyLive
      ? 'Live Upstox V3 prices are shown where available; any remaining fixture price is explicitly labelled simulated.'
      : 'No live Upstox tick is available yet. Prices shown are the clearly-labelled simulation fixture, not real market data.',
  });
}

export async function replayStart(req, res) { await run(res, () => replay.start(accountOf(req), storeOf(req))); }
export async function replayGet(req, res) { await run(res, () => replay.get(accountOf(req), storeOf(req))); }
export async function replayNext(req, res) { await run(res, () => replay.next(accountOf(req), storeOf(req))); }
export async function replayTrade(req, res) {
  const { side, quantity } = req.body || {};
  await run(res, () => replay.trade(side, quantity, accountOf(req), storeOf(req)));
}
export function replayHold(req, res) { res.json(replay.hold()); }

/** Practice-market candles (5-second base candles, oldest first). */
export function getPracticeCandles(req, res) {
  const symbol = String(req.params.symbol || '').toUpperCase();
  if (!virtualMarket.has(symbol)) {
    return res.status(404).json({ status: 'error', error: 'Unknown practice instrument.' });
  }
  return res.json({
    status: 'success',
    symbol,
    intervalMs: BASE_CANDLE_MS,
    quote: virtualMarket.quote(symbol),
    candles: virtualMarket.candles(symbol),
  });
}
