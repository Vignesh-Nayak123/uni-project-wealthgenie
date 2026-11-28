/**
 * Combine small candles ({ time: epoch ms, open, high, low, close, volume })
 * into larger buckets of `intervalMs` (e.g. 5-second candles into 1-minute
 * ones). Input must be ascending; output is ascending with ms times.
 */
export function aggregateCandles(candles, intervalMs) {
  if (!Array.isArray(candles) || !(intervalMs > 0)) return [];
  const out = [];
  for (const c of candles) {
    const time = Number(c?.time);
    if (!Number.isFinite(time)) continue;
    const bucket = Math.floor(time / intervalMs) * intervalMs;
    const last = out[out.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, Number(c.high));
      last.low = Math.min(last.low, Number(c.low));
      last.close = Number(c.close);
      last.volume += Number(c.volume) || 0;
    } else {
      out.push({
        time: bucket,
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
        volume: Number(c.volume) || 0,
      });
    }
  }
  return out;
}

/**
 * Convert raw OHLC rows (daily CSV rows with a 'YYYY-MM-DD' date, or live
 * 1-minute buckets with an ISO/epoch date) into sorted, de-duplicated rows for
 * lightweight-charts: { time, open, high, low, close, volume }.
 */
export function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];
  const rows = [];
  for (const c of candles) {
    let time;
    // Already-normalised rows ({ time, ... }) pass straight through, so calling
    // this twice (the page normalises, then the chart does) never drops data.
    if (typeof c?.time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.time)) {
      time = c.time;
    } else if (typeof c?.time === 'number' && Number.isFinite(c.time)) {
      // Epoch milliseconds (backend candles) become seconds; seconds pass through.
      time = c.time > 1e11 ? Math.floor(c.time / 1000) : c.time;
    } else if (typeof c?.date === 'string') {
      const date = c.date.trim();
      // Only a bare calendar date is a daily bar. A full timestamp such as
      // '2026-11-16T09:16:00Z' is an intraday bucket; slicing it to the day
      // used to collapse a whole session of 1-minute candles into one bar.
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        time = date;
      } else {
        // Intraday timestamps (e.g. live 1-minute buckets) become seconds.
        const parsed = Date.parse(c.date);
        if (!Number.isFinite(parsed)) continue;
        time = Math.floor(parsed / 1000);
      }
    } else if (Number.isFinite(Number(c?.date))) {
      time = Math.floor(Number(c.date) / 1000);
    } else {
      continue;
    }
    const open = Number(c.open);
    const high = Number(c.high);
    const low = Number(c.low);
    const close = Number(c.close);
    if (![open, high, low, close].every(Number.isFinite)) continue;
    rows.push({
      time,
      open,
      high,
      low,
      close,
      volume: Number(c.volume) > 0 ? Number(c.volume) : null,
    });
  }
  // Daily times are 'YYYY-MM-DD' strings (subtracting them gives NaN), intraday
  // times are epoch seconds.
  rows.sort((a, b) =>
    typeof a.time === 'string' || typeof b.time === 'string'
      ? String(a.time).localeCompare(String(b.time))
      : a.time - b.time
  );
  // Merge duplicate timestamps (the library throws otherwise).
  const merged = [];
  for (const row of rows) {
    const last = merged[merged.length - 1];
    if (last && last.time === row.time) {
      last.high = Math.max(last.high, row.high);
      last.low = Math.min(last.low, row.low);
      last.close = row.close;
      if (row.volume !== null) last.volume = row.volume;
    } else {
      merged.push({ ...row });
    }
  }
  return merged;
}
