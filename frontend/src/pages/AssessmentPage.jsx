import React, { useState } from 'react';
import {
  Calculator,
  Wallet,
  PiggyBank,
  Target,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  Info,
  ShieldCheck,
  CheckCircle,
  Loader2,
  Sparkles,
  History,
  RefreshCw,
  Trash2,
  Eye,
  Save,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { formatINR } from '../utils/formatters';
import {
  ASSESSMENT_GOAL_OPTIONS,
  assessmentGoalLabel,
  formatAssessmentDateTime,
} from '../utils/assessmentDisplay';
import { useUserData } from '../context/UserDataContext';

const INITIAL_FORM = {
  monthlyIncome: '',
  monthlyExpenses: '',
  accessibleSavings: '',
  goal: 'emergency_fund',
  emiPayments: '',
  emiIncludedInExpenses: true,
  monthlySavingsCapacity: '',
  targetAmount: '',
  currentGoalSavings: '',
  goalTimelineMonths: '',
};

function optionalNumber(value) {
  return value === '' ? undefined : Number(value);
}

function MetricCard({ icon: Icon, label, value, hint, tone = 'navy' }) {
  const toneStyles = {
    navy: 'bg-slate-50 text-navy-800 border-slate-200',
    green: 'bg-genie-50 text-genie-800 border-genie-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    rose: 'bg-rose-50 text-rose-800 border-rose-200',
  };

  return (
    <Card className="flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${toneStyles[tone]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </div>
        <div className="text-lg font-bold text-navy-950 mt-0.5 break-words">{value}</div>
        {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
      </div>
    </Card>
  );
}

function ListCard({ title, icon: Icon, items, tone = 'amber' }) {
  if (!items || items.length === 0) return null;

  const toneStyles = {
    amber: 'border-amber-200 bg-amber-50/60 text-amber-900',
    green: 'border-genie-200 bg-genie-50/60 text-genie-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  };

  return (
    <Card className={`border ${toneStyles[tone]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4" />
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      <ul className="space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-current shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function AssessmentPage() {
  const {
    assessments,
    createAssessment,
    deleteAssessment,
    loading: historyLoading,
    error: historyError,
    refresh,
  } = useUserData();

  const [form, setForm] = useState(INITIAL_FORM);
  const [result, setResult] = useState(null);
  const [savedId, setSavedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setSavedId('');

    const payload = {
      monthlyIncome: Number(form.monthlyIncome),
      monthlyExpenses: Number(form.monthlyExpenses),
      accessibleSavings: Number(form.accessibleSavings),
      goal: form.goal,
      emiIncludedInExpenses: form.emiIncludedInExpenses,
    };

    const optionalFields = [
      'emiPayments',
      'monthlySavingsCapacity',
      'targetAmount',
      'currentGoalSavings',
      'goalTimelineMonths',
    ];

    optionalFields.forEach((field) => {
      const value = optionalNumber(form[field]);
      if (value !== undefined) payload[field] = value;
    });

    try {
      const saved = await createAssessment(payload);
      setResult(saved.result);
      setSavedId(saved.id);
    } catch (err) {
      setError(err.message || 'Unable to assess your finances right now.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setResult(null);
    setSavedId('');
    setError('');
  };

  const handleViewHistory = (assessment) => {
    if (!assessment.result?.metrics) return;
    setResult(assessment.result);
    setSavedId(assessment.id);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteHistory = async (assessment) => {
    const confirmed = window.confirm(
      'Delete this saved assessment? This cannot be undone.'
    );
    if (!confirmed) return;

    setDeletingId(assessment.id);

    try {
      await deleteAssessment(assessment.id);
      if (savedId === assessment.id) {
        setResult(null);
        setSavedId('');
      }
    } catch (deleteError) {
      setError(deleteError.message || 'Unable to delete the assessment.');
    } finally {
      setDeletingId('');
    }
  };

  const metrics = result?.metrics;
  const projection = result?.goalProjection;
  const hasResult = Boolean(metrics);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
          <Calculator className="w-3.5 h-3.5" />
          <span>Transparent Financial Check-Up</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Financial Assessment
        </h1>
        <p className="text-sm text-slate-600 mt-0.5 max-w-2xl">
          Enter your monthly cash flow and a goal. WealthGenie will calculate your surplus, savings rate, expense coverage, and an illustrative goal timeline, then save the result to your account.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-2 self-start">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-navy-950">Your monthly numbers</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Four fields are required. Everything else is optional.
              </p>
            </div>

            <div>
              <label htmlFor="monthlyIncome" className="block text-xs font-semibold text-navy-900 mb-1">
                Monthly income (₹) <span className="text-rose-600">*</span>
              </label>
              <input
                id="monthlyIncome"
                type="number"
                required
                min="0"
                step="1"
                value={form.monthlyIncome}
                onChange={(e) => updateField('monthlyIncome', e.target.value)}
                placeholder="e.g. 75000"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            <div>
              <label htmlFor="monthlyExpenses" className="block text-xs font-semibold text-navy-900 mb-1">
                Monthly expenses (₹) <span className="text-rose-600">*</span>
              </label>
              <input
                id="monthlyExpenses"
                type="number"
                required
                min="0"
                step="1"
                value={form.monthlyExpenses}
                onChange={(e) => updateField('monthlyExpenses', e.target.value)}
                placeholder="e.g. 40000"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            <div>
              <label htmlFor="accessibleSavings" className="block text-xs font-semibold text-navy-900 mb-1">
                Accessible savings (₹) <span className="text-rose-600">*</span>
              </label>
              <input
                id="accessibleSavings"
                type="number"
                required
                min="0"
                step="1"
                value={form.accessibleSavings}
                onChange={(e) => updateField('accessibleSavings', e.target.value)}
                placeholder="e.g. 150000"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            <div>
              <label htmlFor="goal" className="block text-xs font-semibold text-navy-900 mb-1">
                Financial goal <span className="text-rose-600">*</span>
              </label>
              <select
                id="goal"
                required
                value={form.goal}
                onChange={(e) => updateField('goal', e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              >
                {ASSESSMENT_GOAL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                Optional personalisation
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="emiPayments" className="block text-xs font-semibold text-navy-900 mb-1">
                      EMI payments (₹)
                    </label>
                    <input
                      id="emiPayments"
                      type="number"
                      min="0"
                      step="1"
                      value={form.emiPayments}
                      onChange={(e) => updateField('emiPayments', e.target.value)}
                      placeholder="e.g. 12000"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="monthlySavingsCapacity" className="block text-xs font-semibold text-navy-900 mb-1">
                      Savings capacity (₹/mo)
                    </label>
                    <input
                      id="monthlySavingsCapacity"
                      type="number"
                      min="0"
                      step="1"
                      value={form.monthlySavingsCapacity}
                      onChange={(e) => updateField('monthlySavingsCapacity', e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.emiIncludedInExpenses}
                    onChange={(e) => updateField('emiIncludedInExpenses', e.target.checked)}
                    className="mt-0.5 accent-genie-600"
                  />
                  <span>My monthly expenses already include EMI payments</span>
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="targetAmount" className="block text-xs font-semibold text-navy-900 mb-1">
                      Goal target (₹)
                    </label>
                    <input
                      id="targetAmount"
                      type="number"
                      min="1"
                      step="1"
                      value={form.targetAmount}
                      onChange={(e) => updateField('targetAmount', e.target.value)}
                      placeholder="e.g. 500000"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                    />
                  </div>

                  <div>
                    <label htmlFor="currentGoalSavings" className="block text-xs font-semibold text-navy-900 mb-1">
                      Already saved (₹)
                    </label>
                    <input
                      id="currentGoalSavings"
                      type="number"
                      min="0"
                      step="1"
                      value={form.currentGoalSavings}
                      onChange={(e) => updateField('currentGoalSavings', e.target.value)}
                      placeholder="e.g. 50000"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="goalTimelineMonths" className="block text-xs font-semibold text-navy-900 mb-1">
                    Desired timeline (months)
                  </label>
                  <input
                    id="goalTimelineMonths"
                    type="number"
                    min="1"
                    step="1"
                    value={form.goalTimelineMonths}
                    onChange={(e) => updateField('goalTimelineMonths', e.target.value)}
                    placeholder="e.g. 24"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleReset}
                className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-navy-900 rounded-lg"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>{loading ? 'Assessing & saving...' : 'Assess & save'}</span>
              </button>
            </div>
          </form>
        </Card>

        <div className="lg:col-span-3 space-y-5">
          {!hasResult ? (
            <Card className="p-10 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
              <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-4">
                <Calculator className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-navy-900 mb-1">Your assessment will appear here</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto">
                Fill in the required fields and submit the form. The result is a transparent, rule-based illustration, not a prediction or regulated advice. Completed assessments are saved to your account.
              </p>
            </Card>
          ) : (
            <>
              <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs font-semibold uppercase tracking-wider text-genie-700">
                      Assessment complete
                    </div>
                    {savedId && (
                      <Badge variant="green" size="xs">
                        <Save className="w-3 h-3" />
                        <span>Saved</span>
                      </Badge>
                    )}
                  </div>
                  <h2 className="text-xl font-extrabold text-navy-950">
                    {assessmentGoalLabel(result.goal)}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Version {result.assessmentVersion} • All amounts in INR
                  </p>
                </div>
                <Badge variant={metrics.monthlySurplus >= 0 ? 'green' : 'rose'} size="sm">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{metrics.monthlySurplus >= 0 ? 'Surplus' : 'Shortfall'}</span>
                </Badge>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <MetricCard
                  icon={Wallet}
                  label="Monthly surplus"
                  value={formatINR(metrics.monthlySurplus)}
                  hint={`Outflows: ${formatINR(metrics.monthlyOutflows)}`}
                  tone={metrics.monthlySurplus >= 0 ? 'green' : 'rose'}
                />
                <MetricCard
                  icon={TrendingUp}
                  label="Savings rate"
                  value={metrics.savingsRatePct === null ? 'Not available' : `${metrics.savingsRatePct.toFixed(1)}%`}
                  hint={metrics.savingsRatePct === null ? 'Income is zero' : 'Of monthly income'}
                  tone="navy"
                />
                <MetricCard
                  icon={ShieldCheck}
                  label="Expense coverage"
                  value={
                    metrics.expenseCoverageMonths === null
                      ? 'Not available'
                      : `${metrics.expenseCoverageMonths.toFixed(1)} months`
                  }
                  hint="Accessible savings ÷ expenses"
                  tone="amber"
                />
              </div>

              {projection && (
                <Card>
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-genie-700" />
                      <h3 className="text-base font-bold text-navy-950">Goal projection</h3>
                    </div>
                    {projection.onTrackForRequestedTimeline !== null && (
                      <Badge variant={projection.onTrackForRequestedTimeline ? 'green' : 'amber'} size="xs">
                        {projection.onTrackForRequestedTimeline ? 'On track' : 'Timeline gap'}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-slate-500">Target</div>
                      <div className="font-bold text-navy-950 mt-0.5">{formatINR(projection.targetAmount)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-slate-500">Already saved</div>
                      <div className="font-bold text-navy-950 mt-0.5">{formatINR(projection.currentGoalSavings)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-slate-500">Remaining</div>
                      <div className="font-bold text-navy-950 mt-0.5">{formatINR(projection.remainingAmount)}</div>
                    </div>
                    <div className="p-3 rounded-lg bg-genie-50 border border-genie-200">
                      <div className="text-genie-800">Estimated time</div>
                      <div className="font-bold text-genie-950 mt-0.5">
                        {projection.estimatedMonths === null
                          ? 'Add a contribution'
                          : projection.estimatedMonths === 0
                            ? 'Goal met'
                            : `${projection.estimatedMonths} months`}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
                    <div className="p-3 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">Assumed monthly contribution</span>
                      <div className="font-semibold text-navy-900 mt-0.5">
                        {formatINR(projection.assumedMonthlyContribution)}
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-white border border-slate-100">
                      <span className="text-slate-500">
                        {projection.requestedTimelineMonths === null
                          ? 'Desired timeline'
                          : `Required for ${projection.requestedTimelineMonths}-month timeline`}
                      </span>
                      <div className="font-semibold text-navy-900 mt-0.5">
                        {projection.requiredMonthlyContributionForTimeline === null
                          ? 'Not specified'
                          : `${formatINR(projection.requiredMonthlyContributionForTimeline)}/mo`}
                      </div>
                    </div>
                  </div>
                </Card>
              )}

              <ListCard
                title="Warnings"
                icon={AlertTriangle}
                items={result.warnings}
                tone="amber"
              />

              <ListCard
                title="Recommendations"
                icon={Lightbulb}
                items={result.recommendations}
                tone="green"
              />

              <ListCard
                title="Assumptions"
                icon={Info}
                items={result.assumptions}
                tone="slate"
              />

              <Card className="border-slate-200 bg-slate-50">
                <div className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                  <PiggyBank className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
                  <span>{result.disclaimer}</span>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Assessment history */}
      <section aria-labelledby="assessment-history-heading">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" />
            <h2 id="assessment-history-heading" className="text-base font-bold text-navy-950">
              Assessment History
            </h2>
            <Badge variant="slate" size="xs">
              {assessments.length} saved
            </Badge>
          </div>
          <button
            type="button"
            onClick={refresh}
            className="text-xs font-semibold text-slate-500 hover:text-navy-900 inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        </div>

        {historyError && (
          <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{historyError}</span>
          </div>
        )}

        {historyLoading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
            <span>Loading your saved assessments...</span>
          </Card>
        ) : assessments.length === 0 ? (
          <Card className="p-8 text-center border-dashed border-2 border-slate-200 bg-slate-50/50">
            <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-navy-900">No saved assessments yet</p>
            <p className="text-xs text-slate-500 mt-1">
              Complete the form above to save your first assessment to your account.
            </p>
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="divide-y divide-slate-100">
              {assessments.map((assessment) => {
                const rowMetrics = assessment.result?.metrics;
                const isActive = savedId === assessment.id;
                return (
                  <div
                    key={assessment.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      isActive ? 'bg-genie-50/40' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-genie-50 text-genie-700 flex items-center justify-center shrink-0">
                        <Calculator className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-navy-900 truncate">
                          {assessmentGoalLabel(assessment.goal)}
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatAssessmentDateTime(assessment.createdAt)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-right">
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

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleViewHistory(assessment)}
                          disabled={!assessment.result}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-navy-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteHistory(assessment)}
                          disabled={deletingId === assessment.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 disabled:opacity-60 transition-colors"
                        >
                          {deletingId === assessment.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}
