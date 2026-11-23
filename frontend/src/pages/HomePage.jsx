import React from 'react';
import {
  Calendar,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Target,
  ClipboardCheck,
  BookOpen,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import FinancialSummary from '../components/dashboard/FinancialSummary';
import GoalProgressCard from '../components/dashboard/GoalProgressCard';
import RecommendedLessons from '../components/dashboard/RecommendedLessons';
import DailyInsight from '../components/dashboard/DailyInsight';
import DisclaimerBanner from '../components/layout/DisclaimerBanner';
import Card from '../components/common/Card';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';
import { useLearningOverview } from '../hooks/useLearningOverview';
import { DEFAULT_DAILY_INSIGHT } from '../data/dailyInsight';

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
 * One personalised, actionable tip derived from the saved assessment.
 * Falls back to a neutral money habit when no assessment exists.
 */
function buildPersonalizedInsight(summary, goals) {
  if (!summary) return DEFAULT_DAILY_INSIGHT;

  const date = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });

  const months = Number(summary.emergencyFundMonths);
  if (Number.isFinite(months) && months < 3) {
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
      title: 'Build a 3-month safety cushion before investing',
      summary: `Your savings would cover about ${months.toFixed(1)} month(s) of expenses if your income stopped. Aim for at least 3 months first. Closing the ${formatINRRough(gap)} gap to a full 6-month cushion protects you from surprise costs like a hospital bill or job loss.`,
      actionLabel: 'Try it in What-if Planner',
      actionStep: `Set aside ${formatINRRough(pace)} of this month's leftover money for emergencies, then see how fast the cushion grows in the What-if Planner.`,
    };
  }

  const savingsRate = Number(summary.savingsRate);
  if (Number.isFinite(savingsRate) && savingsRate < 20) {
    return {
      date,
      tag: 'Priority: Savings',
      title: 'Try to save at least 20% of your income',
      summary: `You save about ${savingsRate.toFixed(1)}% of your income (${formatINRRough(summary.monthlySavings)} a month). Saving one rupee in every five makes goals much easier to reach, so look for one regular expense you can cut.`,
      actionLabel: 'Try it in What-if Planner',
      actionStep: `Pick one habit to trim this month, then try the What-if Planner with lower expenses to see how much sooner you reach a goal.`,
    };
  }

  if (goals.length > 0) {
    return {
      date,
      tag: 'Priority: Goals',
      title: 'Put your leftover money to work on a goal',
      summary: `You keep ${formatINRRough(summary.monthlySavings)} every month, a healthy ${Number(savingsRate).toFixed(1)}% of income. Sending a fixed part of it to a named goal turns spare cash into real progress.`,
      actionLabel: 'Try it in What-if Planner',
      actionStep: `Open the What-if Planner and test a plan that adds ${formatINRRough(Math.ceil(Number(summary.monthlySavings) * 0.3) || 500)} a month toward one of your ${goals.length} goal(s).`,
    };
  }

  return {
    date,
    tag: 'Priority: First goal',
    title: 'Give your savings a purpose',
    summary: `You save ${formatINRRough(summary.monthlySavings)} a month (${Number(savingsRate).toFixed(1)}% of income), but none of it is linked to a goal yet. Naming what the money is for makes it easier to keep saving.`,
    actionLabel: 'Create a goal',
    actionStep: 'Create one savings goal, then check how long it will take in the What-if Planner.',
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

function StepItem({ done, icon: Icon, title, detail, actionLabel, onAction }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3.5 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            done ? 'bg-genie-600 text-white' : 'bg-slate-100 text-slate-500'
          }`}
          aria-hidden="true"
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-semibold ${done ? 'text-slate-500 line-through decoration-slate-300' : 'text-navy-950'}`}>
            {title}
            {done && <span className="sr-only"> (done)</span>}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{detail}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className={`shrink-0 self-start sm:self-center inline-flex items-center gap-1 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
          done
            ? 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            : 'bg-genie-600 text-white hover:bg-genie-700 shadow-subtle'
        }`}
      >
        {actionLabel}
        {!done && <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />}
      </button>
    </li>
  );
}

