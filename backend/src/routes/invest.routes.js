import { Router } from 'express';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { simulateHistoricalBenchmark, simulateHistoricalMutualFund } from '../utils/historicalSimulation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

// File paths
const sourcesPath = resolve(__dirname, '../../../data/sources/sources.json');
const niftyJsonPath = resolve(__dirname, '../../../data/processed/nifty_tri.json');
const niftyCsvPath = resolve(__dirname, '../../../data/processed/nifty_tri.csv');
const amfiJsonPath = resolve(__dirname, '../../../data/processed/amfi_nav.json');

/**
 * Helper to load Nifty 50 TRI dataset into memory
 */
function loadNiftyTRIDataset() {
  if (existsSync(niftyJsonPath)) {
    try {
      const raw = readFileSync(niftyJsonPath, 'utf-8');
      const parsed = JSON.parse(raw);
      return {
        success: true,
        source: parsed.source || 'Nifty 50 Total Returns Index (TRI)',
        provider: parsed.provider || 'NSE Indices Limited',
        lastUpdated: parsed.lastUpdated || parsed.retrievalDate || null,
        coverage: parsed.coverage || null,
        units: parsed.units || 'Index Points (gross dividend reinvested)',
        rawSha256: parsed.rawSha256 || null,
        count: parsed.count || (parsed.data ? parsed.data.length : 0),
        data: parsed.data || [],
      };
    } catch (err) {
      return { success: false, error: 'Failed to parse nifty_tri.json: ' + err.message };
    }
  }

  if (existsSync(niftyCsvPath)) {
    try {
      const csv = readFileSync(niftyCsvPath, 'utf-8');
      const lines = csv.trim().split(/\r?\n/);
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const dateIdx = header.findIndex((h) => h.includes('date'));
      const triIdx = header.findIndex((h) => h.includes('total returns') || h.includes('tri'));

      if (dateIdx === -1 || triIdx === -1) {
        return { success: false, error: 'Processed CSV has unexpected columns' };
      }

      const data = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length > Math.max(dateIdx, triIdx)) {
          const tri = parseFloat(cols[triIdx]);
          if (!isNaN(tri) && tri > 0) {
            data.push({ date: cols[dateIdx], tri });
          }
        }
      }

      return {
        success: true,
        source: 'Nifty 50 Total Returns Index (TRI)',
        provider: 'NSE Indices Limited',
        lastUpdated: null,
        coverage: data.length > 0 ? { startDate: data[0].date, endDate: data[data.length - 1].date, tradingDays: data.length } : null,
        units: 'Index Points (gross dividend reinvested)',
        count: data.length,
        data,
      };
    } catch (err) {
      return { success: false, error: 'Failed to parse nifty_tri.csv: ' + err.message };
    }
  }

  return { success: false, unconnected: true };
}

/**
 * Helper to load AMFI Mutual Fund dataset
 */
