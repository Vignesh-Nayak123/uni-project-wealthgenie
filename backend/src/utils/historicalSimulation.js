/**
 * WealthGenie - Historical Investment Simulation Engine
 *
 * Deterministic historical simulations using genuine market observations
 * (Nifty 50 TRI and mutual fund NAVs). This is historical back-calculation,
 * not a forecast or a guarantee of future returns.
 */

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Calculate XIRR (Extended Internal Rate of Return) for irregular cash flows.
 * Uses Newton-Raphson numerical optimization.
 *
 * @param {Array<{ date: string|Date, amount: number }>} cashFlows
 * @param {number} guess - Initial guess (default 0.1 for 10%)
 * @returns {number|null} Annualized return percentage, or null if no convergence
 */
export function calculateXIRR(cashFlows, guess = 0.1) {
  if (!Array.isArray(cashFlows) || cashFlows.length < 2) return null;

  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  if (!hasNegative || !hasPositive) return null;

  const parsed = cashFlows.map((cf) => ({
    time: typeof cf.date === 'string' ? new Date(cf.date).getTime() : cf.date.getTime(),
    amount: cf.amount,
  }));

  const t0 = parsed[0].time;

  function npv(r) {
    if (r <= -0.999999) return NaN;
    let sum = 0;
    for (const cf of parsed) {
      const years = (cf.time - t0) / MS_PER_YEAR;
      sum += cf.amount / Math.pow(1 + r, years);
    }
    return sum;
  }

  function dnpv(r) {
    if (r <= -0.999999) return NaN;
    let sum = 0;
    for (const cf of parsed) {
      const years = (cf.time - t0) / MS_PER_YEAR;
      sum += (-years * cf.amount) / Math.pow(1 + r, years + 1);
    }
    return sum;
  }

  let rate = guess;
  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-6;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const value = npv(rate);
    const deriv = dnpv(rate);

    if (isNaN(value) || isNaN(deriv) || Math.abs(deriv) < 1e-12) {
      break;
    }

    const nextRate = rate - value / deriv;
    if (Math.abs(nextRate - rate) < TOLERANCE) {
      return Math.round(nextRate * 10000) / 100;
    }
    rate = nextRate;
    if (rate < -0.9) rate = -0.9;
    if (rate > 10) rate = 10;
  }

  return null;
}

export function isValidISODate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function assertISODate(value, label) {
  if (!isValidISODate(value)) {
    throw new Error(`Invalid ${label} "${value}". Expected YYYY-MM-DD.`);
  }
}

