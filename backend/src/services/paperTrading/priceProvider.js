// Paper-trading price resolution.
//
// Trades stay simulated. When a live Upstox V3 tick exists for the symbol it is
// used (with its real source/timestamp/staleness). Otherwise the deterministic
// development fixture is used and clearly labelled as simulated — never as a
// live or historical market price.
import { marketFeed } from '../marketData/upstoxFeed.js';
import { virtualMarket, PRACTICE_SOURCE } from './virtualMarket.js';

const INSTRUMENTS = {
  NIFTYBEES: { name: 'Nippon India ETF Nifty 50 BeES', price: 250.0 },
  RELIANCE: { name: 'Reliance Industries Ltd', price: 2900.0 },
  TCS: { name: 'Tata Consultancy Services Ltd', price: 4100.0 },
};

const FIXTURE_SOURCE = 'simulated_fixture';
const LIVE_SOURCE = 'upstox_v3';

function priceFromLive(symbol, name, live) {
  const ltp = Number(live?.ltp);
  if (!Number.isFinite(ltp) || ltp <= 0) return null;
  return {
    symbol,
    name,
    price: ltp,
    live: true,
    isLive: true,
    stale: Boolean(live.stale),
    source: LIVE_SOURCE,
    instrumentKey: live.instrumentKey || null,
    timestamp: live.timestamp || null,
    lastTradedTime: live.lastTradedTime || null,
    receivedAt: live.receivedAt || null,
    previousClose:
      Number.isFinite(Number(live.previousClose)) && Number(live.previousClose) > 0
        ? Number(live.previousClose)
        : null,
    open: Number.isFinite(Number(live.open)) ? Number(live.open) : null,
    high: Number.isFinite(Number(live.high)) ? Number(live.high) : null,
    low: Number.isFinite(Number(live.low)) ? Number(live.low) : null,
    close: Number.isFinite(Number(live.close)) ? Number(live.close) : null,
  };
}

function priceFromFixture(symbol, info) {
  return {
    symbol,
    name: info.name,
    price: info.price,
    live: false,
    isLive: false,
    stale: false,
    source: FIXTURE_SOURCE,
    instrumentKey: null,
    timestamp: null,
    lastTradedTime: null,
    receivedAt: null,
    previousClose: null,
    open: null,
    high: null,
    low: null,
    close: null,
  };
}

// Practice-market instruments are fictional and always simulated; they are
// labelled with their own source so they are never mistaken for real prices.
function priceFromPractice(quote) {
  return {
    symbol: quote.symbol,
    name: quote.name,
    price: quote.price,
    market: 'practice',
    live: false,
    isLive: false,
    stale: false,
    source: PRACTICE_SOURCE,
    instrumentKey: null,
    timestamp: quote.updatedAt,
    lastTradedTime: quote.updatedAt,
    receivedAt: quote.updatedAt,
    previousClose: quote.previousClose,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    close: quote.price,
  };
}

/**
 * @param {string} symbol
 * @param {{ feed?: typeof marketFeed }} [options] injectable feed for tests.
 */
export function getPrice(symbol, options = {}) {
  const upper = String(symbol || '').toUpperCase();
  const market = options.market || virtualMarket;
  if (market.has(upper)) return priceFromPractice(market.quote(upper));
  const info = INSTRUMENTS[upper];
  if (!info) return null;

  const feed = options.feed || marketFeed;
  const live = feed.getLivePriceForSymbol(upper);
  if (live) {
    const resolved = priceFromLive(upper, live.name || info.name, live);
    if (resolved) return resolved;
  }
  return priceFromFixture(upper, info);
}

export function listInstruments() {
  return Object.keys(INSTRUMENTS).map((symbol) => {
    const price = getPrice(symbol);
    return {
      symbol,
      market: 'real',
      name: price.name,
      price: price.price,
      live: price.live,
      isLive: price.isLive,
      stale: price.stale,
      source: price.source,
      instrumentKey: price.instrumentKey,
      timestamp: price.timestamp,
      lastTradedTime: price.lastTradedTime,
      previousClose: price.previousClose,
      open: price.open,
      high: price.high,
      low: price.low,
      close: price.close,
    };
  });
}

/** Practice-market quotes (simulated, fictional instruments). */
export function listPracticeInstruments(options = {}) {
  return (options.market || virtualMarket).list();
}

export function isValidInstrument(symbol) {
  return getPrice(symbol) !== null;
}

export { FIXTURE_SOURCE, LIVE_SOURCE, PRACTICE_SOURCE, INSTRUMENTS };
