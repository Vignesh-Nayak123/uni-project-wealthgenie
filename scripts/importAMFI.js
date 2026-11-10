import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ─── AMFI Configuration ──────────────────────────────────────────────────────
export const AMFI_NAV_ENDPOINT = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx';
export const AMFI_PORTAL_URL = 'https://www.amfiindia.com/net-asset-value/nav-download';

export const AMFI_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/plain, text/html, */*',
};

// Target Benchmark-tracking schemes for beginner education
export const TARGET_SCHEMES = [
  {
    schemeCode: '120716',
    schemeName: 'UTI Nifty 50 Index Fund - Growth Option- Direct',
    amcCode: '28',
    fundHouse: 'UTI Mutual Fund',
    category: 'Equity Scheme - Large Cap / Index Fund',
    benchmark: 'Nifty 50 TRI',
    expectedIsin: 'INF789F01XA0',
    expectedPlan: 'Direct',
    expectedOption: 'Growth',
  },
  {
    // Verified from NAVAll.txt: 119063 = 'HDFC Nifty 50 Index Fund; Direct Plan; Growth Option'
    // NOTE: 119598 was WRONG — it maps to 'SBI Large Cap Fund' (unrelated fund).
    schemeCode: '119063',
    schemeName: 'HDFC Nifty 50 Index Fund - Direct Plan - Growth Option',
    amcCode: '9',
    fundHouse: 'HDFC Mutual Fund',
    category: 'Equity Scheme - Large Cap / Index Fund',
    benchmark: 'Nifty 50 TRI',
    expectedIsin: 'INF179K01WM1',
    expectedPlan: 'Direct',
    expectedOption: 'Growth',
  },
];

export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatAMFIDate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to formatAMFIDate: ${date}`);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

export function parseAMFIDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();

  // Already ISO 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // '01-Jan-2024' or '01 Jan 2024'
  const parts = trimmed.replace(/-/g, ' ').split(/\s+/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const monIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === parts[1].toLowerCase());
    const year = parts[2];
    if (monIdx !== -1 && /^\d{4}$/.test(year) && !isNaN(Number(day))) {
      const month = String(monIdx + 1).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  return null;
}

/**
 * Split an arbitrary date range into <= 90-day chunks because
 * AMFI rejects queries exceeding ~90 to 120 days.
 */
export function splitAMFIDateRangeIntoChunks(startDateStr, endDateStr, maxDays = 90) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error(`Invalid date range: ${startDateStr} to ${endDateStr}`);
  }
  if (start > end) {
    throw new Error(`Start date (${startDateStr}) must be before end date (${endDateStr})`);
  }

  const chunks = [];
  let currentStart = new Date(start);

  while (currentStart <= end) {
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + (maxDays - 1));
    const effectiveEnd = currentEnd > end ? new Date(end) : currentEnd;

    chunks.push({
      start: formatAMFIDate(currentStart),
      end: formatAMFIDate(effectiveEnd),
      startDateStr: currentStart.toISOString().slice(0, 10),
      endDateStr: effectiveEnd.toISOString().slice(0, 10),
    });

    currentStart = new Date(effectiveEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return chunks;
}

/**
 * Parse raw AMFI semicolon-delimited text.
 * Filter strictly by targetSchemeCode to never mix funds.
 */
export function parseAMFIResponse(rawText, targetSchemeCode) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows = [];
  const targetCodeStr = String(targetSchemeCode).trim();

  for (const line of lines) {
    // Semicolon-delimited line format:
    // Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date
    if (!line.includes(';')) continue;
    const parts = line.split(';').map((p) => p.trim());
    if (parts.length < 8) continue;

    const schemeCode = parts[0];
    if (schemeCode !== targetCodeStr) continue;

    const rawNav = parts[6];
    const rawDate = parts[7];

    const date = parseAMFIDate(rawDate);
    const nav = parseFloat(rawNav.replace(/,/g, ''));

    if (date && !isNaN(nav) && nav > 0) {
      rows.push({
        schemeCode,
        schemeName: parts[1],
        plan: parts[2] || undefined,
        option: parts[3] || undefined,
        isin: parts[4] || undefined,
        date,
        nav: Math.round(nav * 10000) / 10000,
      });
    }
  }

  return rows;
}

