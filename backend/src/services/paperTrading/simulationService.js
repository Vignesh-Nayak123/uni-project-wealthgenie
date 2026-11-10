import { loadState, saveState, defaultState, INITIAL_CASH } from './persistence.js';
import { getPrice } from './priceProvider.js';

let lock = Promise.resolve();
function withLock(fn) {
  const next = lock.then(() => fn());
  lock = next.catch(() => {});
  return next;
}

function getAccount() {
  let state = loadState();
  if (!state) {
    state = defaultState();
    saveState(state);
  }
  return state;
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * Resolve the price used to execute a simulated order. A live price that has
 * gone stale is rejected unless the caller explicitly acknowledges it; a
 * fallback fixture price is allowed but recorded as simulated.
 */
function resolveOrderPrice(symbol, options = {}) {
  const priceInfo = getPrice(symbol);
  if (!priceInfo) throw new Error('Invalid instrument.');
  if (!Number.isFinite(priceInfo.price) || priceInfo.price <= 0) {
    throw new Error('No valid price is available for this instrument.');
  }
  if (priceInfo.isLive && priceInfo.stale && !options.allowStale) {
    const last = priceInfo.lastTradedTime || priceInfo.receivedAt || 'unknown';
    throw new Error(
      `The live price for ${priceInfo.symbol} is stale (last tick ${last}). ` +
        'Order not executed. Confirm "use last available price" to trade the stale quote explicitly.'
    );
  }
  return priceInfo;
}

function tradeMeta(priceInfo, at) {
  return {
    priceSource: priceInfo.isLive ? 'upstox_v3' : 'simulated_fixture',
    isLive: Boolean(priceInfo.isLive),
    stale: Boolean(priceInfo.stale),
    priceTimestamp:
      priceInfo.lastTradedTime || priceInfo.receivedAt || priceInfo.timestamp || null,
    executedAt: at,
  };
}

export function initAccount() {
  return withLock(() => {
    let state = loadState();
    if (state) return { status: 'exists', account: summarize(state) };
    state = defaultState();
    saveState(state);
    return { status: 'initialized', account: summarize(state) };
  });
}

export function buy(symbol, quantity, options = {}) {
  return withLock(() => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) throw new Error('Quantity must be a positive whole number.');
    const priceInfo = resolveOrderPrice(symbol, options);
    const state = getAccount();
    const cost = round2(priceInfo.price * q);
    if (cost > state.cash) throw new Error('Insufficient virtual cash.');
    const sym = priceInfo.symbol;
    const existing = state.holdings[sym] || { quantity: 0, avgCost: 0 };
    const newQty = existing.quantity + q;
    const newAvg = round2((existing.quantity * existing.avgCost + q * priceInfo.price) / newQty);
    state.holdings[sym] = { quantity: newQty, avgCost: newAvg, name: priceInfo.name };
    state.cash = round2(state.cash - cost);
    const at = new Date().toISOString();
    state.history.push({
      type: 'BUY',
      symbol: sym,
      quantity: q,
      price: priceInfo.price,
      total: cost,
      at,
      ...tradeMeta(priceInfo, at),
    });
    saveState(state);
    return { status: 'success', trade: state.history[state.history.length - 1], account: summarize(state) };
  });
}

export function sell(symbol, quantity, options = {}) {
  return withLock(() => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) throw new Error('Quantity must be a positive whole number.');
    const priceInfo = resolveOrderPrice(symbol, options);
    const state = getAccount();
    const sym = priceInfo.symbol;
    const holding = state.holdings[sym];
    if (!holding || holding.quantity < q) throw new Error('Insufficient holdings.');
    const proceeds = round2(priceInfo.price * q);
    const realized = round2((priceInfo.price - holding.avgCost) * q);
    const newQty = holding.quantity - q;
    if (newQty === 0) delete state.holdings[sym];
    else state.holdings[sym] = { ...holding, quantity: newQty };
    state.cash = round2(state.cash + proceeds);
    const at = new Date().toISOString();
    state.history.push({
      type: 'SELL',
      symbol: sym,
      quantity: q,
      price: priceInfo.price,
      total: proceeds,
      realizedPnl: realized,
      at,
      ...tradeMeta(priceInfo, at),
    });
    saveState(state);
    return { status: 'success', trade: state.history[state.history.length - 1], account: summarize(state) };
  });
}

