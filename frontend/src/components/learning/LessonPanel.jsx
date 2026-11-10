import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  IndianRupee,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';
import { evaluateQuizAnswer } from '../../utils/learningQuiz';
import { normalizeCuratedLessonResponse } from '../../utils/curatedLesson';
import CuratedLessonView from './CuratedLessonView';

const LOAD_TIMEOUT_MS = 15000;

function LessonSkeleton() {
  return (
    <div className="space-y-4" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-genie-600" />
        Loading this lesson...
      </div>
      <div className="animate-pulse space-y-3">
        <div className="h-3 w-1/3 rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
        <div className="h-3 w-11/12 rounded bg-slate-100" />
        <div className="h-20 rounded-xl bg-slate-100" />
        <div className="h-3 w-1/4 rounded bg-slate-100" />
        <div className="h-3 w-full rounded bg-slate-100" />
      </div>
      <p className="text-[11px] text-slate-400">
        Source-checked lessons are read from the curriculum content files. Other concepts use the
        optional AI tutor.
      </p>
    </div>
  );
}

function SetupState({ message, onRetry }) {
  return (
    <div className="space-y-4" aria-live="assertive">
      <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <div>
            <h4 className="text-sm font-bold text-amber-950">AI lesson generation is not configured</h4>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">{message}</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold text-navy-900">Backend setup</p>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-600">
          Add a genuine Gemini API key to the root or backend <code className="rounded bg-white px-1 py-0.5">.env</code> file, then restart the backend:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-navy-950 p-3 text-[11px] text-genie-200">
{`GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash`}
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
          The key stays on the server. This lesson will not fall back to hardcoded content.
        </p>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Retry after setup
      </button>
    </div>
  );
}

function ErrorState({ error, onRetry }) {
  return (
    <div className="space-y-4" aria-live="assertive">
      <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
          <div>
            <h4 className="text-sm font-bold text-rose-950">{error.title}</h4>
            <p className="mt-1 text-xs leading-relaxed text-rose-900">{error.message}</p>
            <p className="mt-2 text-[11px] leading-relaxed text-rose-800/80">
              WealthGenie only displays lesson content that passes its validation, so nothing
              partial is shown here.
            </p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Try again
      </button>
    </div>
  );
}