/**
 * Validate, deduplicate, and sort NAV observations without interpolating missing dates.
 */
export function validateAndNormalizeNAV(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('Cannot normalize empty NAV observations');
  }

  const map = new Map();
  let duplicates = 0;
  let invalid = 0;

  for (const r of rows) {
    if (!r.date || typeof r.nav !== 'number' || isNaN(r.nav) || r.nav <= 0) {
      invalid++;
      continue;
    }
    if (map.has(r.date)) {
      duplicates++;
      continue;
    }
    map.set(r.date, { date: r.date, nav: r.nav });
  }

  const sorted = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) {
    throw new Error('All NAV rows failed validation criteria');
  }

  return {
    data: sorted,
    stats: {
      totalInput: rows.length,
      validUnique: sorted.length,
      duplicatesRemoved: duplicates,
      invalidSkipped: invalid,
      startDate: sorted[0].date,
      endDate: sorted[sorted.length - 1].date,
      startNav: sorted[0].nav,
      endNav: sorted[sorted.length - 1].nav,
    },
  };
}

function normalizeIdentityText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Strictly verify that every parsed observation belongs to the configured scheme.
 * A single mismatched ISIN, plan, option or fund name aborts the chunk.
 */
export function validateSchemeIdentity(rows, schemeInfo) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(`No observations supplied for identity validation (scheme ${schemeInfo?.schemeCode || 'unknown'})`);
  }
  if (!schemeInfo?.expectedIsin) {
    throw new Error(`Missing expectedIsin configuration for scheme ${schemeInfo?.schemeCode || 'unknown'}`);
  }

  const expectedCode = String(schemeInfo.schemeCode).trim();
  const expectedIsin = String(schemeInfo.expectedIsin).trim().toUpperCase();
  const expectedPlan = String(schemeInfo.expectedPlan || 'Direct').trim();
  const expectedOption = String(schemeInfo.expectedOption || 'Growth').trim();
  const fundHouseKey = normalizeIdentityText(schemeInfo.fundHouse).replace(/\bmutual fund\b/g, '').trim();

  for (const row of rows) {
    const label = `scheme ${schemeInfo.schemeCode} on ${row?.date || 'unknown date'}`;

    if (String(row?.schemeCode || '').trim() !== expectedCode) {
      throw new Error(`Scheme identity mismatch for ${label}: got code ${row?.schemeCode}`);
    }
    if (String(row?.isin || '').trim().toUpperCase() !== expectedIsin) {
      throw new Error(`Scheme identity mismatch for ${label}: expected ISIN ${expectedIsin}, got ${row?.isin || '(missing)'}`);
    }
    if (!new RegExp(`\\b${expectedPlan}\\b`, 'i').test(row?.plan || '')) {
      throw new Error(`Scheme identity mismatch for ${label}: expected ${expectedPlan} plan, got ${row?.plan || '(missing)'}`);
    }
    if (
      !new RegExp(`\\b${expectedOption}\\b`, 'i').test(row?.option || '') ||
      /idcw|dividend|bonus/i.test(row?.option || '')
    ) {
      throw new Error(`Scheme identity mismatch for ${label}: expected ${expectedOption} option, got ${row?.option || '(missing)'}`);
    }

    const name = normalizeIdentityText(row?.schemeName);
    if (!name.includes('nifty 50 index fund')) {
      throw new Error(`Scheme identity mismatch for ${label}: unexpected scheme name "${row?.schemeName || ''}"`);
    }
    if (fundHouseKey && !name.includes(fundHouseKey)) {
      throw new Error(`Scheme identity mismatch for ${label}: name does not match fund house "${schemeInfo.fundHouse}"`);
    }
  }

  return true;
}

function assertValidObservation(row, sourceLabel) {
  if (
    !row ||
    typeof row.date !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
    typeof row.nav !== 'number' ||
    !Number.isFinite(row.nav) ||
    row.nav <= 0
  ) {
    throw new Error(`${sourceLabel} contains an invalid observation: ${JSON.stringify(row)}`);
  }
}

