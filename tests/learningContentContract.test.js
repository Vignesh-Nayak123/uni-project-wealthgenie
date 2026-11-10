import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_BRANCHES,
  LEARNING_CONCEPTS,
} from '../backend/src/data/learningRoadmap.js';
import {
  LESSON_SCHEMA_VERSION,
  LearningContentValidationError,
  assertValidContentSet,
  formatValidationReport,
  validateContentSet,
  validateCurriculumGraph,
  validateLesson,
  validateSourceRegistry,
} from '../backend/src/content/lessonContract.js';

const TODAY = '2026-10-28';

function createRegistry(overrides = {}) {
  return {
    registryVersion: '1.0.0',
    updatedAt: '2026-10-01',
    sources: [
      {
        id: 'TEST-SOURCE',
        publisher: 'Test Publisher',
        title: 'Test Reference',
        url: 'https://example.com/reference',
        accessedAt: '2026-10-01',
        scope: ['income'],
      },
    ],
    ...overrides,
  };
}

function createLesson(overrides = {}) {
  const lesson = {
    schemaVersion: LESSON_SCHEMA_VERSION,
    contentVersion: '1.0.0',
    conceptId: 'income',
    title: 'Income',
    branchId: 'money-basics',
    category: 'Money Basics',
    status: 'reviewed',
    objectives: [{ id: 'OBJ-1', text: 'Explain what income means.' }],
    prerequisites: [],
    estimatedMinutes: 6,
    explanation: ['Income is money received from work or another source.'],
    examples: [
      {
        id: 'EX-1',
        title: 'Monthly salary',
        text: 'Aarav earns a salary from his job each month.',
        sourceIds: ['TEST-SOURCE'],
      },
    ],
    keyTakeaways: ['Income is money coming in.'],
    sourceIds: ['TEST-SOURCE'],
    review: {
      sourceCheckedAt: '2026-10-01',
      reviewedBy: 'Content reviewer',
      reviewedAt: '2026-10-02',
      nextReviewAt: '2027-04-01',
    },
    quiz: [
      {
        id: 'Q-1',
        objectiveId: 'OBJ-1',
        question: 'What is income?',
        options: ['Money received', 'Money spent', 'Money borrowed'],
        correctIndex: 0,
        explanation: 'Income is money received, not spent or borrowed.',
      },
    ],
    disclaimer: 'Educational content only, not financial advice.',
  };
  return { ...lesson, ...overrides };
}

function validate({ lessons = [createLesson()], registry = createRegistry(), concepts = LEARNING_CONCEPTS, branches = LEARNING_BRANCHES, requireComplete = false } = {}) {
  return validateContentSet({
    branches,
    concepts,
    registry,
    lessons,
    today: TODAY,
    requireComplete,
  });
}

function codes(result) {
  return result.errors.map((error) => error.code);
}

describe('learning content contract: valid content', () => {
  it('accepts a well-formed content set', () => {
    const result = validate();
    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
    assert.deepEqual(result.errors, []);
    assert.equal(result.schemaVersion, LESSON_SCHEMA_VERSION);
    assert.equal(result.counts.concepts, 23);
    assert.equal(result.counts.sources, 1);
    assert.equal(result.counts.lessons, 1);
    assert.deepEqual(result.missingConceptIds.length, 22);
  });

  it('accepts a draft lesson without reviewer metadata', () => {
    const lesson = createLesson({
      status: 'draft',
      review: {
        sourceCheckedAt: '2026-10-01',
        reviewedBy: null,
        reviewedAt: null,
        nextReviewAt: '2027-04-01',
      },
    });
    const result = validate({ lessons: [lesson] });
    assert.equal(result.ok, true, JSON.stringify(result.errors, null, 2));
  });

  it('assertValidContentSet returns the result and throws on failure', () => {
    const result = assertValidContentSet({
      branches: LEARNING_BRANCHES,
      concepts: LEARNING_CONCEPTS,
      registry: createRegistry(),
      lessons: [createLesson()],
      today: TODAY,
    });
    assert.equal(result.ok, true);

    assert.throws(
      () =>
        assertValidContentSet({
          branches: LEARNING_BRANCHES,
          concepts: LEARNING_CONCEPTS,
          registry: createRegistry(),
          lessons: [createLesson({ sourceIds: [] })],
          today: TODAY,
        }),
      (error) => {
        assert.ok(error instanceof LearningContentValidationError);
        assert.equal(error.code, 'invalid_learning_content');
        assert.ok(error.result.errors.length > 0);
        return true;
      }
    );
  });

  it('formats a readable report', () => {
    const report = formatValidationReport(validate());
    assert.match(report, /Concepts: 23/);
    assert.match(report, /RESULT: PASS/);
  });
});

