/**
 * importAMFIMaster.js
 *
 * Parses the official AMFI NAV All Schemes master file (NAVAll.txt) downloaded from
 * https://portal.amfiindia.com/spages/NAVAll.txt
 *
 * IMPORTANT LIMITATION:
 * NAVAll.txt is a daily SNAPSHOT file — it contains exactly ONE row per scheme,
 * reflecting the most recent NAV as of the download date. It is NOT a historical
 * time series. Use the AMFI historical API (importAMFI.js) for multi-date NAV history.
 *
 * NAVAll.txt column format (semicolon-delimited, 8 columns):
 *   Col 0: Scheme Code
 *   Col 1: ISIN Div Payout / ISIN Growth
 *   Col 2: ISIN Div Reinvestment
 *   Col 3: Scheme Name
 *   Col 4: Plan  (e.g., "Direct Plan", "Regular Plan")
 *   Col 5: Option (e.g., "Growth", "IDCW", etc.)
 *   Col 6: Net Asset Value
 *   Col 7: Date  (dd-Mon-yyyy format, e.g., "23-Oct-2026")
 *
 * NOTE: This column order DIFFERS from the AMFI historical API response format used
 * in importAMFI.js. parseAMFIResponse() from importAMFI.js will correctly extract
 * NAV (col 6) and Date (col 7) from NAVAll.txt, but schemeName/plan/option will be
 * mislabeled because cols 1-5 have a different meaning in this master file.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parseAMFIDate } from './importAMFI.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ─── Column Map ────────────────────────────────────────────────────────────
export const NAVALL_COLUMNS = {
  schemeCode: 0,
  isinGrowth: 1,
  isinReinvestment: 2,
  schemeName: 3,
  plan: 4,
  option: 5,
  nav: 6,
  date: 7,
};

// Match "Nifty 50 Index Fund" in scheme name (not ETF, not Nifty 500, etc.)
const NIFTY50_INDEX_FUND_PATTERNS = [/nifty\s+50\s+index\s+fund/i];

const EXCLUSION_PATTERNS = [
  /etf/i,
  /equal\s+weight/i,
  /value\s+20/i,
  /momentum/i,
  /low\s+volatility/i,
  /quality/i,
  /elss/i,
  /nifty\s*500/i,
  /shariah/i,
  /fof/i,
];

// ─── Parsers ───────────────────────────────────────────────────────────────

/**
 * Parse NAVAll.txt master file into structured rows.
 * @param {string} rawText
 * @param {{ filterSchemeCode?: string|null }} options
 */
export function parseNAVMasterFile(rawText, { filterSchemeCode = null } = {}) {
  if (!rawText || typeof rawText !== 'string') return [];

  const lines = rawText.split(/\r?\n/);
  const rows = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || !/^\d/.test(trimmed) || !trimmed.includes(';')) continue;

    const parts = trimmed.split(';');
    if (parts.length !== 8) continue;

    const schemeCode = parts[NAVALL_COLUMNS.schemeCode].trim();
    if (filterSchemeCode && schemeCode !== String(filterSchemeCode).trim()) continue;

    const rawNav = parts[NAVALL_COLUMNS.nav].trim();
    const rawDate = parts[NAVALL_COLUMNS.date].trim();
    const nav = parseFloat(rawNav.replace(/,/g, ''));
    const date = parseAMFIDate(rawDate);

    if (isNaN(nav) || nav <= 0 || !date) continue;

    rows.push({
      schemeCode,
      isinGrowth: parts[NAVALL_COLUMNS.isinGrowth].trim(),
      isinReinvestment: parts[NAVALL_COLUMNS.isinReinvestment].trim(),
      schemeName: parts[NAVALL_COLUMNS.schemeName].trim(),
      plan: parts[NAVALL_COLUMNS.plan].trim(),
      option: parts[NAVALL_COLUMNS.option].trim(),
      nav: Math.round(nav * 10000) / 10000,
      date,
    });
  }

  return rows;
}

/** Validate rows and report statistics. */
export function validateNAVMasterRows(rows) {
  const seen = new Set();
  const duplicates = [];
  const valid = [];
  let invalid = 0;

  for (const row of rows) {
    if (!row.schemeCode || !row.date || typeof row.nav !== 'number' || row.nav <= 0) {
      invalid++;
      continue;
    }
    if (seen.has(row.schemeCode)) {
      duplicates.push(row.schemeCode);
    } else {
      seen.add(row.schemeCode);
    }
    valid.push(row);
  }

  return {
    totalRows: rows.length,
    validRows: valid.length,
    invalidRows: invalid,
    duplicateSchemes: duplicates,
    uniqueSchemes: seen.size,
    rows: valid,
  };
}

/** Filter to Nifty 50 plain index funds (no ETFs, no variants). */
export function findNifty50IndexFundSchemes(rows) {
  return rows.filter((row) => {
    const name = row.schemeName;
    return (
      NIFTY50_INDEX_FUND_PATTERNS.some((p) => p.test(name)) &&
      !EXCLUSION_PATTERNS.some((p) => p.test(name))
    );
  });
}

