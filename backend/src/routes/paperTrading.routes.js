import { Router } from 'express';
import * as controller from '../services/paperTrading/controller.js';

const router = Router();

router.get('/instruments', controller.getInstruments);
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

export default router;
