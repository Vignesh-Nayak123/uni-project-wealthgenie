import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { apiRequest } from '../lib/api';
import {
  isSupabaseConfigured,
  supabase,
  supabaseConfigError,
} from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [message, setMessage] = useState('');

  const expireSession = useCallback(async (reason = '') => {
    if (reason) setError(reason);
    if (!supabase) return;
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Local sign-out still clears the client session state.
    }
  }, []);

  const loadProfile = useCallback(
    async (activeSession) => {
      if (!activeSession?.access_token) {
        setProfile(null);
        return;
      }

      setProfileLoading(true);
      setProfileError('');

      try {
        const data = await apiRequest('/api/profile', {
          token: activeSession.access_token,
        });
        setProfile(data.profile);
      } catch (requestError) {
        if (requestError.status === 401) {
          await expireSession(
            'Your session expired. Please sign in again to continue.'
          );
        } else {
          setProfileError(
            requestError.message || 'Unable to load your profile.'
          );
        }
      } finally {
        setProfileLoading(false);
      }
    },
    [expireSession]
  );

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return undefined;
    }

    let mounted = true;

    const initialise = async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);

      if (data.session) {
        await loadProfile(data.session);
      }
    };

    initialise();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      setSession(nextSession);
      setUser(nextSession?.user ?? null);

      if (nextSession) {
        loadProfile(nextSession);
      } else {
        setProfile(null);
        setProfileError('');
      }

      if (event === 'SIGNED_OUT') {
        setProfile(null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const params = new URLSearchParams(window.location.search);
    const authError =
      params.get('error_description') ||
      params.get('error') ||
      '';

    if (authError) {
      setError(authError.replace(/\+/g, ' '));
      params.delete('error');
      params.delete('error_description');
      params.delete('error_code');
      const query = params.toString();
      window.history.replaceState(
        {},
        '',
        `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
      );
    }
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) {
      throw new Error(supabaseConfigError);
    }

    setError('');
    setMessage('');

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

    if (signInError) {
      throw new Error(signInError.message);
    }

    return data;
  };

  const signUp = async ({ email, password, displayName }) => {
    if (!supabase) {
      throw new Error(supabaseConfigError);
    }

    setError('');
    setMessage('');

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          display_name: displayName.trim(),
        },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`,
      },
    });

    if (signUpError) {
      throw new Error(signUpError.message);
    }

    if (!data.session) {
      setMessage(
        'Account created. Check your email and confirm your address before signing in.'
      );
    }

    return { needsEmailConfirmation: !data.session };
  };

  const signOut = async () => {
    if (!supabase) return;
    setError('');
    setMessage('');
    await supabase.auth.signOut();
    window.location.hash = 'home';
  };

  const updateProfile = async (updates) => {
    if (!session?.access_token) {
      throw new Error('You must be signed in to update your profile.');
    }

    const data = await apiRequest('/api/profile', {
      method: 'PATCH',
      token: session.access_token,
      body: updates,
    });

    setProfile(data.profile);
    return data.profile;
  };

  const handleUnauthorized = useCallback(
    async (requestError) => {
      if (requestError?.status !== 401) return false;
      await expireSession(
        'Your session expired. Please sign in again to continue.'
      );
      return true;
    },
    [expireSession]
  );

  const value = {
    session,
    user,
    profile,
    loading,
    profileLoading,
    error,
    profileError,
    message,
    configError: supabaseConfigError,
    isConfigured: isSupabaseConfigured,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile: () => loadProfile(session),
    handleUnauthorized,
    clearError: () => setError(''),
    clearMessage: () => setMessage(''),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider.');
  }
  return context;
}
