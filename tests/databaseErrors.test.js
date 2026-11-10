import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMissingSchemaError,
  sendDatabaseError,
} from '../backend/src/utils/databaseErrors.js';

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

describe('database error mapping', () => {
  let originalConsoleError;

  beforeEach(() => {
    originalConsoleError = console.error;
    console.error = () => {};
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('recognises missing schema errors', () => {
    assert.equal(isMissingSchemaError({ code: '42P01' }), true);
    assert.equal(isMissingSchemaError({ code: 'PGRST205' }), true);
    assert.equal(isMissingSchemaError({ code: '23505' }), false);
    assert.equal(isMissingSchemaError(null), false);
  });

  it('maps missing schema errors to a 503 with an actionable code', () => {
    const res = createResponse();
    sendDatabaseError(res, { code: '42P01', message: 'relation does not exist' });

    assert.equal(res.statusCode, 503);
    assert.equal(res.body.code, 'database_not_initialized');
    assert.match(res.body.error, /Apply the Supabase migrations/);
  });

  it('maps other database failures to a generic 500 without leaking details', () => {
    const res = createResponse();
    sendDatabaseError(res, { code: '23505', message: 'duplicate key value' }, 'Unable to save.');

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.code, 'database_error');
    assert.equal(res.body.error, 'Unable to save.');
    assert.equal(res.body.message, undefined);
  });
});
