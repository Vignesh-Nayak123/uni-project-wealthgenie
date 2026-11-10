import React from 'react';
import {
  Calendar,
  Award,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Target,
  Calculator,
} from 'lucide-react';
import FinancialSummary from '../components/dashboard/FinancialSummary';
import GoalProgressCard from '../components/dashboard/GoalProgressCard';
import AskGenieBanner from '../components/dashboard/AskGenieBanner';
import RecommendedLessons from '../components/dashboard/RecommendedLessons';
import DailyInsight from '../components/dashboard/DailyInsight';
import DisclaimerBanner from '../components/layout/DisclaimerBanner';
import Card from '../components/common/Card';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';
import { MOCK_LESSONS, MOCK_DAILY_INSIGHT } from '../data/mockData';

function buildSummary(assessment) {
  const metrics = assessment?.metrics;
  if (!metrics) return null;

  const monthlyExpenses = Number(metrics.monthlyExpenses) || 0;

  return {
    accessibleSavings: Number(metrics.accessibleSavings) || 0,
    monthlyInflow: Number(metrics.monthlyIncome) || 0,
    monthlyOutflow: Number(metrics.monthlyOutflows) || 0,
    monthlySavings: Number(metrics.monthlySurplus) || 0,
    savingsRate: metrics.savingsRatePct,
    emergencyFundCurrent: Number(metrics.accessibleSavings) || 0,
    emergencyFundTarget: monthlyExpenses * 6,
    emergencyFundMonths: metrics.expenseCoverageMonths,
  };
}

function formatINRRough(value) {
  if (!Number.isFinite(Number(value))) return '';
  const rounded = Math.max(0, Math.round(Number(value)));
  return `₹${rounded.toLocaleString('en-IN')}`;
}

/**
 * One personalized, actionable insight derived from the saved assessment.
 * Falls back to the neutral daily-habit tip when no assessment exists.
 */
