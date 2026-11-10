import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

describe('WealthGenie Backend API Endpoints', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.GEMINI_API_KEY = '';
    const { createApp } = await import('../backend/src/app.js?ai-unconfigured');
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('GET /api/health should return 200 with service health info', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.service, 'wealthgenie-backend');
    assert.equal(typeof body.aiConfigured, 'boolean');
  });

  it('POST /api/calculate/sip should return deterministic projection with disclaimer', async () => {
    const res = await fetch(`${baseUrl}/api/calculate/sip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyInvestment: 5000, annualRate: 12, years: 10 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.disclaimer.includes('Illustrative mathematical projection'));
    assert.equal(body.result.totalInvested, 600000);
    assert.equal(body.result.totalValue, 1161695);
  });

  it('POST /api/calculate/sip should return 400 for invalid inputs', async () => {
    const res = await fetch(`${baseUrl}/api/calculate/sip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ monthlyInvestment: -100, annualRate: 12, years: 5 }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('POST /api/ai/chat should return 400 when message is missing', async () => {
    const res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'error');
  });

  it('POST /api/ai/chat should return 503 unconfigured when GEMINI_API_KEY is not set', async () => {
    const res = await fetch(`${baseUrl}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'What is an emergency fund?' }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'unconfigured');
    assert.equal(body.setupRequired, true);
    assert.ok(body.message.includes('GEMINI_API_KEY'));
  });

  it('GET /api/learn/curriculum should return the prerequisite roadmap', async () => {
    const res = await fetch(`${baseUrl}/api/learn/curriculum`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.version, 1);
    assert.equal(body.branches.length, 5);
    assert.equal(body.concepts.length, 23);
    assert.equal(body.conceptCount, 23);
    const budgeting = body.concepts.find((concept) => concept.id === 'budgeting');
    assert.deepEqual(budgeting.prerequisites, ['income', 'expenses']);
    assert.ok(body.concepts.some((concept) => concept.id === 'credit-scores'));
  });

  it('POST /api/learn/lesson should reject a missing conceptId', async () => {
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'invalid_concept_id');
  });

  it('POST /api/learn/lesson should return 404 for an unknown concept', async () => {
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: 'not-a-real-concept' }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.status, 'error');
    assert.equal(body.code, 'unknown_concept');
  });

  it('POST /api/learn/lesson should return 503 unconfigured without inventing lesson content', async () => {
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: 'income' }),
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'unconfigured');
    assert.equal(body.setupRequired, true);
    assert.match(body.message, /GEMINI_API_KEY/);
    assert.equal(body.lesson, undefined);
  });

  it('GET /api/investments/sources should return planned official data sources with updated status', async () => {
    const res = await fetch(`${baseUrl}/api/investments/sources`);
    assert.equal(res.status, 200);
    const body = await res.json();
    // The verified source registry now carries the connected AMFI/Nifty datasets
    // plus the documented SEBI / AMC-factsheet / RBI reference sources.
    assert.equal(body.count, body.sources.length);
    assert.ok(body.count >= 4, `Expected at least 4 registered sources, got ${body.count}`);
    const niftySource = body.sources.find((s) => s.id === 'nifty-50-tri');
    assert.ok(niftySource);
    assert.equal(niftySource.status, 'Connected and verified');
    assert.ok(body.sources.some((s) => s.id === 'amfi-nav-history'));
  });

  it('GET /api/investments/historical should return verified Nifty 50 TRI dataset', async () => {
    const res = await fetch(`${baseUrl}/api/investments/historical`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'connected');
    assert.equal(body.source, 'Nifty 50 Total Returns Index (TRI)');
    assert.equal(body.provider, 'NSE Indices Limited');
    assert.ok(body.count > 1000, `Expected > 1000 genuine observations, got ${body.count}`);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.coverage.startDate);
    assert.ok(body.coverage.endDate);
  });

  it('GET /api/investments/historical should support date range filtering', async () => {
    const res = await fetch(`${baseUrl}/api/investments/historical?startDate=2020-01-01&endDate=2021-12-31`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'connected');
    assert.ok(body.count > 400 && body.count < 600, `Expected ~500 trading days in 2 years, got ${body.count}`);
    assert.ok(body.data[0].date >= '2020-01-01');
    assert.ok(body.data[body.data.length - 1].date <= '2021-12-31');
  });

  it('POST /api/investments/simulate/benchmark should run historical SIP simulation using genuine TRI observations', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/benchmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyInvestment: 5000,
        startDate: '2015-01-01',
        endDate: '2019-12-31',
        sipDay: 1,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.monthlyInvestment, 5000);
    assert.equal(body.installmentsCount, 60); // 5 years * 12
    assert.equal(body.totalInvested, 300000);
    assert.ok(body.portfolioValue > body.totalInvested);
    assert.ok(typeof body.annualizedReturnXIRR === 'number');
    assert.ok(body.disclaimer.includes('Historical simulation based on genuine index observations'));
    assert.ok(body.calculationMethod.includes('Deterministic historical SIP simulation'));
    assert.ok(body.monthlySnapshots.length === 60);
    assert.equal(body.instrumentType, 'benchmark');
    assert.equal(body.portfolioSeries.length, 61);
    assert.equal(body.portfolioSeries[body.portfolioSeries.length - 1].isFinalValuation, true);
    assert.equal(body.portfolioSeries[body.portfolioSeries.length - 1].portfolioValue, body.portfolioValue);
    assert.match(body.dataSource.rawSha256, /^[a-f0-9]{64}$/);
  });

  it('POST /api/investments/simulate/benchmark should reject unsupported date ranges', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/benchmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyInvestment: 5000,
        startDate: '2020-01-01',
        endDate: '2019-12-31',
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.message.includes('must be on or before'));
  });

  it('POST /api/investments/simulate/benchmark should reject invalid investment amounts', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/benchmark`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        monthlyInvestment: -500,
      }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.ok(body.error);
  });

  it('GET /api/investments/mutual-funds should return verified AMFI schemes list', async () => {
    const res = await fetch(`${baseUrl}/api/investments/mutual-funds`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'connected');
    assert.ok(body.schemesCount >= 2);
    assert.ok(body.schemes.some((s) => s.schemeCode === '120716'));
    assert.ok(body.schemes.some((s) => s.schemeCode === '119063'));
    assert.match(body.rawSha256, /^[a-f0-9]{64}$/);
    assert.ok(body.sourceUrl.includes('amfiindia.com'));
    assert.equal(body.schemes.length, 2);

    const uti = body.schemes.find((s) => s.schemeCode === '120716');
    const hdfc = body.schemes.find((s) => s.schemeCode === '119063');
    for (const scheme of [uti, hdfc]) {
      assert.equal(scheme.plan, 'Direct');
      assert.equal(scheme.option, 'Growth');
      assert.match(scheme.isin, /^INF/);
      assert.match(scheme.rawSha256, /^[a-f0-9]{64}$/);
      assert.ok(scheme.observationCount >= 600);
      assert.ok(scheme.startDate);
      assert.ok(scheme.endDate);
    }
    assert.equal(uti.isin, 'INF789F01XA0');
    assert.equal(hdfc.isin, 'INF179K01WM1');
  });

  it('POST /api/investments/simulate/mutual-fund should calculate historical SIP using genuine AMFI NAV data', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/mutual-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemeCode: '120716',
        monthlyInvestment: 5000,
        startDate: '2024-01-01',
        endDate: '2024-09-30',
        sipDay: 1,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.schemeCode, '120716');
    assert.ok(body.schemeName.includes('UTI Nifty 50 Index Fund'));
    assert.equal(body.installmentsCount, 9);
    assert.equal(body.totalInvested, 45000);
    assert.ok(body.portfolioValue > body.totalInvested);
    assert.ok(body.disclaimer.includes('Historical simulation using genuine past NAV data'));
    assert.equal(body.instrumentType, 'mutual-fund');
    assert.equal(body.schemeIdentity.isin, 'INF789F01XA0');
    assert.equal(body.schemeIdentity.plan, 'Direct');
    assert.equal(body.schemeIdentity.option, 'Growth');
    assert.match(body.dataSource.rawSha256, /^[a-f0-9]{64}$/);
    assert.equal(body.portfolioSeries[body.portfolioSeries.length - 1].isFinalValuation, true);
    assert.equal(body.portfolioSeries[body.portfolioSeries.length - 1].portfolioValue, body.portfolioValue);
  });

  it('POST /api/investments/simulate/mutual-fund should calculate HDFC scheme 119063 historical SIP', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/mutual-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        schemeCode: '119063',
        monthlyInvestment: 5000,
        startDate: '2024-01-01',
        endDate: '2024-09-30',
        sipDay: 1,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.schemeCode, '119063');
    assert.ok(body.schemeName.includes('HDFC Nifty 50 Index Fund'));
    assert.equal(body.installmentsCount, 9);
    assert.equal(body.totalInvested, 45000);
    assert.equal(body.startNav, 207.3522);
    assert.ok(body.portfolioValue > 0);
    assert.ok(body.disclaimer.includes('Historical simulation using genuine past NAV data'));
    assert.equal(body.schemeIdentity.isin, 'INF179K01WM1');
    assert.match(body.dataSource.rawSha256, /^[a-f0-9]{64}$/);
    assert.equal(body.dataSource.rawSha256, 'bd7a8b4da70b3bf94fc7eba6aaf7da3a6a8ad0ab0cc7ca997c9bd2dfb904fc2b');
  });

  it('POST /api/investments/simulate/mutual-fund should keep scheme observations isolated', async () => {
    const payload = {
      monthlyInvestment: 5000,
      startDate: '2024-01-01',
      endDate: '2024-09-30',
      sipDay: 1,
    };
    const request = (schemeCode) =>
      fetch(`${baseUrl}/api/investments/simulate/mutual-fund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, schemeCode }),
      }).then((res) => res.json());

    const [uti, hdfc] = await Promise.all([request('120716'), request('119063')]);
    assert.equal(uti.schemeCode, '120716');
    assert.equal(hdfc.schemeCode, '119063');
    assert.equal(uti.startNav, 148.9515);
    assert.equal(hdfc.startNav, 207.3522);
    assert.notEqual(uti.portfolioValue, hdfc.portfolioValue);
    assert.notEqual(uti.dataSource.rawSha256, hdfc.dataSource.rawSha256);
  });

  it('POST /api/investments/simulate/mutual-fund should return 404 for an unknown scheme', async () => {
    const res = await fetch(`${baseUrl}/api/investments/simulate/mutual-fund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemeCode: '000000', monthlyInvestment: 5000 }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error.includes('not found'));
  });
});
