import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../backend/src/config/env.js';
import { createUserSupabaseClient } from '../backend/src/services/supabase.js';

const skip = !config.isSupabaseConfigured
  ? 'Supabase environment variables are not configured'
  : false;

describe('user-scoped Supabase client', () => {
  it(
    'sends the verified user JWT instead of the publishable key',
    { skip },
    async () => {
      let captured = null;

      const fetchImpl = async (input, init) => {
        const headers = new Headers(
          init?.headers || (input instanceof Request ? input.headers : undefined)
        );
        captured = {
          url: typeof input === 'string' ? input : input.url,
          authorization: headers.get('authorization'),
          apikey: headers.get('apikey'),
        };
        return new Response('[]', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      const client = createUserSupabaseClient('verified-user-jwt', {
        fetchImpl,
      });
      const { error } = await client.from('financial_goals').select('*');

      assert.equal(error, null);
      assert.ok(captured, 'the request should reach the injected fetch');
      assert.equal(captured.authorization, 'Bearer verified-user-jwt');
      assert.notEqual(
        captured.authorization,
        `Bearer ${config.supabasePublishableKey}`
      );
      assert.equal(captured.apikey, config.supabasePublishableKey);
      assert.match(captured.url, /\/rest\/v1\/financial_goals/);
    }
  );
});
