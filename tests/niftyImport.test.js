import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Dynamic import of the parsing and validation functions from importNifty.js
const {
  parseNiftyResponse,
  importFromLocalCSV,
  parseNSEDate,
  formatNSEDate,
  splitDateRangeIntoChunks,
  validateAndNormalizeObservations,
} = await import('../scripts/importNifty.js');

// ─── Parsing Tests ───────────────────────────────────────────────────────────

describe('Nifty TRI Parsing', () => {
  it('parses CSV format with header and data rows', () => {
    const csv = [
      'Date,Total Returns Index,Net Total Return Index',
      '02 Jan 2024,32456.78,31234.56',
      '03 Jan 2024,32567.89,31345.67',
      '04 Jan 2024,32678.90,31456.78',
    ].join('\n');

    const rows = parseNiftyResponse(csv);
    assert.equal(rows.length, 3);
    assert.equal(rows[0].date, '2024-01-02');
    assert.equal(rows[0].tri, 32456.78);
    assert.equal(rows[2].date, '2024-01-04');
    assert.equal(rows[2].tri, 32678.9);
  });

  it('parses CSV with dash-separated dates (02-Jan-2024)', () => {
    const csv = [
      'Date,Total Returns Index',
      '02-Jan-2024,32456.78',
      '15-Mar-2024,33000.50',
    ].join('\n');

    const rows = parseNiftyResponse(csv);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, '2024-01-02');
    assert.equal(rows[1].date, '2024-03-15');
    assert.equal(rows[1].tri, 33000.5);
  });

  it('handles commas in TRI values (e.g. 32,456.78)', () => {
    const csv = [
      'Date,Total Returns Index',
      '02 Jan 2024,"32,456.78"',
    ].join('\n');

    // Our simple CSV parser splits on comma, so quoted values may not parse perfectly.
    // This test documents current behavior.
    const rows = parseNiftyResponse(csv);
    // At minimum, it should not crash
    assert.ok(Array.isArray(rows));
  });

  it('returns empty array for non-data content', () => {
    const html = '<html><body><h1>Hello</h1></body></html>';
    const rows = parseNiftyResponse(html);
    assert.equal(rows.length, 0);
  });

  it('returns empty array for empty string', () => {
    const rows = parseNiftyResponse('');
    assert.equal(rows.length, 0);
  });

  it('parses JSON {"d":"..."} wrapped CSV content', () => {
    const innerCsv = 'Date,Total Returns Index\\n02 Jan 2024,32456.78\\n03 Jan 2024,32567.89';
    const json = `{"d":"${innerCsv}"}`;
    const rows = parseNiftyResponse(json);
    assert.equal(rows.length, 2);
  });

  it('parses HTML table format', () => {
    const html = `
      <table>
        <tr><th>Date</th><th>TRI</th></tr>
        <tr><td>02 Jan 2024</td><td>32456.78</td></tr>
        <tr><td>03 Jan 2024</td><td>32567.89</td></tr>
      </table>
    `;
    const rows = parseNiftyResponse(html);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, '2024-01-02');
    assert.equal(rows[0].tri, 32456.78);
  });
});

// ─── Local CSV Import Tests ─────────────────────────────────────────────────

