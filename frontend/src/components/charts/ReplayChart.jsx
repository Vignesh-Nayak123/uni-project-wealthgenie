import React, { useEffect, useRef } from 'react';
import { normalizeCandles } from '../../utils/candles';
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

// Lightweight Charts treats epoch seconds as UTC. These formatters show
// intraday candles in the viewer's own clock (IST for Indian users) instead.
const pad = (n) => String(n).padStart(2, '0');
function isBusinessDay(time) {
  return typeof time === 'string' || (time && typeof time === 'object' && 'year' in time);
}
function toDate(time) {
  if (typeof time === 'number') return new Date(time * 1000);
  if (typeof time === 'string') return new Date(`${time}T00:00:00`);
  return new Date(time.year, time.month - 1, time.day);
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatDay(d) {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
function formatClock(d, withSeconds) {
  const base = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return withSeconds ? `${base}:${pad(d.getSeconds())}` : base;
}

/**
 * Convert raw candle rows into Lightweight Charts data.
 * Weak/invalid rows are dropped and the result is sorted ascending, because
 * the library throws on out-of-order or duplicate timestamps (the earlier
 * version passed the array straight through, so one bad row blanked the chart).
 */
export { normalizeCandles };

/**
 * Candlestick / line chart with volume.
 *
 * `viewKey` identifies what is being shown (instrument + interval + mode). The
 * visible range is reset only when it changes, so live updates every second
 * never undo the user's own zooming or scrolling.
 */
export default function ReplayChart({
  candles,
  chartType = 'candle',
  heightClass = 'h-72 sm:h-[420px]',
  viewKey = 'default',
  showSeconds = false,
  initialBars = 90,
}) {
  const containerRef = useRef(null);
  const legendRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const appliedViewKeyRef = useRef(null);
  const showSecondsRef = useRef(showSeconds);
  showSecondsRef.current = showSeconds;

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
      rightPriceScale: { borderColor: '#e2e8f0', scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: {
        borderColor: '#e2e8f0',
        timeVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 2,
        tickMarkFormatter: (time, tickMarkType) => {
          const d = toDate(time);
          if (isBusinessDay(time)) {
            return tickMarkType === 0 ? String(d.getFullYear()) : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
          }
          // 0 year, 1 month, 2 day, 3 time, 4 time with seconds
          if (tickMarkType <= 2) return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
          return formatClock(d, tickMarkType === 4);
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: '#94a3b8', width: 1, style: 3, labelBackgroundColor: '#0f172a' },
        horzLine: { color: '#94a3b8', width: 1, style: 3, labelBackgroundColor: '#0f172a' },
      },
      localization: {
        priceFormatter: (price) => `₹${FORMATTER.format(Number(price) || 0)}`,
        timeFormatter: (time) => {
          const d = toDate(time);
          if (isBusinessDay(time)) return formatDay(d);
          return `${formatDay(d)}, ${formatClock(d, showSecondsRef.current)}`;
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      borderVisible: true,
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
      const bar = param?.seriesData?.get(candleSeries);
      if (!bar || bar.open === undefined) {
        el.textContent = 'Hover the chart to see open, high, low and close';
        el.classList.remove('text-emerald-600', 'text-rose-600');
        return;
      }
      const isUp = bar.close >= bar.open;
      el.textContent = [
        `Open ₹${FORMATTER.format(bar.open)}`,
        `High ₹${FORMATTER.format(bar.high)}`,
        `Low ₹${FORMATTER.format(bar.low)}`,
        `Close ₹${FORMATTER.format(bar.close)}`,
      ].join('   ');
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
      appliedViewKeyRef.current = null;
    };
  }, []);

  // Push data on every update without recreating the chart.
  useEffect(() => {
    const refs = seriesRef.current;
    const chart = chartRef.current;
    if (!refs || !chart) return;

    const rows = normalizeCandles(candles);
    const isIntraday = rows.some((row) => typeof row.time === 'number');
    chart.timeScale().applyOptions({ timeVisible: isIntraday, secondsVisible: isIntraday && showSeconds });

    refs.volumeSeries.setData(
      rows
        .filter((r) => r.volume !== null)
        .map((r) => ({
          time: r.time,
          value: r.volume,
          color: r.close >= r.open ? 'rgba(22,163,74,0.35)' : 'rgba(220,38,38,0.35)',
        }))
    );

    const isLine = chartType === 'line';
    refs.candleSeries.applyOptions({ visible: !isLine });
    refs.lineSeries.applyOptions({ visible: isLine });
    refs.candleSeries.setData(rows.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    refs.lineSeries.setData(rows.map((r) => ({ time: r.time, value: r.close })));

    if (rows.length === 0) {
      if (legendRef.current) legendRef.current.textContent = 'No candle data available yet';
      appliedViewKeyRef.current = null;
      return;
    }

    // Only frame the view when the instrument/interval changes.
    if (appliedViewKeyRef.current !== viewKey) {
      appliedViewKeyRef.current = viewKey;
      // Always frame at least ~40 slots so one or two candles do not balloon
      // to fill the whole chart.
      const bars = Math.max(Math.min(rows.length, initialBars), 40);
      chart.timeScale().setVisibleLogicalRange({
        from: rows.length - bars - 0.5,
        to: rows.length - 1 + 4,
      });
    }
  }, [candles, chartType, viewKey, showSeconds, initialBars]);

  return (
    <div className="space-y-1.5">
      <div
        ref={legendRef}
        className="min-h-[16px] px-1 text-[11px] font-semibold tabular-nums text-slate-500"
      >
        Hover the chart to see open, high, low and close
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
