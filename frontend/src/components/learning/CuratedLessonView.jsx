import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  ExternalLink,
  Info,
  ListChecks,
  ShieldCheck,
  Target,
  X,
} from 'lucide-react';
import Badge from '../common/Badge';
import { evaluateQuizAnswer, isQuizSetComplete } from '../../utils/learningQuiz';
import { formatContentDate, getReviewStatusView } from '../../utils/lessonReview';

function CitationChips({ sourceIds, sourcesById }) {
  if (!Array.isArray(sourceIds)) return null;

  const resolved = sourceIds
    .map((sourceId) => sourcesById.get(sourceId))
    .filter(Boolean);

  if (resolved.length === 0) return null;

  return (
    <span className="mt-1.5 flex flex-wrap gap-1.5">
      {resolved.map((source) => (
        <a
          key={source.id}
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:border-slate-300 hover:text-navy-900"
        >
          {source.id}
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      ))}
    </span>
  );
}

function QuizQuestion({ quiz, index, selectedIndex, checked, onSelect, onCheck, onRetry }) {
  const options = Array.isArray(quiz.options) ? quiz.options : [];
  const evaluation = checked ? evaluateQuizAnswer(quiz, selectedIndex) : null;
  const optionIsCorrect = (optionIndex) => checked && optionIndex === quiz.correctIndex;
  const optionIsWrong = (optionIndex) =>
    checked && optionIndex === selectedIndex && !evaluation?.isCorrect;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        Question {index + 1}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-navy-900">{quiz.question}</p>

      <div className="mt-2.5 space-y-2" role="radiogroup" aria-label={`Question ${index + 1} options`}>
        {options.map((option, optionIndex) => {
          const isSelected = selectedIndex === optionIndex;
          const isCorrect = optionIsCorrect(optionIndex);
          const isWrong = optionIsWrong(optionIndex);

          return (
            <label
              key={`${quiz.id}-${optionIndex}`}
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 text-xs leading-relaxed transition-colors ${
                isCorrect
                  ? 'border-genie-400 bg-genie-50 text-genie-950'
                  : isWrong
                    ? 'border-rose-300 bg-rose-50 text-rose-950'
                    : isSelected
                      ? 'border-navy-300 bg-slate-50 text-navy-950'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name={`curated-quiz-${quiz.id}`}
                value={optionIndex}
                checked={isSelected}
                onChange={() => onSelect(optionIndex)}
                disabled={checked && Boolean(evaluation?.isCorrect)}
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
                {isCorrect ? (
                  <Check className="h-3 w-3" />
                ) : isWrong ? (
                  <X className="h-3 w-3" />
                ) : (
                  String.fromCharCode(65 + optionIndex)
                )}
              </span>
              <span>{option}</span>
            </label>
          );
        })}
      </div>

      {!checked && (
        <button
          type="button"
          onClick={onCheck}
          disabled={selectedIndex === null}
          className="mt-2.5 rounded-lg bg-navy-900 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Check answer
        </button>
      )}

      {checked && evaluation && (
        <div
          className={`mt-2.5 rounded-lg border p-2.5 text-[11px] leading-relaxed ${
            evaluation.isCorrect
              ? 'border-genie-200 bg-genie-50 text-genie-950'
              : 'border-amber-200 bg-amber-50 text-amber-950'
          }`}
          aria-live="polite"
        >
          <p className="font-bold">{evaluation.isCorrect ? 'Correct.' : 'Not quite yet.'}</p>
          <p className="mt-1">{evaluation.feedback}</p>
          {!evaluation.isCorrect && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-1.5 rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
            >
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CuratedLessonView({
  entry,
  isCompleted,
  onComplete,
  onQuizProgress,
  onAskGenie,
  onClose,
}) {
  const { lesson, sources, review, contentVersion } = entry || {};
  const reviewView = getReviewStatusView(review);

  // The modal must never go blank because one section of a lesson is missing.
  const safeLesson = lesson || {};
  const objectives = Array.isArray(safeLesson.objectives) ? safeLesson.objectives : [];
  const explanation = Array.isArray(safeLesson.explanation) ? safeLesson.explanation : [];
  const examples = Array.isArray(safeLesson.examples) ? safeLesson.examples : [];
  const keyTakeaways = Array.isArray(safeLesson.keyTakeaways) ? safeLesson.keyTakeaways : [];
  const quiz = Array.isArray(safeLesson.quiz) ? safeLesson.quiz : [];
  const sourceList = Array.isArray(sources) ? sources : [];
  const category = typeof safeLesson.category === 'string' ? safeLesson.category : '';
  const version = contentVersion || safeLesson.contentVersion || '';

  const sourcesById = useMemo(
    () => new Map(sourceList.map((source) => [source.id, source])),
    [sourceList]
  );

  const [selectedAnswers, setSelectedAnswers] = useState(() =>
    quiz.map(() => null)
  );
  const [checkedAnswers, setCheckedAnswers] = useState(() =>
    quiz.map(() => false)
  );
  const [completing, setCompleting] = useState(false);
  const [completionResult, setCompletionResult] = useState(null);
  const [completionError, setCompletionError] = useState('');

  const allCorrect = isQuizSetComplete(quiz, selectedAnswers);

  const handleSelect = (questionIndex, optionIndex) => {
    setSelectedAnswers((current) =>
      current.map((value, index) => (index === questionIndex ? optionIndex : value))
    );
  };

  const handleCheck = (questionIndex) => {
    const nextChecked = checkedAnswers.map((value, index) =>
      index === questionIndex ? true : value
    );
    setCheckedAnswers(nextChecked);

    if (onQuizProgress) {
      const correct = quiz.reduce((count, question, index) => {
        const isChecked = nextChecked[index];
        const selected = selectedAnswers[index];
        return count + (isChecked && selected === question.correctIndex ? 1 : 0);
      }, 0);
      onQuizProgress({ correct, total: quiz.length });
    }
  };

  const handleRetry = (questionIndex) => {
    setCheckedAnswers((current) =>
      current.map((value, index) => (index === questionIndex ? false : value))
    );
    setSelectedAnswers((current) =>
      current.map((value, index) => (index === questionIndex ? null : value))
    );
  };

  const handleComplete = () => {
    if (!allCorrect) return;
    setCompleting(true);
    setCompletionError('');
    const result = onComplete({
      correct: quiz.length,
      total: quiz.length,
    });
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

  return (
    <div className="max-h-[72vh] space-y-5 overflow-y-auto pr-1 text-navy-900">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3.5 py-2.5">
        <Badge variant={reviewView.tone} size="xs">
          <ShieldCheck className="h-3 w-3" />
          {reviewView.label}
        </Badge>
        <span className="text-[10px] font-medium text-amber-800">
          {category} • v{version}
        </span>
      </div>

      {!reviewView.isApproved && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-white p-3 text-[11px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
          <p>{reviewView.detail}</p>
        </div>
      )}

      <section>
        <h4 className="flex items-center gap-2 text-sm font-bold text-navy-950">
          <BookOpen className="h-4 w-4 text-genie-600" />
          What you will learn
        </h4>
        <ul className="mt-2 space-y-1.5">
          {objectives.map((objective) => (
            <li key={objective.id} className="flex items-start gap-2 text-xs leading-relaxed text-slate-600">
              <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-genie-600" />
              <span>{objective.text}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4 className="text-sm font-bold text-navy-950">Explanation</h4>
        <div className="mt-2 space-y-2.5">
          {explanation.map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-slate-600">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h4 className="text-sm font-bold text-navy-950">Worked examples</h4>
        {examples.map((example) => (
          <div key={example.id} className="rounded-xl border border-genie-200 bg-genie-50/60 p-4">
            <p className="text-xs font-bold text-genie-900">{example.title}</p>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-genie-950">
              {example.text}
            </p>
            {example.calculation && (
              <div className="mt-2 rounded-lg border border-genie-200 bg-white p-2.5 text-[11px] text-slate-700">
                <p className="font-semibold">{example.calculation.formula}</p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4">
                  {example.calculation.steps.map((step, index) => (
                    <li key={index}>{step}</li>
                  ))}
                </ol>
                <p className="mt-1 font-semibold text-genie-800">{example.calculation.result}</p>
              </div>
            )}
            <CitationChips sourceIds={example.sourceIds} sourcesById={sourcesById} />
          </div>
        ))}
      </section>

      <section>
        <h4 className="text-sm font-bold text-navy-950">Key takeaways</h4>
        <ul className="mt-2 space-y-1.5">
          {keyTakeaways.map((takeaway, index) => (
            <li key={index} className="flex items-start gap-2 text-xs leading-relaxed text-slate-700">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-genie-600" />
              <span>{takeaway}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
        <h4 className="flex items-center gap-2 text-sm font-bold text-navy-950">
          <ListChecks className="h-4 w-4 text-genie-600" />
          Quick check
        </h4>
        <p className="text-[11px] text-slate-500">
          Answer all {quiz.length} questions correctly to mark this concept complete.
        </p>

        {quiz.map((question, index) => (
          <QuizQuestion
            key={question.id}
            quiz={question}
            index={index}
            selectedIndex={selectedAnswers[index]}
            checked={checkedAnswers[index]}
            onSelect={(optionIndex) => handleSelect(index, optionIndex)}
            onCheck={() => handleCheck(index)}
            onRetry={() => handleRetry(index)}
          />
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h4 className="text-sm font-bold text-navy-950">Sources</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
          Each claim in this lesson is traced to one of these official publications.
        </p>
        <ul className="mt-2.5 space-y-2">
          {sourceList.map((source) => (
            <li key={source.id} className="text-[11px] leading-relaxed">
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-start gap-1.5 font-semibold text-genie-800 hover:text-genie-900 hover:underline"
              >
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                <span>
                  {source.publisher}: {source.title}
                </span>
              </a>
              <span className="mt-0.5 block pl-4 text-[10px] text-slate-500">
                {source.id} • Accessed {formatContentDate(source.accessedAt) || source.accessedAt}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-600">
        <p className="flex items-center gap-1.5 font-semibold text-navy-900">
          <Info className="h-3.5 w-3.5 text-slate-400" />
          Review record
        </p>
        <p className="mt-1">
          Content version {version} • Source checked{' '}
          {formatContentDate(reviewView.sourceCheckedAt) || 'not recorded'} • Next review{' '}
          {formatContentDate(reviewView.nextReviewAt) || 'not scheduled'}
        </p>
        <p className="mt-1">
          {reviewView.reviewedBy
            ? `Reviewed by ${reviewView.reviewedBy} on ${formatContentDate(reviewView.reviewedAt) || 'an unrecorded date'}.`
            : 'No human reviewer is recorded yet, so this lesson is not presented as approved.'}
        </p>
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
              Progress could not be cached in this browser. If you are signed in, it is still saved to your account; otherwise it may reset on refresh.
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
            disabled={!allCorrect || completing || Boolean(completionResult)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-genie-700 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-genie-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Complete concept & unlock next
          </button>
        )}

        {onAskGenie && (
          <button
            type="button"
            onClick={() => onAskGenie(safeLesson.title)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-genie-200 bg-genie-50 px-3 py-2 text-xs font-semibold text-genie-800 hover:bg-genie-100"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Ask AI Tutor more (optional)
          </button>
        )}
      </div>

      <p className="text-[10px] leading-relaxed text-slate-400">{safeLesson.disclaimer}</p>
    </div>
  );
}
