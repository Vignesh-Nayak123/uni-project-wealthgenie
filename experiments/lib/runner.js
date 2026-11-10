/**
 * Phase 4 experiment runner.
 *
 * Runs the deterministic Digital Twin over the seeded synthetic dataset and
 * compares every result against the independent reference implementation in
 * `reference.js`. It also evaluates recommendation triggers, scenario
 * comparisons, goal projections, validation, determinism, explainability
 * coverage, and directional invariants.
 *
 * The runner is pure and deterministic for a fixed config and fixed as-of
 * date. It does not read or write the Global Findex data.
 */

import {
  buildTwinPreview,
  calculateTwin,
} from '../../backend/src/utils/financialTwin.js';
import {
  buildScenarios,
  generateDataset,
  normalizeConfig,
} from './dataset.js';
import {
  evaluateExplainability,
  explainabilityCategory,
} from './explainability.js';
import { evaluateInvariants } from './invariants.js';
import { evaluateValidation } from './validation.js';
import {
  COMPARISON_METRIC_DEFINITIONS,
  CORE_METRIC_KEYS,
  GOAL_FIELD_KEYS,
  RECOMMENDATION_IDS,
  RECOMMENDATION_SEVERITY,
  referenceComparison,
  referenceGoal,
  referenceMetrics,
  referenceRecommendationIds,
} from './reference.js';
import {
  arrayEquals,
  createCounter,
  createErrorAccumulator,
  finalizeCounter,
  finalizeErrorAccumulator,
  recordNumericError,
  recordResult,
  sameValue,
  stableStringify,
} from './metrics.js';

const COMPARISON_VALUE_FIELDS = Object.freeze([
  'baseline',
  'scenario',
  'difference',
  'percentageChange',
  'percentagePointDifference',
]);

const GOAL_COMPARISON_FIELDS = Object.freeze([
  [
    'targetAmount',
    [
      'baseline',
      'scenario',
      'difference',
      'percentageChange',
      'percentagePointDifference',
    ],
  ],
  [
    'currentGoalSavings',
    [
      'baseline',
      'scenario',
      'difference',
      'percentageChange',
      'percentagePointDifference',
    ],
  ],
  [
    'remainingAmount',
    [
      'baseline',
      'scenario',
      'difference',
      'percentageChange',
      'percentagePointDifference',
    ],
  ],
  [
    'assumedMonthlyContribution',
    [
      'baseline',
      'scenario',
      'difference',
      'percentageChange',
      'percentagePointDifference',
    ],
  ],
  [
    'estimatedMonths',
    [
      'baseline',
      'scenario',
      'difference',
      'percentageChange',
      'percentagePointDifference',
    ],
  ],
  ['completionDate', ['baseline', 'scenario', 'differenceMonths', 'direction']],
  ['goalAchieved', ['baseline', 'scenario', 'changed']],
  [
    'onTrackForRequestedTimeline',
    ['baseline', 'scenario', 'changed'],
  ],
]);

function createGroup() {
  return {
    overall: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
    byKey: new Map(),
  };
}

function recordGroup(group, key, scope, pass, expected, actual) {
  recordResult(group.overall, pass);
  recordResult(group[scope], pass);

  let entry = group.byKey.get(key);
  if (!entry) {
    entry = {
      overall: createCounter(),
      baseline: createCounter(),
      scenario: createCounter(),
      errors: createErrorAccumulator(),
    };
    group.byKey.set(key, entry);
  }

  recordResult(entry.overall, pass);
  recordResult(entry[scope], pass);
  recordNumericError(entry.errors, expected, actual);

  return entry;
}

function finalizeGroup(group) {
  const byKey = {};
  for (const [key, entry] of group.byKey.entries()) {
    byKey[key] = {
      overall: finalizeCounter(entry.overall),
      baseline: finalizeCounter(entry.baseline),
      scenario: finalizeCounter(entry.scenario),
      errors: finalizeErrorAccumulator(entry.errors),
    };
  }

  return {
    overall: finalizeCounter(group.overall),
    baseline: finalizeCounter(group.baseline),
    scenario: finalizeCounter(group.scenario),
    byKey,
  };
}

