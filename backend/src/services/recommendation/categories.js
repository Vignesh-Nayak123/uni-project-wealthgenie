/**
 * WealthGenie recommendation engine — investment-category metadata and
 * transparent eligibility constraints.
 *
 * Categories are evaluated as suitability bands, not products. No fund names,
 * rates, expense ratios, NAVs or prices appear here — those arrive later via
 * the product-data provider interface (productData.js) and always carry a
 * source + as-of date.
 *
 * Risk levels use the official SEBI six-level Riskometer scale so the
 * constraints read directly from a disclosed, regulated classification:
 *   1 Low | 2 Low to Moderate | 3 Moderate |
 *   4 Moderately High | 5 High | 6 Very High
 * (Source: data/sources/sources.json → `sebi-riskometer`.)
 */

export const CATEGORY_RISK_SCALE = Object.freeze({
  1: 'Low',
  2: 'Low to Moderate',
  3: 'Moderate',
  4: 'Moderately High',
  5: 'High',
  6: 'Very High',
});

// how quickly money can typically be withdrawn (independent of returns)
export const LIQUIDITY = Object.freeze({
  INSTANT: 'instant',
  DAYS: 'days',
  WEEKS: 'weeks',
  MONTHS: 'months',
});

/**
 * Hard-eligibility constraints per category. Each constraint is a descriptive
 * guard the engine turns into an explicit exclusion reason — no hidden rules.
 */
export const CATEGORIES = Object.freeze([
  {
    id: 'savings-account',
    label: 'Savings account / emergency reserves',
    riskometerLevel: 1,
    horizonAnchorMonths: 3,          // typical time money sits around
    minHorizonMonths: null,          // works for any horizon
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: false,
    liquidity: LIQUIDITY.INSTANT,
    servesGoals: ['emergency_fund', 'other'],
    description: 'Instantly accessible cash buffer for genuine emergencies.',
    risks: [
      'Cash loses purchasing power over time to inflation.',
      'Benefit depends on the interest the bank advertises; verify rates on the bank’s official page (as-of dated).',
    ],
  },
  {
    id: 'fixed-deposit',
    label: 'Fixed deposits / recurring deposits',
    riskometerLevel: 1,
    horizonAnchorMonths: 12,
    minHorizonMonths: 6,
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: false,
    liquidity: LIQUIDITY.WEEKS,
    servesGoals: ['emergency_fund', 'home_purchase', 'education', 'other'],
    description: 'Locked tenor deposits from banks; rate published by the bank yourself must verify (as-of dated).',
    risks: [
      'Early withdrawal penalties reduce the shown rate back.',
      'The promised rate applies at deposit time; later re-pricing differs.',
      'Interest is taxable; net returns can trail inflation over long horizons.',
    ],
  },
  {
    id: 'liquid-debt-fund',
    label: 'Liquid and short-duration debt funds',
    riskometerLevel: 2,
    horizonAnchorMonths: 6,
    minHorizonMonths: 1,
    maxHorizonMonths: 36,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: false,
    liquidity: LIQUIDITY.DAYS,
    servesGoals: ['emergency_fund', 'home_purchase', 'education', 'other'],
    description: 'Collective investment in short-tenor debt instruments; faster redemption than deposits, but value can move.',
    risks: [
      'Not a deposit: returns are not locked and can be negative.',
      'Exit loads and settlement timing may affect access for a few days.',
      'Category-level Riskometer level 2 of 6; a specific scheme can differ.',
    ],
  },
  {
    id: 'equity-index-fund',
    label: 'Diversified equity funds (index/mutual funds)',
    riskometerLevel: 5,
    horizonAnchorMonths: 60,
    minHorizonMonths: 36,
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: true,
    liquidity: LIQUIDITY.DAYS,
    servesGoals: ['wealth_building', 'retirement', 'education', 'home_purchase'],
    description: 'Broad-market equity exposure, usually via SIP-style monthly investing; value falls as well as rises.',
    risks: [
      'Deep, long-lasting drawdowns are possible: history has shown multi-year negative phases.',
      'Returns depend on future markets — none are guaranteed and every projection shown elsewhere is illustrative.',
      'Requires a positive monthly surplus to sustain disciplined investing.',
    ],
  },
  {
    id: 'equity-etf-direct',
    label: 'ETFs and direct equities',
    riskometerLevel: 6,
    horizonAnchorMonths: 84,
    minHorizonMonths: 60,
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: true,
    requiresBroaderResearch: true,
    liquidity: LIQUIDITY.DAYS,
    servesGoals: ['wealth_building'],
    description: 'Self-directed market securities — the highest research and behaviour demands in this registry.',
    risks: [
      'Individual-company and single-market risks compound; concentration hurts.',
      'Requires continued attention to fees, orders and market mechanics.',
      'Highest Riskometer band; largest realistic loss potential.',
    ],
  },
  {
    id: 'gold',
    label: 'Gold-related investments',
    riskometerLevel: 3,
    horizonAnchorMonths: 60,
    minHorizonMonths: 36,
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: true,
    maxShareNote: 'Gold is usually treated as a portfolio diversifier, not a core holding; category caps apply in scoring.',
    liquidity: LIQUIDITY.DAYS,
    servesGoals: ['wealth_building', 'other'],
    description: 'Exposure to gold-market prices (e.g. gold schemes or stored-metal options); no yield, prices move.',
    risks: [
      'No income; value depends entirely on the gold price.',
      'Physical options add making-charges and storage/security considerations.',
      'Long flat periods are possible.',
    ],
  },
  {
    id: 'retirement-oriented',
    label: 'Retirement-oriented options',
    riskometerLevel: 4,
    horizonAnchorMonths: 240,
    minHorizonMonths: 120,
    maxHorizonMonths: null,
    minMonthlySurplus: 0,
    needsEmergencyFundFirst: true,
    requiresRetirementGoalOrLongHorizon: true,
    liquidity: LIQUIDITY.MONTHS,
    servesGoals: ['retirement', 'wealth_building'],
    description: 'Long-horizon vehicles designed around retirement timelines (e.g. pension-style products); lock-ins and rules apply.',
    risks: [
      'Lock-ins make early access hard or costly.',
      'Tax rules and scheme features change over decades — re-check at decision time.',
      'Equity-linked variants inherit full market risk.',
    ],
  },
]);

export const CATEGORY_IDS = Object.freeze(CATEGORIES.map((c) => c.id));

/** Runtime sanity guard for the registry itself (used by tests). */
export function validateProductMetadata() {
  const problems = [];
  const seen = new Set();
  for (const category of CATEGORIES) {
    if (!category.id || seen.has(category.id)) problems.push(`Duplicate/missing id: ${category.id}`);
    seen.add(category.id);
    if (!Number.isInteger(category.riskometerLevel) || category.riskometerLevel < 1 || category.riskometerLevel > 6) {
      problems.push(`${category.id}: riskometerLevel must be 1–6`);
    }
    if (category.minHorizonMonths !== null && category.maxHorizonMonths !== null
      && category.minHorizonMonths > category.maxHorizonMonths) {
      problems.push(`${category.id}: inconsistent horizon bounds`);
    }
    for (const field of ['description', 'risks', 'liquidity', 'servesGoals']) {
      if (category[field] === undefined || (Array.isArray(category[field]) && category[field].length === 0)) {
        problems.push(`${category.id}: missing ${field}`);
      }
    }
  }
  return problems;
}
