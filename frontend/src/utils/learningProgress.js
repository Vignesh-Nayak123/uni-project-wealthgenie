export const LEARNING_PROGRESS_STORAGE_KEY = 'wealthgenie.learningProgress.v1';
export const LEARNING_PROGRESS_VERSION = 1;

export function createEmptyLearningProgress() {
  return {
    version: LEARNING_PROGRESS_VERSION,
    completedConceptIds: [],
    quizProgress: {},
    ownerUserId: null,
    updatedAt: null,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeOwnerUserId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    ? value
    : null;
}

function normalizeQuizEntry(entry) {
  if (!isPlainObject(entry)) return null;

  const { correct, total, completed, updatedAt } = entry;
  if (!Number.isInteger(correct) || correct < 0) return null;
  if (!Number.isInteger(total) || total < 1 || correct > total) return null;

  return {
    correct,
    total,
    completed: typeof completed === 'boolean' ? completed : correct === total,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : null,
  };
}

function normalizeQuizProgress(rawQuizProgress, conceptMap) {
  if (!isPlainObject(rawQuizProgress)) return {};

  const normalized = {};
  for (const [conceptId, rawEntry] of Object.entries(rawQuizProgress)) {
    if (!conceptMap.has(conceptId)) continue;
    const entry = normalizeQuizEntry(rawEntry);
    if (entry) normalized[conceptId] = entry;
  }
  return normalized;
}

function quizRatio(entry) {
  if (!entry || !entry.total) return -1;
  return entry.correct / entry.total;
}

function pickBetterQuizEntry(existing, incoming) {
  if (!existing) return incoming;
  if (!incoming) return existing;

  const existingRatio = quizRatio(existing);
  const incomingRatio = quizRatio(incoming);

  if (incomingRatio > existingRatio) return incoming;
  if (existingRatio > incomingRatio) return existing;
  if (incoming.total > existing.total) return incoming;
  if (existing.total > incoming.total) return existing;
  if (incoming.completed && !existing.completed) return incoming;
  return existing;
}

function getDefaultStorage() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function asCompletedSet(completedConceptIds) {
  if (completedConceptIds instanceof Set) {
    return new Set(completedConceptIds);
  }
  return new Set(Array.isArray(completedConceptIds) ? completedConceptIds : []);
}

export function normalizeLearningProgress(rawProgress, concepts) {
  const requested = new Set(
    Array.isArray(rawProgress?.completedConceptIds)
      ? rawProgress.completedConceptIds.filter((id) => typeof id === 'string')
      : []
  );
  const conceptMap = new Map((concepts || []).map((concept) => [concept.id, concept]));
  const kept = new Set();
  const visiting = new Set();

  const canKeep = (conceptId) => {
    if (kept.has(conceptId)) return true;
    if (visiting.has(conceptId)) return false;

    const concept = conceptMap.get(conceptId);
    if (!concept || !requested.has(conceptId)) return false;

    visiting.add(conceptId);
    for (const prerequisiteId of concept.prerequisites || []) {
      if (!canKeep(prerequisiteId)) {
        visiting.delete(conceptId);
        return false;
      }
    }
    visiting.delete(conceptId);
    kept.add(conceptId);
    return true;
  };

  for (const concept of concepts || []) {
    if (requested.has(concept.id)) {
      canKeep(concept.id);
    }
  }

  return {
    version: LEARNING_PROGRESS_VERSION,
    completedConceptIds: (concepts || [])
      .filter((concept) => kept.has(concept.id))
      .map((concept) => concept.id),
    quizProgress: normalizeQuizProgress(rawProgress?.quizProgress, conceptMap),
    ownerUserId: normalizeOwnerUserId(rawProgress?.ownerUserId),
    updatedAt:
      typeof rawProgress?.updatedAt === 'string' ? rawProgress.updatedAt : null,
  };
}

/**
 * Merges two progress snapshots (for example browser-local and account-synced)
 * without removing any completed concept and keeping the best quiz score.
 */
export function mergeLearningProgressSnapshots(existing, incoming, concepts = []) {
  const left = normalizeLearningProgress(existing, concepts);
  const right = normalizeLearningProgress(incoming, concepts);

  const completed = new Set([
    ...left.completedConceptIds,
    ...right.completedConceptIds,
  ]);

  const quizProgress = {};
  const quizKeys = new Set([
    ...Object.keys(left.quizProgress),
    ...Object.keys(right.quizProgress),
  ]);

  for (const conceptId of quizKeys) {
    const entry = pickBetterQuizEntry(
      left.quizProgress[conceptId],
      right.quizProgress[conceptId]
    );
    if (entry) quizProgress[conceptId] = entry;
  }

  const updatedAtCandidates = [left.updatedAt, right.updatedAt].filter(
    (value) => typeof value === 'string'
  );

  return {
    version: LEARNING_PROGRESS_VERSION,
    completedConceptIds: (concepts || [])
      .filter((concept) => completed.has(concept.id))
      .map((concept) => concept.id),
    quizProgress,
    ownerUserId: right.ownerUserId || left.ownerUserId || null,
    updatedAt:
      updatedAtCandidates.length > 0
        ? updatedAtCandidates.sort().at(-1)
        : null,
  };
}

export function getMissingPrerequisites(concept, concepts, completedConceptIds) {
  const completed = asCompletedSet(completedConceptIds);
  const conceptMap = new Map((concepts || []).map((item) => [item.id, item]));

  return (concept?.prerequisites || [])
    .filter((prerequisiteId) => !completed.has(prerequisiteId))
    .map((prerequisiteId) => conceptMap.get(prerequisiteId))
    .filter(Boolean);
}

export function getConceptState(concept, completedConceptIds) {
  const completed = asCompletedSet(completedConceptIds);

  if (!concept) return 'locked';
  if (completed.has(concept.id)) return 'completed';

  const prerequisites = concept.prerequisites || [];
  if (prerequisites.every((prerequisiteId) => completed.has(prerequisiteId))) {
    return 'available';
  }

  return 'locked';
}

export function getProgressSummary(concepts, completedConceptIds) {
  const completed = asCompletedSet(completedConceptIds);
  const total = (concepts || []).length;
  let availableCount = 0;
  let lockedCount = 0;

  for (const concept of concepts || []) {
    const state = getConceptState(concept, completed);
    if (state === 'available') availableCount += 1;
    if (state === 'locked') lockedCount += 1;
  }

  return {
    total,
    completedCount: (concepts || []).filter((concept) => completed.has(concept.id)).length,
    availableCount,
    lockedCount,
    percent: total > 0
      ? Math.round(
          ((concepts || []).filter((concept) => completed.has(concept.id)).length / total) * 100
        )
      : 0,
  };
}

export function getNewlyUnlockedConcepts(concepts, beforeCompletedIds, afterCompletedIds) {
  const before = asCompletedSet(beforeCompletedIds);
  const after = asCompletedSet(afterCompletedIds);

  return (concepts || []).filter(
    (concept) =>
      getConceptState(concept, before) === 'locked' &&
      getConceptState(concept, after) === 'available'
  );
}

export function completeLearningConcept(progress, concept, concepts) {
  const normalized = normalizeLearningProgress(progress, concepts);
  const completed = asCompletedSet(normalized.completedConceptIds);

  if (!concept || !concepts.some((item) => item.id === concept.id)) {
    return {
      progress: normalized,
      changed: false,
      reason: 'unknown-concept',
      missingPrerequisites: [],
    };
  }

  if (completed.has(concept.id)) {
    return {
      progress: normalized,
      changed: false,
      reason: 'already-completed',
      missingPrerequisites: [],
    };
  }

  const missingPrerequisites = getMissingPrerequisites(
    concept,
    concepts,
    normalized.completedConceptIds
  );

  if (missingPrerequisites.length > 0) {
    return {
      progress: normalized,
      changed: false,
      reason: 'prerequisites-incomplete',
      missingPrerequisites,
    };
  }

  return {
    progress: {
      ...normalized,
      completedConceptIds: [...normalized.completedConceptIds, concept.id],
      updatedAt: new Date().toISOString(),
    },
    changed: true,
    reason: null,
    missingPrerequisites: [],
  };
}

/**
 * A browser snapshot belongs to a user when it has no owner (guest progress) or
 * when its owner matches the signed-in user. A snapshot owned by someone else
 * must not be merged into the new user's account.
 */
export function localProgressBelongsToUser(progress, userId) {
  const owner = normalizeOwnerUserId(progress?.ownerUserId);
  if (!owner) return true;
  return typeof userId === 'string' && userId.length > 0 && owner === userId;
}

/**
 * Records the best quiz attempt for a concept. A later, worse attempt never
 * overwrites a better score. This is safe to call for guests and signed-in users.
 */
export function recordQuizProgress(progress, conceptId, score, concepts = []) {
  const normalized = normalizeLearningProgress(progress, concepts);
  const conceptMap = new Map((concepts || []).map((concept) => [concept.id, concept]));

  if (!conceptMap.has(conceptId)) {
    return { progress: normalized, changed: false };
  }

  const entry = normalizeQuizEntry(score);
  if (!entry) {
    return { progress: normalized, changed: false };
  }

  const existing = normalized.quizProgress[conceptId];
  const chosen = pickBetterQuizEntry(existing, entry);
  if (chosen === existing) {
    return { progress: normalized, changed: false };
  }

  return {
    progress: {
      ...normalized,
      quizProgress: {
        ...normalized.quizProgress,
        [conceptId]: chosen,
      },
      updatedAt: chosen.updatedAt || new Date().toISOString(),
    },
    changed: true,
  };
}

export function readLearningProgress(storage = getDefaultStorage(), concepts = []) {
  if (!storage) return createEmptyLearningProgress();

  try {
    const raw = storage.getItem(LEARNING_PROGRESS_STORAGE_KEY);
    if (!raw) return createEmptyLearningProgress();
    return normalizeLearningProgress(JSON.parse(raw), concepts);
  } catch {
    return createEmptyLearningProgress();
  }
}

export function writeLearningProgress(progress, storage = getDefaultStorage()) {
  if (!storage) return false;

  const safeQuizProgress = {};
  if (isPlainObject(progress?.quizProgress)) {
    for (const [conceptId, rawEntry] of Object.entries(progress.quizProgress)) {
      if (typeof conceptId !== 'string') continue;
      const entry = normalizeQuizEntry(rawEntry);
      if (entry) safeQuizProgress[conceptId] = entry;
    }
  }

  const safeProgress = {
    version: LEARNING_PROGRESS_VERSION,
    completedConceptIds: Array.from(
      new Set(
        Array.isArray(progress?.completedConceptIds)
          ? progress.completedConceptIds.filter((id) => typeof id === 'string')
          : []
      )
    ),
    quizProgress: safeQuizProgress,
    ownerUserId: normalizeOwnerUserId(progress?.ownerUserId),
    updatedAt:
      typeof progress?.updatedAt === 'string'
        ? progress.updatedAt
        : new Date().toISOString(),
  };

  try {
    storage.setItem(LEARNING_PROGRESS_STORAGE_KEY, JSON.stringify(safeProgress));
    return true;
  } catch {
    return false;
  }
}

export function clearLearningProgress(storage = getDefaultStorage()) {
  if (storage) {
    try {
      storage.removeItem(LEARNING_PROGRESS_STORAGE_KEY);
    } catch {
      // A failed storage clear must not invent completion state.
    }
  }
  return createEmptyLearningProgress();
}
