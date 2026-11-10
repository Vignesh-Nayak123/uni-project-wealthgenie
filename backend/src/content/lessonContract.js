/**
 * WealthGenie learning content contract, version 1.
 *
 * The validator is intentionally dependency-free. It enforces both the
 * structural lesson schema and the cross-document rules that JSON Schema
 * cannot express: prerequisite graph integrity, source-registry references,
 * quiz objective coverage, and review metadata.
 */

export const LESSON_SCHEMA_VERSION = 1;

export const LESSON_STATUSES = ['draft', 'source-checked', 'reviewed', 'retired'];

const CONTENT_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const SOURCE_ID_PATTERN = /^[A-Z0-9][A-Z0-9-]*$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
const CONCEPT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PUBLISHED_PATTERN = /^\d{4}-\d{2}(?:-\d{2})?$/;

export class LearningContentValidationError extends Error {
  constructor(result) {
    super(
      `Learning content validation failed with ${result.errors.length} error(s).`
    );
    this.name = 'LearningContentValidationError';
    this.code = 'invalid_learning_content';
    this.result = result;
  }
}

function issue(severity, code, path, message) {
  return { severity, code, path, message };
}

function addError(errors, code, path, message) {
  errors.push(issue('error', code, path, message));
}

function addWarning(warnings, code, path, message) {
  warnings.push(issue('warning', code, path, message));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value, maxLength = Number.POSITIVE_INFINITY) {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function parseDateOnly(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return null;

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

function isValidDateOnly(value) {
  return parseDateOnly(value) !== null;
}

function isFutureDate(value, today) {
  return isValidDateOnly(value) && isValidDateOnly(today) && value > today;
}

function isValidPublishedAt(value) {
  if (typeof value !== 'string' || !PUBLISHED_PATTERN.test(value)) return false;
  if (value.length === 10) return isValidDateOnly(value);

  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
}

function isValidHttpsUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return false;

  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function arraysEqual(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function todayDate() {
  // Content dates are calendar dates, so compare against the local calendar
  // rather than UTC. Using UTC would reject same-day edits for authors whose
  // timezone is ahead of UTC.
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function validateCurriculumGraph(concepts, { branches = null } = {}) {
  const errors = [];

  if (!Array.isArray(concepts) || concepts.length === 0) {
    addError(errors, 'missing_concepts', 'concepts', 'At least one concept is required.');
    return errors;
  }

  const branchIds = new Set();
  if (branches != null) {
    if (!Array.isArray(branches)) {
      addError(errors, 'invalid_branches', 'branches', 'Branches must be an array.');
    } else {
      branches.forEach((branch, index) => {
        if (!isPlainObject(branch) || !isNonEmptyString(branch.id)) {
          addError(
            errors,
            'invalid_branch',
            `branches[${index}].id`,
            'Every branch needs a non-empty ID.'
          );
          return;
        }
        if (branchIds.has(branch.id)) {
          addError(
            errors,
            'duplicate_branch_id',
            `branches[${index}].id`,
            `Duplicate branch ID: ${branch.id}.`
          );
          return;
        }
        branchIds.add(branch.id);
      });
    }
  }

  const conceptIds = new Set();
  const conceptMap = new Map();

  concepts.forEach((concept, index) => {
    const path = `concepts[${index}]`;

    if (!isPlainObject(concept)) {
      addError(errors, 'invalid_concept', path, 'Concept must be an object.');
      return;
    }

    if (!isNonEmptyString(concept.id) || !CONCEPT_ID_PATTERN.test(concept.id)) {
      addError(
        errors,
        'invalid_concept_id',
        `${path}.id`,
        'Concept ID must be a non-empty lowercase slug.'
      );
    } else if (conceptIds.has(concept.id)) {
      addError(
        errors,
        'duplicate_concept_id',
        `${path}.id`,
        `Duplicate concept ID: ${concept.id}.`
      );
    } else {
      conceptIds.add(concept.id);
      conceptMap.set(concept.id, concept);
    }

    if (!isNonEmptyString(concept.title)) {
      addError(errors, 'missing_concept_title', `${path}.title`, 'Concept title is required.');
    }

    if (!isNonEmptyString(concept.category)) {
      addError(
        errors,
        'missing_concept_category',
        `${path}.category`,
        'Concept category is required.'
      );
    }

    if (!isNonEmptyString(concept.branchId)) {
      addError(
        errors,
        'missing_concept_branch',
        `${path}.branchId`,
        'Concept branch ID is required.'
      );
    } else if (branches != null && !branchIds.has(concept.branchId)) {
      addError(
        errors,
        'unknown_branch',
        `${path}.branchId`,
        `Unknown branch: ${concept.branchId}.`
      );
    }

    if (!Array.isArray(concept.prerequisites)) {
      addError(
        errors,
        'invalid_prerequisites',
        `${path}.prerequisites`,
        'Prerequisites must be an array.'
      );
      return;
    }

    const seenPrerequisites = new Set();
    concept.prerequisites.forEach((prerequisiteId, prerequisiteIndex) => {
      const prerequisitePath = `${path}.prerequisites[${prerequisiteIndex}]`;

      if (
        !isNonEmptyString(prerequisiteId) ||
        !CONCEPT_ID_PATTERN.test(prerequisiteId)
      ) {
        addError(
          errors,
          'invalid_prerequisite',
          prerequisitePath,
          'Prerequisite must be a non-empty lowercase slug.'
        );
        return;
      }

      if (prerequisiteId === concept.id) {
        addError(
          errors,
          'self_prerequisite',
          prerequisitePath,
          `${concept.id} cannot require itself.`
        );
      }

      if (seenPrerequisites.has(prerequisiteId)) {
        addError(
          errors,
          'duplicate_prerequisite',
          prerequisitePath,
          `Duplicate prerequisite: ${prerequisiteId}.`
        );
      }
      seenPrerequisites.add(prerequisiteId);
    });
  });

  for (const concept of conceptMap.values()) {
    concept.prerequisites.forEach((prerequisiteId, index) => {
      if (
        isNonEmptyString(prerequisiteId) &&
        CONCEPT_ID_PATTERN.test(prerequisiteId) &&
        !conceptIds.has(prerequisiteId)
      ) {
        addError(
          errors,
          'unknown_prerequisite',
          `concepts[${concept.id}].prerequisites[${index}]`,
          `${concept.id} references missing prerequisite ${prerequisiteId}.`
        );
      }
    });
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];

  function visit(conceptId) {
    if (visiting.has(conceptId)) {
      const cycleStart = stack.indexOf(conceptId);
      const cycle = [...stack.slice(cycleStart), conceptId];
      addError(
        errors,
        'prerequisite_cycle',
        `concepts[${conceptId}].prerequisites`,
        `Prerequisite cycle detected: ${cycle.join(' -> ')}.`
      );
      return;
    }

    if (visited.has(conceptId)) return;

    const concept = conceptMap.get(conceptId);
    if (!concept) return;

    visiting.add(conceptId);
    stack.push(conceptId);

    for (const prerequisiteId of concept.prerequisites) {
      if (conceptIds.has(prerequisiteId)) visit(prerequisiteId);
    }

    stack.pop();
    visiting.delete(conceptId);
    visited.add(conceptId);
  }

  for (const conceptId of conceptIds) visit(conceptId);

  return errors;
}

export function validateSourceRegistry(
  registry,
  { concepts = null, today = todayDate() } = {}
) {
  const errors = [];
  const sourcesById = new Map();

  if (!isPlainObject(registry)) {
    addError(errors, 'invalid_source_registry', 'sources', 'Source registry must be an object.');
    return { errors, sourcesById };
  }

  if (
    !isNonEmptyString(registry.registryVersion) ||
    !CONTENT_VERSION_PATTERN.test(registry.registryVersion)
  ) {
    addError(
      errors,
      'invalid_registry_version',
      'sources.registryVersion',
      'Registry version must use semantic versioning, for example 1.0.0.'
    );
  }

  if (!isValidDateOnly(registry.updatedAt)) {
    addError(
      errors,
      'invalid_registry_date',
      'sources.updatedAt',
      'Registry updatedAt must be a valid YYYY-MM-DD date.'
    );
  } else if (isFutureDate(registry.updatedAt, today)) {
    addError(
      errors,
      'future_registry_date',
      'sources.updatedAt',
      'Registry updatedAt cannot be in the future.'
    );
  }

  if (!Array.isArray(registry.sources) || registry.sources.length === 0) {
    addError(
      errors,
      'missing_sources',
      'sources.sources',
      'Source registry must contain at least one source.'
    );
    return { errors, sourcesById };
  }

  const conceptIds = Array.isArray(concepts)
    ? new Set(concepts.map((concept) => concept?.id).filter(Boolean))
    : null;
  const seenSourceIds = new Set();

  registry.sources.forEach((source, index) => {
    const path = `sources[${index}]`;

    if (!isPlainObject(source)) {
      addError(errors, 'invalid_source', path, 'Source must be an object.');
      return;
    }

    if (!isNonEmptyString(source.id) || !SOURCE_ID_PATTERN.test(source.id)) {
      addError(
        errors,
        'invalid_source_id',
        `${path}.id`,
        'Source ID must be uppercase letters, digits or hyphens.'
      );
    } else if (seenSourceIds.has(source.id)) {
      addError(
        errors,
        'duplicate_source_id',
        `${path}.id`,
        `Duplicate source ID: ${source.id}.`
      );
    } else {
      seenSourceIds.add(source.id);
      sourcesById.set(source.id, source);
    }

    if (!isNonEmptyString(source.publisher)) {
      addError(errors, 'missing_source_publisher', `${path}.publisher`, 'Publisher is required.');
    }

    if (!isNonEmptyString(source.title)) {
      addError(errors, 'missing_source_title', `${path}.title`, 'Source title is required.');
    }

    if (!isValidHttpsUrl(source.url)) {
      addError(
        errors,
        'invalid_source_url',
        `${path}.url`,
        'Source URL must be a valid HTTPS URL.'
      );
    }

    if (!isValidDateOnly(source.accessedAt)) {
      addError(
        errors,
        'invalid_access_date',
        `${path}.accessedAt`,
        'accessedAt must be a valid YYYY-MM-DD date.'
      );
    } else if (isFutureDate(source.accessedAt, today)) {
      addError(
        errors,
        'future_access_date',
        `${path}.accessedAt`,
        'accessedAt cannot be in the future.'
      );
    }

    if (source.publishedAt != null && !isValidPublishedAt(source.publishedAt)) {
      addError(
        errors,
        'invalid_published_date',
        `${path}.publishedAt`,
        'publishedAt must be YYYY-MM or a valid YYYY-MM-DD date.'
      );
    }

    if (source.scope != null) {
      if (!Array.isArray(source.scope)) {
        addError(errors, 'invalid_source_scope', `${path}.scope`, 'scope must be an array.');
      } else {
        source.scope.forEach((conceptId, scopeIndex) => {
          if (!isNonEmptyString(conceptId)) {
            addError(
              errors,
              'invalid_source_scope',
              `${path}.scope[${scopeIndex}]`,
              'Scope entries must be non-empty concept IDs.'
            );
          } else if (conceptIds && !conceptIds.has(conceptId)) {
            addError(
              errors,
              'unknown_source_scope',
              `${path}.scope[${scopeIndex}]`,
              `Unknown concept in source scope: ${conceptId}.`
            );
          }
        });
      }
    }

    if (source.notes != null && typeof source.notes !== 'string') {
      addError(errors, 'invalid_source_notes', `${path}.notes`, 'notes must be a string.');
    }
  });

  return { errors, sourcesById };
}

function validateReview(review, status, today, errors) {
  if (!isPlainObject(review)) {
    addError(
      errors,
      'missing_review',
      'lesson.review',
      'Review metadata is required for every lesson.'
    );
    return;
  }

  if (!isValidDateOnly(review.sourceCheckedAt)) {
    addError(
      errors,
      'invalid_source_checked_date',
      'lesson.review.sourceCheckedAt',
      'sourceCheckedAt must be a valid YYYY-MM-DD date.'
    );
  } else if (isFutureDate(review.sourceCheckedAt, today)) {
    addError(
      errors,
      'future_source_checked_date',
      'lesson.review.sourceCheckedAt',
      'sourceCheckedAt cannot be in the future.'
    );
  }

  if (review.reviewedBy !== null && !isNonEmptyString(review.reviewedBy)) {
    addError(
      errors,
      'invalid_reviewer',
      'lesson.review.reviewedBy',
      'reviewedBy must be a non-empty string or null.'
    );
  }

  if (review.reviewedAt !== null && !isValidDateOnly(review.reviewedAt)) {
    addError(
      errors,
      'invalid_reviewed_date',
      'lesson.review.reviewedAt',
      'reviewedAt must be a valid YYYY-MM-DD date or null.'
    );
  } else if (review.reviewedAt && isFutureDate(review.reviewedAt, today)) {
    addError(
      errors,
      'future_reviewed_date',
      'lesson.review.reviewedAt',
      'reviewedAt cannot be in the future.'
    );
  }

  if (!isValidDateOnly(review.nextReviewAt)) {
    addError(
      errors,
      'invalid_next_review_date',
      'lesson.review.nextReviewAt',
      'nextReviewAt must be a valid YYYY-MM-DD date.'
    );
  } else if (
    isValidDateOnly(review.sourceCheckedAt) &&
    review.nextReviewAt <= review.sourceCheckedAt
  ) {
    addError(
      errors,
      'review_window_invalid',
      'lesson.review.nextReviewAt',
      'nextReviewAt must be after sourceCheckedAt.'
    );
  }

  if (review.notes != null && typeof review.notes !== 'string') {
    addError(errors, 'invalid_review_notes', 'lesson.review.notes', 'notes must be a string.');
  }

  if (status === 'reviewed') {
    if (!isNonEmptyString(review.reviewedBy)) {
      addError(
        errors,
        'reviewed_by_required',
        'lesson.review.reviewedBy',
        'A reviewed lesson must name the reviewer.'
      );
    }
    if (!isValidDateOnly(review.reviewedAt)) {
      addError(
        errors,
        'reviewed_at_required',
        'lesson.review.reviewedAt',
        'A reviewed lesson must have a review date.'
      );
    } else if (
      isValidDateOnly(review.sourceCheckedAt) &&
      review.reviewedAt < review.sourceCheckedAt
    ) {
      addError(
        errors,
        'reviewed_before_source_check',
        'lesson.review.reviewedAt',
        'reviewedAt cannot be before sourceCheckedAt.'
      );
    }
  }
}

export function validateLesson(
  lesson,
  { concepts = [], sourcesById = new Map(), today = todayDate() } = {}
) {
  const errors = [];

  if (!isPlainObject(lesson)) {
    addError(errors, 'invalid_lesson', 'lesson', 'Lesson must be an object.');
    return errors;
  }

  const conceptMap = new Map(
    (Array.isArray(concepts) ? concepts : [])
      .filter((concept) => isPlainObject(concept) && isNonEmptyString(concept.id))
      .map((concept) => [concept.id, concept])
  );

  if (lesson.schemaVersion !== LESSON_SCHEMA_VERSION) {
    addError(
      errors,
      'invalid_schema_version',
      'lesson.schemaVersion',
      `schemaVersion must be ${LESSON_SCHEMA_VERSION}.`
    );
  }

  if (
    !isNonEmptyString(lesson.contentVersion) ||
    !CONTENT_VERSION_PATTERN.test(lesson.contentVersion)
  ) {
    addError(
      errors,
      'invalid_content_version',
      'lesson.contentVersion',
      'contentVersion must use semantic versioning, for example 1.0.0.'
    );
  }

  let concept = null;
  if (!isNonEmptyString(lesson.conceptId) || !CONCEPT_ID_PATTERN.test(lesson.conceptId)) {
    addError(
      errors,
      'invalid_concept_id',
      'lesson.conceptId',
      'conceptId must be a non-empty lowercase slug.'
    );
  } else {
    concept = conceptMap.get(lesson.conceptId) || null;
    if (!concept) {
      addError(
        errors,
        'unknown_concept',
        'lesson.conceptId',
        `Lesson references an unknown concept: ${lesson.conceptId}.`
      );
    }
  }

  if (concept) {
    if (lesson.title !== concept.title) {
      addError(
        errors,
        'concept_title_mismatch',
        'lesson.title',
        `Title must match the curriculum title: ${concept.title}.`
      );
    }
    if (lesson.branchId !== concept.branchId) {
      addError(
        errors,
        'concept_branch_mismatch',
        'lesson.branchId',
        `branchId must match the curriculum branch: ${concept.branchId}.`
      );
    }
    if (lesson.category !== concept.category) {
      addError(
        errors,
        'concept_category_mismatch',
        'lesson.category',
        `category must match the curriculum category: ${concept.category}.`
      );
    }
    if (!arraysEqual(lesson.prerequisites, concept.prerequisites)) {
      addError(
        errors,
        'prerequisite_mismatch',
        'lesson.prerequisites',
        `Prerequisites must match the curriculum exactly: ${JSON.stringify(concept.prerequisites)}.`
      );
    }
  } else if (!Array.isArray(lesson.prerequisites)) {
    addError(
      errors,
      'invalid_prerequisites',
      'lesson.prerequisites',
      'Prerequisites must be an array.'
    );
  }

  if (!LESSON_STATUSES.includes(lesson.status)) {
    addError(
      errors,
      'invalid_status',
      'lesson.status',
      `status must be one of: ${LESSON_STATUSES.join(', ')}.`
    );
  }

  const objectiveIds = new Set();
  if (!Array.isArray(lesson.objectives) || lesson.objectives.length === 0) {
    addError(
      errors,
      'missing_objectives',
      'lesson.objectives',
      'At least one learning objective is required.'
    );
  } else {
    lesson.objectives.forEach((objective, index) => {
      const path = `lesson.objectives[${index}]`;
      if (!isPlainObject(objective)) {
        addError(errors, 'invalid_objective', path, 'Objective must be an object.');
        return;
      }
      if (!isNonEmptyString(objective.id) || !ID_PATTERN.test(objective.id)) {
        addError(
          errors,
          'invalid_objective_id',
          `${path}.id`,
          'Objective ID must be a non-empty identifier.'
        );
      } else if (objectiveIds.has(objective.id)) {
        addError(
          errors,
          'duplicate_objective_id',
          `${path}.id`,
          `Duplicate objective ID: ${objective.id}.`
        );
      } else {
        objectiveIds.add(objective.id);
      }
      if (!isNonEmptyString(objective.text)) {
        addError(errors, 'missing_objective_text', `${path}.text`, 'Objective text is required.');
      }
    });
  }

  if (
    !Number.isInteger(lesson.estimatedMinutes) ||
    lesson.estimatedMinutes < 1 ||
    lesson.estimatedMinutes > 120
  ) {
    addError(
      errors,
      'invalid_estimated_minutes',
      'lesson.estimatedMinutes',
      'estimatedMinutes must be an integer between 1 and 120.'
    );
  }

  if (
    !Array.isArray(lesson.explanation) ||
    lesson.explanation.length === 0 ||
    lesson.explanation.length > 4
  ) {
    addError(
      errors,
      'invalid_explanation',
      'lesson.explanation',
      'explanation must contain between 1 and 4 paragraphs.'
    );
  } else {
    lesson.explanation.forEach((paragraph, index) => {
      if (!isNonEmptyString(paragraph)) {
        addError(
          errors,
          'invalid_explanation_paragraph',
          `lesson.explanation[${index}]`,
          'Explanation paragraphs must be non-empty strings.'
        );
      }
    });
  }

  const lessonSourceIds = new Set();
  if (!Array.isArray(lesson.sourceIds) || lesson.sourceIds.length === 0) {
    addError(
      errors,
      'missing_sources',
      'lesson.sourceIds',
      'Every lesson must declare at least one source ID.'
    );
  } else {
    lesson.sourceIds.forEach((sourceId, index) => {
      const path = `lesson.sourceIds[${index}]`;
      if (!isNonEmptyString(sourceId) || !SOURCE_ID_PATTERN.test(sourceId)) {
        addError(
          errors,
          'invalid_source_id',
          path,
          'Source IDs must use uppercase letters, digits or hyphens.'
        );
        return;
      }
      if (lessonSourceIds.has(sourceId)) {
        addError(
          errors,
          'duplicate_source_id',
          path,
          `Duplicate source ID in lesson: ${sourceId}.`
        );
        return;
      }
      lessonSourceIds.add(sourceId);
      if (!sourcesById.has(sourceId)) {
        addError(
          errors,
          'unknown_source',
          path,
          `Source is not in the canonical registry: ${sourceId}.`
        );
      }
    });
  }

  const exampleIds = new Set();
  if (!Array.isArray(lesson.examples) || lesson.examples.length === 0) {
    addError(
      errors,
      'missing_examples',
      'lesson.examples',
      'At least one worked example is required.'
    );
  } else {
    lesson.examples.forEach((example, index) => {
      const path = `lesson.examples[${index}]`;
      if (!isPlainObject(example)) {
        addError(errors, 'invalid_example', path, 'Example must be an object.');
        return;
      }

      if (!isNonEmptyString(example.id) || !ID_PATTERN.test(example.id)) {
        addError(
          errors,
          'invalid_example_id',
          `${path}.id`,
          'Example ID must be a non-empty identifier.'
        );
      } else if (exampleIds.has(example.id)) {
        addError(
          errors,
          'duplicate_example_id',
          `${path}.id`,
          `Duplicate example ID: ${example.id}.`
        );
      } else {
        exampleIds.add(example.id);
      }

      if (!isNonEmptyString(example.title)) {
        addError(errors, 'missing_example_title', `${path}.title`, 'Example title is required.');
      }
      if (!isNonEmptyString(example.text)) {
        addError(errors, 'missing_example_text', `${path}.text`, 'Example text is required.');
      }

      if (!Array.isArray(example.sourceIds) || example.sourceIds.length === 0) {
        addError(
          errors,
          'missing_example_sources',
          `${path}.sourceIds`,
          'Every example must declare at least one source ID.'
        );
      } else {
        const seenExampleSources = new Set();
        example.sourceIds.forEach((sourceId, sourceIndex) => {
          const sourcePath = `${path}.sourceIds[${sourceIndex}]`;
          if (!isNonEmptyString(sourceId) || !SOURCE_ID_PATTERN.test(sourceId)) {
            addError(
              errors,
              'invalid_source_id',
              sourcePath,
              'Source IDs must use uppercase letters, digits or hyphens.'
            );
            return;
          }
          if (seenExampleSources.has(sourceId)) {
            addError(
              errors,
              'duplicate_source_id',
              sourcePath,
              `Duplicate source ID in example: ${sourceId}.`
            );
            return;
          }
          seenExampleSources.add(sourceId);
          if (!lessonSourceIds.has(sourceId)) {
            addError(
              errors,
              'example_source_not_declared',
              sourcePath,
              `Example source is not declared on the lesson: ${sourceId}.`
            );
          }
        });
      }

      if (example.calculation != null) {
        const calculation = example.calculation;
        if (!isPlainObject(calculation)) {
          addError(
            errors,
            'invalid_calculation',
            `${path}.calculation`,
            'Calculation must be an object.'
          );
        } else {
          if (!isNonEmptyString(calculation.formula)) {
            addError(
              errors,
              'missing_calculation_formula',
              `${path}.calculation.formula`,
              'Calculation formula is required.'
            );
          }
          if (
            !Array.isArray(calculation.steps) ||
            calculation.steps.length === 0 ||
            calculation.steps.some((step) => !isNonEmptyString(step))
          ) {
            addError(
              errors,
              'invalid_calculation_steps',
              `${path}.calculation.steps`,
              'Calculation steps must be a non-empty array of strings.'
            );
          }
          if (!isNonEmptyString(calculation.result)) {
            addError(
              errors,
              'missing_calculation_result',
              `${path}.calculation.result`,
              'Calculation result is required.'
            );
          }
        }
      }
    });
  }

  if (
    !Array.isArray(lesson.keyTakeaways) ||
    lesson.keyTakeaways.length === 0 ||
    lesson.keyTakeaways.length > 6
  ) {
    addError(
      errors,
      'invalid_key_takeaways',
      'lesson.keyTakeaways',
      'keyTakeaways must contain between 1 and 6 items.'
    );
  } else {
    lesson.keyTakeaways.forEach((takeaway, index) => {
      if (!isNonEmptyString(takeaway)) {
        addError(
          errors,
          'invalid_key_takeaway',
          `lesson.keyTakeaways[${index}]`,
          'Key takeaways must be non-empty strings.'
        );
      }
    });
  }

  validateReview(lesson.review, lesson.status, today, errors);

  const quizIds = new Set();
  const coveredObjectiveIds = new Set();
  if (!Array.isArray(lesson.quiz) || lesson.quiz.length === 0) {
    addError(errors, 'missing_quiz', 'lesson.quiz', 'At least one quiz question is required.');
  } else {
    lesson.quiz.forEach((quiz, index) => {
      const path = `lesson.quiz[${index}]`;
      if (!isPlainObject(quiz)) {
        addError(errors, 'invalid_quiz', path, 'Quiz must be an object.');
        return;
      }

      if (!isNonEmptyString(quiz.id) || !ID_PATTERN.test(quiz.id)) {
        addError(
          errors,
          'invalid_quiz_id',
          `${path}.id`,
          'Quiz ID must be a non-empty identifier.'
        );
      } else if (quizIds.has(quiz.id)) {
        addError(
          errors,
          'duplicate_quiz_id',
          `${path}.id`,
          `Duplicate quiz ID: ${quiz.id}.`
        );
      } else {
        quizIds.add(quiz.id);
      }

      if (!isNonEmptyString(quiz.objectiveId) || !objectiveIds.has(quiz.objectiveId)) {
        addError(
          errors,
          'unknown_quiz_objective',
          `${path}.objectiveId`,
          'Every quiz must map to an existing objective.'
        );
      } else {
        coveredObjectiveIds.add(quiz.objectiveId);
      }

      if (!isNonEmptyString(quiz.question)) {
        addError(errors, 'missing_quiz_question', `${path}.question`, 'Quiz question is required.');
      }

      if (!Array.isArray(quiz.options) || quiz.options.length !== 3) {
        addError(
          errors,
          'invalid_quiz_options',
          `${path}.options`,
          'Quiz must contain exactly three options.'
        );
      } else {
        const normalizedOptions = new Set();
        quiz.options.forEach((option, optionIndex) => {
          if (!isNonEmptyString(option)) {
            addError(
              errors,
              'invalid_quiz_option',
              `${path}.options[${optionIndex}]`,
              'Quiz options must be non-empty strings.'
            );
            return;
          }
          const normalized = option.trim().toLowerCase();
          if (normalizedOptions.has(normalized)) {
            addError(
              errors,
              'duplicate_quiz_option',
              `${path}.options[${optionIndex}]`,
              'Quiz options must be unique.'
            );
          }
          normalizedOptions.add(normalized);
        });
      }

      if (
        !Number.isInteger(quiz.correctIndex) ||
        quiz.correctIndex < 0 ||
        quiz.correctIndex > 2
      ) {
        addError(
          errors,
          'invalid_correct_index',
          `${path}.correctIndex`,
          'correctIndex must be 0, 1 or 2.'
        );
      }

      if (!isNonEmptyString(quiz.explanation)) {
        addError(
          errors,
          'missing_quiz_explanation',
          `${path}.explanation`,
          'Quiz explanation is required.'
        );
      }
    });
  }

  for (const objectiveId of objectiveIds) {
    if (!coveredObjectiveIds.has(objectiveId)) {
      addError(
        errors,
        'objective_without_quiz',
        'lesson.quiz',
        `No quiz question covers objective ${objectiveId}.`
      );
    }
  }

  if (!isNonEmptyString(lesson.disclaimer)) {
    addError(errors, 'missing_disclaimer', 'lesson.disclaimer', 'Disclaimer is required.');
  }

  if (lesson.generation != null) {
    const generation = lesson.generation;
    if (!isPlainObject(generation)) {
      addError(
        errors,
        'invalid_generation',
        'lesson.generation',
        'generation must be an object when present.'
      );
    } else {
      if (generation.assistedBy !== 'gemini') {
        addError(
          errors,
          'invalid_generation_provider',
          'lesson.generation.assistedBy',
          'assistedBy must be "gemini" when generation metadata is present.'
        );
      }
      for (const field of ['model', 'promptVersion', 'generatedAt']) {
        if (!isNonEmptyString(generation[field])) {
          addError(
            errors,
            'invalid_generation_metadata',
            `lesson.generation.${field}`,
            `${field} is required when generation metadata is present.`
          );
        }
      }
    }
  }

  return errors;
}

export function validateContentSet({
  branches = null,
  concepts = [],
  registry,
  lessons = [],
  today = todayDate(),
  requireComplete = false,
} = {}) {
  const errors = [];
  const warnings = [];

  const curriculumErrors = validateCurriculumGraph(concepts, { branches });
  errors.push(...curriculumErrors);

  const { errors: registryErrors, sourcesById } = validateSourceRegistry(registry, {
    concepts,
    today,
  });
  errors.push(...registryErrors);

  if (!Array.isArray(lessons)) {
    addError(errors, 'invalid_lessons', 'lessons', 'Lessons must be an array.');
    lessons = [];
  }

  const conceptList = Array.isArray(concepts) ? concepts : [];
  const seenLessonConceptIds = new Set();
  const validatedLessonConceptIds = [];

  lessons.forEach((lesson, index) => {
    if (isPlainObject(lesson) && isNonEmptyString(lesson.conceptId)) {
      if (seenLessonConceptIds.has(lesson.conceptId)) {
        addError(
          errors,
          'duplicate_lesson',
          `lessons[${index}].conceptId`,
          `Duplicate lesson for concept: ${lesson.conceptId}.`
        );
      } else {
        seenLessonConceptIds.add(lesson.conceptId);
        validatedLessonConceptIds.push(lesson.conceptId);
      }
    }

    const lessonErrors = validateLesson(lesson, {
      concepts,
      sourcesById,
      today,
    });

    errors.push(
      ...lessonErrors.map((lessonError) => ({
        ...lessonError,
        path: `lessons[${index}].${lessonError.path}`,
      }))
    );
  });

  const missingConceptIds = conceptList
    .filter((concept) => isPlainObject(concept) && isNonEmptyString(concept.id))
    .filter((concept) => !seenLessonConceptIds.has(concept.id))
    .map((concept) => concept.id);

  if (missingConceptIds.length > 0) {
    const message = `${missingConceptIds.length} concepts have no lesson file: ${missingConceptIds.join(', ')}.`;
    if (requireComplete) {
      addError(errors, 'missing_lesson', 'lessons', message);
    } else {
      addWarning(warnings, 'missing_lesson', 'lessons', message);
    }
  }

  const sourceCount =
    isPlainObject(registry) && Array.isArray(registry.sources)
      ? registry.sources.length
      : 0;

  return {
    ok: errors.length === 0,
    schemaVersion: LESSON_SCHEMA_VERSION,
    counts: {
      branches: Array.isArray(branches) ? branches.length : 0,
      concepts: conceptList.length,
      sources: sourceCount,
      lessons: lessons.length,
    },
    errors,
    warnings,
    missingConceptIds,
    validatedLessonConceptIds,
  };
}

export function assertValidContentSet(input) {
  const result = validateContentSet(input);
  if (!result.ok) throw new LearningContentValidationError(result);
  return result;
}

export function formatValidationReport(result) {
  const lines = [
    'WealthGenie learning content validation',
    `Schema version: ${result.schemaVersion}`,
    `Branches: ${result.counts.branches}`,
    `Concepts: ${result.counts.concepts}`,
    `Sources: ${result.counts.sources}`,
    `Lessons: ${result.counts.lessons}`,
    `Errors: ${result.errors.length}`,
    `Warnings: ${result.warnings.length}`,
  ];

  for (const error of result.errors) {
    lines.push(`ERROR [${error.code}] ${error.path}: ${error.message}`);
  }

  for (const warning of result.warnings) {
    lines.push(`WARN  [${warning.code}] ${warning.path}: ${warning.message}`);
  }

  lines.push(result.ok ? 'RESULT: PASS' : 'RESULT: FAIL');
  return lines.join('\n');
}
