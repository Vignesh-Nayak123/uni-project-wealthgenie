import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VirtualMarket,
  BASE_CANDLE_MS,
  PRACTICE_INSTRUMENTS,
  PRACTICE_SOURCE,
} from '../backend/src/services/paperTrading/virtualMarket.js';
import { getPrice } from '../backend/src/services/paperTrading/priceProvider.js';

const T0 = Date.UTC(2026, 10, 28, 6, 0, 0);

function makeMarket(seed = 42) {
  let clock = T0;
  const market = new VirtualMarket({ seed, now: () => clock });
  return {
    market,
    advance(ms) {
      clock += ms;
      return clock;
    },
  };
}

describe('practice (virtual) market', () => {
  it('starts with backfilled, well-formed candles for every instrument', () => {
    const { market } = makeMarket();
    for (const info of PRACTICE_INSTRUMENTS) {
      const candles = market.candles(info.symbol);
      assert.ok(candles.length >= 300, `${info.symbol} has history`);
      let previousTime = -Infinity;
      for (const c of candles) {
        assert.equal(c.time % BASE_CANDLE_MS, 0, 'aligned to the candle interval');
        assert.ok(c.time > previousTime, 'strictly ascending');
        previousTime = c.time;
        assert.ok(c.high >= Math.max(c.open, c.close));
        assert.ok(c.low <= Math.min(c.open, c.close));
        assert.ok(c.low > 0);
      }
      assert.ok(candles[candles.length - 1].time <= T0);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = makeMarket(7).market.quote('PRAC-NIFTY').price;
    const b = makeMarket(7).market.quote('PRAC-NIFTY').price;
    assert.equal(a, b);
  });

  it('moves prices every tick and builds the current candle', () => {
    const { market, advance } = makeMarket();
    const seen = new Set();
    let payload = null;
    market.onTick((p) => {
      payload = p;
    });
    for (let i = 0; i < 20; i += 1) {
      market.tick(advance(1_000));
      seen.add(market.quote('PRAC-POWER').price);
    }
    assert.ok(seen.size > 3, 'price changes over time');
    assert.equal(payload.type, 'practice_ticks');
    assert.equal(payload.ticks.length, PRACTICE_INSTRUMENTS.length);
    const quote = market.quote('PRAC-POWER');
    assert.equal(quote.candle.close, quote.price);
    assert.equal(quote.source, PRACTICE_SOURCE);
    // Prices stay on the 5-paise tick grid.
    assert.ok(Math.abs(quote.price * 20 - Math.round(quote.price * 20)) < 1e-6);
  });

  it('stays in a sane range over a long session', () => {
    const { market, advance } = makeMarket(3);
    for (let i = 0; i < 6 * 3600; i += 1) market.tick(advance(1_000));
    for (const info of PRACTICE_INSTRUMENTS) {
      const price = market.quote(info.symbol).price;
      assert.ok(price > info.start * 0.4 && price < info.start * 2.5, `${info.symbol}=${price}`);
    }
  });

  it('prices practice instruments through the paper-trading price provider', () => {
    const { market } = makeMarket();
    const quote = getPrice('prac-gold', { market });
    assert.equal(quote.symbol, 'PRAC-GOLD');
    assert.equal(quote.source, PRACTICE_SOURCE);
    assert.equal(quote.isLive, false);
    assert.equal(quote.price, market.quote('PRAC-GOLD').price);
    // Real instruments are untouched by the practice market.
    assert.notEqual(getPrice('NIFTYBEES', { market }).source, PRACTICE_SOURCE);
  });
});
