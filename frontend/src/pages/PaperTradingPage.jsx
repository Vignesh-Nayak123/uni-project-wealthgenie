import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CandlestickChart, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import ReplayChart, { normalizeCandles } from '../components/charts/ReplayChart';
import { apiUrl, wsUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';

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
  maximumFractionDigits: 0,
});

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  return Number.isFinite(number) ? PRICE_FORMATTER.format(number) : '—';
}

// Whole rupees stay clean (₹94,200); anything with paise always shows two
// decimals (₹99,952.20), never one.
function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '₹—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '₹—';
  return Number.isInteger(number)
    ? `₹${MONEY_FORMATTER.format(number)}`
    : `₹${PRICE_FORMATTER.format(number)}`;
}

// Signed amounts read as "−₹4,665.60" / "+₹120.00", never "₹-4,665.6".
function formatSignedMoney(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return '₹—';
  const sign = number > 0 ? '+' : number < 0 ? '−' : '';
  return `${sign}₹${PRICE_FORMATTER.format(Math.abs(number))}`;
}

function pnlTone(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) return 'text-navy-950';
  return number > 0 ? 'text-emerald-600' : 'text-rose-600';
}

function ChartEmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center">
      <CandlestickChart className="h-7 w-7 text-slate-300" aria-hidden="true" />
      <p className="max-w-sm text-sm text-slate-500">{message}</p>
    </div>
  );
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
  if (source === 'upstox_v3') return 'Live price';
  if (source === 'historical_replay' || source === 'historical_csv') {
    return 'Past price (replay)';
  }
  if (source === 'simulated_fixture') return 'Practice price (not live)';
  return source || 'Unknown';
}

function statusChip({ marketStatus, socketState, stale, livePrice }) {
  if (!marketStatus && socketState === 'closed') {
    return { label: 'Reconnecting to live prices…', tone: 'rose' };
  }
  if (!marketStatus) {
    return { label: 'Connecting to live prices…', tone: 'amber' };
  }
  if (socketState === 'closed') {
    return { label: 'Reconnecting to live prices…', tone: 'rose' };
  }

  switch (marketStatus.state) {
    case 'not_configured':
    case 'disabled':
      return { label: 'Live prices off · practice prices in use', tone: 'slate' };
    case 'auth_failed':
      return { label: 'Live prices unavailable', tone: 'rose' };
    case 'subscription_failed':
      return { label: 'Live prices unavailable', tone: 'rose' };
    case 'connecting':
      return { label: 'Connecting to live prices…', tone: 'amber' };
    case 'disconnected':
      return { label: 'Live prices disconnected', tone: 'rose' };
    case 'market_closed':
      return {
        label: 'Market closed',
        tone: 'slate',
      };
    case 'stale':
      return { label: 'Prices delayed', tone: 'amber' };
    case 'waiting':
      return { label: 'Waiting for the first live price', tone: 'amber' };
    case 'live':
      return stale || !livePrice
        ? { label: 'Prices delayed', tone: 'amber' }
        : { label: 'Live prices', tone: 'green' };
    default:
      return { label: 'Live prices unavailable', tone: 'slate' };
  }
}

