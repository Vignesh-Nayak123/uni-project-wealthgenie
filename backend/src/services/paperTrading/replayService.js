import { getCandles, INSTRUMENT, SOURCE_LABEL, validateCandles } from './historicalProvider.js';
import { buyAt, sellAt } from './simulationService.js';
import { createKeyedLock, DEFAULT_ACCOUNT_ID, defaultStore } from './persistence.js';

const withLock = createKeyedLock();

// Each signed-in user has an independent replay session next to their account.
// Only the cursor is stored; the revealed candles are rebuilt from the bundled
// CSV, so a save stays a few bytes instead of growing with every step.
function compactSession(s) {
  return {
    instrument: s.instrument,
    source: s.source,
    currentIndex: s.currentIndex,
    status: s.status,
    startedAt: s.startedAt,
  };
}

async function load(accountId, store) {
  const s = await store.loadReplay(accountId);
  if (!s || !Number.isInteger(s.currentIndex)) return null;
  const last = getCandles().length - 1;
  return { ...s, currentIndex: Math.min(Math.max(s.currentIndex, 0), last) };
}

export function start(accountId = DEFAULT_ACCOUNT_ID, store = defaultStore) {
  return withLock(accountId, async () => {
    validateCandles(getCandles());
    const session = {
      instrument: INSTRUMENT,
      source: SOURCE_LABEL,
      currentIndex: 0,
      status: 'active',
      startedAt: new Date().toISOString(),
    };
    await store.saveReplay(accountId, compactSession(session));
    return publicSession(session);
  });
}

export function get(accountId = DEFAULT_ACCOUNT_ID, store = defaultStore) {
  return withLock(accountId, async () => {
    const s = await load(accountId, store);
    if (!s) return { status: 'none' };
    return publicSession(s);
  });
}

export function next(accountId = DEFAULT_ACCOUNT_ID, store = defaultStore) {
  return withLock(accountId, async () => {
    const s = await load(accountId, store);
    if (!s) throw new Error('No active replay session.');
    const candles = getCandles();
    if (s.currentIndex >= candles.length - 1) throw new Error('End of dataset.');
    s.currentIndex += 1;
    if (s.currentIndex === candles.length - 1) s.status = 'completed';
    await store.saveReplay(accountId, compactSession(s));
    return publicSession(s);
  });
}

export function trade(side, quantity, accountId = DEFAULT_ACCOUNT_ID, store = defaultStore) {
  return withLock(accountId, async () => {
    const s = await load(accountId, store);
    if (!s) throw new Error('No active replay session.');
    const current = getCandles()[s.currentIndex];
    if (side === 'buy') return buyAt(INSTRUMENT, quantity, current.close, accountId, store);
    if (side === 'sell') return sellAt(INSTRUMENT, quantity, current.close, accountId, store);
    throw new Error('Invalid side.');
  });
}

export function hold() { return { status: 'hold', message: 'No trade executed.' }; }

function publicSession(s) {
  const candles = getCandles();
  const revealed = candles.slice(0, s.currentIndex + 1);
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
    current: revealed[revealed.length - 1],
    revealed,
    range: { start: candles[0].date, end: candles[candles.length - 1].date },
  };
}