function buildPersonalizedInsight(summary, goals) {
  if (!summary) return MOCK_DAILY_INSIGHT;

  const date = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });

  const months = Number(summary.emergencyFundMonths);
  if (Number.isFinite(months) && months < 3) {
    const monthlyExpenses = Number(summary.emergencyFundTarget) / 6;
    const gap = Math.max(
      0,
      Number(summary.emergencyFundTarget) - Number(summary.emergencyFundCurrent)
    );
    const pace = Math.max(
      Math.ceil(Number(summary.monthlySavings) * 0.5) || 500,
      500
    );
    return {
      date,
      tag: 'Priority: Emergency fund',
      title: 'Build a 3-month safety buffer before investing',
      summary: `Your accessible savings cover about ${months.toFixed(1)} month(s) of expenses — below the 3-month safety level. Closing the ${formatINRRough(gap)} gap protects you when unexpected expenses appear, so the emergency fund comes first.`,
      actionLabel: 'Test in Digital Twin',
      actionStep: `Set aside ${formatINRRough(pace)} of this month's surplus into the emergency fund, then track the buffer under Digital Twin.`,
    };
  }

  const savingsRate = Number(summary.savingsRate);
  if (Number.isFinite(savingsRate) && savingsRate < 20) {
    return {
      date,
      tag: 'Priority: Savings rate',
      title: 'Raise your savings rate above 20%',
      summary: `You currently save about ${savingsRate.toFixed(1)}% of your income (${formatINRRough(summary.monthlySavings)} per month). Most plans work best when at least a fifth of income is kept, so look for one recurring expense to trim or quantify.`,
      actionLabel: 'Test in Digital Twin',
      actionStep: `Pick one habit to trim this month, then run a Digital Twin scenario with the lower expenses figure to see ${formatINRRough(summary.monthlySavings)} grow into a goal timeline.`,
    };
  }

  if (goals.length > 0) {
    return {
      date,
      tag: 'Priority: Goal funding',
      title: 'Put your surplus to work on a goal',
      summary: `You keep ${formatINRRough(summary.monthlySavings)} every month with a solid savings rate of ${Number(savingsRate).toFixed(1)}%. Directing a fixed share of that surplus to a named goal turns spare cash into measured progress.`,
      actionLabel: 'Test in Digital Twin',
      actionStep: `Open Digital Twin and test a scenario that adds ${formatINRRough(Math.ceil(Number(summary.monthlySavings) * 0.3) || 500)} per month toward one of your ${goals.length} goal(s).`,
    };
  }

  return {
    date,
    tag: 'Priority: First goal',
    title: 'Turn your surplus into a concrete goal',
    summary: `You save ${formatINRRough(summary.monthlySavings)} a month at a ${Number(savingsRate).toFixed(1)}% savings rate, but none of it is attached to a goal yet. Naming what the money is for makes it measurable.`,
    actionLabel: 'Create a goal',
    actionStep: 'Create one savings goal on the Goals page, then check its timeline in Digital Twin.',
  };
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export default function HomePage({
  onNavigate,
  onNavigateWithPrompt,
  onOpenNewGoalModal,
  onSelectLesson,
}) {
  const { user, profile } = useAuth();
  const {
    goals,
    latestAssessment,
    assessments,
    loading,
    error,
    refresh,
  } = useUserData();

  const currentDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const displayName =
    profile?.displayName || user?.email?.split('@')[0] || 'there';
  const firstName = displayName.split(' ')[0];
  const summary = buildSummary(latestAssessment?.result);
  const lastAssessmentDate = formatDate(latestAssessment?.createdAt);
  const personalizedInsight = buildPersonalizedInsight(summary, goals);
  const insightTarget = !summary ? 'assessment' : 'twin';

  return (
    <div className="space-y-6">
      {/* Educational Notice Banner */}
      <DisclaimerBanner />

      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{currentDate}</span>
            <span>•</span>
            <span className="text-genie-700 font-semibold">
              Signed-in account
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Here is your financial literacy overview and the data saved to your
            account.
          </p>
        </div>

        {/* Saved data snapshot */}
        <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-slate-200/90 shadow-2xs self-start sm:self-auto">
          <div className="w-10 h-10 rounded-lg bg-genie-50 text-genie-700 flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">
              Saved to your account
            </div>
            <div className="text-sm font-bold text-navy-900 leading-tight">
              {assessments.length} assessment{assessments.length === 1 ? '' : 's'}
              <span className="text-xs font-normal text-slate-400"> • </span>
              {goals.length} goal{goals.length === 1 ? '' : 's'}
            </div>
            {lastAssessmentDate && (
              <div className="text-[11px] text-slate-400">
                Last assessment: {lastAssessmentDate}
              </div>
            )}
          </div>
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

      {/* Financial Summary Cards */}
      <section aria-labelledby="financial-summary-heading">
        <h2 id="financial-summary-heading" className="sr-only">Financial Summary</h2>
        {loading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
            <span>Loading your saved financial data...</span>
          </Card>
        ) : (
          <FinancialSummary
            summary={summary}
            isEmpty={!summary}
            onNavigate={onNavigate}
          />
        )}
      </section>

      {/* Prominent AI Learning Assistant Entry Point */}
      <section aria-labelledby="ai-assistant-heading">
        <h2 id="ai-assistant-heading" className="sr-only">Ask WealthGenie AI Tutor</h2>
        <AskGenieBanner onNavigateWithPrompt={onNavigateWithPrompt} />
      </section>

      {/* Two Column Grid: Goals & Recommended Lessons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-labelledby="goals-heading">
          <h2 id="goals-heading" className="sr-only">Savings Goals</h2>
          <GoalProgressCard
            goals={goals}
            onNavigate={onNavigate}
            onOpenNewGoalModal={onOpenNewGoalModal}
          />
        </section>

        <section aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="sr-only">Recommended Lessons</h2>
          <RecommendedLessons
            lessons={MOCK_LESSONS}
            onNavigate={onNavigate}
            onSelectLesson={onSelectLesson}
          />
        </section>
      </div>

      {/* First-run guidance */}
      {!loading && (!summary || goals.length === 0) && (
        <Card className="border-genie-200 bg-genie-50/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-navy-950">
                Get started with your own data
              </h2>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                {!summary && goals.length === 0
                  ? 'Run a financial assessment to build your snapshot, then add your first savings goal.'
                  : !summary
                    ? 'Run a financial assessment to see your cash-flow snapshot on this dashboard.'
                    : 'Add a savings goal to start tracking your milestones.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!summary && (
                <button
                  type="button"
                  onClick={() => onNavigate('assessment')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-navy-900 text-white rounded-lg text-xs font-semibold hover:bg-navy-800 transition-colors"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Run assessment</span>
                </button>
              )}
              {goals.length === 0 && (
                <button
                  type="button"
                  onClick={onOpenNewGoalModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-navy-900 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                >
                  <Target className="w-4 h-4" />
                  <span>Create a goal</span>
                </button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Personalized Financial Insight (merged with the old daily tip) */}
      <section aria-labelledby="daily-insight-heading">
        <h2 id="daily-insight-heading" className="sr-only">Your Financial Insight</h2>
        <DailyInsight
          insight={personalizedInsight}
          onExploreMore={() => onNavigate(insightTarget)}
        />
      </section>
    </div>
  );
}
