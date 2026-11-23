import { Router } from 'express';
import { requireAuth as defaultRequireAuth } from '../middleware/auth.js';
import * as controller from '../services/paperTrading/controller.js';

/**
 * Paper trading accounts are per user: every route except the public
 * instrument list requires a verified session, and the controller keys the
 * virtual account and replay session by req.user.id.
 */
export function createPaperTradingRouter({ requireAuth = defaultRequireAuth } = {}) {
  const router = Router();

  router.get('/instruments', controller.getInstruments);

  router.use(requireAuth);
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
