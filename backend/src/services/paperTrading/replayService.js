import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCandles, INSTRUMENT, SOURCE_LABEL, validateCandles } from './historicalProvider.js';
import { buyAt, sellAt } from './simulationService.js';
import * as persistence from './persistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_PATH = path.resolve(__dirname, '../../data/paper-replay-state.json');

let lock = Promise.resolve();
function withLock(fn) { const next = lock.then(() => fn()); lock = next.catch(() => {}); return next; }

function load() {
  if (!fs.existsSync(STATE_PATH)) return null;
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}
function save(s) {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

export function start() {
  return withLock(() => {
    validateCandles(getCandles());
    const candles = getCandles();
    const session = { instrument: INSTRUMENT, source: SOURCE_LABEL, currentIndex: 0, revealed: [candles[0]], status: 'active', startedAt: new Date().toISOString() };
    save(session);
    return publicSession(session);
  });
}

export function get() {
  return withLock(() => {
    const s = load();
    if (!s) return { status: 'none' };
    return publicSession(s);
  });
}

export function next() {
  return withLock(() => {
    const s = load();
    if (!s) throw new Error('No active replay session.');
    const candles = getCandles();
    if (s.currentIndex >= candles.length - 1) throw new Error('End of dataset.');
    s.currentIndex += 1;
    s.revealed.push(candles[s.currentIndex]);
    if (s.currentIndex === candles.length - 1) s.status = 'completed';
    save(s);
    return publicSession(s);
  });
}

export function trade(side, quantity) {
  return withLock(() => {
    const s = load();
    if (!s) throw new Error('No active replay session.');
    const current = s.revealed[s.revealed.length - 1];
    if (side === 'buy') return buyAt(INSTRUMENT, quantity, current.close);
    if (side === 'sell') return sellAt(INSTRUMENT, quantity, current.close);
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
