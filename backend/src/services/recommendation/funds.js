/**
 * WealthGenie recommendation engine — fund-level stage.
 *
 * Content-based, rule-constrained candidate ranking over the verified merged
 * fund dataset (build_fund_dataset.py + build_nav_metrics.py outputs).
 * Collaborative filtering is deliberately NOT used: the repository has no
 * verified user-fund interaction data, and inventing it would violate the
 * data-integrity contract.
 *
 * Stages (mirrors the task contract):
 *   Stage 3 — hard eligibility filtering (constraints can NEVER be overridden
 *             by a ranking score; ineligible funds carry explicit reasons).
 *   Stage 4 — transparent weighted scoring with fixed published weights.
 *   Stage 5 — explainable output (metric values + per-factor breakdown + risks).
 *
 * Normalization rules (documented per factor):
 *   riskAlignment — 1 − |effectiveRisk − fundRiskometerLevel| / 4, clipped to 0
 *   expenseRatio  — linear 0.10% → 1 … 2.50% → 0 (best TER across plans;
 *                   direct-plan TER preferred when both exist)
 *   volatility    — linear 2% → 1 … 30% → 0 annualized-log-return estimate
 *   maxDrawdown   — linear 15% → 1 … 60% → 0 (peak-to-trough NAV loss)
 *   consistency   — positive rolling-year fraction (data-missing → 0.5 neutral
 *                   with a note; never punished for missing data)
 *   completeness  — share of (TER, benchmark, 3Y history, holdings, fresh NAV)
 *
 * Historical returns are NOT a scoring factor — by design dense-return chasing
 * is one of the anti-patterns this engine avoids. Performance figures are
 * displayed for transparency only.
 */

import { getFundCatalog } from './fundData.js';

export const FUND_SCORING_WEIGHTS = Object.freeze({
  riskAlignment: 0.3,
  expenseRatio: 0.2,
  volatility: 0.15,
  maxDrawdown: 0.15,
  consistency: 0.15,
  dataCompleteness: 0.05,
});

export const FUND_STAGE_VERSION = '1.0.0';

/** NAV freshness ceiling for recommending (category COMFORT is not required) */
export const MAX_NAV_FRESHNESS_DAYS = 30;

const SEBI_RISK_LABELS = Object.freeze({
  1: 'Low',
  2: 'Low to Moderate',
  3: 'Moderate',
  4: 'Moderately High',
  5: 'High',
  6: 'Very High',
});

/**
 * Exported so the evaluation runner (and tests) can independently re-derive
 * the hard eligibility semantics instead of trusting the engine blindly.
 */
export const CATEGORY_FUND_POOLS = Object.freeze({
  'savings-account': {
    groups: ['Debt Scheme'],
    riskMin: 1,
    riskMax: 2,
    categoryRegexes: [/liquid/i, /overnight/i, /money market/i, /savings/i],
    minHorizonMonths: 0,
    needsReturnWindow: null,
  },
  'fixed-deposit': {
    groups: ['Debt Scheme'],
    riskMin: 1,
    riskMax: 2,
    categoryRegexes: [/short/i, /low duration/i, /money market/i, /ultra/i],
    minHorizonMonths: 6,
    needsReturnWindow: 'one_year',
  },
  'liquid-debt-fund': {
    groups: ['Debt Scheme'],
    riskMin: 1,
    riskMax: 3,
    categoryRegexes: [/liquid/i, /short/i, /low duration/i, /money market/i, /ultra/i, /banking/i],
    minHorizonMonths: 1,
    needsReturnWindow: null,
  },
  'equity-index-fund': {
    groups: ['Equity Scheme', 'Hybrid Scheme'],
    riskMin: 3,
    riskMax: 6,
    categoryRegexes: [/index/i, /large/i, /flexi/i, /large.?mid/i, /multi.?cap/i, /value/i, /focussed/i, /focused/i],
    minHorizonMonths: 36,
    needsReturnWindow: 'three_year',
  },
  'equity-etf-direct': {
    groups: ['Equity Scheme'],
    riskMin: 4,
    riskMax: 6,
    categoryRegexes: [/index/i, /large/i, /flexi/i, /value/i, /focussed/i, /focused/i, /mid/i, /small/i],
    minHorizonMonths: 60,
    needsReturnWindow: 'three_year',
  },
  gold: {
    groups: ['Other Scheme'],
    // Verified against the real dataset (check_bands.py): the 16 gold schemes
    // carry Riskometer High (9) / Very High (2) / missing (5) — none below High.
    riskMin: 4,
    riskMax: 6,
    categoryRegexes: [/gold/i],
    minHorizonMonths: 36,
    needsReturnWindow: 'one_year',
  },
  'retirement-oriented': {
    groups: ['Debt Scheme', 'Equity Scheme', 'Hybrid Scheme', 'Other Scheme'],
    riskMin: 3,
    riskMax: 6,
    categoryRegexes: [/retirement/i, /pension/i],
    minHorizonMonths: 120,
    needsReturnWindow: 'three_year',
  },
});

