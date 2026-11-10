// Deterministic test setup: force the narrator into its unconfigured fallback
// path so tests never depend on a locally configured Gemini key.
process.env.GEMINI_API_KEY = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeProfileInput,
  ENGINE_VERSION,
  RISK_TOLERANCE_LEVELS,
} from '../backend/src/services/recommendation/profileInput.js';
import {
  computeReadiness,
  THRESHOLDS,
} from '../backend/src/services/recommendation/readiness.js';
import {
  buildRecommendations,
  SCORING_WEIGHTS,
} from '../backend/src/services/recommendation/engine.js';
import {
  deterministicNarrative,
  narrateResult,
} from '../backend/src/services/recommendation/narrator.js';
import {
  CATEGORIES,
  CATEGORY_IDS,
  validateProductMetadata,
} from '../backend/src/services/recommendation/categories.js';
import {
  emptyProductData,
  createProductDataProvider,
  MAX_FRESH_DAYS,
  PRODUCT_DATA_FIELDS,
} from '../backend/src/services/recommendation/productData.js';
import {
  generateRecommendation,
  mapSavedGoals,
} from '../backend/src/services/recommendation/index.js';

const STRONG_PROFILE = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  emiPayments: 10000,
  emiIncludedInExpenses: true,
  accessibleSavings: 600000,
  incomeStability: 'stable',
  riskTolerance: 4,
  investmentHorizonMonths: 180,
  liquidityNeedMonths: 3,
  goals: [{ title: 'Retire comfortably', goal: 'retirement' }],
};

describe('profile input validation', () => {
  it('accepts zero income without inventing values', () => {
    const { normalized, missing } = normalizeProfileInput({
      monthlyIncome: 0,
      monthlyExpenses: 0,
      emiPayments: 0,
      emiIncludedInExpenses: true,
      accessibleSavings: 0,
    });
    assert.equal(normalized.monthlyIncome, 0);
    assert.equal(missing.some((m) => /Monthly income/i.test(m.field)), false);
  });

  it('flags missing material fields instead of defaulting them to zero', () => {
    const { normalized, missing } = normalizeProfileInput({});
    assert.equal(normalized.monthlyIncome, null);
    assert.equal(normalized.incomeStability, null);
    assert.equal(normalized.riskTolerance, null);
    const fields = missing.map((m) => m.field);
    assert.ok(fields.includes('Monthly income'));
    assert.ok(fields.includes('Risk tolerance'));
    assert.ok(fields.includes('Income stability'));
  });

  it('rejects negative or invalid values with readable errors', () => {
    assert.throws(
      () => normalizeProfileInput({ ...STRONG_PROFILE, monthlyIncome: -1 }),
      /Monthly income must be zero or greater/
    );
    assert.throws(
      () => normalizeProfileInput({ ...STRONG_PROFILE, riskTolerance: 7 }),
      /Risk tolerance must be a whole number between 1 and 5/
    );
    assert.throws(
      () => normalizeProfileInput({ ...STRONG_PROFILE, incomeStability: 'seasonal' }),
      /Income stability must be one of/
    );
    assert.throws(
      () => normalizeProfileInput({ ...STRONG_PROFILE, accessibleSavings: 'lots' }),
      /Accessible/
    );
  });

  it('exposes the published risk-tolerance scale and engine version', () => {
    assert.deepEqual(RISK_TOLERANCE_LEVELS, [1, 2, 3, 4, 5]);
    assert.equal(ENGINE_VERSION, '1.0.0');
  });
});

