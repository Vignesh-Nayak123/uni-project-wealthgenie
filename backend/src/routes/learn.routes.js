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
router.post('/lesson', async (req, res, next) => {
  const rawConceptId = req.body?.conceptId;
  const conceptId = typeof rawConceptId === 'string' ? rawConceptId.trim() : '';

  if (!conceptId || conceptId.length > 80 || !CONCEPT_ID_PATTERN.test(conceptId)) {
    return res.status(400).json({
      status: 'error',
      code: 'invalid_concept_id',
      message: 'conceptId is required and must be a lowercase slug.',
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

  // Express 4 does not catch rejected promises from async handlers; without
  // this an unexpected throw becomes an unhandledRejection and the request
  // hangs until the client gives up.
  try {
    const prerequisiteTitles = (concept.prerequisites || [])
      .map((id) => LEARNING_CONCEPTS_BY_ID.get(id)?.title)
      .filter(Boolean);

    const result = await generateLesson(concept, { prerequisiteTitles });

    if (result.status === 'unconfigured') {
      return res.status(503).json(result);
    }

    if (result.status === 'error') {
      // Parse/validation details are for server logs, not learners.
      const { details, ...publicResult } = result;
      const status = result.code === 'provider_timeout' ? 504 : 502;
      return res.status(status).json(publicResult);
    }

    return res.status(200).json({
      ...result,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
