import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

const {
  parseAMFIResponse,
  validateAndNormalizeNAV,
  parseAMFIDate,
  formatAMFIDate,
  splitAMFIDateRangeIntoChunks,
  importAMFIFromLocalFile,
  validateSchemeIdentity,
  mergeSchemeObservations,
  downloadSchemeNAVHistory,
} = await import('../scripts/importAMFI.js');

const UTI_SCHEME = {
  schemeCode: '120716',
  schemeName: 'UTI Nifty 50 Index Fund - Growth Option- Direct',
  fundHouse: 'UTI Mutual Fund',
  expectedIsin: 'INF789F01XA0',
  expectedPlan: 'Direct',
  expectedOption: 'Growth',
};

const HDFC_SCHEME = {
  schemeCode: '119063',
  schemeName: 'HDFC Nifty 50 Index Fund - Direct Plan - Growth Option',
  fundHouse: 'HDFC Mutual Fund',
  expectedIsin: 'INF179K01WM1',
  expectedPlan: 'Direct',
  expectedOption: 'Growth',
};

function observation(overrides = {}) {
  return {
    schemeCode: '120716',
    schemeName: 'UTI Nifty 50 Index Fund - Growth Option- Direct',
    plan: 'Direct Plan',
    option: 'Growth',
    isin: 'INF789F01XA0',
    date: '2024-01-01',
    nav: 148.9515,
    ...overrides,
  };
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

describe('AMFI NAV Date Helpers', () => {
  it('formats dates into AMFI dd-MMM-yyyy format', () => {
    assert.equal(formatAMFIDate('2024-01-01'), '01-Jan-2024');
    assert.equal(formatAMFIDate(new Date('2024-03-15T00:00:00Z')), '15-Mar-2024');
  });

  it('parses AMFI dates into ISO-8601 format', () => {
    assert.equal(parseAMFIDate('01-Jan-2024'), '2024-01-01');
    assert.equal(parseAMFIDate('15 Mar 2024'), '2024-03-15');
    assert.equal(parseAMFIDate('2024-05-20'), '2024-05-20');
    assert.equal(parseAMFIDate('invalid'), null);
  });
});

describe('AMFI 90-Day Chunking', () => {
  it('splits multi-month ranges into chunks <= 90 days', () => {
    const chunks = splitAMFIDateRangeIntoChunks('2024-01-01', '2024-12-31', 90);
    assert.ok(chunks.length >= 4);
    for (const c of chunks) {
      const d1 = new Date(c.startDateStr);
      const d2 = new Date(c.endDateStr);
      const days = Math.round((d2 - d1) / (24 * 60 * 60 * 1000)) + 1;
      assert.ok(days <= 90, `Chunk ${c.start} to ${c.end} has ${days} days (> 90)`);
    }
  });
});

describe('AMFI Semicolon-Delimited Text Parsing', () => {
  it('extracts target scheme observations and strictly excludes other schemes', () => {
    const raw = [
      'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date',
      'Open Ended Schemes ( Equity Scheme - Large Cap Fund )',
      'UTI Mutual Fund',
      '120656;UTI Large Cap Fund - Direct Plan - Growth Option;Direct Plan;Growth;INF789F01US8;;254.0071;01-Jan-2024',
      '120716;UTI Nifty 50 Index Fund - Growth Option- Direct;Direct Plan;Growth;INF789F01XA0;;148.9515;01-Jan-2024',
      '120716;UTI Nifty 50 Index Fund - Growth Option- Direct;Direct Plan;Growth;INF789F01XA0;;148.4292;02-Jan-2024',
      '118778;Nippon India Small Cap Fund - Direct Plan - Growth;Direct Plan;Growth;INF204K01W82;;142.1123;01-Jan-2024',
    ].join('\n');

    const rows = parseAMFIResponse(raw, '120716');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].schemeCode, '120716');
    assert.equal(rows[0].date, '2024-01-01');
    assert.equal(rows[0].nav, 148.9515);
    assert.equal(rows[1].date, '2024-01-02');
    assert.equal(rows[1].nav, 148.4292);

    // Ensure schemes are never mixed
    const otherRows = parseAMFIResponse(raw, '120656');
    assert.equal(otherRows.length, 1);
    assert.equal(otherRows[0].schemeCode, '120656');
  });

  it('handles empty input gracefully', () => {
    assert.deepEqual(parseAMFIResponse('', '120716'), []);
    assert.deepEqual(parseAMFIResponse(null, '120716'), []);
  });
});

