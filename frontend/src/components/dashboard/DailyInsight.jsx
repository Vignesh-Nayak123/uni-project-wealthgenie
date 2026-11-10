import React from 'react';
import { Lightbulb, ArrowRight, CheckCheck } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';

export default function DailyInsight({ insight, onExploreMore }) {
  return (
    <Card className="bg-gradient-to-r from-sage-50/60 to-genie-50/40 border-genie-200/80">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-white text-genie-700 border border-genie-200 shadow-2xs flex items-center justify-center shrink-0 mt-0.5">
            <Lightbulb className="w-5 h-5 text-genie-600" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="green" size="xs">
                {insight.tag}
              </Badge>
              <span className="text-[11px] font-semibold text-slate-400">
                {insight.date}
              </span>
            </div>
            <h4 className="text-sm font-bold text-navy-950 mb-1">
              {insight.title}
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
              {insight.summary}
            </p>
            <div className="mt-2 text-xs font-medium text-genie-800 flex items-center gap-1.5">
              <CheckCheck className="w-3.5 h-3.5 text-genie-600 shrink-0" />
              <span>Action Step: {insight.actionStep}</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onExploreMore}
          className="text-xs font-semibold px-3.5 py-2 rounded-lg bg-white border border-slate-200/90 text-navy-900 hover:bg-slate-50 hover:border-slate-300 transition-all shrink-0 shadow-2xs flex items-center gap-1.5"
        >
          <span>{insight.actionLabel || 'More Habits'}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
    </Card>
  );
}
