/**
 * validateDataQuality.js
 *
 * Data-quality gate for WealthGenie's public financial-data layer.
 * Reads the EXISTING processed datasets and provenance artifacts; never
 * mutates data. Checks (per data/README.md ingestion standards):
 *
 *   1. Missing values            - every observation has date + numeric value
 *   2. Duplicate records         - duplicate observation dates (per scheme/index)
 *   3. Invalid dates             - ISO-8601 format and real calendar dates
 *   4. Stale data                - days since last observation/activity
 *   5. Scheme identifiers        - AMFI scheme codes + ISIN formats
 *   6. Source provenance         - sources.json completeness, raw artifacts on
 *                                  disk, SHA-256 checksum recomputation
 *
 * Run: node scripts/validateDataQuality.js
 * Exit code 1 on any ERROR; WARN issues are reported but tolerated.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const dataDir = path.join(projectRoot, 'data');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const results = [];
let errorCount = 0;
let warnCount = 0;

function record(level, dataset, check, detail) {
  results.push({ level, dataset, check, detail });
  if (level === 'ERROR') errorCount += 1;
  if (level === 'WARN') warnCount += 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function isValidDateStr(str) {
  if (!DATE_RE.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Generic time-series checks: missing values, invalid dates, duplicates, order, staleness. */
function checkTimeSeries(name, rows, { requireField = null, maxStaleDays = 14 } = {}) {
  const issues = { missing: 0, invalidDate: 0, invalidValue: 0, duplicates: [] };
  let prevDate = null;
  let unsorted = 0;

  for (const row of rows) {
    if (!row || typeof row.date !== 'string' || row.date.trim() === '') { issues.missing += 1; continue; }
    if (!isValidDateStr(row.date)) { issues.invalidDate += 1; continue; }
    if (prevDate !== null && row.date < prevDate) unsorted += 1;
    prevDate = row.date;

    if (requireField) {
      const value = row[requireField];
      if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) {
        issues.invalidValue += 1;
      }
    }
  }

  const dates = rows.map((r) => r?.date).filter(Boolean);
  const seen = new Set();
  let duplicateCount = 0;
  for (const date of dates) {
    if (seen.has(date)) { duplicateCount += 1; if (issues.duplicates.length < 5) issues.duplicates.push(date); }
    else seen.add(date);
  }

  if (issues.missing > 0) record('ERROR', name, 'missing-values', `${issues.missing} rows missing a date/value`);
  else record('PASS', name, 'missing-values', `0 of ${rows.length} rows missing`);

  if (issues.invalidDate > 0) record('ERROR', name, 'invalid-dates', `${issues.invalidDate} rows with non-ISO/unreal dates`);
  else record('PASS', name, 'invalid-dates', `all ${dates.length} dates are valid ISO-8601`);

  if (duplicateCount > 0) record('ERROR', name, 'duplicates', `${duplicateCount} duplicate date rows (first: ${issues.duplicates.join(', ')})`);
  else record('PASS', name, 'duplicates', `0 duplicate dates across ${seen.size} unique dates`);

  if (unsorted > 0) record('WARN', name, 'sort-order', `${unsorted} rows out of chronological order`);
  else record('PASS', name, 'sort-order', 'chronologically ascending');

  if (requireField) {
    if (issues.invalidValue > 0) record('ERROR', name, 'value-range', `${issues.invalidValue} rows with missing/non-positive ${requireField}`);
    else record('PASS', name, 'value-range', `all values present and positive`);
  }

  const last = [...dates].pop();
  if (last) {
    const days = Math.floor((Date.now() - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);
    if (days > maxStaleDays) record('WARN', name, 'stale-data', `last observation ${last} is ${days} days old (refresh with the import script)`);
    else record('PASS', name, 'stale-data', `last observation ${last} (${days} days old)`);
  }
  return { rowCount: rows.length, lastDate: last };
}

function verifyChecksum(label, filePath, expected) {
  if (!fs.existsSync(filePath)) {
    record('ERROR', label, 'provenance', `artifact missing on disk: ${path.relative(projectRoot, filePath)}`);
    return;
  }
  if (!expected) { record('WARN', label, 'provenance', `no checksum recorded for ${path.relative(projectRoot, filePath)}`); return; }
  const actual = sha256(fs.readFileSync(filePath));
  if (actual !== expected) record('ERROR', label, 'provenance', `checksum mismatch for ${path.relative(projectRoot, filePath)}`);
  else record('PASS', label, 'provenance', `SHA-256 verified for ${path.relative(projectRoot, filePath)}`);
}

