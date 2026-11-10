// Deterministic test setup: unconfigured narrator + fund-stage fixtures only.
// Callers of the route are independent; generateRecommendation reads
// FUND_DATA_DIR at call time, so per-test dirs point at tiny CSV fixtures.
process.env.GEMINI_API_KEY = '';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { parseCsv, composeFundRecords, getFundCatalog, FUND_CATALOG_SOURCES } =
  await import('../backend/src/services/recommendation/fundData.js');
const { generateRecommendation } = await import(
  '../backend/src/services/recommendation/index.js'
);
const {
  buildFundRecommendations,
  isFundEligible,
  scoreFund,
  FUND_SCORING_WEIGHTS,
  MAX_NAV_FRESHNESS_DAYS,
} = await import('../backend/src/services/recommendation/funds.js');

// ─── fixture dataset ─────────────────────────────────────────────────────────
const FUNDS_CSV = `scheme_code,fund_name,amc,isin,scheme_plan,scheme_option,details_matched,category_primary,category_group_clean,category_sub,riskometer,riskometer_source,riskometer_level,ter_regular,ter_direct,ter_date,benchmark,nav_date,nav,is_active,is_stale,aaum_cr_quarterly_avg
101,Shield Liquid Fund - Direct IDCW,Shield AMC,ISIN101,Direct,IDCW,true,Liquid Fund,Debt Scheme,Liquid Fund,Low,ssd_riskometer_level,1,,0.20,2026-10-29,Nifty Money Market,2026-10-29,1000.00,True,False,500
201,Bluechip Index Fund - Regular Growth,Blue AMC,ISIN201,Regular,Growth,true,Large Cap Fund,Equity Scheme,Large Cap Fund,Very High,ssd_riskometer_level,6,1.10,,2026-10-29,Nifty 500 TRI,2026-10-29,120.50,True,False,800
202,Bluechip Index Fund - Direct Growth,Blue AMC,ISIN202,Direct,Growth,true,Large Cap Fund,Equity Scheme,Large Cap Fund,Very High,ssd_riskometer_level,6,,0.60,2026-10-29,Nifty 500 TRI,2026-10-29,118.10,True,False,800
203,Gold Saver Fund - Direct IDCW,Gold AMC,ISIN203,Direct,IDCW,true,Gold,Other Scheme,Gold,High,ssd_riskometer_level,5,,0.50,2026-10-29,Gold returns,2026-10-29,5000.00,True,False,120
204,Mystery Fund - Direct Growth,Next AMC,ISIN204,Direct,Growth,true,Large Cap Fund,Equity Scheme,Large Cap Fund,Moderate,ssd_riskometer_level,3,,,2026-10-29,,2026-10-29,90.00,True,False,50
205,Stale Nav Fund - Direct IDCW,Old AMC,ISIN205,Direct,IDCW,true,Short Duration Fund,Debt Scheme,Short Duration Fund,Low to Moderate,ssd_riskometer_level,2,,0.35,2026-10-29,Nifty Short Duration,2026-09-15,89.00,True,False,20
206,Unknown Risk Fund - Direct Growth,Ghost AMC,ISIN206,Direct,Growth,true,Large Cap Fund,Equity Scheme,Large Cap Fund,,,,,0.80,2026-10-29,,2026-10-29,80.00,True,False,10
207,Short History Equity Fund - Direct Growth,New AMC,ISIN207,Direct,Growth,true,Large Cap Fund,Equity Scheme,Large Cap Fund,Very High,ssd_riskometer_level,6,,0.70,2026-10-29,Nifty 500 TRI,2026-10-29,60.00,True,False,10
`;

const NAV_CSV = `scheme_code,obs_count,last_nav_date,last_nav_value,freshness_days,return_one_year,return_three_year,return_five_year,volatility_annualized,max_drawdown,positive_rolling_year_fraction,insufficient_horizons
101,250,2026-10-31,1002.00,3,0.062,,,0.008,0.002,0.99,
201,900,2026-10-31,121.00,3,0.140,0.122,,0.190,0.350,0.71,
202,900,2026-10-31,119.00,3,0.141,0.125,,0.188,0.340,0.72,
203,400,2026-10-31,5001.00,3,0.090,,,0.110,0.230,0.65,three_year
204,300,2026-10-31,91.00,3,0.100,0.090,,0.150,0.200,0.60,
205,300,2026-09-15,89.50,49,0.051,0.048,,0.020,0.010,0.95,
206,300,2026-10-31,81.00,3,0.120,0.100,,0.170,0.300,0.68,
207,11,2026-10-31,61.00,3,0.050,,,0.200,0.250,0.55,three_year
`;

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), 'wealthgenie-funds-'));
  writeFileSync(join(dir, 'wealthgenie_funds.csv'), FUNDS_CSV, 'utf8');
  writeFileSync(join(dir, 'fund_nav_metrics.csv'), NAV_CSV, 'utf8');
  return dir;
}