export default function HomePage({ onNavigate, onOpenLesson }) {
  const { user, profile } = useAuth();
  const { goals, latestAssessment, loading, error, refresh } = useUserData();
  const learning = useLearningOverview();

  const currentDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const displayName =
    profile?.displayName || user?.email?.split('@')[0] || 'there';
  const firstName = displayName.split(' ')[0];
  const summary = buildSummary(latestAssessment?.result);
  const lastAssessmentDate = formatDate(latestAssessment?.createdAt);
  const personalizedInsight = buildPersonalizedInsight(summary, goals);
  const insightTarget = !summary
    ? 'assessment'
    : personalizedInsight.actionLabel === 'Create a goal'
      ? 'goals'
      : 'twin';

  const learnedSome = learning.summary.completedCount > 0;
  const stepsDone = [Boolean(summary), goals.length > 0, learnedSome].filter(Boolean).length;
  const nextLesson = learning.nextConcepts[0];

  return (
    <div className="space-y-6">
      <DisclaimerBanner />

      {/* Welcome */}
      <div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-1">
          <Calendar className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span>{currentDate}</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Namaste, {firstName}
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          {summary
            ? `Here is where your money stands${lastAssessmentDate ? ` (last check-up on ${lastAssessmentDate})` : ''} and what to do next.`
            : 'Learn how money works, one small step at a time. Start with the steps below.'}
        </p>
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

      {/* Getting started: three plain steps, hidden once all are done */}
      {!loading && !learning.loading && stepsDone < 3 && (
        <section aria-labelledby="steps-heading">
          <Card className="bg-gradient-to-br from-genie-50/80 via-white to-white border-genie-200/70">
            <div className="flex flex-wrap items-end justify-between gap-2 mb-4">
              <div>
                <h2 id="steps-heading" className="text-base font-bold text-navy-950">
                  Your first steps
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  Three simple things that make WealthGenie useful for you.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-genie-800 border border-genie-200">
                {stepsDone} of 3 done
              </span>
            </div>
            <ol className="space-y-2.5">
              <StepItem
                done={Boolean(summary)}
                icon={ClipboardCheck}
                title="Do a 2-minute money check-up"
                detail="Enter your monthly income and spending. We show how much you save and how long your savings would last."
                actionLabel={summary ? 'Redo' : 'Start check-up'}
                onAction={() => onNavigate('assessment')}
              />
              <StepItem
                done={goals.length > 0}
                icon={Target}
                title="Set one savings goal"
                detail="A trip, a phone or an emergency fund. Giving your saving a name makes it easier to stick to."
                actionLabel={goals.length > 0 ? 'View goals' : 'Add a goal'}
                onAction={() => onNavigate('goals')}
              />
              <StepItem
                done={learnedSome}
                icon={BookOpen}
                title={
                  nextLesson && !learnedSome
                    ? `Read your first lesson: ${nextLesson.title}`
                    : 'Read your first lesson'
                }
                detail="Each lesson takes about 5 minutes and ends with a short quiz."
                actionLabel={learnedSome ? 'Keep learning' : 'Start lesson'}
                onAction={() => onOpenLesson(learnedSome ? null : nextLesson?.id)}
              />
            </ol>
          </Card>
        </section>
      )}

      {/* Money snapshot (before the first check-up, step 1 above already asks for it) */}
      {(loading || summary) && (
      <section aria-labelledby="financial-summary-heading">
        <h2 id="financial-summary-heading" className="text-sm font-semibold text-navy-900 mb-3">
          Your money at a glance
        </h2>
        {loading ? (
          <Card className="p-8 flex items-center justify-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
            <span>Loading your saved financial data...</span>
          </Card>
        ) : (
          <FinancialSummary summary={summary} isEmpty={!summary} onNavigate={onNavigate} />
        )}
      </section>
      )}

      {/* Personalised tip */}
      <section aria-labelledby="daily-insight-heading">
        <h2 id="daily-insight-heading" className="sr-only">Your money tip</h2>
        <DailyInsight
          insight={personalizedInsight}
          onExploreMore={() => onNavigate(insightTarget)}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-labelledby="lessons-heading">
          <h2 id="lessons-heading" className="sr-only">Continue learning</h2>
          <RecommendedLessons
            nextConcepts={learning.nextConcepts}
            lessons={learning.lessons}
            summary={learning.summary}
            loading={learning.loading}
            onOpenLesson={onOpenLesson}
            onNavigate={onNavigate}
          />
        </section>

        <section aria-labelledby="goals-heading">
          <h2 id="goals-heading" className="sr-only">Savings goals</h2>
          <GoalProgressCard
            goals={goals}
            onNavigate={onNavigate}
            onOpenNewGoalModal={() => onNavigate('goals')}
          />
        </section>
      </div>
    </div>
  );
}