export default function LessonPanel({
  concept,
  isCompleted,
  onComplete,
  onQuizProgress,
  onAskGenie,
  onClose,
}) {
  const [lesson, setLesson] = useState(null);
  const [lessonMeta, setLessonMeta] = useState(null);
  const [curatedEntry, setCuratedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [checked, setChecked] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState(null);
  const [completionError, setCompletionError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, LOAD_TIMEOUT_MS);

    async function readJson(response) {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }

    async function loadAiLesson() {
      const response = await fetch('/api/learn/lesson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conceptId: concept.id }),
        signal: controller.signal,
      });

      const body = await readJson(response);

      if (!response.ok) {
        if (body?.status === 'unconfigured') {
          setError({
            kind: 'unconfigured',
            title: 'AI lesson generation is not configured',
            message:
              body.message ||
              'Set GEMINI_API_KEY in the backend environment to generate live lessons.',
          });
          return;
        }

        setError({
          kind: 'provider',
          title:
            body?.code === 'provider_quota'
              ? 'The AI tutor is temporarily over its quota'
              : 'The AI tutor could not generate this lesson',
          message:
            body?.message ||
            `The backend returned HTTP ${response.status}. Please try again.`,
        });
        return;
      }

      if (
        body?.status !== 'success' ||
        !body.lesson ||
        !Array.isArray(body.lesson.quiz?.options) ||
        body.lesson.quiz.options.length !== 3
      ) {
        setError({
          kind: 'invalid',
          title: 'The AI tutor returned an invalid lesson',
          message: 'The response failed WealthGenie validation, so it was not displayed.',
        });
        return;
      }

      setLesson(body.lesson);
      setLessonMeta({
        provider: body.provider,
        model: body.model,
        generatedAt: body.generatedAt,
        disclaimer: body.disclaimer,
      });
    }

    async function loadLesson() {
      setLoading(true);
      setError(null);
      setLesson(null);
      setLessonMeta(null);
      setCuratedEntry(null);
      setSelectedIndex(null);
      setChecked(false);
      setEvaluation(null);
      setCompletionResult(null);
      setCompletionError('');

      try {
        // Curated lessons are served from the versioned content files and never
        // touch the AI provider. A 404 means this concept has no curated lesson
        // yet, so the optional AI tutor path is used exactly as before.
        const response = await fetch(`/api/learn/lessons/${concept.id}`, {
          signal: controller.signal,
        });
        const body = await readJson(response);

        if (response.ok) {
          const normalized = normalizeCuratedLessonResponse(body);

          if (normalized.ok) {
            setCuratedEntry(normalized.entry);
            return;
          }

          setError({
            kind: 'invalid',
            title: 'The curated lesson could not be displayed',
            message: normalized.reason,
          });
          return;
        }

        if (response.status === 404 && body?.code === 'lesson_not_available') {
          await loadAiLesson();
          return;
        }

        setError({
          kind: 'curated',
          title: 'Could not load this lesson',
          message:
            body?.message ||
            `The lesson service returned HTTP ${response.status}. Please try again.`,
        });
      } catch (fetchError) {
        if (fetchError.name === 'AbortError') {
          if (timedOut) {
            setError({
              kind: 'timeout',
              title: 'This lesson is taking too long to load',
              message:
                'The lesson service did not respond in time. Check the backend and try again.',
            });
          }
          return;
        }
        setError({
          kind: 'network',
          title: 'Could not reach the lesson service',
          message: 'Check that the WealthGenie backend is running and try again.',
        });
      } finally {
        clearTimeout(timeoutId);
        if (!controller.signal.aborted || timedOut) {
          setLoading(false);
        }
      }
    }

    loadLesson();
    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [concept.id, reloadKey]);

  const handleCheckAnswer = () => {
    if (!lesson) return;
    const result = evaluateQuizAnswer(lesson.quiz, selectedIndex);
    if (!result) return;
    setEvaluation(result);
    setChecked(true);
  };

  const handleRetryQuiz = () => {
    setChecked(false);
    setEvaluation(null);
    setSelectedIndex(null);
  };

  const handleComplete = () => {
    if (!lesson || !evaluation?.isCorrect) return;
    setCompleting(true);
    setCompletionError('');
    const result = onComplete(concept);
    setCompleting(false);

    if (!result?.ok) {
      setCompletionError(
        result?.reason === 'prerequisites-incomplete'
          ? 'A prerequisite is still incomplete. Refresh the roadmap and try again.'
          : 'This concept could not be marked complete.'
      );
      return;
    }

    setCompletionResult(result);
  };

  if (loading) return <LessonSkeleton />;

  if (error?.kind === 'unconfigured') {
    return <SetupState message={error.message} onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  if (error) {
    return <ErrorState error={error} onRetry={() => setReloadKey((key) => key + 1)} />;
  }

  if (curatedEntry) {
    return (
      <CuratedLessonView
        entry={curatedEntry}
        isCompleted={isCompleted}
        onComplete={(score) => onComplete(concept, score)}
        onQuizProgress={
          onQuizProgress ? (score) => onQuizProgress(concept, score) : null
        }
        onAskGenie={onAskGenie}
        onClose={onClose}
      />
    );
  }

  if (!lesson) {
    return (
      <ErrorState
        error={{
          title: 'No lesson was returned',
          message: 'The AI tutor returned an empty lesson. Please try again.',
        }}
        onRetry={() => setReloadKey((key) => key + 1)}
      />
    );
  }

  const optionIsCorrect = (index) => checked && index === lesson.quiz.correctIndex;
  const optionIsWrong = (index) =>
    checked && index === selectedIndex && !evaluation?.isCorrect;
  const quizLocked = checked && evaluation?.isCorrect;

  return (
    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1 text-navy-900">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-genie-200 bg-genie-50/70 px-3.5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-genie-800">
          <Sparkles className="h-3.5 w-3.5" />
          {lessonMeta?.provider === 'gemini' ? 'Generated by Gemini' : 'AI-generated lesson'}
        </span>
        <span className="text-[10px] font-medium text-genie-700">{lesson.category}</span>
      </div>

      <section>
        <h4 className="flex items-center gap-2 text-sm font-bold text-navy-950">
          <BookOpen className="h-4 w-4 text-genie-600" />
          Simple explanation
        </h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {lesson.explanation}
        </p>
      </section>

      <div className="rounded-xl border border-genie-200 bg-genie-50/60 p-4">
        <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-genie-800">
          <IndianRupee className="h-4 w-4" />
          Indian example
        </h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-genie-950">
          {lesson.example}
        </p>
      </div>

      <section>
        <h4 className="text-sm font-bold text-navy-950">Why this matters</h4>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {lesson.whyItMatters}
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <h4 className="text-sm font-bold text-navy-950">Quick check</h4>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{lesson.quiz.question}</p>

        <div className="mt-3 space-y-2" role="radiogroup" aria-label="Quiz options">
          {lesson.quiz.options.map((option, index) => {
            const isSelected = selectedIndex === index;
            const isCorrect = optionIsCorrect(index);
            const isWrong = optionIsWrong(index);

            return (
              <label
                key={`${option}-${index}`}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-xs leading-relaxed transition-colors ${
                  isCorrect
                    ? 'border-genie-400 bg-genie-50 text-genie-950'
                    : isWrong
                      ? 'border-rose-300 bg-rose-50 text-rose-950'
                      : isSelected
                        ? 'border-navy-300 bg-white text-navy-950'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                } ${quizLocked && !isCorrect ? 'cursor-default opacity-70' : ''}`}
              >
                <input
                  type="radio"
                  name={`quiz-${concept.id}`}
                  value={index}
                  checked={isSelected}
                  onChange={() => setSelectedIndex(index)}
                  disabled={quizLocked}
                  className="sr-only"
                />
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${
                    isCorrect
                      ? 'border-genie-500 bg-genie-600 text-white'
                      : isWrong
                        ? 'border-rose-400 bg-rose-500 text-white'
                        : 'border-slate-300 bg-white text-slate-500'
                  }`}
                >
                  {isCorrect ? <Check className="h-3 w-3" /> : isWrong ? <X className="h-3 w-3" /> : String.fromCharCode(65 + index)}
                </span>
                <span>{option}</span>
              </label>
            );
          })}
        </div>

        {!checked && (
          <button
            type="button"
            onClick={handleCheckAnswer}
            disabled={selectedIndex === null}
            className="mt-3 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Check answer
          </button>
        )}

        {checked && evaluation && (
          <div
            className={`mt-3 rounded-lg border p-3 text-xs leading-relaxed ${
              evaluation.isCorrect
                ? 'border-genie-200 bg-genie-50 text-genie-950'
                : 'border-amber-200 bg-amber-50 text-amber-950'
            }`}
            aria-live="polite"
          >
            <p className="font-bold">
              {evaluation.isCorrect ? 'Correct.' : 'Not quite yet.'}
            </p>
            <p className="mt-1">{evaluation.feedback}</p>
            <p className="mt-1.5 text-[11px] font-medium opacity-80">
              Correct answer: {evaluation.correctOption}
            </p>
            {!evaluation.isCorrect && (
              <button
                type="button"
                onClick={handleRetryQuiz}
                className="mt-2 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
              >
                Try again
              </button>
            )}
          </div>
        )}
      </section>

      {completionResult && (
        <div className="rounded-xl border border-genie-300 bg-genie-50 p-4 text-xs text-genie-950" aria-live="polite">
          <p className="flex items-center gap-1.5 font-bold">
            <CheckCircle2 className="h-4 w-4 text-genie-700" />
            Concept completed.
          </p>
          <p className="mt-1 leading-relaxed">
            {completionResult.newlyUnlocked?.length
              ? `Unlocked: ${completionResult.newlyUnlocked.map((item) => item.title).join(', ')}.`
              : 'No new roadmap nodes unlocked from this step.'}
          </p>
          {completionResult.storageSaved === false && (
            <p className="mt-1 font-medium text-amber-800">
              Progress could not be saved in this browser, so it may reset on refresh.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="mt-2 rounded-md bg-genie-700 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-genie-800"
          >
            Back to roadmap
          </button>
        </div>
      )}

      {completionError && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          {completionError}
        </p>
      )}

      <div className="flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        {isCompleted ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-genie-200 bg-genie-50 px-3 py-2 text-xs font-semibold text-genie-800">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Already completed
          </span>
        ) : (
          <button
            type="button"
            onClick={handleComplete}
            disabled={!evaluation?.isCorrect || completing || Boolean(completionResult)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-genie-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-genie-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete concept & unlock next
          </button>
        )}

        {onAskGenie && (
          <button
            type="button"
            onClick={() => onAskGenie(concept.title)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-genie-200 bg-genie-50 px-3 py-2 text-xs font-semibold text-genie-800 hover:bg-genie-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Ask AI Tutor more
          </button>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-400">
        {lessonMeta?.disclaimer ||
          'AI-generated educational content for financial literacy. Not personalized investment advice.'}
      </p>
    </div>
  );
}
