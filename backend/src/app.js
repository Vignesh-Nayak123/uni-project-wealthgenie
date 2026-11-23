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

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Only the WealthGenie frontend may call the API from a browser. Configure
 * production origins with CORS_ORIGINS (comma separated). In development any
 * localhost port is allowed so `vite` and `vite preview` both work.
 */
function isAllowedOrigin(origin, callback) {
  if (!origin) return callback(null, true); // same-origin, curl, server-to-server
  if (config.corsOrigins.includes(origin)) return callback(null, true);
  if (config.nodeEnv === 'development' && LOCALHOST_ORIGIN.test(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
}

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors({ origin: isAllowedOrigin }));
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
  // Client errors raised by middleware (malformed JSON, oversized body) carry
  // their own 4xx status and must not be reported as server crashes.
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const status = Number(err?.status || err?.statusCode);
    if (status >= 400 && status < 500) {
      return res.status(status).json({
        error:
          err.type === 'entity.parse.failed'
            ? 'Request body is not valid JSON.'
            : err.expose
              ? err.message
              : 'Bad request.',
        code: err.type || 'bad_request',
      });
    }

    console.error('Server error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      // Internal messages can reveal file paths or SQL; keep them in logs only
      // outside development.
      ...(config.nodeEnv === 'development' ? { message: err.message } : {}),
    });
  });

  return app;
}

const defaultApp = createApp();
export default defaultApp;