describe('readiness engine (deterministic math)', () => {
  it('computes surplus, coverage, burden and capacity with explanations', () => {
    const { normalized } = normalizeProfileInput(STRONG_PROFILE);
    const readiness = computeReadiness(normalized);
    // EMI already inside expenses must NOT be subtracted again.
    assert.equal(readiness.core.monthlySurplus, 60000);
    assert.equal(readiness.core.emergencyFundCoverageMonths, 15);
    assert.equal(readiness.debtBurdenPct, 10);
    assert.ok(readiness.investableSurplusPerMonth >= 0);
    assert.ok(
      readiness.calculations
        .find((c) => c.id === 'monthly-surplus')
        .explanation.includes('not subtracted again')
    );
  });

  it('derives a higher risk capacity for a stronger financial position', () => {
    const strong = computeReadiness(normalizeProfileInput(STRONG_PROFILE).normalized);
    const weak = computeReadiness(
      normalizeProfileInput({
        monthlyIncome: 30000,
        monthlyExpenses: 35000,
        accessibleSavings: 5000,
        incomeStability: 'irregular',
        riskTolerance: 5,
      }).normalized
    );
    assert.ok(strong.riskCapacity.level > weak.riskCapacity.level);
    assert.ok(weak.riskCapacity.factors.some((f) => f.points === 0));
  });

  it('reserves half the surplus for the cushion while coverage is below minimum', () => {
    const readiness = computeReadiness(
      normalizeProfileInput({
        ...STRONG_PROFILE,
        monthlyIncome: 100000,
        monthlyExpenses: 90000,
        accessibleSavings: 60000,
      }).normalized
    );
    assert.ok(readiness.core.emergencyFundCoverageMonths < 1);
    assert.equal(readiness.investableSurplusPerMonth, 5000);
    assert.equal(THRESHOLDS.EMERGENCY_MIN_MONTHS, 3);
  });

  it('degrades to explicit unknowns when material inputs are missing', () => {
    const readiness = computeReadiness(normalizeProfileInput({}).normalized);
    assert.equal(readiness.core.monthlySurplus, null);
    assert.equal(readiness.investableSurplusPerMonth, null);
    assert.deepEqual(readiness.unknown, ['monthly_income', 'monthly_expenses']);
  });
});