function loadAmfiDataset() {
  if (existsSync(amfiJsonPath)) {
    try {
      const raw = readFileSync(amfiJsonPath, 'utf-8');
      return { success: true, ...JSON.parse(raw) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  return { success: false, unconnected: true };
}

/**
 * GET /api/investments/sources
 * Returns verified planned data sources registry
 */
router.get('/sources', (req, res) => {
  try {
    const rawData = readFileSync(sourcesPath, 'utf-8');
    const sources = JSON.parse(rawData);
    res.json({
      count: sources.length,
      sources,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Unable to load data sources registry',
      details: err.message,
    });
  }
});

/**
 * GET /api/investments/historical
 * Returns Nifty 50 TRI historical data if the processed file exists,
 * otherwise returns an honest "unconnected" status.
 * Supports optional ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD and ?downsample=N query params.
 */
router.get('/historical', (req, res) => {
  const result = loadNiftyTRIDataset();

  if (result.unconnected) {
    return res.json({
      status: 'unconnected',
      message:
        'Historical market index data has not been imported yet. Run "npm run import:nifty" or follow manual instructions in scripts/importNifty.js.',
      connectedSources: [],
    });
  }

  if (!result.success) {
    return res.status(500).json({
      status: 'error',
      message: result.error,
    });
  }

  let dataset = result.data;
  const { startDate, endDate, downsample } = req.query;

  if (startDate) {
    dataset = dataset.filter((d) => d.date >= startDate);
  }
  if (endDate) {
    dataset = dataset.filter((d) => d.date <= endDate);
  }

  // Downsample if requested for performance
  if (downsample && Number(downsample) > 0 && dataset.length > Number(downsample)) {
    const maxPts = Number(downsample);
    const step = Math.ceil(dataset.length / maxPts);
    const sampled = [];
    for (let i = 0; i < dataset.length; i += step) {
      sampled.push(dataset[i]);
    }
    if (sampled[sampled.length - 1] !== dataset[dataset.length - 1]) {
      sampled.push(dataset[dataset.length - 1]);
    }
    dataset = sampled;
  }

  return res.json({
    status: 'connected',
    source: result.source,
    provider: result.provider,
    lastUpdated: result.lastUpdated,
    coverage: result.coverage,
    units: result.units,
    rawSha256: result.rawSha256,
    count: dataset.length,
    data: dataset,
  });
});

/**
 * POST /api/investments/simulate/benchmark
 * Educational historical benchmark simulator using genuine Nifty 50 TRI observations.
 */
router.post('/simulate/benchmark', (req, res) => {
  const datasetResult = loadNiftyTRIDataset();

  if (!datasetResult.success || datasetResult.unconnected) {
    return res.status(503).json({
      status: 'unconnected',
      error: 'Nifty 50 TRI historical data is not connected. Ingest dataset first via "npm run import:nifty".',
    });
  }

  const { monthlyInvestment, startDate, endDate, sipDay } = req.body;

  const P = Number(monthlyInvestment);
  if (isNaN(P) || P < 500 || P > 10000000) {
    return res.status(400).json({
      error: 'Invalid monthlyInvestment',
      message: 'Monthly investment must be a number between ₹500 and ₹1,00,00,000.',
    });
  }

  try {
    const simulation = simulateHistoricalBenchmark({
      observations: datasetResult.data,
      monthlyInvestment: P,
      startDate,
      endDate,
      sipDay: sipDay ? Number(sipDay) : 1,
    });

    return res.json({
      status: 'success',
      ...simulation,
      dataSource: {
        source: datasetResult.source,
        provider: datasetResult.provider,
        lastUpdated: datasetResult.lastUpdated,
        coverage: datasetResult.coverage,
        units: datasetResult.units,
        rawSha256: datasetResult.rawSha256,
      },
    });
  } catch (err) {
    return res.status(400).json({
      status: 'error',
      message: err.message,
    });
  }
});

/**
 * GET /api/investments/mutual-funds
 * Returns list of mutual fund schemes available in the processed AMFI dataset.
 */
router.get('/mutual-funds', (req, res) => {
  const amfi = loadAmfiDataset();
  if (amfi.unconnected) {
    return res.json({
      status: 'unconnected',
      message: 'Historical Mutual Fund NAV data has not been integrated yet.',
      schemes: [],
    });
  }

  if (!amfi.success) {
    return res.status(500).json({ status: 'error', message: amfi.error });
  }

  const schemes = amfi.schemes || [];
  const coverageStarts = schemes.map((s) => s.startDate).filter(Boolean).sort();
  const coverageEnds = schemes.map((s) => s.endDate).filter(Boolean).sort();

  return res.json({
    status: 'connected',
    provider: amfi.provider,
    sourceUrl: amfi.sourceUrl,
    lastUpdated: amfi.lastUpdated || amfi.retrievalDate,
    retrievalDate: amfi.retrievalDate,
    rawSha256: amfi.rawSha256,
    rawArtifact: amfi.rawArtifact,
    coverage:
      coverageStarts.length > 0
        ? {
            startDate: coverageStarts[0],
            endDate: coverageEnds[coverageEnds.length - 1],
            schemes: schemes.length,
          }
        : null,
    schemesCount: schemes.length,
    schemes: schemes.map((s) => ({
      schemeCode: s.schemeCode,
      schemeName: s.schemeName,
      category: s.category,
      fundHouse: s.fundHouse,
      benchmark: s.benchmark,
      isin: s.isin,
      plan: s.plan,
      option: s.option,
      retrievalDate: s.retrievalDate || amfi.retrievalDate,
      observationCount: s.observationCount || (s.data ? s.data.length : 0),
      startDate: s.startDate,
      endDate: s.endDate,
      startNav: s.startNav,
      endNav: s.endNav,
      rawSha256: s.rawSha256,
      rawChunkCount: s.rawChunkCount,
      rawArtifactPath: s.rawArtifactPath,
    })),
  });
});

/**
 * POST /api/investments/simulate/mutual-fund
 * Educational historical simulation using genuine AMFI NAV observations.
 */
router.post('/simulate/mutual-fund', (req, res) => {
  const amfi = loadAmfiDataset();
  if (amfi.unconnected || !amfi.success) {
    return res.status(503).json({
      status: 'unconnected',
      error: 'Mutual Fund NAV history is not connected yet.',
    });
  }

  const { schemeCode, monthlyInvestment, startDate, endDate, sipDay } = req.body;
  if (!schemeCode) {
    return res.status(400).json({ error: 'schemeCode is required' });
  }

  const scheme = (amfi.schemes || []).find((s) => String(s.schemeCode) === String(schemeCode));
  if (!scheme || !scheme.data || scheme.data.length === 0) {
    return res.status(404).json({ error: `Scheme code ${schemeCode} not found in verified dataset` });
  }

  const P = Number(monthlyInvestment);
  if (isNaN(P) || P < 500 || P > 10000000) {
    return res.status(400).json({ error: 'Monthly investment must be between ₹500 and ₹1,00,00,000' });
  }

  try {
    const simulation = simulateHistoricalMutualFund({
      observations: scheme.data,
      schemeName: scheme.schemeName,
      schemeCode: scheme.schemeCode,
      monthlyInvestment: P,
      startDate,
      endDate,
      sipDay: sipDay ? Number(sipDay) : 1,
    });

    return res.json({
      status: 'success',
      ...simulation,
      schemeIdentity: {
        schemeCode: scheme.schemeCode,
        schemeName: scheme.schemeName,
        fundHouse: scheme.fundHouse,
        category: scheme.category,
        benchmark: scheme.benchmark,
        isin: scheme.isin,
        plan: scheme.plan,
        option: scheme.option,
      },
      dataSource: {
        provider: amfi.provider,
        sourceUrl: amfi.sourceUrl,
        retrievalDate: scheme.retrievalDate || amfi.retrievalDate,
        rawSha256: scheme.rawSha256,
        rawChunkCount: scheme.rawChunkCount,
        rawArtifactPath: scheme.rawArtifactPath,
        coverage: {
          startDate: scheme.startDate,
          endDate: scheme.endDate,
          observationCount: scheme.observationCount || scheme.data.length,
        },
        units: 'Published NAV per unit (₹)',
      },
    });
  } catch (err) {
    return res.status(400).json({ status: 'error', message: err.message });
  }
});

export default router;
