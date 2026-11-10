import React from 'react';
import {
  ArrowUpRight,
  ShieldCheck,
  PiggyBank,
  Wallet,
  Calculator,
} from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';
import { formatINR } from '../../utils/formatters';

function percentOf(value, total) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((value / total) * 100)));
}

export default function FinancialSummary({ summary, isEmpty = false, onNavigate }) {
  if (isEmpty || !summary) {
    return (
      <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400 mb-3">
          <Wallet className="w-6 h-6" />
        </div>
        <h4 className="text-base font-semibold text-navy-900">No Financial Snapshot Yet</h4>
        <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
          Run your first financial assessment to see your cash-flow snapshot
          here. This dashboard only shows data saved to your account — demo
          values are never substituted.
        </p>
        <button
          type="button"
          onClick={() => onNavigate('assessment')}
          className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 transition-colors"
        >
          <Calculator className="w-4 h-4" />
          <span>Run your first assessment</span>
          <ArrowUpRight className="w-4 h-4" />
        </button>
      </Card>
    );
  }

  const savingsRate =
    summary.savingsRate === null || summary.savingsRate === undefined
      ? null
      : Number(summary.savingsRate);

  const emergencyPercent = percentOf(
    summary.emergencyFundCurrent,
    summary.emergencyFundTarget
  );

  const coverageMonths =
    summary.emergencyFundMonths === null ||
    summary.emergencyFundMonths === undefined
      ? null
      : Number(summary.emergencyFundMonths);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Accessible Savings */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Accessible Savings</span>
            {coverageMonths !== null && (
              <Badge variant="green" size="xs">
                <ShieldCheck className="w-3 h-3" />
                <span>{coverageMonths.toFixed(1)} mo</span>
              </Badge>
            )}
          </div>
          <div className="text-2xl font-bold text-navy-950 tracking-tight">
            {formatINR(summary.accessibleSavings)}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Liquid savings</span>
          <span className="font-medium text-navy-800">From your assessment</span>
        </div>
      </Card>

      {/* 2. Monthly Cash Flow */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Monthly Cash Flow</span>
            <Badge
              variant={summary.monthlySavings >= 0 ? 'blue' : 'rose'}
              size="xs"
            >
              <span>
                {summary.monthlySavings >= 0 ? '+' : '-'}
                {formatINR(Math.abs(summary.monthlySavings))} Net
              </span>
            </Badge>
          </div>
          <div
            className={`text-2xl font-bold tracking-tight ${
              summary.monthlySavings >= 0 ? 'text-navy-950' : 'text-rose-700'
            }`}
          >
            {summary.monthlySavings >= 0 ? '+' : '-'}
            {formatINR(Math.abs(summary.monthlySavings))}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="text-emerald-700 font-medium">In: {formatINR(summary.monthlyInflow)}</span>
          <span className="text-slate-400">•</span>
          <span className="text-slate-600 font-medium">Out: {formatINR(summary.monthlyOutflow)}</span>
        </div>
      </Card>

      {/* 3. Savings Rate */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Savings Rate</span>
            {savingsRate !== null && (
              <Badge variant={savingsRate >= 20 ? 'green' : 'amber'} size="xs">
                <span>{savingsRate >= 20 ? 'On track' : 'Below 20%'}</span>
              </Badge>
            )}
          </div>
          <div className="text-2xl font-bold text-navy-950 tracking-tight flex items-baseline gap-2">
            <span>
              {savingsRate === null ? 'Not available' : `${savingsRate.toFixed(1)}%`}
            </span>
            {savingsRate !== null && (
              <span className="text-xs font-normal text-slate-400">of monthly income</span>
            )}
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Benchmark</span>
          <span className="font-medium text-navy-800">20%–30% Recommended</span>
        </div>
      </Card>

      {/* 4. Emergency Cushion */}
      <Card className="flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 mb-2">
            <span>Emergency Cushion</span>
            <span className="text-xs font-semibold text-genie-700">
              {emergencyPercent}%
            </span>
          </div>
          <div className="text-2xl font-bold text-navy-950 tracking-tight">
            {formatINR(summary.emergencyFundCurrent)}
            <span className="text-sm font-normal text-slate-400">
              {' '}/ {formatINR(summary.emergencyFundTarget)}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <PiggyBank className="w-3.5 h-3.5" />
            <span>6-month target</span>
          </span>
          <span className="font-medium text-navy-800">
            {coverageMonths === null ? 'Not available' : `${coverageMonths.toFixed(1)} Months`}
          </span>
        </div>
      </Card>
    </div>
  );
}
