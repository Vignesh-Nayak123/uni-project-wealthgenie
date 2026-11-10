import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NIFTYBEES_INSTRUMENT_KEY,
  marketFeed,
  summarizeMarketInfo,
} from '../backend/src/services/marketData/upstoxFeed.js';
import { resetState } from '../backend/src/services/paperTrading/persistence.js';
import { buy, sell, portfolio } from '../backend/src/services/paperTrading/simulationService.js';
import * as replay from '../backend/src/services/paperTrading/replayService.js';
import { getPrice } from '../backend/src/services/paperTrading/priceProvider.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_STATE = path.resolve(
  __dirname,
  '../backend/src/data/paper-replay-state.json'
);

const savedWatchlist = marketFeed.watchlist;
const savedSnapshots = new Map(marketFeed.snapshots);
const savedCandles = new Map(marketFeed.candles);

function clearPaperState() {
  resetState();
  if (fs.existsSync(REPLAY_STATE)) fs.unlinkSync(REPLAY_STATE);
}

function seedLiveTick({
  ltp = 275.5,
  previousClose = 270,
  receivedAt = new Date().toISOString(),
  marketStatus = 'NORMAL_OPEN',
} = {}) {
  marketFeed.watchlist = [
    {
      instrumentKey: NIFTYBEES_INSTRUMENT_KEY,
      symbol: 'NIFTYBEES',
      name: 'Nippon India ETF Nifty 50 BeES',
      verified: true,
    },
  ];
  marketFeed.marketSummary = summarizeMarketInfo({
    segmentStatus: { NSE_EQ: marketStatus },
  });
  marketFeed.applyNormalizedTick({
    instrumentKey: NIFTYBEES_INSTRUMENT_KEY,
    symbol: 'NIFTYBEES',
    name: 'Nippon India ETF Nifty 50 BeES',
    ltp,
    previousClose,
    open: 272,
    high: 276,
    low: 271,
    close: ltp,
    timestamp: Date.parse(receivedAt),
    receivedAt,
    lastTradedTime: receivedAt,
    source: 'upstox_v3',
    isLive: true,
  });
}

beforeEach(() => {
  clearPaperState();
  marketFeed.snapshots.clear();
  marketFeed.candles.clear();
  marketFeed.watchlist = [];
  marketFeed.marketSummary = summarizeMarketInfo(null);
});

afterEach(() => {
  if (marketFeed.tickTimer) {
    clearTimeout(marketFeed.tickTimer);
    marketFeed.tickTimer = null;
  }
  marketFeed.watchlist = savedWatchlist;
  marketFeed.snapshots = savedSnapshots;
  marketFeed.candles = savedCandles;
  marketFeed.lastTickAt = null;
  clearPaperState();
});

describe('Paper trading with live Upstox prices', () => {
  it('uses the latest live price for a buy', async () => {
    seedLiveTick({ ltp: 275.5 });
    const result = await buy('NIFTYBEES', 10);
    assert.equal(result.trade.price, 275.5);
    assert.equal(result.trade.priceSource, 'upstox_v3');
    assert.equal(result.trade.isLive, true);
    assert.equal(result.trade.stale, false);
    assert.ok(result.trade.executedAt);
    assert.equal(result.account.cash, 97245);
  });

  it('revalues holdings and unrealized P&L when the price changes', async () => {
    seedLiveTick({ ltp: 275.5 });
    await buy('NIFTYBEES', 10);

    seedLiveTick({ ltp: 280, previousClose: 270 });
    const account = await portfolio();
    assert.equal(account.holdings[0].currentPrice, 280);
    assert.equal(account.holdings[0].marketValue, 2800);
    assert.equal(account.holdings[0].unrealizedPnl, 45);
    assert.equal(account.unrealizedPnl, 45);
    assert.equal(account.totalEquity, 100045);
    assert.equal(account.holdings[0].priceSource, 'upstox_v3');
  });

  it('keeps realized P&L correct and sells at the latest live price', async () => {
    seedLiveTick({ ltp: 275.5 });
    await buy('NIFTYBEES', 10);
    seedLiveTick({ ltp: 280 });

    const result = await sell('NIFTYBEES', 5);
    assert.equal(result.trade.price, 280);
    assert.equal(result.trade.realizedPnl, 22.5);
    assert.equal(result.account.realizedPnl, 22.5);
    assert.equal(result.account.holdings[0].quantity, 5);
    assert.equal(result.account.holdings[0].avgCost, 275.5);
  });

  it('rejects a stale live price unless the user explicitly overrides it', async () => {
    const staleAt = new Date(Date.now() - 5 * 60_000).toISOString();
    seedLiveTick({ ltp: 300, receivedAt: staleAt });

    const quoted = getPrice('NIFTYBEES');
    assert.equal(quoted.isLive, true);
    assert.equal(quoted.stale, true);

    await assert.rejects(
      () => buy('NIFTYBEES', 1),
      /stale/i
    );

    const result = await buy('NIFTYBEES', 1, { allowStale: true });
    assert.equal(result.trade.price, 300);
    assert.equal(result.trade.stale, true);
    assert.equal(result.trade.priceSource, 'upstox_v3');
  });

  it('labelled simulated fallback still works when no live tick exists', async () => {
    const result = await buy('TCS', 2);
    assert.equal(result.trade.price, 4100);
    assert.equal(result.trade.priceSource, 'simulated_fixture');
    assert.equal(result.trade.isLive, false);
    assert.equal(result.account.holdings[0].avgCost, 4100);
  });

  it('keeps historical replay isolated from the live price', async () => {
    seedLiveTick({ ltp: 280 });
    const liveBefore = marketFeed.getLivePriceForSymbol('NIFTYBEES').ltp;

    const session = await replay.start();
    assert.equal(session.mode, 'historical_replay');
    assert.equal(session.isLive, false);
    await replay.next();
    const replayResult = await replay.trade('buy', 1);

    assert.equal(replayResult.trade.priceSource, 'historical_replay');
    assert.equal(replayResult.trade.isLive, false);
    assert.notEqual(replayResult.trade.price, liveBefore);
    assert.equal(marketFeed.getLivePriceForSymbol('NIFTYBEES').ltp, liveBefore);
    assert.equal(
      marketFeed.getLivePriceForSymbol('NIFTYBEES').source,
      'upstox_v3'
    );
  });
});