describe('AMFI NAV Validation & Normalization', () => {
  it('removes duplicate dates and sorts chronologically', () => {
    const rows = [
      { date: '2024-01-03', nav: 150.2 },
      { date: '2024-01-01', nav: 148.5 },
      { date: '2024-01-01', nav: 148.9 }, // duplicate date
    ];
    const { data, stats } = validateAndNormalizeNAV(rows);
    assert.equal(data.length, 2);
    assert.equal(stats.duplicatesRemoved, 1);
    assert.equal(data[0].date, '2024-01-01');
    assert.equal(data[1].date, '2024-01-03');
  });

  it('strictly preserves authentic trading days without interpolating missing dates', () => {
    const rows = [
      { date: '2024-01-01', nav: 148.5 },
      { date: '2024-01-05', nav: 149.2 },
    ];
    const { data } = validateAndNormalizeNAV(rows);
    assert.equal(data.length, 2);
    const dates = data.map((d) => d.date);
    assert.ok(!dates.includes('2024-01-02'), 'must not invent missing trading days');
    assert.ok(!dates.includes('2024-01-03'), 'must not invent missing trading days');
    assert.ok(!dates.includes('2024-01-04'), 'must not invent missing trading days');
  });
});

describe('AMFI Scheme Identity Validation', () => {
  it('accepts verified UTI and HDFC Direct/Growth observations', () => {
    assert.equal(validateSchemeIdentity([observation()], UTI_SCHEME), true);
    assert.equal(
      validateSchemeIdentity(
        [
          observation({
            schemeCode: '119063',
            schemeName: 'HDFC Nifty 50 Index Fund - Direct Plan',
            isin: 'INF179K01WM1',
            option: 'Growth Option',
            nav: 207.3522,
          }),
        ],
        HDFC_SCHEME
      ),
      true
    );
  });

  it('rejects an unexpected ISIN', () => {
    assert.throws(
      () => validateSchemeIdentity([observation({ isin: 'INF000000000' })], UTI_SCHEME),
      /expected ISIN INF789F01XA0/
    );
  });

  it('rejects a non-Direct plan', () => {
    assert.throws(
      () => validateSchemeIdentity([observation({ plan: 'Regular Plan' })], UTI_SCHEME),
      /expected Direct plan/
    );
  });

  it('rejects IDCW or non-Growth options', () => {
    assert.throws(
      () => validateSchemeIdentity([observation({ option: 'IDCW' })], UTI_SCHEME),
      /expected Growth option/
    );
  });

  it('rejects an unrelated scheme name or fund house', () => {
    assert.throws(
      () =>
        validateSchemeIdentity(
          [observation({ schemeName: 'SBI Large Cap Fund - Direct Plan - Growth' })],
          UTI_SCHEME
        ),
      /unexpected scheme name/
    );
  });

  it('rejects an empty observation set', () => {
    assert.throws(() => validateSchemeIdentity([], UTI_SCHEME), /No observations/);
  });
});