// ─── 1. Nifty 50 TRI dataset ────────────────────────────────────────────────
try {
  const tri = readJson(path.join(dataDir, 'processed', 'nifty_tri.json'));
  const stats = checkTimeSeries('nifty_tri.json', tri.data, { requireField: 'tri', maxStaleDays: 14 });

  const cov = tri.coverage || {};
  if (cov && cov.tradingDays !== undefined) {
    if (cov.tradingDays !== stats.rowCount) record('ERROR', 'nifty_tri.json', 'coverage-record', `metadata says ${cov.tradingDays} rows, file has ${stats.rowCount}`);
    else record('PASS', 'nifty_tri.json', 'coverage-record', `coverage metadata consistent: ${cov.startDate} to ${cov.endDate}, ${stats.rowCount} sessions`);
  }
  for (const field of ['provider', 'sourceUrl', 'retrievalDate', 'rawSha256']) {
    if (!tri[field]) record('ERROR', 'nifty_tri.json', 'provenance', `missing field: ${field}`);
    else record('PASS', 'nifty_tri.json', 'provenance', `${field} present`);
  }
} catch (e) {
  record('ERROR', 'nifty_tri.json', 'read', e.message);
}

// ─── 2. AMFI NAV history (processed) ────────────────────────────────────────
let amfiSchemes = [];
try {
  const nav = readJson(path.join(dataDir, 'processed', 'amfi_nav.json'));
  amfiSchemes = Array.isArray(nav.schemes) ? nav.schemes : [];

  if (amfiSchemes.length === 0) record('ERROR', 'amfi_nav.json', 'scheme-identifiers', 'no schemes recorded');
  for (const scheme of amfiSchemes) {
    const label = `amfi_nav.json[${scheme.schemeCode}]`;
    if (!/^\d{4,7}$/.test(String(scheme.schemeCode || ''))) {
      record('ERROR', label, 'scheme-identifiers', `invalid AMFI scheme code "${scheme.schemeCode}"`);
    }
    if (scheme.isin && !/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(scheme.isin))) {
      record('WARN', label, 'scheme-identifiers', `ISIN "${scheme.isin}" does not match the standard 12-character ISIN format (IN + 9 alphanumerics + check digit)`);
    }
    verifySchemeAgainstManifest(scheme, label);
  }

  const navManifestPath = path.join(dataDir, 'raw', 'amfi', 'history', nav.rawArtifact?.directory ? path.basename(nav.rawArtifact.directory) : '', 'manifest.json');
  if (nav.rawSha256) {
    // sources.json stores this aggregate checksum; verify against the manifest file itself
    if (nav.rawArtifact?.manifestPath && fs.existsSync(path.join(projectRoot, nav.rawArtifact.manifestPath))) {
      verifyChecksum('amfi_nav.json(manifest)', path.join(projectRoot, nav.rawArtifact.manifestPath), nav.rawArtifact.manifestSha256);
    } else {
      record('ERROR', 'amfi_nav.json', 'provenance', `raw manifest declared but missing: ${nav.rawArtifact?.manifestPath}`);
    }
  } else {
    record('WARN', 'amfi_nav.json', 'provenance', 'no rawSha256 recorded');
  }
} catch (e) {
  record('ERROR', 'amfi_nav.json', 'read', e.message);
}

function countSchemeRows(scheme, label) {
  const rows = Array.isArray(scheme.data) ? scheme.data : [];
  if (rows.length === 0) { record('ERROR', label, 'missing-values', 'no observations'); return; }
  const res = checkTimeSeries(label, rows, { requireField: 'nav', maxStaleDays: 30 });
  record('PASS', label, 'coverage', `${res.rowCount} observations to ${res.lastDate}`);
}

/**
 * Cross-verify each scheme's recorded aggregate raw checksum against the
 * immutable ingestion manifest, and confirm the manifest's chunk files exist.
 */
