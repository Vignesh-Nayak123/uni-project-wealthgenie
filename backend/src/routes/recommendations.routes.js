import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import {
  generateRecommendation,
  attachGenerativeExplanation,
} from '../services/recommendation/index.js';
import { sendDatabaseError } from '../utils/databaseErrors.js';

export function createRecommendationsRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  // All recommendation access is per-user and authenticated — the engine only
  // ever receives the caller's own saved goals through their RLS-scoped
  // Supabase client. The request body's user id is never trusted: req.user.id
  // comes from the verified auth token only.
  router.use(requireAuth);

  router.post('/', async (req, res) => {
    const body = req.body || {};
    const startedAt = Date.now();
    const requestLog = { route: 'POST /api/recommendations', userId: req.user?.id };

    try {
      const payload = await generateRecommendation({
        profileInput: body.profile || body,
        // RLS-scoped: bound to req.user.id via the per-user Supabase client.
        // A failed load throws, which the engine degrades into a note.
        getSavedGoals: async () => {
          const { data, error } = await req.supabase
            .from('financial_goals')
            .select('title,category,target_amount,target_date')
            .order('created_at', { ascending: false });
          if (error) throw error;
          return data;
        },
        requireSavedGoals: body.useSavedGoals !== false,
      });

      const payloadWithNarration = await attachGenerativeExplanation(payload);

      console.info(JSON.stringify({
        ...requestLog,
        status: 200,
        durationMs: Date.now() - startedAt,
        categoriesRanked: payload.categoryRecommendations?.length ?? 0,
        fundsRecommended: payload.recommendations?.length ?? 0,
        fundStageStatus: payload.funds?.status ?? 'unknown',
        readinessStatus: payload.profileSummary?.readinessStatus ?? 'unknown',
      }));

      return res.json(payloadWithNarration);
    } catch (error) {
      // Validation errors are readable 400s; anything else surfaces through the
      // shared database-error handler. Stack traces stay in the server log,
      // never in the response.
      if (/must be|is required|not accepted|inconsistent|Unsupported/i.test(String(error.message))) {
        console.info(JSON.stringify({ ...requestLog, status: 400, durationMs: Date.now() - startedAt, error: error.message }));
        return res.status(400).json({ error: error.message });
      }
      console.error(JSON.stringify({
        ...requestLog,
        status: 'error',
        durationMs: Date.now() - startedAt,
        errorType: error?.constructor?.name || 'Unknown',
      }));
      return sendDatabaseError(res, error, 'Unable to generate your recommendation right now.');
    }
  });

  return router;
}

export default createRecommendationsRouter();
