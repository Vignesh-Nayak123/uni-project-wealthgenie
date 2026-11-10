/**
 * WealthGenie - Deterministic Financial Mathematics
 * 
 * Strict deterministic calculations for educational financial models.
 * Never presents formulas as guarantees or forecasts.
 */

/**
 * Calculate Systematic Investment Plan (SIP) future maturity value
 * Formula: M = P * [((1 + i)^n - 1) / i] * (1 + i)
 * 
 * @param {number} monthlyInvestment - Monthly SIP contribution in INR (₹)
 * @param {number} annualRatePct - Expected annual return rate percentage (illustrative assumption)
 * @param {number} years - Duration in years
 * @returns {object} calculation breakdown
 */
export function calculateSIP(monthlyInvestment, annualRatePct, years) {
  const P = Number(monthlyInvestment);
  const r = Number(annualRatePct);
  const t = Number(years);

  if (isNaN(P) || P < 0) {
    throw new Error('Monthly investment must be a non-negative number');
  }
  if (isNaN(r) || r < 0) {
    throw new Error('Annual rate must be a non-negative number');
  }
  if (isNaN(t) || t <= 0) {
    throw new Error('Investment duration must be greater than zero years');
  }

  const n = Math.round(t * 12);
  const totalInvested = Math.round(P * n);

  if (r === 0) {
    return {
      monthlyInvestment: P,
      annualRatePct: 0,
      years: t,
      totalMonths: n,
      totalInvested,
      estimatedReturns: 0,
      totalValue: totalInvested,
      isZeroRate: true,
    };
  }

  const i = r / 100 / 12;
  // M = P * [((1 + i)^n - 1) / i] * (1 + i)
  const compoundMultiplier = Math.pow(1 + i, n);
  const totalValue = Math.round(P * ((compoundMultiplier - 1) / i) * (1 + i));
  const estimatedReturns = Math.max(0, totalValue - totalInvested);

  return {
    monthlyInvestment: P,
    annualRatePct: r,
    years: t,
    totalMonths: n,
    totalInvested,
    estimatedReturns,
    totalValue,
    isZeroRate: false,
  };
}

/**
 * Calculate Lumpsum Compound Interest
 * Formula: A = P * (1 + r/n)^(n*t)
 * 
 * @param {number} principal - Initial principal deposit in INR (₹)
 * @param {number} annualRatePct - Annual interest rate percentage
 * @param {number} years - Duration in years
 * @param {number} compoundingFrequency - Times compounded per year (1=annual, 4=quarterly, 12=monthly)
 * @returns {object} calculation breakdown
 */
export function calculateCompoundInterest(principal, annualRatePct, years, compoundingFrequency = 1) {
  const P = Number(principal);
  const r = Number(annualRatePct);
  const t = Number(years);
  const n = Number(compoundingFrequency) || 1;

  if (isNaN(P) || P < 0) {
    throw new Error('Principal must be a non-negative number');
  }
  if (isNaN(r) || r < 0) {
    throw new Error('Annual rate must be a non-negative number');
  }
  if (isNaN(t) || t <= 0) {
    throw new Error('Duration must be greater than zero years');
  }

  if (r === 0) {
    return {
      principal: P,
      annualRatePct: 0,
      years: t,
      compoundingFrequency: n,
      interestEarned: 0,
      totalValue: Math.round(P),
    };
  }

  const rateDecimal = r / 100;
  const totalValue = Math.round(P * Math.pow(1 + rateDecimal / n, n * t));
  const interestEarned = Math.max(0, totalValue - P);

  return {
    principal: P,
    annualRatePct: r,
    years: t,
    compoundingFrequency: n,
    interestEarned,
    totalValue,
  };
}

/**
 * Format number into Indian currency format (en-IN)
 * Example: 125000 -> ₹1,25,000
 * 
 * @param {number} amount
 * @param {boolean} includeSymbol - prepend ₹
 * @returns {string} formatted string
 */
export function formatINR(amount, includeSymbol = true) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return includeSymbol ? '₹0' : '0';
  }

  const num = Math.round(Number(amount));
  const formatted = new Intl.NumberFormat('en-IN').format(num);
  return includeSymbol ? `₹${formatted}` : formatted;
}