function effectiveRiskLevel(profile, readiness) {
  const tolerance = profile.riskTolerance ?? readiness.riskCapacity.level;
  return Math.min(tolerance, readiness.riskCapacity.level);
}

function matchesCategoryRule(categoryValue, regexes) {
  if (!categoryValue) return false;
  return regexes.some((regex) => regex.test(categoryValue));
}

/**
 * Stage 3 — hard eligibility.
 * @returns {{ ok: boolean, reason?: string, limitation?: string }}
 */
export function isFundEligible(fund, { groups, riskMin, riskMax, categoryRegexes, minHorizonMonths, needsReturnWindow }, profile) {
  if (fund.riskometerLevel === null || fund.riskometerLevel === undefined) {
    return { ok: false, reason: 'Riskometer missing from the verified dataset.' };
  }
  if (fund.riskometerLevel < riskMin || fund.riskometerLevel > riskMax) {
    return {
      ok: false,
      reason: `Riskometer level ${fund.riskometerLevel} outside the eligible band ${riskMin}–${riskMax} for the ${fund.categoryGroupMatch || 'matched'} category.`,
    };
  }
  const groupOk = groups.length === 0 || groups.includes(fund.categoryGroup);
  if (!groupOk) {
    return { ok: false, reason: `Category group "${fund.categoryGroup}" is not eligible for this guidance pool.` };
  }
  const categoryHit =
    matchesCategoryRule(fund.category, categoryRegexes) ||
    matchesCategoryRule(fund.categorySub, categoryRegexes) ||
    matchesCategoryRule(fund.categoryGroup, categoryRegexes);
  if (!categoryHit) {
    return { ok: false, reason: 'Category does not match the guidance pool.' };
  }
  if (profile.investmentHorizonMonths !== null && profile.investmentHorizonMonths < minHorizonMonths) {
    return {
      ok: false,
      reason: `Investment horizon (${profile.investmentHorizonMonths} months) is shorter than this category's minimum (${minHorizonMonths} months).`,
    };
  }
  if (fund.terRegular === null && fund.terDirect === null) {
    return { ok: false, reason: 'Expense ratio (TER) missing in the verified dataset.' };
  }
  if (fund.freshnessDays === null || fund.lastNavDate === null) {
    return { ok: false, reason: 'No NAV history available in the verified dataset.' };
  }
  if (fund.freshnessDays > MAX_NAV_FRESHNESS_DAYS) {
    return { ok: false, reason: `NAV data is stale (${fund.freshnessDays} days old).` };
  }
  if (needsReturnWindow) {
    const metricName = needsReturnWindow === 'one_year' ? 'returnOneYear'
      : needsReturnWindow === 'three_year' ? 'returnThreeYear' : 'returnFiveYear';
    if (fund[metricName] === null) {
      return {
        ok: false,
        reason: `Insufficient verified NAV history for a ${needsReturnWindow.replace('_', ' ')} window.`,
      };
    }
  }
  return { ok: true };
}

