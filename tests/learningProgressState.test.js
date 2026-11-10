import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_PROGRESS_STORAGE_KEY,
  completeLearningConcept,
  createEmptyLearningProgress,
  localProgressBelongsToUser,
  mergeLearningProgressSnapshots,
  normalizeLearningProgress,
  readLearningProgress,
  recordQuizProgress,
  writeLearningProgress,
} from '../frontend/src/utils/learningProgress.js';
import { LEARNING_CONCEPTS } from '../backend/src/data/learningRoadmap.js';

function createMemoryStorage(initial = null) {
  let value = initial;
  return {
    getItem() {
      return value;
    },
    setItem(key, nextValue) {
      assert.equal(key, LEARNING_PROGRESS_STORAGE_KEY);
      value = nextValue;
    },
    removeItem() {
      value = null;
    },
    read() {
      return value;
    },
  };
}

describe('learning progress state', () => {
  it('drops a completed concept whose prerequisite is missing', () => {
    const normalized = normalizeLearningProgress(
      { completedConceptIds: ['expenses', 'budgeting'] },
      LEARNING_CONCEPTS
    );

    assert.deepEqual(normalized.completedConceptIds, []);
  });

  it('keeps a valid prerequisite chain in curriculum order', () => {
    const normalized = normalizeLearningProgress(
      { completedConceptIds: ['budgeting', 'income', 'expenses'] },
      LEARNING_CONCEPTS
    );

    assert.deepEqual(normalized.completedConceptIds, [
      'income',
      'expenses',
      'budgeting',
    ]);
  });

  it('round-trips completed concepts and quiz progress through storage', () => {
    const storage = createMemoryStorage();
    const progress = {
      completedConceptIds: ['income'],
      quizProgress: {
        income: { correct: 2, total: 3, completed: false, updatedAt: null },
      },
      updatedAt: '2026-10-28T09:00:00.000Z',
    };

    assert.equal(writeLearningProgress(progress, storage), true);

    const restored = readLearningProgress(storage, LEARNING_CONCEPTS);
    assert.deepEqual(restored.completedConceptIds, ['income']);
    assert.equal(restored.quizProgress.income.correct, 2);
    assert.equal(restored.quizProgress.income.total, 3);
  });

  it('reads the pre-quiz storage shape without inventing data', () => {
    const storage = createMemoryStorage(
      JSON.stringify({
        version: 1,
        completedConceptIds: ['income'],
        updatedAt: null,
      })
    );

    const restored = readLearningProgress(storage, LEARNING_CONCEPTS);
    assert.deepEqual(restored.completedConceptIds, ['income']);
    assert.deepEqual(restored.quizProgress, {});
  });

  it('merges guest and account progress without losing either side', () => {
    const merged = mergeLearningProgressSnapshots(
      {
        completedConceptIds: ['income', 'expenses'],
        quizProgress: {
          income: { correct: 1, total: 3, completed: false },
        },
      },
      {
        completedConceptIds: ['income'],
        quizProgress: {
          income: { correct: 3, total: 3, completed: true },
          expenses: { correct: 2, total: 3, completed: false },
        },
      },
      LEARNING_CONCEPTS
    );

    assert.deepEqual(merged.completedConceptIds, ['income', 'expenses']);
    assert.equal(merged.quizProgress.income.correct, 3);
    assert.equal(merged.quizProgress.expenses.correct, 2);
  });

  it('treats guest progress as mergeable and another user cache as isolated', () => {
    const OWNER = '11111111-1111-4111-8111-111111111111';
    const OTHER = '22222222-2222-4222-8222-222222222222';

    assert.equal(
      localProgressBelongsToUser({ ownerUserId: null }, OWNER),
      true,
      'guest progress may merge into a signed-in account'
    );
    assert.equal(
      localProgressBelongsToUser({ ownerUserId: OWNER }, OWNER),
      true
    );
    assert.equal(
      localProgressBelongsToUser({ ownerUserId: OWNER }, OTHER),
      false,
      'one signed-in user must not inherit another user browser cache'
    );
    assert.equal(localProgressBelongsToUser({}, null), true);
  });

  it('preserves the owner across storage round-trips and merges', () => {
    const OWNER = '11111111-1111-4111-8111-111111111111';
    const storage = createMemoryStorage();

    assert.equal(
      writeLearningProgress(
        {
          completedConceptIds: ['income'],
          quizProgress: {},
          ownerUserId: OWNER,
          updatedAt: null,
        },
        storage
      ),
      true
    );

    const restored = readLearningProgress(storage, LEARNING_CONCEPTS);
    assert.equal(restored.ownerUserId, OWNER);

    const merged = mergeLearningProgressSnapshots(
      restored,
      { completedConceptIds: ['expenses'], ownerUserId: null },
      LEARNING_CONCEPTS
    );
    assert.equal(merged.ownerUserId, OWNER);
  });

  it('records only improvements to the quiz score', () => {
    const first = recordQuizProgress(
      createEmptyLearningProgress(),
      'income',
      { correct: 1, total: 3 },
      LEARNING_CONCEPTS
    );
    assert.equal(first.changed, true);
    assert.equal(first.progress.quizProgress.income.correct, 1);

    const worse = recordQuizProgress(
      first.progress,
      'income',
      { correct: 0, total: 3 },
      LEARNING_CONCEPTS
    );
    assert.equal(worse.changed, false);
    assert.equal(worse.progress.quizProgress.income.correct, 1);

    const better = recordQuizProgress(
      worse.progress,
      'income',
      { correct: 3, total: 3 },
      LEARNING_CONCEPTS
    );
    assert.equal(better.changed, true);
    assert.equal(better.progress.quizProgress.income.correct, 3);
    assert.equal(better.progress.quizProgress.income.completed, true);
  });

  it('completes a concept only after its prerequisites and keeps quiz scores', () => {
    const progress = {
      completedConceptIds: ['income', 'expenses'],
      quizProgress: {
        expenses: { correct: 3, total: 3, completed: true },
      },
      updatedAt: null,
    };

    const concept = LEARNING_CONCEPTS.find((item) => item.id === 'budgeting');
    const result = completeLearningConcept(progress, concept, LEARNING_CONCEPTS);

    assert.equal(result.changed, true);
    assert.deepEqual(result.progress.completedConceptIds, [
      'income',
      'expenses',
      'budgeting',
    ]);
    assert.equal(result.progress.quizProgress.expenses.correct, 3);
  });

  it('refuses to complete a concept with a missing prerequisite', () => {
    const concept = LEARNING_CONCEPTS.find((item) => item.id === 'budgeting');
    const result = completeLearningConcept(
      createEmptyLearningProgress(),
      concept,
      LEARNING_CONCEPTS
    );

    assert.equal(result.changed, false);
    assert.equal(result.reason, 'prerequisites-incomplete');
    assert.deepEqual(
      result.missingPrerequisites.map((item) => item.id).sort(),
      ['expenses', 'income']
    );
  });
});
