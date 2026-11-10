/**
 * WealthGenie recommendation engine — product-data provider interface.
 *
 * The deterministic engine recommends CATEGORIES only. When verified product
 * data (fund NAVs, scheme facts, expense ratios, Riskometer levels, bank FD
 * rates) becomes available, providers implement this interface and the
 * recommendation payload gains a `productData` block per category.
 *
 * Contract rules:
 * - Every real datum carries `source` (registry id / URL) and `asOf` (ISO date).
 * - Missing or stale (`asOf` older than `maxAgeDays`) data is returned as
 *   `{ status: 'unavailable', reason }` — NEVER substituted with zero or an
 *   assumed value.
 * - Providers must not alter eligibility/scoring; they only enrich display.
 */

import { CATEGORY_IDS } from './categories.js';

export const PRODUCT_DATA_FIELDS = Object.freeze([
  'schemeName',        // verified scheme/fact title
  'nav',               // latest NAV with asOf
  'expenseRatio',      // direct-plan TER with asOf
  'riskometerLevel',   // 1–6 with asOf (AMC disclosure)
  'benchmark',         // disclosed benchmark identifier
  'currentFdRate',     // slab table with asOf (bank official page)
  'latestPrice',       // ETF/direct-equity price with asOf
]);

export const MAX_FRESH_DAYS = Object.freeze(10); // fund/price disclosure cadence

export function emptyProductData(categoryId) {
  return {
    categoryId,
    status: 'unconnected',
    message: 'No verified product data is connected for this category yet. Recommendations remain category-level only.',
    data: null,
    fieldsAvailable: PRODUCT_DATA_FIELDS,
  };
}

/**
 * Current provider: nothing connected yet — returns an honest unconnected
 * status per category so stale/missing data is explicit, not fabricated.
 */
export function createProductDataProvider() {
  return {
    id: 'local-registry-v1',
    async get(categoryId) {
      if (!CATEGORY_IDS.includes(categoryId)) {
        return { ...emptyProductData(categoryId), status: 'unavailable', reason: 'Unknown category id.' };
      }
      return emptyProductData(categoryId);
    },
    async isStale(entry) {
      if (!entry?.asOf) return { stale: true, reason: 'No as-of date recorded.' };
      const ageDays = (Date.now() - Date.parse(entry.asOf)) / 86_400_000;
      return { stale: ageDays > MAX_FRESH_DAYS, ageDays: Math.floor(ageDays) };
    },
  };
}