function createRecStats() {
  const byId = new Map();
  for (const id of RECOMMENDATION_IDS) {
    byId.set(id, {
      expected: 0,
      actual: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
      trueNegatives: 0,
    });
  }

  return {
    exact: {
      overall: createCounter(),
      baseline: createCounter(),
      scenario: createCounter(),
    },
    decisions: {
      overall: createCounter(),
      baseline: createCounter(),
      scenario: createCounter(),
    },
    severity: {
      overall: createCounter(),
      baseline: createCounter(),
      scenario: createCounter(),
    },
    unknownIds: {
      overall: createCounter(),
      baseline: createCounter(),
      scenario: createCounter(),
    },
    byId,
  };
}

function recordRecDecision(rec, id, scope, expected, actual) {
  const pass = expected === actual;
  recordResult(rec.decisions.overall, pass);
  recordResult(rec.decisions[scope], pass);

  const stats = rec.byId.get(id);
  if (stats) {
    if (expected) stats.expected += 1;
    if (actual) stats.actual += 1;
    if (expected && actual) stats.truePositives += 1;
    if (!expected && actual) stats.falsePositives += 1;
    if (expected && !actual) stats.falseNegatives += 1;
    if (!expected && !actual) stats.trueNegatives += 1;
  }

  return pass;
}

function finalizeRecStats(rec) {
  const byId = {};
  for (const [id, stats] of rec.byId.entries()) {
    const total = stats.truePositives + stats.falsePositives + stats.falseNegatives + stats.trueNegatives;
    byId[id] = {
      ...stats,
      total,
      agreement: total === 0 ? null : (stats.truePositives + stats.trueNegatives) / total,
      precision:
        stats.truePositives + stats.falsePositives === 0
          ? null
          : stats.truePositives / (stats.truePositives + stats.falsePositives),
      recall:
        stats.truePositives + stats.falseNegatives === 0
          ? null
          : stats.truePositives / (stats.truePositives + stats.falseNegatives),
    };
  }

  return {
    exact: {
      overall: finalizeCounter(rec.exact.overall),
      baseline: finalizeCounter(rec.exact.baseline),
      scenario: finalizeCounter(rec.exact.scenario),
    },
    decisions: {
      overall: finalizeCounter(rec.decisions.overall),
      baseline: finalizeCounter(rec.decisions.baseline),
      scenario: finalizeCounter(rec.decisions.scenario),
    },
    severity: {
      overall: finalizeCounter(rec.severity.overall),
      baseline: finalizeCounter(rec.severity.baseline),
      scenario: finalizeCounter(rec.severity.scenario),
    },
    unknownIds: {
      overall: finalizeCounter(rec.unknownIds.overall),
      baseline: finalizeCounter(rec.unknownIds.baseline),
      scenario: finalizeCounter(rec.unknownIds.scenario),
    },
    byId,
  };
}

function addCounters(target, source) {
  target.total += source.total;
  target.passed += source.passed;
}

function createExplainAccumulator() {
  return {
    overall: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
    byCheck: new Map(),
    byCategory: new Map(),
  };
}

function addExplainCounters(explain, scope, checkId, counters) {
  const category = explainabilityCategory(checkId);

  const checkEntry = explain.byCheck.get(checkId) || {
    total: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
  };
  addCounters(checkEntry.total, counters);
  addCounters(checkEntry[scope], counters);
  explain.byCheck.set(checkId, checkEntry);

  const categoryEntry = explain.byCategory.get(category) || {
    total: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
  };
  addCounters(categoryEntry.total, counters);
  addCounters(categoryEntry[scope], counters);
  explain.byCategory.set(category, categoryEntry);

  addCounters(explain.overall, counters);
  addCounters(explain[scope], counters);
}

function finalizeExplain(explain) {
  const byCheck = {};
  for (const [checkId, entry] of explain.byCheck.entries()) {
    byCheck[checkId] = {
      category: explainabilityCategory(checkId),
      overall: finalizeCounter(entry.total),
      baseline: finalizeCounter(entry.baseline),
      scenario: finalizeCounter(entry.scenario),
    };
  }

  const byCategory = {};
  for (const [category, entry] of explain.byCategory.entries()) {
    byCategory[category] = {
      overall: finalizeCounter(entry.total),
      baseline: finalizeCounter(entry.baseline),
      scenario: finalizeCounter(entry.scenario),
    };
  }

  return {
    overall: finalizeCounter(explain.overall),
    baseline: finalizeCounter(explain.baseline),
    scenario: finalizeCounter(explain.scenario),
    byCheck,
    byCategory,
  };
}

