import { Router } from 'express';
import { getTutorResponse } from '../services/ai.service.js';
import { config } from '../config/env.js';

const router = Router();

/**
 * GET /api/ai/status
 * Returns current AI service readiness and provider metadata
 */
router.get('/status', (req, res) => {
  res.json({
    isConfigured: config.isAiConfigured,
    provider: 'gemini',
    status: config.isAiConfigured ? 'ready' : 'unconfigured',
    message: config.isAiConfigured
      ? 'AI Tutor is ready.'
      : 'GEMINI_API_KEY is not configured in backend environment.',
  });
});

/**
 * POST /api/ai/chat
 * Validates request input and routes to AI service
 */
router.post('/chat', async (req, res) => {
  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'Message parameter is required and must be a non-empty string.',
    });
  }

  const result = await getTutorResponse(message.trim(), history || []);

  if (result.status === 'unconfigured') {
    return res.status(503).json(result);
  }

  if (result.status === 'error') {
    return res.status(502).json(result);
  }

  return res.status(200).json(result);
});

export default router;
