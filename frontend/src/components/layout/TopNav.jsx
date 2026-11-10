import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  Search,
  BookOpen,
  X,
  User,
  Target,
  LogOut,
  Calculator,
} from 'lucide-react';
import { MOCK_LESSONS } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';

function initials(name, email) {
  const source = (name || email || 'WG').trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function TopNav({ onToggleMobileSidebar, onNavigate }) {
  const { user, profile, signOut } = useAuth();

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const profileRef = useRef(null);
  const searchRef = useRef(null);

  const displayName =
    profile?.displayName || user?.email?.split('@')[0] || 'WealthGenie user';
  const email = profile?.email || user?.email || '';
  const avatarUrl = profile?.avatarUrl || '';

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const filteredLessons = searchQuery.trim()
    ? MOCK_LESSONS.filter(
        (l) =>
          l.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
          l.summary.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  const handleSelectSearchResult = () => {
    setShowSearchResults(false);
    setSearchQuery('');
    onNavigate('learn');
  };

  const goTo = (tabId) => {
    setShowProfileMenu(false);
    onNavigate(tabId);
  };

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-xs border-b border-slate-200">
      <div className="flex items-center justify-between h-16 px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile Menu Toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMobileSidebar}
            className="md:hidden text-slate-600 hover:text-navy-900 p-2 rounded-lg hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-genie-500"
            aria-label="Open navigation sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>

        {/* Center: Search Field */}
        <div className="flex-1 max-w-md mx-4 relative" ref={searchRef}>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSearchResults(true);
              }}
              onFocus={() => setShowSearchResults(true)}
              placeholder="Search lessons, topics, terms (e.g. index fund)..."
              className="w-full pl-9 pr-8 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-genie-500 focus:ring-2 focus:ring-genie-100 transition-all"
              aria-label="Search financial topics and lessons"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-navy-800"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Search Results Dropdown */}
          {showSearchResults && searchQuery.trim() && (
            <div className="absolute left-0 right-0 mt-2 bg-white rounded-xl shadow-elevated border border-slate-200/90 py-2 z-30 overflow-hidden">
              <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Matching Educational Content ({filteredLessons.length})
              </div>
              {filteredLessons.length > 0 ? (
                <div className="max-h-64 overflow-y-auto">
                  {filteredLessons.map((lesson) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={handleSelectSearchResult}
                      className="w-full text-left px-3.5 py-2 hover:bg-slate-50 flex items-start gap-2.5 transition-colors group"
                    >
                      <BookOpen className="w-4 h-4 text-genie-600 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-navy-900 group-hover:text-genie-700 truncate">
                          {lesson.title}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{lesson.category}</span>
                          <span>•</span>
                          <span>{lesson.readTime}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3 text-xs text-slate-500 text-center">
                  No matching lessons found for &ldquo;{searchQuery}&rdquo;. Try asking WealthGenie AI directly!
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Profile */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 p-1 pl-2 rounded-lg hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-genie-500"
              aria-label="User account menu"
              aria-expanded={showProfileMenu}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200"
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-navy-900 text-white flex items-center justify-center text-xs font-bold">
                  {initials(displayName, email)}
                </span>
              )}
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-navy-900 leading-tight">
                  {displayName}
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  Signed in
                </div>
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-elevated border border-slate-200/90 py-2 z-30 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-4 py-3 border-b border-slate-100">
                  <div className="text-sm font-semibold text-navy-900">{displayName}</div>
                  <div className="text-xs text-slate-500 break-all">{email}</div>
                </div>

                <div className="py-1">
                  <button
                    type="button"
                    onClick={() => goTo('profile')}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <User className="w-4 h-4 text-slate-400" />
                    <span>My Profile</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo('goals')}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Target className="w-4 h-4 text-slate-400" />
                    <span>My Goals</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => goTo('assessment')}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                  >
                    <Calculator className="w-4 h-4 text-slate-400" />
                    <span>New Assessment</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      signOut();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>

                <div className="pt-1 border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400">
                  WealthGenie Phase 0 • India Context
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
