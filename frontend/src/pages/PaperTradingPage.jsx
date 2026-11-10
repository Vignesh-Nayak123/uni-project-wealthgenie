import React, { useEffect, useMemo, useRef, useState } from 'react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import ReplayChart, { normalizeCandles } from '../components/charts/ReplayChart';

const API = '/api/paper-trading';

const TIMEFRAMES = [
  { id: '5D', candles: 5 },
  { id: '1M', candles: 21 },
  { id: '3M', candles: 63 },
  { id: '6M', candles: 126 },
  { id: '1Y', candles: 252 },
  { id: 'All', candles: Infinity },
];

const PRICE_FORMATTER = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const MONEY_FORMATTER = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? PRICE_FORMATTER.format(number) : '—';
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '₹—';
  const number = Number(value);
  return Number.isFinite(number) ? `₹${MONEY_FORMATTER.format(number)}` : '₹—';
}

function formatClock(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-IN', { hour12: false });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-IN', { hour12: false });
}

function sourceLabel(source) {
  if (source === 'upstox_v3') return 'Upstox V3 live';
  if (source === 'historical_replay' || source === 'historical_csv') {
    return 'Historical CSV replay';
  }
  if (source === 'simulated_fixture') return 'Simulated fixture (not live)';
  return source || 'Unknown source';
}

function statusChip({ marketStatus, socketState, stale, livePrice }) {
  if (!marketStatus && socketState === 'closed') {
    return { label: 'Disconnected — reconnecting…', tone: 'rose' };
  }
  if (!marketStatus) {
    return { label: 'Connecting to live feed…', tone: 'amber' };
  }
  if (socketState === 'closed') {
    return { label: 'Disconnected — reconnecting…', tone: 'rose' };
  }

  switch (marketStatus.state) {
    case 'not_configured':
    case 'disabled':
      return { label: 'Live feed off — UPSTOX_ACCESS_TOKEN missing', tone: 'slate' };
    case 'auth_failed':
      return { label: 'Authentication failed — refresh UPSTOX_ACCESS_TOKEN', tone: 'rose' };
    case 'subscription_failed':
      return { label: 'Subscription failed', tone: 'rose' };
    case 'connecting':
      return { label: 'Connecting to Upstox V3…', tone: 'amber' };
    case 'disconnected':
      return { label: 'Disconnected', tone: 'rose' };
    case 'market_closed':
      return {
        label: `Market closed${marketStatus.marketStatus?.nseEqStatus ? ` (${marketStatus.marketStatus.nseEqStatus})` : ''}`,
        tone: 'slate',
      };
    case 'stale':
      return { label: 'Stale data — no recent ticks', tone: 'amber' };
    case 'waiting':
      return { label: 'Connected — waiting for first tick', tone: 'amber' };
    case 'live':
      return stale || !livePrice
        ? { label: 'Stale data — no recent ticks', tone: 'amber' }
        : { label: 'Upstox LIVE', tone: 'green' };
    default:
      return { label: marketStatus.stateLabel || 'Live feed unavailable', tone: 'slate' };
  }
}

