import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getLearningConcept } from '../backend/src/data/learningRoadmap.js';
import {
  generateLesson,
  LESSON_MAX_OUTPUT_TOKENS,
} from '../backend/src/services/ai.service.js';

const concept = getLearningConcept('income');

const aiConfig = {
  isAiConfigured: true,
  geminiApiKey: 'test-key',
  geminiModel: 'test-model',
};

const validPayload = {
  explanation: 'Income is money that comes in from work, a business or another regular source.',
  example: 'Priya earns ₹45,000 per month from her job in Pune.',
  whyItMatters: 'Knowing your income helps you plan expenses and savings without guessing.',
  quiz: {
    question: 'What does income mean in a personal budget?',
    options: [
      'Money received from work or another source',
      'Money spent on groceries',
      'Money borrowed from a friend',
    ],
    correctIndex: 0,
    explanation: 'Income is money received. Groceries are an expense and borrowing creates a liability.',
  },
};

function providerResponse(candidate, extra = {}) {
  return {
    ok: true,
    json: async () => ({ candidates: [candidate], ...extra }),
  };
}

describe('AI lesson generation with thinking models', () => {
  it('reports truncation (MAX_TOKENS) instead of a misleading JSON parse error', async () => {
    const result = await generateLesson(concept, {
      aiConfig,
      fetchImpl: async () =>
        providerResponse({
          finishReason: 'MAX_TOKENS',
          content: { parts: [{ text: '{"explanation": "Income is money that' }] },
        }),
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'provider_truncated');
  });

  it('ignores thought-summary parts when assembling the lesson JSON', async () => {
    const result = await generateLesson(concept, {
      aiConfig,
      fetchImpl: async () =>
        providerResponse({
          finishReason: 'STOP',
          content: {
            parts: [
              { thought: true, text: 'Let me plan the {lesson} first...' },
              { text: JSON.stringify(validPayload) },
            ],
          },
        }),
    });

    assert.equal(result.status, 'success');
    assert.equal(result.lesson.conceptId, 'income');
  });

  it('sends a token budget large enough for thinking plus the lesson, with a timeout signal', async () => {
    let sentBody;
    let sentSignal;
    await generateLesson(concept, {
      aiConfig,
      fetchImpl: async (url, init) => {
        sentBody = JSON.parse(init.body);
        sentSignal = init.signal;
        return providerResponse({ content: { parts: [{ text: JSON.stringify(validPayload) }] } });
      },
    });

    assert.equal(sentBody.generationConfig.maxOutputTokens, LESSON_MAX_OUTPUT_TOKENS);
    assert.ok(LESSON_MAX_OUTPUT_TOKENS >= 4096);
    assert.equal(sentBody.generationConfig.thinkingConfig, undefined);
    assert.ok(sentSignal, 'request must carry an abort signal');
  });

  it('sends thinkingConfig only when a thinking level is configured', async () => {
    let sentBody;
    await generateLesson(concept, {
      aiConfig: { ...aiConfig, geminiThinkingLevel: 'low' },
      fetchImpl: async (url, init) => {
        sentBody = JSON.parse(init.body);
        return providerResponse({ content: { parts: [{ text: JSON.stringify(validPayload) }] } });
      },
    });

    assert.deepEqual(sentBody.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
  });

  it('maps a provider timeout to provider_timeout', async () => {
    const result = await generateLesson(concept, {
      aiConfig,
      fetchImpl: async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      },
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'provider_timeout');
  });
});

describe('Learn route hardening', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.GEMINI_API_KEY = '';
    const { createApp } = await import('../backend/src/app.js?route-hardening');
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it('returns 400 (not 500) for a malformed JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad',
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.code, 'entity.parse.failed');
  });

  it('rejects a non-slug conceptId on POST /api/learn/lesson', async () => {
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: '../Income' }),
    });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, 'invalid_concept_id');
  });

  it('trims a padded slug before the roadmap lookup', async () => {
    // Unknown concept on purpose: a known one would reach the live provider if
    // a developer .env with a real key is present.
    const res = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: '  not-a-roadmap-concept  ' }),
    });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'unknown_concept');
  });

  it('does not 500 on a market candle key containing a literal percent sign', async () => {
    const res = await fetch(`${baseUrl}/api/market/candles/abc%25zz`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).instrumentKey, 'abc%zz');
  });
});
