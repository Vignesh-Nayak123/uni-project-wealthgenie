import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  arrayEquals,
  createCounter,
  createErrorAccumulator,
  finalizeCounter,
  finalizeErrorAccumulator,
  nearlyEqual,
  recordNumericError,
  recordResult,
  sameValue,
  stableStringify,
  toCsv,
} from '../experiments/lib/metrics.js';

describe('Phase 4 metric aggregation helpers', () => {
  it('compares numbers with a relative tolerance', () => {
    assert.equal(nearlyEqual(1, 1 + 1e-12), true);
    assert.equal(nearlyEqual(1, 1.1), false);
    assert.equal(sameValue(1, 1 + 1e-12), true);
    assert.equal(sameValue(1, 1.1), false);
    assert.equal(sameValue(null, undefined), true);
    assert.equal(sameValue(null, 0), false);
    assert.equal(sameValue(true, true), true);
    assert.equal(sameValue('a', 'a'), true);
    assert.equal(sameValue({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  });

  it('serializes objects with stable key order', () => {
    assert.equal(
      stableStringify({ b: 2, a: 1 }),
      stableStringify({ a: 1, b: 2 })
    );
    assert.equal(stableStringify([1, { b: 2, a: 1 }]), '[1,{"a":1,"b":2}]');
  });

  it('counts passed and failed assertions', () => {
    const counter = createCounter();
    recordResult(counter, true);
    recordResult(counter, false);
    recordResult(counter, true);

    assert.deepEqual(finalizeCounter(counter), {
      passed: 2,
      total: 3,
      failed: 1,
      rate: 2 / 3,
    });
  });

  it('tracks numeric error statistics and null mismatches', () => {
    const accumulator = createErrorAccumulator();
    recordNumericError(accumulator, 1, 1.1);
    recordNumericError(accumulator, 2, 2);
    recordNumericError(accumulator, null, 1);
    recordNumericError(accumulator, 1, null);

    const summary = finalizeErrorAccumulator(accumulator);
    assert.equal(summary.numericAssertions, 2);
    assert.ok(Math.abs(summary.maxAbsError - 0.1) < 1e-9);
    assert.ok(Math.abs(summary.meanAbsError - 0.05) < 1e-9);
    assert.equal(summary.nullMismatches, 2);
    assert.equal(summary.mismatches, 1);
  });

  it('compares arrays exactly', () => {
    assert.equal(arrayEquals(['a', 'b'], ['a', 'b']), true);
    assert.equal(arrayEquals(['a', 'b'], ['b', 'a']), false);
    assert.equal(arrayEquals(['a'], ['a', 'b']), false);
    assert.equal(arrayEquals(null, []), false);
  });

  it('escapes CSV values and headers', () => {
    const csv = toCsv(
      [{ a: 'x,y', b: 'quote"', c: null }],
      ['a', 'b', 'c']
    );

    assert.equal(csv, 'a,b,c\n"x,y","quote""",\n');
  });
});
