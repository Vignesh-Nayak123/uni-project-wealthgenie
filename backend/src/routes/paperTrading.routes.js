import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import * as controller from '../services/paperTrading/controller.js';
import { createSupabaseStore } from '../services/paperTrading/persistence.js';

/**
 * Paper trading accounts are per user: every route except the public
 * instrument list requires a verified session, and the controller keys the
 * virtual account and replay session by req.user.id.
 *
 * State is stored in Supabase (public.paper_trading_accounts) through the
 * request-scoped client requireAuth attaches, so RLS confines each request to
 * the caller's row and portfolios survive restarts. Tests pass `storeFor` to
 * use an in-memory store instead.
 */
const supabaseStoreFor = (req) => createSupabaseStore(req.supabase);

export function createPaperTradingRouter({
  requireAuth = defaultRequireAuth,
  storeFor = supabaseStoreFor,
} = {}) {
  const router = Router();

  router.get('/instruments', controller.getInstruments);
  router.get('/practice/candles/:symbol', controller.getPracticeCandles);

  router.use(requireAuth);
  router.use((req, res, next) => {
    req.paperTradingStore = storeFor(req);
    next();
  });
  router.post('/init', controller.init);
  router.post('/buy', controller.buyOrder);
  router.post('/sell', controller.sellOrder);
  router.get('/portfolio', controller.getPortfolio);
  router.get('/history', controller.getHistory);
  router.post('/replay/start', controller.replayStart);
  router.get('/replay', controller.replayGet);
  router.post('/replay/next', controller.replayNext);
  router.post('/replay/trade', controller.replayTrade);
  router.post('/replay/hold', controller.replayHold);

  return router;
}

export default createPaperTradingRouter();