export default function PaperTradingPage() {
  const { session, handleUnauthorized } = useAuth();
  // Every paper-trading account is private to the signed-in user, so each
  // request carries the session token.
  const paperFetch = async (path, init = {}) => {
    const response = await fetch(apiUrl(`${API}${path}`), {
      ...init,
      headers: {
        ...(init.headers || {}),
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
    });
    if (response.status === 401 && handleUnauthorized) {
      await handleUnauthorized({ status: 401 });
    }
    return response;
  };
  // The WebSocket effect below is mounted once; this ref always points at the
  // latest paperFetch (and therefore the current session token).
  const paperFetchRef = useRef(paperFetch);
  paperFetchRef.current = paperFetch;
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
      const initRes = await paperFetch(`/init`, { method: 'POST' });
      if (!initRes.ok) {
        const body = await initRes.json().catch(() => ({}));
        throw new Error(body.error || `Init failed (${initRes.status})`);
      }
      const [instRes, portRes, histRes] = await Promise.all([
        paperFetch(`/instruments`),
        paperFetch(`/portfolio`),
        paperFetch(`/history`),
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
    let revalueTimer = null;
    let attempt = 0;

    // Live ticks change holding values, so re-read this user's own portfolio
    // over the authenticated API at most every few seconds.
    const scheduleRevalue = () => {
      if (revalueTimer || cancelled) return;
      revalueTimer = setTimeout(async () => {
        revalueTimer = null;
        try {
          const response = await paperFetchRef.current('/portfolio');
          if (response.ok && !cancelled) setPortfolio(await response.json());
        } catch {
          // The next tick tries again; the order panel refreshes on its own.
        }
      }, 5000);
    };

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
          scheduleRevalue();
          break;
        case 'ticks':
          // Backwards-compatible with older backend frames.
          for (const tick of message.ticks || []) applyTick(tick);
          break;
        default:
          break;
      }
    };

    const connect = () => {
      if (cancelled) return;
      setSocketState(attempt === 0 ? 'connecting' : 'reconnecting');
      try {
        ws = new WebSocket(wsUrl('/ws/market'));
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
      if (revalueTimer) clearTimeout(revalueTimer);
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
    ? 'Live price'
    : instrument?.isLive
      ? 'Last live price'
      : 'Practice price';

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
      ? 'Start the replay to see past prices.'
      : 'Waiting for live prices. The chart fills in while the market is open.';

  const handleOrder = async (side) => {
    setOrderError('');
    setFeedback('');
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setOrderError('Enter how many units you want, as a whole number (1 or more).');
      return;
    }
    if (!Number.isFinite(Number(displayedPrice)) || Number(displayedPrice) <= 0) {
      setOrderError('There is no price available right now, so the order was not placed.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await paperFetch(`/${side}`, {
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
      const historyResponse = await paperFetch(`/history`);
      const historyBody = await historyResponse.json();
      setHistory(historyBody.history || []);
      const executedAt = body.trade?.executedAt || body.trade?.at;
      setFeedback(
        `${side === 'buy' ? 'Bought' : 'Sold'} ${parsedQuantity} ${symbol} at ₹${formatPrice(
          body.trade.price
        )} (${sourceLabel(body.trade.priceSource).toLowerCase()}${
          body.trade.stale ? ', last known price' : ''
        }) on ${formatDateTime(executedAt)}.`
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
      const response = await paperFetch(`/init`, { method: 'POST' });
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
      const response = await paperFetch(`/replay/start`, { method: 'POST' });
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
      const response = await paperFetch(`/replay/next`, { method: 'POST' });
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
      setOrderError('Enter how many units you want, as a whole number (1 or more).');
      return;
    }
    setSubmitting(true);
    try {
      const response = await paperFetch(`/replay/trade`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ side, quantity: parsedQuantity }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Order failed');
      setPortfolio(body.account);
      const [historyResponse, replayResponse] = await Promise.all([
        paperFetch(`/history`),
        paperFetch(`/replay`),
      ]);
      const historyBody = await historyResponse.json();
      setHistory(historyBody.history || []);
      setReplay(await replayResponse.json());
      setFeedback(
        `Replay: ${side === 'buy' ? 'bought' : 'sold'} ${parsedQuantity} ${
          replay?.instrument || 'NIFTYBEES'
        } at that day's closing price of ₹${formatPrice(body.trade.price)}.`
      );
    } catch (e) {
      setOrderError(e.message || 'Server error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-genie-600" />
        Opening your practice account...
      </div>
    );
  }
  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
        <h2 className="mt-3 text-base font-bold text-navy-950">
          Your practice account could not be opened
        </h2>
        <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">{error}</p>
        <button
          type="button"
          onClick={loadAll}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </button>
      </Card>
    );
  }

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

  const changeText =
    change !== null
      ? `${change >= 0 ? '+' : '−'}₹${formatPrice(Math.abs(change))} (${change >= 0 ? '+' : '−'}${Math.abs(changePct).toFixed(2)}%) today`
      : null;

  const timeframeButtons = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Chart time range">
      {TIMEFRAMES.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setTimeframe(item.id)}
          aria-pressed={timeframe === item.id}
          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            timeframe === item.id
              ? 'bg-genie-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {item.id}
        </button>
      ))}
    </div>
  );

  const orderMessages = (
    <>
      {feedback && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}
      {orderError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{orderError}</span>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-genie-700 uppercase tracking-wider mb-1">
            <CandlestickChart className="w-3.5 h-3.5" />
            <span>Practise with virtual money</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-navy-950 tracking-tight">
            Practice Trading
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            You get {formatMoney(portfolio?.initialCash ?? 100000)} of pretend money to buy and
            sell real Indian shares and ETFs. No real money or real orders are ever involved, so
            mistakes cost nothing.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badgeVariant} size="sm">
            <span className={`h-1.5 w-1.5 rounded-full ${chip.tone === 'green' ? 'bg-emerald-500 animate-pulse' : 'bg-current opacity-60'}`} />
            {chip.label}
          </Badge>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="View">
            {[
              { id: 'learn', label: 'Simple view' },
              { id: 'terminal', label: 'Advanced view' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setMode(item.id)}
                aria-pressed={mode === item.id}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  mode === item.id ? 'bg-navy-900 text-white' : 'text-slate-600 hover:text-navy-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Account summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Cash left', value: formatMoney(portfolio?.cash), hint: 'Virtual money you can still use' },
          { label: 'Total worth', value: formatMoney(portfolio?.totalEquity), hint: 'Cash + value of what you own' },
          { label: 'Profit from sales', value: formatSignedMoney(portfolio?.realizedPnl), tone: pnlTone(portfolio?.realizedPnl), hint: 'Gain or loss on things you sold' },
          { label: 'Profit on holdings', value: formatSignedMoney(portfolio?.unrealizedPnl), tone: pnlTone(portfolio?.unrealizedPnl), hint: 'If you sold everything now' },
        ].map((stat) => (
          <Card key={stat.label} padding="sm">
            <div className="text-xs font-medium text-slate-500">{stat.label}</div>
            <div className={`mt-1 text-xl font-bold tracking-tight ${stat.tone || 'text-navy-950'}`}>
              {stat.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{stat.hint}</div>
          </Card>
        ))}
      </div>

      {/* Price data source */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-500">Prices to use:</span>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label="Price data">
          {[
            { id: 'live', label: "Today's market prices" },
            { id: 'replay', label: 'Replay past prices' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setDataMode(item.id)}
              aria-pressed={dataMode === item.id}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                dataMode === item.id ? 'bg-genie-600 text-white' : 'text-slate-600 hover:text-navy-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-500">
          {dataMode === 'live'
            ? 'The chart shows live prices only; past prices are never mixed in.'
            : 'Step through real past prices one day at a time and practise deciding.'}
        </span>
      </div>

      {/* Live price */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-950">{symbol || 'NIFTYBEES'}</h2>
              <Badge variant={hasLivePrice ? 'green' : 'amber'} size="xs">
                {priceSource}
              </Badge>
              {stale && <Badge variant="amber" size="xs">Delayed</Badge>}
              {marketClosed && <Badge variant="slate" size="xs">Market closed</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {instrument?.name || 'Nippon India ETF Nifty 50 BeES'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold tracking-tight text-navy-950">
              ₹{formatPrice(displayedPrice)}
            </div>
            {changeText && (
              <div className={`text-sm font-semibold ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {changeText}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-3 text-sm">
          {[
            { label: "Today's open", value: liveTick?.open },
            { label: "Today's high", value: liveTick?.high },
            { label: "Today's low", value: liveTick?.low },
            { label: "Yesterday's close", value: hasPreviousClose ? previousClose : undefined },
          ].map((item) => (
            <div key={item.label}>
              <div className="text-[11px] text-slate-500">{item.label}</div>
              <div className="font-semibold text-navy-900">
                {item.value !== undefined && item.value !== null ? `₹${formatPrice(item.value)}` : '—'}
              </div>
            </div>
          ))}
        </div>

        <details className="mt-3 text-[11px] text-slate-500">
          <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-navy-900">
            Price feed details
          </summary>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
            <span>
              Last trade: <strong>{liveTick?.lastTradedTime ? formatClock(liveTick.lastTradedTime) : '—'}</strong>
            </span>
            <span>
              Received: <strong>{liveTick?.receivedAt ? formatClock(liveTick.receivedAt) : '—'}</strong>
            </span>
            <span>
              Market status:{' '}
              <strong>
                {marketStatus?.marketStatusKnown
                  ? `${marketStatus.marketStatus?.label || 'Unknown'} (${marketStatus.marketStatus?.nseEqStatus || 'N/A'})`
                  : 'Not known yet'}
              </strong>
            </span>
            <span>
              Connection: <strong>{marketStatus?.connectionState || socketState}</strong>
            </span>
            <span>Source: {hasLivePrice ? 'Upstox market data feed' : 'practice price (not live)'}</span>
          </div>
        </details>

        {marketStatus?.failureReason && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Live prices are not available right now, so practice prices are used instead.
          </div>
        )}

        {stale && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            This price may be out of date. The last update was{' '}
            {liveTick?.receivedAt ? formatDateTime(liveTick.receivedAt) : 'some time ago'}.
            {marketOpen ? ' The market is open, so the live feed may be interrupted.' : ''}
          </div>
        )}

        {marketClosed && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            The stock market is closed now (it is open 9:15 AM to 3:30 PM on trading days). You are
            seeing the last price from when it was open.
          </div>
        )}

        {!hasLivePrice && !marketClosed && marketStatus?.state !== 'auth_failed' && !marketStatus?.failureReason && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Waiting for a live price for {symbol}. Until it arrives, orders use a clearly labelled
            practice price.
          </div>
        )}
      </Card>

      {/* Order panel */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-navy-950">Buy or sell</h2>
            <p className="text-xs text-slate-500">
              Orders use pretend money at the price shown: ₹{formatPrice(displayedPrice)} ({priceSource.toLowerCase()}).
            </p>
          </div>
          <button
            type="button"
            onClick={handleInit}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh account
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-end">
          <div>
            <label htmlFor="paper-symbol" className="block text-xs font-medium text-slate-600 mb-1">
              Share or ETF
            </label>
            <select
              id="paper-symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-900 focus:border-genie-500 focus:outline-none focus:ring-2 focus:ring-genie-100"
            >
              {instruments.map((item) => (
                <option key={item.symbol} value={item.symbol}>
                  {item.symbol} · ₹{formatPrice(item.price)} {item.isLive ? '(live)' : '(practice price)'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="paper-qty" className="block text-xs font-medium text-slate-600 mb-1">
              How many
            </label>
            <input
              id="paper-qty"
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-900 focus:border-genie-500 focus:outline-none focus:ring-2 focus:ring-genie-100"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canOrder}
              onClick={() => handleOrder('buy')}
              className="flex-1 sm:flex-none rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-subtle hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Buy
            </button>
            <button
              type="button"
              disabled={!canOrder}
              onClick={() => handleOrder('sell')}
              className="flex-1 sm:flex-none rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-subtle hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Sell
            </button>
          </div>
        </div>

        {Number(quantity) > 0 && Number.isFinite(Number(displayedPrice)) && (
          <p className="mt-2 text-xs text-slate-500">
            Approximate amount: <strong className="text-navy-900">{formatMoney(Number(quantity) * Number(displayedPrice))}</strong>
          </p>
        )}

        {stale && (
          <label className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={allowStale}
              onChange={(event) => setAllowStale(event.target.checked)}
              className="mt-0.5"
            />
            The price may be out of date. Tick to place this one order at the last known price anyway.
          </label>
        )}
        {orderMessages}
      </Card>

      {mode === 'terminal' && (
        <div className="grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)] gap-4 items-stretch">
          <Card padding="sm" className="lg:max-h-[520px] overflow-y-auto">
            <h2 className="font-semibold text-sm text-navy-950">Watchlist</h2>
            <p className="text-[11px] text-slate-400 mb-2">Tap a name to trade it</p>
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
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-navy-950">{symbol}</span>
                <Badge variant={dataMode === 'live' ? 'green' : 'amber'} size="xs">
                  {dataMode === 'live' ? 'Live · 1-minute candles' : 'Past prices · daily candles'}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {timeframeButtons}
                <span className="mx-1 h-4 w-px bg-slate-200" />
                {[
                  { id: 'candle', label: 'Candles' },
                  { id: 'line', label: 'Line' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setChartType(item.id)}
                    aria-pressed={chartType === item.id}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      chartType === item.id
                        ? 'bg-navy-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {chartCandles.length > 0 ? (
                <ReplayChart candles={chartCandles} chartType={chartType} />
              ) : (
                <ChartEmptyState message={chartEmptyMessage} />
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <button type="button" onClick={startReplay} className="px-3 py-1.5 bg-slate-100 rounded-md font-semibold text-slate-700 hover:bg-slate-200">
                Start replay
              </button>
              <button type="button" onClick={nextCandle} className="px-3 py-1.5 bg-slate-100 rounded-md font-semibold text-slate-700 hover:bg-slate-200">
                Next day
              </button>
              <span>
                {replay && replay.status !== 'none'
                  ? `Day ${replay.currentIndex + 1} of ${replay.total}`
                  : 'Replay not started'}
              </span>
            </div>
          </Card>
        </div>
      )}

      {mode === 'learn' && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-semibold text-navy-950">Price chart</h2>
                <p className="text-xs text-slate-500">
                  {dataMode === 'live'
                    ? 'Each bar is one minute of live trading today.'
                    : 'Each bar is one day of past prices from the replay.'}
                </p>
              </div>
              {timeframeButtons}
            </div>
            {chartCandles.length > 0 ? (
              <ReplayChart candles={chartCandles} chartType={chartType} />
            ) : (
              <ChartEmptyState message={chartEmptyMessage} />
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base font-semibold text-navy-950">Replay the past</h2>
                <p className="text-xs text-slate-500 max-w-xl">
                  See real NIFTYBEES prices from the past one day at a time. Decide to buy, sell or
                  wait, then reveal the next day to see what happened.
                </p>
              </div>
              {replay && replay.status !== 'none' && (
                <Badge variant="slate" size="xs">
                  Day {replay.currentIndex + 1} of {replay.total}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" onClick={startReplay} className="rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800">
                {replay && replay.status !== 'none' ? 'Restart replay' : 'Start replay'}
              </button>
              <button type="button" onClick={nextCandle} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50">
                Next day
              </button>
              <button type="button" disabled={submitting} onClick={() => replayTrade('buy')} className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                Buy at day&apos;s close
              </button>
              <button type="button" disabled={submitting} onClick={() => replayTrade('sell')} className="rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50">
                Sell at day&apos;s close
              </button>
              <button
                type="button"
                onClick={() => {
                  paperFetch(`/replay/hold`, { method: 'POST' });
                  setFeedback('You chose to wait. No trade was made.');
                }}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50"
              >
                Wait (no trade)
              </button>
            </div>
            {replay && replay.status !== 'none' ? (
              <div className="text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-navy-900">{replay.instrument}</span> closed at{' '}
                  <strong className="text-navy-900">₹{formatPrice(replay.current?.close)}</strong> on {replay.current?.date}.
                </p>
                <div className="mt-2">
                  <ReplayChart candles={replay.revealed} />
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  That day: opened ₹{formatPrice(replay.current?.open)}, high ₹{formatPrice(replay.current?.high)}, low ₹
                  {formatPrice(replay.current?.low)}, closed ₹{formatPrice(replay.current?.close)}
                </div>
                <p className="mt-2 text-[11px] text-amber-700">
                  These are real past prices, not today&apos;s. Replay trades are marked as replay in your history.
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Press &ldquo;Start replay&rdquo; to see the first day.</p>
            )}
            {orderMessages}
          </Card>
        </>
      )}

      {/* Holdings */}
      <Card>
        <h2 className="text-base font-semibold text-navy-950 mb-3">What you own</h2>
        {(!portfolio?.holdings || portfolio.holdings.length === 0) ? (
          <p className="text-sm text-slate-500">
            Nothing yet. Buy a few units above to see how their value changes.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-1 py-2 font-medium">Name</th>
                  <th className="px-1 py-2 font-medium text-right">Units</th>
                  <th className="px-1 py-2 font-medium text-right">Avg. buy price</th>
                  <th className="px-1 py-2 font-medium text-right">Price now</th>
                  <th className="px-1 py-2 font-medium text-right">Value now</th>
                  <th className="px-1 py-2 font-medium text-right">Profit / loss</th>
                </tr>
              </thead>
              <tbody>
                {portfolio.holdings.map((holding) => (
                  <tr key={holding.symbol} className="border-b border-slate-100 last:border-0">
                    <td className="px-1 py-2.5">
                      <div className="font-semibold text-navy-900">{holding.symbol}</div>
                      <div className="text-[11px] text-slate-400">
                        {sourceLabel(holding.priceSource)}
                        {holding.stale ? ' · delayed' : ''}
                      </div>
                    </td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{holding.quantity}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">₹{formatPrice(holding.avgCost)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">₹{formatPrice(holding.currentPrice)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">₹{formatPrice(holding.marketValue)}</td>
                    <td className={`px-1 py-2.5 text-right font-semibold tabular-nums ${pnlTone(holding.unrealizedPnl)}`}>
                      {formatSignedMoney(holding.unrealizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {portfolio?.valuationUpdatedAt && (
          <p className="mt-2 text-[11px] text-slate-400">
            Values updated {formatDateTime(portfolio.valuationUpdatedAt)} using the latest prices.
          </p>
        )}
      </Card>

      {/* History */}
      <Card>
        <h2 className="text-base font-semibold text-navy-950 mb-3">Your trades</h2>
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">No trades yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="px-1 py-2 font-medium">Type</th>
                  <th className="px-1 py-2 font-medium">Name</th>
                  <th className="px-1 py-2 font-medium text-right">Units</th>
                  <th className="px-1 py-2 font-medium text-right">Price</th>
                  <th className="px-1 py-2 font-medium text-right">Amount</th>
                  <th className="px-1 py-2 font-medium">Price used</th>
                  <th className="px-1 py-2 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((trade, index) => (
                  <tr key={`${trade.at}-${index}`} className="border-b border-slate-100 last:border-0">
                    <td className="px-1 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          trade.type === 'BUY' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {trade.type === 'BUY' ? 'Bought' : 'Sold'}
                      </span>
                    </td>
                    <td className="px-1 py-2.5 font-medium text-navy-900">{trade.symbol}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">{trade.quantity}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">₹{formatPrice(trade.price)}</td>
                    <td className="px-1 py-2.5 text-right tabular-nums">₹{formatPrice(trade.total)}</td>
                    <td className="px-1 py-2.5 text-xs text-slate-500">
                      {sourceLabel(trade.priceSource)}
                      {trade.stale ? ' · delayed' : ''}
                    </td>
                    <td className="px-1 py-2.5 text-xs text-slate-500">{formatDateTime(trade.executedAt || trade.at)}</td>
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
