import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadCuratedLessonIndex } from '../backend/src/content/curatedLessons.js';
import { normalizeCuratedLessonResponse } from '../frontend/src/utils/curatedLesson.js';
import { getReviewStatusView } from '../frontend/src/utils/lessonReview.js';

/**
 * These tests cover the exact bug behind the blank lesson modal: the Learn
 * modal used to accept a curated response as long as `lesson.quiz` was a
 * non-empty array, then call `.map()` on every other field. A payload with a
 * string explanation or a missing examples array threw inside render and the
 * dialog disappeared, leaving an empty white panel.
 *
 * The normaliser is the guard that turns that crash into a visible error.
 */

async function apiBodyFor(conceptId, index) {
  const resolvedIndex = index || (await loadCuratedLessonIndex());
  const entry = resolvedIndex.lessons.get(conceptId);
  assert.ok(entry, `missing curated lesson for ${conceptId}`);

  return {
    status: 'success',
    source: 'curated',
    schemaVersion: 1,
    contentVersion: entry.lesson.contentVersion,
    lesson: entry.lesson,
    sources: entry.sources,
    review: entry.review,
  };
}

describe('curated lesson payload normalisation', () => {
  it('accepts every one of the 23 curated lessons served by the API', async () => {
    const index = await loadCuratedLessonIndex();

    assert.equal(index.lessons.size, 23);
    assert.deepEqual(index.invalid, []);

    for (const [conceptId, entry] of index.lessons) {
      const result = normalizeCuratedLessonResponse({
        status: 'success',
        source: 'curated',
        schemaVersion: 1,
        contentVersion: entry.lesson.contentVersion,
        lesson: entry.lesson,
        sources: entry.sources,
        review: entry.review,
      });

      assert.equal(result.ok, true, `${conceptId} was rejected: ${result.reason}`);

      const { lesson, sources, review, contentVersion } = result.entry;

      assert.equal(lesson.conceptId, conceptId);
      assert.equal(lesson.title, entry.lesson.title);
      assert.equal(contentVersion, entry.lesson.contentVersion);
      assert.equal(review.status, entry.review.status);

      // Every field the renderer maps over must be a real array.
      assert.ok(Array.isArray(lesson.objectives), `${conceptId} objectives`);
      assert.ok(Array.isArray(lesson.explanation), `${conceptId} explanation`);
      assert.ok(Array.isArray(lesson.examples), `${conceptId} examples`);
      assert.ok(Array.isArray(lesson.keyTakeaways), `${conceptId} keyTakeaways`);
      assert.ok(Array.isArray(lesson.quiz), `${conceptId} quiz`);
      assert.ok(Array.isArray(sources), `${conceptId} sources`);

      assert.ok(lesson.objectives.length >= 1, `${conceptId} objectives`);
      assert.ok(lesson.explanation.length >= 1, `${conceptId} explanation`);
      assert.ok(lesson.examples.length >= 1, `${conceptId} examples`);
      assert.ok(lesson.keyTakeaways.length >= 1, `${conceptId} keyTakeaways`);
      assert.equal(lesson.quiz.length, 3, `${conceptId} quiz count`);
      assert.ok(sources.length >= 1, `${conceptId} sources`);

      assert.deepEqual(lesson.explanation, entry.lesson.explanation);
      assert.deepEqual(lesson.keyTakeaways, entry.lesson.keyTakeaways);

      for (const question of lesson.quiz) {
        assert.equal(question.options.length, 3, `${conceptId} ${question.id} options`);
        assert.ok(Number.isInteger(question.correctIndex));
        assert.ok(question.correctIndex >= 0 && question.correctIndex <= 2);
        assert.equal(typeof question.question, 'string');
        assert.equal(typeof question.explanation, 'string');
      }

      for (const example of lesson.examples) {
        assert.ok(Array.isArray(example.sourceIds));
        for (const sourceId of example.sourceIds) {
          assert.ok(
            sources.some((source) => source.id === sourceId),
            `${conceptId} example ${example.id} cites unresolved ${sourceId}`
          );
        }
      }

      // The review badge must still work from the normalised entry.
      assert.doesNotThrow(() => getReviewStatusView(review));
    }
  });

  it('rejects payloads that cannot produce a usable lesson, with a readable reason', () => {
    const cases = [
      ['no body', null],
      ['html fallback', '<!doctype html><html></html>'],
      ['error status', { status: 'error', message: 'nope' }],
      ['missing lesson', { status: 'success' }],
      ['lesson is a string', { status: 'success', lesson: 'Income' }],
      ['missing explanation', { status: 'success', lesson: { quiz: [] } }],
      [
        'empty explanation',
        { status: 'success', lesson: { explanation: [], quiz: [] } },
      ],
      [
        'quiz without options',
        {
          status: 'success',
          lesson: {
            explanation: ['Income is money that comes in.'],
            quiz: [{ id: 'q1', question: 'Which?', options: [], correctIndex: 0 }],
          },
        },
      ],
      [
        'quiz with two options',
        {
          status: 'success',
          lesson: {
            explanation: ['Income is money that comes in.'],
            quiz: [
              { id: 'q1', question: 'Which?', options: ['a', 'b'], correctIndex: 0 },
            ],
          },
        },
      ],
      [
        'quiz with out-of-range correctIndex',
        {
          status: 'success',
          lesson: {
            explanation: ['Income is money that comes in.'],
            quiz: [
              { id: 'q1', question: 'Which?', options: ['a', 'b', 'c'], correctIndex: 7 },
            ],
          },
        },
      ],
    ];

    for (const [label, body] of cases) {
      let result;
      assert.doesNotThrow(() => {
        result = normalizeCuratedLessonResponse(body);
      }, label);

      assert.equal(result.ok, false, label);
      assert.equal(typeof result.reason, 'string', label);
      assert.ok(result.reason.length > 0, label);
    }
  });

  it('degrades optional sections instead of taking the whole modal down', () => {
    const result = normalizeCuratedLessonResponse({
      status: 'success',
      contentVersion: '1.0.0',
      lesson: {
        conceptId: 'income',
        title: 'Income',
        category: 'Money Basics',
        // A paragraph delivered as a bare string, not an array.
        explanation: 'Income is money that comes in.',
        // Everything else is missing or the wrong type.
        objectives: null,
        examples: 'not a list',
        keyTakeaways: undefined,
        quiz: [
          { id: 'q1', question: 'Which?', options: ['a', 'b', 'c'], correctIndex: 2 },
          { id: 'q2', question: 'Broken?', options: ['a'], correctIndex: 0 },
        ],
      },
      sources: { id: 'RBI-FAME' },
      review: 'not an object',
    });

    assert.equal(result.ok, true);

    const { lesson, sources, review, contentVersion } = result.entry;

    assert.deepEqual(lesson.explanation, ['Income is money that comes in.']);
    assert.deepEqual(lesson.objectives, []);
    assert.deepEqual(lesson.examples, []);
    assert.deepEqual(lesson.keyTakeaways, []);
    assert.equal(lesson.quiz.length, 1);
    assert.deepEqual(lesson.quiz[0].options, ['a', 'b', 'c']);
    assert.equal(lesson.quiz[0].explanation, '');
    assert.deepEqual(sources, []);
    assert.equal(review, null);
    assert.equal(contentVersion, '1.0.0');
  });

  it('drops malformed examples but keeps the rest of the lesson', () => {
    const result = normalizeCuratedLessonResponse({
      status: 'success',
      lesson: {
        conceptId: 'income',
        title: 'Income',
        explanation: ['Income is money that comes in.'],
        examples: [
          { id: 'EX-1', title: 'Salary', text: 'Take-home pay is what arrives.' },
          { id: 'EX-2', title: 'No text' },
          'not an object',
          {
            id: 'EX-3',
            title: 'With calculation',
            text: 'Gross minus deductions.',
            sourceIds: ['RBI-FAME'],
            calculation: { formula: 'gross - deductions', steps: ['a', 'b'], result: 'net' },
          },
        ],
        keyTakeaways: ['Budget from take-home pay.'],
        quiz: [
          { id: 'q1', question: 'Which?', options: ['a', 'b', 'c'], correctIndex: 1 },
        ],
      },
      sources: [
        { id: 'RBI-FAME', publisher: 'RBI', title: 'FAME', url: 'https://www.rbi.org.in/' },
        { id: 'NO-URL', publisher: 'Broken', title: 'Broken' },
      ],
      review: { status: 'source-checked' },
    });

    assert.equal(result.ok, true);
    assert.equal(result.entry.lesson.examples.length, 2);
    assert.deepEqual(result.entry.lesson.examples[0].sourceIds, []);
    assert.deepEqual(result.entry.lesson.examples[1].calculation, {
      formula: 'gross - deductions',
      steps: ['a', 'b'],
      result: 'net',
    });
    assert.deepEqual(
      result.entry.sources.map((source) => source.id),
      ['RBI-FAME']
    );
  });

  it('never returns a lesson whose renderer fields are not arrays', async () => {
    const index = await loadCuratedLessonIndex();

    for (const conceptId of index.lessons.keys()) {
      const body = await apiBodyFor(conceptId, index);
      // Simulate a shape-drifted backend by flattening the arrays to strings.
      const drifted = {
        ...body,
        lesson: {
          ...body.lesson,
          objectives: 'string objectives',
          explanation: body.lesson.explanation.join(' '),
          examples: { not: 'a list' },
          keyTakeaways: 42,
          quiz: body.lesson.quiz,
        },
        sources: 'not a list',
      };

      const result = normalizeCuratedLessonResponse(drifted);
      assert.equal(result.ok, true, conceptId);

      const { lesson, sources } = result.entry;
      for (const field of ['objectives', 'explanation', 'examples', 'keyTakeaways', 'quiz']) {
        assert.ok(Array.isArray(lesson[field]), `${conceptId} ${field}`);
      }
      assert.ok(Array.isArray(sources), `${conceptId} sources`);
    }
  });
});