export default function PaperTradingPage() {
  const [instruments, setInstruments] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [symbol, setSymbol] = useState('NIFTYBEES');
  const [quantity, setQuantity] = useState('1');
  const [allowStale, setAllowStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [mode, setMode] = useState('learn');
  const [dataMode, setDataMode] = useState('live');
  const [timeframe, setTimeframe] = useState('3M');
  const [chartType, setChartType] = useState('candle');

  const [marketStatus, setMarketStatus] = useState(null);
  const [socketState, setSocketState] = useState('connecting');
  const [liveTicks, setLiveTicks] = useState({});
  const [liveCandles, setLiveCandles] = useState({});
  const liveTicksRef = useRef({});
  const liveCandlesRef = useRef({});

  const [replay, setReplay] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError('');
    try {
      const initRes = await fetch(`${API}/init`, { method: 'POST' });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error || `Init failed (${initRes.status})`);
      }
      const [instRes, portRes, histRes] = await Promise.all([
        fetch(`${API}/instruments`),
        fetch(`${API}/portfolio`),
        fetch(`${API}/history`),
      ]);
      const failed = [instRes, portRes, histRes].find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${failed.status})`);
      }
      const inst = await instRes.json();
      const port = await portRes.json();
      const hist = await histRes.json();
      setInstruments(inst.instruments || []);
      if (inst.marketFeed) setMarketStatus(inst.marketFeed);
      setPortfolio(port);
      setHistory(hist.history || []);
      setSymbol((current) => current || inst.instruments?.[0]?.symbol || 'NIFTYBEES');
    } catch (e) {
      setError(e.message || 'Server error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // One browser WebSocket to the backend. The backend owns the single Upstox
  // connection; this socket only receives normalised ticks/status. Updates are
  // batched into React state twice a second so high tick rates stay smooth.
  useEffect(() => {
    let cancelled = false;
    let ws = null;
    let reconnectTimer = null;
    let attempt = 0;

    const flushTimer = setInterval(() => {
      if (cancelled) return;
      setLiveTicks({ ...liveTicksRef.current });
      setLiveCandles({ ...liveCandlesRef.current });
    }, 500);

    const updateCandle = (tick, candle) => {
      if (!tick?.symbol) return;
      if (!candle || !Number.isFinite(Number(candle.time))) return;
      const iso = new Date(Number(candle.time)).toISOString();
      const current = liveCandlesRef.current[tick.symbol] || [];
      const next = current.slice();
      const row = {
        date: iso,
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume) || 0,
      };
      const last = next[next.length - 1];
      if (last?.date === iso) next[next.length - 1] = row;
      else next.push(row);
      while (next.length > 400) next.shift();
      liveCandlesRef.current[tick.symbol] = next;
    };

    const applyTick = (tick) => {
      if (!tick?.symbol) return;
      liveTicksRef.current[tick.symbol] = tick;
      const candle =
        tick.candle ||
        (tick.intradayOhlc?.timestamp
          ? {
              time: tick.intradayOhlc.timestamp,
              open: tick.intradayOhlc.open,
              high: tick.intradayOhlc.high,
              low: tick.intradayOhlc.low,
              close: tick.intradayOhlc.close,
              volume: tick.intradayOhlc.volume,
            }
          : null);
      updateCandle(tick, candle);
    };

    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (message.type) {
        case 'status':
          setMarketStatus(message.status);
          break;
        case 'market_status':
          setMarketStatus((previous) => ({
            ...(previous || {}),
            marketStatus: message.marketStatus,
            marketStatusKnown: Boolean(message.marketStatus?.known),
            marketInfo: message.marketInfo,
            lastMarketInfoAt: message.receivedAt
              ? Date.parse(message.receivedAt)
              : previous?.lastMarketInfoAt || null,
          }));
          break;
        case 'snapshot':
          for (const tick of message.instruments || []) applyTick(tick);
          break;
        case 'market_tick':
          applyTick(message.tick);
          break;
        case 'ticks':
          // Backwards-compatible with older backend frames.
          for (const tick of message.ticks || []) applyTick(tick);
          break;
        case 'portfolio':
          setPortfolio(message.account);
          break;
        default:
          break;
      }
    };

    const connect = () => {
      if (cancelled) return;
      setSocketState(attempt === 0 ? 'connecting' : 'reconnecting');
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      try {
        ws = new WebSocket(`${protocol}://${window.location.host}/ws/market`);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onopen = () => {
        attempt = 0;
        setSocketState('open');
      };
      ws.onmessage = handleMessage;
      ws.onerror = () => {
        try {
          ws.close();
        } catch {
          // The close handler schedules the reconnect.
        }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setSocketState('closed');
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (cancelled || reconnectTimer) return;
      const delay = Math.min(15_000, 1_000 * 2 ** Math.min(attempt, 4));
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delay);
    };

    connect();

    return () => {
      cancelled = true;
      clearInterval(flushTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const instrument = instruments.find((item) => item.symbol === symbol) || null;
  const liveTick = symbol ? liveTicks[symbol] : null;
  const livePrice = liveTick ? Number(liveTick.ltp) : null;
  const hasLivePrice = Number.isFinite(livePrice) && livePrice > 0;
  const displayedPrice = hasLivePrice ? livePrice : instrument?.price ?? null;
  const previousClose = Number(
    liveTick?.previousClose ?? instrument?.previousClose ?? 0
  );
  const hasPreviousClose = Number.isFinite(previousClose) && previousClose > 0;
  const change = hasLivePrice && hasPreviousClose ? livePrice - previousClose : null;
  const changePct =
    change !== null && hasPreviousClose ? (change / previousClose) * 100 : null;

  const marketClosed = Boolean(marketStatus?.marketStatus?.isClosed);
  const marketOpen = Boolean(marketStatus?.marketStatus?.isOpen);
  const tickBasis = liveTick
    ? Date.parse(liveTick.receivedAt || '') || Number(liveTick.timestamp) || null
    : null;
  const clientStale = Boolean(
    tickBasis && !marketClosed && Date.now() - tickBasis > 60_000
  );
  const stale = Boolean(marketStatus?.stale || clientStale || instrument?.stale);

  const chip = statusChip({ marketStatus, socketState, stale, livePrice: hasLivePrice });
  const badgeVariant =
    chip.tone === 'green'
      ? 'green'
      : chip.tone === 'amber'
        ? 'amber'
        : chip.tone === 'rose'
          ? 'rose'
          : 'slate';

  const priceSource = hasLivePrice
    ? 'Upstox V3 live'
    : instrument?.isLive
      ? 'Upstox V3 last tick'
      : 'Simulated fixture — not live';

  const visibleCandles = useMemo(() => {
    const revealed = normalizeCandles(replay?.revealed);
    const range = TIMEFRAMES.find((item) => item.id === timeframe) || TIMEFRAMES[0];
    if (revealed.length <= range.candles) return revealed;
    return revealed.slice(revealed.length - range.candles);
  }, [replay, timeframe]);

  const liveChartCandles = useMemo(() => {
    const rows = liveCandles[symbol] || [];
    const range = TIMEFRAMES.find((item) => item.id === timeframe) || TIMEFRAMES[0];
    const limited = rows.length <= range.candles ? rows : rows.slice(rows.length - range.candles);
    return normalizeCandles(limited);
  }, [liveCandles, symbol, timeframe]);

  const chartCandles = dataMode === 'replay' ? visibleCandles : liveChartCandles;
  const chartEmptyMessage =
    dataMode === 'replay'
      ? 'Start the historical replay to reveal CSV candles.'
      : 'Waiting for live Upstox 1-minute candles…';

  const handleOrder = async (side) => {
    setOrderError('');
    setFeedback('');
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setOrderError('Quantity must be a positive whole number.');
      return;
    }
    if (!Number.isFinite(Number(displayedPrice)) || Number(displayedPrice) <= 0) {
      setOrderError('No valid price is available. Order not executed.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/${side}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol,
          quantity: parsedQuantity,
          allowStale,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Order failed');
      setPortfolio(body.account);
      const historyResponse = await fetch(`${API}/history`);
      const historyBody = await historyResponse.json();
      setHistory(historyBody.history || []);
      const executedAt = body.trade?.executedAt || body.trade?.at;
      setFeedback(
        `${side.toUpperCase()} ${parsedQuantity} ${symbol} at ₹${formatPrice(
          body.trade.price
        )} via ${sourceLabel(body.trade.priceSource)}${
          body.trade.stale ? ' (stale quote explicitly accepted)' : ''
        }. Executed ${formatDateTime(executedAt)}.`
      );
      setAllowStale(false);
    } catch (e) {
      setOrderError(e.message || 'Server error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInit = async () => {
    setOrderError('');
    try {
      const response = await fetch(`${API}/init`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Init failed');
      setPortfolio(body.account);
      await loadAll();
    } catch (e) {
      setOrderError(e.message || 'Server error');
    }
  };

  const startReplay = async () => {
    setOrderError('');
    try {
      const response = await fetch(`${API}/replay/start`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Replay start failed');
      setReplay(body);
      setDataMode('replay');
    } catch (e) {
      setOrderError(e.message || 'Replay start failed');
    }
  };

  const nextCandle = async () => {
    setOrderError('');
    try {
      const response = await fetch(`${API}/replay/next`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No more candles');
      setReplay(body);
      setDataMode('replay');
    } catch (e) {
      setOrderError(e.message || 'No more candles');
    }
  };

  const replayTrade = async (side) => {
    setOrderError('');
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setOrderError('Quantity must be a positive whole number.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/replay/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, quantity: parsedQuantity }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Order failed');
      setPortfolio(body.account);
      const [historyResponse, replayResponse] = await Promise.all([
        fetch(`${API}/history`),
        fetch(`${API}/replay`),
      ]);
      const historyBody = await historyResponse.json();
      setHistory(historyBody.history || []);
      setReplay(await replayResponse.json());
      setFeedback(
        `Historical replay ${side.toUpperCase()} ${parsedQuantity} ${
          replay?.instrument || 'NIFTYBEES'
        } at ₹${formatPrice(body.trade.price)} (CSV close, not live).`
      );
    } catch (e) {
      setOrderError(e.message || 'Server error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-slate-500">Loading paper trading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  const canOrder =
    !submitting &&
    Number.isFinite(Number(displayedPrice)) &&
    Number(displayedPrice) > 0 &&
    !(stale && !allowStale);

  const watchlistRows = [
    ...instruments.map((item) => ({
      symbol: item.symbol,
      name: item.name,
      price: liveTicks[item.symbol]?.ltp ?? item.price,
      live: Boolean(liveTicks[item.symbol]?.isLive || item.isLive),
      watchOnly: false,
    })),
    ...Object.entries(liveTicks)
      .filter(([key]) => !instruments.some((item) => item.symbol === key))
      .map(([key, tick]) => ({
        symbol: key,
        name: tick.name || key,
        price: tick.ltp,
        live: true,
        watchOnly: true,
      })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-navy-900">Paper Trading (Simulated)</h1>
          <p className="text-xs text-slate-500">
            Virtual ₹1,00,000 account · no real Upstox orders or funds are ever used.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariant} size="xs">{chip.label}</Badge>
          <button
            type="button"
            onClick={() => setMode('learn')}
            className={`px-3 py-1 rounded ${mode === 'learn' ? 'bg-genie-600 text-white' : 'bg-slate-200'}`}
          >
            Learn Mode
          </button>
          <button
            type="button"
            onClick={() => setMode('terminal')}
            className={`px-3 py-1 rounded ${mode === 'terminal' ? 'bg-genie-600 text-white' : 'bg-slate-200'}`}
          >
            Terminal Mode
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Chart data mode
        </span>
        <button
          type="button"
          onClick={() => setDataMode('live')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            dataMode === 'live'
              ? 'bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Live · Upstox V3
        </button>
        <button
          type="button"
          onClick={() => setDataMode('replay')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
            dataMode === 'replay'
              ? 'bg-navy-950 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          Historical replay · CSV
        </button>
        <span className="text-[11px] text-slate-500">
          {dataMode === 'live'
            ? 'Live candles only. Historical CSV candles are never mixed into this chart.'
            : 'Historical CSV candles only. Live ticks continue in the live panel above.'}
        </span>
      </div>

      {/* Live market panel — always sourced from Upstox V3 when available. */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-navy-950">{symbol || 'NIFTYBEES'}</h2>
              <Badge variant={hasLivePrice ? 'green' : 'amber'} size="xs">
                {priceSource}
              </Badge>
              {stale && (
                <Badge variant="amber" size="xs">STALE</Badge>
              )}
              {marketClosed && (
                <Badge variant="slate" size="xs">Market closed</Badge>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {instrument?.name || 'Nippon India ETF Nifty 50 BeES'} · source:{' '}
              {hasLivePrice ? 'Upstox Market Data Feed V3' : 'local simulation fixture'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold text-navy-950">
              ₹{formatPrice(displayedPrice)}
            </div>
            {change !== null && (
              <div
                className={`text-sm font-semibold ${
                  change >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {change >= 0 ? '+' : '−'}₹{formatPrice(Math.abs(change))} ({change >= 0 ? '+' : '−'}
                {Math.abs(changePct).toFixed(2)}%)
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[11px] text-slate-500">Open</div>
            <div className="font-semibold">{liveTick?.open !== undefined ? `₹${formatPrice(liveTick.open)}` : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">High</div>
            <div className="font-semibold">{liveTick?.high !== undefined ? `₹${formatPrice(liveTick.high)}` : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Low</div>
            <div className="font-semibold">{liveTick?.low !== undefined ? `₹${formatPrice(liveTick.low)}` : '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Previous close</div>
            <div className="font-semibold">{hasPreviousClose ? `₹${formatPrice(previousClose)}` : '—'}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-slate-500">
          <span>
            Last tick: <strong>{liveTick?.lastTradedTime ? formatClock(liveTick.lastTradedTime) : '—'}</strong>
          </span>
          <span>
            Received: <strong>{liveTick?.receivedAt ? formatClock(liveTick.receivedAt) : '—'}</strong>
          </span>
          <span>
            Market status:{' '}
            <strong>
              {marketStatus?.marketStatusKnown
                ? `${marketStatus.marketStatus?.label || 'Unknown'} (${marketStatus.marketStatus?.nseEqStatus || 'N/A'})`
                : 'Waiting for Upstox market_info'}
            </strong>
          </span>
          <span>
            Connection: <strong>{marketStatus?.connectionState || socketState}</strong>
          </span>
        </div>

        {marketStatus?.failureReason && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {marketStatus.failureReason}
            {marketStatus.instrumentNote ? ` ${marketStatus.instrumentNote}` : ''}
          </div>
        )}

        {stale && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Live data is stale. Last tick was{' '}
            {liveTick?.receivedAt ? formatDateTime(liveTick.receivedAt) : 'unknown'}.
            {marketOpen ? ' The market is open, so the feed may be interrupted.' : ''}
          </div>
        )}

        {marketClosed && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Upstox reports NSE_EQ as <strong>{marketStatus?.marketStatus?.nseEqStatus}</strong>.
            No live ticks are expected while the market is closed; the last received price is shown.
          </div>
        )}

        {!hasLivePrice && !marketClosed && marketStatus?.state !== 'auth_failed' && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            No live tick for {symbol} yet. This is not being reported as “market closed” — the
            actual Upstox market status is used above. Until a tick arrives the order panel
            labels any fallback price as simulated.
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><div className="text-xs text-slate-500">Virtual Cash</div><div className="text-xl font-bold">{formatMoney(portfolio?.cash)}</div></Card>
        <Card><div className="text-xs text-slate-500">Total Equity</div><div className="text-xl font-bold">{formatMoney(portfolio?.totalEquity)}</div></Card>
        <Card><div className="text-xs text-slate-500">Realized P&L</div><div className="text-xl font-bold">{formatMoney(portfolio?.realizedPnl)}</div></Card>
        <Card><div className="text-xs text-slate-500">Unrealized P&L</div><div className="text-xl font-bold">{formatMoney(portfolio?.unrealizedPnl)}</div></Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold mb-1">Place Simulated Order</h2>
          <span className="text-[11px] text-slate-500">
            Execution price: {hasLivePrice ? 'latest Upstox tick' : 'simulated fixture'} · ₹
            {formatPrice(displayedPrice)}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 items-end mt-2">
          <div>
            <label className="text-xs text-slate-500">Instrument</label>
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="block border rounded px-3 py-2"
            >
              {instruments.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} — ₹{formatPrice(item.price)}{' '}
                  {item.isLive ? '(Upstox live)' : '(simulated)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500">Quantity</label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="block border rounded px-3 py-2 w-24"
            />
          </div>
          <div className="text-xs text-slate-500 pb-2">
            Price: ₹{formatPrice(displayedPrice)} · {priceSource}
          </div>
          <button
            disabled={!canOrder}
            onClick={() => handleOrder('buy')}
            className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
          >
            Buy
          </button>
          <button
            disabled={!canOrder}
            onClick={() => handleOrder('sell')}
            className="px-4 py-2 bg-red-600 text-white rounded disabled:opacity-50"
          >
            Sell
          </button>
          <button onClick={handleInit} className="px-4 py-2 bg-slate-200 rounded">Init Account</button>
        </div>
        {stale && (
          <label className="mt-3 flex items-start gap-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={allowStale}
              onChange={(event) => setAllowStale(event.target.checked)}
              className="mt-0.5"
            />
            Use the last available stale price for the next simulated order (explicit acknowledgement).
          </label>
        )}
        {feedback && <div className="mt-2 text-sm text-green-700">{feedback}</div>}
        {orderError && <div className="mt-2 text-sm text-red-600">{orderError}</div>}
      </Card>

      {mode === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)_240px] gap-4 items-stretch">
          <Card className="lg:max-h-[520px] overflow-y-auto">
            <h2 className="font-semibold mb-2 text-sm">Watchlist</h2>
            <p className="text-[10px] text-slate-400 mb-2 uppercase tracking-wider">
              Simulated &amp; Upstox live prices
            </p>
            <div className="space-y-1">
              {watchlistRows.map((item) => (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => !item.watchOnly && setSymbol(item.symbol)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg border transition-colors ${
                    symbol === item.symbol
                      ? 'border-genie-300 bg-genie-50'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-navy-900 truncate">{item.symbol}</span>
                    {item.live && (
                      <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 rounded">
                        LIVE
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ₹{formatPrice(item.price)}
                    {item.watchOnly && ' • view only'}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-navy-950">{symbol}</span>
                <Badge variant={dataMode === 'live' ? 'green' : 'amber'} size="xs">
                  {dataMode === 'live'
                    ? 'Live · Upstox V3 1-min candles'
                    : 'Historical replay · NIFTYBEES CSV'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {TIMEFRAMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTimeframe(item.id)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      timeframe === item.id
                        ? 'bg-genie-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {item.id}
                  </button>
                ))}
                <span className="mx-1 h-4 w-px bg-slate-200" />
                <button
                  type="button"
                  onClick={() => setChartType('candle')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartType === 'candle'
                      ? 'bg-navy-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Candles
                </button>
                <button
                  type="button"
                  onClick={() => setChartType('line')}
                  className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                    chartType === 'line'
                      ? 'bg-navy-950 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Line
                </button>
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <ReplayChart candles={chartCandles} chartType={chartType} />
            </div>
            {chartCandles.length === 0 && (
              <p className="mt-2 text-[11px] text-slate-500">{chartEmptyMessage}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-slate-500">
              <button type="button" onClick={startReplay} className="px-2.5 py-1.5 bg-slate-100 rounded-md font-semibold hover:bg-slate-200">Start Replay</button>
              <button type="button" onClick={nextCandle} className="px-2.5 py-1.5 bg-slate-100 rounded-md font-semibold hover:bg-slate-200">Next Candle</button>
              <span>Progress {replay && replay.status !== 'none' ? `${replay.currentIndex + 1}/${replay.total}` : 'not started'}</span>
            </div>
          </Card>

          <Card className="lg:max-h-[520px] flex flex-col">
            <h2 className="font-semibold text-sm text-navy-950">{symbol || '—'}</h2>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider">
              {hasLivePrice ? 'Upstox V3 live price' : 'Simulated price'}
            </p>
            <div className="mt-1 text-2xl font-extrabold text-navy-950">
              ₹{formatPrice(displayedPrice)}
            </div>
            {change !== null && (
              <div className={`text-xs font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {change >= 0 ? '+' : '−'}₹{formatPrice(Math.abs(change))} ({change >= 0 ? '+' : '−'}
                {Math.abs(changePct).toFixed(2)}%)
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-400 leading-relaxed">
              {hasLivePrice
                ? `Last tick ${liveTick?.lastTradedTime ? formatClock(liveTick.lastTradedTime) : '—'} · previous close ₹${formatPrice(previousClose)} · ${priceSource}`
                : 'No live tick for this symbol — the fallback is labelled simulated, never live.'}
            </p>

            <div className="mt-3 space-y-2">
              <div>
                <label className="text-[10px] text-slate-500">Quantity</label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  className="block w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <button
                disabled={!canOrder}
                onClick={() => handleOrder('buy')}
                className="w-full px-3 py-2 bg-genie-600 hover:bg-genie-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                Buy (virtual)
              </button>
              <button
                disabled={!canOrder}
                onClick={() => handleOrder('sell')}
                className="w-full px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                Sell (virtual)
              </button>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Orders execute at the latest valid price. Stale live quotes require explicit confirmation.
              </p>
            </div>

            {feedback && <p className="mt-2 text-[11px] text-emerald-700">{feedback}</p>}
            {orderError && <p className="mt-2 text-[11px] text-rose-700">{orderError}</p>}
          </Card>
        </div>
      )}

      {mode === 'learn' && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <h2 className="font-semibold">Price Chart</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {TIMEFRAMES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTimeframe(item.id)}
                    className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      timeframe === item.id
                        ? 'bg-genie-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {item.id}
                  </button>
                ))}
              </div>
            </div>
            <ReplayChart candles={chartCandles} chartType={chartType} />
            {chartCandles.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">{chartEmptyMessage}</p>
            )}
            <p className="mt-2 text-[11px] text-slate-500">
              {dataMode === 'live'
                ? 'This chart shows only live Upstox ticks aggregated into 1-minute candles.'
                : 'This chart shows only the historical NIFTYBEES CSV replay; it never overwrites the live price.'}
            </p>
          </Card>

          <Card>
            <h2 className="font-semibold mb-3">Historical Replay (NIFTYBEES CSV)</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={startReplay} className="px-3 py-2 bg-slate-200 rounded">Start Replay</button>
              <button onClick={nextCandle} className="px-3 py-2 bg-slate-200 rounded">Next Candle</button>
              <button disabled={submitting} onClick={() => replayTrade('buy')} className="px-3 py-2 bg-green-600 text-white rounded disabled:opacity-50">Buy at Close</button>
              <button disabled={submitting} onClick={() => replayTrade('sell')} className="px-3 py-2 bg-red-600 text-white rounded disabled:opacity-50">Sell at Close</button>
              <button onClick={() => fetch(`${API}/replay/hold`, { method: 'POST' })} className="px-3 py-2 bg-slate-200 rounded">Hold</button>
            </div>
            {replay && replay.status !== 'none' ? (
              <div className="text-sm text-slate-600">
                <span className="font-semibold">{replay.instrument}</span> — {replay.source} | Progress{' '}
                {replay.currentIndex + 1}/{replay.total} | Current close: ₹{formatPrice(replay.current?.close)} on {replay.current?.date}
                <div className="mt-2">
                  <ReplayChart candles={replay.revealed} />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Latest: O {formatPrice(replay.current?.open)} H {formatPrice(replay.current?.high)} L{' '}
                  {formatPrice(replay.current?.low)} C {formatPrice(replay.current?.close)}
                </div>
                <p className="mt-2 text-[11px] text-amber-700">
                  Historical replay prices are dated CSV closes, not live market prices. Replay orders are
                  recorded with priceSource “historical_replay”.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                Start the replay to reveal historical NIFTYBEES candles (first row is 2026-04-27).
              </p>
            )}
          </Card>
        </>
      )}

      <Card>
        <h2 className="font-semibold mb-3">Holdings</h2>
        {(!portfolio?.holdings || portfolio.holdings.length === 0) ? (
          <div className="text-slate-500 text-sm">No holdings yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>Symbol</th><th>Qty</th><th>Avg Cost</th><th>Price</th><th>Source</th><th>Market Value</th><th>Unrealized P&L</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((holding) => (
                  <tr key={holding.symbol} className="border-t">
                    <td>{holding.symbol}</td>
                    <td>{holding.quantity}</td>
                    <td>₹{formatPrice(holding.avgCost)}</td>
                    <td>₹{formatPrice(holding.currentPrice)}</td>
                    <td className="text-xs text-slate-500">
                      {sourceLabel(holding.priceSource)}
                      {holding.stale ? ' · STALE' : ''}
                    </td>
                    <td>₹{formatPrice(holding.marketValue)}</td>
                    <td>₹{formatPrice(holding.unrealizedPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {portfolio?.valuationUpdatedAt && (
          <p className="mt-2 text-[11px] text-slate-400">
            Portfolio revalued at {formatDateTime(portfolio.valuationUpdatedAt)} from the latest available prices.
          </p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-3">Trade History</h2>
        {history.length === 0 ? (
          <div className="text-slate-500 text-sm">No trades yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th>Side</th><th>Symbol</th><th>Qty</th><th>Price</th><th>Source</th><th>Total</th><th>Executed</th>
                </tr>
              </thead>
              <tbody>
                {history.map((trade, index) => (
                  <tr key={`${trade.at}-${index}`} className="border-t">
                    <td>{trade.type}</td>
                    <td>{trade.symbol}</td>
                    <td>{trade.quantity}</td>
                    <td>₹{formatPrice(trade.price)}</td>
                    <td className="text-xs text-slate-500">
                      {sourceLabel(trade.priceSource)}
                      {trade.stale ? ' · STALE' : ''}
                    </td>
                    <td>₹{formatPrice(trade.total)}</td>
                    <td className="text-xs text-slate-500">{formatDateTime(trade.executedAt || trade.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
