/**
 * WealthGenie evaluation: raw measurements for the rule-based components.
 *
 * This script only RECORDS what the application code returns. The
 * independent reference values (closed-form XIRR, hand-derived paper-trading
 * ledger, SIP unit arithmetic) and all pass/fail comparisons are computed
 * separately in evaluation/evaluate.py, so the checks are not the app
 * grading itself.
 *
 *   Component 2: recommendation engine sweep over a fixed synthetic
 *                profile grid (coverage, diversity, constraints, latency,
 *                determinism).
 *   Component 5: XIRR cases, paper-trading ledger, historical SIP arithmetic.
 *
 * Output: evaluation/results/components_raw.json
 * Run:    node evaluation/verify_components.mjs
 */
process.env.GEMINI_API_KEY = ''; // never call the LLM; deterministic only

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const imp = (rel) => import(pathToFileURL(resolve(ROOT, rel)).href);

// Paper trading must never touch real user files.
const PT_DIR = mkdtempSync(join(tmpdir(), 'wg-eval-pt-'));
process.env.PAPER_TRADING_DATA_DIR = PT_DIR;

const { generateRecommendation } = await imp('backend/src/services/recommendation/index.js');
const { getFundCatalog } = await imp('backend/src/services/recommendation/fundData.js');
const { CATEGORY_FUND_POOLS, isFundEligible, scoreFund } = await imp('backend/src/services/recommendation/funds.js');
const { calculateXIRR, simulateHistoricalSip } = await imp('backend/src/utils/historicalSimulation.js');
const pt = await imp('backend/src/services/paperTrading/simulationService.js');

// ─── Component 2: recommendation sweep ──────────────────────────────────────
// Fixed grid: 5 risk levels × 5 horizons × 5 goals × 3 finance tiers = 375.
const RISK = [1, 2, 3, 4, 5];
const HORIZON_MONTHS = [6, 24, 60, 120, 240];
const GOALS = ['emergency_fund', 'education', 'home_purchase', 'retirement', 'wealth_building'];
const FINANCES = {
  comfortable: {
    monthlyIncome: 120000, monthlyExpenses: 50000, emiPayments: 5000,
    emiIncludedInExpenses: true, accessibleSavings: 800000,
    incomeStability: 'stable', liquidityNeedMonths: 3,
  },
  tight: {
    monthlyIncome: 45000, monthlyExpenses: 38000, emiPayments: 9000,
    emiIncludedInExpenses: true, accessibleSavings: 40000,
    incomeStability: 'irregular', liquidityNeedMonths: 1,
  },
  deficit: {
    monthlyIncome: 30000, monthlyExpenses: 32000, emiPayments: 6000,
    emiIncludedInExpenses: true, accessibleSavings: 10000,
    incomeStability: 'irregular', liquidityNeedMonths: 1,
  },
};

const profiles = [];
for (const [tier, fin] of Object.entries(FINANCES)) {
  for (const riskTolerance of RISK) {
    for (const investmentHorizonMonths of HORIZON_MONTHS) {
      for (const goal of GOALS) {
        profiles.push({
          id: `${tier}-r${riskTolerance}-h${investmentHorizonMonths}-${goal}`,
          tier, riskTolerance, investmentHorizonMonths, goal,
          input: {
            ...fin, riskTolerance, investmentHorizonMonths,
            goals: [{ title: goal, goal, targetAmount: 1000000, monthsRemaining: investmentHorizonMonths }],
          },
        });
      }
    }
  }
}

const catalogLoadStart = performance.now();
const catalog = getFundCatalog();
const catalogLoadMs = performance.now() - catalogLoadStart;
if (catalog.status !== 'connected') {
  throw new Error(`Fund catalog unavailable: ${catalog.note}`);
}
const funds = catalog.funds;
const bySchemeCode = new Map(funds.map((f) => [f.schemeCode, f]));

// Eligible universe: funds that pass at least one pool's hard rules when the
// horizon rule is not binding (the largest set any profile could reach).
const eligibleUniverse = new Set();
for (const fund of funds) {
  for (const [poolId, rule] of Object.entries(CATEGORY_FUND_POOLS)) {
    const probe = { ...fund, categoryGroupMatch: poolId };
    if (isFundEligible(probe, rule, { investmentHorizonMonths: null }).ok) {
      eligibleUniverse.add(fund.schemeCode);
      break;
    }
  }
}

