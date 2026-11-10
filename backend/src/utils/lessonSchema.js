export class LessonValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'LessonValidationError';
    this.code = 'invalid_lesson_payload';
    this.details = details;
  }
}

function isNonEmptyString(value, maxLength) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

export function parseLessonJson(rawText) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    throw new LessonValidationError('AI provider returned an empty lesson response.');
  }

  let cleaned = rawText.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new LessonValidationError('AI provider did not return a JSON object.');
  }

  try {
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
  } catch (error) {
    throw new LessonValidationError('AI provider returned malformed JSON.', {
      parseError: error.message,
    });
  }
}

export function validateLessonPayload(payload, concept) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new LessonValidationError('Lesson payload must be a JSON object.');
  }

  if (!concept || typeof concept.id !== 'string') {
    throw new LessonValidationError('A valid curriculum concept is required.');
  }

  if (!isNonEmptyString(payload.explanation, 1400)) {
    throw new LessonValidationError('Lesson explanation is missing or too long.');
  }

  if (!isNonEmptyString(payload.example, 900)) {
    throw new LessonValidationError('Lesson example is missing or too long.');
  }

  if (!/(₹|INR|Rs\.?|rupee)/i.test(payload.example)) {
    throw new LessonValidationError('Lesson example must use INR.');
  }

  if (!isNonEmptyString(payload.whyItMatters, 900)) {
    throw new LessonValidationError('Lesson "whyItMatters" is missing or too long.');
  }

  const quiz = payload.quiz;
  if (!quiz || typeof quiz !== 'object' || Array.isArray(quiz)) {
    throw new LessonValidationError('Lesson quiz is missing.');
  }

  if (!isNonEmptyString(quiz.question, 500)) {
    throw new LessonValidationError('Quiz question is missing or too long.');
  }

  if (!Array.isArray(quiz.options) || quiz.options.length !== 3) {
    throw new LessonValidationError('Quiz must contain exactly three options.');
  }

  const options = quiz.options.map((option) => {
    if (!isNonEmptyString(option, 300)) {
      throw new LessonValidationError('Every quiz option must be a non-empty string.');
    }
    return option.trim();
  });

  const normalizedOptions = options.map((option) => option.toLowerCase());
  if (new Set(normalizedOptions).size !== options.length) {
    throw new LessonValidationError('Quiz options must be unique.');
  }

  if (
    !Number.isInteger(quiz.correctIndex) ||
    quiz.correctIndex < 0 ||
    quiz.correctIndex >= options.length
  ) {
    throw new LessonValidationError('Quiz correctIndex must be 0, 1 or 2.');
  }

  if (!isNonEmptyString(quiz.explanation, 1000)) {
    throw new LessonValidationError('Quiz feedback explanation is missing or too long.');
  }

  return {
    conceptId: concept.id,
    title: concept.title,
    category: concept.category,
    explanation: payload.explanation.trim(),
    example: payload.example.trim(),
    whyItMatters: payload.whyItMatters.trim(),
    quiz: {
      question: quiz.question.trim(),
      options,
      correctIndex: quiz.correctIndex,
      explanation: quiz.explanation.trim(),
    },
  };
}
