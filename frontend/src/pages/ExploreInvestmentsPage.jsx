import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Database,
  ExternalLink,
  AlertCircle,
  Activity,
  History,
  CheckCircle2,
  Layers,
  Target,
  Wallet,
  ShieldCheck,
  PiggyBank,
  SlidersHorizontal,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { formatINR } from '../utils/formatters';
import { assessmentGoalLabel, formatAssessmentDate } from '../utils/assessmentDisplay';
import { useUserData } from '../context/UserDataContext';
import {
  EMERGENCY_COVERAGE_THRESHOLD_MONTHS,
  MAX_MONTHLY_CONTRIBUTION,
  buildDownsideScenarios,
  buildInvestmentWarnings,
  buildReturnScenarios,
  extractPlannerSnapshot,
  futureValue,
  goalFundingComparison,
  suggestedMonthlyContribution,
} from '../utils/investmentProjection';

// ─── Custom Tooltip for TRI Chart ───────────────────────────────────────────
function TRITooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-navy-900 mb-1">{label}</p>
      <p className="text-emerald-700">
        Nifty 50 TRI:{' '}
        <span className="font-bold">
          {Number(payload[0].value).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </span>{' '}
        pts
      </p>
    </div>
  );
}

// ─── Custom Tooltip for Historical SIP Simulation ────────────────────────────
function SimulationTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const invested = payload.find((p) => p.dataKey === 'totalInvested')?.value || 0;
  const val = payload.find((p) => p.dataKey === 'portfolioValue')?.value || 0;
  const diff = val - invested;
  const pct = invested > 0 ? (diff / invested) * 100 : 0;
  const isFinal = payload[0]?.payload?.isFinalValuation;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 text-xs space-y-1">
      <p className="font-semibold text-navy-900">
        {label} {isFinal && <span className="font-normal text-slate-400">(valuation date)</span>}
      </p>
      <p className="text-slate-600">
        Capital Invested: <span className="font-semibold text-navy-950">{formatINR(invested)}</span>
      </p>
      <p className="text-genie-700">
        Portfolio Value: <span className="font-bold text-genie-700">{formatINR(val)}</span>
      </p>
      <p className={`font-medium text-[11px] ${diff >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
        {diff >= 0 ? 'Gain' : 'Loss'}: {diff >= 0 ? '+' : '−'}
        {formatINR(Math.abs(diff))} ({diff >= 0 ? '+' : '−'}
        {Math.abs(pct).toFixed(1)}%)
      </p>
    </div>
  );
}

// ─── Time range filter options ───────────────────────────────────────────────
const TIME_RANGES = [
  { label: '1Y', months: 12 },
  { label: '3Y', months: 36 },
  { label: '5Y', months: 60 },
  { label: '10Y', months: 120 },
  { label: 'All', months: Infinity },
];

const SIMULATION_PRESETS = [
  { id: '1y', label: '1 Year', years: 1 },
  { id: '3y', label: '3 Years', years: 3 },
  { id: '5y', label: '5 Years', years: 5 },
  { id: 'full', label: 'Full Coverage', years: null },
];

const FUND_SCHEME_CODES = ['120716', '119063'];

const SIMULATION_ACCENTS = {
  benchmark: {
    text: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    button: 'bg-indigo-600',
    buttonHover: 'hover:bg-indigo-700',
    stroke: '#4f46e5',
    ring: 'ring-indigo-200',
  },
  'mutual-fund': {
    text: 'text-genie-700',
    bg: 'bg-genie-50',
    border: 'border-genie-200',
    button: 'bg-genie-600',
    buttonHover: 'hover:bg-genie-700',
    stroke: '#16a34a',
    ring: 'ring-genie-200',
  },
};

function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function shiftYears(dateStr, years) {
  if (!isValidISODate(dateStr) || !years) return dateStr;
  const date = new Date(`${dateStr}T00:00:00.000Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function buildInstruments({ historicalStatus, historicalMeta, mutualFunds }) {
  const instruments = [];

  if (historicalStatus === 'connected' && historicalMeta.coverage?.startDate) {
    instruments.push({
      id: 'nifty-tri',
      kind: 'benchmark',
      label: 'Nifty 50 TRI',
      description: 'Nifty 50 Total Returns Index',
      provider: 'NSE Indices Limited',
      identity: historicalMeta.source || 'Nifty 50 Total Returns Index (TRI)',
      coverage: {
        startDate: historicalMeta.coverage.startDate,
        endDate: historicalMeta.coverage.endDate,
        count: historicalMeta.count || historicalMeta.coverage.tradingDays || 0,
      },
      schemeCode: null,
      isin: null,
      plan: null,
      option: null,
      rawSha256: historicalMeta.rawSha256 || null,
      retrievalDate: historicalMeta.lastUpdated || null,
      sourceUrl: 'https://www.niftyindices.com/reports/historical-data',
      units: historicalMeta.units || 'Index Points',
    });
  }

  if (mutualFunds.status === 'connected') {
    for (const code of FUND_SCHEME_CODES) {
      const scheme = mutualFunds.schemes.find((s) => String(s.schemeCode) === code);
      if (!scheme || !scheme.startDate || !scheme.endDate) continue;
      const fundHouse = scheme.fundHouse || 'AMFI verified scheme';
      instruments.push({
        id: `fund-${scheme.schemeCode}`,
        kind: 'mutual-fund',
        label: `${fundHouse.replace(/\s+Mutual Fund$/i, '')} Nifty 50 Index`,
        description: scheme.schemeName,
        provider: fundHouse,
        identity: scheme.schemeName,
        coverage: {
          startDate: scheme.startDate,
          endDate: scheme.endDate,
          count: scheme.observationCount || 0,
        },
        schemeCode: scheme.schemeCode,
        isin: scheme.isin,
        plan: scheme.plan,
        option: scheme.option,
        rawSha256: scheme.rawSha256,
        retrievalDate: scheme.retrievalDate,
        sourceUrl: mutualFunds.meta?.sourceUrl || 'https://www.amfiindia.com/net-asset-value/nav-download',
        units: 'Published NAV (₹)',
      });
    }
  }

  return instruments;
}

function validateSimulationForm({ monthlyInvestment, startDate, endDate, coverage }) {
  const amount = Number(monthlyInvestment);
  if (!Number.isFinite(amount) || amount < 500 || amount > 10000000) {
    return 'Monthly investment must be between ₹500 and ₹1,00,00,000.';
  }
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return 'Select a valid start date and end date.';
  }
  if (startDate > endDate) {
    return 'Start date must be on or before end date.';
  }
  if (!coverage?.startDate || !coverage?.endDate) {
    return 'Verified data coverage is unavailable for this instrument.';
  }
  if (startDate < coverage.startDate || endDate > coverage.endDate) {
    return `Choose dates within the verified coverage: ${coverage.startDate} to ${coverage.endDate}.`;
  }
  return null;
}

function downsampleSeries(series, maxPoints) {
  if (!Array.isArray(series) || series.length <= maxPoints) return series || [];
  const step = Math.ceil(series.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < series.length; i += step) {
    sampled.push(series[i]);
  }
  const last = series[series.length - 1];
  if (sampled[sampled.length - 1]?.date !== last.date) sampled.push(last);
  return sampled;
}

function formatSignedINR(value) {
  const amount = Number(value) || 0;
  return `${amount >= 0 ? '+' : '−'}${formatINR(Math.abs(amount))}`;
}

function formatOptionalINR(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not available';
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? formatINR(numeric) : 'Not available';
}

function formatMonths(months) {
  const numeric = Number(months);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Not set';
  const years = Math.floor(numeric / 12);
  const remainder = numeric % 12;
  if (years === 0) return `${remainder} month${remainder === 1 ? '' : 's'}`;
  if (remainder === 0) return `${years} year${years === 1 ? '' : 's'}`;
  return `${years} yr ${remainder} mo`;
}

function PlannerStat({ icon: Icon, label, value, hint, tone = 'navy' }) {
  const toneStyles = {
    navy: 'bg-slate-50 border-slate-200 text-navy-800',
    green: 'bg-genie-50 border-genie-200 text-genie-800',
    amber: 'bg-amber-50 border-amber-200 text-amber-800',
    rose: 'bg-rose-50 border-rose-200 text-rose-800',
  };

  return (
    <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-subtle">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 ${
            toneStyles[tone] || toneStyles.navy
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-sm font-bold text-navy-950 break-words">{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
  );
}

