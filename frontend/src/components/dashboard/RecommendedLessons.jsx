import React from 'react';
import { BookOpen, Clock, ArrowUpRight, ArrowRight, PartyPopper, Loader2 } from 'lucide-react';
import Card from '../common/Card';
import ProgressBar from '../common/ProgressBar';

/**
 * "Continue learning" on Home: the learner's real roadmap progress and the
 * lessons they can open right now (prerequisites already finished).
 */
export default function RecommendedLessons({
  nextConcepts = [],
  lessons = {},
  summary,
  loading = false,
  onOpenLesson,
  onNavigate,
}) {
  const total = summary?.total || 0;
  const done = summary?.completedCount || 0;
  const allDone = total > 0 && done === total;

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-navy-950">Continue learning</h3>
            <p className="text-xs text-slate-500">Short lessons, a few minutes each</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('learn')}
          className="shrink-0 whitespace-nowrap text-xs font-semibold text-genie-700 hover:text-genie-900 inline-flex items-center gap-1 group"
        >
          <span>All lessons</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin text-genie-600" />
          Loading your lessons...
        </div>
      ) : total === 0 ? (
        <div className="flex-1 py-8 text-center text-sm text-slate-500">
          Lessons could not be loaded right now.{' '}
          <button
            type="button"
            onClick={() => onNavigate('learn')}
            className="font-semibold text-genie-700 hover:underline"
          >
            Open the Learn page
          </button>
        </div>
      ) : (
        <>
          <ProgressBar
            value={done}
            max={total}
            size="sm"
            label={`${done} of ${total} lessons finished`}
            showPercentage
            className="mb-4"
          />

          {allDone ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-xl bg-genie-50/60 p-6 text-center">
              <PartyPopper className="h-8 w-8 text-genie-600" />
              <p className="mt-2 text-sm font-semibold text-navy-950">
                You have finished every lesson.
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Revisit any lesson on the Learn page whenever you need a refresher.
              </p>
            </div>
          ) : (
            <ul className="space-y-3 flex-1">
              {nextConcepts.slice(0, 3).map((concept, index) => {
                const meta = lessons[concept.id];
                return (
                  <li key={concept.id}>
                    <button
                      type="button"
                      onClick={() => onOpenLesson(concept.id)}
                      className="w-full text-left p-3.5 rounded-xl border border-slate-200/80 hover:border-genie-300 bg-white hover:bg-genie-50/40 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-500"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1 text-[11px] font-medium text-slate-500">
                            {index === 0 && (
                              <span className="rounded-full bg-genie-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                Up next
                              </span>
                            )}
                            <span>{concept.category}</span>
                            {meta?.estimatedMinutes && (
                              <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {meta.estimatedMinutes} min
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-semibold text-navy-900 group-hover:text-genie-800">
                            {concept.title}
                          </h4>
                          {meta?.summary && (
                            <p className="mt-1 text-xs text-slate-500 leading-relaxed line-clamp-2">
                              {meta.summary}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="mt-1 w-4 h-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-genie-600" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
