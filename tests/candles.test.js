import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCandles } from '../frontend/src/utils/candles.js';

const daily = [
  { date: '2026-04-29', open: 3, high: 4, low: 2, close: 3.5 },
  { date: '2026-04-27', open: 1, high: 2, low: 0.5, close: 1.5 },
  { date: '2026-04-28', open: 2, high: 3, low: 1.5, close: 2.5 },
];

describe('normalizeCandles', () => {
  it('sorts daily candles chronologically (string times)', () => {
    const rows = normalizeCandles(daily);
    assert.deepEqual(
      rows.map((row) => row.time),
      ['2026-04-27', '2026-04-28', '2026-04-29']
    );
  });

  it('is idempotent: normalised rows survive a second pass (page + chart)', () => {
    const once = normalizeCandles(daily);
    const twice = normalizeCandles(once);
    assert.equal(twice.length, 3);
    assert.deepEqual(twice, once);
  });

  it('keeps intraday epoch-second times through a second pass', () => {
    const live = [
      { date: '2026-11-16T09:16:00.000Z', open: 287, high: 288, low: 286.5, close: 287.6 },
      { date: '2026-11-16T09:15:00.000Z', open: 286, high: 287, low: 285.9, close: 287 },
    ];
    const twice = normalizeCandles(normalizeCandles(live));
    assert.equal(twice.length, 2);
    assert.ok(twice[0].time < twice[1].time);
    assert.equal(typeof twice[0].time, 'number');
  });

  it('accepts backend live candles with epoch-millisecond time', () => {
    const rows = normalizeCandles([
      { time: 1794824940000, open: 2, high: 2, low: 2, close: 2 },
      { time: 1794824880000, open: 1, high: 1, low: 1, close: 1 },
    ]);
    assert.deepEqual(rows.map((row) => row.time), [1794824880, 1794824940]);
  });

  it('drops rows without a usable time or price', () => {
    assert.equal(normalizeCandles([{ open: 1, high: 1, low: 1, close: 1 }]).length, 0);
    assert.equal(normalizeCandles([{ date: '2026-01-01', open: 'x', high: 1, low: 1, close: 1 }]).length, 0);
    assert.deepEqual(normalizeCandles(null), []);
  });
});
