import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import zlib from 'node:zlib';
import {
  MarketFeedService,
  NIFTYBEES_INSTRUMENT_KEY,
  WATCHLIST_CANDIDATES,
  authorizeMarketFeed,
  buildSubscriptionRequest,
  decodeFeedResponse,
  deriveFeedState,
  isDataStale,
  loadProtoDefinition,
  normalizeFeedEntry,
  resolveWatchlistFromMaster,
  summarizeMarketInfo,
} from '../backend/src/services/marketData/upstoxFeed.js';

const silentLogger = { log() {}, warn() {}, error() {} };

class FakeWebSocket extends EventEmitter {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances = [];

  constructor(url, options) {
    super();
    this.url = url;
    this.options = options;
    this.readyState = FakeWebSocket.CONNECTING;
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  send(data) {
    this.sent.push(Buffer.from(data));
  }

  ping() {
    this.emit('ping');
  }

  close(code = 1000, reason = '') {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close', code, Buffer.from(reason));
  }

  terminate() {
    this.close(1006, 'terminated');
  }
}

function resetFakeSockets() {
  FakeWebSocket.instances = [];
}

let protoPromise;
async function proto() {
  if (!protoPromise) protoPromise = loadProtoDefinition();
  return protoPromise;
}

async function encodeFeed(payload) {
  const root = await proto();
  const FeedResponse = root.lookupType(
    'com.upstox.marketdatafeederv3udapi.rpc.proto.FeedResponse'
  );
  return Buffer.from(FeedResponse.encode(FeedResponse.create(payload)).finish());
}

async function marketInfoFrame(nseEqStatus) {
  return encodeFeed({
    type: 2,
    currentTs: String(Date.now()),
    marketInfo: {
      segmentStatus: {
        NSE_EQ: nseEqStatus,
        NSE_INDEX: nseEqStatus,
      },
    },
  });
}

async function liveFeedFrame({ ltp = 269.95, cp = 265.9 } = {}) {
  const now = Date.now();
  return encodeFeed({
    type: 1,
    currentTs: String(now),
    feeds: {
      [NIFTYBEES_INSTRUMENT_KEY]: {
        fullFeed: {
          marketFF: {
            ltpc: {
              ltp,
              ltt: String(now),
              ltq: '400',
              cp,
            },
            marketOHLC: {
              ohlc: [
                {
                  interval: '1d',
                  open: 268.85,
                  high: 270.49,
                  low: 267.12,
                  close: ltp,
                  vol: '10730879',
                  ts: String(now),
                },
                {
                  interval: 'I1',
                  open: 269.99,
                  high: 270.0,
                  low: 269.8,
                  close: ltp,
                  vol: '10840',
                  ts: String(now),
                },
              ],
            },
            atp: 269.46,
            vtt: '10731309',
          },
        },
        requestMode: 1,
      },
    },
  });
}

function makeFetch({
  authorizeStatus = 200,
  redirectUri = 'wss://example.upstox.test/feed?code=single-use',
  master = null,
} = {}) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('/authorize')) {
      return new Response(
        JSON.stringify(
          authorizeStatus === 200
            ? { status: 'success', data: { authorized_redirect_uri: redirectUri } }
            : { status: 'error', message: 'Unauthorized' }
        ),
        { status: authorizeStatus, headers: { 'content-type': 'application/json' } }
      );
    }
    if (String(url).includes('instruments')) {
      if (!master) throw new Error('No master configured for this test');
      return new Response(zlib.gzipSync(Buffer.from(JSON.stringify(master))), {
        status: 200,
        headers: { 'content-type': 'application/gzip' },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function makeService(overrides = {}) {
  return new MarketFeedService({
    token: 'test-access-token',
    fetchImpl: makeFetch(),
    WebSocketImpl: FakeWebSocket,
    verifyInstruments: false,
    watchlist: [
      {
        instrumentKey: NIFTYBEES_INSTRUMENT_KEY,
        symbol: 'NIFTYBEES',
        name: 'Nippon India ETF Nifty 50 BeES',
        verified: true,
      },
    ],
    logger: silentLogger,
    tickBroadcastMs: 10,
    subscriptionWatchdogMs: 60_000,
    heartbeatMs: 60_000,
    reconnectBaseMs: 10,
    reconnectMaxMs: 20,
    ...overrides,
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const services = [];
function track(service) {
  services.push(service);
  return service;
}

afterEach(() => {
  for (const service of services.splice(0)) service.shutdown();
  resetFakeSockets();
});

describe('Upstox V3 authorization', () => {
  it('returns the one-time authorised wss url', async () => {
    const fetchImpl = makeFetch({
      redirectUri: 'wss://api.upstox.test/feed?code=abc',
    });
    const uri = await authorizeMarketFeed({
      token: 'secret-token',
      fetchImpl,
    });
    assert.equal(uri, 'wss://api.upstox.test/feed?code=abc');
    assert.ok(fetchImpl.calls[0].includes('/authorize'));
  });

  it('classifies a rejected token as an authentication failure', async () => {
    const service = track(
      makeService({ fetchImpl: makeFetch({ authorizeStatus: 401 }) })
    );
    await service.start();
    const status = service.getStatus();
    assert.equal(status.connectionState, 'authentication_failed');
    assert.equal(status.state, 'auth_failed');
    assert.match(status.failureReason, /rejected the access token/i);
  });
});

describe('Instrument mapping', () => {
  it('resolves NIFTYBEES from the official master by trading symbol', () => {
    const master = [
      {
        instrument_key: 'NSE_EQ|INF204KB14I2',
        segment: 'NSE_EQ',
        trading_symbol: 'NIFTYBEES',
        instrument_type: 'EQ',
        name: 'NIP IND ETF NIFTY BEES',
      },
    ];
    const { watchlist, missing } = resolveWatchlistFromMaster(
      master,
      [WATCHLIST_CANDIDATES[0]]
    );
    assert.equal(missing.length, 0);
    assert.equal(watchlist[0].instrumentKey, 'NSE_EQ|INF204KB14I2');
    assert.equal(watchlist[0].resolvedBy, 'instrument_key');
    assert.equal(watchlist[0].symbol, 'NIFTYBEES');
  });

  it('resolves a moved ISIN by trading symbol instead of guessing', () => {
    const master = [
      {
        instrument_key: 'NSE_EQ|NEWISIN12345',
        segment: 'NSE_EQ',
        trading_symbol: 'NIFTYBEES',
        instrument_type: 'EQ',
        name: 'NIP IND ETF NIFTY BEES',
      },
    ];
    const staleCandidate = {
      ...WATCHLIST_CANDIDATES[0],
      instrumentKey: 'NSE_EQ|OLDISIN0000',
    };
    const { watchlist } = resolveWatchlistFromMaster(master, [staleCandidate]);
    assert.equal(watchlist[0].instrumentKey, 'NSE_EQ|NEWISIN12345');
    assert.equal(watchlist[0].resolvedBy, 'trading_symbol');
  });
});

describe('Protobuf decoding and tick normalisation', () => {
  it('decodes the official FeedResponse schema', async () => {
    const frame = await liveFeedFrame();
    const decoded = decodeFeedResponse(await proto(), frame);
    const entry = decoded.feeds[NIFTYBEES_INSTRUMENT_KEY];
    assert.equal(entry.fullFeed.marketFF.ltpc.ltp, 269.95);
    assert.equal(entry.fullFeed.marketFF.ltpc.cp, 265.9);
    assert.equal(entry.fullFeed.marketFF.marketOHLC.ohlc[0].interval, '1d');
  });

  it('normalises full-feed OHLC without inventing missing fields', () => {
    const tick = normalizeFeedEntry(
      NIFTYBEES_INSTRUMENT_KEY,
      {
        fullFeed: {
          marketFF: {
            ltpc: { ltp: 270.5, ltt: '1793698453369', ltq: '12', cp: 265.9 },
            marketOHLC: {
              ohlc: [
                {
                  interval: '1d',
                  open: 268.85,
                  high: 270.49,
                  low: 267.12,
                  close: 270.5,
                  vol: '12345',
                  ts: '1793644200000',
                },
              ],
            },
          },
        },
      },
      { symbol: 'NIFTYBEES', name: 'Nippon India ETF Nifty 50 BeES' }
    );
    assert.equal(tick.ltp, 270.5);
    assert.equal(tick.previousClose, 265.9);
    assert.equal(tick.open, 268.85);
    assert.equal(tick.high, 270.49);
    assert.equal(tick.low, 267.12);
    assert.equal(tick.close, 270.5);
    assert.equal(tick.lastTradedTime, new Date(1793698453369).toISOString());
    assert.equal(tick.source, 'upstox_v3');
    assert.equal(tick.isLive, true);
  });

  it('does not fabricate OHLC for an LTPC-only feed', () => {
    const tick = normalizeFeedEntry(
      NIFTYBEES_INSTRUMENT_KEY,
      { ltpc: { ltp: 269.95, ltt: '1793698453369', cp: 265.9 } },
      { symbol: 'NIFTYBEES' }
    );
    assert.equal(tick.ltp, 269.95);
    assert.equal(tick.previousClose, 265.9);
    assert.equal('open' in tick, false);
    assert.equal('high' in tick, false);
    assert.equal('low' in tick, false);
  });

  it('builds a binary V3 subscription request', () => {
    const request = JSON.parse(
      buildSubscriptionRequest([NIFTYBEES_INSTRUMENT_KEY], 'full').toString()
    );
    assert.equal(request.method, 'sub');
    assert.equal(request.data.mode, 'full');
    assert.deepEqual(request.data.instrumentKeys, [NIFTYBEES_INSTRUMENT_KEY]);
  });
});

describe('Managed Upstox connection', () => {
  it('connects, subscribes to NIFTYBEES, decodes ticks, and broadcasts', async () => {
    const received = [];
    const service = track(makeService());
    service.onTick((message) => received.push(message));

    await service.start();
    const socket = FakeWebSocket.instances[0];
    assert.ok(socket, 'expected one managed WebSocket');
    assert.equal(socket.url, 'wss://example.upstox.test/feed?code=single-use');
    assert.equal(socket.options.followRedirects, true);

    socket.open();
    assert.equal(service.getStatus().connectionState, 'connected');
    const subscription = JSON.parse(socket.sent[0].toString());
    assert.equal(subscription.data.mode, 'full');
    assert.deepEqual(subscription.data.instrumentKeys, [NIFTYBEES_INSTRUMENT_KEY]);

    socket.emit('message', await marketInfoFrame(2), true);
    socket.emit('message', await liveFeedFrame(), true);
    await delay(30);

    const snapshot = service.getLivePriceForSymbol('NIFTYBEES');
    assert.equal(snapshot.ltp, 269.95);
    assert.equal(snapshot.open, 268.85);
    assert.equal(snapshot.high, 270.49);
    assert.equal(snapshot.source, 'upstox_v3');
    assert.equal(snapshot.isLive, true);

    const tickMessage = received.find((message) => message.type === 'market_tick');
    assert.ok(tickMessage, 'expected a broadcast market_tick');
    assert.equal(tickMessage.tick.instrument, undefined);
    assert.equal(tickMessage.tick.symbol, 'NIFTYBEES');
    assert.equal(tickMessage.tick.ltp, 269.95);

    const status = service.getStatus();
    assert.equal(status.state, 'live');
    assert.equal(status.marketStatus.nseEqStatus, 'NORMAL_OPEN');
    assert.equal(status.stale, false);
  });

  it('reports the actual market status instead of guessing from missing ticks', async () => {
    const service = track(makeService());
    await service.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    socket.emit('message', await marketInfoFrame(3), true);
    const closed = service.getStatus();
    assert.equal(closed.state, 'market_closed');
    assert.equal(closed.marketStatusKnown, true);
    assert.equal(closed.marketStatus.nseEqStatus, 'NORMAL_CLOSE');
    assert.match(closed.stateLabel, /Market closed/i);

    socket.emit('message', await marketInfoFrame(2), true);
    const waiting = service.getStatus();
    assert.equal(waiting.state, 'waiting');
    assert.match(waiting.stateLabel, /waiting for first tick/i);
    assert.doesNotMatch(waiting.stateLabel, /market may be closed/i);
  });

  it('surfaces a subscription rejection from the feed', async () => {
    const service = track(makeService({ reconnectBaseMs: 60_000 }));
    await service.start();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    socket.emit(
      'message',
      JSON.stringify({ status: 'error', error: 'Invalid instrument key' }),
      false
    );
    const status = service.getStatus();
    assert.equal(status.connectionState, 'subscription_failed');
    assert.equal(status.state, 'subscription_failed');
    assert.match(status.failureReason, /Invalid instrument key/);
  });

  it('reconnects with a fresh authorised URL after a disconnect', async () => {
    const fetchImpl = makeFetch();
    const service = track(makeService({ fetchImpl }));
    await service.start();
    const first = FakeWebSocket.instances[0];
    first.open();

    first.close(1006, 'network lost');
    await delay(50);

    assert.equal(fetchImpl.calls.filter((url) => url.includes('/authorize')).length, 2);
    assert.equal(FakeWebSocket.instances.length, 2);
    assert.ok(
      ['reconnecting', 'connecting', 'authorizing'].includes(
        service.getStatus().connectionState
      )
    );
  });
});

describe('Staleness and state derivation', () => {
  it('marks live data stale only while the market is open', () => {
    const open = summarizeMarketInfo({ segmentStatus: { NSE_EQ: 'NORMAL_OPEN' } });
    const closed = summarizeMarketInfo({ segmentStatus: { NSE_EQ: 'NORMAL_CLOSE' } });
    const now = 1_000_000;
    assert.equal(
      isDataStale({
        lastTickAt: now - 120_000,
        now,
        marketStatus: open,
        staleAfterMs: 60_000,
      }),
      true
    );
    assert.equal(
      isDataStale({
        lastTickAt: now - 120_000,
        now,
        marketStatus: closed,
        staleAfterMs: 60_000,
      }),
      false
    );
    assert.equal(
      isDataStale({ lastTickAt: null, now, marketStatus: open }),
      false
    );
  });

  it('exposes stale state through getStatus', () => {
    const service = track(makeService({ staleAfterMs: 1_000 }));
    service.connectionState = 'connected';
    service.lastTickAt = Date.now() - 5_000;
    service.marketSummary = summarizeMarketInfo({
      segmentStatus: { NSE_EQ: 'NORMAL_OPEN' },
    });
    const status = service.getStatus();
    assert.equal(status.stale, true);
    assert.equal(status.state, 'stale');
  });

  it('does not call a missing tick a disconnected feed', () => {
    assert.equal(
      deriveFeedState({
        configured: true,
        connectionState: 'connected',
        lastTickAt: null,
        marketStatus: summarizeMarketInfo({ segmentStatus: { NSE_EQ: 'NORMAL_OPEN' } }),
        stale: false,
      }),
      'waiting'
    );
    assert.equal(
      deriveFeedState({
        configured: true,
        connectionState: 'reconnecting',
        lastTickAt: null,
        marketStatus: summarizeMarketInfo(null),
        stale: false,
      }),
      'connecting'
    );
  });
});
