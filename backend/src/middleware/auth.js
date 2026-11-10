import { config } from '../config/env.js';
import {
  createUserSupabaseClient,
  verifyAccessToken,
} from '../services/supabase.js';

export function createRequireAuth({
  verify = verifyAccessToken,
  createClient = createUserSupabaseClient,
  isConfigured = config.isSupabaseConfigured,
} = {}) {
  return async function requireAuth(req, res, next) {
    if (!isConfigured) {
      return res.status(503).json({
        error: 'Authentication is not configured on the server.',
        code: 'auth_not_configured',
      });
    }

    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        error: 'A valid access token is required.',
        code: 'unauthorized',
      });
    }

    try {
      const user = await verify(token);
      if (!user) {
        return res.status(401).json({
          error: 'Your session is invalid or has expired. Please sign in again.',
          code: 'unauthorized',
        });
      }

      req.user = user;
      req.supabase = createClient(token);
      return next();
    } catch {
      return res.status(401).json({
        error: 'Your session is invalid or has expired. Please sign in again.',
        code: 'unauthorized',
      });
    }
  };
}

export const requireAuth = createRequireAuth();
