/**
 * WealthGenie recommendation engine — fund catalog loader.
 *
 * Connects the content-based fund stage (funds.js) to the processed datasets:
 *   data/processed/wealthgenie_funds.csv        (merge: scheme master + details)
 *   data/processed/fund_nav_metrics.csv         (1Y/3Y/5Y, vol, drawdown, …)
 *   data/processed/fund_holdings_metrics.csv    (allocation, concentration)
 *
 * Contract (same as productData.js): missing or stale data is carried forward
 * explicitly (null + note). Nothing is zero-filled or fabricated here, and
 * the loader never blocks recommendations — the engine degrades to
 * `{ status: 'unavailable', note }` when a file is missing.
 *
 * No external dependencies: minimal RFC-4180 CSV parsing + in-memory cache.
 */

import { readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = resolve(__dirname, '../../../../data/processed');

export const FUND_CATALOG_SOURCES = Object.freeze({
  funds: 'data/processed/wealthgenie_funds.csv',
  navMetrics: 'data/processed/fund_nav_metrics.csv',
  holdingsMetrics: 'data/processed/fund_holdings_metrics.csv',
});

/** Columns kept in the candidate pool (compact; sources stay on disk). */
const FUND_COLUMNS = [
  'scheme_code', 'fund_name', 'amc', 'isin', 'scheme_plan', 'scheme_option',
  'details_matched', 'category_primary', 'category_group_clean', 'category_sub',
  'riskometer', 'riskometer_source', 'riskometer_level',
  'ter_regular', 'ter_direct', 'ter_date', 'benchmark',
  'nav_date', 'nav', 'is_active', 'is_stale', 'aaum_cr_quarterly_avg',
];

const NAV_METRIC_COLUMNS = [
  'scheme_code', 'obs_count', 'last_nav_date', 'last_nav_value', 'freshness_days',
  'return_one_year', 'return_three_year', 'return_five_year',
  'volatility_annualized', 'max_drawdown', 'positive_rolling_year_fraction',
  'insufficient_horizons',
];

/** Minimal CSV parse: handles quotes, escaped quotes, CRLF, embedded commas. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const headerIndex = rows.findIndex((r) => r.length > 0);
  const header = rows[headerIndex];
  const records = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    if (cells.length === 1 && cells[0] === '') continue;
    const record = {};
    for (let i = 0; i < header.length; i += 1) record[header[i]] = cells[i] ?? '';
    records.push(record);
  }
  return { header, records };
}

function truthy(value) {
  return value === true || String(value).trim().toLowerCase() === 'true';
}

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapToObjects(records, columns) {
  return records.map((r) => {
    const out = {};
    for (const c of columns) out[c] = r[c] ?? '';
    return out;
  });
}

/**
 * Parse raw CSV text → normalized fund records. Exported for tests so they can
 * build tiny in-memory fixtures without touching the real 38k-row dataset.
 */
export function composeFundRecords(
  fundsCsv,
  navCsv = '',
  holdingsCsv = '',
  manifestJson = null,
) {
  const fundsRaw = mapToObjects(parseCsv(fundsCsv).records, FUND_COLUMNS);
  const navMetrics = mapToObjects(parseCsv(navCsv).records, NAV_METRIC_COLUMNS);

  const navByScheme = new Map();
  for (const row of navMetrics) {
    if (row.scheme_code === '') continue;
    navByScheme.set(Number(row.scheme_code), {
      schemeCode: Number(row.scheme_code),
      obsCount: num(row.obs_count),
      lastNavDate: row.last_nav_date || null,
      lastNavValue: num(row.last_nav_value),
      freshnessDays: num(row.freshness_days),
      returnOneYear: num(row.return_one_year),
      returnThreeYear: num(row.return_three_year),
      returnFiveYear: num(row.return_five_year),
      volatilityAnnualized: num(row.volatility_annualized),
      maxDrawdown: num(row.max_drawdown),
      positiveRollingYearFraction: num(row.positive_rolling_year_fraction),
      insufficientHorizons:
        row.insufficient_horizons && row.insufficient_horizons !== ''
          ? String(row.insufficient_horizons).split(',').filter(Boolean)
          : [],
    });
  }

  // Holdings metrics are keyed by AMC-style fund_code; the manifest carries the
  // best-effort fund_code → scheme_code mapping (build_holdings_metrics.py).
  let holdingsByScheme = new Map();
  if (holdingsCsv && manifestJson) {
    const holdingsRecords = parseCsv(holdingsCsv).records;
    const map = parseJsonSafe(manifestJson)?.scheme_code_match
      ? JSON.parse(manifestJson).scheme_code_match || []
      : [];
    const holdingsEntries = new Map();
    for (const r of holdingsRecords) {
      const topHoldings = parseTopHoldings(r.top_holdings);
      holdingsEntries.set(r.fund_code, {
        snapshotMonthEnd: r.snapshot_month_end || null,
        allocationEquityPct: num(r.allocation_equity_pct_reported),
        allocationDebtPct: num(r.allocation_debt_pct_reported),
        allocationCashMoneyMarketPct: num(r.allocation_cash_money_market_pct_reported),
        allocationOtherPct: num(r.allocation_other_pct_reported),
        top5ConcentrationPct: num(r.top5_concentration_pct_reported),
        concentrationHhi: num(r.concentration_hhi),
        topHoldings,
      });
    }
    for (const entry of map) {
      const metrics = holdingsEntries.get(entry.fund_code);
      if (!metrics) continue;
      for (const code of entry.matched_scheme_codes || []) {
        holdingsByScheme.set(Number(code), { ...metrics, holdingsFundCode: entry.fund_code });
      }
    }
  }

  const activeFunds = [];
  let inactiveCount = 0;
  for (const f of fundsRaw) {
    if (!truthy(f.is_active)) {
      inactiveCount += 1;
      continue;
    }
    const riskometerLevel = num(f.riskometer_level);
    const active = {
      schemeCode: Number(f.scheme_code),
      schemeName: f.fund_name || f.scheme_name,
      amc: f.amc || null,
      isin: f.isin || null,
      plan: f.scheme_plan || null,
      option: f.scheme_option || null,
      category: f.category_primary || null,
      categoryGroup: f.category_group_clean || null,
      categorySub: f.category_sub || null,
      riskometer: f.riskometer || null,
      riskometerLevel,
      riskometerSource: f.riskometer_source || null,
      terRegular: num(f.ter_regular),
      terDirect: num(f.ter_direct),
      terDate: f.ter_date || null,
      benchmark: f.benchmark || null,
      masterNavValue: num(f.nav),
      masterNavDate: f.nav_date || null,
      detailsMatched: truthy(f.details_matched),
    };
    const metrics = navByScheme.get(active.schemeCode);
    if (metrics) {
      Object.assign(active, metrics, { schemeCode: active.schemeCode });
    } else {
      Object.assign(active, {
        obsCount: null, lastNavDate: null, lastNavValue: null, freshnessDays: null,
        returnOneYear: null, returnThreeYear: null, returnFiveYear: null,
        volatilityAnnualized: null, maxDrawdown: null,
        positiveRollingYearFraction: null, insufficientHorizons: [],
      });
    }
    active.holdings = holdingsByScheme.get(active.schemeCode) || null;
    activeFunds.push(active);
  }

  const manifest = parseJsonSafe(manifestJson) || {};
  return {
    connected: true,
    funds: activeFunds,
    stats: {
      totalFundsInDataset: fundsRaw.length,
      inactiveExcluded: inactiveCount,
      activeFunds: activeFunds.length,
      fundsWithRiskometer: activeFunds.filter((f) => f.riskometerLevel !== null).length,
      fundsWithTer: activeFunds.filter((f) => f.terRegular !== null || f.terDirect !== null).length,
      fundsWithNavMetrics: activeFunds.filter((f) => f.obsCount !== null).length,
      fundsWithHistoryOneYear: activeFunds.filter((f) => f.returnOneYear !== null).length,
      fundsWithHistoryThreeYear: activeFunds.filter((f) => f.returnThreeYear !== null).length,
      fundsWithHistoryFiveYear: activeFunds.filter((f) => f.returnFiveYear !== null).length,
      fundsWithHoldingsMetrics: activeFunds.filter((f) => f.holdings).length,
      sourceManifest: {
        generated_from: manifest.generated_from || null,
        matchedDetailsRows: manifest.details_matched_rows ?? null,
        unmatchedMasterRows: manifest.unmatched_master_rows ?? null,
      },
    },
  };
}

function parseTopHoldings(rawField) {
  if (!rawField) return [];
  try {
    const parsed = JSON.parse(rawField);
    return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
  } catch {
    // Holdings CSV stores a python-ish dict text as fallback markup
    const names = [];
    const regex = /'security_name':\s*'([^']+)'|'pct_of_fund':\s*([0-9.]+)/g;
    let match;
    let current = {};
    while ((match = regex.exec(String(rawField)))) {
      if (match[1] !== undefined) {
        if (current.security_name) names.push(current);
        current = { security_name: match[1], pct_of_fund: null };
      } else if (current.security_name) {
        current.pct_of_fund = Number(match[2]);
      }
    }
    if (current.security_name) names.push(current);
    return names.slice(0, 5);
  }
}

