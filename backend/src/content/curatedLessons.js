/**
 * Curated lesson access for the Learn UI.
 *
 * Reads the versioned lesson JSON files through the existing content contract
 * and only exposes lessons that pass validation. Nothing here calls an AI
 * provider: a curated lesson opens even when Gemini is unconfigured or over
 * quota.
 */

import {
  LEARNING_CONCEPTS,
} from '../data/learningRoadmap.js';
import {
  LESSONS_DIRECTORY,
  SOURCES_PATH,
  loadLearningContent,
} from './loadContent.js';
import {
  LESSON_SCHEMA_VERSION,
  validateLesson,
  validateSourceRegistry,
} from './lessonContract.js';

export const CURATED_LESSON_SOURCE = 'curated';

/**
 * Learner-facing labels. The UI must never upgrade a status on its own, so the
 * label is produced here and rendered verbatim.
 */
export const REVIEW_LABELS = {
  draft: 'Draft — not source checked',
  'source-checked': 'Source checked — awaiting human review',
  reviewed: 'Human reviewed',
  retired: 'Retired',
};

const REVIEW_ORDER = ['draft', 'source-checked', 'reviewed', 'retired'];

function publicSource(source) {
  return {
    id: source.id,
    publisher: source.publisher,
    title: source.title,
    url: source.url,
    accessedAt: source.accessedAt,
    publishedAt: source.publishedAt ?? null,
  };
}

function publicReview(lesson) {
  return {
    status: lesson.status,
    label: REVIEW_LABELS[lesson.status] || REVIEW_LABELS.draft,
    isHumanReviewed: lesson.status === 'reviewed',
    sourceCheckedAt: lesson.review?.sourceCheckedAt ?? null,
    reviewedBy: lesson.review?.reviewedBy ?? null,
    reviewedAt: lesson.review?.reviewedAt ?? null,
    nextReviewAt: lesson.review?.nextReviewAt ?? null,
    notes: lesson.review?.notes ?? null,
  };
}

function publicLesson(lesson) {
  const { __file, ...rest } = lesson;
  return rest;
}

/**
 * Loads and validates every curated lesson file.
 *
 * @returns {Promise<{
 *   lessons: Map<string, {lesson: object, sources: object[], review: object, file: string}>,
 *   invalid: Array<{conceptId: string|null, file: string|null, errors: object[]}>,
 *   errors: string[],
 * }>}
 */
export async function loadCuratedLessonIndex({
  lessonsDirectory = LESSONS_DIRECTORY,
  sourcesPath = SOURCES_PATH,
  today,
  logger = console,
} = {}) {
  const lessons = new Map();
  const invalid = [];
  const errors = [];

  let registry;
  let loadedLessons;
  try {
    ({ registry, lessons: loadedLessons } = await loadLearningContent({
      sourcesPath,
      lessonsDirectory,
    }));
  } catch (error) {
    const message = `Curated lesson content could not be loaded: ${error.message}`;
    logger.error?.(message);
    errors.push(message);
    return { lessons, invalid, errors };
  }

  const { errors: registryErrors, sourcesById } = validateSourceRegistry(registry, {
    concepts: LEARNING_CONCEPTS,
    today,
  });

  if (registryErrors.length > 0) {
    for (const registryError of registryErrors) {
      errors.push(`[${registryError.code}] ${registryError.path}: ${registryError.message}`);
    }
    logger.error?.(
      `Curated lesson registry has ${registryErrors.length} validation error(s); lessons may be withheld.`
    );
  }

  for (const rawLesson of loadedLessons) {
    const file = rawLesson.__file ?? null;
    const conceptId =
      typeof rawLesson.conceptId === 'string' ? rawLesson.conceptId : null;

    const lessonErrors = validateLesson(rawLesson, {
      concepts: LEARNING_CONCEPTS,
      sourcesById,
      today,
    });

    if (lessonErrors.length > 0) {
      invalid.push({ conceptId, file, errors: lessonErrors });
      logger.error?.(
        `Curated lesson ${file || conceptId} failed validation and will not be served: ` +
          lessonErrors.map((error) => `[${error.code}] ${error.message}`).join(' ')
      );
      continue;
    }

    const lesson = publicLesson(rawLesson);
    lessons.set(lesson.conceptId, {
      lesson,
      sources: lesson.sourceIds.map((sourceId) => publicSource(sourcesById.get(sourceId))),
      review: publicReview(lesson),
      file,
    });
  }

  return { lessons, invalid, errors };
}

let cache = null;
let pending = null;

async function buildIndex(options) {
  const index = await loadCuratedLessonIndex(options);
  cache = index;
  return index;
}

/**
 * Cached index used by the API. Tests can call resetCuratedLessonCache().
 */
export async function getCuratedLessonIndex(options = {}) {
  if (cache) return cache;
  if (!pending) {
    pending = buildIndex(options).finally(() => {
      pending = null;
    });
  }
  return pending;
}

export function resetCuratedLessonCache() {
  cache = null;
  pending = null;
}

export async function getCuratedLesson(conceptId, options = {}) {
  const index = await getCuratedLessonIndex(options);
  return index.lessons.get(conceptId) || null;
}

export async function listCuratedLessons(options = {}) {
  const index = await getCuratedLessonIndex(options);
  return [...index.lessons.values()]
    .map((entry) => ({
      conceptId: entry.lesson.conceptId,
      title: entry.lesson.title,
      category: entry.lesson.category,
      contentVersion: entry.lesson.contentVersion,
      schemaVersion: entry.lesson.schemaVersion,
      status: entry.review.status,
      reviewLabel: entry.review.label,
      isHumanReviewed: entry.review.isHumanReviewed,
      estimatedMinutes: entry.lesson.estimatedMinutes,
      quizCount: entry.lesson.quiz.length,
      sourceCount: entry.lesson.sourceIds.length,
    }))
    .sort((left, right) => left.conceptId.localeCompare(right.conceptId));
}

export const CURATED_LESSON_SCHEMA_VERSION = LESSON_SCHEMA_VERSION;
export const REVIEW_STATUS_ORDER = REVIEW_ORDER;
