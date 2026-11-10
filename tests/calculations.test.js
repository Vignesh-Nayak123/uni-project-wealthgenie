import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSIP, calculateCompoundInterest, formatINR } from '../backend/src/utils/financialMath.js';

describe('Deterministic Financial Calculations & INR Formatting', () => {
  describe('SIP (Systematic Investment Plan) Calculation', () => {
    it('should accurately calculate future value for standard 10-year monthly SIP', () => {
      // Monthly 5000 at 12% for 10 years (120 months)
      const res = calculateSIP(5000, 12, 10);
      assert.equal(res.monthlyInvestment, 5000);
      assert.equal(res.totalMonths, 120);
      assert.equal(res.totalInvested, 600000); // 5000 * 120
      // Standard SIP formula: 5000 * (((1+0.01)^120 - 1)/0.01) * 1.01 = 11,61,695
      assert.equal(res.totalValue, 1161695);
      assert.equal(res.estimatedReturns, 561695);
      assert.equal(res.isZeroRate, false);
    });

    it('should handle 0% return rate by returning total invested with zero earnings', () => {
      const res = calculateSIP(3000, 0, 5);
      assert.equal(res.totalInvested, 180000); // 3000 * 60
      assert.equal(res.totalValue, 180000);
      assert.equal(res.estimatedReturns, 0);
      assert.equal(res.isZeroRate, true);
    });

    it('should throw error for negative investment amount', () => {
      assert.throws(() => calculateSIP(-500, 10, 5), /Monthly investment must be a non-negative number/);
    });

    it('should throw error for zero or negative duration', () => {
      assert.throws(() => calculateSIP(5000, 10, 0), /Investment duration must be greater than zero years/);
    });
  });

  describe('Compound Interest Calculation', () => {
    it('should calculate annual compounding correctly', () => {
      // Principal 10,000 at 10% for 3 years compounded annually: 10000 * 1.1^3 = 13,310
      const res = calculateCompoundInterest(10000, 10, 3, 1);
      assert.equal(res.principal, 10000);
      assert.equal(res.totalValue, 13310);
      assert.equal(res.interestEarned, 3310);
    });

    it('should handle zero interest rate', () => {
      const res = calculateCompoundInterest(50000, 0, 5);
      assert.equal(res.totalValue, 50000);
      assert.equal(res.interestEarned, 0);
    });

    it('should reject negative principal', () => {
      assert.throws(() => calculateCompoundInterest(-1000, 5, 2), /Principal must be a non-negative number/);
    });
  });

  describe('Indian Number & Currency Formatting (en-IN)', () => {
    it('should format amounts with Indian comma grouping and ₹ symbol', () => {
      assert.equal(formatINR(500), '₹500');
      assert.equal(formatINR(125000), '₹1,25,000');
      assert.equal(formatINR(1000000), '₹10,00,000');
      assert.equal(formatINR(10000000), '₹1,00,00,000');
    });

    it('should format numbers without ₹ symbol when requested', () => {
      assert.equal(formatINR(125000, false), '1,25,000');
    });

    it('should gracefully handle invalid inputs', () => {
      assert.equal(formatINR(null), '₹0');
      assert.equal(formatINR(undefined), '₹0');
      assert.equal(formatINR(NaN), '₹0');
    });
  });

  describe('Historical Benchmark Simulation & XIRR Calculation', async () => {
    const { calculateXIRR, simulateHistoricalBenchmark, simulateHistoricalMutualFund } = await import(
      '../backend/src/utils/historicalSimulation.js'
    );

    it('should accurately calculate XIRR for standard cash flows', () => {
      // 1-year investment: -100,000 on 2023-01-01, +110,000 on 2024-01-01 => ~10.0%
      const flows = [
        { date: '2023-01-01', amount: -100000 },
        { date: '2024-01-01', amount: 110000 },
      ];
      const xirr = calculateXIRR(flows);
      assert.ok(Math.abs(xirr - 10.0) < 0.1, `Expected ~10%, got ${xirr}`);
    });

    it('should return null for cash flows with only positive or only negative amounts', () => {
      assert.equal(calculateXIRR([{ date: '2023-01-01', amount: 100 }]), null);
      assert.equal(calculateXIRR([{ date: '2023-01-01', amount: -100 }, { date: '2023-02-01', amount: -200 }]), null);
    });

    it('should simulate historical SIP using genuine trading days without interpolating missing dates', () => {
      // Create synthetic but realistic 24-month trading observations
      const observations = [];
      let curTri = 10000;
      for (let y = 2022; y <= 2023; y++) {
        for (let m = 1; m <= 12; m++) {
          const mStr = String(m).padStart(2, '0');
          // simulate 2 trading days per month (1st and 15th)
          curTri += 100;
          observations.push({ date: `${y}-${mStr}-02`, tri: curTri });
          curTri += 50;
          observations.push({ date: `${y}-${mStr}-16`, tri: curTri });
        }
      }

      const res = simulateHistoricalBenchmark({
        observations,
        monthlyInvestment: 5000,
        startDate: '2022-01-01',
        endDate: '2023-12-31',
        sipDay: 1,
      });

      assert.equal(res.installmentsCount, 24);
      assert.equal(res.totalInvested, 120000); // 5000 * 24
      assert.ok(res.portfolioValue > res.totalInvested);
      assert.ok(typeof res.annualizedReturnXIRR === 'number');
      assert.ok(res.disclaimer.includes('not a prediction of future returns'));
      assert.ok(res.calculationMethod.includes('Deterministic historical SIP simulation'));
    });

    it('should reject invalid investment amounts and empty observation arrays', () => {
      assert.throws(
        () => simulateHistoricalBenchmark({ observations: [], monthlyInvestment: 5000 }),
        /valid non-empty observations array/
      );
      assert.throws(
        () => simulateHistoricalBenchmark({ observations: [{ date: '2024-01-01', tri: 100 }], monthlyInvestment: -100 }),
        /positive number/
      );
    });

    it('should simulate a mutual fund with exact unit accounting and include the final valuation date', () => {
      const observations = buildFundFixture();
      const res = simulateHistoricalMutualFund({
        observations,
        schemeName: 'Fixture Index Fund - Direct Plan - Growth',
        schemeCode: '999999',
        monthlyInvestment: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        sipDay: 1,
      });

      assert.equal(res.instrumentType, 'mutual-fund');
      assert.equal(res.schemeCode, '999999');
      assert.equal(res.startDate, '2024-01-02');
      assert.equal(res.endDate, '2024-12-16');
      assert.equal(res.installmentsCount, 12);
      assert.equal(res.totalInvested, 12000);
      assert.equal(res.unitsAccumulated, 120);
      assert.equal(res.portfolioValue, 12000);
      assert.equal(res.totalGain, 0);
      assert.equal(res.navChangePct, 0);
      assert.ok(Math.abs(res.annualizedReturnXIRR) < 0.1, `Expected ~0% XIRR, got ${res.annualizedReturnXIRR}`);

      assert.equal(res.monthlySnapshots.length, 12);
      assert.equal(res.monthlySnapshots[res.monthlySnapshots.length - 1].date, '2024-12-02');
      assert.equal(res.portfolioSeries[res.portfolioSeries.length - 1].date, '2024-12-16');
      assert.equal(res.portfolioSeries[res.portfolioSeries.length - 1].isFinalValuation, true);
      assert.equal(res.portfolioSeries[res.portfolioSeries.length - 1].portfolioValue, 12000);
    });

    it('should use the first observation on or after sipDay and skip months with no eligible observation', () => {
      const res = simulateHistoricalMutualFund({
        observations: buildFundFixture({ skipMonth: 6 }),
        schemeName: 'Fixture Index Fund',
        schemeCode: '999999',
        monthlyInvestment: 1000,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        sipDay: 15,
      });

      assert.equal(res.installmentsCount, 11);
      assert.equal(res.totalInvested, 11000);
      assert.deepEqual(res.skippedContributionMonths, ['2024-06']);
      assert.equal(res.startDate, '2024-01-02');
      assert.equal(res.monthlySnapshots[0].date, '2024-01-16');
      assert.equal(res.monthlySnapshots[res.monthlySnapshots.length - 1].date, '2024-12-16');
      assert.equal(res.portfolioValue, 11000);
    });

    it('should reject invalid date ranges, unsupported dates, and insufficient observation windows', () => {
      const observations = buildFundFixture();
      const base = {
        observations,
        schemeName: 'Fixture Index Fund',
        schemeCode: '999999',
        monthlyInvestment: 1000,
        sipDay: 1,
      };

      assert.throws(
        () => simulateHistoricalMutualFund({ ...base, startDate: '2024-12-01', endDate: '2024-01-01' }),
        /must be on or before/
      );
      assert.throws(
        () => simulateHistoricalMutualFund({ ...base, startDate: '2019-01-01', endDate: '2019-12-31' }),
        /does not overlap the available coverage/
      );
      assert.throws(
        () => simulateHistoricalMutualFund({ ...base, startDate: '2024-01-01', endDate: '2024-01-31' }),
        /at least 20 are required/
      );
      assert.throws(
        () => simulateHistoricalMutualFund({ ...base, startDate: '2024-13-01', endDate: '2024-12-31' }),
        /Invalid startDate/
      );
    });
  });
});

function buildFundFixture({ skipMonth = null, nav = 100 } = {}) {
  const observations = [];
  for (let month = 1; month <= 12; month++) {
    if (month === skipMonth) continue;
    const mStr = String(month).padStart(2, '0');
    observations.push({ date: `2024-${mStr}-02`, nav });
    observations.push({ date: `2024-${mStr}-16`, nav });
  }
  return observations;
}