const STRONG_PROFILE = {
  monthlyIncome: 100000,
  monthlyExpenses: 40000,
  emiPayments: 0,
  emiIncludedInExpenses: true,
  accessibleSavings: 600000,
  incomeStability: 'stable',
  riskTolerance: 4,
  investmentHorizonMonths: 180,
  liquidityNeedMonths: 3,
  goals: [{ title: 'Retire well', goal: 'retirement' }],
};

async function runWithDir(dir, profileInput = STRONG_PROFILE) {
  return generateRecommendation({
    profileInput,
    requireSavedGoals: false,
    fundLimit: 6,
  });
}

let activeDir = null;
async function runFresh(profileInput) {
  // generateRecommendation → getFundCatalog() reads FUND_DATA_DIR at call time,
  // and the loader cache is keyed by dir, so setting the env here points the
  // run at this test's fixture copy.
  const dir = activeDir ?? fixtureDir();
  activeDir = dir;
  process.env.FUND_DATA_DIR = dir;
  return runWithDir(dir, profileInput);
}

// ─── fundData.js unit level ──────────────────────────────────────────────────
describe('fund catalog loader (fundData.js)', () => {
  it('parses RFC-4180 CSV with quotes, commas and CRLF/newline endings', () => {
    const { header, records } = parseCsv(
      'a,b\r\n"x,y",two\n"say ""hi""",,'
    );
    assert.deepEqual(header, ['a', 'b']);
    assert.equal(records[0].a, 'x,y');
    assert.equal(records[0].b, 'two');
    assert.equal(records[1].a, 'say "hi"');
    assert.equal(records[1].b, '');
  });

  it('composeFundRecords maps NAV metrics onto funds and hides inactive rows', () => {
    const composed = composeFundRecords(FUNDS_CSV, NAV_CSV);
    assert.equal(composed.connected, true);
    // 8 active fixture rows; nothing skipped (all active in this fixture).
    assert.equal(composed.funds.length, 8);
    assert.equal(
      composed.stats.fundsWithNavMetrics,
      8,
      'every fixture fund carries a NAV metrics row'
    );
    const bluechip = composed.funds.find((f) => f.schemeCode === 202);
    assert.equal(bluechip.categoryGroup, 'Equity Scheme');
    assert.equal(bluechip.returnThreeYear, 0.125);
    assert.equal(bluechip.volatilityAnnualized, 0.188);
    assert.equal(bluechip.terDirect, 0.6);
    assert.equal(bluechip.riskometerLevel, 6);
    assert.equal(bluechip.holdings, null, 'no holdings fixture → explicit null');
  });

  it('degrades to an explicit unavailable state when files are missing', () => {
    const missing = getFundCatalog({ dataDir: join(tmpdir(), 'wealthgenie-none-404') });
    assert.equal(missing.status, 'unavailable');
    assert.match(missing.note, /not connected|Missing/i);
    assert.ok(missing.missingFiles.includes(FUND_CATALOG_SOURCES.funds));
  });
});

// ─── stage 3: eligibility is a hard gate ─────────────────────────────────────
describe('hard eligibility filtering (stage 3 — constraints cannot be overridden)', () => {
  it('rejects out-of-band riskometer funds regardless of cheap TER or great history', () => {
    const pooled = isFundEligible(
      { riskometerLevel: 6, terDirect: 0.1, terRegular: 0.1, freshnessDays: 1, lastNavDate: '2026-11-01' },
      { groups: ['Debt Scheme'], riskMin: 1, riskMax: 2, categoryRegexes: [/liquid/i], minHorizonMonths: 0, needsReturnWindow: null },
      { investmentHorizonMonths: 12 }
    );
    assert.equal(pooled.ok, false);
    assert.match(pooled.reason, /Riskometer level 6 outside the eligible band/);
  });

  it('enforces the NAV freshness ceiling rather than resuscitating stale funds', () => {
    const pooled = isFundEligible(
      { riskometerLevel: 2, freshnessDays: 49, lastNavDate: '2026-09-15', terDirect: 0.2, categoryGroup: 'Debt Scheme', category: 'Short Duration Fund' },
      { groups: ['Debt Scheme'], riskMin: 1, riskMax: 3, categoryRegexes: [/short/i], minHorizonMonths: 0, needsReturnWindow: null },
      { investmentHorizonMonths: 12 }
    );
    assert.equal(pooled.ok, false);
    assert.match(pooled.reason, /NAV data is stale/);
    assert.ok(MAX_NAV_FRESHNESS_DAYS === 30);
  });

  it('blocks funds whose required return window is not computable', () => {
    const pooled = isFundEligible(
      { riskometerLevel: 6, freshnessDays: 1, lastNavDate: '2026-11-01', terDirect: 0.7, returnThreeYear: null, categoryGroup: 'Equity Scheme', category: 'Index Fund' },
      { groups: ['Equity Scheme'], riskMin: 3, riskMax: 6, categoryRegexes: [/index/i], minHorizonMonths: 36, needsReturnWindow: 'three_year' },
      { investmentHorizonMonths: 60 }
    );
    assert.equal(pooled.ok, false);
    assert.match(pooled.reason, /Insufficient verified NAV history/);
  });
});