const sweep = [];
const latenciesMs = [];
for (const p of profiles) {
  const t0 = performance.now();
  const first = await generateRecommendation({ profileInput: p.input, requireSavedGoals: false });
  const t1 = performance.now();
  const second = await generateRecommendation({ profileInput: p.input, requireSavedGoals: false });
  const t2 = performance.now();
  latenciesMs.push(t1 - t0, t2 - t1);

  const recs = (first.recommendations || []).map((r) => {
    const fresh = bySchemeCode.get(r.schemeCode);
    const rule = CATEGORY_FUND_POOLS[r.sourceGate];
    let violation = null;
    if (!rule) violation = 'missing pool rule';
    else if (!fresh) violation = 'scheme not in catalog';
    else {
      const check = isFundEligible({ ...fresh, categoryGroupMatch: r.sourceGate }, rule, { investmentHorizonMonths: p.investmentHorizonMonths });
      if (!check.ok) violation = check.reason;
    }
    if (violation === null && (r.expenseRatio === null || r.expenseRatio === undefined)) {
      violation = 'recommended with a missing expense ratio';
    }
    return {
      schemeCode: r.schemeCode,
      amc: r.amc ?? fresh?.amc ?? null,
      category: r.category ?? fresh?.category ?? null,
      categorySub: fresh?.categorySub ?? null,
      categoryGroup: r.categoryGroup ?? fresh?.categoryGroup ?? null,
      riskometerLevel: r.riskometerLevel ?? fresh?.riskometerLevel ?? null,
      sourceGate: r.sourceGate,
      expenseRatio: r.expenseRatio ?? null,
      score: r.score,
      violation,
    };
  });

  sweep.push({
    id: p.id, tier: p.tier, riskTolerance: p.riskTolerance,
    investmentHorizonMonths: p.investmentHorizonMonths, goal: p.goal,
    readinessStatus: first.profileSummary.readinessStatus,
    effectiveRiskLevel: first.funds.effectiveRiskLevel,
    fundStageStatus: first.funds.status,
    categoriesRanked: (first.categoryRecommendations || []).length,
    deterministic: JSON.stringify(first) === JSON.stringify(second),
    payloadBytes: JSON.stringify(first).length,
    recommendations: recs,
  });
}

// Diagnostic: for the highest-risk / longest-horizon profile, the best score
// any eligible fund in each pool can reach vs the 6th-place score returned.
const poolDiagnostics = {};
{
  const p = profiles.find((x) => x.id === 'comfortable-r5-h240-wealth_building');
  const res = await generateRecommendation({ profileInput: p.input, requireSavedGoals: false });
  const eff = res.funds.effectiveRiskLevel;
  const returned = res.recommendations.map((r) => r.score);
  poolDiagnostics.profile = p.id;
  poolDiagnostics.effectiveRiskLevel = eff;
  poolDiagnostics.riskCapacity = { level: res.readiness.riskCapacity.level, maxRaw: res.readiness.riskCapacity.maxRaw };
  poolDiagnostics.eligiblePoolsConsulted = res.funds.eligiblePools;
  poolDiagnostics.returnedScores = returned;
  poolDiagnostics.returnedPools = res.recommendations.map((r) => r.sourceGate);
  poolDiagnostics.pools = {};
  for (const [poolId, rule] of Object.entries(CATEGORY_FUND_POOLS)) {
    const eligible = funds.filter((f) => isFundEligible({ ...f, categoryGroupMatch: poolId }, rule, { investmentHorizonMonths: p.investmentHorizonMonths }).ok);
    let best = null;
    for (const f of eligible) {
      const s = scoreFund(f, eff);
      if (!best || s.score > best.score) best = { score: s.score, schemeName: f.schemeName, riskometerLevel: f.riskometerLevel, riskAlignmentFactor: s.factors.riskAlignment.factor };
    }
    const levels = {};
    for (const f of eligible) levels[f.riskometerLevel] = (levels[f.riskometerLevel] || 0) + 1;
    poolDiagnostics.pools[poolId] = { riskBand: [rule.riskMin, rule.riskMax], eligibleFunds: eligible.length, eligibleByRiskometer: levels, best };
  }
}

const catalogSummary = {
  status: catalog.status,
  stats: catalog.stats ?? null,
  catalogFunds: funds.length,
  catalogAmcs: new Set(funds.map((f) => f.amc).filter(Boolean)).size,
  catalogCategories: new Set(funds.map((f) => f.category).filter(Boolean)).size,
  catalogSubcategories: new Set(funds.map((f) => f.categorySub).filter(Boolean)).size,
  eligibleUniverseSubcategories: new Set([...eligibleUniverse].map((c) => bySchemeCode.get(c).categorySub).filter(Boolean)).size,
  eligibleUniverseFunds: eligibleUniverse.size,
  eligibleUniverseAmcs: new Set([...eligibleUniverse].map((c) => bySchemeCode.get(c).amc).filter(Boolean)).size,
  eligibleUniverseCategories: new Set([...eligibleUniverse].map((c) => bySchemeCode.get(c).category).filter(Boolean)).size,
  catalogLoadMs,
};

