/**
 * Validation and persistence mapping for saved Digital Twin scenarios.
 * The browser never supplies an authoritative user id; routes derive it from
 * the verified Supabase access token.
 */

import {
  buildTwinPreview,
  normalizeTwinInputs,
  normalizeTwinThresholds,
  resolveAsOfDate,
} from './financialTwin.js';

export const MAX_SCENARIO_NAME_LENGTH = 120;

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  );
}

function assertPlainObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function validateScenarioName(value) {
  if (isMissing(value)) {
    throw new Error('Scenario name is required.');
  }
  if (typeof value !== 'string') {
    throw new Error('Scenario name must be text.');
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error('Scenario name is required.');
  }
  if (trimmed.length > MAX_SCENARIO_NAME_LENGTH) {
    throw new Error(
      `Scenario name must be ${MAX_SCENARIO_NAME_LENGTH} characters or fewer.`
    );
  }

  return trimmed;
}

export function validateScenarioId(value, label = 'Scenario id') {
  if (isMissing(value)) {
    throw new Error(`${label} is required.`);
  }
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new Error(`${label} is invalid.`);
  }
  return value.trim();
}

function validateOptionalScenarioId(value, label) {
  if (isMissing(value)) return null;
  return validateScenarioId(value, label);
}

function numericThresholds(thresholds) {
  return {
    lowMandatoryCoverageMonths: thresholds.lowMandatoryCoverageMonths,
    highEmiBurdenPct: thresholds.highEmiBurdenPct,
  };
}

/**
 * Create payload:
 * {
 *   name,
 *   baseline: { ...complete assessment-style inputs },
 *   scenario: { ...only the fields to override },
 *   thresholds?, asOfDate?, baselineAssessmentId?
 * }
 */
export function validateScenarioCreate(input = {}) {
  assertPlainObject(input, 'Scenario input');

  const name = validateScenarioName(input.name);
  const baselineSource = input.baseline ?? input.baselineInputs;
  if (baselineSource === undefined || baselineSource === null) {
    throw new Error('Baseline input is required.');
  }

  const baselineInputs = normalizeTwinInputs(baselineSource);
  const scenarioOverrides = input.scenario ?? input.scenarioInputs ?? {};

  const preview = buildTwinPreview({
    baseline: baselineInputs,
    scenario: scenarioOverrides,
    thresholds: input.thresholds,
    asOfDate: input.asOfDate,
  });

  return {
    name,
    baselineAssessmentId: validateOptionalScenarioId(
      input.baselineAssessmentId,
      'Baseline assessment id'
    ),
    baselineInputs,
    scenarioInputs: preview.scenarioInputs,
    thresholds: numericThresholds(preview.thresholds),
    asOfDate: preview.asOfDate,
    preview,
  };
}

/**
 * Update payload accepts a subset of:
 * name, baseline, scenario (complete input object), thresholds, asOfDate,
 * baselineAssessmentId. At least one field is required.
 */
export function validateScenarioUpdate(input = {}) {
  assertPlainObject(input, 'Scenario input');

  const updates = {};

  if (hasOwn(input, 'name')) {
    updates.name = validateScenarioName(input.name);
  }

  if (hasOwn(input, 'baseline') || hasOwn(input, 'baselineInputs')) {
    updates.baselineInputs = normalizeTwinInputs(
      input.baseline ?? input.baselineInputs
    );
  }

  if (hasOwn(input, 'scenario') || hasOwn(input, 'scenarioInputs')) {
    updates.scenarioInputs = normalizeTwinInputs(
      input.scenario ?? input.scenarioInputs
    );
  }

  if (hasOwn(input, 'thresholds')) {
    updates.thresholds = numericThresholds(
      normalizeTwinThresholds(input.thresholds)
    );
  }

  if (hasOwn(input, 'asOfDate')) {
    updates.asOfDate = resolveAsOfDate(input.asOfDate);
  }

  if (hasOwn(input, 'baselineAssessmentId')) {
    updates.baselineAssessmentId = validateOptionalScenarioId(
      input.baselineAssessmentId,
      'Baseline assessment id'
    );
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('Provide at least one scenario field to update.');
  }

  return updates;
}

export function validateScenarioCompare(input = {}) {
  assertPlainObject(input, 'Comparison input');

  const baselineId = validateScenarioId(
    input.baselineId ?? input.baselineScenarioId,
    'Baseline scenario id'
  );
  const scenarioId = validateScenarioId(
    input.scenarioId ?? input.scenarioScenarioId,
    'Scenario id'
  );

  if (baselineId === scenarioId) {
    throw new Error('Choose two different scenarios to compare.');
  }

  return { baselineId, scenarioId };
}

export function scenarioInsertRow(scenario, userId) {
  return {
    user_id: userId,
    name: scenario.name,
    baseline_assessment_id: scenario.baselineAssessmentId,
    baseline_inputs: scenario.baselineInputs,
    scenario_inputs: scenario.scenarioInputs,
    thresholds: scenario.thresholds,
    as_of_date: scenario.asOfDate,
    result: scenario.preview,
  };
}

export function scenarioUpdateRow({
  name,
  baselineAssessmentId,
  baselineInputs,
  scenarioInputs,
  thresholds,
  asOfDate,
  preview,
}) {
  const row = {};

  if (name !== undefined) row.name = name;
  if (baselineAssessmentId !== undefined) {
    row.baseline_assessment_id = baselineAssessmentId;
  }
  if (baselineInputs !== undefined) row.baseline_inputs = baselineInputs;
  if (scenarioInputs !== undefined) row.scenario_inputs = scenarioInputs;
  if (thresholds !== undefined) row.thresholds = thresholds;
  if (asOfDate !== undefined) row.as_of_date = asOfDate;
  if (preview !== undefined) row.result = preview;

  return row;
}

export function mapScenarioRow(row) {
  return {
    id: row.id,
    name: row.name,
    baselineAssessmentId: row.baseline_assessment_id || null,
    baselineInputs: row.baseline_inputs || {},
    scenarioInputs: row.scenario_inputs || {},
    thresholds: row.thresholds || {},
    asOfDate: row.as_of_date,
    result: row.result,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
