import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ─── Configuration ───────────────────────────────────────────────────────────
export const NIFTY_TRI_ENDPOINT = 'https://www.niftyindices.com/BackPage/getTotalReturnIndexString';
export const NIFTY_OFFICIAL_PORTAL = 'https://www.niftyindices.com/reports/historical-data';

export const NSE_HEADERS = {
  'Content-Type': 'application/json; charset=UTF-8',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': NIFTY_OFFICIAL_PORTAL,
  'Origin': 'https://www.niftyindices.com',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
};

// ─── Date Helpers ────────────────────────────────────────────────────────────
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Format a Date or 'YYYY-MM-DD' string to NSE's expected 'dd-MMM-yyyy'
 */
export function formatNSEDate(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided to formatNSEDate: ${date}`);
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Parse NSE date formats into ISO 8601 'YYYY-MM-DD'
 * Supported inputs: '24 Oct 2024', '24-Oct-2024', '24/10/2024', '2024-10-24'
 */
export function parseNSEDate(str) {
  if (!str || typeof str !== 'string') return null;
  const trimmed = str.trim();

  // Already ISO 'YYYY-MM-DD'
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, d] = trimmed.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return trimmed;
    return null;
  }

  // '24 Oct 2024' or '24-Oct-2024'
  const textParts = trimmed.replace(/-/g, ' ').split(/\s+/);
  if (textParts.length === 3) {
    const day = textParts[0].padStart(2, '0');
    const monIdx = MONTH_NAMES.findIndex((m) => m.toLowerCase() === textParts[1].toLowerCase());
    const year = textParts[2];
    if (monIdx !== -1 && /^\d{4}$/.test(year) && !isNaN(Number(day))) {
      const month = String(monIdx + 1).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Fallback 'DD/MM/YYYY'
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
    const [d, m, y] = trimmed.split('/');
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Split an arbitrary date range into <= 365 day chunks because the
 * official NSE Indices server enforces a 1-year max per query.
 */
export function splitDateRangeIntoChunks(startDateStr, endDateStr, maxDays = 365) {
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
      start: formatNSEDate(currentStart),
      end: formatNSEDate(effectiveEnd),
      startDateStr: currentStart.toISOString().slice(0, 10),
      endDateStr: effectiveEnd.toISOString().slice(0, 10),
    });

    currentStart = new Date(effectiveEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return chunks;
}

// ─── Parsing & Normalization ────────────────────────────────────────────────

/**
 * Parse raw response into structured observation rows.
 * Supports:
 *   1. JSON array directly from /BackPage/getTotalReturnIndexString
 *   2. ASP.NET wrapper {"d": "..."}
 *   3. CSV formatted text (from manual export or file)
 *   4. HTML table format
 */
export function parseNiftyResponse(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];
  let trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. Try direct JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      let parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed.d === 'string') {
        try {
          parsed = JSON.parse(parsed.d);
        } catch {
          trimmed = parsed.d;
        }
      }

      if (Array.isArray(parsed)) {
        const rows = [];
        for (const item of parsed) {
          const rawDate = item.Date || item.date;
          const rawTri = item.TotalReturnsIndex ?? item.tri ?? item['Total Returns Index'];
          const rawNtr = item.NTR_Value ?? item.ntr ?? item['Net Total Return Index'];

          const date = parseNSEDate(rawDate);
          const tri = typeof rawTri === 'number' ? rawTri : parseFloat(String(rawTri || '').replace(/,/g, ''));
          const ntr = rawNtr != null ? (typeof rawNtr === 'number' ? rawNtr : parseFloat(String(rawNtr).replace(/,/g, ''))) : undefined;

          if (date && !isNaN(tri) && tri > 0) {
            const entry = { date, tri };
            if (ntr != null && !isNaN(ntr)) entry.ntr = ntr;
            rows.push(entry);
          }
        }
        if (rows.length > 0) return rows;
      }
    } catch {
      // Not JSON, continue to other parsers
    }
  }

  // 2. Try CSV extraction
  const csvRows = extractFromCSV(trimmed);
  if (csvRows.length > 0) return csvRows;

  // 3. Try HTML table extraction
  const htmlRows = extractFromHTML(trimmed);
  if (htmlRows.length > 0) return htmlRows;

  return [];
}

function extractFromCSV(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headerIdx = lines.findIndex((l) => {
    const low = l.toLowerCase();
    return low.includes('date') && (low.includes('total returns') || low.includes('tri') || low.includes('totalreturnsindex'));
  });
  if (headerIdx === -1) return [];

  const header = splitCSVLine(lines[headerIdx]).map((h) => h.toLowerCase());
  const dateCol = header.findIndex((h) => h.includes('date'));
  const triCol = header.findIndex((h) => h.includes('total returns') || h.includes('tri') || h.includes('totalreturnsindex'));
  const ntrCol = header.findIndex((h) => h.includes('net total') || h.includes('ntr'));

  if (dateCol === -1 || triCol === -1) return [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    if (cols.length <= Math.max(dateCol, triCol)) continue;

    const date = parseNSEDate(cols[dateCol]);
    const tri = parseFloat(cols[triCol].replace(/,/g, ''));
    if (date && !isNaN(tri) && tri > 0) {
      const entry = { date, tri };
      if (ntrCol !== -1 && cols[ntrCol]) {
        const ntr = parseFloat(cols[ntrCol].replace(/,/g, ''));
        if (!isNaN(ntr)) entry.ntr = ntr;
      }
      rows.push(entry);
    }
  }
  return rows;
}

function splitCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(cur.trim().replace(/^["']|["']$/g, ''));
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur.trim().replace(/^["']|["']$/g, ''));
  return result;
}

function extractFromHTML(html) {
  const rows = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch;
  while ((trMatch = trRegex.exec(html)) !== null) {
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    const cells = [];
    let tdMatch;
    while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
      cells.push(tdMatch[1].replace(/<[^>]*>/g, '').trim());
    }
    if (cells.length >= 2) {
      const date = parseNSEDate(cells[0]);
      const tri = parseFloat(cells[1].replace(/,/g, ''));
      if (date && !isNaN(tri) && tri > 0) {
        const entry = { date, tri };
        if (cells.length >= 3) {
          const ntr = parseFloat(cells[2].replace(/,/g, ''));
          if (!isNaN(ntr)) entry.ntr = ntr;
        }
        rows.push(entry);
      }
    }
  }
  return rows;
}

// ─── Normalization & Validation ─────────────────────────────────────────────

/**
 * Validates, deduplicates, and sorts raw observations.
 * Explicitly preserves authentic trading days without interpolating missing dates.
 */
export function validateAndNormalizeObservations(rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw new Error('Cannot normalize empty observation dataset');
  }

  const dateMap = new Map();
  let duplicatesCount = 0;
  let invalidCount = 0;

  for (const row of rawRows) {
    if (!row || typeof row.date !== 'string' || typeof row.tri !== 'number') {
      invalidCount++;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date) || isNaN(row.tri) || row.tri <= 0) {
      invalidCount++;
      continue;
    }

    if (dateMap.has(row.date)) {
      duplicatesCount++;
      // Keep observation with valid numbers
      continue;
    }

    const clean = {
      date: row.date,
      tri: Math.round(row.tri * 100) / 100,
    };
    if (typeof row.ntr === 'number' && !isNaN(row.ntr) && row.ntr > 0) {
      clean.ntr = Math.round(row.ntr * 100) / 100;
    }
    dateMap.set(row.date, clean);
  }

  const sorted = Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  if (sorted.length === 0) {
    throw new Error('All observations failed validation criteria');
  }

  return {
    data: sorted,
    stats: {
      totalInput: rawRows.length,
      validUnique: sorted.length,
      duplicatesRemoved: duplicatesCount,
      invalidSkipped: invalidCount,
      startDate: sorted[0].date,
      endDate: sorted[sorted.length - 1].date,
      startValue: sorted[0].tri,
      endValue: sorted[sorted.length - 1].tri,
    },
  };
}

// ─── Download from Official NSE Indices ──────────────────────────────────────

export async function fetchNiftyChunk(startDateNSE, endDateNSE, retries = 3) {
  const payload = {
    cinfo: JSON.stringify({
      name: 'NIFTY 50',
      startDate: startDateNSE,
      endDate: endDateNSE,
      indexName: 'NIFTY 50',
    }),
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(NIFTY_TRI_ENDPOINT, {
        method: 'POST',
        headers: NSE_HEADERS,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const text = await res.text();
      const rows = parseNiftyResponse(text);
      if (rows.length === 0) {
        throw new Error(`Endpoint returned empty/non-parseable data for chunk ${startDateNSE} to ${endDateNSE}`);
      }

      return { raw: text, rows };
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`Chunk fetch attempt ${attempt} failed: ${err.message}. Retrying in 1s...`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export async function downloadNiftyTRIHistory(startDate = '2010-01-01', endDate = new Date().toISOString().slice(0, 10)) {
  console.log(`\n==================================================`);
  console.log(`Ingesting Nifty 50 TRI Genuine Historical Data`);
  console.log(`Source: ${NIFTY_OFFICIAL_PORTAL}`);
  console.log(`Requested Range: ${startDate} to ${endDate}`);
  console.log(`==================================================\n`);

  const chunks = splitDateRangeIntoChunks(startDate, endDate, 365);
  console.log(`Divided requested span into ${chunks.length} annual chunks (NSE 365-day limit compliance).`);

  const allRows = [];
  const rawChunks = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`Fetching chunk ${i + 1}/${chunks.length} (${chunk.start} to ${chunk.end})... `);
    const { raw, rows } = await fetchNiftyChunk(chunk.start, chunk.end);
    rawChunks.push({ chunk, rawLength: raw.length, recordCount: rows.length, rawData: JSON.parse(raw) });
    allRows.push(...rows);
    console.log(`✓ ${rows.length} records`);
    // Modest delay between calls to observe polite rate limits
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return { allRows, rawChunks };
}

// ─── Persistence & Provenance ───────────────────────────────────────────────

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveRawArtifact(rawChunks, dateStamp) {
  const rawDir = path.join(projectRoot, 'data', 'raw');
  ensureDirectory(rawDir);

  const rawFileName = `nifty_50_tri_raw_${dateStamp}.json`;
  const rawPath = path.join(rawDir, rawFileName);
  const rawPayload = JSON.stringify(
    {
      source: 'NSE Indices Limited',
      portal: NIFTY_OFFICIAL_PORTAL,
      endpoint: NIFTY_TRI_ENDPOINT,
      downloadTimestamp: new Date().toISOString(),
      chunks: rawChunks,
    },
    null,
    2
  );

  fs.writeFileSync(rawPath, rawPayload, 'utf-8');

  const sha256 = crypto.createHash('sha256').update(rawPayload).digest('hex');
  console.log(`\nRaw immutable source preserved: ${rawPath}`);
  console.log(`SHA-256 Checksum: ${sha256}`);

  return { rawPath, sha256 };
}

export function saveProcessedDataset(normalizedResult, sha256Checksum, retrievalDate) {
  const processedDir = path.join(projectRoot, 'data', 'processed');
  ensureDirectory(processedDir);

  const { data, stats } = normalizedResult;

  // 1. Processed JSON artifact with full provenance
  const jsonPath = path.join(processedDir, 'nifty_tri.json');
  const jsonContent = {
    source: 'Nifty 50 Total Returns Index (TRI)',
    provider: 'NSE Indices Limited',
    sourceUrl: NIFTY_OFFICIAL_PORTAL,
    lastUpdated: retrievalDate || new Date().toISOString(),
    retrievalDate: retrievalDate || new Date().toISOString(),
    count: data.length,
    rawSha256: sha256Checksum,
    units: 'Index Points (gross dividend reinvested)',
    coverage: {
      startDate: stats.startDate,
      endDate: stats.endDate,
      tradingDays: stats.validUnique,
      startValue: stats.startValue,
      endValue: stats.endValue,
    },
    stats: {
      duplicatesRemoved: stats.duplicatesRemoved,
      invalidSkipped: stats.invalidSkipped,
    },
    data,
  };

  fs.writeFileSync(jsonPath, JSON.stringify(jsonContent, null, 2), 'utf-8');
  console.log(`Processed JSON saved: ${jsonPath} (${data.length} trading sessions)`);

  // 2. Processed CSV artifact (standard 2-column format: Date, Total Returns Index)
  const csvPath = path.join(processedDir, 'nifty_tri.csv');
  const csvLines = ['Date,Total Returns Index'];
  for (const row of data) {
    csvLines.push(`${row.date},${row.tri}`);
  }
  fs.writeFileSync(csvPath, csvLines.join('\n'), 'utf-8');
  console.log(`Processed CSV saved: ${csvPath}`);

  return { jsonPath, csvPath, jsonContent };
}

export function updateSourcesRegistry(stats, sha256, retrievalDate) {
  const sourcesPath = path.join(projectRoot, 'data', 'sources', 'sources.json');
  if (!fs.existsSync(sourcesPath)) return;

  try {
    const raw = fs.readFileSync(sourcesPath, 'utf-8');
    const sources = JSON.parse(raw);
    const index = sources.findIndex((s) => s.id === 'nifty-50-tri');
    if (index !== -1) {
      sources[index] = {
        ...sources[index],
        status: 'Connected and verified',
        coveragePeriod: `${stats.startDate} to ${stats.endDate} (${stats.validUnique.toLocaleString('en-IN')} trading sessions)`,
        retrievalDate: retrievalDate || new Date().toISOString(),
        checksum: sha256,
        units: 'Index Points',
        sourceUrl: NIFTY_OFFICIAL_PORTAL,
      };
      fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2), 'utf-8');
      console.log(`Updated sources metadata registry: data/sources/sources.json`);
    }
  } catch (err) {
    console.warn(`Could not update sources registry: ${err.message}`);
  }
}

// ─── Local File Import (Manual Fallback) ─────────────────────────────────────

export function importFromLocalCSV(csvFilePath) {
  if (!fs.existsSync(csvFilePath)) {
    throw new Error(`File not found: ${csvFilePath}`);
  }
  const raw = fs.readFileSync(csvFilePath, 'utf-8');
  const rows = parseNiftyResponse(raw);
  if (rows.length === 0) {
    throw new Error('No valid TRI data rows found in the CSV file');
  }
  return rows;
}

export function importFromLocalFile(filePath) {
  const rows = importFromLocalCSV(filePath);
  const raw = fs.readFileSync(filePath, 'utf-8');
  const sha256 = crypto.createHash('sha256').update(raw).digest('hex');
  const normalized = validateAndNormalizeObservations(rows);
  const retrievalDate = new Date().toISOString();

  const { jsonPath, csvPath } = saveProcessedDataset(normalized, sha256, retrievalDate);
  updateSourcesRegistry(normalized.stats, sha256, retrievalDate);

  return { normalized, jsonPath, csvPath, sha256 };
}

// ─── Main CLI Orchestrator ──────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dateStamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Local import fallback flag
  const localIdx = args.indexOf('--local');
  if (localIdx !== -1) {
    const localPath = args[localIdx + 1] || path.join(projectRoot, 'data', 'raw', 'nifty_tri_manual.csv');
    console.log(`Executing manual import from local file: ${localPath}`);
    try {
      const result = importFromLocalFile(localPath);
      console.log(`\n✅ Successfully imported and verified ${result.normalized.data.length} observations!`);
      return;
    } catch (err) {
      console.error(`\n❌ Manual import failed: ${err.message}`);
      process.exit(1);
    }
  }

  // Parse date arguments or default to 2010 to current
  let startDate = '2010-01-01';
  let endDate = new Date().toISOString().slice(0, 10);

  const startArgIdx = args.indexOf('--start');
  if (startArgIdx !== -1 && args[startArgIdx + 1]) {
    startDate = args[startArgIdx + 1];
  } else if (args[0] && !args[0].startsWith('-')) {
    startDate = args[0];
  }

  const endArgIdx = args.indexOf('--end');
  if (endArgIdx !== -1 && args[endArgIdx + 1]) {
    endDate = args[endArgIdx + 1];
  } else if (args[1] && !args[1].startsWith('-')) {
    endDate = args[1];
  }

  try {
    const { allRows, rawChunks } = await downloadNiftyTRIHistory(startDate, endDate);
    const retrievalDate = new Date().toISOString();

    const { rawPath, sha256 } = saveRawArtifact(rawChunks, dateStamp);
    const normalized = validateAndNormalizeObservations(allRows);

    saveProcessedDataset(normalized, sha256, retrievalDate);
    updateSourcesRegistry(normalized.stats, sha256, retrievalDate);

    console.log(`\n==================================================`);
    console.log(`✅ Pipeline Execution Complete`);
    console.log(`Total Genuine Observations : ${normalized.data.length}`);
    console.log(`Date Range                  : ${normalized.stats.startDate} to ${normalized.stats.endDate}`);
    console.log(`Starting TRI Level          : ${normalized.stats.startValue}`);
    console.log(`Latest TRI Level            : ${normalized.stats.endValue}`);
    console.log(`Raw Artifact Checksum (SHA) : ${sha256}`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error(`\n❌ Ingestion failed: ${err.message}`);
    console.error(`\nMANUAL FALLBACK WORKFLOW:`);
    console.error(`  1. Open ${NIFTY_OFFICIAL_PORTAL}`);
    console.error(`  2. Select "Total returns Index Values" -> "NIFTY 50"`);
    console.error(`  3. Select your date range and click CSV download`);
    console.error(`  4. Save the file to: data/raw/nifty_tri_manual.csv`);
    console.error(`  5. Run: node scripts/importNifty.js --local\n`);
    process.exit(1);
  }
}

// Only execute CLI if run directly, not when imported as a library/test
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