function PlannerWarning({ warning }) {
  const isCritical = warning.severity === 'critical';
  return (
    <div
      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
        isCritical
          ? 'border-rose-200 bg-rose-50 text-rose-900'
          : 'border-amber-200 bg-amber-50 text-amber-900'
      }`}
    >
      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{warning.message}</span>
    </div>
  );
}

/**
 * Percent formatter for dataset metrics. Values arrive as decimals (0.121 →
 * "12.1%"); null/undefined renders as an explicit "N/A (no verified data)"
 * rather than a zero or a guess.
 */
function formatMetricPct(value, { signed = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return 'N/A — not computable from verified history';
  }
  const pctValue = Number(value) * 100;
  const sign = signed && pctValue > 0 ? '+' : '';
  return `${sign}${pctValue.toFixed(1)}%`;
}

/**
 * Fund-level recommendations block (TrueFundStage payload `funds` + `recommendations`).
 * Renders states explicitly per the data-integrity contract:
 *   - connected + funds  → fund cards with full transparency data
 *   - connected + empty  → explains which hard eligibility filters removed candidates
 *   - unavailable        → honest dataset note (category guidance still shown)
 */
function FundRecommendationsSection({ fundsMeta, funds, readinessStatus }) {
  const weights = fundsMeta.scoring?.weights ?? null;

  if (fundsMeta.status !== 'connected') {
    return (
      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900 flex items-start gap-2">
        <Database className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Verified fund screening is unavailable right now</p>
          <p className="mt-0.5">{fundsMeta.note ||
            'The processed fund dataset is not connected. Category-level guidance above is unaffected.'}</p>
        </div>
      </div>
    );
  }

  if (!funds || funds.length === 0) {
    const exclusions = fundsMeta.exclusionsSummary ?? {};
    const exclusionRows = Object.entries(exclusions).filter(([key, count]) =>
      key !== 'note' && Number(count) > 0
    );
    return (
      <div className="p-4 rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 mb-1.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Verified fund suggestions
          </div>
          <Badge variant="gray" size="xs">no eligible funds</Badge>
        </div>
        <p className="text-[11px] text-slate-600">
          No funds in the verified dataset passed the hard eligibility checks for your
          profile (Riskometer band, category, horizon, expense-ratio disclosure, NAV
          freshness and required return-history windows). This is a deliberate
          fail-safe: a high ranking score can never override a failed constraint.
          The category guidance above remains valid.
        </p>
        {exclusionRows.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exclusionRows.map(([rule, count]) => (
              <span
                key={rule}
                className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100 text-[10px] text-slate-500"
              >
                {rule}: {count} removed
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Verified fund suggestions
        </div>
        <Badge variant="indigo" size="xs">
          {funds.length} of the verified dataset · scored, not return-chased
        </Badge>
      </div>
      {funds.map((fund, index) => (
        <div key={fund.schemeCode} className="p-4 rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-xs font-bold text-navy-950">
              #{index + 1} {fund.schemeName}
            </span>
            <Badge variant="gray" size="xs">
              {fund.riskometer} ({fund.riskometerLevel}/6)
            </Badge>
            {fund.expenseRatio !== null && fund.expenseRatio !== undefined && (
              <Badge variant="green" size="xs">TER {Number(fund.expenseRatio).toFixed(2)}%</Badge>
            )}
            <Badge variant="indigo" size="xs">Score {Number(fund.score).toFixed(2)}</Badge>
          </div>
          <p className="text-[11px] text-slate-600">
            {[fund.amc, fund.category, fund.plan, fund.option].filter(Boolean).join(' · ')}
            {fund.nav?.value !== null && fund.nav?.value !== undefined && (
              <> · NAV ₹{Number(fund.nav.value).toLocaleString('en-IN', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} as of {fund.nav.asOf}</>
            )}
            {Number.isFinite(Number(fund.dataFreshnessDays)) && (
              <> · data freshness {fund.dataFreshnessDays} d</>
            )}
          </p>

          {/* Historical performance — displayed for transparency, never scored */}
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[10px]">
            {[
              ['1Y return', fund.historicalMetrics?.oneYearReturn, true],
              ['3Y p.a.', fund.historicalMetrics?.threeYearReturn, true],
              ['5Y p.a.', fund.historicalMetrics?.fiveYearReturn, true],
              ['Volatility', fund.historicalMetrics?.volatility, false],
              ['Max drawdown', fund.historicalMetrics?.maxDrawdown, false],
            ].map(([label, value, signed]) => (
              <div key={label} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                <div className="font-semibold text-navy-900">{label}</div>
                <div className="text-slate-500">{formatMetricPct(value, { signed })}</div>
              </div>
            ))}
          </div>

          <ul className="mt-2 space-y-1 text-[11px] text-slate-700 list-disc pl-4">
            {(fund.reasons || []).map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>

          {/* Per-factor score breakdown mirrors the category cards */}
          {fund.scoreBreakdown && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
              {Object.entries(fund.scoreBreakdown).map(([factor, detail]) => (
                <div key={factor} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="font-semibold text-navy-900">{factor}</div>
                  <div className="text-slate-500">
                    {Math.round(detail.factor * 100)}% × weight {detail.weight}
                  </div>
                  <div className="text-slate-400 mt-0.5">{detail.reason}</div>
                </div>
              ))}
            </div>
          )}

          {fund.riskWarnings?.length > 0 && (
            <ul className="mt-2 space-y-1 text-[10px] text-amber-700 list-disc pl-4">
              {fund.riskWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
          {fund.benchmark && (
            <p className="mt-1.5 text-[10px] text-slate-400">Benchmark: {fund.benchmark}</p>
          )}
        </div>
      ))}

      {/* Transparent scoring summary */}
      {weights && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[10px] text-slate-600">
          <p className="font-semibold text-navy-900 mb-1">
            Fund ranking weights (fixed, published):
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            {Object.entries(weights).map(([factor, weight]) => (
              <span key={factor}>{factor}: {weight}</span>
            ))}
          </div>
          <p className="mt-1 text-slate-400">
            {fundsMeta.scoring?.note}
            {fundsMeta.scoring?.catalogNote ? ` ${fundsMeta.scoring.catalogNote}` : ''}
          </p>
        </div>
      )}
    </div>
  );
}

function PersonalizedGuidance({ snapshot, onNavigate }) {
  const { request: authenticatedRequest } = useUserData();

  // Profile inputs: prefilled from the saved assessment but always editable.
  const [form, setForm] = useState({
    monthlyIncome: 0,
    monthlyExpenses: 0,
    emiPayments: 0,
    accessibleSavings: 0,
    incomeStability: 'stable',
    riskTolerance: 3,
    horizonYears: 10,
    liquidityNeedMonths: 3,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const initializedRef = useRef(null);

  // Prefill once per saved assessment. EMIs are assumed inside expenses when
  // the assessment says so; the user can correct any field.
  useEffect(() => {
    if (!snapshot) return;
    const key = snapshot.assessmentId || snapshot.createdAt || 'latest';
    if (initializedRef.current === key) return;
    initializedRef.current = key;
    setForm((prev) => ({
      ...prev,
      monthlyIncome:
        Number.isFinite(Number(snapshot.monthlyIncome))
          ? Math.max(0, Number(snapshot.monthlyIncome))
          : prev.monthlyIncome,
      monthlyExpenses:
        Number.isFinite(Number(snapshot.monthlyOutflows))
          ? Math.max(0, Number(snapshot.monthlyOutflows))
          : prev.monthlyExpenses,
      accessibleSavings:
        Number.isFinite(Number(snapshot.accessibleSavings))
          ? Math.max(0, Number(snapshot.accessibleSavings))
          : prev.accessibleSavings,
    }));
  }, [snapshot]);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function fetchGuidance() {
    if (authenticatedRequest === undefined) {
      setError('You must be signed in to get personalized guidance.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payload = await authenticatedRequest('/api/recommendations', {
        method: 'POST',
        body: {
          // engineProfile: engine loads the caller's saved goals itself via
          // RLS, so goals are not sent from the client.
          profile: {
            monthlyIncome: Number(form.monthlyIncome) || 0,
            monthlyExpenses: Number(form.monthlyExpenses) || 0,
            emiPayments: Number(form.emiPayments) || 0,
            emiIncludedInExpenses: true,
            accessibleSavings: Number(form.accessibleSavings) || 0,
            incomeStability: form.incomeStability,
            riskTolerance: form.riskTolerance,
            investmentHorizonMonths: Math.round(form.horizonYears * 12),
            liquidityNeedMonths: form.liquidityNeedMonths,
          },
        },
      });
      setResult(payload);
    } catch (requestError) {
      setResult(null);
      setError(
        requestError?.message || 'Personalized guidance is unavailable right now.'
      );
    } finally {
      setLoading(false);
    }
  }

  const readinessCore = result?.readiness?.core ?? null;
  const explanation = result?.explanation ?? null;

  const inputClasses =
    'w-full pl-3 pr-3 py-2 text-sm font-semibold text-navy-950 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-genie-300';
  const selectClasses =
    'w-full py-2 pl-2.5 pr-6 text-sm font-semibold text-navy-950 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-genie-300';

  return (
    <Card className="border-indigo-200/80 shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
        <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
          <Sparkles className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-navy-950">Personalized guidance</h2>
            <Badge variant="indigo" size="xs">Categories + verified funds</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Readiness calculations and category fit run deterministically on your own
            numbers. Fund suggestions come only from the verified AMFI/SEBI dataset —
            every figure shown is traceable data, never invented.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchGuidance}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Calculating…
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3" />
              {result ? 'Recalculate guidance' : 'Get personalized guidance'}
            </>
          )}
        </button>
      </div>

      {/* Profile inputs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Monthly income (₹)</span>
          <input
            type="number" min="0" step="100"
            value={form.monthlyIncome}
            onChange={(e) => updateField('monthlyIncome', Number(e.target.value))}
            className={inputClasses}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Monthly expenses (₹)</span>
          <input
            type="number" min="0" step="100"
            value={form.monthlyExpenses}
            onChange={(e) => updateField('monthlyExpenses', Number(e.target.value))}
            className={inputClasses}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Accessible savings (₹)</span>
          <input
            type="number" min="0" step="100"
            value={form.accessibleSavings}
            onChange={(e) => updateField('accessibleSavings', Number(e.target.value))}
            className={inputClasses}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Loan payments inside expenses (₹)</span>
          <input
            type="number" min="0" step="100"
            value={form.emiPayments}
            onChange={(e) => updateField('emiPayments', Number(e.target.value))}
            className={inputClasses}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Income stability</span>
          <select
            value={form.incomeStability}
            onChange={(e) => updateField('incomeStability', e.target.value)}
            className={selectClasses}
          >
            <option value="stable">Stable</option>
            <option value="variable">Variable</option>
            <option value="irregular">Irregular</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Risk tolerance (1–5)</span>
          <select
            value={form.riskTolerance}
            onChange={(e) => updateField('riskTolerance', Number(e.target.value))}
            className={selectClasses}
          >
            <option value="1">1 — Very low</option>
            <option value="2">2 — Low</option>
            <option value="3">3 — Moderate</option>
            <option value="4">4 — High</option>
            <option value="5">5 — Very high</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
            Horizon · {form.horizonYears} yr
          </span>
          <input
            type="range" min="1" max="40" step="1"
            value={form.horizonYears}
            onChange={(e) => updateField('horizonYears', Number(e.target.value))}
            className="w-full accent-genie-600 cursor-pointer mt-2"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">May need money within (months)</span>
          <input
            type="number" min="0" step="1"
            value={form.liquidityNeedMonths}
            onChange={(e) => updateField('liquidityNeedMonths', Number(e.target.value))}
            className={inputClasses}
          />
        </label>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-2 mb-5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {result && readinessCore && (
        <div className="space-y-5">
          {/* Readiness summary */}
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
              Financial readiness (deterministic)
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <PlannerStat icon={PiggyBank} label="Monthly surplus" tone={readinessCore.monthlySurplus > 0 ? 'green' : 'rose'}
                value={readinessCore.monthlySurplus === null ? 'Not computable' : formatINR(readinessCore.monthlySurplus)}
              />
              <PlannerStat icon={ShieldCheck} label="Emergency coverage"
                value={readinessCore.emergencyFundCoverageMonths === null ? 'Unknown' : `${readinessCore.emergencyFundCoverageMonths.toFixed(1)} mo`}
              />
              <PlannerStat icon={Activity} label="Debt burden"
                value={result.readiness.debtBurdenPct === null ? 'No loans known' : `${result.readiness.debtBurdenPct}% of income`}
              />
              <PlannerStat icon={CheckCircle2} label="Risk capacity" tone="green"
                value={`Level ${result.readiness.riskCapacity.level} of 5`}
                hint="Derived from facts, not stated tolerance"
              />
              <PlannerStat icon={Wallet} label="Investable surplus"
                value={result.readiness.investableSurplusPerMonth === null ? 'Not computable' : `${formatINR(result.readiness.investableSurplusPerMonth)} / mo`}
              />
            </div>
          </div>

          {/* Urgent priorities */}
          {result.priorities.length > 0 && (
            <div className="space-y-2">
              {result.priorities.map((priority) => (
                <div
                  key={priority.id}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    priority.urgency === 'high'
                      ? 'border-rose-200 bg-rose-50 text-rose-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <strong>{priority.title}:</strong> {priority.detail}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Outcome */}
          <div
            className={`p-3 rounded-xl border text-xs ${
              result.outcome.status === 'no-suitable-investment-now'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-genie-200 bg-genie-50 text-genie-900'
            }`}
          >
            <p className="font-bold">{result.outcome.headline}</p>
            <p className="mt-0.5">{result.outcome.detail}</p>
          </div>

          {/* Ranked category recommendations with score breakdowns */}
          {result.categoryRecommendations?.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Suggested categories (ranked by transparent scoring)
              </div>
              {result.categoryRecommendations.map((rec) => (
                <div key={rec.categoryId} className="p-4 rounded-xl border border-slate-200 bg-white">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-xs font-bold text-navy-950">
                      #{rec.rank} {rec.label}
                    </span>
                    <Badge variant="gray" size="xs">
                      Riskometer {rec.riskometerLabel} ({rec.riskometerLevel}/6)
                    </Badge>
                    <Badge variant="green" size="xs">Score {rec.score.toFixed(2)}</Badge>
                  </div>
                  <p className="text-[11px] text-slate-600">{rec.description}</p>
                  <ul className="mt-2 space-y-1 text-[11px] text-slate-700 list-disc pl-4">
                    {rec.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px]">
                    {Object.entries(rec.scoreBreakdown).map(([factor, detail]) => (
                      <div key={factor} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="font-semibold text-navy-900">{factor}</div>
                        <div className="text-slate-500">
                          {Math.round(detail.factor * 100)}% × weight {detail.weight}
                        </div>
                        <div className="text-slate-400 mt-0.5">{detail.reason}</div>
                      </div>
                    ))}
                  </div>
                  <ul className="mt-2 space-y-1 text-[10px] text-slate-500 list-disc pl-4">
                    {rec.risks.map((risk) => (
                      <li key={risk}>{risk}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* Verified-dataset fund recommendations (Stage 3–5 of the engine) */}
          {result.funds && (
            <FundRecommendationsSection
              fundsMeta={result.funds}
              funds={result.recommendations || []}
              readinessStatus={result.profileSummary?.readinessStatus}
            />
          )}

          {/* Excluded options with explicit reasons */}
          {result.excluded.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Not suggested right now
              </div>
              <div className="space-y-1.5">
                {result.excluded.map((entry) => (
                  <div key={entry.categoryId} className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-[11px] text-slate-600">
                    <strong className="text-navy-900">{entry.label}</strong> — {entry.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Missing information that would change the result */}
          {result.missingMaterial?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              <p className="font-semibold mb-1">Missing information that shapes this result:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                {result.missingMaterial.map((item) => (
                  <li key={item.field}>
                    <strong>{item.field}</strong> — {item.why}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Explanation: deterministic text, plus optional LLM rewording */}
          {explanation && (
            <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-950">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <p className="font-bold">Plain-language explanation</p>
                <Badge variant={explanation.generative?.source === 'gemini' ? 'indigo' : 'gray'} size="xs">
                  {explanation.generative?.source === 'gemini'
                    ? 'AI reworded (rules unchanged)'
                    : 'Deterministic (AI unavailable)'}
                </Badge>
              </div>
              <pre className="whitespace-pre-wrap font-sans leading-relaxed">
                {explanation.generative?.source === 'gemini'
                  ? explanation.generative.text
                  : explanation.text}
              </pre>
            </div>
          )}

          {/* Scenario comparison link + disclaimer */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => onNavigate?.('twin')}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-slate-300"
            >
              <Sparkles className="w-3 h-3" />
              Compare scenarios in the Digital Twin
              <ArrowRight className="w-3 h-3" />
            </button>
            <p className="text-[10px] text-slate-500 flex-1 min-w-0">{result.disclaimer}</p>
          </div>

          {result.notes?.length > 0 && (
            <ul className="space-y-1 text-[10px] text-slate-500 list-disc pl-4">
              {result.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

export default function ExploreInvestmentsPage({ onNavigate }) {
  const {
    latestAssessment,
    loading: userDataLoading,
    error: userDataError,
    refresh: refreshUserData,
  } = useUserData();

  const snapshot = useMemo(
    () => extractPlannerSnapshot(latestAssessment),
    [latestAssessment]
  );

  // Personalized investment planner state. The first values are replaced by
  // assessment-derived defaults once a saved assessment is available.
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [horizonYears, setHorizonYears] = useState(10);
  const [annualRate, setAnnualRate] = useState(8);
  const [declinePct, setDeclinePct] = useState(20);
  const initializedAssessmentRef = useRef(null);

  const [sources, setSources] = useState([]);
  const [sourcesError, setSourcesError] = useState(null);

  // Historical TRI dataset state
  const [historicalData, setHistoricalData] = useState(null);
  const [historicalStatus, setHistoricalStatus] = useState('loading');
  const [historicalMeta, setHistoricalMeta] = useState({});
  const [timeRange, setTimeRange] = useState('All');

  // Verified AMFI mutual fund schemes
  const [mutualFunds, setMutualFunds] = useState({
    status: 'loading',
    schemes: [],
    meta: null,
    message: null,
  });

  // Unified historical simulator state
  const [selectedInstrumentId, setSelectedInstrumentId] = useState('nifty-tri');
  const [simMonthly, setSimMonthly] = useState(5000);
  const [simStartDate, setSimStartDate] = useState('');
  const [simEndDate, setSimEndDate] = useState('');
  const [simPreset, setSimPreset] = useState('full');
  const [simResult, setSimResult] = useState(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState(null);

  // Fetch verified data sources registry from backend
  useEffect(() => {
    fetch('/api/investments/sources')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setSources(data.sources || []);
        setSourcesError(null);
      })
      .catch((err) => {
        setSources([]);
        setSourcesError(err.message);
      });
  }, []);

  // Fetch verified AMFI mutual fund schemes from backend
  useEffect(() => {
    let cancelled = false;
    fetch('/api/investments/mutual-funds')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        if (data.status === 'connected') {
          setMutualFunds({
            status: 'connected',
            schemes: data.schemes || [],
            meta: data,
            message: null,
          });
        } else {
          setMutualFunds({
            status: data.status || 'unconnected',
            schemes: [],
            meta: data,
            message: data.message || 'Verified mutual fund NAV data is not connected.',
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setMutualFunds({
          status: 'error',
          schemes: [],
          meta: null,
          message: `Unable to load verified mutual fund schemes: ${err.message}`,
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch genuine historical TRI data from backend
  useEffect(() => {
    setHistoricalStatus('loading');
    fetch('/api/investments/historical')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (data.status === 'connected' && data.data?.length > 0) {
          setHistoricalData(data.data);
          setHistoricalMeta({
            source: data.source,
            provider: data.provider,
            lastUpdated: data.lastUpdated,
            coverage: data.coverage,
            units: data.units,
            rawSha256: data.rawSha256,
            count: data.count,
          });
          setHistoricalStatus('connected');
        } else {
          setHistoricalStatus('unconnected');
        }
      })
      .catch(() => {
        setHistoricalStatus('error');
      });
  }, []);

  // Filter data by selected time range based on last available observation date
  const filteredData = useMemo(() => {
    if (!historicalData || historicalData.length === 0) return [];
    const range = TIME_RANGES.find((r) => r.label === timeRange);
    if (!range || range.months === Infinity) return historicalData;

    const lastDate = new Date(historicalData[historicalData.length - 1].date);
    const cutoff = new Date(lastDate);
    cutoff.setMonth(cutoff.getMonth() - range.months);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    return historicalData.filter((d) => d.date >= cutoffStr);
  }, [historicalData, timeRange]);

  // Compute summary stats for the active chart window
  const triStats = useMemo(() => {
    if (!filteredData || filteredData.length < 2) return null;
    const first = filteredData[0];
    const last = filteredData[filteredData.length - 1];
    const change = last.tri - first.tri;
    const changePercent = ((change / first.tri) * 100).toFixed(2);
    const max = filteredData.reduce((m, d) => (d.tri > m.tri ? d : m), filteredData[0]);
    const min = filteredData.reduce((m, d) => (d.tri < m.tri ? d : m), filteredData[0]);

    // Compound Annual Growth Rate (CAGR) over selected window
    const yearsDiff = (new Date(last.date) - new Date(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
    const cagr = yearsDiff > 0.5 ? ((Math.pow(last.tri / first.tri, 1 / yearsDiff) - 1) * 100).toFixed(2) : null;

    return { first, last, change, changePercent, max, min, yearsDiff: yearsDiff.toFixed(1), cagr };
  }, [filteredData]);

  // Build the verified instrument universe from connected backend datasets only
  const instruments = useMemo(
    () => buildInstruments({ historicalStatus, historicalMeta, mutualFunds }),
    [historicalStatus, historicalMeta, mutualFunds]
  );

  const selectedInstrument = useMemo(
    () => instruments.find((instrument) => instrument.id === selectedInstrumentId) || null,
    [instruments, selectedInstrumentId]
  );

  const selectedCoverageStart = selectedInstrument?.coverage?.startDate;
  const selectedCoverageEnd = selectedInstrument?.coverage?.endDate;
  const simAccent = SIMULATION_ACCENTS[selectedInstrument?.kind] || SIMULATION_ACCENTS.benchmark;

  const simFormError = useMemo(
    () =>
      validateSimulationForm({
        monthlyInvestment: simMonthly,
        startDate: simStartDate,
        endDate: simEndDate,
        coverage: selectedInstrument?.coverage,
      }),
    [simMonthly, simStartDate, simEndDate, selectedInstrument]
  );

  // Keep a valid instrument selected as datasets finish loading
  useEffect(() => {
    if (instruments.length === 0) return;
    if (!instruments.some((instrument) => instrument.id === selectedInstrumentId)) {
      setSelectedInstrumentId(instruments[0].id);
    }
  }, [instruments, selectedInstrumentId]);

  // Reset the date range to the selected instrument's verified coverage
  useEffect(() => {
    if (!selectedCoverageStart || !selectedCoverageEnd) return;
    setSimStartDate(selectedCoverageStart);
    setSimEndDate(selectedCoverageEnd);
    setSimPreset('full');
  }, [selectedInstrumentId, selectedCoverageStart, selectedCoverageEnd]);

  // Execute the selected historical simulation through the backend
  useEffect(() => {
    if (!selectedInstrument || simFormError) {
      setSimLoading(false);
      setSimResult(null);
      setSimError(null);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      const isBenchmark = selectedInstrument.kind === 'benchmark';
      const endpoint = isBenchmark
        ? '/api/investments/simulate/benchmark'
        : '/api/investments/simulate/mutual-fund';
      const payload = {
        monthlyInvestment: simMonthly,
        startDate: simStartDate,
        endDate: simEndDate,
        sipDay: 1,
      };
      if (!isBenchmark) payload.schemeCode = selectedInstrument.schemeCode;

      setSimLoading(true);
      setSimError(null);
      setSimResult(null);

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.message || data.error || `HTTP ${res.status}`);
          }
          return data;
        })
        .then((data) => {
          if (data.status === 'success') {
            setSimResult(data);
          } else {
            setSimError(data.message || 'The simulation could not be completed.');
          }
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          setSimError(`Simulation service unavailable: ${err.message}`);
        })
        .finally(() => {
          if (!controller.signal.aborted) setSimLoading(false);
        });
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    selectedInstrument,
    selectedInstrumentId,
    simMonthly,
    simStartDate,
    simEndDate,
    simFormError,
  ]);

  const simulationChartData = useMemo(
    () => downsampleSeries(simResult?.portfolioSeries || simResult?.monthlySnapshots || [], 400),
    [simResult]
  );

  function applyPreset(preset) {
    if (!selectedCoverageStart || !selectedCoverageEnd) return;
    const start = preset.years ? shiftYears(selectedCoverageEnd, preset.years) : selectedCoverageStart;
    setSimStartDate(start < selectedCoverageStart ? selectedCoverageStart : start);
    setSimEndDate(selectedCoverageEnd);
    setSimPreset(preset.id);
  }

  // Downsample chart data for rendering performance (max ~300 points)
  const chartData = useMemo(() => {
    if (!filteredData || filteredData.length === 0) return [];
    const maxPoints = 300;
    if (filteredData.length <= maxPoints) return filteredData;
    const step = Math.ceil(filteredData.length / maxPoints);
    const sampled = [];
    for (let i = 0; i < filteredData.length; i += step) {
      sampled.push(filteredData[i]);
    }
    if (sampled[sampled.length - 1] !== filteredData[filteredData.length - 1]) {
      sampled.push(filteredData[filteredData.length - 1]);
    }
    return sampled;
  }, [filteredData]);

  // ─── Personalized investment planner calculations ─────────────────────
  const plannerMonths = Math.max(0, Math.round(horizonYears * 12));

  useEffect(() => {
    if (!snapshot) return;

    const assessmentKey =
      snapshot.assessmentId || snapshot.createdAt || 'latest-assessment';
    if (initializedAssessmentRef.current === assessmentKey) return;
    initializedAssessmentRef.current = assessmentKey;

    setMonthlyContribution(
      suggestedMonthlyContribution(snapshot.monthlySurplus)
    );
    setHorizonYears(
      snapshot.goalTimelineMonths
        ? Math.min(40, Math.max(1, Math.ceil(snapshot.goalTimelineMonths / 12)))
        : 10
    );
    setAnnualRate(8);
    setDeclinePct(20);
  }, [snapshot]);

  const projection = useMemo(
    () =>
      futureValue({
        monthlyContribution,
        annualReturnPct: annualRate,
        months: plannerMonths,
      }),
    [monthlyContribution, annualRate, plannerMonths]
  );

  const warnings = useMemo(
    () =>
      snapshot
        ? buildInvestmentWarnings({
            monthlyContribution,
            monthlySurplus: snapshot.monthlySurplus,
            emergencyCoverageMonths: snapshot.emergencyCoverageMonths,
          })
        : [],
    [monthlyContribution, snapshot]
  );

  const returnScenarios = useMemo(
    () =>
      buildReturnScenarios({
        monthlyContribution,
        annualReturnPct: annualRate,
        months: plannerMonths,
      }),
    [monthlyContribution, annualRate, plannerMonths]
  );

  const downsideRows = useMemo(
    () =>
      buildDownsideScenarios({
        projectedValue: projection.futureValue,
        selectedDeclinePct: declinePct,
      }),
    [projection.futureValue, declinePct]
  );

  const goalComparison = useMemo(() => {
    if (!snapshot || !snapshot.targetAmount) return null;

    return goalFundingComparison({
      targetAmount: snapshot.targetAmount,
      currentGoalSavings: snapshot.currentGoalSavings,
      monthlyContribution,
      annualReturnPct: annualRate,
      goalTimelineMonths: snapshot.goalTimelineMonths,
      plannerHorizonMonths: plannerMonths,
    });
  }, [snapshot, monthlyContribution, annualRate, plannerMonths]);

  const downsideGoalComparison = useMemo(() => {
    if (!snapshot || !snapshot.targetAmount) return null;

    return goalFundingComparison({
      targetAmount: snapshot.targetAmount,
      currentGoalSavings: snapshot.currentGoalSavings,
      monthlyContribution,
      annualReturnPct: annualRate,
      goalTimelineMonths: snapshot.goalTimelineMonths,
      plannerHorizonMonths: plannerMonths,
      declinePct,
    });
  }, [snapshot, monthlyContribution, annualRate, plannerMonths, declinePct]);

  const contributionPresets = useMemo(() => {
    if (!snapshot || snapshot.monthlySurplus <= 0) return [];

    return Array.from(
      new Set(
        [0.25, 0.5, 0.75].map(
          (fraction) =>
            Math.round((snapshot.monthlySurplus * fraction) / 100) * 100
        )
      )
    );
  }, [snapshot]);

  const principalPercentage =
    projection.futureValue > 0
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(
              (projection.totalContributions / projection.futureValue) * 100
            )
          )
        )
      : 0;
  const gainPercentage =
    projection.futureValue > 0 ? 100 - principalPercentage : 0;
  const contributionPercentOfSurplus =
    snapshot && snapshot.monthlySurplus > 0
      ? (monthlyContribution / snapshot.monthlySurplus) * 100
      : null;

  const contributionSliderMax = Math.min(
    MAX_MONTHLY_CONTRIBUTION,
    Math.max(
      10000,
      Math.ceil(
        ((snapshot?.monthlySurplus > 0 ? snapshot.monthlySurplus : 20000) * 1.25) /
          5000
      ) * 5000
    )
  );

  const coverageThreshold = EMERGENCY_COVERAGE_THRESHOLD_MONTHS;
  const hasCoverage =
    snapshot?.emergencyCoverageMonths !== null &&
    snapshot?.emergencyCoverageMonths !== undefined &&
    Number.isFinite(Number(snapshot.emergencyCoverageMonths));
  const hasSurplusValue =
    snapshot?.monthlySurplus !== null &&
    snapshot?.monthlySurplus !== undefined &&
    Number.isFinite(Number(snapshot.monthlySurplus));
  const hasPositiveSurplus =
    hasSurplusValue && Number(snapshot.monthlySurplus) > 0;

  return (
    <div className="space-y-8">
      {/* 1. Page introduction and financial-data status */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Personalized Investment Planner &bull; Educational Scenarios</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Explore Investments
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
          Turn your saved financial assessment into transparent investment scenarios,
          then compare them with verified historical market data. Projections are
          hypothetical illustrations, not forecasts or regulated advice.
        </p>
      </div>

      <Card
        padding="sm"
        className={
          snapshot
            ? 'border-genie-200/80 bg-genie-50/40'
            : 'border-amber-200 bg-amber-50/40'
        }
      >
        {userDataLoading ? (
          <div className="flex items-center gap-3 text-xs text-slate-600">
            <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
            <span>Loading your latest financial assessment…</span>
          </div>
        ) : snapshot ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-genie-200 text-genie-700 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-bold text-navy-950">
                  Connected to your latest financial assessment
                </p>
                <Badge variant="green" size="xs">Assessment data</Badge>
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Saved {formatAssessmentDate(snapshot.createdAt) || 'recently'}. The
                snapshot and warnings below use only these saved figures.
              </p>
            </div>
            <button
              type="button"
              onClick={() => refreshUserData?.()}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-slate-300"
            >
              <RefreshCw className="w-3 h-3" />
              Refresh
            </button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-navy-950">
                No saved financial assessment found
              </p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Personal surplus, emergency coverage, and goal comparisons stay empty
                until you save an assessment. You can still explore hypothetical
                contributions below; WealthGenie will not invent personal figures.
              </p>
              {userDataError && (
                <p className="text-[11px] text-rose-700 mt-1">{userDataError}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onNavigate?.('assessment')}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-navy-950 text-white hover:bg-navy-800"
            >
              Open Financial Assessment
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </Card>

      {/* 2. Personalized financial snapshot */}
      {snapshot && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-navy-950">
              Your financial snapshot
            </h2>
            <span className="text-[11px] text-slate-500">
              From your saved assessment &bull; nothing inferred
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <PlannerStat
              icon={Wallet}
              label="Monthly income"
              value={formatOptionalINR(snapshot.monthlyIncome)}
            />
            <PlannerStat
              icon={ArrowDownRight}
              label="Mandatory outflows"
              value={formatOptionalINR(snapshot.monthlyOutflows)}
              hint="Expenses plus EMI not already included"
            />
            <PlannerStat
              icon={PiggyBank}
              label="Monthly surplus"
              value={formatOptionalINR(snapshot.monthlySurplus)}
              hint={
                !hasSurplusValue
                  ? 'Not available in this assessment'
                  : hasPositiveSurplus
                    ? 'Available before investing'
                    : 'No positive surplus'
              }
              tone={
                !hasSurplusValue
                  ? 'navy'
                  : hasPositiveSurplus
                    ? 'green'
                    : 'rose'
              }
            />
            <PlannerStat
              icon={ShieldCheck}
              label="Emergency savings"
              value={formatOptionalINR(snapshot.accessibleSavings)}
              hint="Accessible savings, kept separate"
            />
            <PlannerStat
              icon={Activity}
              label="Emergency coverage"
              value={
                hasCoverage
                  ? `${Number(snapshot.emergencyCoverageMonths).toFixed(1)} months`
                  : 'Not available'
              }
              hint={`Heuristic: at least ${coverageThreshold} months`}
              tone={
                hasCoverage &&
                Number(snapshot.emergencyCoverageMonths) >= coverageThreshold
                  ? 'green'
                  : 'amber'
              }
            />
            <PlannerStat
              icon={Target}
              label="Selected goal"
              value={assessmentGoalLabel(snapshot.goal)}
              hint={
                snapshot.targetAmount
                  ? `${formatINR(snapshot.targetAmount)} target${
                      snapshot.goalTimelineMonths
                        ? ` · ${formatMonths(snapshot.goalTimelineMonths)}`
                        : ''
                    }`
                  : 'No goal target saved'
              }
            />
          </div>
        </section>
      )}

      {/* 3. Interactive investment planner */}
      <Card className="border-genie-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-genie-50 text-genie-700 flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-navy-950">
                  Personalized Investment Planner
                </h2>
                <Badge variant="green" size="xs">Hypothetical</Badge>
              </div>
              <p className="text-xs text-slate-500">
                Adjust the contribution, horizon, return assumption, and decline. Results update immediately.
              </p>
            </div>
          </div>
          {snapshot && (
            <span className="text-[11px] text-slate-500">
              Suggested start: {formatINR(suggestedMonthlyContribution(snapshot.monthlySurplus))} / month
            </span>
          )}
        </div>

        {warnings.length > 0 && (
          <div className="space-y-2 mb-5">
            {warnings.map((warning) => (
              <PlannerWarning key={warning.id} warning={warning} />
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Planner controls */}
          <div className="lg:col-span-5 space-y-5">
            <div>
              <div className="flex items-end justify-between gap-2 mb-1.5">
                <label htmlFor="planner-contribution" className="text-xs font-semibold text-navy-900">
                  Monthly contribution
                </label>
                <span className="text-xs font-bold text-genie-700">
                  {formatINR(monthlyContribution)} / month
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">₹</span>
                <input
                  id="planner-contribution"
                  type="number"
                  min="0"
                  max={MAX_MONTHLY_CONTRIBUTION}
                  step="100"
                  value={monthlyContribution}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setMonthlyContribution(
                      Number.isFinite(next)
                        ? Math.min(
                            MAX_MONTHLY_CONTRIBUTION,
                            Math.max(0, next)
                          )
                        : 0
                    );
                  }}
                  className="w-full pl-7 pr-3 py-2 text-sm font-bold text-navy-950 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-genie-300"
                />
              </div>
              <input
                type="range"
                min="0"
                max={contributionSliderMax}
                step="500"
                value={Math.min(monthlyContribution, contributionSliderMax)}
                onChange={(e) => setMonthlyContribution(Number(e.target.value))}
                className="w-full mt-3 accent-genie-600 cursor-pointer"
                aria-label="Monthly contribution slider"
              />
              <div className="flex flex-wrap gap-1.5 mt-2">
                {snapshot && snapshot.monthlySurplus > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setMonthlyContribution(
                        suggestedMonthlyContribution(snapshot.monthlySurplus)
                      )
                    }
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                      monthlyContribution ===
                      suggestedMonthlyContribution(snapshot.monthlySurplus)
                        ? 'bg-genie-600 text-white'
                        : 'bg-genie-50 text-genie-800 border border-genie-200 hover:bg-genie-100'
                    }`}
                  >
                    Suggested
                  </button>
                )}
                {(snapshot
                  ? contributionPresets
                  : [1000, 5000, 10000]
                ).map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setMonthlyContribution(amount)}
                    className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                      monthlyContribution === amount
                        ? 'bg-navy-950 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {formatINR(amount)}
                  </button>
                ))}
              </div>
              {contributionPercentOfSurplus !== null && (
                <p className="mt-2 text-[11px] text-slate-500">
                  This uses {contributionPercentOfSurplus.toFixed(0)}% of your{' '}
                  {formatINR(snapshot.monthlySurplus)} monthly surplus.
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-navy-900 mb-1.5">
                <label htmlFor="planner-horizon">Investment horizon</label>
                <span className="text-genie-700">
                  {horizonYears} yr &bull; {plannerMonths} contributions
                </span>
              </div>
              <input
                id="planner-horizon"
                type="range"
                min="1"
                max="40"
                step="1"
                value={horizonYears}
                onChange={(e) => setHorizonYears(Number(e.target.value))}
                className="w-full accent-genie-600 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                <span>1 year</span>
                <span>20 years</span>
                <span>40 years</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-navy-900 mb-1.5">
                <label htmlFor="planner-return">Hypothetical annual return</label>
                <span className="text-genie-700">{annualRate}% p.a.</span>
              </div>
              <input
                id="planner-return"
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={annualRate}
                onChange={(e) => setAnnualRate(Number(e.target.value))}
                className="w-full accent-genie-600 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Effective annual assumption, converted to a monthly rate. Not a forecast.
              </p>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold text-navy-900 mb-1.5">
                <label htmlFor="planner-decline">Hypothetical market decline</label>
                <span className="text-rose-700">−{declinePct}%</span>
              </div>
              <input
                id="planner-decline"
                type="range"
                min="0"
                max="60"
                step="5"
                value={declinePct}
                onChange={(e) => setDeclinePct(Number(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Applied once to the end value. Not a forecast or a path simulation.
              </p>
            </div>
          </div>

          {/* Planner results */}
          <div className="lg:col-span-7 bg-slate-50 p-5 sm:p-6 rounded-2xl border border-slate-200/80">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Hypothetical portfolio value after {formatMonths(plannerMonths)}
                </div>
                <div className="text-3xl sm:text-4xl font-extrabold text-navy-950 tracking-tight mt-1">
                  {formatINR(projection.futureValue)}
                </div>
              </div>
              <div
                className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg ${
                  projection.gain >= 0
                    ? 'bg-genie-50 text-genie-800 border border-genie-200'
                    : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}
              >
                {projection.gain >= 0 ? (
                  <ArrowUpRight className="w-3.5 h-3.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5" />
                )}
                {formatSignedINR(projection.gain)} hypothetical{' '}
                {projection.gain >= 0 ? 'gain' : 'loss'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-5">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Total contributions</div>
                <div className="text-sm font-bold text-navy-950">{formatINR(projection.totalContributions)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Assumed return</div>
                <div className="text-sm font-bold text-navy-950">{annualRate}% p.a.</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Duration</div>
                <div className="text-sm font-bold text-navy-950">{formatMonths(plannerMonths)}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden flex">
                <div
                  className="bg-navy-800 h-full"
                  style={{ width: `${principalPercentage}%` }}
                  title={`Contributions: ${principalPercentage}%`}
                />
                <div
                  className="bg-genie-600 h-full"
                  style={{ width: `${gainPercentage}%` }}
                  title={`Hypothetical gain: ${gainPercentage}%`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[10px] text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-navy-800" />
                  Contributions {principalPercentage}%
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-genie-600" />
                  Hypothetical gain {gainPercentage}%
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-2">
                Contributions are assumed at the end of each month, so the first
                contribution earns no return in month 1.
              </p>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Alternative return assumptions
              </div>
              <div className="space-y-1.5">
                {returnScenarios.map((row) => {
                  const isSelected = row.annualReturnPct === annualRate;
                  return (
                    <div
                      key={row.annualReturnPct}
                      className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs ${
                        isSelected
                          ? 'bg-white border border-genie-200 font-semibold text-navy-950'
                          : 'bg-white/60 border border-slate-200/70 text-slate-600'
                      }`}
                    >
                      <span className="shrink-0">{row.annualReturnPct}% p.a.</span>
                      <span className="font-bold text-navy-900">{formatINR(row.futureValue)}</span>
                      <span
                        className={`shrink-0 ${
                          row.gain >= 0 ? 'text-genie-700' : 'text-rose-700'
                        }`}
                      >
                        {formatSignedINR(row.gain)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* 4. Goal funding comparison */}
      <Card className="border-slate-200">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <Target className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy-950">Goal funding comparison</h2>
            <p className="text-xs text-slate-500">
              How the hypothetical corpus compares with your selected goal.
            </p>
          </div>
        </div>

        {!snapshot || !snapshot.targetAmount ? (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <Info className="w-5 h-5 text-slate-400 shrink-0" />
            <p className="text-xs text-slate-600 flex-1">
              {snapshot
                ? 'Your saved assessment does not include a goal target, so there is nothing to compare yet.'
                : 'Save a financial assessment with a goal target to see whether your projected corpus closes the gap.'}
            </p>
            <button
              type="button"
              onClick={() => onNavigate?.('assessment')}
              className="inline-flex items-center gap-1.5 self-start sm:self-auto text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-navy-950 text-white hover:bg-navy-800"
            >
              Add a goal
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : goalComparison ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <PlannerStat
                icon={Target}
                label="Goal"
                value={assessmentGoalLabel(snapshot.goal)}
                hint={
                  snapshot.goalTimelineMonths
                    ? `${formatMonths(snapshot.goalTimelineMonths)} timeline`
                    : 'No timeline saved'
                }
              />
              <PlannerStat
                icon={TrendingUp}
                label="Target amount"
                value={formatINR(goalComparison.targetAmount)}
              />
              <PlannerStat
                icon={PiggyBank}
                label="Current goal savings"
                value={formatINR(goalComparison.currentGoalSavings)}
                hint="Separate from emergency savings"
              />
              <PlannerStat
                icon={Sparkles}
                label={`Projected funding at ${formatMonths(goalComparison.monthsUsed)}`}
                value={formatINR(goalComparison.projectedFunding)}
                hint={`${formatINR(goalComparison.projectedFutureValue)} from investments`}
                tone={goalComparison.gap > 0 ? 'amber' : 'green'}
              />
            </div>

            <div>
              <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden">
                <div
                  className={`h-full ${goalComparison.gap > 0 ? 'bg-amber-500' : 'bg-genie-600'}`}
                  style={{ width: `${goalComparison.coveragePct || 0}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <p
                  className={`text-xs font-semibold ${
                    goalComparison.gap > 0 ? 'text-amber-800' : 'text-genie-800'
                  }`}
                >
                  {goalComparison.gap > 0
                    ? `Projected shortfall: ${formatINR(goalComparison.gap)}`
                    : `Goal covered with ${formatINR(goalComparison.surplus)} to spare`}
                </p>
                <span className="text-[11px] text-slate-500">
                  {Math.round(goalComparison.coveragePct || 0)}% of target funded
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                {goalComparison.horizonSource === 'goal_timeline'
                  ? `This comparison uses your saved ${formatMonths(
                      goalComparison.monthsUsed
                    )} goal timeline. The planner horizon is ${formatMonths(plannerMonths)}.`
                  : `No goal timeline is saved, so this comparison uses the planner horizon of ${formatMonths(
                      plannerMonths
                    )}.`}{' '}
                Current goal savings are added at their saved value and are not
                assumed to grow. They are kept separate from emergency savings and
                are not double-counted.
              </p>
            </div>
          </div>
        ) : null}
      </Card>

      {/* 5. Hypothetical downside scenarios */}
      <Card className="border-amber-200/80">
        <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 mb-5">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-navy-950">Hypothetical downside scenarios</h2>
            <p className="text-xs text-slate-500">
              What the same projected value would be after a single market decline.
              These are illustrations, not forecasts.
            </p>
          </div>
        </div>

        {projection.futureValue > 0 ? (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-200">
                    <th className="py-2 pr-3 font-semibold">Decline</th>
                    <th className="py-2 pr-3 font-semibold">Value after decline</th>
                    <th className="py-2 pr-3 font-semibold">Loss vs projected</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {downsideRows.map((row) => {
                    const isSelected = row.declinePct === declinePct;
                    return (
                      <tr
                        key={row.declinePct}
                        className={`border-b border-slate-100 last:border-0 ${
                          isSelected ? 'bg-amber-50/70 font-semibold text-navy-950' : 'text-slate-600'
                        }`}
                      >
                        <td className="py-2.5 pr-3">−{row.declinePct}%</td>
                        <td className="py-2.5 pr-3 font-bold text-navy-900">
                          {formatINR(row.downsideValue)}
                        </td>
                        <td className="py-2.5 pr-3 text-rose-700">
                          −{formatINR(row.loss)}
                        </td>
                        <td className="py-2.5 text-[10px] uppercase tracking-wider text-slate-500">
                          {isSelected ? 'Selected' : 'Illustrative'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {goalComparison && downsideGoalComparison && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                <p className="font-semibold">
                  Effect on your goal at −{declinePct}%:
                </p>
                <p className="mt-0.5 leading-relaxed">
                  Projected funding falls from{' '}
                  {formatINR(goalComparison.projectedFunding)} to{' '}
                  {formatINR(downsideGoalComparison.projectedFunding)}.
                  {downsideGoalComparison.gap > goalComparison.gap
                    ? ` The projected shortfall grows by ${formatINR(
                        downsideGoalComparison.gap - goalComparison.gap
                      )} to ${formatINR(downsideGoalComparison.gap)}.`
                    : downsideGoalComparison.gap > 0
                      ? ` The projected shortfall is ${formatINR(
                          downsideGoalComparison.gap
                        )}.`
                      : ` The goal remains covered, with ${formatINR(
                          downsideGoalComparison.surplus
                        )} to spare.`}
                </p>
              </div>
            )}

            <p className="text-[10px] text-slate-400 leading-relaxed">
              A real market decline could happen gradually, recover partially, or be
              deeper than the selected assumption. This table applies one decline to
              the end value only; it does not model volatility or a recovery path.
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-500">
            Enter a monthly contribution above zero to see downside values.
          </p>
        )}
      </Card>

      {/* 6. Personalized category guidance (deterministic engine) */}
      <PersonalizedGuidance snapshot={snapshot} onNavigate={onNavigate} />

      {/* 7. Historical Performance Lab */}
      <div className="pt-2 border-t border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <History className="w-4 h-4" />
          </div>
          <h2 className="text-lg font-bold text-navy-950">Historical Performance Lab</h2>
          <Badge variant="green" size="xs">Verified market data</Badge>
        </div>
        <p className="text-xs text-slate-600 mt-1 max-w-3xl leading-relaxed">
          Back-tests using official NSE Nifty 50 TRI observations and verified AMFI
          mutual fund NAVs. Historical outcomes are not expected future returns and
          are kept separate from the hypothetical planner above.
        </p>
      </div>

      {/* ─── Nifty 50 TRI Historical Visualizer ─────────────────────────── */}
      {historicalStatus === 'connected' && triStats && (
        <Card className="border-genie-200/90 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-genie-50 text-genie-700 flex items-center justify-center">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-navy-950">Nifty 50 Total Returns Index (TRI)</h3>
                  <Badge variant="green" size="xs">Verified Dataset</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Captures capital appreciation + gross reinvested dividends &bull; Provider: NSE Indices Limited
                </p>
              </div>
            </div>
            <div className="text-right text-[11px] text-slate-400">
              Coverage: {historicalMeta.coverage?.startDate} to {historicalMeta.coverage?.endDate} ({historicalMeta.count?.toLocaleString('en-IN')} sessions)
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Start Date & Level</div>
              <div className="text-xs font-bold text-navy-900">{triStats.first.date}</div>
              <div className="text-xs font-semibold text-slate-600">
                {triStats.first.tri.toLocaleString('en-IN', { maximumFractionDigits: 2 })} pts
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">End Date & Level</div>
              <div className="text-xs font-bold text-navy-900">{triStats.last.date}</div>
              <div className="text-xs font-semibold text-slate-600">
                {triStats.last.tri.toLocaleString('en-IN', { maximumFractionDigits: 2 })} pts
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Total Absolute Change</div>
              <div className={`text-xs font-bold ${triStats.change >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {triStats.change >= 0 ? '+' : ''}{triStats.changePercent}%
              </div>
              <div className="text-xs text-slate-500">
                {triStats.change >= 0 ? '+' : ''}{triStats.change.toLocaleString('en-IN', { maximumFractionDigits: 2 })} pts
              </div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Annualized (CAGR)</div>
              <div className="text-xs font-bold text-navy-900">
                {triStats.cagr ? `${triStats.cagr}% p.a.` : 'N/A'}
              </div>
              <div className="text-xs text-slate-500">over {triStats.yearsDiff} yrs</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 col-span-2 sm:col-span-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">Active Observations</div>
              <div className="text-xs font-bold text-navy-900">{filteredData.length.toLocaleString('en-IN')}</div>
              <div className="text-xs text-slate-500">trading sessions</div>
            </div>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-xs font-medium text-slate-500 mr-1">Time Horizon:</span>
            {TIME_RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => setTimeRange(r.label)}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  timeRange === r.label
                    ? 'bg-genie-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <div className="w-full h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="triGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0.01} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={{ stroke: '#e2e8f0' }}
                  interval="preserveStartEnd"
                  minTickGap={60}
                />
                <YAxis
                  dataKey="tri"
                  tick={{ fontSize: 10, fill: '#94a3b8' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => Number(v).toLocaleString('en-IN', { notation: 'compact' })}
                  width={55}
                />
                <Tooltip content={<TRITooltip />} />
                <Area
                  type="monotone"
                  dataKey="tri"
                  stroke="#16a34a"
                  strokeWidth={1.75}
                  fill="url(#triGradient)"
                  dot={false}
                  activeDot={{ r: 4, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Provenance Footer */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Verified Source: <strong>NSE Indices Limited</strong> &bull; Total Returns Index (TRI) includes reinvested dividends.
              </span>
            </div>
            <a
              href="https://www.niftyindices.com/reports/historical-data"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-genie-600 hover:text-genie-800 font-medium"
            >
              <ExternalLink className="w-3 h-3" />
              <span>Official NSE Indices Portal</span>
            </a>
          </div>

          {/* Educational Note */}
          <div className="mt-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 leading-relaxed flex items-start gap-2">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
            <span>
              <strong>TRI vs Price Index:</strong> A regular price index (like standard Nifty 50) measures stock price changes alone.
              The Total Returns Index (TRI) factors in all dividend payouts reinvested into the index. Indian mutual funds benchmark their performance strictly against TRI indices per SEBI regulations.
            </span>
          </div>
        </Card>
      )}

      {/* Unconnected / Loading state for historical data */}
      {historicalStatus !== 'connected' && (
        <Card className="border-slate-200 bg-white">
          <div className="flex items-start gap-4 p-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold text-navy-950">
                  Historical Benchmark Data
                </h3>
                <Badge variant={historicalStatus === 'loading' ? 'gray' : 'amber'} size="xs">
                  {historicalStatus === 'loading' ? 'Loading…' : 'Honest Unavailable State'}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                {historicalStatus === 'loading'
                  ? 'Connecting to verified historical dataset…'
                  : historicalStatus === 'error'
                    ? 'The backend could not be reached, so no market values are shown. Start the API server and retry; WealthGenie never substitutes fabricated chart points or returns.'
                    : 'WealthGenie does not fabricate market values, inject random chart points, or present fake historical returns. To connect real historical data, run "npm run import:nifty" or import a manual CSV.'}
              </p>

              {historicalStatus !== 'loading' && (
                <div className="border-t border-slate-100 pt-3">
                  <h4 className="text-xs font-bold text-navy-900 mb-2 uppercase tracking-wider">
                    Official Primary Data Sources Registry
                  </h4>
                  {sources.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {sources.map((src) => (
                        <div key={src.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs">
                          <div className="font-semibold text-navy-900">{src.name}</div>
                          <div className="text-[11px] text-slate-500">{src.provider}</div>
                          <div className="mt-1 text-[10px] text-amber-800 font-medium">{src.status}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">
                      Source registry unavailable{sourcesError ? `: ${sourcesError}` : '.'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* ─── Unified Historical SIP Simulator (Benchmark + Mutual Funds) ─── */}
      {instruments.length > 0 && (
        <Card className={`${simAccent.border} shadow-sm bg-gradient-to-b from-white to-slate-50/60`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-5">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-xl ${simAccent.bg} ${simAccent.text} flex items-center justify-center`}>
                <History className="w-5 h-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-navy-950">Historical SIP Simulator</h3>
                  <Badge variant="green" size="xs">Verified Market Data</Badge>
                </div>
                <p className="text-xs text-slate-500">
                  Compare a monthly SIP across the Nifty 50 TRI benchmark and verified direct-growth index funds
                </p>
              </div>
            </div>
            <span className="text-[11px] text-slate-400">
              {instruments.length} verified instrument{instruments.length === 1 ? '' : 's'} connected
            </span>
          </div>

          {/* Instrument selector */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-navy-900">Choose a verified instrument</label>
              {mutualFunds.status === 'connected' && (
                <span className="text-[10px] text-emerald-700 font-medium">AMFI scheme identities verified</span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {instruments.map((instrument) => {
                const active = instrument.id === selectedInstrumentId;
                const isBenchmark = instrument.kind === 'benchmark';
                return (
                  <button
                    key={instrument.id}
                    type="button"
                    onClick={() => setSelectedInstrumentId(instrument.id)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      active
                        ? 'border-transparent bg-navy-950 text-white shadow-md'
                        : 'bg-white border-slate-200 text-navy-950 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">{instrument.label}</span>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {isBenchmark ? 'TRI' : 'NAV'}
                      </span>
                    </div>
                    <div className={`text-[11px] mt-1 ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {isBenchmark ? 'Index benchmark' : `${instrument.plan} plan · ${instrument.option}`}
                    </div>
                    <div className={`text-[10px] mt-1 ${active ? 'text-slate-400' : 'text-slate-400'}`}>
                      {instrument.provider}
                    </div>
                    <div className={`text-[10px] mt-1.5 font-medium ${active ? 'text-slate-300' : 'text-slate-500'}`}>
                      {instrument.coverage.startDate} → {instrument.coverage.endDate}
                    </div>
                  </button>
                );
              })}
            </div>

            {mutualFunds.status === 'loading' && (
              <p className="mt-2 text-[11px] text-slate-400">Loading verified AMFI mutual fund schemes…</p>
            )}
            {mutualFunds.status !== 'connected' && mutualFunds.status !== 'loading' && (
              <div className="mt-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>
                  Mutual fund schemes are unavailable: {mutualFunds.message || 'verified AMFI data is not connected.'}
                </span>
              </div>
            )}
          </div>

          {/* Selected instrument identity */}
          {selectedInstrument && (
            <div className={`mb-5 p-3 rounded-xl border ${simAccent.border} ${simAccent.bg} flex flex-col sm:flex-row sm:items-center gap-3`}>
              <div className={`w-8 h-8 rounded-lg bg-white ${simAccent.text} flex items-center justify-center shrink-0 border ${simAccent.border}`}>
                {selectedInstrument.kind === 'benchmark' ? <Activity className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold text-navy-950">{selectedInstrument.identity}</p>
                  <Badge variant={selectedInstrument.kind === 'benchmark' ? 'indigo' : 'green'} size="xs">
                    {selectedInstrument.kind === 'benchmark' ? 'Benchmark index' : 'Mutual fund'}
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {selectedInstrument.provider}
                  {selectedInstrument.schemeCode ? ` · Scheme ${selectedInstrument.schemeCode}` : ''}
                  {selectedInstrument.isin ? ` · ISIN ${selectedInstrument.isin}` : ''}
                  {selectedInstrument.plan ? ` · ${selectedInstrument.plan} / ${selectedInstrument.option}` : ''}
                </p>
              </div>
              <div className="text-left sm:text-right text-[10px] text-slate-500 shrink-0">
                <div className="font-semibold text-slate-700">
                  {selectedInstrument.coverage.count.toLocaleString('en-IN')} observations
                </div>
                <div>Verified coverage: {selectedInstrument.coverage.startDate} → {selectedInstrument.coverage.endDate}</div>
              </div>
            </div>
          )}

          {/* Historical simulation disclaimer */}
          <div className={`mb-6 p-3 rounded-xl border ${simAccent.border} bg-white/80 text-xs text-slate-700 flex items-start gap-2.5`}>
            <AlertCircle className={`w-4 h-4 ${simAccent.text} shrink-0 mt-0.5`} />
            <div>
              <p className="font-semibold text-navy-950">Historical Back-test — Not a Future Prediction</p>
              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                {selectedInstrument?.kind === 'benchmark'
                  ? 'This simulation shows what would have happened if a fixed amount was invested monthly in the Nifty 50 TRI over the selected past period. The index itself is not directly investable.'
                  : 'This simulation uses actual published AMFI NAV observations for the selected mutual fund scheme. Fund NAVs already reflect recurring fund expenses, but results exclude exit loads, taxes and transaction costs.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Simulation Controls */}
            <div className="lg:col-span-5 space-y-5">
              <div>
                <label htmlFor="sim-monthly" className="block text-xs font-semibold text-navy-900 mb-1.5">
                  Monthly Contribution
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">₹</span>
                  <input
                    id="sim-monthly"
                    type="number"
                    min="500"
                    max="10000000"
                    step="500"
                    value={simMonthly}
                    onChange={(e) => setSimMonthly(Number(e.target.value))}
                    className="w-full pl-7 pr-3 py-2 text-sm font-bold text-navy-950 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-300"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[500, 2000, 5000, 10000, 25000].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setSimMonthly(amt)}
                      className={`px-2.5 py-1 text-[11px] rounded-lg font-medium transition-colors ${
                        simMonthly === amt
                          ? `${simAccent.button} text-white`
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {formatINR(amt)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-navy-900">Historical date range</label>
                  <span className="text-[10px] text-slate-400">Actual valuation date is shown after simulation</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="block text-[10px] font-medium text-slate-500 mb-1">Start date</span>
                    <input
                      type="date"
                      min={selectedCoverageStart || undefined}
                      max={simEndDate || selectedCoverageEnd || undefined}
                      value={simStartDate}
                      onChange={(e) => {
                        setSimStartDate(e.target.value);
                        setSimPreset(null);
                      }}
                      className="w-full px-2.5 py-2 text-xs text-navy-950 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-medium text-slate-500 mb-1">End date</span>
                    <input
                      type="date"
                      min={simStartDate || selectedCoverageStart || undefined}
                      max={selectedCoverageEnd || undefined}
                      value={simEndDate}
                      onChange={(e) => {
                        setSimEndDate(e.target.value);
                        setSimPreset(null);
                      }}
                      className="w-full px-2.5 py-2 text-xs text-navy-950 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-1.5 mt-2">
                  {SIMULATION_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => applyPreset(preset)}
                      className={`px-2 py-1.5 text-[10px] font-semibold rounded-lg border transition-colors ${
                        simPreset === preset.id
                          ? 'bg-navy-950 text-white border-navy-950'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                {selectedCoverageStart && selectedCoverageEnd && (
                  <p className="mt-2 text-[10px] text-slate-400">
                    Supported range: {selectedCoverageStart} to {selectedCoverageEnd}. Dates outside verified coverage are rejected.
                  </p>
                )}
              </div>

              {simFormError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{simFormError}</span>
                </div>
              )}

              {simError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{simError}</span>
                </div>
              )}

              {simLoading && (
                <div className="p-3 rounded-xl bg-white border border-slate-200 text-[11px] text-slate-500 flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                  Running deterministic back-test across verified observations…
                </div>
              )}

              {simResult && !simLoading && (
                <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Historical Outcome
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {simResult.startDate} → {simResult.endDate}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Capital Invested</div>
                      <div className="text-base font-bold text-navy-950">{formatINR(simResult.totalInvested)}</div>
                      <div className="text-[10px] text-slate-400">{simResult.installmentsCount} monthly SIPs</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Final Portfolio Value</div>
                      <div className={`text-base font-bold ${simAccent.text}`}>{formatINR(simResult.portfolioValue)}</div>
                      <div className={`text-[10px] font-semibold ${simResult.totalGain >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatSignedINR(simResult.totalGain)} ({simResult.absoluteReturnPct >= 0 ? '+' : ''}{simResult.absoluteReturnPct}%)
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Annualized Return (XIRR)</div>
                      <div className="text-sm font-extrabold text-navy-900">
                        {simResult.annualizedReturnXIRR != null ? `${simResult.annualizedReturnXIRR}% p.a.` : 'N/A'}
                      </div>
                      <div className="text-[10px] text-slate-400">actual dated cash flows</div>
                    </div>

                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        {simResult.instrumentType === 'benchmark' ? 'Buy-and-Hold Index CAGR' : 'NAV Change Over Period'}
                      </div>
                      <div className="text-sm font-bold text-slate-700">
                        {simResult.instrumentType === 'benchmark'
                          ? simResult.indexBuyAndHoldCAGR != null
                            ? `${simResult.indexBuyAndHoldCAGR}% p.a.`
                            : 'N/A'
                          : `${simResult.navChangePct >= 0 ? '+' : ''}${simResult.navChangePct}%`}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {simResult.instrumentType === 'benchmark' ? 'lumpsum reference' : 'first to final NAV'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Units Accumulated</div>
                      <div className="text-xs font-bold text-navy-900">
                        {Number(simResult.unitsAccumulated || 0).toLocaleString('en-IN', { maximumFractionDigits: 4 })}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {simResult.instrumentType === 'benchmark' ? 'index units' : 'fund units'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase">Observations Used</div>
                      <div className="text-xs font-bold text-navy-900">
                        {Number(simResult.observationsInRange || 0).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        requested {simResult.requestedStartDate} → {simResult.requestedEndDate}
                      </div>
                    </div>
                  </div>

                  {simResult.skippedContributionMonths?.length > 0 && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      No eligible observation existed in {simResult.skippedContributionMonths.length} month(s), so those
                      contributions were skipped: {simResult.skippedContributionMonths.join(', ')}.
                    </p>
                  )}
                  {simResult.annualizedReturnXIRR == null && (
                    <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                      {simResult.annualizedReturnNote || 'XIRR could not be computed for this cash-flow set.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Simulation Growth Chart */}
            <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-xs font-bold text-navy-950">
                    Historical Portfolio Progression vs Capital Invested
                  </div>
                  {simResult && (
                    <span className="text-[11px] text-slate-500">
                      {simResult.startDate} → {simResult.endDate}
                    </span>
                  )}
                </div>

                {simLoading ? (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                    Computing deterministic back-test across verified observations…
                  </div>
                ) : simulationChartData.length > 0 ? (
                  <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={simulationChartData} margin={{ top: 5, right: 5, left: 10, bottom: 5 }}>
                        <defs>
                          <linearGradient id="simValGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={simAccent.stroke} stopOpacity={0.2} />
                            <stop offset="95%" stopColor={simAccent.stroke} stopOpacity={0.01} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 9, fill: '#94a3b8' }}
                          tickLine={false}
                          interval="preserveStartEnd"
                          minTickGap={40}
                        />
                        <YAxis
                          tick={{ fontSize: 9, fill: '#94a3b8' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => formatINR(v)}
                          width={70}
                        />
                        <Tooltip content={<SimulationTooltip />} />
                        <Area
                          type="monotone"
                          dataKey="portfolioValue"
                          name="Portfolio Value"
                          stroke={simAccent.stroke}
                          strokeWidth={2}
                          fill="url(#simValGradient)"
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="totalInvested"
                          name="Capital Invested"
                          stroke="#94a3b8"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-xs text-slate-400">
                    {simFormError || simError ? 'Fix the highlighted issue to run the simulation.' : 'No simulation data available for this range.'}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-500 leading-relaxed space-y-1.5">
                <p>
                  <strong>Documented methodology:</strong>{' '}
                  {simResult?.calculationMethod ||
                    'Monthly contributions use the first available verified observation on or after the 1st of each month. Missing dates are never interpolated. Ending value uses the last available observation on or before the selected end date. XIRR uses actual dated cash flows.'}
                </p>
                {simResult && (
                  <p>
                    <strong>Actual valuation:</strong> {simResult.endDate} (requested end {simResult.requestedEndDate});{' '}
                    {simResult.observationsInRange.toLocaleString('en-IN')} observations in range.
                  </p>
                )}
                {simResult?.disclaimer && (
                  <p className="text-[10px] text-slate-400">{simResult.disclaimer}</p>
                )}
              </div>
            </div>
          </div>

          {/* Source identity and provenance */}
          {selectedInstrument && (
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col lg:flex-row lg:items-start justify-between gap-3 text-[10px] text-slate-500">
              <div className="flex items-start gap-2 min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-0.5">
                  <p>
                    <strong className="text-slate-700">Verified source:</strong> {selectedInstrument.provider} ·{' '}
                    {selectedInstrument.units}
                    {selectedInstrument.retrievalDate
                      ? ` · retrieved ${new Date(selectedInstrument.retrievalDate).toLocaleString('en-IN')}`
                      : ''}
                  </p>
                  {selectedInstrument.rawSha256 && (
                    <p className="font-mono break-all text-[9px] text-slate-400">
                      SHA-256 {selectedInstrument.rawSha256}
                    </p>
                  )}
                  <p>
                    Actual back-test valuation date:{' '}
                    <strong className="text-slate-700">{simResult?.endDate || 'pending simulation'}</strong>
                  </p>
                </div>
              </div>
              <a
                href={selectedInstrument.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-genie-600 hover:text-genie-800 font-medium shrink-0"
              >
                <ExternalLink className="w-3 h-3" />
                <span>{selectedInstrument.kind === 'benchmark' ? 'Official NSE Indices portal' : 'Official AMFI NAV portal'}</span>
              </a>
            </div>
          )}
        </Card>
      )}

      {/* 7. Educational disclaimer and assumptions */}
      <Card className="border-slate-200 bg-slate-50">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
            <Info className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-navy-950">Educational disclaimer and assumptions</h2>
            <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600 leading-relaxed list-disc pl-4">
              <li>
                <strong>Projection formula:</strong>{' '}
                <code className="bg-white px-1 py-0.5 rounded border border-slate-200">
                  FV = C x (((1 + r)^n - 1) / r)
                </code>{' '}
                when r is not zero, and <code className="bg-white px-1 py-0.5 rounded border border-slate-200">FV = C x n</code> when r is zero.
              </li>
              <li>
                <strong>Monthly rate:</strong>{' '}
                <code className="bg-white px-1 py-0.5 rounded border border-slate-200">r = (1 + annualReturn)^(1/12) - 1</code>, where the annual return is an effective annual assumption, not a guarantee.
              </li>
              <li>
                <strong>Contribution timing:</strong> C is invested at the end of each month (ordinary annuity). The first contribution earns no return in month 1 and the last earns no return in month n.
              </li>
              <li>
                <strong>Not modelled:</strong> taxes, fees, exit loads, inflation, changing income, volatility, or real market paths. Actual results will differ.
              </li>
              <li>
                <strong>Downside scenarios:</strong> a single decline is applied to the projected end value. It is not a forecast, a path simulation, or a recovery model.
              </li>
              <li>
                <strong>Historical vs hypothetical:</strong> the Historical Performance Lab uses verified past observations. Past performance does not predict future returns, and historical metrics are not used as planner assumptions.
              </li>
              <li>
                <strong>Resilience:</strong> emergency savings and the investment portfolio are kept separate. The planner does not recommend investing your entire surplus, and it does not double-count savings, EMI, or goal contributions.
              </li>
              <li>
                This is an educational scenario tool, not personalized regulated investment advice.
              </li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
