/**
 * Browser-facing WebSocket for live market ticks.
 *
 * The browser never talks to Upstox and never sees credentials. It receives
 * only normalised snapshots/ticks plus an explicit connection state so the UI
 * can distinguish "waiting for first tick" from "market closed", an auth
 * failure, a subscription failure, or a stale feed.
 */
import { WebSocketServer } from 'ws';
import { marketFeed } from '../services/marketData/upstoxFeed.js';
import { portfolio } from '../services/paperTrading/simulationService.js';

const MARKET_WS_PATH = '/ws/market';
const PORTFOLIO_BROADCAST_MS = 750;
const STATUS_BROADCAST_MS = 10_000;

export function attachMarketWebSocket(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  const send = (client, payload) => {
    if (client.readyState === 1) {
      try {
        client.send(JSON.stringify(payload));
      } catch {
        // A dead client is cleaned up by the close handler.
      }
    }
  };

  const broadcast = (payload) => {
    for (const client of wss.clients) send(client, payload);
  };

  let portfolioTimer = null;
  const schedulePortfolioBroadcast = () => {
    if (portfolioTimer) return;
    portfolioTimer = setTimeout(async () => {
      portfolioTimer = null;
      if (wss.clients.size === 0) return;
      try {
        broadcast({ type: 'portfolio', account: await portfolio() });
      } catch {
        // Portfolio valuation must never break the market feed.
      }
    }, PORTFOLIO_BROADCAST_MS);
  };

  const unsubscribe = marketFeed.onTick((payload) => {
    broadcast(payload);
    if (payload?.type === 'market_tick') schedulePortfolioBroadcast();
  });

  const statusTimer = setInterval(() => {
    if (wss.clients.size > 0) {
      broadcast({ type: 'status', status: marketFeed.getStatus() });
    }
  }, STATUS_BROADCAST_MS);
  if (typeof statusTimer.unref === 'function') statusTimer.unref();

  httpServer.on('upgrade', (request, socket, head) => {
    const { pathname } = new URL(request.url, 'http://localhost');
    if (pathname !== MARKET_WS_PATH) return;
    wss.handleUpgrade(request, socket, head, (client) => {
      wss.emit('connection', client, request);
    });
  });

  wss.on('connection', async (client) => {
    client.isAlive = true;
    client.on('pong', () => {
      client.isAlive = true;
    });

    const status = marketFeed.getStatus();
    send(client, { type: 'status', status });
    send(client, { type: 'snapshot', instruments: marketFeed.snapshotList() });
    send(client, {
      type: 'market_status',
      marketStatus: status.marketStatus,
      marketInfo: status.marketInfo,
      receivedAt: status.lastMarketInfoAt
        ? new Date(status.lastMarketInfoAt).toISOString()
        : null,
    });
    try {
      send(client, { type: 'portfolio', account: await portfolio() });
    } catch {
      // The REST portfolio endpoint remains available.
    }
  });

  // Detect half-open browser connections.
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.isAlive === false) {
        client.terminate();
        continue;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        // ignore
      }
    }
  }, 30_000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref();

  return () => {
    unsubscribe();
    clearInterval(heartbeat);
    clearInterval(statusTimer);
    if (portfolioTimer) clearTimeout(portfolioTimer);
    wss.close();
  };
}
