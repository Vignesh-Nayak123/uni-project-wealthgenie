import React, { useEffect, useRef } from 'react';
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  CrosshairMode,
} from 'lightweight-charts';

const UP_COLOR = '#16a34a';
const DOWN_COLOR = '#dc2626';

const FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Convert raw candle rows into Lightweight Charts data.
 * Weak/invalid rows are dropped and the result is sorted ascending, because
 * the library throws on out-of-order or duplicate timestamps (the earlier
 * version passed the array straight through, so one bad row blanked the chart).
 */
export function normalizeCandles(candles) {
  if (!Array.isArray(candles)) return [];
  const rows = [];
  for (const c of candles) {
    let time;
    if (typeof c?.date === 'string') {
      const date = c.date.slice(0, 10);
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
  rows.sort((a, b) => a.time - b.time);
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

export default function ReplayChart({ candles, chartType = 'candle', heightClass = 'h-72 sm:h-[420px]' }) {
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  // Create once; autoSize keeps the chart filling its parent through any
  // sidebar/grid/layout change without manual resize listeners.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#334155',
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: '#f1f5f9' },
        horzLines: { color: '#f1f5f9' },
      },
      rightPriceScale: { borderColor: '#e2e8f0' },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: false,
        rightOffset: 6,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#94a3b8', width: 1, style: 3, labelBackgroundColor: '#0f172a' },
        horzLine: { color: '#94a3b8', width: 1, style: 3, labelBackgroundColor: '#0f172a' },
      },
      localization: {
        priceFormatter: (price) => `₹${FORMATTER.format(Number(price) || 0)}`,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderVisible: false,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
      priceFormat: { type: 'price', precision: 2, minMove: 0.05 },
    });
    const lineSeries = chart.addSeries(LineSeries, {
      color: '#2563eb',
      lineWidth: 2,
      priceFormat: { type: 'price', precision: 2, minMove: 0.05 },
      visible: false,
    });
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    // Lightweight OHLC legend driven imperatively so hovering stays cheap.
    const crosshairHandler = (param) => {
      const el = legendRef.current;
      if (!el) return;
      const bar = param?.seriesData?.get(candleSeries) || param?.seriesData?.get(lineSeries);
      if (!bar || bar.open === undefined) {
        el.textContent = 'Hover the chart for OHLC details';
        return;
      }
      const isUp = bar.close >= bar.open;
      el.innerHTML = [
        `O ${FORMATTER.format(bar.open)}`,
        `H ${FORMATTER.format(bar.high)}`,
        `L ${FORMATTER.format(bar.low)}`,
        `C ${FORMATTER.format(bar.close)}`,
      ].join(' &nbsp; ') + (isUp ? '' : '');
      el.classList.toggle('text-emerald-600', isUp);
      el.classList.toggle('text-rose-600', !isUp);
    };
    chart.subscribeCrosshairMove(crosshairHandler);

    chartRef.current = chart;
    seriesRef.current = { candleSeries, lineSeries, volumeSeries };

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Data mapping and rerender on candles/symbol change without recreating the chart.
  useEffect(() => {
    const refs = seriesRef.current;
    const chart = chartRef.current;
    if (!refs || !chart) return;

    const rows = normalizeCandles(candles);
    const isIntraday = rows.some((row) => typeof row.time === 'number');
    chart.timeScale().applyOptions({ timeVisible: isIntraday });

    refs.volumeSeries.setData(
      rows
        .filter((r) => r.volume !== null)
        .map((r) => ({
          time: r.time,
          value: r.volume,
          color: r.close >= r.open ? 'rgba(22,163,74,0.45)' : 'rgba(220,38,38,0.45)',
        }))
    );

    const isLine = chartType === 'line';
    refs.candleSeries.applyOptions({ visible: !isLine });
    refs.lineSeries.applyOptions({ visible: isLine });
    if (isLine) {
      refs.lineSeries.setData(
        rows.map((r) => ({ time: r.time, value: r.close }))
      );
    } else {
      refs.candleSeries.setData(rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
      refs.lineSeries.setData(rows.map((r) => ({ time: r.time, value: r.close })));
    }

    if (rows.length > 0) {
      const to = rows[rows.length - 1].time;
      const fromIndex = Math.max(0, rows.length - 90);
      const from = rows[fromIndex].time;
      chart.timeScale().setVisibleRange({ from, to });
    } else if (legendRef.current) {
      legendRef.current.textContent = 'No candle data available yet';
    }
  }, [candles, chartType]);

  return (
    <div className="space-y-1.5">
      <div
        ref={legendRef}
        className="px-1 text-[11px] font-semibold text-slate-500"
      >
        Hover the chart for OHLC details
      </div>
      <div className={`relative w-full ${heightClass}`}>
        <div ref={containerRef} className="absolute inset-0" />
        {(!candles || candles.length === 0) && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 text-xs text-slate-400">
            No candles revealed yet.
          </div>
        )}
      </div>
    </div>
  );
}
