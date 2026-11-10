import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  loadCuratedLessonIndex,
  listCuratedLessons,
  resetCuratedLessonCache,
} from '../backend/src/content/curatedLessons.js';
import {
  evaluateQuizAnswer,
  isQuizSetComplete,
} from '../frontend/src/utils/learningQuiz.js';
import {
  formatContentDate,
  getReviewStatusView,
} from '../frontend/src/utils/lessonReview.js';
import { LEARNING_CONCEPTS } from '../backend/src/data/learningRoadmap.js';

const CURATED_CONCEPT_IDS = LEARNING_CONCEPTS.map((concept) => concept.id);
const EXPECTED_REVIEW_LABEL = 'Source checked — awaiting human review';

describe('curated lesson loading', () => {
  it('loads a valid lesson for all 23 roadmap concepts', async () => {
    const index = await loadCuratedLessonIndex();

    assert.deepEqual(index.errors, []);
    assert.deepEqual(index.invalid, []);
    assert.equal(index.lessons.size, 23);
    assert.deepEqual([...index.lessons.keys()].sort(), [...CURATED_CONCEPT_IDS].sort());
  });

  it('keeps lesson prose in the content files, not in frontend code', async () => {
    const index = await loadCuratedLessonIndex();
    const entry = index.lessons.get('upi-safety');

    assert.equal(entry.lesson.conceptId, 'upi-safety');
    assert.equal(entry.lesson.title, 'UPI safety');
    assert.ok(entry.lesson.explanation.length >= 1);
    assert.ok(entry.lesson.examples.length >= 1);
    assert.ok(entry.lesson.quiz.length >= 1);
    assert.equal(entry.file, 'upi-safety.json');
  });

  it('exposes content version, review record and resolved sources', async () => {
    const index = await loadCuratedLessonIndex();
    const entry = index.lessons.get('digital-financial-fraud');

    assert.equal(entry.lesson.contentVersion, '1.0.0');
    assert.equal(entry.lesson.schemaVersion, 1);
    assert.equal(entry.review.status, 'source-checked');
    assert.equal(entry.review.label, EXPECTED_REVIEW_LABEL);
    assert.equal(entry.review.isHumanReviewed, false);
    assert.equal(entry.review.reviewedBy, null);
    assert.equal(entry.review.sourceCheckedAt, '2026-10-28');
    assert.ok(entry.review.nextReviewAt > entry.review.sourceCheckedAt);
    assert.equal(entry.sources.length, entry.lesson.sourceIds.length);
  });

  it('does not leak the loader file marker into the served lesson', async () => {
    const index = await loadCuratedLessonIndex();
    const entry = index.lessons.get('upi-safety');

    assert.equal(Object.prototype.hasOwnProperty.call(entry.lesson, '__file'), false);
  });

  it('returns an empty index instead of throwing when the lessons directory is missing', async () => {
    const missing = path.join(tmpdir(), `wealthgenie-missing-lessons-${Date.now()}`);
    const index = await loadCuratedLessonIndex({ lessonsDirectory: missing });

    assert.equal(index.lessons.size, 0);
    assert.deepEqual(index.invalid, []);
    assert.deepEqual(index.errors, []);
  });

  it('withholds malformed lesson files and records why', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'wealthgenie-bad-lesson-'));
    try {
      await writeFile(
        path.join(directory, 'upi-safety.json'),
        JSON.stringify({ conceptId: 'upi-safety', title: 'UPI safety' }),
        'utf8'
      );

      const index = await loadCuratedLessonIndex({ lessonsDirectory: directory });

      assert.equal(index.lessons.size, 0);
      assert.equal(index.invalid.length, 1);
      assert.equal(index.invalid[0].conceptId, 'upi-safety');
      assert.ok(index.invalid[0].errors.length > 0);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe('curated lesson citations', () => {
  it('resolves every lesson and example citation to a registry source', async () => {
    const index = await loadCuratedLessonIndex();

    for (const [conceptId, entry] of index.lessons) {
      const resolvedIds = new Set(entry.sources.map((source) => source.id));
      assert.equal(resolvedIds.size, entry.lesson.sourceIds.length, conceptId);

      for (const sourceId of entry.lesson.sourceIds) {
        assert.ok(resolvedIds.has(sourceId), `${conceptId} cites unresolved ${sourceId}`);
      }

      for (const example of entry.lesson.examples) {
        for (const sourceId of example.sourceIds) {
          assert.ok(
            entry.lesson.sourceIds.includes(sourceId),
            `${conceptId} example ${example.id} cites undeclared ${sourceId}`
          );
        }
      }
    }
  });

  it('only publishes HTTPS sources with an access date', async () => {
    const index = await loadCuratedLessonIndex();

    for (const entry of index.lessons.values()) {
      for (const source of entry.sources) {
        assert.match(source.url, /^https:\/\//);
        assert.match(source.accessedAt, /^\d{4}-\d{2}-\d{2}$/);
        assert.ok(source.publisher.length > 0);
        assert.ok(source.title.length > 0);
      }
    }
  });

  it('lists the lessons through the same validated index', async () => {
    resetCuratedLessonCache();
    const lessons = await listCuratedLessons();

    assert.deepEqual(
      lessons.map((lesson) => lesson.conceptId),
      [...CURATED_CONCEPT_IDS].sort()
    );
    for (const lesson of lessons) {
      assert.equal(lesson.status, 'source-checked');
      assert.equal(lesson.reviewLabel, EXPECTED_REVIEW_LABEL);
      assert.equal(lesson.isHumanReviewed, false);
      assert.equal(lesson.contentVersion, '1.0.0');
      assert.equal(lesson.quizCount, 3);
      assert.ok(lesson.sourceCount >= 1);
    }
  });
});

describe('curated lesson quiz flow', () => {
  it('uses the schema quiz shape and covers every objective', async () => {
    const index = await loadCuratedLessonIndex();

    for (const [conceptId, entry] of index.lessons) {
      const objectiveIds = new Set(entry.lesson.objectives.map((objective) => objective.id));
      const covered = new Set();

      for (const quiz of entry.lesson.quiz) {
        assert.equal(quiz.options.length, 3, `${conceptId} ${quiz.id}`);
        assert.equal(new Set(quiz.options).size, 3, `${conceptId} ${quiz.id}`);
        assert.ok(Number.isInteger(quiz.correctIndex));
        assert.ok(quiz.correctIndex >= 0 && quiz.correctIndex <= 2);
        assert.ok(quiz.explanation.length > 0);
        assert.ok(objectiveIds.has(quiz.objectiveId));
        covered.add(quiz.objectiveId);
      }

      assert.deepEqual([...covered].sort(), [...objectiveIds].sort(), conceptId);
    }
  });

  it('evaluates correct and incorrect answers and gates completion on all questions', async () => {
    const index = await loadCuratedLessonIndex();
    const { lesson } = index.lessons.get('upi-safety');

    const correctAnswers = lesson.quiz.map((quiz) => quiz.correctIndex);
    const wrongAnswers = lesson.quiz.map((quiz) =>
      (quiz.correctIndex + 1) % quiz.options.length
    );

    lesson.quiz.forEach((quiz, index) => {
      const correct = evaluateQuizAnswer(quiz, correctAnswers[index]);
      assert.equal(correct.isCorrect, true);
      assert.equal(correct.feedback, quiz.explanation);

      const wrong = evaluateQuizAnswer(quiz, wrongAnswers[index]);
      assert.equal(wrong.isCorrect, false);
    });

    assert.equal(isQuizSetComplete(lesson.quiz, correctAnswers), true);
    assert.equal(isQuizSetComplete(lesson.quiz, wrongAnswers), false);
    assert.equal(isQuizSetComplete(lesson.quiz, correctAnswers.slice(0, 1)), false);
    assert.equal(isQuizSetComplete(lesson.quiz, [null, null, null]), false);
  });
});

describe('review status presentation', () => {
  it('never presents a source-checked lesson as approved', async () => {
    const index = await loadCuratedLessonIndex();
    const entry = index.lessons.get('upi-safety');
    const view = getReviewStatusView(entry.review);

    assert.equal(view.label, EXPECTED_REVIEW_LABEL);
    assert.equal(view.isApproved, false);
    assert.equal(view.isHumanReviewed, false);
    assert.equal(view.tone, 'amber');
    assert.match(view.detail, /no human reviewer/i);
  });

  it('uses the backend label verbatim instead of inventing one', () => {
    const view = getReviewStatusView({
      status: 'source-checked',
      label: 'Custom backend label',
      isHumanReviewed: false,
    });

    assert.equal(view.label, 'Custom backend label');
    assert.equal(view.isApproved, false);
  });

  it('falls back to a draft view for unknown statuses', () => {
    const view = getReviewStatusView({ status: 'something-else' });
    assert.equal(view.isApproved, false);
    assert.match(view.label, /not source checked/i);
  });

  it('formats access dates without a timezone shift', () => {
    assert.equal(formatContentDate('2026-10-28'), '28 Oct 2026');
    assert.equal(formatContentDate('2027-04-28'), '28 Apr 2027');
    assert.equal(formatContentDate('not-a-date'), '');
    assert.equal(formatContentDate(null), '');
  });
});

describe('learn lesson API', () => {
  let server;
  let baseUrl;

  before(async () => {
    process.env.GEMINI_API_KEY = '';
    resetCuratedLessonCache();
    const { createApp } = await import('../backend/src/app.js?learn-lessons-api');
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

  it('GET /api/learn/lessons lists all 23 curated lessons', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lessons`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'success');
    assert.equal(body.source, 'curated');
    assert.equal(body.schemaVersion, 1);
    assert.equal(body.count, 23);
    assert.deepEqual(
      body.lessons.map((lesson) => lesson.conceptId).sort(),
      [...CURATED_CONCEPT_IDS].sort()
    );
  });

  it('GET /api/learn/lessons/:conceptId serves a curated lesson without an AI key', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lessons/upi-safety`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.status, 'success');
    assert.equal(body.source, 'curated');
    assert.equal(body.contentVersion, '1.0.0');
    assert.equal(body.lesson.conceptId, 'upi-safety');
    assert.equal(body.lesson.title, 'UPI safety');
    assert.ok(Array.isArray(body.lesson.explanation));
    assert.ok(Array.isArray(body.lesson.examples));
    assert.ok(Array.isArray(body.lesson.keyTakeaways));
    assert.ok(Array.isArray(body.lesson.quiz));
    assert.ok(Array.isArray(body.sources) && body.sources.length >= 1);
    assert.equal(body.review.label, EXPECTED_REVIEW_LABEL);
    assert.equal(body.review.isHumanReviewed, false);
  });

  it('serves the second lesson with its own citations', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lessons/digital-financial-fraud`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.equal(body.lesson.conceptId, 'digital-financial-fraud');
    assert.deepEqual(
      body.sources.map((source) => source.id),
      body.lesson.sourceIds
    );
    assert.ok(body.sources.every((source) => source.url.startsWith('https://')));
    assert.ok(body.sources.every((source) => source.accessedAt === '2026-10-28'));
  });

  it('serves every roadmap concept without an AI key', async () => {
    for (const conceptId of CURATED_CONCEPT_IDS) {
      const response = await fetch(`${baseUrl}/api/learn/lessons/${conceptId}`);
      assert.equal(response.status, 200, conceptId);

      const body = await response.json();
      assert.equal(body.lesson.conceptId, conceptId);
      assert.ok(body.lesson.objectives.length >= 1, conceptId);
      assert.ok(body.lesson.explanation.length >= 1, conceptId);
      assert.ok(body.lesson.examples.length >= 1, conceptId);
      assert.ok(body.lesson.keyTakeaways.length >= 1, conceptId);
      assert.ok(body.lesson.quiz.length >= 1, conceptId);
      assert.deepEqual(
        body.sources.map((source) => source.id),
        body.lesson.sourceIds,
        conceptId
      );
    }
  });

  it('returns unknown_concept for concepts outside the roadmap', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lessons/not-a-concept`);
    assert.equal(response.status, 404);

    const body = await response.json();
    assert.equal(body.code, 'unknown_concept');
  });

  it('returns invalid_concept_id for a malformed slug', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lessons/Bad_Slug`);
    assert.equal(response.status, 400);

    const body = await response.json();
    assert.equal(body.code, 'invalid_concept_id');
  });

  it('keeps the optional AI path available for any roadmap concept', async () => {
    const response = await fetch(`${baseUrl}/api/learn/lesson`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conceptId: 'income' }),
    });

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.status, 'unconfigured');
  });
});

describe('AI quota handling', () => {
  it('reports a quota limit without affecting curated lessons', async () => {
    const { generateLesson } = await import('../backend/src/services/ai.service.js');
    const { getLearningConcept } = await import('../backend/src/data/learningRoadmap.js');

    const result = await generateLesson(getLearningConcept('income'), {
      aiConfig: {
        isAiConfigured: true,
        geminiApiKey: 'test-key',
        geminiModel: 'test-model',
      },
      fetchImpl: async () => ({ ok: false, status: 429, text: async () => '' }),
    });

    assert.equal(result.status, 'error');
    assert.equal(result.code, 'provider_quota');
    assert.match(result.message, /source-checked lessons still open/i);
  });
});