describe('AMFI Fatal Chunk Handling', () => {
  it('rejects a chunk with no target-scheme rows instead of returning partial data', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        'Scheme Code;NAV Name;Plan;Option;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Date\n' +
          '999999;Unrelated Fund;Regular Plan;Growth;INF000000000;;100.00;01-Jan-2024\n',
        { status: 200, headers: { 'content-type': 'text/plain' } }
      );

    try {
      await assert.rejects(
        () => downloadSchemeNAVHistory(UTI_SCHEME, '2024-01-01', '2024-01-05'),
        /returned no NAV rows for scheme 120716/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects an HTML response instead of parsing it as NAV data', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response('<html><body>AMFI portal</body></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });

    try {
      await assert.rejects(
        () => downloadSchemeNAVHistory(HDFC_SCHEME, '2024-01-01', '2024-01-05'),
        /returned HTML instead of a NAV report/
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('AMFI Existing/Fetched Observation Merge', () => {
  it('preserves existing observations exactly and appends new dates', () => {
    const existing = [
      { date: '2024-01-01', nav: 148.9515 },
      { date: '2024-01-02', nav: 148.4292 },
    ];
    const fetched = [
      { date: '2024-01-01', nav: 148.9515 },
      { date: '2024-01-02', nav: 148.4292 },
      { date: '2024-01-03', nav: 147.4108 },
    ];

    const merged = mergeSchemeObservations(existing, fetched);
    assert.equal(merged.existingCount, 2);
    assert.equal(merged.overlapCount, 2);
    assert.equal(merged.addedCount, 1);
    assert.equal(merged.data.length, 3);
    assert.deepEqual(merged.data[0], { date: '2024-01-01', nav: 148.9515 });
    assert.deepEqual(merged.data[1], { date: '2024-01-02', nav: 148.4292 });
    assert.deepEqual(merged.data[2], { date: '2024-01-03', nav: 147.4108 });
  });

  it('aborts instead of overwriting a conflicting overlapping NAV', () => {
    const existing = [{ date: '2024-01-01', nav: 148.9515 }];
    const fetched = [{ date: '2024-01-01', nav: 999.9999 }];
    assert.throws(() => mergeSchemeObservations(existing, fetched), /NAV conflict on 2024-01-01/);
  });

  it('rejects duplicate dates in the existing dataset and empty fetched data', () => {
    assert.throws(
      () =>
        mergeSchemeObservations(
          [
            { date: '2024-01-01', nav: 148.9515 },
            { date: '2024-01-01', nav: 148.9515 },
          ],
          [{ date: '2024-01-02', nav: 148.4292 }]
        ),
      /duplicate date/
    );
    assert.throws(() => mergeSchemeObservations([], []), /empty fetched/);
  });
});

describe('Local AMFI File Import Fallback', () => {
  const tmpDir = resolve(projectRoot, 'data', 'raw', '_test_amfi_tmp');

  it('imports valid local AMFI text file', () => {
    mkdirSync(tmpDir, { recursive: true });
    const tmpFile = resolve(tmpDir, 'test_nav.txt');
    const content = [
      'Scheme Code;NAV Name;Plan;Option;ISIN;ISIN2;Net Asset Value;Date',
      '120716;UTI Nifty 50 Index Fund;Direct;Growth;INF789;;148.50;01-Jan-2024',
      '120716;UTI Nifty 50 Index Fund;Direct;Growth;INF789;;149.20;02-Jan-2024',
    ].join('\n');
    writeFileSync(tmpFile, content);

    try {
      const { normalized } = importAMFIFromLocalFile(tmpFile, '120716');
      assert.equal(normalized.data.length, 2);
      assert.equal(normalized.data[0].nav, 148.5);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws for missing file or missing target scheme', () => {
    assert.throws(() => importAMFIFromLocalFile('/nonexistent.txt', '120716'), /File not found/);
  });
});

describe('Processed AMFI Datasets & Raw Provenance', () => {
  const processedPath = join(projectRoot, 'data', 'processed', 'amfi_nav.json');
  const csvPath = join(projectRoot, 'data', 'processed', 'amfi_nav.csv');
  const sourcesPath = join(projectRoot, 'data', 'sources', 'sources.json');
  const dataset = JSON.parse(readFileSync(processedPath, 'utf-8'));
  const schemesByCode = new Map(dataset.schemes.map((s) => [String(s.schemeCode), s]));

  it('retains both complete UTI and HDFC series with verified identities', () => {
    assert.equal(dataset.schemesCount, 2);
    assert.ok(schemesByCode.has('120716'));
    assert.ok(schemesByCode.has('119063'));

    const uti = schemesByCode.get('120716');
    const hdfc = schemesByCode.get('119063');

    assert.equal(uti.isin, 'INF789F01XA0');
    assert.equal(hdfc.isin, 'INF179K01WM1');
    for (const scheme of [uti, hdfc]) {
      assert.equal(scheme.plan, 'Direct');
      assert.equal(scheme.option, 'Growth');
      assert.equal(scheme.startDate, '2024-01-01');
      assert.equal(scheme.endDate, '2026-10-23');
      assert.equal(scheme.observationCount, 694);
      assert.equal(scheme.data.length, 694);
      assert.equal(scheme.rawChunkCount, 12);
      assert.match(scheme.rawSha256, /^[a-f0-9]{64}$/);
    }

    assert.equal(uti.startNav, 148.9515);
    assert.equal(uti.endNav, 159.177);
    assert.equal(hdfc.startNav, 207.3522);
    assert.equal(hdfc.endNav, 221.2213);
  });

  it('preserves the original UTI observations exactly on overlapping dates', () => {
    const uti = schemesByCode.get('120716');
    const utiNavByDate = new Map(uti.data.map((row) => [row.date, row.nav]));

    assert.equal(utiNavByDate.get('2024-01-01'), 148.9515);
    assert.equal(utiNavByDate.get('2024-01-02'), 148.4292);
    assert.equal(utiNavByDate.get('2024-10-22'), 169.0137);
    assert.equal(utiNavByDate.get('2024-10-23'), 168.7599);
    assert.equal(utiNavByDate.get('2026-10-23'), 159.177);
  });

  it('writes both complete series to the processed CSV', () => {
    const lines = readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
    assert.equal(lines[0], 'Date,NAV,Scheme Code,Scheme Name');
    assert.equal(lines.length, 1 + 694 + 694);
    assert.equal(lines.filter((line) => line.includes(',120716,')).length, 694);
    assert.equal(lines.filter((line) => line.includes(',119063,')).length, 694);
  });

  it('verifies every raw chunk and aggregate checksum against the immutable manifest', () => {
    const artifact = dataset.rawArtifact;
    assert.ok(artifact && artifact.manifestPath);
    const manifestPath = join(projectRoot, artifact.manifestPath);
    assert.ok(existsSync(manifestPath));

    const manifestBytes = readFileSync(manifestPath);
    assert.equal(sha256(manifestBytes), artifact.manifestSha256);
    assert.equal(dataset.rawSha256, artifact.manifestSha256);

    const manifest = JSON.parse(manifestBytes.toString('utf-8'));
    assert.equal(manifest.schemes.length, 2);
    assert.equal(manifest.requestedRange.startDate, '2024-01-01');
    assert.equal(manifest.requestedRange.endDate, '2026-10-23');

    for (const rawScheme of manifest.schemes) {
      const processedScheme = schemesByCode.get(rawScheme.schemeCode);
      assert.ok(processedScheme, `missing processed scheme ${rawScheme.schemeCode}`);
      assert.equal(rawScheme.rawPayloadSha256, processedScheme.rawSha256);
      assert.equal(rawScheme.chunkCount, 12);

      const aggregate = crypto.createHash('sha256');
      for (const chunk of rawScheme.chunks) {
        const chunkPath = join(projectRoot, artifact.directory, chunk.file);
        assert.ok(existsSync(chunkPath), `missing raw chunk ${chunk.file}`);
        const chunkBytes = readFileSync(chunkPath);
        assert.equal(chunkBytes.length, chunk.byteLength);
        assert.equal(sha256(chunkBytes), chunk.sha256);
        aggregate.update(chunkBytes);
      }
      assert.equal(aggregate.digest('hex'), rawScheme.rawPayloadSha256);
    }
  });

  it('records per-scheme coverage, checksums and retrieval dates in sources.json', () => {
    const sources = JSON.parse(readFileSync(sourcesPath, 'utf-8'));
    const amfi = sources.find((source) => source.id === 'amfi-nav-history');
    assert.ok(amfi);
    assert.equal(amfi.status, 'Connected and verified');
    assert.equal(amfi.checksum, dataset.rawArtifact.manifestSha256);
    assert.equal(amfi.schemes.length, 2);

    for (const scheme of amfi.schemes) {
      assert.equal(scheme.startDate, '2024-01-01');
      assert.equal(scheme.endDate, '2026-10-23');
      assert.equal(scheme.observationCount, 694);
      assert.equal(scheme.retrievalDate, dataset.retrievalDate);
      assert.match(scheme.rawSha256, /^[a-f0-9]{64}$/);
    }

    assert.ok(existsSync(join(projectRoot, 'data', 'raw', 'amfi_nav_raw_20261023.json')));
  });
});