export function summarizeObservations(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Cannot summarize an empty observation series');
  }
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  return {
    totalInput: sorted.length,
    validUnique: sorted.length,
    duplicatesRemoved: 0,
    invalidSkipped: 0,
    startDate: sorted[0].date,
    endDate: sorted[sorted.length - 1].date,
    startNav: sorted[0].nav,
    endNav: sorted[sorted.length - 1].nav,
  };
}

/**
 * Merge fetched observations with an existing processed series.
 * Existing observations are preserved exactly; any NAV conflict on an
 * overlapping date aborts the merge instead of silently overwriting data.
 */
export function mergeSchemeObservations(existingData, fetchedData) {
  if (!Array.isArray(existingData) || !Array.isArray(fetchedData)) {
    throw new Error('Observation merge requires arrays for existing and fetched data');
  }
  if (fetchedData.length === 0) {
    throw new Error('Cannot merge an empty fetched observation series');
  }

  const map = new Map();
  for (const row of existingData) {
    assertValidObservation(row, 'Existing processed dataset');
    if (map.has(row.date)) {
      throw new Error(`Existing processed dataset contains duplicate date ${row.date}`);
    }
    map.set(row.date, { date: row.date, nav: row.nav });
  }

  let overlapCount = 0;
  let addedCount = 0;
  for (const row of fetchedData) {
    assertValidObservation(row, 'Fetched AMFI dataset');
    const existing = map.get(row.date);
    if (existing) {
      if (existing.nav !== row.nav) {
        throw new Error(
          `NAV conflict on ${row.date}: existing ${existing.nav}, fetched ${row.nav}. Refusing to overwrite verified history.`
        );
      }
      overlapCount++;
      continue;
    }
    map.set(row.date, { date: row.date, nav: row.nav });
    addedCount++;
  }

  const data = Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  return {
    data,
    stats: summarizeObservations(data),
    overlapCount,
    addedCount,
    existingCount: existingData.length,
  };
}

/**
 * Download genuine NAV history for a scheme from AMFI in 90-day chunks.
 * Any failed or invalid chunk is fatal — partial series are never returned.
 */
