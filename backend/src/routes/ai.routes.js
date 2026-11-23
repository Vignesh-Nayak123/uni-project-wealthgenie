import { Router } from 'express';
import { config } from '../config/env.js';

const router = Router();

/**
 * GET /api/ai/status
 * Reports whether optional AI lesson generation is available. The Learn page
 * uses this to explain that curated lessons work without it.
 */
router.get('/status', (req, res) => {
  res.json({
    isConfigured: config.isAiConfigured,
    provider: 'gemini',
    status: config.isAiConfigured ? 'ready' : 'unconfigured',
    message: config.isAiConfigured
      ? 'AI lesson generation is ready.'
      : 'GEMINI_API_KEY is not configured in backend environment.',
  });
});

export default router;