/** Filter to Direct Plan Growth option only. */
export function filterDirectGrowth(schemes) {
  return schemes.filter(
    (s) =>
      /direct/i.test(s.plan) &&
      /growth/i.test(s.option) &&
      !/idcw/i.test(s.option) &&
      !/dividend/i.test(s.option)
  );
}

// ─── Main CLI ──────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const masterFilePath = args[0] || path.join(projectRoot, 'data', 'raw', 'amfi', 'NAVAll.txt');
  const outputDir = path.join(projectRoot, 'data', 'processed', 'amfi');

  if (!fs.existsSync(masterFilePath)) {
    console.error('ERROR: NAVAll.txt not found at: ' + masterFilePath);
    console.error('Download from: https://portal.amfiindia.com/spages/NAVAll.txt');
    process.exit(1);
  }

  const stat = fs.statSync(masterFilePath);
  console.log('\nReading master file: ' + masterFilePath);
  console.log('File size: ' + (stat.size / 1024).toFixed(1) + ' KB');
  console.log('LIMITATION: NAVAll.txt is a SNAPSHOT — 1 NAV per scheme (today only). Not a time series.');
  console.log('For historical time series, use importAMFI.js.\n');

  const rawText = fs.readFileSync(masterFilePath, 'utf-8');
  const sha256 = crypto.createHash('sha256').update(rawText).digest('hex');
  const retrievalDate = new Date().toISOString();

  const allRows = parseNAVMasterFile(rawText);
  const validation = validateNAVMasterRows(allRows);

  console.log('=== Validation Results ===');
  console.log('Total data rows parsed:  ' + validation.totalRows);
  console.log('Valid rows:              ' + validation.validRows);
  console.log('Invalid rows:            ' + validation.invalidRows);
  console.log('Unique scheme codes:     ' + validation.uniqueSchemes);
  if (validation.duplicateSchemes.length > 0) {
    console.log('Duplicate scheme codes:  ' + validation.duplicateSchemes.length);
  }

  const nifty50Schemes = findNifty50IndexFundSchemes(validation.rows);
  const directGrowthSchemes = filterDirectGrowth(nifty50Schemes);

  console.log('\n=== Nifty 50 Index Fund schemes (' + nifty50Schemes.length + ' rows) ===');
  for (const s of nifty50Schemes) {
    console.log('[' + s.schemeCode + '] ' + s.schemeName + ' | ' + s.plan + ' | ' + s.option + ' | NAV: ' + s.nav + ' | Date: ' + s.date);
  }

  console.log('\n=== Direct Plan Growth only (' + directGrowthSchemes.length + ' schemes) ===');
  for (const s of directGrowthSchemes) {
    console.log('[' + s.schemeCode + '] ' + s.schemeName + ' | ' + s.plan + ' | ' + s.option + ' | NAV: ' + s.nav + ' | Date: ' + s.date);
  }

  // Save outputs
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const masterOutputPath = path.join(outputDir, 'nifty50_schemes_master_' + dateStamp + '.json');
  const masterPayload = {
    source: 'AMFI NAVAll.txt - Daily NAV Snapshot',
    sourceUrl: 'https://portal.amfiindia.com/spages/NAVAll.txt',
    retrievalDate,
    rawSha256: sha256,
    limitation: 'NAVAll.txt contains ONE row per scheme (latest NAV only). Not a historical time series.',
    totalSchemesInFile: validation.uniqueSchemes,
    nifty50IndexFundSchemesCount: nifty50Schemes.length,
    directGrowthSchemesCount: directGrowthSchemes.length,
    snapshotDate: allRows.length > 0 ? allRows[0].date : null,
    allNifty50Schemes: nifty50Schemes,
    directGrowthOnly: directGrowthSchemes,
  };
  fs.writeFileSync(masterOutputPath, JSON.stringify(masterPayload, null, 2), 'utf-8');
  console.log('\nSaved scheme master: ' + masterOutputPath);

  if (directGrowthSchemes.length > 0) {
    const csvPath = path.join(outputDir, 'nifty50_direct_growth_snapshot_' + dateStamp + '.csv');
    const csvLines = ['Scheme Code,Scheme Name,Plan,Option,ISIN Growth,ISIN Reinvestment,NAV,Date'];
    for (const s of directGrowthSchemes) {
      csvLines.push(
        s.schemeCode + ',"' + s.schemeName + '","' + s.plan + '","' + s.option + '",' +
        s.isinGrowth + ',' + s.isinReinvestment + ',' + s.nav + ',' + s.date
      );
    }
    fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
    console.log('Saved CSV: ' + csvPath);
  }

  console.log('\nNext steps for historical NAV time series:');
  console.log('  node scripts/importAMFI.js 2023-01-01 ' + new Date().toISOString().slice(0, 10));
  console.log('  (queries AMFI historical API in 90-day chunks for each target scheme)\n');

  console.log('NAVAll.txt processing complete.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
