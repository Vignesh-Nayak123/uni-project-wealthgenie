import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_PATH = path.resolve(__dirname, '../../../../data/historical/niftybees_daily.csv');

const SYNTHETIC = [
  { date: '2024-01-02', open: 100, high: 105, low: 98, close: 103, volume: 1000 },
];

function parseCsv() {
  if (!fs.existsSync(CSV_PATH)) return null;
  const lines = fs.readFileSync(CSV_PATH, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  const di = idx('date'), oi = idx('open'), hi = idx('high'), li = idx('low'), ci = idx('close'), vi = idx('volume');
  if ([di, oi, hi, li, ci].some((i) => i === -1)) throw new Error('Missing required CSV columns');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length < 5) continue;
    const date = cols[di];
    const o = Number(cols[oi]); const h = Number(cols[hi]); const l = Number(cols[li]); const c = Number(cols[ci]);
    const v = vi >= 0 ? Number(cols[vi]) : undefined;
    if (!date || !Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;
    if (h < o || h < c || h < l) throw new Error('Invalid high');
    if (l > o || l > c || l > h) throw new Error('Invalid low');
    rows.push({ date, open: o, high: h, low: l, close: c, volume: Number.isFinite(v) ? v : undefined });
  }
  // dedupe by date
  const seen = new Set();
  const uniq = [];
  for (const r of rows) {
    if (seen.has(r.date)) continue;
    seen.add(r.date);
    uniq.push(r);
  }
  if (uniq.length === 0) throw new Error('No valid rows');
  return uniq;
}

let cached = null;
export function getCandles() {
  if (cached) return cached.map((c) => ({ ...c }));
  const parsed = parseCsv();
  if (parsed) {
    cached = parsed;
    return cached.map((c) => ({ ...c }));
  }
  cached = SYNTHETIC;
  return cached.map((c) => ({ ...c }));
}

export const INSTRUMENT = 'NIFTYBEES';
export function getSourceLabel() {
  return fs.existsSync(CSV_PATH)
    ? 'NSE historical daily data for NIFTYBEES EQ (verified local CSV)'
    : 'Development-only synthetic OHLC fixture (not real market data)';
}
export const SOURCE_LABEL = getSourceLabel();
export const IS_DEVELOPMENT_FIXTURE = !fs.existsSync(CSV_PATH);

export function validateCandles(candles) {
  const seen = new Set();
  for (const c of candles) {
    if (!c.date || isNaN(Date.parse(c.date))) throw new Error('Invalid date');
    for (const k of ['open', 'high', 'low', 'close']) {
      if (typeof c[k] !== 'number' || !Number.isFinite(c[k])) throw new Error('Invalid OHLC');
    }
    if (c.high < c.open || c.high < c.close || c.high < c.low) throw new Error('Invalid high');
    if (c.low > c.open || c.low > c.close || c.low > c.high) throw new Error('Invalid low');
    if (seen.has(c.date)) throw new Error('Duplicate date');
    seen.add(c.date);
  }
  return true;
}
