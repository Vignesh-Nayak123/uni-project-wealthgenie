import React, { useState } from 'react';
import {
  Sparkles,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import Card from '../components/common/Card';
import { useAuth } from '../context/AuthContext';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AuthPage() {
  const {
    signIn,
    signUp,
    error,
    message,
    configError,
    isConfigured,
    clearError,
    clearMessage,
  } = useAuth();

  const [mode, setMode] = useState('login');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isSignup = mode === 'signup';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setFormError('');
    clearError();
    clearMessage();
  };

  const validate = () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      return 'Enter a valid email address.';
    }
    if (password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (isSignup && displayName.trim().length < 2) {
      return 'Enter a display name of at least 2 characters.';
    }
    if (isSignup && password !== confirmPassword) {
      return 'Passwords do not match.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    clearError();
    clearMessage();

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      if (isSignup) {
        await signUp({ email, password, displayName });
        setPassword('');
        setConfirmPassword('');
      } else {
        await signIn(email, password);
      }
    } catch (submitError) {
      setFormError(
        submitError.message || 'Authentication failed. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const visibleError = formError || error;

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-navy-900 text-white flex items-center justify-center shadow-subtle">
            <Sparkles className="w-5 h-5 text-genie-400" />
          </div>
          <div>
            <div className="font-bold text-xl text-navy-950 tracking-tight">
              WealthGenie
            </div>
            <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
              Financial Literacy
            </p>
          </div>
        </div>

        <Card className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-extrabold text-navy-950">
              {isSignup ? 'Create your account' : 'Welcome back'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isSignup
                ? 'Save assessments and goals securely to your account.'
                : 'Sign in to access your assessments, goals, and dashboard.'}
            </p>
          </div>

          {!isConfigured && (
            <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{configError}</span>
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 rounded-lg border border-genie-200 bg-genie-50 text-xs text-genie-900 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {visibleError && (
            <div className="mb-4 p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{visibleError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div>
                <label htmlFor="displayName" className="block text-xs font-semibold text-navy-900 mb-1">
                  Display name
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="displayName"
                    type="text"
                    autoComplete="name"
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-navy-900 mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-navy-900 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-10 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy-800 p-1"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isSignup && (
              <div>
                <label htmlFor="confirmPassword" className="block text-xs font-semibold text-navy-900 mb-1">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Re-enter your password"
                    className="w-full pl-9 pr-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !isConfigured}
              className="w-full py-2.5 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-sm font-semibold transition-colors inline-flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>
                {submitting
                  ? isSignup
                    ? 'Creating account...'
                    : 'Signing in...'
                  : isSignup
                    ? 'Create account'
                    : 'Sign in'}
              </span>
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
            {isSignup ? 'Already have an account?' : 'New to WealthGenie?'}{' '}
            <button
              type="button"
              onClick={() => switchMode(isSignup ? 'login' : 'signup')}
              className="font-semibold text-genie-700 hover:text-genie-900"
            >
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </div>

          {isSignup && (
            <p className="mt-3 text-[11px] text-slate-400 text-center leading-relaxed">
              If email confirmation is enabled in Supabase, you will need to
              confirm your address before signing in.
            </p>
          )}
        </Card>

        <div className="mt-5 flex items-start justify-center gap-2 text-[11px] text-slate-500 text-center">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Your account data is protected by Supabase Auth and row-level
            security. Google sign-in is intentionally not enabled yet.
          </span>
        </div>
      </div>
    </div>
  );
}
