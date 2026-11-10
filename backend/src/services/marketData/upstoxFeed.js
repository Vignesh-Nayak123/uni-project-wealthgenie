/**
 * WealthGenie live market-data service — Upstox Market Data Feed V3.
 *
 * Architecture:
 *   Upstox V3 authorize endpoint -> one-time authorised wss:// URL
 *     -> ONE managed backend WebSocket (binary Protobuf frames)
 *     -> validated/normalised ticks -> in-memory snapshots + candles
 *     -> /ws/market broadcast -> Paper Trading UI
 *
 * Credentials stay in the backend process. The access token is never returned
 * by an API, written to a browser bundle, or included in logs.
 *
 * Official references:
 *   https://upstox.com/developer/api-documentation/v3/get-market-data-feed/
 *   https://upstox.com/developer/api-documentation/get-market-data-feed-authorize-v3/
 */
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import protobuf from 'protobufjs';
import WebSocket from 'ws';
import { config } from '../../config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AUTHORIZE_URL =
  'https://api.upstox.com/v3/feed/market-data-feed/authorize';
export const INSTRUMENT_MASTER_URL =
  'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz';
export const PROTO_PATH = path.join(__dirname, 'MarketDataFeedV3.proto');
export const FEED_RESPONSE_TYPE =
  'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse';

/**
 * NIFTYBEES instrument key verified against the official Upstox NSE instrument
 * master on 2026-11-03:
 *   instrument_key: NSE_EQ|INF204KB14I2
 *   trading_symbol: NIFTYBEES
 *   name: NIP IND ETF NIFTY BEES
 * The previous hard-coded key (NSE_EQ|INF202B01AC6) was wrong, which is why
 * the feed connected but never produced a NIFTYBEES tick.
 */
export const NIFTYBEES_INSTRUMENT_KEY = 'NSE_EQ|INF204KB14I2';
export const NIFTYBEES_SYMBOL = 'NIFTYBEES';

/**
 * Candidate watchlist. Every key is re-verified against the official BOD
 * instrument master at startup; symbols are used as a fallback resolution
 * path so an ISIN edit can never silently subscribe to the wrong security.
 */
export const WATCHLIST_CANDIDATES = Object.freeze([
  {
    instrumentKey: NIFTYBEES_INSTRUMENT_KEY,
    symbol: NIFTYBEES_SYMBOL,
    name: 'Nippon India ETF Nifty 50 BeES',
    segment: 'NSE_EQ',
  },
  {
    instrumentKey: 'NSE_INDEX|Nifty 50',
    symbol: 'NIFTY 50',
    name: 'Nifty 50 Index',
    segment: 'NSE_INDEX',
  },
  {
    instrumentKey: 'NSE_EQ|INE002A01018',
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    segment: 'NSE_EQ',
  },
  {
    instrumentKey: 'NSE_EQ|INE467B01029',
    symbol: 'TCS',
    name: 'Tata Consultancy Services Ltd',
    segment: 'NSE_EQ',
  },
  {
    instrumentKey: 'NSE_EQ|INE009A01021',
    symbol: 'INFY',
    name: 'Infosys Ltd',
    segment: 'NSE_EQ',
  },
  {
    instrumentKey: 'NSE_EQ|INE040A01034',
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd',
    segment: 'NSE_EQ',
  },
]);

const OPEN_MARKET_STATUSES = new Set([
  'PRE_OPEN_START',
  'PRE_OPEN_END',
  'NORMAL_OPEN',
  'CLOSING_START',
  'CLOSING_END',
]);
const CLOSED_MARKET_STATUSES = new Set(['NORMAL_CLOSE']);

const MARKET_STATUS_LABELS = Object.freeze({
  PRE_OPEN_START: 'Pre-open',
  PRE_OPEN_END: 'Pre-open',
  NORMAL_OPEN: 'Market open',
  NORMAL_CLOSE: 'Market closed',
  CLOSING_START: 'Closing session',
  CLOSING_END: 'Closing session',
});

export const FEED_STATE_LABELS = Object.freeze({
  not_configured: 'Live feed not configured',
  connecting: 'Connecting to Upstox…',
  live: 'Upstox LIVE',
  waiting: 'Connected — waiting for first tick',
  disconnected: 'Disconnected',
  auth_failed: 'Authentication failed',
  subscription_failed: 'Subscription failed',
  market_closed: 'Market closed',
  stale: 'Stale data',
  disabled: 'Live feed disabled',
});

const DEFAULT_STALE_AFTER_MS = 60_000;
const MAX_CANDLES_PER_KEY = 400;

function timeoutSignal(ms) {
  return typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : undefined;
}

function finiteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function positiveNumber(value) {
  const n = finiteNumber(value);
  return n !== null && n > 0 ? n : null;
}

function toIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function jsonBody(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Build the binary V3 subscription frame (JSON must be sent as bytes). */
export function buildSubscriptionRequest(
  instrumentKeys,
  mode = 'full',
  guid = `wg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
) {
  return Buffer.from(
    JSON.stringify({
      guid,
      method: 'sub',
      data: { mode, instrumentKeys },
    })
  );
}

/**
 * Call the official V3 authorize endpoint. Returns a single-use wss:// URL.
 * Never logs or returns the access token.
 */
export async function authorizeMarketFeed({
  token,
  fetchImpl = globalThis.fetch,
  authorizeUrl = AUTHORIZE_URL,
} = {}) {
  if (!token) {
    const error = new Error(
      'UPSTOX_ACCESS_TOKEN is not configured in the backend environment.'
    );
    error.code = 'AUTH_MISSING';
    throw error;
  }

  let response;
  try {
    response = await fetchImpl(authorizeUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      signal: timeoutSignal(15_000),
    });
  } catch (cause) {
    const error = new Error('Could not reach the Upstox authorization endpoint.');
    error.code = 'AUTH_NETWORK';
    error.cause = cause;
    throw error;
  }

  const text = await response.text();
  const body = jsonBody(text);

  if (response.ok === false) {
    const error = new Error(
      `Upstox authorization failed (HTTP ${response.status}).`
    );
    error.code =
      response.status === 401 || response.status === 403
        ? 'AUTH_FAILED'
        : 'AUTH_HTTP_ERROR';
    error.status = response.status;
    throw error;
  }

  const redirectUri =
    body?.data?.authorized_redirect_uri ||
    body?.data?.authorizedRedirectUri ||
    body?.authorized_redirect_uri ||
    body?.authorizedRedirectUri;

  if (typeof redirectUri !== 'string' || !redirectUri.startsWith('wss://')) {
    const error = new Error(
      'Upstox authorization response did not contain an authorised wss:// URL.'
    );
    error.code = 'AUTH_INVALID_RESPONSE';
    throw error;
  }

  return redirectUri;
}

/** Download and parse the official daily NSE instrument master. */
export async function loadInstrumentMaster({
  fetchImpl = globalThis.fetch,
  url = INSTRUMENT_MASTER_URL,
} = {}) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: '*/*',
      'user-agent': 'WealthGenie/1.0 (educational paper-trading backend)',
    },
    signal: timeoutSignal(30_000),
  });
  if (response.ok === false) {
    throw new Error(`Instrument master download failed (HTTP ${response.status}).`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = url.endsWith('.gz')
    ? zlib.gunzipSync(buffer).toString('utf8')
    : buffer.toString('utf8');
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error('Instrument master is not an array.');
  return rows;
}

/**
 * Resolve candidates against the official master. A known key wins; otherwise
 * the trading symbol is looked up within the same segment. Unknown candidates
 * are dropped rather than guessed.
 */
export function resolveWatchlistFromMaster(
  instruments,
  candidates = WATCHLIST_CANDIDATES
) {
  const byKey = new Map(
    instruments.map((row) => [String(row.instrument_key || ''), row])
  );
  const watchlist = [];
  const missing = [];

  for (const candidate of candidates) {
    const direct = byKey.get(candidate.instrumentKey);
    if (direct) {
      watchlist.push({
        ...candidate,
        instrumentKey: direct.instrument_key,
        name: direct.name || candidate.name,
        verified: true,
        resolvedBy: 'instrument_key',
      });
      continue;
    }

    const segment =
      candidate.segment || String(candidate.instrumentKey).split('|')[0];
    const symbol = String(candidate.symbol || '').toUpperCase();
    const row = instruments.find(
      (item) =>
        String(item.segment || '') === segment &&
        String(item.trading_symbol || '').toUpperCase() === symbol &&
        (segment === 'NSE_INDEX' || item.instrument_type === 'EQ')
    );

    if (row) {
      watchlist.push({
        ...candidate,
        instrumentKey: row.instrument_key,
        name: row.name || candidate.name,
        verified: true,
        resolvedBy: 'trading_symbol',
      });
    } else {
      missing.push(candidate);
    }
  }

  return { watchlist, missing };
}

export function summarizeMarketInfo(marketInfo) {
  const segmentStatus = marketInfo?.segmentStatus || {};
  const nseEqStatus =
    typeof segmentStatus.NSE_EQ === 'string' ? segmentStatus.NSE_EQ : null;
  const nseIndexStatus =
    typeof segmentStatus.NSE_INDEX === 'string'
      ? segmentStatus.NSE_INDEX
      : null;
  const primary = nseEqStatus || nseIndexStatus;

  return {
    known: Boolean(primary),
    status: primary,
    nseEqStatus,
    nseIndexStatus,
    segmentStatus: { ...segmentStatus },
    isOpen: primary ? OPEN_MARKET_STATUSES.has(primary) : false,
    isClosed: primary ? CLOSED_MARKET_STATUSES.has(primary) : false,
    label: primary ? MARKET_STATUS_LABELS[primary] || primary : 'Unknown',
  };
}

/**
 * Normalise one feed entry. Only fields actually present in the Protobuf
 * payload are copied — OHLC is never invented for an LTPC-only feed.
 */
export function normalizeFeedEntry(
  instrumentKey,
  entry,
  meta = {},
  receivedAt = new Date().toISOString()
) {
  const fullFeed = entry?.fullFeed || null;
  const marketFF = fullFeed?.marketFF || null;
  const indexFF = fullFeed?.indexFF || null;
  const firstLevel = entry?.firstLevelWithGreeks || null;
  const ltpc =
    marketFF?.ltpc || indexFF?.ltpc || firstLevel?.ltpc || entry?.ltpc || null;

  const ltp = positiveNumber(ltpc?.ltp);
  if (ltp === null) return null;

  const previousClose = positiveNumber(ltpc?.cp);
  const lastTradedAt = finiteNumber(ltpc?.ltt);
  const receivedTime = toIso(receivedAt) || new Date().toISOString();

  const tick = {
    instrumentKey,
    symbol: meta.symbol || instrumentKey,
    name: meta.name || instrumentKey,
    ltp,
    timestamp:
      lastTradedAt && lastTradedAt > 0
        ? lastTradedAt
        : Date.parse(receivedTime),
    lastTradedTime:
      lastTradedAt && lastTradedAt > 0
        ? new Date(lastTradedAt).toISOString()
        : null,
    receivedAt: receivedTime,
    source: 'upstox_v3',
    isLive: true,
  };

  if (previousClose !== null) tick.previousClose = previousClose;

  const lastTradedQuantity = finiteNumber(ltpc?.ltq);
  if (lastTradedQuantity !== null) tick.lastTradedQuantity = lastTradedQuantity;

  const ohlcRows = marketFF?.marketOHLC?.ohlc || indexFF?.marketOHLC?.ohlc || [];
  const dailyOhlc =
    ohlcRows.find((row) => row.interval === '1d') ||
    ohlcRows.find((row) => row.interval === 'day') ||
    null;
  if (dailyOhlc) {
    const open = positiveNumber(dailyOhlc.open);
    const high = positiveNumber(dailyOhlc.high);
    const low = positiveNumber(dailyOhlc.low);
    const close = positiveNumber(dailyOhlc.close);
    if (open !== null) tick.open = open;
    if (high !== null) tick.high = high;
    if (low !== null) tick.low = low;
    if (close !== null) tick.close = close;
    const volume = finiteNumber(dailyOhlc.vol);
    if (volume !== null) tick.volume = volume;
  }

  const oneMinute =
    ohlcRows.find((row) => row.interval === 'I1') ||
    ohlcRows.find((row) => row.interval === '1m') ||
    null;
  if (oneMinute) {
    tick.intradayOhlc = {
      interval: oneMinute.interval,
      open: finiteNumber(oneMinute.open),
      high: finiteNumber(oneMinute.high),
      low: finiteNumber(oneMinute.low),
      close: finiteNumber(oneMinute.close),
      volume: finiteNumber(oneMinute.vol),
      timestamp: finiteNumber(oneMinute.ts),
    };
  }

  const averageTradedPrice = positiveNumber(marketFF?.atp);
  if (averageTradedPrice !== null) tick.averageTradedPrice = averageTradedPrice;

  const tradedVolume = finiteNumber(marketFF?.vtt);
  if (tradedVolume !== null) tick.tradedVolume = tradedVolume;

  const depth = marketFF?.marketLevel?.bidAskQuote;
  if (Array.isArray(depth) && depth.length > 0) {
    const best = depth[0];
    const bid = positiveNumber(best?.bidP);
    const ask = positiveNumber(best?.askP);
    if (bid !== null) tick.bestBid = bid;
    if (ask !== null) tick.bestAsk = ask;
  }

  return tick;
}

export function decodeFeedResponse(protoRoot, buffer) {
  if (!protoRoot) throw new Error('Protobuf schema is not loaded yet.');
  const FeedResponse = protoRoot.lookupType(FEED_RESPONSE_TYPE);
  const decoded = FeedResponse.decode(buffer);
  return FeedResponse.toObject(decoded, {
    longs: String,
    enums: String,
    defaults: false,
    oneofs: true,
  });
}

export async function loadProtoDefinition(protoPath = PROTO_PATH) {
  return protobuf.load(protoPath);
}

/**
 * A tick is stale only while the market is open (or when market status is
 * unknown). A last-known price after NORMAL_CLOSE is a closing price, not a
 * broken live feed.
 */
export function isDataStale({
  lastTickAt,
  now = Date.now(),
  marketStatus,
  staleAfterMs = DEFAULT_STALE_AFTER_MS,
}) {
  if (!lastTickAt) return false;
  if (marketStatus?.known && marketStatus.isClosed) return false;
  return now - lastTickAt > staleAfterMs;
}

export function deriveFeedState({
  configured,
  connectionState,
  lastTickAt,
  marketStatus,
  stale,
}) {
  if (!configured || connectionState === 'disabled') return 'not_configured';
  if (connectionState === 'authentication_failed') return 'auth_failed';
  if (connectionState === 'subscription_failed') return 'subscription_failed';
  if (
    !connectionState ||
    ['idle', 'authorizing', 'connecting', 'reconnecting'].includes(
      connectionState
    )
  ) {
    return 'connecting';
  }
  if (connectionState === 'connected') {
    if (marketStatus?.known && marketStatus.isClosed) return 'market_closed';
    if (stale) return 'stale';
    if (lastTickAt) return 'live';
    return 'waiting';
  }
  return 'disconnected';
}

export class MarketFeedService {
  constructor(options = {}) {
    this.token = options.token ?? config.upstoxAccessToken;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.WebSocketImpl = options.WebSocketImpl || WebSocket;
    this.authorizeUrl = options.authorizeUrl || AUTHORIZE_URL;
    this.instrumentMasterUrl =
      options.instrumentMasterUrl || INSTRUMENT_MASTER_URL;
    this.protoPath = options.protoPath || PROTO_PATH;
    this.logger = options.logger || console;
    this.now = options.now || Date.now;
    this.mode = options.mode || 'full';
    this.staleAfterMs = options.staleAfterMs || DEFAULT_STALE_AFTER_MS;
    this.reconnectBaseMs = options.reconnectBaseMs || 1_000;
    this.reconnectMaxMs = options.reconnectMaxMs || 30_000;
    this.heartbeatMs = options.heartbeatMs || 30_000;
    this.inactivityMs = options.inactivityMs || 90_000;
    this.subscriptionWatchdogMs = options.subscriptionWatchdogMs || 20_000;
    this.tickBroadcastMs = options.tickBroadcastMs || 200;
    this.verifyInstruments = options.verifyInstruments !== false;
    this.candidates = options.candidates || WATCHLIST_CANDIDATES;

    // Pre-resolved watchlists are useful for tests and for future dynamic
    // subscription support; production resolves from the official master.
    this.watchlist = Array.isArray(options.watchlist)
      ? options.watchlist.map((item) => ({ ...item }))
      : [];

    this.snapshots = new Map();
    this.candles = new Map();
    this.listeners = new Set();
    this.pendingTicks = new Map();

    this.protoRoot = null;
    this.ws = null;
    this.started = false;
    this.disposed = false;
    this.userClosed = false;
    this.connectionState = 'idle';
    this.failureReason = '';
    this.instrumentNote = '';
    this.lastTickAt = null;
    this.lastFeedAt = null;
    this.lastMessageAt = null;
    this.lastActivityAt = null;
    this.lastMarketInfoAt = null;
    this.lastConnectedAt = null;
    this.subscribedAt = null;
    this.reconnectAttempt = 0;
    this.marketInfo = null;
    this.marketSummary = summarizeMarketInfo(null);

    this.reconnectTimer = null;
    this.tickTimer = null;
    this.heartbeatTimer = null;
    this.subscriptionWatchdog = null;
  }

  get configured() {
    return Boolean(this.token);
  }

  // ---------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------

  async start() {
    if (this.started) return this.getStatus();
    this.started = true;
    this.disposed = false;
    this.userClosed = false;

    if (!this.configured) {
      this.connectionState = 'disabled';
      this.failureReason =
        'UPSTOX_ACCESS_TOKEN is not set in the backend environment. Live ticks are unavailable; simulated prices remain clearly labelled.';
      this.broadcastStatus();
      return this.getStatus();
    }

    this.connectionState = 'authorizing';
    this.broadcastStatus();

    try {
      this.protoRoot = await loadProtoDefinition(this.protoPath);
    } catch (error) {
      this.connectionState = 'error';
      this.failureReason = `Could not load the official V3 Protobuf schema: ${error.message}`;
      this.broadcastStatus();
      return this.getStatus();
    }

    if (this.watchlist.length === 0) {
      await this.resolveWatchlist();
    }

    if (this.watchlist.length === 0) {
      this.connectionState = 'subscription_failed';
      this.failureReason =
        'No valid instrument keys were resolved. Nothing was subscribed.';
      this.broadcastStatus();
      return this.getStatus();
    }

    this.logger.log(
      `[marketFeed] Watchlist resolved: ${this.watchlist
        .map((item) => `${item.symbol}=${item.instrumentKey}`)
        .join(', ')}`
    );
    if (this.instrumentNote) this.logger.warn(`[marketFeed] ${this.instrumentNote}`);

    try {
      await this.connect();
    } catch (error) {
      this.handleConnectError(error);
    }

    return this.getStatus();
  }

  async resolveWatchlist() {
    if (!this.verifyInstruments) {
      this.watchlist = this.candidates.map((item) => ({
        ...item,
        verified: true,
      }));
      return;
    }

    try {
      const master = await loadInstrumentMaster({
        fetchImpl: this.fetchImpl,
        url: this.instrumentMasterUrl,
      });
      const { watchlist, missing } = resolveWatchlistFromMaster(
        master,
        this.candidates
      );
      this.watchlist = watchlist;
      if (missing.length > 0) {
        this.instrumentNote = `Not subscribed (not found in the official instrument master): ${missing
          .map((item) => item.symbol)
          .join(', ')}.`;
      }
    } catch (error) {
      // Never guess a new key: fall back to the keys already verified against
      // the official master, and clearly flag that re-verification failed.
      this.watchlist = this.candidates.map((item) => ({
        ...item,
        verified: false,
        unverified: true,
      }));
      this.instrumentNote = `Instrument master could not be re-verified (${error.message}); using the last verified keys.`;
    }
  }

  async connect() {
    if (!this.started || this.disposed) return this.getStatus();
    if (this.connectionState === 'authentication_failed') return this.getStatus();
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) {
      return this.getStatus();
    }

    this.connectionState =
      this.reconnectAttempt > 0 ? 'reconnecting' : 'authorizing';
    this.broadcastStatus();

    const redirectUri = await authorizeMarketFeed({
      token: this.token,
      fetchImpl: this.fetchImpl,
      authorizeUrl: this.authorizeUrl,
    });
    if (!this.started || this.disposed) return this.getStatus();

    this.logger.log('[marketFeed] Authorised one-time V3 WebSocket URL received.');

    let socket;
    try {
      socket = new this.WebSocketImpl(redirectUri, {
        followRedirects: true,
        handshakeTimeout: 15_000,
        perMessageDeflate: false,
      });
    } catch (error) {
      const wrapped = new Error(
        `Could not create the Upstox WebSocket: ${error.message}`
      );
      wrapped.code = 'WS_CREATE_FAILED';
      throw wrapped;
    }

    this.ws = socket;
    this.lastFeedAt = null;
    this.lastMarketInfoAt = null;
    this.lastMessageAt = null;
    this.lastActivityAt = this.now();
    this.attachSocketHandlers(socket);
    this.connectionState = 'connecting';
    this.broadcastStatus();
    return this.getStatus();
  }

  attachSocketHandlers(socket) {
    socket.on('open', () => {
      if (socket !== this.ws) return;
      this.connectionState = 'connected';
      this.failureReason = '';
      this.reconnectAttempt = 0;
      this.lastConnectedAt = this.now();
      this.lastActivityAt = this.now();
      this.logger.log('[marketFeed] WebSocket connected. Subscribing…');
      this.subscribe();
      this.startHeartbeat(socket);
      this.broadcastStatus();
    });

    socket.on('message', (data, isBinary) => {
      if (socket !== this.ws) return;
      this.lastMessageAt = this.now();
      this.lastActivityAt = this.now();
      this.handleSocketMessage(data, isBinary);
    });

    socket.on('ping', () => {
      this.lastActivityAt = this.now();
    });

    socket.on('pong', () => {
      this.lastActivityAt = this.now();
    });

    socket.on('unexpected-response', (request, response) => {
      if (socket !== this.ws) return;
      const status = response?.statusCode;
      this.failureReason = `Upstox WebSocket handshake rejected (HTTP ${status}).`;
      this.connectionState =
        status === 401 || status === 403
          ? 'authentication_failed'
          : 'error';
      if (this.connectionState === 'authentication_failed') {
        this.failureReason =
          'Upstox rejected the access token during the WebSocket handshake. Generate a fresh UPSTOX_ACCESS_TOKEN and restart the backend.';
      }
      response?.resume?.();
      this.logger.error(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      if (this.connectionState !== 'authentication_failed') {
        this.scheduleReconnect();
      }
    });

    socket.on('error', (error) => {
      if (socket !== this.ws) return;
      this.handleSocketError(error);
    });

    socket.on('close', (code, reason) => {
      if (socket !== this.ws) return;
      this.ws = null;
      this.stopHeartbeat();
      this.clearSubscriptionWatchdog();
      if (this.userClosed || this.disposed) return;
      if (this.connectionState === 'authentication_failed') return;
      const text = reason ? Buffer.from(reason).toString('utf8') : '';
      this.connectionState = 'reconnecting';
      this.failureReason = `Upstox WebSocket closed (${code}${
        text ? `: ${text}` : ''
      }). Reconnecting…`;
      this.logger.warn(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      this.scheduleReconnect();
    });
  }

  subscribe() {
    if (!this.ws || this.ws.readyState !== 1) {
      this.connectionState = 'subscription_failed';
      this.failureReason =
        'Subscription could not be sent because the WebSocket is not open.';
      this.broadcastStatus();
      this.scheduleReconnect();
      return false;
    }

    const instrumentKeys = this.watchlist.map((item) => item.instrumentKey);
    try {
      this.ws.send(buildSubscriptionRequest(instrumentKeys, this.mode), {
        binary: true,
      });
      this.subscribedAt = this.now();
      this.logger.log(
        `[marketFeed] Subscription sent: ${instrumentKeys.length} instrument(s), mode=${this.mode}, NIFTYBEES=${NIFTYBEES_INSTRUMENT_KEY}`
      );
      this.startSubscriptionWatchdog(this.ws);
      return true;
    } catch (error) {
      this.connectionState = 'subscription_failed';
      this.failureReason = `Subscription request failed: ${error.message}`;
      this.logger.error(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      this.scheduleReconnect();
      return false;
    }
  }

  startSubscriptionWatchdog(socket) {
    this.clearSubscriptionWatchdog();
    this.subscriptionWatchdog = setTimeout(() => {
      this.subscriptionWatchdog = null;
      if (socket !== this.ws || this.connectionState !== 'connected') return;
      if (this.lastFeedAt) return;
      this.connectionState = 'subscription_failed';
      this.failureReason =
        'No market feed arrived within 20 seconds of subscribing. The connection is open but the subscription was not acknowledged with data.';
      this.logger.error(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      this.scheduleReconnect();
    }, this.subscriptionWatchdogMs);
  }

  clearSubscriptionWatchdog() {
    if (this.subscriptionWatchdog) {
      clearTimeout(this.subscriptionWatchdog);
      this.subscriptionWatchdog = null;
    }
  }

  startHeartbeat(socket) {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (socket !== this.ws) return;
      if (socket.readyState !== 1) return;
      const idleFor = this.lastActivityAt ? this.now() - this.lastActivityAt : 0;
      if (idleFor > this.inactivityMs) {
        this.failureReason = `No heartbeat or message for ${Math.round(
          idleFor / 1000
        )}s; recycling the Upstox connection.`;
        this.logger.warn(`[marketFeed] ${this.failureReason}`);
        try {
          socket.terminate();
        } catch {
          // ignore
        }
        return;
      }
      try {
        socket.ping();
      } catch {
        // The close handler owns reconnection.
      }
    }, this.heartbeatMs);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  handleConnectError(error) {
    const code = error?.code;
    if (code === 'AUTH_FAILED' || code === 'AUTH_MISSING') {
      this.connectionState = 'authentication_failed';
      this.failureReason =
        code === 'AUTH_MISSING'
          ? 'UPSTOX_ACCESS_TOKEN is not configured for the backend.'
          : 'Upstox rejected the access token. Generate a fresh UPSTOX_ACCESS_TOKEN and restart the backend.';
      this.logger.error(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      return;
    }

    this.connectionState = 'error';
    this.failureReason = `Upstox feed could not start: ${error?.message || error}`;
    this.logger.error(`[marketFeed] ${this.failureReason}`);
    this.broadcastStatus();
    this.scheduleReconnect();
  }

  handleSocketError(error) {
    const message = String(error?.message || error || '');
    const authFailure =
      /401|403|unauthorized|forbidden|invalid.{0,20}token|token.{0,20}invalid/i.test(
        message
      );
    if (authFailure) {
      this.connectionState = 'authentication_failed';
      this.failureReason =
        'Upstox rejected the access token. Generate a fresh UPSTOX_ACCESS_TOKEN and restart the backend.';
    } else {
      this.connectionState = 'error';
      this.failureReason = `Upstox WebSocket error: ${message}`;
    }
    this.logger.error(`[marketFeed] ${this.failureReason}`);
    this.broadcastStatus();
    if (!authFailure) this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.disposed || !this.started) return;
    if (this.connectionState === 'authentication_failed') return;

    this.reconnectAttempt += 1;
    const exponential = Math.min(
      this.reconnectMaxMs,
      this.reconnectBaseMs * 2 ** (this.reconnectAttempt - 1)
    );
    const delay = Math.round(exponential + Math.random() * exponential * 0.2);
    if (this.connectionState !== 'subscription_failed') {
      this.connectionState = 'reconnecting';
    }
    this.broadcastStatus();
    this.logger.warn(
      `[marketFeed] Reconnect attempt ${this.reconnectAttempt} in ${delay}ms.`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.disposed || !this.started) return;
      this.connect().catch((error) => this.handleConnectError(error));
    }, delay);
  }

  shutdown() {
    this.disposed = true;
    this.started = false;
    this.userClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.reconnectTimer = null;
    this.tickTimer = null;
    this.stopHeartbeat();
    this.clearSubscriptionWatchdog();
    const socket = this.ws;
    this.ws = null;
    if (socket) {
      try {
        socket.removeAllListeners();
        socket.close(1000, 'backend shutdown');
      } catch {
        try {
          socket.terminate();
        } catch {
          // ignore
        }
      }
    }
    this.connectionState = 'stopped';
  }

  // ---------------------------------------------------------------------
  // Incoming frames
  // ---------------------------------------------------------------------

  handleSocketMessage(data, isBinary) {
    const buffer = Buffer.isBuffer(data)
      ? data
      : Array.isArray(data)
        ? Buffer.concat(data)
        : Buffer.from(data);

    // Upstox normally sends binary Protobuf. A text/JSON error frame is a
    // subscription/authorization rejection, not a market tick.
    if (isBinary === false) {
      const body = jsonBody(buffer.toString('utf8'));
      if (body) {
        this.handleControlMessage(body);
        return;
      }
    }

    let decoded;
    try {
      decoded = decodeFeedResponse(this.protoRoot, buffer);
    } catch (error) {
      this.logger.warn(
        `[marketFeed] Could not decode Protobuf frame (${buffer.length} bytes): ${error.message}`
      );
      return;
    }

    if (decoded?.marketInfo) this.applyMarketInfo(decoded.marketInfo);
    if (decoded?.feeds && typeof decoded.feeds === 'object') {
      this.applyFeeds(decoded.feeds);
    }
  }

  handleControlMessage(body) {
    const errorMessage =
      body?.error?.message ||
      body?.error ||
      body?.message ||
      body?.errorMessage ||
      '';
    if (body?.status === 'error' || body?.type === 'error' || errorMessage) {
      this.connectionState = 'subscription_failed';
      this.failureReason = `Upstox rejected the subscription: ${
        typeof errorMessage === 'string' ? errorMessage : 'unknown error'
      }`;
      this.logger.error(`[marketFeed] ${this.failureReason}`);
      this.broadcastStatus();
      this.scheduleReconnect();
    }
  }

  applyMarketInfo(marketInfo) {
    this.marketInfo = marketInfo;
    this.marketSummary = summarizeMarketInfo(marketInfo);
    this.lastMarketInfoAt = this.now();
    this.logger.log(
      `[marketFeed] Market info: NSE_EQ=${this.marketSummary.nseEqStatus || 'unknown'} (${this.marketSummary.label})`
    );
    this.dispatch({
      type: 'market_status',
      marketStatus: this.marketSummary,
      marketInfo: this.marketInfo,
      receivedAt: new Date(this.lastMarketInfoAt).toISOString(),
    });
    this.broadcastStatus();
  }

  applyFeeds(feeds) {
    const receivedAt = new Date(this.now()).toISOString();
    let applied = 0;

    for (const [instrumentKey, entry] of Object.entries(feeds)) {
      const meta = this.watchlist.find(
        (item) => item.instrumentKey === instrumentKey
      );
      const tick = normalizeFeedEntry(instrumentKey, entry, meta, receivedAt);
      if (!tick) continue;
      this.applyNormalizedTick(tick);
      applied += 1;
    }

    if (applied === 0) return;

    this.lastFeedAt = this.now();
    this.lastTickAt = this.now();
    if (this.connectionState === 'subscription_failed') {
      this.connectionState = 'connected';
      this.failureReason = '';
    }
    this.clearSubscriptionWatchdog();

    if (!this.firstTickLogged) {
      this.firstTickLogged = true;
      const niftybees = this.getLivePriceForSymbol(NIFTYBEES_SYMBOL);
      if (niftybees) {
        this.logger.log(
          `[marketFeed] First live tick: NIFTYBEES ltp=${niftybees.ltp} at ${niftybees.lastTradedTime || niftybees.receivedAt}`
        );
      }
    }
  }

  /** Apply an already-normalised tick (also used by integration tests). */
  applyNormalizedTick(tick) {
    this.updateSnapshot(tick);
    this.aggregateCandle(tick);
    this.lastTickAt = this.now();
    this.queueTickBroadcast(tick);
  }

  updateSnapshot(tick) {
    const previous = this.snapshots.get(tick.instrumentKey) || {};
    const next = { ...previous };
    for (const [key, value] of Object.entries(tick)) {
      if (value !== undefined) next[key] = value;
    }
    this.snapshots.set(tick.instrumentKey, next);
  }

  aggregateCandle(tick) {
    const bucketMs = 60_000;
    const basis = Number(tick.timestamp) || this.now();
    const bucket = Math.floor(basis / bucketMs) * bucketMs;
    const list = this.candles.get(tick.instrumentKey) || [];
    const last = list[list.length - 1];
    if (last && last.time === bucket) {
      last.high = Math.max(last.high, tick.ltp);
      last.low = Math.min(last.low, tick.ltp);
      last.close = tick.ltp;
      last.volume = (last.volume || 0) + (tick.lastTradedQuantity || 0);
    } else {
      list.push({
        time: bucket,
        open: tick.ltp,
        high: tick.ltp,
        low: tick.ltp,
        close: tick.ltp,
        volume: tick.lastTradedQuantity || 0,
        previousClose: tick.previousClose,
      });
    }
    while (list.length > MAX_CANDLES_PER_KEY) list.shift();
    this.candles.set(tick.instrumentKey, list);
  }

  queueTickBroadcast(tick) {
    this.pendingTicks.set(tick.instrumentKey, tick);
    if (this.tickTimer) return;
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      const ticks = [...this.pendingTicks.values()];
      this.pendingTicks.clear();
      for (const pending of ticks) {
        this.dispatch({
          type: 'market_tick',
          tick: {
            ...pending,
            candle: this.getCandles(pending.instrumentKey).slice(-1)[0] || null,
            stale: this.isSnapshotStale(pending),
          },
        });
      }
    }, this.tickBroadcastMs);
  }

  // ---------------------------------------------------------------------
  // Public read APIs
  // ---------------------------------------------------------------------

  getStatus() {
    const now = this.now();
    const marketStatus = this.marketSummary;
    const stale = isDataStale({
      lastTickAt: this.lastTickAt,
      now,
      marketStatus,
      staleAfterMs: this.staleAfterMs,
    });
    const state = deriveFeedState({
      configured: this.configured,
      connectionState: this.connectionState,
      lastTickAt: this.lastTickAt,
      marketStatus,
      stale,
    });

    const niftybees = this.getLivePriceForSymbol(NIFTYBEES_SYMBOL);

    return {
      configured: this.configured,
      started: this.started,
      connectionState: this.connectionState,
      state,
      stateLabel: FEED_STATE_LABELS[state] || state,
      failureReason: this.failureReason || '',
      instrumentNote: this.instrumentNote || '',
      source: 'upstox_v3',
      subscriptionMode: this.mode,
      subscribedInstrumentKeys: this.watchlist.map((item) => item.instrumentKey),
      subscribedAt: this.subscribedAt,
      reconnectAttempt: this.reconnectAttempt,
      lastTickAt: this.lastTickAt,
      lastFeedAt: this.lastFeedAt,
      lastMessageAt: this.lastMessageAt,
      lastMarketInfoAt: this.lastMarketInfoAt,
      lastConnectedAt: this.lastConnectedAt,
      tickAgeMs: this.lastTickAt ? now - this.lastTickAt : null,
      stale,
      staleAfterMs: this.staleAfterMs,
      marketStatusKnown: marketStatus.known,
      marketStatus,
      marketInfo: this.marketInfo,
      instrumentKey: NIFTYBEES_INSTRUMENT_KEY,
      niftybees,
      watchlist: this.watchlist.map(
        ({ instrumentKey, symbol, name, verified, unverified }) => ({
          instrumentKey,
          symbol,
          name,
          verified: Boolean(verified),
          unverified: Boolean(unverified),
        })
      ),
    };
  }

  snapshotList() {
    return [...this.snapshots.values()].map((snapshot) => ({
      ...snapshot,
      candle: this.getCandles(snapshot.instrumentKey).slice(-1)[0] || null,
      stale: this.isSnapshotStale(snapshot),
    }));
  }

  getSnapshotListWithSymbols() {
    return this.snapshotList();
  }

  getLatestPrice(instrumentKey) {
    const snapshot = this.snapshots.get(instrumentKey);
    return snapshot
      ? { ...snapshot, stale: this.isSnapshotStale(snapshot) }
      : null;
  }

  getLivePriceForSymbol(symbol) {
    const upper = String(symbol || '').toUpperCase();
    const match = this.watchlist.find((item) => item.symbol === upper);
    if (!match) return null;
    return this.getLatestPrice(match.instrumentKey);
  }

  getCandles(instrumentKey) {
    return this.candles.get(instrumentKey) || [];
  }

  isSnapshotStale(snapshot, now = this.now()) {
    const basis =
      Date.parse(snapshot?.receivedAt || '') ||
      Number(snapshot?.timestamp) ||
      null;
    return isDataStale({
      lastTickAt: basis,
      now,
      marketStatus: this.marketSummary,
      staleAfterMs: this.staleAfterMs,
    });
  }

  onTick(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispatch(payload) {
    for (const listener of this.listeners) {
      try {
        listener(payload);
      } catch {
        // One bad listener must never stop the feed.
      }
    }
  }

  broadcastStatus() {
    this.dispatch({ type: 'status', status: this.getStatus() });
  }
}

export const marketFeed = new MarketFeedService();
