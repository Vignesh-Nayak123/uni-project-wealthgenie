/**
 * WealthGenie recommendation engine — orchestration service.
 * Ties profileInput → readiness → engine → productData → narrator together.
 */

import { normalizeProfileInput } from './profileInput.js';
import { computeReadiness } from './readiness.js';
import { buildRecommendations } from './engine.js';
import { emptyProductData, createProductDataProvider } from './productData.js';
import { buildFundRecommendations } from './funds.js';
import { getFundCatalog } from './fundData.js';
import { deterministicNarrative, narrateResult } from './narrator.js';

export { ENGINE_VERSION } from './profileInput.js';

/** Map persisted Supabase goal rows (goals.routes.js) to engine goal format. */
export function mapSavedGoals(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row, index) => {
    const targetDate = typeof row.target_date === 'string' ? row.target_date.slice(0, 10) : null;
    let monthsRemaining = null;
    if (targetDate) {
      monthsRemaining = Math.max(0, Math.round((Date.parse(`${targetDate}T00:00:00Z`) - Date.now()) / (86_400_000 * 30.44)));
    }
    const titleToCategory = (title) => {
      const lowered = String(title || '').toLowerCase();
      if (/retire/.test(lowered)) return 'retirement';
      if (/(edu|school|college)/.test(lowered)) return 'education';
      if (/(home|house|property)/.test(lowered)) return 'home_purchase';
      if (/(emergency|medical)/.test(lowered)) return 'emergency_fund';
      return 'wealth_building';
    };
    return {
      index,
      title: row.title || `Goal ${index + 1}`,
      goal: mapSavedGoalCategory(row.category) ?? titleToCategory(row.title),
      targetAmount: row.target_amount !== null && row.target_amount !== undefined ? Number(row.target_amount) : null,
      monthsRemaining,
    };
  });
}

function mapSavedGoalCategory(category) {
  const map = { Retirement: 'retirement', Education: 'education', Security: 'emergency_fund', Milestone: 'other', Lifestyle: 'wealth_building', Other: 'other' };
  return typeof category === 'string' ? map[category] ?? null : null;
}

/**
 * Run the full deterministic pipeline. `getSavedGoals` is an endpoint-provided
 * async loader (returns saved financial goals) — its failure degrades into
 * missingInfo, never into an API error or fabricated goals.
 */