describe('learning content contract: malformed content', () => {
  it('rejects an invalid schema version and content version', () => {
    const result = validate({
      lessons: [createLesson({ schemaVersion: 2, contentVersion: 'v1' })],
    });
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes('invalid_schema_version'));
    assert.ok(codes(result).includes('invalid_content_version'));
  });

  it('rejects missing explanation, examples and takeaways', () => {
    const result = validate({
      lessons: [
        createLesson({
          explanation: [],
          examples: [],
          keyTakeaways: [],
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('invalid_explanation'));
    assert.ok(found.includes('missing_examples'));
    assert.ok(found.includes('invalid_key_takeaways'));
  });

  it('rejects malformed quiz structure', () => {
    const result = validate({
      lessons: [
        createLesson({
          quiz: [
            {
              id: 'Q-1',
              objectiveId: 'OBJ-1',
              question: '',
              options: ['Only one'],
              correctIndex: 5,
              explanation: '',
            },
          ],
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('invalid_quiz_options'));
    assert.ok(found.includes('invalid_correct_index'));
    assert.ok(found.includes('missing_quiz_question'));
    assert.ok(found.includes('missing_quiz_explanation'));
  });

  it('rejects duplicate quiz options that differ only by case or spacing', () => {
    const result = validate({
      lessons: [
        createLesson({
          quiz: [
            {
              id: 'Q-1',
              objectiveId: 'OBJ-1',
              question: 'What is income?',
              options: ['Money received', ' money received ', 'Money borrowed'],
              correctIndex: 0,
              explanation: 'Income is money received.',
            },
          ],
        }),
      ],
    });
    assert.ok(codes(result).includes('duplicate_quiz_option'));
  });

  it('rejects a lesson whose quiz leaves an objective uncovered', () => {
    const result = validate({
      lessons: [
        createLesson({
          objectives: [
            { id: 'OBJ-1', text: 'Explain income.' },
            { id: 'OBJ-2', text: 'Identify income sources.' },
          ],
        }),
      ],
    });
    assert.ok(codes(result).includes('objective_without_quiz'));
  });

  it('rejects a quiz that maps to an unknown objective', () => {
    const result = validate({
      lessons: [
        createLesson({
          quiz: [
            {
              id: 'Q-1',
              objectiveId: 'OBJ-MISSING',
              question: 'What is income?',
              options: ['Money received', 'Money spent', 'Money borrowed'],
              correctIndex: 0,
              explanation: 'Income is money received.',
            },
          ],
        }),
      ],
    });
    assert.ok(codes(result).includes('unknown_quiz_objective'));
  });

  it('rejects curriculum metadata that disagrees with the lesson', () => {
    const result = validate({
      lessons: [
        createLesson({
          title: 'Something else',
          branchId: 'saving',
          category: 'Saving',
          prerequisites: ['expenses'],
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('concept_title_mismatch'));
    assert.ok(found.includes('concept_branch_mismatch'));
    assert.ok(found.includes('concept_category_mismatch'));
    assert.ok(found.includes('prerequisite_mismatch'));
  });

  it('rejects a lesson for an unknown concept', () => {
    const result = validate({
      lessons: [createLesson({ conceptId: 'not-a-concept' })],
    });
    assert.ok(codes(result).includes('unknown_concept'));
  });
});

describe('learning content contract: missing sources and review metadata', () => {
  it('rejects a lesson without source IDs', () => {
    const result = validate({
      lessons: [createLesson({ sourceIds: [], examples: [] })],
    });
    const found = codes(result);
    assert.ok(found.includes('missing_sources'));
    assert.ok(found.includes('missing_examples'));
  });

  it('rejects a lesson citing a source outside the registry', () => {
    const result = validate({
      lessons: [
        createLesson({
          sourceIds: ['TEST-SOURCE', 'UNREGISTERED'],
          examples: [
            {
              id: 'EX-1',
              title: 'Example',
              text: 'Example text.',
              sourceIds: ['TEST-SOURCE'],
            },
          ],
        }),
      ],
    });
    assert.ok(codes(result).includes('unknown_source'));
  });

  it('rejects an example citing a source not declared on the lesson', () => {
    const result = validate({
      lessons: [
        createLesson({
          examples: [
            {
              id: 'EX-1',
              title: 'Example',
              text: 'Example text.',
              sourceIds: ['TEST-SOURCE', 'OTHER'],
            },
          ],
        }),
      ],
    });
    assert.ok(codes(result).includes('example_source_not_declared'));
  });

  it('rejects a lesson with no review metadata at all', () => {
    const lesson = createLesson();
    delete lesson.review;
    const result = validate({ lessons: [lesson] });
    assert.ok(codes(result).includes('missing_review'));
  });

  it('rejects a reviewed lesson without a reviewer or review date', () => {
    const result = validate({
      lessons: [
        createLesson({
          review: {
            sourceCheckedAt: '2026-10-01',
            reviewedBy: null,
            reviewedAt: null,
            nextReviewAt: '2027-04-01',
          },
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('reviewed_by_required'));
    assert.ok(found.includes('reviewed_at_required'));
  });

  it('rejects review dates that are in the future or out of order', () => {
    const result = validate({
      lessons: [
        createLesson({
          review: {
            sourceCheckedAt: '2026-10-20',
            reviewedBy: 'Reviewer',
            reviewedAt: '2026-10-10',
            nextReviewAt: '2026-10-15',
          },
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('reviewed_before_source_check'));
    assert.ok(found.includes('review_window_invalid'));
  });

  it('rejects future review dates', () => {
    const result = validate({
      lessons: [
        createLesson({
          review: {
            sourceCheckedAt: '2027-01-01',
            reviewedBy: 'Reviewer',
            reviewedAt: '2027-01-02',
            nextReviewAt: '2027-06-01',
          },
        }),
      ],
    });
    const found = codes(result);
    assert.ok(found.includes('future_source_checked_date'));
    assert.ok(found.includes('future_reviewed_date'));
  });
});

describe('learning content contract: source registry', () => {
  it('rejects non-HTTPS URLs and invalid access dates', () => {
    const registry = createRegistry({
      sources: [
        {
          id: 'TEST-SOURCE',
          publisher: 'Test Publisher',
          title: 'Test Reference',
          url: 'http://example.com/reference',
          accessedAt: '2026-13-45',
        },
      ],
    });
    const result = validate({ registry });
    const found = codes(result);
    assert.ok(found.includes('invalid_source_url'));
    assert.ok(found.includes('invalid_access_date'));
  });

  it('rejects future access dates and future registry updates', () => {
    const registry = createRegistry({
      updatedAt: '2027-01-01',
      sources: [
        {
          id: 'TEST-SOURCE',
          publisher: 'Test Publisher',
          title: 'Test Reference',
          url: 'https://example.com/reference',
          accessedAt: '2027-01-01',
        },
      ],
    });
    const result = validate({ registry });
    const found = codes(result);
    assert.ok(found.includes('future_registry_date'));
    assert.ok(found.includes('future_access_date'));
  });

  it('rejects duplicate source IDs and unknown scope concepts', () => {
    const registry = createRegistry({
      sources: [
        {
          id: 'TEST-SOURCE',
          publisher: 'Test Publisher',
          title: 'Test Reference',
          url: 'https://example.com/a',
          accessedAt: '2026-10-01',
          scope: ['income', 'ghost-concept'],
        },
        {
          id: 'TEST-SOURCE',
          publisher: 'Test Publisher',
          title: 'Duplicate',
          url: 'https://example.com/b',
          accessedAt: '2026-10-01',
        },
      ],
    });
    const result = validate({ registry });
    const found = codes(result);
    assert.ok(found.includes('duplicate_source_id'));
    assert.ok(found.includes('unknown_source_scope'));
  });

  it('rejects an empty registry', () => {
    const result = validate({ registry: createRegistry({ sources: [] }) });
    assert.ok(codes(result).includes('missing_sources'));
  });

  it('validateSourceRegistry exposes the sources map', () => {
    const { errors, sourcesById } = validateSourceRegistry(createRegistry(), {
      concepts: LEARNING_CONCEPTS,
      today: TODAY,
    });
    assert.deepEqual(errors, []);
    assert.ok(sourcesById.has('TEST-SOURCE'));
  });
});

describe('learning content contract: curriculum graph', () => {
  it('accepts the real 23-concept roadmap', () => {
    const errors = validateCurriculumGraph(LEARNING_CONCEPTS, {
      branches: LEARNING_BRANCHES,
    });
    assert.deepEqual(errors, []);
    assert.equal(LEARNING_CONCEPTS.length, 23);
  });

  it('rejects duplicate concept IDs', () => {
    const concepts = [...LEARNING_CONCEPTS, { ...LEARNING_CONCEPTS[0] }];
    const errors = validateCurriculumGraph(concepts, {
      branches: LEARNING_BRANCHES,
    });
    assert.ok(errors.some((error) => error.code === 'duplicate_concept_id'));
  });

  it('rejects duplicate lesson files for the same concept', () => {
    const result = validate({
      lessons: [createLesson(), createLesson({ contentVersion: '1.0.1' })],
    });
    assert.ok(codes(result).includes('duplicate_lesson'));
  });

  it('rejects unknown and self prerequisites', () => {
    const concepts = LEARNING_CONCEPTS.map((concept) =>
      concept.id === 'income'
        ? { ...concept, prerequisites: ['income', 'ghost-concept'] }
        : concept
    );
    const errors = validateCurriculumGraph(concepts, {
      branches: LEARNING_BRANCHES,
    });
    const found = errors.map((error) => error.code);
    assert.ok(found.includes('self_prerequisite'));
    assert.ok(found.includes('unknown_prerequisite'));
  });

  it('rejects duplicate prerequisites', () => {
    const concepts = LEARNING_CONCEPTS.map((concept) =>
      concept.id === 'budgeting'
        ? { ...concept, prerequisites: ['income', 'income'] }
        : concept
    );
    const errors = validateCurriculumGraph(concepts, {
      branches: LEARNING_BRANCHES,
    });
    assert.ok(errors.some((error) => error.code === 'duplicate_prerequisite'));
  });

  it('detects a prerequisite cycle', () => {
    const concepts = [
      { id: 'alpha', title: 'Alpha', category: 'Test', branchId: 'test', prerequisites: ['beta'] },
      { id: 'beta', title: 'Beta', category: 'Test', branchId: 'test', prerequisites: ['alpha'] },
    ];
    const errors = validateCurriculumGraph(concepts);
    const cycle = errors.find((error) => error.code === 'prerequisite_cycle');
    assert.ok(cycle);
    assert.match(cycle.message, /alpha -> beta -> alpha|beta -> alpha -> beta/);
  });

  it('detects a longer prerequisite cycle', () => {
    const concepts = [
      { id: 'a', title: 'A', category: 'Test', branchId: 'test', prerequisites: ['c'] },
      { id: 'b', title: 'B', category: 'Test', branchId: 'test', prerequisites: ['a'] },
      { id: 'c', title: 'C', category: 'Test', branchId: 'test', prerequisites: ['b'] },
    ];
    const errors = validateCurriculumGraph(concepts);
    assert.ok(errors.some((error) => error.code === 'prerequisite_cycle'));
  });

  it('rejects unknown branches', () => {
    const errors = validateCurriculumGraph(LEARNING_CONCEPTS, {
      branches: [{ id: 'money-basics', title: 'Money Basics' }],
    });
    assert.ok(errors.some((error) => error.code === 'unknown_branch'));
  });
});

describe('learning content contract: completeness', () => {
  it('warns about missing lessons by default', () => {
    const result = validate({ lessons: [] });
    assert.equal(result.ok, true);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].code, 'missing_lesson');
    assert.equal(result.missingConceptIds.length, 23);
  });

  it('treats missing lessons as errors with requireComplete', () => {
    const result = validate({ lessons: [], requireComplete: true });
    assert.equal(result.ok, false);
    assert.ok(codes(result).includes('missing_lesson'));
  });
});

describe('learning content contract: real registry', () => {
  it('validates the shipped sources registry against all 23 concepts', async () => {
    const { loadSourceRegistry } = await import(
      '../backend/src/content/loadContent.js'
    );
    const registry = await loadSourceRegistry();
    const { errors } = validateSourceRegistry(registry, {
      concepts: LEARNING_CONCEPTS,
      today: TODAY,
    });
    assert.deepEqual(errors, []);
    assert.equal(registry.sources.length, 16);
  });

  it('every concept is covered by at least one registered source', async () => {
    const { loadSourceRegistry } = await import(
      '../backend/src/content/loadContent.js'
    );
    const registry = await loadSourceRegistry();
    const covered = new Set(
      registry.sources.flatMap((source) => source.scope || [])
    );
    const uncovered = LEARNING_CONCEPTS.map((concept) => concept.id).filter(
      (conceptId) => !covered.has(conceptId)
    );
    assert.deepEqual(uncovered, []);
  });
});