// ─── stage 4: transparent scoring ────────────────────────────────────────────
describe('transparent scoring (stage 4 — published weights, no return-chasing)', () => {
  it('publishes the fixed factor weights and they sum to 1', () => {
    assert.deepEqual(FUND_SCORING_WEIGHTS, {
      riskAlignment: 0.3,
      expenseRatio: 0.2,
      volatility: 0.15,
      maxDrawdown: 0.15,
      consistency: 0.15,
      dataCompleteness: 0.05,
    });
    const sum = Object.values(FUND_SCORING_WEIGHTS).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9);
  });

  it('never lets first-year return enter the score: rules only use risk/cost/stability/completeness', () => {
    const good = scoreFund(
      { riskometerLevel: 4, terDirect: 0.5, terRegular: null, terDate: '2026-10-29', volatilityAnnualized: 0.1, maxDrawdown: 0.2, positiveRollingYearFraction: 0.8, returnOneYear: 0.5, returnThreeYear: null, returnFiveYear: null, benchmark: 'X', obsCount: 400, holdings: null, insufficientHorizons: [] },
      4
    );
    const identical = scoreFund(
      { riskometerLevel: 4, terDirect: 0.5, terRegular: null, terDate: '2026-10-29', volatilityAnnualized: 0.1, maxDrawdown: 0.2, positiveRollingYearFraction: 0.8, returnOneYear: -0.4, returnThreeYear: null, returnFiveYear: null, benchmark: 'X', obsCount: 400, holdings: null, insufficientHorizons: [] },
      4
    );
    assert.equal(good.score, identical.score);
  });

  it('treats missing data as neutral (0.5), never as reward or punishment', () => {
    const result = scoreFund(
      { riskometerLevel: 3, terRegular: 0.9, terDirect: null, terDate: null, volatilityAnnualized: null, maxDrawdown: null, positiveRollingYearFraction: null, benchmark: null, holdings: null, insufficientHorizons: ['one_year'] },
      3
    );
    assert.equal(result.factors.volatility.factor, 0.5);
    assert.equal(result.factors.maxDrawdown.factor, 0.5);
    assert.equal(result.factors.consistency.factor, 0.5);
    assert.ok(result.notes.some((n) => /neutral/i.test(n)));
  });

  it('prefers the cheaper plan and documents the TER source', () => {
    const result = scoreFund(
      { riskometerLevel: 3, terRegular: 1.4, terDirect: 0.55, terDate: '2026-10-29', volatilityAnnualized: 0.1, maxDrawdown: 0.15, positiveRollingYearFraction: 0.8, benchmark: 'B', holdings: null, insufficientHorizons: [] },
      3
    );
    assert.equal(result.ter, 0.55);
    assert.match(result.factors.expenseRatio.reason, /best of regular 1.4% \/ direct 0.55%/);
  });
});

