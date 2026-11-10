import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(configDir, '../../..');

function loadEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;

      const key = match[1];
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\\n/g, '\n');

      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Missing optional env files are fine; real process env still wins.
  }
}

loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, 'backend', '.env'));

/**
 * Environment configuration for WealthGenie Backend
 */
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabasePublishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

export const config = {
  port: parseInt(process.env.PORT || '5001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  isAiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0),
  supabaseUrl,
  supabasePublishableKey,
  isSupabaseConfigured: Boolean(supabaseUrl && supabasePublishableKey),
  // Upstox market data feed (server-side only; never sent to the frontend).
  upstoxAccessToken: (process.env.UPSTOX_ACCESS_TOKEN || '').trim(),
};
config.isUpstoxConfigured = config.upstoxAccessToken.length > 0;
