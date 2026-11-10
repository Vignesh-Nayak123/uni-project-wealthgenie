import { Router } from 'express';
import { calculateSIP, calculateCompoundInterest } from '../utils/financialMath.js';

const router = Router();

const DISCLAIMER = 'Illustrative mathematical projection based on user-entered mathematical assumptions. Not an indicator, prediction, or guarantee of future returns.';

/**
 * POST /api/calculate/sip
 * Deterministic Systematic Investment Plan (SIP) computation
 */
router.post('/sip', (req, res) => {
  const { monthlyInvestment, annualRate, years } = req.body || {};

  try {
    const result = calculateSIP(monthlyInvestment, annualRate, years);
    res.json({
      disclaimer: DISCLAIMER,
      result,
    });
  } catch (err) {
    res.status(400).json({
      error: err.message,
    });
  }
});

/**
 * POST /api/calculate/compound
 * Deterministic Lumpsum Compound Interest computation
 */
router.post('/compound', (req, res) => {
  const { principal, annualRate, years, compoundingFrequency } = req.body || {};

  try {
    const result = calculateCompoundInterest(principal, annualRate, years, compoundingFrequency);
    res.json({
      disclaimer: DISCLAIMER,
      result,
    });
  } catch (err) {
    res.status(400).json({
      error: err.message,
    });
  }
});

export default router;
