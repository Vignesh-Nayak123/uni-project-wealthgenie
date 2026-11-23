import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Wallet,
  TrendingUp,
  Target,
  ShieldCheck,
  X,
  ClipboardCheck,
  User,
  SlidersHorizontal,
  CandlestickChart,
} from 'lucide-react';
import { useUserData } from '../../context/UserDataContext';

// Grouped by what a beginner is trying to do, in the order they usually need it.
export const NAV_SECTIONS = [
  {
    title: 'Start here',
    items: [
      { id: 'home', label: 'Home', icon: LayoutDashboard },
      { id: 'learn', label: 'Learn', icon: BookOpen },
    ],
  },
  {
    title: 'Plan my money',
    items: [
      { id: 'assessment', label: 'Money Check-up', icon: ClipboardCheck },
      { id: 'finances', label: 'My Finances', icon: Wallet },
      { id: 'goals', label: 'My Goals', icon: Target },
      { id: 'twin', label: 'What-if Planner', icon: SlidersHorizontal },
    ],
  },
  {
    title: 'Explore & practise',
    items: [
      { id: 'investments', label: 'Explore Investments', icon: TrendingUp },
      { id: 'paper', label: 'Practice Trading', icon: CandlestickChart, hint: 'Virtual ₹' },
    ],
  },
  {
    title: 'Account',
    items: [{ id: 'profile', label: 'Profile', icon: User }],
  },
];

export const NAV_ITEMS = NAV_SECTIONS.flatMap((section) => section.items);

export default function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) {
  const { goals } = useUserData();

  const hintFor = (item) =>
    item.id === 'goals' ? (goals.length > 0 ? `${goals.length}` : null) : item.hint;

  const handleNavClick = (tabId) => {
    onSelectTab(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  const NavContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-5 py-5 border-b border-slate-100">
        <button
          type="button"
          onClick={() => handleNavClick('home')}
          className="flex items-center gap-3 rounded-lg text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-500"
          aria-label="WealthGenie home"
        >
          <div className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center shadow-subtle group-hover:bg-navy-800 transition-colors">
            <Sparkles className="w-5 h-5 text-genie-400" aria-hidden="true" />
          </div>
          <div>
            <span className="block font-bold text-lg leading-tight text-navy-950 tracking-tight">
              WealthGenie
            </span>
            <span className="block text-[11px] font-medium text-slate-500">
              Money made simple
            </span>
          </div>
        </button>

        {/* Mobile close button */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="md:hidden text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              {section.title}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const hint = hintFor(item);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors group focus:outline-none focus-visible:ring-2 focus-visible:ring-genie-500 ${
                      isActive
                        ? 'bg-genie-50 text-genie-900 font-semibold'
                        : 'font-medium text-slate-600 hover:text-navy-900 hover:bg-slate-50'
                    }`}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-genie-600"
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex items-center gap-3">
                      <Icon
                        className={`w-4 h-4 transition-colors ${
                          isActive ? 'text-genie-700' : 'text-slate-400 group-hover:text-navy-800'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                    </span>
                    {hint && (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {hint}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Trust note */}
      <div className="p-4 border-t border-slate-100">
        <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3">
          <ShieldCheck className="mt-0.5 w-4 h-4 shrink-0 text-genie-600" aria-hidden="true" />
          <p className="text-[11px] leading-relaxed text-slate-600">
            Your numbers are private to your account. WealthGenie never moves real money.
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-30">
        {NavContent}
      </aside>

      {/* Mobile Drawer (Slide-over) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-navy-950/40 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          {/* Sidebar Drawer */}
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white h-full shadow-elevated">
            {NavContent}
          </div>
        </div>
      )}
    </>
  );
}
