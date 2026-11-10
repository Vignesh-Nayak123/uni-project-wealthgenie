import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_PATH = path.resolve(__dirname, '../../data/paper-trading-state.json');

const INITIAL_CASH = 100000;

export function defaultState() {
  return { cash: INITIAL_CASH, holdings: {}, history: [], initialized: true };
}

export function loadState() {
  if (!fs.existsSync(STATE_PATH)) return null;
  const raw = fs.readFileSync(STATE_PATH, 'utf8');
  return JSON.parse(raw);
}

export function saveState(state) {
  const dir = path.dirname(STATE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = STATE_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

export function resetState() {
  if (fs.existsSync(STATE_PATH)) fs.unlinkSync(STATE_PATH);
}

export { STATE_PATH, INITIAL_CASH };
