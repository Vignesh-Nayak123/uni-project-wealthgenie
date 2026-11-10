import {
  LEARNING_CONCEPTS,
  LEARNING_CONCEPTS_BY_ID,
} from '../data/learningRoadmap.js';

export const MAX_QUIZ_QUESTIONS = 100;

const CONCEPT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_QUIZ_PROGRESS_ENTRIES = LEARNING_CONCEPTS.length;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function emptyLearningProgress() {
  return {
    completedConceptIds: [],
    quizProgress: {},
    updatedAt: null,
  };
}

function normalizeQuizEntry(rawEntry) {
  if (!isPlainObject(rawEntry)) return null;

  const { correct, total, completed, updatedAt } = rawEntry;

  if (!Number.isInteger(correct) || correct < 0) return null;
  if (!Number.isInteger(total) || total < 1 || total > MAX_QUIZ_QUESTIONS) {
    return null;
  }
  if (correct > total) return null;

  return {
    correct,
    total,
    completed: typeof completed === 'boolean' ? completed : correct === total,
    updatedAt:
      typeof updatedAt === 'string' && updatedAt.length <= 40 ? updatedAt : null,
  };
}

/**
 * Validates a progress payload sent by a signed-in client. Unknown concept IDs
 * are rejected rather than silently dropped, so a stale client cannot write
 * curriculum data that the server does not recognise.
 */
export function validateLearningProgressPayload(body) {
  if (!isPlainObject(body)) {
    throw new Error('Progress payload must be an object.');
  }

  const completedConceptIds = body.completedConceptIds ?? [];
  if (!Array.isArray(completedConceptIds)) {
    throw new Error('completedConceptIds must be an array.');
  }

  const seen = new Set();
  for (const conceptId of completedConceptIds) {
    if (typeof conceptId !== 'string' || !CONCEPT_ID_PATTERN.test(conceptId)) {
      throw new Error('completedConceptIds must contain lowercase concept slugs.');
    }
    if (!LEARNING_CONCEPTS_BY_ID.has(conceptId)) {
      throw new Error(`Unknown concept id: ${conceptId}.`);
    }
    if (seen.has(conceptId)) {
      throw new Error(`Duplicate concept id: ${conceptId}.`);
    }
    seen.add(conceptId);
  }

  const rawQuizProgress = body.quizProgress ?? {};
  if (!isPlainObject(rawQuizProgress)) {
    throw new Error('quizProgress must be an object.');
  }

  const quizEntries = Object.entries(rawQuizProgress);
  if (quizEntries.length > MAX_QUIZ_PROGRESS_ENTRIES) {
    throw new Error('quizProgress contains too many entries.');
  }

  const quizProgress = {};
  for (const [conceptId, rawEntry] of quizEntries) {
    if (!LEARNING_CONCEPTS_BY_ID.has(conceptId)) {
      throw new Error(`Unknown quiz concept id: ${conceptId}.`);
    }

    const entry = normalizeQuizEntry(rawEntry);
    if (!entry) {
      throw new Error(`Invalid quiz progress for ${conceptId}.`);
    }
    quizProgress[conceptId] = entry;
  }

  return {
    completedConceptIds: LEARNING_CONCEPTS.filter((concept) =>
      seen.has(concept.id)
    ).map((concept) => concept.id),
    quizProgress,
  };
}

function quizRatio(entry) {
  if (!entry || !entry.total) return -1;
  return entry.correct / entry.total;
}

export function mergeQuizProgressEntry(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingRatio = quizRatio(existing);
  const incomingRatio = quizRatio(incoming);

  if (incomingRatio > existingRatio) return incoming;
  if (existingRatio > incomingRatio) return existing;

  // Equal scores: prefer the attempt that covered more questions, and treat a
  // completed attempt as at least as good as an incomplete one.
  if (incoming.total > existing.total) return incoming;
  if (existing.total > incoming.total) return existing;
  if (incoming.completed && !existing.completed) return incoming;
  return existing;
}

/**
 * Merges two progress snapshots without ever removing a completed concept.
 * Used when a guest's browser progress meets the signed-in account's record.
 */
export function mergeLearningProgress(existing, incoming) {
  const completed = new Set([
    ...(existing?.completedConceptIds || []),
    ...(incoming?.completedConceptIds || []),
  ]);

  const quizProgress = {};
  const quizKeys = new Set([
    ...Object.keys(existing?.quizProgress || {}),
    ...Object.keys(incoming?.quizProgress || {}),
  ]);

  for (const conceptId of quizKeys) {
    const merged = mergeQuizProgressEntry(
      existing?.quizProgress?.[conceptId],
      incoming?.quizProgress?.[conceptId]
    );
    if (merged) quizProgress[conceptId] = merged;
  }

  const updatedAtCandidates = [
    existing?.updatedAt,
    incoming?.updatedAt,
  ].filter((value) => typeof value === 'string');

  return {
    completedConceptIds: LEARNING_CONCEPTS.filter((concept) =>
      completed.has(concept.id)
    ).map((concept) => concept.id),
    quizProgress,
    updatedAt:
      updatedAtCandidates.length > 0
        ? updatedAtCandidates.sort().at(-1)
        : null,
  };
}

export function mapLearningProgressRow(row) {
  if (!row) return emptyLearningProgress();

  return {
    completedConceptIds: Array.isArray(row.completed_concept_ids)
      ? row.completed_concept_ids.filter((id) => LEARNING_CONCEPTS_BY_ID.has(id))
      : [],
    quizProgress: isPlainObject(row.quiz_progress) ? row.quiz_progress : {},
    updatedAt: row.updated_at || null,
  };
}

export function learningProgressUpsertRow(progress, userId) {
  return {
    user_id: userId,
    completed_concept_ids: progress.completedConceptIds,
    quiz_progress: progress.quizProgress,
  };
}
