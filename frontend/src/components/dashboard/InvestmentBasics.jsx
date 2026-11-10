import React from 'react';
import { TrendingUp, Shield, FileText, PieChart, ArrowUpRight, HelpCircle } from 'lucide-react';
import Card from '../common/Card';
import Badge from '../common/Badge';

const iconMap = {
  Shield: Shield,
  FileText: FileText,
  PieChart: PieChart,
  TrendingUp: TrendingUp,
};

export default function InvestmentBasics({ items = [], onNavigate }) {
  const getRiskBadge = (level) => {
    switch (level.toLowerCase()) {
      case 'very low':
        return <Badge variant="green" size="xs">Low Volatility</Badge>;
      case 'low to moderate':
        return <Badge variant="blue" size="xs">Moderate</Badge>;
      case 'moderate to high':
        return <Badge variant="indigo" size="xs">Growth Focus</Badge>;
      default:
        return <Badge variant="amber" size="xs">Sovereign / Lock-in</Badge>;
    }
  };

  return (
    <Card className="flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <PieChart className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-navy-950">Indian Investment Building Blocks</h3>
            <p className="text-xs text-slate-500">Core regulated asset classes and their purpose in a portfolio</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('investments')}
          className="text-xs font-semibold text-genie-700 hover:text-genie-900 inline-flex items-center gap-1 group self-start sm:self-auto"
        >
          <span>Asset Allocation & SIP Guide</span>
          <ArrowUpRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {items.map((item, idx) => {
          const Icon = iconMap[item.iconName] || TrendingUp;
          return (
            <div
              key={idx}
              className="p-4 rounded-xl border border-slate-100 bg-slate-50/40 hover:bg-white hover:border-slate-300 transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-navy-800">
                    <Icon className="w-4 h-4" />
                  </div>
                  {getRiskBadge(item.riskLevel)}
                </div>

                <h4 className="text-sm font-semibold text-navy-900">{item.title}</h4>
                <div className="text-[11px] font-medium text-slate-500 mb-2">{item.subtitle}</div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  {item.purpose}
                </p>
              </div>

              <div className="pt-2.5 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                <span>Horizon: {item.horizon}</span>
                <span className="font-semibold text-navy-800">{item.regulatoryNote}</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
