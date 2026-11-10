import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_BRANCHES,
  LEARNING_CONCEPTS,
  getLearningConcept,
} from '../backend/src/data/learningRoadmap.js';
import {
  LEARNING_PROGRESS_STORAGE_KEY,
  clearLearningProgress,
  completeLearningConcept,
  createEmptyLearningProgress,
  getConceptState,
  getMissingPrerequisites,
  getNewlyUnlockedConcepts,
  getProgressSummary,
  normalizeLearningProgress,
  readLearningProgress,
  writeLearningProgress,
} from '../frontend/src/utils/learningProgress.js';
import { evaluateQuizAnswer } from '../frontend/src/utils/learningQuiz.js';

function complete(progress, conceptId) {
  const result = completeLearningConcept(
    progress,
    getLearningConcept(conceptId),
    LEARNING_CONCEPTS
  );
  assert.equal(result.changed, true, `Expected ${conceptId} to be completable`);
  return result.progress;
}

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

describe('Learning roadmap metadata and prerequisite graph', () => {
  it('contains all requested concepts in valid branches', () => {
    const branchIds = new Set(LEARNING_BRANCHES.map((branch) => branch.id));
    const conceptIds = new Set(LEARNING_CONCEPTS.map((concept) => concept.id));

    assert.equal(LEARNING_BRANCHES.length, 5);
    assert.equal(LEARNING_CONCEPTS.length, 23);
    assert.equal(conceptIds.size, LEARNING_CONCEPTS.length);

    for (const concept of LEARNING_CONCEPTS) {
      assert.ok(branchIds.has(concept.branchId), `${concept.id} has an unknown branch`);
      assert.equal(typeof concept.title, 'string');
      assert.ok(concept.title.length > 0);
      assert.ok(Array.isArray(concept.prerequisites));

      for (const prerequisiteId of concept.prerequisites) {
        assert.ok(
          conceptIds.has(prerequisiteId),
          `${concept.id} references missing prerequisite ${prerequisiteId}`
        );
        assert.notEqual(prerequisiteId, concept.id, `${concept.id} cannot require itself`);
      }
      assert.equal(
        new Set(concept.prerequisites).size,
        concept.prerequisites.length,
        `${concept.id} has duplicate prerequisites`
      );
    }
  });

  it('has no prerequisite cycles and exposes only root concepts initially', () => {
    const visiting = new Set();
    const visited = new Set();
    const conceptMap = new Map(LEARNING_CONCEPTS.map((concept) => [concept.id, concept]));

    function visit(conceptId) {
      if (visiting.has(conceptId)) {
        throw new Error(`Cycle detected at ${conceptId}`);
      }
      if (visited.has(conceptId)) return;
      visiting.add(conceptId);
      for (const prerequisiteId of conceptMap.get(conceptId).prerequisites) {
        visit(prerequisiteId);
      }
      visiting.delete(conceptId);
      visited.add(conceptId);
    }

    for (const concept of LEARNING_CONCEPTS) {
      visit(concept.id);
    }

    assert.equal(getConceptState(getLearningConcept('income'), []), 'available');
    assert.equal(getConceptState(getLearningConcept('expenses'), []), 'locked');
    assert.equal(getConceptState(getLearningConcept('upi-safety'), []), 'locked');
  });
});

