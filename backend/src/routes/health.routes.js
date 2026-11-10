import { Router } from 'express';
import { config } from '../config/env.js';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'wealthgenie-backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    aiConfigured: config.isAiConfigured,
    nodeEnv: config.nodeEnv,
  });
});

export default router;