export function portfolio() {
  return withLock(() => {
    const state = getAccount();
    return summarize(state);
  });
}

export function history() {
  return withLock(() => {
    const state = getAccount();
    return { history: state.history };
  });
}

export function buyAt(symbol, quantity, price) {
  return withLock(() => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) throw new Error('Quantity must be a positive whole number.');
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw new Error('Invalid price.');
    const state = getAccount();
    const sym = String(symbol).toUpperCase();
    const cost = round2(price * q);
    if (cost > state.cash) throw new Error('Insufficient virtual cash.');
    const existing = state.holdings[sym] || { quantity: 0, avgCost: 0, name: sym };
    const newQty = existing.quantity + q;
    const newAvg = round2((existing.quantity * existing.avgCost + q * price) / newQty);
    state.holdings[sym] = { quantity: newQty, avgCost: newAvg, name: existing.name || sym };
    state.cash = round2(state.cash - cost);
    const at = new Date().toISOString();
    state.history.push({
      type: 'BUY',
      symbol: sym,
      quantity: q,
      price,
      total: cost,
      at,
      replay: true,
      priceSource: 'historical_replay',
      isLive: false,
      stale: false,
      priceTimestamp: null,
      executedAt: at,
    });
    saveState(state);
    return { status: 'success', trade: state.history[state.history.length - 1], account: summarize(state) };
  });
}

export function sellAt(symbol, quantity, price) {
  return withLock(() => {
    const q = Number(quantity);
    if (!Number.isInteger(q) || q <= 0) throw new Error('Quantity must be a positive whole number.');
    if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) throw new Error('Invalid price.');
    const state = getAccount();
    const sym = String(symbol).toUpperCase();
    const holding = state.holdings[sym];
    if (!holding || holding.quantity < q) throw new Error('Insufficient holdings.');
    const proceeds = round2(price * q);
    const realized = round2((price - holding.avgCost) * q);
    const newQty = holding.quantity - q;
    if (newQty === 0) delete state.holdings[sym];
    else state.holdings[sym] = { ...holding, quantity: newQty };
    state.cash = round2(state.cash + proceeds);
    const at = new Date().toISOString();
    state.history.push({
      type: 'SELL',
      symbol: sym,
      quantity: q,
      price,
      total: proceeds,
      realizedPnl: realized,
      at,
      replay: true,
      priceSource: 'historical_replay',
      isLive: false,
      stale: false,
      priceTimestamp: null,
      executedAt: at,
    });
    saveState(state);
    return { status: 'success', trade: state.history[state.history.length - 1], account: summarize(state) };
  });
}

export function summarize(state) {
  const holdings = Object.entries(state.holdings).map(([symbol, h]) => {
    const priceInfo = getPrice(symbol);
    const currentPrice = priceInfo ? priceInfo.price : h.avgCost;
    const marketValue = round2(currentPrice * h.quantity);
    const unrealized = round2((currentPrice - h.avgCost) * h.quantity);
    return {
      symbol,
      name: h.name,
      quantity: h.quantity,
      avgCost: h.avgCost,
      currentPrice,
      marketValue,
      unrealizedPnl: unrealized,
      priceSource: priceInfo?.source || 'avg_cost_fallback',
      isLive: Boolean(priceInfo?.isLive),
      stale: Boolean(priceInfo?.stale),
      priceTimestamp:
        priceInfo?.lastTradedTime || priceInfo?.receivedAt || priceInfo?.timestamp || null,
    };
  });
  const holdingsValue = round2(holdings.reduce((a, h) => a + h.marketValue, 0));
  const unrealizedTotal = round2(holdings.reduce((a, h) => a + h.unrealizedPnl, 0));
  const realizedTotal = round2(state.history.filter(t => t.type === 'SELL').reduce((a, t) => a + (t.realizedPnl || 0), 0));
  return {
    cash: state.cash,
    holdings,
    holdingsValue,
    unrealizedPnl: unrealizedTotal,
    realizedPnl: realizedTotal,
    totalEquity: round2(state.cash + holdingsValue),
    initialCash: INITIAL_CASH,
    valuationUpdatedAt: new Date().toISOString(),
  };
}
