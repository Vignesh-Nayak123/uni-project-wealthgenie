import React, { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import TopNav from './components/layout/TopNav';
import HomePage from './pages/HomePage';
import LearnPage from './pages/LearnPage';
import AskGeniePage from './pages/AskGeniePage';
import MyFinancesPage from './pages/MyFinancesPage';
import ExploreInvestmentsPage from './pages/ExploreInvestmentsPage';
import GoalsPage from './pages/GoalsPage';
import PaperTradingPage from './pages/PaperTradingPage';
import AssessmentPage from './pages/AssessmentPage';
import DigitalTwinPage from './pages/DigitalTwinPage';
import ProfilePage from './pages/ProfilePage';
import AuthPage from './pages/AuthPage';
import { useAuth } from './context/AuthContext';

const VALID_TABS = [
  'home',
  'learn',
  'ask',
  'finances',
  'investments',
  'goals',
  'paper',
  'assessment',
  'twin',
  'profile',
];

function getInitialTab() {
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.includes(hash) ? hash : 'home';
}

function FullScreenLoader({ label }) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin text-genie-600" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

export default function App() {
  const { user, loading, isConfigured } = useAuth();

  // Sync tab with URL hash for bookmarking & browser back/forward
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [initialAiPrompt, setInitialAiPrompt] = useState('');

  // Handle URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) {
        setActiveTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleSelectTab = (tabId) => {
    if (!VALID_TABS.includes(tabId)) return;
    setActiveTab(tabId);
    window.location.hash = tabId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNavigateWithPrompt = (promptText) => {
    setInitialAiPrompt(promptText);
    handleSelectTab('ask');
  };

  if (loading) {
    return <FullScreenLoader label="Restoring your session..." />;
  }

  // Protected application: unauthenticated visitors only see the auth screen.
  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-canvas text-navy-900 flex flex-col md:flex-row">
      {/* Persistent Sidebar (desktop) & Slide-over drawer (mobile) */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:pl-64 min-w-0">
        <TopNav
          onToggleMobileSidebar={() => setMobileMenuOpen((prev) => !prev)}
          onNavigate={handleSelectTab}
        />

        <main className="flex-1 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
          {!isConfigured && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
              Supabase is not configured in this frontend build. Account and
              persistence features will not work until the Vite environment
              variables are set.
            </div>
          )}

          {activeTab === 'home' && (
            <HomePage
              onNavigate={handleSelectTab}
              onNavigateWithPrompt={handleNavigateWithPrompt}
              onOpenNewGoalModal={() => handleSelectTab('goals')}
              onSelectLesson={() => handleSelectTab('learn')}
            />
          )}

          {activeTab === 'learn' && (
            <LearnPage onAskGenieAboutLesson={handleNavigateWithPrompt} />
          )}

          {activeTab === 'ask' && (
            <AskGeniePage
              initialPrompt={initialAiPrompt}
              onClearInitialPrompt={() => setInitialAiPrompt('')}
            />
          )}

          {activeTab === 'finances' && (
            <MyFinancesPage onNavigate={handleSelectTab} />
          )}

          {activeTab === 'investments' && (
            <ExploreInvestmentsPage onNavigate={handleSelectTab} />
          )}

          {activeTab === 'goals' && <GoalsPage />}

          {activeTab === 'paper' && <PaperTradingPage />}

          {activeTab === 'assessment' && (
            <AssessmentPage onNavigate={handleSelectTab} />
          )}

          {activeTab === 'twin' && <DigitalTwinPage />}

          {activeTab === 'profile' && <ProfilePage />}
        </main>

        {/* Global Footer */}
        <footer className="mt-auto border-t border-slate-200 bg-white py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-navy-900">WealthGenie</span>
              <span>•</span>
              <span>Phase 0 • Clean Architecture & Indian Context</span>
            </div>
            <div className="text-center sm:text-right">
              Educational financial literacy platform for Indian beginners. Not a SEBI-registered advisory service.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
