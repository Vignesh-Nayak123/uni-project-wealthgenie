import React from 'react';
import {
  Target,
  ArrowUpRight,
  ShieldCheck,
  Home,
  TrendingUp,
  Compass,
  Plus,
} from 'lucide-react';
import Card from '../common/Card';
import ProgressBar from '../common/ProgressBar';
import { formatINR } from '../../utils/formatters';
import {
  formatGoalDate,
  goalCategoryStyle,
  goalProgressPercent,
} from '../../utils/goalDisplay';

const iconMap = {
  ShieldCheck,
  Home,
  TrendingUp,
  Compass,
  Target,
};

export default function GoalProgressCard({ goals = [], onNavigate, onOpenNewGoalModal }) {
  return (
    <Card className="flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-genie-50 text-genie-700 flex items-center justify-center">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-navy-950">Savings & Milestones</h3>
            <p className="text-xs text-slate-500">Your saved goals from this account</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('goals')}
          className="text-xs font-semibold text-genie-700 hover:text-genie-900 inline-flex items-center gap-1 group"
        >
          <span>View All</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-slate-500">No goals saved yet.</p>
          <button
            type="button"
            onClick={onOpenNewGoalModal}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-genie-700 hover:text-genie-800"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Set your first financial goal</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4 flex-1">
          {goals.slice(0, 3).map((goal) => {
            const style = goalCategoryStyle(goal.category);
            const Icon = iconMap[style.iconName] || Target;
            const percentage = goalProgressPercent(goal);
            const remaining = Math.max(
              0,
              (Number(goal.targetAmount) || 0) - (Number(goal.currentAmount) || 0)
            );
            return (
              <div
                key={goal.id}
                className="p-3.5 rounded-lg border border-slate-100 hover:border-slate-200 transition-colors bg-slate-50/40"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-white border border-slate-200 flex items-center justify-center text-navy-700 shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="truncate">
                      <div className="text-sm font-semibold text-navy-900 truncate">
                        {goal.title}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span>{goal.category}</span>
                        <span>•</span>
                        <span>Target: {formatGoalDate(goal.targetDate)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-navy-900">
                      {formatINR(goal.currentAmount)}
                    </span>
                    <span className="text-[11px] text-slate-400 block">
                      of {formatINR(goal.targetAmount)}
                    </span>
                  </div>
                </div>

                <ProgressBar
                  value={goal.currentAmount}
                  max={goal.targetAmount || 1}
                  color={style.color}
                  size="sm"
                  showPercentage={false}
                />
                <div className="flex justify-between items-center text-[11px] text-slate-500 mt-1.5">
                  <span className="font-medium text-genie-700">{percentage}% funded</span>
                  <span>{formatINR(remaining)} remaining</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">Need inspiration for your next goal?</span>
        <button
          type="button"
          onClick={onOpenNewGoalModal}
          className="text-xs font-semibold text-navy-800 hover:text-navy-950 inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Goal</span>
        </button>
      </div>
    </Card>
  );
}