export async function generateRecommendation({ profileInput, getSavedGoals, requireSavedGoals = true }) {
  const { normalized: profile, missing, notes } = normalizeProfileInput(profileInput || {});

  let savedGoals = [];
  let goalsNote = null;
  if (requireSavedGoals && (profile.goals || []).length === 0 && getSavedGoals) {
    try {
      savedGoals = mapSavedGoals(await getSavedGoals());
      if (savedGoals.length === 0) {
        goalsNote = 'You have no saved goals yet. A goal sharpens the ranking but is not required.';
      }
    } catch {
      goalsNote = 'Saved goals could not be loaded right now; the ranking uses only the profile fields provided.';
    }
  }

  const profileWithGoals = {
    ...profile,
    goals: savedGoals.length > 0 ? savedGoals : profile.goals,
  };

  const readiness = computeReadiness(profileWithGoals);
  const result = buildRecommendations(profileWithGoals, readiness);
  const productDataProvider = createProductDataProvider();

  const productData = {};
  for (const entry of result.recommendations) {
    productData[entry.categoryId] = productDataProvider.get
      ? await productDataProvider.get(entry.categoryId)
      : emptyProductData(entry.categoryId);
  }

  // ── Fund-level stage (verified datasets; degrades honestly if missing) ───
  const fundOptions = { limit: normalizeFundLimit(profileInput?.fundLimit) };
  const catalog = getFundCatalog();
  const fundStage = buildFundRecommendations({
    profile: profileWithGoals,
    readiness,
    categoryResults: result.recommendations,
    catalog,
    limit: fundOptions.limit,
  });

  const investable = readiness.investableSurplusPerMonth ?? 0;
  const readinessStatus = result.outcome.status === 'no-suitable-investment-now'
    ? 'invest-later'
    : (result.priorities.some((p) => p.urgency === 'high') ? 'cautious' : 'ready');

  let narrative = deterministicNarrative(result, readiness);
  if (fundStage.fundStage.recommendations?.length > 0) {
    const top = fundStage.fundStage.recommendations[0];
    narrative +=
      `\nVerified-data fund suggestions were ranked under the "${fundStage.fundStage.vital.eligiblePools.join(', ')}" eligibility pools; ` +
      `top scheme #1: ${top.schemeName} (Riskometer ${top.riskometer}, TER ${top.expenseRatio}%). ` +
      'Historical returns are shown for transparency but were not used to rank.';
  } else if (fundStage.fundStage.status !== 'connected') {
    narrative += `\nFund-level suggestions are unavailable right now: ${fundStage.fundStage.note}`;
  }

  return {
    success: true,
    engineVersion: result.engineVersion,
    profileSummary: {
      riskProfile: riskProfileLabel(profile.riskTolerance),
      investmentHorizonMonths: profile.investmentHorizonMonths,
      riskTolerance: profile.riskTolerance,
      readinessStatus,
      investableSurplusPerMonth: readiness.investableSurplusPerMonth,
      derivedRiskCapacity: readiness.riskCapacity.level,
      monthlySurplus: readiness.core.monthlySurplus,
    },
    readiness: {
      readinessVersion: readiness.readinessVersion,
      core: readiness.core,
      debtBurdenPct: readiness.debtBurdenPct,
      investableSurplusPerMonth: readiness.investableSurplusPerMonth,
      riskCapacity: readiness.riskCapacity,
      thresholds: readiness.thresholds,
      calculations: readiness.calculations,
      unknown: readiness.unknown,
      usingFallbackInputs: readiness.usingFallbackInputs,
    },
    priorities: result.priorities,
    // Category-level engine result (transparent, weights in `scoring`).
    categoryRecommendations: result.recommendations,
    // Fund-level results come from the verified dataset (may be empty/unavailable).
    recommendations: fundStage.fundStage.recommendations,
    funds: {
      status: fundStage.fundStage.status,
      note: fundStage.fundStage.note || null,
      stageVersion: fundStage.fundStage.stageVersion || null,
      exclusionsSummary: fundStage.fundStage.exclusionsSummary || null,
      effectiveRiskLevel: fundStage.fundStage.vital?.effectiveRiskLevel ?? null,
      eligiblePools: fundStage.fundStage.vital?.eligiblePools || [],
      scoring: fundStage.fundStage.scoring,
    },
    excluded: result.excluded,
    outcome: result.outcome,
    missingMaterial: result.missingMaterial,
    missing: [...missing, ...(goalsNote ? [{ field: 'Saved goals', material: false }] : [])],
    notes: [...notes, ...(goalsNote ? [goalsNote] : [])],
    scoring: result.scoring,
    productData,
    explanation: {
      source: 'deterministic',
      text: narrative,
      generative: null, // filled below only if the LLM succeeds
    },
    disclaimer:
      'WealthGenie provides educational financial information only — category-level or fund screening guidance, not regulated investment advice. ' +
      'All figures come from the processed AMFI/SEBI datasets or your own profile; returns are historical observations, not promises. ' +
      'Verify scheme documents, TER and risk disclosures on official sources before any decision.',
  };
}

function riskProfileLabel(riskTolerance) {
  if (riskTolerance === null) return 'unknown';
  if (riskTolerance <= 2) return 'conservative';
  if (riskTolerance === 3) return 'moderate';
  return 'aggressive';
}

function normalizeFundLimit(raw) {
  const value = Number(raw ?? 6);
  return Number.isFinite(value) ? Math.max(1, Math.min(10, Math.floor(value))) : 6;
}

/** Attach an optional LLM narration without ever disturbing the result. */
export async function attachGenerativeExplanation(payload, { aiConfig, fetchImpl } = {}) {
  const narration = await narrateResult({
    outcome: payload.outcome,
    priorities: payload.priorities,
    categoryRecommendations: payload.categoryRecommendations,
    fundRecommendations: payload.recommendations,
    excluded: payload.excluded,
    missingMaterial: payload.missingMaterial,
  }, { aiConfig, fetchImpl });

  payload.explanation.generative = narration.ok
    ? {
        source: 'gemini',
        text: narration.text,
        model: aiConfig?.geminiModel ?? (await import('../../config/env.js')).config.geminiModel,
      }
    : { source: narration.reason };

  // Always keep the deterministic text untouched.
  return payload;
}
