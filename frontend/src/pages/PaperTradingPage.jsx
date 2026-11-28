import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CandlestickChart,
  CheckCircle2,
  History,
  Loader2,
  Radio,
  RefreshCw,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import ReplayChart, { normalizeCandles } from '../components/charts/ReplayChart';
import { aggregateCandles } from '../utils/candles';
import { apiUrl, wsUrl } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const API = '/api/paper-trading';

const MARKETS = [
  {
    id: 'practice',
    label: 'Practice market',
    icon: Sparkles,
    hint: 'Made-up companies whose prices move every second, day or night. Best for learning how buying and selling feels.',
  },
  {
    id: 'live',
    label: 'Real market',
    icon: Radio,
    hint: 'Real NSE prices. They only move while the market is open (9:15 AM to 3:30 PM on trading days).',
  },
  {
    id: 'replay',
    label: 'Replay the past',
    icon: History,
    hint: 'Step through real past prices one day at a time and practise deciding.',
  },
];

// Candle sizes for second-by-second markets.
const PRACTICE_INTERVALS = [
  { id: '5s', label: '5 sec', ms: 5_000 },
  { id: '15s', label: '15 sec', ms: 15_000 },
  { id: '1m', label: '1 min', ms: 60_000 },
  { id: '5m', label: '5 min', ms: 300_000 },
];
const LIVE_INTERVALS = [
  { id: '1m', label: '1 min', ms: 60_000 },
  { id: '5m', label: '5 min', ms: 300_000 },
  { id: '15m', label: '15 min', ms: 900_000 },
];

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
  if (source === 'practice_market') return 'Practice market';
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

  const [realSymbol, setRealSymbol] = useState('NIFTYBEES');
  const [practiceSymbol, setPracticeSymbol] = useState('PRAC-NIFTY');
  const [practiceOrder, setPracticeOrder] = useState([]);
  const [practiceQuotes, setPracticeQuotes] = useState({});
  const [practiceCandles, setPracticeCandles] = useState({});
  const practiceQuotesRef = useRef({});
  const practiceCandlesRef = useRef({});
  const [practiceInterval, setPracticeInterval] = useState('15s');
  const [liveInterval, setLiveInterval] = useState('1m');
  const [quantity, setQuantity] = useState('1');
  const [allowStale, setAllowStale] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [mode, setMode] = useState('learn');
  const [dataMode, setDataMode] = useState('practice');
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
      const [instRes, portRes, histRes, replayRes] = await Promise.all([
        paperFetch(`/instruments`),
        paperFetch(`/portfolio`),
        paperFetch(`/history`),
        paperFetch(`/replay`),
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
      const practice = inst.practiceInstruments || [];
      setPracticeOrder(practice.map((item) => item.symbol));
      for (const quote of practice) {
        practiceQuotesRef.current[quote.symbol] = {
          ...quote,
          ...(practiceQuotesRef.current[quote.symbol] || {}),
        };
      }
      setPracticeQuotes({ ...practiceQuotesRef.current });
      if (inst.marketFeed) setMarketStatus(inst.marketFeed);
      setPortfolio(port);
      setHistory(hist.history || []);
      setRealSymbol((current) => current || inst.instruments?.[0]?.symbol || 'NIFTYBEES');
      setPracticeSymbol((current) => current || practice[0]?.symbol || 'PRAC-NIFTY');
      // Pick up a replay left running from an earlier visit.
      if (replayRes.ok) {
        const savedReplay = await replayRes.json().catch(() => null);
        if (savedReplay && savedReplay.status && savedReplay.status !== 'none') setReplay(savedReplay);
      }
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

    let practiceDirty = false;
    const flushTimer = setInterval(() => {
      if (cancelled) return;
      setLiveTicks({ ...liveTicksRef.current });
      setLiveCandles({ ...liveCandlesRef.current });
      if (practiceDirty) {
        practiceDirty = false;
        setPracticeQuotes({ ...practiceQuotesRef.current });
        setPracticeCandles({ ...practiceCandlesRef.current });
      }
    }, 500);

    // Practice-market ticks: one message a second with every instrument.
    const applyPracticeTicks = (ticks) => {
      for (const tick of ticks || []) {
        if (!tick?.symbol) continue;
        const previous = practiceQuotesRef.current[tick.symbol];
        const direction =
          previous && Number.isFinite(previous.price) && tick.price !== previous.price
            ? tick.price > previous.price
              ? 'up'
              : 'down'
            : previous?.direction || null;
        practiceQuotesRef.current[tick.symbol] = { ...tick, direction };
        const candle = tick.candle;
        if (candle && Number.isFinite(Number(candle.time))) {
          const rows = (practiceCandlesRef.current[tick.symbol] || []).slice();
          const last = rows[rows.length - 1];
          if (last && last.time === candle.time) rows[rows.length - 1] = candle;
          else if (!last || candle.time > last.time) rows.push(candle);
          while (rows.length > 1_440) rows.shift();
          practiceCandlesRef.current[tick.symbol] = rows;
        }
      }
      practiceDirty = true;
    };

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
        case 'practice_ticks':
          applyPracticeTicks(message.ticks);
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

  // Load the full candle history for the practice instrument being viewed; the
  // socket then keeps it growing every second.
  useEffect(() => {
    if (!practiceSymbol) return undefined;
    let active = true;
    fetch(apiUrl(`${API}/practice/candles/${encodeURIComponent(practiceSymbol)}`))
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!active || !Array.isArray(body?.candles)) return;
        const fetched = body.candles;
        const streamed = practiceCandlesRef.current[practiceSymbol] || [];
        const lastFetched = fetched[fetched.length - 1]?.time ?? -Infinity;
        practiceCandlesRef.current[practiceSymbol] = [
          ...fetched,
          ...streamed.filter((row) => row.time > lastFetched),
        ];
        setPracticeCandles({ ...practiceCandlesRef.current });
      })
      .catch(() => {
        // The chart fills from the live stream instead.
      });
    return () => {
      active = false;
    };
  }, [practiceSymbol]);

  const isPractice = dataMode === 'practice';
  const symbol = isPractice ? practiceSymbol : realSymbol;
  const setSymbol = isPractice ? setPracticeSymbol : setRealSymbol;
  const practiceList = practiceOrder.map((key) => practiceQuotes[key]).filter(Boolean);
  const practiceQuote = isPractice ? practiceQuotes[symbol] || null : null;

  const instrument = isPractice
    ? practiceQuote
    : instruments.find((item) => item.symbol === symbol) || null;
  const liveTick = !isPractice && symbol ? liveTicks[symbol] : null;
  const livePrice = liveTick ? Number(liveTick.ltp) : null;
  const hasLivePrice = Number.isFinite(livePrice) && livePrice > 0;
  const displayedPrice = isPractice
    ? practiceQuote?.price ?? null
    : hasLivePrice
      ? livePrice
      : instrument?.price ?? null;
  const previousClose = Number(
    (isPractice ? practiceQuote?.previousClose : liveTick?.previousClose ?? instrument?.previousClose) ?? 0
  );
  const hasPreviousClose = Number.isFinite(previousClose) && previousClose > 0;
  const change =
    (isPractice ? Number.isFinite(Number(displayedPrice)) : hasLivePrice) && hasPreviousClose
      ? Number(displayedPrice) - previousClose
      : null;
  const changePct =
    change !== null && hasPreviousClose ? (change / previousClose) * 100 : null;

  const marketClosed = !isPractice && Boolean(marketStatus?.marketStatus?.isClosed);
  const marketOpen = Boolean(marketStatus?.marketStatus?.isOpen);
  const tickBasis = liveTick
    ? Date.parse(liveTick.receivedAt || '') || Number(liveTick.timestamp) || null
    : null;
  const clientStale = Boolean(
    tickBasis && !marketClosed && Date.now() - tickBasis > 60_000
  );
  const stale =
    !isPractice && Boolean(marketStatus?.stale || clientStale || instrument?.stale);

  const chip = isPractice
    ? socketState === 'open'
      ? { label: 'Practice market open · prices move every second', tone: 'green' }
      : { label: 'Connecting to the practice market…', tone: 'amber' }
    : statusChip({ marketStatus, socketState, stale, livePrice: hasLivePrice });
  const badgeVariant =
    chip.tone === 'green'
      ? 'green'
      : chip.tone === 'amber'
        ? 'amber'
        : chip.tone === 'rose'
          ? 'rose'
          : 'slate';

  const priceSource = isPractice
    ? 'Practice market price'
    : hasLivePrice
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

  const liveIntervalMs = (LIVE_INTERVALS.find((item) => item.id === liveInterval) || LIVE_INTERVALS[0]).ms;
  const liveChartCandles = useMemo(() => {
    const rows = (liveCandles[symbol] || []).map((row) => ({ ...row, time: Date.parse(row.date) }));
    return normalizeCandles(aggregateCandles(rows, liveIntervalMs));
  }, [liveCandles, symbol, liveIntervalMs]);

  const practiceIntervalMs = (
    PRACTICE_INTERVALS.find((item) => item.id === practiceInterval) || PRACTICE_INTERVALS[0]
  ).ms;
  const practiceChartCandles = useMemo(
    () => normalizeCandles(aggregateCandles(practiceCandles[symbol] || [], practiceIntervalMs)),
    [practiceCandles, symbol, practiceIntervalMs]
  );

  const chartCandles =
    dataMode === 'replay'
      ? visibleCandles
      : isPractice
        ? practiceChartCandles
        : liveChartCandles;
  const chartViewKey = `${dataMode}:${symbol}:${
    dataMode === 'replay' ? timeframe : isPractice ? practiceInterval : liveInterval
  }`;
  const chartShowsSeconds = isPractice && practiceIntervalMs < 60_000;
  const chartEmptyMessage =
    dataMode === 'replay'
      ? 'Press “Start replay” to see past prices.'
      : isPractice
        ? 'Loading the practice market…'
        : marketClosed
          ? 'The real market is closed, so there are no new candles. Switch to the Practice market to trade with prices that move right now.'
          : 'Waiting for live prices. The chart fills in while the market is open.';

  // Value holdings with the freshest price we have (practice prices change every
  // second), so profit and loss move with the market instead of every few seconds.
  const pricedHoldings = useMemo(
    () =>
      (portfolio?.holdings || []).map((holding) => {
        const fresh = Number(
          practiceQuotes[holding.symbol]?.price ?? liveTicks[holding.symbol]?.ltp
        );
        if (!Number.isFinite(fresh) || fresh <= 0) return holding;
        const round2 = (value) => Math.round(value * 100) / 100;
        return {
          ...holding,
          currentPrice: fresh,
          marketValue: round2(fresh * holding.quantity),
          unrealizedPnl: round2((fresh - holding.avgCost) * holding.quantity),
        };
      }),
    [portfolio, practiceQuotes, liveTicks]
  );
  const holdingsValue = pricedHoldings.reduce((sum, item) => sum + Number(item.marketValue || 0), 0);
  const unrealizedTotal = pricedHoldings.reduce((sum, item) => sum + Number(item.unrealizedPnl || 0), 0);
  const totalWorth = portfolio ? Number(portfolio.cash || 0) + holdingsValue : null;
  const replayStarted = Boolean(replay && replay.status && replay.status !== 'none');
  const replayCanAdvance = replayStarted && replay.status !== 'completed';

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

  const watchlistRows = isPractice
    ? practiceList.map((item) => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        changePct: item.changePct,
        direction: item.direction,
        live: false,
        watchOnly: false,
      }))
    : [
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
      ? `${change >= 0 ? '+' : '−'}₹${formatPrice(Math.abs(change))} (${change >= 0 ? '+' : '−'}${Math.abs(changePct).toFixed(2)}%) ${isPractice ? 'since the session started' : 'today'}`
      : null;

  // Replay picks how many days to show; second-by-second markets pick how much
  // time each candle covers.
  const rangeOptions =
    dataMode === 'replay'
      ? TIMEFRAMES.map((item) => ({ id: item.id, label: item.id }))
      : isPractice
        ? PRACTICE_INTERVALS
        : LIVE_INTERVALS;
  const rangeValue = dataMode === 'replay' ? timeframe : isPractice ? practiceInterval : liveInterval;
  const setRangeValue =
    dataMode === 'replay' ? setTimeframe : isPractice ? setPracticeInterval : setLiveInterval;
  const timeframeButtons = (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={dataMode === 'replay' ? 'Chart time range' : 'Candle size'}>
      {dataMode !== 'replay' && (
        <span className="mr-1 text-[11px] font-medium text-slate-400">Each candle =</span>
      )}
      {rangeOptions.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => setRangeValue(item.id)}
          aria-pressed={rangeValue === item.id}
          className={`press px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
            rangeValue === item.id
              ? 'bg-genie-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {item.label}
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
            sell. Use the practice market any time, or real Indian share prices while the market is
            open. No real money or real orders are ever involved, so mistakes cost nothing.
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
          { label: 'Total worth', value: formatMoney(totalWorth === null ? null : Math.round(totalWorth * 100) / 100), hint: 'Cash + value of what you own' },
          { label: 'Profit from sales', value: formatSignedMoney(portfolio?.realizedPnl), tone: pnlTone(portfolio?.realizedPnl), hint: 'Gain or loss on things you sold' },
          { label: 'Profit on holdings', value: formatSignedMoney(Math.round(unrealizedTotal * 100) / 100), tone: pnlTone(unrealizedTotal), hint: 'If you sold everything now' },
        ].map((stat) => (
          <Card key={stat.label} padding="sm" className="lift">
            <div className="text-xs font-medium text-slate-500">{stat.label}</div>
            <div className={`mt-1 text-xl font-bold tracking-tight ${stat.tone || 'text-navy-950'}`}>
              {stat.value}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{stat.hint}</div>
          </Card>
        ))}
      </div>

      {/* Which market to trade in */}
      <div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label="Choose a market">
          {MARKETS.map((item) => {
            const Icon = item.icon;
            const selected = dataMode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDataMode(item.id);
                  setOrderError('');
                  setFeedback('');
                }}
                aria-pressed={selected}
                className={`pop-group press flex items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                  selected
                    ? 'border-genie-400 bg-genie-50/70 ring-2 ring-genie-100'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className={`icon-pop h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    selected ? 'bg-genie-600 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  <Icon className="m-auto" style={{ width: 18, height: 18 }} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-navy-950">{item.label}</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Practice market tickers */}
      {isPractice && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {practiceList.map((item) => {
            const up = Number(item.changePct) >= 0;
            const selected = item.symbol === symbol;
            return (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setSymbol(item.symbol)}
                aria-pressed={selected}
                className={`lift press rounded-xl border bg-white p-3 text-left ${
                  selected ? 'border-genie-400 ring-2 ring-genie-100' : 'border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[11px] font-bold text-navy-900">{item.symbol}</span>
                  {up ? (
                    <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 shrink-0 text-rose-600" />
                  )}
                </div>
                <div className="truncate text-[10px] text-slate-400">{item.kind}</div>
                <div
                  key={`${item.symbol}-${item.price}`}
                  className={`mt-1 rounded px-0.5 text-base font-bold tabular-nums text-navy-950 ${
                    item.direction === 'up' ? 'tick-up' : item.direction === 'down' ? 'tick-down' : ''
                  }`}
                >
                  ₹{formatPrice(item.price)}
                </div>
                <div className={`text-[11px] font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {up ? '+' : '−'}
                  {Math.abs(Number(item.changePct) || 0).toFixed(2)}%
                </div>
              </button>
            );
          })}
        </div>
      )}

      {dataMode !== 'replay' && (
      <>
      {/* Live price */}
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold text-navy-950">{symbol || 'NIFTYBEES'}</h2>
              <Badge variant={hasLivePrice || isPractice ? 'green' : 'amber'} size="xs">
                {priceSource}
              </Badge>
              {stale && <Badge variant="amber" size="xs">Delayed</Badge>}
              {marketClosed && <Badge variant="slate" size="xs">Market closed</Badge>}
            </div>
            <p className="text-xs text-slate-500 mt-1">
              {instrument?.name || 'Nippon India ETF Nifty 50 BeES'}
            </p>
            {isPractice && instrument?.description && (
              <p className="mt-0.5 text-[11px] text-slate-400">
                {instrument.description} A made-up company used only for practice.
              </p>
            )}
          </div>
          <div className="text-right">
            <div
              key={isPractice ? `${symbol}-${displayedPrice}` : symbol}
              className={`rounded-md px-1 text-3xl font-extrabold tabular-nums tracking-tight text-navy-950 ${
                isPractice && practiceQuote?.direction === 'up'
                  ? 'tick-up'
                  : isPractice && practiceQuote?.direction === 'down'
                    ? 'tick-down'
                    : ''
              }`}
            >
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
          {(isPractice
            ? [
                { label: 'Opened at', value: practiceQuote?.open },
                { label: 'Highest so far', value: practiceQuote?.high },
                { label: 'Lowest so far', value: practiceQuote?.low },
                { label: 'Starting price', value: hasPreviousClose ? previousClose : undefined },
              ]
            : [
                { label: "Today's open", value: liveTick?.open },
                { label: "Today's high", value: liveTick?.high },
                { label: "Today's low", value: liveTick?.low },
                { label: "Yesterday's close", value: hasPreviousClose ? previousClose : undefined },
              ]
          ).map((item) => (
            <div key={item.label}>
              <div className="text-[11px] text-slate-500">{item.label}</div>
              <div className="font-semibold tabular-nums text-navy-900">
                {item.value !== undefined && item.value !== null ? `₹${formatPrice(item.value)}` : '—'}
              </div>
            </div>
          ))}
        </div>

        {!isPractice && (
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
        )}

        {isPractice && (
          <div className="mt-3 rounded-lg border border-genie-200 bg-genie-50/60 px-3 py-2 text-xs text-genie-900">
            Practice market prices are simulated: they move every second like a real market, but
            the companies are made up and nothing here predicts real share prices.
          </div>
        )}

        {!isPractice && marketStatus?.failureReason && (
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
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <span>
              The stock market is closed now (it is open 9:15 AM to 3:30 PM on trading days). You are
              seeing the last price from when it was open.
            </span>
            <button
              type="button"
              onClick={() => setDataMode('practice')}
              className="press rounded-md bg-genie-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-genie-700"
            >
              Try the practice market
            </button>
          </div>
        )}

        {!isPractice && !hasLivePrice && !marketClosed && marketStatus?.state !== 'auth_failed' && !marketStatus?.failureReason && (
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
              {isPractice ? 'Practice company' : 'Share or ETF'}
            </label>
            <select
              id="paper-symbol"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-navy-900 focus:border-genie-500 focus:outline-none focus:ring-2 focus:ring-genie-100"
            >
              {isPractice
                ? practiceList.map((item) => (
                    <option key={item.symbol} value={item.symbol}>
                      {item.symbol} · {item.name}
                    </option>
                  ))
                : instruments.map((item) => (
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
      </>
      )}

      {/* Replay controls (replay mode only) */}
      {dataMode === 'replay' && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <h2 className="text-base font-semibold text-navy-950">Replay the past</h2>
              <p className="text-xs text-slate-500 max-w-xl">
                See real NIFTYBEES prices from the past one day at a time. Decide to buy, sell or
                wait, then reveal the next day to see what happened.
              </p>
            </div>
            {replayStarted && (
              <Badge variant="slate" size="xs">
                Day {replay.currentIndex + 1} of {replay.total}
              </Badge>
            )}
          </div>
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <button type="button" onClick={startReplay} className="press rounded-lg bg-navy-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-navy-800">
              {replayStarted ? 'Restart replay' : 'Start replay'}
            </button>
            <button
              type="button"
              disabled={!replayCanAdvance}
              onClick={nextCandle}
              className="press rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next day
            </button>
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              Units
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-navy-900 focus:border-genie-500 focus:outline-none focus:ring-2 focus:ring-genie-100"
              />
            </label>
            <button type="button" disabled={submitting || !replayStarted} onClick={() => replayTrade('buy')} className="press rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
              Buy at day&apos;s close
            </button>
            <button type="button" disabled={submitting || !replayStarted} onClick={() => replayTrade('sell')} className="press rounded-lg bg-rose-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50">
              Sell at day&apos;s close
            </button>
            <button
              type="button"
              disabled={!replayCanAdvance}
              onClick={async () => {
                await nextCandle();
                setFeedback('You chose to wait. No trade was made, so here is the next day.');
              }}
              className="press rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-navy-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Wait (no trade)
            </button>
          </div>
          {replayStarted ? (
            <div className="text-sm text-slate-600">
              <p>
                <span className="font-semibold text-navy-900">{replay.instrument}</span> closed at{' '}
                <strong className="text-navy-900">₹{formatPrice(replay.current?.close)}</strong> on {replay.current?.date}.
              </p>
              <div className="text-xs text-slate-500 mt-1">
                That day: opened ₹{formatPrice(replay.current?.open)}, high ₹{formatPrice(replay.current?.high)}, low ₹
                {formatPrice(replay.current?.low)}, closed ₹{formatPrice(replay.current?.close)}
              </div>
              {replay.status === 'completed' && (
                <p className="mt-2 text-xs font-medium text-navy-900">
                  You reached the last day of the data. Press &ldquo;Restart replay&rdquo; to go again.
                </p>
              )}
              <p className="mt-2 text-[11px] text-amber-700">
                These are real past prices, not today&apos;s. Replay trades are marked as replay in your history.
              </p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Press &ldquo;Start replay&rdquo; to see the first day. The other buttons switch on once it starts.</p>
          )}
          {orderMessages}
        </Card>
      )}

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
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span
                      key={`${item.symbol}-${item.price}`}
                      className={`rounded px-0.5 tabular-nums ${
                        item.direction === 'up' ? 'tick-up' : item.direction === 'down' ? 'tick-down' : ''
                      }`}
                    >
                      ₹{formatPrice(item.price)}
                      {item.watchOnly && ' • view only'}
                    </span>
                    {item.changePct !== undefined && (
                      <span className={`font-semibold tabular-nums ${Number(item.changePct) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {Number(item.changePct) >= 0 ? '+' : '−'}
                        {Math.abs(Number(item.changePct) || 0).toFixed(2)}%
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </Card>

          <Card className="flex flex-col min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-navy-950">{symbol}</span>
                <Badge variant={dataMode === 'replay' ? 'amber' : 'green'} size="xs">
                  {dataMode === 'replay'
                    ? 'Past prices · daily candles'
                    : isPractice
                      ? 'Practice market · updates every second'
                      : 'Real market · live candles'}
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
                <ReplayChart
                  candles={chartCandles}
                  chartType={chartType}
                  viewKey={chartViewKey}
                  showSeconds={chartShowsSeconds}
                />
              ) : (
                <ChartEmptyState message={chartEmptyMessage} />
              )}
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
                  {dataMode === 'replay'
                    ? 'Each candle is one day of past prices from the replay.'
                    : 'Each candle shows where the price started, its highest and lowest point, and where it ended in that time. Green means it went up, red means it went down.'}
                </p>
              </div>
              {timeframeButtons}
            </div>
            {chartCandles.length > 0 ? (
              <ReplayChart
                candles={chartCandles}
                chartType={chartType}
                viewKey={chartViewKey}
                showSeconds={chartShowsSeconds}
              />
            ) : (
              <ChartEmptyState message={chartEmptyMessage} />
            )}
          </Card>

        </>
      )}

      {/* Holdings */}
      <Card>
        <h2 className="text-base font-semibold text-navy-950 mb-3">What you own</h2>
        {pricedHoldings.length === 0 ? (
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
                {pricedHoldings.map((holding) => (
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
