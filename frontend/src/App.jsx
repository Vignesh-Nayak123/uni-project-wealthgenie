import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import Sidebar from './components/layout/Sidebar';
import TopNav from './components/layout/TopNav';
import HomePage from './pages/HomePage';
import AuthPage from './pages/AuthPage';
import { useAuth } from './context/AuthContext';

// Non-landing tabs are split into their own chunks so charting libraries
// (recharts, lightweight-charts) are only downloaded when their tab opens.
const LearnPage = lazy(() => import('./pages/LearnPage'));
const MyFinancesPage = lazy(() => import('./pages/MyFinancesPage'));
const ExploreInvestmentsPage = lazy(() => import('./pages/ExploreInvestmentsPage'));
const GoalsPage = lazy(() => import('./pages/GoalsPage'));
const PaperTradingPage = lazy(() => import('./pages/PaperTradingPage'));
const AssessmentPage = lazy(() => import('./pages/AssessmentPage'));
const DigitalTwinPage = lazy(() => import('./pages/DigitalTwinPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));

const VALID_TABS = [
  'home',
  'learn',
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

function PageLoader() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
      <Loader2 className="w-5 h-5 animate-spin text-genie-600" />
      Loading...
    </div>
  );
}

export default function App() {
  const { user, loading } = useAuth();

  // Sync tab with URL hash for bookmarking & browser back/forward
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // A lesson to open as soon as the Learn page has loaded (from Home or search).
  const [pendingConceptId, setPendingConceptId] = useState(null);

  // Handle URL hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (VALID_TABS.includes(hash)) {
        setActiveTab(hash);
      } else if (hash === 'ask') {
        // The AI chat tab was removed; old links land on Home.
        window.location.hash = 'home';
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Old bookmarks to the removed chat tab land on Home instead of a blank page.
  useEffect(() => {
    if (window.location.hash === '#ask') window.location.hash = 'home';
  }, []);

  const handleSelectTab = (tabId) => {
    if (!VALID_TABS.includes(tabId)) return;
    setActiveTab(tabId);
    window.location.hash = tabId;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenLesson = (conceptId) => {
    setPendingConceptId(conceptId || null);
    handleSelectTab('learn');
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
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-elevated"
      >
        Skip to main content
      </a>

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
          onOpenLesson={handleOpenLesson}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full focus:outline-none"
        >
          <Suspense fallback={<PageLoader />}>
            {activeTab === 'home' && (
              <HomePage onNavigate={handleSelectTab} onOpenLesson={handleOpenLesson} />
            )}

            {activeTab === 'learn' && (
              <LearnPage
                initialConceptId={pendingConceptId}
                onInitialConceptHandled={() => setPendingConceptId(null)}
              />
            )}

            {activeTab === 'finances' && <MyFinancesPage onNavigate={handleSelectTab} />}

            {activeTab === 'investments' && (
              <ExploreInvestmentsPage onNavigate={handleSelectTab} />
            )}

            {activeTab === 'goals' && <GoalsPage />}

            {activeTab === 'paper' && <PaperTradingPage />}

            {activeTab === 'assessment' && <AssessmentPage onNavigate={handleSelectTab} />}

            {activeTab === 'twin' && <DigitalTwinPage />}

            {activeTab === 'profile' && <ProfilePage />}
          </Suspense>
        </main>

        <footer className="mt-auto border-t border-slate-200 bg-white py-6 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-navy-900">WealthGenie</span>
              <span aria-hidden="true">•</span>
              <span>Money lessons in plain language, made for India</span>
            </div>
            <div className="text-center sm:text-right">
              For learning only. WealthGenie is not a SEBI-registered investment adviser.
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
