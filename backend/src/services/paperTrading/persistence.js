/**
 * Storage for Practice Trading accounts and replay sessions.
 *
 * A store is a small async interface so the services never care where state
 * lives:
 *   loadAccount(id) -> { cash, holdings, history } | null
 *   saveAccount(id, state)
 *   loadReplay(id)  -> replay session | null
 *   saveReplay(id, session)
 *   reset(id)       -> removes the account and its replay session
 *
 * The API uses the Supabase store (one row per user in
 * public.paper_trading_accounts, scoped by RLS). Direct service calls in tests
 * and evaluation scripts fall back to an in-memory store, so nothing ever
 * touches disk or a real database by accident.
 */

const INITIAL_CASH = 100000;
export const DEFAULT_ACCOUNT_ID = 'default';
export const PAPER_TRADING_TABLE = 'paper_trading_accounts';

/** Thrown when the backing database fails, so the API can answer 5xx, not 400. */
export class PaperTradingStoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PaperTradingStoreError';
    this.cause = cause;
  }
}

export function defaultState() {
  return { cash: INITIAL_CASH, holdings: {}, history: [], initialized: true };
}

export function createMemoryStore() {
  const accounts = new Map();
  const replays = new Map();
  // Clone on the way in and out so callers cannot mutate stored state in place,
  // which matches how a database round trip behaves.
  const clone = (value) => (value == null ? null : structuredClone(value));

  return {
    async loadAccount(accountId) { return clone(accounts.get(accountId)); },
    async saveAccount(accountId, state) { accounts.set(accountId, clone(state)); },
    async loadReplay(accountId) { return clone(replays.get(accountId)); },
    async saveReplay(accountId, session) { replays.set(accountId, clone(session)); },
    async reset(accountId) {
      accounts.delete(accountId);
      replays.delete(accountId);
    },
  };
}

/**
 * Supabase-backed store. `client` must be a request-scoped client created with
 * the user's access token, so RLS limits every query to that user's row.
 */
export function createSupabaseStore(client) {
  if (!client) throw new Error('A Supabase client is required for paper trading storage.');

  async function selectRow(accountId, columns) {
    const { data, error } = await client
      .from(PAPER_TRADING_TABLE)
      .select(columns)
      .eq('user_id', accountId)
      .maybeSingle();
    if (error) throw new PaperTradingStoreError('Unable to load your practice portfolio.', error);
    return data;
  }

  // Upsert only the given columns: the account and the replay session share a
  // row, and saving one must never overwrite the other.
  async function upsertRow(row) {
    const { error } = await client
      .from(PAPER_TRADING_TABLE)
      .upsert(row, { onConflict: 'user_id' });
    if (error) throw new PaperTradingStoreError('Unable to save your practice portfolio.', error);
  }

  return {
    async loadAccount(accountId) {
      const row = await selectRow(accountId, 'cash, holdings, history');
      if (!row) return null;
      return {
        cash: Number(row.cash),
        holdings: row.holdings || {},
        history: Array.isArray(row.history) ? row.history : [],
        initialized: true,
      };
    },
    async saveAccount(accountId, state) {
      await upsertRow({
        user_id: accountId,
        cash: state.cash,
        holdings: state.holdings,
        history: state.history,
      });
    },
    async loadReplay(accountId) {
      const row = await selectRow(accountId, 'replay_session');
      return row?.replay_session ?? null;
    },
    async saveReplay(accountId, session) {
      await upsertRow({ user_id: accountId, replay_session: session });
    },
    async reset(accountId) {
      const { error } = await client
        .from(PAPER_TRADING_TABLE)
        .delete()
        .eq('user_id', accountId);
      if (error) throw new PaperTradingStoreError('Unable to reset your practice portfolio.', error);
    },
  };
}

/** Used when a caller does not pass a store (tests, evaluation scripts). */
export const defaultStore = createMemoryStore();

export function resetState(accountId = DEFAULT_ACCOUNT_ID, store = defaultStore) {
  return store.reset(accountId);
}

/**
 * Serialises work per key (account id). Different users never wait on each
 * other; one user's concurrent orders still run one at a time so a buy and a
 * sell cannot both read the same balance. This is per process: run a single
 * backend instance, or move order execution into a database function before
 * scaling out.
 */
export function createKeyedLock() {
  const tails = new Map();
  return function withLock(key, fn) {
    const previous = tails.get(key) || Promise.resolve();
    const next = previous.then(() => fn());
    const tail = next.catch(() => {});
    tails.set(key, tail);
    tail.then(() => {
      if (tails.get(key) === tail) tails.delete(key);
    });
    return next;
  };
}

export { INITIAL_CASH };