function createComparisonAccumulator() {
  return {
    overall: createCounter(),
    byMetric: new Map(),
    byField: new Map(),
    goal: createCounter(),
    goalByField: new Map(),
    recommendations: createCounter(),
    baselineConsistency: createCounter(),
  };
}

function finalizeComparison(comparison) {
  const byMetric = {};
  for (const [key, counter] of comparison.byMetric.entries()) {
    byMetric[key] = finalizeCounter(counter);
  }

  const byField = {};
  for (const [key, counter] of comparison.byField.entries()) {
    byField[key] = finalizeCounter(counter);
  }

  const goalByField = {};
  for (const [key, counter] of comparison.goalByField.entries()) {
    goalByField[key] = finalizeCounter(counter);
  }

  return {
    overall: finalizeCounter(comparison.overall),
    byMetric,
    byField,
    goal: finalizeCounter(comparison.goal),
    goalByField,
    recommendations: finalizeCounter(comparison.recommendations),
    baselineConsistency: finalizeCounter(comparison.baselineConsistency),
  };
}

function safeAbsError(expected, actual) {
  if (
    typeof expected !== 'number' ||
    typeof actual !== 'number' ||
    !Number.isFinite(expected) ||
    !Number.isFinite(actual)
  ) {
    return null;
  }
  return Math.abs(expected - actual);
}

function isNullish(value) {
  return value === null || value === undefined;
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key];
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function stripRows(summary) {
  const { rows, failures, ...rest } = summary;
  return rest;
}

/**
 * Run the full experiment. Returns plain data only, with no timestamps, so the
 * same config produces an identical object on repeated calls.
 */