/** Stage 4 — transparent scoring (pure function, deterministic). */
export function scoreFund(fund, effectiveRisk) {
  const factors = {};
  const notes = [];

  const distance = Math.abs((effectiveRisk ?? fund.riskometerLevel) - fund.riskometerLevel);
  factors.riskAlignment = {
    weight: FUND_SCORING_WEIGHTS.riskAlignment,
    factor: Math.max(0, 1 - distance / 4),
    reason: `SEBI Riskometer level ${fund.riskometerLevel} (${SEBI_RISK_LABELS[fund.riskometerLevel]}) from ${fund.riskometerSource || 'amfi disclosure'}.`,
  };

  const hasDirectTer = fund.terDirect !== null && fund.terDirect !== undefined;
  const hasRegularTer = fund.terRegular !== null && fund.terRegular !== undefined;
  const ter = hasDirectTer && hasRegularTer
    ? Math.min(fund.terDirect, fund.terRegular)
    : (hasDirectTer ? fund.terDirect : fund.terRegular);
  factors.expenseRatio = {
    weight: FUND_SCORING_WEIGHTS.expenseRatio,
    factor: Math.max(0, Math.min(1, (2.5 - ter) / 2.4)),
    reason: `Total expense ratio ${ter}% p.a.${hasDirectTer && hasRegularTer ? ` (best of regular ${fund.terRegular}% / direct ${fund.terDirect}%)` : ''}${fund.terDate ? `, as of ${fund.terDate}` : ' (as-of date missing)'} — lower cost directly raises the long-term corpus retained.`,
  };

  if (fund.volatilityAnnualized !== null) {
    factors.volatility = {
      weight: FUND_SCORING_WEIGHTS.volatility,
      factor: Math.max(0, Math.min(1, (30 - fund.volatilityAnnualized) / 28)),
      reason: `Annualized volatility ${(fund.volatilityAnnualized * 100).toFixed(1)}% from real NAV observations (${fund.obsCount} dates).`,
    };
  } else {
    factors.volatility = { weight: FUND_SCORING_WEIGHTS.volatility, factor: 0.5, reason: 'Volatility not computable from the available history; neutral weight applied.' };
    notes.push('Volatility data insufficient — treated as neutral, not rewarded.');
  }

  if (fund.maxDrawdown !== null) {
    factors.maxDrawdown = {
      weight: FUND_SCORING_WEIGHTS.maxDrawdown,
      factor: Math.max(0, Math.min(1, (60 - fund.maxDrawdown) / 45)),
      reason: `Worst NAV peak-to-trough decline ${(fund.maxDrawdown * 100).toFixed(1)}% in available history.`,
    };
  } else {
    factors.maxDrawdown = { weight: FUND_SCORING_WEIGHTS.maxDrawdown, factor: 0.5, reason: 'Drawdown not computable from the available history; neutral weight applied.' };
    notes.push('Drawdown data insufficient — treated as neutral, not rewarded.');
  }

  if (fund.positiveRollingYearFraction !== null) {
    factors.consistency = {
      weight: FUND_SCORING_WEIGHTS.consistency,
      factor: fund.positiveRollingYearFraction,
      reason: `${Math.round(fund.positiveRollingYearFraction * 100)}% of rolling one-year periods in available history were positive (observation-spaced measurement).`,
    };
  } else {
    factors.consistency = { weight: FUND_SCORING_WEIGHTS.consistency, factor: 0.5, reason: 'Rolling-year consistency not computable; neutral weight applied and noted.' };
    notes.push('Rolling-year consistency not computable — treated as neutral, not rewarded.');
  }

  const completenessBits = [
    fund.terRegular !== null || fund.terDirect !== null,
    fund.benchmark !== null,
    fund.returnThreeYear !== null || fund.returnFiveYear !== null,
    Boolean(fund.holdings),
    fund.returnOneYear !== null,
  ];
  factors.dataCompleteness = {
    weight: FUND_SCORING_WEIGHTS.dataCompleteness,
    factor: completenessBits.filter(Boolean).length / completenessBits.length,
    reason: `${completenessBits.filter(Boolean).length}/${completenessBits.length} verified data fields present (TER, benchmark, 3Y+ history, holdings, 1Y history).`,
  };

  // Portfolio concentration is reported but NOT scored: with only 24 funds
  // carrying holdings data it cannot be compared universe-wide.
  if (fund.holdings) {
    notes.push(
      `Portfolio snapshot ${fund.holdings.snapshotMonthEnd}: equity ${fund.holdings.allocationEquityPct}%, cash/money market ${fund.holdings.allocationCashMoneyMarketPct}%, top-5 holdings ${fund.holdings.top5ConcentrationPct}% of reported exposure.`
    );
  }

  const score = Math.round(
    (factors.riskAlignment.factor * factors.riskAlignment.weight
      + factors.expenseRatio.factor * factors.expenseRatio.weight
      + factors.volatility.factor * factors.volatility.weight
      + factors.maxDrawdown.factor * factors.maxDrawdown.weight
      + factors.consistency.factor * factors.consistency.weight
      + factors.dataCompleteness.factor * factors.dataCompleteness.weight) * 10000,
  ) / 10000;

  return { score, factors, notes, ter };
}

