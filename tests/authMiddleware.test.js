import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequireAuth } from '../backend/src/middleware/auth.js';

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

describe('requireAuth middleware', () => {
  it('returns 503 when Supabase auth is not configured', async () => {
    const middleware = createRequireAuth({ isConfigured: false });
    const res = createResponse();
    let nextCalled = false;

    await middleware({ headers: {} }, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'auth_not_configured');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const middleware = createRequireAuth({ isConfigured: true });
    const res = createResponse();
    let nextCalled = false;

    await middleware({ headers: {} }, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'unauthorized');
  });

  it('returns 401 for a non-Bearer authorization scheme', async () => {
    const middleware = createRequireAuth({ isConfigured: true });
    const res = createResponse();

    await middleware(
      { headers: { authorization: 'Basic abc123' } },
      res,
      () => assert.fail('next should not be called')
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'unauthorized');
  });

  it('returns 401 when token verification fails', async () => {
    const middleware = createRequireAuth({
      isConfigured: true,
      verify: async () => null,
    });
    const res = createResponse();

    await middleware(
      { headers: { authorization: 'Bearer expired-token' } },
      res,
      () => assert.fail('next should not be called')
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'unauthorized');
  });

  it('returns 401 when token verification throws', async () => {
    const middleware = createRequireAuth({
      isConfigured: true,
      verify: async () => {
        throw new Error('verification failed');
      },
    });
    const res = createResponse();

    await middleware(
      { headers: { authorization: 'Bearer token' } },
      res,
      () => assert.fail('next should not be called')
    );

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'unauthorized');
  });

  it('attaches the verified user and a token-scoped client on success', async () => {
    const user = { id: 'user-1', email: 'user@example.com' };
    const req = { headers: { authorization: 'Bearer valid-token' } };
    const res = createResponse();
    let nextCalled = false;

    const middleware = createRequireAuth({
      isConfigured: true,
      verify: async (token) => (token === 'valid-token' ? user : null),
      createClient: (token) => ({ token }),
    });

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, user);
    assert.equal(req.supabase.token, 'valid-token');
    assert.equal(res.statusCode, 200);
  });
});
