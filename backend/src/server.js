import app from './app.js';
import { config } from './config/env.js';
import { attachMarketWebSocket } from './ws/marketWs.js';
import { marketFeed, NIFTYBEES_INSTRUMENT_KEY } from './services/marketData/upstoxFeed.js';

const server = app.listen(config.port, () => {
  console.log(`WealthGenie backend listening on port ${config.port} (${config.nodeEnv})`);
  console.log(`Supabase auth: ${config.isSupabaseConfigured ? 'Configured (RLS-scoped user clients)' : 'Not configured (auth routes will return 503)'}`);
  console.log(`AI Tutor configured: ${config.isAiConfigured ? 'Yes (Live)' : 'No (Setup required)'}`);
  console.log(`Upstox live market feed: ${config.isUpstoxConfigured ? `Starting (V3, NIFTYBEES=${NIFTYBEES_INSTRUMENT_KEY})` : 'Not configured (simulated prices only)'}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[fatal] Port ${config.port} is already in use. Stop the process bound to it or set PORT in backend/.env.`
    );
  } else {
    console.error('[fatal] HTTP server error:', error);
  }
  process.exit(1);
});

attachMarketWebSocket(server);

// The market feed is optional background work: a feed failure (expired Upstox
// token, network error) must be logged, never allowed to kill the API.
marketFeed.start().catch((error) => {
  console.error('[marketFeed] Startup failed:', error);
});

// Third-party SDKs can emit stray rejections after the server is listening.
// Log them loudly and keep serving; uncaught synchronous exceptions still exit
// so a broken process is not left running in an unknown state.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[uncaughtException] Uncaught exception:', error);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`[shutdown] ${signal} received; closing market feed and HTTP server.`);
  marketFeed.shutdown();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