function buildFundWarnings(fund) {
  const warnings = [];
  if (fund.volatilityAnnualized !== null && fund.volatilityAnnualized >= 0.2) {
    warnings.push(`High volatility: ${(fund.volatilityAnnualized * 100).toFixed(1)}% annualized in observed history; expect deep intermediate drawdowns.`);
  }
  if (fund.maxDrawdown !== null && fund.maxDrawdown >= 0.4) {
    warnings.push(`Worst historical NAV decline: ${(fund.maxDrawdown * 100).toFixed(1)}%. Past drawdowns do not bound future ones.`);
  }
  if (fund.positiveRollingYearFraction !== null && fund.positiveRollingYearFraction < 0.5) {
    warnings.push(`Only ${Math.round(fund.positiveRollingYearFraction * 100)}% of rolling one-year periods were positive — patience is required.`);
  }
  if (!fund.terDate) {
    warnings.push('Expense ratio carries no as-of date in the source dataset.');
  }
  if ((fund.insufficientHorizons || []).length > 0) {
    warnings.push(
      `Not computed due to short history: ${fund.insufficientHorizons.join(', ').replace(/_/g, ' ')}.`,
    );
  }
  if (!fund.benchmark) {
    warnings.push('Scheme benchmark not disclosed in the verified dataset.');
  }
  return warnings;
}

function familyKey(fund) {
  return String(fund.schemeName || '').toLowerCase().replace(/(direct( plan)?|regular( plan)?|growth( option)?|idcw|plan|option)/g, '').replace(/[^a-z0-9]/g, '');
}

/**
 * Stage 3–5 driver. Category results (engine.js) gate which fund pools may be
 * consulted at all — a ranking score can never rescue an ineligible category
 * pool or an ineligible fund.
 */
