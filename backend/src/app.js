import express from 'express';
import cors from 'cors';
import { config } from './config/env.js';
import healthRoutes from './routes/health.routes.js';
import aiRoutes from './routes/ai.routes.js';
import calcRoutes from './routes/calc.routes.js';
import investRoutes from './routes/invest.routes.js';
import learnRoutes from './routes/learn.routes.js';
import learningProgressRoutes from './routes/learningProgress.routes.js';
import paperTradingRoutes from './routes/paperTrading.routes.js';
import assessmentRoutes from './routes/assessment.routes.js';
import profileRoutes from './routes/profile.routes.js';
import assessmentsRoutes from './routes/assessments.routes.js';
import goalsRoutes from './routes/goals.routes.js';
import twinRoutes from './routes/twin.routes.js';
import scenariosRoutes from './routes/scenarios.routes.js';
import marketRoutes from './routes/market.routes.js';
import recommendationsRoutes from './routes/recommendations.routes.js';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging in development (status + duration make failures diagnosable)
  if (config.nodeEnv === 'development') {
    app.use((req, res, next) => {
      const startedAt = Date.now();
      res.on('finish', () => {
        console.log(
          `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - startedAt}ms`
        );
      });
      next();
    });
  }

  // Routes
  app.use('/api', healthRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/calculate', calcRoutes);
  app.use('/api/investments', investRoutes);
  app.use('/api/learn/progress', learningProgressRoutes);
  app.use('/api/learn', learnRoutes);
  app.use('/api/paper-trading', paperTradingRoutes);
  app.use('/api/assessment', assessmentRoutes);
  app.use('/api/profile', profileRoutes);
  app.use('/api/assessments', assessmentsRoutes);
  app.use('/api/goals', goalsRoutes);
  app.use('/api/twin', twinRoutes);
  app.use('/api/scenarios', scenariosRoutes);
  app.use('/api/market', marketRoutes);
  app.use('/api/recommendations', recommendationsRoutes);

  // 404 Fallback
  app.use((req, res) => {
    res.status(404).json({
      error: `Route not found: ${req.method} ${req.url}`,
    });
  });

  // Centralized error handler
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err.message,
    });
  });

  return app;
}

const defaultApp = createApp();
export default defaultApp;
