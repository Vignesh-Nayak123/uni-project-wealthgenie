import { getCandles, INSTRUMENT, SOURCE_LABEL, validateCandles } from './historicalProvider.js';
import { buyAt, sellAt } from './simulationService.js';
import {
  DEFAULT_ACCOUNT_ID,
  readJson,
  statePath,
  writeJson,
} from './persistence.js';

let lock = Promise.resolve();
function withLock(fn) { const next = lock.then(() => fn()); lock = next.catch(() => {}); return next; }

// Each signed-in user has an independent replay session next to their account.
function load(accountId) {
  return readJson(statePath(accountId, 'replay'));
}
function save(s, accountId) {
  writeJson(statePath(accountId, 'replay'), s);
}

export function start(accountId = DEFAULT_ACCOUNT_ID) {
  return withLock(() => {
    validateCandles(getCandles());
    const candles = getCandles();
    const session = { instrument: INSTRUMENT, source: SOURCE_LABEL, currentIndex: 0, revealed: [candles[0]], status: 'active', startedAt: new Date().toISOString() };
    save(session, accountId);
    return publicSession(session);
  });
}

export function get(accountId = DEFAULT_ACCOUNT_ID) {
  return withLock(() => {
    const s = load(accountId);
    if (!s) return { status: 'none' };
    return publicSession(s);
  });
}

export function next(accountId = DEFAULT_ACCOUNT_ID) {
  return withLock(() => {
    const s = load(accountId);
    if (!s) throw new Error('No active replay session.');
    const candles = getCandles();
    if (s.currentIndex >= candles.length - 1) throw new Error('End of dataset.');
    s.currentIndex += 1;
    s.revealed.push(candles[s.currentIndex]);
    if (s.currentIndex === candles.length - 1) s.status = 'completed';
    save(s, accountId);
    return publicSession(s);
  });
}

export function trade(side, quantity, accountId = DEFAULT_ACCOUNT_ID) {
  return withLock(() => {
    const s = load(accountId);
    if (!s) throw new Error('No active replay session.');
    const current = s.revealed[s.revealed.length - 1];
    if (side === 'buy') return buyAt(INSTRUMENT, quantity, current.close, accountId);
    if (side === 'sell') return sellAt(INSTRUMENT, quantity, current.close, accountId);
    throw new Error('Invalid side.');
  });
}

export function hold() { return { status: 'hold', message: 'No trade executed.' }; }

function publicSession(s) {
  const candles = getCandles();
  return {
    status: s.status,
    mode: 'historical_replay',
    instrument: s.instrument,
    source: s.source,
    priceSource: 'historical_csv',
    isLive: false,
    isDevelopmentFixture: false,
    currentIndex: s.currentIndex,
    total: candles.length,
    current: s.revealed[s.revealed.length - 1],
    revealed: s.revealed,
    range: { start: candles[0].date, end: candles[candles.length - 1].date },
  };
}
