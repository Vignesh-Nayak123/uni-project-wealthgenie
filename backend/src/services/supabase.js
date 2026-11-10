import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

const baseOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      'X-Client-Info': 'wealthgenie-backend',
    },
  },
};

export const supabaseAuthClient = config.isSupabaseConfigured
  ? createClient(config.supabaseUrl, config.supabasePublishableKey, baseOptions)
  : null;

/**
 * Create a request-scoped Supabase client. The access token is supplied by the
 * caller so every query runs as that user and is subject to RLS.
 */
export function createUserSupabaseClient(accessToken, { fetchImpl } = {}) {
  if (!supabaseAuthClient) {
    throw new Error('Supabase is not configured on the server.');
  }

  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    ...baseOptions,
    global: {
      ...baseOptions.global,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
      headers: {
        ...baseOptions.global.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

/**
 * Verify a Supabase access token and return the authenticated user.
 * Returns null for invalid or expired tokens.
 */
export async function verifyAccessToken(accessToken) {
  if (!supabaseAuthClient || !accessToken) return null;

  const { data, error } = await supabaseAuthClient.auth.getUser(accessToken);
  if (error || !data?.user) return null;

  return data.user;
}