export function buildFundRecommendations({
  profile,
  readiness,
  categoryResults,
  catalog,
  limit = 6,
}) {
  if (!catalog || catalog.status !== 'connected') {
    return {
      fundStage: {
        status: catalog?.status || 'unavailable',
        note: catalog?.note || 'Verified fund dataset is not connected.',
        recommendations: [],
        excludedSummary: [],
        scoring: { weights: FUND_SCORING_WEIGHTS, version: FUND_STAGE_VERSION },
      },
    };
  }

  const effectiveRisk = effectiveRiskLevel(profile, readiness);
  const eligiblePools = (categoryResults || [])
    .filter((entry) => entry.categoryId && CATEGORY_FUND_POOLS[entry.categoryId])
    .slice(0, 4); // pools for the top category definitions only

  const scored = [];
  const excludedCounts = { riskometer: 0, group: 0, category: 0, horizon: 0, dataMissing: 0, stale: 0 };

  const candidates = new Map(); // familyKey → best variant
  for (const poolEntry of eligiblePools) {
    const poolRule = CATEGORY_FUND_POOLS[poolEntry.categoryId];
    if (!poolRule) continue;

    for (const fund of catalog.funds) {
      fund.categoryGroupMatch = poolEntry.categoryId;
      const check = isFundEligible(fund, poolRule, profile);
      if (!check.ok) {
        if (check.reason.includes('Riskometer')) excludedCounts.riskometer += 1;
        else if (check.reason.includes('Category group')) excludedCounts.group += 1;
        else if (check.reason.includes('Category does not')) excludedCounts.category += 1;
        else if (check.reason.includes('horizon')) excludedCounts.horizon += 1;
        else if (check.reason.includes('stale')) excludedCounts.stale += 1;
        else excludedCounts.dataMissing += 1;
        continue;
      }

      const { score, factors, notes, ter } = scoreFund(fund, effectiveRisk);
      const recommendation = {
        schemeCode: fund.schemeCode,
        schemeName: fund.schemeName,
        amc: fund.amc,
        category: fund.category,
        categoryGroup: fund.categoryGroup,
        plan: fund.plan,
        option: fund.option,
        riskometer: fund.riskometer,
        riskometerLevel: fund.riskometerLevel,
        expenseRatio: ter,
        nav: { value: fund.lastNavValue, asOf: fund.lastNavDate },
        dataAsOf: fund.lastNavDate && fund.terDate
          ? (fund.terDate > fund.lastNavDate ? fund.terDate : fund.lastNavDate)
          : (fund.lastNavDate || fund.terDate || null),
        dataFreshnessDays: fund.freshnessDays,
        historicalMetrics: {
          oneYearReturn: fund.returnOneYear === null ? null : Math.round(fund.returnOneYear * 10000) / 10000,
          threeYearReturn: fund.returnThreeYear === null ? null : Math.round(fund.returnThreeYear * 10000) / 10000,
          fiveYearReturn: fund.returnFiveYear === null ? null : Math.round(fund.returnFiveYear * 10000) / 10000,
          volatility: fund.volatilityAnnualized === null ? null : Math.round(fund.volatilityAnnualized * 10000) / 10000,
          maxDrawdown: fund.maxDrawdown === null ? null : Math.round(fund.maxDrawdown * 10000) / 10000,
        },
        benchmark: fund.benchmark,
        score,
        scoreBreakdown: factors,
        internalNotes: notes,
        riskWarnings: buildFundWarnings(fund),
        sourceGate: poolEntry.categoryId,
        sourceGateLabel: poolEntry.label,
      };

      const key = familyKey(fund);
      const existing = candidates.get(key);
      if (!existing || recommendation.score > existing.score) {
        candidates.set(key, recommendation);
      }
    }
  }

  for (const rec of candidates.values()) scored.push(rec);

  const ranked = scored
    .sort((a, b) => b.score - a.score
      || a.schemeCode - b.schemeCode)
    .slice(0, Math.max(1, Math.min(limit, 10)));

  // Reasons (deterministic, from computed evidence only)
  for (const rec of ranked) {
    const reasons = [];
    reasons.push(rec.scoreBreakdown.riskAlignment.factor >= 0.8
      ? `Risk band (${rec.riskometer}) aligns with your effective risk level ${effectiveRisk}/5.`
      : `Risk band (${rec.riskometer}) is within one level of your effective risk level ${effectiveRisk}/5.`);
    reasons.push(rec.scoreBreakdown.expenseRatio.reason);
    const horizonGate = CATEGORY_FUND_POOLS[rec.sourceGate];
    if (horizonGate) {
      reasons.push(`Matches the "${rec.sourceGateLabel}" eligibility pool (historical-history requirement satisfied).`);
    }
    if (rec.historicalMetrics.threeYearReturn !== null) {
      reasons.push(`Observed 3-year return ${(rec.historicalMetrics.threeYearReturn * 100).toFixed(1)}% p.a. — shown for transparency, NOT used in the ranking.`);
    }
    if (rec.dataFreshnessDays <= MAX_NAV_FRESHNESS_DAYS) {
      reasons.push(`NAV data fresh (${rec.dataFreshnessDays} days old as of ${rec.nav.asOf}).`);
    }
    rec.reasons = reasons;
    rec.liquidityAndConditions = [
      'Eligibility derived from verified SEBI Riskometer + TER + NAV-history constraints.',
      'Verify scheme documents and plan TER at the AMC/AMFI before any decision.',
    ];
    delete rec.internalNotes;
  }

  return {
    fundStage: {
      status: 'connected',
      stageVersion: FUND_STAGE_VERSION,
      vital: {
        eligiblePools: eligiblePools.map((p) => p.categoryId),
        effectiveRiskLevel: effectiveRisk,
      },
      exclusionsSummary: { ...excludedCounts, note: 'Hard eligibility failures by rule class across the scanned candidates; a ranking score never overrides them.' },
      candidatesScannedFamilyUnique: scored.length,
      recommendations: ranked,
      scoring: {
        weights: FUND_SCORING_WEIGHTS,
        version: FUND_STAGE_VERSION,
        note: 'Historical returns are displayed but never scored — the ranking rewards risk-fit, cost, realized-drawdown behavior and evidence completeness.',
        catalogStats: catalog.stats,
        catalogNote: `Dataset total ${catalog.stats.totalFundsInDataset} rows; ${catalog.stats.inactiveExcluded} inactive funds pre-excluded; only verified numbers are used.`,
      },
    },
  };
}
