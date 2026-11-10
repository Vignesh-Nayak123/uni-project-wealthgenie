/**
 * Explainability checklist for Digital Twin results.
 *
 * Each check is applicable to a displayed metric, goal field, or
 * recommendation. Coverage is reported as passed checks / applicable checks.
 * This measures whether the required explanatory fields are present and
 * internally consistent. It does NOT measure whether explanations improve user
 * trust, comprehension, or financial literacy; that would require a separate
 * user study.
 */

import {
  EXPLANATION_METRIC_KEYS,
  GOAL_FIELD_KEYS,
} from './reference.js';

export const FORMULA_CHECKS = Object.freeze([
  { metric: 'monthlyOutflows', includes: 'O = E' },
  { metric: 'monthlySurplus', includes: 'P = I - O' },
  { metric: 'savingsRatePct', includes: 'P / I' },
  { metric: 'livingExpenseCoverageMonths', includes: 'S / E' },
  { metric: 'mandatoryOutflowCoverageMonths', includes: 'S / O' },
  { metric: 'emiBurdenPct', includes: 'M / I' },
  { metric: 'postShockSavings', includes: 'max(0, S - U)' },
  { metric: 'unfundedShock', includes: 'max(0, U - S)' },
]);

export const GOAL_FORMULA_INCLUDES = 'remaining = max(0, T - C)';

const SEVERITIES = new Set(['critical', 'warning', 'positive', 'info']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function explainabilityCategory(checkId) {
  if (checkId.startsWith('formula.')) return 'formula_accuracy';
  if (checkId.startsWith('result.')) return 'result';
  if (checkId.startsWith('metric.')) return 'metric';
  if (checkId.startsWith('goalMetric.')) return 'goal_metric';
  if (checkId.startsWith('goal.')) return 'goal';
  if (checkId.startsWith('recommendation.')) return 'recommendation';
  return 'other';
}

/**
 * Evaluate one calculated result. Returns per-check counters and any failures.
 */
export function evaluateExplainability(
  result,
  {
    scope,
    caseId,
    profileId,
    scenarioId,
    scenarioName,
    maxFailures = 20,
  } = {}
) {
  const counters = {};
  const failures = [];

  const check = (id, pass, detail = '') => {
    const counter = counters[id] || (counters[id] = { total: 0, passed: 0 });
    counter.total += 1;
    if (pass) counter.passed += 1;

    if (!pass && failures.length < maxFailures) {
      failures.push({
        scope,
        caseId,
        profileId,
        scenarioId,
        scenarioName,
        check: id,
        detail,
      });
    }
  };

  const explanations = result?.explanations;
  const metricExplanations = isObject(explanations?.metrics)
    ? explanations.metrics
    : {};
  const goalExplanations = isObject(explanations?.goalMetrics)
    ? explanations.goalMetrics
    : {};
  const goalProjectionExplanation = explanations?.goalProjection;
  const recommendations = Array.isArray(result?.recommendations)
    ? result.recommendations
    : [];

  check('result.resultType', result?.resultType === 'estimate');
  check(
    'result.disclaimer',
    /not a guarantee, prediction|not a prediction|not a guarantee or personalized/i.test(
      result?.disclaimer || ''
    )
  );
  check(
    'result.assumptions',
    isStringArray(result?.assumptions) && result.assumptions.length > 0
  );
  check(
    'result.thresholds_heuristic_label',
    result?.thresholds?.isHeuristic === true &&
      isNonEmptyString(result?.thresholds?.note)
  );
  check('result.explanations_object', isObject(explanations));
  check('result.recommendations_array', Array.isArray(result?.recommendations));

  for (const key of EXPLANATION_METRIC_KEYS) {
    const explanation = metricExplanations[key];
    const present = isObject(explanation);

    check(`metric.${key}.present`, present);
    check(
      `metric.${key}.formula`,
      present && isNonEmptyString(explanation.formula)
    );
    check(
      `metric.${key}.inputs`,
      present && isObject(explanation.inputs)
    );
    check(
      `metric.${key}.reason`,
      present && isNonEmptyString(explanation.reason)
    );
    check(
      `metric.${key}.assumptions`,
      present && isStringArray(explanation.assumptions)
    );
  }

  check(
    'goal.present',
    isObject(goalProjectionExplanation)
  );
  check(
    'goal.formula',
    isObject(goalProjectionExplanation) &&
      isNonEmptyString(goalProjectionExplanation.formula) &&
      goalProjectionExplanation.formula.includes(GOAL_FORMULA_INCLUDES)
  );
  check(
    'goal.inputs',
    isObject(goalProjectionExplanation) &&
      isObject(goalProjectionExplanation.inputs)
  );
  check(
    'goal.reason',
    isObject(goalProjectionExplanation) &&
      isNonEmptyString(goalProjectionExplanation.reason)
  );
  check(
    'goal.assumptions',
    isObject(goalProjectionExplanation) &&
      isStringArray(goalProjectionExplanation.assumptions)
  );

  for (const key of GOAL_FIELD_KEYS) {
    const explanation = goalExplanations[key];
    const present = isObject(explanation);

    check(`goalMetric.${key}.present`, present);
    check(
      `goalMetric.${key}.formula`,
      present && isNonEmptyString(explanation.formula)
    );
    check(
      `goalMetric.${key}.inputs`,
      present && isObject(explanation.inputs)
    );
    check(
      `goalMetric.${key}.reason`,
      present && isNonEmptyString(explanation.reason)
    );
    check(
      `goalMetric.${key}.assumptions`,
      present && isStringArray(explanation.assumptions)
    );
  }

  for (const recommendation of recommendations) {
    const id = recommendation?.id;
    const prefix = `recommendation.${id || 'unknown'}`;

    check(
      `${prefix}.decision_rule`,
      isNonEmptyString(recommendation?.trigger)
    );
    check(
      `${prefix}.formula`,
      isNonEmptyString(recommendation?.formula)
    );
    check(`${prefix}.inputs`, isObject(recommendation?.inputs));
    check(
      `${prefix}.reason`,
      isNonEmptyString(recommendation?.reason)
    );
    check(
      `${prefix}.assumptions`,
      isStringArray(recommendation?.assumptions)
    );
    check(
      `${prefix}.severity`,
      SEVERITIES.has(recommendation?.severity)
    );
    check(
      `${prefix}.heuristic_flag`,
      typeof recommendation?.heuristic === 'boolean'
    );

    if (recommendation?.heuristic === true) {
      check(
        `${prefix}.threshold`,
        isObject(recommendation.threshold) &&
          Number.isFinite(recommendation.threshold.value) &&
          isNonEmptyString(recommendation.threshold.unit) &&
          isNonEmptyString(recommendation.threshold.note)
      );
    }
  }

  const ids = recommendations.map((item) => item.id);
  check(
    'recommendation.ids_unique',
    new Set(ids).size === ids.length
  );
  check(
    'recommendation.heuristic_recs_have_threshold',
    recommendations
      .filter((item) => item?.heuristic === true)
      .every(
        (item) =>
          isObject(item.threshold) &&
          Number.isFinite(item.threshold.value) &&
          isNonEmptyString(item.threshold.note)
      )
  );

  for (const { metric, includes } of FORMULA_CHECKS) {
    check(
      `formula.${metric}`,
      isNonEmptyString(metricExplanations[metric]?.formula) &&
        metricExplanations[metric].formula.includes(includes)
    );
  }

  check(
    'formula.goalProjection',
    isNonEmptyString(goalProjectionExplanation?.formula) &&
      goalProjectionExplanation.formula.includes(GOAL_FORMULA_INCLUDES)
  );

  return { counters, failures };
}