export async function downloadSchemeNAVHistory(schemeInfo, startDate = '2023-01-01', endDate = new Date().toISOString().slice(0, 10)) {
  console.log(`\nFetching AMFI NAV History for: ${schemeInfo.schemeName} (Code: ${schemeInfo.schemeCode})`);
  const chunks = splitAMFIDateRangeIntoChunks(startDate, endDate, 90);
  console.log(`Querying ${chunks.length} quarterly chunks (AMFI ~90-day limit compliance)...`);

  const allObservations = [];
  const rawChunks = [];
  const aggregateHash = crypto.createHash('sha256');

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const url = `${AMFI_NAV_ENDPOINT}?mf=${schemeInfo.amcCode}&tp=1&frmdt=${chunk.start}&todt=${chunk.end}`;
    process.stdout.write(`Chunk ${i + 1}/${chunks.length} (${chunk.start} to ${chunk.end})... `);

    let res;
    try {
      res = await fetch(url, { headers: AMFI_HEADERS, signal: AbortSignal.timeout(30000) });
    } catch (err) {
      throw new Error(`AMFI chunk ${chunk.start} to ${chunk.end} request failed for scheme ${schemeInfo.schemeCode}: ${err.message}`);
    }

    if (!res.ok) {
      throw new Error(`AMFI chunk ${chunk.start} to ${chunk.end} returned HTTP ${res.status} for scheme ${schemeInfo.schemeCode}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const rawBuffer = Buffer.from(await res.arrayBuffer());
    const rawText = rawBuffer.toString('utf-8');

    if (/text\/html/i.test(contentType) || /^\s*</.test(rawText)) {
      throw new Error(`AMFI chunk ${chunk.start} to ${chunk.end} returned HTML instead of a NAV report`);
    }

    const parsed = parseAMFIResponse(rawText, schemeInfo.schemeCode);
    if (parsed.length === 0) {
      throw new Error(`AMFI chunk ${chunk.start} to ${chunk.end} returned no NAV rows for scheme ${schemeInfo.schemeCode}`);
    }

    validateSchemeIdentity(parsed, schemeInfo);

    for (const row of parsed) {
      if (row.date < chunk.startDateStr || row.date > chunk.endDateStr) {
        throw new Error(
          `AMFI chunk ${chunk.start} to ${chunk.end} returned ${row.date} outside the requested range for scheme ${schemeInfo.schemeCode}`
        );
      }
    }

    const chunkSha256 = crypto.createHash('sha256').update(rawBuffer).digest('hex');
    aggregateHash.update(rawBuffer);
    rawChunks.push({
      chunk,
      url,
      httpStatus: res.status,
      contentType,
      rawBuffer,
      rawLength: rawBuffer.length,
      sha256: chunkSha256,
    });
    allObservations.push(...parsed);
    console.log(`✓ ${parsed.length} NAV points`);

    // Delay between calls to respect AMFI bandwidth
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  if (rawChunks.length !== chunks.length) {
    throw new Error(`Expected ${chunks.length} AMFI chunks for scheme ${schemeInfo.schemeCode}, received ${rawChunks.length}`);
  }

  return { allObservations, rawChunks, rawSha256: aggregateHash.digest('hex') };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sha256Of(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

function relativeToProject(filePath) {
  return toPosixPath(path.relative(projectRoot, filePath));
}

function chooseUniqueDirectory(parentDir, baseName) {
  let candidate = path.join(parentDir, baseName);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    suffix++;
    candidate = path.join(parentDir, `${baseName}_${suffix}`);
  }
  return candidate;
}

function atomicWriteFileSync(filePath, content) {
  ensureDir(path.dirname(filePath));
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  );
  fs.writeFileSync(tempPath, content, 'utf-8');
  try {
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors; the original error is more useful.
    }
    throw err;
  }
}

/**
 * Persist the exact raw AMFI HTTP response bodies in a new immutable run directory.
 * Existing raw artifacts are never overwritten.
 */
export function saveRawAMFIArtifacts(schemesResults, retrievalDate, requestedRange) {
  const historyRoot = path.join(projectRoot, 'data', 'raw', 'amfi', 'history');
  ensureDir(historyRoot);

  const runStamp = retrievalDate.replace(/[-:.]/g, '').replace('T', 'T');
  const baseName = `nav_history_${runStamp}`;
  const finalDir = chooseUniqueDirectory(historyRoot, baseName);
  const tempDir = path.join(historyRoot, `.tmp_${baseName}_${process.pid}_${Date.now()}`);

  ensureDir(tempDir);
  try {
    const schemeManifests = [];

    for (const scheme of schemesResults) {
      if (!Array.isArray(scheme.rawChunks) || scheme.rawChunks.length === 0) {
        throw new Error(`No raw AMFI chunks available for scheme ${scheme.schemeCode}`);
      }

      const schemeDir = path.join(tempDir, String(scheme.schemeCode));
      ensureDir(schemeDir);

      const aggregateHash = crypto.createHash('sha256');
      const chunkManifests = [];

      for (let i = 0; i < scheme.rawChunks.length; i++) {
        const rawChunk = scheme.rawChunks[i];
        if (!Buffer.isBuffer(rawChunk.rawBuffer)) {
          throw new Error(`Raw AMFI chunk ${i + 1} for scheme ${scheme.schemeCode} is not a Buffer`);
        }

        const fileName = `chunk_${String(i + 1).padStart(2, '0')}_${rawChunk.chunk.startDateStr}_to_${rawChunk.chunk.endDateStr}.txt`;
        const filePath = path.join(schemeDir, fileName);
        fs.writeFileSync(filePath, rawChunk.rawBuffer);

        const writtenBuffer = fs.readFileSync(filePath);
        const writtenSha256 = sha256Of(writtenBuffer);
        if (writtenSha256 !== rawChunk.sha256) {
          throw new Error(`Raw AMFI checksum mismatch after writing ${relativeToProject(filePath)}`);
        }

        aggregateHash.update(writtenBuffer);
        chunkManifests.push({
          index: i + 1,
          requestedStart: rawChunk.chunk.start,
          requestedEnd: rawChunk.chunk.end,
          url: rawChunk.url,
          httpStatus: rawChunk.httpStatus,
          contentType: rawChunk.contentType,
          byteLength: rawChunk.rawLength,
          sha256: writtenSha256,
          file: toPosixPath(path.relative(tempDir, filePath)),
        });
      }

      const aggregateSha256 = aggregateHash.digest('hex');
      if (scheme.rawSha256 && aggregateSha256 !== scheme.rawSha256) {
        throw new Error(`Raw AMFI aggregate checksum mismatch for scheme ${scheme.schemeCode}`);
      }

      schemeManifests.push({
        schemeCode: String(scheme.schemeCode),
        schemeName: scheme.schemeName,
        fundHouse: scheme.fundHouse,
        isin: scheme.expectedIsin || null,
        plan: scheme.expectedPlan || null,
        option: scheme.expectedOption || null,
        rawPayloadSha256: aggregateSha256,
        chunkCount: chunkManifests.length,
        chunks: chunkManifests,
      });
    }

    const manifest = {
      source: 'Association of Mutual Funds in India (AMFI)',
      portal: AMFI_PORTAL_URL,
      endpoint: AMFI_NAV_ENDPOINT,
      retrievalDate,
      requestedRange: {
        startDate: requestedRange?.startDate || null,
        endDate: requestedRange?.endDate || null,
      },
      schemesCount: schemeManifests.length,
      schemes: schemeManifests,
    };

    const manifestPath = path.join(tempDir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
    const manifestSha256 = sha256Of(fs.readFileSync(manifestPath));

    fs.renameSync(tempDir, finalDir);

    return {
      runId: path.basename(finalDir),
      directory: relativeToProject(finalDir),
      manifestPath: relativeToProject(path.join(finalDir, 'manifest.json')),
      manifestSha256,
      schemes: schemeManifests.map((s) => ({
        schemeCode: s.schemeCode,
        rawPayloadSha256: s.rawPayloadSha256,
        chunkCount: s.chunkCount,
      })),
    };
  } catch (err) {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors; the original error is more useful.
    }
    throw err;
  }
}

export function loadExistingAMFIDataset(filePath = path.join(projectRoot, 'data', 'processed', 'amfi_nav.json')) {
  if (!fs.existsSync(filePath)) return new Map();

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) {
    throw new Error(`Refusing to overwrite unreadable processed AMFI dataset ${filePath}: ${err.message}`);
  }
  if (!parsed || !Array.isArray(parsed.schemes)) {
    throw new Error(`Refusing to overwrite processed AMFI dataset with unexpected schema: ${filePath}`);
  }

  const schemes = new Map();
  for (const scheme of parsed.schemes) {
    if (scheme && scheme.schemeCode != null && Array.isArray(scheme.data)) {
      schemes.set(String(scheme.schemeCode), scheme);
    }
  }
  return schemes;
}

export function saveAMFIArtifacts(schemesResults, retrievalDate, rawArtifact) {
  const processedDir = path.join(projectRoot, 'data', 'processed');
  ensureDir(processedDir);

  if (!rawArtifact || !rawArtifact.manifestSha256) {
    throw new Error('Cannot save processed AMFI artifacts without a persisted raw artifact');
  }

  const rawSchemeByCode = new Map(rawArtifact.schemes.map((s) => [String(s.schemeCode), s]));
  const jsonPath = path.join(processedDir, 'amfi_nav.json');
  const processedPayload = {
    provider: 'Association of Mutual Funds in India (AMFI)',
    sourceUrl: AMFI_PORTAL_URL,
    retrievalDate,
    rawSha256: rawArtifact.manifestSha256,
    rawArtifact: {
      directory: rawArtifact.directory,
      manifestPath: rawArtifact.manifestPath,
      manifestSha256: rawArtifact.manifestSha256,
    },
    schemesCount: schemesResults.length,
    schemes: schemesResults.map((s) => {
      const rawScheme = rawSchemeByCode.get(String(s.schemeCode));
      return {
        schemeCode: s.schemeCode,
        schemeName: s.schemeName,
        fundHouse: s.fundHouse,
        category: s.category,
        benchmark: s.benchmark,
        isin: s.expectedIsin || null,
        plan: s.expectedPlan || null,
        option: s.expectedOption || null,
        retrievalDate,
        startDate: s.normalized.stats.startDate,
        endDate: s.normalized.stats.endDate,
        observationCount: s.normalized.data.length,
        startNav: s.normalized.stats.startNav,
        endNav: s.normalized.stats.endNav,
        rawSha256: rawScheme ? rawScheme.rawPayloadSha256 : null,
        rawChunkCount: rawScheme ? rawScheme.chunkCount : 0,
        rawArtifactPath: rawArtifact.directory,
        data: s.normalized.data,
      };
    }),
  };
  atomicWriteFileSync(jsonPath, JSON.stringify(processedPayload, null, 2));

  const csvPath = path.join(processedDir, 'amfi_nav.csv');
  const csvLines = ['Date,NAV,Scheme Code,Scheme Name'];
  for (const scheme of schemesResults) {
    const escapedName = String(scheme.schemeName).replace(/"/g, '""');
    for (const row of scheme.normalized.data) {
      csvLines.push(`${row.date},${row.nav},${scheme.schemeCode},"${escapedName}"`);
    }
  }
  atomicWriteFileSync(csvPath, csvLines.join('\n'));

  const sourcesPath = path.join(projectRoot, 'data', 'sources', 'sources.json');
  if (!fs.existsSync(sourcesPath)) {
    throw new Error(`Sources registry not found at ${sourcesPath}`);
  }

  let sources;
  try {
    sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
  } catch (err) {
    throw new Error(`Cannot update unreadable sources registry: ${err.message}`);
  }
  if (!Array.isArray(sources)) {
    throw new Error('Sources registry must be a JSON array');
  }

  const registrySchemes = schemesResults.map((s) => {
    const rawScheme = rawSchemeByCode.get(String(s.schemeCode));
    return {
      schemeCode: String(s.schemeCode),
      schemeName: s.schemeName,
      fundHouse: s.fundHouse,
      isin: s.expectedIsin || null,
      plan: s.expectedPlan || null,
      option: s.expectedOption || null,
      startDate: s.normalized.stats.startDate,
      endDate: s.normalized.stats.endDate,
      observationCount: s.normalized.data.length,
      retrievalDate,
      rawSha256: rawScheme ? rawScheme.rawPayloadSha256 : null,
      rawChunkCount: rawScheme ? rawScheme.chunkCount : 0,
      rawArtifactPath: rawArtifact.directory,
    };
  });

  const entry = {
    ...(sources.find((s) => s?.id === 'amfi-nav-history') || {
      id: 'amfi-nav-history',
      name: 'AMFI Mutual Fund NAV & Scheme Master',
      provider: 'Association of Mutual Funds in India (AMFI)',
      description: 'Historical Net Asset Value (NAV) data across Indian mutual fund schemes and open-ended index funds.',
      intendedUse: 'Educational fund categorization, SIP compounding demonstration, and category average comparisons.',
      updateFrequency: 'Daily NAV publications',
      licenseOrConstraints: 'Subject to AMFI fair usage policy for non-commercial educational purposes.',
    }),
    status: 'Connected and verified',
    updateFrequency: 'Daily NAV publications',
    retrievalDate,
    checksum: rawArtifact.manifestSha256,
    rawArtifact: {
      directory: rawArtifact.directory,
      manifestPath: rawArtifact.manifestPath,
      manifestSha256: rawArtifact.manifestSha256,
    },
    coveragePeriod: schemesResults
      .map((s) => `${s.schemeCode} ${s.schemeName}: ${s.normalized.stats.startDate} to ${s.normalized.stats.endDate} (${s.normalized.data.length} observations)`)
      .join('; '),
    sourceUrl: AMFI_PORTAL_URL,
    schemes: registrySchemes,
  };

  const sourceIndex = sources.findIndex((s) => s?.id === 'amfi-nav-history');
  if (sourceIndex === -1) {
    sources.push(entry);
  } else {
    sources[sourceIndex] = entry;
  }
  atomicWriteFileSync(sourcesPath, JSON.stringify(sources, null, 2));

  return {
    jsonPath,
    csvPath,
    rawArtifact,
    manifestSha256: rawArtifact.manifestSha256,
  };
}

// ─── Local File Import Fallback ──────────────────────────────────────────────
export function importAMFIFromLocalFile(filePath, schemeCode = '120716') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const rows = parseAMFIResponse(raw, schemeCode);
  if (rows.length === 0) {
    throw new Error(`No valid NAV rows found for scheme ${schemeCode} in ${filePath}`);
  }
  const normalized = validateAndNormalizeNAV(rows);
  return { normalized, rows };
}

// ─── Main CLI ────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const retrievalDate = new Date().toISOString();

  // Local import fallback
  const localIdx = args.indexOf('--local');
  if (localIdx !== -1) {
    const localFile = args[localIdx + 1] || path.join(projectRoot, 'data', 'raw', 'amfi_nav_manual.txt');
    console.log(`Manual import from local AMFI file: ${localFile}`);
    try {
      const { normalized } = importAMFIFromLocalFile(localFile, '120716');
      console.log(`Imported ${normalized.data.length} NAV observations for UTI Nifty 50 Index Fund`);
      return;
    } catch (e) {
      console.error(`Import failed: ${e.message}`);
      process.exit(1);
    }
  }

  const startDate = args[0] || '2023-01-01';
  const endDate = args[1] || new Date().toISOString().slice(0, 10);

  let existingSchemes;
  try {
    existingSchemes = loadExistingAMFIDataset();
  } catch (err) {
    console.error(`\n❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nAMFI historical import range: ${startDate} to ${endDate}`);
  const results = [];

  for (const scheme of TARGET_SCHEMES) {
    try {
      const { allObservations, rawChunks, rawSha256 } = await downloadSchemeNAVHistory(scheme, startDate, endDate);
      const normalized = validateAndNormalizeNAV(allObservations);
      const existing = existingSchemes.get(String(scheme.schemeCode));
      const merged = mergeSchemeObservations(existing?.data || [], normalized.data);

      results.push({
        ...scheme,
        normalized: { data: merged.data, stats: merged.stats },
        rawChunks,
        rawSha256,
        mergeStats: {
          existingCount: merged.existingCount,
          overlapCount: merged.overlapCount,
          addedCount: merged.addedCount,
        },
      });

      console.log(
        `✓ ${scheme.schemeCode}: ${merged.stats.startDate} to ${merged.stats.endDate}, ` +
          `${merged.data.length} observations ` +
          `(${merged.overlapCount} existing overlaps verified, ${merged.addedCount} added)`
      );
    } catch (err) {
      console.error(`\n❌ FATAL: AMFI import failed for ${scheme.schemeCode} (${scheme.schemeName})`);
      console.error(`   ${err.message}`);
      console.error('   No processed dataset or source registry entry was updated.');
      process.exitCode = 1;
      return;
    }
  }

  let rawArtifact;
  let saved;
  try {
    rawArtifact = saveRawAMFIArtifacts(results, retrievalDate, { startDate, endDate });
    saved = saveAMFIArtifacts(results, retrievalDate, rawArtifact);
  } catch (err) {
    console.error(`\n❌ FATAL: AMFI persistence failed: ${err.message}`);
    console.error('   The source registry was not marked as connected.');
    process.exitCode = 1;
    return;
  }

  console.log(`\n✅ AMFI Mutual Fund NAV ingestion completed.`);
  console.log(`Raw artifact: ${rawArtifact.directory}`);
  console.log(`Raw manifest SHA-256: ${rawArtifact.manifestSha256}`);
  for (const result of results) {
    console.log(
      `  ${result.schemeCode}: ${result.normalized.data.length} observations, ` +
        `${result.normalized.stats.startDate} to ${result.normalized.stats.endDate}, ` +
        `raw SHA-256 ${result.rawSha256}`
    );
  }
  console.log(`Processed JSON: ${saved.jsonPath}`);
  console.log(`Processed CSV: ${saved.csvPath}`);
}

// Only execute CLI when invoked directly
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`\n❌ Unexpected AMFI import failure: ${err.message}`);
    process.exit(1);
  });
}