function normalizeObservations(observations, valueKey) {
  const seenDates = new Set();
  const normalized = observations.map((row) => {
    if (!row || !isValidISODate(row.date)) {
      throw new Error(`Observation contains an invalid date: ${JSON.stringify(row)}`);
    }
    const value = Number(row[valueKey]);
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Observation for ${row.date} contains an invalid ${valueKey} value`);
    }
    if (seenDates.has(row.date)) {
      throw new Error(`Observation series contains duplicate date ${row.date}`);
    }
    seenDates.add(row.date);
    return { date: row.date, value };
  });

  return normalized.sort((a, b) => a.date.localeCompare(b.date));
}

function monthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Shared deterministic historical SIP engine.
 *
 * Contribution rule: for each calendar month in the requested range, invest on
 * the first available observation on or after `sipDay`. If no eligible
 * observation exists in that month, no contribution is made. Missing
 * observations are never interpolated.
 *
 * Valuation rule: ending value uses the last available observation on or
 * before the requested end date. The actual observation date is returned.
 */
export function simulateHistoricalSip({
  observations,
  valueKey,
  monthlyInvestment,
  startDate,
  endDate,
  sipDay = 1,
  observationLabel = 'observations',
}) {
  if (!Array.isArray(observations) || observations.length === 0) {
    throw new Error('Historical simulation requires a valid non-empty observations array');
  }
  if (!valueKey) {
    throw new Error('Historical simulation requires a value key');
  }

  const P = Number(monthlyInvestment);
  if (isNaN(P) || P <= 0) {
    throw new Error('Monthly investment must be a positive number');
  }

  const sipDayNumber = Number(sipDay);
  if (!Number.isInteger(sipDayNumber) || sipDayNumber < 1 || sipDayNumber > 28) {
    throw new Error('sipDay must be an integer between 1 and 28');
  }

  const normalized = normalizeObservations(observations, valueKey);
  const coverageStartDate = normalized[0].date;
  const coverageEndDate = normalized[normalized.length - 1].date;
  const requestedStartDate = startDate || coverageStartDate;
  const requestedEndDate = endDate || coverageEndDate;

  assertISODate(requestedStartDate, 'startDate');
  assertISODate(requestedEndDate, 'endDate');

  if (requestedStartDate > requestedEndDate) {
    throw new Error(`startDate ${requestedStartDate} must be on or before endDate ${requestedEndDate}`);
  }

  const clampedStartDate = requestedStartDate < coverageStartDate ? coverageStartDate : requestedStartDate;
  const clampedEndDate = requestedEndDate > coverageEndDate ? coverageEndDate : requestedEndDate;
  if (clampedStartDate > clampedEndDate) {
    throw new Error(
      `Requested range ${requestedStartDate} to ${requestedEndDate} does not overlap the available coverage ${coverageStartDate} to ${coverageEndDate}`
    );
  }

  const series = normalized.filter((row) => row.date >= clampedStartDate && row.date <= clampedEndDate);
  if (series.length < 20) {
    throw new Error(
      `Selected date range contains only ${series.length} ${observationLabel}; at least 20 are required`
    );
  }

  const firstObs = series[0];
  const lastObs = series[series.length - 1];

  const [startYear, startMonth] = firstObs.date.split('-').map(Number);
  const [endYear, endMonth] = lastObs.date.split('-').map(Number);

  let currentYear = startYear;
  let currentMonth = startMonth;
  let totalUnits = 0;
  let totalInvested = 0;
  const installments = [];
  const cashFlows = [];
  const monthlySnapshots = [];
  const skippedContributionMonths = [];

  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    const targetDateStr = `${monthKey(currentYear, currentMonth)}-${String(sipDayNumber).padStart(2, '0')}`;
    const currentMonthKey = monthKey(currentYear, currentMonth);
    const contributionObs = series.find(
      (row) => row.date >= targetDateStr && row.date.startsWith(currentMonthKey)
    );

    if (contributionObs) {
      const units = P / contributionObs.value;
      totalUnits += units;
      totalInvested += P;

      const installment = {
        date: contributionObs.date,
        amount: P,
        unitsPurchased: Math.round(units * 10000) / 10000,
        cumulativeUnits: Math.round(totalUnits * 10000) / 10000,
        cumulativeInvested: totalInvested,
        [valueKey]: contributionObs.value,
      };
      installments.push(installment);

      cashFlows.push({ date: contributionObs.date, amount: -P });

      monthlySnapshots.push({
        date: contributionObs.date,
        totalInvested,
        portfolioValue: Math.round(totalUnits * contributionObs.value),
        [valueKey]: contributionObs.value,
      });
    } else {
      skippedContributionMonths.push(currentMonthKey);
    }

    currentMonth++;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    }
  }

  if (installments.length === 0) {
    throw new Error('No valid monthly contribution dates found in the selected range');
  }

  const finalValue = lastObs.value;
  const portfolioValue = Math.round(totalUnits * finalValue);
  const totalGain = portfolioValue - totalInvested;
  const absoluteReturnPct = Math.round(((portfolioValue - totalInvested) / totalInvested) * 10000) / 100;
  const periodValueChangePct = Math.round(((finalValue - firstObs.value) / firstObs.value) * 10000) / 100;

  cashFlows.push({ date: lastObs.date, amount: portfolioValue });
  const xirr = calculateXIRR(cashFlows);

  const yearsDiff =
    (new Date(`${lastObs.date}T00:00:00.000Z`).getTime() -
      new Date(`${firstObs.date}T00:00:00.000Z`).getTime()) /
    MS_PER_YEAR;

  const portfolioSeries = monthlySnapshots.map((snapshot) => ({
    ...snapshot,
    isFinalValuation: false,
  }));
  const finalSnapshot = {
    date: lastObs.date,
    totalInvested,
    portfolioValue,
    [valueKey]: finalValue,
    isFinalValuation: true,
  };
  if (portfolioSeries.length > 0 && portfolioSeries[portfolioSeries.length - 1].date === lastObs.date) {
    portfolioSeries[portfolioSeries.length - 1] = {
      ...portfolioSeries[portfolioSeries.length - 1],
      isFinalValuation: true,
    };
  } else {
    portfolioSeries.push(finalSnapshot);
  }

  return {
    monthlyInvestment: P,
    requestedStartDate,
    requestedEndDate,
    coverageStartDate,
    coverageEndDate,
    startDate: firstObs.date,
    endDate: lastObs.date,
    durationYears: Math.round(yearsDiff * 10) / 10,
    installmentsCount: installments.length,
    totalInvested,
    portfolioValue,
    totalGain,
    absoluteReturnPct,
    annualizedReturnXIRR: xirr,
    annualizedReturnValid: xirr !== null,
    annualizedReturnNote:
      xirr !== null ? 'Annualized cash-flow return calculated using XIRR.' : 'XIRR is unavailable because the cash-flow equation did not converge.',
    unitsAccumulated: Math.round(totalUnits * 10000) / 10000,
    observationsInRange: series.length,
    skippedContributionMonths,
    firstValue: firstObs.value,
    lastValue: finalValue,
    periodValueChangePct,
    contributionDateRule:
      `For each calendar month in range, the contribution is executed at the first available observation on or after day ${sipDayNumber}; ` +
      'months without an eligible observation are skipped. Missing dates are never interpolated.',
    valuationDateRule:
      'Ending value uses the last available observation on or before the requested end date; the actual valuation date is returned.',
    monthlySnapshots,
    portfolioSeries,
  };
}

/**
 * Simulate historical systematic investing in the Nifty 50 TRI.
 */
export function simulateHistoricalBenchmark({
  observations,
  monthlyInvestment,
  startDate,
  endDate,
  sipDay = 1,
}) {
  const core = simulateHistoricalSip({
    observations,
    valueKey: 'tri',
    monthlyInvestment,
    startDate,
    endDate,
    sipDay,
    observationLabel: 'trading sessions',
  });

  const indexCAGR =
    core.durationYears > 0
      ? Math.round((Math.pow(core.lastValue / core.firstValue, 1 / core.durationYears) - 1) * 10000) / 100
      : null;

  return {
    instrument: 'Nifty 50 Total Returns Index (TRI)',
    instrumentType: 'benchmark',
    provider: 'NSE Indices Limited',
    ...core,
    indexBuyAndHoldReturnPct: core.periodValueChangePct,
    indexBuyAndHoldCAGR: indexCAGR,
    startTriLevel: core.firstValue,
    endTriLevel: core.lastValue,
    calculationMethod:
      'Deterministic historical SIP simulation using genuine closing values of the Nifty 50 Total Returns Index (TRI). ' +
      core.contributionDateRule +
      ' ' +
      core.valuationDateRule +
      ' Annualized Return is calculated via standard XIRR.',
    disclaimer:
      'Historical simulation based on genuine index observations. This is an educational demonstration of rupee-cost averaging across market cycles, not a prediction of future returns or a guarantee of mutual fund performance. Index results do not include fund expenses, taxes, loads or transaction costs.',
  };
}

/**
 * Simulate historical mutual fund SIP using genuine daily NAV series.
 */
export function simulateHistoricalMutualFund({
  observations,
  schemeName,
  schemeCode,
  monthlyInvestment,
  startDate,
  endDate,
  sipDay = 1,
}) {
  const core = simulateHistoricalSip({
    observations,
    valueKey: 'nav',
    monthlyInvestment,
    startDate,
    endDate,
    sipDay,
    observationLabel: 'NAV observations',
  });

  return {
    instrument: 'Mutual Fund Historical NAV Simulation',
    instrumentType: 'mutual-fund',
    schemeName: schemeName || 'Mutual Fund Scheme',
    schemeCode: schemeCode || null,
    provider: 'Association of Mutual Funds in India (AMFI)',
    ...core,
    navChangePct: core.periodValueChangePct,
    startNav: core.firstValue,
    endNav: core.lastValue,
    calculationMethod:
      'Deterministic historical SIP simulation using genuine AMFI Net Asset Value (NAV) observations. ' +
      core.contributionDateRule +
      ' ' +
      core.valuationDateRule +
      ' Units purchased each month = Monthly Investment / Applicable NAV. Final Value = Accumulated Units x Final Observation NAV. Annualized Return is calculated via standard XIRR.',
    disclaimer:
      'Historical simulation using genuine past NAV data. Mutual fund investments are subject to market risks. Past performance does not guarantee future results. Results do not include exit loads, taxes, stamp duty or other transaction costs.',
  };
}