export function runExperiment(config = {}) {
  const normalized = normalizeConfig(config);
  const dataset = generateDataset(normalized);
  const thresholds = normalized.thresholds;
  const defaultAsOfDate = normalized.asOfDate;

  const formula = createGroup();
  const alias = createCounter();
  const goal = createGroup();
  const goalContext = {
    overall: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
  };
  const rec = createRecStats();
  const comparison = createComparisonAccumulator();
  const determinism = {
    overall: createCounter(),
    baseline: createCounter(),
    scenario: createCounter(),
  };
  const explain = createExplainAccumulator();

  const metricRows = [];
  const goalRows = [];
  const comparisonRows = [];
  const recommendationRows = [];
  const determinismRows = [];
  const explainabilityFailureRows = [];
  const scenarioCases = [];

  const resultStats = {
    withTarget: 0,
    withoutTarget: 0,
    goalAchieved: 0,
    unreachable: 0,
    monthEndAsOf: 0,
    floatingPoint: 0,
  };

  function recordGoalContext(scope, caseId, profileId, scenarioId, scenarioName, result, asOfDate) {
    const engineMatches =
      result.asOfDate === asOfDate &&
      result.goalProjection?.asOfDate === asOfDate;
    recordResult(goalContext.overall, engineMatches);
    recordResult(goalContext[scope], engineMatches);

    goalRows.push({
      scope,
      caseId,
      profileId,
      scenarioId,
      scenarioName,
      group: 'context',
      field: 'asOfDate',
      expected: asOfDate,
      actual: result.asOfDate,
      pass: engineMatches,
    });
  }

  function evaluateResult(result, meta) {
    const { scope, caseId, profileId, scenarioId, scenarioName, input, asOfDate } = meta;
    const expectedMetrics = referenceMetrics(input);
    const expectedGoal = referenceGoal(input, asOfDate);

    for (const key of CORE_METRIC_KEYS) {
      const expected = expectedMetrics[key];
      const actual = result.metrics?.[key];
      const pass = sameValue(expected, actual);
      recordGroup(formula, key, scope, pass, expected, actual);

      metricRows.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        metric: key,
        expected,
        actual,
        pass,
        absError: safeAbsError(expected, actual),
        nullMismatch: isNullish(expected) !== isNullish(actual),
      });
    }

    {
      const expected = expectedMetrics.expenseCoverageMonths;
      const actual = result.metrics?.expenseCoverageMonths;
      const pass = sameValue(expected, actual);
      recordResult(alias, pass);
      metricRows.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        metric: 'expenseCoverageMonths',
        expected,
        actual,
        pass,
        absError: safeAbsError(expected, actual),
        nullMismatch: isNullish(expected) !== isNullish(actual),
      });
    }

    for (const key of GOAL_FIELD_KEYS) {
      const expected = expectedGoal[key];
      const actual = result.goalProjection?.[key];
      const pass = sameValue(expected, actual);
      recordGroup(goal, key, scope, pass, expected, actual);

      goalRows.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        group: 'goalProjection',
        field: key,
        expected,
        actual,
        pass,
      });
    }

    recordGoalContext(
      scope,
      caseId,
      profileId,
      scenarioId,
      scenarioName,
      result,
      asOfDate
    );

    if (expectedGoal.targetAmount === null) {
      resultStats.withoutTarget += 1;
    } else {
      resultStats.withTarget += 1;
      if (expectedGoal.goalAchieved === true) resultStats.goalAchieved += 1;
      if (expectedGoal.unreachable === true) resultStats.unreachable += 1;
    }

    if (String(asOfDate).endsWith('-31') && expectedGoal.estimatedMonths > 0) {
      resultStats.monthEndAsOf += 1;
    }
    if (String(caseId).includes('float-noise')) {
      resultStats.floatingPoint += 1;
    }

    const expectedIds = referenceRecommendationIds(
      expectedMetrics,
      expectedGoal,
      thresholds
    );
    const actualRecommendations = Array.isArray(result.recommendations)
      ? result.recommendations
      : [];
    const actualIds = actualRecommendations.map((item) => item.id);

    const exactPass = arrayEquals(
      [...expectedIds].sort(),
      [...actualIds].sort()
    );
    recordResult(rec.exact.overall, exactPass);
    recordResult(rec.exact[scope], exactPass);
    recommendationRows.push({
      scope,
      caseId,
      profileId,
      scenarioId,
      scenarioName,
      kind: 'exact_set',
      recommendationId: '',
      expected: expectedIds.join('|'),
      actual: actualIds.join('|'),
      pass: exactPass,
    });

    for (const id of RECOMMENDATION_IDS) {
      const expected = expectedIds.includes(id);
      const actual = actualIds.includes(id);
      const pass = recordRecDecision(rec, id, scope, expected, actual);

      recommendationRows.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        kind: 'decision',
        recommendationId: id,
        expected,
        actual,
        pass,
      });
    }

    const unknownIds = actualIds.filter((id) => !RECOMMENDATION_IDS.includes(id));
    const unknownPass = unknownIds.length === 0;
    recordResult(rec.unknownIds.overall, unknownPass);
    recordResult(rec.unknownIds[scope], unknownPass);
    recommendationRows.push({
      scope,
      caseId,
      profileId,
      scenarioId,
      scenarioName,
      kind: 'unknown_id',
      recommendationId: unknownIds.join('|'),
      expected: 0,
      actual: unknownIds.length,
      pass: unknownPass,
    });

    for (const item of actualRecommendations) {
      const expectedSeverity = RECOMMENDATION_SEVERITY[item.id];
      const pass = expectedSeverity === item.severity;
      recordResult(rec.severity.overall, pass);
      recordResult(rec.severity[scope], pass);

      recommendationRows.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        kind: 'severity',
        recommendationId: item.id ?? '',
        expected: expectedSeverity ?? 'unknown',
        actual: item.severity ?? 'missing',
        pass,
      });
    }

    const { counters, failures } = evaluateExplainability(result, {
      scope,
      caseId,
      profileId,
      scenarioId,
      scenarioName,
    });

    for (const [checkId, counter] of Object.entries(counters)) {
      addExplainCounters(explain, scope, checkId, counter);
    }
    for (const failure of failures) {
      explainabilityFailureRows.push(failure);
    }
  }

  for (const profile of dataset.profiles) {
    const effectiveAsOf = profile.asOfDate ?? defaultAsOfDate;
    const options = { thresholds, asOfDate: effectiveAsOf };
    const profileId = profile.id;

    const baselineResult = calculateTwin(profile, options);
    evaluateResult(baselineResult, {
      scope: 'baseline',
      caseId: profileId,
      profileId,
      scenarioId: '',
      scenarioName: 'baseline',
      input: profile,
      asOfDate: effectiveAsOf,
    });

    const baselineRepeat = calculateTwin(profile, options);
    const baselineDeterministic =
      stableStringify(baselineResult) === stableStringify(baselineRepeat);
    recordResult(determinism.overall, baselineDeterministic);
    recordResult(determinism.baseline, baselineDeterministic);
    determinismRows.push({
      scope: 'baseline',
      caseId: profileId,
      profileId,
      scenarioId: '',
      scenarioName: 'baseline',
      pass: baselineDeterministic,
    });

    const expectedBaselineIds = referenceRecommendationIds(
      referenceMetrics(profile),
      referenceGoal(profile, effectiveAsOf),
      thresholds
    );

    for (const scenario of buildScenarios(profile)) {
      const scenarioId = scenario.id;
      scenarioCases.push({
        id: scenarioId,
        profileId,
        name: scenario.name,
        overrides: scenario.overrides,
      });

      const scenarioInput = { ...profile, ...scenario.overrides };
      const preview = buildTwinPreview({
        baseline: profile,
        scenario: scenario.overrides,
        thresholds,
        asOfDate: effectiveAsOf,
      });
      const previewRepeat = buildTwinPreview({
        baseline: profile,
        scenario: scenario.overrides,
        thresholds,
        asOfDate: effectiveAsOf,
      });

      const scenarioDeterministic =
        stableStringify(preview) === stableStringify(previewRepeat);
      recordResult(determinism.overall, scenarioDeterministic);
      recordResult(determinism.scenario, scenarioDeterministic);
      determinismRows.push({
        scope: 'scenario',
        caseId: scenarioId,
        profileId,
        scenarioId,
        scenarioName: scenario.name,
        pass: scenarioDeterministic,
      });

      const baselineConsistent =
        stableStringify(preview.baseline) === stableStringify(baselineResult) &&
        preview.asOfDate === effectiveAsOf &&
        preview.scenario?.asOfDate === effectiveAsOf;
      recordResult(comparison.overall, baselineConsistent);
      recordResult(comparison.baselineConsistency, baselineConsistent);
      comparisonRows.push({
        scope: 'scenario',
        caseId: scenarioId,
        profileId,
        scenarioId,
        scenarioName: scenario.name,
        group: 'baselineConsistency',
        metric: 'baseline',
        field: 'result',
        expected: 'identical',
        actual: baselineConsistent ? 'identical' : 'different',
        pass: baselineConsistent,
      });

      evaluateResult(preview.scenario, {
        scope: 'scenario',
        caseId: scenarioId,
        profileId,
        scenarioId,
        scenarioName: scenario.name,
        input: scenarioInput,
        asOfDate: effectiveAsOf,
      });

      const reference = referenceComparison(
        profile,
        scenarioInput,
        effectiveAsOf
      );

      const engineMetrics = new Map(
        (preview.comparison?.metrics || []).map((item) => [item.key, item])
      );
      const referenceMetricsByKey = new Map(
        reference.metrics.map((item) => [item.key, item])
      );

      for (const { key } of COMPARISON_METRIC_DEFINITIONS) {
        const engineItem = engineMetrics.get(key);
        const referenceItem = referenceMetricsByKey.get(key);

        for (const field of COMPARISON_VALUE_FIELDS) {
          const expected = referenceItem?.[field];
          const actual = engineItem?.[field];
          const pass = sameValue(expected, actual);

          recordResult(comparison.overall, pass);
          const metricCounter =
            comparison.byMetric.get(key) || createCounter();
          recordResult(metricCounter, pass);
          comparison.byMetric.set(key, metricCounter);

          const fieldCounter =
            comparison.byField.get(field) || createCounter();
          recordResult(fieldCounter, pass);
          comparison.byField.set(field, fieldCounter);

          comparisonRows.push({
            scope: 'scenario',
            caseId: scenarioId,
            profileId,
            scenarioId,
            scenarioName: scenario.name,
            group: 'metric',
            metric: key,
            field,
            expected,
            actual,
            pass,
          });
        }
      }

      for (const [fieldName, fields] of GOAL_COMPARISON_FIELDS) {
        const engineItem = preview.comparison?.goalProjection?.[fieldName];
        const referenceItem = reference.goalProjection[fieldName];

        for (const field of fields) {
          const expected = referenceItem?.[field];
          const actual = engineItem?.[field];
          const pass = sameValue(expected, actual);

          recordResult(comparison.overall, pass);
          recordResult(comparison.goal, pass);
          const fieldCounter =
            comparison.goalByField.get(fieldName) || createCounter();
          recordResult(fieldCounter, pass);
          comparison.goalByField.set(fieldName, fieldCounter);

          comparisonRows.push({
            scope: 'scenario',
            caseId: scenarioId,
            profileId,
            scenarioId,
            scenarioName: scenario.name,
            group: 'goalProjection',
            metric: fieldName,
            field,
            expected,
            actual,
            pass,
          });
        }
      }

      const expectedScenarioIds = referenceRecommendationIds(
        referenceMetrics(scenarioInput),
        referenceGoal(scenarioInput, effectiveAsOf),
        thresholds
      );
      const baselineSet = new Set(expectedBaselineIds);
      const scenarioSet = new Set(expectedScenarioIds);

      const expectedAdded = [...scenarioSet]
        .filter((id) => !baselineSet.has(id))
        .sort();
      const expectedResolved = [...baselineSet]
        .filter((id) => !scenarioSet.has(id))
        .sort();
      const expectedUnchanged = [...scenarioSet]
        .filter((id) => baselineSet.has(id))
        .sort();

      const engineRecommendationDiff = preview.comparison?.recommendations || {};
      const actualAdded = (engineRecommendationDiff.added || [])
        .map((item) => item.id)
        .sort();
      const actualResolved = (engineRecommendationDiff.resolved || [])
        .map((item) => item.id)
        .sort();
      const actualUnchanged = (engineRecommendationDiff.unchanged || [])
        .map((item) => item.id)
        .sort();
      const actualSeverityChanged = (engineRecommendationDiff.severityChanged || [])
        .map((item) => item.id)
        .sort();

      const recommendationDiffChecks = [
        ['added', expectedAdded, actualAdded],
        ['resolved', expectedResolved, actualResolved],
        ['unchanged', expectedUnchanged, actualUnchanged],
        ['severityChanged', [], actualSeverityChanged],
      ];

      for (const [name, expected, actual] of recommendationDiffChecks) {
        const pass = arrayEquals(expected, actual);
        recordResult(comparison.overall, pass);
        recordResult(comparison.recommendations, pass);
        comparisonRows.push({
          scope: 'scenario',
          caseId: scenarioId,
          profileId,
          scenarioId,
          scenarioName: scenario.name,
          group: 'recommendations',
          metric: name,
          field: 'ids',
          expected: expected.join('|'),
          actual: actual.join('|'),
          pass,
        });
      }
    }
  }

  const formulaSummary = finalizeGroup(formula);
  const goalSummary = finalizeGroup(goal);
  const recSummary = finalizeRecStats(rec);
  const comparisonSummary = finalizeComparison(comparison);
  const explainSummary = finalizeExplain(explain);

  const determinismSummary = {
    overall: finalizeCounter(determinism.overall),
    baseline: finalizeCounter(determinism.baseline),
    scenario: finalizeCounter(determinism.scenario),
  };

  const validation = evaluateValidation();
  const validationRows = [
    ...validation.invalid.rows.map((row) => ({
      ...row,
      category: 'invalid_input',
    })),
    ...validation.valid.rows.map((row) => ({
      ...row,
      category: 'valid_input',
    })),
  ];

  const invariants = evaluateInvariants(dataset.profiles, {
    thresholds,
    asOfDate: defaultAsOfDate,
  });

  const failureCounts = {
    formula: formulaSummary.overall.failed,
    formulaAlias: finalizeCounter(alias).failed,
    goal: goalSummary.overall.failed,
    goalContext: finalizeCounter(goalContext.overall).failed,
    recommendation:
      recSummary.exact.overall.failed +
      recSummary.decisions.overall.failed +
      recSummary.severity.overall.failed +
      recSummary.unknownIds.overall.failed,
    comparison: comparisonSummary.overall.failed,
    determinism: determinismSummary.overall.failed,
    validation: validation.invalid.failed + validation.valid.failed,
    invariants: invariants.overall.failed,
    explainability: explainSummary.overall.failed,
  };
  const totalFailureCount = Object.values(failureCounts).reduce(
    (sum, count) => sum + count,
    0
  );

  const failures = [];

  for (const row of metricRows) {
    if (!row.pass) {
      failures.push({
        category: 'formula',
        ...row,
      });
    }
  }
  for (const row of goalRows) {
    if (!row.pass) {
      failures.push({
        category: row.group === 'context' ? 'goal_context' : 'goal',
        ...row,
      });
    }
  }
  for (const row of recommendationRows) {
    if (!row.pass) {
      failures.push({
        category: 'recommendation',
        ...row,
      });
    }
  }
  for (const row of comparisonRows) {
    if (!row.pass) {
      failures.push({
        category: 'comparison',
        ...row,
      });
    }
  }
  for (const row of determinismRows) {
    if (!row.pass) {
      failures.push({
        category: 'determinism',
        ...row,
      });
    }
  }
  for (const row of validationRows) {
    if (!row.pass) {
      failures.push({
        category:
          row.category === 'valid_input'
            ? 'validation_valid'
            : 'validation_invalid',
        ...row,
      });
    }
  }
  for (const row of invariants.rows) {
    if (row.applicable && row.pass === false) {
      failures.push({
        category: 'invariant',
        ...row,
      });
    }
  }
  for (const row of explainabilityFailureRows) {
    failures.push({
      category: 'explainability',
      ...row,
    });
  }

  const scenarioCounts = countBy(scenarioCases, 'name');

  return {
    meta: {
      phase: 'Phase 4',
      experimentVersion: normalized.experimentVersion,
      schemaVersion: dataset.schemaVersion,
      seed: normalized.seed,
      asOfDate: defaultAsOfDate,
      thresholds,
      syntheticOnly: true,
      realData: false,
    },
    config: normalized,
    dataset: {
      schemaVersion: dataset.schemaVersion,
      seed: dataset.seed,
      asOfDate: dataset.asOfDate,
      thresholds: dataset.thresholds,
      meta: dataset.meta,
      profiles: dataset.profiles,
    },
    results: {
      formula: formulaSummary,
      formulaAlias: finalizeCounter(alias),
      goal: goalSummary,
      goalContext: {
        overall: finalizeCounter(goalContext.overall),
        baseline: finalizeCounter(goalContext.baseline),
        scenario: finalizeCounter(goalContext.scenario),
      },
      recommendation: recSummary,
      comparison: comparisonSummary,
      determinism: determinismSummary,
      validation: {
        invalid: stripRows(validation.invalid),
        valid: stripRows(validation.valid),
      },
      invariants: {
        overall: invariants.overall,
        byInvariant: invariants.byInvariant,
      },
      explainability: explainSummary,
    },
    rows: {
      metricResults: metricRows,
      goalResults: goalRows,
      comparisonResults: comparisonRows,
      recommendationResults: recommendationRows,
      determinismResults: determinismRows,
      validationResults: validationRows,
      invariantResults: invariants.rows,
      explainabilityFailures: explainabilityFailureRows,
      scenarioCases,
    },
    summary: {
      profiles: dataset.meta,
      scenarios: {
        totalCases: scenarioCases.length,
        byName: scenarioCounts,
      },
      results: {
        baselineResults: dataset.profiles.length,
        scenarioResults: scenarioCases.length,
        totalResults: dataset.profiles.length + scenarioCases.length,
        ...resultStats,
      },
      assertions: {
        formula: formulaSummary.overall,
        formulaAlias: finalizeCounter(alias),
        goal: goalSummary.overall,
        goalContext: finalizeCounter(goalContext.overall),
        recommendationExact: recSummary.exact.overall,
        recommendationDecisions: recSummary.decisions.overall,
        recommendationSeverity: recSummary.severity.overall,
        recommendationUnknownIds: recSummary.unknownIds.overall,
        comparison: comparisonSummary.overall,
        comparisonGoal: comparisonSummary.goal,
        comparisonRecommendations: comparisonSummary.recommendations,
        comparisonBaselineConsistency: comparisonSummary.baselineConsistency,
        determinism: determinismSummary.overall,
        validationInvalid: {
          total: validation.invalid.total,
          rejected: validation.invalid.rejected,
          correctMessage: validation.invalid.correctMessage,
          passed: validation.invalid.passed,
          failed: validation.invalid.failed,
          rejectionRate: validation.invalid.rejectionRate,
          correctMessageRate: validation.invalid.correctMessageRate,
          passRate: validation.invalid.passRate,
        },
        validationValid: {
          total: validation.valid.total,
          accepted: validation.valid.accepted,
          failed: validation.valid.failed,
          acceptanceRate: validation.valid.acceptanceRate,
        },
        invariants: invariants.overall,
        explainability: explainSummary.overall,
      },
      failureCounts,
      totalFailureCount,
      storedFailureCount: failures.length,
    },
    failures,
  };
}
