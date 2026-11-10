import React from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PiggyBank,
  TrendingUp,
  Sparkles,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Calculator,
  Target,
  Calendar,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import ProgressBar from '../components/common/ProgressBar';
import { formatINR } from '../utils/formatters';
import {
  assessmentGoalLabel,
  formatAssessmentDate,
} from '../utils/assessmentDisplay';
import { useUserData } from '../context/UserDataContext';

function SnapshotTile({ icon: Icon, label, value, hint }) {
  return (
    <Card className="flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg border bg-slate-50 text-navy-800 border-slate-200 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="text-lg font-bold text-navy-950 mt-0.5 break-words">
          {value}
        </div>
        {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
      </div>
    </Card>
  );
}

export default function MyFinancesPage({ onNavigate }) {
  const { latestAssessment, assessments, goals, loading, error, refresh } =
    useUserData();

  const result = latestAssessment?.result;
  const metrics = result?.metrics;

  const totalTargeted = goals.reduce(
    (acc, goal) => acc + (Number(goal.targetAmount) || 0),
    0
  );
  const totalSaved = goals.reduce(
    (acc, goal) => acc + (Number(goal.currentAmount) || 0),
    0
  );
  const totalPercentage =
    totalTargeted > 0 ? Math.round((totalSaved / totalTargeted) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
            <Wallet className="w-3.5 h-3.5" />
            <span>Personal Cash Flow & Liquid Reserves</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            My Finances
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            A snapshot built from the financial assessment saved to your account.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => onNavigate('assessment')}
            className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-navy-900 hover:bg-navy-800 text-white transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>{latestAssessment ? 'Run new assessment' : 'Run assessment'}</span>
          </button>
          <button
            type="button"
            onClick={refresh}
            className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-navy-800 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start justify-between gap-3">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </span>
          <button
            type="button"
            onClick={refresh}
            className="shrink-0 inline-flex items-center gap-1 font-semibold text-amber-900 hover:text-amber-950"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <Card className="p-12 flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
          <span>Loading your saved financial data...</span>
        </Card>
      ) : !metrics ? (
        <Card className="p-12 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
            <Wallet className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-navy-900 mb-1">No Financial Snapshot Yet</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            WealthGenie does not fabricate account balances or transactions.
            Run a financial assessment to save your income, expenses, savings,
            and goal projection to your account.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('assessment')}
            className="px-5 py-2.5 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors inline-flex items-center gap-2 shadow-2xs"
          >
            <Sparkles className="w-4 h-4 text-genie-400" />
            <span>Run your first assessment</span>
          </button>
        </Card>
      ) : (
        <>
          {/* Latest assessment snapshot */}
          <section aria-labelledby="snapshot-heading">
            <div className="flex items-center justify-between mb-3">
              <h2 id="snapshot-heading" className="text-base font-bold text-navy-950">
                Latest Assessment Snapshot
              </h2>
              <span className="text-xs text-slate-400">
                {formatAssessmentDate(latestAssessment.createdAt)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SnapshotTile
                icon={ArrowUpRight}
                label="Monthly income"
                value={formatINR(metrics.monthlyIncome)}
                hint="Take-home inflow"
              />
              <SnapshotTile
                icon={ArrowDownRight}
                label="Monthly outflows"
                value={formatINR(metrics.monthlyOutflows)}
                hint={
                  metrics.emiIncludedInExpenses
                    ? 'Expenses include EMI payments'
                    : 'Expenses plus separate EMI payments'
                }
              />
              <SnapshotTile
                icon={PiggyBank}
                label="Accessible savings"
                value={formatINR(metrics.accessibleSavings)}
                hint={
                  metrics.expenseCoverageMonths === null
                    ? 'Coverage unavailable'
                    : `${metrics.expenseCoverageMonths.toFixed(1)} months of expenses`
                }
              />
              <SnapshotTile
                icon={ShieldCheck}
                label="EMI payments"
                value={formatINR(metrics.emiPayments)}
                hint="Monthly debt obligations"
              />
            </div>
          </section>

          {/* Cashflow & Goals */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cash Flow Summary Card */}
            <Card className="lg:col-span-2 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
                  <div>
                    <h3 className="text-base font-bold text-navy-950">Monthly Flow Health</h3>
                    <p className="text-xs text-slate-500">
                      Comparing incoming income vs outgoing expenses from your assessment
                    </p>
                  </div>
                  <Badge variant={metrics.monthlySurplus >= 0 ? 'green' : 'rose'} size="xs">
                    {metrics.monthlySurplus >= 0 ? 'Surplus' : 'Shortfall'}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-7 h-7 rounded-md bg-emerald-50 text-emerald-700 flex items-center justify-center">
                        <ArrowUpRight className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-navy-900">Monthly Income</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-700">
                      +{formatINR(metrics.monthlyIncome)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-7 h-7 rounded-md bg-rose-50 text-rose-700 flex items-center justify-center">
                        <ArrowDownRight className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-navy-900">Total Outflows</span>
                    </div>
                    <span className="text-sm font-bold text-slate-700">
                      -{formatINR(metrics.monthlyOutflows)}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-7 h-7 rounded-md bg-indigo-50 text-indigo-700 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4" />
                      </div>
                      <span className="font-medium text-navy-900">Savings Rate</span>
                    </div>
                    <span className="text-sm font-bold text-navy-900">
                      {metrics.savingsRatePct === null
                        ? 'Not available'
                        : `${metrics.savingsRatePct.toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="p-3.5 bg-genie-50/70 rounded-xl border border-genie-200/80 flex items-center justify-between">
                    <div className="text-xs">
                      <span className="font-bold text-genie-950 block">Net Monthly Surplus</span>
                      <span className="text-[11px] text-genie-800">
                        {metrics.savingsRatePct === null
                          ? 'Savings rate unavailable'
                          : `${metrics.savingsRatePct.toFixed(1)}% of income`}
                      </span>
                    </div>
                    <span
                      className={`text-base font-extrabold ${
                        metrics.monthlySurplus >= 0 ? 'text-genie-800' : 'text-rose-700'
                      }`}
                    >
                      {metrics.monthlySurplus >= 0 ? '+' : '-'}
                      {formatINR(Math.abs(metrics.monthlySurplus))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-genie-600 shrink-0" />
                <span>
                  {metrics.savingsRatePct !== null && metrics.savingsRatePct >= 20
                    ? 'Your savings rate meets the common 20% guideline.'
                    : 'Review your budget to see whether you can increase your monthly surplus.'}
                </span>
              </div>
            </Card>

            {/* Goals Summary */}
            <Card className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-base font-bold text-navy-950">Savings Goals</h3>
                  <Target className="w-4 h-4 text-slate-400" />
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  {goals.length === 0
                    ? 'No goals saved yet.'
                    : `${goals.length} goal${goals.length === 1 ? '' : 's'} saved to your account`}
                </p>

                {goals.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('goals')}
                    className="w-full py-2 text-xs font-semibold text-genie-700 bg-genie-50 hover:bg-genie-100 border border-genie-200 rounded-lg transition-colors"
                  >
                    Create your first goal
                  </button>
                ) : (
                  <>
                    <div className="text-2xl font-extrabold text-navy-950">
                      {formatINR(totalSaved)}
                      <span className="text-sm font-normal text-slate-400">
                        {' '}of {formatINR(totalTargeted)}
                      </span>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-600">Funded</span>
                        <span className="font-bold text-genie-700">{totalPercentage}%</span>
                      </div>
                      <ProgressBar value={totalSaved} max={totalTargeted || 1} size="md" />
                    </div>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => onNavigate('goals')}
                className="mt-4 pt-3 border-t border-slate-100 text-xs font-semibold text-navy-800 hover:text-navy-950 inline-flex items-center justify-center gap-1"
              >
                <span>Manage goals</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </Card>
          </div>

          {/* Assessment history */}
          <section aria-labelledby="history-heading">
            <div className="flex items-center justify-between mb-3">
              <h2 id="history-heading" className="text-base font-bold text-navy-950">
                Assessment History
              </h2>
              <span className="text-xs text-slate-400">
                {assessments.length} saved
              </span>
            </div>

            <Card padding="none" className="overflow-hidden">
              <div className="divide-y divide-slate-100">
                {assessments.slice(0, 5).map((assessment) => {
                  const rowMetrics = assessment.result?.metrics;
                  return (
                    <div
                      key={assessment.id}
                      className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-genie-50 text-genie-700 flex items-center justify-center shrink-0">
                          <Calculator className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-navy-900 truncate">
                            {assessmentGoalLabel(assessment.goal)}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-2">
                            <Calendar className="w-3 h-3" />
                            <span>{formatAssessmentDate(assessment.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[11px] text-slate-400">Monthly surplus</div>
                        <div
                          className={`text-sm font-bold ${
                            (rowMetrics?.monthlySurplus ?? 0) >= 0
                              ? 'text-emerald-700'
                              : 'text-rose-700'
                          }`}
                        >
                          {(rowMetrics?.monthlySurplus ?? 0) >= 0 ? '+' : '-'}
                          {formatINR(Math.abs(rowMetrics?.monthlySurplus ?? 0))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
