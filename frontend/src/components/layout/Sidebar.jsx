import React from 'react';
import {
  LayoutDashboard,
  BookOpen,
  Sparkles,
  Wallet,
  TrendingUp,
  Target,
  Shield,
  X,
  Calculator,
  User,
  FlaskConical,
} from 'lucide-react';
import { useUserData } from '../../context/UserDataContext';

export const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, badge: null },
  { id: 'learn', label: 'Learn', icon: BookOpen, badge: '23 Concepts' },
  { id: 'ask', label: 'Ask WealthGenie', icon: Sparkles, badge: 'AI Tutor', badgeColor: 'green' },
  { id: 'finances', label: 'My Finances', icon: Wallet, badge: null },
  { id: 'investments', label: 'Explore Investments', icon: TrendingUp, badge: null },
  { id: 'goals', label: 'Goals', icon: Target, badge: null },
  { id: 'assessment', label: 'Assessment', icon: Calculator, badge: null },
  { id: 'twin', label: 'Digital Twin', icon: FlaskConical, badge: 'What-if' },
  { id: 'paper', label: 'Paper Trading', icon: Wallet, badge: 'Optional' },
  { id: 'profile', label: 'Profile', icon: User, badge: null },
];

export default function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
}) {
  const { goals } = useUserData();

  const navItems = NAV_ITEMS.map((item) =>
    item.id === 'goals'
      ? {
          ...item,
          badge: goals.length > 0 ? `${goals.length} Saved` : null,
        }
      : item
  );

  const handleNavClick = (tabId) => {
    onSelectTab(tabId);
    if (onCloseMobile) onCloseMobile();
  };

  const NavContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleNavClick('home')}
          onKeyDown={(e) => e.key === 'Enter' && handleNavClick('home')}
          className="flex items-center gap-3 cursor-pointer group focus:outline-none"
        >
          <div className="w-10 h-10 rounded-xl bg-navy-900 text-white flex items-center justify-center shadow-subtle group-hover:bg-navy-800 transition-colors">
            <Sparkles className="w-5 h-5 text-genie-400" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-lg text-navy-950 tracking-tight">
                WealthGenie
              </span>
            </div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Financial Literacy
            </p>
          </div>
        </div>

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

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main Navigation">
        <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          Main Menu
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-genie-50/90 text-genie-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-navy-900 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive
                      ? 'text-genie-700'
                      : 'text-slate-400 group-hover:text-navy-800'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    item.badgeColor === 'green'
                      ? 'bg-genie-100 text-genie-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Footer Widget: Account Data Note */}
      <div className="p-4 border-t border-slate-100 space-y-3 bg-canvas-subtle/40">
        <div className="bg-white p-3 rounded-lg border border-slate-200/80 shadow-2xs">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-genie-500"></span>
            <span className="text-xs font-semibold text-navy-900">
              Account Data
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Your assessments and goals are stored against your signed-in
            Supabase account. Only you can read or change them.
          </p>
        </div>

        <div className="text-[11px] text-slate-400 text-center flex items-center justify-center gap-1">
          <Shield className="w-3.5 h-3.5 text-slate-400" />
          <span>Phase 0 • India Context • No real funds</span>
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
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-navy-950/40 backdrop-blur-xs transition-opacity"
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
