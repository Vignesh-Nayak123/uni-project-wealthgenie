/**
 * Deterministic pseudo-random number generation for synthetic profiles.
 *
 * `mulberry32` is a small, dependency-free 32-bit PRNG. It is seeded from a
 * single integer and produces the same sequence for the same seed on every
 * platform and Node.js version. It is not cryptographically secure and must
 * never be used for secrets or production randomness.
 */

export function mulberry32(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randBetween(rng, min, max) {
  return min + rng() * (max - min);
}

export function randInt(rng, min, max) {
  return Math.floor(randBetween(rng, min, max + 1));
}

export function pick(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

export function chance(rng, probability) {
  return rng() < probability;
}

/** Round to the nearest multiple of `step` (for readable INR-style amounts). */
export function roundTo(value, step) {
  return Math.round(value / step) * step;
}

/** Round a monetary amount to paise and never return a negative value. */
export function roundMoney(value) {
  return Math.max(0, Math.round(value * 100) / 100);
}