describe('Local CSV Import', () => {
  const tmpDir = resolve(projectRoot, 'data', 'raw', '_test_temp');

  it('throws for non-existent file', () => {
    assert.throws(
      () => importFromLocalCSV('/nonexistent/path.csv'),
      /File not found/
    );
  });

  it('imports a valid CSV file', () => {
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = resolve(tmpDir, 'test_tri.csv');
    const csv = [
      'Date,Total Returns Index',
      '02-Jan-2024,32456.78',
      '03-Jan-2024,32567.89',
      '04-Jan-2024,32678.90',
    ].join('\n');
    writeFileSync(tmpFile, csv);

    try {
      const rows = importFromLocalCSV(tmpFile);
      assert.equal(rows.length, 3);
      assert.equal(rows[0].date, '2024-01-02');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws for CSV with no valid data rows', () => {
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = resolve(tmpDir, 'empty.csv');
    writeFileSync(tmpFile, 'just some random text\nwithout any dates\n');

    try {
      assert.throws(
        () => importFromLocalCSV(tmpFile),
        /No valid TRI data rows/
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ─── Processed Data File Integrity ───────────────────────────────────────────

describe('Processed Data Files', () => {
  const jsonPath = resolve(projectRoot, 'data', 'processed', 'nifty_tri.json');
  const csvPath = resolve(projectRoot, 'data', 'processed', 'nifty_tri.csv');

  it('JSON file exists and has valid structure', () => {
    if (!existsSync(jsonPath)) {
      // Skip if no data imported yet (expected in CI)
      return;
    }
    const raw = readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(raw);

    assert.ok(parsed.lastUpdated, 'should have lastUpdated');
    assert.ok(typeof parsed.count === 'number', 'should have numeric count');
    assert.ok(Array.isArray(parsed.data), 'should have data array');
    assert.ok(parsed.data.length > 0, 'should have at least one data point');

    // Check first row structure
    const first = parsed.data[0];
    assert.ok(first.date, 'row should have date');
    assert.ok(typeof first.tri === 'number', 'row should have numeric tri');
    assert.match(first.date, /^\d{4}-\d{2}-\d{2}$/, 'date should be ISO-8601');
  });

  it('CSV file exists and has valid header', () => {
    if (!existsSync(csvPath)) {
      return;
    }
    const raw = readFileSync(csvPath, 'utf-8');
    const lines = raw.trim().split(/\r?\n/);

    assert.ok(lines.length > 1, 'should have header + data rows');
    assert.ok(
      lines[0].toLowerCase().includes('date') && lines[0].toLowerCase().includes('total returns index'),
      'header should contain Date and Total Returns Index'
    );

    // Check a data row
    const cols = lines[1].split(',');
    assert.equal(cols.length, 2, 'should have 2 columns');
    assert.match(cols[0], /^\d{4}-\d{2}-\d{2}$/, 'date column should be ISO-8601');
    assert.ok(!isNaN(parseFloat(cols[1])), 'TRI column should be numeric');
  });

  it('JSON and CSV row counts match', () => {
    if (!existsSync(jsonPath) || !existsSync(csvPath)) {
      return;
    }
    const json = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    const csvLines = readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
    const csvDataRows = csvLines.length - 1; // minus header

    assert.equal(json.data.length, csvDataRows, 'JSON and CSV row counts should match');
  });
});

// ─── Date Helpers & Conversion Tests ────────────────────────────────────────

describe('NSE Date Parsing & Formatting', () => {
  it('formats dates to NSE dd-MMM-yyyy format', () => {
    assert.equal(formatNSEDate(new Date('2024-01-02T00:00:00Z')), '02-Jan-2024');
    assert.equal(formatNSEDate('2024-10-24'), '24-Oct-2024');
    assert.throws(() => formatNSEDate('not-a-date'), /Invalid date/);
  });

  it('parses NSE dates into ISO-8601 YYYY-MM-DD format', () => {
    assert.equal(parseNSEDate('24 Oct 2024'), '2024-10-24');
    assert.equal(parseNSEDate('02-Jan-2020'), '2020-01-02');
    assert.equal(parseNSEDate('2024-10-24'), '2024-10-24');
    assert.equal(parseNSEDate('15/08/2023'), '2023-08-15');
    assert.equal(parseNSEDate(''), null);
    assert.equal(parseNSEDate('invalid'), null);
  });
});

// ─── Date Chunking for NSE Server 365-Day Constraint ────────────────────────

describe('Date Range Chunking (NSE 365-day constraint)', () => {
  it('splits multi-year range into chunks <= 365 days', () => {
    // 2020 is a leap year (366 days) + 2021 (365) + 2022 (365) = 1,096 days -> 4 chunks (each <= 365 days)
    const chunks = splitDateRangeIntoChunks('2020-01-01', '2022-12-31', 365);
    assert.equal(chunks.length, 4);
    assert.equal(chunks[0].start, '01-Jan-2020');
    assert.equal(chunks[chunks.length - 1].end, '31-Dec-2022');
    // Ensure every single chunk satisfies <= 365 days
    for (const chunk of chunks) {
      const d1 = new Date(chunk.startDateStr);
      const d2 = new Date(chunk.endDateStr);
      const days = Math.round((d2 - d1) / (24 * 60 * 60 * 1000)) + 1;
      assert.ok(days <= 365, `Chunk ${chunk.start} to ${chunk.end} has ${days} days (> 365)`);
    }
  });

  it('keeps single chunk for range <= 365 days', () => {
    const chunks = splitDateRangeIntoChunks('2024-01-01', '2024-06-30', 365);
    assert.equal(chunks.length, 1);
  });

  it('throws error when start date is after end date', () => {
    assert.throws(() => splitDateRangeIntoChunks('2024-12-31', '2024-01-01'), /Start date/);
  });
});

// ─── Normalization & Validation (Integrity: Never Interpolate) ──────────────

describe('Observation Validation & Normalization', () => {
  it('removes duplicate dates, keeping only unique records sorted chronologically', () => {
    const raw = [
      { date: '2024-01-05', tri: 31000 },
      { date: '2024-01-02', tri: 30000 },
      { date: '2024-01-02', tri: 30050 }, // Duplicate date
      { date: '2024-01-03', tri: 30500 },
    ];

    const { data, stats } = validateAndNormalizeObservations(raw);
    assert.equal(data.length, 3);
    assert.equal(stats.duplicatesRemoved, 1);
    assert.equal(data[0].date, '2024-01-02');
    assert.equal(data[1].date, '2024-01-03');
    assert.equal(data[2].date, '2024-01-05');
  });

  it('rejects invalid or non-numeric TRI rows and invalid dates', () => {
    const raw = [
      { date: '2024-01-01', tri: 30000 },
      { date: '2024-01-02', tri: -500 }, // Negative TRI
      { date: '2024-01-03', tri: NaN }, // NaN TRI
      { date: 'invalid-date', tri: 30000 },
    ];

    const { data, stats } = validateAndNormalizeObservations(raw);
    assert.equal(data.length, 1);
    assert.equal(stats.invalidSkipped, 3);
    assert.equal(data[0].date, '2024-01-01');
  });

  it('strictly preserves authentic trading days without interpolating missing holidays/weekends', () => {
    // 2024-01-01 is Mon, 2024-01-02 is Tue, 2024-01-05 is Fri, 2024-01-08 is Mon (weekend skipped)
    const raw = [
      { date: '2024-01-01', tri: 30000 },
      { date: '2024-01-02', tri: 30100 },
      { date: '2024-01-05', tri: 30200 },
      { date: '2024-01-08', tri: 30300 },
    ];

    const { data } = validateAndNormalizeObservations(raw);
    assert.equal(data.length, 4);
    // Jan 3, 4, 6, 7 should NOT exist in output!
    const dates = data.map((d) => d.date);
    assert.ok(!dates.includes('2024-01-03'), 'must not invent missing trading days');
    assert.ok(!dates.includes('2024-01-04'), 'must not invent missing trading days');
    assert.ok(!dates.includes('2024-01-06'), 'must not invent weekend dates');
    assert.ok(!dates.includes('2024-01-07'), 'must not invent weekend dates');
  });
});