describe('recommendation engine (filter → score → rank)', () => {
  it('is fully deterministic for identical inputs', async () => {
    const first = await runEngine(STRONG_PROFILE);
    const second = await runEngine(STRONG_PROFILE);
    assert.deepEqual(first, second);

    const ranked = first.categoryRecommendations.map((r) => [r.score, r.categoryId]);
    const reSorted = [...ranked].sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
    assert.deepEqual(ranked, reSorted);
  });

  it('publishes fixed scoring weights', () => {
    assert.deepEqual(SCORING_WEIGHTS, {
      horizonFit: 0.3,
      riskFit: 0.25,
      liquidityFit: 0.2,
      goalAlignment: 0.25,
    });
  });

  it('pauses investing during negative surplus and reports the priority', async () => {
    const result = await runEngine({
      ...STRONG_PROFILE,
      monthlyIncome: 20000,
      monthlyExpenses: 30000,
      accessibleSavings: 5000,
    });
    assert.ok(result.priorities.some((p) => p.id === 'negative-surplus'));
    assert.equal(result.outcome.status, 'no-suitable-investment-now');
    assert.ok(result.excluded.some((e) => e.categoryId === 'equity-index-fund'));
  });

  it('handles a zero-income profile safely without invented numbers', async () => {
    const result = await runEngine({
      monthlyIncome: 0,
      monthlyExpenses: 8000,
      emiPayments: 0,
      emiIncludedInExpenses: true,
      accessibleSavings: 25000,
      incomeStability: 'irregular',
      riskTolerance: 2,
      investmentHorizonMonths: 6,
    });
    assert.equal(result.readiness.investableSurplusPerMonth, 0);
    assert.equal(result.readiness.core.savingsRatePct, null);
    assert.equal(result.outcome.status, 'no-suitable-investment-now');
  });

  it('suggests building the emergency cushion first when coverage is thin', async () => {
    const result = await runEngine({
      ...STRONG_PROFILE,
      monthlyIncome: 100000,
      monthlyExpenses: 90000,
      accessibleSavings: 60000,
    });
    const priority = result.priorities.find((p) => p.id === 'emergency-fund-building');
    assert.ok(priority, 'expected an emergency-fund priority');
    // Coverage is below 1 month → high urgency.
    assert.equal(priority.urgency, 'high');
  });

  it('excludes categories whose minimum horizon is not met, and unlocks them later', async () => {
    const short = await runEngine({
      ...STRONG_PROFILE,
      investmentHorizonMonths: 12,
      goals: [{ title: 'trip', goal: 'other' }],
    });
    assert.ok(short.excluded.some((e) => e.categoryId === 'equity-index-fund'));
    assert.ok(short.excluded.some((e) => e.categoryId === 'retirement-oriented'));

    const long = await runEngine({
      ...STRONG_PROFILE,
      goals: [{ title: 'trip', goal: 'other' }],
    });
    assert.ok(long.categoryRecommendations.some((r) => r.categoryId === 'equity-index-fund'));
  });

  it('keeps retirement lock-ins horizon-gated even when the goal states retirement', async () => {
    const longHorizonWealth = await runEngine({
      ...STRONG_PROFILE,
      goals: [{ title: 'wealth', goal: 'wealth_building' }],
    });
    assert.ok(longHorizonWealth.categoryRecommendations.some((r) => r.categoryId === 'retirement-oriented'));

    // Safety rule: a retirement goal alone must not force long-lock-in money
    // into a short plan; the horizon gate dominates.
    const shortHorizonWithGoal = await runEngine({
      ...STRONG_PROFILE,
      investmentHorizonMonths: 12,
      goals: [{ title: 'Retirement', goal: 'retirement' }],
    });
    assert.ok(shortHorizonWithGoal.excluded.some((e) => e.categoryId === 'retirement-oriented'));
  });

  it('respects low derived risk capacity by excluding high-band categories', async () => {
    const result = await runEngine({
      ...STRONG_PROFILE,
      incomeStability: 'irregular',
      monthlyIncome: 30000,
      monthlyExpenses: 25000,
      accessibleSavings: 40000,
      riskTolerance: 5,
      investmentHorizonMonths: 180,
      goals: [{ title: 'wealth', goal: 'wealth_building' }],
    });
    assert.ok(
      result.excluded.some(
        (e) => e.categoryId === 'equity-index-fund' && /risk capacity/i.test(e.reason)
      )
    );
  });

  it('aligns liquidity fit with the stated need to reach money', async () => {
    const result = await runEngine({ ...STRONG_PROFILE, liquidityNeedMonths: 0.25 });
    const savings = result.categoryRecommendations.find((r) => r.categoryId === 'savings-account');
    const gold = result.categoryRecommendations.find((r) => r.categoryId === 'gold');
    // Instant access is marginally slower than a 0.25-month immediate need…
    assert.ok(savings && savings.scoreBreakdown.liquidityFit.factor < 1);
    // …while same-day category redemption matches the need exactly.
    assert.ok(gold && gold.scoreBreakdown.liquidityFit.factor === 1);
  });

  it('records missing material information that shapes the result', async () => {
    const result = await runEngine({
      monthlyIncome: 100000,
      monthlyExpenses: 40000,
      accessibleSavings: 300000,
      incomeStability: 'stable',
    });
    const fields = result.missingMaterial.map((m) => m.field);
    assert.ok(fields.includes('Risk tolerance'));
    assert.ok(fields.includes('Investment horizon'));
  });

  it('keeps every engine explanation honest about being category-level', async () => {
    const { normalized } = normalizeProfileInput(STRONG_PROFILE);
    const readiness = computeReadiness(normalized);
    const result = buildRecommendations(normalized, readiness);
    const narrative = deterministicNarrative(result, readiness);
    assert.match(narrative, /Educational information only|verify every rate|official sources/i);
    assert.match(narrative, /risk capacity/i);
    // buildRecommendations' raw output (engine.js namespace) — unchanged keys.
    for (const entry of result.recommendations) {
      assert.ok(entry.suitabilityConditions.some((c) => /category-level/i.test(c)));
    }
  });
});

