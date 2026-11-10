import React from 'react';
import { BookOpen, Clock, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import ProgressBar from '../common/ProgressBar';

export default function RecommendedLessons({ lessons = [], onNavigate, onSelectLesson }) {
  const getDifficultyVariant = (diff) => {
    switch (diff.toLowerCase()) {
      case 'beginner':
        return 'emerald';
      case 'intermediate':
        return 'blue';
      case 'advanced':
        return 'indigo';
      default:
        return 'default';
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
            <BookOpen className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-navy-950">Recommended Learning</h3>
            <p className="text-xs text-slate-500">Bite-sized financial literacy modules</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('learn')}
          className="text-xs font-semibold text-genie-700 hover:text-genie-900 inline-flex items-center gap-1 group"
        >
          <span>All Courses</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      <div className="space-y-3.5 flex-1">
        {lessons.slice(0, 3).map((lesson) => (
          <div
            key={lesson.id}
            onClick={() => onSelectLesson ? onSelectLesson(lesson) : onNavigate('learn')}
            className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-300 bg-white hover:bg-slate-50/60 transition-all cursor-pointer group"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <Badge variant={getDifficultyVariant(lesson.difficulty)} size="xs">
                    {lesson.difficulty}
                  </Badge>
                  <span className="text-[11px] font-medium text-slate-400">
                    {lesson.category}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-navy-900 group-hover:text-genie-700 transition-colors line-clamp-1">
                  {lesson.title}
                </h4>
              </div>
              {lesson.isCompleted ? (
                <div className="text-genie-600 shrink-0" title="Completed">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              ) : (
                <span className="text-xs font-semibold text-slate-400 group-hover:text-navy-900 shrink-0">
                  {lesson.progress > 0 ? `${lesson.progress}%` : 'New'}
                </span>
              )}
            </div>

            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-3">
              {lesson.summary}
            </p>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>{lesson.readTime}</span>
              </div>
              <span className="text-xs font-semibold text-genie-700 group-hover:underline">
                {lesson.isCompleted ? 'Review Lesson' : lesson.progress > 0 ? 'Continue' : 'Start Reading'} →
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