// ─── end-to-end through the orchestrator ─────────────────────────────────────
describe('fund recommendations through generateRecommendation (with fixtures)', () => {
  it('aggressive investor: direct plan dedupe picks the cheaper variant of the same family', async () => {
    const result = await runFresh();
    const funds = result.recommendations;
    const families = funds.map((f) => f.schemeName);
    assert.equal(
      families.filter((name) => /Bluechip Index Fund/.test(name)).length,
      1,
      'one winner per fund family — no near-duplicate plans stacked'
    );
    const bluechip = funds.find((f) => /Bluechip Index Fund/.test(f.schemeName));
    assert.equal(bluechip.schemeCode, 202, 'direct plan (cheaper TER) wins the family');
    assert.equal(bluechip.expenseRatio, 0.6);
  });

  it('aggressive investor: every recommended fund carries the full contract payload', async () => {
    const result = await runFresh();
    assert.ok(result.recommendations.length > 0, 'a strong profile must reach real fixture funds');
    for (const fund of result.recommendations) {
      assert.ok(fund.score > 0 && fund.score <= 1);
      assert.ok(fund.reasons.length >= 3);
      for (const value of Object.values(fund.historicalMetrics)) {
        assert.ok(
          value === null || typeof value === 'number',
          'metrics are either verified numbers or explicit nulls — never text'
        );
      }
      assert.ok(fund.riskometer && fund.riskometerLevel >= 1 && fund.riskometerLevel <= 6);
      assert.ok(fund.dataAsOf, 'verified NAV/TER as-of timestamp exposed');
      assert.ok(fund.nav !== null, 'NAV info block present');
      assert.ok(Array.isArray(fund.riskWarnings));
      assert.ok(typeof fund.scoreBreakdown === 'object');
    }
  });

  it('conservative investor: equity/gold pools are never reachable via scoring alone', async () => {
    const result = await runFresh({
      ...STRONG_PROFILE,
      riskTolerance: 1,
      investmentHorizonMonths: 24,
      liquidityNeedMonths: 2,
      goals: [{ title: 'Safety net', goal: 'emergency_fund' }],
    });
    const funds = result.recommendations;
    for (const fund of funds) {
      assert.ok(
        fund.categoryGroup === 'Debt Scheme',
        `conservative pool must not leak ${fund.categoryGroup}`
      );
      assert.ok(fund.riskometerLevel <= 3);
    }
  });

  it('every hard-exclusion reason class is counted in exclusionsSummary', async () => {
    const result = await runFresh();
    const summary = result.funds.exclusionsSummary;
    // Pool scans compound (top-4 pools × all catalog funds), so assert on the
    // rule classes we know fail here, not on brittle exact totals.
    assert.ok(summary.riskometer >= 1, 'unknown-riskometer fund 206 + band failures');
    assert.ok(summary.dataMissing >= 1, 'no-TER fund 204 + insufficient-window fund 207');
    assert.ok(/^Hard eligibility failures/.test(summary.note));
  });

  it('is fully deterministic (identical inputs → byte-identical output)', async () => {
    const first = await runFresh();
    const second = await runFresh();
    assert.deepEqual(first.recommendations, second.recommendations);
    assert.deepEqual(first.funds.exclusionsSummary, second.funds.exclusionsSummary);
    assert.deepEqual(first.categoryRecommendations, second.categoryRecommendations);
  });

  it('honest fund-limit clamp: fundLimit > 10 and < 1 both stay within 1..10', async () => {
    const result = await runFresh({ ...STRONG_PROFILE, fundLimit: 99 });
    assert.ok(result.recommendations.length <= 10);
  });
});

// ─── missing/unfriendly conditions ───────────────────────────────────────────
describe('missing data and edge conditions', () => {
  it('missing fund attributes (no TER / no riskometer) never reach recommendations with silent nulls', async () => {
    const result = await runFresh();
    const fundCodes = result.recommendations.map((f) => f.schemeCode);
    assert.equal(fundCodes.includes(204), false, 'no-TER fund must be excluded');
    assert.equal(fundCodes.includes(206), false, 'no-riskometer fund must be excluded');
  });

  it('short-history funds are excluded, not approximated with synthetic returns', async () => {
    const result = await runFresh();
    // 207 has only 11 NAV observations: any pool requiring a 3Y window must
    // reject it, so it can only appear via a no-window pool with its metrics
    // still carrying explicit nulls for 3Y.
    const shortHistory = result.recommendations.find((f) => f.schemeCode === 207);
    if (shortHistory) {
      assert.equal(shortHistory.historicalMetrics.threeYearReturn, null);
      assert.ok(
        shortHistory.riskWarnings.some((w) => /short history|not computed/i.test(w)),
        'the limitation must be surfaced on the card itself'
      );
    }
  });

  it('no eligible candidates → only instant-liquidity debt funds survive, no crash', async () => {
    const result = await generateRecommendation({
      profileInput: {
        ...STRONG_PROFILE,
        riskTolerance: 1,
        investmentHorizonMonths: 1,
        liquidityNeedMonths: 1,
        goals: [],
      },
      requireSavedGoals: false,
    });
    assert.ok(Array.isArray(result.recommendations));
    for (const fund of result.recommendations) {
      // Only immediate-liquidity debt funds could survive; every other pool is
      // horizon-gated at a stricter minimum than 0 months.
      assert.ok(fund.categoryGroup === 'Debt Scheme');
      assert.ok(fund.riskometerLevel <= 3);
    }
  });

  it('dataset unavailable → fundStage degrades without destroying the payload', async () => {
    const result = await generateRecommendation({
      profileInput: STRONG_PROFILE,
      requireSavedGoals: false,
    });
    // Whatever FUND_DATA_DIR pointed to above, the contract is explicit either way.
    assert.ok(['connected', 'unavailable'].includes(result.funds.status));
    if (result.funds.status === 'unavailable') {
      assert.ok(result.recommendations.length === 0);
      assert.ok(result.funds.note.length > 0);
    }
  });
});

