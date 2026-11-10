import { Router } from 'express';
import {
  getLearningConcept,
  getLearningCurriculum,
  LEARNING_CONCEPTS_BY_ID,
} from '../data/learningRoadmap.js';
import { generateLesson } from '../services/ai.service.js';
import {
  CURATED_LESSON_SCHEMA_VERSION,
  getCuratedLesson,
  listCuratedLessons,
} from '../content/curatedLessons.js';

const router = Router();

const CONCEPT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * GET /api/learn/curriculum
 * Returns the curated roadmap metadata. Lesson prose is never stored here.
 */
router.get('/curriculum', (req, res) => {
  res.json(getLearningCurriculum());
});

/**
 * GET /api/learn/lessons
 * Lists the curated lessons that are available without an AI provider.
 */
router.get('/lessons', async (req, res, next) => {
  try {
    const lessons = await listCuratedLessons();
    res.json({
      status: 'success',
      source: 'curated',
      schemaVersion: CURATED_LESSON_SCHEMA_VERSION,
      count: lessons.length,
      lessons,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/learn/lessons/:conceptId
 * Returns one validated, curated lesson with its citations and review status.
 * This route never contacts the AI provider.
 */
router.get('/lessons/:conceptId', async (req, res, next) => {
  const { conceptId } = req.params;

  if (
    typeof conceptId !== 'string' ||
    conceptId.length > 80 ||
    !CONCEPT_ID_PATTERN.test(conceptId)
  ) {
    return res.status(400).json({
      status: 'error',
      code: 'invalid_concept_id',
      message: 'conceptId must be a lowercase slug.',
    });
  }

  const concept = getLearningConcept(conceptId);
  if (!concept) {
    return res.status(404).json({
      status: 'error',
      code: 'unknown_concept',
      message: 'This concept is not part of the WealthGenie learning roadmap.',
    });
  }

  try {
    const entry = await getCuratedLesson(conceptId);

    if (!entry) {
      return res.status(404).json({
        status: 'error',
        code: 'lesson_not_available',
        message:
          'No source-checked lesson is published for this concept yet. The AI tutor can generate one on request.',
      });
    }

    return res.json({
      status: 'success',
      source: 'curated',
      schemaVersion: CURATED_LESSON_SCHEMA_VERSION,
      contentVersion: entry.lesson.contentVersion,
      lesson: entry.lesson,
      sources: entry.sources,
      review: entry.review,
    });
  } catch (error) {
    return next(error);
  }
});

/**
 * POST /api/learn/lesson
 * Generates one structured lesson through the live backend LLM integration.
 * Kept for concepts that do not have curated content yet.
 */
router.post('/lesson', async (req, res) => {
  const { conceptId } = req.body || {};

  if (
    typeof conceptId !== 'string' ||
    conceptId.trim().length === 0 ||
    conceptId.trim().length > 80
  ) {
    return res.status(400).json({
      status: 'error',
      code: 'invalid_concept_id',
      message: 'conceptId is required and must be a non-empty string.',
    });
  }

  const concept = getLearningConcept(conceptId.trim());
  if (!concept) {
    return res.status(404).json({
      status: 'error',
      code: 'unknown_concept',
      message: 'This concept is not part of the WealthGenie learning roadmap.',
    });
  }

  const prerequisiteTitles = concept.prerequisites
    .map((id) => LEARNING_CONCEPTS_BY_ID.get(id)?.title)
    .filter(Boolean);

  const result = await generateLesson(concept, { prerequisiteTitles });

  if (result.status === 'unconfigured') {
    return res.status(503).json(result);
  }

  if (result.status === 'error') {
    return res.status(502).json(result);
  }

  return res.status(200).json({
    ...result,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
