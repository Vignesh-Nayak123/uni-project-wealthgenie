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
  // Express has already percent-decoded route params; decoding again throws a
  // URIError (500) for any key containing a literal '%'.
  const { instrumentKey } = req.params;
  res.json({
    status: 'success',
    instrumentKey,
    candles: marketFeed.getCandles(instrumentKey),
  });
});

export default router;
