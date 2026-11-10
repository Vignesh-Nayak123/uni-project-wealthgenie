/**
 * Runtime guard for the curated lesson payload served by
 * `GET /api/learn/lessons/:conceptId`.
 *
 * The Learn modal used to trust that response shape and pass it straight to the
 * renderer. When the payload drifted (an explanation delivered as a single
 * string, a missing `examples` array, a `sources` object instead of a list) the
 * renderer threw on `.map()`. React has no error boundary here, so it unmounted
 * the dialog and the learner was left looking at an empty white panel.
 *
 * Everything the renderer touches is normalised below. A payload that cannot be
 * rendered is reported as a readable reason so the modal can show an explicit
 * error instead of going blank, and optional sections degrade to empty lists
 * rather than taking the whole lesson down.
 */

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

function toStringArray(value) {
  if (Array.isArray(value)) return value.filter(isNonEmptyString);
  // Some responses carry a single paragraph/takeaway as a bare string.
  if (isNonEmptyString(value)) return [value];
  return [];
}

function normalizeObjectives(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .filter((objective) => isNonEmptyString(objective.text))
    .map((objective, index) => ({
      id: isNonEmptyString(objective.id) ? objective.id : `objective-${index + 1}`,
      text: objective.text,
    }));
}

function normalizeCalculation(value) {
  if (!isPlainObject(value)) return null;

  const steps = toStringArray(value.steps);
  if (
    !isNonEmptyString(value.formula) ||
    steps.length === 0 ||
    !isNonEmptyString(value.result)
  ) {
    return null;
  }

  return { formula: value.formula, steps, result: value.result };
}

function normalizeExamples(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .filter((example) => isNonEmptyString(example.text))
    .map((example, index) => {
      const calculation = normalizeCalculation(example.calculation);

      return {
        id: isNonEmptyString(example.id) ? example.id : `example-${index + 1}`,
        title: isNonEmptyString(example.title) ? example.title : `Example ${index + 1}`,
        text: example.text,
        sourceIds: toStringArray(example.sourceIds),
        ...(calculation ? { calculation } : {}),
      };
    });
}

function normalizeQuiz(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .map((quiz, index) => {
      const options = Array.isArray(quiz.options) ? quiz.options.filter(isNonEmptyString) : [];
      const usable =
        isNonEmptyString(quiz.question) &&
        options.length === 3 &&
        Number.isInteger(quiz.correctIndex) &&
        quiz.correctIndex >= 0 &&
        quiz.correctIndex < 3;

      if (!usable) return null;

      return {
        id: isNonEmptyString(quiz.id) ? quiz.id : `quiz-${index + 1}`,
        objectiveId: isNonEmptyString(quiz.objectiveId) ? quiz.objectiveId : null,
        question: quiz.question,
        options,
        correctIndex: quiz.correctIndex,
        explanation: isNonEmptyString(quiz.explanation) ? quiz.explanation : '',
      };
    })
    .filter(Boolean);
}

function normalizeSources(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isPlainObject)
    .filter((source) => isNonEmptyString(source.id) && isNonEmptyString(source.url))
    .map((source) => ({
      id: source.id,
      publisher: isNonEmptyString(source.publisher) ? source.publisher : source.id,
      title: isNonEmptyString(source.title) ? source.title : source.id,
      url: source.url,
      accessedAt: isNonEmptyString(source.accessedAt) ? source.accessedAt : '',
      publishedAt: isNonEmptyString(source.publishedAt) ? source.publishedAt : null,
    }));
}

/**
 * @param {unknown} body Parsed JSON body of a curated lesson response.
 * @returns {{ok: true, entry: {lesson: object, sources: object[], review: object|null, contentVersion: string}}
 *   | {ok: false, reason: string}}
 */
export function normalizeCuratedLessonResponse(body) {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      reason:
        'The lesson service did not return JSON. Check that the frontend is proxying /api to the WealthGenie backend.',
    };
  }

  if (body.status !== 'success') {
    return {
      ok: false,
      reason: `The lesson service reported status "${String(body.status)}" instead of success.`,
    };
  }

  const raw = body.lesson;
  if (!isPlainObject(raw)) {
    return { ok: false, reason: 'The lesson response did not include a lesson object.' };
  }

  const explanation = toStringArray(raw.explanation);
  if (explanation.length === 0) {
    return { ok: false, reason: 'The lesson did not include any explanation text.' };
  }

  const quiz = normalizeQuiz(raw.quiz);
  if (quiz.length === 0) {
    return {
      ok: false,
      reason: 'The lesson did not include a usable quiz question with three options.',
    };
  }

  const lesson = {
    ...raw,
    title: isNonEmptyString(raw.title) ? raw.title : '',
    category: isNonEmptyString(raw.category) ? raw.category : '',
    objectives: normalizeObjectives(raw.objectives),
    explanation,
    examples: normalizeExamples(raw.examples),
    keyTakeaways: toStringArray(raw.keyTakeaways),
    quiz,
    disclaimer: isNonEmptyString(raw.disclaimer) ? raw.disclaimer : '',
  };

  const contentVersion = isNonEmptyString(body.contentVersion)
    ? body.contentVersion
    : isNonEmptyString(raw.contentVersion)
      ? raw.contentVersion
      : '';

  return {
    ok: true,
    entry: {
      lesson,
      sources: normalizeSources(body.sources),
      review: isPlainObject(body.review) ? body.review : null,
      contentVersion,
    },
  };
}