// ─── Component 5a: XIRR cases (app output only) ─────────────────────────────
const xirrCases = [
  { id: 'two_flow_gain_leap_year', note: '-10,000 then +11,000 one calendar year later (366 days, 2020 leap year)',
    flows: [{ date: '2020-01-01', amount: -10000 }, { date: '2021-01-01', amount: 11000 }] },
  { id: 'two_flow_two_years', note: '-10,000 then +12,100 two calendar years later (730 days)',
    flows: [{ date: '2021-01-01', amount: -10000 }, { date: '2023-01-01', amount: 12100 }] },
  { id: 'two_flow_loss', note: '-10,000 then +8,000 one calendar year later (365 days)',
    flows: [{ date: '2022-01-01', amount: -10000 }, { date: '2023-01-01', amount: 8000 }] },
  { id: 'three_flow_staggered', note: '-1,000, -1,000 a year later, +2,310 two years after start',
    flows: [{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: -1000 }, { date: '2023-01-01', amount: 2310 }] },
  { id: 'monthly_sip_12', note: '12 monthly -1,000 contributions in 2023, +13,000 on 2024-01-01',
    flows: [...Array.from({ length: 12 }, (_, m) => ({ date: `2023-${String(m + 1).padStart(2, '0')}-01`, amount: -1000 })),
      { date: '2024-01-01', amount: 13000 }] },
  { id: 'invalid_no_inflow', note: 'only outflows: XIRR undefined, app must return null',
    flows: [{ date: '2021-01-01', amount: -1000 }, { date: '2022-01-01', amount: -500 }] },
];
const xirr = xirrCases.map((c) => ({ ...c, appXirrPct: calculateXIRR(c.flows) }));

// ─── Component 5b: paper-trading ledger (app output only) ────────────────────
const ACCOUNT = 'eval-ledger-check';
const ledgerOps = [
  { op: 'buyAt', symbol: 'NIFTYBEES', quantity: 10, price: 250.5 },
  { op: 'buyAt', symbol: 'NIFTYBEES', quantity: 5, price: 260 },
  { op: 'sellAt', symbol: 'NIFTYBEES', quantity: 8, price: 270 },
  { op: 'sellAt', symbol: 'NIFTYBEES', quantity: 50, price: 270, expectError: true },
  { op: 'buyAt', symbol: 'NIFTYBEES', quantity: 100000, price: 270, expectError: true },
  { op: 'buyAt', symbol: 'NIFTYBEES', quantity: 1.5, price: 270, expectError: true },
];
const ledger = [];
for (const o of ledgerOps) {
  try {
    const res = await pt[o.op](o.symbol, o.quantity, o.price, ACCOUNT);
    const h = res.account.holdings.find((x) => x.symbol === o.symbol) || null;
    ledger.push({ ...o, ok: true, error: null,
      tradeTotal: res.trade.total, realizedPnl: res.trade.realizedPnl ?? null,
      cash: res.account.cash, holdingQty: h ? h.quantity : 0, avgCost: h ? h.avgCost : null,
      holdingsValue: res.account.holdingsValue, totalEquity: res.account.totalEquity,
      realizedTotal: res.account.realizedPnl, initialCash: res.account.initialCash });
  } catch (error) {
    ledger.push({ ...o, ok: false, error: String(error.message || error) });
  }
}
rmSync(PT_DIR, { recursive: true, force: true });

// ─── Component 5c: historical SIP arithmetic on a synthetic series ───────────
// Calendar-daily NAV from 2023-01-01, linear growth, so every month has an
// observation on day 1 and the expected units are hand-computable.
const sipObs = [];
{
  const start = Date.UTC(2023, 0, 1);
  for (let i = 0; i <= 365; i += 1) {
    const d = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    sipObs.push({ date: d, nav: Math.round((100 + 0.05 * i) * 10000) / 10000 });
  }
}
const sip = simulateHistoricalSip({
  observations: sipObs, valueKey: 'nav', monthlyInvestment: 1000,
  startDate: '2023-01-01', endDate: '2024-01-01', sipDay: 1,
});
const sipRecord = {
  series: { start: sipObs[0].date, end: sipObs.at(-1).date, rule: 'nav_i = round(100 + 0.05*i, 4), i = days since 2023-01-01', points: sipObs.length },
  monthlyInvestment: 1000,
  app: {
    installmentsCount: sip.installmentsCount, totalInvested: sip.totalInvested,
    unitsAccumulated: sip.unitsAccumulated, portfolioValue: sip.portfolioValue,
    lastValue: sip.lastValue, annualizedReturnXIRR: sip.annualizedReturnXIRR,
    startDate: sip.startDate, endDate: sip.endDate,
  },
  observations: sipObs,
};

const out = {
  generatedOn: new Date().toISOString(),
  node: process.version,
  recommender: {
    profileGrid: { risk: RISK, horizonMonths: HORIZON_MONTHS, goals: GOALS, financeTiers: Object.keys(FINANCES), finances: FINANCES, count: profiles.length },
    topN: 6,
    catalog: catalogSummary,
    poolDiagnostics,
    latencyMs: latenciesMs,
    sweep,
  },
  xirr,
  ledger,
  sip: sipRecord,
};
mkdirSync(resolve(ROOT, 'evaluation/results'), { recursive: true });
writeFileSync(resolve(ROOT, 'evaluation/results/components_raw.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`components_raw.json written: ${profiles.length} profiles, ${xirr.length} XIRR cases, ${ledger.length} ledger ops`);
