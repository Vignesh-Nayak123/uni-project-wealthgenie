/**
 * Small aggregation and serialization helpers for the experiment runner.
 * No external dependencies.
 */

export function nearlyEqual(a, b, tolerance = 1e-9) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return Object.is(a, b);
  }
  return (
    Math.abs(a - b) <=
    tolerance * Math.max(1, Math.abs(a), Math.abs(b))
  );
}

export function sameValue(expected, actual, tolerance = 1e-9) {
  const expectedMissing = expected === null || expected === undefined;
  const actualMissing = actual === null || actual === undefined;

  if (expectedMissing || actualMissing) {
    return expectedMissing && actualMissing;
  }

  if (typeof expected === 'number' && typeof actual === 'number') {
    return nearlyEqual(expected, actual, tolerance);
  }

  if (
    typeof expected === 'boolean' ||
    typeof actual === 'boolean' ||
    typeof expected === 'string' ||
    typeof actual === 'string'
  ) {
    return expected === actual;
  }

  return stableStringify(expected) === stableStringify(actual);
}

export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(',')}}`;
}

export function createCounter() {
  return { total: 0, passed: 0 };
}

export function recordResult(counter, pass) {
  counter.total += 1;
  if (pass) counter.passed += 1;
  return pass;
}

export function finalizeCounter(counter) {
  return {
    passed: counter.passed,
    total: counter.total,
    failed: counter.total - counter.passed,
    rate: counter.total === 0 ? null : counter.passed / counter.total,
  };
}

export function createErrorAccumulator() {
  return {
    numericTotal: 0,
    maxAbsError: 0,
    sumAbsError: 0,
    nullMismatches: 0,
    mismatches: 0,
  };
}

export function recordNumericError(accumulator, expected, actual) {
  const expectedNumber =
    typeof expected === 'number' && Number.isFinite(expected);
  const actualNumber = typeof actual === 'number' && Number.isFinite(actual);

  if (!expectedNumber || !actualNumber) {
    if (expectedNumber !== actualNumber) accumulator.nullMismatches += 1;
    return;
  }

  const error = Math.abs(expected - actual);
  accumulator.numericTotal += 1;
  accumulator.sumAbsError += error;
  if (error > accumulator.maxAbsError) accumulator.maxAbsError = error;
  if (!nearlyEqual(expected, actual)) accumulator.mismatches += 1;
}

export function finalizeErrorAccumulator(accumulator) {
  return {
    numericAssertions: accumulator.numericTotal,
    maxAbsError: accumulator.maxAbsError,
    meanAbsError:
      accumulator.numericTotal === 0
        ? null
        : accumulator.sumAbsError / accumulator.numericTotal,
    nullMismatches: accumulator.nullMismatches,
    mismatches: accumulator.mismatches,
  };
}

export function arrayEquals(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function roundNumber(value, digits = 6) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows, columns) {
  const keys = columns.map((column) =>
    typeof column === 'string' ? column : column.key
  );
  const headers = columns.map((column) =>
    typeof column === 'string' ? column : column.header ?? column.key
  );

  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    lines.push(keys.map((key) => csvEscape(row[key])).join(','));
  }

  return `${lines.join('\n')}\n`;
}

export function takeFirst(items, limit) {
  return items.slice(0, limit);
}