describe('Prerequisite unlocking and completion', () => {
  it('shows every missing prerequisite for a locked node', () => {
    const budgeting = getLearningConcept('budgeting');
    const missing = getMissingPrerequisites(budgeting, LEARNING_CONCEPTS, []);
    assert.deepEqual(
      missing.map((concept) => concept.title),
      ['Income', 'Expenses']
    );
    assert.equal(getConceptState(budgeting, []), 'locked');
  });

  it('unlocks a node only after all prerequisites are complete', () => {
    let progress = createEmptyLearningProgress();
    const budgeting = getLearningConcept('budgeting');

    const blocked = completeLearningConcept(progress, budgeting, LEARNING_CONCEPTS);
    assert.equal(blocked.changed, false);
    assert.equal(blocked.reason, 'prerequisites-incomplete');
    assert.deepEqual(
      blocked.missingPrerequisites.map((concept) => concept.id),
      ['income', 'expenses']
    );

    progress = complete(progress, 'income');
    assert.equal(getConceptState(getLearningConcept('expenses'), progress.completedConceptIds), 'available');
    assert.equal(getConceptState(budgeting, progress.completedConceptIds), 'locked');

    progress = complete(progress, 'expenses');
    assert.equal(getConceptState(budgeting, progress.completedConceptIds), 'available');

    progress = complete(progress, 'budgeting');
    assert.equal(getConceptState(budgeting, progress.completedConceptIds), 'completed');
    assert.equal(
      getConceptState(getLearningConcept('saving-money'), progress.completedConceptIds),
      'available'
    );
  });

  it('reports newly unlocked dependents after completion', () => {
    let progress = complete(createEmptyLearningProgress(), 'income');
    progress = complete(progress, 'expenses');
    const before = progress.completedConceptIds;
    progress = complete(progress, 'budgeting');

    const newlyUnlocked = getNewlyUnlockedConcepts(
      LEARNING_CONCEPTS,
      before,
      progress.completedConceptIds
    );

    assert.deepEqual(newlyUnlocked.map((concept) => concept.id), ['saving-money']);
  });

  it('does not complete a node twice', () => {
    const progress = complete(createEmptyLearningProgress(), 'income');
    const result = completeLearningConcept(
      progress,
      getLearningConcept('income'),
      LEARNING_CONCEPTS
    );

    assert.equal(result.changed, false);
    assert.equal(result.reason, 'already-completed');
    assert.deepEqual(result.progress.completedConceptIds, ['income']);
  });

  it('drops unknown and inconsistent stored completions', () => {
    const normalized = normalizeLearningProgress(
      {
        version: 1,
        completedConceptIds: ['income', 'budgeting', 'does-not-exist'],
        updatedAt: '2026-10-25T00:00:00.000Z',
      },
      LEARNING_CONCEPTS
    );

    assert.deepEqual(normalized.completedConceptIds, ['income']);
    assert.equal(normalized.updatedAt, '2026-10-25T00:00:00.000Z');
  });

  it('summarizes only actual completed, available and locked concepts', () => {
    const progress = complete(createEmptyLearningProgress(), 'income');
    const summary = getProgressSummary(LEARNING_CONCEPTS, progress.completedConceptIds);

    assert.equal(summary.total, 23);
    assert.equal(summary.completedCount, 1);
    assert.equal(summary.availableCount, 1);
    assert.equal(summary.lockedCount, 21);
    assert.equal(summary.percent, 4);
  });

  it('persists and resets browser-local progress explicitly', () => {
    const storage = createMemoryStorage();
    let progress = complete(createEmptyLearningProgress(), 'income');
    progress = complete(progress, 'expenses');

    assert.equal(writeLearningProgress(progress, storage), true);
    assert.ok(storage.getItem(LEARNING_PROGRESS_STORAGE_KEY));

    const restored = readLearningProgress(storage, LEARNING_CONCEPTS);
    assert.deepEqual(restored.completedConceptIds, ['income', 'expenses']);

    const cleared = clearLearningProgress(storage);
    assert.deepEqual(cleared.completedConceptIds, []);
    assert.equal(storage.getItem(LEARNING_PROGRESS_STORAGE_KEY), null);
  });
});

describe('Quiz feedback evaluation', () => {
  const quiz = {
    question: 'Which option is correct?',
    options: ['Option A', 'Option B', 'Option C'],
    correctIndex: 1,
    explanation: 'Option B is correct because it matches the explanation.',
  };

  it('returns correct feedback for the right option', () => {
    const result = evaluateQuizAnswer(quiz, 1);
    assert.equal(result.isCorrect, true);
    assert.equal(result.correctOption, 'Option B');
    assert.equal(result.feedback, quiz.explanation);
  });

  it('returns corrective feedback and the correct answer for a wrong option', () => {
    const result = evaluateQuizAnswer(quiz, 2);
    assert.equal(result.isCorrect, false);
    assert.equal(result.selectedOption, 'Option C');
    assert.equal(result.correctOption, 'Option B');
    assert.equal(result.feedback, quiz.explanation);
  });

  it('rejects invalid quiz selections and malformed quizzes', () => {
    assert.equal(evaluateQuizAnswer(quiz, -1), null);
    assert.equal(evaluateQuizAnswer(quiz, 3), null);
    assert.equal(evaluateQuizAnswer({ ...quiz, options: ['A', 'B'] }, 0), null);
    assert.equal(evaluateQuizAnswer({ ...quiz, correctIndex: 4 }, 0), null);
  });
});
