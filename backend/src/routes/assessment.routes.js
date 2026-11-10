import { Router } from 'express';
import { assessFinances } from '../utils/financialAssessment.js';

const router = Router();

/**
 * POST /api/assessment
 * Rule-based educational financial assessment
 */
router.post('/', (req, res) => {
  try {
    const assessment = assessFinances(req.body || {});
    res.json(assessment);
  } catch (err) {
    res.status(400).json({
      error: err.message,
    });
  }
});

export default router;