describe('the LLM narrator can be removed entirely', () => {
  const structuredStub = {
    outcome: { status: 'categories-suggested', headline: 'test' },
    priorities: [],
    recommendations: [],
    excluded: [],
    missingMaterial: [],
  };

  it('falls back when Gemini is not configured', async () => {
    const result = await narrateResult(structuredStub, { aiConfig: {} });
    assert.deepEqual(result, { ok: false, reason: 'unconfigured' });
  });

  it('returns the reworded text on success without altering the result', async () => {
    const result = await narrateResult(structuredStub, {
      aiConfig: { isAiConfigured: true, geminiApiKey: 'k', geminiModel: 'test-model' },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: 'reworded' }] } }] }),
      }),
    });
    assert.equal(result.ok, true);
    assert.equal(result.text, 'reworded');
  });

  it('falls back on provider failures', async () => {
    const httpFail = await narrateResult(structuredStub, {
      aiConfig: { isAiConfigured: true, geminiApiKey: 'k', geminiModel: 'm' },
      fetchImpl: async () => ({ ok: false, status: 503 }),
    });
    assert.deepEqual(httpFail, { ok: false, reason: 'provider_http_503' });

    const netFail = await narrateResult(structuredStub, {
      aiConfig: { isAiConfigured: true, geminiApiKey: 'k', geminiModel: 'm' },
      fetchImpl: async () => {
        throw new Error('offline');
      },
    });
    assert.deepEqual(netFail, { ok: false, reason: 'provider_unreachable' });
  });
});

describe('category registry and product-data interface', () => {
  it('provides all seven documented categories with valid metadata', () => {
    assert.equal(validateProductMetadata().length, 0);
    assert.deepEqual(CATEGORY_IDS, [
      'savings-account',
      'fixed-deposit',
      'liquid-debt-fund',
      'equity-index-fund',
      'equity-etf-direct',
      'gold',
      'retirement-oriented',
    ]);
    for (const category of CATEGORIES) {
      assert.ok(category.risks.length >= 2, `${category.id} must disclose risks`);
      assert.ok(category.riskometerLevel >= 1 && category.riskometerLevel <= 6);
    }
  });

  it('returns unavailable/unconnected product data and never zeros', async () => {
    const provider = createProductDataProvider();
    const connected = await provider.get('gold');
    assert.equal(connected.status, 'unconnected');
    assert.equal(connected.data, null);
    assert.match(connected.message, /no verified product data/i);

    const unknown = await provider.get('not-a-category');
    assert.equal(unknown.status, 'unavailable');

    const stale = await provider.isStale({ asOf: '2000-01-01' });
    assert.equal(stale.stale, true);
    const fresh = await provider.isStale({ asOf: new Date().toISOString().slice(0, 10) });
    assert.equal(fresh.stale, false);
    assert.equal(emptyProductData('savings-account').fieldsAvailable.length, PRODUCT_DATA_FIELDS.length);
    assert.equal(MAX_FRESH_DAYS, 10);
  });
});

describe('saved-goal integration', () => {
  it('maps persisted goal rows onto canonical assessment goal kinds', () => {
    const mapped = mapSavedGoals([
      { title: 'Safety', category: 'Security', target_amount: '100000', target_date: '2027-01-01' },
      { title: 'Degree', category: 'Milestone', target_amount: null, target_date: null },
      { title: 'Travel', category: 'Lifestyle', target_amount: '50000', target_date: null },
      { title: 'Retirement corpus', category: 'Retirement', target_amount: '5000000', target_date: '2046-01-01' },
    ]);
    assert.deepEqual(
      mapped.map((g) => g.goal),
      // Security→emergency fund, Milestone→other, Lifestyle→wealth building.
      ['emergency_fund', 'other', 'wealth_building', 'retirement']
    );
    assert.ok(mapped[3].monthsRemaining > 12);
    assert.equal(mapped[0].targetAmount, 100000);
  });

  it('degrades gracefully when saved goals cannot be loaded', async () => {
    const result = await generateRecommendation({
      profileInput: { ...STRONG_PROFILE, goals: [] },
      getSavedGoals: () => {
        throw new Error('db down');
      },
    });
    assert.ok(result.notes.some((n) => /Saved goals could not be loaded/i.test(n)));
  });
});

// ─── helpers ────────────────────────────────────────────────────────────────
async function runEngine(profileInput) {
  return generateRecommendation({ profileInput, requireSavedGoals: false });
}
