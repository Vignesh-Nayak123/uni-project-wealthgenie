import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATA_DIR = path.resolve(__dirname, '../../data/paper-trading');

const INITIAL_CASH = 100000;
export const DEFAULT_ACCOUNT_ID = 'default';

// Account ids come from the verified auth token (Supabase user UUID), but they
// are still used as file names, so only a strict charset is accepted.
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;

/**
 * Resolved on every call (not at import) so tests can point
 * PAPER_TRADING_DATA_DIR at a temp directory and never touch real user data.
 */
export function dataDirectory() {
  return process.env.PAPER_TRADING_DATA_DIR || DEFAULT_DATA_DIR;
}

function assertAccountId(accountId) {
  if (typeof accountId !== 'string' || !ACCOUNT_ID_PATTERN.test(accountId)) {
    throw new Error('Invalid paper trading account.');
  }
  return accountId;
}

export function statePath(accountId = DEFAULT_ACCOUNT_ID, kind = 'account') {
  const suffix = kind === 'replay' ? '.replay.json' : '.json';
  return path.join(dataDirectory(), `${assertAccountId(accountId)}${suffix}`);
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, filePath);
}

export function defaultState() {
  return { cash: INITIAL_CASH, holdings: {}, history: [], initialized: true };
}

export function loadState(accountId = DEFAULT_ACCOUNT_ID) {
  return readJson(statePath(accountId));
}

export function saveState(state, accountId = DEFAULT_ACCOUNT_ID) {
  writeJson(statePath(accountId), state);
}

export function resetState(accountId = DEFAULT_ACCOUNT_ID) {
  for (const kind of ['account', 'replay']) {
    const filePath = statePath(accountId, kind);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

export { INITIAL_CASH };