function parseJsonSafe(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

let cachedCatalog = null;
let cachedKey = '';
const CACHE_TTL_MS = 60_000;

function buildCacheKey(dataDir) {
  try {
    const parts = [
      dataDir,
      ...Object.values(FUND_CATALOG_SOURCES).map((rel) => {
        try {
          const s = statSync(resolve(dataDir, rel.split('/').pop()));
          return `${rel}:${s.mtimeMs}:${s.size}`;
        } catch {
          return `${rel}:missing`;
        }
      }),
    ];
    return parts.join('|');
  } catch {
    return `${dataDir}|stat-failed`;
  }
}

/**
 * Load the verified fund catalog. Never throws; missing files degrade to an
 * explicit `{ status: 'unavailable', note }` so the engine can explain why
 * fund-level results are absent.
 */
export function getFundCatalog({ dataDir = process.env.FUND_DATA_DIR || DEFAULT_DATA_DIR } = {}) {
  const key = buildCacheKey(dataDir);
  const now = Date.now();
  if (cachedCatalog && cachedKey === key && now - cachedCatalog.loadedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }

  const missing = [];
  for (const [label, rel] of Object.entries(FUND_CATALOG_SOURCES)) {
    try {
      statSync(resolve(dataDir, rel.split('/').pop()));
    } catch {
      if (label !== 'holdingsMetrics') missing.push(FUND_CATALOG_SOURCES[label]);
    }
  }
  if (missing.length > 0) {
    return {
      status: 'unavailable',
      note:
        `Processed fund dataset not connected. Missing: ${missing.join(', ')}. ` +
        'Run `python wealthgenie-datasets/build_fund_dataset.py` (+ build_nav_metrics.py). ' +
        'Category-level guidance remains available.',
      missingFiles: missing,
      loadedAt: now,
    };
  }

  try {
    const fundsCsv = readFileSync(resolve(dataDir, 'wealthgenie_funds.csv'), 'utf8');
    let navCsv = '';
    let holdingsCsv = '';
    let manifestJson = null;
    try {
      const navPath = resolve(dataDir, 'fund_nav_metrics.csv');
      const navStats = statSync(navPath);
      if (navStats.size > 0) navCsv = readFileSync(navPath, 'utf8');
    } catch {
      /* NAV metrics optional for the catalog itself; quality is reported via stats */
    }
    try {
      const holdingsPath = resolve(dataDir, 'fund_holdings_metrics.csv');
      if (statSync(holdingsPath).size > 0) holdingsCsv = readFileSync(holdingsPath, 'utf8');
    } catch {
      /* holdings coverage is limited overall; its absence is legitimate */
    }
    try {
      manifestJson = readFileSync(
        resolve(dataDir, 'wealthgenie_funds_manifest.json'), 'utf8',
      );
    } catch {
      manifestJson = null;
    }

    const catalog = composeFundRecords(fundsCsv, navCsv, holdingsCsv, manifestJson);
    cachedCatalog = { ...catalog, status: 'connected', loadedAt: now, dataDir };
    cachedKey = key;
    return cachedCatalog;
  } catch (error) {
    return {
      status: 'unavailable',
      note: `Fund dataset could not be parsed: ${error.message}`,
      missingFiles: missing,
      loadedAt: now,
    };
  }
}
