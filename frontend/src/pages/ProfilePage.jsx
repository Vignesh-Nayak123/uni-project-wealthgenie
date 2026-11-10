import React, { useEffect, useState } from 'react';
import {
  User,
  Mail,
  Calendar,
  ShieldCheck,
  Save,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  LogOut,
  Target,
  Calculator,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import { useAuth } from '../context/AuthContext';
import { useUserData } from '../context/UserDataContext';

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function initials(name, email) {
  const source = (name || email || 'WG').trim();
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function ProfilePage() {
  const { user, profile, profileError, updateProfile, signOut } = useAuth();
  const { goals, assessments } = useUserData();

  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setDisplayName(profile?.displayName || '');
    setAvatarUrl(profile?.avatarUrl || '');
  }, [profile?.displayName, profile?.avatarUrl]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSuccess('');

    if (displayName.trim().length < 1) {
      setFormError('Display name is required.');
      return;
    }

    setSaving(true);

    try {
      await updateProfile({
        displayName: displayName.trim(),
        avatarUrl: avatarUrl.trim() || null,
      });
      setSuccess('Profile updated.');
    } catch (error) {
      setFormError(error.message || 'Unable to update your profile.');
    } finally {
      setSaving(false);
    }
  };

  const email = profile?.email || user?.email || '';
  const name = profile?.displayName || email.split('@')[0] || 'WealthGenie user';

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
          <User className="w-3.5 h-3.5" />
          <span>Account & Profile</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
          Profile
        </h1>
        <p className="text-sm text-slate-600 mt-0.5">
          Your Supabase account identity and the profile linked to it.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            {profile?.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={name}
                className="w-20 h-20 rounded-full object-cover border border-slate-200"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-navy-900 text-white flex items-center justify-center text-xl font-bold">
                {initials(name, email)}
              </div>
            )}
            <h2 className="text-lg font-bold text-navy-950 mt-3">{name}</h2>
            <p className="text-xs text-slate-500 break-all">{email}</p>
            <Badge variant="green" size="xs" className="mt-3">
              <ShieldCheck className="w-3 h-3" />
              <span>Supabase account</span>
            </Badge>
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100 space-y-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Member since
              </span>
              <span className="font-medium text-navy-900">
                {formatDate(profile?.createdAt || user?.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Saved goals
              </span>
              <span className="font-medium text-navy-900">{goals.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5" />
                Assessments
              </span>
              <span className="font-medium text-navy-900">
                {assessments.length}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={signOut}
            className="mt-5 w-full py-2 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out</span>
          </button>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="text-base font-bold text-navy-950 mb-1">
            Edit profile
          </h2>
          <p className="text-xs text-slate-500 mb-5">
            Your email address is managed by Supabase Auth. Only the display
            name and avatar URL can be changed here.
          </p>

          {profileError && (
            <div className="mb-4 p-3 rounded-lg border border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="profileEmail" className="block text-xs font-semibold text-navy-900 mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="profileEmail"
                  type="email"
                  value={email}
                  readOnly
                  className="w-full pl-9 pr-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="profileDisplayName" className="block text-xs font-semibold text-navy-900 mb-1">
                Display name
              </label>
              <input
                id="profileDisplayName"
                type="text"
                required
                maxLength={80}
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            <div>
              <label htmlFor="profileAvatarUrl" className="block text-xs font-semibold text-navy-900 mb-1">
                Avatar URL (optional)
              </label>
              <input
                id="profileAvatarUrl"
                type="url"
                value={avatarUrl}
                onChange={(event) => setAvatarUrl(event.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-navy-900 focus:outline-none focus:bg-white focus:border-genie-500"
              />
            </div>

            {formError && (
              <div className="p-3 rounded-lg border border-rose-200 bg-rose-50 text-xs text-rose-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {success && (
              <div className="p-3 rounded-lg border border-genie-200 bg-genie-50 text-xs text-genie-900 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-genie-600 hover:bg-genie-700 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saving ? 'Saving...' : 'Save profile'}</span>
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