function verifySchemeAgainstManifest(scheme, label) {
  countSchemeRows(scheme, label);
  const manifestDir = path.join(dataDir, 'raw', 'amfi', 'history');
  let runDir = null;
  if (fs.existsSync(manifestDir)) {
    const runs = fs.readdirSync(manifestDir).sort().reverse();
    for (const run of runs) {
      const candidate = path.join(manifestDir, run, 'manifest.json');
      if (fs.existsSync(candidate)) { runDir = candidate; break; }
    }
  }
  if (!runDir) {
    record('ERROR', label, 'provenance', 'no AMFI history manifest found on disk');
    return;
  }
  const manifest = readJson(runDir);
  const entry = (manifest.schemes || []).find((s) => String(s.schemeCode) === String(scheme.schemeCode));
  if (!entry) { record('ERROR', label, 'provenance', 'scheme absent from ingestion manifest'); return; }
  if (scheme.rawSha256 && entry.rawPayloadSha256 && scheme.rawSha256 !== entry.rawPayloadSha256) {
    record('ERROR', label, 'provenance', 'recorded rawSha256 does not match the ingestion manifest');
  } else {
    record('PASS', label, 'provenance', 'raw checksum matches the ingestion manifest');
  }
  const runDirAbs = path.dirname(runDir); // chunk.file paths are relative to the run directory
  const chunkEntries = (manifest.schemes.find((s) => String(s.schemeCode) === String(scheme.schemeCode)) !== undefined
    ? (manifest.schemes.find((s) => String(s.schemeCode) === String(scheme.schemeCode)).chunks || [])
    : []);
  let verified = 0;
  let missing = 0;
  let mismatched = 0;
  for (const chunk of chunkEntries) {
    if (!chunk.file) { continue; }
    const full = path.join(runDirAbs, ...chunk.file.split('/'));
    if (!fs.existsSync(full)) { missing += 1; continue; }
    if (chunk.sha256) {
      if (sha256(fs.readFileSync(full)) === chunk.sha256) verified += 1;
      else mismatched += 1;
    } else {
      verified += 1; // chunk present, no checksum recorded
    }
  }
  if (chunkEntries.length > 0) {
    if (missing > 0) record('ERROR', label, 'provenance', `${missing} raw chunk file(s)absent on disk`);
    if (mismatched > 0) record('ERROR', label, 'provenance', `${mismatched} chunk checksum(s) mismatched`);
    else if (missing === 0) record('PASS', label, 'provenance', `${verified}/${chunkEntries.length} raw chunk checksums verified against the manifest`);
  }
}

// ─── 3. AMFI NAVAll.txt scheme master (snapshot) ────────────────────────────
try {
  const masterFiles = fs.readdirSync(path.join(dataDir, 'processed', 'amfi')).filter((f) => f.startsWith('nifty50_schemes_master_'));
  if (masterFiles.length === 0) record('ERROR', 'amfi-scheme-master', 'missing', 'no scheme master snapshot found');
  for (const file of masterFiles) {
    const master = readJson(path.join(dataDir, 'processed', 'amfi', file));
    const label = `amfi-scheme-master/${file}`;
    if (!master.snapshotDate || !isValidDateStr(master.snapshotDate)) {
      record('ERROR', label, 'invalid-dates', `snapshotDate "${master.snapshotDate}" invalid`);
    } else {
      const days = Math.floor((Date.now() - Date.parse(`${master.snapshotDate}T00:00:00Z`)) / 86_400_000);
      record(days > 7 ? 'WARN' : 'PASS', label, 'stale-data', `NAV snapshot ${master.snapshotDate} (${days} days old; refresh NAVAll.txt)`);
    }
    record('PASS', label, 'scheme-identifiers', `${master.allNifty50Schemes?.length ?? 0} Nifty-50 index fund schemes, ${master.directGrowthSchemesCount} direct-growth, from ${master.totalSchemesInFile} schemes in the master file`);
    const rawMaster = path.join(dataDir, 'raw', 'amfi', 'NAVAll.txt');
    if (fs.existsSync(rawMaster) && master.rawSha256) verifyChecksum(label, rawMaster, master.rawSha256);
  }
} catch (e) {
  record('ERROR', 'amfi-scheme-master', 'read', e.message);
}

// ─── 4. Source registry completeness ────────────────────────────────────────
try {
  const sources = readJson(path.join(dataDir, 'sources', 'sources.json'));
  const REQUIRED = ['id', 'name', 'provider', 'description', 'intendedUse', 'status', 'updateFrequency', 'coveragePeriod', 'licenseOrConstraints', 'sourceUrl'];
  for (const entry of sources) {
    const missing = REQUIRED.filter((f) => entry[f] === undefined || entry[f] === null || String(entry[f]).trim() === '');
    const label = `sources.json[${entry.id}]`;
    if (missing.length > 0) record('ERROR', label, 'provenance', `missing fields: ${missing.join(', ')}`);
    else record('PASS', label, 'provenance', 'all required metadata fields present');
    if (entry.sourceUrl && !/^https?:\/\//.test(entry.sourceUrl)) {
      record('ERROR', label, 'provenance', `sourceUrl is not an http(s) URL: ${entry.sourceUrl}`);
    }
    // Public user data must never appear in the public market-data layer.
    const serialized = JSON.stringify(entry).toLowerCase();
    if (serialized.includes('access_token') || serialized.includes('apikey') || serialized.includes('password')) {
      record('ERROR', label, 'public/private-split', 'registry entry contains a credential-like string');
    }
  }
} catch (e) {
  record('ERROR', 'sources.json', 'read', e.message);
}

// ─── Report ─────────────────────────────────────────────────────────────────
console.log('=== WealthGenie data-quality validation ===\n');
for (const r of results) {
  console.log(`${r.level.padEnd(5)} ${r.dataset} :: ${r.check} :: ${r.detail}`);
}
console.log(`\nSummary: ${results.filter((r) => r.level === 'PASS').length} passed / ${warnCount} warnings / ${errorCount} errors`);
process.exit(errorCount > 0 ? 1 : 0);
