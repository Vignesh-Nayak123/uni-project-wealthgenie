import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import {
  learningProgressUpsertRow,
  mapLearningProgressRow,
  mergeLearningProgress,
  validateLearningProgressPayload,
} from '../utils/learningProgress.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

export function createLearningProgressRouter({
  requireAuth = defaultRequireAuth,
} = {}) {
  const router = Router();

  router.use(requireAuth);

  async function loadProgress(req) {
    const { data, error } = await req.supabase
      .from('learning_progress')
      .select('*')
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (error) throw error;
    return mapLearningProgressRow(data);
  }

  async function saveProgress(req, progress) {
    const { data, error } = await req.supabase
      .from('learning_progress')
      .upsert(learningProgressUpsertRow(progress, req.user.id), {
        onConflict: 'user_id',
      })
      .select('*')
      .single();

    if (error) throw error;
    return mapLearningProgressRow(data);
  }

  router.get('/', async (req, res) => {
    try {
      const progress = await loadProgress(req);
      return res.json({ progress });
    } catch (error) {
      return sendDatabaseError(
        res,
        error,
        'Unable to load your learning progress.'
      );
    }
  });

  router.put('/', async (req, res) => {
    let progress;

    try {
      progress = validateLearningProgressPayload(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const saved = await saveProgress(req, progress);
      return res.json({ progress: saved });
    } catch (error) {
      return sendDatabaseError(
        res,
        error,
        'Unable to save your learning progress.'
      );
    }
  });

  /**
   * POST /merge unions the browser snapshot with the stored snapshot. It never
   * removes completed concepts and keeps the best quiz score per concept.
   */
  router.post('/merge', async (req, res) => {
    let incoming;

    try {
      incoming = validateLearningProgressPayload(req.body || {});
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    try {
      const existing = await loadProgress(req);
      const merged = mergeLearningProgress(existing, incoming);
      const saved = await saveProgress(req, merged);
      return res.json({ progress: saved });
    } catch (error) {
      return sendDatabaseError(
        res,
        error,
        'Unable to merge your learning progress.'
      );
    }
  });

  router.delete('/', async (req, res) => {
    try {
      const { error } = await req.supabase
        .from('learning_progress')
        .delete()
        .eq('user_id', req.user.id);

      if (error) throw error;
      return res.json({ deleted: true });
    } catch (error) {
      return sendDatabaseError(
        res,
        error,
        'Unable to reset your learning progress.'
      );
    }
  });

  return router;
}

export default createLearningProgressRouter();
