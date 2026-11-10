import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import { buildTwinPreview } from '../utils/financialTwin.js';

/**
 * Authenticated Digital Twin preview. This route does not persist anything;
 * it recalculates the baseline and scenario independently so the baseline can
 * never be mutated by a what-if adjustment.
 */
export function createTwinRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  router.use(requireAuth);

  router.post('/preview', (req, res) => {
    try {
      const body = req.body || {};
      const preview = buildTwinPreview({
        baseline: body.baseline,
        scenario: body.scenario,
        thresholds: body.thresholds,
        asOfDate: body.asOfDate,
      });

      return res.json(preview);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
  });

  return router;
}

export default createTwinRouter();
