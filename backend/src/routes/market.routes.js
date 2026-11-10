import { Router } from 'express';
import { marketFeed, NIFTYBEES_INSTRUMENT_KEY } from '../services/marketData/upstoxFeed.js';
import { listInstruments } from '../services/paperTrading/priceProvider.js';

const router = Router();

/** Honest feed status: never implies real data exists when it does not. */
router.get('/status', (req, res) => {
  res.json({
    status: 'success',
    marketFeed: marketFeed.getStatus(),
    niftybeesInstrumentKey: NIFTYBEES_INSTRUMENT_KEY,
  });
});

/** Latest normalised snapshot per instrument (empty until real ticks arrive). */
router.get('/snapshot', (req, res) => {
  res.json({ status: 'success', instruments: marketFeed.snapshotList() });
});

/** Latest price used by the paper-trading engine. */
router.get('/instruments', (req, res) => {
  res.json({ status: 'success', instruments: listInstruments() });
});

/** Rolling 1-minute candles aggregated from live ticks. */
router.get('/candles/:instrumentKey', (req, res) => {
  const instrumentKey = decodeURIComponent(req.params.instrumentKey);
  res.json({
    status: 'success',
    instrumentKey,
    candles: marketFeed.getCandles(instrumentKey),
  });
});

export default router;
