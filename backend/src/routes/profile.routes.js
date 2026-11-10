import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

const router = Router();
const PROFILE_COLUMNS = 'id,email,display_name,avatar_url,created_at,updated_at';

function mapProfile(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function defaultDisplayName(user) {
  const metadata = user.user_metadata || {};
  return (
    metadata.display_name ||
    metadata.full_name ||
    (user.email ? user.email.split('@')[0] : 'WealthGenie user')
  );
}

async function ensureProfile(req) {
  const { data, error } = await req.supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', req.user.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await req.supabase
    .from('profiles')
    .insert({
      id: req.user.id,
      email: req.user.email || null,
      display_name: defaultDisplayName(req.user),
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (!insertError) return created;

  // A database trigger may have created the row concurrently.
  const { data: existing, error: retryError } = await req.supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', req.user.id)
    .maybeSingle();

  if (retryError) throw retryError;
  if (existing) return existing;

  throw insertError;
}

router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const profile = await ensureProfile(req);
    return res.json({ profile: mapProfile(profile) });
  } catch (error) {
    return sendDatabaseError(res, error, 'Unable to load your profile.');
  }
});

router.patch('/', async (req, res) => {
  const body = req.body || {};
  const updates = {};

  if (Object.prototype.hasOwnProperty.call(body, 'displayName')) {
    if (typeof body.displayName !== 'string') {
      return res.status(400).json({ error: 'Display name must be text.' });
    }
    const displayName = body.displayName.trim();
    if (displayName.length < 1 || displayName.length > 80) {
      return res.status(400).json({
        error: 'Display name must be between 1 and 80 characters.',
      });
    }
    updates.display_name = displayName;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'avatarUrl')) {
    if (body.avatarUrl !== null && typeof body.avatarUrl !== 'string') {
      return res.status(400).json({ error: 'Avatar URL must be text or null.' });
    }
    const avatarUrl = body.avatarUrl === null ? null : body.avatarUrl.trim();
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
      return res.status(400).json({ error: 'Avatar URL must start with http:// or https://.' });
    }
    if (avatarUrl && avatarUrl.length > 500) {
      return res.status(400).json({ error: 'Avatar URL must be 500 characters or fewer.' });
    }
    updates.avatar_url = avatarUrl || null;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Provide at least one profile field to update.' });
  }

  try {
    await ensureProfile(req);
    const { data, error } = await req.supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) throw error;
    return res.json({ profile: mapProfile(data) });
  } catch (error) {
    return sendDatabaseError(res, error, 'Unable to update your profile.');
  }
});

export default router;
