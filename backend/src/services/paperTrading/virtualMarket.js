// Practice market: a self-contained simulated market for paper trading.
//
// Real prices (Upstox) only move while NSE is open (9:15 AM-3:30 PM on trading
// days). To let learners practise at any hour, this module runs a small
// simulated market whose prices change every second and build real OHLC
// candles. Its instruments are clearly separate, fictional "practice" names, so
// a simulated price is never shown as, or mixed with, a real share's price.
//
// Model: each tick is a log-normal step (geometric Brownian motion) with a
// gentle pull back towards a slowly drifting "fair value", plus rare small
// jumps, so charts look like markets (trends, pullbacks, the occasional gap)
// without running away to zero or infinity over a long session.

export const PRACTICE_SOURCE = 'practice_market';
export const PRACTICE_PREFIX = 'PRAC-';
export const BASE_CANDLE_MS = 5_000;
const TICK_MS = 1_000;
const MAX_BASE_CANDLES = 1_440; // 2 hours of 5-second candles
const BACKFILL_CANDLES = 360; // 30 minutes of history so the chart is never empty
const TICK_SIZE = 0.05;

// sigma: typical move per one-second tick (as a fraction of price).
export const PRACTICE_INSTRUMENTS = [
  {
    symbol: 'PRAC-NIFTY',
    name: 'Practice Nifty 50 Index Fund',
    kind: 'Index fund',
    description: 'Moves like a broad market index: steady, smaller swings.',
    start: 250,
    sigma: 0.0004,
    jumpChance: 0.002,
  },
  {
    symbol: 'PRAC-BANK',
    name: 'Practice Bank Ltd',
    kind: 'Large company share',
    description: 'A big bank share: moderate swings.',
    start: 1650,
    sigma: 0.0007,
    jumpChance: 0.003,
  },
  {
    symbol: 'PRAC-TECH',
    name: 'Practice Tech Services Ltd',
    kind: 'Large company share',
    description: 'An IT services share: moderate swings.',
    start: 3900,
    sigma: 0.0008,
    jumpChance: 0.003,
  },
  {
    symbol: 'PRAC-POWER',
    name: 'Practice Green Power Ltd',
    kind: 'Small company share',
    description: 'A small, risky share: big swings both ways.',
    start: 180,
    sigma: 0.0016,
    jumpChance: 0.006,
  },
  {
    symbol: 'PRAC-GOLD',
    name: 'Practice Gold ETF',
    kind: 'Gold fund',
    description: 'Tracks a gold price: calm, slow moves.',
    start: 72,
    sigma: 0.00025,
    jumpChance: 0.001,
  },
];

// Small deterministic PRNG so tests can seed the market.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundToTick(price) {
  const ticks = Math.max(1, Math.round(price / TICK_SIZE));
  return Math.round(ticks * TICK_SIZE * 100) / 100;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export class VirtualMarket {
  constructor({ seed = Date.now(), now = () => Date.now(), instruments = PRACTICE_INSTRUMENTS } = {}) {
    this.random = mulberry32(Number(seed) || 1);
    this.now = now;
    this.timer = null;
    this.listeners = new Set();
    this.state = new Map();
    const startAt = this.now();
    for (const info of instruments) {
      this.state.set(info.symbol, {
        info,
        price: info.start,
        fair: info.start,
        sessionOpen: null,
        sessionHigh: -Infinity,
        sessionLow: Infinity,
        previousClose: null,
        candles: [],
        updatedAt: startAt,
      });
    }
    this.backfill(startAt);
  }

  // Standard normal via Box-Muller.
  gaussian() {
    let u = 0;
    while (u === 0) u = this.random();
    const v = this.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  step(entry) {
    const { info } = entry;
    // The fair value wanders slowly, creating trends that last minutes.
    entry.fair *= Math.exp(info.sigma * 0.35 * this.gaussian());
    const pull = 0.004 * Math.log(entry.fair / entry.price);
    let shock = info.sigma * this.gaussian();
    if (this.random() < info.jumpChance) {
      shock += (this.random() < 0.5 ? -1 : 1) * info.sigma * (6 + this.random() * 10);
    }
    entry.price = roundToTick(entry.price * Math.exp(pull + shock));
    return entry.price;
  }

  applyPrice(entry, price, at, volume) {
    const bucket = Math.floor(at / BASE_CANDLE_MS) * BASE_CANDLE_MS;
    const last = entry.candles[entry.candles.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume += volume;
    } else {
      entry.candles.push({ time: bucket, open: price, high: price, low: price, close: price, volume });
      if (entry.candles.length > MAX_BASE_CANDLES) entry.candles.shift();
    }
    if (entry.sessionOpen === null) entry.sessionOpen = price;
    entry.sessionHigh = Math.max(entry.sessionHigh, price);
    entry.sessionLow = Math.min(entry.sessionLow, price);
    entry.updatedAt = at;
  }

  volumeFor(entry) {
    const base = entry.info.start > 1000 ? 40 : 400;
    return Math.round(base * (0.3 + this.random() * 1.7));
  }

  /** Generate recent history (one-second steps) so charts start populated. */
  backfill(endAt) {
    const steps = (BACKFILL_CANDLES * BASE_CANDLE_MS) / TICK_MS;
    const startAt = endAt - steps * TICK_MS;
    for (const entry of this.state.values()) {
      entry.previousClose = entry.info.start;
      for (let i = 0; i < steps; i += 1) {
        const at = startAt + i * TICK_MS;
        this.applyPrice(entry, this.step(entry), at, this.volumeFor(entry));
      }
    }
  }

  /** Advance every instrument by one tick and notify listeners. */
  tick(at = this.now()) {
    const ticks = [];
    for (const entry of this.state.values()) {
      this.applyPrice(entry, this.step(entry), at, this.volumeFor(entry));
      ticks.push(this.quote(entry.info.symbol));
    }
    const payload = { type: 'practice_ticks', at: new Date(at).toISOString(), ticks };
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // One bad listener must never stop the market.
      }
    }
    return ticks;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  has(symbol) {
    return this.state.has(String(symbol || '').toUpperCase());
  }

  quote(symbol) {
    const entry = this.state.get(String(symbol || '').toUpperCase());
    if (!entry) return null;
    const { info } = entry;
    const change = entry.price - entry.previousClose;
    return {
      symbol: info.symbol,
      name: info.name,
      kind: info.kind,
      description: info.description,
      market: 'practice',
      source: PRACTICE_SOURCE,
      price: entry.price,
      ltp: entry.price,
      open: entry.sessionOpen,
      high: entry.sessionHigh,
      low: entry.sessionLow,
      previousClose: entry.previousClose,
      change: round2(change),
      changePct: round2((change / entry.previousClose) * 100),
      candle: entry.candles[entry.candles.length - 1] || null,
      updatedAt: new Date(entry.updatedAt).toISOString(),
    };
  }

  list() {
    return [...this.state.keys()].map((symbol) => this.quote(symbol));
  }

  candles(symbol) {
    const entry = this.state.get(String(symbol || '').toUpperCase());
    return entry ? entry.candles.map((candle) => ({ ...candle })) : [];
  }
}

export const virtualMarket = new VirtualMarket();
