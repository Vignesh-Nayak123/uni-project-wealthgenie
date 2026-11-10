import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getLearningConcept } from '../backend/src/data/learningRoadmap.js';
import {
  LessonValidationError,
  parseLessonJson,
  validateLessonPayload,
} from '../backend/src/utils/lessonSchema.js';
import { generateLesson } from '../backend/src/services/ai.service.js';

const validPayload = {
  explanation: 'Income is money that comes in from work, a business or another regular source.',
  example: 'Aarav earns ₹45,000 per month from his job in Pune. His take-home pay is lower after deductions.',
  whyItMatters: 'Knowing your income helps you plan expenses, savings and investments without guessing.',
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

function geminiResponse(payload) {
  return {
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [{ text: typeof payload === 'string' ? payload : JSON.stringify(payload) }],
          },
        },
      ],
    }),
  };
}

describe('AI lesson JSON validation', () => {
  it('accepts and normalizes a valid structured lesson', () => {
    const concept = getLearningConcept('income');
    const lesson = validateLessonPayload(validPayload, concept);

    assert.equal(lesson.conceptId, 'income');
    assert.equal(lesson.title, 'Income');
    assert.equal(lesson.category, 'Money Basics');
    assert.equal(lesson.quiz.options.length, 3);
    assert.equal(lesson.quiz.correctIndex, 0);
    assert.match(lesson.example, /₹/);
  });

  it('parses JSON wrapped in a code fence', () => {
    const parsed = parseLessonJson(`\`\`\`json\n${JSON.stringify(validPayload)}\n\`\`\``);
    assert.equal(parsed.quiz.correctIndex, 0);
  });

  it('rejects malformed and incomplete lesson payloads', () => {
    const concept = getLearningConcept('income');

    assert.throws(
      () => parseLessonJson('not json'),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () => validateLessonPayload({ ...validPayload, explanation: '' }, concept),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () => validateLessonPayload({ ...validPayload, example: 'A monthly salary of 45000.' }, concept),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () =>
        validateLessonPayload(
          {
            ...validPayload,
            quiz: { ...validPayload.quiz, options: ['One', 'Two'] },
          },
          concept
        ),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () =>
        validateLessonPayload(
          {
            ...validPayload,
            quiz: { ...validPayload.quiz, options: ['Same', 'Same', 'Different'] },
          },
          concept
        ),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () =>
        validateLessonPayload(
          {
            ...validPayload,
            quiz: { ...validPayload.quiz, correctIndex: 3 },
          },
          concept
        ),
      (error) => error instanceof LessonValidationError
    );

    assert.throws(
      () =>
        validateLessonPayload(
          {
            ...validPayload,
            quiz: { ...validPayload.quiz, explanation: '' },
          },
          concept
        ),
      (error) => error instanceof LessonValidationError
    );
  });
});

describe('Backend AI lesson generation states', () => {
  const concept = getLearningConcept('income');

  it('returns an honest unconfigured state without calling the provider', async () => {
    let called = false;
    const result = await generateLesson(concept, {
      aiConfig: { isAiConfigured: false },
      fetchImpl: async () => {
        called = true;
        return geminiResponse(validPayload);
      },
    });

    assert.equal(result.status, 'unconfigured');
    assert.equal(result.setupRequired, true);
    assert.match(result.message, /GEMINI_API_KEY/);
    assert.equal(called, false);
  });

  it('returns validated lesson content from the live provider response', async () => {
    const result = await generateLesson(concept, {
      aiConfig: {
        isAiConfigured: true,
        geminiApiKey: 'test-key',
        geminiModel: 'test-model',
      },
      fetchImpl: async () => geminiResponse(validPayload),
    });

    assert.equal(result.status, 'success');
    assert.equal(result.provider, 'gemini');
    assert.equal(result.model, 'test-model');
    assert.equal(result.lesson.title, 'Income');
    assert.equal(result.lesson.quiz.options.length, 3);
  });

  it('returns a provider error for an upstream failure', async () => {
    const result = await generateLesson(concept, {
      aiConfig: {
        isAiConfigured: true,
        geminiApiKey: 'test-key',
        geminiModel: 'test-model',
      },
      fetchImpl: async () => ({ ok: false, status: 500, text: async () => '' }),
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'provider_error');
  });

  it('returns an invalid-payload error instead of displaying bad AI content', async () => {
    const result = await generateLesson(concept, {
      aiConfig: {
        isAiConfigured: true,
        geminiApiKey: 'test-key',
        geminiModel: 'test-model',
      },
      fetchImpl: async () => geminiResponse('{"unexpected":true}'),
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'invalid_lesson_payload');
  });

  it('returns a blocked error when the provider refuses the request', async () => {
    const result = await generateLesson(concept, {
      aiConfig: {
        isAiConfigured: true,
        geminiApiKey: 'test-key',
        geminiModel: 'test-model',
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          promptFeedback: { blockReason: 'SAFETY' },
          candidates: [],
        }),
      }),
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'provider_blocked');
  });
});
